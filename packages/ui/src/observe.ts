import type { ReactiveController, ReactiveControllerHost } from 'lit';

/** Anything with an RxJS-compatible subscribe — keeps the UI kit free of an rxjs dependency. */
export interface Subscribable<T> {
  subscribe(next: (v: T) => void): { unsubscribe(): void };
}

/**
 * Subscribes while the host is connected and requests an update on every emission.
 * `source` may be swapped at runtime (e.g. when an `issueId` property changes) via `.set(...)`.
 */
export class ObserveController<T> implements ReactiveController {
  value: T;
  private sub?: { unsubscribe(): void };
  private connected = false;

  constructor(private host: ReactiveControllerHost, private source: Subscribable<T> | null, initial: T) {
    this.value = initial;
    host.addController(this);
  }

  set(source: Subscribable<T> | null): void {
    if (source === this.source) return;
    this.source = source;
    if (this.connected) {
      this.sub?.unsubscribe();
      this.subscribe();
    }
  }

  private subscribe() {
    this.sub = this.source?.subscribe((v) => {
      this.value = v;
      this.host.requestUpdate();
    });
  }

  hostConnected(): void {
    this.connected = true;
    this.subscribe();
  }

  hostDisconnected(): void {
    this.connected = false;
    this.sub?.unsubscribe();
    this.sub = undefined;
  }
}
