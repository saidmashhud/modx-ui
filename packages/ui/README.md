# @saidmashhud/modx-ui

`mx-*` web components on Lit 3: buttons, form controls (form-associated: they submit, validate and reset with a
`<form>`), select, date and month pickers, popovers, command list, dialog, tooltip, toasts, navigation, display
and a safe markdown renderer. Pair it with `@saidmashhud/modx-tokens`.

```sh
npm i @saidmashhud/modx-ui @saidmashhud/modx-tokens lit
```

```ts
import '@saidmashhud/modx-tokens/tokens.css';
import '@saidmashhud/modx-ui'; // registers every mx-* element
// or only what you use: import '@saidmashhud/modx-ui/button.js';
```

`lit` is a peer dependency. Strings (and the date locale) are set once with `setKitStrings()`.
Full docs: https://github.com/saidmashhud/modx-ui — MIT.
