import { css, html, nothing } from 'lit';
import { base, define, MxElement, nextId, kitStrings } from './base.js';
import './icons.js';

const fieldStyles = css`
  .field { display: flex; flex-direction: column; gap: 6px; }
  label { font-size: var(--mx-text-sm); color: var(--mx-text-muted); font-weight: var(--mx-weight-medium); }
  .control {
    display: flex; align-items: center; gap: var(--mx-space-2); padding: 0 var(--mx-space-3);
    border: 1px solid var(--mx-border-strong); border-radius: var(--mx-radius-md); background: var(--mx-surface);
    transition: border-color var(--mx-duration-fast) var(--mx-ease-out), box-shadow var(--mx-duration-fast) var(--mx-ease-out);
    color: var(--mx-text-muted);
  }
  .control:focus-within { border-color: var(--mx-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--mx-accent) 25%, transparent); }
  :host([bare]) .control { border-color: transparent; background: transparent; padding: 0; box-shadow: none; }
  input, textarea {
    flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--mx-text);
    font: inherit; font-size: var(--mx-field-size);
  }
  input { height: calc(var(--mx-control-md) - 2px); }
  :host([size='sm']) input { height: calc(var(--mx-control-sm) - 2px); }
  :host([size='lg']) input { height: calc(var(--mx-control-lg) - 2px); }
  input::placeholder, textarea::placeholder { color: var(--mx-text-faint); }
  /* The .control wrapper draws the focus state; the inner element must not add a second ring. */
  input:focus-visible, textarea:focus-visible { box-shadow: none; }
  .error { color: var(--mx-danger); font-size: var(--mx-text-sm); }
`;

/* ───────────── mx-input ───────────── */
export class MxInput extends MxElement {
  static properties = {
    value: { type: String },
    label: { type: String },
    placeholder: { type: String },
    icon: { type: String },
    type: { type: String },
    error: { type: String },
    required: { type: Boolean },
    bare: { type: Boolean, reflect: true },
    autofocus: { type: Boolean },
    autocomplete: { type: String },
    inputmode: { type: String },
  };
  declare autocomplete: string;
  /** Virtual keyboard hint (`decimal`, `numeric`, `email`…), forwarded to the native input. */
  declare inputmode: string;
  declare value: string;
  declare label: string;
  declare placeholder: string;
  declare icon: string;
  declare type: string;
  declare error: string;
  declare required: boolean;
  declare bare: boolean;
  declare autofocus: boolean;
  private inputId = nextId('in');

  static shadowRootOptions = { ...MxElement.shadowRootOptions, delegatesFocus: true };

  constructor() {
    super();
    this.value = '';
    this.label = '';
    this.placeholder = '';
    this.icon = '';
    this.type = 'text';
    this.error = '';
    this.required = false;
    this.bare = false;
    this.autofocus = false;
    this.autocomplete = 'off';
  }

  static styles = [base, fieldStyles, css`:host { display: block; }`];

  firstUpdated() {
    if (this.autofocus) requestAnimationFrame(() => this.focus());
  }

  select() {
    this.renderRoot.querySelector('input')?.select();
  }

  render() {
    return html`<div class="field">
      ${this.label ? html`<label for=${this.inputId}>${this.label}</label>` : nothing}
      <div class="control" part="control">
        ${this.icon ? html`<mx-icon name=${this.icon}></mx-icon>` : nothing}
        <input id=${this.inputId} part="input" .value=${this.value} type=${this.type} placeholder=${this.placeholder} autocomplete=${this.autocomplete} inputmode=${this.inputmode || nothing}
          ?required=${this.required} aria-invalid=${this.error ? 'true' : 'false'} aria-label=${this.label || this.placeholder || nothing}
          @input=${(e: Event) => { this.value = (e.target as HTMLInputElement).value; this.emit('mx-input', this.value); }}
          @change=${() => this.emit('mx-change', this.value)} />
        <slot name="end"></slot>
      </div>
      ${this.error ? html`<span class="error" role="alert">${this.error}</span>` : nothing}
    </div>`;
  }
}
define('mx-input', MxInput);

