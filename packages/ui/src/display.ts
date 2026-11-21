import { css, html, nothing, svg } from 'lit';
import { base, define, MxElement, kitStrings } from './base.js';
import './icons.js';

/* ───────────── mx-kbd ───────────── */
export class MxKbd extends MxElement {
  static styles = [base, css`
    :host {
      display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 4px;
      border-radius: var(--mx-radius-sm); border: 1px solid var(--mx-border-strong); background: var(--mx-surface);
      color: var(--mx-text-muted); font: 500 var(--mx-text-xs) / 1 var(--mx-font-sans); font-variant-numeric: tabular-nums;
    }
  `];
  render() {
    return html`<slot></slot>`;
  }
}
define('mx-kbd', MxKbd);

/* ───────────── mx-avatar ───────────── */
export class MxAvatar extends MxElement {
  static properties = { name: { type: String }, color: { type: String }, size: { type: Number } };
  declare name: string;
  declare color: string;
  declare size: number;
  constructor() {
    super();
    this.name = '';
    this.color = '';
    this.size = 20;
  }
  static styles = [base, css`
    :host { display: inline-flex; flex: none; }
    span {
      display: inline-flex; align-items: center; justify-content: center; border-radius: var(--mx-radius-full);
      color: var(--mx-gray-0); font-weight: var(--mx-weight-semibold); letter-spacing: 0.02em; line-height: 1;
    }
    span.empty { border: 1px dashed var(--mx-text-faint); color: var(--mx-text-faint); background: transparent; }
  `];
  render() {
    const s = this.size;
    if (!this.name) {
      return html`<span class="empty" style="width:${s}px;height:${s}px" role="img" aria-label=${kitStrings.unassigned}><mx-icon name="user" size=${Math.round(s * 0.6)}></mx-icon></span>`;
    }
    const initials = this.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
    return html`<span style="width:${s}px;height:${s}px;font-size:${Math.round(s * 0.42)}px;background:${this.color || 'var(--mx-gray-600)'}"
      role="img" aria-label=${this.name} title=${this.name}>${initials}</span>`;
  }
}
define('mx-avatar', MxAvatar);

/* ───────────── mx-status-icon ───────────── */
export type StatusKind = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'canceled';
const STATUS_COLOR: Record<StatusKind, string> = {
  backlog: 'var(--mx-text-faint)',
  todo: 'var(--mx-text-secondary)',
  in_progress: 'var(--mx-yellow-500)',
  in_review: 'var(--mx-green-500)',
  done: 'var(--mx-indigo-400)',
  canceled: 'var(--mx-text-faint)',
};

/** Progress-ring status glyph: the fill grows as work advances along the pipeline. */
export class MxStatusIcon extends MxElement {
  static properties = { status: { type: String }, size: { type: Number } };
  declare status: StatusKind;
  declare size: number;
  constructor() {
    super();
    this.status = 'todo';
    this.size = 14;
  }
  static styles = [base, css`:host { display: inline-flex; flex: none; line-height: 0; }`];
  render() {
    const c = STATUS_COLOR[this.status] ?? STATUS_COLOR.todo;
    const fill: Record<StatusKind, number> = { backlog: 0, todo: 0, in_progress: 0.5, in_review: 0.75, done: 1, canceled: 1 };
    const f = fill[this.status] ?? 0;
    const r = 3.5;
    const circ = 2 * Math.PI * r;
    let inner = svg``;
    if (this.status === 'done') {
      inner = svg`<circle cx="7" cy="7" r="6" fill=${c}/><path d="m4.5 7.1 1.75 1.75L9.6 5.5" fill="none" stroke="var(--mx-bg)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    } else if (this.status === 'canceled') {
      inner = svg`<circle cx="7" cy="7" r="6" fill=${c}/><path d="m5 5 4 4M9 5 5 9" stroke="var(--mx-bg)" stroke-width="1.5" stroke-linecap="round"/>`;
    } else {
      inner = svg`
        <circle cx="7" cy="7" r="6" fill="none" stroke=${c} stroke-width="1.5" stroke-dasharray=${this.status === 'backlog' ? '1.4 1.6' : 'none'}/>
        ${f > 0 ? svg`<circle cx="7" cy="7" r=${r} fill="none" stroke=${c} stroke-width=${r * 2}
          stroke-dasharray="${circ * f} ${circ}" transform="rotate(-90 7 7)"/>` : nothing}`;
    }
    return html`<svg width=${this.size} height=${this.size} viewBox="0 0 14 14" aria-hidden="true">${inner}</svg>`;
  }
}
define('mx-status-icon', MxStatusIcon);

/* ───────────── mx-priority-icon ───────────── */
export class MxPriorityIcon extends MxElement {
  static properties = { priority: { type: Number }, size: { type: Number } };
  declare priority: number;
  declare size: number;
  constructor() {
    super();
    this.priority = 0;
    this.size = 14;
  }
  static styles = [base, css`:host { display: inline-flex; flex: none; line-height: 0; color: var(--mx-text-muted); }`];
  render() {
    const p = this.priority;
    let g;
    if (p === 1) {
      g = svg`<rect x="1" y="1" width="12" height="12" rx="3" fill="var(--mx-warning)"/>
        <path d="M7 3.75v4" stroke="var(--mx-bg)" stroke-width="1.75" stroke-linecap="round"/><circle cx="7" cy="10.1" r="1" fill="var(--mx-bg)"/>`;
    } else if (p === 0) {
      g = svg`<path d="M2.5 7h1.5M6.25 7h1.5M10 7h1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`;
    } else {
      // high=3 bars lit, medium=2, low=1
      const lit = 5 - p;
      g = svg`${[0, 1, 2].map((i) => svg`<rect x=${1.5 + i * 4} y=${9 - i * 3} width="3" height=${3 + i * 3} rx="1"
        fill="currentColor" opacity=${i < lit ? 1 : 0.3}/>`)}`;
    }
    return html`<svg width=${this.size} height=${this.size} viewBox="0 0 14 14" aria-hidden="true">${g}</svg>`;
  }
}
define('mx-priority-icon', MxPriorityIcon);

