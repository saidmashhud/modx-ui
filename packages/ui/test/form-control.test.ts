// @vitest-environment happy-dom
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { applyFormState, attachFormInternals, formDataOf, type FormInternals, type FormValue } from '../src/form-control.js';
import '../src/form.js';
import '../src/pickers.js';
import '../src/button.js';
import type { MxButton } from '../src/button.js';
import type { MxInput, MxSwitch } from '../src/form.js';
import type { MxDatePicker, MxSelect } from '../src/pickers.js';

/** ElementInternals stand-in: happy-dom has none, so the wiring is checked against what the kit calls. */
class FakeInternals implements FormInternals {
  value: FormValue = null;
  state: FormValue = null;
  flags: ValidityStateFlags = {};
  message = '';
  formOverride: HTMLFormElement | null | undefined;
  constructor(private host: HTMLElement) {}
  get form() { return this.formOverride !== undefined ? this.formOverride : this.host.closest('form'); }
  setFormValue(v: FormValue, s?: FormValue) { this.value = v; this.state = s ?? v; }
  setValidity(f: ValidityStateFlags = {}, m = '') { this.flags = f; this.message = m; }
  checkValidity() { return !Object.values(this.flags).some(Boolean); }
}
const fake = (el: Element) => (el as unknown as { fc: { internals: FakeInternals } }).fc.internals;

async function mount<T extends HTMLElement>(html: string): Promise<{ form: HTMLFormElement; el: T }> {
  const form = document.createElement('form');
  form.innerHTML = html;
  document.body.append(form);
  const el = form.firstElementChild as T & { updateComplete: Promise<unknown> };
  await el.updateComplete;
  return { form, el };
}

describe('form-control helpers', () => {
  it('attachFormInternals is null without platform support (the control still works, outside forms)', () => {
    expect(attachFormInternals(document.createElement('div'))).toBeNull();
  });
  it('applyFormState sets value, state and the required validity', () => {
    const i = new FakeInternals(document.createElement('div'));
    applyFormState(i, { value: '', missing: true, message: 'Fill me' });
    expect(i.flags).toEqual({ valueMissing: true });
    expect(i.message).toBe('Fill me');
    applyFormState(i, { value: 'x', state: 's', missing: false, message: 'Fill me' });
    expect([i.value, i.state, i.flags]).toEqual(['x', 's', {}]);
    expect(() => applyFormState(null, { value: 'x', missing: false, message: '' })).not.toThrow();
  });
  it('formDataOf repeats the name for every value', () => {
    expect(formDataOf('tags', ['a', 'b'])!.getAll('tags')).toEqual(['a', 'b']);
  });
});

