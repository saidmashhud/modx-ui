import { describe, expect, it } from 'vitest';

/* node:fs without @types/node (the repo typechecks for the browser) */
type Fs = { readFileSync(p: URL, enc: 'utf8'): string };
const fs = (globalThis as unknown as { process: { getBuiltinModule(id: string): Fs } }).process.getBuiltinModule('node:fs');
const css = fs.readFileSync(new URL('../src/tokens.css', import.meta.url), 'utf8');

/** Custom properties declared in the first block whose selector matches. */
function block(selector: RegExp): Record<string, string> {
  const m = new RegExp(`${selector.source}[^{]*\\{([^}]*)\\}`).exec(css);
  if (!m) throw new Error(`no block ${selector}`);
  const out: Record<string, string> = {};
  for (const d of m[1]!.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--mx-[\w-]+)\s*:\s*([^;]+);/g)) out[d[1]!] = d[2]!.trim();
  return out;
}
const root = block(/:root\s*/);
const light = { ...root, ...block(/:root\[data-theme="light"\],\s*\[data-theme="light"\]\s*/) };
const resolve = (vars: Record<string, string>, v: string): string => {
  const m = /^var\((--mx-[\w-]+)\)$/.exec(v);
  return m ? resolve(vars, vars[m[1]!] ?? '') : v;
};
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
const hex = (name: string) => { const v = resolve(light, light[name] ?? ''); expect(v, name).toMatch(/^#[0-9a-f]{6}$/i); return v; };

describe('light theme contrast (WCAG 2.x)', () => {
  const grounds = { white: '#ffffff', bg: hex('--mx-bg'), surface: hex('--mx-surface') };
  it.each([
    ['--mx-text', 7],
    ['--mx-text-secondary', 7],
    ['--mx-text-muted', 4.5],
    ['--mx-text-faint', 3],
    ['--mx-danger', 4.5],
  ])('%s ≥ %s:1 on white, --mx-bg and --mx-surface', (name, min) => {
    for (const [g, c] of Object.entries(grounds)) expect(ratio(hex(name), c), `${name} on ${g}`).toBeGreaterThanOrEqual(min);
  });
});

describe('data-theme="auto"', () => {
  it('declares exactly the light theme under prefers-color-scheme: light', () => {
    const auto = block(/@media \(prefers-color-scheme: light\)\s*\{\s*:root\[data-theme="auto"\],\s*\[data-theme="auto"\]\s*/);
    const lightOnly = block(/:root\[data-theme="light"\],\s*\[data-theme="light"\]\s*/);
    expect(auto).toEqual(lightOnly);
  });
});
