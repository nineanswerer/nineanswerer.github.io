import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'test-results');
const port = 4399;
const base = `http://127.0.0.1:${port}`;
await mkdir(output, { recursive: true });

let server;
let browser;
const errors = [];
const checks = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function stopServer() {
  if (!server || server.killed) return;
  if (process.platform === 'win32' && server.pid) {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
      killer.once('exit', resolve);
      killer.once('error', resolve);
    });
  } else {
    server.kill('SIGTERM');
  }
}

try {
  server = spawn(process.execPath, [path.join(root, 'node_modules/astro/bin/astro.mjs'), 'dev', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  server.stdout.on('data', (chunk) => { serverLog += chunk.toString(); });
  server.stderr.on('data', (chunk) => { serverLog += chunk.toString(); });

  let ready = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Development server exited:\n${serverLog}`);
    try {
      const response = await fetch(base);
      if (response.ok) { ready = true; break; }
    } catch { /* Server is still starting. */ }
    await delay(250);
  }
  assert.ok(ready, `Development server did not become ready:\n${serverLog}`);

  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));

  const routes = ['/', '/projects/', '/projects/storagescope/', '/writing/', '/writing/storagescope-3d-tree/', '/about/', '/search/'];
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      const response = await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
      assert.equal(response?.status(), 200, `${route} should return 200`);
      assert.ok(await page.locator('h1').first().isVisible(), `${route} should have a visible h1 at ${width}px`);
      const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      assert.ok(dimensions.scroll <= dimensions.client + 1, `${route} overflows horizontally at ${width}px: ${dimensions.scroll} > ${dimensions.client}`);
      const brokenImages = await page.locator('img').evaluateAll((images) => images.filter((image) => !image.complete || image.naturalWidth === 0).map((image) => image.getAttribute('src')));
      assert.deepEqual(brokenImages, [], `${route} has broken images`);
      checks.push(`${route} @ ${width}px`);
    }
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(output, `home-${width}.png`), fullPage: true });
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base, { waitUntil: 'networkidle' });
  const oldTheme = await page.locator('html').getAttribute('data-theme');
  await page.locator('[data-theme-toggle]').click();
  const newTheme = await page.locator('html').getAttribute('data-theme');
  assert.notEqual(oldTheme, newTheme, 'Theme toggle should change the theme');
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('html').getAttribute('data-theme'), newTheme, 'Theme should persist after reload');
  await page.screenshot({ path: path.join(output, 'home-dark-1440.png'), fullPage: true });
  await page.locator('[data-theme-toggle]').click();
  checks.push('theme toggle and persistence');

  await page.goto(`${base}/search/`, { waitUntil: 'networkidle' });
  await page.locator('#search-input').fill('Rust');
  assert.ok(await page.locator('[data-search-result]').count() >= 1, 'Search should find Rust content');
  assert.ok((await page.locator('#search-results').textContent())?.includes('StorageScope'));
  await page.locator('#search-input').fill('definitely-no-such-record');
  assert.ok((await page.locator('#search-results').textContent())?.includes('没有找到'));
  await page.locator('#search-input').fill('3D');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, 'search-390.png'), fullPage: true });
  checks.push('local search and empty state');

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base, { waitUntil: 'networkidle' });
  await Promise.all([
    page.waitForURL('**/projects/storagescope/'),
    page.locator('a[href="/projects/storagescope/"]').first().click(),
  ]);
  assert.ok((await page.locator('h1').textContent())?.includes('StorageScope'));
  await page.screenshot({ path: path.join(output, 'project-1440.png'), fullPage: true });
  checks.push('featured project navigation');

  await page.goto(`${base}/writing/github-pages-troubleshooting/`, { waitUntil: 'networkidle' });
  assert.ok(await page.locator('.copy-code').count() >= 1, 'Code copy buttons should be enhanced');
  await page.setViewportSize({ width: 768, height: 900 });
  await page.screenshot({ path: path.join(output, 'article-768.png'), fullPage: true });
  checks.push('article layout and code enhancement');

  const rss = await page.request.get(`${base}/rss.xml`);
  assert.equal(rss.status(), 200);
  assert.ok((await rss.text()).includes('StorageScope'));
  assert.deepEqual(errors, [], `Browser errors:\n${errors.join('\n')}`);
  const notFound = await page.goto(`${base}/missing-page/`, { waitUntil: 'networkidle' });
  assert.equal(notFound?.status(), 404);
  assert.ok(await page.locator('.error-code').isVisible());
  checks.push('RSS and custom 404');
  console.log(JSON.stringify({ status: 'passed', checks, browserErrors: errors, screenshots: output }, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await stopServer();
}
