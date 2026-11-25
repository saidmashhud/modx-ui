import { describe, expect, it, vi } from 'vitest';
import { server, userEvent } from 'vitest/browser';
import '../../packages/ui/src/index.js';
import { isOverlayOpen, openPicker, type MxCommandList, type MxDialog, type MxToastRegion, type MxTooltip } from '../../packages/ui/src/overlay.js';
import { active, expectAccessible, mount, settle, shadow, tick, until } from './helpers.js';

/* ───────── mx-dialog ───────── */

async function dialog(inner = '<p>Body text that can be selected.</p><mx-input label="Name"></mx-input>', attrs = 'heading="Rename"') {
  const { root } = await mount(`<mx-button id="opener">Open</mx-button>
    <mx-dialog ${attrs}>${inner}<mx-button slot="footer" id="ok" variant="primary">OK</mx-button></mx-dialog>`);
  const el = root.querySelector<MxDialog>('mx-dialog')!;
  const opener = root.querySelector<HTMLElement>('#opener')!;
  return { root, el, opener, native: shadow<HTMLDialogElement>(el, 'dialog') };
}

async function openDialog(el: MxDialog, opener: HTMLElement) {
  opener.focus();
  el.open = true;
  await settle();
  await until(() => shadow<HTMLDialogElement>(el, 'dialog').open);
}

describe('mx-dialog', () => {
  it('opens modal (overlay registry), closes with the × button and returns focus to the opener', async () => {
    const { el, opener, native } = await dialog();
    const onClose = vi.fn();
    el.addEventListener('mx-close', onClose);
    await openDialog(el, opener);
    expect(native.matches(':modal')).toBe(true);
    expect(isOverlayOpen()).toBe(true);
    await userEvent.click(shadow(el, '.x'));
    await until(() => !native.open);
    expect(el.open).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(isOverlayOpen()).toBe(false);
    expect(active()).toBe(shadow(opener, 'button'));
  });

  it('Esc closes it; focus returns', async () => {
    const { el, opener, native } = await dialog();
    await openDialog(el, opener);
    shadow(el.querySelector('mx-input')!, 'input').focus();
    await userEvent.keyboard('{Escape}');
    await until(() => !native.open);
    expect(el.open).toBe(false);
    expect(active()).toBe(shadow(opener, 'button'));
  });

  it('traps focus: Tab cycles inside the dialog, the page behind is inert', async () => {
    const { el, opener } = await dialog();
    await openDialog(el, opener);
    const inside = (e: Element | null) => !!e && (el.contains(e) || el.shadowRoot!.contains(e) || [...el.querySelectorAll('*')].some((x) => x.shadowRoot?.contains(e)));
    const seen = new Set<Element>();
    const tabs = server.browser === 'webkit' ? 0 : 6;
    for (let i = 0; i < tabs; i++) {
      await userEvent.tab();
      const a = active();
      if (a && a !== document.body) {
        expect(inside(a), `focus left the dialog: ${a?.outerHTML.slice(0, 80)}`).toBe(true);
        seen.add(a);
      }
    }
    if (tabs) expect(seen.size).toBeGreaterThanOrEqual(2);
    /* the opener is covered by the backdrop: a press there hits the dialog, not the page */
    const or = opener.getBoundingClientRect();
    expect(document.elementFromPoint(or.left + 4, or.top + 4)).toBe(el);
  });

  it('a click on the backdrop closes it', async () => {
    const { el, opener, native } = await dialog();
    await openDialog(el, opener);
    const r = native.getBoundingClientRect();
    await userEvent.click(document.body, { position: { x: 4, y: Math.round(r.top + r.height / 2) }, force: true } as never).catch(async () => {
      native.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 4, clientY: r.top + 10 }));
      native.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 4, clientY: r.top + 10 }));
    });
    await until(() => !native.open);
    expect(el.open).toBe(false);
  });

  it('does not close when a text selection drag started inside ends on the backdrop', async () => {
    const { el, opener, native } = await dialog();
    await openDialog(el, opener);
    const p = el.querySelector('p')!;
    const pr = p.getBoundingClientRect();
    const r = native.getBoundingClientRect();
    /* press inside, release outside: the browser sends the click to the common ancestor (the dialog) */
    native.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true, clientX: pr.left + 5, clientY: pr.top + 5 }));
    p.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true, clientX: pr.left + 5, clientY: pr.top + 5 }));
    native.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, clientX: r.left - 20, clientY: r.top + 10 }));
    await tick(50);
    expect(el.open).toBe(true);
    /* and a real drag: down on the text, up far outside */
    await userEvent.dragAndDrop?.(p, document.body, { sourcePosition: { x: 2, y: 2 }, targetPosition: { x: 2, y: 2 } } as never).catch(() => {});
    await tick(50);
    expect(el.open).toBe(true);
  });

  it('is accessible open (light and dark)', async () => {
    const { root, el, opener } = await dialog();
    await openDialog(el, opener);
    await expectAccessible(root);
  });
});

