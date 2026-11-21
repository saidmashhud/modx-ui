import { describe, expect, it } from 'vitest';
import { Observable, Subject } from 'rxjs';
import { HttpError, memoryStorage, SyncEngine, type Change, type StreamSignal, type Transport } from '../src/index.js';

interface Todo { id: string; title: string; done: boolean }
interface Model { todos: Todo }

/** In-memory stand-in for a modx-core server: rows, a seq, a change log with a window, an SSE subject. */
class FakeServer implements Transport {
  rows = new Map<string, Todo>();
  seq = 0;
  log: Change[] = [];
  window = 1000;
  offline = false;
  rejectNext: number | null = null;
  requests: string[] = [];
  private streams = new Set<Subject<StreamSignal>>();
  private n = 0;

  commit(op: 'put' | 'del', id: string, data: Todo | null, clientId?: string) {
    const c: Change = { seq: ++this.seq, entity: 'todos', op, id, data, client_id: clientId };
    this.log.push(c);
    if (this.log.length > this.window) this.log.shift();
    for (const s of this.streams) s.next({ type: 'change', change: c });
  }

  async request<T>(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    this.requests.push(`${method} ${path}`);
    await Promise.resolve();
    if (this.offline) throw new HttpError(0, 'network', 'offline');
    if (this.rejectNext !== null && method !== 'GET') {
      const status = this.rejectNext;
      this.rejectNext = null;
      throw new HttpError(status, 'bad_request', 'refused');
    }
    const cid = headers?.['X-Client-Id'];
    if (method === 'GET' && path === '/api/bootstrap') return { seq: this.seq, todos: [...this.rows.values()] } as T;
    if (method === 'GET' && path.startsWith('/api/changes')) {
      const since = Number(new URL('http://x' + path).searchParams.get('since'));
      const oldest = this.log[0]?.seq ?? this.seq + 1;
      if (since > this.seq || since + 1 < oldest) throw new HttpError(410, 'gone', 'window');
      return this.log.filter((c) => c.seq > since) as T;
    }
    if (method === 'POST') {
      const b = body as Partial<Todo>;
      const row: Todo = { id: `td_${++this.n}`, title: String(b.title), done: !!b.done };
      this.rows.set(row.id, row);
      this.commit('put', row.id, row, cid);
      return row as T;
    }
    const id = path.split('/').pop()!;
    if (method === 'PUT') {
      const cur = this.rows.get(id);
      if (!cur) throw new HttpError(404, 'not_found', 'no row');
      const row = { ...cur, ...(body as Partial<Todo>) };
      this.rows.set(id, row);
      this.commit('put', id, row, cid);
      return row as T;
    }
    if (method === 'DELETE') {
      if (!this.rows.delete(id)) throw new HttpError(404, 'not_found', 'no row');
      this.commit('del', id, null, cid);
      return null as T;
    }
    throw new HttpError(405, 'method', method);
  }

  stream(): Observable<StreamSignal> {
    return new Observable<StreamSignal>((sub) => {
      if (this.offline) { sub.error(new HttpError(0, 'stream', 'offline')); return; }
      const s = new Subject<StreamSignal>();
      this.streams.add(s);
      const inner = s.subscribe(sub);
      queueMicrotask(() => s.next({ type: 'open' }));
      return () => { inner.unsubscribe(); this.streams.delete(s); };
    });
  }

  /** Drop every live stream (network blip). */
  drop() {
    for (const s of this.streams) s.error(new HttpError(0, 'stream', 'dropped'));
    this.streams.clear();
  }
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 1000) {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error('timeout');
    await tick(2);
  }
}

function engine(server: FakeServer, storage = memoryStorage<Model>()) {
  return new SyncEngine<Model>({
    transport: server,
    collections: ['todos'],
    bootstrapPath: '/api/bootstrap',
    changesPath: (since) => `/api/changes?since=${since}`,
    eventsPath: '/api/events',
    clientId: 'tab-1',
    storage,
    retryDelay: () => 5,
    endpoints: {
      todos: {
        create: (row) => ({ method: 'POST', path: '/api/todos', body: { title: row.title, done: row.done } }),
        update: (id, patch) => ({ method: 'PUT', path: `/api/todos/${id}`, body: patch }),
        remove: (id) => ({ method: 'DELETE', path: `/api/todos/${id}` }),
      },
    },
  });
}

