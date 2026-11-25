import { css, html, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { base, define, directionOf, MxElement, nextId, kitStrings } from './base.js';
import './icons.js';
import './display.js';

/* ───────────── positioning ───────────── */

/**
 * Where an overlay goes relative to its anchor. `start` / `end` are logical: in a right-to-left context `bottom-start`
 * lines the overlay up with the anchor's right edge. `right-start` means "after the anchor in the inline direction"
 * (a submenu): to the right in LTR, to the left in RTL.
 */
export type Placement = 'bottom-start' | 'bottom-end' | 'top-start' | 'right-start';

/**
 * Place `el` (position: fixed) next to `anchor`, flipping to stay within the viewport. The writing direction is the
 * anchor's (or `el`'s for a DOMRect anchor) unless `dir` is given.
 */
export function position(el: HTMLElement, anchor: Element | DOMRect, placement: Placement = 'bottom-start', gap = 4, dir?: 'ltr' | 'rtl'): void {
  const a = anchor instanceof Element ? anchor.getBoundingClientRect() : anchor;
  const rtl = (dir ?? directionOf(anchor instanceof Element ? anchor : el)) === 'rtl';
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let top: number;
  let left: number;
  if (placement === 'right-start') {
    top = a.top;
    if (!rtl) {
      left = a.right + gap;
      if (left + r.width > vw - 8) left = a.left - r.width - gap;
    } else {
      left = a.left - r.width - gap;
      if (left < 8) left = a.right + gap;
    }
  } else {
    const alignRight = placement.endsWith('end') !== rtl;
    left = alignRight ? a.right - r.width : a.left;
    top = placement.startsWith('top') ? a.top - r.height - gap : a.bottom + gap;
    if (top + r.height > vh - 8 && a.top - r.height - gap > 8) top = a.top - r.height - gap;
    if (top < 8 && a.bottom + gap + r.height < vh) top = a.bottom + gap;
  }
  left = Math.max(8, Math.min(left, vw - r.width - 8));
  top = Math.max(8, Math.min(top, vh - r.height - 8));
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
}

/* ───────────── overlay registry ───────────── */

/** Open modal dialogs, innermost last. Pickers mount inside the top one: a modal makes everything outside it inert. */
const dialogStack: HTMLElement[] = [];
let openPopovers = 0;

/** True while any mx-popover or mx-dialog is open — global shortcut handlers should stand down. */
export function isOverlayOpen(): boolean {
  return openPopovers > 0 || dialogStack.length > 0;
}

/* ───────────── mx-popover (native Popover API → top layer, light dismiss) ───────────── */

/** Narrow touch layouts get sheets and full-screen dialogs instead of anchored overlays. */
export const isPhone = (): boolean => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 640px)').matches;

export class MxPopover extends MxElement {
  static properties = { open: { type: Boolean, reflect: true }, placement: { type: String } };
  declare open: boolean;
  declare placement: Placement;
  anchor: Element | DOMRect | null = null;
  private ro?: ResizeObserver;

  constructor() {
    super();
    this.open = false;
    this.placement = 'bottom-start';
  }

