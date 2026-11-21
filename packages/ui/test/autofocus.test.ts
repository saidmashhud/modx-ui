import { afterEach, describe, expect, it, vi } from 'vitest';
import { autofocusAllowed } from '../src/form.js';

const media = (touchOnly: boolean) =>
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('pointer: coarse') ? touchOnly : false, media: q, addEventListener() {}, removeEventListener() {} }));

describe('autofocusAllowed', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('allows autofocus with a mouse or trackpad', () => { media(false); expect(autofocusAllowed()).toBe(true); });
  it('skips autofocus on touch-only devices (iOS would show a focused field that ignores typing)', () => { media(true); expect(autofocusAllowed()).toBe(false); });
});
