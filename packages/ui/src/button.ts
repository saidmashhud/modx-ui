import { css, html, nothing } from 'lit';
import { base, define, MxElement, spinner } from './base.js';
import { FormControl } from './form-control.js';
import './icons.js';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

/**
 * Button. The primary variant is the call to action: solid accent fill.
 * Renders a native <button> inside the shadow root. Form-associated: `type="submit"` submits and `type="reset"`
 * resets the form the button belongs to (its `form` attribute or nearest <form>, through ElementInternals; the
 * nearest <form> where ElementInternals is missing). A disabled <fieldset> disables it.
 */
export class MxButton extends MxElement {
  static formAssociated = true;
  static properties = {
    formDisabled: { state: true },
    description: { type: String, attribute: 'aria-description' },
    variant: { type: String, reflect: true },
    size: { type: String, reflect: true },
    icon: { type: String },
    iconEnd: { type: String, attribute: 'icon-end' },
    disabled: { type: Boolean, reflect: true },
    loading: { type: Boolean, reflect: true },
    type: { type: String },
    label: { type: String },
    pressed: { type: Boolean, reflect: true },
  };
  declare variant: ButtonVariant;
  declare size: 'sm' | 'md' | 'lg';
  declare icon: string;
  declare iconEnd: string;
  declare disabled: boolean;
  declare loading: boolean;
  declare type: 'button' | 'submit' | 'reset';
  declare formDisabled: boolean;
  /** The host's `aria-description` (an mx-tooltip around the button sets it), passed on to the focusable inner button. */
  declare description: string;
  private fc = new FormControl(this);
  declare label: string;
  declare pressed: boolean;

  static shadowRootOptions = { ...MxElement.shadowRootOptions, delegatesFocus: true };

  constructor() {
    super();
    this.variant = 'secondary';
    this.size = 'md';
    this.icon = '';
    this.iconEnd = '';
    this.disabled = false;
    this.loading = false;
    this.type = 'button';
    this.label = '';
    this.pressed = false;
    this.formDisabled = false;
  }

  /** The form this button submits or resets. */
  get form(): HTMLFormElement | null { return this.fc.form ?? this.closest('form'); }
  formDisabledCallback(disabled: boolean) { this.formDisabled = disabled; }

  static styles = [base, spinner, css`
    :host { display: inline-flex; }
    button {
      display: inline-flex; align-items: center; justify-content: center; gap: var(--mx-space-2);
      height: var(--mx-control-md); padding: 0 var(--mx-space-3); border-radius: var(--mx-radius-md);
      border: 1px solid var(--mx-border-strong); background: var(--mx-surface-raised); color: var(--mx-text);
      font-size: var(--mx-text-md); font-weight: var(--mx-weight-medium); letter-spacing: 0.005em; white-space: nowrap;
      cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; width: 100%; position: relative;
      transition: background-color var(--mx-duration-fast) var(--mx-ease-out), border-color var(--mx-duration-fast) var(--mx-ease-out), color var(--mx-duration-fast) var(--mx-ease-out);
    }
    button:hover { background: var(--mx-surface-overlay); }
    button:active { background: var(--mx-surface-active); }
    :host([pressed]) button { background: var(--mx-surface-active); color: var(--mx-text); }

    :host([variant='primary']) button { background: var(--mx-accent); border-color: transparent; color: var(--mx-on-accent); }
    :host([variant='primary']) button:hover { background: var(--mx-accent-hover); }
    :host([variant='primary']) button:active { background: var(--mx-accent-pressed); }

    :host([variant='ghost']) button { background: transparent; border-color: transparent; color: var(--mx-text-muted); }
    :host([variant='ghost']) button:hover { background: var(--mx-surface-hover); color: var(--mx-text); }
    :host([variant='ghost'][pressed]) button { background: var(--mx-surface-active); color: var(--mx-text); }

    :host([variant='danger']) button { background: transparent; border-color: color-mix(in srgb, var(--mx-danger) 45%, transparent); color: var(--mx-danger); }
    :host([variant='danger']) button:hover { background: color-mix(in srgb, var(--mx-danger) 12%, transparent); }

    :host([size='sm']) button { height: var(--mx-control-sm); padding: 0 var(--mx-space-2); font-size: var(--mx-text-sm); gap: var(--mx-space-1); }
    :host([size='lg']) button {
      height: var(--mx-control-xl); padding: 0 var(--mx-space-8); font-size: var(--mx-text-lg); font-weight: var(--mx-weight-light);
      text-transform: uppercase; letter-spacing: 0.02em; border-radius: var(--mx-radius-lg);
    }
    :host([icon-only]) button { padding: 0; width: var(--mx-control-md); }
    :host([icon-only][size='sm']) button { width: var(--mx-control-sm); }
    /* collapse: label hidden on phones (kept as the accessible name), icon-only look */
    @media (max-width: 720px) {
      :host([collapse]) button { padding: 0; width: var(--mx-control-md); }
      :host([collapse][size='sm']) button { width: var(--mx-control-sm); }
      :host([collapse]) slot { display: none; }
    }

    /* Touch: the hit area grows to at least 44 × 44 px around small buttons without changing how they look. */
    @media (pointer: coarse) {
      button::after { content: ''; position: absolute; inset: min(0px, calc((var(--mx-control-md) - 44px) / 2)); }
      :host([size='sm']) button::after { inset: min(0px, calc((var(--mx-control-sm) - 44px) / 2)); }
    }

    :host([disabled]) button, :host([loading]) button { opacity: 0.5; cursor: default; pointer-events: none; }
    .spinner { width: 12px; height: 12px; }
    ::slotted(mx-kbd) { margin-inline-start: var(--mx-space-1); }
  `];

  private onClick(e: MouseEvent) {
    if (this.disabled || this.loading || this.formDisabled) {
      e.stopImmediatePropagation();
      return;
    }
    if (this.type === 'submit') this.form?.requestSubmit();
    else if (this.type === 'reset') this.form?.reset();
  }

  render() {
    return html`<button
      part="button"
      type="button"
      ?disabled=${this.disabled || this.formDisabled}
      aria-busy=${this.loading ? 'true' : 'false'}
      aria-pressed=${this.hasAttribute('pressed') || this.pressed ? 'true' : nothing}
      aria-label=${this.label || nothing}
      aria-description=${this.description || nothing}
      @click=${this.onClick}
    >
      ${this.loading ? html`<span class="spinner" aria-hidden="true"></span>` : this.icon ? html`<mx-icon name=${this.icon}></mx-icon>` : nothing}
      <slot></slot>
      ${this.iconEnd ? html`<mx-icon name=${this.iconEnd}></mx-icon>` : nothing}
    </button>`;
  }
}
define('mx-button', MxButton);

declare global {
  interface HTMLElementTagNameMap { 'mx-button': MxButton }
}
