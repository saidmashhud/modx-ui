# @modx/store

RxJS state management: a Redux-style `Store` with effects and memoized selectors, immutable tables, and a
`SyncEngine` for modx-core servers — optimistic writes, an offline queue that survives reloads (scoped per owner,
merged across tabs), idempotent retries, SSE catch-up, undo / redo — plus query helpers, a typed router and
plain-text OT.

```sh
npm i @modx/store
```

```ts
import { createHttpTransport, localStorageSync, SyncEngine } from '@modx/store';
```

Full docs: https://github.com/saidmashhud/modx-ui — MIT.
