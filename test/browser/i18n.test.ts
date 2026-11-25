import { describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import '../../packages/ui/src/index.js';
import { kitStrings, onKitStrings, setKitStrings } from '../../packages/ui/src/base.js';
import type { MxBreadcrumbs } from '../../packages/ui/src/nav.js';
import type { MxCommandList, MxDialog } from '../../packages/ui/src/overlay.js';
import type { MxDatePicker, MxSelect } from '../../packages/ui/src/pickers.js';
import { mount, settle, shadow, until } from './helpers.js';

describe('setKitStrings on a running page', () => {
  it('re-renders components that are already mounted', async () => {
    const { root } = await mount(`<mx-breadcrumbs current="ENG-1"></mx-breadcrumbs>
      <mx-select></mx-select><mx-date-picker value="2026-11-18"></mx-date-picker><mx-command-list></mx-command-list>
      <mx-spinner></mx-spinner>`);
    const crumbs = root.querySelector<MxBreadcrumbs>('mx-breadcrumbs')!;
    crumbs.items = [{ label: 'Eng', href: '/eng' }];
    const list = root.querySelector<MxCommandList>('mx-command-list')!;
    await settle();
    expect(shadow(crumbs, 'nav').getAttribute('aria-label')).toBe('Breadcrumb');
    expect(shadow(root.querySelector('mx-select')!, '.ph').textContent).toBe('Select…');
    expect(shadow(root.querySelector('mx-date-picker')!, '.val').textContent).toBe('Nov 18, 2026');
    expect(shadow<HTMLInputElement>(list, 'input').placeholder).toBe('Search…');

    setKitStrings({ breadcrumb: 'Навигация', select: 'Выберите…', search: 'Поиск…', noResults: 'Ничего', loading: 'Загрузка', locale: 'ru-RU', weekStart: 1 });
    await settle();
    expect(shadow(crumbs, 'nav').getAttribute('aria-label')).toBe('Навигация');
    expect(shadow(root.querySelector('mx-select')!, '.ph').textContent).toBe('Выберите…');
    expect(shadow(root.querySelector('mx-date-picker')!, '.val').textContent).toBe('18 нояб. 2026 г.');
    expect(shadow<HTMLInputElement>(list, 'input').placeholder).toBe('Поиск…');
    expect(shadow(list, '.empty').textContent).toBe('Ничего');
    expect(shadow(root.querySelector('mx-spinner')!, '.spinner').getAttribute('aria-label')).toBe('Загрузка');
  });

  it('an open dialog and date picker pick up the new strings and locale', async () => {
    const { root } = await mount(`<mx-dialog heading="Edit"><p>x</p></mx-dialog>`);
    const d = root.querySelector<MxDialog>('mx-dialog')!;
    d.open = true;
    await settle();
    setKitStrings({ close: 'Закрыть' });
    await settle();
    expect(shadow(d, '.x').getAttribute('aria-label')).toBe('Закрыть');
    d.open = false;
    await settle();

    const { root: r2 } = await mount('<mx-date-picker value="2026-11-18"></mx-date-picker>');
    const dp = r2.querySelector<MxDatePicker>('mx-date-picker')!;
    shadow(dp, '.trigger').focus();
    await userEvent.keyboard('{Enter}');
    await until(() => dp.shadowRoot!.querySelector('.cal'));
    expect(shadow(dp, 'th').textContent).toBe('Sun');
    setKitStrings({ locale: 'ru-RU', weekStart: 1 });
    await settle();
    expect(shadow(dp, 'th').textContent!.toLowerCase()).toBe('пн'); /* WebKit's ICU capitalises it */
    expect(shadow(dp, '.top b').textContent).toBe('ноябрь 2026 г.');
  });

  it('onKitStrings tells app code, and unsubscribes', async () => {
    const seen: string[] = [];
    const off = onKitStrings((s) => seen.push(s.today));
    setKitStrings({ today: 'Сегодня' });
    off();
    setKitStrings({ today: 'Today' });
    expect(seen).toEqual(['Сегодня']);
    expect(kitStrings.today).toBe('Today');
  });

  it('a select already open keeps working after a switch', async () => {
    const { root } = await mount('<mx-select></mx-select>');
    const el = root.querySelector<MxSelect>('mx-select')!;
    el.options = [{ value: 'a', label: 'A' }];
    await settle();
    await userEvent.click(shadow(el, '.trigger'));
    await until(() => el.shadowRoot!.querySelector('mx-command-list'));
    setKitStrings({ search: 'Поиск…' });
    await settle();
    await userEvent.keyboard('{Enter}');
    expect(el.value).toBe('a');
  });
});
