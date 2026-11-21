import { Observable, Subject, Subscription, distinctUntilChanged, map } from 'rxjs';
import { createReducer, Store, type Action } from './core/store.js';
import { createSelector } from './core/memo.js';
import { HttpError, type Change, type Transport } from './http.js';
import { emptyTables, patchOne, putOne, removeOne, type ID, type TablesOf } from './tables.js';

/**
 * SyncEngine — keeps a client copy of server collections in sync with a modx-core server and lets the UI write
 * optimistically.
 *
 *   bootstrap ──► base tables @ seq ──► live stream (SSE) ──► every reconnection: GET changes since seq
 *                                                       (410 → bootstrap again)
 *   local writes ──► pending queue (applied on top of base, so the UI sees them at once)
 *                ──► sent one by one; success folds the server's row into base, a 4xx drops the write (rollback),
 *                    a network error keeps it queued (offline) and retries with backoff
 *   storage (optional) keeps base + seq + queue, so a reload starts from the last state and replays queued
 *   writes; undo / redo turn into ordinary writes.
 */

export type SyncStatus = 'idle' | 'hydrated' | 'bootstrapping' | 'live' | 'reconnecting' | 'offline' | 'error';

/** A local write waiting for the server. `id` may be a temporary id until the server answers a create. */
export interface PendingWrite {
  opId: string;
  entity: string;
  kind: 'create' | 'update' | 'remove';
  id: ID;
  data?: Record<string, unknown>;
  attempts: number;
}

/** How a write reaches the server. The response of create / update should be the stored row. */
export interface Endpoint {
  create?: (row: Record<string, unknown>) => { method: string; path: string; body?: unknown };
  update?: (id: ID, patch: Record<string, unknown>) => { method: string; path: string; body?: unknown };
  remove?: (id: ID) => { method: string; path: string; body?: unknown };
}

export interface SyncSnapshot<M> {
  seq: number;
  base: TablesOf<M>;
  pending: PendingWrite[];
  idMap: Record<ID, ID>;
}

/** Where the client copy survives reloads (IndexedDB, localStorage, memory...). */
export interface SyncStorage<M> {
  load(): Promise<SyncSnapshot<M> | null> | SyncSnapshot<M> | null;
  save(s: SyncSnapshot<M>): Promise<void> | void;
}

export function memoryStorage<M>(): SyncStorage<M> & { value: SyncSnapshot<M> | null } {
  const st = {
    value: null as SyncSnapshot<M> | null,
    load: () => (st.value ? JSON.parse(JSON.stringify(st.value)) as SyncSnapshot<M> : null),
    save: (s: SyncSnapshot<M>) => { st.value = JSON.parse(JSON.stringify(s)) as SyncSnapshot<M>; },
  };
  return st;
}

export function localStorageSync<M>(key: string): SyncStorage<M> {
  return {
    load: () => {
      try {
        const raw = globalThis.localStorage?.getItem(key);
        return raw ? (JSON.parse(raw) as SyncSnapshot<M>) : null;
      } catch {
        return null;
      }
    },
    save: (s) => {
      try { globalThis.localStorage?.setItem(key, JSON.stringify(s)); } catch { /* quota / private mode */ }
    },
  };
}

export interface SyncOptions<M> {
  transport: Transport;
  /** Collection names the client keeps (keys of the bootstrap payload). */
  collections: readonly (keyof M & string)[];
  /** GET → `{ seq, <collection>: rows[] }`. */
  bootstrapPath: string;
  /** GET → `Change[]`, or 410 when `since` is outside the server's window. */
  changesPath: (since: number) => string;
  /** SSE stream of changes. */
  eventsPath: string;
  endpoints: { [K in keyof M & string]?: Endpoint };
  storage?: SyncStorage<M>;
  /** Sent as X-Client-Id with writes; changes carrying it are this client's own echoes. */
  clientId?: string;
  /** Delay before retry n (ms). Default: exponential backoff with jitter, capped at 15 s. */
  retryDelay?: (attempt: number) => number;
  /** Temporary ids for creates. */
  tempId?: () => ID;
  undoLimit?: number;
}