describe('SyncEngine', () => {
  it('bootstraps, goes live and follows changes from others', async () => {
    const srv = new FakeServer();
    srv.rows.set('a', { id: 'a', title: 'existing', done: false });
    srv.seq = 3;
    const e = engine(srv);
    await e.start();
    await until(() => e.state.status === 'live');
    expect(e.tables.todos.a?.title).toBe('existing');
    expect(e.state.seq).toBe(3);
    srv.rows.set('b', { id: 'b', title: 'from another tab', done: false });
    srv.commit('put', 'b', srv.rows.get('b')!);
    expect(e.tables.todos.b?.title).toBe('from another tab');
    srv.commit('del', 'a', null);
    expect(e.tables.todos.a).toBeUndefined();
    expect(e.state.seq).toBe(5);
    e.stop();
  });

  it('writes optimistically, replaces temp ids, and follows queued writes to the real id', async () => {
    const srv = new FakeServer();
    const e = engine(srv);
    await e.start();
    await until(() => e.state.status === 'live');
    const tmp = e.create('todos', { title: 'milk', done: false });
    expect(e.tables.todos[tmp]?.title).toBe('milk'); /* visible before the server answers */
    e.update('todos', tmp, { done: true });             /* queued against the temp id */
    expect(e.tables.todos[tmp]?.done).toBe(true);
    await e.whenIdle();
    const real = e.state.idMap[tmp];
    expect(real).toMatch(/^td_/);
    expect(e.tables.todos[tmp]).toBeUndefined();
    expect(e.tables.todos[real]).toEqual({ id: real, title: 'milk', done: true });
    expect(srv.requests).toContain(`PUT /api/todos/${real}`);
    expect(srv.rows.get(real)?.done).toBe(true);
    e.stop();
  });

  it('rolls back a write the server refuses', async () => {
    const srv = new FakeServer();
    srv.rows.set('a', { id: 'a', title: 'keep', done: false });
    const e = engine(srv);
    const rejected: string[] = [];
    e.rejected$.subscribe((r) => rejected.push(r.write.kind));
    await e.start();
    await until(() => e.state.status === 'live');
    srv.rejectNext = 400;
    e.update('todos', 'a', { title: 'nope' });
    expect(e.tables.todos.a?.title).toBe('nope');
    await e.whenIdle();
    expect(e.tables.todos.a?.title).toBe('keep');
    expect(rejected).toEqual(['update']);
    /* a refused create takes the writes that depended on its row with it */
    srv.rejectNext = 422;
    const t = e.create('todos', { title: 'bad', done: false });
    e.update('todos', t, { done: true });
    await e.whenIdle();
    expect(e.tables.todos[t]).toBeUndefined();
    expect(e.state.pending.length).toBe(0);
    e.stop();
  });

  it('queues writes while offline, keeps them across a reload, and sends them when back', async () => {
    const srv = new FakeServer();
    const storage = memoryStorage<Model>();
    const e = engine(srv, storage);
    await e.start();
    await until(() => e.state.status === 'live');
    srv.offline = true;
    srv.drop();
    const t = e.create('todos', { title: 'offline write', done: false });
    await until(() => e.state.status === 'offline');
    expect(e.tables.todos[t]?.title).toBe('offline write');
    e.stop();
    expect(storage.value?.pending.length).toBe(1);   /* persisted queue */
    /* the tab reloads, still offline: the write is there, then the network returns */
    const e2 = engine(srv, storage);
    await e2.start();
    expect(e2.state.status === 'hydrated' || e2.state.status === 'offline' || e2.state.status === 'reconnecting').toBe(true);
    expect(Object.values(e2.tables.todos).map((x) => x.title)).toEqual(['offline write']);
    srv.offline = false;
    await e2.whenIdle();
    await until(() => e2.state.status === 'live');
    expect([...srv.rows.values()].map((x) => x.title)).toEqual(['offline write']);
    expect(Object.values(e2.tables.todos).map((x) => x.title)).toEqual(['offline write']);
    e2.stop();
  });

  it('catches up after a dropped stream, and re-bootstraps when outside the window', async () => {
    const srv = new FakeServer();
    const e = engine(srv);
    await e.start();
    await until(() => e.state.status === 'live');
    srv.offline = true;
    srv.drop();
    /* others write while we are away */
    srv.offline = false;
    srv.rows.set('x', { id: 'x', title: 'missed', done: false });
    const c: Change = { seq: ++srv.seq, entity: 'todos', op: 'put', id: 'x', data: srv.rows.get('x')! };
    srv.log.push(c); /* committed without reaching our dead stream */
    await until(() => e.tables.todos.x !== undefined);
    expect(e.state.seq).toBe(srv.seq);
    /* now a gap larger than the server keeps */
    srv.drop();
    srv.window = 1;
    for (let i = 0; i < 3; i++) {
      const id = `y${i}`;
      srv.rows.set(id, { id, title: `gap ${i}`, done: false });
      srv.log.push({ seq: ++srv.seq, entity: 'todos', op: 'put', id, data: srv.rows.get(id)! });
      srv.log.splice(0, srv.log.length - 1);
    }
    srv.rows.delete('x');
    await until(() => e.tables.todos.y0 !== undefined && e.tables.todos.x === undefined);
    expect(srv.requests.filter((r) => r === 'GET /api/bootstrap').length).toBe(2);
    e.stop();
  });

  it('undo and redo turn into writes', async () => {
    const srv = new FakeServer();
    srv.rows.set('a', { id: 'a', title: 'one', done: false });
    const e = engine(srv);
    await e.start();
    await until(() => e.state.status === 'live');
    e.update('todos', 'a', { title: 'two' });
    e.update('todos', 'a', { done: true });
    expect(e.canUndo).toBe(true);
    e.undo();
    expect(e.tables.todos.a).toEqual({ id: 'a', title: 'two', done: false });
    e.undo();
    expect(e.tables.todos.a?.title).toBe('one');
    expect(e.canUndo).toBe(false);
    e.redo();
    expect(e.tables.todos.a?.title).toBe('two');
    await e.whenIdle();
    expect(srv.rows.get('a')).toEqual({ id: 'a', title: 'two', done: false });
    /* undoing a delete re-creates the row (the server names it again) */
    e.remove('todos', 'a');
    await e.whenIdle();
    expect(srv.rows.size).toBe(0);
    e.undo();
    await e.whenIdle();
    expect([...srv.rows.values()].map((r) => r.title)).toEqual(['two']);
    /* a new write clears redo */
    expect(e.canRedo).toBe(true);
    e.update('todos', [...srv.rows.keys()][0]!, { title: 'z' });
    expect(e.canRedo).toBe(false);
    await e.whenIdle();
    e.stop();
  });
});

