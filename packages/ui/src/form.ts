import { css, html, nothing } from 'lit';
import { base, define, directionOf, inlineStep, MxElement, nextId, kitStrings } from './base.js';
import { FormControl } from './form-control.js';
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
/**
 * Touch-only devices skip `autofocus`. On iOS a script focus outside a tap marks the field focused without
 * attaching the keyboard, and tapping an already-focused field does not attach it either: the field looks
 * active but swallows typing. The user taps the field they want instead.
 */
export const autofocusAllowed = (): boolean =>
  typeof matchMedia === 'undefined' || !matchMedia('(hover: none) and (pointer: coarse)').matches;

/**
 * Text field. Form-associated: inside a <form> it submits `value` under `name`, blocks submission while `required`
 * and empty, follows a disabled <fieldset>, and resets to its `value` attribute.
 */
export class MxInput extends MxElement {
  static formAssociated = true;
  static properties = {
    value: { type: String },
    name: { type: String, reflect: true },
    disabled: { type: Boolean, reflect: true },
    formDisabled: { state: true },
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
  /** Name the value is submitted under. */
  declare name: string;
  declare disabled: boolean;
  declare formDisabled: boolean;
  private inputId = nextId('in');
  private fc = new FormControl(this);

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
    this.name = '';
    this.disabled = false;
    this.formDisabled = false;
  }

  static styles = [base, fieldStyles, css`:host { display: block; } :host([disabled]) .control { opacity: 0.5; }`];

  /* ── form participation ── */
  get form(): HTMLFormElement | null { return this.fc.form; }
  get validity(): ValidityState | undefined { return this.fc.validity; }
  get validationMessage(): string { return this.fc.validationMessage; }
  checkValidity(): boolean { return this.fc.checkValidity(); }
  reportValidity(): boolean { return this.fc.reportValidity(); }
  formResetCallback() { this.value = this.getAttribute('value') ?? ''; }
  formDisabledCallback(disabled: boolean) { this.formDisabled = disabled; }
  formStateRestoreCallback(state: unknown) { if (typeof state === 'string') this.value = state; }
  protected updated() {
    this.fc.sync({ value: this.value ?? '', missing: this.required && !this.value, message: kitStrings.valueMissing, anchor: this.renderRoot.querySelector('input') });
  }