/* ───────────── mx-textarea (auto-growing) ───────────── */
export interface MentionCandidate { id: string; label: string; hint?: string; color?: string }

/**
 * Auto-growing textarea. With `mentions` set, typing `@name` shows an inline suggestion list (focus stays in the
 * textarea; ↑/↓, Enter/Tab, Esc) and inserts the token `<@id>` that mx-markdown renders as a mention chip.
 */
export class MxTextarea extends MxElement {
  static properties = {
    value: { type: String },
    label: { type: String },
    placeholder: { type: String },
    bare: { type: Boolean, reflect: true },
    minRows: { type: Number, attribute: 'min-rows' },
    autofocus: { type: Boolean },
    mentions: { attribute: false },
    readonly: { type: Boolean, reflect: true },
    suggest: { state: true },
  };
  declare value: string;
  /** Shown but not editable (e.g. view-only access). */
  declare readonly: boolean;
  declare label: string;
  declare placeholder: string;
  declare bare: boolean;
  declare minRows: number;
  declare autofocus: boolean;
  declare mentions: MentionCandidate[] | null;
  declare suggest: { query: string; start: number; active: number } | null;
  private inputId = nextId('ta');
  private listId = nextId('ml');

  static shadowRootOptions = { ...MxElement.shadowRootOptions, delegatesFocus: true };

  constructor() {
    super();
    this.value = '';
    this.label = '';
    this.placeholder = '';
    this.bare = false;
    this.minRows = 3;
    this.autofocus = false;
    this.mentions = null;
    this.suggest = null;
  }

  static styles = [base, fieldStyles, css`
    :host { display: block; position: relative; }
    .control { padding: var(--mx-space-2) var(--mx-space-3); align-items: stretch; }
    textarea { resize: none; line-height: var(--mx-leading-normal); overflow: hidden; }
    .suggest {
      position: absolute; left: var(--mx-space-2); top: calc(100% + 4px); z-index: var(--mx-z-popover); min-width: 220px; max-width: 320px;
      margin: 0; padding: 4px; list-style: none; background: var(--mx-surface-overlay); border-radius: var(--mx-radius-lg); box-shadow: var(--mx-shadow-popover);
    }
    .suggest li { display: flex; align-items: center; gap: var(--mx-space-2); height: var(--mx-control-md); padding: 0 var(--mx-space-2); border-radius: var(--mx-radius-md);
      font-size: var(--mx-text-md); color: var(--mx-text-secondary); cursor: pointer; }
    .suggest li[aria-selected='true'] { background: var(--mx-surface-active); color: var(--mx-text); }
    .suggest .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
    .suggest .hint { margin-inline-start: auto; color: var(--mx-text-faint); font-size: var(--mx-text-sm); }
  `];

  private get ta(): HTMLTextAreaElement | null {
    return this.renderRoot.querySelector('textarea');
  }

  private grow(ta: HTMLTextAreaElement) {
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }

  firstUpdated() {
    if (this.autofocus) requestAnimationFrame(() => this.ta?.focus());
  }

  updated() {
    const ta = this.ta;
    if (ta) this.grow(ta);
  }

