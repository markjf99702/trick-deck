// Drives the real page in Chromium, from first visit to a trick show:  node test/e2e.mjs
// Starts its own static server. Needs Playwright (npm i -g playwright, or a local install).

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try {
    const body = await readFile(join(root, path === '/' ? 'index.html' : path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/html' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

const text = async sel => (await page.locator(sel).first().textContent()).replace(/\s+/g, ' ').trim();
const go = async hash => { await page.goto(base + hash); await page.waitForTimeout(120); };
const step = (name, fn) => fn().then(() => console.log('ok  ', name), e => { console.log('FAIL', name); throw e; });
const tapBall = async n => { for (let i = 0; i < n; i++) await page.tap('#tBall'); };

try {
  await step('first visit asks who we are training', async () => {
    await go('');
    assert.match(page.url(), /#\/welcome$/);
    await page.click('button[type=submit]');
    assert.match(await text('#wError'), /name/);
    await page.fill('#wName', 'Pepper');
    await page.click('[data-starter="sit"]');
    await page.click('[data-starter="down"]');
    await page.click('button[type=submit]');
    await page.waitForURL(/#\/$/);
    assert.equal(await text('.hello h1'), 'Pepper');
    assert.match(await text('.rank'), /Quick study/); // Sit, Down and card 0
  });

  await step('push, stick and drop follow the five-try sets', async () => {
    await go('#/trick/spin');
    await page.click('a[href="#/train/spin"]');
    await page.waitForSelector('#tBall');
    assert.match(await text('.t-stepnav'), /Step 1 of 5/);
    await tapBall(5);
    assert.match(await text('.verdict'), /5 for 5/);
    await page.click('[data-act="go"]');
    assert.match(await text('.t-stepnav'), /Step 2 of 5/);
    await tapBall(3);
    await page.click('[data-act="miss"]');
    await page.click('[data-act="miss"]');
    assert.match(await text('.verdict'), /3 of 5\. Stay/);
    await page.click('[data-act="miss"]');
    await page.click('[data-act="miss"]');
    await page.click('[data-act="miss"]');
    await tapBall(1);
    await page.click('[data-act="miss"]');
    assert.match(await text('.verdict'), /1 of 5\. Go back to step 1/);
    await page.click('[data-act="undo"]');
    assert.equal(await page.locator('.verdict').count(), 0, 'undo takes the verdict back');
    assert.equal(await page.locator('.dot.hit, .dot.miss').count(), 4);
  });

  await step('keyboard: space clicks', async () => {
    const before = await text('#tCount');
    await page.locator('#tBall').focus();
    await page.keyboard.press('Space');
    assert.notEqual(await text('#tCount'), before);
  });

  await step('finishing the last step puts the card in the deck', async () => {
    await page.click('[data-act="dismiss"]').catch(() => {});
    for (let s = 2; s <= 5; s++) {
      await page.click(`[data-act="next"]`).catch(() => {});
    }
    assert.match(await text('.t-stepnav'), /Step 5 of 5/);
    await tapBall(5);
    await page.click('[data-act="learned"]');
    assert.match(await text('#tSheet h2'), /Pepper knows Spin!/);
    await page.click('#tSheet [data-act="end"]');
    assert.match(await text('#tSheet h2'), /Spin is on cue/);
    await page.click('#tSheet a.btn.primary');
    await page.waitForURL(/#\/trick\/spin$/);
    assert.match(await text('.status'), /On cue/);
  });

  await step('proofing makes it solid', async () => {
    for (const id of ['place', 'distraction', 'distance']) await page.check(`#proof-${id}`);
    await page.waitForTimeout(100);
    assert.match(await text('.status'), /Solid/);
    assert.equal(await page.locator('.trick-hero .stamp.solid').count(), 1);
  });

  await step('the trick show deals from known tricks and scores first tries', async () => {
    await go('#/show');
    await page.click('#showVoice'); // no speech in the test
    await page.click('[data-act="deal"]');
    for (let i = 0; i < 3; i++) {
      await page.waitForSelector('.flip.flipped');
      await page.click('[data-r="first"]');
    }
    assert.match(await text('.show-done h1'), /3 of 3 on the first try/);
  });

  await step('free clicker saves a session', async () => {
    await go('#/clicker');
    await page.tap('#fBall');
    await page.tap('#fBall');
    assert.equal(await text('#fClicks'), '2');
    await page.click('[data-act="save"]');
    assert.match(await text('#toast'), /saved/);
  });

  await step('the dog page shows the history', async () => {
    await go('#/dog');
    const rows = await page.locator('.log tbody tr').count();
    assert.ok(rows >= 3, `${rows} sessions listed`);
    assert.ok(await page.locator('.hm-grid .hm-cell.l1, .hm-grid .hm-cell.l2, .hm-grid .hm-cell.l3, .hm-grid .hm-cell.l4').count() >= 1);
    assert.match(await text('.log tbody'), /Trick show/);
    assert.match(await text('.log tbody'), /Clicker/);
  });

  await step('weight turns on the treat allowance', async () => {
    await go('#/dog/edit');
    await page.selectOption('#dUnits', 'lb');
    await page.fill('#dWeight', '24');
    await page.click('button[type=submit]');
    await page.waitForSelector('.dog-head');
    assert.match(await text('#app'), /needs about \d+ kcal a day/);
    await go('');
    assert.match(await text('.budget'), /of \d+ kcal/);
  });

  await step('everything survives a reload', async () => {
    await page.reload();
    await page.waitForTimeout(150);
    assert.equal(await text('.hello h1'), 'Pepper');
    await go('#/deck');
    await page.click('[data-filter="known"]');
    const names = await page.locator('.grid .c-name').allInnerTexts();
    assert.deepEqual(names.map(n => n.toLowerCase()).sort(), ['charge the clicker', 'down', 'sit', 'spin']);
  });

  await step('a second dog, and switching between them', async () => {
    await go('#/dog/new');
    await page.fill('#dName', 'Mochi');
    await page.click('button[type=submit]');
    await page.waitForURL(/#\/$/);
    assert.equal(await text('.hello h1'), 'Mochi');
    await go('#/dog');
    await page.click('[data-dog]');
    await page.waitForTimeout(100);
    assert.match(await text('.dog-head h1'), /Pepper/);
  });

  await step('no page scrolls sideways on a small phone', async () => {
    await page.setViewportSize({ width: 360, height: 740 });
    for (const hash of ['', '#/deck', '#/trick/rollover', '#/train/rollover', '#/clicker', '#/show', '#/dog', '#/dog/edit', '#/settings', '#/help']) {
      await go(hash);
      const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      assert.ok(sw <= cw, `${hash || 'today'} is ${sw}px wide in a ${cw}px window`);
    }
  });

  assert.deepEqual(errors, [], 'no errors in the console');
  console.log('\nall good');
} finally {
  await browser.close();
  server.close();
}
