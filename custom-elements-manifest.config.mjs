/**
 * Custom Elements Manifest for @saidmashhud/modx-ui (scripts/manifest.mjs runs it). Components declare
 * `static properties` (no decorators) and register through define(), so each class carries `@tagname`.
 */

/** Lit `state: true` entries of `static properties` are internal: no attribute, not documented. Private and
 * protected members are left out too. */
function internalStates() {
  const states = new Map(); // class name → Set of state property names
  return {
    name: 'modx-internal-states',
    analyzePhase({ ts, node }) {
      if (!ts.isClassDeclaration(node) || !node.name) return;
      const props = node.members.find((m) => ts.isPropertyDeclaration(m) && m.name?.getText() === 'properties'
        && m.modifiers?.some((x) => x.kind === ts.SyntaxKind.StaticKeyword));
      const init = props?.initializer;
      if (!init || !ts.isObjectLiteralExpression(init)) return;
      const set = new Set();
      for (const p of init.properties) {
        if (!ts.isPropertyAssignment(p) || !ts.isObjectLiteralExpression(p.initializer)) continue;
        const isState = p.initializer.properties.some((q) => ts.isPropertyAssignment(q) && q.name.getText() === 'state' && q.initializer.kind === ts.SyntaxKind.TrueKeyword);
        if (isState) set.add(p.name.getText());
      }
      states.set(node.name.getText(), set);
    },
    packageLinkPhase({ customElementsManifest }) {
      for (const mod of customElementsManifest.modules) {
        for (const d of mod.declarations ?? []) {
          const hidden = states.get(d.name) ?? new Set();
          if (d.members) d.members = d.members.filter((m) => !hidden.has(m.name) && m.privacy !== 'private' && m.privacy !== 'protected');
          if (d.attributes) d.attributes = d.attributes.filter((a) => !hidden.has(a.fieldName ?? a.name));
          /* MxElement.emit(name, …) dispatches a variable event name: the real ones are documented with @fires */
          if (d.events) d.events = d.events.filter((e) => e.name && e.name !== 'name');
        }
      }
    },
  };
}

export default {
  globs: ['packages/ui/src/*.ts'],
  exclude: ['packages/ui/src/index.ts'],
  outdir: '.cem',
  litelement: true,
  packagejson: false,
  plugins: [internalStates()],
};
