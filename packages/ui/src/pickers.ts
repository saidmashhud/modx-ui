import { css, html, nothing, type PropertyValues } from 'lit';
import { base, define, directionOf, inlineStep, kitStrings, MxElement, nextId } from './base.js';
import { FormControl, formDataOf } from './form-control.js';
import type { CommandItem, MxCommandList, MxPopover } from './overlay.js';
import './overlay.js';
import './icons.js';

/* Shared field look (label above, bordered control at the token height). */
const fieldCss = css`
  :host { display: inline-block; min-width: 0; vertical-align: middle; }
  :host([block]) { display: block; }
  .field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  label { font-size: var(--mx-text-sm); color: var(--mx-text-muted); font-weight: var(--mx-weight-medium); }
  .trigger {
    all: unset; box-sizing: border-box; display: flex; align-items: center; gap: var(--mx-space-2); width: 100%; min-width: 0;
    height: var(--mx-control-md); padding-block: 0; padding-inline: var(--mx-space-3) var(--mx-space-2); border: 1px solid var(--mx-border-strong);
    border-radius: var(--mx-radius-md); background: var(--mx-surface); color: var(--mx-text); font-size: var(--mx-field-size); cursor: pointer;
    transition: border-color var(--mx-duration-fast) var(--mx-ease-out), box-shadow var(--mx-duration-fast) var(--mx-ease-out);
  }
  :host([size='sm']) .trigger { height: var(--mx-control-sm); font-size: var(--mx-text-sm); padding-inline-start: var(--mx-space-2); }
  :host([size='lg']) .trigger { height: var(--mx-control-lg); }
  .trigger:hover { border-color: var(--mx-text-faint); }
  .trigger:focus-visible, .trigger[aria-expanded='true'] { border-color: var(--mx-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--mx-accent) 25%, transparent); }
  :host([disabled]) .trigger, .trigger:disabled { opacity: 0.5; cursor: default; pointer-events: none; }
  :host([bare]) .trigger { border-color: transparent; background: transparent; }
  :host([bare]) .trigger:hover { background: var(--mx-surface-hover); }
  .val { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ph { color: var(--mx-text-muted); }
  .ic { color: var(--mx-text-muted); flex: none; display: inline-flex; }
  .count { flex: none; font-size: var(--mx-text-xs); color: var(--mx-text-muted); background: var(--mx-surface-active); border-radius: var(--mx-radius-full); padding: 1px 6px; }
`;

/* ───────────── mx-select ───────────── */

export interface SelectOption { value: string; label: string; hint?: string; icon?: string; group?: string; disabled?: boolean }

/**
 * Custom select: a field-styled trigger that opens a listbox (mx-command-list in an mx-popover; bottom sheet on phones).
 * Search appears automatically for long lists (> 7 options) or with `searchable`. Keyboard: ↓/↑/Enter/Space/Alt+↓ open,
 * typing opens and filters, ↑/↓ + Enter choose, Esc closes and returns focus. `multiple` keeps it open and toggles.
 * Emits `mx-change` with the value (single) or the array of values (multiple).
 * Form-associated: submits the value (or each of `values`) under `name`, `required` blocks submission while
 * nothing is picked, a disabled <fieldset> disables it, reset returns to the `value` attribute.
 *
 * @tagname mx-select
 * @fires mx-change - The value changed; detail: the value (single) or the array of values (`multiple`).
 * @csspart trigger - The field-styled button.
 */
export class MxSelect extends MxElement {
  static formAssociated = true;
  static properties = {
    value: { type: String },
    name: { type: String, reflect: true },
    required: { type: Boolean, reflect: true },
    formDisabled: { state: true },
    values: { attribute: false },
    options: { attribute: false },
    multiple: { type: Boolean, reflect: true },
    searchable: { type: Boolean },
    placeholder: { type: String },
    label: { type: String },
    size: { type: String, reflect: true },
    disabled: { type: Boolean, reflect: true },
    icon: { type: String },
    open: { state: true },
  };
  /** The chosen value (single). */
  declare value: string;
  /** The chosen values (`multiple`). */
  declare values: string[];
  /** `{ value, label, hint?, icon?, group?, disabled? }[]`. */
  declare options: SelectOption[];
  /** Pick several; the list stays open. */
  declare multiple: boolean;
  /** Always show the search box (it appears by itself for more than 7 options). */
  declare searchable: boolean;
  /** Shown when nothing is chosen (default `kitStrings.select`). */
  declare placeholder: string;
  /** Visible label above the trigger. */
  declare label: string;
  /** sm, md (default) or lg. */
  declare size: 'sm' | 'md' | 'lg';
  /** Cannot be opened. */
  declare disabled: boolean;
  /** Leading icon in the trigger. */
  declare icon: string;
  declare open: boolean;
  /** Name the value (or each value) is submitted under. */
  declare name: string;
  /** Something must be chosen (form validity). */
  declare required: boolean;
  declare formDisabled: boolean;
  private uid = nextId('sel');
  private fc = new FormControl(this);

  static shadowRootOptions = { ...MxElement.shadowRootOptions, delegatesFocus: true };

  constructor() {
    super();
    this.value = '';
    this.values = [];
    this.options = [];
    this.multiple = false;
    this.searchable = false;
    this.placeholder = '';
    this.label = '';
    this.size = 'md';
    this.disabled = false;
    this.icon = '';
    this.open = false;
    this.name = '';
    this.required = false;
    this.formDisabled = false;
  }

  static styles = [base, fieldCss];

