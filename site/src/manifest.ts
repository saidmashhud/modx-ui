/** Typed access to the Custom Elements Manifest the build generates (scripts/manifest.mjs → src/generated/). */
import raw from './generated/custom-elements.json';

export interface CemType { text: string }
export interface CemMember {
  kind: 'field' | 'method';
  name: string;
  static?: boolean;
  privacy?: string;
  type?: CemType;
  default?: string;
  description?: string;
  attribute?: string;
  reflects?: boolean;
  readonly?: boolean;
  parameters?: { name: string; type?: CemType; optional?: boolean }[];
  return?: { type?: CemType };
  inheritedFrom?: { name: string };
}
export interface CemNamed { name: string; description?: string; type?: CemType }
export interface CemDeclaration {
  kind: string;
  name: string;
  tagName?: string;
  description?: string;
  members?: CemMember[];
  attributes?: (CemNamed & { fieldName?: string; default?: string })[];
  events?: CemNamed[];
  slots?: CemNamed[];
  cssParts?: CemNamed[];
  cssProperties?: (CemNamed & { default?: string })[];
}
interface CemModule { path: string; declarations?: CemDeclaration[] }

const modules = (raw as unknown as { modules: CemModule[] }).modules;

export const elements: { tag: string; module: string; decl: CemDeclaration }[] = modules
  .flatMap((m) => (m.declarations ?? []).filter((d) => d.tagName).map((d) => ({ tag: d.tagName!, module: m.path, decl: d })))
  .sort((a, b) => a.tag.localeCompare(b.tag));

export const allTags = elements.map((e) => e.tag);

export function element(tag: string) {
  return elements.find((e) => e.tag === tag);
}

/** Public instance fields (properties) and methods of a declaration, own ones first; Lit / HTMLElement internals left out. */
const SKIP = new Set(['styles', 'properties', 'formAssociated', 'shadowRootOptions', 'render', 'updated', 'firstUpdated', 'willUpdate',
  'connectedCallback', 'disconnectedCallback', 'formResetCallback', 'formDisabledCallback', 'formStateRestoreCallback', 'kitStringsChanged']);
export function props(d: CemDeclaration): CemMember[] {
  return (d.members ?? []).filter((m) => m.kind === 'field' && !m.static && !SKIP.has(m.name) && !m.name.startsWith('_'));
}
export function methods(d: CemDeclaration): CemMember[] {
  return (d.members ?? []).filter((m) => m.kind === 'method' && !m.static && !SKIP.has(m.name) && !m.inheritedFrom && !m.name.startsWith('_'));
}
