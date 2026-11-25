# modx-ui

A front-end framework in TypeScript: a web-component kit on Lit 3, design tokens, and RxJS state
management with a sync engine for live, offline-capable apps on a
[modx-core](https://github.com/saidmashhud/modx-core) server.

```
packages/ui      @saidmashhud/modx-ui      mx-* components (Lit 3)
packages/tokens  @saidmashhud/modx-tokens  CSS custom properties, dark and light themes
packages/store   @saidmashhud/modx-store   Store, selectors, tables, SyncEngine, query, router, OT (RxJS)
examples/todo    the three together against modx-core's examples/todo server
```

In this repo the packages point at their TypeScript sources (`main: src/index.ts`), so a workspace or a vendored
copy is consumed by a bundler (Vite, esbuild, Rollup) with no build step. No decorators — components declare
`static properties` — so any TS setting works.

`npm run build` turns each package into a publishable one in `packages/<name>/dist`: ES2022 JavaScript, `.d.ts`,
source maps, LICENSE, README, and a manifest whose `exports` carry `types`. `lit` is a peer dependency of
`@saidmashhud/modx-ui`; `sideEffects` lists the files that register elements (and `*.css`). Publish the built directory
(`npm publish packages/ui/dist`); the source directories refuse to publish.

**Docs:** a static site built from this repo — getting started, theming, i18n and RTL, forms, the store / SyncEngine
guide, and a page per component with live examples and API tables generated from `custom-elements.json`.
`npm run docs:dev` (http://localhost:5180) or `npm run docs:build` → `site/dist` (relative URLs; a manual-only GitHub
Pages workflow can publish it).

**Browser support:** current Chromium, Firefox and Safari (Chrome 125+, Firefox 125+, Safari 17.4+): the kit uses the
Popover API, `<dialog>`, `:dir()`, `color-mix()`, logical properties and ElementInternals. Every component is tested
in all three engines (Vitest browser mode + Playwright), with axe-core in the light and dark themes.

**Right to left:** put `dir="rtl"` on the root or any section. Layout uses logical properties; popovers, selects and
pickers align to the start edge of their anchor, toasts sit at the inline end, ← / → are mirrored in the calendar,
month grid and segmented control, and directional icons (chevrons, arrows, undo / redo) turn. Strings, date locale and
week start come from `setKitStrings()`, which re-renders elements already on the page.

## @saidmashhud/modx-ui

`mx-button` `mx-icon` (16 px line set) `mx-kbd` `mx-avatar` `mx-chip` `mx-spinner` `mx-empty` (with an isometric scene) `mx-stat`
`mx-illustration` + `iso()` (the site's isometric line work) · `enter` (keyframes for views arriving)
`mx-status-icon` `mx-priority-icon` · `mx-input` `mx-textarea` (auto-grow) `mx-segmented` `mx-switch`
`mx-select` `mx-date-picker` · `mx-popover` (Popover API, flip positioning) `mx-command-list` (fuzzy,
keyboard, multi-select, ARIA combobox / listbox) `openPicker()` `mx-dialog` (native modal) `mx-tooltip`
`mx-toast-region` · `mx-nav-item` `mx-breadcrumbs` · `mx-markdown` (safe renderer, no innerHTML).
`ObserveController` binds any RxJS-compatible stream to a Lit host without the kit depending on rxjs.

```ts
import '@saidmashhud/modx-tokens/tokens.css';
import '@saidmashhud/modx-ui';
// <mx-button variant="primary">Save</mx-button> <mx-input label="Title"></mx-input>
```

## @saidmashhud/modx-tokens

`--mx-*` custom properties: a gray scale, one accent, status colors, type scale (display / sans; no monospace — tabular figures instead),
spacing, radii, shadows, motion. `data-theme="dark" | "light" | "auto"` on the root (or any section) switches the
semantic layer (`auto` follows `prefers-color-scheme`); `applyTheme()`, `resolvedTheme()` and typed `token` references
are exported.

## @saidmashhud/modx-store

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
  - `undo()` / `redo()` turn into ordinary writes;
  - every write carries `Idempotency-Key: <opId>`, the same on each retry and after a reload, so a write
    whose answer was lost is never applied twice by a server that keeps keys (modx-core `idem.h`);
    the header name and key are configurable (`idempotency`, `opId`), or off;
  - for richer apps: `call()` (any endpoint, with optimistic `patches` / `puts`, settled by its `result`
    rows — one, an array, or `{ [entity]: rows }` — or a `refresh` list), `local` fields on updates
    (shown, not sent), endpoints that see the write and the current row, creates settled early by their
    echo (`opId` as the change's `client_id`), `mapBootstrap`, `putRows` / `updateBase`, `events$` for
    named SSE events, `changes$`, `bootstrapped$`, `probe` + `lost$` for access loss, `maxRetries`,
    `saveDebounceMs`.
- **Query** — `filterBy`, `sortBy` (multi-key, stable), `groupBy` (with a display order), `search` /
  `fuzzyScore`, `sortOrderBetween` for drag and drop.
- **Router** — `createRouter({ item: '/lists/:list/items/:id' })` parses and formats; `UiRouter` exposes
  `route$` and follows the History API.
- **OT** — plain-text operational transformation with UTF-16 offsets (`transform`, `compose`, `invert`,
  `OtClient`), the counterpart of modx-core's `ot.h`.

```ts
import { createHttpTransport, localStorageSync, SyncEngine } from '@saidmashhud/modx-store';

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

npx playwright install chromium firefox webkit   # once, for the browser tests
npm run test:browser # components in Chromium, Firefox, WebKit + axe-core (BROWSERS=chromium to narrow)
npm run test:visual  # screenshot comparisons (Chromium); -- --update after a deliberate change
npm run docs:dev     # the docs site; docs:build → site/dist, docs:shots → site-shots/ (+ axe on every page)
```

Visual baselines live in `test/browser/__screenshots__/` per browser and platform (`*-chromium-darwin.png`,
`*-chromium-linux.png`): fonts render differently on macOS and Linux, so each platform compares only with its own.
The macOS ones are committed; CI makes the Linux ones on its first run and uploads them as the
`visual-baselines-linux` artifact — review and commit them, and CI compares from then on.

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