  static styles = [base, css`
    :host { display: contents; }
    .pop {
      position: fixed; inset: auto; margin: 0; padding: 0; border: 0; min-width: 200px; max-width: min(360px, calc(100vw - 16px));
      background: var(--mx-surface-overlay); color: var(--mx-text); border-radius: var(--mx-radius-lg);
      box-shadow: var(--mx-shadow-popover); overflow: hidden;
      opacity: 0; transform: translateY(-2px) scale(0.985); transform-origin: top left;
      transition: opacity var(--mx-duration-fast) var(--mx-ease-out), transform var(--mx-duration-base) var(--mx-ease-out),
        overlay var(--mx-duration-fast) allow-discrete, display var(--mx-duration-fast) allow-discrete;
    }
    :host(:dir(rtl)) .pop { transform-origin: top right; }
    .pop:popover-open { opacity: 1; transform: none; }
    @starting-style { .pop:popover-open { opacity: 0; transform: translateY(-2px) scale(0.985); } }
    /* Phones: anchored menus become bottom sheets — reachable with a thumb, never clipped by the keyboard edge. */
    .pop.sheet {
      inset: auto 0 var(--mx-keyboard-inset, 0px) 0; width: 100%; max-width: none; min-width: 0;
      max-height: min(78dvh, calc(var(--mx-viewport-height, 100dvh) - var(--mx-safe-top, 0px) - 16px));
      border-radius: var(--mx-radius-xl) var(--mx-radius-xl) 0 0; box-sizing: border-box;
      padding: 0 var(--mx-safe-right, 0px) max(0px, var(--mx-safe-bottom, 0px) - var(--mx-keyboard-inset, 0px)) var(--mx-safe-left, 0px);
      transform: translateY(16px); --mx-list-max-height: 56dvh;
    }
    .pop.sheet:popover-open { transform: none; }
    @starting-style { .pop.sheet:popover-open { transform: translateY(24px); } }
    .pop.sheet::before { content: ''; display: block; width: 36px; height: 4px; margin: 8px auto 2px; border-radius: 2px; background: var(--mx-border-strong); }
    .pop.sheet::backdrop { background: var(--mx-backdrop); }
  `];

  private get pop(): HTMLElement | null {
    return this.renderRoot.querySelector('.pop');
  }

  show(anchor: Element | DOMRect, placement?: Placement) {
    this.anchor = anchor;
    if (placement) this.placement = placement;
    this.open = true;
  }

  hide() {
    this.open = false;
  }

  protected updated(changed: Map<string, unknown>) {
    const pop = this.pop;
    if (!pop || !changed.has('open')) return;
    if (this.open && !pop.matches(':popover-open')) {
      pop.showPopover();
      openPopovers++;
      this.reposition();
      this.ro = new ResizeObserver(() => this.reposition());
      this.ro.observe(pop);
      this.emit('mx-open');
    } else if (!this.open && pop.matches(':popover-open')) {
      pop.hidePopover();
    }
  }

  reposition() {
    const pop = this.pop;
    if (!pop || !this.anchor) return;
    const sheet = isPhone();
    pop.classList.toggle('sheet', sheet);
    if (sheet) { pop.style.left = ''; pop.style.top = ''; return; }
    position(pop, this.anchor, this.placement);
  }

  private onToggle(e: ToggleEvent) {
    if (e.newState === 'closed') {
      openPopovers = Math.max(0, openPopovers - 1);
      this.ro?.disconnect();
      if (this.open) this.open = false;
      this.emit('mx-close');
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.ro?.disconnect();
  }

  render() {
    return html`<div class="pop" popover="auto" part="popover" @toggle=${this.onToggle}><slot></slot></div>`;
  }
}
define('mx-popover', MxPopover);

/* ───────────── mx-command-list: searchable, keyboard-driven option list ───────────── */

export interface CommandItem {
  value: string;
  label: string;
  group?: string;
  hint?: string;
  keywords?: string;
  icon?: TemplateResult | string;
  shortcut?: string[];
  disabled?: boolean;
}

function score(q: string, t: string): number {
  if (!q) return 1;
  const s = t.toLowerCase();
  const i = s.indexOf(q);
  if (i === 0) return 100;
  if (i > 0) return 60 - i * 0.1;
  // Subsequence match, but only within a tight window — "crane" must not match "Evaluate seCond shift fo R pAnel liNE".
  let best = 0;
  for (let start = s.indexOf(q[0]!); start !== -1; start = s.indexOf(q[0]!, start + 1)) {
    let qi = 0, sc = 0, streak = 0, k = start;
    for (; k < s.length && qi < q.length; k++) {
      if (s[k] === q[qi]) { qi++; streak++; sc += 1 + streak; } else streak = 0;
    }
    if (qi === q.length && k - start <= q.length * 2 + 2) best = Math.max(best, sc);
  }
  return best;
}

export class MxCommandList extends MxElement {
  static properties = {
    items: { attribute: false },
    selected: { attribute: false },
    multiple: { type: Boolean },
    placeholder: { type: String },
    query: { type: String },
    emptyText: { type: String, attribute: 'empty-text' },
    nosearch: { type: Boolean, reflect: true },
    active: { state: true },
  };
  declare items: CommandItem[];
  declare selected: string[];
  declare multiple: boolean;
  declare placeholder: string;
  declare query: string;
  declare emptyText: string;
  /** Hide the search field (short lists). It stays focused off-screen, so typing still filters (type-ahead). */
  declare nosearch: boolean;
  declare active: number;
  private listId = nextId('list');

