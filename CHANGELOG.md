# Changelog

## Unreleased

Toward 1.0: real-browser tests, right-to-left, a docs site.

- **Browser tests.** `npm run test:browser` runs component tests in Chromium, Firefox and WebKit (Vitest browser mode,
  Playwright): buttons submitting / resetting real forms through ElementInternals, inputs, select, switch, date picker
  (day, range, month: keyboard, typed dates by locale, form value / validity / reset), dialog (Esc, focus trap and
  return, backdrop vs drag), command list, `openPicker`, tooltip, toasts, segmented, display and navigation elements,
  RTL and live strings — each rendered component also checked with axe-core in the dark and light themes.
  `npm run test:visual` compares screenshots of key components (light, dark, RTL) with per-platform baselines. CI has a
  `browser` job.
- **Fixes the tests found.** `mx-dialog` closed when a text selection dragged out of it ended on the backdrop; it now
  also returns focus to what had it. The date grid put `aria-selected` on plain buttons (the buttons are now the grid
  cells; the month grid has rows; month cells are named "Jun 2026"); `aria-required` on the date picker's trigger is
  gone (not allowed on a button). `position()` measured an opening popover while its enter transition still scaled
  it, so end-aligned overlays ended ~3 px past the anchor. `mx-textarea` used `aria-expanded` on a textbox (now
  `aria-activedescendant`). `mx-segmented` without a value could not be reached by Tab. Text below 4.5:1: the danger
  button's hover, command-list group heads and hints, "No results", trigger placeholders, out-of-month days, weekday
  heads, the `mx-stat` hint (all now `--mx-text-muted`; `--mx-text-faint` is for icons, separators and native
  placeholders). `mx-avatar` initials are dark on light user colours. Markdown links are underlined.
- **Keyboard.** `mx-segmented`: ↑ / ↓ / Home / End as well; `mx-command-list`: Home / End (with an empty query);
  `aria-checked` only on chosen options in single-select.
- **Right to left.** Components follow the nearest `dir` (or CSS `direction`): logical properties everywhere;
  `position()` start / end placements are logical (`right-start` opens on the inline-end side); `openPicker()` carries
  the anchor's direction; toasts at the inline end; the switch thumb on the logical side; ← / → mirrored in the date
  grid, month grid and segmented control; `mx-icon` mirrors chevrons, `arrow-left`, `arrow-up-right`, `undo`, `redo`
  under `:dir(rtl)` (`no-mirror` opts out). New exports `directionOf()`, `inlineStep()`, `DIRECTIONAL_ICONS`;
  `monthKeyMove()` takes a direction.
- **i18n.** `setKitStrings()` re-renders every mounted element (and `onKitStrings()` tells app code);
  `kitStrings.breadcrumb` names the breadcrumb nav (was a hard-coded "Breadcrumb"). Command-list placeholder and empty
  text default to the current strings at render time.
- **Toasts** show a tone icon (info, check, alert — new icons `info`, `alert`) instead of a coloured side stripe.
- **Tokens.** `data-theme="auto"` follows `prefers-color-scheme`; `data-theme="dark"` scopes a dark section inside a
  light page; `applyTheme('auto')`, `resolvedTheme()`.
- **Custom Elements Manifest.** JSDoc on every component (tag, properties, events, slots, CSS parts, custom
  properties, methods); `npm run build` writes `custom-elements.json` into `packages/ui/dist`, and the package.json has
  `"customElements"`.
- **Docs site** (`site/`, nothing published): guides and a page per component with live demos (page / light / dark,
  RTL) and API tables from the manifest. `npm run docs:dev`, `docs:build` → `site/dist`, `docs:shots` (screenshots +
  axe); `.github/workflows/pages.yml` deploys to GitHub Pages only when run by hand.

## 0.2.0 — 2026-11-25

Hardening, a month picker, and the npm scope.

- **Package names:** `@modx/ui`, `@modx/tokens`, `@modx/store` are now `@saidmashhud/modx-ui`,
  `@saidmashhud/modx-tokens`, `@saidmashhud/modx-store` (the `@modx` npm scope belongs to someone else).
  Update imports accordingly.
- Design (v21): no monospace anywhere — tabular figures on the sans; the mod-x site's design language (iso line
  work, stats, enter motion); phones and installed apps (safe areas, keyboard, touch targets).

