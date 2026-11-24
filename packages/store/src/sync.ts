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
 *                ──► every attempt carries `Idempotency-Key: <opId>`: a retry of a write the server already applied
 *                    (its answer was lost) is answered from the server's record, never applied twice
 *   storage (optional) keeps base + seq + queue, so a reload starts from the last state and replays queued
 *   writes; undo / redo turn into ordinary writes. The snapshot carries a schema version (`v`) and its `owner`
 *   (user / workspace): a snapshot of another owner or version is never hydrated, its queue is discarded
 *   (`discarded$`), so one person's queued writes never replay in another's session.
 *
 * Hooks for apps with more than plain collections: `mapBootstrap` (bootstrap payload → tables), `events$` (named
 * SSE events that are not changes), `changes$` (applied changes, for derived counters), `bootstrapped$`,
 * `lost$` (access refused), `call()` (an arbitrary endpoint with an optimistic effect), `putRows` /
 * `updateBase` (server rows fetched outside the feed).
 */

export type SyncStatus = 'idle' | 'hydrated' | 'bootstrapping' | 'live' | 'reconnecting' | 'offline' | 'error';

/** A request to an arbitrary endpoint, queued like any write, with an optimistic effect until it settles. */
export interface CallSpec {
  method: string;
  path: string;
  body?: unknown;
  /** Patches shown on existing rows until the call settles. */
  patches?: { entity: string; id: ID; data: Record<string, unknown> }[];
  /** Rows shown until the call settles (e.g. a row the server will create). */
  puts?: { entity: string; row: { id: ID } & Record<string, unknown> }[];
  /** The response carries stored rows of this collection: one row, an array of rows, or `{ [result]: rows }`. */
  result?: string;
  /** After success, GET this list and store its rows (endpoints that answer without the rows). */
  refresh?: { entity: string; path: string };
}

/** A local write waiting for the server. `id` may be a temporary id until the server answers a create. */
export interface PendingWrite {
  opId: string;
  entity: string;
  kind: 'create' | 'update' | 'remove' | 'call';
  id: ID;
  data?: Record<string, unknown>;
  /** update: fields shown optimistically but never sent (values the server derives, such as timestamps). */
  local?: Record<string, unknown>;
  /** call: the request and its optimistic effect. */
  call?: CallSpec;
  attempts: number;
}

export interface WriteContext {
  /** The queued write (its `opId` can be sent along so the server echoes it as the change's `client_id`). */
  write: PendingWrite;
  /** The row as the UI sees it when the write is sent (base + pending) — or as last confirmed, when the pending
   * write removes it from the view. */
  current?: Record<string, unknown>;
}

export type WriteRequest = { method: string; path: string; body?: unknown };

/** How a write reaches the server. The response of create / update should be the stored row. Returning nothing
 * rejects the write. */
export interface Endpoint {
  create?: (row: Record<string, unknown>, ctx: WriteContext) => WriteRequest | null | undefined;
  update?: (id: ID, patch: Record<string, unknown>, ctx: WriteContext) => WriteRequest | null | undefined;
  remove?: (id: ID, ctx: WriteContext) => WriteRequest | null | undefined;
}

export interface WriteOptions {
  /** update: fields shown optimistically but never sent. */
  local?: Record<string, unknown>;
  /** Record the write in the undo history (default true). */
  history?: boolean;
}

/** Version of the snapshot format the engine writes (the app's own schema version is `SyncOptions.schemaVersion`). */
export const SNAPSHOT_VERSION = 1;
/** Ids of settled / rejected writes a snapshot remembers, so a merge across tabs never brings a finished write back. */
const DONE_LIMIT = 256;

export interface SyncSnapshot<M> {
  /** Schema version (`SyncOptions.schemaVersion`); missing in snapshots written before it existed (read as 1). */
  v?: number;
  /** Whose data this is (`SyncOptions.owner`); missing or null: no owner was set. */
  owner?: string | null;
  seq: number;
  base: TablesOf<M>;
  pending: PendingWrite[];
  idMap: Record<ID, ID>;
  /** opIds of writes that recently settled or were rejected (newest last). */
  done?: string[];
}

/** A stored snapshot the engine refused: written for another owner or schema version. Its queued writes are
 * dropped, never sent. */
