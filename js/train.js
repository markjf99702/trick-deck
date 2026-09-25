// The training screen (one trick, step by step, in sets of five) and the free clicker.

import { BY_ID } from './tricks.js';
import * as C from './coach.js';
import { press, release, buzz, unlock, SOUNDS } from './clicker.js';
import { esc, icon, card, toast, plural } from './ui.js';

const NUDGES = [
  [180e3, 'Three minutes. A good time to finish on something easy.'],
  [300e3, 'Five minutes. Short sessions stick better. End on a win and come back later.'],
];

// The tennis ball button. Sound on press, and on release for the box clicker.
// Space or Enter works too, unless another button has focus.
function bindBall(btn, ctx, onClick) {
  let down = false;
  const st = () => ctx.S.settings;
  const start = () => {
    if (down) return;
    down = true;
    unlock();
    press(st().sound, st().volume);
    buzz(st().vibrate);
    btn.classList.add('down');
    onClick();
  };
  const end = () => {
    if (!down) return;
    down = false;
    release(st().sound, st().volume);
    btn.classList.remove('down');
  };
  btn.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    e.preventDefault();
    try { btn.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    start();
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => btn.addEventListener(t, end));
  btn.addEventListener('contextmenu', e => e.preventDefault());
  const isKey = e => e.code === 'Space' || e.code === 'Enter' || e.key === ' ';
  const kd = e => {
    if (!isKey(e) || e.repeat) return;
    const el = e.target;
    if (el !== btn && el.closest && el.closest('button, a, input, select, textarea, summary, label')) return;
    e.preventDefault();
    start();
  };
  const ku = e => { if (isKey(e)) end(); };
  document.addEventListener('keydown', kd);
  document.addEventListener('keyup', ku);
  return () => { document.removeEventListener('keydown', kd); document.removeEventListener('keyup', ku); };
}

// Keep the screen on while training, where the browser allows it.
function keepAwake() {
  let lock = null;
  let done = false;
  const ask = async () => { try { lock = await navigator.wakeLock?.request('screen'); } catch { /* not allowed */ } };
  const vis = () => { if (!done && document.visibilityState === 'visible') ask(); };
  ask();
  document.addEventListener('visibilitychange', vis);
  return () => { done = true; document.removeEventListener('visibilitychange', vis); lock?.release?.().catch(() => {}); };
}

const ball = (id, extra = '') =>
  `<button class="ball ${extra}" id="${id}" type="button" aria-label="Click: counts a correct try and a treat"><span>Click</span></button>`;

