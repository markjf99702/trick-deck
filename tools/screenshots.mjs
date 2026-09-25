// Renders the README screenshots (docs/*.png) and the link preview (og.png)
// from the sample dog:  node tools/screenshots.mjs
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let body;
  try { body = await readFile(join(root, path === '/' ? 'index.html' : path)); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/html' });
  res.end(body);
}).listen(0);
const base = `http://localhost:${server.address().port}/`;
const browser = await pw.chromium.launch();

async function phone(shots) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.click('#trySample');
  await page.waitForTimeout(200);
  for (const [name, fn] of shots) {
    await fn(page);
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(root, 'docs', name) });
  }
  await ctx.close();
}

await phone([
  ['phone-today.png', p => p.goto(base + '#/')],
  ['phone-train.png', async p => {
    await p.goto(base + '#/train/rollover');
    for (let i = 0; i < 5; i++) await p.tap('#tBall');
  }],
  ['phone-show.png', async p => {
    await p.goto(base + '#/show');
    await p.click('#showVoice');
    await p.click('[data-act="deal"]');
  }],
  ['phone-trick.png', p => p.goto(base + '#/trick/rollover')],
]);

// The deck on a laptop.
{
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 1.5 });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.click('#trySample');
  await page.goto(base + '#/deck');
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(root, 'docs', 'deck.png') });
  await ctx.close();
}

// The link preview: a hand of cards and the name.
{
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 } });
  const page = await ctx.newPage();
  await page.goto(base + 'index.html#/help');
  const css = await readFile(join(root, 'css/app.css'), 'utf8');
  const { card } = await import(join(root, 'js/ui.js'));
  const { BY_ID } = await import(join(root, 'js/tricks.js'));
  const prog = { spin: { status: 'known' }, sit: { status: 'solid' }, down: { status: 'known' }, drop: { status: 'known' }, shake: { status: 'known' }, rollover: { status: 'learning', step: 2 } };
  const hand = ['sit', 'shake', 'spin', 'rollover', 'fetch'].map(id => card(BY_ID[id], prog, { href: false })).join('');
  await page.setContent(`<!doctype html><html><head><base href="${base}css/"><style>${css}
    body { margin: 0; width: 1200px; height: 630px; display: grid; grid-template-columns: 1fr 1fr; align-items: center; padding: 0 70px; gap: 30px; background: var(--ground); }
    .og-hand { position: relative; height: 420px; }
    .og-hand .card { position: absolute; width: 180px; top: 40px; left: 50%; margin-left: -90px; transform-origin: 50% 230%; }
    .og-hand .card:nth-child(1) { transform: rotate(-26deg); }
    .og-hand .card:nth-child(2) { transform: rotate(-13deg); }
    .og-hand .card:nth-child(3) { transform: rotate(0deg); }
    .og-hand .card:nth-child(4) { transform: rotate(13deg); }
    .og-hand .card:nth-child(5) { transform: rotate(26deg); }
    .og-text h1 { font-size: 88px; line-height: 1; }
    .og-text p { font-size: 30px; line-height: 1.3; margin-top: 22px; color: var(--ink-2); }
    .og-text img { width: 84px; height: 84px; margin-bottom: 24px; }
  </style></head><body>
    <div class="og-text"><img src="${base}icon.svg" alt=""><h1>Trick Deck</h1><p>Teach your dog tricks, five tries at a time.</p></div>
    <div class="og-hand">${hand}</div>
  </body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(root, 'og.png') });
  await ctx.close();
}

await browser.close();
server.close();
console.log('screenshots written');