  private get candidates(): MentionCandidate[] {
    if (!this.suggest || !this.mentions) return [];
    const q = this.suggest.query.toLowerCase();
    return this.mentions.filter((m) => m.label.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) || m.label.toLowerCase().startsWith(q)).slice(0, 6);
  }

  private detect(ta: HTMLTextAreaElement) {
    if (!this.mentions) return;
    const before = ta.value.slice(0, ta.selectionStart);
    const m = /(^|\s)@([\p{L}\p{N}_.-]{0,24})$/u.exec(before);
    this.suggest = m ? { query: m[2]!, start: before.length - m[2]!.length - 1, active: 0 } : null;
  }

  private insert(c: MentionCandidate) {
    const ta = this.ta;
    if (!ta || !this.suggest) return;
    const end = ta.selectionStart;
    const token = `<@${c.id}> `;
    ta.setRangeText(token, this.suggest.start, end, 'end');
    this.value = ta.value;
    this.suggest = null;
    this.grow(ta);
    this.emit('mx-input', this.value);
  }

  private onKey(e: KeyboardEvent) {
    const list = this.candidates;
    if (!this.suggest || !list.length) return;
    const s = this.suggest;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const d = e.key === 'ArrowDown' ? 1 : -1;
      this.suggest = { ...s, active: (s.active + d + list.length) % list.length };
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      this.insert(list[s.active]!);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.suggest = null;
    }
  }

  render() {
    const list = this.candidates;
    const open = !!this.suggest && list.length > 0;
    return html`<div class="field">
      ${this.label ? html`<label for=${this.inputId}>${this.label}</label>` : nothing}
      <div class="control" part="control">
        <textarea id=${this.inputId} part="textarea" ?readonly=${this.readonly} rows=${this.minRows} .value=${this.value} placeholder=${this.placeholder}
          aria-label=${this.label || this.placeholder || nothing}
          aria-autocomplete=${this.mentions ? 'list' : nothing} aria-expanded=${this.mentions ? String(open) : nothing}
          aria-controls=${open ? this.listId : nothing}
          @keydown=${this.onKey}
          @input=${(e: Event) => {
            const ta = e.target as HTMLTextAreaElement;
            this.value = ta.value;
            this.grow(ta);
            this.detect(ta);
            this.emit('mx-input', this.value);
          }}
          @change=${() => this.emit('mx-change', this.value)}
          @blur=${() => { this.suggest = null; this.emit('mx-blur', this.value); }}></textarea>
      </div>
      ${open ? html`<ul class="suggest" id=${this.listId} role="listbox" aria-label=${kitStrings.mention}>
        ${list.map((c, i) => html`<li role="option" aria-selected=${i === this.suggest!.active ? 'true' : 'false'}
          @mousedown=${(e: Event) => { e.preventDefault(); this.insert(c); }}>
          ${c.color ? html`<span class="dot" style="background:${c.color}"></span>` : nothing}${c.label}
          ${c.hint ? html`<span class="hint">${c.hint}</span>` : nothing}</li>`)}
      </ul>` : nothing}
    </div>`;
  }
}
define('mx-textarea', MxTextarea);

/* ───────────── mx-segmented ───────────── */
export interface SegmentOption { value: string; label: string; icon?: string }

export class MxSegmented extends MxElement {
  static properties = { value: { type: String }, options: { attribute: false }, label: { type: String }, size: { type: String, reflect: true } };
  declare value: string;
  declare options: SegmentOption[];
  declare label: string;
  constructor() {
    super();
    this.value = '';
    this.options = [];
    this.label = '';
  }
  static styles = [base, css`
    :host { display: inline-flex; max-width: 100%; min-width: 0; }
    .group { display: inline-flex; padding: 2px; gap: 2px; border-radius: var(--mx-radius-md); background: var(--mx-bg-sunken); border: 1px solid var(--mx-border);
      box-sizing: border-box; height: var(--mx-control-md); max-width: 100%; overflow-x: auto; scrollbar-width: none; position: relative; }
    :host([size='sm']) .group { height: var(--mx-control-sm); }
    /* collapse: icon-only options on phones (label stays the accessible name) */
    @media (max-width: 720px) { :host([collapse]) .lbl { display: none; } }
    button {
      all: unset; display: inline-flex; align-items: center; gap: 6px; height: 100%; padding: 0 var(--mx-space-2); box-sizing: border-box;
      border-radius: var(--mx-radius-sm); color: var(--mx-text-muted); font-size: var(--mx-text-sm); cursor: pointer; white-space: nowrap;
      flex: none; -webkit-tap-highlight-color: transparent;
    }
    button:hover { color: var(--mx-text); }
    button[aria-checked='true'] { background: var(--mx-surface-overlay); color: var(--mx-text); box-shadow: 0 0 0 1px var(--mx-border-strong); }
    button:focus-visible { box-shadow: var(--mx-focus-ring); }
  `];
  private pick(v: string) {
    this.value = v;
    this.emit('mx-change', v);
  }
  private onKey(e: KeyboardEvent) {
    const i = this.options.findIndex((o) => o.value === this.value);
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = this.options[(i + d + this.options.length) % this.options.length];
    if (next) {
      this.pick(next.value);
      this.updateComplete.then(() => (this.renderRoot.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus());
    }
  }
  /** When the options don't fit (a scrolling strip on phones), keep the chosen one in view. */
  protected updated(changed: Map<string, unknown>) {
    if (!changed.has('value') && !changed.has('options')) return;
    const g = this.renderRoot.querySelector<HTMLElement>('.group');
    const b = g?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!g || !b || g.scrollWidth <= g.clientWidth) return;
    const pad = 16;
    if (b.offsetLeft - pad < g.scrollLeft) g.scrollLeft = Math.max(0, b.offsetLeft - pad);
    else if (b.offsetLeft + b.offsetWidth + pad > g.scrollLeft + g.clientWidth) g.scrollLeft = b.offsetLeft + b.offsetWidth + pad - g.clientWidth;
  }

