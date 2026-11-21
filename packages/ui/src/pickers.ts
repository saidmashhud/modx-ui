import { css, html, nothing, type PropertyValues } from 'lit';
import { base, define, kitStrings, MxElement, nextId } from './base.js';
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
    height: var(--mx-control-md); padding: 0 var(--mx-space-2) 0 var(--mx-space-3); border: 1px solid var(--mx-border-strong);
    border-radius: var(--mx-radius-md); background: var(--mx-surface); color: var(--mx-text); font-size: var(--mx-field-size); cursor: pointer;
    transition: border-color var(--mx-duration-fast) var(--mx-ease-out), box-shadow var(--mx-duration-fast) var(--mx-ease-out);
  }
  :host([size='sm']) .trigger { height: var(--mx-control-sm); font-size: var(--mx-text-sm); padding-inline-start: var(--mx-space-2); }
  :host([size='lg']) .trigger { height: var(--mx-control-lg); }
  .trigger:hover { border-color: var(--mx-text-faint); }
  .trigger:focus-visible, .trigger[aria-expanded='true'] { border-color: var(--mx-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--mx-accent) 25%, transparent); }
  :host([disabled]) .trigger { opacity: 0.5; cursor: default; pointer-events: none; }
  :host([bare]) .trigger { border-color: transparent; background: transparent; }
  :host([bare]) .trigger:hover { background: var(--mx-surface-hover); }
  .val { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ph { color: var(--mx-text-faint); }
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
 */
export class MxSelect extends MxElement {
  static properties = {
    value: { type: String },
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
  declare value: string;
  declare values: string[];
  declare options: SelectOption[];
  declare multiple: boolean;
  declare searchable: boolean;
  declare placeholder: string;
  declare label: string;
  declare size: 'sm' | 'md' | 'lg';
  declare disabled: boolean;
  declare icon: string;
  declare open: boolean;
  private uid = nextId('sel');

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
  }

  static styles = [base, fieldCss];

  private get pop(): MxPopover | null { return this.renderRoot.querySelector('mx-popover'); }
  private get list(): MxCommandList | null { return this.renderRoot.querySelector('mx-command-list'); }
  private get trigger(): HTMLElement | null { return this.renderRoot.querySelector('.trigger'); }

  private get selected(): string[] {
    if (this.multiple) return this.values ?? [];
    // '' is a real choice when an option carries it (e.g. "Not linked to a plan"), otherwise it means "nothing picked".
    return this.value != null && (this.value !== '' || this.options.some((o) => o.value === '')) ? [this.value] : [];
  }

  show(query = '') {
    if (this.disabled || this.open) return;
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
        ?disabled=${this.disabled} @click=${() => (this.open ? this.hide() : this.show())} @keydown=${this.onKey}>
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

/** Parse what a person types: 21.11.2026, 21/11/26, 2026-11-21, 21.11 (this year). */
export function parseTypedDay(s: string): string | null {
  const t = s.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return valid(+m[1]!, +m[2]!, +m[3]!);
  m = /^(\d{1,2})[./\s-](\d{1,2})(?:[./\s-](\d{2}|\d{4}))?$/.exec(t);
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : new Date().getFullYear();
    return valid(y, +m[2]!, +m[1]!);
  }
  return null;
}
function valid(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1) return null;
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return d > last ? null : `${y}-${pad(mo)}-${pad(d)}`;
}

export interface DateChange { value: number | null; day: string }
export interface DateRangeChange { start: number | null; end: number | null; startDay: string; endDay: string }

/**
 * Date picker: field-styled trigger + calendar popover (bottom sheet on phones), localized via kitStrings.locale/weekStart.
 * Values are epoch ms at 00:00 UTC of the day (API convention); `.day` / `detail.day` give "YYYY-MM-DD" for local-day data.
 * `range`: pick start then end (`.start` / `.end`), emits `{start, end, startDay, endDay}`.
 * Keyboard in the grid: arrows ±1 day / ±1 week, PageUp/PageDown ±1 month (+Shift: year), Home/End week, Enter picks, Esc closes.
 * A text box on top accepts typed dates (dd.mm.yyyy, yyyy-mm-dd).
 */
export class MxDatePicker extends MxElement {
  static properties = {
    value: { type: Number },
    start: { type: Number },
    end: { type: Number },
    range: { type: Boolean, reflect: true },
    label: { type: String },
    placeholder: { type: String },
    size: { type: String, reflect: true },
    disabled: { type: Boolean, reflect: true },
    clearable: { type: Boolean },
    min: { type: Number },
    max: { type: Number },
    open: { state: true },
    focusDay: { state: true },
    pending: { state: true },
    hoverDay: { state: true },
  };
  declare value: number | null;
  declare start: number | null;
  declare end: number | null;
  declare range: boolean;
  declare label: string;
  declare placeholder: string;
  declare size: 'sm' | 'md' | 'lg';
  declare disabled: boolean;
  declare clearable: boolean;
  declare min: number | null;
  declare max: number | null;
  declare open: boolean;
  declare focusDay: string;
  declare pending: string | null;
  declare hoverDay: string | null;
  private uid = nextId('dp');

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
  }

  /** Convenience for local-day data ("YYYY-MM-DD"). */
  get day(): string { return msToDay(this.value); }
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
    th { font: 500 var(--mx-text-xs)/1 var(--mx-font-mono); color: var(--mx-text-faint); text-transform: uppercase; padding: 4px 0; }
    td { padding: 1px; text-align: center; }
    .d { all: unset; box-sizing: border-box; width: 100%; height: var(--mx-control-sm); display: grid; place-items: center; border-radius: var(--mx-radius-md);
      font-size: var(--mx-text-md); font-variant-numeric: tabular-nums; color: var(--mx-text-secondary); cursor: pointer; }
    .d:hover { background: var(--mx-surface-hover); color: var(--mx-text); }
    .d.out { color: var(--mx-text-faint); }
    .d.today { box-shadow: inset 0 0 0 1px var(--mx-border-strong); }
    .d.in { background: color-mix(in srgb, var(--mx-accent) 16%, transparent); color: var(--mx-text); border-radius: 0; }
    .d[aria-selected='true'] { background: var(--mx-accent); color: var(--mx-on-accent); }
    .d[aria-disabled='true'] { opacity: 0.35; cursor: default; pointer-events: none; }
    .d:focus-visible { box-shadow: var(--mx-focus-ring); }
    .foot { display: flex; justify-content: space-between; }
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
    return (this.min != null && ms < this.min) || (this.max != null && ms > this.max);
  }

  show() {
    if (this.disabled || this.open) return;
    const cur = this.range ? msToDay(this.start) : msToDay(this.value);
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

  hide() { this.pop?.hide(); }

  private focusGrid() {
    (this.renderRoot.querySelector(`.d[data-day="${this.focusDay}"]`) as HTMLElement | null)?.focus();
  }

  private commitSingle(day: string) {
    this.value = day ? dayToMs(day) : null;
    this.emit<DateChange>('mx-change', { value: this.value, day });
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
      case 'ArrowLeft': next = addDaysD(this.focusDay, -1); break;
      case 'ArrowRight': next = addDaysD(this.focusDay, 1); break;
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
    const sel = this.range ? [msToDay(this.start), msToDay(this.end)] : [msToDay(this.value)];
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
        return html`<td role="gridcell"><button type="button" class="d ${parts(d).m !== f.m ? 'out' : ''} ${d === today ? 'today' : ''} ${inRange ? 'in' : ''}"
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
    const d = msToDay(this.value);
    return d ? html`<span class="val">${this.fmt(d)}</span>` : html`<span class="val ph">${this.placeholder || kitStrings.pickDate}</span>`;
  }

  render() {
    const f = parts(this.focusDay);
    const monthLabel = new Intl.DateTimeFormat(kitStrings.locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(f.y, f.m, 1));
    const has = this.range ? this.start != null : this.value != null;
    return html`<div class="field">
      ${this.label ? html`<label id="${this.uid}-l" @click=${() => this.trigger?.focus()}>${this.label}</label>` : nothing}
      <button class="trigger" part="trigger" type="button" aria-haspopup="dialog" aria-expanded=${this.open ? 'true' : 'false'}
        aria-labelledby=${this.label ? `${this.uid}-l ${this.uid}-v` : nothing} aria-label=${this.label ? nothing : this.placeholder || kitStrings.pickDate}
        ?disabled=${this.disabled} @click=${() => (this.open ? this.hide() : this.show())}
        @keydown=${(e: KeyboardEvent) => { if (!this.open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.show(); } }}>
        <span class="ic"><mx-icon name="calendar" size="14"></mx-icon></span>
        <span id="${this.uid}-v" style="display:contents">${this.display()}</span>
      </button>
      <mx-popover @mx-open=${(e: Event) => e.stopPropagation()}
        @mx-close=${(e: Event) => { e.stopPropagation(); this.open = false; this.trigger?.focus(); }}>
        ${this.open ? html`<div class="cal" role="dialog" aria-modal="false" aria-label=${this.label || kitStrings.pickDate}
            @keydown=${(e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.hide(); } }}>
          <input class="typed" aria-label=${kitStrings.dateFormatHint} placeholder=${kitStrings.dateFormatHint}
            .value=${this.range ? '' : this.value != null ? this.fmt(msToDay(this.value), { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}
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
