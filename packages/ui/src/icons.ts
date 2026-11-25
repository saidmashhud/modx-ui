import { css, html, nothing, svg, type SVGTemplateResult } from 'lit';
import { base, define, MxElement } from './base.js';

/** 16×16 line icons, 1.5px stroke — echoes the wireframe line-work of the source illustrations. */
export const ICONS: Record<string, SVGTemplateResult> = {
  plus: svg`<path d="M8 3v10M3 8h10"/>`,
  search: svg`<circle cx="7" cy="7" r="4.25"/><path d="m10.25 10.25 3 3"/>`,
  x: svg`<path d="m4 4 8 8M12 4l-8 8"/>`,
  check: svg`<path d="m3.5 8.5 3 3 6-7"/>`,
  'chevron-down': svg`<path d="m4.5 6.5 3.5 3.5 3.5-3.5"/>`,
  'chevron-right': svg`<path d="m6.5 4.5 3.5 3.5-3.5 3.5"/>`,
  'chevron-left': svg`<path d="m9.5 4.5-3.5 3.5 3.5 3.5"/>`,
  more: svg`<circle cx="3.5" cy="8" r=".75" fill="currentColor"/><circle cx="8" cy="8" r=".75" fill="currentColor"/><circle cx="12.5" cy="8" r=".75" fill="currentColor"/>`,
  inbox: svg`<path d="M2.5 9.5h3l1 1.5h3l1-1.5h3"/><path d="M4 3.5h8l1.5 6v3h-11v-3z"/>`,
  issues: svg`<rect x="2.75" y="2.75" width="10.5" height="10.5" rx="2"/><path d="M5.5 6h5M5.5 8.5h5M5.5 11h3"/>`,
  user: svg`<circle cx="8" cy="5.5" r="2.5"/><path d="M3 13.25c.75-2.25 2.75-3.5 5-3.5s4.25 1.25 5 3.5"/>`,
  users: svg`<circle cx="6" cy="6" r="2.25"/><path d="M2 12.75c.5-1.75 2-2.75 4-2.75s3.5 1 4 2.75"/><path d="M10.5 3.9a2.25 2.25 0 0 1 0 4.2M11.75 10.25c1 .4 1.8 1.25 2.25 2.5"/>`,
  layers: svg`<path d="m8 2.5 5.5 3-5.5 3-5.5-3z"/><path d="m2.5 8.25 5.5 3 5.5-3"/><path d="m2.5 11 5.5 3 5.5-3"/>`,
  cube: svg`<path d="m8 1.75 5.5 3.1v6.3L8 14.25l-5.5-3.1v-6.3z"/><path d="M2.5 4.85 8 8l5.5-3.15M8 8v6.25"/>`,
  cycle: svg`<path d="M12.75 6.5A5 5 0 0 0 3.6 5.2M3.25 9.5a5 5 0 0 0 9.15 1.3"/><path d="M3.25 2.75v2.75H6M12.75 13.25V10.5H10"/>`,
  list: svg`<path d="M5.5 4h8M5.5 8h8M5.5 12h8"/><circle cx="2.75" cy="4" r=".6" fill="currentColor"/><circle cx="2.75" cy="8" r=".6" fill="currentColor"/><circle cx="2.75" cy="12" r=".6" fill="currentColor"/>`,
  board: svg`<rect x="2.25" y="2.75" width="3.5" height="10.5" rx="1"/><rect x="7.25" y="2.75" width="3.5" height="7" rx="1"/><rect x="12.25" y="2.75" width="1.5" height="4.5" rx=".75"/>`,
  filter: svg`<path d="M2.5 4h11M4.5 8h7M6.5 12h3"/>`,
  sliders: svg`<path d="M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6"/><circle cx="10" cy="4.5" r="1.5"/><circle cx="6" cy="11.5" r="1.5"/>`,
  tag: svg`<path d="M2.75 2.75h5l5.5 5.5-5 5-5.5-5.5z"/><circle cx="5.5" cy="5.5" r=".9" fill="currentColor"/>`,
  calendar: svg`<rect x="2.5" y="3.25" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M5.5 2v2.5M10.5 2v2.5"/>`,
  link: svg`<path d="M6.75 9.25a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-.5.5"/><path d="M9.25 6.75a2.5 2.5 0 0 0-3.5 0l-2 2a2.5 2.5 0 0 0 3.5 3.5l.5-.5"/>`,
  trash: svg`<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.75h5.8l.6-8.75"/>`,
  undo: svg`<path d="M5.5 3.5 2.75 6.25 5.5 9"/><path d="M2.75 6.25h6.5a3.5 3.5 0 0 1 0 7H6"/>`,
  command: svg`<path d="M6 6h4v4H6z"/><path d="M6 6V4.5A1.5 1.5 0 1 0 4.5 6H6M10 6V4.5A1.5 1.5 0 1 1 11.5 6H10M6 10v1.5A1.5 1.5 0 1 1 4.5 10H6M10 10v1.5a1.5 1.5 0 1 0 1.5-1.5H10"/>`,
  sun: svg`<circle cx="8" cy="8" r="2.75"/><path d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1.05 1.05M11.35 11.35l1.05 1.05M3.6 12.4l1.05-1.05M11.35 4.65l1.05-1.05"/>`,
  moon: svg`<path d="M12.75 9.75A5.25 5.25 0 0 1 6.25 3.25a5.25 5.25 0 1 0 6.5 6.5z"/>`,
  sidebar: svg`<rect x="2.25" y="2.75" width="11.5" height="10.5" rx="1.5"/><path d="M6 2.75v10.5"/>`,
  edit: svg`<path d="m10.25 3.25 2.5 2.5-7 7H3.25v-2.5z"/>`,
  comment: svg`<path d="M2.75 4a1.25 1.25 0 0 1 1.25-1.25h8A1.25 1.25 0 0 1 13.25 4v6A1.25 1.25 0 0 1 12 11.25H7l-3 2.25v-2.25A1.25 1.25 0 0 1 2.75 10z"/>`,
  activity: svg`<path d="M1.75 8h2.5l1.75-4.5 3.5 9 1.75-4.5h2.5"/>`,
  target: svg`<circle cx="8" cy="8" r="5.25"/><circle cx="8" cy="8" r="2.25"/>`,
  estimate: svg`<path d="M8 2.25 13.25 8 8 13.75 2.75 8z"/>`,
  copy: svg`<rect x="5.25" y="5.25" width="8" height="8" rx="1.5"/><path d="M10.75 5.25V4A1.25 1.25 0 0 0 9.5 2.75H4A1.25 1.25 0 0 0 2.75 4v5.5A1.25 1.25 0 0 0 4 10.75h1.25"/>`,
  'arrow-up-right': svg`<path d="M5 11 11 5M6 5h5v5"/>`,
  wifi_off: svg`<path d="m2.5 2.5 11 11M5.5 8.5a3.75 3.75 0 0 1 2-.9M2.75 6a7.5 7.5 0 0 1 2.4-1.5M10.25 7.75c.3.2.55.45.8.75M8 4.5a7.5 7.5 0 0 1 5.25 1.5"/><circle cx="8" cy="11.75" r=".75" fill="currentColor"/>`,
  lock: svg`<rect x="3.25" y="7" width="9.5" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>`,
  paperclip: svg`<path d="m12.5 7.5-4.75 4.75a2.75 2.75 0 0 1-3.9-3.9L8.6 3.6a1.85 1.85 0 0 1 2.6 2.6L6.6 10.8a.9.9 0 0 1-1.3-1.3L9.5 5.3"/>`,
  book: svg`<path d="M2.75 3.5c1.75-.65 3.5-.45 5.25.75 1.75-1.2 3.5-1.4 5.25-.75v9c-1.75-.65-3.5-.45-5.25.75-1.75-1.2-3.5-1.4-5.25-.75z"/><path d="M8 4.25v9"/>`,
  file: svg`<path d="M4 1.75h5l3 3v9.5H4z"/><path d="M9 1.75v3h3"/>`,
  download: svg`<path d="M8 2.5v8M4.75 7.5 8 10.75l3.25-3.25M3 13.5h10"/>`,
  settings: svg`<circle cx="8" cy="8" r="2"/><path d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1.05 1.05M11.35 11.35l1.05 1.05M3.6 12.4l1.05-1.05M11.35 4.65l1.05-1.05"/>`,
  template: svg`<rect x="2.75" y="2.75" width="10.5" height="10.5" rx="2" stroke-dasharray="2 1.5"/><path d="M5.5 6h5M5.5 8.5h3"/>`,
  mail: svg`<rect x="2.25" y="3.5" width="11.5" height="9" rx="1.5"/><path d="m2.75 4.5 5.25 4 5.25-4"/>`,
  keyboard: svg`<rect x="1.75" y="4" width="12.5" height="8" rx="1.5"/><path d="M4.5 6.75h.01M7 6.75h.01M9.5 6.75h.01M12 6.75h-.5M5 9.5h6"/>`,
  /* v12 whiteboards: the section and its tools */
  whiteboard: svg`<rect x="1.75" y="2.75" width="12.5" height="8.5" rx="1.25"/><path d="M5.5 13.75 8 11.25l2.5 2.5"/><path d="m4.5 8.5 2-2.25 1.75 1.5 3-3"/>`,
  pointer: svg`<path d="m4 2.5 8 5.25-3.5.75L10.5 12.5l-1.5.75-2-4-2.75 2.25z"/>`,
  hand: svg`<path d="M5.25 8.5V4a1 1 0 0 1 2 0v3.5M7.25 7V3a1 1 0 0 1 2 0v4M9.25 7V3.75a1 1 0 0 1 2 0V8.5M11.25 6.25a1 1 0 0 1 2 0V9.5a4.25 4.25 0 0 1-4.25 4.25H8.5a4 4 0 0 1-3.2-1.6L3 9.25a1 1 0 0 1 1.6-1.2l.65.85"/>`,
  sticky: svg`<path d="M2.75 2.75h10.5v6.5l-4 4h-6.5z"/><path d="M13.25 9.25h-4v4"/>`,
  square: svg`<rect x="2.75" y="2.75" width="10.5" height="10.5" rx="1"/>`,
  circle: svg`<circle cx="8" cy="8" r="5.25"/>`,
  diamond: svg`<path d="M8 1.75 14.25 8 8 14.25 1.75 8z"/>`,
  type: svg`<path d="M3 4.25V3h10v1.25M8 3v10M6.25 13h3.5"/>`,
  arrow: svg`<path d="M3 13 13 3M7 3h6v6"/>`,
  line: svg`<path d="M3 13 13 3"/>`,
  pen: svg`<path d="M2.75 13.25c1.5-.25 2.25-1 3-2.25L11.5 3.5a1.4 1.4 0 0 1 2 2L7 11.25c-1.25.75-2.75 1.5-4.25 2z"/>`,
  image: svg`<rect x="2.25" y="2.75" width="11.5" height="10.5" rx="1.5"/><circle cx="5.75" cy="6.25" r="1.1"/><path d="m2.75 12 3.5-3.5 2.5 2.25 2-1.75 2.5 2.25"/>`,
  frame: svg`<path d="M4.75 1.75v12.5M11.25 1.75v12.5M1.75 4.75h12.5M1.75 11.25h12.5"/>`,
  'zoom-in': svg`<circle cx="7" cy="7" r="4.25"/><path d="m10.25 10.25 3 3M5 7h4M7 5v4"/>`,
  'zoom-out': svg`<circle cx="7" cy="7" r="4.25"/><path d="m10.25 10.25 3 3M5 7h4"/>`,
  fit: svg`<path d="M2.75 6V2.75H6M10 2.75h3.25V6M13.25 10v3.25H10M6 13.25H2.75V10"/>`,
  wallet: svg`<path d="M12.75 5.25v-1.5a1 1 0 0 0-1-1h-8a1.5 1.5 0 0 0 0 3h9.5a1 1 0 0 1 1 1v5.5a1 1 0 0 1-1 1h-9.5a1.5 1.5 0 0 1-1.5-1.5v-8"/><circle cx="10.75" cy="9.25" r=".75"/>`,
  timeline: svg`<path d="M2.5 2.5v11"/><path d="M4.75 4.5h4.5M7 8h6M5.75 11.5h4"/>`,
  branch: svg`<circle cx="4.5" cy="3.75" r="1.5"/><circle cx="4.5" cy="12.25" r="1.5"/><circle cx="11.5" cy="5.75" r="1.5"/><path d="M4.5 5.25v5.5M11.5 7.25c0 2.5-3 2.5-5.5 4"/>`,
  history: svg`<path d="M2.75 8a5.25 5.25 0 1 0 1.6-3.8"/><path d="M2.5 2.75v2.5H5"/><path d="M8 5.25V8l2 1.5"/>`,
  bell: svg`<path d="M4 11.25V7a4 4 0 0 1 8 0v4.25l1.25 1.25H2.75z"/><path d="M6.5 14h3"/>`,
  'arrow-left': svg`<path d="M13 8H3M7 4 3 8l4 4"/>`,
  info: svg`<circle cx="8" cy="8" r="5.75"/><path d="M8 7.25v3.5"/><circle cx="8" cy="5.1" r=".75" fill="currentColor" stroke="none"/>`,
  alert: svg`<circle cx="8" cy="8" r="5.75"/><path d="M8 4.75v3.75"/><circle cx="8" cy="10.9" r=".75" fill="currentColor" stroke="none"/>`,
  shield: svg`<path d="M8 1.75 13 3.5v4.25c0 3-2.25 5.25-5 6.5-2.75-1.25-5-3.5-5-6.5V3.5z"/>`,
  redo: svg`<path d="m10.5 3.5 2.75 2.75L10.5 9"/><path d="M13.25 6.25h-6.5a3.5 3.5 0 0 0 0 7H10"/>`,
  unlock: svg`<rect x="3.25" y="7" width="9.5" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 4.9-.75"/>`,
  'bring-front': svg`<rect x="5.25" y="5.25" width="8" height="8" rx="1" fill="currentColor" fill-opacity=".25"/><path d="M10.75 5.25V2.75h-8v8h2.5"/>`,
  'send-back': svg`<rect x="2.75" y="2.75" width="8" height="8" rx="1" fill="currentColor" fill-opacity=".25"/><path d="M10.75 5.25h2.5v8h-8v-2.5"/>`,
};