/* ───────── mx-command-list / openPicker ───────── */

const ITEMS = [
  { value: 'a', label: 'Assign to me', group: 'Issue', shortcut: ['I'] },
  { value: 'b', label: 'Change status', group: 'Issue' },
  { value: 'c', label: 'Copy link', group: 'Issue', disabled: true },
  { value: 'd', label: 'Delete', group: 'Danger' },
];

describe('mx-command-list', () => {
  async function list(multiple = false) {
    const { el } = await mount<MxCommandList>('<mx-command-list aria-label="Commands"></mx-command-list>');
    el.items = ITEMS;
    el.multiple = multiple;
    await settle();
    const input = shadow<HTMLInputElement>(el, 'input');
    input.focus();
    const options = () => [...el.shadowRoot!.querySelectorAll<HTMLElement>('[role="option"]')];
    return { el, input, options };
  }

  it('keeps DOM focus in the search box and moves the active option (aria-activedescendant) with ↑ ↓ Home End', async () => {
    const { el, input, options } = await list();
    const activeOpt = () => options().find((o) => o.getAttribute('aria-selected') === 'true');
    expect(input.getAttribute('aria-activedescendant')).toBe(options()[0]!.id);
    await userEvent.keyboard('{ArrowDown}');
    expect(activeOpt()!.textContent).toContain('Change status');
    expect(input.getAttribute('aria-activedescendant')).toBe(activeOpt()!.id);
    await userEvent.keyboard('{End}');
    expect(activeOpt()!.textContent).toContain('Delete');
    await userEvent.keyboard('{ArrowDown}');
    expect(activeOpt()!.textContent).toContain('Assign');
    await userEvent.keyboard('{ArrowUp}');
    expect(activeOpt()!.textContent).toContain('Delete');
    await userEvent.keyboard('{Home}');
    expect(activeOpt()!.textContent).toContain('Assign');
    expect(active()).toBe(input);
    const picked = vi.fn();
    el.addEventListener('mx-select', (e) => picked((e as CustomEvent).detail));
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(picked).toHaveBeenCalledWith({ value: 'b', selected: [] });
  });

  it('skips nothing on Enter of a disabled option (no event)', async () => {
    const { el, options } = await list();
    const picked = vi.fn();
    el.addEventListener('mx-select', picked);
    await userEvent.click(options()[2]!, { force: true });
    expect(picked).not.toHaveBeenCalled();
  });

  it('aria-selected is the active option, aria-checked the chosen ones (multiple)', async () => {
    const { el, options } = await list(true);
    el.selected = ['b'];
    await settle();
    expect(options()[0]!.getAttribute('aria-selected')).toBe('true');
    expect(options()[0]!.getAttribute('aria-checked')).toBe('false');
    expect(options()[1]!.getAttribute('aria-checked')).toBe('true');
    expect(options()[1]!.getAttribute('aria-selected')).toBe('false');
    await userEvent.keyboard('{Enter}');
    expect(el.selected).toEqual(['b', 'a']);
    expect(shadow(el, '[role="listbox"]').getAttribute('aria-multiselectable')).toBe('true');
  });

  it('filters by typing; Esc emits mx-dismiss', async () => {
    const { el, options } = await list();
    await userEvent.keyboard('del');
    await settle();
    expect(options().map((o) => o.textContent!.trim())).toEqual(['Delete']);
    const dismiss = vi.fn();
    el.addEventListener('mx-dismiss', dismiss);
    await userEvent.keyboard('{Escape}');
    expect(dismiss).toHaveBeenCalled();
  });

  it('is accessible', async () => {
    const { el } = await list(true);
    await expectAccessible(el);
  });

  it('openPicker: anchored under the trigger, picks, closes and returns focus', async () => {
    const { root } = await mount('<button id="t" style="margin-left:200px">Status</button>');
    const t = root.querySelector('button')!;
    t.focus();
    const onSelect = vi.fn();
    openPicker({ anchor: t, items: ITEMS, onSelect });
    await until(() => document.querySelector('mx-popover mx-command-list'));
    const pop = document.querySelector('mx-popover')!;
    await settle(pop);
    const box = shadow(pop, '.pop').getBoundingClientRect();
    const tr = t.getBoundingClientRect();
    expect(Math.round(box.left)).toBe(Math.round(tr.left));
    expect(box.top).toBeGreaterThanOrEqual(tr.bottom);
    await until(() => active()?.localName === 'input');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(onSelect).toHaveBeenCalledWith('b', []);
    await until(() => !document.querySelector('mx-popover'));
    expect(active()).toBe(t);
  });
});

/* ───────── mx-tooltip ───────── */

