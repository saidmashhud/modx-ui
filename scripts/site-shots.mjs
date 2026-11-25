#!/usr/bin/env node
/**
 * Screenshots of the built docs site (npm run docs:build first): desktop 1440 × 900 and phone 390 × 844, light and
 * dark, full page, into site-shots/ (git-ignored). Also fails on console errors and on pages wider than the viewport.
 *
 *   node scripts/site-shots.mjs [page ...]      e.g. index mx-select
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'site/dist');
const out = join(root, 'site-shots');
if (!existsSync(join(dist, 'index.html'))) { console.error('site/dist is missing: npm run docs:build'); process.exit(1); }
mkdirSync(out, { recursive: true });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html';
  const file = join(dist, path);
  if (!file.startsWith(dist) || !existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}/`;

const all = readdirSync(dist).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, ''));
const pages = process.argv.slice(2).length ? process.argv.slice(2) : all;
const views = [{ name: 'desktop', viewport: { width: 1440, height: 900 } }, { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }];
const problems = [];

const browser = await chromium.launch();
for (const view of views) {
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: view.viewport, isMobile: view.isMobile, hasTouch: view.hasTouch, deviceScaleFactor: view.isMobile ? 2 : 1, colorScheme: theme });
    await ctx.addInitScript((t) => localStorage.setItem('modx-docs-theme', t), theme);
    for (const p of pages) {
      const page = await ctx.newPage();
      page.on('console', (m) => { if (m.type() === 'error') problems.push(`${p} [${view.name}/${theme}] console: ${m.text()}`); });
      page.on('pageerror', (e) => problems.push(`${p} [${view.name}/${theme}] error: ${e.message}`));
      await page.goto(base + p + '.html', { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (over > 0) problems.push(`${p} [${view.name}/${theme}] ${over}px wider than the viewport`);
      await page.screenshot({ path: join(out, `${p}-${view.name}-${theme}.png`), fullPage: true });
      await page.close();
    }
    await ctx.close();
  }
}
await browser.close();
server.close();
console.log(`${pages.length * 4} screenshots → site-shots/`);
if (problems.length) { console.log(problems.join('\n')); process.exitCode = 1; }