describe('form-associated controls', () => {
  const proto = HTMLElement.prototype as unknown as { attachInternals?: unknown };
  beforeAll(() => { proto.attachInternals = function (this: HTMLElement) { return new FakeInternals(this); }; });
  afterAll(() => { delete proto.attachInternals; });

  it('every control declares formAssociated', () => {
    for (const t of ['mx-input', 'mx-select', 'mx-date-picker', 'mx-switch', 'mx-button'])
      expect((customElements.get(t) as unknown as { formAssociated?: boolean }).formAssociated, t).toBe(true);
  });

  it('mx-input: value, required, reset, fieldset disable, state restore', async () => {
    const { form, el } = await mount<MxInput>('<mx-input name="title" value="Draft" required></mx-input>');
    const i = fake(el);
    expect(el.form).toBe(form);
    expect(i.value).toBe('Draft');
    expect(el.checkValidity()).toBe(true);
    el.value = '';
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    expect(i.flags.valueMissing).toBe(true);
    expect(el.checkValidity()).toBe(false);
    el.formResetCallback();
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    expect(el.value).toBe('Draft');
    expect(i.value).toBe('Draft');
    el.formDisabledCallback(true);
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    expect(el.shadowRoot!.querySelector('input')!.disabled).toBe(true);
    el.formStateRestoreCallback('Back');
    expect(el.value).toBe('Back');
  });

  it('mx-select: single value, multiple values as repeated entries, required', async () => {
    const { el } = await mount<MxSelect>('<mx-select name="state" required></mx-select>');
    const i = fake(el);
    el.options = [{ value: 'todo', label: 'Todo' }, { value: 'done', label: 'Done' }];
    await el.updateComplete;
    expect(i.flags.valueMissing).toBe(true);
    el.value = 'done';
    await el.updateComplete;
    expect(i.value).toBe('done');
    expect(i.flags).toEqual({});
    el.multiple = true;
    el.values = ['todo', 'done'];
    await el.updateComplete;
    expect((i.value as FormData).getAll('state')).toEqual(['todo', 'done']);
    el.formResetCallback();
    await el.updateComplete;
    expect(el.values).toEqual([]);
    expect(i.flags.valueMissing).toBe(true);
  });

  it('mx-date-picker: submits YYYY-MM-DD; a range submits both ends', async () => {
    const day = Date.UTC(2026, 10, 21);
    const { el } = await mount<MxDatePicker>(`<mx-date-picker name="due" value="${day}" required></mx-date-picker>`);
    const i = fake(el);
    expect(i.value).toBe('2026-11-21');
    el.value = null;
    await el.updateComplete;
    expect(i.value).toBe('');
    expect(i.flags.valueMissing).toBe(true);
    el.formResetCallback();
    await el.updateComplete;
    expect(el.value).toBe(day);
    el.range = true;
    el.start = day;
    el.end = null;
    await el.updateComplete;
    expect(i.flags.valueMissing).toBe(true);
    el.end = Date.UTC(2026, 10, 28);
    await el.updateComplete;
    expect((i.value as FormData).getAll('due')).toEqual(['2026-11-21', '2026-11-28']);
    expect(i.flags).toEqual({});
  });

  it('mx-switch: like a checkbox', async () => {
    const { el } = await mount<MxSwitch>('<mx-switch name="notify" checked></mx-switch>');
    const i = fake(el);
    expect(i.value).toBe('on');
    el.checked = false;
    await el.updateComplete;
    expect(i.value).toBeNull();
    el.required = true;
    await el.updateComplete;
    expect(i.flags.valueMissing).toBe(true);
    el.formResetCallback();
    expect(el.checked).toBe(true);
    el.formDisabledCallback(true);
    await el.updateComplete;
    el.shadowRoot!.querySelector('button')!.click();
    expect(el.checked).toBe(true); /* a disabled fieldset keeps it as it is */
  });

  it('mx-button: submits the form ElementInternals names (its form attribute), resets with type=reset', async () => {
    const { form, el } = await mount<MxButton>('<mx-button type="submit">Save</mx-button>');
    const other = document.createElement('form');
    document.body.append(other);
    const own = vi.spyOn(form, 'requestSubmit').mockImplementation(() => {});
    const elsewhere = vi.spyOn(other, 'requestSubmit').mockImplementation(() => {});
    el.shadowRoot!.querySelector('button')!.click();
    expect(own).toHaveBeenCalledTimes(1);
    fake(el).formOverride = other; /* <mx-button form="other"> */
    el.shadowRoot!.querySelector('button')!.click();
    expect(elsewhere).toHaveBeenCalledTimes(1);
    const reset = vi.spyOn(other, 'reset');
    el.type = 'reset';
    await el.updateComplete;
    el.shadowRoot!.querySelector('button')!.click();
    expect(reset).toHaveBeenCalledTimes(1);
    el.formDisabledCallback(true);
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('button')!.disabled).toBe(true);
  });

  it('mx-button without ElementInternals falls back to the nearest form', async () => {
    delete proto.attachInternals;
    try {
      const { form, el } = await mount<MxButton>('<mx-button type="submit">Save</mx-button>');
      const spy = vi.spyOn(form, 'requestSubmit').mockImplementation(() => {});
      el.shadowRoot!.querySelector('button')!.click();
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      proto.attachInternals = function (this: HTMLElement) { return new FakeInternals(this); };
    }
  });
});
