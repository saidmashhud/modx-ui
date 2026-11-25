import { css, html, nothing } from 'lit';
import { base, define, kitStrings, MxElement } from './base.js';
import './icons.js';

/**
 * Sidebar navigation link. Renders a real <a> so middle-click / copy link work; emits mx-navigate on plain clicks.
 *
 * @tagname mx-nav-item
 * @fires mx-navigate - A plain left click (modified clicks open the link as usual); detail: `href`.
 * @slot - The label.
 */
export class MxNavItem extends MxElement {
  static properties = {
    href: { type: String },
    icon: { type: String },
    count: { type: Number },
    active: { type: Boolean, reflect: true },
    depth: { type: Number },
    color: { type: String },
  };
  /** The link. */
  declare href: string;
  /** Leading icon. */
  declare icon: string;
  /** A count after the label. */
  declare count: number | undefined;
  /** The current page (`aria-current="page"`). */
  declare active: boolean;
  /** Nesting level (indent). */
  declare depth: number;
  /** A colour swatch instead of the icon. */
  declare color: string;

  constructor() {
    super();
    this.href = '#';
    this.icon = '';
    this.active = false;
    this.depth = 0;
    this.color = '';
  }

  static styles = [base, css`
    :host { display: block; }
    a {
      display: flex; align-items: center; gap: var(--mx-space-2); height: var(--mx-control-sm); padding: 0 var(--mx-space-2);
      border-radius: var(--mx-radius-md); color: var(--mx-text-muted); text-decoration: none; font-size: var(--mx-text-md);
      font-weight: var(--mx-weight-medium);
      transition: background-color var(--mx-duration-fast) var(--mx-ease-out), color var(--mx-duration-fast) var(--mx-ease-out);
    }
    a:hover { background: var(--mx-surface-hover); color: var(--mx-text); }
    :host([active]) a { background: var(--mx-surface-active); color: var(--mx-text); }
    a:focus-visible { outline: none; box-shadow: var(--mx-focus-ring); }
    /* Touch: roomier rows (a drawer is tapped, not pointed at). */
    @media (pointer: coarse) { a { height: 40px; -webkit-tap-highlight-color: transparent; } }
    .swatch { width: 14px; height: 14px; border-radius: var(--mx-radius-sm); display: inline-grid; place-items: center;
      font: 600 8px/1 var(--mx-font-sans); color: var(--mx-gray-0); }
    .label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .count { font-size: var(--mx-text-sm); font-weight: var(--mx-weight-medium); color: var(--mx-accent-text); font-variant-numeric: tabular-nums; }
  `];

  private onClick(e: MouseEvent) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    this.emit('mx-navigate', this.href);
  }

  render() {
    return html`<a href=${this.href} style="padding-inline-start:${8 + this.depth * 18}px" aria-current=${this.active ? 'page' : nothing} @click=${this.onClick}>
      ${this.color ? html`<span class="swatch" style="background:${this.color}"></span>` : this.icon ? html`<mx-icon name=${this.icon}></mx-icon>` : nothing}
      <span class="label"><slot></slot></span>
      ${this.count !== undefined ? html`<span class="count">${this.count}</span>` : nothing}
    </a>`;
  }
}
define('mx-nav-item', MxNavItem);

export interface Crumb { label: string; href: string }

/**
 * Breadcrumb trail with a leading "back" button that goes to the nearest ancestor.
 * `items` are the ancestors only (the current page is the view's own heading); empty → renders nothing.
 * Real <a> links (middle-click works); plain clicks emit `mx-navigate` with the href.
 *
 * @tagname mx-breadcrumbs
 * @fires mx-navigate - A crumb or the back button was clicked; detail: the href.
 */
export class MxBreadcrumbs extends MxElement {
  static properties = {
    items: { attribute: false },
    current: { type: String },
    backLabel: { type: String, attribute: 'back-label' },
  };
  /** Ancestors only, `{ label, href }[]` (the current page is the view's heading); empty renders nothing. */
  declare items: Crumb[];
  /** The current page's short name, after the trail. */
  declare current: string;
  /** Accessible name of the back button (default: the parent's label). */
  declare backLabel: string;

  constructor() {
    super();
    this.items = [];
    this.current = '';
    this.backLabel = '';
  }

  static styles = [base, css`
    :host { display: flex; align-items: center; gap: 2px; min-width: 0; flex: 0 1 auto; }
    :host([hidden]) { display: none; }
    .back { all: unset; flex: none; display: grid; place-items: center; width: var(--mx-control-sm, 28px); height: var(--mx-control-sm, 28px);
      border-radius: var(--mx-radius-md); color: var(--mx-text-muted); cursor: pointer; }
    .back:hover { background: var(--mx-surface-hover); color: var(--mx-text); }
    .back:focus-visible { box-shadow: var(--mx-focus-ring); }
    ol { display: flex; align-items: center; gap: 2px; min-width: 0; margin: 0; padding: 0; list-style: none; overflow: hidden; white-space: nowrap; font-size: var(--mx-text-md); }
    li { display: flex; align-items: center; gap: 2px; min-width: 0; }
    li:not(:last-child) { flex: none; max-width: 200px; }
    a { color: var(--mx-text-muted); text-decoration: none; padding: 2px 4px; border-radius: var(--mx-radius-sm); overflow: hidden; text-overflow: ellipsis; }
    a:hover { background: var(--mx-surface-hover); color: var(--mx-text); }
    a:focus-visible { box-shadow: var(--mx-focus-ring); }
    .cur { color: var(--mx-text); font-weight: var(--mx-weight-medium); overflow: hidden; text-overflow: ellipsis; padding: 2px 4px; }
    .sep { color: var(--mx-text-faint); flex: none; }
    /* phones: the back button only — the view's own heading names the page */
    @media (max-width: 720px) { nav { display: none; } }
  `];

  private go(e: MouseEvent, href: string) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    this.emit('mx-navigate', href);
  }

  render() {
    const items = this.items ?? [];
    if (!items.length) return nothing;
    const parent = items[items.length - 1]!;
    return html`<button class="back" type="button" aria-label=${this.backLabel || parent.label} title=${this.backLabel || parent.label}
        @click=${(e: MouseEvent) => this.go(e, parent.href)}><mx-icon name="chevron-left" size="16"></mx-icon></button>
      <nav aria-label=${kitStrings.breadcrumb}><ol>
        ${items.map((c, i) => html`<li class=${i < items.length - 1 ? 'far' : ''}><a href=${c.href} @click=${(e: MouseEvent) => this.go(e, c.href)}>${c.label}</a>
          ${i < items.length - 1 || this.current ? html`<mx-icon class="sep" name="chevron-right" size="12"></mx-icon>` : nothing}</li>`)}
        ${this.current ? html`<li><span class="cur" aria-current="page">${this.current}</span></li>` : nothing}
      </ol></nav>`;
  }
}
define('mx-breadcrumbs', MxBreadcrumbs);

declare global {
  interface HTMLElementTagNameMap { 'mx-nav-item': MxNavItem; 'mx-breadcrumbs': MxBreadcrumbs }
}