export interface SyncState<M> {
  status: SyncStatus;
  seq: number;
  base: TablesOf<M>;
  pending: readonly PendingWrite[];
  idMap: Readonly<Record<ID, ID>>;
  error: string | null;
  undo: number;
  redo: number;
}

type SyncAction<M> =
  | { type: 'status'; status: SyncStatus; error?: string | null }
  | { type: 'hydrate'; snap: SyncSnapshot<M> }
  | { type: 'bootstrapped'; seq: number; base: TablesOf<M> }
  | { type: 'changes'; changes: Change[] }
  | { type: 'enqueue'; write: PendingWrite }
  | { type: 'settled'; opId: string; row?: Record<string, unknown> | null }
  | { type: 'rejected'; opId: string; error: string }
  | { type: 'attempt'; opId: string }
  | { type: 'history'; undo: number; redo: number };

export const backoffDelay = (attempt: number, base = 500, cap = 15_000) =>
  Math.min(cap, base * 2 ** attempt) * (0.8 + Math.random() * 0.4);

let tmpCounter = 0;
const defaultTempId = () => `tmp_${Date.now().toString(36)}${(tmpCounter++).toString(36)}`;

/** Replace every occurrence of a temporary id inside a value. */
function swapId(v: unknown, from: ID, to: ID): unknown {
  if (v === from) return to;
  if (Array.isArray(v)) return v.map((x) => swapId(x, from, to));
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) o[k] = swapId(x, from, to);
    return o;
  }
  return v;
}

/** Base tables with every pending write applied on top. */
export function applyPending<M>(base: TablesOf<M>, pending: readonly PendingWrite[]): TablesOf<M> {
  let t = base;
  for (const w of pending) {
    const name = w.entity as keyof M;
    if (!(name in t)) continue;
    if (w.kind === 'create') t = putOne(t, name, { ...(w.data ?? {}), id: w.id } as M[keyof M]);
    else if (w.kind === 'update') t = patchOne(t, name, w.id, (w.data ?? {}) as Partial<M[keyof M]>);
    else t = removeOne(t, name, w.id);
  }
  return t;
}

function reducerFor<M>(collections: readonly (keyof M)[]) {
  return createReducer<SyncState<M>, SyncAction<M>>({
    status: (s, a) => ({ ...s, status: a.status, error: a.error === undefined ? s.error : a.error }),
    hydrate: (s, a) => ({ ...s, status: 'hydrated', seq: a.snap.seq, base: a.snap.base, pending: a.snap.pending, idMap: a.snap.idMap }),
    bootstrapped: (s, a) => ({ ...s, seq: a.seq, base: a.base }),
    changes: (s, a) => {
      let base = s.base, seq = s.seq;
      for (const c of a.changes) {
        if (c.seq <= seq) continue; /* catch-up and live stream overlap */
        seq = c.seq;
        const name = c.entity as keyof M;
        if (!collections.includes(name)) continue;
        base = c.op === 'del' || !c.data ? removeOne(base, name, c.id) : putOne(base, name, c.data as M[keyof M]);
      }
      return base === s.base && seq === s.seq ? s : { ...s, base, seq };
    },
    enqueue: (s, a) => ({ ...s, pending: [...s.pending, a.write] }),
    attempt: (s, a) => ({ ...s, pending: s.pending.map((w) => (w.opId === a.opId ? { ...w, attempts: w.attempts + 1 } : w)) }),
    settled: (s, a) => {
      const w = s.pending.find((x) => x.opId === a.opId);
      if (!w) return s;
      let pending = s.pending.filter((x) => x.opId !== a.opId);
      let base = s.base;
      let idMap = s.idMap;
      const name = w.entity as keyof M;
      const row = a.row && typeof a.row === 'object' && typeof (a.row as { id?: unknown }).id === 'string' ? a.row : null;
      if (w.kind === 'remove') base = removeOne(base, name, w.id);
      else if (row) base = putOne(base, name, row as M[keyof M]);
      if (w.kind === 'create' && row && row.id !== w.id) {
        /* the server named the row: later writes and references follow */
        const real = row.id as ID;
        idMap = { ...idMap, [w.id]: real };
        pending = pending.map((x) => ({ ...x, id: x.id === w.id ? real : x.id, data: swapId(x.data, w.id, real) as Record<string, unknown> | undefined }));
      }
      return { ...s, pending, base, idMap };
    },
    rejected: (s, a) => {
      const w = s.pending.find((x) => x.opId === a.opId);
      if (!w) return s;
      /* rollback: the write and everything that depended on a row it was creating disappear */
      const dropId = w.kind === 'create' ? w.id : null;
      const pending = s.pending.filter((x) => x.opId !== a.opId && !(dropId && x.id === dropId));
      return { ...s, pending, error: a.error };
    },
    history: (s, a) => ({ ...s, undo: a.undo, redo: a.redo }),
  });
}

