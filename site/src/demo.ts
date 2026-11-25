import { html, LitElement, nothing, type TemplateResult } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

/**
 * A live example: the markup is rendered as is (and the code shown is that same string), `js` runs once after it
 * mounts — the code a reader copies is the code that ran. Toolbar: theme of the stage (page / light / dark) and
 * writing direction.
 */
export interface Demo {
  title: string;
  /** One or two sentences under the title. */
  note?: string;
  html: string;
  /** Runs after the markup is in the page (plain JS; `document.querySelector` by id). */
  js?: string;
  /** Stage layout: a row of items (default), a column, or a tall stage for overlays. */
  layout?: 'row' | 'column' | 'tall';
}

export const dedent = (s: string): string => {
  const lines = s.replace(/^\n+|\s+$/g, '').split('\n');
  const pad = Math.min(...lines.filter((l) => l.trim()).map((l) => /^ */.exec(l)![0].length));
  return lines.map((l) => l.slice(pad)).join('\n');
};

/** Light tinting of HTML for the code view (tags, attribute names, strings). Text only — no innerHTML. */
function tintHtml(src: string): TemplateResult[] {
  const out: TemplateResult[] = [];
  const re = /(<\/?[a-z][\w-]*)|(\s[a-z@.?][\w-]*)(?==)|("[^"]*")|(\/?>)/gi;
  let last = 0;
  let inTag = false;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m.index > last) out.push(html`${src.slice(last, m.index)}`);
    if (m[1]) { out.push(html`<span class="t-tag">${m[1]}</span>`); inTag = true; }
    else if (m[2] && inTag) out.push(html`<span class="t-attr">${m[2]}</span>`);
    else if (m[3] && inTag) out.push(html`<span class="t-str">${m[3]}</span>`);
    else if (m[4]) { out.push(html`<span class="t-tag">${m[4]}</span>`); inTag = false; }
    else out.push(html`${m[0]}`);
    last = re.lastIndex;
  }
  if (last < src.length) out.push(html`${src.slice(last)}`);
  return out;
}

let n = 0;

export class DocDemo extends LitElement {
  static properties = { demo: { attribute: false }, rtl: { state: true }, stageTheme: { state: true }, copied: { state: true } };
  declare demo: Demo;
  declare rtl: boolean;
  declare stageTheme: 'page' | 'light' | 'dark';
  declare copied: boolean;
  private uid = `demo-${++n}`;

  constructor() {
    super();
    this.rtl = false;
    this.stageTheme = 'page';
    this.copied = false;
  }

  createRenderRoot() { return this; }

  protected firstUpdated() {
    if (this.demo.js) {
      /* `import { … } from '@saidmashhud/modx-ui'` in a demo reads the kit the page already loaded */
      const js = this.demo.js.replace(/^\s*import \{([^}]+)\} from '@saidmashhud\/modx-ui';$/gm, (_, names: string) => `const {${names.replace(/ as /g, ': ')}} = window.__modxUi;`);
      try { new Function(js)(); } catch (e) { console.error(`demo "${this.demo.title}"`, e); }
    }
  }

  private get code(): string {
    const parts = [dedent(this.demo.html)];
    if (this.demo.js) parts.push(`<script type="module">\n${dedent(this.demo.js).split('\n').map((l) => (l ? `  ${l}` : l)).join('\n')}\n</script>`);
    return parts.join('\n\n');
  }

  private async copy() {
    try {
      await navigator.clipboard.writeText(this.code);
      this.copied = true;
      setTimeout(() => { this.copied = false; }, 1600);
    } catch { /* clipboard blocked */ }
  }

  render() {
    const d = this.demo;
    if (!d) return nothing;
    const code = this.code;
    const [markup, script] = code.split(/\n\n(?=<script)/);
    return html`<figure class="demo" aria-labelledby="${this.uid}-t">
      <div class="demo-bar">
        <figcaption id="${this.uid}-t">${d.title}</figcaption>
        <mx-segmented size="sm" label="Theme of this example" .value=${this.stageTheme}
          .options=${[{ value: 'page', label: 'Page' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
          @mx-change=${(e: CustomEvent<'page' | 'light' | 'dark'>) => { this.stageTheme = e.detail; }}></mx-segmented>
        <mx-button size="sm" variant="ghost" ?pressed=${this.rtl} @click=${() => { this.rtl = !this.rtl; }}>RTL</mx-button>
      </div>
      ${d.note ? html`<p class="demo-note">${d.note}</p>` : nothing}
      <div class="stage stage-${d.layout ?? 'row'}" dir=${this.rtl ? 'rtl' : 'ltr'} data-theme=${this.stageTheme === 'page' ? nothing : this.stageTheme}>
        ${unsafeHTML(dedent(d.html))}
      </div>
      <div class="demo-code">
        <pre tabindex="0" aria-label="Code: ${d.title}"><code>${tintHtml(markup ?? '')}${script ? html`\n\n${script}` : nothing}</code></pre>
        <mx-button class="copy" size="sm" variant="ghost" icon=${this.copied ? 'check' : 'copy'} @click=${this.copy}>${this.copied ? 'Copied' : 'Copy'}</mx-button>
      </div>
    </figure>`;
  }
}
customElements.define('doc-demo', DocDemo);
