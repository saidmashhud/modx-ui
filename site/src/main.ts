import '@saidmashhud/modx-tokens/tokens.css';
import * as kit from '@saidmashhud/modx-ui';
import './site.css';
import './shell.js';
import './component.js';
import './demo.js';
import { DEMOS } from './demos.js';
import type { DocDemo } from './demo.js';

/* Guide pages place examples with <doc-demo data-demo="mx-select:0"> (component, index). */
for (const el of document.querySelectorAll<DocDemo>('doc-demo[data-demo]')) {
  const [tag, i] = el.dataset.demo!.split(':');
  const d = DEMOS[tag!]?.[Number(i ?? 0)];
  if (d) el.demo = d;
}

/* demos that `import { … } from '@saidmashhud/modx-ui'` run against this instance (see demo.ts) */
(window as unknown as { __modxUi: typeof kit }).__modxUi = kit;
