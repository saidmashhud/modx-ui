import { describe, expect, it } from 'vitest';
import { createRouter, filterBy, fuzzyScore, groupBy, search, sortBy, sortOrderBetween, UiRouter, emptyTables, putOne, patchOne, removeOne, putMany, values, type HistoryLike } from '../src/index.js';

describe('router', () => {
  const r = createRouter({ home: '/', item: '/lists/:list/items/:id', files: '/files/*path' });
  it('parses and formats', () => {
    expect(r.parse('/')).toEqual({ name: 'home', params: {}, query: {} });
    expect(r.parse('/lists/work/items/a%20b?tab=log')).toEqual({ name: 'item', params: { list: 'work', id: 'a b' }, query: { tab: 'log' } });
    expect(r.parse('/files/a/b/c.txt')?.params.path).toBe('a/b/c.txt');
    expect(r.parse('/nope')).toBeNull();
    expect(r.format('item', { list: 'work', id: 'a b' }, { tab: 'log' })).toBe('/lists/work/items/a%20b?tab=log');
    expect(r.format('files', { path: 'a/b c' })).toBe('/files/a/b%20c');
    expect(() => r.format('item', { list: 'x' })).toThrow();
  });
  it('UiRouter follows navigate and history', () => {
    const loc = { pathname: '/', search: '' };
    const listeners: Record<string, () => void> = {};
    const win: HistoryLike & { addEventListener: (t: string, f: () => void) => void; removeEventListener: () => void } = {
      location: loc,
      pushState: (_d, _u, url) => { const [p, q = ''] = url.split('?'); loc.pathname = p!; loc.search = q ? `?${q}` : ''; },
      replaceState: (_d, _u, url) => { loc.pathname = url; },
      addEventListener: (t, f) => { listeners[t] = f; },
      removeEventListener: () => {},
    };
    const ui = new UiRouter(r, win as never);
    const seen: (string | undefined)[] = [];
    ui.route$.subscribe((x) => seen.push(x?.name));
    ui.navigate('item', { list: 'l', id: '1' });
    expect(loc.pathname).toBe('/lists/l/items/1');
    loc.pathname = '/';
    listeners.popstate?.();
    expect(seen).toEqual(['home', 'item', 'home']);
    ui.destroy();
  });
});

describe('query', () => {
  const rows = [
    { id: 'a', status: 'todo', prio: 2, title: 'Write report' },
    { id: 'b', status: 'done', prio: 1, title: 'Buy milk' },
    { id: 'c', status: 'todo', prio: 1, title: 'Book flights' },
    { id: 'd', status: 'doing', prio: 3, title: 'Review' },
  ];
  it('filters, sorts, groups', () => {
    expect(filterBy(rows, { status: ['todo'] }).map((r) => r.id)).toEqual(['a', 'c']);
    expect(filterBy(rows, { prio: (p) => p > 1, status: [] }).map((r) => r.id)).toEqual(['a', 'd']);
    expect(sortBy(rows, 'prio', { by: 'title', desc: true }).map((r) => r.id)).toEqual(['b', 'c', 'a', 'd']);
    expect(sortBy(rows, (r) => r.title.length).map((r) => r.id)).toEqual(['d', 'b', 'a', 'c']);
    const g = groupBy(rows, (r) => r.status, ['doing', 'todo', 'done', 'blocked']);
    expect(g.map((x) => [x.key, x.rows.length])).toEqual([['doing', 1], ['todo', 2], ['done', 1], ['blocked', 0]]);
  });
  it('orders and searches', () => {
    expect(sortOrderBetween(undefined, undefined)).toBe(1024);
    expect(sortOrderBetween(1024, 2048)).toBe(1536);
    expect(sortOrderBetween(undefined, 100)).toBe(-924);
    expect(fuzzyScore('bm', 'Buy milk')).toBeGreaterThan(0);
    expect(fuzzyScore('xyz', 'Buy milk')).toBe(0);
    expect(search(rows, 'b', (r) => r.title).map((r) => r.id)).toEqual(['b', 'c']); // shorter prefix match first
  });
  it('tables stay immutable', () => {
    type M = { items: { id: string; n: number } };
    const t0 = emptyTables<M>(['items']);
    const t1 = putOne(t0, 'items', { id: 'x', n: 1 });
    expect(t0.items).toEqual({});
    const t2 = patchOne(t1, 'items', 'x', { n: 2 });
    expect(t1.items.x?.n).toBe(1);
    expect(t2.items.x?.n).toBe(2);
    expect(putOne(t2, 'items', t2.items.x!)).toBe(t2);
    expect(removeOne(t2, 'items', 'x').items).toEqual({});
    expect(values(putMany(t0, 'items', [{ id: 'a', n: 1 }, { id: 'b', n: 2 }]).items).length).toBe(2);
  });
});
