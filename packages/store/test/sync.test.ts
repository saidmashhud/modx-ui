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