  constructor() {
    super();
    this.items = [];
    this.selected = [];
    this.multiple = false;
    this.placeholder = '';
    this.query = '';
    this.emptyText = '';
    this.nosearch = false;
    this.active = 0;
  }

  static styles = [base, css`
    :host { display: flex; flex-direction: column; min-height: 0; max-height: inherit; }
    .search { display: flex; align-items: center; gap: var(--mx-space-2); padding: 0 var(--mx-space-3); border-bottom: 1px solid var(--mx-border); color: var(--mx-text-faint); }
    :host([nosearch]) .search { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); border: 0; padding: 0; }
    input:focus-visible { box-shadow: none; }
    input { flex: 1; height: var(--mx-control-lg); border: 0; outline: 0; background: transparent; color: var(--mx-text); font: inherit; font-size: var(--mx-field-size); }
    input::placeholder { color: var(--mx-text-faint); }
    ul { list-style: none; margin: 0; padding: 4px; overflow-y: auto; max-height: var(--mx-list-max-height, 320px); overscroll-behavior: contain; }
    .group { padding: 8px 8px 4px; font: var(--mx-weight-semibold) var(--mx-text-xs) / 1 var(--mx-font-sans); text-transform: uppercase;
      letter-spacing: var(--mx-tracking-eyebrow); color: var(--mx-text-muted); }
    li[role='option'] {
      display: flex; align-items: center; gap: var(--mx-space-2); height: var(--mx-control-md); padding: 0 var(--mx-space-2);
      border-radius: var(--mx-radius-md); font-size: var(--mx-text-md); color: var(--mx-text-secondary); cursor: pointer; user-select: none;
    }
    li[aria-selected='true'] { background: var(--mx-surface-active); color: var(--mx-text); }
    li[aria-disabled='true'] { opacity: 0.4; cursor: default; }
    .icon { display: inline-flex; width: 16px; justify-content: center; color: var(--mx-text-muted); }
    .label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .hint { color: var(--mx-text-muted); font-size: var(--mx-text-sm); }
    .check { width: 14px; height: 14px; border-radius: 3px; border: 1px solid var(--mx-border-strong); display: inline-grid; place-items: center; color: var(--mx-on-accent); }
    .check.on { background: var(--mx-accent); border-color: var(--mx-accent); }
    .tick { color: var(--mx-accent-text); }
    .kbd { display: inline-flex; gap: 2px; }
    /* touch screens: 44 px rows, and no keyboard shortcuts to show */
    @media (pointer: coarse) { li[role='option'] { height: var(--mx-control-lg); } }
    @media (hover: none) { .kbd { display: none; } }
    .empty { padding: var(--mx-space-6) var(--mx-space-3); text-align: center; color: var(--mx-text-muted); font-size: var(--mx-text-md); }
  `];

  get filtered(): CommandItem[] {
    const q = this.query.trim().toLowerCase();
    if (!q) return this.items;
    const ranked = this.items
      .map((it) => {
        // An exact word in label/keywords (e.g. an identifier like "ENG-1") always outranks prefix matches ("ENG-17").
        const words = `${it.label} ${it.keywords ?? ''} ${it.hint ?? ''}`.toLowerCase().split(/\s+/);
        const exact = words.includes(q) ? 1000 : 0;
        return { it, s: exact + Math.max(score(q, it.label), score(q, it.keywords ?? '') * 0.8) };
      })
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);
    // Keep groups contiguous (one header each), ordered by each group's best hit.
    const byGroup = new Map<string, CommandItem[]>();
    for (const { it } of ranked) {
      const g = it.group ?? '';
      let list = byGroup.get(g);
      if (!list) byGroup.set(g, (list = []));
      list.push(it);
    }
    return [...byGroup.values()].flat();
  }

