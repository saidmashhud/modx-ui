/**
 * Visual regression: a handful of key components, compared with baselines in __screenshots__/ (one per browser and
 * platform). Run `npm run test:visual`; after a deliberate change `npm run test:visual -- --update` and review the
 * new PNGs. CI (Linux) compares against the *-linux.png baselines, made by the `browser` job when none exist.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import '../../packages/ui/src/index.js';
import type { MxSelect } from '../../packages/ui/src/pickers.js';
import type { MxToastRegion, MxDialog } from '../../packages/ui/src/overlay.js';
import { mount, settle, shadow, tick, until } from './helpers.js';

/* the calendar marks "today": pin the clock (Date only, timers stay real) */
beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 25, 12)); });
afterAll(() => { vi.useRealTimers(); });

const shot = (el: Element, name: string) => expect.element(page.elementLocator(el)).toMatchScreenshot(name);

async function themed(theme: 'dark' | 'light') {
  document.documentElement.dataset.theme = theme;
  await tick(300);
}

describe.each(['dark', 'light'] as const)('%s theme', (theme) => {
  it('buttons', async () => {
    await themed(theme);
    const { root } = await mount(`<mx-button variant="primary" icon="plus">New issue</mx-button>
      <mx-button>Secondary</mx-button><mx-button variant="ghost">Ghost</mx-button><mx-button variant="danger">Delete</mx-button>
      <mx-button size="sm">Small</mx-button><mx-button loading>Saving</mx-button><mx-button disabled>Disabled</mx-button>`,
    { style: 'display:flex;gap:8px;align-items:center;padding:12px;width:max-content;background:var(--mx-bg)' });
    await shot(root, `buttons-${theme}`);
  });

  it('fields', async () => {
    await themed(theme);
    const { root } = await mount(`<mx-input label="Title" value="Ship the docs"></mx-input>
      <mx-input label="Email" error="Not an address" value="ada@"></mx-input>
      <mx-select label="Status" value="doing" block></mx-select>
      <mx-date-picker label="Due" value="2026-11-18" block></mx-date-picker>
      <mx-switch checked>Notify me</mx-switch>
      <mx-segmented label="View"></mx-segmented>`,
    { style: 'display:grid;gap:12px;padding:12px;width:320px;background:var(--mx-bg)' });
    const sel = root.querySelector<MxSelect>('mx-select')!;
    sel.options = [{ value: 'todo', label: 'Todo' }, { value: 'doing', label: 'In progress' }];
    const seg = root.querySelector<HTMLElement & { options: unknown; value: string }>('mx-segmented')!;
    seg.options = [{ value: 'list', label: 'List' }, { value: 'board', label: 'Board' }, { value: 'time', label: 'Timeline' }];
    seg.value = 'board';
    await settle();
    await tick(300);
    await shot(root, `fields-${theme}`);
  });
});

describe('overlays', () => {
  it('date picker calendar (dark)', async () => {
    await themed('dark');
    const { root } = await mount('<mx-date-picker label="Due" value="2026-11-18"></mx-date-picker>');
    const dp = root.querySelector('mx-date-picker')!;
    shadow(dp, '.trigger').focus();
    await userEvent.keyboard('{Enter}');
    await until(() => dp.shadowRoot!.querySelector('.cal'));
    await tick(400);
    await expect.element(page.getByRole('dialog', { name: 'Due' })).toMatchScreenshot('date-picker-open');
  });

  it('dialog (light)', async () => {
    await themed('light');
    const { root } = await mount(`<mx-dialog heading="Rename project" width="420px"><div style="padding:16px">
      <mx-input label="Name" value="Mobile app"></mx-input></div>
      <mx-button slot="footer">Cancel</mx-button><mx-button slot="footer" variant="primary">Rename</mx-button></mx-dialog>`);
    const d = root.querySelector<MxDialog>('mx-dialog')!;
    d.open = true;
    await settle();
    await tick(500);
    (document.activeElement as HTMLElement | null)?.blur();
    await shot(shadow(d, 'dialog'), 'dialog-light');
  });

  it('toasts (dark)', async () => {
    await themed('dark');
    const { root } = await mount('<mx-toast-region></mx-toast-region>');
    const t = root.querySelector<MxToastRegion>('mx-toast-region')!;
    t.toasts = [
      { id: 1, message: 'Issue archived', tone: 'info', action: { label: 'Undo' } },
      { id: 2, message: 'Saved', tone: 'success' },
      { id: 3, message: 'Could not reach the server', tone: 'danger' },
    ];
    await settle();
    await tick(500);
    await shot(t, 'toasts-dark');
  });
});

describe('right to left', () => {
  it('date picker calendar', async () => {
    await themed('dark');
    const { root } = await mount('<mx-date-picker label="الموعد" value="2026-11-18"></mx-date-picker>', { dir: 'rtl', lang: 'ar' });
    const dp = root.querySelector('mx-date-picker')!;
    shadow(dp, '.trigger').focus();
    await userEvent.keyboard('{Enter}');
    await until(() => dp.shadowRoot!.querySelector('.cal'));
    await tick(400);
    await expect.element(page.getByRole('dialog', { name: 'الموعد' })).toMatchScreenshot('rtl-date-picker-open');
  });

  it('fields and toasts', async () => {
    await themed('light');
    const { root } = await mount(`<mx-input label="العنوان" value="إطلاق الوثائق"></mx-input>
      <mx-select label="الحالة" value="b" block></mx-select>
      <mx-switch checked>إشعارات</mx-switch>
      <mx-breadcrumbs current="ENG-12"></mx-breadcrumbs>`,
    { dir: 'rtl', lang: 'ar', style: 'display:grid;gap:12px;padding:12px;width:320px;background:var(--mx-bg)' });
    const sel = root.querySelector<MxSelect>('mx-select')!;
    sel.options = [{ value: 'a', label: 'مفتوح' }, { value: 'b', label: 'قيد التنفيذ' }];
    const bc = root.querySelector<HTMLElement & { items: unknown }>('mx-breadcrumbs')!;
    bc.items = [{ label: 'الهندسة', href: '#' }, { label: 'المهام', href: '#' }];
    await settle();
    await tick(300);
    await shot(root, 'rtl-fields-light');
  });
});
