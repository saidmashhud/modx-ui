import { describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import '../../packages/ui/src/index.js';
import type { MxInput, MxSwitch } from '../../packages/ui/src/form.js';
import type { MxSelect } from '../../packages/ui/src/pickers.js';
import type { MxCommandList } from '../../packages/ui/src/overlay.js';
import { active, expectAccessible, expectSubmitBlocked, mount, settle, shadow, until } from './helpers.js';

const OPTIONS = [
  { value: 'todo', label: 'Todo' },
  { value: 'doing', label: 'In progress' },
  { value: 'done', label: 'Done' },
];

function formOf(root: HTMLElement): { form: HTMLFormElement; submitted: FormData[] } {
  const form = root.querySelector('form')!;
  const submitted: FormData[] = [];
  form.addEventListener('submit', (e) => { e.preventDefault(); submitted.push(new FormData(form)); });
  return { form, submitted };
}

describe('mx-input', () => {
  it('types, emits mx-input / mx-change and submits under its name', async () => {
    const { root } = await mount(`<form><mx-input name="title" label="Title" value="Draft"></mx-input><button>Go</button></form>`);
    const { form, submitted } = formOf(root);
    const el = root.querySelector<MxInput>('mx-input')!;
    const onInput = vi.fn();
    el.addEventListener('mx-input', onInput);
    const input = shadow<HTMLInputElement>(el, 'input');
    expect(new FormData(form).get('title')).toBe('Draft');
    await userEvent.clear(input);
    await userEvent.type(input, 'Ship it');
    expect(el.value).toBe('Ship it');
    expect(onInput).toHaveBeenCalled();
    form.requestSubmit();
    expect(submitted[0]!.get('title')).toBe('Ship it');
  });

  it('clicking the label focuses the field', async () => {
    const { el } = await mount<MxInput>('<mx-input label="Name"></mx-input>');
    await userEvent.click(shadow(el, 'label'));
    expect(active()).toBe(shadow(el, 'input'));
  });

  it('required: invalid while empty, blocks submit; reset restores the value attribute', async () => {
    const { root } = await mount(`<form><mx-input name="t" required value="x"></mx-input></form>`);
    const { form, submitted } = formOf(root);
    const el = root.querySelector<MxInput>('mx-input')!;
    expect(el.checkValidity()).toBe(true);
    await userEvent.clear(shadow(el, 'input'));
    await settle();
    expect(el.checkValidity()).toBe(false);
    expect(el.validity?.valueMissing).toBe(true);
    expect(el.validationMessage).toBeTruthy();
    expectSubmitBlocked(form);
    expect(submitted).toHaveLength(0);
    form.reset();
    await settle();
    expect(el.value).toBe('x');
    expect(el.checkValidity()).toBe(true);
  });

  it('a disabled fieldset disables it and leaves it out of the form data', async () => {
    const { root } = await mount(`<form><fieldset disabled><mx-input name="t" value="v"></mx-input></fieldset></form>`);
    const el = root.querySelector<MxInput>('mx-input')!;
    await settle();
    expect(shadow<HTMLInputElement>(el, 'input').disabled).toBe(true);
    expect(new FormData(root.querySelector('form')!).has('t')).toBe(false);
  });

  it('is accessible (label, placeholder-only, error)', async () => {
    const { root } = await mount(`<mx-input label="Title"></mx-input><mx-input placeholder="Search"></mx-input>
      <mx-input label="Email" error="Not an address" value="x"></mx-input>`);
    await expectAccessible(root);
  });
});

describe('mx-textarea', () => {
  it('suggests mentions and inserts the token with the keyboard', async () => {
    const { el } = await mount<HTMLElement & { mentions: unknown; value: string }>('<mx-textarea label="Comment"></mx-textarea>');
    el.mentions = [{ id: 'u1', label: 'Ada Lovelace' }, { id: 'u2', label: 'Alan Turing' }];
    await settle();
    const ta = shadow<HTMLTextAreaElement>(el, 'textarea');
    await userEvent.click(ta);
    await userEvent.keyboard('Hi @al');
    await settle();
    const opts = el.shadowRoot!.querySelectorAll('[role="option"]');
    expect(opts).toHaveLength(1);
    expect(ta.getAttribute('aria-activedescendant')).toBe(opts[0]!.id);
    await userEvent.keyboard('{Enter}');
    expect(el.value).toBe('Hi <@u2> ');
    await expectAccessible(el);
  });
});

describe('mx-select', () => {
  async function select(attrs = '', wrap = (s: string) => s) {
    const { root } = await mount(wrap(`<mx-select label="Status" ${attrs}></mx-select>`));
    const el = root.querySelector<MxSelect>('mx-select')!;
    el.options = OPTIONS;
    await settle();
    return { root, el, trigger: shadow<HTMLButtonElement>(el, '.trigger') };
  }
  const list = (el: MxSelect) => el.shadowRoot!.querySelector<MxCommandList>('mx-command-list');

  it('opens with the keyboard, moves with arrows, picks with Enter, returns focus', async () => {
    const { el, trigger } = await select('value="todo"');
    const onChange = vi.fn();
    el.addEventListener('mx-change', (e) => onChange((e as CustomEvent).detail));
    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    await until(() => list(el));
    await settle(el.shadowRoot!);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const l = list(el)!;
    await until(() => l.shadowRoot!.activeElement?.localName === 'input');
    /* the current value is highlighted first */
    expect(l.shadowRoot!.querySelector('[aria-selected="true"]')!.textContent).toContain('Todo');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith('done');
    expect(el.value).toBe('done');
    await until(() => !list(el));
    expect(active()).toBe(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('Esc closes without changing; typing a letter opens filtered', async () => {
    const { el, trigger } = await select('value="todo" searchable');
    trigger.focus();
    await userEvent.keyboard('d');
    await until(() => list(el));
    const l = list(el)!;
    await settle(l.shadowRoot!);
    expect(l.query).toBe('d');
    expect([...l.shadowRoot!.querySelectorAll('[role="option"]')].map((o) => o.textContent!.trim())).toEqual(['Done', 'Todo']);
    await until(() => l.shadowRoot!.activeElement?.localName === 'input');
    await userEvent.keyboard('{Escape}');
    await until(() => !list(el));
    expect(el.value).toBe('todo');
    expect(active()).toBe(trigger);
  });

  it('multiple: toggles values, stays open, submits each value', async () => {
    const { root, el, trigger } = await select('multiple name="s"', (s) => `<form>${s}</form>`);
    await userEvent.click(trigger);
    await until(() => list(el));
    const l = list(el)!;
    await settle(l.shadowRoot!);
    const opts = () => [...l.shadowRoot!.querySelectorAll<HTMLElement>('[role="option"]')];
    await userEvent.click(opts()[0]!);
    await userEvent.click(opts()[2]!);
    expect(el.values).toEqual(['todo', 'done']);
    expect(list(el)).toBeTruthy();
    expect(opts()[0]!.getAttribute('aria-checked')).toBe('true');
    expect(opts()[1]!.getAttribute('aria-checked')).toBe('false');
    expect(new FormData(root.querySelector('form')!).getAll('s')).toEqual(['todo', 'done']);
  });

  it('required + reset in a real form', async () => {
    const { root, el } = await select('name="s" required', (s) => `<form>${s}</form>`);
    const { form, submitted } = formOf(root);
    expect(el.checkValidity()).toBe(false);
    expectSubmitBlocked(form);
    expect(submitted).toHaveLength(0);
    el.value = 'doing';
    await settle();
    expect(el.checkValidity()).toBe(true);
    form.requestSubmit();
    expect(submitted[0]!.get('s')).toBe('doing');
    form.reset();
    await settle();
    expect(el.value).toBe('');
  });

  it('is accessible closed and open', async () => {
    const { root, el, trigger } = await select('value="doing"');
    await expectAccessible(root);
    await userEvent.click(trigger);
    await until(() => list(el));
    await settle(el.shadowRoot!);
    await expectAccessible(root);
  });
});

describe('mx-switch', () => {
  it('toggles with click and Space, submits like a checkbox, resets', async () => {
    const { root } = await mount(`<form><mx-switch name="notify" value="yes">Notify me</mx-switch></form>`);
    const { form } = formOf(root);
    const el = root.querySelector<MxSwitch>('mx-switch')!;
    const btn = shadow(el, 'button');
    expect(new FormData(form).has('notify')).toBe(false);
    await userEvent.click(el);
    expect(el.checked).toBe(true);
    expect(btn.getAttribute('aria-checked')).toBe('true');
    await settle();
    expect(new FormData(form).get('notify')).toBe('yes');
    btn.focus();
    await userEvent.keyboard(' ');
    expect(el.checked).toBe(false);
    await userEvent.keyboard('{Enter}');
    expect(el.checked).toBe(true);
    form.reset();
    await settle();
    expect(el.checked).toBe(false);
  });

  it('the thumb moves to the end side when on', async () => {
    const { el } = await mount<MxSwitch>('<mx-switch>Dark</mx-switch>');
    const track = shadow(el, '.track').getBoundingClientRect();
    el.checked = true;
    await settle();
    await new Promise((r) => setTimeout(r, 300));
    const thumb = shadow(el, '.thumb').getBoundingClientRect();
    expect(thumb.right).toBeGreaterThan(track.right - 4);
  });

  it('required must be on; disabled does not toggle', async () => {
    const { root } = await mount(`<form><mx-switch name="a" required>Agree</mx-switch><mx-switch disabled>Off</mx-switch></form>`);
    const [req, off] = root.querySelectorAll<MxSwitch>('mx-switch');
    expect(req!.checkValidity()).toBe(false);
    await userEvent.click(req!);
    await settle();
    expect(req!.checkValidity()).toBe(true);
    await userEvent.click(off!, { force: true });
    expect(off!.checked).toBe(false);
  });

  it('is accessible', async () => {
    const { root } = await mount(`<mx-switch>Email</mx-switch><mx-switch checked>Push</mx-switch><mx-switch disabled>Off</mx-switch>`);
    await expectAccessible(root);
  });
});
