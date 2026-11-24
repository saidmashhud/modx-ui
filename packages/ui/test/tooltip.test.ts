// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../src/overlay.js';
import '../src/button.js';
import type { MxTooltip } from '../src/overlay.js';
import type { MxButton } from '../src/button.js';

async function mount(inner: string, attrs = 'content="Archive" shortcut="E"') {
  const host = document.createElement('div');
  host.innerHTML = `<mx-tooltip ${attrs}>${inner}</mx-tooltip>`;
  document.body.append(host);
  const tip = host.querySelector('mx-tooltip') as MxTooltip;
  await tip.updateComplete;
  await new Promise((r) => setTimeout(r, 0)); /* slotchange */
  return { host, tip };
}

describe('mx-tooltip', () => {
  afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); });

  it('describes the slotted trigger itself (no id reference across the shadow root)', async () => {
    const { tip, host } = await mount('<button>x</button>');
    const b = host.querySelector('button')!;
    expect(b.getAttribute('aria-description')).toBe('Archive (E)');
    expect(tip.shadowRoot!.querySelector('slot')!.hasAttribute('aria-describedby')).toBe(false);
    tip.content = 'Restore';
    tip.shortcut = '';
    await tip.updateComplete;
    expect(b.getAttribute('aria-description')).toBe('Restore');
    tip.remove();
    expect(b.hasAttribute('aria-description')).toBe(false);
  });

  it("keeps the trigger's own description when it goes", async () => {
    const { tip, host } = await mount('<button aria-description="mine">x</button>', 'content="Tip"');
    const b = host.querySelector('button')!;
    expect(b.getAttribute('aria-description')).toBe('Tip');
    tip.remove();
    expect(b.getAttribute('aria-description')).toBe('mine');
  });

  it('mx-button passes the description to its inner, focusable button', async () => {
    const { host } = await mount('<mx-button icon="archive" label="Archive"></mx-button>', 'content="Archive issue"');
    const mb = host.querySelector('mx-button') as MxButton;
    await mb.updateComplete;
    expect(mb.shadowRoot!.querySelector('button')!.getAttribute('aria-description')).toBe('Archive issue');
  });

  it('Escape dismisses a shown tip without moving focus', async () => {
    const { tip } = await mount('<button>x</button>');
    vi.useFakeTimers();
    const t = tip as unknown as { shown: boolean };
    tip.dispatchEvent(new Event('focusin'));
    vi.advanceTimersByTime(500);
    expect(t.shown).toBe(true);
    const outer = vi.fn();
    document.body.addEventListener('keydown', outer);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(t.shown).toBe(false);
    /* with no tip shown, Escape is left alone (a dialog around closes as usual) */
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(outer).toHaveBeenCalledTimes(1);
  });
});
