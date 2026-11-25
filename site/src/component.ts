import { html, LitElement, nothing, type TemplateResult } from 'lit';
import { element, methods, props, type CemDeclaration, type CemNamed } from './manifest.js';
import { DEMOS } from './demos.js';
import './demo.js';

/** `code` spans in manifest descriptions (plain text otherwise). */
function inline(s: string | undefined): TemplateResult | typeof nothing {
  if (!s) return nothing;
  const parts = s.replace(/\s*\n\s*/g, ' ').split(/(`[^`]+`)/);
  return html`${parts.map((p) => (p.startsWith('`') && p.endsWith('`') ? html`<code>${p.slice(1, -1)}</code>` : p))}`;
}

/** First sentence of a description, for the page lead. */
const paragraphs = (s = '') => s.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

function table(caption: string, id: string, head: string[], rows: unknown[][]): TemplateResult | typeof nothing {
  if (!rows.length) return nothing;
  return html`<section class="api-section" aria-labelledby=${id}>
    <h3 id=${id}>${caption}</h3>
    <div class="table-wrap" role="region" aria-labelledby=${id} tabindex="0">
      <table class="api">
        <thead><tr>${head.map((h) => html`<th scope="col">${h}</th>`)}</tr></thead>
        <tbody>${rows.map((r) => html`<tr>${r.map((c, i) => (i === 0 ? html`<th scope="row">${c}</th>` : html`<td>${c}</td>`))}</tr>`)}</tbody>
      </table>
    </div>
  </section>`;
}

const type = (t?: { text: string }) => (t?.text ? html`<code class="type">${t.text}</code>` : nothing);

function api(d: CemDeclaration, tag: string): TemplateResult {
  const attrOf = new Map((d.attributes ?? []).map((a) => [a.fieldName ?? a.name, a.name]));
  const p = props(d).map((m) => [
    html`<code>${m.name}</code>`,
    m.attribute ?? attrOf.get(m.name) ? html`<code>${m.attribute ?? attrOf.get(m.name)}</code>${m.reflects ? html` <span class="flag">reflects</span>` : nothing}` : html`<span class="muted">—</span>`,
    type(m.type),
    m.default !== undefined ? html`<code>${m.default}</code>` : html`<span class="muted">—</span>`,
    inline(m.description),
  ]);
  const ms = methods(d).map((m) => [
    html`<code>${m.name}(${(m.parameters ?? []).map((x) => `${x.name}${x.optional ? '?' : ''}`).join(', ')})</code>`,
    inline(m.description),
  ]);
  const ev = (d.events ?? []).map((e) => [html`<code>${e.name}</code>`, inline(e.description)]);
  const named = (list: CemNamed[] | undefined, empty: string) => (list ?? []).map((s) => [s.name ? html`<code>${s.name}</code>` : html`<span class="muted">${empty}</span>`, inline(s.description)]);
  return html`<section class="api-all" aria-labelledby="api">
    <h2 id="api">API</h2>
    <p class="lead-small">Generated from <code>custom-elements.json</code> (the package ships it), so this table and the code cannot disagree.</p>
    ${table('Properties and attributes', `${tag}-props`, ['Property', 'Attribute', 'Type', 'Default', 'Description'], p)}
    ${table('Methods', `${tag}-methods`, ['Method', 'Description'], ms)}
    ${table('Events', `${tag}-events`, ['Event', 'Detail and when'], ev)}
    ${table('Slots', `${tag}-slots`, ['Slot', 'Content'], named(d.slots, '(default)'))}
    ${table('CSS parts', `${tag}-parts`, ['Part', 'Element'], named(d.cssParts, ''))}
    ${table('CSS custom properties', `${tag}-cssprops`, ['Property', 'Effect'], named(d.cssProperties, ''))}
  </section>`;
}

/** A component page: name, description and import from the manifest, live demos, then the API tables. */
export class DocComponent extends LitElement {
  static properties = { tag: { type: String } };
  declare tag: string;
  createRenderRoot() { return this; }

  render() {
    const el = element(this.tag);
    if (!el) return html`<h1>Unknown element ${this.tag}</h1>`;
    /* the lead is the first sentence; the rest of the JSDoc follows as body text */
    const text = paragraphs(el.decl.description).join('\n\n');
    const cut = text.search(/[.!?](\s|$)/);
    const lead = cut > 0 ? text.slice(0, cut + 1) : text;
    const rest = paragraphs(cut > 0 ? text.slice(cut + 1) : '');
    const demos = DEMOS[this.tag] ?? [];
    return html`<article class="prose component">
      <p class="eyebrow">Component · <code>${el.module}</code></p>
      <h1><span class="lt">&lt;</span>${this.tag}<span class="lt">&gt;</span></h1>
      <p class="lead">${inline(lead)}</p>
      ${rest.map((p) => html`<p class="details">${inline(p)}</p>`)}
      <pre class="snippet"><code>import '@saidmashhud/modx-ui/${el.module}';   // or the whole kit: import '@saidmashhud/modx-ui';</code></pre>
      ${demos.length ? html`<h2 id="examples">Examples</h2>${demos.map((d) => html`<doc-demo .demo=${d}></doc-demo>`)}` : nothing}
      ${api(el.decl, this.tag)}
    </article>`;
  }
}
customElements.define('doc-component', DocComponent);