- **Packaging** (nothing published). `npm run build` (`scripts/build-packages.mjs`) builds each package into
  `packages/<name>/dist` as a publishable package: tsc output with `.d.ts` and source maps, LICENSE, README, and a
  manifest whose `exports` point at the built files with `types`. The source manifests keep pointing at `src/*.ts`
  (vendored copies, like mod-x's, need no build) and refuse `npm publish` (`prepublishOnly` guard). Each package
  gets LICENSE + README in `files`; `lit` moves to `peerDependencies` (and `devDependencies`) of `@saidmashhud/modx-ui`;
  `sideEffects`: the element-registering modules of `@saidmashhud/modx-ui`, `*.css` for `@saidmashhud/modx-tokens`, `false` for
  `@saidmashhud/modx-store`.
- `mx-tooltip`: the text now reaches assistive tech — it is set as `aria-description` on the slotted trigger
  (the old `aria-describedby` on the `<slot>` pointed across the shadow boundary and described nothing), with the
  shortcut ("Archive (E)"); the trigger's own description is restored when the tooltip goes. `mx-button` passes a
  host `aria-description` on to its inner button. Escape dismisses a shown tooltip without moving focus.
- `mx-spinner` and `mx-button loading`: for `prefers-reduced-motion` the ring stops turning and breathes
  (opacity) instead. Shared `spinner` styles in `base.ts` (`.spinner`).
- Light theme contrast (WCAG): `--mx-text-muted` → `--mx-gray-550` #6b6c70 (5.2:1 on white, was 4.1), `--mx-text-faint`
  → `--mx-gray-450` #8a8a8a (3.5:1, was 2.5; placeholders and hints only), `--mx-danger` → `--mx-red-600` #cf3036
  (5.1:1, was 3.4). New primitives `--mx-gray-450`, `--mx-gray-550`, `--mx-red-600`; the dark theme is unchanged.
  A test computes the ratios from tokens.css.
- SyncEngine `maxRetries` defaults to 8 (`DEFAULT_MAX_RETRIES`) instead of no limit: a write the server keeps
  failing (5xx / 408 / 429) is rejected after that, rolled back and reported on `rejected$`, and the writes behind it
  go out (before, one failing write blocked the queue forever). Network failures still keep writes queued. Pass
  `Infinity` for the old behaviour. The next write no longer inherits the failed one's backoff.
- SyncEngine `storageError$`: a snapshot save that throws or rejects (quota exceeded, private mode) is reported
  instead of swallowed. `localStorageSync` rethrows save errors for it, or calls `onError` when given.
- **Month picker.** `mx-date-picker mode="month"` replaces `<input type="month">`: `value` / `min` / `max` are
  "YYYY-MM" (like the native input), the trigger reads "ноябрь 2026" / "November 2026" (nominative, no "г."), the
  popover has the year with previous / next buttons over a 4 × 3 grid of months (3 × 4 on phones); arrows, PageUp /
  PageDown (year), Home / End, Enter, Esc; footer "This month" / "Clear"; form-associated (submits "YYYY-MM").
  Emits `{ value, month }`. Kit strings `pickMonth`, `thisMonth`, `prevYear`, `nextYear`. Helpers `parseMonth`,
  `formatMonth`, `shortMonth`, `addMonthsYm`, `monthKeyMove`, `monthDisabled`. `value` / `min` / `max` of the
  day picker now also accept "YYYY-MM-DD" strings (typed `number | string | null`).
- **SyncEngine snapshots know whose they are.** Snapshots carry `v` (schema version, `schemaVersion` option,
  default 1) and `owner` (`owner` option: user id or `user@workspace`). A stored snapshot of another owner or version
  is not hydrated: its queued writes are dropped, never sent, and reported on `discarded$` (`{ reason, pending,
  owner, v }`) so the app can warn; the other owner's data is overwritten at once. Snapshots written before (no
  `v`, no `owner`) still hydrate into engines without an `owner`. Breaking only for engines that now set `owner`:
  their first start discards the unowned snapshot.
- **Several tabs.** `localStorageSync(key, { owner })` scopes the key (`key:owner`) and merges on every save with
  what another tab stored: the union of both queues by opId, minus writes either tab finished (snapshots keep the
  recent `done` opIds), the base of whichever saw the higher seq. `mergeSnapshots(stored, next)` and
  `snapshotMismatch(raw, { v, owner })` are exported for custom storages.
