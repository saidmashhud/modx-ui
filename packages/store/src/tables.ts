/**
 * Immutable id → row tables. Every write produces new objects along the path, so reference equality is
 * enough for memoized selectors (createSelector, Store.select).
 */
export type ID = string;
export type Table<T> = Readonly<Record<ID, T>>;
/** One table per collection of a model `M` (collection name → row type). */
export type TablesOf<M> = { readonly [K in keyof M]: Table<M[K]> };

export function emptyTables<M>(names: readonly (keyof M)[]): TablesOf<M> {
  const t = {} as Record<keyof M, Table<unknown>>;
  for (const n of names) t[n] = {};
  return t as TablesOf<M>;
}

const idOf = (row: unknown): ID => (row as { id: ID }).id;

export function putOne<M, K extends keyof M>(tables: TablesOf<M>, name: K, row: M[K]): TablesOf<M> {
  const id = idOf(row);
  if (tables[name][id] === row) return tables;
  return { ...tables, [name]: { ...tables[name], [id]: row } };
}

export function putMany<M, K extends keyof M>(tables: TablesOf<M>, name: K, rows: readonly M[K][]): TablesOf<M> {
  if (!rows.length) return tables;
  const next = { ...tables[name] } as Record<ID, M[K]>;
  for (const r of rows) next[idOf(r)] = r;
  return { ...tables, [name]: next };
}

export function removeOne<M>(tables: TablesOf<M>, name: keyof M, id: ID): TablesOf<M> {
  if (!(id in tables[name])) return tables;
  const next = { ...tables[name] } as Record<ID, unknown>;
  delete next[id];
  return { ...tables, [name]: next } as TablesOf<M>;
}

export function patchOne<M, K extends keyof M>(tables: TablesOf<M>, name: K, id: ID, patch: Partial<M[K]>): TablesOf<M> {
  const cur = tables[name][id];
  if (!cur) return tables;
  return putOne(tables, name, { ...cur, ...patch });
}

export function values<T>(table: Table<T>): T[] {
  return Object.values(table);
}
