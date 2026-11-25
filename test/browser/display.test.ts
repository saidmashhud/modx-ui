import { describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import '../../packages/ui/src/index.js';
import type { MxBreadcrumbs } from '../../packages/ui/src/nav.js';
import { expectAccessible, mount, settle, shadow } from './helpers.js';

describe('display components', () => {
  it('avatar, chip, kbd, spinner, status / priority icons, stat, empty are accessible', async () => {
    const { root } = await mount(`
      <mx-avatar name="Ada Lovelace"></mx-avatar> <mx-avatar></mx-avatar>
      <mx-chip color="#4cb782">Design</mx-chip> <mx-chip removable>Filter</mx-chip> <mx-kbd>⌘</mx-kbd><mx-kbd>K</mx-kbd>
      <mx-spinner></mx-spinner> <mx-status-icon status="in_progress"></mx-status-icon> <mx-priority-icon priority="2"></mx-priority-icon>
      <mx-icon name="calendar" label="Due date"></mx-icon>
      <mx-stat label="Open issues">128<span slot="hint">+12 this week</span></mx-stat>
      <mx-empty icon="inbox" heading="Nothing here yet">Issues assigned to you show up here.</mx-empty>`);
    await expectAccessible(root);
  });

  it('mx-chip remove emits mx-remove (not a click on the chip)', async () => {
    const { el } = await mount('<mx-chip removable interactive>Label</mx-chip>');
    const onRemove = vi.fn();
    const onClick = vi.fn();
    el.addEventListener('mx-remove', onRemove);
    el.addEventListener('click', onClick);
    await userEvent.click(shadow(el, 'button'));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('mx-markdown renders safely and accessibly', async () => {
    const { el } = await mount<HTMLElement & { source: string }>('<mx-markdown></mx-markdown>');
    el.source = '## Notes\n\nShip **today**, see [the plan](https://example.com).\n\n- one\n- two\n\n<img src=x onerror=alert(1)>';
    await settle();
    expect(el.shadowRoot!.querySelector('img')).toBeNull();
    expect(el.shadowRoot!.textContent).toContain('<img src=x onerror=alert(1)>');
    await expectAccessible(el);
  });
});

describe('empty fields', () => {
  it('placeholders in mx-select / mx-date-picker triggers keep 4.5:1 (they are text, not ::placeholder)', async () => {
    const { root } = await mount(`<mx-select label="Assignee" placeholder="Nobody"></mx-select>
      <mx-date-picker label="Due"></mx-date-picker><mx-date-picker mode="month" label="Month"></mx-date-picker>`);
    await expectAccessible(root);
  });
});

describe('navigation', () => {
  it('mx-nav-item: a real link; plain clicks emit mx-navigate, modified clicks do not', async () => {
    const { root } = await mount(`<nav aria-label="Main"><mx-nav-item href="/inbox" icon="inbox" count="3" active>Inbox</mx-nav-item>
      <mx-nav-item href="/issues" icon="issues">Issues</mx-nav-item></nav>`);
    const items = root.querySelectorAll('mx-nav-item');
    const nav = vi.fn((e: Event) => (e as CustomEvent).detail);
    root.addEventListener('mx-navigate', nav);
    expect(shadow(items[0]!, 'a').getAttribute('aria-current')).toBe('page');
    await userEvent.click(items[1]!);
    expect(nav).toHaveBeenCalledTimes(1);
    expect((nav.mock.calls[0]![0] as CustomEvent).detail).toBe('/issues');
    await expectAccessible(root);
  });

  it('mx-breadcrumbs: back goes to the parent, the trail is a named nav', async () => {
    const { el } = await mount<MxBreadcrumbs>('<mx-breadcrumbs current="ENG-12"></mx-breadcrumbs>');
    el.items = [{ label: 'Engineering', href: '/eng' }, { label: 'Backlog', href: '/eng/backlog' }];
    await settle();
    const nav = vi.fn();
    el.addEventListener('mx-navigate', (e) => nav((e as CustomEvent).detail));
    await userEvent.click(shadow(el, '.back'));
    expect(nav).toHaveBeenCalledWith('/eng/backlog');
    expect(shadow(el, 'nav').getAttribute('aria-label')).toBe('Breadcrumb');
    expect(shadow(el, '.cur').getAttribute('aria-current')).toBe('page');
    await expectAccessible(el);
  });
});
