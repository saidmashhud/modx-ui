// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { trackViewport } from '../src/index.js';

/** A fake window with a controllable visual viewport. */
function fakeWin(innerHeight = 844) {
  const listeners: Record<string, (() => void)[]> = {};
  const vv = {
    height: innerHeight, offsetTop: 0, scale: 1,
    addEventListener: (t: string, f: () => void) => { (listeners[t] ??= []).push(f); },
    removeEventListener: (t: string, f: () => void) => { listeners[t] = (listeners[t] ?? []).filter((x) => x !== f); },
  };
  const win = { innerHeight, scrollY: 0, visualViewport: vv, scrollTo: vi.fn() };
  const fire = () => [...(listeners.resize ?? []), ...(listeners.scroll ?? [])].forEach((f) => f());
  return { win: win as unknown as Window, vv, fire, listeners };
}

describe('trackViewport', () => {
  it('publishes the keyboard inset and visible height while the keyboard is open, and clears them when it closes', () => {
    const root = document.createElement('div');
    const { win, vv, fire } = fakeWin();
    trackViewport(root, {}, win);
    expect(root.style.getPropertyValue('--mx-keyboard-inset')).toBe('0px');
    expect(root.hasAttribute('data-keyboard')).toBe(false);

    vv.height = 508; fire(); // a 336 px keyboard
    expect(root.style.getPropertyValue('--mx-keyboard-inset')).toBe('336px');
    expect(root.style.getPropertyValue('--mx-viewport-height')).toBe('508px');
    expect(root.hasAttribute('data-keyboard')).toBe(true);

    vv.height = 844; fire();
    expect(root.style.getPropertyValue('--mx-keyboard-inset')).toBe('0px');
    expect(root.style.getPropertyValue('--mx-viewport-height')).toBe('');
    expect(root.hasAttribute('data-keyboard')).toBe(false);
  });

  it('ignores small changes (browser toolbars) and pinch zoom', () => {
    const root = document.createElement('div');
    const { win, vv, fire } = fakeWin();
    trackViewport(root, {}, win);
    vv.height = 790; fire();
    expect(root.hasAttribute('data-keyboard')).toBe(false);
    vv.height = 300; vv.scale = 2; fire();
    expect(root.hasAttribute('data-keyboard')).toBe(false);
  });

  it('pins the page to the top when asked, and stops listening on cleanup', () => {
    const root = document.createElement('div');
    const { win, vv, fire, listeners } = fakeWin();
    const stop = trackViewport(root, { pinScroll: true }, win);
    vv.height = 500; vv.offsetTop = 120; fire();
    expect(win.scrollTo).toHaveBeenCalledWith(0, 0);
    expect(root.style.getPropertyValue('--mx-keyboard-inset')).toBe('224px');
    stop();
    expect(listeners.resize).toHaveLength(0);
    expect(root.hasAttribute('data-keyboard')).toBe(false);
    expect(root.style.getPropertyValue('--mx-keyboard-inset')).toBe('');
  });

  it('is a no-op without visualViewport', () => {
    const root = document.createElement('div');
    const stop = trackViewport(root, {}, { innerHeight: 800 } as unknown as Window);
    stop();
    expect(root.getAttribute('style')).toBeNull();
  });
});

