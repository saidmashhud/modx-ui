# modx-ui example: todo

A page built from `@modx/ui` components with `@modx/store`'s `SyncEngine` against the todo server of
[modx-core](https://github.com/saidmashhud/modx-core) (`examples/todo`): optimistic writes, an offline
queue kept in localStorage, live updates over SSE with catch-up, undo / redo (Ctrl/Cmd+Z, Shift for redo)
and a three-route `UiRouter`.

```sh
# terminal 1, in a modx-core checkout
make && TODO_PORT=8080 ./build/todo
# terminal 2, here
npm install && npm run dev:example     # from the repository root
```