  /* ── form participation ── */
  get form(): HTMLFormElement | null { return this.fc.form; }
  /** Validity state (`valueMissing` while required and empty). */
  get validity(): ValidityState | undefined { return this.fc.validity; }
  /** The message the browser would show (`kitStrings.valueMissing`). */
  get validationMessage(): string { return this.fc.validationMessage; }
  /** True when valid; fires `invalid` otherwise, like native fields. */
  checkValidity(): boolean { return this.fc.checkValidity(); }
  /** As checkValidity(), and shows the browser's message at the field. */
  reportValidity(): boolean { return this.fc.reportValidity(); }
  formResetCallback() { this.value = this.getAttribute('value') ?? ''; this.values = []; }
  formDisabledCallback(disabled: boolean) { this.formDisabled = disabled; }
  formStateRestoreCallback(state: unknown) {
    if (typeof state === 'string') this.value = state;
    else if (typeof FormData !== 'undefined' && state instanceof FormData) this.values = state.getAll(this.name).filter((v): v is string => typeof v === 'string');
  }
  protected updated() {
    const sel = this.selected;
    this.fc.sync({
      value: this.multiple ? formDataOf(this.name, sel) : sel[0] ?? '',
      missing: this.required && !sel.length, message: kitStrings.valueMissing, anchor: this.trigger,
    });
  }
  private get off(): boolean { return this.disabled || this.formDisabled; }

  private get pop(): MxPopover | null { return this.renderRoot.querySelector('mx-popover'); }
  private get list(): MxCommandList | null { return this.renderRoot.querySelector('mx-command-list'); }
  private get trigger(): HTMLElement | null { return this.renderRoot.querySelector('.trigger'); }

  private get selected(): string[] {
    if (this.multiple) return this.values ?? [];
    // '' is a real choice when an option carries it (e.g. "Not linked to a plan"), otherwise it means "nothing picked".
    return this.value != null && (this.value !== '' || this.options.some((o) => o.value === '')) ? [this.value] : [];
  }

  /** Open the list (optionally with a search query). */
  show(query = '') {
    if (this.off || this.open) return;
    this.open = true;
    this.updateComplete.then(() => {
      const list = this.list, pop = this.pop, tr = this.trigger;
      if (!list || !pop || !tr) return;
      list.query = query;
      list.style.minWidth = `${Math.round(tr.getBoundingClientRect().width)}px`;
      pop.show(tr, 'bottom-start');
      const cur = this.selected[0];
      if (cur !== undefined && !query) list.activate(cur);
      requestAnimationFrame(() => list.focusInput());
    });
  }

  /** Close it. */
  hide() { this.pop?.hide(); }

  private onPick(e: CustomEvent<{ value: string; selected: string[] }>) {
    e.stopPropagation();
    if (this.multiple) {
      this.values = e.detail.selected;
      this.emit('mx-change', this.values);
    } else {
      const changed = this.value !== e.detail.value;
      this.value = e.detail.value;
      this.hide();
      if (changed) this.emit('mx-change', this.value);
    }
  }

  private onKey(e: KeyboardEvent) {
    if (this.open) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.show(); return; }
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && /\S/.test(e.key)) { e.preventDefault(); this.show(e.key); }
  }

  private display() {
    const sel = this.selected;
    const opt = (v: string) => this.options.find((o) => o.value === v);
    if (!sel.length) return html`<span class="val ph">${this.placeholder || kitStrings.select}</span>`;
    if (!this.multiple) {
      const o = opt(sel[0]!);
      return html`${o?.icon ? html`<span class="ic"><mx-icon name=${o.icon} size="14"></mx-icon></span>` : nothing}<span class="val">${o?.label ?? sel[0]}</span>`;
    }
    const labels = sel.map((v) => opt(v)?.label ?? v);
    return html`<span class="val">${labels.join(', ')}</span>${sel.length > 1 ? html`<span class="count">${sel.length}</span>` : nothing}`;
  }

  render() {
    const items: CommandItem[] = this.options.map((o) => ({ value: o.value, label: o.label, hint: o.hint, icon: o.icon, group: o.group, disabled: o.disabled }));
    const search = this.searchable || this.options.length > 7;
    return html`<div class="field">
      ${this.label ? html`<label id="${this.uid}-l" @click=${() => this.trigger?.focus()}>${this.label}</label>` : nothing}
      <button class="trigger" part="trigger" type="button" aria-haspopup="listbox" aria-expanded=${this.open ? 'true' : 'false'}
        aria-labelledby=${this.label ? `${this.uid}-l ${this.uid}-v` : nothing} aria-label=${this.label ? nothing : this.placeholder || nothing}
        aria-required=${this.required ? 'true' : nothing}
        ?disabled=${this.off} @click=${() => (this.open ? this.hide() : this.show())} @keydown=${this.onKey}>
        ${this.icon ? html`<span class="ic"><mx-icon name=${this.icon} size="14"></mx-icon></span>` : nothing}
        <span id="${this.uid}-v" class="vwrap" style="display:contents">${this.display()}</span>
        <span class="ic"><mx-icon name="chevron-down" size="14"></mx-icon></span>
      </button>
      <mx-popover @mx-open=${(e: Event) => e.stopPropagation()}
        @mx-close=${(e: Event) => { e.stopPropagation(); this.open = false; this.trigger?.focus(); }}>
        ${this.open ? html`<mx-command-list .items=${items} .selected=${this.selected} ?multiple=${this.multiple} ?nosearch=${!search}
          aria-label=${this.label || this.placeholder || nothing}
          @mx-select=${this.onPick} @mx-dismiss=${(e: Event) => { e.stopPropagation(); this.hide(); }}></mx-command-list>` : nothing}
      </mx-popover>
    </div>`;
  }
}
define('mx-select', MxSelect);

