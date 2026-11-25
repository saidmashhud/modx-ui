import { css, html, LitElement, nothing } from 'lit';
import { iso, isoStyles } from '@saidmashhud/modx-ui';
import { applyTheme, type Theme } from '@saidmashhud/modx-tokens';
import { allTags } from './manifest.js';
import { navGroups, neighbours } from './nav.js';

const THEME_KEY = 'modx-docs-theme';
export function storedTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === 'light' || t === 'dark' || t === 'auto') return t;
  } catch { /* storage blocked */ }
  return 'auto';
}
applyTheme(storedTheme());

const VERSION = '0.2.0';

/**
 * Page frame: top bar (wordmark, theme, repository), the site map, the page in the middle, previous / next at the end.
 * Under 900 px the site map is a drawer behind the menu button.
 */
export class DocShell extends LitElement {
  static properties = { page: { type: String }, navOpen: { state: true }, theme: { state: true } };
  declare page: string;
  declare navOpen: boolean;
  declare theme: Theme;

  constructor() {
    super();
    this.page = 'index';
    this.navOpen = false;
    this.theme = storedTheme();
  }

  static styles = [isoStyles, css`
    :host {
      display: grid; grid-template-columns: 260px minmax(0, 1fr); grid-template-rows: auto 1fr;
      min-height: 100dvh; background: var(--mx-bg); color: var(--mx-text);
    }
    header {
      grid-column: 1 / -1; position: sticky; top: 0; z-index: 20; height: 56px; box-sizing: border-box;
      display: flex; align-items: center; gap: var(--mx-space-3); padding-inline: var(--mx-space-5) var(--mx-space-4);
      border-block-end: 1px solid var(--mx-border); background: color-mix(in srgb, var(--mx-bg) 86%, transparent);
      backdrop-filter: saturate(1.4) blur(10px); -webkit-backdrop-filter: saturate(1.4) blur(10px);
    }
    .brand { display: inline-flex; align-items: center; gap: 10px; color: var(--mx-text); text-decoration: none; margin-inline-end: auto; }
    .brand .mark { width: 30px; height: 24px; display: inline-block; }
    .brand b { font: var(--mx-weight-semibold) 17px/1 var(--mx-font-display); letter-spacing: -0.02em; }
    .brand small { font: var(--mx-weight-medium) var(--mx-text-xs)/1 var(--mx-font-sans); color: var(--mx-text-muted);
      font-variant-numeric: tabular-nums; padding: 3px 6px; border: 1px solid var(--mx-border-strong); border-radius: var(--mx-radius-full); }
    .repo { display: inline-flex; align-items: center; gap: 4px; color: var(--mx-text-muted); text-decoration: none; font-size: var(--mx-text-sm);
      padding: 6px 8px; border-radius: var(--mx-radius-md); }
    .repo:hover { color: var(--mx-text); background: var(--mx-surface-hover); }
    .repo:focus-visible, .brand:focus-visible { outline: none; box-shadow: var(--mx-focus-ring); border-radius: var(--mx-radius-md); }
    .menu { display: none; }

    aside {
      position: sticky; top: 56px; align-self: start; height: calc(100dvh - 56px); overflow-y: auto; box-sizing: border-box;
      padding: var(--mx-space-5) var(--mx-space-3) var(--mx-space-10); border-inline-end: 1px solid var(--mx-border);
      overscroll-behavior: contain; scrollbar-width: thin;
    }
    .group + .group { margin-block-start: var(--mx-space-5); }
    .group h2 { margin: 0 0 6px; padding-inline: var(--mx-space-2); font: var(--mx-weight-semibold) var(--mx-text-xs)/1.4 var(--mx-font-sans);
      letter-spacing: var(--mx-tracking-eyebrow); text-transform: uppercase; color: var(--mx-text-muted); }
    .group mx-nav-item.tag { --label-font: var(--mx-font-sans); }

    main { min-width: 0; padding: var(--mx-space-10) clamp(20px, 5vw, 72px) calc(var(--mx-space-12) * 1.5); }
    .col { max-width: 860px; }
    .pager { display: flex; justify-content: space-between; gap: var(--mx-space-4); margin-block-start: calc(var(--mx-space-12) * 1.5);
      padding-block-start: var(--mx-space-5); border-block-start: 1px solid var(--mx-border); }
    .pager a { display: grid; gap: 2px; text-decoration: none; color: var(--mx-text); padding: var(--mx-space-2) var(--mx-space-3);
      border-radius: var(--mx-radius-md); min-width: 0; }
    .pager a:hover { background: var(--mx-surface-hover); }
    .pager a:focus-visible { outline: none; box-shadow: var(--mx-focus-ring); }
    .pager .next { text-align: end; margin-inline-start: auto; }
    .pager small { color: var(--mx-text-muted); font-size: var(--mx-text-sm); }
    .pager b { font: var(--mx-weight-medium) var(--mx-text-md)/1.3 var(--mx-font-sans); overflow: hidden; text-overflow: ellipsis; }
    .scrim { display: none; }

    @media (max-width: 900px) {
      :host { grid-template-columns: minmax(0, 1fr); }
      header { padding-inline: var(--mx-space-2) var(--mx-space-3); gap: var(--mx-space-2); }
      .menu { display: inline-flex; }
      .repo span { display: none; }
      .brand b { white-space: nowrap; }
      .brand small { display: none; }
      aside {
        position: fixed; z-index: 30; inset-block: 56px 0; inset-inline-start: 0; width: min(300px, 86vw); height: auto;
        background: var(--mx-bg); border-inline-end: 1px solid var(--mx-border); box-shadow: var(--mx-shadow-dialog);
        transform: translateX(-104%); visibility: hidden;
        transition: transform var(--mx-duration-base) var(--mx-ease-out), visibility 0s linear var(--mx-duration-base);
      }
      :host([nav-open]) aside { transform: none; visibility: visible; transition: transform var(--mx-duration-base) var(--mx-ease-out); }
      :host([nav-open]) .scrim { display: block; position: fixed; inset: 56px 0 0; z-index: 25; background: var(--mx-backdrop); }
      main { padding: var(--mx-space-8) var(--mx-space-4) var(--mx-space-12); }
      .pager { flex-direction: column; }
      .pager .next { margin-inline-start: 0; }
    }
  `];

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this.onKey);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.onKey);
  }
  private onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && this.navOpen) this.setNav(false); };

  private setNav(open: boolean) {
    this.navOpen = open;
    this.toggleAttribute('nav-open', open);
    if (open) this.updateComplete.then(() => (this.renderRoot.querySelector('mx-nav-item[active]') as HTMLElement | null)?.scrollIntoView({ block: 'center' }));
  }

  private setTheme(t: Theme) {
    this.theme = t;
    applyTheme(t);
    try { localStorage.setItem(THEME_KEY, t); } catch { /* storage blocked */ }
    document.dispatchEvent(new CustomEvent('doc-theme', { detail: t }));
  }

  protected firstUpdated() {
    /* keep the current page in view in a long site map */
    const active = this.renderRoot.querySelector<HTMLElement>('mx-nav-item[active]');
    const aside = this.renderRoot.querySelector('aside');
    if (active && aside && active.offsetTop > aside.clientHeight - 80) aside.scrollTop = active.offsetTop - aside.clientHeight / 2;
  }

  render() {
    const groups = navGroups(allTags);
    const { prev, next } = neighbours(groups, this.page);
    const mark = iso([{ x: 0, y: 0, z: 0, w: 2, d: 2, h: 1 }, { x: 0, y: 0, z: 1, w: 2, d: 2, h: 1, kind: 'accent' }], 6);
    return html`
      <header>
        <mx-button class="menu" variant="ghost" icon="sidebar" icon-only label="Site map" aria-expanded=${this.navOpen ? 'true' : 'false'}
          @click=${() => this.setNav(!this.navOpen)}></mx-button>
        <a class="brand" href="index.html"><span class="mark">${mark}</span><b>modx-ui</b><small>${VERSION}</small></a>
        <mx-segmented size="sm" label="Theme" .value=${this.theme}
          .options=${[{ value: 'auto', label: 'Auto' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
          @mx-change=${(e: CustomEvent<Theme>) => this.setTheme(e.detail)}></mx-segmented>
        <a class="repo" href="https://github.com/saidmashhud/modx-ui" aria-label="GitHub repository"><span>GitHub</span><mx-icon name="arrow-up-right" size="14"></mx-icon></a>
      </header>
      <aside aria-label="Site map" @mx-navigate=${(e: CustomEvent<string>) => { location.href = e.detail; }}>
        <nav aria-label="Documentation">
          ${groups.map((g) => html`<section class="group" aria-labelledby="g-${g.title}">
            <h2 id="g-${g.title}">${g.title}</h2>
            ${g.links.map((l) => html`<mx-nav-item href=${l.href} ?active=${l.page === this.page}>${l.title.startsWith('mx-') ? `<${l.title}>` : l.title}</mx-nav-item>`)}
          </section>`)}
        </nav>
      </aside>
      <div class="scrim" @click=${() => this.setNav(false)}></div>
      <main id="content">
        <div class="col">
          <slot></slot>
          <nav class="pager" aria-label="Previous and next page">
            ${prev ? html`<a href=${prev.href} rel="prev"><small>Previous</small><b>${prev.title.startsWith('mx-') ? `<${prev.title}>` : prev.title}</b></a>` : nothing}
            ${next ? html`<a class="next" href=${next.href} rel="next"><small>Next</small><b>${next.title.startsWith('mx-') ? `<${next.title}>` : next.title}</b></a>` : nothing}
          </nav>
        </div>
      </main>`;
  }
}
customElements.define('doc-shell', DocShell);
