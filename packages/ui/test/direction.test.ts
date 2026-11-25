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

import { initialsColor } from '../src/display.js';
describe('mx-avatar initials', () => {
  it('dark on light discs, white on dark ones and on non-hex colours', () => {
    expect(initialsColor('#4cb782')).toBe('var(--mx-gray-950)');
    expect(initialsColor('#f2c94c')).toBe('var(--mx-gray-950)');
    expect(initialsColor('#4743ff')).toBe('var(--mx-gray-0)');
    expect(initialsColor('var(--mx-gray-600)')).toBe('var(--mx-gray-0)');
  });
});