/* ───────────── dates ───────────── */

/** "YYYY-MM-DD" ↔ epoch ms at 00:00 UTC of that calendar day (the API's day convention). */
export const dayToMs = (day: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return m ? Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!) : null;
};
export const msToDay = (ms: number | null | undefined): string => {
  if (ms == null || !Number.isFinite(ms)) return '';
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};
const pad = (n: number) => String(n).padStart(2, '0');
const mkDay = (y: number, m: number, d: number) => { const t = new Date(Date.UTC(y, m, d)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };
const parts = (day: string) => { const [y, m, d] = day.split('-').map(Number) as [number, number, number]; return { y, m: m - 1, d }; };
const addDaysD = (day: string, n: number) => { const p = parts(day); return mkDay(p.y, p.m, p.d + n); };
const addMonthsD = (day: string, n: number) => {
  const p = parts(day);
  const last = new Date(Date.UTC(p.y, p.m + n + 1, 0)).getUTCDate();
  return mkDay(p.y, p.m + n, Math.min(p.d, last));
};
const todayD = () => { const t = new Date(); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; };

type DatePart = 'd' | 'm' | 'y';
const orderCache = new Map<string, { order: DatePart[]; sep: string }>();

/** The order of day, month and year in `locale`'s numeric dates, and the separator between them
 * (en-US → m/d/y, ru-RU and de-DE → d.m.y, ja-JP → y/m/d), read from Intl.DateTimeFormat#formatToParts. */
export function dateOrder(locale: string = kitStrings.locale): { order: DatePart[]; sep: string } {
  let o = orderCache.get(locale);
  if (o) return o;
  let order: DatePart[] = ['d', 'm', 'y'];
  let sep = '.';
  try {
    const ps = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).formatToParts(Date.UTC(2026, 10, 21));
    const got = ps.filter((p) => p.type === 'day' || p.type === 'month' || p.type === 'year').map((p) => p.type[0] as DatePart);
    if (got.length === 3 && new Set(got).size === 3) order = got;
    const lit = ps.find((p, i) => p.type === 'literal' && i > 0 && i < ps.length - 1)?.value.trim();
    if (lit) sep = lit;
  } catch { /* unknown locale: day first */ }
  o = { order, sep };
  orderCache.set(locale, o);
  return o;
}

/** The typed-date hint in the locale's order: "mm/dd/yyyy" (en-US), "dd.mm.yyyy" (ru-RU, de-DE). */
export function dateHint(locale: string = kitStrings.locale): string {
  const { order, sep } = dateOrder(locale);
  return order.map((p) => (p === 'y' ? 'yyyy' : p + p)).join(sep);
}

/** Parse what a person types, in the locale's order (en-US 11/21/2026, ru-RU 21.11.2026, de-DE 21.11.26), with or
 * without the year (this year), plus ISO 2026-11-21 in every locale. */
export function parseTypedDay(s: string, locale: string = kitStrings.locale): string | null {
  const t = s.trim().replace(/[./\s-]+$/, ''); /* "2026. 11. 21." (ko, hu) */
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return valid(+m[1]!, +m[2]!, +m[3]!);
  const nums = t.split(/[./\s-]+/);
  if (nums.length < 2 || nums.length > 3 || !nums.every((n) => /^\d{1,4}$/.test(n))) return null;
  const { order } = dateOrder(locale);
  /* a four-digit first number is a year whatever the locale (2026/11/21) */
  const seq: DatePart[] = nums.length === 3 && nums[0]!.length === 4 ? ['y', 'm', 'd'] : nums.length === 3 ? order : order.filter((p) => p !== 'y');
  const v: Partial<Record<DatePart, string>> = {};
  seq.forEach((p, i) => { v[p] = nums[i]; });
  if (v.d!.length > 2 || v.m!.length > 2) return null;
  let y = new Date().getFullYear();
  if (v.y !== undefined) {
    if (v.y.length === 2) y = 2000 + +v.y;
    else if (v.y.length === 4) y = +v.y;
    else return null;
  }
  return valid(y, +v.m!, +v.d!);
}
function valid(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1) return null;
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return d > last ? null : `${y}-${pad(mo)}-${pad(d)}`;
}


/* ───────────── months ("YYYY-MM", the native month input's value) ───────────── */

