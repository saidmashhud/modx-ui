import '../../packages/tokens/src/tokens.css';
import { afterEach } from 'vitest';
import { setKitStrings } from '../../packages/ui/src/base.js';

const defaults = { locale: 'en-US', weekStart: 0, breadcrumb: 'Breadcrumb', search: 'Search…', close: 'Close' };

/* A page like an app's: tokens on the root, the kit's background and text colour. */
document.documentElement.style.background = 'var(--mx-bg)';
document.body.style.cssText = 'margin:0;padding:16px;background:var(--mx-bg);color:var(--mx-text);font-family:var(--mx-font-sans)';

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.removeAttribute('dir');
  document.documentElement.removeAttribute('data-theme');
  setKitStrings(defaults);
});
