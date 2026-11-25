#!/usr/bin/env node
/**
 * Writes the Custom Elements Manifest of @saidmashhud/modx-ui to <out> (default packages/ui/dist/custom-elements.json),
 * with module paths as the published package has them ("button.js", not "packages/ui/src/button.ts").
 * build-packages.mjs runs it for the ui package; the docs site reads the same file for its API tables.
 *
 *   node scripts/manifest.mjs [out]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] ?? join(root, 'packages/ui/dist/custom-elements.json'));
const tmp = join(root, '.cem');
execFileSync(join(root, 'node_modules/.bin/cem'), ['analyze', '--config', 'custom-elements-manifest.config.mjs', '--quiet'], { cwd: root, stdio: 'inherit' });
const raw = readFileSync(join(tmp, 'custom-elements.json'), 'utf8');
rmSync(tmp, { recursive: true, force: true });
const fix = (p) => (typeof p === 'string' ? p.replace(/^\/?packages\/ui\/src\//, '').replace(/\.ts$/, '.js') : p);
const manifest = JSON.parse(raw, function (key, value) {
  return key === 'path' || key === 'module' ? fix(value) : value;
});
const tags = manifest.modules.flatMap((m) => (m.declarations ?? []).filter((d) => d.tagName)).length;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
console.log(`custom-elements.json: ${tags} elements → ${out.replace(root + '/', '')}`);