- **Forms.** `mx-input`, `mx-select`, `mx-date-picker`, `mx-switch` and `mx-button` are form-associated custom
  elements (ElementInternals). Inside a `<form>` the fields submit under `name` (`mx-select multiple` and a date range
  as repeated entries, dates as `YYYY-MM-DD`, `mx-switch` like a checkbox with `value`, default "on"), `required`
  blocks submission with the browser's bubble (`kitStrings.valueMissing`), reset restores the initial attributes, a
  disabled `<fieldset>` disables them, back/forward restores their state. `form`, `validity`, `validationMessage`,
  `checkValidity()`, `reportValidity()` on each. New props: `name` on all four, `disabled` on `mx-input`, `required` on
  `mx-select` / `mx-date-picker` / `mx-switch`. `mx-button type="submit"` submits the form ElementInternals names
  (so the `form` attribute works), `type="reset"` resets it. Where ElementInternals is missing, everything behaves
  as before. Helpers: `FormControl`, `attachFormInternals`, `applyFormState`, `formDataOf`.
- `mx-date-picker`: typed dates are read in the locale's order — the order the text box shows them (en-US
  `11/21/2026`, ru-RU / de-DE `21.11.2026`), plus ISO `2026-11-21` everywhere. Before, en-US displayed month first
  but parsed day first. `kitStrings.dateFormatHint` now defaults to `''`: the hint is derived from the locale
  (`mm/dd/yyyy`, `dd.mm.yyyy`); set it only to translate the letters, in the locale's order. New `dateOrder(locale)`,
  `dateHint(locale)`; `parseTypedDay(text, locale = kitStrings.locale)`.
- **The site's design language in the kit.** `mx-illustration` (`scene`: stack | plan | columns | module) and
  `iso(boxes, unit, plane)` — the isometric hairline drawings of the mod-x site, with one indigo module that settles
  gently (still for reduced motion). `mx-empty` shows a scene picked from its `icon` (or `scene`; `scene="none"` keeps
  the glyph) and a larger display heading. `mx-stat` — a figure with its label, the site's facts strip: display type,
  tight tracking, tabular figures, optional hint, `tone`, `divided` hairline. `enter` — keyframes for content
  arriving (`--mx-duration-enter`). Tokens `--mx-tracking-display`, `--mx-tracking-title`, `--mx-duration-enter`.
  `mx-kbd` gets the site's key cap (2 px bottom edge); `mx-nav-item` counts in the accent text colour, hover eased.
- **No monospace.** `@saidmashhud/modx-tokens` drops `--mx-font-mono` (and the JetBrains Mono stack); numbers, ids, code and
  eyebrows use the sans with tabular figures (`--mx-numeric: tabular-nums`). `mx-markdown` code, the command list's
  group labels and the date picker's weekday row follow. Apps that still reference `--mx-font-mono` should switch to
  `var(--mx-font-sans)` + `font-variant-numeric: tabular-nums`.
- `mx-input` / `mx-textarea`: `autofocus` is skipped on touch-only devices. On iOS a script focus outside a tap left a field looking focused but ignoring typing (seen on the sign-in form).

Phones and installed web apps (iOS standalone).

- `@saidmashhud/modx-tokens`: `--mx-safe-top|right|bottom|left` (the `env(safe-area-inset-*)` values with a 0 fallback). Kit
  components use them instead of `env()`, so apps can lay out against them and tests can emulate a notch.
- `@saidmashhud/modx-tokens`: `trackViewport(root?, { threshold?, pinScroll? })` follows the on-screen keyboard through
  `visualViewport` and keeps `--mx-viewport-height` / `--mx-keyboard-inset` and `data-keyboard` on the root (iOS does
  not shrink `dvh` or fixed layouts when the keyboard opens). Ignores toolbar-sized changes and pinch zoom.
- `mx-dialog` (full screen on phones): height follows `--mx-viewport-height`, so the footer stays above the keyboard;
  the side insets are padded in landscape; the home-indicator gap is dropped while the keyboard is open.
- `mx-popover` bottom sheets sit on top of the keyboard (`--mx-keyboard-inset`) and never grow under the status bar.
- `mx-toast-region` on phones clears the home indicator and the keyboard.
- `mx-button`: on touch screens the hit area grows to at least 44 × 44 px around `sm` / `md` buttons without
  changing their look; no tap highlight or text selection on long press.
- `mx-segmented`: when the options scroll (narrow screens), the selected one is scrolled into view; options no longer shrink.
- `mx-nav-item`: 40 px rows on touch screens.
- `mx-command-list`: 44 px options on touch screens; shortcut hints are hidden where there is no keyboard.
- Fix: a full-screen `mx-dialog` on phones stayed 24 px low after opening (the slide-in offset outlived the
  animation), so its footer was cut off at the bottom edge.

`@saidmashhud/modx-store` `SyncEngine`: idempotency keys.

