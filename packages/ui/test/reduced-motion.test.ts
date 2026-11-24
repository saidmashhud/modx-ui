// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { CSSResult } from 'lit';
import { MxButton } from '../src/button.js';
import { MxSpinner } from '../src/display.js';

const text = (styles: unknown) => (styles as CSSResult[]).map((s) => s.cssText).join('\n');

describe('spinners and reduced motion', () => {
  it.each([['mx-button', MxButton], ['mx-spinner', MxSpinner]])('%s: the ring stops turning for prefers-reduced-motion', (_, ctor) => {
    const css = text(ctor.styles);
    const reduced = /@media \(prefers-reduced-motion: reduce\) \{([^}]*\})/.exec(css)?.[1] ?? '';
    expect(reduced).toMatch(/\.spinner \{ animation: mx-breathe/);
    expect(css).toMatch(/\.spinner \{[^}]*animation: mx-spin/);
    expect(css).not.toMatch(/animation: spin /); /* no private spin left that the query would miss */
  });
  it('mx-spinner renders the shared .spinner', async () => {
    const el = document.createElement('mx-spinner') as MxSpinner;
    document.body.append(el);
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('.spinner[role="status"]')).not.toBeNull();
    el.remove();
  });
});
