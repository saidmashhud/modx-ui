import axe from 'axe-core';
import { expect } from 'vitest';
import { server, userEvent } from 'vitest/browser';
import type { LitElement } from 'lit';

/** Render `markup` into a fresh container in <body> and wait for every custom element inside to finish rendering. */
export async function mount<T extends HTMLElement = HTMLElement>(markup: string, attrs: Record<string, string> = {}): Promise<{ root: HTMLElement; el: T }> {
  const root = document.createElement('div');
  for (const [k, v] of Object.entries(attrs)) root.setAttribute(k, v);
  root.innerHTML = markup;
  document.body.append(root);
  await settle(root);
  return { root, el: root.firstElementChild as T };
}

/** Wait until every Lit element under `root` (and inside their shadow roots) has rendered, then a frame. */
export async function settle(root: ParentNode = document.body): Promise<void> {
  for (let pass = 0; pass < 3; pass++) {
    const els = deepAll(root).filter((e): e is LitElement => 'updateComplete' in e);
    await Promise.all(els.map((e) => e.updateComplete));
  }
  await frame();
}

export const frame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
export const tick = (ms = 0) => new Promise<void>((r) => setTimeout(r, ms));

/** Every element under `root`, looking into open shadow roots. */
export function deepAll(root: ParentNode): Element[] {
  const out: Element[] = [];
  const walk = (n: ParentNode) => {
    for (const el of n.querySelectorAll('*')) {
      out.push(el);
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(root);
  return out;
}

/** The focused element, looking into shadow roots. */
export function active(): Element | null {
  let a = document.activeElement;
  while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement;
  return a;
}

/** `sel` inside `el`'s shadow root. */
export function shadow<T extends Element = HTMLElement>(el: Element, sel: string): T {
  const found = el.shadowRoot?.querySelector(sel);
  if (!found) throw new Error(`no ${sel} in <${el.localName}>`);
  return found as T;
}

export const press = (keys: string) => userEvent.keyboard(keys);

/** Wait for a condition (polls frames, up to `ms`). */
export async function until(fn: () => unknown, ms = 2000): Promise<void> {
  const t0 = performance.now();
  while (!fn()) {
    if (performance.now() - t0 > ms) throw new Error(`timed out waiting for ${fn}`);
    await tick(16);
  }
}

/**
 * axe-core (WCAG 2.x A + AA) on `root` in the dark (default) and the light theme. Fails with the violations listed.
 * `disable`: rule ids to skip for this check, each with a reason in the test.
 */
export async function expectAccessible(root: Element, opts: { disable?: string[]; hover?: Element } = {}): Promise<void> {
  /* the pointer rests where the last click was; hover states are checked on purpose (`hover`) */
  if (opts.hover) await userEvent.hover(opts.hover);
  else await userEvent.unhover(document.body).catch(() => {});
  const disable = [...(opts.disable ?? [])];
  /* Firefox's content process crashes after axe's button-name / label-content-name-mismatch compute the name of a
   * trigger labelled by aria-labelledby inside a shadow root, as soon as a popover opens (or is open) — reproduced
   * with axe alone. Those two rules run in Chromium and WebKit; every other rule runs in Firefox too. */
  if (server.browser === 'firefox') disable.push('button-name', 'label-content-name-mismatch');
  for (const theme of ['dark', 'light'] as const) {
    document.documentElement.dataset.theme = theme;
    await tick(300); /* colour transitions (--mx-duration-*) finish */
    const rules = Object.fromEntries(disable.map((id) => [id, { enabled: false }]));
    const res = await axe.run(root, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, rules, resultTypes: ['violations'] });
    const lines = res.violations.map((v) => `[${theme}] ${v.id}: ${v.help}\n${v.nodes.map((n) => `    ${n.target.join(' ')} — ${n.failureSummary?.split('\n').slice(1).join('; ')}`).join('\n')}`);
    expect(lines, lines.join('\n')).toEqual([]);
  }
  delete document.documentElement.dataset.theme;
}

/**
 * The form refuses to submit (an invalid control). Chromium and WebKit: requestSubmit() fires no `submit`. Firefox:
 * checkValidity() only — its validation bubble, anchored inside a shadow root, crashes the content process once the
 * test removes the form (a Firefox bug outside the kit).
 */
export function expectSubmitBlocked(form: HTMLFormElement): void {
  expect(form.checkValidity()).toBe(false);
  if (server.browser === 'firefox') return;
  let fired = false;
  const on = (e: Event) => { fired = true; e.preventDefault(); };
  form.addEventListener('submit', on);
  form.requestSubmit();
  form.removeEventListener('submit', on);
  expect(fired).toBe(false);
}
