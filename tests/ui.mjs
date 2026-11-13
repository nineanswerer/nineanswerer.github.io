import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
const output = path.join(root, 'test-results');
const port = 4600;
const base = `http://127.0.0.1:${port}`;
await mkdir(output, { recursive: true });

let server;
let browser;
const errors = [];
const externalRequests = [];
const checks = [];
const homeSettings = JSON.parse(await readFile(path.join(root, 'src/content/home/index.json'), 'utf8'));
let feedCounts;
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

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  }));
  return files.flat();
}

async function checkBuiltLinks() {
  const files = (await walk(dist)).filter((file) => file.endsWith('.html'));
  const broken = [];
  for (const file of files) {
    const html = await readFile(file, 'utf8');
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const value = match[1];
      if (!value.startsWith('/') || value.startsWith('//')) continue;
      const pathname = decodeURIComponent(new URL(value, base).pathname);
      let target = path.join(dist, pathname);
      if (pathname.endsWith('/')) target = path.join(target, 'index.html');
      try { await stat(target); } catch { broken.push(`${path.relative(dist, file)} -> ${value}`); }
    }
  }
  assert.deepEqual(broken, [], `Broken internal links:\n${broken.join('\n')}`);
  checks.push(`${files.length} built HTML files: internal links and resources`);
}

