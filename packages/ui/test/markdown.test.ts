// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { html, render } from 'lit';
import { parseBlocks, renderInline, type MarkdownResolvers } from '../src/markdown.js';

const r: MarkdownResolvers = {
  mention: (id) => (id === 'usr_ada' ? 'Ada Lovelace' : null),
  issue: (ident) => (ident === 'ENG-12' ? { title: 'Crane slot' } : null),
};

function inline(text: string): HTMLElement {
  const el = document.createElement('div');
  render(html`${renderInline(text, r)}`, el);
  return el;
}

describe('markdown', () => {
  it('parses blocks', () => {
    const b = parseBlocks('# Title\n\nPara one\nline two\n\n- a\n- b\n1. x\n> quote\n```\ncode <b>\n```');
    expect(b.map((x) => x.kind)).toEqual(['h', 'p', 'ul', 'ol', 'quote', 'code']);
    expect(b[1]).toEqual({ kind: 'p', text: 'Para one\nline two' });
    expect(b[2]).toEqual({ kind: 'ul', items: ['a', 'b'] });
  });

  it('never turns user text into markup', () => {
    const el = inline('<img src=x onerror="alert(1)"> **<script>x</script>**');
    expect(el.querySelector('img, script')).toBeNull();
    expect(el.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(el.querySelector('strong')?.textContent).toBe('<script>x</script>');
  });

  it('only allows http(s) links', () => {
    const el = inline('[ok](https://a.dev/x) [bad](javascript:alert(1)) https://b.dev/y.');
    const hrefs = [...el.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['https://a.dev/x', 'https://b.dev/y']);
    expect(el.textContent).toContain('[bad](javascript:alert(1))');
  });

  it('renders known mentions and issue refs, leaves unknown ones as text', () => {
    const el = inline('ping <@usr_ada> and <@usr_ghost> about ENG-12 not ENG-99');
    expect(el.querySelector('a.mention')?.textContent).toBe('@Ada Lovelace');
    expect(el.textContent).toContain('<@usr_ghost>');
    expect(el.querySelector('a.ref')?.getAttribute('href')).toBe('/issue/ENG-12');
    expect(el.querySelectorAll('a.ref')).toHaveLength(1);
  });

  it('handles code, emphasis and line breaks', () => {
    const el = inline('use `a*b*c` and *soft* and _also_\nnext');
    expect(el.querySelector('code')?.textContent).toBe('a*b*c');
    expect([...el.querySelectorAll('em')].map((e) => e.textContent)).toEqual(['soft', 'also']);
    expect(el.querySelectorAll('br')).toHaveLength(1);
  });
});