  firstUpdated() {
    if (this.autofocus && autofocusAllowed()) requestAnimationFrame(() => this.focus());
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
          ?required=${this.required} ?disabled=${this.disabled || this.formDisabled} aria-invalid=${this.error ? 'true' : 'false'} aria-label=${this.label || this.placeholder || nothing}
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
      position: absolute; inset-inline-start: var(--mx-space-2); top: calc(100% + 4px); z-index: var(--mx-z-popover); min-width: 220px; max-width: 320px;
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
    if (this.autofocus && autofocusAllowed()) requestAnimationFrame(() => this.ta?.focus());
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
          aria-autocomplete=${this.mentions ? 'list' : nothing}
          aria-controls=${open ? this.listId : nothing} aria-activedescendant=${open ? `${this.listId}-${this.suggest!.active}` : nothing}
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
        ${list.map((c, i) => html`<li role="option" id=${`${this.listId}-${i}`} aria-selected=${i === this.suggest!.active ? 'true' : 'false'}
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
  /** Radio-group keys: ←/→ (mirrored in RTL) and ↑/↓ move to the previous / next option and pick it, Home / End the first / last. */
  private onKey(e: KeyboardEvent) {
    const n = this.options.length;
    if (!n) return;
    const i = this.options.findIndex((o) => o.value === this.value);
    let to: number;
    if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = n - 1;
    else {
      const d = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : inlineStep(e.key, directionOf(this));
      if (!d) return;
      to = i < 0 ? (d > 0 ? 0 : n - 1) : (i + d + n) % n;
    }
    e.preventDefault();
    const next = this.options[to];
    if (next && next.value !== this.value) this.pick(next.value);
    this.updateComplete.then(() => (this.renderRoot.querySelector('[tabindex="0"]') as HTMLElement | null)?.focus());
  }
  /** When the options don't fit (a scrolling strip on phones), keep the chosen one in view (either direction). */
  protected updated(changed: Map<string, unknown>) {
    if (!changed.has('value') && !changed.has('options')) return;
    const g = this.renderRoot.querySelector<HTMLElement>('.group');
    const b = g?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!g || !b || g.scrollWidth <= g.clientWidth) return;
    const pad = 16;
    const gr = g.getBoundingClientRect(), br = b.getBoundingClientRect();
    if (br.left < gr.left + pad) g.scrollLeft -= gr.left + pad - br.left;
    else if (br.right > gr.right - pad) g.scrollLeft += br.right - (gr.right - pad);
  }

  render() {
    /* roving tabindex: the checked option, or the first one while none is (else the group is unreachable by Tab) */
    const tabbable = this.options.some((o) => o.value === this.value) ? this.value : this.options[0]?.value;
    return html`<div class="group" role="radiogroup" aria-label=${this.label || nothing} @keydown=${this.onKey}>
      ${this.options.map((o) => html`<button role="radio" aria-checked=${o.value === this.value ? 'true' : 'false'}
        tabindex=${o.value === tabbable ? 0 : -1} @click=${() => this.pick(o.value)} aria-label=${o.icon ? o.label : nothing} title=${o.icon ? o.label : nothing}>
        ${o.icon ? html`<mx-icon name=${o.icon} size="14"></mx-icon>` : nothing}<span class="lbl">${o.label}</span></button>`)}
    </div>`;
  }
}
define('mx-segmented', MxSegmented);

declare global {
  interface HTMLElementTagNameMap { 'mx-input': MxInput; 'mx-textarea': MxTextarea; 'mx-segmented': MxSegmented }
}

/**
 * On/off switch (`role="switch"`). Label goes in the default slot; emits `mx-change` with the new boolean.
 * Form-associated like a checkbox: submits `value` (default "on") under `name` while checked, nothing otherwise;
 * `required` means it must be on; resets to its `checked` attribute as first rendered.
 */
export class MxSwitch extends MxElement {
  static formAssociated = true;
  static properties = {
    checked: { type: Boolean, reflect: true }, disabled: { type: Boolean, reflect: true },
    name: { type: String, reflect: true }, value: { type: String }, required: { type: Boolean, reflect: true },
    formDisabled: { state: true },
  };
  declare checked: boolean;
  declare disabled: boolean;
  declare name: string;
  declare value: string;
  declare required: boolean;
  declare formDisabled: boolean;
  private fc = new FormControl(this);
  private defaultChecked: boolean | null = null;
  constructor() {
    super();
    this.checked = false;
    this.disabled = false;
    this.name = '';
    this.value = 'on';
    this.required = false;
    this.formDisabled = false;
  }
  connectedCallback() {
    super.connectedCallback();
    this.defaultChecked ??= this.hasAttribute('checked');
  }
  get form(): HTMLFormElement | null { return this.fc.form; }
  get validity(): ValidityState | undefined { return this.fc.validity; }
  get validationMessage(): string { return this.fc.validationMessage; }
  checkValidity(): boolean { return this.fc.checkValidity(); }
  reportValidity(): boolean { return this.fc.reportValidity(); }
  formResetCallback() { this.checked = this.defaultChecked ?? false; }
  formDisabledCallback(disabled: boolean) { this.formDisabled = disabled; }
  formStateRestoreCallback(state: unknown) { if (state === 'on' || state === 'off') this.checked = state === 'on'; }
  protected updated() {
    this.fc.sync({
      value: this.checked ? this.value || 'on' : null, state: this.checked ? 'on' : 'off',
      missing: this.required && !this.checked, message: kitStrings.valueMissing, anchor: this.renderRoot.querySelector('button'),
    });
  }
  static styles = [base, css`
    /* Never stretch in grid/flex parents: the hit area must be exactly the visible control. */
    :host { display: inline-flex; width: fit-content; justify-self: start; align-self: center; }
    button { all: unset; display: inline-flex; align-items: center; gap: var(--mx-space-2); cursor: pointer; font-size: var(--mx-text-md); color: var(--mx-text-secondary); }
    :host([disabled]) button, button[aria-disabled='true'] { cursor: not-allowed; opacity: 0.55; }
    .track { position: relative; width: 28px; height: 16px; flex: none; border-radius: 8px; background: var(--mx-surface-active);
      box-shadow: inset 0 0 0 1px var(--mx-border-strong); transition: background-color var(--mx-duration-base) var(--mx-ease-out); }
    .thumb { position: absolute; top: 2px; inset-inline-start: 2px; width: 12px; height: 12px; border-radius: 50%; background: var(--mx-text-muted);
      transition: transform var(--mx-duration-base) var(--mx-ease-out), background-color var(--mx-duration-base) var(--mx-ease-out); }
    :host([checked]) .track { background: var(--mx-accent); box-shadow: none; }
    :host([checked]) .thumb { transform: translateX(12px); background: var(--mx-on-accent); }
    :host([checked]:dir(rtl)) .thumb { transform: translateX(-12px); }
    button:focus-visible .track { box-shadow: var(--mx-focus-ring); }
  `];
  private toggle() {
    if (this.disabled || this.formDisabled) return;
    this.checked = !this.checked;
    this.emit('mx-change', this.checked);
  }
  render() {
    return html`<button role="switch" aria-checked=${this.checked ? 'true' : 'false'} aria-disabled=${this.disabled || this.formDisabled ? 'true' : 'false'}
      aria-required=${this.required ? 'true' : nothing} @click=${this.toggle}>
      <span class="track"><span class="thumb"></span></span><slot></slot></button>`;
  }
}
define('mx-switch', MxSwitch);
