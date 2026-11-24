import '@saidmashhud/modx-tokens/tokens.css';
import '@saidmashhud/modx-ui';
import { LitElement, css, html } from 'lit';
import { createHttpTransport, createRouter, filterBy, localStorageSync, sortBy, SyncEngine, UiRouter, values, type SyncStatus } from '@saidmashhud/modx-store';

/* Rows as the modx-core todo example serves them. */
interface Todo { id: string; title: string; list: string; done: boolean; updated_at: number }
interface Model { todos: Todo }

const clientId = `tab_${Math.random().toString(36).slice(2, 10)}`;
const sync = new SyncEngine<Model>({
  transport: createHttpTransport(),
  collections: ['todos'],
  bootstrapPath: '/api/bootstrap',
  changesPath: (since) => `/api/changes?since=${since}`,
  eventsPath: '/api/events',
  clientId,
  storage: localStorageSync<Model>('modx-ui-example-todo'),
  endpoints: {
    todos: {
      create: (row) => ({ method: 'POST', path: '/api/todos', body: { title: row.title, list: row.list } }),
      update: (id, patch) => ({ method: 'PUT', path: `/api/todos/${id}`, body: patch }),
      remove: (id) => ({ method: 'DELETE', path: `/api/todos/${id}` }),
    },
  },
});

const routes = createRouter({ all: '/', open: '/open', done: '/done' });
const router = new UiRouter(routes);

class TodoApp extends LitElement {
  static properties = { rows: { state: true }, status: { state: true }, draft: { state: true }, view: { state: true } };
  declare rows: Todo[];
  declare status: SyncStatus;
  declare draft: string;
  declare view: string;

  constructor() {
    super();
    this.rows = [];
    this.status = 'idle';
    this.draft = '';
    this.view = 'all';
  }

  static styles = css`
    :host { display: block; max-width: 40rem; margin: var(--mx-space-12) auto; padding: 0 var(--mx-space-4); color: var(--mx-text); font-family: var(--mx-font-sans); }
    header { display: flex; align-items: center; justify-content: space-between; gap: var(--mx-space-3); margin-bottom: var(--mx-space-6); }
    h1 { font-family: var(--mx-font-display); font-size: var(--mx-text-2xl); margin: 0; }
    form { display: flex; gap: var(--mx-space-2); margin-bottom: var(--mx-space-4); }
    form mx-input { flex: 1; }
    ul { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--mx-border); }
    li { display: flex; align-items: center; gap: var(--mx-space-3); padding: var(--mx-space-3) 0; border-bottom: 1px solid var(--mx-border); }
    li span { flex: 1; }
    li.done span { color: var(--mx-text-muted); text-decoration: line-through; }
    nav { display: flex; gap: var(--mx-space-2); margin-bottom: var(--mx-space-4); }
    small { color: var(--mx-text-muted); }
  `;

  connectedCallback() {
    super.connectedCallback();
    sync.select((t) => sortBy(values(t.todos), { by: 'updated_at', desc: true })).subscribe((rows) => { this.rows = rows; });
    sync.status$.subscribe((s) => { this.status = s; });
    router.route$.subscribe((r) => { this.view = r?.name ?? 'all'; });
    void sync.start();
    addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); if (e.shiftKey) sync.redo(); else sync.undo(); }
    });
  }

  private add(e: Event) {
    e.preventDefault();
    const title = this.draft.trim();
    if (!title) return;
    sync.create('todos', { title, list: 'inbox', done: false, updated_at: Date.now() });
    this.draft = '';
  }

  render() {
    const shown = this.view === 'open' ? filterBy(this.rows, { done: [false] }) : this.view === 'done' ? filterBy(this.rows, { done: [true] }) : this.rows;
    return html`
      <header><h1>Todo</h1><small>${this.status}${sync.state.pending.length ? ` · ${sync.state.pending.length} queued` : ''}</small></header>
      <form @submit=${this.add}>
        <mx-input placeholder="What needs doing?" .value=${this.draft} @mx-input=${(e: CustomEvent<string>) => { this.draft = e.detail; }}></mx-input>
        <mx-button variant="primary" type="submit">Add</mx-button>
      </form>
      <nav>
        ${(['all', 'open', 'done'] as const).map((v) => html`<mx-button size="sm" variant=${this.view === v ? 'secondary' : 'ghost'} @click=${() => router.navigate(v)}>${v}</mx-button>`)}
        <mx-button size="sm" variant="ghost" ?disabled=${!sync.canUndo} @click=${() => sync.undo()}>Undo</mx-button>
        <mx-button size="sm" variant="ghost" ?disabled=${!sync.canRedo} @click=${() => sync.redo()}>Redo</mx-button>
      </nav>
      ${shown.length ? html`<ul>${shown.map((t) => html`
        <li class=${t.done ? 'done' : ''}>
          <mx-switch .checked=${t.done} @mx-change=${(e: CustomEvent<boolean>) => sync.update('todos', t.id, { done: e.detail })}></mx-switch>
          <span>${t.title}</span>
          <mx-button size="sm" variant="ghost" icon="trash" label="Delete" @click=${() => sync.remove('todos', t.id)}></mx-button>
        </li>`)}</ul>` : html`<mx-empty heading="Nothing here">Add a task above.</mx-empty>`}
    `;
  }
}
customElements.define('todo-app', TodoApp);
