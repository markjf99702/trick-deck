// The trick show: deal cards from the tricks your dog knows, give the cue once,
// and note whether it worked on the first try. Doubles as a reliability check.

import { TRICKS } from './tricks.js';
import * as C from './coach.js';
import { esc, card, icon, plural } from './ui.js';

export function showPool(ctx) {
  const prog = ctx.prog();
  return TRICKS.filter(t => t.id !== 'charge' && C.isKnown(C.entry(prog, t.id)));
}

const RESULTS = {
  first: { label: 'First try', short: 'First try' },
  help: { label: 'With help', short: 'Needed help' },
  miss: { label: 'Not today', short: 'Not today' },
};

function shuffle(a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

export function showView(ctx, app) {
  const dog = ctx.dog();
  const S = ctx.S;
  let R = null; // the show in progress
  document.title = 'Trick show · Trick Deck';

  const cueFor = t => (t.id === 'name' ? dog.name : t.cue?.word || t.name);
  const say = text => {
    if (!S.settings.voice || !('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.02;
      u.pitch = 1.1;
      speechSynthesis.speak(u);
    } catch { /* no voice available */ }
  };

  function setup() {
    const pool = showPool(ctx);
    const prog = ctx.prog();
    if (pool.length < 2) {
      app.innerHTML = `
        <header class="page-head"><h1>Trick show</h1></header>
        <div class="show-empty">
          <div class="pile" aria-hidden="true"><span class="card-back"></span><span class="card-back"></span></div>
          <p>A trick show deals from the tricks ${esc(dog.name)} knows. It needs at least two on cue, and ${esc(dog.name)} has ${pool.length}.</p>
          <a class="btn primary" href="#/deck">Find a trick to learn</a>
        </div>`;
      return;
    }
    const rows = pool.map(t => ({ t, rel: C.reliability(C.entry(prog, t.id).checks) }))
      .filter(x => x.rel.total)
      .sort((a, b) => a.rel.first / a.rel.total - b.rel.first / b.rel.total);
    const sizes = [5, 10].filter(n => n < pool.length);
    const size = S.settings.round === 'all' || !sizes.includes(S.settings.round) ? 'all' : S.settings.round;

    app.innerHTML = `
      <header class="page-head">
        <h1>Trick show</h1>
        <p>Deal from the ${pool.length} tricks ${esc(dog.name)} knows. Give the cue once, then say how it went. A party trick and a reliability check in one.</p>
      </header>
      <div class="show-setup">
        <div class="pile" aria-hidden="true"><span class="card-back"></span><span class="card-back"></span><span class="card-back"><b>${pool.length}</b></span></div>
        <div class="show-opts">
          <div class="chips" role="radiogroup" aria-label="Cards per show">
            ${[...sizes, 'all'].map(n => `<button type="button" role="radio" aria-checked="${n === size}" data-size="${n}">${n === 'all' ? `All ${pool.length}` : `${n} cards`}</button>`).join('')}
          </div>
          <label class="toggle"><input type="checkbox" id="showVoice" ${S.settings.voice ? 'checked' : ''}><span>Announce each card out loud</span></label>
          <button class="btn primary big" type="button" data-act="deal">Deal</button>
        </div>
      </div>
      <section class="block">
        <h2>First try, last 10 calls</h2>
        ${rows.length ? `<ul class="rel">${rows.map(({ t, rel }) => `<li class="s-${t.suit}">
            <a href="#/trick/${t.id}"><span aria-hidden="true">${t.emoji}</span> ${esc(t.name)}</a>
            <span class="meter rel-meter" role="img" aria-label="${rel.first} of ${rel.total}"><i style="width:${Math.round(100 * rel.first / rel.total)}%"></i></span>
            <span class="rel-n">${rel.first}/${rel.total}</span></li>`).join('')}</ul>
          <p class="fine">Weakest first. Anything under 8 out of 10 could use a few short practice sessions.</p>`
        : `<p class="empty">After a show or two, this lists which tricks work on the first try and which need practice.</p>`}
      </section>`;
  }

  function deal() {
    const pool = showPool(ctx);
    const size = S.settings.round === 'all' ? pool.length : Math.min(pool.length, S.settings.round || 5);
    R = { cards: shuffle(pool).slice(0, size), i: 0, results: [], start: Date.now() };
    paintCard();
  }

  function paintCard() {
    const t = R.cards[R.i];
    app.innerHTML = `
      <div class="stage s-${t.suit}">
        <p class="deal-count">Card ${R.i + 1} of ${R.cards.length}</p>
        <div class="flip" id="flip">
          <div class="flip-in">
            <div class="face face-back"><span class="card-back big"></span></div>
            <div class="face face-front">${card(t, ctx.prog(), { href: false, big: true })}</div>
          </div>
        </div>
        <p class="call">“${esc(cueFor(t))}”</p>
        <p class="signal">${t.cue?.signal ? `Hand signal: ${esc(t.cue.signal)}` : '&nbsp;'}</p>
        <div class="answers">
          ${Object.entries(RESULTS).map(([k, v]) => `<button type="button" class="ans ans-${k}" data-r="${k}">${k === 'first' ? icon('check', 18) : ''}${esc(v.label)}</button>`).join('')}
        </div>
        <button type="button" class="linkbtn" data-act="stop">End the show</button>
      </div>`;
    const flip = document.getElementById('flip');
    requestAnimationFrame(() => requestAnimationFrame(() => flip.classList.add('flipped')));
    say(`${cueFor(t)}!`);
    app.querySelector('.ans-first').focus({ preventScroll: true });
  }

  function answer(r) {
    const t = R.cards[R.i];
    const e = ctx.entry(t.id);
    e.checks.push({ t: Date.now(), r });
    if (e.checks.length > 30) e.checks = e.checks.slice(-30);
    R.results.push({ t, r });
    R.i++;
    ctx.persist();
    if (R.i < R.cards.length) paintCard();
    else results();
  }

  function save() {
    if (!R || !R.results.length || R.saved) return;
    const first = R.results.filter(x => x.r === 'first').length;
    ctx.addSession({ trick: null, kind: 'show', start: R.start, ms: Date.now() - R.start, hits: first, misses: R.results.length - first });
    R.saved = true;
    ctx.persist();
  }

  function results() {
    save();
    const n = R.results.length;
    const first = R.results.filter(x => x.r === 'first').length;
    const weak = R.results.filter(x => x.r !== 'first').map(x => x.t);
    const verdict = !n ? 'No cards dealt.'
      : first === n ? `Every one on the first try. ${esc(dog.name)} is ready for an audience.`
      : weak.length === 1 ? `Give ${esc(weak[0].name)} a couple of short practice sessions.`
      : `Worth a little practice: ${weak.map(t => esc(t.name)).join(', ')}.`;
    say(n ? `${first} out of ${n}!` : '');
    app.innerHTML = `
      <div class="show-done">
        <p class="eyebrow">Trick show</p>
        <h1>${first} of ${n} on the first try</h1>
        <p class="lede">${verdict}</p>
        <ul class="res">${R.results.map(({ t, r }) => `<li class="s-${t.suit}">
          <a href="#/trick/${t.id}"><span aria-hidden="true">${t.emoji}</span> ${esc(t.name)}</a>
          <span class="res-tag res-${r}">${esc(RESULTS[r].short)}</span></li>`).join('')}</ul>
        <div class="actions">
          <button class="btn primary" type="button" data-act="deal">Deal again</button>
          <a class="btn" href="#/">Done</a>
        </div>
      </div>`;
    R = null;
  }

  app.onclick = ev => {
    const size = ev.target.closest('[data-size]');
    if (size) {
      S.settings.round = size.dataset.size === 'all' ? 'all' : Number(size.dataset.size);
      ctx.persist();
      app.querySelectorAll('[data-size]').forEach(b => b.setAttribute('aria-checked', b === size));
      return;
    }
    const r = ev.target.closest('[data-r]');
    if (r && R) { answer(r.dataset.r); return; }
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'deal') deal();
    if (b.dataset.act === 'stop') { if (R?.results.length) results(); else { R = null; setup(); } }
  };
  app.onchange = ev => {
    if (ev.target.id === 'showVoice') { S.settings.voice = ev.target.checked; ctx.persist(); }
  };

  setup();
  return () => {
    save();
    try { speechSynthesis.cancel(); } catch { /* ignore */ }
  };
}
