/** Typed references to the CSS custom properties defined in tokens.css. */
export const token = {
  accent: 'var(--mx-accent)',
  text: 'var(--mx-text)',
  muted: 'var(--mx-text-muted)',
  border: 'var(--mx-border)',
} as const;

/** Palette used for user-picked colors (labels, projects, teams, avatars). */
export const swatches = [
  '#4743ff', '#a46bff', '#26b5ce', '#4cb782', '#f2c94c', '#f2994a', '#f2555a', '#a3a3a3',
] as const;

/** `auto` follows the system (prefers-color-scheme): light when it asks for light, dark otherwise. */
export type Theme = 'dark' | 'light' | 'auto';

/** Set `data-theme` on `root` (default <html>; any element scopes a section). */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  root.dataset.theme = theme;
}

/** The theme `auto` resolves to right now (or `theme` itself when it is dark / light). */
export function resolvedTheme(theme: Theme, win: Pick<Window, 'matchMedia'> | undefined = typeof window === 'undefined' ? undefined : window): 'dark' | 'light' {
  if (theme !== 'auto') return theme;
  return win?.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export interface ViewportTracking {
  /** Keyboard height (px) above which the keyboard counts as open; default 120. */
  threshold?: number;
  /** Keep the page scrolled to the top while the keyboard is open (iOS scrolls the layout viewport to show the focused field). */
  pinScroll?: boolean;
}

/**
 * Follow the on-screen keyboard. iOS (Safari and installed web apps) does not shrink `dvh` or `position: fixed` layouts when the
 * keyboard opens, so fixed bottom bars, sheets and full-screen dialogs end up under it. This keeps
 * `--mx-viewport-height` (the visible height) and `--mx-keyboard-inset` (how much the keyboard covers) on `root`, and sets
 * `data-keyboard` while it is open. Returns a function that stops tracking. No-op without `visualViewport`.
 */
export function trackViewport(root: HTMLElement = document.documentElement, opts: ViewportTracking = {}, win: Window = window): () => void {
  const vv = win.visualViewport;
  if (!vv) return () => {};
  const threshold = opts.threshold ?? 120;
  const update = () => {
    if (vv.scale > 1.01) return; // pinch-zoomed: the visual viewport says nothing about the keyboard
    const inset = Math.max(0, Math.round(win.innerHeight - vv.height - vv.offsetTop));
    const open = inset > threshold;
    root.style.setProperty('--mx-keyboard-inset', `${open ? inset : 0}px`);
    if (open) root.style.setProperty('--mx-viewport-height', `${Math.round(vv.height)}px`);
    else root.style.removeProperty('--mx-viewport-height');
    root.toggleAttribute('data-keyboard', open);
    if (open && opts.pinScroll && (win.scrollY || vv.offsetTop)) win.scrollTo(0, 0);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
  return () => {
    vv.removeEventListener('resize', update);
    vv.removeEventListener('scroll', update);
    root.style.removeProperty('--mx-keyboard-inset');
    root.style.removeProperty('--mx-viewport-height');
    root.removeAttribute('data-keyboard');
  };
}
