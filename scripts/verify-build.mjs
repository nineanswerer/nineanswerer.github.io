import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { site } from '../src/config.ts';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const origin = new URL(site.url).origin;
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : path.join(dir, entry.name)))).flat();
}
const htmlFiles = (await walk(dist)).filter((file) => file.endsWith('.html'));
const documents = new Map(await Promise.all(htmlFiles.map(async (file) => [file, await readFile(file, 'utf8')])));
const broken = [];
for (const [file, html] of documents) {
  const relativePath = path.relative(dist, file).split(path.sep).map(encodeURIComponent).join('/');
  const pageUrl = new URL('/' + relativePath.replace(/(^|\/)index\.html$/, '$1'), origin);
  const references = [
    ...html.matchAll(/\s(?:href|src)="([^"]+)"/g),
    ...html.matchAll(/<meta\s+property="og:image"\s+content="([^"]+)"/g),
  ];
  for (const [, value] of references) {
    const url = new URL(value, pageUrl);
    if (url.origin !== origin) continue;
    const pathname = decodeURIComponent(url.pathname);
    let target = path.resolve(dist, '.' + pathname, pathname.endsWith('/') ? 'index.html' : '');
    assert.ok(target.startsWith(dist), `Resource escapes build directory: ${value}`);
    if ((await stat(target).catch(() => null))?.isDirectory()) target = path.join(target, 'index.html');
    if (!(await stat(target).catch(() => null))?.isFile()) {
      broken.push(`${relativePath} → ${value}`);
      continue;
    }
    const targetHtml = documents.get(target);
    if (url.hash && targetHtml !== undefined) {
      const fragment = decodeURIComponent(url.hash.slice(1));
      const anchors = [...targetHtml.matchAll(/\sid="([^"]+)"/g)].map(([, id]) => id);
      if (!anchors.includes(fragment)) broken.push(`${relativePath} → ${value} (missing anchor)`);
    }
  }
}
assert.deepEqual(broken, [], `Broken internal links or resources:\n${broken.join('\n')}`);
const home = await readFile(path.join(dist, 'index.html'), 'utf8');
const scripts = [...home.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
let js = 0;
for (const [, attributes, inline] of scripts) {
  if (/type="application\/(ld\+)?json"/.test(attributes)) continue;
  const src = attributes.match(/src="([^"]+)"/)?.[1];
  if (src?.startsWith('/')) js += gzipSync(await readFile(path.join(dist, src))).length;
  else if (!src) js += gzipSync(inline).length;
}
let css = 0;
for (const [, href] of home.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)) {
  css += gzipSync(await readFile(path.join(dist, href))).length;
}
for (const [, inline] of home.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)) css += gzipSync(inline).length;
// Compressed transfer budgets cover initial HTML script/style references, not runtime FPS.
assert.ok(js <= 12 * 1024, `Home JavaScript exceeds 12 KiB gzip: ${js} bytes`);
assert.ok(css <= 18 * 1024, `Home CSS exceeds 18 KiB gzip: ${css} bytes`);
console.log(`${htmlFiles.length} HTML pages: internal links, anchors and resources valid.`);
console.log(`Home transfer estimate (gzip): JS ${(js / 1024).toFixed(1)} / 12 KiB; CSS ${(css / 1024).toFixed(1)} / 18 KiB.`);
