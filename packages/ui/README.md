# @modx/ui

`mx-*` web components on Lit 3: buttons, form controls (form-associated: they submit, validate and reset with a
`<form>`), select, date and month pickers, popovers, command list, dialog, tooltip, toasts, navigation, display
and a safe markdown renderer. Pair it with `@modx/tokens`.

```sh
npm i @modx/ui @modx/tokens lit
```

```ts
import '@modx/tokens/tokens.css';
import '@modx/ui'; // registers every mx-* element
// or only what you use: import '@modx/ui/button.js';
```

`lit` is a peer dependency. Strings (and the date locale) are set once with `setKitStrings()`.
Full docs: https://github.com/saidmashhud/modx-ui — MIT.
