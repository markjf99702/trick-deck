// Drives the real page in Chromium, from first visit to a trick show:  node test/e2e.mjs
// Starts its own static server. Needs Playwright (npm i -g playwright, or a local install).
// The story follows one dog from start to finish. The checks after it stand alone, each in a browser of its own.
// ONLY=pattern runs just the standalone checks whose names match, and skips the story.

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
const watch = p => {
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('request', r => { if (!r.url().startsWith(base)) errors.push('left the site: ' + r.url()); });
};
watch(page);

const text = async (sel, p = page) => (await p.locator(sel).first().textContent()).replace(/\s+/g, ' ').trim();
const go = async (hash, p = page) => { await p.goto(base + hash); await p.waitForTimeout(120); };
const tapBall = async (n, p = page) => { for (let i = 0; i < n; i++) await p.tap('#tBall'); };
const run = (name, fn) => fn().then(() => console.log('ok  ', name), e => { console.log('FAIL', name); throw e; });
const only = process.env.ONLY && new RegExp(process.env.ONLY, 'i');
const step = (name, fn) => (only ? Promise.resolve() : run(name, fn));
const check = (name, fn) => (only && !only.test(name) ? Promise.resolve() : run(name, fn));

// A browser of its own, for a check that stands alone.
async function fresh(options = {}) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, locale: 'en-US', serviceWorkers: 'block', ...options });
  const p = await c.newPage();
  watch(p);
  return p;
}