export interface SnapshotDiscard {
  reason: 'owner' | 'version';
  /** The writes that were queued in it. */
  pending: PendingWrite[];
  /** The snapshot's owner and version. */
  owner: string | null;
  v: number;
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

export interface LocalStorageSyncOptions {
  /** Scope the key per user / workspace (`<key>:<owner>`). Pass the same value as the engine's `owner`. */
  owner?: string;
}

/**
 * localStorage under `key` (`key:owner` with `owner`). Every save merges with what is stored — another tab of the
 * same app may have queued writes since — keeping the union of both queues by opId, minus writes either tab has
 * finished (`mergeSnapshots`); snapshots of another owner or version are overwritten, never merged.
 */
export function localStorageSync<M>(key: string, opts: LocalStorageSyncOptions = {}): SyncStorage<M> {
  const k = opts.owner ? `${key}:${opts.owner}` : key;
  const read = (): unknown => {
    try {
      const raw = globalThis.localStorage?.getItem(k);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  return {
    load: () => read() as SyncSnapshot<M> | null,
    save: (s) => {
      try { globalThis.localStorage?.setItem(k, JSON.stringify(mergeSnapshots(read(), s))); } catch { /* quota / private mode */ }
    },
  };
}

export interface SyncOptions<M> {
  transport: Transport;
  /** Collection names the client keeps (keys of the bootstrap payload). */
  collections: readonly (keyof M & string)[];
  /** GET → `{ seq, <collection>: rows[] }`. */
  bootstrapPath: string;
  /** GET → `Change[]` (or `{ changes: Change[] }`), or 410 when `since` is outside the server's window. */
  changesPath: (since: number) => string;
  /** SSE stream of changes. */
  eventsPath: string;
  endpoints: { [K in keyof M & string]?: Endpoint };
  storage?: SyncStorage<M>;
  /** Whose data the engine holds — a user id, or `user@workspace`. Stored with the snapshot; a stored snapshot of
   * another owner (or of none, when this is set) is not hydrated and its queued writes are discarded
   * (`discarded$`). Set it whenever the storage outlives a session (sign-out, account switch). */
  owner?: string;
  /** Version of the app's snapshot schema (default 1). Bump it when stored rows or pending writes change shape:
   * snapshots of another version are discarded the same way. */
  schemaVersion?: number;
  /** Coalesce storage writes: save at most once per this many ms (default 0: on every change). */
  saveDebounceMs?: number;
  /** Sent as X-Client-Id with writes; changes carrying it are this client's own echoes. */
  clientId?: string;
  /** Delay before retry n (ms). Default: exponential backoff with jitter, capped at 15 s. */
  retryDelay?: (attempt: number) => number;
  /** Retries of a write after server errors (5xx, 408, 429) before it is rejected. Network failures always keep
   * it queued. Default: no limit. */
  maxRetries?: number;
  /** Turns the bootstrap payload into tables (default: one table per collection key). `prev` is the current
   * base — keep what the payload does not carry (rows loaded on demand, for instance). */
  mapBootstrap?: (data: Record<string, unknown> & { seq: number }, prev: TablesOf<M>) => TablesOf<M>;
  /** Before reopening a dropped stream, GET the changes since seq. EventSource hides HTTP statuses, so this is how
   * a lost session or membership shows: a 4xx answer stops the engine (status 'error', `lost$`) instead of
   * reconnecting forever. */
  probe?: boolean;
  /** Temporary ids for creates. */
  tempId?: () => ID;
  /** Undo entries kept (0 = no history). Default 100. */
  undoLimit?: number;
  /** Idempotency keys. Every write (create / update / remove / `call()`) is sent with `header: key(write)`: the same
   * value on every retry of the same queued write — by default its `opId`, which is persisted with the queue, so it
   * survives reloads — and a server that already applied the write (the answer was lost) answers from its record
   * instead of applying it twice. Default `{ header: 'Idempotency-Key', key: (w) => w.opId }`; `false` sends none.
   * Keys must be 1–128 printable ASCII characters (what modx-core accepts). */
  idempotency?: false | IdempotencyOptions;
  /** Ids of new writes (`opId`: the default idempotency key and the `client_id` apps echo). Must be unique per
   * account across tabs and devices. Default: `op_<time>_<counter>_<random>`. */
  opId?: () => string;
}

export interface IdempotencyOptions {
  /** Header name (default `Idempotency-Key`). */
  header?: string;
  /** The key of a write; must be stable for that write (default: its `opId`). */
  key?: (write: PendingWrite) => string;
}

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';

/** op_<time36>_<counter36>_<random>: unique across tabs (the random part) and ordered within one. */
export function defaultOpId(counter: number): string {
  const c = globalThis.crypto as Crypto | undefined;
  let rand = '';
  if (c?.getRandomValues) {
    const b = c.getRandomValues(new Uint8Array(6));
    for (const x of b) rand += x.toString(16).padStart(2, '0');
  } else {
    rand = Math.random().toString(36).slice(2, 14);
  }
  return `op_${Date.now().toString(36)}_${counter.toString(36)}_${rand}`;
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

type Settled = { entity: string; row: Record<string, unknown> & { id: ID } };

type SyncAction<M> =
  | { type: 'status'; status: SyncStatus; error?: string | null }
  | { type: 'hydrate'; snap: SyncSnapshot<M> }
  | { type: 'bootstrapped'; seq: number; base: TablesOf<M> }
  | { type: 'base'; base: TablesOf<M> }
  | { type: 'changes'; changes: Change[] }
  | { type: 'enqueue'; write: PendingWrite }
  | { type: 'settled'; opId: string; rows: Settled[] }
  | { type: 'rejected'; opId: string; error: string }
  | { type: 'attempt'; opId: string }
  | { type: 'history'; undo: number; redo: number };

export const backoffDelay = (attempt: number, base = 500, cap = 15_000) =>
  Math.min(cap, base * 2 ** attempt) * (0.8 + Math.random() * 0.4);

let tmpCounter = 0;
const defaultTempId = () => `tmp_${Date.now().toString(36)}${(tmpCounter++).toString(36)}`;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isRow = (v: unknown): v is Settled['row'] => isObj(v) && typeof v.id === 'string';
const toHttp = (e: unknown) => (e instanceof HttpError ? e : new HttpError(0, 'network', e instanceof Error ? e.message : String(e)));

/** Replace every string found in `ids` (temporary → server id) inside a value. */
function mapIds<T>(v: T, ids: Readonly<Record<ID, ID>>): T {
  if (typeof v === 'string') return (ids[v] ?? v) as T;
  if (Array.isArray(v)) return v.map((x) => mapIds(x, ids)) as T;
  if (isObj(v)) {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) o[k] = mapIds(x, ids);
    return o as T;
  }
  return v;
}

/** Rows a call's response carries for `entity`: a row, an array of rows, or `{ [entity]: rows }`. */
export function rowsOf(res: unknown, entity: string): Settled[] {
  const list = Array.isArray(res) ? res : isRow(res) ? [res] : isObj(res) && Array.isArray(res[entity]) ? res[entity] as unknown[] : [];
  return list.filter(isRow).map((row) => ({ entity, row }));
}

/** Base tables with every pending write applied on top. */
export function applyPending<M>(base: TablesOf<M>, pending: readonly PendingWrite[]): TablesOf<M> {
  let t = base;
  for (const w of pending) {
    const name = w.entity as keyof M;
    if (w.kind === 'call') {
      for (const p of w.call?.puts ?? []) if (p.entity in t) t = putOne(t, p.entity as keyof M, p.row as M[keyof M]);
      for (const p of w.call?.patches ?? []) if (p.entity in t) t = patchOne(t, p.entity as keyof M, p.id, p.data as Partial<M[keyof M]>);
      continue;
    }
    if (!(name in t)) continue;
    if (w.kind === 'create') t = putOne(t, name, { ...(w.data ?? {}), id: w.id } as M[keyof M]);
    else if (w.kind === 'update') t = patchOne(t, name, w.id, { ...(w.data ?? {}), ...(w.local ?? {}) } as Partial<M[keyof M]>);
    else t = removeOne(t, name, w.id);
  }
  return t;
}

/** A stored snapshot in the expected shape, or null when it is not one. A snapshot without one of the collections
 * (written by an older client, say) is not one either: catch-up only brings changes, never that table's rows. */
export function normalizeSnapshot<M>(raw: unknown, collections: readonly (keyof M)[]): SyncSnapshot<M> | null {
  if (!isObj(raw) || !isObj(raw.base) || typeof raw.seq !== 'number' || !Number.isFinite(raw.seq) || raw.seq < 0) return null;
  const src = raw.base;
  if (!collections.every((c) => isObj(src[c as string]))) return null;
  const base = {} as Record<keyof M, unknown>;
  for (const c of collections) base[c] = src[c as string];
  const pending = pendingOf(raw.pending);
  const idMap: Record<ID, ID> = {};
  if (isObj(raw.idMap)) for (const [k, v] of Object.entries(raw.idMap)) if (typeof v === 'string') idMap[k] = v;
  return {
    v: typeof raw.v === 'number' ? raw.v : 1, owner: typeof raw.owner === 'string' ? raw.owner : null,
    seq: raw.seq, base: base as TablesOf<M>, pending, idMap, done: doneOf(raw.done),
  };
}

const pendingOf = (raw: unknown): PendingWrite[] =>
  (Array.isArray(raw) ? raw : []).filter((w): w is PendingWrite =>
    isObj(w) && typeof w.opId === 'string' && typeof w.entity === 'string' && typeof w.id === 'string'
    && (w.kind === 'create' || w.kind === 'update' || w.kind === 'remove' || (w.kind === 'call' && isObj(w.call))))
    .map((w) => ({ ...w, attempts: typeof w.attempts === 'number' ? w.attempts : 0 }));
const doneOf = (raw: unknown): string[] => (Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);

/** Why a stored snapshot does not belong to this engine (another schema version or owner), or null when it does.
 * A snapshot without `v` reads as version 1, one without `owner` as no owner. */
export function snapshotMismatch(raw: unknown, want: { v: number; owner: string | null }): 'version' | 'owner' | null {
  if (!isObj(raw)) return null;
  const v = typeof raw.v === 'number' ? raw.v : 1;
  if (v !== want.v) return 'version';
  const owner = typeof raw.owner === 'string' ? raw.owner : null;
  return owner !== want.owner ? 'owner' : null;
}

/**
 * The snapshot to store when `stored` may have been written by another tab since: `next`, with the queued writes of
 * both (by opId; `next`'s order first), minus writes either side has finished (`done`), and the base of whichever
 * saw the higher seq. A stored snapshot of another owner or version is replaced, never merged. For custom storages:
 * read, merge, write in one go.
 */
export function mergeSnapshots<M>(stored: unknown, next: SyncSnapshot<M>): SyncSnapshot<M> {
  if (!isObj(stored) || snapshotMismatch(stored, { v: next.v ?? 1, owner: next.owner ?? null })) return next;
  const done = [...new Set([...doneOf(stored.done), ...(next.done ?? [])])].slice(-DONE_LIMIT);
  const gone = new Set(done);
  const mine = new Set(next.pending.map((w) => w.opId));
  const pending = [...next.pending.filter((w) => !gone.has(w.opId)), ...pendingOf(stored.pending).filter((w) => !mine.has(w.opId) && !gone.has(w.opId))];
  const storedIds: Record<ID, ID> = {};
  if (isObj(stored.idMap)) for (const [k, v] of Object.entries(stored.idMap)) if (typeof v === 'string') storedIds[k] = v;
  const newer = typeof stored.seq === 'number' && stored.seq > next.seq && isObj(stored.base);
  return {
    ...next,
    ...(newer ? { seq: stored.seq as number, base: { ...next.base, ...(stored.base as object) } as TablesOf<M> } : {}),
    pending, done, idMap: { ...storedIds, ...next.idMap },
  };
}

/** Drop a settled write, fold the server's rows into base, and follow a created row's new id. */
function settle<M>(s: SyncState<M>, w: PendingWrite, rows: readonly Settled[], createdId?: ID): SyncState<M> {
  let pending = s.pending.filter((x) => x.opId !== w.opId);
  let base = s.base;
  let idMap = s.idMap;
  if (w.kind === 'remove' && w.entity in base) base = removeOne(base, w.entity as keyof M, w.id);
  for (const r of rows) if (r.entity in base) base = putOne(base, r.entity as keyof M, r.row as M[keyof M]);
  const real = createdId ?? (w.kind === 'create' ? rows.find((r) => r.entity === w.entity)?.row.id : undefined);
  if (w.kind === 'create' && real && real !== w.id) {
    /* the server named the row: later writes and references follow */
    idMap = { ...idMap, [w.id]: real };
    const one = { [w.id]: real };
    pending = pending.map((x) => ({ ...x, id: x.id === w.id ? real : x.id, data: mapIds(x.data, one), local: mapIds(x.local, one), call: mapIds(x.call, one) }));
  }
  return { ...s, pending, base, idMap };
}

function reducerFor<M>(collections: readonly (keyof M)[]) {
  return createReducer<SyncState<M>, SyncAction<M>>({
    status: (s, a) => ({ ...s, status: a.status, error: a.error === undefined ? s.error : a.error }),
    /* writes queued before the snapshot was read stay queued after it */
    hydrate: (s, a) => ({ ...s, status: 'hydrated', seq: a.snap.seq, base: a.snap.base, pending: [...a.snap.pending, ...s.pending], idMap: { ...a.snap.idMap, ...s.idMap } }),
    bootstrapped: (s, a) => ({ ...s, seq: a.seq, base: a.base }),
    base: (s, a) => (a.base === s.base ? s : { ...s, base: a.base }),
    changes: (s, a) => {
      let st = s;
      let base = s.base, seq = s.seq;
      for (const c of a.changes) {
        if (c.seq <= seq) continue; /* catch-up and live stream overlap */
        seq = c.seq;
        const name = c.entity as keyof M;
        if (!collections.includes(name)) continue;
        base = c.op === 'del' || !c.data ? removeOne(base, name, c.id) : putOne(base, name, c.data as M[keyof M]);
        /* our own create echoed (its opId as client_id) before the HTTP answer: settle it now, or both rows show */
        if (c.client_id && c.op === 'put') {
          const w = st.pending.find((x) => x.opId === c.client_id && x.kind === 'create' && x.entity === c.entity);
          if (w) {
            st = settle({ ...st, base }, w, [], c.id);
            base = st.base;
          }
        }
      }
      return base === s.base && seq === s.seq && st === s ? s : { ...st, base, seq };
    },
    enqueue: (s, a) => ({ ...s, pending: [...s.pending, a.write] }),
    attempt: (s, a) => ({ ...s, pending: s.pending.map((w) => (w.opId === a.opId ? { ...w, attempts: w.attempts + 1 } : w)) }),
    settled: (s, a) => {
      const w = s.pending.find((x) => x.opId === a.opId);
      return w ? settle(s, w, a.rows) : s;
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

type Draft = Omit<PendingWrite, 'opId' | 'attempts'>;
interface HistoryEntry { entity: string; undo: Draft; redo: Draft }

const browserOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

export class SyncEngine<M> {
  readonly store: Store<SyncState<M>, SyncAction<M> & Action>;
  /** Base + pending writes: what the UI shows. */
  readonly tables$: Observable<TablesOf<M>>;
  readonly status$: Observable<SyncStatus>;
  /** Writes the server refused (they were rolled back). */
  readonly rejected$ = new Subject<{ write: PendingWrite; error: HttpError }>();
  /** Named SSE events that are not changes (typing, presence...). */
  readonly events$ = new Subject<{ event: string; data: unknown }>();
  /** Changes applied to base (only new ones, in order), with the base as it was before them. */
  readonly changes$ = new Subject<{ changes: readonly Change[]; before: TablesOf<M> }>();
  /** Every bootstrap payload, after its tables replaced base. */
  readonly bootstrapped$ = new Subject<Record<string, unknown> & { seq: number }>();
  /** The server refused us (4xx on bootstrap or on the reconnect probe): the engine has stopped. Emitted before
   * the status turns to 'error'. */
  readonly lost$ = new Subject<HttpError>();
  /** A stored snapshot belonged to another owner or schema version: it was not hydrated and its queued writes were
   * dropped (warn the person if `pending` is not empty). Emitted from `start()`. */
  readonly discarded$ = new Subject<SnapshotDiscard>();
  private readonly opts: SyncOptions<M>;
  private readonly view: (s: SyncState<M>) => TablesOf<M>;
  private stream?: Subscription;
  private running = false;
  private sending = false;
  private streamLive = false;
  private booting: Promise<void> | null = null;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private streamTimer?: ReturnType<typeof setTimeout>;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private saveNow?: () => void;
  private streamAttempt = 0;
  private sendAttempt = 0;
  private opCounter = 0;
  private serverFailures = new Map<string, number>();
  /** opIds of writes this engine finished (saved with the snapshot for cross-tab merges). */
  private done: string[] = [];
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private idle: (() => void)[] = [];
  private saveSub?: Subscription;
  private readonly onOffline = () => { if (this.running) this.dispatch({ type: 'status', status: 'offline' }); };
  private readonly onOnline = () => {
    if (!this.running) return;
    if (this.streamLive) { this.dispatch({ type: 'status', status: 'live', error: null }); this.kick(); return; }
    /* the network is back: don't wait for the backoff */
    clearTimeout(this.streamTimer);
    this.streamAttempt = 0;
    this.reopen();
  };

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

  /** Hydrate from storage (if any), then bootstrap or catch up, then stay live. A snapshot in an unexpected shape
   * is ignored (fresh bootstrap). */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    let raw: unknown = null;
    try { raw = this.opts.storage ? await this.opts.storage.load() : null; } catch { raw = null; }
    if (!this.running) return;
    const reason = snapshotMismatch(raw, this.owner());
    const snap = reason ? null : normalizeSnapshot<M>(raw, this.opts.collections);
    if (snap) { this.done = snap.done ?? []; this.dispatch({ type: 'hydrate', snap }); }
    if (this.opts.storage) this.persist(this.opts.storage);
    if (reason) {
      const r = raw as Record<string, unknown>;
      /* overwrite the other owner's data now, not at the next change */
      this.saveNow?.();
      this.discarded$.next({ reason, pending: pendingOf(r.pending), owner: typeof r.owner === 'string' ? r.owner : null, v: typeof r.v === 'number' ? r.v : 1 });
    }
    globalThis.addEventListener?.('offline', this.onOffline);
    globalThis.addEventListener?.('online', this.onOnline);
    if (!snap) await this.bootstrap();
    this.openStream();
    this.kick();
  }

  stop(): void {
    this.halt();
    this.saveSub?.unsubscribe();
    if (this.saveTimer !== undefined) { clearTimeout(this.saveTimer); this.saveTimer = undefined; this.saveNow?.(); }
  }

  /** Current server id for an id that may have been temporary. */
  resolveId(id: ID): ID {
    let cur = id;
    for (let i = 0; i < 8 && this.state.idMap[cur]; i++) cur = this.state.idMap[cur]!;
    return cur;
  }

  /* ───────── writes ───────── */

  create<K extends keyof M & string>(entity: K, row: Partial<M[K]>, opts: WriteOptions = {}): ID {
    const id = (row as { id?: ID }).id ?? (this.opts.tempId ?? defaultTempId)();
    const data = { ...(row as Record<string, unknown>), id };
    this.enqueue({ entity, kind: 'create', id, data }, opts.history === false ? undefined
      : { entity, undo: { entity, kind: 'remove', id }, redo: { entity, kind: 'create', id, data } });
    return id;
  }

  update<K extends keyof M & string>(entity: K, id: ID, patch: Partial<M[K]>, opts: WriteOptions = {}): void {
    const rid = this.resolveId(id);
    const cur = this.tables[entity][rid] as Record<string, unknown> | undefined;
    const before: Record<string, unknown> = {};
    for (const k of Object.keys(patch)) before[k] = cur ? cur[k] : undefined;
    const data = patch as Record<string, unknown>;
    this.enqueue({ entity, kind: 'update', id: rid, data, ...(opts.local ? { local: opts.local } : {}) }, opts.history === false ? undefined
      : { entity, undo: { entity, kind: 'update', id: rid, data: before }, redo: { entity, kind: 'update', id: rid, data } });
  }

  remove<K extends keyof M & string>(entity: K, id: ID, opts: WriteOptions = {}): void {
    const rid = this.resolveId(id);
    const cur = this.tables[entity][rid] as Record<string, unknown> | undefined;
    const restore = cur ? { ...cur } : undefined;
    this.enqueue({ entity, kind: 'remove', id: rid }, restore && opts.history !== false
      ? { entity, undo: { entity, kind: 'create', id: rid, data: restore }, redo: { entity, kind: 'remove', id: rid } } : undefined);
  }

  /** Queue a request to any endpoint (in order with the other writes), showing `patches` / `puts` until it settles.
   * Not recorded for undo. */
  call(spec: CallSpec): string {
    const first = spec.patches?.[0] ?? spec.puts?.[0];
    const entity = spec.result ?? spec.refresh?.entity ?? first?.entity ?? '';
    const id = spec.patches?.[0]?.id ?? spec.puts?.[0]?.row.id ?? '';
    return this.enqueue({ entity, kind: 'call', id, call: spec });
  }

  /** Store server rows fetched outside bootstrap and the feed (lazy detail, paging, uploads). */
  putRows<K extends keyof M & string>(entity: K, rows: readonly M[K][]): void {
    let base = this.state.base;
    if (!(entity in base)) return;
    for (const r of rows) if (isRow(r)) base = putOne(base, entity, r);
    this.dispatch({ type: 'base', base });
  }

  /** Replace base with `fn(base)` (e.g. a listing that replaces every row of a scope). */
  updateBase(fn: (base: TablesOf<M>) => TablesOf<M>): void {
    this.dispatch({ type: 'base', base: fn(this.state.base) });
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
    if (a.type === 'settled' || a.type === 'rejected') {
      /* before the dispatch: the save it triggers must already know. A rejected create takes the writes that
       * depended on its row along (as the reducer does). */
      const w = this.state.pending.find((x) => x.opId === a.opId);
      const dropId = a.type === 'rejected' && w?.kind === 'create' ? w.id : null;
      const finished = this.state.pending.filter((x) => x.opId === a.opId || (dropId && x.id === dropId)).map((x) => x.opId);
      if (finished.length) this.done = [...this.done, ...finished].slice(-DONE_LIMIT);
    }
    this.store.dispatch(a as SyncAction<M> & Action);
  }

  private owner(): { v: number; owner: string | null } {
    return { v: this.opts.schemaVersion ?? SNAPSHOT_VERSION, owner: this.opts.owner ?? null };
  }

  private resolve(w: Draft): Draft {
    const real = this.resolveId(w.id);
    return real !== w.id ? { ...w, id: real } : w;
  }

  private history() {
    this.dispatch({ type: 'history', undo: this.undoStack.length, redo: this.redoStack.length });
  }

  private enqueue(w: Draft, hist?: HistoryEntry): string {
    /* a temporary id the server has already named: send (and show) the real one */
    const ids = this.state.idMap;
    const draft = Object.keys(ids).length ? mapIds(w, ids) : w;
    const write: PendingWrite = { ...draft, opId: this.opts.opId ? this.opts.opId() : defaultOpId(this.opCounter++), attempts: 0 };
    this.dispatch({ type: 'enqueue', write });
    const limit = this.opts.undoLimit ?? 100;
    if (hist && limit > 0) {
      this.undoStack = [...this.undoStack.slice(-(limit - 1)), hist];
      this.redoStack = [];
      this.history();
    }
    this.kick();
    return write.opId;
  }

  private persist(storage: SyncStorage<M>) {
    const save = () => {
      this.saveTimer = undefined;
      const s = this.state;
      try {
        const { v, owner } = this.owner();
        const r = storage.save({ v, owner, seq: s.seq, base: s.base, pending: [...s.pending], idMap: s.idMap, done: [...this.done] });
        if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => {});
      } catch { /* storage is a convenience */ }
    };
    this.saveNow = save;
    const wait = this.opts.saveDebounceMs ?? 0;
    this.saveSub = this.store.select((s) => [s.seq, s.base, s.pending, s.idMap] as const, (a, b) => a.every((x, i) => x === b[i]))
      .subscribe(() => {
        if (wait <= 0) return save();
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(save, wait);
      });
  }

  private delay(n: number) {
    return (this.opts.retryDelay ?? backoffDelay)(n);
  }

  private request(w: PendingWrite): WriteRequest | null | undefined {
    if (w.kind === 'call') return w.call;
    const ep = this.opts.endpoints[w.entity as keyof M & string];
    const pick = (t: TablesOf<M>) => (t as Record<string, Record<ID, unknown> | undefined>)[w.entity]?.[w.id] as Record<string, unknown> | undefined;
    const current = pick(this.tables) ?? pick(this.state.base);
    const ctx: WriteContext = { write: w, current };
    return w.kind === 'create' ? ep?.create?.(w.data ?? {}, ctx) : w.kind === 'update' ? ep?.update?.(w.id, w.data ?? {}, ctx) : ep?.remove?.(w.id, ctx);
  }

  /** Rows a successful write settles with. */
  private async rowsFor(w: PendingWrite, res: unknown): Promise<Settled[]> {
    if (w.kind === 'remove') return [];
    if (w.kind !== 'call') return isRow(res) ? [{ entity: w.entity, row: res }] : [];
    const c = w.call!;
    const rows = c.result ? rowsOf(res, c.result) : [];
    if (!c.refresh) return rows;
    try {
      const list = await this.opts.transport.request<unknown>('GET', c.refresh.path);
      return [...rows, ...rowsOf(list, c.refresh.entity)];
    } catch {
      return rows; /* the change feed brings them anyway */
    }
  }

  /** X-Client-Id and the write's idempotency key (the same on every attempt). */
  private writeHeaders(w: PendingWrite): Record<string, string> | undefined {
    const h: Record<string, string> = {};
    if (this.opts.clientId) h['X-Client-Id'] = this.opts.clientId;
    const idem = this.opts.idempotency;
    if (idem !== false) h[idem?.header ?? IDEMPOTENCY_HEADER] = idem?.key ? idem.key(w) : w.opId;
    return Object.keys(h).length ? h : undefined;
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
    const req = this.request(w);
    if (!req) {
      this.dispatch({ type: 'rejected', opId: w.opId, error: `no ${w.kind} endpoint for ${w.entity}` });
      return this.kick();
    }
    this.sending = true;
    this.dispatch({ type: 'attempt', opId: w.opId });
    this.opts.transport.request<unknown>(req.method, req.path, req.body, this.writeHeaders(w))
      .then((res) => this.rowsFor(w, res))
      .then(
        (rows) => {
          this.sending = false;
          this.sendAttempt = 0;
          this.serverFailures.delete(w.opId);
          this.dispatch({ type: 'settled', opId: w.opId, rows });
          if (this.state.status === 'offline') this.dispatch({ type: 'status', status: this.streamLive ? 'live' : 'reconnecting', error: null });
          this.kick();
        },
        (e: unknown) => {
          this.sending = false;
          const err = toHttp(e);
          const failures = err.status === 0 ? 0 : (this.serverFailures.get(w.opId) ?? 0) + 1;
          if (failures) this.serverFailures.set(w.opId, failures);
          if (!err.retryable || failures > (this.opts.maxRetries ?? Infinity)) {
            this.serverFailures.delete(w.opId);
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

  private bootstrap(): Promise<void> {
    return (this.booting ??= this.doBootstrap().finally(() => { this.booting = null; }));
  }

  private async doBootstrap(): Promise<void> {
    this.dispatch({ type: 'status', status: 'bootstrapping' });
    for (let n = 0; this.running; n++) {
      let data: Record<string, unknown> & { seq: number };
      try {
        data = await this.opts.transport.request<Record<string, unknown> & { seq: number }>('GET', this.opts.bootstrapPath);
      } catch (e) {
        const err = toHttp(e);
        if (!err.retryable) { this.lose(err); throw err; }
        this.dispatch({ type: 'status', status: err.status === 0 ? 'offline' : 'reconnecting', error: err.message });
        await new Promise((r) => setTimeout(r, this.delay(n)));
        continue;
      }
      if (!this.running) return;
      let base: TablesOf<M>;
      if (this.opts.mapBootstrap) base = this.opts.mapBootstrap(data, this.state.base);
      else {
        base = emptyTables<M>(this.opts.collections);
        for (const c of this.opts.collections) {
          const rows = data[c];
          if (!Array.isArray(rows)) continue;
          const t: Record<ID, unknown> = {};
          for (const r of rows) if (isRow(r)) t[r.id] = r;
          base = { ...base, [c]: t };
        }
      }
      this.dispatch({ type: 'bootstrapped', seq: Number(data.seq) || 0, base });
      /* a re-bootstrap while the stream is up (reset) is live again at once */
      if (this.streamLive) this.dispatch({ type: 'status', status: 'live', error: null });
      this.bootstrapped$.next(data);
      return;
    }
  }

  /** Apply changes (skipping ones already covered by seq) and announce the new ones. */
  private applyChanges(changes: readonly Change[]) {
    let seq = this.state.seq;
    const fresh: Change[] = [];
    for (const c of changes) if (c && typeof c.seq === 'number' && c.seq > seq) { fresh.push(c); seq = c.seq; }
    if (!fresh.length) return;
    const before = this.state.base;
    this.dispatch({ type: 'changes', changes: fresh });
    this.changes$.next({ changes: fresh, before });
  }

  /** Changes missed while disconnected; 410 = outside the window → bootstrap again. */
  private async catchUp(): Promise<void> {
    try {
      const r = await this.opts.transport.request<Change[] | { changes?: Change[] }>('GET', this.opts.changesPath(this.state.seq));
      this.applyChanges(Array.isArray(r) ? r : Array.isArray(r?.changes) ? r.changes : []);
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
            () => {
              if (!this.running) return;
              this.streamLive = true;
              this.dispatch({ type: 'status', status: 'live', error: null });
              this.kick();
            },
            () => this.reconnect(),
          );
        } else if (sig.type === 'change') {
          this.applyChanges([sig.change]);
        } else if (sig.type === 'reset') {
          this.bootstrap().catch(() => {});
        } else if (sig.type === 'event') {
          this.events$.next({ event: sig.event, data: sig.data });
        }
      },
      error: () => this.reconnect(),
      complete: () => this.reconnect(),
    });
  }

  private reconnect() {
    if (!this.running) return;
    this.streamLive = false;
    this.stream?.unsubscribe();
    this.dispatch({ type: 'status', status: this.state.status === 'offline' || browserOffline() ? 'offline' : 'reconnecting' });
    clearTimeout(this.streamTimer);
    this.streamTimer = setTimeout(() => this.reopen(), this.delay(this.streamAttempt++));
  }

  /** Open the stream again — after the probe, when there is one. */
  private reopen() {
    if (!this.running) return;
    if (!this.opts.probe) return this.openStream();
    this.opts.transport.request<Change[] | { changes?: Change[] }>('GET', this.opts.changesPath(this.state.seq)).then(
      (r) => { if (!this.running) return; this.applyChanges(Array.isArray(r) ? r : Array.isArray(r?.changes) ? r.changes : []); this.openStream(); },
      (e: unknown) => {
        const err = toHttp(e);
        if (err.status === 410) return this.openStream(); /* the catch-up on open re-bootstraps */
        if (!err.retryable) return this.lose(err);
        this.reconnect();
      },
    );
  }

  /** Access refused: stop syncing (the queue and base stay as they are). */
  private lose(err: HttpError) {
    if (!this.running) return;
    this.halt();
    this.lost$.next(err);
    this.dispatch({ type: 'status', status: 'error', error: err.message });
  }

  private halt() {
    this.running = false;
    this.streamLive = false;
    this.stream?.unsubscribe();
    clearTimeout(this.retryTimer);
    clearTimeout(this.streamTimer);
    globalThis.removeEventListener?.('offline', this.onOffline);
    globalThis.removeEventListener?.('online', this.onOnline);
  }
}
