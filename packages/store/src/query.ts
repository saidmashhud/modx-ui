/**
 * Query helpers over table rows: filtering by a declarative spec, multi-key sorting, grouping with a stable group
 * order, fractional ordering for drag & drop and fuzzy matching for command palettes. Pure functions, so they
 * compose with createSelector.
 */

export type Comparable = string | number | boolean | null | undefined;

/** field → accepted values (OR inside a field, AND across fields); a function for anything else. */
export type FilterSpec<T> = { [K in keyof T]?: readonly T[K][] | ((v: T[K], row: T) => boolean) };

export function filterBy<T>(rows: readonly T[], spec: FilterSpec<T>): T[] {
  const keys = Object.keys(spec) as (keyof T)[];
  return rows.filter((r) => keys.every((k) => {
    const want = spec[k];
    if (!want) return true;
    if (typeof want === 'function') return (want as (v: T[keyof T], row: T) => boolean)(r[k], r);
    return (want as readonly T[keyof T][]).length === 0 || (want as readonly T[keyof T][]).includes(r[k]);
  }));
}

export type SortKey<T> = keyof T | ((row: T) => Comparable) | { by: keyof T | ((row: T) => Comparable); desc?: boolean };

function cmp(a: Comparable, b: Comparable): number {
  if (a === b) return 0;
  if (a === undefined || a === null) return 1; /* empty values last */
  if (b === undefined || b === null) return -1;
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b);
  return a < b ? -1 : 1;
}

/** Stable sort by several keys (a copy). */
export function sortBy<T>(rows: readonly T[], ...keys: SortKey<T>[]): T[] {
  const getters = keys.map((k) => {
    const spec = typeof k === 'object' && k !== null && 'by' in k ? k : { by: k as keyof T | ((row: T) => Comparable), desc: false };
    const get = typeof spec.by === 'function' ? spec.by : (r: T) => r[spec.by as keyof T] as unknown as Comparable;
    return { get, sign: spec.desc ? -1 : 1 };
  });
  return rows
    .map((row, i) => ({ row, i }))
    .sort((x, y) => {
      for (const g of getters) {
        const c = cmp(g.get(x.row), g.get(y.row));
        if (c) return c * g.sign;
      }
      return x.i - y.i;
    })
    .map((x) => x.row);
}

export interface Group<K, T> { key: K; rows: T[] }

/** Group rows; `order` lists keys in display order (others follow in first-seen order); empty groups kept when listed. */
export function groupBy<T, K>(rows: readonly T[], keyOf: (row: T) => K, order: readonly K[] = []): Group<K, T>[] {
  const map = new Map<K, T[]>();
  for (const k of order) map.set(k, []);
  for (const r of rows) {
    const k = keyOf(r);
    let g = map.get(k);
    if (!g) { g = []; map.set(k, g); }
    g.push(r);
  }
  return [...map.entries()].map(([key, rs]) => ({ key, rows: rs }));
}

/** Fractional index between two neighbours — drag & drop without renumbering. */
export function sortOrderBetween(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return 1024;
  if (before === undefined) return after! - 1024;
  if (after === undefined) return before + 1024;
  return (before + after) / 2;
}

/** Fuzzy score: prefix > substring > subsequence (consecutive runs count more). 0 = no match. */
export function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const s = target.toLowerCase();
  if (!q) return 1;
  const idx = s.indexOf(q);
  if (idx === 0) return 100 - s.length * 0.01;
  if (idx > 0) return 60 - idx * 0.1;
  let qi = 0;
  let score = 0;
  let streak = 0;
  for (let i = 0; i < s.length && qi < q.length; i++) {
    if (s[i] === q[qi]) {
      qi++;
      streak++;
      score += 1 + streak;
    } else streak = 0;
  }
  return qi === q.length ? score : 0;
}

/** Rows matching a query, best first. */
export function search<T>(rows: readonly T[], query: string, text: (row: T) => string, limit = Infinity): T[] {
  return rows
    .map((row) => ({ row, s: fuzzyScore(query, text(row)) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.row);
}