  /** Highlight a value (e.g. the current selection when a select opens). */
  activate(value: string) {
    const i = this.filtered.findIndex((x) => x.value === value);
    if (i >= 0) {
      this.active = i;
      this.updateComplete.then(() => this.renderRoot.querySelector('li[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }));
    }
  }

  focusInput() {
    (this.renderRoot.querySelector('input') as HTMLInputElement | null)?.focus();
  }

  firstUpdated() {
    requestAnimationFrame(() => this.focusInput());
  }

  private choose(item: CommandItem | undefined) {
    if (!item || item.disabled) return;
    let selected = this.selected;
    if (this.multiple) {
      selected = selected.includes(item.value) ? selected.filter((v) => v !== item.value) : [...selected, item.value];
      this.selected = selected;
    }
    this.emit('mx-select', { value: item.value, selected });
  }

  private onKey(e: KeyboardEvent) {
    const list = this.filtered;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); this.active = (this.active + 1) % Math.max(1, list.length); break;
      case 'ArrowUp': e.preventDefault(); this.active = (this.active - 1 + list.length) % Math.max(1, list.length); break;
      /* Home / End jump to the first / last option; with a query typed they move the caret in the search field. */
      case 'Home': case 'End':
        if (this.query && !this.nosearch) return;
        e.preventDefault();
        this.active = e.key === 'Home' ? 0 : Math.max(0, list.length - 1);
        break;
      case 'Enter': e.preventDefault(); this.choose(list[this.active]); break;
      case 'Escape': e.preventDefault(); e.stopPropagation(); this.emit('mx-dismiss'); return;
      default: return;
    }
    this.updateComplete.then(() => this.renderRoot.querySelector('li[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }));
  }

  render() {
    const list = this.filtered;
    if (this.active >= list.length) this.active = Math.max(0, list.length - 1);
    let lastGroup: string | undefined;
    const activeId = list[this.active] ? `${this.listId}-${this.active}` : '';
    return html`
      <div class="search">
        <mx-icon name="search" size="14"></mx-icon>
        <input .value=${this.query} placeholder=${this.placeholder || kitStrings.search} aria-label=${this.getAttribute('aria-label') || this.placeholder || kitStrings.search} role="combobox" aria-expanded="true"
          aria-controls=${this.listId} aria-activedescendant=${activeId || nothing} aria-autocomplete="list"
          @input=${(e: Event) => { this.query = (e.target as HTMLInputElement).value; this.active = 0; this.emit('mx-query', this.query); }}
          @keydown=${this.onKey} />
      </div>
      <ul id=${this.listId} role="listbox" aria-multiselectable=${this.multiple ? 'true' : 'false'}>
        ${list.length === 0 ? html`<li class="empty" role="presentation">${this.emptyText || kitStrings.noResults}</li>` : nothing}
        ${list.map((it, i) => {
          const header = it.group && it.group !== lastGroup ? html`<li class="group" role="presentation">${it.group}</li>` : nothing;
          lastGroup = it.group;
          const on = this.selected.includes(it.value);
          return html`${header}<li id=${`${this.listId}-${i}`} role="option" aria-selected=${i === this.active ? 'true' : 'false'}
            aria-checked=${this.multiple ? (on ? 'true' : 'false') : on ? 'true' : nothing} aria-disabled=${it.disabled ? 'true' : 'false'}
            @mousemove=${() => { if (this.active !== i) this.active = i; }}
            @mousedown=${(e: Event) => e.preventDefault()}
            @click=${() => this.choose(it)}>
            ${this.multiple ? html`<span class="check ${on ? 'on' : ''}">${on ? html`<mx-icon name="check" size="10"></mx-icon>` : nothing}</span>` : nothing}
            ${it.icon ? html`<span class="icon">${typeof it.icon === 'string' ? html`<mx-icon name=${it.icon} size="14"></mx-icon>` : it.icon}</span>` : nothing}
            <span class="label">${it.label}</span>
            ${it.hint ? html`<span class="hint">${it.hint}</span>` : nothing}
            ${it.shortcut ? html`<span class="kbd">${it.shortcut.map((k) => html`<mx-kbd>${k}</mx-kbd>`)}</span>` : nothing}
            ${!this.multiple && on ? html`<mx-icon class="tick" name="check" size="14"></mx-icon>` : nothing}
          </li>`;
        })}
      </ul>`;
  }
}
define('mx-command-list', MxCommandList);

/* ───────────── mx-picker: popover + command list in one call ───────────── */

export interface PickerOptions {
  anchor: Element | DOMRect;
  items: CommandItem[];
  selected?: string[];
  multiple?: boolean;
  placeholder?: string;
  placement?: Placement;
  onSelect: (value: string, selected: string[]) => void;
  onClose?: () => void;
}

/** Imperative helper: opens a searchable picker anchored to an element. Single-select closes on choose. */
export function openPicker(o: PickerOptions): () => void {
  const pop = document.createElement('mx-popover');
  const list = document.createElement('mx-command-list');
  list.items = o.items;
  list.selected = o.selected ?? [];
  list.multiple = !!o.multiple;
  list.placeholder = o.placeholder ?? kitStrings.search;
  pop.appendChild(list);
  (dialogStack[dialogStack.length - 1] ?? document.body).appendChild(pop);
  const close = () => pop.hide();
  // Keep the picker's lifecycle events from reaching an enclosing dialog's listeners.
  pop.addEventListener('mx-open', (e) => e.stopPropagation());
  list.addEventListener('mx-select', (e) => {
    const d = (e as CustomEvent<{ value: string; selected: string[] }>).detail;
    o.onSelect(d.value, d.selected);
    if (!o.multiple) close();
  });
  list.addEventListener('mx-dismiss', close);
  pop.addEventListener('mx-close', (e) => {
    e.stopPropagation();
    pop.remove();
    o.onClose?.();
    if (o.anchor instanceof HTMLElement) o.anchor.focus();
  });
  pop.updateComplete.then(() => pop.show(o.anchor, o.placement));
  return close;
}

/* ───────────── mx-dialog (native <dialog>: top layer, inert background, Esc) ───────────── */

/** The focused element, looking into shadow roots. */
function deepActive(): HTMLElement | null {
  let a = document.activeElement as HTMLElement | null;
  while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement as HTMLElement;
  return a;
}

/**
 * Modal dialog on the native <dialog> (top layer; the page behind is inert, so focus stays inside). Esc and a click on
 * the backdrop close it — a press that starts inside (selecting text and releasing outside) does not. On close, focus
 * returns to what had it before. Emits `mx-close`.
 */
export class MxDialog extends MxElement {
  static properties = { open: { type: Boolean, reflect: true }, heading: { type: String }, width: { type: String }, align: { type: String } };
  declare open: boolean;
  declare heading: string;
  declare width: string;
  declare align: 'center' | 'top';

  constructor() {
    super();
    this.open = false;
    this.heading = '';
    this.width = '560px';
    this.align = 'top';
  }

  static styles = [base, css`
    dialog {
      padding: 0; border: 0; width: min(var(--w), calc(100vw - 32px)); max-height: calc(100vh - 32px);
      background: var(--mx-surface-raised); color: var(--mx-text); border-radius: var(--mx-radius-xl); box-shadow: var(--mx-shadow-dialog);
      overflow: hidden; display: flex; flex-direction: column;
      opacity: 0; transform: translateY(8px) scale(0.98);
      transition: opacity var(--mx-duration-base) var(--mx-ease-out), transform var(--mx-duration-slow) var(--mx-ease-out),
        overlay var(--mx-duration-base) allow-discrete, display var(--mx-duration-base) allow-discrete;
    }
    dialog:not([open]) { display: none; }
    dialog[data-align='top'] { margin-top: 12vh; }
    dialog[open] { opacity: 1; transform: none; }
    @starting-style { dialog[open] { opacity: 0; transform: translateY(8px) scale(0.98); } }
    dialog::backdrop { background: var(--mx-backdrop); backdrop-filter: blur(2px); }
    @media (max-width: 640px) {
      dialog, dialog[data-align='top'] {
        width: 100vw; max-width: 100vw; height: var(--mx-viewport-height, 100dvh); max-height: var(--mx-viewport-height, 100dvh); margin: 0; border-radius: 0; box-shadow: none;
        transform: translateY(24px); padding: var(--mx-safe-top, 0px) var(--mx-safe-right, 0px) 0 var(--mx-safe-left, 0px); box-sizing: border-box;
      }
      /* the slide-in offset above must not outlive the opening animation (it used to: the sheet stayed 24 px low, footer cut off) */
      dialog[open] { transform: none; }
      @starting-style { dialog[open] { opacity: 0; transform: translateY(24px); } }
      .body { flex: 1; }
      header { min-height: 52px; }
      .x { width: 36px; height: 36px; }
      /* home-indicator gap, dropped while the keyboard covers that edge */
      footer { padding-bottom: calc(var(--mx-space-3) + max(0px, var(--mx-safe-bottom, 0px) - var(--mx-keyboard-inset, 0px))); }
    }
    header { display: flex; align-items: center; gap: var(--mx-space-2); padding: var(--mx-space-3) var(--mx-space-4); border-bottom: 1px solid var(--mx-border); }
    h2 { flex: 1; margin: 0; font: var(--mx-weight-medium) var(--mx-text-md) / 1.3 var(--mx-font-sans); color: var(--mx-text-secondary); }
    .body { overflow: auto; min-height: 0; }
    footer { display: flex; align-items: center; justify-content: flex-end; gap: var(--mx-space-2); padding: var(--mx-space-3) var(--mx-space-4); border-top: 1px solid var(--mx-border); }
    footer:not(:has(slot[name='footer'])) { display: none; }
    .x { all: unset; display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: var(--mx-radius-md); color: var(--mx-text-muted); cursor: pointer; }
    .x:hover { background: var(--mx-surface-hover); color: var(--mx-text); }
    .x:focus-visible { box-shadow: var(--mx-focus-ring); }
  `];

  /** Focus before opening, given back on close. */
  private returnTo: HTMLElement | null = null;
  /** The press that may end in a backdrop click began on the backdrop. */
  private downOutside = false;

  protected updated(changed: Map<string, unknown>) {
    const d = this.renderRoot.querySelector('dialog');
    if (!d || !changed.has('open')) return;
    if (this.open && !d.open) {
      this.returnTo = deepActive();
      d.showModal();
      dialogStack.push(this);
    }
    if (!this.open && d.open) d.close();
  }

  close() {
    this.open = false;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    const k = dialogStack.indexOf(this);
    if (k !== -1) dialogStack.splice(k, 1);
  }

  private onClose() {
    const k = dialogStack.indexOf(this);
    if (k !== -1) dialogStack.splice(k, 1);
    if (this.open) this.open = false;
    const back = this.returnTo;
    this.returnTo = null;
    if (back?.isConnected) {
      const now = deepActive();
      if (!now || now === document.body || this.contains(now) || this.renderRoot.contains(now)) back.focus({ preventScroll: true });
    }
    this.emit('mx-close');
  }

  /** On the backdrop: the dialog element itself was hit outside its box (`::backdrop` hits report the dialog). */
  private outside(e: MouseEvent): boolean {
    const d = e.currentTarget as HTMLElement;
    if (e.target !== d) return false;
    const r = d.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  }

  private onBackdrop(e: MouseEvent) {
    const close = this.downOutside && this.outside(e);
    this.downOutside = false;
    if (close) this.close();
  }

  render() {
    return html`<dialog style="--w:${this.width}" data-align=${this.align} aria-label=${this.heading || nothing}
      @close=${this.onClose} @cancel=${(e: Event) => { e.preventDefault(); this.close(); }}
      @pointerdown=${(e: PointerEvent) => { this.downOutside = this.outside(e); }} @click=${this.onBackdrop}>
      ${this.heading ? html`<header><h2>${this.heading}</h2><slot name="header-end"></slot>
        <button class="x" aria-label=${kitStrings.close} @click=${() => this.close()}><mx-icon name="x" size="14"></mx-icon></button></header>` : nothing}
      <div class="body"><slot></slot></div>
      <footer><slot name="footer"></slot></footer>
    </dialog>`;
  }
}
define('mx-dialog', MxDialog);

/* ───────────── mx-tooltip ───────────── */

/**
 * Tooltip on hover / focus of the slotted trigger (not on touch screens). The text describes the trigger for
 * assistive tech: it is set as `aria-description` on the slotted element itself — an id reference
 * (`aria-describedby`) cannot cross the shadow boundary — and `mx-button` passes it on to its inner button.
 * Escape dismisses it (WCAG 1.4.13) without moving focus.
 */
export class MxTooltip extends MxElement {
  static properties = { content: { type: String }, shortcut: { type: String }, placement: { type: String } };
  declare content: string;
  declare shortcut: string;
  declare placement: Placement;
  private timer?: number;
  private tipId = nextId('tip');
  private shown = false;
  /** The element we described, and its own aria-description before (restored when it leaves or we go). */
  private described: { el: Element; prev: string | null; ours: string } | null = null;

  constructor() {
    super();
    this.content = '';
    this.shortcut = '';
    this.placement = 'bottom-start';
  }

  static styles = [base, css`
    :host { display: inline-flex; }
    .tip {
      position: fixed; inset: auto; margin: 0; border: 0; padding: 4px 8px; display: none; align-items: center; gap: 6px;
      background: var(--mx-surface-overlay); color: var(--mx-text); font-size: var(--mx-text-sm); border-radius: var(--mx-radius-md);
      box-shadow: var(--mx-shadow-popover); pointer-events: none; white-space: nowrap;
    }
    .tip:popover-open { display: inline-flex; }
  `];

  /** What the trigger is described as: the text and its shortcut ("Archive (E)"). */
  get description(): string {
    const c = this.content.trim();
    return c && this.shortcut ? `${c} (${this.shortcut})` : c;
  }

  private show = () => {
    if (typeof matchMedia === 'function' && matchMedia('(hover: none)').matches) return;
    if (!this.content) return;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      const tip = this.renderRoot.querySelector('.tip') as HTMLElement | null;
      if (!tip || !this.isConnected) return;
      tip.showPopover?.();
      position(tip, this, this.placement, 6);
      this.shown = true;
      document.addEventListener('keydown', this.onKey, true);
    }, 450);
  };