export type IconName = keyof typeof ICONS;

/** Icons that point along the inline direction ("back", "next", undo / redo): mirrored in right-to-left contexts. */
export const DIRECTIONAL_ICONS: ReadonlySet<string> = new Set(['chevron-left', 'chevron-right', 'arrow-left', 'arrow-up-right', 'undo', 'redo']);

/**
 * A 16 px line icon from `ICONS`. Decorative unless `label` is set (then `role="img"` with that name). Directional
 * icons (`DIRECTIONAL_ICONS`) are mirrored under `dir="rtl"`; `no-mirror` keeps one as drawn.
 *
 * @csspart svg - The drawn icon.
 *
 * @tagname mx-icon
 */
export class MxIcon extends MxElement {
  static properties = {
    name: { type: String },
    size: { type: Number },
    label: { type: String },
    noMirror: { type: Boolean, attribute: 'no-mirror' },
  };
  /** Name of the glyph in `ICONS` (unknown names draw "plus"). */
  declare name: string;
  /** Width and height in px. */
  declare size: number;
  /** Accessible name; empty: the icon is decorative (hidden from assistive tech). */
  declare label: string;
  /** Do not mirror a directional icon in right-to-left contexts. */
  declare noMirror: boolean;

  constructor() {
    super();
    this.name = 'plus';
    this.size = 16;
    this.label = '';
    this.noMirror = false;
  }

  static styles = [base, css`
    :host { display: inline-flex; flex: none; color: inherit; line-height: 0; }
    svg { fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
    :host(:dir(rtl)) svg.mirror { transform: scaleX(-1); }
  `];

  render() {
    const glyph = ICONS[this.name] ?? ICONS.plus;
    const mirror = DIRECTIONAL_ICONS.has(this.name) && !this.noMirror;
    return html`<svg part="svg" class=${mirror ? 'mirror' : ''} width=${this.size} height=${this.size} viewBox="0 0 16 16" role=${this.label ? 'img' : 'presentation'}
      aria-label=${this.label || nothing} aria-hidden=${this.label ? 'false' : 'true'}>${glyph}</svg>`;
  }
}
define('mx-icon', MxIcon);

declare global {
  interface HTMLElementTagNameMap { 'mx-icon': MxIcon }
}
