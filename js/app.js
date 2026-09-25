import { TRICKS, BY_ID, SUITS, LEVELS, METHODS, suitOf } from './tricks.js';
import * as C from './coach.js';
import { load, save, backup, restore, newId, defaults } from './store.js';
import { sampleDog } from './sample.js';
import { SOUNDS, press, release, unlock } from './clicker.js';
import { esc, card, avatar, glyph, icon, rosette, toast, when, plural, DOG_COLORS, DOG_EMOJI } from './ui.js';
import { trainView, clickerView } from './train.js';
import { showView, showPool } from './show.js';

const app = document.getElementById('app');
const S = load();
let warned = false;

// Shared with the training and show screens.
export const ctx = {
  S,
  dog: () => S.dogs.find(d => d.id === S.dog) || null,
  prog: () => (S.prog[S.dog] ||= {}),
  entry(id) {
    const prog = ctx.prog();
    const e = (prog[id] ||= { status: 'new', step: 0 });
    e.proof ||= {};
    e.checks ||= [];
    return e;
  },
  sessions: () => S.sessions.filter(s => s.dog === S.dog),
  addSession(s) { S.sessions.push({ id: newId(), dog: S.dog, ...s }); },
  treatsToday() {
    const key = C.dayKey(Date.now());
    return ctx.sessions().filter(s => s.kind !== 'show' && C.dayKey(s.start) === key).reduce((n, s) => n + (s.hits || 0), 0);
  },
  persist() {
    if (!save(S) && !warned) {
      warned = true;
      toast('This browser isn’t letting Trick Deck save. Progress will be lost when you close the page.');
    }
  },
};

// Routing -------------------------------------------------------------------

let cleanup = null;
const ROUTES = [
  [/^$/, home, 'home'],
  [/^deck$/, deck, 'deck'],
  [/^trick\/([\w-]+)$/, trickPage, 'deck'],
  [/^train\/([\w-]+)$/, id => trainView(ctx, app, id), 'train'],
  [/^clicker$/, () => clickerView(ctx, app), 'clicker'],
  [/^show$/, () => showView(ctx, app), 'show'],
  [/^dog$/, dogPage, 'dog'],
  [/^dog\/(edit|new)$/, dogEdit, 'dog'],
  [/^settings$/, settings, 'dog'],
  [/^help$/, help, 'help'],
  [/^welcome$/, welcome, 'welcome'],
];
const OPEN = new Set(['help', 'welcome']); // pages that work before there's a dog

