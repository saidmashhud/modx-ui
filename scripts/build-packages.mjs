#!/usr/bin/env node
/**
 * Builds each package into packages/<name>/dist as a publishable package: ES2022 JS + .d.ts (+ maps) from tsc, the
 * package's LICENSE and README, tokens.css, custom-elements.json (ui: scripts/manifest.mjs), and a package.json whose
 * exports point at the built files with "types".
 *
 * The source manifests (packages/<name>/package.json) keep pointing at src/*.ts: apps that vendor this repo
 * (mod-x copies the committed tree, without dist/) import the TypeScript sources through their bundler. Publish
 * the built directory, never the source one:  npm publish packages/ui/dist   (a prepublishOnly guard refuses
 * the source directory).
 *
 *   node scripts/build-packages.mjs [ui|tokens|store ...]
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tsc = join(root, 'node_modules', '.bin', 'tsc');
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['tokens', 'store', 'ui'];

/** "./src/x.ts" → "./x.js" (dist is the package root of the published package). */
const built = (p) => p.replace(/^(\.\/)?src\//, './').replace(/\.ts$/, '.js');
const typesOf = (p) => p.replace(/\.js$/, '.d.ts');

for (const name of names) {
  const dir = join(root, 'packages', name);
  const out = join(dir, 'dist');
  rmSync(out, { recursive: true, force: true });
  execFileSync(tsc, ['-p', join(dir, 'tsconfig.build.json')], { stdio: 'inherit' });
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const exports = {};
  for (const [key, target] of Object.entries(pkg.exports)) {
    if (target.endsWith('.css')) {
      const file = built(target);
      mkdirSync(dirname(join(out, file)), { recursive: true });
      copyFileSync(join(dir, target), join(out, file));
      exports[key] = file;
      continue;
    }
    const js = built(target);
    exports[key.replace(/\.ts$/, '.js')] = { types: typesOf(js), default: js };
  }
  for (const f of ['LICENSE', 'README.md']) if (existsSync(join(dir, f))) copyFileSync(join(dir, f), join(out, f));
  const { scripts: _s, devDependencies: _d, files: _f, main: _m, ...rest } = pkg;
  /* the Custom Elements Manifest (editors, Storybook, the docs site's API tables) sits at the package root */
  if (pkg.customElements) execFileSync(process.execPath, [join(root, 'scripts', 'manifest.mjs'), join(out, 'custom-elements.json')], { stdio: 'inherit' });
  const manifest = {
    ...rest,
    ...(pkg.customElements ? { customElements: './custom-elements.json' } : {}),
    main: built(pkg.main),
    types: typesOf(built(pkg.main)),
    exports,
    sideEffects: Array.isArray(pkg.sideEffects) ? pkg.sideEffects.map(built) : pkg.sideEffects,
  };
  writeFileSync(join(out, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`built @saidmashhud/modx-${name} → packages/${name}/dist`);
}