/* ───────── hooks for richer apps ───────── */

interface Note { id: string; title: string; tag?: string; seen?: number }
interface Rich { todos: Todo; notes: Note }

/** A scriptable server: handlers per "METHOD path", one SSE subject, a request log with bodies. */
class Scripted implements Transport {
  seq = 1;
  calls: { method: string; path: string; body?: unknown }[] = [];
  routes = new Map<string, (body: unknown) => unknown>();
  streams = new Set<Subject<StreamSignal>>();
  hold: Promise<void> | null = null;
  constructor() {
    this.routes.set('GET /api/bootstrap', () => ({ seq: this.seq, todos: [{ id: 'a', title: 'one', done: false }], notes: [] }));
    this.routes.set('GET /api/changes', () => ({ seq: this.seq, changes: [] }));
  }
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    this.calls.push({ method, path, body });
    await Promise.resolve();
    if (this.hold && method !== 'GET') await this.hold;
    const h = this.routes.get(`${method} ${path.split('?')[0]}`);
    if (!h) throw new HttpError(404, 'not_found', path);
    return h(body) as T;
  }
  stream(): Observable<StreamSignal> {
    return new Observable<StreamSignal>((sub) => {
      const s = new Subject<StreamSignal>();
      this.streams.add(s);
      const inner = s.subscribe(sub);
      queueMicrotask(() => s.next({ type: 'open' }));
      return () => { inner.unsubscribe(); this.streams.delete(s); };
    });
  }
  emit(sig: StreamSignal) { for (const s of this.streams) s.next(sig); }
  change(entity: string, op: 'put' | 'del', id: string, data: unknown, client_id?: string) {
    this.emit({ type: 'change', change: { seq: ++this.seq, entity, op, id, data, client_id } });
  }
  drop() { for (const s of [...this.streams]) s.error(new HttpError(0, 'stream', 'dropped')); this.streams.clear(); }
}