  private hide = () => {
    clearTimeout(this.timer);
    document.removeEventListener('keydown', this.onKey, true);
    this.shown = false;
    const tip = this.renderRoot.querySelector('.tip') as HTMLElement | null;
    try { if (tip?.matches(':popover-open')) tip.hidePopover(); } catch { /* no popover support */ }
  };

  /** Escape closes the tip only (a dialog around it stays open: the key is not consumed unless the tip was shown). */
  private onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !this.shown) return;
    e.stopPropagation();
    this.hide();
  };

  /** Describe the slotted trigger (and stop describing one that left). */
  private describe = () => {
    const slot = this.renderRoot.querySelector('slot');
    const el = slot?.assignedElements({ flatten: true })[0] ?? null;
    const text = this.description;
    const d = this.described;
    if (d && (d.el !== el || !text)) {
      if (d.el.getAttribute('aria-description') === d.ours) {
        if (d.prev == null) d.el.removeAttribute('aria-description');
        else d.el.setAttribute('aria-description', d.prev);
      }
      this.described = null;
    }
    if (!el || !text) return;
    if (!this.described) this.described = { el, prev: el.getAttribute('aria-description'), ours: text };
    this.described.ours = text;
    el.setAttribute('aria-description', text);
  };

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('pointerenter', this.show);
    this.addEventListener('pointerleave', this.hide);
    this.addEventListener('focusin', this.show);
    this.addEventListener('focusout', this.hide);
    this.addEventListener('pointerdown', this.hide);
    if (this.hasUpdated) this.describe();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.hide();
    const d = this.described;
    if (d && d.el.getAttribute('aria-description') === d.ours) {
      if (d.prev == null) d.el.removeAttribute('aria-description');
      else d.el.setAttribute('aria-description', d.prev);
    }
    this.described = null;
  }

  protected updated(changed: PropertyValues<this>) {
    if (changed.has('content') || changed.has('shortcut')) this.describe();
  }

  render() {
    return html`<slot @slotchange=${this.describe}></slot>
      <div class="tip" id=${this.tipId} role="tooltip" aria-hidden="true" popover="manual">${this.content}
        ${this.shortcut ? this.shortcut.split(' ').map((k) => html`<mx-kbd>${k}</mx-kbd>`) : nothing}</div>`;
  }
}
define('mx-tooltip', MxTooltip);