// A new dog through the welcome form, already knowing the given tricks.
async function addDog(p, name, knows = []) {
  await go('', p);
  await p.fill('#wName', name);
  for (const id of knows) await p.click(`[data-starter="${id}"]`);
  await p.click('button[type=submit]');
  await p.waitForURL(knows.length ? /#\/$/ : /#\/trick\/charge$/);
}

// Straight to Spin's last step, five clicks, and Add it to the deck: the celebration sheet is up.
async function learnSpin(p) {
  await go('#/trick/spin', p);
  await p.click('[data-act="step"][data-i="4"]');
  await go('#/train/spin', p);
  for (let i = 0; i < 5; i++) await p.click('#tBall');
  await p.click('[data-act="learned"]');
  await p.waitForSelector('#tSheet .party');
}

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
      await page.waitForTimeout(600); // give the cue, watch the dog
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

  await check('a new step starts a new set of five', async () => {
    const p = await fresh();
    await addDog(p, 'Pepper', ['sit']);
    await go('#/train/spin', p);
    await tapBall(3, p);
    await p.click('[data-act="next"]');
    assert.match(await text('.t-stepnav', p), /Step 2 of 5/);
    assert.equal(await p.locator('.dot.hit, .dot.miss').count(), 0, 'tries on step 1 are not part of the set on step 2');
    assert.ok(await p.locator('#tUndo').isDisabled(), 'undo stays on this step');
    await tapBall(4, p);
    assert.equal(await p.locator('.verdict').count(), 0, 'four tries on step 2 are not a set yet');
    await tapBall(1, p);
    assert.match(await text('.verdict', p), /5 for 5/);
    await p.click('[data-act="go"]');
    assert.ok(await p.locator('#tUndo').isDisabled(), 'undo can’t reach back to step 2');
    await tapBall(1, p);
    assert.equal(await p.locator('.dot.hit').count(), 1);
    assert.match(await text('#tCount', p), /^9 clicks/, 'every try still counts toward the session');
    await p.context().close();
  });

  await check('the ball stays put when the coach weighs in on a short phone', async () => {
    for (const [width, height] of [[375, 667], [390, 664], [360, 640]]) {
      const p = await fresh({ viewport: { width, height } });
      const at = `${width}x${height}`;
      const top = () => p.evaluate(() => Math.round(document.getElementById('tBall').getBoundingClientRect().top + scrollY));
      await go('', p);
      await p.click('#trySample');
      await go('#/train/rollover', p); // Biscuit is on step 3 of 5, so both verdicts come with buttons
      const before = await top();
      await tapBall(5, p);
      assert.match(await text('.verdict', p), /Go to step 4/);
      assert.equal(await top(), before, `${at}: Push moved the ball`);
      await p.click('[data-act="dismiss"]');
      for (let i = 0; i < 5; i++) await p.click('[data-act="miss"]');
      assert.match(await text('.verdict', p), /Back to step 2/);
      assert.equal(await top(), before, `${at}: Drop moved the ball`);
      const bottom = await p.locator('#tBall').evaluate(el => el.getBoundingClientRect().bottom);
      assert.ok(bottom <= height, `${at}: the ball ends at ${Math.round(bottom)}px, off the screen`);
      await p.context().close();
    }
  });

  await check('a quick double tap only arms Delete and Erase everything', async () => {
    const p = await fresh();
    const dogs = () => p.evaluate(() => JSON.parse(localStorage.getItem('trickdeck.v1')).dogs.length);
    await go('', p);
    await p.click('#trySample');
    await go('#/dog/edit', p);
    await p.dblclick('#dDelete');
    assert.match(p.url(), /#\/dog\/edit$/, 'a double click only asks');
    assert.ok(await p.isVisible('#deleteNote'));
    await p.waitForTimeout(700);
    await p.click('#dDelete');
    await p.waitForURL(/#\/welcome$/);
    await p.click('#trySample');
    await go('#/settings', p);
    await p.evaluate(() => new Promise(done => { // two taps a quarter of a second apart
      const b = document.getElementById('wipe');
      b.click();
      setTimeout(() => { b.click(); done(); }, 250);
    }));
    assert.match(p.url(), /#\/settings$/, 'a double tap only asks');
    assert.equal(await dogs(), 1);
    await p.waitForTimeout(700);
    await p.click('#wipe');
    await p.waitForURL(/#\/welcome$/);
    assert.equal(await dogs(), 0);
    await p.context().close();
  });

  await check('every deck filter fits on a phone', async () => {
    for (const width of [360, 390]) {
      const p = await fresh({ viewport: { width, height: 800 } });
      await go('', p);
      await p.click('#trySample');
      await go('#/deck', p);
      for (const chip of await p.locator('[data-filter]').all()) {
        const b = await chip.boundingBox();
        assert.ok(b.x >= 0 && b.x + b.width <= width, `${await chip.textContent()} is at ${Math.round(b.x)}–${Math.round(b.x + b.width)} in a ${width}px window`);
      }
      await p.click('[data-filter="known"]');
      const b = await p.locator('[data-filter][aria-checked="true"]').boundingBox();
      assert.ok(b.x >= 0 && b.x + b.width <= width, 'the picked filter is in view');
      await p.context().close();
    }
  });

  await check('a custom treat needs a calorie count', async () => {
    const p = await fresh();
    await go('', p);
    await p.click('#trySample');
    await go('#/dog/edit', p);
    await p.selectOption('#dTreat', 'custom');
    for (const junk of ['', 'abc', '-5']) {
      await p.fill('#dKcal', junk);
      await p.click('button[type=submit]');
      assert.match(p.url(), /#\/dog\/edit$/, `"${junk}" isn’t saved`);
      assert.match(await text('#formError', p), /Calories per treat should be a number/);
    }
    await p.fill('#dKcal', '0'); // a toy or praise: nothing to count
    await p.click('button[type=submit]');
    await p.waitForURL(/#\/dog$/);
    assert.doesNotMatch(await text('#app', p), /Infinity/);
    await go('#/dog/edit', p);
    await p.fill('#dKcal', '4');
    await p.click('button[type=submit]');
    await p.waitForURL(/#\/dog$/);
    assert.match(await text('#app', p), /At 4 kcal a treat that’s about \d+ treats a day/);
    await p.context().close();
  });

  await check('switching lb and kg keeps the weight', async () => {
    const p = await fresh(); // en-US, so pounds
    await go('', p);
    await p.click('#trySample'); // Biscuit, 11 kg
    const needs = async () => (await text('#app', p)).match(/needs about (\d+) kcal/)[1];
    await go('#/dog', p);
    const before = await needs();
    await go('#/dog/edit', p);
    assert.equal(await p.inputValue('#dWeight'), '24.3');
    await p.selectOption('#dUnits', 'kg');
    assert.equal(await p.inputValue('#dWeight'), '11');
    await p.click('button[type=submit]');
    await p.waitForURL(/#\/dog$/);
    assert.equal(await needs(), before, 'same dog, same calories');
    await go('#/dog/edit', p);
    await p.fill('#dWeight', '30'); // typed first: the number means what the menu says next
    await p.selectOption('#dUnits', 'lb');
    assert.equal(await p.inputValue('#dWeight'), '30');
    await p.context().close();
  });

  await check('long names wrap instead of pushing the page sideways', async () => {
    const p = await fresh({ viewport: { width: 320, height: 640 } });
    const fits = async where => {
      const [sw, cw] = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      assert.ok(sw <= cw, `${where} is ${sw}px wide in a ${cw}px window`);
    };
    await go('', p);
    await fits('the welcome page at 320');
    await p.setViewportSize({ width: 360, height: 740 });
    await addDog(p, 'Wolfeschlegelsteinhausenberger', ['sit']);
    await go('#/trick/name', p);
    await p.click('[data-act="know"]'); // two on cue, so the show deals the name
    await go('#/dog/new', p);
    await p.fill('#dName', 'Princess Buttercup Fluffington');
    await p.click('button[type=submit]');
    await p.waitForURL(/#\/$/);
    for (const dog of ['Princess', 'Wolfe']) {
      if (dog === 'Wolfe') {
        await go('#/dog', p);
        await p.click('.dog-chip');
        await p.waitForTimeout(150);
      }
      for (const hash of ['', '#/trick/name', '#/show', '#/dog', '#/settings', '#/dog/edit']) {
        await go(hash, p);
        await fits(`${dog}: ${hash || 'today'}`);
      }
      await p.click('#dDelete');
      await fits(`${dog}: the delete question`);
    }
    await go('#/show', p);
    await p.click('#showVoice');
    await p.click('[data-act="deal"]');
    for (let i = 0; i < 2; i++) {
      await p.waitForSelector('.flip.flipped');
      await fits(`the show calling ${await text('.call', p)}`);
      await p.waitForTimeout(600);
      await p.click('[data-r="first"]');
    }
    await p.context().close();
  });

  await check('text on the bright fills is readable in light and dark mode', async () => {
    // WCAG contrast between an element's text color and its own background.
    const contrast = (p, sel) => p.locator(sel).first().evaluate(el => {
      const lum = css => {
        const [r, g, b] = css.match(/[\d.]+/g).slice(0, 3).map(v => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const s = getComputedStyle(el);
      const [hi, lo] = [lum(s.color), lum(s.backgroundColor)].sort((a, b) => b - a);
      return (hi + 0.05) / (lo + 0.05);
    });
    for (const colorScheme of ['dark', 'light']) {
      const p = await fresh({ colorScheme });
      const readable = async (sel, what) => {
        const ratio = await contrast(p, sel);
        assert.ok(ratio >= 4.5, `${colorScheme}: ${what} is ${ratio.toFixed(2)}:1`);
      };
      await go('', p);
      await p.click('#trySample');
      await go('#/trick/charge', p);
      await readable('.trick-hero .stamp', 'card 0’s on-cue check');
      await readable('.step.done .step-n', 'card 0’s finished steps');
      await go('#/train/rollover', p);
      await tapBall(5, p);
      await readable('.push .v-tag', 'the Push tag');
      await readable('.dot.hit', 'a hit in the set');
      await p.click('[data-act="dismiss"]');
      for (let i = 0; i < 5; i++) await p.click('[data-act="miss"]');
      await readable('.drop .v-tag', 'the Drop tag');
      await go('#/show', p);
      await p.click('#showVoice');
      await p.click('[data-act="deal"]');
      await readable('.ans-first', 'First try');
      for (const r of ['first', 'help', 'miss']) {
        await p.waitForTimeout(600); // give the cue, watch the dog
        await p.click(`[data-r="${r}"]`);
      }
      await p.click('[data-act="stop"]');
      await readable('.res-first', 'a first try in the results');
      await readable('.res-help', 'a needed-help in the results');
      await readable('.res-miss', 'a not-today in the results');
      await p.context().close();
    }
  });

  await check('a double tap in the show answers one card', async () => {
    const p = await fresh();
    await go('', p);
    await p.click('#trySample');
    await go('#/show', p);
    await p.click('#showVoice');
    await p.click('[data-act="deal"]');
    await p.waitForSelector('.flip.flipped');
    await p.waitForTimeout(800);
    await p.evaluate(() => new Promise(done => { // two taps 80 ms apart, where First try is
      document.querySelector('.ans-first').click();
      setTimeout(() => { document.querySelector('.ans-first').click(); done(); }, 80);
    }));
    assert.match(await text('.deal-count', p), /Card 2 of 5/, 'the second tap doesn’t answer a card nobody has seen');
    await p.context().close();
  });

  await check('after Keep practicing, 5 for 5 doesn’t add the card again', async () => {
    const p = await fresh();
    await addDog(p, 'Rex', ['sit']);
    await learnSpin(p);
    assert.match(await text('#tSheet h2', p), /Rex knows Spin!/);
    await p.click('#tSheet [data-act="close"]');
    await tapBall(5, p);
    assert.match(await text('.verdict', p), /5 for 5 on the cue/);
    assert.equal(await p.locator('[data-act="learned"]').count(), 0, 'Spin is already in the deck');
    await p.context().close();
  });

  await check('a sheet over the training screen keeps the keyboard', async () => {
    const p = await fresh({ viewport: { width: 1280, height: 800 }, hasTouch: false });
    await addDog(p, 'Rex', ['sit']);
    await learnSpin(p);
    const count = () => text('#tCount', p);
    const before = await count();
    await p.click('#tSheet h2'); // focus goes to the page, not a button
    await p.keyboard.press('Space');
    assert.equal(await count(), before, 'Space doesn’t click the ball behind the sheet');
    const behind = () => p.evaluate(() => !!document.activeElement?.closest('.train') && !document.activeElement.closest('#tSheet'));
    await p.focus('#tSheet .btn');
    for (const key of ['Shift+Tab', 'Shift+Tab', 'Shift+Tab', 'Tab', 'Tab', 'Tab', 'Tab']) {
      await p.keyboard.press(key);
      assert.equal(await behind(), false, `${key} reaches the screen behind the sheet`);
    }
    await p.keyboard.press('Escape');
    assert.equal(await p.getAttribute('#tSheet', 'hidden'), '', 'Escape is Keep practicing');
    assert.equal(await p.evaluate(() => document.activeElement.id), 'tBall', 'back on the ball');
    await p.keyboard.press('Space');
    assert.notEqual(await count(), before, 'the ball clicks again');
    await p.context().close();
  });

  await check('a saved step past the end of a trick still shows', async () => {
    const p = await fresh();
    // Saved by a version of Spin with more steps (or a hand-edited backup), with a show size that isn't one.
    await p.addInitScript(saved => { if (!localStorage.getItem('trickdeck.v1')) localStorage.setItem('trickdeck.v1', saved); }, JSON.stringify({
      v: 1, dog: 'd1', dogs: [{ id: 'd1', name: 'Pepper', emoji: '🐶', color: 'amber', stage: 'adult', treat: 'small' }],
      prog: { d1: { charge: { status: 'known', step: 0 }, sit: { status: 'known', step: 0 }, down: { status: 'known', step: 0 }, spin: { status: 'learning', step: 7 } } },
      sessions: [], settings: { round: 'abc' },
    }));
    await go('', p);
    assert.equal(await p.locator('.hello h1').count(), 1, 'Today shows');
    assert.match(await text('.rows', p), /Step 5 of 5/);
    await go('#/trick/spin', p);
    assert.match(await text('.status', p), /step 5 of 5/);
    await go('#/deck', p);
    assert.match(await p.getAttribute('.card[href="#/trick/spin"] .c-bar', 'title'), /Step 5 of 5/);
    await go('#/train/spin', p);
    assert.match(await text('.t-stepnav', p), /Step 5 of 5/);
    await go('#/show', p);
    await p.click('#showVoice');
    await p.click('[data-act="deal"]');
    assert.match(await text('.deal-count', p), /Card 1 of 2/);
    await p.context().close();
  });

  await check('card 0 doesn’t send you to a trick show', async () => {
    const p = await fresh();
    await go('', p);
    await p.click('#trySample');
    await go('#/trick/leave', p); // on cue, never in a show yet
    assert.match(await text('.trick', p), /Deal it in a trick show/);
    await go('#/trick/charge', p);
    assert.match(await text('.trick', p), /Make it solid/);
    assert.doesNotMatch(await text('.trick', p), /trick show/i, 'card 0 is never dealt');
    await p.context().close();
  });

  await check('it works offline once it has been opened', async () => {
    const p = await fresh({ serviceWorkers: 'allow' });
    await addDog(p, 'Pepper', ['sit', 'down']);
    await p.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 15000 });
    await p.context().setOffline(true);
    await p.reload();
    await p.waitForSelector('.hello h1');
    assert.equal(await text('.hello h1', p), 'Pepper');
    const failed = await p.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter(f => f.status === 'error').map(f => f.family); });
    assert.deepEqual(failed, [], 'the fonts come from the offline copy too');
    await p.context().setOffline(false);
    await p.context().close();
  });

  await check('printing leaves out the bar and the footer', async () => {
    const p = await fresh({ viewport: { width: 1280, height: 800 } });
    await go('', p);
    await p.click('#trySample');
    await go('#/trick/rollover', p);
    await p.emulateMedia({ media: 'print' });
    for (const sel of ['.bar', '.jd-foot', '#toast']) {
      assert.equal(await p.locator(sel).evaluate(el => getComputedStyle(el).display), 'none', `${sel} prints`);
    }
    await p.context().close();
  });

  await check('without JavaScript the message comes first', async () => {
    const p = await fresh({ javaScriptEnabled: false });
    await go('', p);
    const note = await p.locator('.noscript').boundingBox();
    const foot = await p.locator('.jd-foot').boundingBox();
    assert.ok(note.y < foot.y, `the message is at ${Math.round(note.y)}px, under the footer at ${Math.round(foot.y)}px`);
    await p.context().close();
  });

  await check('Erase everything is a button, not a bar', async () => {
    const p = await fresh();
    await go('', p);
    await p.click('#trySample');
    await go('#/settings', p);
    const { width } = await p.locator('#wipe').boundingBox();
    assert.ok(width < 250, `Erase everything is ${Math.round(width)}px wide`);
    await p.context().close();
  });

  assert.deepEqual(errors, [], 'no errors in the console, and nothing loaded from anywhere else');
  console.log('\nall good');
} finally {
  await browser.close();
  server.close();
}
