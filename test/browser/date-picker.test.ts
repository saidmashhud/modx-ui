import { describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import '../../packages/ui/src/index.js';
import { setKitStrings } from '../../packages/ui/src/base.js';
import { dayToMs, type MxDatePicker } from '../../packages/ui/src/pickers.js';
import { active, expectAccessible, expectSubmitBlocked, mount, settle, shadow, until } from './helpers.js';

async function picker(attrs: string, wrap = (s: string) => s) {
  const { root } = await mount(wrap(`<mx-date-picker label="Due" ${attrs}></mx-date-picker>`));
  const el = root.querySelector<MxDatePicker>('mx-date-picker')!;
  return { root, el, trigger: shadow<HTMLButtonElement>(el, '.trigger') };
}

const cal = (el: MxDatePicker) => el.shadowRoot!.querySelector<HTMLElement>('.cal');
const focusedDay = () => (active() as HTMLElement | null)?.dataset.day;
const focusedMonth = () => (active() as HTMLElement | null)?.dataset.month;

async function open(el: MxDatePicker, trigger: HTMLElement) {
  trigger.focus();
  await userEvent.keyboard('{Enter}');
  await until(() => cal(el));
  await settle(el.shadowRoot!);
  await until(() => focusedDay() || focusedMonth());
}

describe('mx-date-picker (day)', () => {
  it('opens on the value, moves with arrows / PageDown / Home / End, picks with Enter', async () => {
    const { el, trigger } = await picker('value="2026-11-18"');
    const onChange = vi.fn();
    el.addEventListener('mx-change', (e) => onChange((e as CustomEvent).detail));
    await open(el, trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(focusedDay()).toBe('2026-11-18');
    await userEvent.keyboard('{ArrowRight}');
    expect(focusedDay()).toBe('2026-11-19');
    await userEvent.keyboard('{ArrowDown}');
    expect(focusedDay()).toBe('2026-11-26');
    await userEvent.keyboard('{ArrowLeft}{ArrowUp}');
    expect(focusedDay()).toBe('2026-11-18');
    /* weeks start on Sunday in en-US: Wed 18 → Sun 15 / Sat 21 */
    await userEvent.keyboard('{Home}');
    expect(focusedDay()).toBe('2026-11-15');
    await userEvent.keyboard('{End}');
    expect(focusedDay()).toBe('2026-11-21');
    await userEvent.keyboard('{PageDown}');
    expect(focusedDay()).toBe('2026-12-21');
    expect(shadow(el, '.top b').textContent).toContain('December 2026');
    await userEvent.keyboard('{Shift>}{PageUp}{/Shift}');
    expect(focusedDay()).toBe('2025-12-21');
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith({ value: dayToMs('2025-12-21'), day: '2025-12-21' });
    expect(el.day).toBe('2025-12-21');
    await until(() => !cal(el));
    expect(active()).toBe(trigger);
    expect(shadow(el, '.val').textContent).toBe('Dec 21, 2025');
  });

  it('Esc closes without picking and returns focus', async () => {
    const { el, trigger } = await picker('value="2026-11-18"');
    await open(el, trigger);
    await userEvent.keyboard('{ArrowRight}{Escape}');
    await until(() => !cal(el));
    expect(el.day).toBe('2026-11-18');
    expect(active()).toBe(trigger);
  });

  it('min / max days cannot be picked', async () => {
    const { el, trigger } = await picker('value="2026-11-18" min="2026-11-10" max="2026-11-20"');
    await open(el, trigger);
    const day = (d: string) => shadow<HTMLElement>(el, `[data-day="${d}"]`);
    expect(day('2026-11-09').getAttribute('aria-disabled')).toBe('true');
    expect(day('2026-11-21').getAttribute('aria-disabled')).toBe('true');
    expect(day('2026-11-20').getAttribute('aria-disabled')).toBe('false');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(el.day).toBe('2026-11-18');
  });

  it('reads a typed date in the locale order: en-US month first, ru-RU day first, ISO in both', async () => {
    const { el, trigger } = await picker('');
    await open(el, trigger);
    const typed = shadow<HTMLInputElement>(el, '.typed');
    expect(typed.placeholder).toBe('mm/dd/yyyy');
    await userEvent.click(typed);
    await userEvent.keyboard('03/04/2026{Enter}');
    expect(el.day).toBe('2026-03-04');

    setKitStrings({ locale: 'ru-RU', weekStart: 1 });
    await settle();
    await open(el, trigger);
    const typedRu = shadow<HTMLInputElement>(el, '.typed');
    expect(typedRu.placeholder).toBe('dd.mm.yyyy');
    expect(typedRu.value).toBe('04.03.2026');
    await userEvent.clear(typedRu);
    await userEvent.type(typedRu, '03.04.2026');
    await userEvent.keyboard('{Enter}');
    expect(el.day).toBe('2026-04-03');

    await open(el, trigger);
    const iso = shadow<HTMLInputElement>(el, '.typed');
    await userEvent.clear(iso);
    await userEvent.type(iso, '2026-12-31');
    await userEvent.keyboard('{Enter}');
    expect(el.day).toBe('2026-12-31');
  });

  it('marks a typed date it cannot read as invalid', async () => {
    const { el, trigger } = await picker('');
    await open(el, trigger);
    const typed = shadow<HTMLInputElement>(el, '.typed');
    await userEvent.click(typed);
    await userEvent.keyboard('13/45/2026');
    expect(typed.getAttribute('aria-invalid')).toBe('true');
  });

  it('in a form: submits YYYY-MM-DD, required blocks submit, reset returns to the attribute', async () => {
    const { root, el } = await picker('name="due" value="2026-11-18" required', (s) => `<form>${s}</form>`);
    const form = root.querySelector('form')!;
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    form.addEventListener('submit', onSubmit);
    expect(new FormData(form).get('due')).toBe('2026-11-18');
    el.value = null;
    await settle();
    expect(el.checkValidity()).toBe(false);
    expectSubmitBlocked(form);
    expect(onSubmit).not.toHaveBeenCalled();
    form.reset();
    await settle();
    expect(el.day).toBe('2026-11-18');
    expect(el.checkValidity()).toBe(true);
  });

  it('is accessible closed and open (required too)', async () => {
    const { root, el, trigger } = await picker('value="2026-11-18" required');
    await expectAccessible(root);
    await open(el, trigger);
    await expectAccessible(root);
  });
});

describe('mx-date-picker range', () => {
  it('picks start then end (either order), previews the range, submits both', async () => {
    const { root, el, trigger } = await picker('range name="when"', (s) => `<form>${s}</form>`);
    el.start = dayToMs('2026-11-02');
    el.end = dayToMs('2026-11-05');
    await settle();
    const onChange = vi.fn();
    el.addEventListener('mx-change', (e) => onChange((e as CustomEvent).detail));
    await open(el, trigger);
    expect(focusedDay()).toBe('2026-11-02');
    await userEvent.click(shadow(el, '[data-day="2026-11-20"]'));
    await userEvent.hover(shadow(el, '[data-day="2026-11-12"]'));
    await settle(el.shadowRoot!);
    expect(shadow(el, '[data-day="2026-11-15"]').classList.contains('in')).toBe(true);
    await userEvent.click(shadow(el, '[data-day="2026-11-12"]'));
    expect(onChange).toHaveBeenLastCalledWith({ start: dayToMs('2026-11-12'), end: dayToMs('2026-11-20'), startDay: '2026-11-12', endDay: '2026-11-20' });
    await settle();
    expect(new FormData(root.querySelector('form')!).getAll('when')).toEqual(['2026-11-12', '2026-11-20']);
  });

  it('keyboard: Enter, arrows, Enter', async () => {
    const { el, trigger } = await picker('range');
    el.start = dayToMs('2026-11-02');
    el.end = dayToMs('2026-11-02');
    await settle();
    await open(el, trigger);
    await userEvent.keyboard('{Enter}{ArrowDown}{ArrowRight}{Enter}');
    expect([el.start, el.end]).toEqual([dayToMs('2026-11-02'), dayToMs('2026-11-10')]);
  });

  it('required until both ends are set', async () => {
    const { el } = await picker('range required name="r"', (s) => `<form>${s}</form>`);
    expect(el.checkValidity()).toBe(false);
    el.start = dayToMs('2026-11-02');
    await settle();
    expect(el.checkValidity()).toBe(false);
    el.end = dayToMs('2026-11-03');
    await settle();
    expect(el.checkValidity()).toBe(true);
  });
});

describe('mx-date-picker mode="month"', () => {
  it('opens on the month, arrows / PageDown / Home / End, Enter picks "YYYY-MM"', async () => {
    const { el, trigger } = await picker('mode="month" value="2026-06"');
    const onChange = vi.fn();
    el.addEventListener('mx-change', (e) => onChange((e as CustomEvent).detail));
    expect(shadow(el, '.val').textContent).toBe('June 2026');
    await open(el, trigger);
    expect(focusedMonth()).toBe('2026-06');
    await userEvent.keyboard('{ArrowRight}');
    expect(focusedMonth()).toBe('2026-07');
    await userEvent.keyboard('{ArrowDown}');
    expect(focusedMonth()).toBe('2026-11');
    await userEvent.keyboard('{Home}');
    expect(focusedMonth()).toBe('2026-09');
    await userEvent.keyboard('{End}');
    expect(focusedMonth()).toBe('2026-12');
    await userEvent.keyboard('{PageDown}');
    expect(focusedMonth()).toBe('2027-12');
    expect(shadow(el, '.top b').textContent).toBe('2027');
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith({ value: '2027-12', month: '2027-12' });
    expect(el.value).toBe('2027-12');
    await until(() => !cal(el));
    expect(active()).toBe(trigger);
  });

  it('submits "YYYY-MM", honours min / max, resets', async () => {
    const { root, el, trigger } = await picker('mode="month" name="m" value="2026-06" min="2026-03" max="2026-09"', (s) => `<form>${s}</form>`);
    const form = root.querySelector('form')!;
    expect(new FormData(form).get('m')).toBe('2026-06');
    await open(el, trigger);
    expect(shadow(el, '[data-month="2026-02"]').getAttribute('aria-disabled')).toBe('true');
    expect(shadow(el, '[data-month="2026-10"]').getAttribute('aria-disabled')).toBe('true');
    await userEvent.click(shadow(el, '[data-month="2026-08"]'));
    await settle();
    expect(new FormData(form).get('m')).toBe('2026-08');
    form.reset();
    await settle();
    expect(el.value).toBe('2026-06');
  });

  it('is accessible open', async () => {
    const { root, el, trigger } = await picker('mode="month" value="2026-06"');
    await open(el, trigger);
    await expectAccessible(root);
  });
});