try {
  server = spawn(process.execPath, [path.join(root, 'node_modules/astro/bin/astro.mjs'), 'preview', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  server.stdout.on('data', (chunk) => { serverLog += chunk.toString(); });
  server.stderr.on('data', (chunk) => { serverLog += chunk.toString(); });

  let ready = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Preview server exited:\n${serverLog}`);
    try {
      const response = await fetch(base);
      if (response.ok) { ready = true; break; }
    } catch { /* Server is still starting. */ }
    await delay(250);
  }
  assert.ok(ready, `Preview server did not become ready:\n${serverLog}`);

  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  const page = await context.newPage();
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('request', (request) => {
    const url = request.url();
    if (/^https?:/.test(url) && !url.startsWith(base)) externalRequests.push(url);
  });

  const routes = [
    '/', '/writing/', '/writing/storagescope-live-workspace/', '/writing/storagescope-3d-tree/', '/writing/storagescope-beta-closure/',
    '/writing/storagescope-trusted-cleanup/', '/writing/hugo-to-astro-casebook/', '/notes/visible-node-budget/',
    '/projects/', '/projects/storagescope/', '/projects/minecraft-resource-extractor/',
    '/now/', '/about/', '/search/',
  ];
  for (const width of [1440, 768, 390, 375]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      const response = await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
      assert.equal(response?.status(), 200, `${route} should return 200`);
      assert.ok(await page.locator('h1').first().isVisible(), `${route} should have a visible h1 at ${width}px`);
      const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      assert.ok(dimensions.scroll <= dimensions.client + 1, `${route} overflows horizontally at ${width}px: ${dimensions.scroll} > ${dimensions.client}`);
      for (const image of await page.locator('img').all()) {
        await image.scrollIntoViewIfNeeded();
        await image.evaluate((element) => {
          if (element.complete) return;
          return new Promise((resolve) => {
            element.addEventListener('load', resolve, { once: true });
            element.addEventListener('error', resolve, { once: true });
          });
        });
      }
      const brokenImages = await page.locator('img').evaluateAll((images) => images.filter((image) => !image.complete || image.naturalWidth === 0).map((image) => image.getAttribute('src')));
      assert.deepEqual(brokenImages, [], `${route} has broken images`);
      const distortedImages = await page.locator('img').evaluateAll((images) => images.flatMap((image) => {
        if (!image.offsetWidth || !image.offsetHeight || !image.naturalWidth || !image.naturalHeight) return [];
        // These modes preserve the image ratio inside a deliberately cropped or letterboxed box.
        if (['cover', 'contain', 'scale-down', 'none'].includes(getComputedStyle(image).objectFit)) return [];
        const displayedRatio = image.offsetWidth / image.offsetHeight;
        const naturalRatio = image.naturalWidth / image.naturalHeight;
        return Math.abs(displayedRatio - naturalRatio) / naturalRatio > 0.01 ? [`${image.getAttribute('src')}: displayed ${image.offsetWidth}×${image.offsetHeight}, natural ${image.naturalWidth}×${image.naturalHeight}`] : [];
      }));
      assert.deepEqual(distortedImages, [], `${route} has stretched images at ${width}px`);
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      assert.equal(canonical, `https://nineanswerer.github.io${route}`, `${route} has the wrong canonical`);
      checks.push(`${route} @ ${width}px`);
    }
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('.footer-links a[href="/admin/"]').count(), 1, 'The footer should link to the content admin');
  await page.locator('.hero-project-link').focus();
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('hero-project-link')), true, 'The project entry should receive keyboard focus');
  const focusOutline = await page.locator('.hero-project-link').evaluate((element) => getComputedStyle(element).outlineStyle);
  assert.notEqual(focusOutline, 'none', 'Focused workbench cells need a visible outline');
  assert.ok((await page.locator('.hero-status').textContent())?.includes(homeSettings.status));
  assert.ok((await page.locator('.making-section').textContent())?.includes('v0.3.0-beta.2'));
  assert.equal(await page.locator('.making-links a[href="https://github.com/nineanswerer/StorageScope/releases/tag/v0.3.0-beta.2"]').count(), 1);
  assert.ok((await page.locator('.journal-feature').textContent())?.includes('让目录变化在 3D 树里流动'));
  await page.screenshot({ path: path.join(output, 'home-1440.png'), fullPage: true });
  checks.push('project-entry keyboard focus and live workspace summary');

  await page.goto(`${base}/writing/`, { waitUntil: 'networkidle' });
  feedCounts = { posts: await page.locator('[data-feed-kind="长文"]').count(), notes: await page.locator('[data-feed-kind="碎片"]').count(), total: await page.locator('[data-feed-kind]').count() };
  await page.locator('[data-blog-filter="长文"]').click();
  assert.equal(await page.locator('[data-feed-kind]:visible').count(), feedCounts.posts, 'Long-form filter should show all published posts');
  await page.locator('[data-blog-filter="碎片"]').click();
  assert.equal(await page.locator('[data-feed-kind]:visible').count(), feedCounts.notes, 'Note filter should show all published notes');
  await page.locator('[data-blog-filter="全部"]').click();
  assert.equal(await page.locator('[data-feed-kind]:visible').count(), feedCounts.total, 'All filter should restore every published entry');
  await page.screenshot({ path: path.join(output, 'writing-1440.png'), fullPage: true });
  checks.push(`blog filters: ${feedCounts.posts} long-form, ${feedCounts.notes} notes, ${feedCounts.total} total`);

  const oldTheme = await page.locator('html').getAttribute('data-theme');
  await page.locator('[data-theme-toggle]').click();
  const newTheme = await page.locator('html').getAttribute('data-theme');
  assert.notEqual(oldTheme, newTheme, 'Theme toggle should change the theme');
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('html').getAttribute('data-theme'), newTheme, 'Theme should persist after reload');
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(output, 'home-dark-1440.png'), fullPage: true });
  await page.locator('[data-theme-toggle]').click();
  checks.push('dark theme and persistence');

  await page.goto(`${base}/search/`, { waitUntil: 'networkidle' });
  await page.locator('#search-input').fill('时区');
  assert.ok(await page.locator('[data-search-result]').count() >= 1, 'Search should find the timezone note');
  assert.ok((await page.locator('#search-results').textContent())?.includes('文章日期为什么提前了一天'));
  assert.ok(page.url().includes('q='), 'Search should update the query parameter');
  await page.locator('#search-input').fill('definitely-no-such-record');
  assert.ok((await page.locator('#search-results').textContent())?.includes('没有找到'));
  await page.locator('#search-input').fill('单次流动尾迹');
  assert.ok((await page.locator('#search-results').textContent())?.includes('让目录变化在 3D 树里流动'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, 'search-390.png'), fullPage: true });
  checks.push('local search finds notes, empty state and query URL');

  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('.mobile-nav summary').click();
  assert.equal(await page.locator('.mobile-nav').getAttribute('open'), '', 'Mobile navigation should open');
  await page.locator('.mobile-nav a[href="/now/"]').click();
  await page.waitForURL('**/now/');
  assert.ok((await page.locator('h1').textContent())?.includes('最近'));
  await page.screenshot({ path: path.join(output, 'now-390.png'), fullPage: true });
  await page.goto(base, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('.featured-entry[href="/projects/storagescope/"]').isVisible(), true, 'The mobile homepage should keep its project entry');
  await page.screenshot({ path: path.join(output, 'home-390.png'), fullPage: true });
  checks.push('mobile navigation, now page and visible tree project entry');

  await page.goto(`${base}/writing/`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(output, 'writing-390.png'), fullPage: true });
  await page.goto(`${base}/projects/storagescope/`, { waitUntil: 'networkidle' });
  assert.ok((await page.locator('.project-evidence').textContent())?.includes('307,630'));
  assert.ok((await page.locator('.project-evidence').textContent())?.includes('自动化运行记录'));
  assert.ok((await page.locator('.project-evidence').textContent())?.includes('61 + 10 + 34'));
  assert.ok((await page.locator('.project-hero').textContent())?.includes('3D 实时工作区开发预览'));
  assert.equal(await page.locator('.project-hero a[href="https://github.com/nineanswerer/StorageScope/releases/tag/v0.3.0-beta.2"]').count(), 1);
  await page.screenshot({ path: path.join(output, 'project-390.png'), fullPage: true });
  checks.push('mobile blog, preview evidence and existing public beta release');

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/projects/storagescope/`, { waitUntil: 'networkidle' });
  const demo = page.locator('.interface-video');
  const videoSettings = await demo.evaluate((video) => ({ autoplay: video.autoplay, controls: video.controls, preload: video.preload, paused: video.paused, poster: video.poster }));
  assert.deepEqual({ ...videoSettings, poster: undefined }, { autoplay: false, controls: true, preload: 'none', paused: true, poster: undefined });
  assert.equal((await page.request.get(videoSettings.poster)).status(), 200, 'Demo poster should load');
  for (const source of await demo.locator('source').all()) {
    assert.equal((await page.request.get(`${base}${await source.getAttribute('src')}`)).status(), 200, 'Both video formats should load');
  }
  await demo.evaluate((video) => video.play());
  await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0.1);
  await demo.evaluate((video) => { if (video instanceof HTMLVideoElement) video.pause(); });
  assert.equal(await demo.evaluate((video) => video.paused), true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await demo.evaluate((video) => video.paused), true, 'Demo should stay paused with reduced motion');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  checks.push('native demo formats, playback controls and paused default with reduced motion');
  await page.screenshot({ path: path.join(output, 'project-1440.png'), fullPage: true });
  await page.goto(`${base}/writing/storagescope-live-workspace/`, { waitUntil: 'networkidle' });
  assert.ok((await page.locator('.prose').textContent())?.includes('105 项'));
  assert.ok((await page.locator('.prose').textContent())?.includes('新交互尚未发布到公开 Release'));
  await page.screenshot({ path: path.join(output, 'storagescope-live-workspace-1440.png'), fullPage: true });
  await page.goto(`${base}/writing/storagescope-beta-closure/`, { waitUntil: 'networkidle' });
  const closureText = await page.locator('.prose').textContent();
  assert.ok(closureText?.includes('57 项 Rust 核心测试、8 项桌面测试和 20 项前端模型测试'));
  assert.ok(closureText?.includes('6 份快照保留'));
  assert.ok(closureText?.includes('165.02 FPS'));
  assert.ok(closureText?.includes('3D 场景作为主要工作区'));
  await page.screenshot({ path: path.join(output, 'storagescope-beta-closure-1440.png'), fullPage: true });
  await page.goto(`${base}/now/`, { waitUntil: 'networkidle' });
  assert.ok((await page.locator('main').textContent())?.includes('验证 3D 树中心工作区'));
  await page.screenshot({ path: path.join(output, 'now-1440.png'), fullPage: true });

  await page.goto(`${base}/writing/github-pages-troubleshooting/`, { waitUntil: 'networkidle' });
  assert.ok(await page.locator('.copy-code').count() >= 1, 'Code copy buttons should be enhanced');
  await page.locator('.copy-code').first().click();
  await page.waitForFunction(() => document.querySelector('.copy-code')?.textContent === '已复制');
  assert.equal(await page.locator('.copy-code').first().textContent(), '已复制');
  await page.setViewportSize({ width: 768, height: 900 });
  await page.screenshot({ path: path.join(output, 'article-768.png'), fullPage: true });
  checks.push('project and beta closure evidence, now desktop, article TOC and clipboard');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  checks.push('reduced motion preference');

  const rss = await page.request.get(`${base}/rss.xml`);
  assert.equal(rss.status(), 200);
  const rssText = await rss.text();
  assert.ok(rssText.includes('StorageScope'));
  assert.ok(rssText.includes('/writing/storagescope-beta-closure/'));
  assert.ok(rssText.includes('/writing/storagescope-live-workspace/'));
  assert.ok(rssText.includes('/notes/date-timezone/'));
  assert.ok((rssText.match(/<item>/g) ?? []).length === feedCounts.total, 'RSS should contain every published feed item');
  const sitemap = await page.request.get(`${base}/sitemap-0.xml`);
  assert.equal(sitemap.status(), 200);
  assert.ok((await sitemap.text()).includes('/now/'));
  checks.push('RSS agrees with published writing and notes; sitemap exists');

  const legacyRoutes = [
    ['/posts/hugo配置教程/', '/writing/github-pages-troubleshooting/'],
    ['/posts/git的使用学习/', '/writing/github-pages-troubleshooting/'],
    ['/posts/深度学习顺序/', '/writing/mnist-data-pipeline/'],
    ['/posts/hello-world/', '/writing/'],
    ['/posts/测试文章1/', '/writing/'],
    ['/archives/', '/writing/'],
    ['/projects/personal-workshop/', '/writing/hugo-to-astro-casebook/'],
    ['/writing/storagescope-case-study/', '/projects/storagescope/'],
  ];
  for (const [legacy, target] of legacyRoutes) {
    const response = await page.request.get(`${base}${legacy}`);
    assert.equal(response.status(), 200, `${legacy} should serve its static redirect`);
    const html = await response.text();
    assert.ok(html.includes(`0;url=${target}`), `${legacy} should have a meta refresh`);
    assert.ok(html.includes(`href="${target}"`), `${legacy} should have a manual link`);
    assert.ok(html.includes(`https://nineanswerer.github.io${target}`), `${legacy} should have the target canonical`);
    await page.goto(`${base}${legacy}`, { waitUntil: 'networkidle' });
    assert.equal(new URL(page.url()).pathname, target, `${legacy} should redirect to ${target}`);
  }
  checks.push('six legacy Hugo links and two merged-page links with meta refresh, canonical and manual links');

  const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const noJsPage = await noJs.newPage();
  await noJsPage.goto(`${base}/writing/`, { waitUntil: 'networkidle' });
  assert.equal(await noJsPage.locator('[data-feed-kind]:visible').count(), feedCounts.total, 'No-JS blog should show all entries');
  assert.equal(await noJsPage.locator('[data-blog-filters]').isVisible(), false, 'Filters should stay hidden without JS');
  await noJsPage.goto(`${base}/projects/storagescope/`, { waitUntil: 'networkidle' });
  assert.equal(await noJsPage.locator('h1').isVisible(), true);
  await noJsPage.goto(`${base}/archives/`, { waitUntil: 'networkidle' });
  assert.equal(new URL(noJsPage.url()).pathname, '/writing/', 'Meta refresh should work without JS');
  await noJs.close();
  checks.push('no-JavaScript reading, navigation and legacy redirect');

  const adminConfig = await readFile(path.join(dist, 'admin/config.yml'), 'utf8');
  assert.equal((adminConfig.match(/widget: datetime/g) ?? []).length, 8, 'Admin should define eight datetime fields');
  assert.equal((adminConfig.match(/widget: datetime, type: date, format: YYYY-MM-DD/g) ?? []).length, 8, 'All admin dates must use Day.js tokens');
  assert.ok(!adminConfig.includes('format: yyyy-MM-dd'), 'Admin must not use date-fns tokens');
  assert.ok(adminConfig.includes('omit_empty_optional_fields: true'), 'Admin should omit empty optional fields');
  assert.equal((adminConfig.match(/name: draft, widget: boolean, default: true/g) ?? []).length, 3, 'New writing, notes and projects should remain drafts by default');
  assert.equal((adminConfig.match(/label: 仅保存为草稿/g) ?? []).length, 3, 'Draft controls should explain the save workflow');
  checks.push('admin date formats, empty optional fields and draft-first publishing');

  const adminHtml = await readFile(path.join(dist, 'admin/index.html'), 'utf8');
  assert.ok(adminHtml.includes('src="https://unpkg.com/@sveltia/cms@0.257.0/dist/sveltia-cms.js"'), 'Admin script should use an exact version');
  assert.match(adminHtml, /integrity="sha384-[A-Za-z0-9+/]+={0,2}"/, 'Admin script should have SHA-384 integrity protection');
  assert.ok(adminHtml.includes('crossorigin="anonymous"'), 'Admin script integrity should use anonymous CORS');
  assert.ok(adminHtml.includes('<meta name="referrer" content="no-referrer" />'), 'Admin should not leak referrer data');
  assert.ok(adminHtml.includes("object-src 'none'; base-uri 'none';"), 'Admin should disable objects and base URL changes');
  assert.ok(!adminHtml.includes('@sveltia/cms/dist/'), 'Admin script must not float to the latest version');
  checks.push('admin script version pinning, integrity and document hardening');

  await checkBuiltLinks();
  assert.deepEqual(externalRequests, [], `Unexpected third-party runtime requests:\n${externalRequests.join('\n')}`);
  assert.deepEqual(errors, [], `Browser errors:\n${errors.join('\n')}`);
  checks.push('no browser errors or third-party runtime requests');

  const notFound = await page.goto(`${base}/missing-page/`, { waitUntil: 'networkidle' });
  assert.equal(notFound?.status(), 404);
  assert.ok(await page.locator('.error-code').isVisible());
  assert.ok(await page.locator('.not-found a[href="/search/"]').isVisible());
  checks.push('custom 404 and search recovery');
  const expectedNotFoundLogs = errors.splice(0);
  assert.ok(expectedNotFoundLogs.every((message) => message.includes('404')), 'Only the intentional 404 may log a resource error');

  const fontSize = (await stat(path.join(root, 'public/fonts/workshop-hand.woff2'))).size;
  const imageSize = (await stat(path.join(root, 'public/images/storagescope-tree.webp'))).size;
  console.log(JSON.stringify({ status: 'passed', checks, browserErrors: errors, expectedNotFoundLogs, externalRequests, resourceBytes: { font: fontSize, screenshot: imageSize }, screenshots: output }, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await stopServer();
}
