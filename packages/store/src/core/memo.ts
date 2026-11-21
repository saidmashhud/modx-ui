/**
 * Reselect-style memoization: recompute only when one of the input selectors returns a new reference.
 */
export function createSelector<S, A, R>(a: (s: S) => A, project: (a: A) => R): (s: S) => R;
export function createSelector<S, A, B, R>(a: (s: S) => A, b: (s: S) => B, project: (a: A, b: B) => R): (s: S) => R;
export function createSelector<S, A, B, C, R>(
  a: (s: S) => A, b: (s: S) => B, c: (s: S) => C, project: (a: A, b: B, c: C) => R,
): (s: S) => R;
export function createSelector(...fns: ((...args: unknown[]) => unknown)[]): (s: unknown) => unknown {
  const project = fns.pop()!;
  const inputs = fns;
  let lastArgs: unknown[] | undefined;
  let lastResult: unknown;
  return (s: unknown) => {
    const args = inputs.map((fn) => fn(s));
    if (lastArgs && args.every((a, i) => Object.is(a, lastArgs![i]))) return lastResult;
    lastArgs = args;
    lastResult = project(...args);
    return lastResult;
  };
}

/** Memoize a function of one argument using a WeakMap (object keys) — handy for per-entity derived data. */
export function weakMemo<K extends object, R>(fn: (k: K) => R): (k: K) => R {
  const cache = new WeakMap<K, R>();
  return (k) => {
    if (cache.has(k)) return cache.get(k)!;
    const r = fn(k);
    cache.set(k, r);
    return r;
  };
}

export function shallowEqualArrays<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}
