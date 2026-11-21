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

export type Theme = 'dark' | 'light';

export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  root.dataset.theme = theme;
}