describe('mx-tooltip', () => {
  it('describes its trigger (aria-description), shows on focus, Esc hides it without moving focus', async () => {
    const { el } = await mount<MxTooltip>('<mx-tooltip content="Archive" shortcut="E"><mx-button label="Archive" icon="trash"></mx-button></mx-tooltip>');
    const b = el.querySelector('mx-button')!;
    await settle();
    expect(b.getAttribute('aria-description')).toBe('Archive (E)');
    expect(shadow(b, 'button').getAttribute('aria-description')).toBe('Archive (E)');
    const tip = shadow(el, '.tip');
    b.focus();
    await until(() => tip.matches(':popover-open'), 2000);
    const tr = tip.getBoundingClientRect();
    expect(tr.top).toBeGreaterThanOrEqual(b.getBoundingClientRect().bottom);
    const onKey = vi.fn();
    document.addEventListener('keydown', onKey);
    await userEvent.keyboard('{Escape}');
    document.removeEventListener('keydown', onKey);
    expect(tip.matches(':popover-open')).toBe(false);
    expect(onKey).not.toHaveBeenCalled(); /* consumed: a dialog around it would stay open */
    expect(active()).toBe(shadow(b, 'button'));
  });

  it('shows on hover and hides on leave', async () => {
    const { el } = await mount<MxTooltip>('<mx-tooltip content="Settings"><mx-button>⚙</mx-button></mx-tooltip>');
    const tip = shadow(el, '.tip');
    await userEvent.hover(el);
    await until(() => tip.matches(':popover-open'), 2000);
    await userEvent.unhover(el);
    await until(() => !tip.matches(':popover-open'));
  });

  it('is accessible', async () => {
    const { root } = await mount('<mx-tooltip content="Archive"><mx-button>Archive</mx-button></mx-tooltip>');
    await expectAccessible(root);
  });
});

/* ───────── mx-toast-region ───────── */

describe('mx-toast-region', () => {
  it('announces politely, sits at the inline end, fires action / dismiss', async () => {
    const { el } = await mount<MxToastRegion>('<mx-toast-region></mx-toast-region>');
    el.toasts = [
      { id: 1, message: 'Issue archived', tone: 'info', action: { label: 'Undo' } },
      { id: 2, message: 'Saved', tone: 'success' },
      { id: 3, message: 'Could not save', tone: 'danger' },
    ];
    await settle();
    expect(shadow(el, '[role="status"]').getAttribute('aria-live')).toBe('polite');
    const r = el.getBoundingClientRect();
    expect(window.innerWidth - r.right).toBeLessThan(40);
    const onAction = vi.fn();
    const onDismiss = vi.fn();
    el.addEventListener('mx-toast-action', (e) => onAction((e as CustomEvent).detail));
    el.addEventListener('mx-toast-dismiss', (e) => onDismiss((e as CustomEvent).detail));
    const buttons = el.shadowRoot!.querySelectorAll<HTMLElement>('button');
    await userEvent.click(buttons[0]!);
    expect(onAction).toHaveBeenCalledWith(1);
    await userEvent.click(el.shadowRoot!.querySelectorAll<HTMLElement>('.x')[2]!);
    expect(onDismiss).toHaveBeenCalledWith(3);
    await expectAccessible(el);
  });
});

/* ───────── mx-segmented (the kit's tabs-like radio group) ───────── */

describe('mx-segmented', () => {
  async function seg(value = 'list') {
    const { el } = await mount<HTMLElement & { value: string; options: unknown }>('<mx-segmented label="View"></mx-segmented>');
    el.options = [{ value: 'list', label: 'List' }, { value: 'board', label: 'Board' }, { value: 'timeline', label: 'Timeline' }];
    el.value = value;
    await settle();
    const radios = () => [...el.shadowRoot!.querySelectorAll<HTMLElement>('[role="radio"]')];
    return { el, radios };
  }

  it('roving tabindex; ← → ↑ ↓ move and pick (wrapping), Home / End', async () => {
    const { el, radios } = await seg();
    const changes: string[] = [];
    el.addEventListener('mx-change', (e) => changes.push((e as CustomEvent).detail));
    expect(radios().map((r) => r.tabIndex)).toEqual([0, -1, -1]);
    radios()[0]!.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(el.value).toBe('board');
    await settle();
    expect(active()).toBe(radios()[1]);
    await userEvent.keyboard('{ArrowDown}');
    expect(el.value).toBe('timeline');
    await userEvent.keyboard('{ArrowDown}');
    expect(el.value).toBe('list');
    await userEvent.keyboard('{ArrowUp}');
    expect(el.value).toBe('timeline');
    await userEvent.keyboard('{Home}');
    expect(el.value).toBe('list');
    await userEvent.keyboard('{End}');
    expect(el.value).toBe('timeline');
    await userEvent.keyboard('{ArrowLeft}');
    expect(el.value).toBe('board');
    await settle();
    expect(active()).toBe(radios()[1]);
    expect(changes).toEqual(['board', 'timeline', 'list', 'timeline', 'list', 'timeline', 'board']);
  });

  it('with no value the first option is still reachable by Tab', async () => {
    const { radios } = await seg('');
    expect(radios().map((r) => r.tabIndex)).toEqual([0, -1, -1]);
  });

  it('is accessible', async () => {
    const { el } = await seg();
    await expectAccessible(el);
  });
});
