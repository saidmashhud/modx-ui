import { css, LitElement } from 'lit';

/** Shared reset + helpers for every mx-* shadow root. */
export const base = css`
  :host {
    box-sizing: border-box;
    font-family: var(--mx-font-sans);
    -webkit-font-smoothing: antialiased;
  }
  *, *::before, *::after { box-sizing: inherit; }
  [hidden] { display: none !important; }
  button { font: inherit; color: inherit; }
  :focus-visible { outline: none; box-shadow: var(--mx-focus-ring); }
  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
  }
`;

/**
 * The site's reveal, for an app: content arrives with a short rise and fade (`--mx-duration-enter`, ease-out; still
 * for reduced motion). Add to a view's styles and put `animation: mx-enter var(--mx-duration-enter) var(--mx-ease-out) both`
 * on what should arrive; stagger with `animation-delay`.
 */
export const enter = css`
  @keyframes mx-enter { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
`;

/**
 * A loading ring on `.spinner`: turns, or for reduced motion stays still and only breathes (opacity), so the
 * "working" cue survives without movement.
 */
export const spinner = css`
  .spinner { border-radius: 50%; border: 1.5px solid currentColor; border-right-color: transparent; animation: mx-spin 700ms linear infinite; }
  @keyframes mx-spin { to { transform: rotate(360deg); } }
  @keyframes mx-breathe { 50% { opacity: 0.35; } }
  @media (prefers-reduced-motion: reduce) { .spinner { animation: mx-breathe 1.6s ease-in-out infinite; } }
`;

/** Every mounted mx-* element: `setKitStrings()` re-renders them (strings and locale are read at render time). */
const mounted = new Set<MxElement>();

export abstract class MxElement extends LitElement {
  connectedCallback(): void {
    super.connectedCallback();
    mounted.add(this);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    mounted.delete(this);
  }

  /** Called after `setKitStrings()`; re-renders by default. Override to refresh state derived from the strings. */
  kitStringsChanged(): void {
    this.requestUpdate();
  }

  /** Dispatch a composed, bubbling CustomEvent. */
  protected emit<T>(name: string, detail?: T, opts: { cancelable?: boolean } = {}): boolean {
    return this.dispatchEvent(new CustomEvent<T>(name, { detail, bubbles: true, composed: true, cancelable: opts.cancelable }));
  }
}

export function define(tag: string, ctor: CustomElementConstructor): void {
  if (!customElements.get(tag)) customElements.define(tag, ctor);
}

let uid = 0;
/** Built-in UI strings. Apps override them once at startup (i18n) — the kit stays dependency-free. */
export const kitStrings = {
  search: 'Search…', noResults: 'No results', close: 'Close', dismiss: 'Dismiss', remove: 'Remove',
  loading: 'Loading', unassigned: 'Unassigned', mention: 'Mention',
  /** Accessible name of mx-breadcrumbs' <nav>. */
  breadcrumb: 'Breadcrumb',
  /** BCP-47 locale for dates (mx-date-picker) and first day of week (0 = Sunday, 1 = Monday). */
  locale: 'en-US', weekStart: 0 as number,
  /** Validation message of a `required` control left empty (form-associated mx-input / mx-select / mx-date-picker / mx-switch). */
  valueMissing: 'Please fill out this field.',
  select: 'Select…', pickDate: 'Pick a date', today: 'Today', clear: 'Clear', prevMonth: 'Previous month', nextMonth: 'Next month',
  /** mx-date-picker mode="month". */
  pickMonth: 'Pick a month', thisMonth: 'This month', prevYear: 'Previous year', nextYear: 'Next year',
  /** Hint in the date picker's text box. Empty (default): derived from `locale` in the order dates are typed and
   * shown ("mm/dd/yyyy" for en-US, "dd.mm.yyyy" for ru-RU). Set it only to translate the letters, keeping that order. */
  dateFormatHint: '',
};
export type KitStrings = typeof kitStrings;
const kitListeners = new Set<(s: KitStrings) => void>();

/**
 * Override kit strings (and `locale` / `weekStart`). Safe at any time: every mounted mx-* element re-renders with the
 * new strings, and `onKitStrings` listeners are called.
 */
export function setKitStrings(patch: Partial<KitStrings>): void {
  Object.assign(kitStrings, patch);
  for (const el of [...mounted]) el.kitStringsChanged();
  for (const fn of [...kitListeners]) fn(kitStrings);
}

/** Be told when `setKitStrings()` runs (for app code that renders kit strings itself). Returns the unsubscribe. */
export function onKitStrings(fn: (s: KitStrings) => void): () => void {
  kitListeners.add(fn);
  return () => { kitListeners.delete(fn); };
}

/**
 * The writing direction that applies to `el`: its computed `direction` (set by the nearest `dir` attribute, across
 * shadow roots, or by CSS). Keyboard handling mirrors left / right with it; CSS uses logical properties and `:dir()`.
 */
export function directionOf(el: Element | null | undefined): 'ltr' | 'rtl' {
  if (!el) return 'ltr';
  try {
    const d = getComputedStyle(el).direction;
    if (d === 'rtl' || d === 'ltr') return d;
  } catch { /* no layout (DOM shims) */ }
  const host = el.closest('[dir]');
  return host?.getAttribute('dir')?.toLowerCase() === 'rtl' ? 'rtl' : 'ltr';
}

/** ArrowLeft / ArrowRight as "previous" / "next" in the inline direction: -1, 1, or 0 for other keys. */
export function inlineStep(key: string, dir: 'ltr' | 'rtl'): -1 | 0 | 1 {
  const d = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0;
  return (dir === 'rtl' ? -d : d) as -1 | 0 | 1;
}

export const nextId = (p = 'mx') => `${p}-${++uid}`;
