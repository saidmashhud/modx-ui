# Changelog

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
