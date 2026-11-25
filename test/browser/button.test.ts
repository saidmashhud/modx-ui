import { describe, expect, it, vi } from 'vitest';
import { server, userEvent } from 'vitest/browser';
import '../../packages/ui/src/index.js';
import type { MxButton } from '../../packages/ui/src/button.js';
import { expectAccessible, mount, settle, shadow } from './helpers.js';

describe('mx-button', () => {
  it('clicks; a disabled or loading button does not', async () => {
    const { el } = await mount<MxButton>('<mx-button variant="primary">Save</mx-button>');
    const onClick = vi.fn();
    el.addEventListener('click', onClick);
    await userEvent.click(el);
    expect(onClick).toHaveBeenCalledTimes(1);
    el.disabled = true;
    await settle();
    await userEvent.click(el, { force: true });
    expect(onClick).toHaveBeenCalledTimes(1);
    el.disabled = false;
    el.loading = true;
    await settle();
    expect(shadow(el, 'button').getAttribute('aria-busy')).toBe('true');
  });

  it('is reached by Tab and pressed with Enter and Space (focus delegated to the inner button)', async () => {
    const { el } = await mount<MxButton>('<mx-button>Go</mx-button>');
    const onClick = vi.fn();
    el.addEventListener('click', onClick);
    /* WebKit (like Safari by default) does not Tab to buttons */
    if (server.browser === 'webkit') el.focus();
    else await userEvent.tab();
    expect(document.activeElement).toBe(el);
    expect(el.shadowRoot!.activeElement).toBe(shadow(el, 'button'));
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('type="submit" submits its real <form> through ElementInternals, type="reset" resets it', async () => {
    const { root } = await mount(`<form id="f" onsubmit="return false">
        <input name="title" value="first">
        <mx-button type="submit">Save</mx-button>
        <mx-button type="reset">Reset</mx-button>
      </form>
      <mx-button type="submit" form="f" id="outside">Save from outside</mx-button>`);
    const form = root.querySelector('form')!;
    const submits: FormData[] = [];
    form.addEventListener('submit', (e) => { e.preventDefault(); submits.push(new FormData(form)); });
    const [submit, reset] = form.querySelectorAll('mx-button');
    const outside = root.querySelector<MxButton>('#outside')!;
    expect((submit as MxButton).form).toBe(form);
    expect(outside.form).toBe(form);
    await userEvent.click(submit!);
    expect(submits).toHaveLength(1);
    expect(submits[0]!.get('title')).toBe('first');
    await userEvent.click(outside);
    expect(submits).toHaveLength(2);
    const input = form.querySelector('input')!;
    await userEvent.fill(input, 'changed');
    await userEvent.click(reset!);
    expect(input.value).toBe('first');
    expect(submits).toHaveLength(2);
  });

  it('a disabled <fieldset> disables it (no submit)', async () => {
    const { root } = await mount(`<form><fieldset disabled><mx-button type="submit">Save</mx-button></fieldset></form>`);
    const form = root.querySelector('form')!;
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    form.addEventListener('submit', onSubmit);
    const b = root.querySelector<MxButton>('mx-button')!;
    await settle();
    expect(shadow<HTMLButtonElement>(b, 'button').disabled).toBe(true);
    b.click();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('is accessible in every variant, light and dark', async () => {
    const { root } = await mount(`
      <mx-button variant="primary">Primary</mx-button>
      <mx-button>Secondary</mx-button>
      <mx-button variant="ghost">Ghost</mx-button>
      <mx-button variant="danger">Delete</mx-button>
      <mx-button icon="plus" icon-only label="Add"></mx-button>
      <mx-button pressed>Pressed</mx-button>`);
    await expectAccessible(root);
  });

  it('keeps its contrast on hover', async () => {
    const { root } = await mount(`<mx-button variant="danger">Delete</mx-button><mx-button variant="ghost">Ghost</mx-button><mx-button variant="primary">Go</mx-button>`);
    for (const b of root.querySelectorAll('mx-button')) await expectAccessible(root, { hover: b });
  });
});