/* ───────────── mx-chip (labels, filters) ───────────── */
export class MxChip extends MxElement {
  static properties = { color: { type: String }, removable: { type: Boolean }, interactive: { type: Boolean, reflect: true } };
  declare color: string;
  declare removable: boolean;
  declare interactive: boolean;
  constructor() {
    super();
    this.color = '';
    this.removable = false;
    this.interactive = false;
  }
  static styles = [base, css`
    :host {
      display: inline-flex; align-items: center; gap: 6px; height: var(--mx-control-xs); padding: 0 8px; max-width: 100%; box-sizing: border-box;
      border: 1px solid var(--mx-border-strong); border-radius: var(--mx-radius-full);
      color: var(--mx-text-secondary); font-size: var(--mx-text-sm); white-space: nowrap;
    }
    :host([interactive]) { cursor: pointer; height: var(--mx-control-sm); }
    :host([interactive]:hover) { background: var(--mx-surface-hover); color: var(--mx-text); }
    .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
    .label { overflow: hidden; text-overflow: ellipsis; }
    button { all: unset; display: inline-flex; cursor: pointer; color: var(--mx-text-faint); margin-inline-end: -3px; border-radius: 50%; }
    button:hover { color: var(--mx-text); }
    button:focus-visible { box-shadow: var(--mx-focus-ring); }
  `];
  render() {
    return html`${this.color ? html`<span class="dot" style="background:${this.color}"></span>` : html`<slot name="icon"></slot>`}
      <span class="label"><slot></slot></span>
      ${this.removable ? html`<button aria-label=${kitStrings.remove} @click=${(e: Event) => { e.stopPropagation(); this.emit('mx-remove'); }}><mx-icon name="x" size="12"></mx-icon></button>` : nothing}`;
  }
}
define('mx-chip', MxChip);

/* ───────────── mx-spinner ───────────── */
export class MxSpinner extends MxElement {
  static properties = { size: { type: Number } };
  declare size: number;
  constructor() {
    super();
    this.size = 16;
  }
  static styles = [base, css`
    :host { display: inline-flex; color: var(--mx-text-muted); }
    span { border-radius: 50%; border: 1.5px solid currentColor; border-right-color: transparent; animation: spin 700ms linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `];
  render() {
    return html`<span role="status" aria-label=${kitStrings.loading} style="width:${this.size}px;height:${this.size}px"></span>`;
  }
}
define('mx-spinner', MxSpinner);

/* ───────────── mx-empty ───────────── */
export class MxEmpty extends MxElement {
  static properties = { icon: { type: String }, heading: { type: String } };
  declare icon: string;
  declare heading: string;
  constructor() {
    super();
    this.icon = 'cube';
    this.heading = '';
  }
  static styles = [base, css`
    :host { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--mx-space-3);
      padding: var(--mx-space-12) var(--mx-space-6); text-align: center; color: var(--mx-text-muted); }
    .glyph { display: grid; place-items: center; width: 48px; height: 48px; border: 1px solid var(--mx-border-strong);
      border-radius: var(--mx-radius-lg); color: var(--mx-accent-text); }
    h3 { margin: 0; font: var(--mx-weight-semibold) var(--mx-text-lg) / 1.3 var(--mx-font-display); color: var(--mx-text); letter-spacing: -0.01em; }
    p { margin: 0; max-width: 40ch; font-size: var(--mx-text-md); line-height: var(--mx-leading-normal); }
  `];
  render() {
    return html`<span class="glyph"><mx-icon name=${this.icon} size="22"></mx-icon></span>
      <h3>${this.heading}</h3><p><slot></slot></p><slot name="action"></slot>`;
  }
}
define('mx-empty', MxEmpty);

declare global {
  interface HTMLElementTagNameMap {
    'mx-kbd': MxKbd; 'mx-avatar': MxAvatar; 'mx-status-icon': MxStatusIcon; 'mx-priority-icon': MxPriorityIcon;
    'mx-chip': MxChip; 'mx-spinner': MxSpinner; 'mx-empty': MxEmpty;
  }
}
