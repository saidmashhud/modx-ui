// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { dateHint, dateOrder, parseTypedDay } from '../src/pickers.js';
import { kitStrings, setKitStrings } from '../src/base.js';

const year = new Date().getFullYear();
/** What the picker's text box shows for a day (the same formatter the component uses). */
const shown = (locale: string, day: string) =>
  new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(Date.parse(`${day}T00:00:00Z`));

describe('typed dates follow the locale', () => {
  const was = kitStrings.locale;
  afterEach(() => setKitStrings({ locale: was }));

  it('en-US: month first, as the box displays it', () => {
    expect(dateOrder('en-US').order).toEqual(['m', 'd', 'y']);
    expect(parseTypedDay('11/21/2026', 'en-US')).toBe('2026-11-21');
    expect(parseTypedDay('3/4/26', 'en-US')).toBe('2026-03-04');
    expect(parseTypedDay('11/21', 'en-US')).toBe(`${year}-11-21`);
    expect(parseTypedDay('21/11/2026', 'en-US')).toBeNull(); /* there is no month 21 */
    expect(dateHint('en-US')).toBe('mm/dd/yyyy');
  });

  it('ru-RU: day first, dots', () => {
    expect(parseTypedDay('21.11.2026', 'ru-RU')).toBe('2026-11-21');
    expect(parseTypedDay('3.4.26', 'ru-RU')).toBe('2026-04-03');
    expect(parseTypedDay('21.11', 'ru-RU')).toBe(`${year}-11-21`);
    expect(parseTypedDay('31.02.2026', 'ru-RU')).toBeNull();
    expect(dateHint('ru-RU')).toBe('dd.mm.yyyy');
  });

  it('de-DE: day first', () => {
    expect(parseTypedDay('21.11.26', 'de-DE')).toBe('2026-11-21');
    expect(parseTypedDay('01/02/2026', 'de-DE')).toBe('2026-02-01');
    expect(dateHint('de-DE')).toBe('dd.mm.yyyy');
  });

  it('ISO yyyy-mm-dd in every locale', () => {
    for (const l of ['en-US', 'ru-RU', 'de-DE', 'ja-JP']) expect(parseTypedDay('2026-11-21', l)).toBe('2026-11-21');
  });

  it('whatever the box shows parses back to the same day', () => {
    for (const l of ['en-US', 'en-GB', 'ru-RU', 'de-DE', 'fr-FR', 'ja-JP', 'ko-KR', 'sv-SE', 'hu-HU', 'zh-CN'])
      for (const d of ['2026-11-21', '2026-01-05', '2027-12-31']) expect(parseTypedDay(shown(l, d), l), `${l} ${shown(l, d)}`).toBe(d);
  });

  it('defaults to kitStrings.locale', () => {
    setKitStrings({ locale: 'en-US' });
    expect(parseTypedDay('02/03/2026')).toBe('2026-02-03');
    setKitStrings({ locale: 'ru-RU' });
    expect(parseTypedDay('02/03/2026')).toBe('2026-03-02');
  });

  it('rejects junk', () => {
    for (const s of ['', 'abc', '1', '1.2.3.4', '123.11.2026', '11/21/202']) expect(parseTypedDay(s, 'en-US'), s).toBeNull();
  });
});
