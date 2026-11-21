import { BehaviorSubject, distinctUntilChanged, type Observable } from 'rxjs';

/**
 * A small typed router: named path patterns (`/items/:id`, optional `*rest`), parse ⇄ format, and an RxJS
 * `UiRouter` that follows the History API. Routes are tried in declaration order.
 */

export type RouteDefs = Readonly<Record<string, string>>;

export interface Route<N extends string = string> {
  name: N;
  params: Record<string, string>;
  query: Record<string, string>;
}

interface Compiled { name: string; re: RegExp; keys: string[]; pattern: string }

function compile(name: string, pattern: string): Compiled {
  const keys: string[] = [];
  const src = pattern
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) { keys.push(seg.slice(1)); return '([^/]+)'; }
      if (seg.startsWith('*')) { keys.push(seg.slice(1)); return '(.*)'; }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { name, re: new RegExp(`^${src}/?$`), keys, pattern };
}

export interface Router<D extends RouteDefs> {
  parse(url: string): Route<Extract<keyof D, string>> | null;
  format(name: Extract<keyof D, string>, params?: Record<string, string>, query?: Record<string, string>): string;
}

export function createRouter<D extends RouteDefs>(defs: D): Router<D> {
  const compiled = Object.entries(defs).map(([n, p]) => compile(n, p));
  return {
    parse(url) {
      const [path, qs = ''] = url.split('?', 2);
      const query: Record<string, string> = {};
      for (const [k, v] of new URLSearchParams(qs)) query[k] = v;
      for (const c of compiled) {
        const m = c.re.exec(path || '/');
        if (!m) continue;
        const params: Record<string, string> = {};
        c.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1] ?? ''); });
        return { name: c.name as Extract<keyof D, string>, params, query };
      }
      return null;
    },
    format(name, params = {}, query = {}) {
      const c = compiled.find((x) => x.name === name);
      if (!c) throw new Error(`unknown route ${name}`);
      const path = c.pattern
        .split('/')
        .map((seg) => {
          if (seg.startsWith(':')) {
            const v = params[seg.slice(1)];
            if (v === undefined) throw new Error(`route ${name}: missing :${seg.slice(1)}`);
            return encodeURIComponent(v);
          }
          if (seg.startsWith('*')) return (params[seg.slice(1)] ?? '').split('/').map(encodeURIComponent).join('/');
          return seg;
        })
        .join('/');
      const qs = new URLSearchParams(query).toString();
      return (path || '/') + (qs ? `?${qs}` : '');
    },
  };
}

export interface HistoryLike {
  readonly location: { pathname: string; search: string };
  pushState(data: unknown, unused: string, url: string): void;
  replaceState(data: unknown, unused: string, url: string): void;
}

/** Current route as an observable, kept in step with the browser history. */
export class UiRouter<D extends RouteDefs> {
  private readonly subject: BehaviorSubject<Route<Extract<keyof D, string>> | null>;
  readonly route$: Observable<Route<Extract<keyof D, string>> | null>;
  private readonly onPop = () => this.sync();

  constructor(readonly router: Router<D>, private readonly win: (HistoryLike & { addEventListener?: Window['addEventListener']; removeEventListener?: Window['removeEventListener'] }) | null =
    typeof window !== 'undefined' ? { location: window.location, pushState: (...a) => history.pushState(...a), replaceState: (...a) => history.replaceState(...a), addEventListener: window.addEventListener.bind(window), removeEventListener: window.removeEventListener.bind(window) } : null) {
    this.subject = new BehaviorSubject(this.current());
    this.route$ = this.subject.pipe(distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)));
    this.win?.addEventListener?.('popstate', this.onPop);
  }

  get route() { return this.subject.value; }

  navigate(name: Extract<keyof D, string>, params?: Record<string, string>, query?: Record<string, string>, replace = false) {
    const url = this.router.format(name, params, query);
    if (this.win) (replace ? this.win.replaceState : this.win.pushState).call(this.win, null, '', url);
    this.subject.next(this.router.parse(url));
  }

  /** Re-read the location (after popstate or an external change). */
  sync() { this.subject.next(this.current()); }

  destroy() {
    this.win?.removeEventListener?.('popstate', this.onPop);
    this.subject.complete();
  }

  private current() {
    return this.win ? this.router.parse(this.win.location.pathname + this.win.location.search) : null;
  }
}
