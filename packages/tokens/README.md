# @modx/tokens

Design tokens as CSS custom properties (`--mx-*`): a gray scale, one indigo accent, status colours, type, spacing,
radii, shadows, motion, safe-area and keyboard insets, with dark and light themes (`data-theme` on the root or
any section). Light-theme text colours meet WCAG contrast on white.

```sh
npm i @modx/tokens
```

```ts
import '@modx/tokens/tokens.css';
import { applyTheme, trackViewport } from '@modx/tokens';
applyTheme('light');
```

Full docs: https://github.com/saidmashhud/modx-ui — MIT.
