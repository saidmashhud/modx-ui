import { describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import '../../packages/ui/src/index.js';
import { directionOf } from '../../packages/ui/src/base.js';
import { openPicker, position, type MxToastRegion } from '../../packages/ui/src/overlay.js';
import type { MxSwitch } from '../../packages/ui/src/form.js';
import type { MxDatePicker, MxSelect } from '../../packages/ui/src/pickers.js';
import type { MxBreadcrumbs } from '../../packages/ui/src/nav.js';
import { active, expectAccessible, mount, settle, shadow, tick, until } from './helpers.js';

const near = (a: number, b: number, tol = 1.5) => expect(Math.abs(a - b), `${a} ≈ ${b}`).toBeLessThanOrEqual(tol);
const focusedDay = () => (active() as HTMLElement | null)?.dataset.day;
const focusedMonth = () => (active() as HTMLElement | null)?.dataset.month;

describe('direction', () => {
  it('directionOf follows the nearest dir attribute (across shadow roots) and CSS direction', async () => {
    const { root } = await mount('<section dir="rtl"><mx-select></mx-select></section><p style="direction: rtl">x</p><p>y</p>');
    const sel = root.querySelector('mx-select')!;
    expect(directionOf(sel)).toBe('rtl');
    expect(directionOf(shadow(sel, '.trigger'))).toBe('rtl');
    expect(directionOf(root.querySelectorAll('p')[0])).toBe('rtl');
    expect(directionOf(root.querySelectorAll('p')[1])).toBe('ltr');
  });
});

describe('overlay positioning in RTL', () => {
  async function anchorAndBox(dir: 'ltr' | 'rtl') {
    const { root } = await mount(`<button id="a" style="margin-inline-start: 300px; width: 120px">Anchor</button>
      <div id="o" style="position: fixed; width: 220px; height: 80px; background: var(--mx-surface)"></div>`, { dir });
    return { a: root.querySelector<HTMLElement>('#a')!, o: root.querySelector<HTMLElement>('#o')! };
  }

  it('bottom-start lines up with the anchor’s start edge: left in LTR, right in RTL', async () => {
    const ltr = await anchorAndBox('ltr');
    position(ltr.o, ltr.a, 'bottom-start');
    near(ltr.o.getBoundingClientRect().left, ltr.a.getBoundingClientRect().left);
    document.body.replaceChildren();
    const rtl = await anchorAndBox('rtl');
    position(rtl.o, rtl.a, 'bottom-start');
    near(rtl.o.getBoundingClientRect().right, rtl.a.getBoundingClientRect().right);
    position(rtl.o, rtl.a, 'bottom-end');
    near(rtl.o.getBoundingClientRect().left, rtl.a.getBoundingClientRect().left);
  });

  it('right-start (a submenu) opens on the inline-end side: to the left in RTL', async () => {
    const { a, o } = await anchorAndBox('rtl');
    position(o, a, 'right-start');
    near(o.getBoundingClientRect().right, a.getBoundingClientRect().left - 4);
    position(o, a, 'right-start', 4, 'ltr');
    near(o.getBoundingClientRect().left, a.getBoundingClientRect().right + 4);
  });

  it('mx-select opens its list under the trigger’s right edge in RTL', async () => {
    const { root } = await mount('<div style="padding-inline-start: 200px"><mx-select label="الحالة" style="width: 160px"></mx-select></div>', { dir: 'rtl' });
    const el = root.querySelector<MxSelect>('mx-select')!;
    el.options = [{ value: 'a', label: 'مفتوح' }, { value: 'b', label: 'مغلق' }];
    await settle();
    const tr = shadow(el, '.trigger');
    await userEvent.click(tr);
    await until(() => el.shadowRoot!.querySelector('mx-command-list'));
    const pop = el.shadowRoot!.querySelector('mx-popover')!;
    await settle(pop);
    near(shadow(pop, '.pop').getBoundingClientRect().right, tr.getBoundingClientRect().right);
    await expectAccessible(root);
  });

  it('openPicker carries the anchor’s direction onto the popover it mounts in <body>', async () => {
    const { root } = await mount('<button style="margin-inline-start: 400px">⋯</button>', { dir: 'rtl' });
    const b = root.querySelector('button')!;
    openPicker({ anchor: b, items: [{ value: 'x', label: 'حذف' }], onSelect: () => {} });
    await until(() => document.querySelector('body > mx-popover'));
    const pop = document.querySelector<HTMLElement>('body > mx-popover')!;
    await settle(pop);
    expect(pop.getAttribute('dir')).toBe('rtl');
    near(shadow(pop, '.pop').getBoundingClientRect().right, b.getBoundingClientRect().right);
  });
});

describe('components in RTL', () => {
  it('mx-toast-region sits at the inline end: bottom left', async () => {
    const { root } = await mount('<mx-toast-region></mx-toast-region>', { dir: 'rtl' });
    const el = root.querySelector<MxToastRegion>('mx-toast-region')!;
    el.toasts = [{ id: 1, message: 'تم الحفظ', tone: 'success' }];
    await settle();
    expect(el.getBoundingClientRect().left).toBeLessThan(40);
  });

  it('mx-switch: the thumb ends on the left when on', async () => {
    const { root } = await mount('<mx-switch checked>إشعارات</mx-switch>', { dir: 'rtl' });
    const el = root.querySelector<MxSwitch>('mx-switch')!;
    await tick(300);
    const track = shadow(el, '.track').getBoundingClientRect();
    const thumb = shadow(el, '.thumb').getBoundingClientRect();
    near(thumb.left, track.left + 2);
    el.checked = false;
    await settle();
    await tick(300);
    near(shadow(el, '.thumb').getBoundingClientRect().right, track.right - 2);
  });

  it('mx-segmented: → is previous, ← is next', async () => {
    const { root } = await mount('<mx-segmented label="عرض"></mx-segmented>', { dir: 'rtl' });
    const el = root.querySelector<HTMLElement & { value: string; options: unknown }>('mx-segmented')!;
    el.options = [{ value: 'a', label: 'قائمة' }, { value: 'b', label: 'لوحة' }, { value: 'c', label: 'جدول' }];
    el.value = 'a';
    await settle();
    shadow(el, '[aria-checked="true"]').focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(el.value).toBe('b');
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(el.value).toBe('c');
    /* the first option is on the right */
    const [first, second] = el.shadowRoot!.querySelectorAll('[role="radio"]');
    expect(first!.getBoundingClientRect().left).toBeGreaterThan(second!.getBoundingClientRect().left);
  });

  it('mx-date-picker day grid: ← is the next day, → the previous; weeks run right to left', async () => {
    const { root } = await mount('<mx-date-picker label="الموعد" value="2026-11-18"></mx-date-picker>', { dir: 'rtl' });
    const el = root.querySelector<MxDatePicker>('mx-date-picker')!;
    shadow(el, '.trigger').focus();
    await userEvent.keyboard('{Enter}');
    await until(() => focusedDay());
    await userEvent.keyboard('{ArrowLeft}');
    expect(focusedDay()).toBe('2026-11-19');
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(focusedDay()).toBe('2026-11-17');
    const d17 = shadow(el, '[data-day="2026-11-17"]').getBoundingClientRect();
    const d18 = shadow(el, '[data-day="2026-11-18"]').getBoundingClientRect();
    expect(d18.left).toBeLessThan(d17.left);
    await expectAccessible(root);
  });

  it('mx-date-picker month grid: ← is the next month', async () => {
    const { root } = await mount('<mx-date-picker mode="month" value="2026-06"></mx-date-picker>', { dir: 'rtl' });
    const el = root.querySelector<MxDatePicker>('mx-date-picker')!;
    shadow(el, '.trigger').focus();
    await userEvent.keyboard('{Enter}');
    await until(() => focusedMonth());
    await userEvent.keyboard('{ArrowLeft}');
    expect(focusedMonth()).toBe('2026-07');
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(focusedMonth()).toBe('2026-05');
  });

  it('keys follow CSS direction too (no dir attribute)', async () => {
    const { root } = await mount('<mx-date-picker value="2026-11-18"></mx-date-picker>', { style: 'direction: rtl' });
    const el = root.querySelector<MxDatePicker>('mx-date-picker')!;
    shadow(el, '.trigger').focus();
    await userEvent.keyboard('{Enter}');
    await until(() => focusedDay());
    await userEvent.keyboard('{ArrowLeft}');
    expect(focusedDay()).toBe('2026-11-19');
  });

  it('directional icons are mirrored (back points right), others are not', async () => {
    const { root } = await mount(`<mx-icon name="chevron-left"></mx-icon><mx-icon name="calendar"></mx-icon>
      <mx-icon name="chevron-left" no-mirror></mx-icon>`, { dir: 'rtl' });
    const [back, cal, kept] = [...root.querySelectorAll('mx-icon')].map((i) => getComputedStyle(shadow(i, 'svg')).transform);
    expect(back).toBe('matrix(-1, 0, 0, 1, 0, 0)');
    expect(cal).toBe('none');
    expect(kept).toBe('none');
  });

  it('mx-breadcrumbs: back chevron and separators point the reading way', async () => {
    const { root } = await mount('<mx-breadcrumbs current="ENG-12"></mx-breadcrumbs>', { dir: 'rtl' });
    const el = root.querySelector<MxBreadcrumbs>('mx-breadcrumbs')!;
    el.items = [{ label: 'الهندسة', href: '/eng' }];
    await settle();
    const t = (i: Element) => getComputedStyle(shadow(i, 'svg')).transform;
    expect(t(shadow(el, '.back mx-icon'))).toBe('matrix(-1, 0, 0, 1, 0, 0)');
    expect(t(shadow(el, '.sep'))).toBe('matrix(-1, 0, 0, 1, 0, 0)');
    await expectAccessible(root);
  });
});
