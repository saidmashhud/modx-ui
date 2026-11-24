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

export abstract class MxElement extends LitElement {
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
export function setKitStrings(patch: Partial<typeof kitStrings>): void {
  Object.assign(kitStrings, patch);
}

export const nextId = (p = 'mx') => `${p}-${++uid}`;
