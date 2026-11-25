import type { Demo } from './demo.js';

/** Live examples per element. The markup and script are shown exactly as they run. */
export const DEMOS: Record<string, Demo[]> = {
  'mx-button': [
    {
      title: 'Variants',
      note: 'One primary action per view; secondary for the rest, ghost in toolbars, danger for destructive actions.',
      html: `
        <mx-button variant="primary" icon="plus">New issue</mx-button>
        <mx-button>Cancel</mx-button>
        <mx-button variant="ghost" icon="filter">Filter</mx-button>
        <mx-button variant="danger" icon="trash">Delete</mx-button>`,
    },
    {
      title: 'Sizes, icons, states',
      html: `
        <mx-button size="sm">Small</mx-button>
        <mx-button>Medium</mx-button>
        <mx-button size="lg" variant="primary">Large</mx-button>
        <mx-button icon="copy" icon-only label="Copy link"></mx-button>
        <mx-button loading>Saving</mx-button>
        <mx-button disabled>Disabled</mx-button>
        <mx-button id="pin" icon="target" pressed>Pinned</mx-button>`,
      js: `
        const pin = document.querySelector('#pin');
        pin.addEventListener('click', () => { pin.pressed = !pin.pressed; });`,
    },
    {
      title: 'In a form',
      note: 'type="submit" and type="reset" act on the form the button belongs to, even from inside a shadow root.',
      layout: 'column',
      html: `
        <form id="rename" style="display:flex;gap:8px;align-items:end;flex-wrap:wrap">
          <mx-input name="title" label="Title" value="Quarterly plan" required></mx-input>
          <mx-button type="reset">Reset</mx-button>
          <mx-button type="submit" variant="primary">Save</mx-button>
        </form>
        <output id="rename-out" style="color:var(--mx-text-muted);font-size:var(--mx-text-sm)">Submit to see the form data.</output>`,
      js: `
        document.querySelector('#rename').addEventListener('submit', (e) => {
          e.preventDefault();
          const data = Object.fromEntries(new FormData(e.target));
          document.querySelector('#rename-out').textContent = 'Submitted: ' + JSON.stringify(data);
        });`,
    },
  ],
  'mx-icon': [
    {
      title: 'The line set',
      note: '16 px, 1.5 px stroke. Decorative unless it has a label. Directional icons mirror under RTL — try the toggle.',
      html: `
        <mx-icon name="inbox"></mx-icon><mx-icon name="issues"></mx-icon><mx-icon name="board"></mx-icon>
        <mx-icon name="calendar"></mx-icon><mx-icon name="search"></mx-icon><mx-icon name="filter"></mx-icon>
        <mx-icon name="chevron-left"></mx-icon><mx-icon name="chevron-right"></mx-icon><mx-icon name="arrow-left"></mx-icon>
        <mx-icon name="undo"></mx-icon><mx-icon name="redo"></mx-icon>
        <mx-icon name="bell" size="24" label="Notifications"></mx-icon>`,
    },
  ],
  'mx-kbd': [
    { title: 'Shortcuts', html: `<span>Open the command menu with <mx-kbd>⌘</mx-kbd> <mx-kbd>K</mx-kbd>, archive with <mx-kbd>E</mx-kbd>.</span>` },
  ],
  'mx-input': [
    {
      title: 'Fields',
      layout: 'column',
      html: `
        <mx-input label="Title" placeholder="What needs doing?"></mx-input>
        <mx-input label="Search" icon="search" type="search" placeholder="Issues, people, projects"></mx-input>
        <mx-input label="Email" value="ada@" error="Enter an address like name@example.com"></mx-input>`,
    },
    {
      title: 'Required, in a form',
      note: 'The browser blocks submission and shows kitStrings.valueMissing at the field.',
      layout: 'column',
      html: `
        <form id="f-in" style="display:flex;gap:8px;align-items:end">
          <mx-input name="project" label="Project name" required></mx-input>
          <mx-button type="submit" variant="primary">Create</mx-button>
        </form>`,
      js: `document.querySelector('#f-in').addEventListener('submit', (e) => { e.preventDefault(); alert('Created ' + new FormData(e.target).get('project')); });`,
    },
  ],
  'mx-textarea': [
    {
      title: 'Grows with its text, @mentions',
      note: 'Type @ and a name. ↑ ↓ choose, Enter or Tab insert, Esc closes.',
      layout: 'column',
      html: `<mx-textarea id="comment" label="Comment" placeholder="Write a comment… try @ad"></mx-textarea>`,
      js: `
        document.querySelector('#comment').mentions = [
          { id: 'u1', label: 'Ada Lovelace', hint: 'Engineering', color: '#4cb782' },
          { id: 'u2', label: 'Alan Turing', hint: 'Research', color: '#a46bff' },
          { id: 'u3', label: 'Grace Hopper', hint: 'Platform', color: '#f2994a' },
        ];`,
    },
  ],
  'mx-select': [
    {
      title: 'Single choice',
      note: 'Focus the field and press ↓, or start typing: the list opens filtered. Bottom sheet on phones.',
      html: `
        <mx-select id="status" label="Status" value="doing" style="width:220px"></mx-select>
        <mx-select id="assignee" label="Assignee" placeholder="Nobody" style="width:220px"></mx-select>`,
      js: `
        document.querySelector('#status').options = [
          { value: 'backlog', label: 'Backlog' }, { value: 'todo', label: 'Todo' },
          { value: 'doing', label: 'In progress' }, { value: 'review', label: 'In review' }, { value: 'done', label: 'Done' },
        ];
        document.querySelector('#assignee').options = ['Ada Lovelace', 'Alan Turing', 'Grace Hopper', 'Edsger Dijkstra',
          'Barbara Liskov', 'Donald Knuth', 'Margaret Hamilton', 'Ken Thompson'].map((n) => ({ value: n, label: n, icon: 'user' }));`,
    },
    {
      title: 'Several values',
      html: `<mx-select id="labels" label="Labels" multiple style="width:260px"></mx-select>`,
      js: `
        const labels = document.querySelector('#labels');
        labels.options = ['Bug', 'Feature', 'Design', 'Docs', 'Performance'].map((l) => ({ value: l.toLowerCase(), label: l }));
        labels.values = ['bug', 'docs'];`,
    },
  ],
  'mx-date-picker': [
    {
      title: 'A day',
      note: 'Arrows move by day and week, PageUp / PageDown by month (Shift: year), Home / End to the week’s ends. Or type a date in the locale’s order.',
      html: `
        <mx-date-picker label="Due" value="2026-11-18" style="width:220px"></mx-date-picker>
        <mx-date-picker label="Start" placeholder="Not set" style="width:220px"></mx-date-picker>`,
    },
    {
      title: 'A range, and a month',
      html: `
        <mx-date-picker id="cycle" label="Cycle" range style="width:260px"></mx-date-picker>
        <mx-date-picker label="Billing month" mode="month" value="2026-11" style="width:200px"></mx-date-picker>`,
      js: `
        const cycle = document.querySelector('#cycle');
        cycle.start = Date.UTC(2026, 10, 2);
        cycle.end = Date.UTC(2026, 10, 15);`,
    },
  ],
  'mx-switch': [
    {
      title: 'Settings',
      layout: 'column',
      html: `
        <mx-switch checked>Email me about mentions</mx-switch>
        <mx-switch>Weekly digest</mx-switch>
        <mx-switch disabled>Desktop notifications (blocked by the browser)</mx-switch>`,
    },
  ],
  'mx-segmented': [
    {
      title: 'View switcher',
      note: 'One Tab stop; arrows (mirrored in RTL), Home and End pick.',
      html: `<mx-segmented id="view" label="View"></mx-segmented> <mx-segmented id="density" label="Density" size="sm"></mx-segmented>`,
      js: `
        const view = document.querySelector('#view');
        view.options = [{ value: 'list', label: 'List', icon: 'list' }, { value: 'board', label: 'Board', icon: 'board' }, { value: 'timeline', label: 'Timeline', icon: 'timeline' }];
        view.value = 'board';
        const density = document.querySelector('#density');
        density.options = [{ value: 'compact', label: 'Compact' }, { value: 'comfy', label: 'Comfortable' }];
        density.value = 'compact';`,
    },
  ],
  'mx-dialog': [
    {
      title: 'Modal',
      note: 'Esc, ×, or a click on the backdrop close it; a text selection dragged out of it does not. Focus comes back to the button.',
      html: `
        <mx-button id="open-rename" variant="primary">Rename project</mx-button>
        <mx-dialog id="rename-dialog" heading="Rename project" width="440px">
          <div style="padding:16px;display:grid;gap:12px">
            <mx-input label="Name" value="Mobile app"></mx-input>
            <p style="margin:0;color:var(--mx-text-muted)">Links to the old name keep working.</p>
          </div>
          <mx-button slot="footer" id="cancel-rename">Cancel</mx-button>
          <mx-button slot="footer" variant="primary" id="save-rename">Rename</mx-button>
        </mx-dialog>`,
      js: `
        const dialog = document.querySelector('#rename-dialog');
        document.querySelector('#open-rename').addEventListener('click', () => { dialog.open = true; });
        for (const id of ['#cancel-rename', '#save-rename']) document.querySelector(id).addEventListener('click', () => dialog.close());`,
    },
  ],
  'mx-popover': [
    {
      title: 'Anchored panel',
      note: 'The Popover API: top layer, light dismiss, flips to stay on screen; a bottom sheet on phones.',
      html: `
        <mx-button id="pop-btn" icon-end="chevron-down">Display</mx-button>
        <mx-popover id="pop">
          <div style="padding:12px;display:grid;gap:10px;min-width:220px">
            <mx-switch checked>Show sub-issues</mx-switch>
            <mx-switch>Show empty groups</mx-switch>
          </div>
        </mx-popover>`,
      js: `
        const btn = document.querySelector('#pop-btn');
        btn.addEventListener('click', () => document.querySelector('#pop').show(btn, 'bottom-start'));`,
    },
  ],
  'mx-command-list': [
    {
      title: 'Command menu',
      note: 'Focus stays in the search box; ↑ ↓ Home End move, Enter runs. Fuzzy, grouped.',
      layout: 'tall',
      html: `
        <div style="width:min(420px,100%);border-radius:var(--mx-radius-lg);box-shadow:var(--mx-shadow-popover);background:var(--mx-surface-overlay)">
          <mx-command-list id="cmd" aria-label="Commands" placeholder="Type a command…"></mx-command-list>
        </div>
        <output id="cmd-out" style="color:var(--mx-text-muted);font-size:var(--mx-text-sm)"></output>`,
      js: `
        const cmd = document.querySelector('#cmd');
        cmd.items = [
          { value: 'assign', label: 'Assign to me', group: 'Issue', icon: 'user', shortcut: ['I'] },
          { value: 'status', label: 'Change status', group: 'Issue', icon: 'cycle', shortcut: ['S'] },
          { value: 'label', label: 'Add label', group: 'Issue', icon: 'tag', shortcut: ['L'] },
          { value: 'copy', label: 'Copy link', group: 'Issue', icon: 'link', shortcut: ['⌘', '⇧', ','] },
          { value: 'theme', label: 'Switch theme', group: 'Settings', icon: 'moon' },
          { value: 'keys', label: 'Keyboard shortcuts', group: 'Settings', icon: 'keyboard', shortcut: ['?'] },
        ];
        cmd.addEventListener('mx-select', (e) => { document.querySelector('#cmd-out').textContent = 'Ran: ' + e.detail.value; });`,
    },
    {
      title: 'openPicker()',
      note: 'One call: a popover with a command list, anchored to any element, focus returned on close.',
      html: `<mx-button id="prio" icon="sliders">Priority: Medium</mx-button>`,
      js: `
        import { openPicker } from '@saidmashhud/modx-ui';

        const b = document.querySelector('#prio');
        const items = ['No priority', 'Urgent', 'High', 'Medium', 'Low'].map((label, i) => ({ value: String(i), label }));
        let current = '3';
        b.addEventListener('click', () => openPicker({
          anchor: b, items, selected: [current], placeholder: 'Set priority…',
          onSelect: (v) => { current = v; b.textContent = 'Priority: ' + items[+v].label; },
        }));`,
    },
  ],
  'mx-tooltip': [
    {
      title: 'Names for icon buttons',
      note: 'Hover or focus. The text becomes the trigger’s aria-description; Esc hides it without moving focus.',
      html: `
        <mx-tooltip content="Archive" shortcut="E"><mx-button variant="ghost" icon="inbox" icon-only label="Archive"></mx-button></mx-tooltip>
        <mx-tooltip content="Copy link" shortcut="⌘ ⇧ ,"><mx-button variant="ghost" icon="link" icon-only label="Copy link"></mx-button></mx-tooltip>
        <mx-tooltip content="More actions"><mx-button variant="ghost" icon="more" icon-only label="More"></mx-button></mx-tooltip>`,
    },
  ],
  'mx-toast-region': [
    {
      title: 'Toasts',
      note: 'The app owns the list; the region announces politely and sits at the inline end (left in RTL).',
      html: `
        <mx-button id="toast-info">Archive an issue</mx-button>
        <mx-button id="toast-ok">Save</mx-button>
        <mx-button id="toast-err" variant="danger">Fail to save</mx-button>
        <mx-toast-region id="toasts"></mx-toast-region>`,
      js: `
        const region = document.querySelector('#toasts');
        let id = 0;
        const add = (message, tone, action) => {
          const t = { id: ++id, message, tone, action };
          region.toasts = [...region.toasts, t];
          setTimeout(() => { region.toasts = region.toasts.filter((x) => x !== t); }, 5000);
        };
        region.addEventListener('mx-toast-dismiss', (e) => { region.toasts = region.toasts.filter((t) => t.id !== e.detail); });
        region.addEventListener('mx-toast-action', (e) => { region.toasts = region.toasts.filter((t) => t.id !== e.detail); add('Restored', 'success'); });
        document.querySelector('#toast-info').addEventListener('click', () => add('Issue archived', 'info', { label: 'Undo' }));
        document.querySelector('#toast-ok').addEventListener('click', () => add('Saved', 'success'));
        document.querySelector('#toast-err').addEventListener('click', () => add('Could not reach the server', 'danger'));`,
    },
  ],
  'mx-nav-item': [
    {
      title: 'Sidebar',
      layout: 'column',
      html: `
        <nav aria-label="Workspace" style="width:240px">
          <mx-nav-item href="#inbox" icon="inbox" count="4" active>Inbox</mx-nav-item>
          <mx-nav-item href="#issues" icon="issues">My issues</mx-nav-item>
          <mx-nav-item href="#eng" color="#4743ff">Engineering</mx-nav-item>
          <mx-nav-item href="#eng-mobile" depth="1" icon="layers">Mobile</mx-nav-item>
        </nav>`,
    },
  ],
  'mx-breadcrumbs': [
    {
      title: 'Trail with a back button',
      note: 'The back button goes to the parent; on phones only it remains. Chevrons point the reading way in RTL.',
      html: `<mx-breadcrumbs id="crumbs" current="ENG-142"></mx-breadcrumbs>`,
      js: `document.querySelector('#crumbs').items = [{ label: 'Engineering', href: '#eng' }, { label: 'Mobile app', href: '#mobile' }];`,
    },
  ],
  'mx-avatar': [
    {
      title: 'People',
      html: `
        <mx-avatar name="Ada Lovelace" color="#4cb782"></mx-avatar>
        <mx-avatar name="Alan Turing" color="#a46bff" size="28"></mx-avatar>
        <mx-avatar name="Grace Hopper" color="#f2994a" size="36"></mx-avatar>
        <mx-avatar></mx-avatar>`,
    },
  ],
  'mx-chip': [
    {
      title: 'Labels and filters',
      html: `
        <mx-chip color="#f2555a">Bug</mx-chip>
        <mx-chip color="#4cb782">Feature</mx-chip>
        <mx-chip id="filter-chip" removable interactive><mx-icon slot="icon" name="user" size="12"></mx-icon>Assignee: Ada</mx-chip>`,
      js: `document.querySelector('#filter-chip').addEventListener('mx-remove', (e) => e.target.remove());`,
    },
  ],
  'mx-stat': [
    {
      title: 'A row of figures',
      html: `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:20px;width:100%">
          <mx-stat label="Open issues">128<span slot="hint">12 more than last week</span></mx-stat>
          <mx-stat label="Cycle time" divided>3.4 d</mx-stat>
          <mx-stat label="Overdue" tone="neg" divided>7</mx-stat>
          <mx-stat label="Shipped" tone="pos" divided>41</mx-stat>
        </div>`,
    },
  ],
  'mx-empty': [
    {
      title: 'Nothing yet',
      layout: 'column',
      html: `
        <mx-empty icon="inbox" heading="Inbox zero">
          New mentions, assignments and reviews show up here.
          <mx-button slot="action" variant="primary" icon="plus">New issue</mx-button>
        </mx-empty>`,
    },
  ],
  'mx-spinner': [
    { title: 'Loading', note: 'For reduced motion it breathes instead of turning.', html: `<mx-spinner></mx-spinner> <mx-spinner size="24"></mx-spinner> <mx-button loading>Saving</mx-button>` },
  ],
  'mx-status-icon': [
    {
      title: 'Workflow states',
      html: `
        <span style="display:inline-flex;gap:8px;align-items:center"><mx-status-icon status="backlog"></mx-status-icon>Backlog</span>
        <span style="display:inline-flex;gap:8px;align-items:center"><mx-status-icon status="todo"></mx-status-icon>Todo</span>
        <span style="display:inline-flex;gap:8px;align-items:center"><mx-status-icon status="in_progress"></mx-status-icon>In progress</span>
        <span style="display:inline-flex;gap:8px;align-items:center"><mx-status-icon status="in_review"></mx-status-icon>In review</span>
        <span style="display:inline-flex;gap:8px;align-items:center"><mx-status-icon status="done"></mx-status-icon>Done</span>
        <span style="display:inline-flex;gap:8px;align-items:center"><mx-status-icon status="canceled"></mx-status-icon>Canceled</span>`,
    },
  ],
  'mx-priority-icon': [
    {
      title: 'Priorities',
      html: `
        <span style="display:inline-flex;gap:8px;align-items:center"><mx-priority-icon priority="1"></mx-priority-icon>Urgent</span>
        <span style="display:inline-flex;gap:8px;align-items:center"><mx-priority-icon priority="2"></mx-priority-icon>High</span>
        <span style="display:inline-flex;gap:8px;align-items:center"><mx-priority-icon priority="3"></mx-priority-icon>Medium</span>
        <span style="display:inline-flex;gap:8px;align-items:center"><mx-priority-icon priority="4"></mx-priority-icon>Low</span>
        <span style="display:inline-flex;gap:8px;align-items:center"><mx-priority-icon priority="0"></mx-priority-icon>None</span>`,
    },
  ],
  'mx-illustration': [
    {
      title: 'Scenes',
      note: 'The kit’s isometric line work: plan (dashed) is not built yet, the indigo module is the one that matters.',
      html: `
        <mx-illustration scene="stack"></mx-illustration>
        <mx-illustration scene="plan"></mx-illustration>
        <mx-illustration scene="columns"></mx-illustration>
        <mx-illustration scene="module"></mx-illustration>`,
    },
  ],
  'mx-markdown': [
    {
      title: 'Safe rendering',
      note: 'Every run of text is a text node: the <img onerror> below stays text.',
      layout: 'column',
      html: `<mx-markdown id="md" style="max-width:520px"></mx-markdown>`,
      js: `
        document.querySelector('#md').source = [
          '### Release notes',
          'Ship **RTL** support and the *docs site*; see [the plan](https://github.com/saidmashhud/modx-ui).',
          '',
          '- logical CSS everywhere',
          '- mirrored keys and icons',
          '',
          '> Overlays follow the nearest dir.',
          '',
          '<img src=x onerror=alert(1)>',
        ].join('\\n');`,
    },
  ],
};
