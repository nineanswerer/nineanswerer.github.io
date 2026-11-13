import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { branchPoint, growthCamera, projectPoint, recordProgress } from '../src/project-growth.ts';

export async function checkProjectGrowth({ page, browser, base, output, checks }) {
  const pause = page.locator('[data-sculpture-pause]');
  const canvas = page.locator('[data-sculpture-canvas]');
  const sculpture = page.locator('[data-sculpture]');
  const picture = async () => createHash('sha256').update(await canvas.evaluate(element => element.toDataURL())).digest('hex');
  const wait = ms => page.waitForTimeout(ms);
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(() => sessionStorage.removeItem('sculpture-paused'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.mouse.move(0, 0);
  assert.equal(await sculpture.getAttribute('data-paused'), 'false');
  const rotating = await picture(); await wait(200);
  assert.notEqual(await picture(), rotating, 'The visible sculpture should rotate');
  await pause.click(); await page.mouse.move(0, 0);
  const paused = await picture(); await wait(200);
  assert.equal(await picture(), paused, 'Pause should stop drawing movement');
  await pause.click(); await page.mouse.move(0, 0);
  await wait(100); const resumed = await picture(); await wait(200);
  assert.notEqual(await picture(), resumed, 'Resume should rotate even while its button has focus');
  await pause.click(); await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await sculpture.getAttribute('data-paused'), 'true', 'Pause choice should survive reload');

  for (const width of [2560, 1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 }); await wait(80);
    const layout = await page.evaluate(() => {
      const figure = document.querySelector('.kinetic-sculpture').getBoundingClientRect();
      const copy = document.querySelector('.manifesto-copy').getBoundingClientRect();
      const stage = document.querySelector('.sculpture-stage').getBoundingClientRect();
      const heading = document.querySelector('.manifesto-copy h1');
      return { scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth,
        left: stage.left, right: stage.right, copyRight: copy.right, figureLeft: figure.left,
        headingWidth: heading.clientWidth, headingScroll: heading.scrollWidth,
        headingHeight: heading.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(heading).lineHeight) };
    });
    assert.ok(layout.scroll <= layout.client + 1, `Homepage overflow at ${width}`);
    assert.ok(layout.left >= 12 && layout.right <= layout.client - 12, `Canvas needs visible margins at ${width}`);
    assert.ok(layout.headingScroll <= layout.headingWidth + 1, `Headline overflows at ${width}`);
    assert.ok(layout.headingHeight <= layout.lineHeight * 2 + 1, `Headline punctuation wraps at ${width}`);
    if (width > 900) assert.ok(layout.copyRight + 20 <= layout.figureLeft, `Text and figure overlap at ${width}`);
    for (const button of await page.locator('.sculpture-controls button, .growth-projects button, .growth-record-nav button').all()) {
      const bounds = await button.boundingBox();
      assert.ok(bounds && bounds.x >= 12 && bounds.x + bounds.width <= width - 12, `Control clipped at ${width}`);
      assert.ok(bounds.height >= 43, 'Touch targets should be at least 44px high');
    }
    if ([2560, 1440, 390].includes(width)) await page.locator('.manifesto').screenshot({ path: path.join(output, `growth-home-${width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await canvas.focus(); const original = await picture();
  await canvas.press('ArrowRight'); assert.notEqual(await picture(), original, 'Keyboard rotation should affect the actual drawing');
  await canvas.press('Home');
  const bounds = await canvas.boundingBox();
  const graph = JSON.parse(await sculpture.getAttribute('data-growth'));
  const camera = growthCamera(graph.branches.length, 0, -.24, 0, bounds.width, bounds.height);
  const targetBranch = graph.branches.findIndex(branch => branch.records.length === 1);
  const target = projectPoint(branchPoint(targetBranch, graph.branches.length, recordProgress(0, 1)), -.24, 0, bounds.width, bounds.height, camera);
  await page.mouse.click(bounds.x + target.x, bounds.y + target.y);
  assert.equal(await page.locator('[data-growth-project-link]').textContent(), graph.branches[targetBranch].title, 'Clicking a rendered node should select its real record');
  assert.equal(await sculpture.getAttribute('data-paused'), 'true', 'Reading a node should pause rotation');

  const historyBranch = graph.branches.findIndex(branch => branch.records.length > 1);
  await page.locator(`[data-growth-project="${historyBranch}"]`).click();
  const latest = graph.branches[historyBranch].records.at(-1);
  assert.ok((await page.locator('[data-growth-title]').textContent()).includes(latest.title));
  await page.locator('[data-growth-previous]').click();
  const previous = graph.branches[historyBranch].records.at(-2);
  assert.ok((await page.locator('[data-growth-title]').textContent()).includes(previous.title));
  await page.locator('[data-growth-title]').click();
  assert.equal(new URL(page.url()).pathname, previous.url, 'The selected record should navigate to its actual article or project');
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('[data-growth-project-link]').click();
  assert.equal(new URL(page.url()).pathname, graph.branches[historyBranch].url, 'Project entry should navigate');
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('[data-sculpture-shape]').click();
  await wait(1500);
  assert.equal(await sculpture.getAttribute('data-shape'), 'spread');
  const spread = await picture(); await wait(180);
  assert.equal(await picture(), spread, 'Expansion should settle while paused');
  await page.locator('[data-sculpture-shape]').click(); await wait(1500);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await sculpture.getAttribute('data-paused'), 'true');
  const reduced = await picture(); await wait(200); assert.equal(await picture(), reduced);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // Moving the live drawing offscreen must stop its loop, even after an explicit resume.
  await pause.click(); await page.mouse.move(0, 0);
  await page.locator('#journal').scrollIntoViewIfNeeded(); await wait(200);
  const offscreen = await picture(); await wait(200); assert.equal(await picture(), offscreen);
  await page.goto(base, { waitUntil: 'networkidle' });
  if (await sculpture.getAttribute('data-paused') === 'false') await pause.click();
  await page.locator('.growth-records-index summary').click();
  const recordLink = page.locator('[data-growth-record]').first();
  const recordUrl = await recordLink.getAttribute('href');
  await recordLink.focus(); await page.keyboard.press('Enter');
  await page.waitForURL(url => url.pathname === recordUrl);
  assert.equal(new URL(page.url()).pathname, recordUrl, 'The keyboard should open a record directly');

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const phone = await mobile.newPage();
  await phone.goto(base, { waitUntil: 'networkidle' });
  await phone.locator('[data-growth-project="1"]').tap();
  assert.equal(await phone.locator('[data-growth-project="1"]').getAttribute('aria-pressed'), 'true');
  await phone.locator('[data-sculpture-canvas]').scrollIntoViewIfNeeded();
  const mobileCanvas = phone.locator('[data-sculpture-canvas]');
  const box = await mobileCanvas.boundingBox();
  const mobilePicture = await mobileCanvas.evaluate(element => element.toDataURL());
  const cdp = await mobile.newCDPSession(phone);
  const x = box.x + box.width / 2, y = Math.max(140, box.y + box.height / 2);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let step = 1; step <= 6; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + step * 12, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.ok(await mobileCanvas.evaluate(element => element.toDataURL()) !== mobilePicture, 'Horizontal touch should rotate');
  const scrollBefore = await phone.evaluate(() => scrollY);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let step = 1; step <= 8; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - step * 16 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await phone.waitForTimeout(200);
  assert.ok(await phone.evaluate(() => scrollY) > scrollBefore + 30, 'Vertical touch over the canvas should scroll the page');
  await mobile.close();

  for (const mode of ['no-js', 'no-canvas']) {
    const fallback = await browser.newContext({ javaScriptEnabled: mode !== 'no-js', viewport: { width: 390, height: 844 } });
    if (mode === 'no-canvas') await fallback.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
    const reader = await fallback.newPage(); await reader.goto(base, { waitUntil: 'networkidle' });
    assert.ok(await reader.locator('.sculpture-fallback').isVisible(), `${mode} needs the static project drawing`);
    assert.equal(await reader.locator('.sculpture-controls').isVisible(), false);
    await reader.locator('.growth-records-index summary').click();
    assert.ok(await reader.locator('[data-growth-record]').first().isVisible());
    await reader.locator('[data-growth-record]').first().click();
    assert.notEqual(new URL(reader.url()).pathname, '/'); await fallback.close();
  }
  checks.push('project growth: six widths, real-node picking, keyboard/touch, pause/resume/persistence, history navigation, reduced motion, offscreen and static fallbacks');
}
