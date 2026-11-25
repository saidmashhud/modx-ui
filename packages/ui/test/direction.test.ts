import { describe, expect, it } from 'vitest';
import { inlineStep } from '../src/base.js';
import { monthKeyMove } from '../src/pickers.js';

describe('right-to-left keys', () => {
  it('inlineStep: → is next in LTR, previous in RTL', () => {
    expect(inlineStep('ArrowRight', 'ltr')).toBe(1);
    expect(inlineStep('ArrowLeft', 'ltr')).toBe(-1);
    expect(inlineStep('ArrowRight', 'rtl')).toBe(-1);
    expect(inlineStep('ArrowLeft', 'rtl')).toBe(1);
    expect(inlineStep('ArrowUp', 'rtl')).toBe(0);
  });

  it('monthKeyMove mirrors ← / → only', () => {
    expect(monthKeyMove('2026-06', 'ArrowLeft', 4, 'rtl')).toBe('2026-07');
    expect(monthKeyMove('2026-06', 'ArrowRight', 4, 'rtl')).toBe('2026-05');
    expect(monthKeyMove('2026-06', 'ArrowDown', 4, 'rtl')).toBe('2026-10');
    expect(monthKeyMove('2026-06', 'ArrowLeft', 4)).toBe('2026-05');
  });
});