const YM = /^(\d{4})-(\d{2})$/;
/** "YYYY-MM" when `s` is one (month 01–12), else null. */
export function parseMonth(s: string | null | undefined): string | null {
  const m = YM.exec((s ?? '').trim());
  return m && +m[2]! >= 1 && +m[2]! <= 12 ? `${m[1]}-${m[2]}` : null;
}
/** The month `n` months after "YYYY-MM". */
export function addMonthsYm(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`;
}
const thisMonth = () => todayD().slice(0, 7);
/** A value given as "YYYY-MM", "YYYY-MM-DD" or epoch ms, as "YYYY-MM" ('' when none). */
const toYm = (v: unknown): string =>
  typeof v === 'number' ? msToDay(v).slice(0, 7) : typeof v === 'string' ? parseMonth(v.slice(0, 7)) ?? '' : '';
/** A value given as epoch ms, "YYYY-MM-DD" or "YYYY-MM" (its first day), as epoch ms. */
const toMs = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string' || !v) return null;
  return dayToMs(v) ?? (parseMonth(v) ? dayToMs(`${v}-01`) : null);
};
/** Attribute ↔ property for values that are epoch ms (day mode) or "YYYY-MM" strings (month mode). */
const msOrMonth = {
  fromAttribute: (v: string | null): number | string | null =>
    v == null || v === '' ? null : /^\d{4}-\d{2}(-\d{2})?$/.test(v) ? v : Number.isFinite(+v) ? +v : null,
  toAttribute: (v: unknown) => (v == null ? null : String(v)),
};

/** "ноябрь 2026", "November 2026", "2026年11月": the month as a heading — the nominative (standalone) name where
 * the language inflects it, without the trailing year word ("г.", "р."). */
export function formatMonth(ym: string, locale: string = kitStrings.locale, month: 'long' | 'short' = 'long'): string {
  const m = parseMonth(ym);
  if (!m) return '';
  const [y, mo] = m.split('-').map(Number) as [number, number];
  const at = Date.UTC(y, mo - 1, 1);
  const ps = new Intl.DateTimeFormat(locale, { month, year: 'numeric', timeZone: 'UTC' }).formatToParts(at);
  const alone = new Intl.DateTimeFormat(locale, { month, timeZone: 'UTC' }).format(at);
  const yi = ps.findIndex((p) => p.type === 'year');
  return ps
    .filter((p, i) => !(i === ps.length - 1 && i === yi + 1 && p.type === 'literal' && /^\s+\p{L}{1,3}\.?$/u.test(p.value)))
    .map((p) => (p.type === 'month' && /\p{L}/u.test(p.value) && !/\d/.test(alone) ? alone : p.value))
    .join('');
}
/** Short standalone month name for the month grid ("нояб", "Nov", "11月"). */
export function shortMonth(mo: number, locale: string = kitStrings.locale): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(Date.UTC(2026, mo - 1, 1)).replace(/\.$/, '');
}

/** Where a key moves the focus in a month grid of `cols` columns (4 × 3, or 3 × 4 on phones); null: not a move.
 * In a right-to-left grid (`dir`) ← and → are mirrored: → goes to the previous month. */
export function monthKeyMove(ym: string, key: string, cols: number, dir: 'ltr' | 'rtl' = 'ltr'): string | null {
  const i = +ym.slice(5, 7) - 1;
  switch (key) {
    case 'ArrowLeft': case 'ArrowRight': return addMonthsYm(ym, inlineStep(key, dir));
    case 'ArrowUp': return addMonthsYm(ym, -cols);
    case 'ArrowDown': return addMonthsYm(ym, cols);
    case 'PageUp': return addMonthsYm(ym, -12);
    case 'PageDown': return addMonthsYm(ym, 12);
    case 'Home': return addMonthsYm(ym, -(i % cols));
    case 'End': return addMonthsYm(ym, Math.min(cols - 1 - (i % cols), 11 - i));
    default: return null;
  }
}

/** "YYYY-MM" outside [min, max] (each "YYYY-MM", or a day / epoch ms whose month counts). */
export function monthDisabled(ym: string, min: unknown, max: unknown): boolean {
  const lo = toYm(min), hi = toYm(max);
  return (!!lo && ym < lo) || (!!hi && ym > hi);
}

export interface DateChange { value: number | null; day: string }
/** `mode="month"`: the picked month, "YYYY-MM" ('' when cleared). */
export interface MonthChange { value: string; month: string }
export interface DateRangeChange { start: number | null; end: number | null; startDay: string; endDay: string }

/**
 * Date picker: field-styled trigger + calendar popover (bottom sheet on phones), localized via kitStrings.locale/weekStart.
 * Values are epoch ms at 00:00 UTC of the day (API convention); `.day` / `detail.day` give "YYYY-MM-DD" for local-day data.
 * `range`: pick start then end (`.start` / `.end`), emits `{start, end, startDay, endDay}`.
 * Keyboard in the grid: arrows ±1 day / ±1 week, PageUp/PageDown ±1 month (+Shift: year), Home/End week, Enter picks, Esc closes.
 * `mode="month"`: a month picker instead (the native month input's job): `value` is "YYYY-MM" ('' / null: none),
 * `min` / `max` too; the trigger reads "ноябрь 2026" / "November 2026"; the popover shows the year with
 * previous / next year buttons over a 4 × 3 grid of months (3 × 4 on phones). Keys: arrows ±1 month / ±1 row,
 * PageUp / PageDown ±1 year, Home / End row start / end, Enter picks, Esc closes. Emits `{ value, month }`
 * ("YYYY-MM" both). No range in month mode.
 * Form-associated: submits "YYYY-MM-DD" (month mode: "YYYY-MM") under `name` (a range: start and end, both under `name`), `required`
 * blocks submission while empty (a range: until both ends are set), reset returns to the `value` / `start` / `end`
 * attributes, a disabled <fieldset> disables it.
 * A text box on top accepts typed dates in the locale's order (the one the box shows: mm/dd/yyyy for en-US,
 * dd.mm.yyyy for ru-RU) and ISO yyyy-mm-dd; its hint is `kitStrings.dateFormatHint`, or derived from the locale when empty.
 *
 * @tagname mx-date-picker
 * @fires mx-change - Day: `{ value, day }`; range: `{ start, end, startDay, endDay }`; month: `{ value, month }`.
 * @csspart trigger - The field-styled button.
 */
export class MxDatePicker extends MxElement {
  static formAssociated = true;
  static properties = {
    value: { converter: msOrMonth },
    mode: { type: String, reflect: true },
    name: { type: String, reflect: true },
    required: { type: Boolean, reflect: true },
    formDisabled: { state: true },
    focusMonth: { state: true },
    start: { type: Number },
    end: { type: Number },
    range: { type: Boolean, reflect: true },
    label: { type: String },
    placeholder: { type: String },
    size: { type: String, reflect: true },
    disabled: { type: Boolean, reflect: true },
    clearable: { type: Boolean },
    min: { converter: msOrMonth },
    max: { converter: msOrMonth },
    open: { state: true },
    focusDay: { state: true },
    pending: { state: true },
    hoverDay: { state: true },
  };
  /** Epoch ms of the day (00:00 UTC); in month mode "YYYY-MM". */
  declare value: number | string | null;
  /** `day` (default) or `month`. */
  declare mode: 'day' | 'month';
  declare focusMonth: string;
  /** Range start (epoch ms, 00:00 UTC). */
  declare start: number | null;
  /** Range end (epoch ms, 00:00 UTC). */
  declare end: number | null;
  /** Pick a start and an end. */
  declare range: boolean;
  /** Visible label above the trigger. */
  declare label: string;
  /** Shown when empty (default `kitStrings.pickDate` / `pickMonth`). */
  declare placeholder: string;
  /** sm, md (default) or lg. */
  declare size: 'sm' | 'md' | 'lg';
  /** Cannot be opened. */
  declare disabled: boolean;
  /** Offer "Clear" in the footer (default true). */
  declare clearable: boolean;
  /** Earliest day (epoch ms or "YYYY-MM-DD"; month mode "YYYY-MM"). */
  declare min: number | string | null;
  /** Latest day (as `min`). */
  declare max: number | string | null;
  declare open: boolean;
  declare focusDay: string;
  declare pending: string | null;
  declare hoverDay: string | null;
  /** Name the value is submitted under ("YYYY-MM-DD", "YYYY-MM"; a range submits both ends). */
  declare name: string;
  /** Must have a value (a range: both ends). */
  declare required: boolean;
  declare formDisabled: boolean;
  private uid = nextId('dp');
  private fc = new FormControl(this);

  static shadowRootOptions = { ...MxElement.shadowRootOptions, delegatesFocus: true };

  constructor() {
    super();
    this.value = null;
    this.start = null;
    this.end = null;
    this.range = false;
    this.label = '';
    this.placeholder = '';
    this.size = 'md';
    this.disabled = false;
    this.clearable = true;
    this.min = null;
    this.max = null;
    this.open = false;
    this.focusDay = todayD();
    this.pending = null;
    this.hoverDay = null;
    this.name = '';
    this.required = false;
    this.formDisabled = false;
    this.mode = 'day';
    this.focusMonth = thisMonth();
  }

  private get isMonth(): boolean { return this.mode === 'month'; }
  /** The day value as epoch ms (whatever form `value` was given in). */
  private get ms(): number | null { return toMs(this.value); }
  /** The month value, "YYYY-MM" or ''. */
  private get ym(): string { return toYm(this.value); }

  /* ── form participation ── */
  get form(): HTMLFormElement | null { return this.fc.form; }
  /** Validity state (`valueMissing` while required and empty). */
  get validity(): ValidityState | undefined { return this.fc.validity; }
  /** The message the browser would show (`kitStrings.valueMissing`). */
  get validationMessage(): string { return this.fc.validationMessage; }
  /** True when valid; fires `invalid` otherwise, like native fields. */
  checkValidity(): boolean { return this.fc.checkValidity(); }
  /** As checkValidity(), and shows the browser's message at the field. */
  reportValidity(): boolean { return this.fc.reportValidity(); }
  formResetCallback() {
    const attr = (a: string) => msOrMonth.fromAttribute(this.getAttribute(a));
    this.value = attr('value');
    this.start = toMs(attr('start'));
    this.end = toMs(attr('end'));
  }
  formDisabledCallback(disabled: boolean) { this.formDisabled = disabled; }
  formStateRestoreCallback(state: unknown) {
    if (typeof state === 'string') this.value = !state ? null : this.isMonth ? parseMonth(state) : dayToMs(state);
    else if (typeof FormData !== 'undefined' && state instanceof FormData) {
      const [s, e] = state.getAll(this.name).map((v) => (typeof v === 'string' && v ? dayToMs(v) : null));
      this.start = s ?? null;
      this.end = e ?? null;
    }
  }
  protected updated() {
    const range = this.range && !this.isMonth;
    const missing = this.required && (range ? this.start == null || this.end == null : this.isMonth ? !this.ym : this.ms == null);
    this.fc.sync({
      value: range ? formDataOf(this.name, [msToDay(this.start), msToDay(this.end)]) : this.isMonth ? this.ym : msToDay(this.ms),
      missing, message: kitStrings.valueMissing, anchor: this.trigger,
    });
  }
  private get off(): boolean { return this.disabled || this.formDisabled; }

  /** Convenience for local-day data ("YYYY-MM-DD"). */
  get day(): string { return msToDay(this.ms); }
  set day(d: string) { this.value = d ? dayToMs(d) : null; }

  static styles = [base, fieldCss, css`
    .cal { padding: var(--mx-space-3); display: grid; gap: var(--mx-space-2); width: 280px; max-width: 100%; box-sizing: border-box; }
    /* phones: the popover is a bottom sheet — use its width (capped) */
    @media (max-width: 640px) { .cal { width: min(100%, 420px); margin: 0 auto; } .d { height: var(--mx-control-md); } }
    .top { display: flex; align-items: center; gap: var(--mx-space-1); }
    .top b { flex: 1; text-align: center; font-weight: var(--mx-weight-medium); font-size: var(--mx-text-md); text-transform: capitalize; }
    .nav { all: unset; display: grid; place-items: center; width: var(--mx-control-sm); height: var(--mx-control-sm); border-radius: var(--mx-radius-md); color: var(--mx-text-muted); cursor: pointer; }
    .nav:hover { background: var(--mx-surface-hover); color: var(--mx-text); }
    .typed { box-sizing: border-box; width: 100%; height: var(--mx-control-md); padding: 0 var(--mx-space-2); border: 1px solid var(--mx-border-strong);
      border-radius: var(--mx-radius-md); background: var(--mx-surface); color: var(--mx-text); font: inherit; font-size: var(--mx-field-size); }
    .typed:focus { outline: none; border-color: var(--mx-accent); }
    .typed[aria-invalid='true'] { border-color: var(--mx-danger); }
    table { border-collapse: collapse; width: 100%; table-layout: fixed; }
    th { font: var(--mx-weight-semibold) var(--mx-text-xs)/1 var(--mx-font-sans); letter-spacing: var(--mx-tracking-eyebrow); color: var(--mx-text-muted); text-transform: uppercase; padding: 4px 0; }
    td { padding: 1px; text-align: center; }
    .d { all: unset; box-sizing: border-box; width: 100%; height: var(--mx-control-sm); display: grid; place-items: center; border-radius: var(--mx-radius-md);
      font-size: var(--mx-text-md); font-variant-numeric: tabular-nums; color: var(--mx-text-secondary); cursor: pointer; }
    .d:hover { background: var(--mx-surface-hover); color: var(--mx-text); }
    .d.out { color: var(--mx-text-muted); }
    .d.today { box-shadow: inset 0 0 0 1px var(--mx-border-strong); }
    .d.in { background: color-mix(in srgb, var(--mx-accent) 16%, transparent); color: var(--mx-text); border-radius: 0; }
    .d[aria-selected='true'] { background: var(--mx-accent); color: var(--mx-on-accent); }
    .d[aria-disabled='true'] { opacity: 0.35; cursor: default; pointer-events: none; }
    .d:focus-visible { box-shadow: var(--mx-focus-ring); }
    .foot { display: flex; justify-content: space-between; }
    .months { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px; }
    .months .row { display: contents; }
    @media (max-width: 640px) { .months { grid-template-columns: repeat(3, 1fr); } }
    .mo { all: unset; box-sizing: border-box; height: var(--mx-control-md); display: grid; place-items: center; border-radius: var(--mx-radius-md);
      font-size: var(--mx-text-md); color: var(--mx-text-secondary); cursor: pointer; text-transform: capitalize; }
    .mo:hover { background: var(--mx-surface-hover); color: var(--mx-text); }
    .mo.today { box-shadow: inset 0 0 0 1px var(--mx-border-strong); }
    .mo[aria-selected='true'] { background: var(--mx-accent); color: var(--mx-on-accent); }
    .mo[aria-disabled='true'] { opacity: 0.35; cursor: default; pointer-events: none; }
    .mo:focus-visible { box-shadow: var(--mx-focus-ring); }
    .link { all: unset; cursor: pointer; font-size: var(--mx-text-sm); color: var(--mx-accent-text); padding: 4px 6px; border-radius: var(--mx-radius-sm); }
    .link:hover { background: var(--mx-surface-hover); }
    .link:focus-visible { box-shadow: var(--mx-focus-ring); }
  `];

  private get pop(): MxPopover | null { return this.renderRoot.querySelector('mx-popover'); }
  private get trigger(): HTMLElement | null { return this.renderRoot.querySelector('.trigger'); }

  private fmt(day: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
    const ms = dayToMs(day);
    return ms == null ? '' : new Intl.DateTimeFormat(kitStrings.locale, { ...opts, timeZone: 'UTC' }).format(ms);
  }

  private disabledDay(day: string): boolean {
    const ms = dayToMs(day)!;
    const lo = toMs(this.min), hi = toMs(this.max);
    return (lo != null && ms < lo) || (hi != null && ms > hi);
  }

  /** Open the calendar. */
  show() {
    if (this.off || this.open) return;
    if (this.isMonth) this.focusMonth = this.ym || thisMonth();
    const cur = this.range ? msToDay(this.start) : msToDay(this.ms);
    this.focusDay = cur || todayD();
    this.pending = null;
    this.open = true;
    this.updateComplete.then(() => {
      const tr = this.trigger;
      if (!tr) return;
      this.pop?.show(tr, 'bottom-start');
      requestAnimationFrame(() => this.focusGrid());
    });
  }

  /** Close it. */
  hide() { this.pop?.hide(); }

  private focusGrid() {
    const sel = this.isMonth ? `.mo[data-month="${this.focusMonth}"]` : `.d[data-day="${this.focusDay}"]`;
    (this.renderRoot.querySelector(sel) as HTMLElement | null)?.focus();
  }

  private commitMonth(ym: string) {
    if (ym && monthDisabled(ym, this.min, this.max)) return;
    this.value = ym || null;
    this.emit<MonthChange>('mx-change', { value: ym, month: ym });
    this.hide();
  }

  private onMonthKey(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.commitMonth(this.focusMonth); return; }
    const narrow = typeof matchMedia === 'function' && matchMedia('(max-width: 640px)').matches;
    const next = monthKeyMove(this.focusMonth, e.key, narrow ? 3 : 4, directionOf(this));
    if (!next) return;
    e.preventDefault();
    this.focusMonth = next;
    this.updateComplete.then(() => this.focusGrid());
  }

  private monthGrid() {
    const y = this.focusMonth.slice(0, 4);
    const cur = this.ym, now = thisMonth();
    /* rows as laid out: 4 × 3, or 3 × 4 on phones (the rows are display: contents; the CSS grid places the cells) */
    const cols = typeof matchMedia === 'function' && matchMedia('(max-width: 640px)').matches ? 3 : 4;
    const cell = (i: number) => {
      const ym = `${y}-${pad(i + 1)}`;
      const off = monthDisabled(ym, this.min, this.max);
      /* the name is the visible short month plus the year ("Jun 2026"), so it contains what is shown */
      return html`<button type="button" role="gridcell" class="mo ${ym === now ? 'today' : ''}" data-month=${ym}
        tabindex=${ym === this.focusMonth ? 0 : -1} aria-selected=${ym === cur ? 'true' : 'false'} aria-disabled=${off ? 'true' : 'false'}
        title=${formatMonth(ym)} @click=${() => this.commitMonth(ym)}>${shortMonth(i + 1)}<span class="sr-only"> ${y}</span></button>`;
    };
    return html`<div class="months" role="grid" aria-labelledby="${this.uid}-m" @keydown=${this.onMonthKey}>
      ${Array.from({ length: 12 / cols }, (_, r) => html`<div role="row" class="row">${Array.from({ length: cols }, (_, c) => cell(r * cols + c))}</div>`)}
    </div>`;
  }

  private commitSingle(day: string) {
    const value = day ? dayToMs(day) : null;
    this.value = value;
    this.emit<DateChange>('mx-change', { value, day });
    this.hide();
  }

  private commitRange(a: string, b: string) {
    const [s, e] = a <= b ? [a, b] : [b, a];
    this.start = s ? dayToMs(s) : null;
    this.end = e ? dayToMs(e) : null;
    this.emit<DateRangeChange>('mx-change', { start: this.start, end: this.end, startDay: s, endDay: e });
    this.hide();
  }

  private pick(day: string) {
    if (this.disabledDay(day)) return;
    if (!this.range) return this.commitSingle(day);
    if (!this.pending) { this.pending = day; this.focusDay = day; return; }
    const a = this.pending;
    this.pending = null;
    this.commitRange(a, day);
  }

  private onGridKey(e: KeyboardEvent) {
    const wd = new Date(dayToMs(this.focusDay)!).getUTCDay();
    const ws = kitStrings.weekStart;
    let next: string | null = null;
    switch (e.key) {
      /* ← / → follow the grid: mirrored in a right-to-left context */
      case 'ArrowLeft': case 'ArrowRight': next = addDaysD(this.focusDay, inlineStep(e.key, directionOf(this))); break;
      case 'ArrowUp': next = addDaysD(this.focusDay, -7); break;
      case 'ArrowDown': next = addDaysD(this.focusDay, 7); break;
      case 'PageUp': next = addMonthsD(this.focusDay, e.shiftKey ? -12 : -1); break;
      case 'PageDown': next = addMonthsD(this.focusDay, e.shiftKey ? 12 : 1); break;
      case 'Home': next = addDaysD(this.focusDay, -((wd - ws + 7) % 7)); break;
      case 'End': next = addDaysD(this.focusDay, 6 - ((wd - ws + 7) % 7)); break;
      case 'Enter': case ' ': e.preventDefault(); this.pick(this.focusDay); return;
      default: return;
    }
    e.preventDefault();
    this.focusDay = next;
    if (this.range && this.pending) this.hoverDay = next;
    this.updateComplete.then(() => this.focusGrid());
  }

  private onTyped(e: Event) {
    const input = e.target as HTMLInputElement;
    const d = parseTypedDay(input.value);
    input.setAttribute('aria-invalid', input.value && !d ? 'true' : 'false');
    if (d) { this.focusDay = d; }
  }

  private onTypedKey(e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const d = parseTypedDay((e.target as HTMLInputElement).value);
    if (d) this.pick(d);
  }

  protected willUpdate(changed: PropertyValues<this>) {
    if (changed.has('open') && !this.open) this.hoverDay = null;
  }

  private grid() {
    const f = parts(this.focusDay);
    const first = mkDay(f.y, f.m, 1);
    const firstWd = new Date(dayToMs(first)!).getUTCDay();
    const lead = (firstWd - kitStrings.weekStart + 7) % 7;
    const startDay = addDaysD(first, -lead);
    const sel = this.range ? [msToDay(this.start), msToDay(this.end)] : [msToDay(this.ms)];
    let lo = '', hi = '';
    if (this.range) {
      if (this.pending) { const h = this.hoverDay ?? this.pending; [lo, hi] = this.pending <= h ? [this.pending, h] : [h, this.pending]; }
      else { lo = sel[0] ?? ''; hi = sel[1] ?? ''; }
    }
    const today = todayD();
    const wdFmt = new Intl.DateTimeFormat(kitStrings.locale, { weekday: 'short', timeZone: 'UTC' });
    const heads = Array.from({ length: 7 }, (_, i) => wdFmt.format(dayToMs(addDaysD(startDay, i))!));
    const rows = Array.from({ length: 6 }, (_, r) => Array.from({ length: 7 }, (_, c) => addDaysD(startDay, r * 7 + c)));
    return html`<table role="grid" aria-labelledby="${this.uid}-m" @keydown=${this.onGridKey}>
      <thead><tr>${heads.map((h) => html`<th scope="col" abbr=${h}>${h.replace('.', '')}</th>`)}</tr></thead>
      <tbody>${rows.map((row) => html`<tr>${row.map((d) => {
        const on = this.range ? (this.pending ? d === this.pending : d === lo || d === hi) : sel.includes(d);
        const inRange = this.range && lo && hi && d > lo && d < hi;
        /* the button is the grid cell (focus, selection); the <td> is only layout */
        return html`<td role="presentation"><button type="button" role="gridcell" class="d ${parts(d).m !== f.m ? 'out' : ''} ${d === today ? 'today' : ''} ${inRange ? 'in' : ''}"
          data-day=${d} tabindex=${d === this.focusDay ? 0 : -1} aria-selected=${on ? 'true' : 'false'} aria-disabled=${this.disabledDay(d) ? 'true' : 'false'}
          aria-label=${this.fmt(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          @click=${() => this.pick(d)} @mouseenter=${() => { if (this.pending) this.hoverDay = d; }}>${parts(d).d}</button></td>`;
      })}</tr>`)}</tbody></table>`;
  }

  private display() {
    if (this.range) {
      const s = msToDay(this.start), e = msToDay(this.end);
      if (!s && !e) return html`<span class="val ph">${this.placeholder || kitStrings.pickDate}</span>`;
      return html`<span class="val">${this.fmt(s)} – ${this.fmt(e)}</span>`;
    }
    if (this.isMonth) {
      const m = this.ym;
      return m ? html`<span class="val">${formatMonth(m)}</span>` : html`<span class="val ph">${this.placeholder || kitStrings.pickMonth}</span>`;
    }
    const d = msToDay(this.ms);
    return d ? html`<span class="val">${this.fmt(d)}</span>` : html`<span class="val ph">${this.placeholder || kitStrings.pickDate}</span>`;
  }

  render() {
    const f = parts(this.focusDay);
    const monthLabel = new Intl.DateTimeFormat(kitStrings.locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(f.y, f.m, 1));
    const has = this.isMonth ? !!this.ym : this.range ? this.start != null : this.ms != null;
    const pickLabel = this.isMonth ? kitStrings.pickMonth : kitStrings.pickDate;
    const hint = kitStrings.dateFormatHint || dateHint(kitStrings.locale);
    return html`<div class="field">
      ${this.label ? html`<label id="${this.uid}-l" @click=${() => this.trigger?.focus()}>${this.label}</label>` : nothing}
      <button class="trigger" part="trigger" type="button" aria-haspopup="dialog" aria-expanded=${this.open ? 'true' : 'false'}
        aria-labelledby=${this.label ? `${this.uid}-l ${this.uid}-v` : nothing} aria-label=${this.label ? nothing : this.placeholder || pickLabel}
        aria-controls=${this.open ? `${this.uid}-cal` : nothing}
        aria-required=${this.required ? 'true' : nothing} ?disabled=${this.off} @click=${() => (this.open ? this.hide() : this.show())}
        @keydown=${(e: KeyboardEvent) => { if (!this.open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.show(); } }}>
        <span class="ic"><mx-icon name="calendar" size="14"></mx-icon></span>
        <span id="${this.uid}-v" style="display:contents">${this.display()}</span>
      </button>
      <mx-popover @mx-open=${(e: Event) => e.stopPropagation()}
        @mx-close=${(e: Event) => { e.stopPropagation(); this.open = false; this.trigger?.focus(); }}>
        ${this.open && this.isMonth ? html`<div class="cal" id="${this.uid}-cal" role="dialog" aria-modal="false" aria-label=${this.label || pickLabel}
            @keydown=${(e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.hide(); } }}>
          <div class="top">
            <button class="nav" type="button" aria-label=${kitStrings.prevYear} @click=${() => { this.focusMonth = addMonthsYm(this.focusMonth, -12); }}><mx-icon name="chevron-left" size="14"></mx-icon></button>
            <b id="${this.uid}-m" aria-live="polite">${this.focusMonth.slice(0, 4)}</b>
            <button class="nav" type="button" aria-label=${kitStrings.nextYear} @click=${() => { this.focusMonth = addMonthsYm(this.focusMonth, 12); }}><mx-icon name="chevron-right" size="14"></mx-icon></button>
          </div>
          ${this.monthGrid()}
          <div class="foot">
            <button class="link" type="button" @click=${() => { const t = thisMonth(); this.focusMonth = t; this.commitMonth(t); }}>${kitStrings.thisMonth}</button>
            ${this.clearable && has ? html`<button class="link" type="button" @click=${() => this.commitMonth('')}>${kitStrings.clear}</button>` : nothing}
          </div>
        </div>` : this.open ? html`<div class="cal" id="${this.uid}-cal" role="dialog" aria-modal="false" aria-label=${this.label || pickLabel}
            @keydown=${(e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.hide(); } }}>
          <input class="typed" aria-label=${hint} placeholder=${hint}
            .value=${this.range ? '' : this.ms != null ? this.fmt(msToDay(this.ms), { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}
            @input=${this.onTyped} @keydown=${this.onTypedKey} />
          <div class="top">
            <button class="nav" type="button" aria-label=${kitStrings.prevMonth} @click=${() => { this.focusDay = addMonthsD(this.focusDay, -1); }}><mx-icon name="chevron-left" size="14"></mx-icon></button>
            <b id="${this.uid}-m" aria-live="polite">${monthLabel}</b>
            <button class="nav" type="button" aria-label=${kitStrings.nextMonth} @click=${() => { this.focusDay = addMonthsD(this.focusDay, 1); }}><mx-icon name="chevron-right" size="14"></mx-icon></button>
          </div>
          ${this.grid()}
          <div class="foot">
            <button class="link" type="button" @click=${() => { const t = todayD(); this.focusDay = t; this.pick(t); }}>${kitStrings.today}</button>
            ${this.clearable && has ? html`<button class="link" type="button" @click=${() => (this.range ? this.commitRange('', '') : this.commitSingle(''))}>${kitStrings.clear}</button>` : nothing}
          </div>
        </div>` : nothing}
      </mx-popover>
    </div>`;
  }
}
define('mx-date-picker', MxDatePicker);

declare global {
  interface HTMLElementTagNameMap { 'mx-select': MxSelect; 'mx-date-picker': MxDatePicker }
}
