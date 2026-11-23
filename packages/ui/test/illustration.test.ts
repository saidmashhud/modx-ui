// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render } from 'lit';
import { iso, ISO_SCENES } from '../src/illustration.js';

describe('iso line work', () => {
  it('draws three faces per box, back to front, and a grid plane', () => {
    const el = document.createElement('div');
    render(iso([{ x: 2, y: 2, z: 0, w: 1, d: 1, h: 1, kind: 'accent' }, { x: 0, y: 0, z: 0, w: 1, d: 1, h: 1 }], 10, [3, 3]), el);
    const svg = el.querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toMatch(/^-?\d+(\.\d)? -?\d+(\.\d)? \d+(\.\d)? \d+(\.\d)?$/);
    expect(el.querySelectorAll('polygon')).toHaveLength(6);
    expect(el.querySelector('path.grid')).not.toBeNull();
    const kinds = [...el.querySelectorAll('g.box')].map((g) => g.getAttribute('class'));
    expect(kinds).toEqual(['box solid', 'box accent']); // the nearer accent box is painted last
  });
  it('every preset scene has exactly one accent element', () => {
    for (const s of Object.values(ISO_SCENES)) expect(s.boxes.filter((b) => b.kind === 'accent')).toHaveLength(1);
  });
});