/* ───────────── mx-toast-region ───────────── */

export interface ToastView { id: number; message: string; tone: 'info' | 'success' | 'danger'; action?: { label: string } }
const TONE_ICON: Record<ToastView['tone'], string> = { info: 'info', success: 'check', danger: 'alert' };

export class MxToastRegion extends MxElement {
  static properties = { toasts: { attribute: false } };
  declare toasts: ToastView[];
  constructor() {
    super();
    this.toasts = [];
  }
  static styles = [base, css`
    :host { position: fixed; inset-inline-end: var(--mx-space-4); bottom: calc(var(--mx-space-4) + var(--mx-toast-offset, 0px)); z-index: var(--mx-z-toast); display: flex; flex-direction: column; gap: var(--mx-space-2); }
    @media (max-width: 640px) { :host { inset-inline: var(--mx-space-3); bottom: calc(var(--mx-space-3) + var(--mx-toast-offset, 0px) + var(--mx-safe-bottom, 0px) + var(--mx-keyboard-inset, 0px)); } .toast { min-width: 0; max-width: none; } }
    .toast {
      display: flex; align-items: center; gap: var(--mx-space-3); min-width: 260px; max-width: 420px; padding: 10px var(--mx-space-3);
      background: var(--mx-surface-overlay); border-radius: var(--mx-radius-lg); box-shadow: var(--mx-shadow-popover);
      font-size: var(--mx-text-md); color: var(--mx-text); animation: in var(--mx-duration-slow) var(--mx-ease-out);
    }
    .tone { display: inline-flex; flex: none; color: var(--mx-accent-text); }
    .toast[data-tone='danger'] .tone { color: var(--mx-danger); }
    .toast[data-tone='success'] .tone { color: var(--mx-success); }
    .msg { flex: 1; }
    button { all: unset; cursor: pointer; color: var(--mx-accent-text); font-weight: var(--mx-weight-medium); font-size: var(--mx-text-sm); padding: 2px 4px; border-radius: var(--mx-radius-sm); }
    button:focus-visible { box-shadow: var(--mx-focus-ring); }
    .x { color: var(--mx-text-faint); display: inline-flex; }
    @keyframes in { from { opacity: 0; transform: translateY(6px); } }
  `];
  render() {
    return html`<div role="status" aria-live="polite">${this.toasts.map((t) => html`
      <div class="toast" data-tone=${t.tone}>
        <mx-icon class="tone" name=${TONE_ICON[t.tone] ?? 'info'}></mx-icon><span class="msg">${t.message}</span>
        ${t.action ? html`<button @click=${() => this.emit('mx-toast-action', t.id)}>${t.action.label}</button>` : nothing}
        <button class="x" aria-label=${kitStrings.dismiss} @click=${() => this.emit('mx-toast-dismiss', t.id)}><mx-icon name="x" size="12"></mx-icon></button>
      </div>`)}</div>`;
  }
}
define('mx-toast-region', MxToastRegion);

declare global {
  interface HTMLElementTagNameMap {
    'mx-popover': MxPopover; 'mx-command-list': MxCommandList; 'mx-dialog': MxDialog; 'mx-tooltip': MxTooltip; 'mx-toast-region': MxToastRegion;
  }
}