  render() {
    return html`<div class="group" role="radiogroup" aria-label=${this.label || nothing} @keydown=${this.onKey}>
      ${this.options.map((o) => html`<button role="radio" aria-checked=${o.value === this.value ? 'true' : 'false'}
        tabindex=${o.value === this.value ? 0 : -1} @click=${() => this.pick(o.value)} aria-label=${o.icon ? o.label : nothing} title=${o.icon ? o.label : nothing}>
        ${o.icon ? html`<mx-icon name=${o.icon} size="14"></mx-icon>` : nothing}<span class="lbl">${o.label}</span></button>`)}
    </div>`;
  }
}
define('mx-segmented', MxSegmented);

declare global {
  interface HTMLElementTagNameMap { 'mx-input': MxInput; 'mx-textarea': MxTextarea; 'mx-segmented': MxSegmented }
}

/** On/off switch (`role="switch"`). Label goes in the default slot; emits `mx-change` with the new boolean. */
export class MxSwitch extends MxElement {
  static properties = { checked: { type: Boolean, reflect: true }, disabled: { type: Boolean, reflect: true } };
  declare checked: boolean;
  declare disabled: boolean;
  constructor() {
    super();
    this.checked = false;
    this.disabled = false;
  }
  static styles = [base, css`
    /* Never stretch in grid/flex parents: the hit area must be exactly the visible control. */
    :host { display: inline-flex; width: fit-content; justify-self: start; align-self: center; }
    button { all: unset; display: inline-flex; align-items: center; gap: var(--mx-space-2); cursor: pointer; font-size: var(--mx-text-md); color: var(--mx-text-secondary); }
    :host([disabled]) button { cursor: not-allowed; opacity: 0.55; }
    .track { position: relative; width: 28px; height: 16px; flex: none; border-radius: 8px; background: var(--mx-surface-active);
      box-shadow: inset 0 0 0 1px var(--mx-border-strong); transition: background-color var(--mx-duration-base) var(--mx-ease-out); }
    .thumb { position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: var(--mx-text-muted);
      transition: transform var(--mx-duration-base) var(--mx-ease-out), background-color var(--mx-duration-base) var(--mx-ease-out); }
    :host([checked]) .track { background: var(--mx-accent); box-shadow: none; }
    :host([checked]) .thumb { transform: translateX(12px); background: var(--mx-on-accent); }
    button:focus-visible .track { box-shadow: var(--mx-focus-ring); }
  `];
  private toggle() {
    if (this.disabled) return;
    this.checked = !this.checked;
    this.emit('mx-change', this.checked);
  }
  render() {
    return html`<button role="switch" aria-checked=${this.checked ? 'true' : 'false'} aria-disabled=${this.disabled ? 'true' : 'false'} @click=${this.toggle}>
      <span class="track"><span class="thumb"></span></span><slot></slot></button>`;
  }
}
define('mx-switch', MxSwitch);
