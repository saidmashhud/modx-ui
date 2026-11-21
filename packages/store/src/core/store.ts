import {
  BehaviorSubject, Observable, Subject, Subscription, distinctUntilChanged, map, merge, observeOn,
  queueScheduler, shareReplay, skip,
} from 'rxjs';

/** Flux action: discriminated by `type`. */
export interface Action { type: string; [k: string]: unknown }

export type Reducer<S, A extends Action> = (state: S, action: A) => S;

/** An effect turns the action stream (and state) into more actions — or nothing (side-effect only). */
export type Effect<S, A extends Action> = (actions$: Observable<A>, state$: Observable<S>, store: Store<S, A>) => Observable<A | never>;

export interface StoreOptions<S, A extends Action> {
  initial: S;
  reducer: Reducer<S, A>;
  effects?: Effect<S, A>[];
  /** Called for every action after it has been reduced; useful for logging / devtools. */
  onAction?: (action: A, prev: S, next: S) => void;
}

/**
 * Minimal Redux-style store on RxJS.
 * - `state$` is a hot BehaviorSubject: late subscribers get the current state synchronously.
 * - Actions dispatched from inside reducers/effects are queued (queueScheduler), so ordering is FIFO and reentrancy-safe.
 * - `select` memoizes by reference and shares the projection between subscribers.
 */
export class Store<S, A extends Action> {
  private readonly stateSubject: BehaviorSubject<S>;
  private readonly actionSubject = new Subject<A>();
  private readonly subs = new Subscription();
  private readonly opts: StoreOptions<S, A>;

  readonly state$: Observable<S>;
  /** Every action, emitted after the reducer has run. */
  readonly actions$: Observable<A>;

  constructor(opts: StoreOptions<S, A>) {
    this.opts = opts;
    this.stateSubject = new BehaviorSubject(opts.initial);
    this.state$ = this.stateSubject.asObservable();
    const reduced$ = new Subject<A>();
    this.actions$ = reduced$.asObservable();

    this.subs.add(
      this.actionSubject.pipe(observeOn(queueScheduler)).subscribe((action) => {
        const prev = this.stateSubject.value;
        const next = this.opts.reducer(prev, action);
        if (next !== prev) this.stateSubject.next(next);
        this.opts.onAction?.(action, prev, next);
        reduced$.next(action);
      }),
    );

    if (opts.effects?.length) {
      const out$ = merge(...opts.effects.map((fx) => fx(this.actions$, this.state$, this)));
      this.subs.add(out$.subscribe((a) => this.dispatch(a)));
    }
  }

  get state(): S {
    return this.stateSubject.value;
  }

  dispatch(action: A): void {
    this.actionSubject.next(action);
  }

  select<R>(selector: (s: S) => R, equals: (a: R, b: R) => boolean = Object.is): Observable<R> {
    return this.state$.pipe(map(selector), distinctUntilChanged(equals), shareReplay({ bufferSize: 1, refCount: true }));
  }

  /** Like select but without the initial replay — only future changes. */
  changes<R>(selector: (s: S) => R): Observable<R> {
    return this.select(selector).pipe(skip(1));
  }

  destroy(): void {
    this.subs.unsubscribe();
    this.actionSubject.complete();
    this.stateSubject.complete();
  }
}

/** Build a reducer from a handler map, with exhaustive typing per action type. */
export function createReducer<S, A extends Action>(
  handlers: { [T in A['type']]?: (state: S, action: Extract<A, { type: T }>) => S },
): Reducer<S, A> {
  return (state, action) => {
    const h = (handlers as Record<string, ((s: S, a: A) => S) | undefined>)[action.type];
    return h ? h(state, action) : state;
  };
}

/** Filter an action stream by type with narrowing. */
export function ofType<A extends Action, T extends A['type']>(...types: T[]) {
  return (source: Observable<A>) =>
    new Observable<Extract<A, { type: T }>>((sub) =>
      source.subscribe({
        next: (a) => { if ((types as string[]).includes(a.type)) sub.next(a as Extract<A, { type: T }>); },
        error: (e) => sub.error(e),
        complete: () => sub.complete(),
      }),
    );
}
