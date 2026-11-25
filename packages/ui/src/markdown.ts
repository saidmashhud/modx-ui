import { css, html, nothing, type TemplateResult } from 'lit';
import { base, define, MxElement } from './base.js';

/**
 * Safe Markdown → Lit templates. No innerHTML anywhere: every text run is a text node, so user content can't inject markup.
 * Supported: paragraphs, # / ## / ### headings, - * and 1. lists, > quotes, ``` fences, `code`, **bold**, *italic* / _italic_,
 * [label](https://…), bare https:// URLs, mentions `<@usr_id>`, and issue references like `ENG-12`.
 */

export interface MarkdownResolvers {
  /** Display name for a mention token, or null if unknown (rendered as plain text). */
  mention?: (userId: string) => string | null;
  /** Whether an identifier like "ENG-12" exists — only existing ones become links. */
  issue?: (identifier: string) => { title: string } | null;
}

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h'; level: 1 | 2 | 3; text: string }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'code'; text: string };

export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ kind: 'p', text: para.join('\n') });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^```/.test(line)) {
      flush();
      const body: string[] = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]!); i++) body.push(lines[i]!);
      out.push({ kind: 'code', text: body.join('\n') });
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) { flush(); out.push({ kind: 'h', level: h[1]!.length as 1 | 2 | 3, text: h[2]! }); continue; }
    const li = /^\s*([-*]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      flush();
      const kind = /\d/.test(li[1]!) ? 'ol' : 'ul';
      const last = out[out.length - 1];
      if (last && last.kind === kind) last.items.push(li[2]!);
      else out.push({ kind, items: [li[2]!] });
      continue;
    }
    const q = /^>\s?(.*)$/.exec(line);
    if (q) {
      flush();
      const last = out[out.length - 1];
      if (last?.kind === 'quote') last.text += `\n${q[1]}`;
      else out.push({ kind: 'quote', text: q[1]! });
      continue;
    }
    if (!line.trim()) { flush(); continue; }
    para.push(line);
  }
  flush();
  return out;
}

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*|\b_[^_\n]+_\b)|(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))|(<@[a-z]+_[A-Za-z0-9]+>)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])|(\b[A-Z]{2,5}-\d+\b)/g;

export function renderInline(text: string, r: MarkdownResolvers): (TemplateResult | string)[] {
  const out: (TemplateResult | string)[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const idx = m.index!;
    if (idx > last) out.push(text.slice(last, idx));
    const t = m[0];
    if (m[1]) out.push(html`<code>${t.slice(1, -1)}</code>`);
    else if (m[2]) out.push(html`<strong>${renderInline(t.slice(2, -2), r)}</strong>`);
    else if (m[3]) out.push(html`<em>${renderInline(t.slice(1, -1), r)}</em>`);
    else if (m[4]) {
      const [, label, href] = /^\[([^\]]+)\]\((.+)\)$/.exec(t)!;
      out.push(html`<a href=${href!} target="_blank" rel="noopener noreferrer">${label}</a>`);
    } else if (m[5]) {
      const id = t.slice(2, -1);
      const name = r.mention?.(id);
      out.push(name ? html`<a class="mention" href="#" data-user=${id} @click=${(e: Event) => e.preventDefault()}>@${name}</a>` : t);
    } else if (m[6]) out.push(html`<a href=${t} target="_blank" rel="noopener noreferrer">${t}</a>`);
    else if (m[7]) {
      const issue = r.issue?.(t);
      out.push(issue ? html`<a class="ref" href="/issue/${t}" data-issue=${t} title=${issue.title}>${t}</a>` : t);
    }
    last = idx + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  // Preserve single line breaks inside paragraphs.
  return out.flatMap((part): (TemplateResult | string)[] =>
    typeof part === 'string' ? part.split('\n').flatMap((s, i): (TemplateResult | string)[] => (i ? [html`<br />`, s] : [s])) : [part]);
}

export class MxMarkdown extends MxElement {
  static properties = { source: { type: String }, resolvers: { attribute: false }, placeholder: { type: String } };
  declare source: string;
  declare resolvers: MarkdownResolvers;
  declare placeholder: string;

  constructor() {
    super();
    this.source = '';
    this.resolvers = {};
    this.placeholder = '';
  }

  static styles = [base, css`
    :host { display: block; font-size: var(--mx-text-base); line-height: 1.6; color: var(--mx-text-secondary); overflow-wrap: anywhere; }
    p, ul, ol, blockquote, pre, h1, h2, h3 { margin: 0 0 0.6em; }
    :last-child { margin-bottom: 0; }
    h1, h2, h3 { font-family: var(--mx-font-display); color: var(--mx-text); letter-spacing: -0.01em; line-height: 1.3; }
    h1 { font-size: var(--mx-text-xl); } h2 { font-size: var(--mx-text-lg); } h3 { font-size: var(--mx-text-base); }
    ul, ol { padding-inline-start: 1.4em; }
    li + li { margin-top: 0.15em; }
    blockquote { padding-inline-start: var(--mx-space-3); border-inline-start: 2px solid var(--mx-border-strong); color: var(--mx-text-muted); }
    code { font: var(--mx-weight-medium) 0.92em var(--mx-font-sans); font-variant-numeric: tabular-nums; padding: 1px 5px; border-radius: var(--mx-radius-sm); background: var(--mx-surface-active); color: var(--mx-text); }
    pre { padding: var(--mx-space-3); border-radius: var(--mx-radius-md); background: var(--mx-bg-sunken); border: 1px solid var(--mx-border); overflow-x: auto; }
    pre code { padding: 0; background: none; font-size: var(--mx-text-sm); font-weight: var(--mx-weight-regular); white-space: pre; }
    strong { color: var(--mx-text); font-weight: var(--mx-weight-semibold); }
    a { color: var(--mx-accent-text); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 0.18em; text-decoration-color: color-mix(in srgb, currentColor 45%, transparent); }
    a:hover { text-decoration-color: currentColor; }
    a.mention, a.ref { text-decoration: none; }
    a:focus-visible { outline: none; box-shadow: var(--mx-focus-ring); border-radius: 2px; }
    a.mention, a.ref { padding: 0 4px; border-radius: var(--mx-radius-sm); background: color-mix(in srgb, var(--mx-accent) 16%, transparent); font-weight: var(--mx-weight-medium); }
    a.ref { font-variant-numeric: tabular-nums; }
    .empty { color: var(--mx-text-muted); }
  `];

  private onClick(e: MouseEvent) {
    const a = (e.composedPath()[0] as HTMLElement).closest?.('a');
    if (!a) return;
    const issue = a.dataset.issue;
    const user = a.dataset.user;
    if (issue && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      this.emit('mx-issue-link', issue);
    } else if (user) this.emit('mx-mention-click', user);
  }

  render() {
    if (!this.source.trim()) return this.placeholder ? html`<p class="empty">${this.placeholder}</p>` : nothing;
    const r = this.resolvers;
    return html`<div @click=${this.onClick}>${parseBlocks(this.source).map((b) => {
      switch (b.kind) {
        case 'p': return html`<p>${renderInline(b.text, r)}</p>`;
        case 'h': return b.level === 1 ? html`<h1>${renderInline(b.text, r)}</h1>` : b.level === 2 ? html`<h2>${renderInline(b.text, r)}</h2>` : html`<h3>${renderInline(b.text, r)}</h3>`;
        case 'ul': return html`<ul>${b.items.map((i) => html`<li>${renderInline(i, r)}</li>`)}</ul>`;
        case 'ol': return html`<ol>${b.items.map((i) => html`<li>${renderInline(i, r)}</li>`)}</ol>`;
        case 'quote': return html`<blockquote>${renderInline(b.text, r)}</blockquote>`;
        case 'code': return html`<pre><code>${b.text}</code></pre>`;
      }
    })}</div>`;
  }
}
define('mx-markdown', MxMarkdown);

declare global {
  interface HTMLElementTagNameMap { 'mx-markdown': MxMarkdown }
}