function route() {
  if (cleanup) { try { cleanup(); } catch (err) { console.error(err); } cleanup = null; }
  app.onclick = app.onchange = app.oninput = app.onsubmit = null;
  const path = location.hash.replace(/^#\/?/, '');
  let match = null;
  for (const [re, view, tab] of ROUTES) {
    const m = path.match(re);
    if (m) { match = { view, tab, args: m.slice(1) }; break; }
  }
  if (!match) { location.replace('#/'); return; }
  if (!ctx.dog() && !OPEN.has(match.tab)) { location.replace('#/welcome'); return; }
  document.body.dataset.view = match.tab;
  document.body.classList.toggle('no-dog', !ctx.dog());
  paintTabs(match.tab);
  cleanup = match.view(...match.args) || null;
  window.scrollTo(0, 0);
  app.focus({ preventScroll: true });
}

function paintTabs(tab) {
  const dog = ctx.dog();
  const dogTab = document.getElementById('dogTab');
  if (dog) dogTab.innerHTML = `${avatar(dog, 'av-sm')}<span>${esc(dog.name)}</span>`;
  document.querySelectorAll('.tabs a').forEach(a => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function title(t) { document.title = t ? `${t} · Trick Deck` : 'Trick Deck'; }

// Today ---------------------------------------------------------------------

function home() {
  const dog = ctx.dog();
  const prog = ctx.prog();
  const count = C.knownCount(prog);
  const rank = C.titleFor(count);
  const sessions = ctx.sessions();
  const streak = C.streak(sessions);
  const week = sessions.filter(s => s.start > Date.now() - 7 * 864e5);
  const going = C.inProgress(prog).slice(0, 4);
  const next = C.suggestions(prog, 3);
  const treats = ctx.treatsToday();
  const pool = showPool(ctx);
  title('');

  const span = rank.next ? rank.next.at - rank.at : 1;
  const into = rank.next ? count - rank.at : 1;

  app.innerHTML = `
    ${dog.sample ? sampleBanner(dog) : ''}
    <section class="hello">
      ${avatar(dog, 'av-lg')}
      <div class="hello-text">
        <p class="eyebrow">${esc(new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))}</p>
        <h1>${esc(dog.name)}</h1>
        <p class="rank">${rosette(26)}<strong>${esc(rank.name)}</strong></p>
        ${rank.next ? `<div class="meter" role="img" aria-label="${into} of ${span} toward ${esc(rank.next.name)}"><i style="width:${Math.round(100 * into / span)}%"></i></div>` : ''}
        <p class="fine">${count} of ${TRICKS.length} tricks on cue${rank.next ? ` · ${rank.next.at - count} more to ${esc(rank.next.name)}` : ''}</p>
      </div>
    </section>

    <dl class="facts">
      <div><dt>Streak</dt><dd>${plural(streak, 'day')}</dd></div>
      <div><dt>This week</dt><dd>${plural(week.length, 'session')}</dd></div>
      <div><dt>Treats</dt><dd>${treats}</dd></div>
    </dl>

    <section class="block">
      <div class="block-head"><h2>Keep going</h2></div>
      ${going.length ? `<ul class="rows">${going.map(t => progressRow(t, prog)).join('')}</ul>`
        : `<p class="empty">Nothing half-learned right now. Pick a card below to start one.</p>`}
    </section>

    <section class="block">
      <div class="block-head"><h2>Learn next</h2><a href="#/deck" class="more">Whole deck ${icon('next', 16)}</a></div>
      ${next.length ? `<div class="hand">${next.map(t => card(t, prog)).join('')}</div>`
        : `<p class="empty">Every card is started or learned. Keep practicing, or proof the ones on cue in new places.</p>`}
    </section>

    <section class="block">
      <div class="block-head"><h2>Treats today</h2></div>
      ${treatLine(dog, treats)}
    </section>

    <section class="quick">
      <a class="quick-btn" href="#/clicker">${icon('clicker', 26)}<span><b>Clicker</b><small>Catch good behavior as it happens</small></span></a>
      <a class="quick-btn" href="#/show">${icon('show', 26)}<span><b>Trick show</b><small>${pool.length >= 2 ? `Deal from the ${pool.length} tricks ${esc(dog.name)} knows` : 'Unlocks at 2 tricks on cue'}</small></span></a>
    </section>
  `;
  bindSample();
}

function progressRow(t, prog) {
  const e = C.entry(prog, t.id);
  const step = t.steps[e.step];
  return `<li class="row s-${t.suit}">
    <a class="row-main" href="#/trick/${t.id}">
      <span class="mini" aria-hidden="true">${t.emoji}</span>
      <span class="row-text"><b>${esc(t.name)}</b><small>Step ${e.step + 1} of ${t.steps.length}: ${esc(step.do)}</small></span>
    </a>
    <a class="btn sm" href="#/train/${t.id}">Train</a>
  </li>`;
}

function treatLine(dog, treats) {
  const r = C.treatReport(dog, treats);
  if (r.kibble) {
    return `<p class="treats">${plural(treats, 'piece')} of kibble so far. Take the same amount out of ${esc(dog.name)}’s next meal and there’s nothing extra to count.</p>`;
  }
  if (!r.budget) {
    return `<p class="treats">${plural(treats, 'treat')} so far. <a href="#/dog/edit">Add ${esc(dog.name)}’s weight</a> to see how that fits their daily treat allowance.</p>`;
  }
  const pct = Math.round(100 * r.ratio);
  const state = r.ratio > 1 ? 'over' : r.ratio > 0.8 ? 'near' : 'ok';
  const note = r.ratio > 1
    ? `That’s over the 10% treat allowance. Use smaller treats, or take about ${Math.round(r.kcal - r.budget)} kcal off dinner.`
    : r.ratio > 0.8 ? 'Close to the 10% treat allowance. Switch to kibble for the rest of the day.'
    : 'Well inside the 10% treat allowance.';
  return `<div class="budget budget-${state}">
    <div class="budget-nums"><span><b>${Math.round(r.kcal)}</b> of ${Math.round(r.budget)} kcal</span><span>${plural(treats, 'treat')} × ${r.per} kcal</span></div>
    <div class="meter" role="img" aria-label="${pct}% of the daily treat allowance"><i style="width:${Math.min(100, pct)}%"></i></div>
    <p class="fine">${note}</p>
  </div>`;
}

function sampleBanner(dog) {
  return `<aside class="sample" role="note">
    <p><b>${esc(dog.name)} is a sample dog</b> with six weeks of made-up training, so you can see how everything fits together.</p>
    <div class="sample-actions"><a class="btn sm primary" href="#/dog/new">Add your dog</a><button class="btn sm" data-sample="remove">Remove ${esc(dog.name)}</button></div>
  </aside>`;
}

function bindSample() {
  app.onclick = e => {
    const b = e.target.closest('[data-sample="remove"]');
    if (!b) return;
    removeDog(S.dog);
    toast('Sample dog removed.');
    location.hash = '#/';
    route();
  };
}

// Deck ----------------------------------------------------------------------

const FILTERS = [
  { id: 'all', name: 'All', test: () => true },
  { id: 'next', name: 'Ready to learn', test: (t, e, prog) => e.status === 'new' && C.isReady(t, prog) },
  { id: 'learning', name: 'Learning', test: (t, e) => e.status === 'learning' },
  { id: 'known', name: 'On cue', test: (t, e) => C.isKnown(e) },
];
let deckFilter = 'all';

function deck() {
  const prog = ctx.prog();
  const dog = ctx.dog();
  const f = FILTERS.find(x => x.id === deckFilter) || FILTERS[0];
  const keep = t => f.test(t, C.entry(prog, t.id), prog);
  const count = C.knownCount(prog);
  title('Deck');

  const groups = [{ id: 'start', name: 'Start here', blurb: 'Card 0. Teach your dog what the click means.' }, ...SUITS];
  const body = groups.map(g => {
    const all = TRICKS.filter(t => t.suit === g.id);
    const shown = all.filter(keep);
    if (!shown.length) return '';
    const got = all.filter(t => C.isKnown(C.entry(prog, t.id))).length;
    return `<section class="suit s-${g.id}">
      <div class="suit-head">
        <h2>${glyph(g.id, 20)}${esc(g.name)}</h2>
        ${g.id === 'start' ? '' : `<span class="suit-count">${got} of ${all.length}</span>`}
      </div>
      <p class="suit-blurb">${esc(g.blurb)}</p>
      <div class="grid">${shown.map(t => card(t, prog)).join('')}</div>
    </section>`;
  }).join('');

  app.innerHTML = `
    <header class="page-head">
      <h1>The deck</h1>
      <p>Card 0 and four suits of 12. ${esc(dog.name)} has ${count} on cue. Faded cards build on a trick ${esc(dog.name)} doesn’t know yet, but you can start any of them.</p>
    </header>
    <div class="chips" role="radiogroup" aria-label="Show">
      ${FILTERS.map(x => `<button role="radio" aria-checked="${x.id === f.id}" data-filter="${x.id}">${esc(x.name)}<span>${TRICKS.filter(t => x.test(t, C.entry(prog, t.id), prog)).length}</span></button>`).join('')}
    </div>
    ${body || `<p class="empty">No cards here yet.</p>`}
  `;
  app.onclick = e => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    deckFilter = b.dataset.filter;
    deck();
  };
}

// One trick -------------------------------------------------------------------

function trickPage(id) {
  const t = BY_ID[id];
  if (!t) { location.replace('#/deck'); return; }
  const dog = ctx.dog();
  const prog = ctx.prog();
  const e = C.entry(prog, t.id);
  const suit = suitOf(t);
  const missing = C.missingNeeds(t, prog);
  const learning = e.status === 'new' || e.status === 'learning';
  title(t.name);

  const status = {
    new: `<p class="status">Not started.${missing.length ? ` Easier once ${esc(dog.name)} knows ${missing.map(n => esc(BY_ID[n].name)).join(' and ')}.` : ''}</p>
      <div class="actions"><a class="btn primary" href="#/train/${t.id}">${icon('play', 16)}Start step 1</a><button class="btn" data-act="know">Already knows it</button></div>`,
    learning: `<p class="status">Learning: step ${e.step + 1} of ${t.steps.length}.</p>
      <div class="actions"><a class="btn primary" href="#/train/${t.id}">${icon('play', 16)}Train step ${e.step + 1}</a><button class="btn" data-act="know">Already knows it</button></div>`,
    known: `<p class="status">On cue${e.since ? ` since ${esc(when(e.since))}` : ''}. Proof it below to make it solid.</p>
      <div class="actions"><a class="btn primary" href="#/train/${t.id}">${icon('play', 16)}Practice</a><button class="btn" data-act="relearn">Back to learning</button></div>`,
    solid: `<p class="status">Solid. It works anywhere.</p>
      <div class="actions"><a class="btn primary" href="#/train/${t.id}">${icon('play', 16)}Practice</a><button class="btn" data-act="relearn">Back to learning</button></div>`,
  }[e.status];

  const steps = t.steps.map((s, i) => {
    const state = C.isKnown(e) || i < e.step ? 'done' : (e.status === 'learning' && i === e.step) ? 'now' : 'todo';
    return `<li class="step ${state}">
      <span class="step-n" aria-hidden="true">${state === 'done' ? icon('check', 16) : i + 1}</span>
      <div class="step-body">
        <h3>${esc(s.do)}${state === 'now' ? ' <span class="here">You’re here</span>' : ''}</h3>
        <p class="clickwhen">${icon('clicker', 16)}<span>${esc(s.click)}</span></p>
        <p class="tip">${esc(s.tip)}</p>
        ${learning && state !== 'now' ? `<button class="linkbtn" data-act="step" data-i="${i}">Work on this step</button>` : ''}
      </div>
    </li>`;
  }).join('');

  const rel = C.reliability(e.checks);
  const proof = C.isKnown(e) ? `
    <section class="block">
      <h2>Make it solid</h2>
      <p class="fine">A trick your dog does in the kitchen might fall apart at the park. Tick these off as they happen.</p>
      <ul class="proof">
        ${C.proofItems(t).map(p => `<li><label><input type="checkbox" id="proof-${p.id}" data-proof="${p.id}" ${e.proof?.[p.id] ? 'checked' : ''}>
          <span><b>${esc(p.label)}</b><small>${esc(p.about)}</small></span></label></li>`).join('')}
      </ul>
      <p class="fine">${rel.total ? `In trick shows: first try ${rel.first} of the last ${rel.total} times.` : `Deal it in a <a href="#/show">trick show</a> to see how often it works on the first try.`}</p>
    </section>` : '';

  app.innerHTML = `
    <a class="back" href="#/deck">${icon('back', 18)}Deck</a>
    <article class="trick s-${t.suit}">
      <div class="trick-hero">
        ${card(t, prog, { href: false, big: true })}
        <div class="trick-intro">
          <p class="eyebrow">${glyph(t.suit, 14)} ${esc(suit.name)} · Card ${t.n} · ${esc(LEVELS[t.level])}</p>
          <h1>${esc(t.name)}</h1>
          <p class="lede">${esc(t.blurb)}</p>
          ${t.why ? `<p class="why">${esc(t.why)}</p>` : ''}
          <p class="method"><span class="tag">${esc(METHODS[t.method].name)}</span>${esc(METHODS[t.method].about)}</p>
          ${t.needs.length ? `<p class="needs">Builds on ${t.needs.map(n => {
            const k = C.isKnown(C.entry(prog, n));
            return `<a class="need ${k ? 'got' : ''}" href="#/trick/${n}">${k ? icon('check', 14) : ''}${esc(BY_ID[n].name)}</a>`;
          }).join(' ')}</p>` : ''}
          <div class="status-box">${status}</div>
        </div>
      </div>
      ${t.caution ? `<aside class="caution"><b>Before you start.</b> ${esc(t.caution)}</aside>` : ''}
      <section class="block">
        <h2>Steps</h2>
        <p class="fine">Work in sets of five tries. Five out of five, move up a step. Two or fewer, go back one.</p>
        <ol class="steps">${steps}</ol>
      </section>
      ${t.cue ? `<section class="block cue">
        <h2>The cue</h2>
        <div class="cue-box"><p class="cue-word">“${esc(t.id === 'name' ? dog.name : t.cue.word)}”</p>${t.cue.signal ? `<p><b>Hand signal:</b> ${esc(t.cue.signal)}</p>` : ''}</div>
        <p class="fine">Say it once, the same way every time. Add it only when your dog is already doing the trick reliably.</p>
      </section>` : ''}
      ${proof}
      <section class="block">
        <h2>If it’s not working</h2>
        <ul class="fixes">${t.fix.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
      </section>
    </article>
  `;

  app.onclick = ev => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    const en = ctx.entry(t.id);
    if (b.dataset.act === 'know') {
      en.status = 'known';
      en.since = Date.now();
      toast(`${t.name} is in ${dog.name}’s deck.`);
    } else if (b.dataset.act === 'relearn') {
      en.status = 'learning';
      en.step = t.steps.length - 1;
    } else if (b.dataset.act === 'step') {
      en.status = 'learning';
      en.step = Number(b.dataset.i);
    } else return;
    ctx.persist();
    trickPage(id);
  };
  app.onchange = ev => {
    const box = ev.target.closest('[data-proof]');
    if (!box) return;
    const en = ctx.entry(t.id);
    en.proof[box.dataset.proof] = box.checked ? 1 : 0;
    const was = en.status;
    en.status = C.proofDone(t, en) ? 'solid' : 'known';
    ctx.persist();
    if (was !== en.status) {
      if (en.status === 'solid') toast(`${t.name} is solid. ★`);
      trickPage(id);
    }
  };
}

// The dog -------------------------------------------------------------------

function dogPage() {
  const dog = ctx.dog();
  const prog = ctx.prog();
  const sessions = ctx.sessions();
  const count = C.knownCount(prog);
  const rank = C.titleFor(count);
  const totalMs = sessions.reduce((n, s) => n + (s.ms || 0), 0);
  const streak = C.streak(sessions);
  const days = C.calendar(sessions, 12);
  const trainedDays = days.filter(d => d.ms > 0).length;
  const past = days.filter(d => !d.future).length;
  const others = S.dogs.filter(d => d.id !== dog.id);
  title(dog.name);

  const suitRows = SUITS.map(s => {
    const all = TRICKS.filter(t => t.suit === s.id);
    const got = all.filter(t => C.isKnown(C.entry(prog, t.id))).length;
    return `<li class="s-${s.id}"><span class="sr-name">${glyph(s.id, 16)}${esc(s.name)}</span>
      <span class="meter suit-meter" role="img" aria-label="${got} of ${all.length}"><i style="width:${Math.round(100 * got / all.length)}%"></i></span>
      <span class="sr-n">${got}/${all.length}</span></li>`;
  }).join('');

  const recent = sessions.slice(-12).reverse();

  app.innerHTML = `
    <section class="dog-head">
      ${avatar(dog, 'av-xl')}
      <div>
        <h1>${esc(dog.name)}${dog.sample ? ' <span class="badge">Sample</span>' : ''}</h1>
        <p class="rank">${rosette(26)}<span><strong>${esc(rank.name)}</strong>${rank.next ? ` · ${plural(rank.next.at - count, 'more trick')} to ${esc(rank.next.name)}` : ''}</span></p>
        <div class="actions"><a class="btn sm" href="#/dog/edit">Edit ${esc(dog.name)}</a><a class="btn sm" href="#/settings">${icon('gear', 16)}Settings</a></div>
      </div>
    </section>

    ${others.length ? `<div class="switch" role="group" aria-label="Switch dog">
      <span class="fine">Switch to</span>
      ${others.map(o => `<button class="dog-chip" data-dog="${esc(o.id)}">${avatar(o, 'av-sm')}${esc(o.name)}</button>`).join('')}
    </div>` : ''}

    <dl class="tiles">
      <div><dt>On cue</dt><dd>${count}<small>/${TRICKS.length}</small></dd></div>
      <div><dt>Sessions</dt><dd>${sessions.length}</dd></div>
      <div><dt>Time trained</dt><dd>${esc(C.duration(totalMs))}</dd></div>
      <div><dt>Streak</dt><dd>${plural(streak, 'day')}</dd></div>
    </dl>

    <section class="block">
      <div class="block-head"><h2>Last 12 weeks</h2><span class="fine">${trainedDays} of ${past} days trained</span></div>
      ${heatmap(days)}
    </section>

    <section class="block">
      <h2>Suits</h2>
      <ul class="suit-rows">${suitRows}</ul>
    </section>

    <section class="block">
      <h2>Recent sessions</h2>
      ${recent.length ? `<div class="table-wrap"><table class="log">
        <thead><tr><th scope="col">Day</th><th scope="col">What</th><th scope="col" class="num">Time</th><th scope="col" class="num" title="Clicks out of tries; first-try cues in a show">Hits</th></tr></thead>
        <tbody>${recent.map(logRow).join('')}</tbody>
      </table></div>` : `<p class="empty">No sessions yet. They’ll show up here after your first one.</p>`}
    </section>

    <section class="block">
      <h2>Treat allowance</h2>
      ${allowance(dog)}
    </section>

    <p class="add-dog"><a class="btn" href="#/dog/new">Add another dog</a></p>
  `;

  bindHeatTips();
  app.onclick = e => {
    const b = e.target.closest('[data-dog]');
    if (!b) return;
    S.dog = b.dataset.dog;
    ctx.persist();
    route();
  };
}

function logRow(s) {
  const t = s.trick ? BY_ID[s.trick] : null;
  const what = s.kind === 'show' ? 'Trick show' : s.kind === 'free' ? 'Clicker' : t ? `${t.emoji} ${esc(t.name)}` : 'Training';
  const reps = (s.hits || 0) + (s.misses || 0);
  const result = reps ? `${s.hits}/${reps}` : '–';
  const step = s.kind === 'train' && t && s.to > s.from ? ` <span class="up">step ${s.from + 1}→${s.to + 1}</span>` : '';
  return `<tr><td>${esc(when(s.start, Date.now(), true))}</td><td>${what}${step}</td><td class="num">${esc(C.duration(s.ms || 0))}</td><td class="num">${result}</td></tr>`;
}

function allowance(dog) {
  const daily = C.dailyKcal(dog);
  if (!daily) return `<p class="fine">Add ${esc(dog.name)}’s weight on the <a href="#/dog/edit">edit page</a> and Trick Deck will keep an eye on treat calories.</p>`;
  const stage = C.STAGES.find(s => s.id === dog.stage) || C.STAGES[2];
  const per = C.treatKcal(dog);
  const budget = daily * 0.1;
  return `<p>${esc(dog.name)} needs about <b>${Math.round(daily)} kcal</b> a day (${esc(stage.label.toLowerCase())}), so treats should stay under <b>${Math.round(budget)} kcal</b>.
    ${dog.treat === 'kibble' ? 'You’re training with kibble from their meals, which adds nothing as long as it comes out of dinner.'
      : `At ${per} kcal a treat that’s about <b>${Math.floor(budget / per)} treats</b> a day.`}</p>
    <p class="fine">Resting energy is 70 × weight in kg<sup>0.75</sup>, times a factor for age and activity. It’s a starting point, and your vet knows your dog better.</p>`;
}

function heatmap(days) {
  const weeks = days.length / 7;
  const level = ms => ms <= 0 ? 0 : ms < 120e3 ? 1 : ms < 300e3 ? 2 : ms < 600e3 ? 3 : 4;
  const months = [];
  for (let w = 0; w < weeks; w++) {
    const d = days[w * 7].date;
    const prev = w ? days[(w - 1) * 7].date : null;
    months.push(!prev || prev.getMonth() !== d.getMonth() ? d.toLocaleDateString(undefined, { month: 'short' }) : '');
  }
  const cells = days.map(d => {
    const label = `${d.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}: ${d.ms ? C.duration(d.ms) : 'no training'}`;
    return d.future ? '<span class="hm-cell future"></span>'
      : `<span class="hm-cell l${level(d.ms)}" data-tip="${esc(label)}" title="${esc(label)}"></span>`;
  }).join('');
  return `<div class="heat">
    <div class="hm" style="--weeks:${weeks}" role="img" aria-label="Training minutes per day for the last 12 weeks">
      <div class="hm-months">${months.map(m => `<span>${esc(m)}</span>`).join('')}</div>
      <div class="hm-days"><span></span><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span></div>
      <div class="hm-grid">${cells}</div>
    </div>
    <div class="hm-legend" aria-hidden="true"><span>None</span><i class="hm-cell l0"></i><i class="hm-cell l1"></i><i class="hm-cell l2"></i><i class="hm-cell l3"></i><i class="hm-cell l4"></i><span>10+ min</span></div>
    <div class="hm-tip" id="hmTip" hidden></div>
  </div>`;
}

function bindHeatTips() {
  const tip = document.getElementById('hmTip');
  const grid = app.querySelector('.hm-grid');
  if (!tip || !grid) return;
  const show = e => {
    const c = e.target.closest('[data-tip]');
    if (!c) { tip.hidden = true; return; }
    const box = c.getBoundingClientRect();
    const host = tip.parentElement.getBoundingClientRect();
    tip.textContent = c.dataset.tip;
    tip.hidden = false;
    const x = Math.min(Math.max(box.left + box.width / 2 - host.left, 70), host.width - 70);
    tip.style.left = `${x}px`;
    tip.style.top = `${box.top - host.top - 8}px`;
  };
  grid.addEventListener('pointerover', show);
  grid.addEventListener('pointerdown', show);
  grid.addEventListener('pointerleave', () => { tip.hidden = true; });
}

// Add or edit a dog -----------------------------------------------------------

function dogEdit(mode) {
  const isNew = mode === 'new';
  const dog = isNew ? { id: newId(), name: '', emoji: '🐶', color: DOG_COLORS[S.dogs.length % DOG_COLORS.length], stage: 'adult', treat: 'small' } : { ...ctx.dog() };
  const units = S.settings.units;
  const weight = dog.kg ? Math.round((units === 'lb' ? C.lbFromKg(dog.kg) : dog.kg) * 10) / 10 : '';
  title(isNew ? 'Add a dog' : `Edit ${dog.name}`);

  app.innerHTML = `
    <a class="back" href="#/dog">${icon('back', 18)}${isNew ? 'Back' : esc(dog.name)}</a>
    <header class="page-head"><h1>${isNew ? 'Add a dog' : `Edit ${esc(dog.name)}`}</h1></header>
    <form class="form" id="dogForm" novalidate>
      <div class="field">
        <label for="dName">Name</label>
        <input id="dName" name="name" required maxlength="30" autocomplete="off" value="${esc(dog.name)}" placeholder="Biscuit">
      </div>

      <fieldset class="field">
        <legend>Picture</legend>
        <div class="pic-row">
          <span id="picPreview">${avatar(dog, 'av-lg')}</span>
          <div class="pic-actions">
            <label class="btn sm file-btn">Choose a photo<input type="file" id="dPhoto" accept="image/*"></label>
            <button type="button" class="btn sm" id="dNoPhoto" ${dog.photo ? '' : 'hidden'}>Remove photo</button>
          </div>
        </div>
        <div class="emoji-pick" role="radiogroup" aria-label="Or pick an emoji">
          ${DOG_EMOJI.map(em => `<button type="button" role="radio" aria-checked="${dog.emoji === em}" data-emoji="${em}">${em}</button>`).join('')}
        </div>
        <div class="color-pick" role="radiogroup" aria-label="Background color">
          ${DOG_COLORS.map(c => `<button type="button" role="radio" aria-checked="${dog.color === c}" data-color="${c}" class="av-${c}" aria-label="${c}"></button>`).join('')}
        </div>
      </fieldset>

      <div class="field two">
        <div>
          <label for="dWeight">Weight</label>
          <div class="with-unit"><input id="dWeight" name="weight" inputmode="decimal" value="${weight}" placeholder="optional">
          <select id="dUnits" aria-label="Units"><option value="lb" ${units === 'lb' ? 'selected' : ''}>lb</option><option value="kg" ${units === 'kg' ? 'selected' : ''}>kg</option></select></div>
        </div>
        <div>
          <label for="dStage">Age and activity</label>
          <select id="dStage">${C.STAGES.map(s => `<option value="${s.id}" ${dog.stage === s.id ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select>
        </div>
      </div>

      <div class="field two">
        <div>
          <label for="dTreat">Usual training treat</label>
          <select id="dTreat">
            ${C.TREATS.map(t => `<option value="${t.id}" ${dog.treat === t.id ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
            <option value="custom" ${dog.treat === 'custom' ? 'selected' : ''}>Something else</option>
          </select>
        </div>
        <div id="customWrap" ${dog.treat === 'custom' ? '' : 'hidden'}>
          <label for="dKcal">Calories per treat</label>
          <input id="dKcal" inputmode="decimal" value="${esc(dog.treatKcal ?? '')}" placeholder="kcal, from the bag">
        </div>
      </div>
      <p class="fine">Weight and treats are only used to keep an eye on treat calories.</p>

      <p class="form-error" id="formError" role="alert" hidden></p>
      <div class="actions">
        <button class="btn primary" type="submit">${isNew ? 'Add dog' : 'Save'}</button>
        <a class="btn" href="#/dog">Cancel</a>
      </div>

      ${!isNew ? `<div class="danger">
        <button type="button" class="btn danger-btn" id="dDelete">Delete ${esc(dog.name)}</button>
        <p class="fine" id="deleteNote" hidden>Tap again to delete ${esc(dog.name)} and all of their progress. This can’t be undone.</p>
      </div>` : ''}
    </form>
  `;

  const form = document.getElementById('dogForm');
  const preview = () => { document.getElementById('picPreview').innerHTML = avatar(dog, 'av-lg'); document.getElementById('dNoPhoto').hidden = !dog.photo; };

  app.onclick = e => {
    const em = e.target.closest('[data-emoji]');
    const col = e.target.closest('[data-color]');
    if (em) { dog.emoji = em.dataset.emoji; delete dog.photo; }
    if (col) dog.color = col.dataset.color;
    if (em || col) {
      app.querySelectorAll('[data-emoji]').forEach(b => b.setAttribute('aria-checked', b.dataset.emoji === dog.emoji && !dog.photo));
      app.querySelectorAll('[data-color]').forEach(b => b.setAttribute('aria-checked', b.dataset.color === dog.color));
      preview();
    }
    if (e.target.id === 'dNoPhoto') { delete dog.photo; preview(); }
    if (e.target.id === 'dDelete') {
      const note = document.getElementById('deleteNote');
      if (note.hidden) { note.hidden = false; e.target.textContent = `Yes, delete ${dog.name}`; return; }
      removeDog(dog.id);
      toast(`${dog.name} deleted.`);
      location.hash = S.dogs.length ? '#/dog' : '#/welcome';
    }
  };
  app.onchange = async e => {
    if (e.target.id === 'dTreat') document.getElementById('customWrap').hidden = e.target.value !== 'custom';
    if (e.target.id === 'dPhoto' && e.target.files[0]) {
      try {
        dog.photo = await shrinkPhoto(e.target.files[0]);
        app.querySelectorAll('[data-emoji]').forEach(b => b.setAttribute('aria-checked', 'false'));
        preview();
      } catch {
        toast('That picture couldn’t be opened. Try a JPEG or PNG.');
      }
    }
  };
  form.onsubmit = e => {
    e.preventDefault();
    const err = document.getElementById('formError');
    const name = document.getElementById('dName').value.trim();
    if (!name) { err.textContent = 'Give your dog a name.'; err.hidden = false; document.getElementById('dName').focus(); return; }
    const unit = document.getElementById('dUnits').value;
    const w = parseFloat(String(document.getElementById('dWeight').value).replace(',', '.'));
    if (document.getElementById('dWeight').value && !(w > 0 && w < (unit === 'lb' ? 400 : 180))) {
      err.textContent = `Weight should be a number of ${unit === 'lb' ? 'pounds' : 'kilograms'}, like ${unit === 'lb' ? '24' : '11'}.`; err.hidden = false; return;
    }
    dog.name = name;
    dog.kg = w > 0 ? (unit === 'lb' ? C.kgFromLb(w) : w) : undefined;
    dog.stage = document.getElementById('dStage').value;
    dog.treat = document.getElementById('dTreat').value;
    dog.treatKcal = dog.treat === 'custom' ? parseFloat(String(document.getElementById('dKcal').value).replace(',', '.')) || 0 : undefined;
    S.settings.units = unit;
    const i = S.dogs.findIndex(d => d.id === dog.id);
    if (i >= 0) S.dogs[i] = dog; else S.dogs.push(dog);
    S.dog = dog.id;
    ctx.persist();
    toast(isNew ? `${name} added.` : 'Saved.');
    location.hash = isNew ? '#/' : '#/dog';
  };
}

// Crop to a square and shrink, so a photo costs a few KB of storage, not a few MB.
async function shrinkPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const size = 200;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    c.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return c.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function removeDog(id) {
  S.dogs = S.dogs.filter(d => d.id !== id);
  delete S.prog[id];
  S.sessions = S.sessions.filter(s => s.dog !== id);
  S.dog = S.dogs[0]?.id || null;
  ctx.persist();
}

// First visit ---------------------------------------------------------------

const STARTERS = ['sit', 'down', 'shake', 'come', 'touch', 'spin', 'leave', 'drop', 'stay', 'catch'];

function welcome() {
  if (ctx.dog()) { location.replace('#/'); return; }
  title('');
  const hand = ['sit', 'spin', 'rollover'].map(id => card(BY_ID[id], {}, { href: false })).join('');
  const picked = new Set();

  app.innerHTML = `
    <section class="welcome">
      <div class="fan" aria-hidden="true">${hand}</div>
      <h1>Teach your dog a new trick, five tries at a time.</h1>
      <p class="lede">Trick Deck is a clicker, a coach and a scorecard in your pocket: ${TRICKS.length - 1} tricks with step-by-step plans, and a trick show that deals from the ones your dog knows.</p>
      <ol class="how">
        <li><p><b>Click the moment they get it right.</b> Then treat. The click tells your dog exactly what earned it.</p></li>
        <li><p><b>Every five tries, the coach decides.</b> Five for five: push on to the next step. Two or fewer: drop back. Otherwise, stick.</p></li>
        <li><p><b>Finish the steps and the card is theirs.</b> Collect all ${TRICKS.length} for the top title.</p></li>
      </ol>
    </section>

    <form class="form start" id="startForm" novalidate>
      <h2>Who are we training?</h2>
      <div class="field">
        <label for="wName">Your dog’s name</label>
        <input id="wName" name="name" maxlength="30" autocomplete="off" placeholder="Biscuit" required>
      </div>
      <fieldset class="field">
        <legend>Anything they already know?</legend>
        <div class="chips wrap" id="starters">
          ${STARTERS.map(id => `<button type="button" aria-pressed="false" data-starter="${id}">${BY_ID[id].emoji} ${esc(BY_ID[id].name)}</button>`).join('')}
        </div>
        <p class="fine">Those cards go straight into their deck. You can add a photo and their weight later.</p>
      </fieldset>
      <p class="form-error" id="wError" role="alert" hidden></p>
      <div class="actions">
        <button class="btn primary big" type="submit">Start training</button>
        <button class="btn" type="button" id="trySample">Look around with a sample dog</button>
      </div>
    </form>
    <p class="fine center">No account, nothing to install. Everything stays in this browser. <a href="#/help">How clicker training works</a></p>
  `;

  app.onclick = e => {
    const b = e.target.closest('[data-starter]');
    if (b) {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', on);
      on ? picked.add(b.dataset.starter) : picked.delete(b.dataset.starter);
    }
    if (e.target.id === 'trySample') {
      const s = sampleDog();
      S.dogs.push(s.dog);
      S.prog[s.dog.id] = s.prog;
      S.sessions.push(...s.sessions);
      S.dog = s.dog.id;
      ctx.persist();
      location.hash = '#/';
    }
  };
  document.getElementById('startForm').onsubmit = e => {
    e.preventDefault();
    const name = document.getElementById('wName').value.trim();
    if (!name) {
      const err = document.getElementById('wError');
      err.textContent = 'Type your dog’s name to start.';
      err.hidden = false;
      document.getElementById('wName').focus();
      return;
    }
    const dog = { id: newId(), name, emoji: '🐶', color: 'amber', stage: 'adult', treat: 'small' };
    S.dogs.push(dog);
    S.dog = dog.id;
    const prog = (S.prog[dog.id] = {});
    const now = Date.now();
    for (const id of picked) prog[id] = { status: 'known', step: 0, since: now, proof: {}, checks: [] };
    if (picked.size) prog.charge = { status: 'known', step: 0, since: now, proof: {}, checks: [] };
    ctx.persist();
    location.hash = picked.size ? '#/' : '#/trick/charge';
  };
}

// Settings ------------------------------------------------------------------

function settings() {
  const st = S.settings;
  title('Settings');
  app.innerHTML = `
    <a class="back" href="#/dog">${icon('back', 18)}${esc(ctx.dog().name)}</a>
    <header class="page-head"><h1>Settings</h1></header>

    <section class="block">
      <h2>Clicker sound</h2>
      <ul class="sounds" role="radiogroup" aria-label="Clicker sound">
        ${SOUNDS.map(s => `<li><label><input type="radio" name="sound" value="${s.id}" id="snd-${s.id}" ${st.sound === s.id ? 'checked' : ''}>
          <span><b>${esc(s.name)}</b><small>${esc(s.about)}</small></span></label>
          ${s.id === 'none' ? '' : `<button class="btn sm try" data-try="${s.id}" aria-label="Play ${esc(s.name)}">${icon('play', 14)}Try</button>`}</li>`).join('')}
      </ul>
      <div class="field">
        <label for="vol">Volume</label>
        <input type="range" id="vol" min="0.1" max="1" step="0.05" value="${st.volume}">
      </div>
      <label class="toggle"><input type="checkbox" id="vib" ${st.vibrate ? 'checked' : ''}><span>Buzz the phone on each click, where the phone supports it</span></label>
    </section>

    <section class="block">
      <h2>Trick show</h2>
      <label class="toggle"><input type="checkbox" id="voice" ${st.voice ? 'checked' : ''}><span>Announce each card out loud</span></label>
    </section>

    <section class="block">
      <h2>Dogs</h2>
      <ul class="rows">${S.dogs.map(d => `<li class="row">
        <span class="row-main">${avatar(d, 'av-sm')}<span class="row-text"><b>${esc(d.name)}</b><small>${C.knownCount(S.prog[d.id])} tricks on cue</small></span></span>
        ${d.id === S.dog ? '<span class="fine">Training now</span>' : `<button class="btn sm" data-dog="${esc(d.id)}">Switch</button>`}
      </li>`).join('')}</ul>
      <p><a class="btn sm" href="#/dog/new">Add a dog</a></p>
    </section>

    <section class="block">
      <h2>Backup</h2>
      <p class="fine">Progress lives in this browser only. Save a backup file to move it to another phone or keep it safe.</p>
      <div class="actions">
        <button class="btn" id="saveBackup">Save a backup file</button>
        <label class="btn file-btn">Restore from a file<input type="file" id="loadBackup" accept="application/json,.json"></label>
      </div>
      <p class="form-error" id="backupError" role="alert" hidden></p>
    </section>

    <section class="block">
      <h2>Start over</h2>
      <button class="btn danger-btn" id="wipe">Erase everything</button>
      <p class="fine" id="wipeNote" hidden>Tap again to erase every dog, card and session on this device.</p>
    </section>

    <p class="fine"><a href="#/help">How clicker training works</a></p>
  `;

  app.onclick = e => {
    const t = e.target.closest('[data-try]');
    if (t) { unlock(); press(t.dataset.try, S.settings.volume); setTimeout(() => release(t.dataset.try, S.settings.volume), 90); }
    const d = e.target.closest('[data-dog]');
    if (d) { S.dog = d.dataset.dog; ctx.persist(); settings(); paintTabs('dog'); }
    if (e.target.id === 'saveBackup') {
      const blob = new Blob([backup(S)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `trick-deck-${C.dayKey(Date.now())}.json`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    if (e.target.id === 'wipe') {
      const note = document.getElementById('wipeNote');
      if (note.hidden) { note.hidden = false; e.target.textContent = 'Yes, erase everything'; return; }
      Object.assign(S, defaults());
      ctx.persist();
      location.hash = '#/welcome';
    }
  };
  app.onchange = async e => {
    const id = e.target.id;
    if (e.target.name === 'sound') S.settings.sound = e.target.value;
    else if (id === 'vol') S.settings.volume = Number(e.target.value);
    else if (id === 'vib') S.settings.vibrate = e.target.checked;
    else if (id === 'voice') S.settings.voice = e.target.checked;
    else if (id === 'loadBackup' && e.target.files[0]) {
      const err = document.getElementById('backupError');
      try {
        const next = restore(await e.target.files[0].text());
        Object.assign(S, next);
        ctx.persist();
        toast(`Restored ${plural(S.dogs.length, 'dog')}.`);
        location.hash = '#/';
        return;
      } catch (ex) {
        err.textContent = ex.message;
        err.hidden = false;
        return;
      }
    } else return;
    ctx.persist();
  };
  app.oninput = e => { if (e.target.id === 'vol') S.settings.volume = Number(e.target.value); };
}

// How it works --------------------------------------------------------------

function help() {
  title('How it works');
  const back = ctx.dog() ? '#/' : '#/welcome';
  app.innerHTML = `
    <a class="back" href="${back}">${icon('back', 18)}Back</a>
    <article class="prose">
      <h1>How clicker training works</h1>
      <p class="lede">A clicker is a way of saying “yes, that!” at the exact moment your dog gets something right. Words are slow and we say them all day. A click is short, sharp and means one thing.</p>

      <h2>The click, then the treat</h2>
      <p>Every click is followed by a treat, even an accidental one. That promise is what makes the click worth listening for. Start with <a href="#/trick/charge">card 0</a>, which teaches your dog the click means food is coming.</p>
      <p>Click at the moment the thing happens, not after. For Sit, that’s the instant the bottom touches the floor. The treat can take a second or two to arrive. The click has already said which moment earned it.</p>

      <h2>Short sessions</h2>
      <p>Three to five minutes is plenty. Stop while your dog still wants more, and end with something easy. A few short sessions a day beat one long one. Trick Deck taps you on the shoulder at three minutes.</p>

      <h2>Push, drop, stick</h2>
      <p>Work in sets of five tries and count how many earned a click:</p>
      <ul>
        <li><b>5 of 5: push.</b> Your dog has this step. Make it a little harder.</li>
        <li><b>3 or 4 of 5: stick.</b> Another set at the same step.</li>
        <li><b>2 or fewer: drop.</b> Too hard for now. Go back a step, or make this one easier.</li>
      </ul>
      <p>The rule comes from trainer Jean Donaldson. It stops you from asking for too much too soon, which is the most common reason tricks stall. Tap the ball for a click and <b>No click</b> for a try that didn’t make it, and Trick Deck does the counting.</p>

      <h2>Four ways to get the behavior</h2>
      ${Object.values(METHODS).filter(m => m.name !== 'Pairing').map(m => `<p><b>${esc(m.name)}.</b> ${esc(m.about)}</p>`).join('')}

      <h2>Adding the cue</h2>
      <p>Wait until your dog is doing the trick reliably before you name it. Then say the word just before the hand signal. Soon the word alone will do. Say it once. If nothing happens, make it easier rather than repeating yourself.</p>

      <h2>Making it solid</h2>
      <p>Dogs don’t generalize well. A sit in the kitchen isn’t a sit at the park yet. Once a card is on cue, practice it in new places, with distractions, and from further away. Tick those off on the card and it becomes solid.</p>

      <h2>Treats</h2>
      <p>Use tiny, soft treats your dog loves, about the size of a pea. Training treats count toward the day’s food. Vets suggest keeping all treats under 10% of daily calories. Add your dog’s weight and Trick Deck keeps an eye on it. Kibble from their meals works too, for easy tricks.</p>

      <h2>When to get help</h2>
      <p>Trick Deck is for tricks and manners. If your dog is fearful, aggressive, or suddenly behaving differently, talk to your vet and a certified trainer or veterinary behaviorist.</p>

      <h2>About</h2>
      <p>Trick Deck runs entirely in your browser. There’s no account and nothing is sent anywhere. Fonts: Fredoka and Figtree, both under the SIL Open Font License.</p>
    </article>
  `;
}

// Start ---------------------------------------------------------------------

window.addEventListener('hashchange', route);
window.addEventListener('pagehide', () => ctx.persist());
route();

// Offline support is optional, and some embedded frames refuse service workers outright.
try {
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
} catch { /* not allowed here */ }