interface HistoryEntry { entity: string; undo: Omit<PendingWrite, 'opId' | 'attempts'>; redo: Omit<PendingWrite, 'opId' | 'attempts'> }

export class SyncEngine<M> {
  readonly store: Store<SyncState<M>, SyncAction<M> & Action>;
  /** Base + pending writes: what the UI shows. */
  readonly tables$: Observable<TablesOf<M>>;
  readonly status$: Observable<SyncStatus>;
  /** Writes the server refused (they were rolled back). */
  readonly rejected$ = new Subject<{ write: PendingWrite; error: HttpError }>();
  private readonly opts: SyncOptions<M>;
  private readonly view: (s: SyncState<M>) => TablesOf<M>;
  private stream?: Subscription;
  private running = false;
  private sending = false;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private streamTimer?: ReturnType<typeof setTimeout>;
  private streamAttempt = 0;
  private sendAttempt = 0;
  private opCounter = 0;
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private idle: (() => void)[] = [];
  private saveSub?: Subscription;

  constructor(opts: SyncOptions<M>) {
    this.opts = opts;
    const initial: SyncState<M> = {
      status: 'idle', seq: 0, base: emptyTables<M>(opts.collections), pending: [], idMap: {}, error: null, undo: 0, redo: 0,
    };
    this.store = new Store({ initial, reducer: reducerFor<M>(opts.collections) as never });
    this.view = createSelector((s: SyncState<M>) => s.base, (s: SyncState<M>) => s.pending, (b, p) => applyPending(b, p));
    this.tables$ = this.store.select(this.view);
    this.status$ = this.store.select((s) => s.status);
  }

  get state(): SyncState<M> { return this.store.state; }
  get tables(): TablesOf<M> { return this.view(this.store.state); }

  select<R>(fn: (t: TablesOf<M>) => R): Observable<R> {
    return this.tables$.pipe(map(fn), distinctUntilChanged());
  }

