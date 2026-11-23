import { css, html, svg, type TemplateResult } from 'lit';
import { base, define, MxElement } from './base.js';

/**
 * The isometric line work of the mod-x site, as a kit element: axis-aligned boxes on a hairline grid plane, drawn
 * back to front. Kinds: `solid` (line work on the surface), `plan` (dashed — not built yet), `accent` (the one
 * indigo element). Scenes are presets for empty states and panels; `iso()` renders any set of boxes.
 */
export interface IsoBox { x: number; y: number; z: number; w: number; d: number; h: number; kind?: 'solid' | 'plan' | 'accent' }

const C = Math.cos(Math.PI / 6);
const S = 0.5;

/** Boxes (+ an optional W × D grid plane) as an SVG template with a fitted viewBox. */
export function iso(boxes: readonly IsoBox[], unit = 10, plane?: [number, number]): TemplateResult {
  const pt = (x: number, y: number, z: number): [number, number] => [(x - y) * C * unit, ((x + y) * S - z) * unit];
  const all: [number, number][] = [];
  const poly = (pts: [number, number][]) => { all.push(...pts); return pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' '); };
  let grid = '';
  if (plane) {
    const [W, D] = plane;
    const seg: string[] = [];
    for (let i = 0; i <= W; i++) { const a = pt(i, 0, 0), b = pt(i, D, 0); all.push(a, b); seg.push(`M${a[0].toFixed(1)},${a[1].toFixed(1)}L${b[0].toFixed(1)},${b[1].toFixed(1)}`); }
    for (let j = 0; j <= D; j++) { const a = pt(0, j, 0), b = pt(W, j, 0); all.push(a, b); seg.push(`M${a[0].toFixed(1)},${a[1].toFixed(1)}L${b[0].toFixed(1)},${b[1].toFixed(1)}`); }
    grid = seg.join('');
  }
  // painter's order: farther (smaller x + y), lower boxes first
  const sorted = [...boxes].sort((a, b) => (a.x + a.y + a.z) - (b.x + b.y + b.z) || a.z - b.z);
  const faces = sorted.map((b) => {
    const { x, y, z, w, d, h } = b;
    const top = poly([pt(x, y, z + h), pt(x + w, y, z + h), pt(x + w, y + d, z + h), pt(x, y + d, z + h)]);
    const left = poly([pt(x, y + d, z), pt(x + w, y + d, z), pt(x + w, y + d, z + h), pt(x, y + d, z + h)]);
    const right = poly([pt(x + w, y, z), pt(x + w, y + d, z), pt(x + w, y + d, z + h), pt(x + w, y, z + h)]);
    return svg`<g class="box ${b.kind ?? 'solid'}"><polygon class="l" points=${left}></polygon><polygon class="r" points=${right}></polygon><polygon class="t" points=${top}></polygon></g>`;
  });
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const pad = 2, minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad;
  const vb = `${minX.toFixed(1)} ${minY.toFixed(1)} ${(Math.max(...xs) - minX + pad).toFixed(1)} ${(Math.max(...ys) - minY + pad).toFixed(1)}`;
  return html`<svg viewBox=${vb} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${grid ? svg`<path class="grid" d=${grid}></path>` : ''}${faces}</svg>`;
}

/** Preset scenes (the site's compositions, small). */
export const ISO_SCENES = {
  /** a finished stack with the accent module on top */
  stack: { plane: [6, 6] as [number, number], boxes: [
    { x: 1, y: 1, z: 0, w: 2, d: 2, h: 1 }, { x: 3, y: 1, z: 0, w: 2, d: 2, h: 1 }, { x: 1, y: 3, z: 0, w: 2, d: 2, h: 1 },
    { x: 3, y: 3, z: 0, w: 2, d: 2, h: 1, kind: 'plan' }, { x: 1, y: 1, z: 1, w: 2, d: 2, h: 1, kind: 'accent' },
  ] as IsoBox[] },
  /** a footprint: planned modules and one placed */
  plan: { plane: [7, 5] as [number, number], boxes: [
    { x: 1, y: 1, z: 0, w: 2, d: 3, h: 0.6, kind: 'plan' }, { x: 3, y: 1, z: 0, w: 3, d: 3, h: 0.6, kind: 'plan' }, { x: 1, y: 1, z: 0, w: 2, d: 1, h: 1, kind: 'accent' },
  ] as IsoBox[] },
  /** columns of different heights — numbers, charts, money */
  columns: { plane: [7, 4] as [number, number], boxes: [
    { x: 1, y: 1, z: 0, w: 1, d: 2, h: 1 }, { x: 2.5, y: 1, z: 0, w: 1, d: 2, h: 1.8 }, { x: 4, y: 1, z: 0, w: 1, d: 2, h: 2.6, kind: 'accent' }, { x: 5.5, y: 1, z: 0, w: 1, d: 2, h: 3.2, kind: 'plan' },
  ] as IsoBox[] },
  /** a single module waiting — nothing here yet */
  module: { plane: [4, 4] as [number, number], boxes: [{ x: 1, y: 1, z: 0, w: 2, d: 2, h: 1.4, kind: 'accent' }] as IsoBox[] },
} as const;
export type IsoScene = keyof typeof ISO_SCENES;

/** Line-work styles for an `iso()` drawing (tokens only; light and dark). */
export const isoStyles = css`
  svg { display: block; width: 100%; height: 100%; overflow: visible; }
  .grid { fill: none; stroke: var(--mx-border-strong); stroke-width: 1; vector-effect: non-scaling-stroke; }
  .box polygon { stroke-width: 1; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
  .solid polygon { fill: var(--mx-bg); stroke: var(--mx-text-faint); }
  .solid .t { fill: var(--mx-surface); }
  .plan polygon { fill: none; stroke: var(--mx-text-faint); stroke-dasharray: 3 3; }
  .accent polygon { fill: var(--mx-accent); stroke: var(--mx-indigo-200); }
  .accent .t { fill: var(--mx-indigo-400); }
  .accent .r { fill: var(--mx-indigo-700); }
`;

/* ───────────── mx-illustration ───────────── */
/** A preset isometric scene (`scene`: stack | plan | columns | module). The accent module settles gently; still for reduced motion. */
export class MxIllustration extends MxElement {
  static properties = { scene: { type: String, reflect: true } };
  declare scene: IsoScene;
  constructor() {
    super();
    this.scene = 'stack';
  }
  static styles = [base, isoStyles, css`
    :host { display: inline-block; width: 132px; aspect-ratio: 4 / 3; color: var(--mx-text-faint); }
    .accent { animation: settle 3.6s var(--mx-ease-out) infinite alternate; }
    @keyframes settle { from { transform: translateY(-4px); } to { transform: translateY(0); } }
    @media (prefers-reduced-motion: reduce) { .accent { animation: none; } }
  `];
  render() {
    const s = ISO_SCENES[this.scene] ?? ISO_SCENES.stack;
    return iso(s.boxes, 10, s.plane);
  }
}
define('mx-illustration', MxIllustration);

declare global {
  interface HTMLElementTagNameMap { 'mx-illustration': MxIllustration }
}