function rich(srv: Scripted, extra: Partial<ConstructorParameters<typeof SyncEngine<Rich>>[0]> = {}) {
  return new SyncEngine<Rich>({
    transport: srv,
    collections: ['todos', 'notes'],
    bootstrapPath: '/api/bootstrap',
    changesPath: (since) => `/api/changes?since=${since}`,
    eventsPath: '/api/events',
    retryDelay: () => 2,
    endpoints: {
      todos: {
        create: (row, { write }) => ({ method: 'POST', path: '/api/todos', body: { title: row.title, client_id: write.opId } }),
        update: (id, patch, { current }) => ({ method: 'PATCH', path: `/api/${current?.list ?? 'todos'}/${id}`, body: patch }),
        remove: (id) => ({ method: 'DELETE', path: `/api/todos/${id}` }),
      },
    },
    ...extra,
  });
}

async function live(e: SyncEngine<Rich>) {
  void e.start();
  await until(() => e.state.status === 'live');
}

describe('SyncEngine hooks', () => {
  it('update: local fields show but are not sent; endpoints see the current row', async () => {
    const srv = new Scripted();
    srv.routes.set('GET /api/bootstrap', () => ({ seq: 1, todos: [{ id: 'a', title: 'one', done: false, list: 'inbox' }], notes: [] }));
    srv.routes.set('PATCH /api/inbox/a', (b) => ({ id: 'a', title: (b as Todo).title, done: false, list: 'inbox' }));
    const e = rich(srv);
    await live(e);
    e.update('todos', 'a', { title: 'two' }, { local: { seen: 5 } as never });
    expect(e.tables.todos.a).toMatchObject({ title: 'two', seen: 5 });
    await e.whenIdle();
    expect(srv.calls.at(-1)).toEqual({ method: 'PATCH', path: '/api/inbox/a', body: { title: 'two' } });
    expect(e.tables.todos.a).not.toHaveProperty('seen');
    e.stop();
  });

  it('settles a create from its echo (opId as client_id) before the HTTP answer', async () => {
    const srv = new Scripted();
    let release!: () => void;
    srv.hold = new Promise((r) => { release = r; });
    srv.routes.set('POST /api/todos', () => ({ id: 'td_9', title: 'milk', done: false }));
    const e = rich(srv);
    await live(e);
    const tmp = e.create('todos', { title: 'milk', done: false });
    e.update('todos', tmp, { done: true });
    await until(() => srv.calls.some((c) => c.method === 'POST'));
    const opId = (srv.calls.find((c) => c.method === 'POST')!.body as { client_id: string }).client_id;
    srv.change('todos', 'put', 'td_9', { id: 'td_9', title: 'milk', done: false }, opId);
    expect(Object.values(e.tables.todos).filter((t) => t.title === 'milk')).toHaveLength(1);
    expect(e.resolveId(tmp)).toBe('td_9');
    expect(e.state.pending.map((w) => w.id)).toEqual(['td_9']); /* the queued update follows */
    srv.routes.set('PATCH /api/todos/td_9', () => ({ id: 'td_9', title: 'milk', done: true }));
    release();
    await e.whenIdle();
    expect(e.tables.todos.td_9?.done).toBe(true);
    e.stop();
  });

  it('call(): optimistic patches and puts, multi-row results, refresh lists', async () => {
    const srv = new Scripted();
    srv.routes.set('GET /api/bootstrap', () => ({ seq: 1, todos: [{ id: 'a', title: 'one', done: false }, { id: 'b', title: 'two', done: false }], notes: [] }));
    srv.routes.set('POST /api/todos/batch', () => ({ todos: [{ id: 'a', title: 'one', done: true }, { id: 'b', title: 'two', done: true }] }));
    srv.routes.set('POST /api/notes/seen', () => ({}));
    srv.routes.set('GET /api/notes', () => [{ id: 'n_1', title: 'note', seen: 1 }]);
    const e = rich(srv);
    await live(e);
    e.call({ method: 'POST', path: '/api/todos/batch', body: { ids: ['a', 'b'] }, result: 'todos',
      patches: [{ entity: 'todos', id: 'a', data: { done: true } }, { entity: 'todos', id: 'b', data: { done: true } }] });
    e.call({ method: 'POST', path: '/api/notes/seen', puts: [{ entity: 'notes', row: { id: 'tmp_n', title: 'note' } }], refresh: { entity: 'notes', path: '/api/notes' } });
    expect(e.tables.todos.a?.done && e.tables.todos.b?.done).toBe(true);
    expect(e.tables.notes.tmp_n?.title).toBe('note');
    await e.whenIdle();
    expect(e.state.base.todos.b?.done).toBe(true);
    expect(e.tables.notes).toEqual({ n_1: { id: 'n_1', title: 'note', seen: 1 } });
    e.stop();
  });

  it('a refused call rolls back its optimistic effect', async () => {
    const srv = new Scripted();
    srv.routes.set('POST /api/x', () => { throw new HttpError(409, 'conflict', 'no'); });
    const e = rich(srv);
    const refused: string[] = [];
    e.rejected$.subscribe((r) => refused.push(`${r.write.kind}:${r.error.status}`));
    await live(e);
    e.call({ method: 'POST', path: '/api/x', patches: [{ entity: 'todos', id: 'a', data: { title: 'temp' } }] });
    expect(e.tables.todos.a?.title).toBe('temp');
    await e.whenIdle();
    expect(e.tables.todos.a?.title).toBe('one');
    expect(refused).toEqual(['call:409']);
    e.stop();
  });

  it('gives up on a write after maxRetries server errors', async () => {
    const srv = new Scripted();
    let n = 0;
    srv.routes.set('PATCH /api/todos/a', () => { n++; throw new HttpError(503, 'busy', 'busy'); });
    const e = rich(srv, { maxRetries: 2 });
    await live(e);
    e.update('todos', 'a', { title: 'x' });
    await e.whenIdle();
    expect(n).toBe(3);
    expect(e.tables.todos.a?.title).toBe('one');
    e.stop();
  });

  it('mapBootstrap keeps rows the payload does not carry; bootstrapped$, events$ and changes$ report', async () => {
    const srv = new Scripted();
    const e = rich(srv, {
      mapBootstrap: (data, prev) => ({ todos: Object.fromEntries((data.todos as Todo[]).map((t) => [t.id, t])), notes: prev.notes }),
    });
    const boots: number[] = [];
    const events: string[] = [];
    const applied: string[] = [];
    e.bootstrapped$.subscribe((d) => boots.push(d.seq));
    e.events$.subscribe((x) => events.push(`${x.event}:${JSON.stringify(x.data)}`));
    e.changes$.subscribe(({ changes, before }) => applied.push(...changes.map((c) => `${c.id}:${before.todos[c.id] ? 'old' : 'new'}`)));
    await live(e);
    e.putRows('notes', [{ id: 'n1', title: 'loaded on demand' }]);
    e.updateBase((b) => ({ ...b, notes: { ...b.notes, n2: { id: 'n2', title: 'second' } } }));
    srv.emit({ type: 'event', event: 'typing', data: { user: 'u2' } });
    srv.change('todos', 'put', 'z', { id: 'z', title: 'z', done: false });
    srv.change('todos', 'put', 'a', { id: 'a', title: 'one!', done: false });
    srv.emit({ type: 'reset' });
    await until(() => boots.length === 2);
    expect(e.state.status).toBe('live'); /* a reset re-bootstraps without leaving 'bootstrapping' behind */
    expect(Object.keys(e.tables.notes).sort()).toEqual(['n1', 'n2']);
    expect(events).toEqual(['typing:{"user":"u2"}']);
    expect(applied).toEqual(['z:new', 'a:old']);
    e.stop();
  });

  it('probe: a dropped stream whose catch-up answers 403 stops the engine instead of looping', async () => {
    const srv = new Scripted();
    const e = rich(srv, { probe: true });
    const lost: number[] = [];
    e.lost$.subscribe((x) => lost.push(x.status));
    await live(e);
    srv.routes.set('GET /api/changes', () => { throw new HttpError(403, 'forbidden', 'removed'); });
    srv.drop();
    await until(() => e.state.status === 'error');
    expect(lost).toEqual([403]);
    const n = srv.calls.length;
    await tick(30);
    expect(srv.calls.length).toBe(n); /* no more reconnects */
    expect(srv.streams.size).toBe(0);
    e.stop();
  });

  it('probe: a network failure keeps reconnecting, and the stream comes back live', async () => {
    const srv = new Scripted();
    const e = rich(srv, { probe: true });
    await live(e);
    let down = 2;
    srv.routes.set('GET /api/changes', () => { if (down-- > 0) throw new HttpError(0, 'network', 'down'); return { changes: [] }; });
    srv.drop();
    await until(() => e.state.status === 'reconnecting');
    await until(() => e.state.status === 'live');
    e.stop();
  });

  it('a lost session at bootstrap reports lost$ and rejects start()', async () => {
    const srv = new Scripted();
    srv.routes.set('GET /api/bootstrap', () => { throw new HttpError(401, 'unauthorized', 'signed out'); });
    const e = rich(srv);
    const lost: number[] = [];
    e.lost$.subscribe((x) => lost.push(x.status));
    await expect(e.start()).rejects.toThrow('signed out');
    expect(lost).toEqual([401]);
    expect(e.state.status).toBe('error');
  });

  it('a stored snapshot in an old or broken shape never crashes: fresh bootstrap or tables filled in', async () => {
    for (const bad of ['oops', { seq: 'x', base: {} }, { seq: 3 }, { seq: 3, base: [] }, null]) {
      const srv = new Scripted();
      const e = rich(srv, { storage: { load: () => bad as never, save: () => {} } });
      await live(e);
      expect(e.tables.todos.a?.title).toBe('one');
      expect(srv.calls.some((c) => c.path === '/api/bootstrap')).toBe(true);
      e.stop();
    }
    /* a snapshot from an older client without a newer table: its rows would never arrive, so bootstrap afresh */
    const srv = new Scripted();
    const e = rich(srv, { storage: { load: () => ({ seq: 1, base: { todos: { k: { id: 'k', title: 'kept', done: false } } } }) as never, save: () => {} } });
    await live(e);
    expect(e.tables.todos.k).toBeUndefined();
    expect(e.tables.todos.a?.title).toBe('one');
    expect(srv.calls.some((c) => c.path === '/api/bootstrap')).toBe(true);
    e.stop();
    /* every table there, no queue fields (an earlier snapshot format): hydrates, no bootstrap */
    const srv2 = new Scripted();
    const e2 = rich(srv2, { storage: { load: () => ({ seq: 1, base: { todos: { k: { id: 'k', title: 'kept', done: false } }, notes: {} } }) as never, save: () => {} } });
    await live(e2);
    expect(e2.tables.todos.k?.title).toBe('kept');
    expect(e2.state.pending).toEqual([]);
    expect(srv2.calls.some((c) => c.path === '/api/bootstrap')).toBe(false);
    e2.update('todos', 'k', { title: 'k2' });
    expect(e2.tables.todos.k?.title).toBe('k2');
    e2.stop();
  });

  it('a throwing storage load is a fresh start; saves can be debounced and flush on stop', async () => {
    const srv = new Scripted();
    const saved: number[] = [];
    const e = rich(srv, { saveDebounceMs: 50, storage: { load: () => { throw new Error('corrupt'); }, save: (s) => { saved.push(s.seq); } } });
    await live(e);
    srv.change('todos', 'put', 'q', { id: 'q', title: 'q', done: false });
    srv.change('todos', 'put', 'r', { id: 'r', title: 'r', done: false });
    expect(saved).toEqual([]);
    e.stop();
    expect(saved).toEqual([3]);
  });

  it('history: false skips undo; undoLimit 0 keeps none; a write queued after an id was mapped uses the real id', async () => {
    const srv = new Scripted();
    srv.routes.set('POST /api/todos', () => ({ id: 'td_1', title: 'x', done: false }));
    srv.routes.set('PATCH /api/todos/td_1', () => ({ id: 'td_1', title: 'y', done: false }));
    const e = rich(srv);
    await live(e);
    const tmp = e.create('todos', { title: 'x', done: false }, { history: false });
    expect(e.canUndo).toBe(false);
    await e.whenIdle();
    e.update('todos', tmp, { title: 'y' }, { history: false });
    await e.whenIdle();
    expect(srv.calls.at(-1)?.path).toBe('/api/todos/td_1');
    e.stop();
    const e0 = rich(new Scripted(), { undoLimit: 0 });
    await live(e0);
    e0.update('todos', 'a', { title: 'z' });
    expect(e0.canUndo).toBe(false);
    e0.stop();
  });
});