- Every write — create, update, remove and `call()` — is sent with `Idempotency-Key: <opId>`. The key is the
  same on every retry of that queued write and survives reloads (the `opId` is persisted with the queue), so a
  write the server applied but whose answer was lost (a network drop) is answered from the server's record on
  retry instead of creating a duplicate row or applying a relative change twice. Servers that ignore the
  header behave as before.
- `idempotency: { header?, key?(write) }` changes the header name or derives another key; `idempotency: false`
  sends none. `opId: () => string` replaces the id generator.
- Default `opId`s are now `op_<time>_<counter>_<random>`: unique across tabs and devices of one account (the
  previous `op_<time>_<counter>` could repeat between two tabs in the same millisecond), 1–128 printable ASCII.

`@saidmashhud/modx-store` `SyncEngine`: hooks for apps with more than plain collections (needed to run mod-x's workspace on it).

- `call(spec)`: queue a request to any endpoint in order with the other writes, with optimistic `patches` and
  `puts` until it settles; the response's rows settle it (`result`: one row, an array, or `{ [result]: rows }`
  — multi-row responses such as batch updates), or a `refresh` list is fetched after it.
- `update(entity, id, patch, { local })`: fields shown optimistically but never sent (server-derived values).
- `{ history: false }` on create / update / remove, for apps with their own undo; `undoLimit: 0` now keeps no
  history (it used to keep growing).
- Endpoint builders get a context: `create(row, { write, current })` etc. — the write's `opId` and the row as
  the UI sees it (or as last confirmed when the write removes it), e.g. for paths that depend on the row.
- Echo reconciliation: a `put` change whose `client_id` is a pending create's `opId` settles that create at
  once (temp → real id), so the row isn't shown twice while the HTTP answer is still on its way.
- A write queued after its temporary id was mapped is sent with the real id (also inside data).
- `mapBootstrap(data, prev)`: custom bootstrap → tables, keeping rows the payload doesn't carry;
  `bootstrapped$` emits each payload.
- `putRows(entity, rows)` / `updateBase(fn)`: server rows fetched outside bootstrap and the feed.
- `events$`: named SSE events that are not changes (typing, presence, co-editing signals).
- `changes$`: applied changes (new ones only) with the base before them, for derived state such as unread counts.
- `probe: true`: before reopening a dropped stream, GET the changes since `seq`; a 4xx (signed out, membership
  removed...) stops the engine with status `'error'` and `lost$`, instead of reconnecting forever (EventSource
  hides HTTP statuses). A 4xx on bootstrap also emits `lost$`.
- `maxRetries`: server errors (5xx, 408, 429) per write before it is rejected; network failures still keep it queued.
- `saveDebounceMs`: coalesce storage writes (flushed on `stop()`).
- `resolveId(id)`.
- Changes endpoints may answer `{ changes: [...] }` as well as `[...]`.
- Robustness: stored snapshots are validated (`normalizeSnapshot`) — a broken one, or one missing a collection,
  means a fresh bootstrap instead of a crash; a throwing `storage.load()` too; writes queued before hydration
  are kept; concurrent bootstraps (reset + 410) are merged; a `reset` whose bootstrap fails no longer leaves an
  unhandled rejection, and its status returns to `'live'` (it used to stay `'bootstrapping'`); after a write's network error the status returns to `'live'` (not `'reconnecting'`)
  when the stream is still up; browser `offline` / `online` events update the status and reconnect at once.

## 0.1.0 — 2026-11-21

First public version, extracted from a production tracker front end.

- `@saidmashhud/modx-ui`: mx-* web components on Lit 3 — button, icon set, input, textarea, segmented control, switch,
  select, date picker, command list, popover, dialog, tooltip, toasts, navigation items, breadcrumbs,
  avatar, chip, status and priority glyphs, empty state, spinner, markdown renderer (no innerHTML), and
  `ObserveController` for binding RxJS-compatible streams to a host.
- `@saidmashhud/modx-tokens`: CSS custom properties with dark and light themes, typed references and theme helpers.
- `@saidmashhud/modx-store`: Store / reducers / effects on RxJS, memoized selectors, immutable tables, an HTTP + SSE
  transport, `SyncEngine` (bootstrap, SSE catch-up with 410 → re-bootstrap, optimistic writes with
  rollback, offline queue kept in storage, temporary ids, undo / redo), query helpers, a typed router with
  an RxJS `UiRouter`, client-side OT compatible with modx-core.
- `examples/todo`: the kit and `SyncEngine` against modx-core's todo server.