export function trainView(ctx, app, id) {
  const t = BY_ID[id];
  if (!t) { location.replace('#/deck'); return null; }
  const dog = ctx.dog();
  const e = ctx.entry(t.id);
  const practice = C.isKnown(e);
  if (e.status === 'new') e.step = 0;
  const T = {
    step: practice ? t.steps.length - 1 : Math.min(e.step, t.steps.length - 1),
    from: 0, set: [], last: null, verdict: null, hits: 0, misses: 0,
    sets: 0, begun: 0, ended: false, nudged: 0, history: [], celebrated: false,
  };
  T.from = T.step;
  document.title = `Training ${t.name} · Trick Deck`;

  app.innerHTML = `
    <div class="train s-${t.suit}">
      <div class="t-bar">
        <button class="t-end" data-act="end">End</button>
        <a class="t-name" href="#/trick/${t.id}"><span aria-hidden="true">${t.emoji}</span> ${esc(t.name)}</a>
        <span class="t-clock" id="tClock" aria-label="Session time">0:00</span>
      </div>
      <section class="t-step" id="tStep" aria-live="polite"></section>
      <p class="t-nudge" id="tNudge" role="status" hidden></p>
      <section class="t-set">
        <div class="t-dots" id="tDots" aria-hidden="true"></div>
        <div class="t-verdict" id="tVerdict" aria-live="polite"></div>
      </section>
      <div class="t-pad">
        <button class="t-side t-miss" type="button" data-act="miss">${icon('x', 22)}<span>No click</span></button>
        ${ball('tBall')}
        <button class="t-side" type="button" data-act="undo" id="tUndo" disabled>${icon('undo', 22)}<span>Undo</span></button>
      </div>
      <p class="t-count" id="tCount"></p>
      <p class="t-keys">Space to click · M for no click · Z to undo</p>
      <div class="sheet" id="tSheet" hidden></div>
    </div>`;

  const $ = s => app.querySelector(s);

  function paintStep() {
    const s = t.steps[T.step];
    $('#tStep').innerHTML = `
      <div class="t-stepnav">
        <button type="button" data-act="prev" aria-label="Previous step" ${T.step === 0 ? 'disabled' : ''}>${icon('back', 18)}</button>
        <span>${practice ? 'Practice · ' : ''}Step ${T.step + 1} of ${t.steps.length}</span>
        <button type="button" data-act="next" aria-label="Next step" ${T.step === t.steps.length - 1 ? 'disabled' : ''}>${icon('next', 18)}</button>
      </div>
      <h2>${esc(s.do)}</h2>
      <p class="t-when">${esc(s.click)}</p>
      <p class="t-tip">${esc(s.tip)}</p>`;
  }

  function paintSet() {
    const shown = T.verdict ? T.last : T.set;
    $('#tDots').innerHTML = Array.from({ length: C.SET_SIZE }, (_, i) => {
      const r = shown[i];
      const cls = r === true ? 'hit' : r === false ? 'miss' : (!T.verdict && i === shown.length ? 'next' : '');
      return `<span class="dot ${cls}">${r === true ? icon('check', 14) : r === false ? icon('x', 12) : ''}</span>`;
    }).join('');
    $('#tVerdict').innerHTML = T.verdict ? verdictHTML() : `<p class="t-hint">${T.set.length ? `${T.set.length} of 5 in this set` : T.sets ? 'Next set: five more tries' : 'Five tries, then the coach weighs in'}</p>`;
    const reps = T.hits + T.misses;
    $('#tCount').textContent = reps
      ? `${plural(T.hits, 'click')} (${plural(T.hits, 'treat')}) · ${plural(T.misses, 'miss', 'misses')} · ${Math.round(100 * T.hits / reps)}%`
      : 'Tap the ball the moment you see it.';
    $('#tUndo').disabled = !T.history.length;
  }

  function verdictHTML() {
    const v = T.verdict;
    const s = t.steps;
    if (v.verdict === 'push' && v.done) {
      if (practice) return `<div class="verdict push"><span class="v-tag">Push</span><p>5 for 5 on the cue. Nice and sharp.</p></div>`;
      return `<div class="verdict push"><span class="v-tag">Push</span><p>5 for 5 on the last step. ${esc(dog.name)} has ${esc(t.name)} on cue.</p>
        <div class="v-actions"><button class="btn primary sm" data-act="learned">Add it to the deck</button><button class="btn sm" data-act="dismiss">Keep practicing</button></div></div>`;
    }
    if (v.verdict === 'push') {
      return `<div class="verdict push"><span class="v-tag">Push</span><p>5 for 5. Make it a little harder: step ${v.to + 1}, ${esc(s[v.to].do.toLowerCase())}.</p>
        <div class="v-actions"><button class="btn primary sm" data-act="go" data-to="${v.to}">Go to step ${v.to + 1}</button><button class="btn sm" data-act="dismiss">Stay here</button></div></div>`;
    }
    if (v.verdict === 'stick') {
      return `<div class="verdict stick"><span class="v-tag">Stick</span><p>${v.hits} of 5. Stay on this step for another set.</p></div>`;
    }
    if (v.easier) {
      return `<div class="verdict drop"><span class="v-tag">Drop</span><p>${v.hits} of 5. Make it easier: get closer, use a better treat, or click a smaller try.</p></div>`;
    }
    return `<div class="verdict drop"><span class="v-tag">Drop</span><p>${v.hits} of 5. Go back to step ${v.to + 1}, ${esc(s[v.to].do.toLowerCase())}, and rebuild.</p>
      <div class="v-actions"><button class="btn primary sm" data-act="go" data-to="${v.to}">Back to step ${v.to + 1}</button><button class="btn sm" data-act="dismiss">Stay and make it easier</button></div></div>`;
  }

  function rep(hit) {
    if (!T.begun) T.begun = Date.now();
    T.history.push({ hit, set: [...T.set], sets: T.sets, last: T.last, verdict: T.verdict });
    T.verdict = null;
    T.set.push(hit);
    hit ? T.hits++ : T.misses++;
    if (T.set.length === C.SET_SIZE) {
      const j = C.judgeSet(T.set);
      T.verdict = { ...j, ...C.advise(t, T.step, j.verdict) };
      T.last = T.set;
      T.set = [];
      T.sets++;
      if (e.status === 'new') e.status = 'learning';
      ctx.persist();
    }
    paintSet();
  }

  function undo() {
    const h = T.history.pop();
    if (!h) return;
    if (h.hit) T.hits--; else T.misses--;
    T.set = h.set; T.sets = h.sets; T.last = h.last; T.verdict = h.verdict;
    paintSet();
  }

  function goStep(to) {
    T.step = Math.max(0, Math.min(t.steps.length - 1, to));
    if (!practice) { e.step = T.step; if (e.status === 'new') e.status = 'learning'; ctx.persist(); }
    T.verdict = null;
    paintStep();
    paintSet();
  }

  // Timer and nudges.
  const clock = $('#tClock');
  const timer = setInterval(() => {
    if (!T.begun) return;
    const ms = Date.now() - T.begun;
    clock.textContent = C.clock(ms);
    const n = NUDGES.findIndex(([at], i) => ms >= at && T.nudged <= i);
    if (n >= 0) {
      T.nudged = n + 1;
      const el = $('#tNudge');
      el.textContent = NUDGES[n][1];
      el.hidden = false;
      clock.classList.add('long');
    }
  }, 500);

  function finish() {
    if (T.ended) return null;
    T.ended = true;
    clearInterval(timer);
    const reps = T.hits + T.misses;
    if (!reps) return null;
    const ms = Date.now() - T.begun;
    ctx.addSession({ trick: t.id, kind: 'train', start: T.begun, ms, hits: T.hits, misses: T.misses, from: T.from, to: T.step });
    e.reps = (e.reps || 0) + reps;
    e.hits = (e.hits || 0) + T.hits;
    e.ms = (e.ms || 0) + ms;
    e.sessions = (e.sessions || 0) + 1;
    e.last = Date.now();
    if (e.status === 'new') e.status = 'learning';
    if (!practice && e.status === 'learning') e.step = T.step;
    ctx.persist();
    return { ms, reps };
  }

  function summary() {
    const done = finish();
    if (!done) { location.hash = `#/trick/${t.id}`; return; }
    const treats = ctx.treatsToday();
    const r = C.treatReport(dog, treats);
    const moved = T.step !== T.from && !practice;
    const kcalLine = r.kibble ? `${plural(T.hits, 'piece')} of kibble. Take them out of the next meal.`
      : r.budget ? `${plural(treats, 'treat')} today, about ${Math.round(r.kcal)} of ${esc(dog.name)}’s ${Math.round(r.budget)} kcal treat allowance.${r.over ? ' That’s over, so go easy at dinner.' : ''}`
      : `${plural(T.hits, 'treat')} this session.`;
    sheet(`
      <h2>${C.isKnown(e) && !practice ? `${esc(t.name)} is on cue` : 'Session saved'}</h2>
      <dl class="tiles small">
        <div><dt>Time</dt><dd>${C.clock(done.ms)}</dd></div>
        <div><dt>Clicks</dt><dd>${T.hits}</dd></div>
        <div><dt>Hit rate</dt><dd>${Math.round(100 * T.hits / done.reps)}%</dd></div>
      </dl>
      ${moved ? `<p>Moved from step ${T.from + 1} to step ${T.step + 1}: ${esc(t.steps[T.step].do)}.</p>` : ''}
      <p class="fine">${kcalLine}</p>
      <div class="actions">
        <a class="btn primary" href="#/trick/${t.id}">Done</a>
        <a class="btn" href="#/">Today</a>
      </div>`);
  }

  function celebrate() {
    e.status = 'known';
    e.since = Date.now();
    e.step = 0;
    ctx.persist();
    T.celebrated = true;
    const count = C.knownCount(ctx.prog());
    const rank = C.titleFor(count);
    const newTitle = rank.at === count;
    sheet(`
      <div class="won">${card(t, ctx.prog(), { href: false, big: true })}</div>
      <h2>${esc(dog.name)} knows ${esc(t.name)}!</h2>
      <p>Card ${t.n} goes in the deck. That makes ${count} on cue${newTitle ? `, and a new title: <b>${esc(rank.name)}</b>` : ''}.</p>
      <p class="fine">Next, try it in a new room, with a distraction or from a few steps away. That’s what makes it solid.</p>
      <div class="actions">
        <button class="btn primary" data-act="end">Finish session</button>
        <button class="btn" data-act="close">Keep practicing</button>
      </div>`, true);
  }

  function sheet(html, party = false) {
    const el = $('#tSheet');
    el.innerHTML = `<div class="sheet-card${party ? ' party' : ''}" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">${html}</div>`;
    el.querySelector('h2').id = 'sheetTitle';
    el.hidden = false;
    el.querySelector('.btn')?.focus();
  }

  app.onclick = ev => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'miss') { unlock(); rep(false); }
    else if (act === 'undo') undo();
    else if (act === 'prev') goStep(T.step - 1);
    else if (act === 'next') goStep(T.step + 1);
    else if (act === 'go') goStep(Number(b.dataset.to));
    else if (act === 'dismiss') { T.verdict = null; paintSet(); }
    else if (act === 'learned') celebrate();
    else if (act === 'close') { $('#tSheet').hidden = true; T.verdict = null; paintSet(); }
    else if (act === 'end') summary();
  };

  const unbind = bindBall($('#tBall'), ctx, () => rep(true));
  const keys = ev => {
    if (ev.target.closest?.('input, select, textarea') || !$('#tSheet').hidden) return;
    if (ev.key === 'm' || ev.key === 'M') rep(false);
    else if (ev.key === 'z' || ev.key === 'Z' || ev.key === 'Backspace') undo();
  };
  document.addEventListener('keydown', keys);
  const sleep = keepAwake();

  paintStep();
  paintSet();

  return () => {
    finish(); // leaving any other way still saves the session
    clearInterval(timer);
    unbind();
    sleep();
    document.removeEventListener('keydown', keys);
  };
}