  /** Hydrate from storage (if any), then bootstrap or catch up, then stay live. */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const snap = this.opts.storage ? await this.opts.storage.load() : null;
    if (snap && snap.base) this.dispatch({ type: 'hydrate', snap });
    if (this.opts.storage) {
      const storage = this.opts.storage;
      this.saveSub = this.store.select((s) => [s.seq, s.base, s.pending, s.idMap] as const, (a, b) => a.every((x, i) => x === b[i]))
        .subscribe(([seq, base, pending, idMap]) => { void storage.save({ seq, base, pending: [...pending], idMap }); });
    }
    if (!snap) await this.bootstrap();
    this.openStream();
    this.kick();
  }

  stop(): void {
    this.running = false;
    this.stream?.unsubscribe();
    this.saveSub?.unsubscribe();
    clearTimeout(this.retryTimer);
    clearTimeout(this.streamTimer);
  }

  /* ───────── writes ───────── */

  create<K extends keyof M & string>(entity: K, row: Partial<M[K]>): ID {
    const id = (row as { id?: ID }).id ?? (this.opts.tempId ?? defaultTempId)();
    const data = { ...(row as Record<string, unknown>), id };
    this.enqueue({ entity, kind: 'create', id, data }, { entity, undo: { entity, kind: 'remove', id }, redo: { entity, kind: 'create', id, data } });
    return id;
  }

  update<K extends keyof M & string>(entity: K, id: ID, patch: Partial<M[K]>): void {
    const cur = this.tables[entity][id] as Record<string, unknown> | undefined;
    const before: Record<string, unknown> = {};
    for (const k of Object.keys(patch)) before[k] = cur ? cur[k] : undefined;
    const data = patch as Record<string, unknown>;
    this.enqueue({ entity, kind: 'update', id, data }, { entity, undo: { entity, kind: 'update', id, data: before }, redo: { entity, kind: 'update', id, data } });
  }

  remove<K extends keyof M & string>(entity: K, id: ID): void {
    const cur = this.tables[entity][id] as Record<string, unknown> | undefined;
    const restore = cur ? { ...cur } : undefined;
    this.enqueue({ entity, kind: 'remove', id }, restore ? { entity, undo: { entity, kind: 'create', id, data: restore }, redo: { entity, kind: 'remove', id } } : undefined);
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  /** Revert this client's last write (as a new write). A re-created row may get a new id from the server. */
  undo(): boolean {
    const e = this.undoStack.pop();
    if (!e) return false;
    this.redoStack.push(e);
    this.enqueue(this.resolve(e.undo));
    this.history();
    return true;
  }

  redo(): boolean {
    const e = this.redoStack.pop();
    if (!e) return false;
    this.undoStack.push(e);
    this.enqueue(this.resolve(e.redo));
    this.history();
    return true;
  }

  /** Resolves once nothing is queued (or after a rejection emptied the queue). */
  whenIdle(): Promise<void> {
    if (!this.state.pending.length) return Promise.resolve();
    return new Promise((res) => this.idle.push(res));
  }

  /* ───────── internals ───────── */

  private dispatch(a: SyncAction<M>) {
    this.store.dispatch(a as SyncAction<M> & Action);
  }

  private resolve(w: Omit<PendingWrite, 'opId' | 'attempts'>): Omit<PendingWrite, 'opId' | 'attempts'> {
    const real = this.state.idMap[w.id];
    return real ? { ...w, id: real } : w;
  }

  private history() {
    this.dispatch({ type: 'history', undo: this.undoStack.length, redo: this.redoStack.length });
  }

  private enqueue(w: Omit<PendingWrite, 'opId' | 'attempts'>, hist?: HistoryEntry) {
    const write: PendingWrite = { ...w, opId: `op_${Date.now().toString(36)}_${(this.opCounter++).toString(36)}`, attempts: 0 };
    this.dispatch({ type: 'enqueue', write });
    if (hist) {
      this.undoStack = [...this.undoStack.slice(-((this.opts.undoLimit ?? 100) - 1)), hist];
      this.redoStack = [];
      this.history();
    }
    this.kick();
  }

  private delay(n: number) {
    return (this.opts.retryDelay ?? backoffDelay)(n);
  }

  /** Send queued writes in order, one at a time. */
  private kick(): void {
    if (!this.running || this.sending) return;
    const w = this.state.pending[0];
    if (!w) {
      const idle = this.idle;
      this.idle = [];
      idle.forEach((f) => f());
      return;
    }
    const ep = this.opts.endpoints[w.entity as keyof M & string];
    const req = w.kind === 'create' ? ep?.create?.(w.data ?? {}) : w.kind === 'update' ? ep?.update?.(w.id, w.data ?? {}) : ep?.remove?.(w.id);
    if (!req) {
      this.dispatch({ type: 'rejected', opId: w.opId, error: `no ${w.kind} endpoint for ${w.entity}` });
      return this.kick();
    }
    this.sending = true;
    this.dispatch({ type: 'attempt', opId: w.opId });
    const headers = this.opts.clientId ? { 'X-Client-Id': this.opts.clientId } : undefined;
    this.opts.transport.request<Record<string, unknown> | null>(req.method, req.path, req.body, headers).then(
      (row) => {
        this.sending = false;
        this.sendAttempt = 0;
        this.dispatch({ type: 'settled', opId: w.opId, row });
        if (this.state.status === 'offline') this.dispatch({ type: 'status', status: 'reconnecting', error: null });
        this.kick();
      },
      (e: unknown) => {
        this.sending = false;
        const err = e instanceof HttpError ? e : new HttpError(0, 'network', String(e));
        if (!err.retryable) {
          this.dispatch({ type: 'rejected', opId: w.opId, error: err.message });
          this.rejected$.next({ write: w, error: err });
          return this.kick();
        }
        /* keep it queued: offline or a server hiccup */
        if (err.status === 0) this.dispatch({ type: 'status', status: 'offline', error: err.message });
        clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => this.kick(), this.delay(this.sendAttempt++));
      },
    );
  }

  private async bootstrap(): Promise<void> {
    this.dispatch({ type: 'status', status: 'bootstrapping' });
    for (let n = 0; this.running; n++) {
      try {
        const data = await this.opts.transport.request<Record<string, unknown> & { seq: number }>('GET', this.opts.bootstrapPath);
        let base = emptyTables<M>(this.opts.collections);
        for (const c of this.opts.collections) {
          const rows = data[c];
          if (!Array.isArray(rows)) continue;
          const t: Record<ID, unknown> = {};
          for (const r of rows) if (r && typeof r.id === 'string') t[r.id] = r;
          base = { ...base, [c]: t };
        }
        this.dispatch({ type: 'bootstrapped', seq: Number(data.seq) || 0, base });
        return;
      } catch (e) {
        const err = e instanceof HttpError ? e : new HttpError(0, 'network', String(e));
        if (!err.retryable) { this.dispatch({ type: 'status', status: 'error', error: err.message }); throw err; }
        this.dispatch({ type: 'status', status: err.status === 0 ? 'offline' : 'reconnecting', error: err.message });
        await new Promise((r) => setTimeout(r, this.delay(n)));
      }
    }
  }

  /** Changes missed while disconnected; 410 = outside the window → bootstrap again. */
  private async catchUp(): Promise<void> {
    try {
      const changes = await this.opts.transport.request<Change[]>('GET', this.opts.changesPath(this.state.seq));
      this.dispatch({ type: 'changes', changes: Array.isArray(changes) ? changes : [] });
    } catch (e) {
      if (e instanceof HttpError && e.status === 410) await this.bootstrap();
      else throw e;
    }
  }

  private openStream() {
    if (!this.running) return;
    this.stream?.unsubscribe();
    this.stream = this.opts.transport.stream(this.opts.eventsPath).subscribe({
      next: (sig) => {
        if (sig.type === 'open') {
          this.streamAttempt = 0;
          this.catchUp().then(
            () => { this.dispatch({ type: 'status', status: 'live', error: null }); this.kick(); },
            () => this.reconnect(),
          );
        } else if (sig.type === 'change') {
          this.dispatch({ type: 'changes', changes: [sig.change] });
        } else if (sig.type === 'reset') {
          void this.bootstrap();
        }
      },
      error: () => this.reconnect(),
      complete: () => this.reconnect(),
    });
  }

  private reconnect() {
    if (!this.running) return;
    this.stream?.unsubscribe();
    this.dispatch({ type: 'status', status: this.state.status === 'offline' ? 'offline' : 'reconnecting' });
    clearTimeout(this.streamTimer);
    this.streamTimer = setTimeout(() => this.openStream(), this.delay(this.streamAttempt++));
  }
}
