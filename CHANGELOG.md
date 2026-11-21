# Changelog

## Unreleased
- `mx-input` / `mx-textarea`: `autofocus` is skipped on touch-only devices. On iOS a script focus outside a tap left a field looking focused but ignoring typing (seen on the sign-in form).

Phones and installed web apps (iOS standalone).

- `@modx/tokens`: `--mx-safe-top|right|bottom|left` (the `env(safe-area-inset-*)` values with a 0 fallback). Kit
  components use them instead of `env()`, so apps can lay out against them and tests can emulate a notch.
- `@modx/tokens`: `trackViewport(root?, { threshold?, pinScroll? })` follows the on-screen keyboard through
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

`@modx/store` `SyncEngine`: idempotency keys.

- Every write — create, update, remove and `call()` — is sent with `Idempotency-Key: <opId>`. The key is the
  same on every retry of that queued write and survives reloads (the `opId` is persisted with the queue), so a
  write the server applied but whose answer was lost (a network drop) is answered from the server's record on
  retry instead of creating a duplicate row or applying a relative change twice. Servers that ignore the
  header behave as before.
- `idempotency: { header?, key?(write) }` changes the header name or derives another key; `idempotency: false`
  sends none. `opId: () => string` replaces the id generator.
- Default `opId`s are now `op_<time>_<counter>_<random>`: unique across tabs and devices of one account (the
  previous `op_<time>_<counter>` could repeat between two tabs in the same millisecond), 1–128 printable ASCII.

`@modx/store` `SyncEngine`: hooks for apps with more than plain collections (needed to run mod-x's workspace on it).

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

- `@modx/ui`: mx-* web components on Lit 3 — button, icon set, input, textarea, segmented control, switch,
  select, date picker, command list, popover, dialog, tooltip, toasts, navigation items, breadcrumbs,
  avatar, chip, status and priority glyphs, empty state, spinner, markdown renderer (no innerHTML), and
  `ObserveController` for binding RxJS-compatible streams to a host.
- `@modx/tokens`: CSS custom properties with dark and light themes, typed references and theme helpers.
- `@modx/store`: Store / reducers / effects on RxJS, memoized selectors, immutable tables, an HTTP + SSE
  transport, `SyncEngine` (bootstrap, SSE catch-up with 410 → re-bootstrap, optimistic writes with
  rollback, offline queue kept in storage, temporary ids, undo / redo), query helpers, a typed router with
  an RxJS `UiRouter`, client-side OT compatible with modx-core.
- `examples/todo`: the kit and `SyncEngine` against modx-core's todo server.