// A clicker with no plan, for capturing things as they happen.
export function clickerView(ctx, app) {
  const dog = ctx.dog();
  const F = { hits: 0, begun: 0, timer: 0 };
  const per = C.treatKcal(dog);
  document.title = 'Clicker · Trick Deck';

  app.innerHTML = `
    <header class="page-head">
      <h1>Clicker</h1>
      <p>For catching good things as they happen: a calm lie-down, a quiet moment at the window, a stretch you’d like to name. Every click is a treat.</p>
    </header>
    <div class="free">
      <dl class="free-stats">
        <div><dt>Clicks</dt><dd id="fClicks">0</dd></div>
        <div><dt>Time</dt><dd id="fTime">0:00</dd></div>
        <div><dt>Treats</dt><dd id="fKcal">${dog.treat === 'kibble' ? '0 kcal' : '0 kcal'}</dd></div>
      </dl>
      ${ball('fBall', 'huge')}
      <div class="actions center">
        <button class="btn" type="button" data-act="undo">${icon('undo', 16)}Undo</button>
        <button class="btn primary" type="button" data-act="save">Save session</button>
      </div>
      <div class="sound-chips" role="radiogroup" aria-label="Sound">
        ${SOUNDS.map(s => `<button type="button" role="radio" aria-checked="${ctx.S.settings.sound === s.id}" data-sound="${s.id}">${esc(s.name)}</button>`).join('')}
      </div>
    </div>`;

  const $ = s => app.querySelector(s);
  const paint = () => {
    $('#fClicks').textContent = F.hits;
    $('#fKcal').textContent = `${Math.round(F.hits * per)} kcal`;
  };
  const tick = () => { if (F.begun) $('#fTime').textContent = C.clock(Date.now() - F.begun); };
  F.timer = setInterval(tick, 500);

  const saveIt = () => {
    if (!F.hits) return false;
    ctx.addSession({ trick: null, kind: 'free', start: F.begun, ms: Date.now() - F.begun, hits: F.hits, misses: 0 });
    ctx.persist();
    F.hits = 0; F.begun = 0;
    return true;
  };

  app.onclick = ev => {
    const snd = ev.target.closest('[data-sound]');
    if (snd) {
      ctx.S.settings.sound = snd.dataset.sound;
      ctx.persist();
      app.querySelectorAll('[data-sound]').forEach(b => b.setAttribute('aria-checked', b === snd));
      return;
    }
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'undo' && F.hits) { F.hits--; paint(); }
    if (b.dataset.act === 'save') {
      if (saveIt()) { toast('Clicker session saved.'); paint(); $('#fTime').textContent = '0:00'; }
      else toast('Nothing to save yet. Tap the ball to click.');
    }
  };

  const unbind = bindBall($('#fBall'), ctx, () => {
    if (!F.begun) F.begun = Date.now();
    F.hits++;
    paint();
  });
  const sleep = keepAwake();

  return () => {
    saveIt();
    clearInterval(F.timer);
    unbind();
    sleep();
  };
}
