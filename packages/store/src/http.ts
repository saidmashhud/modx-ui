import { Observable } from 'rxjs';
import type { ID } from './tables.js';

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
  /** Network failures (status 0), timeouts and 5xx are worth retrying; 4xx are not. */
  get retryable(): boolean {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

/** A committed change as a modx-core server streams it (store change JSON). */
export interface Change<N extends string = string, R = unknown> {
  seq: number;
  entity: N;
  op: 'put' | 'del';
  id: ID;
  data: R | null;
  client_id?: string;
  ts?: number;
}

/** What an event stream emits: `open` on every (re)connection, committed changes, `reset` when the server lost
 * our position, and any other named event as `event`. Errors when the connection drops. */
export type StreamSignal =
  | { type: 'open' }
  | { type: 'change'; change: Change }
  | { type: 'reset' }
  | { type: 'event'; event: string; data: unknown };

export interface Transport {
  request<T>(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<T>;
  /** Long-lived stream of server-sent events. */
  stream(path: string): Observable<StreamSignal>;
}

export interface HttpTransportOptions {
  baseUrl?: string;
  timeoutMs?: number;
  /** Extra headers for every request (e.g. a client id). */
  headers?: () => Record<string, string>;
  /** Rewrites a path before it is fetched (tenant prefixes and the like). */
  rewrite?: (path: string) => string;
  /** Called on a 401 response. */
  onUnauthorized?: () => void;
  /** Named SSE events to forward as `event` signals (unnamed ones are changes). */
  events?: readonly string[];
  /** fetch implementation (tests, server-side rendering). */
  fetch?: typeof fetch;
}

export function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function createHttpTransport(opts: HttpTransportOptions = {}): Transport {
  const base = opts.baseUrl ?? '';
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const rewrite = opts.rewrite ?? ((p: string) => p);
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  return {
    async request<T>(method: string, path: string, body?: unknown, extra?: Record<string, string>): Promise<T> {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const headers: Record<string, string> = { ...(opts.headers?.() ?? {}), ...(extra ?? {}) };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      let res: Response;
      try {
        res = await doFetch(base + rewrite(path), {
          method, headers, signal: ctrl.signal, credentials: 'same-origin',
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (e) {
        throw new HttpError(0, 'network', e instanceof Error ? e.message : 'Network error');
      } finally {
        clearTimeout(timer);
      }
      const text = await res.text();
      const json = text ? safeParse(text) : null;
      if (!res.ok) {
        const err = (json as { error?: { code?: string; message?: string } } | null)?.error;
        if (res.status === 401) opts.onUnauthorized?.();
        throw new HttpError(res.status, err?.code ?? 'http', err?.message ?? res.statusText);
      }
      return json as T;
    },

    stream(path: string) {
      return new Observable<StreamSignal>((sub) => {
        const es = new EventSource(base + rewrite(path));
        es.onopen = () => sub.next({ type: 'open' });
        const onChange = (ev: Event) => {
          const change = safeParse((ev as MessageEvent<string>).data) as Change | null;
          if (change && typeof change.seq === 'number') sub.next({ type: 'change', change });
        };
        es.onmessage = onChange;
        es.addEventListener('change', onChange);
        es.addEventListener('reset', () => sub.next({ type: 'reset' }));
        for (const name of opts.events ?? []) {
          es.addEventListener(name, (ev) => sub.next({ type: 'event', event: name, data: safeParse((ev as MessageEvent<string>).data) }));
        }
        // EventSource reconnects silently; the sync engine owns the retry policy (catch-up + backoff).
        es.onerror = () => {
          es.close();
          sub.error(new HttpError(0, 'stream', 'Event stream disconnected'));
        };
        return () => es.close();
      });
    },
  };
}
