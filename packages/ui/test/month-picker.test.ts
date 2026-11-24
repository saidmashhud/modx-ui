// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { addMonthsYm, formatMonth, monthDisabled, monthKeyMove, parseMonth, shortMonth, type MonthChange, type MxDatePicker } from '../src/pickers.js';
import { kitStrings, setKitStrings } from '../src/base.js';

describe('month values', () => {
  it('parses YYYY-MM only', () => {
    expect(parseMonth('2026-11')).toBe('2026-11');
    expect(parseMonth(' 2026-01 ')).toBe('2026-01');
    for (const bad of ['2026-13', '2026-00', '2026-1', '11.2026', '', null, undefined]) expect(parseMonth(bad as string), String(bad)).toBeNull();
    expect(addMonthsYm('2026-11', 2)).toBe('2027-01');
    expect(addMonthsYm('2026-01', -1)).toBe('2025-12');
  });

  it('formats as a heading: nominative in Russian, no year word', () => {
    expect(formatMonth('2026-11', 'ru-RU')).toBe('ноябрь 2026');
    expect(formatMonth('2026-03', 'ru-RU')).toBe('март 2026');
    expect(formatMonth('2026-11', 'en-US')).toBe('November 2026');
    expect(formatMonth('2026-11', 'uk-UA')).toBe('листопад 2026');
    expect(formatMonth('2026-11', 'ja-JP')).toBe('2026年11月');
    expect(formatMonth('nope', 'en-US')).toBe('');
    expect(shortMonth(11, 'ru-RU')).toBe('нояб');
    expect(shortMonth(11, 'en-US')).toBe('Nov');
  });

  it('min / max disable months (YYYY-MM, a day, or epoch ms)', () => {
    expect(monthDisabled('2026-10', '2026-11', null)).toBe(true);
    expect(monthDisabled('2026-11', '2026-11', '2026-12')).toBe(false);
    expect(monthDisabled('2027-01', null, '2026-12')).toBe(true);
    expect(monthDisabled('2026-10', Date.UTC(2026, 10, 15), null)).toBe(true);
    expect(monthDisabled('2026-10', '2026-10-31', null)).toBe(false);
  });

  it('keyboard: arrows by month and by row, PageUp/PageDown by year, Home/End to the row ends', () => {
    expect(monthKeyMove('2026-05', 'ArrowRight', 4)).toBe('2026-06');
    expect(monthKeyMove('2026-01', 'ArrowLeft', 4)).toBe('2025-12');
    expect(monthKeyMove('2026-05', 'ArrowDown', 4)).toBe('2026-09');
    expect(monthKeyMove('2026-05', 'ArrowUp', 3)).toBe('2026-02');
    expect(monthKeyMove('2026-11', 'ArrowDown', 4)).toBe('2027-03');
    expect(monthKeyMove('2026-05', 'PageUp', 4)).toBe('2025-05');
    expect(monthKeyMove('2026-05', 'PageDown', 3)).toBe('2027-05');
    expect(monthKeyMove('2026-06', 'Home', 4)).toBe('2026-05');
    expect(monthKeyMove('2026-06', 'End', 4)).toBe('2026-08');
    expect(monthKeyMove('2026-06', 'Home', 3)).toBe('2026-04');
    expect(monthKeyMove('2026-06', 'End', 3)).toBe('2026-06');
    expect(monthKeyMove('2026-06', 'x', 4)).toBeNull();
  });
});

describe('mx-date-picker mode="month"', () => {
  const was = kitStrings.locale;
  afterEach(() => setKitStrings({ locale: was }));

  it('shows the month in the trigger and picks from the grid', async () => {
    setKitStrings({ locale: 'ru-RU' });
    const el = document.createElement('mx-date-picker') as MxDatePicker;
    el.setAttribute('mode', 'month');
    el.setAttribute('value', '2026-11');
    el.setAttribute('min', '2026-03');
    document.body.append(el);
    await el.updateComplete;
    expect(el.value).toBe('2026-11');
    expect(el.shadowRoot!.querySelector('.trigger')!.textContent).toContain('ноябрь 2026');
    const got: MonthChange[] = [];
    el.addEventListener('mx-change', (e) => got.push((e as CustomEvent<MonthChange>).detail));
    el.show();
    await el.updateComplete;
    const cells = [...el.shadowRoot!.querySelectorAll<HTMLButtonElement>('.mo')];
    expect(cells).toHaveLength(12);
    expect(cells[1]!.getAttribute('aria-disabled')).toBe('true'); /* February < min */
    expect(cells[10]!.getAttribute('aria-selected')).toBe('true');
    expect(cells[10]!.getAttribute('aria-label')).toBe('ноябрь 2026');
    expect(el.shadowRoot!.querySelector('.foot')!.textContent).toContain(kitStrings.thisMonth);
    cells[1]!.click();
    expect(got).toEqual([]);
    cells[4]!.click();
    expect(got).toEqual([{ value: '2026-05', month: '2026-05' }]);
    expect(el.value).toBe('2026-05');
    el.remove();
  });
});
