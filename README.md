# modx-ui

A front-end framework in TypeScript: a web-component kit on Lit 3, design tokens, and RxJS state
management with a sync engine for live, offline-capable apps on a
[modx-core](https://github.com/saidmashhud/modx-core) server.

```
packages/ui      @modx/ui      mx-* components (Lit 3)
packages/tokens  @modx/tokens  CSS custom properties, dark and light themes
packages/store   @modx/store   Store, selectors, tables, SyncEngine, query, router, OT (RxJS)
examples/todo    the three together against modx-core's examples/todo server
```

The packages ship TypeScript sources (`main: src/index.ts`) and are meant to be consumed by a bundler
(Vite, esbuild, Rollup). No decorators — components declare `static properties` — so any TS setting works.

## @modx/ui

`mx-button` `mx-icon` (16 px line set) `mx-kbd` `mx-avatar` `mx-chip` `mx-spinner` `mx-empty`
`mx-status-icon` `mx-priority-icon` · `mx-input` `mx-textarea` (auto-grow) `mx-segmented` `mx-switch`
`mx-select` `mx-date-picker` · `mx-popover` (Popover API, flip positioning) `mx-command-list` (fuzzy,
keyboard, multi-select, ARIA combobox / listbox) `openPicker()` `mx-dialog` (native modal) `mx-tooltip`
`mx-toast-region` · `mx-nav-item` `mx-breadcrumbs` · `mx-markdown` (safe renderer, no innerHTML).
`ObserveController` binds any RxJS-compatible stream to a Lit host without the kit depending on rxjs.

```ts
import '@modx/tokens/tokens.css';
import '@modx/ui';
// <mx-button variant="primary">Save</mx-button> <mx-input label="Title"></mx-input>
```

## @modx/tokens

`--mx-*` custom properties: a gray scale, one accent, status colors, type scale (display / sans / mono),
spacing, radii, shadows, motion. `data-theme="dark" | "light"` on the root (or any section) switches the
semantic layer; `applyTheme()` and typed `token` references are exported.

## @modx/store

- **Store** — Redux-style on RxJS: `BehaviorSubject` state, FIFO re-entrancy-safe dispatch, effects as
  `(actions$, state$) => actions$`, memoized `select`; `createSelector`, `weakMemo`.
- **Tables** — immutable `id → row` tables per collection (`putOne`, `patchOne`, `removeOne`, ...), so
  reference equality drives memoization.
- **SyncEngine** — the client half of a modx-core app:
  - bootstrap → base tables at `seq` → SSE stream; on every (re)connection `GET changes?since=seq`,
    deduplicated by `seq`; `410` or `event: reset` → bootstrap again;
  - writes are optimistic: `base + pending` is what the UI sees; they are sent one at a time; a 4xx rolls
    the write back (and the writes that depended on a row it was creating), a network error keeps it
    queued and retries with backoff;
  - temporary ids are replaced by the server's, also inside writes still queued;
  - the base, `seq` and the queue survive reloads through a `SyncStorage` (`localStorageSync`,
    `memoryStorage`, or your own IndexedDB one), so offline edits are sent when the network returns;
  - `undo()` / `redo()` turn into ordinary writes.
- **Query** — `filterBy`, `sortBy` (multi-key, stable), `groupBy` (with a display order), `search` /
  `fuzzyScore`, `sortOrderBetween` for drag and drop.
- **Router** — `createRouter({ item: '/lists/:list/items/:id' })` parses and formats; `UiRouter` exposes
  `route$` and follows the History API.
- **OT** — plain-text operational transformation with UTF-16 offsets (`transform`, `compose`, `invert`,
  `OtClient`), the counterpart of modx-core's `ot.h`.

```ts
import { createHttpTransport, localStorageSync, SyncEngine } from '@modx/store';

interface Model { todos: { id: string; title: string; done: boolean } }
const sync = new SyncEngine<Model>({
  transport: createHttpTransport(),
  collections: ['todos'],
  bootstrapPath: '/api/bootstrap',
  changesPath: (since) => `/api/changes?since=${since}`,
  eventsPath: '/api/events',
  storage: localStorageSync('todos'),
  endpoints: { todos: {
    create: (row) => ({ method: 'POST', path: '/api/todos', body: row }),
    update: (id, patch) => ({ method: 'PUT', path: `/api/todos/${id}`, body: patch }),
    remove: (id) => ({ method: 'DELETE', path: `/api/todos/${id}` }),
  } },
});
await sync.start();
sync.select((t) => Object.values(t.todos)).subscribe(render);
const id = sync.create('todos', { title: 'Buy milk', done: false });   // visible at once
sync.update('todos', id, { done: true });                              // follows the real id later
```

## Develop

```sh
npm install
npm test             # vitest: store, sync engine, router, query, OT, markdown
npm run typecheck
npm run dev:example  # examples/todo; start modx-core's ./build/todo on :8080 first
```

## License

MIT, © 2026 Saidmashhud Habibzoda. See `LICENSE`.

---

## Кратко по-русски

**modx-ui** — фронт-фреймворк на TypeScript: набор веб-компонентов `mx-*` на Lit 3, дизайн-токены и
стейт-менеджмент на RxJS. Главное — `SyncEngine` для приложений на modx-core: загрузка начального
состояния, живая лента изменений по SSE с догонялкой по `seq`, оптимистичные записи с откатом при отказе
сервера, офлайн-очередь, которая переживает перезагрузку вкладки, временные id, undo/redo. Плюс типизированный
роутер, помощники для фильтров, сортировки и группировки, и OT для совместного редактирования текста.
Пример — `examples/todo`. Тесты: `npm test`. Лицензия MIT.
