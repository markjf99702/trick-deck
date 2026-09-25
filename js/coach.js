// The coach: pure functions that turn taps and saved progress into advice.
// Nothing here touches the page, so it's all testable in Node.

import { TRICKS, BY_ID } from './tricks.js';

// Push, drop, stick: work in sets of five tries. Five for five, make it harder.
// Two or fewer, make it easier. Anything else, stay where you are.
export const SET_SIZE = 5;

export function judgeSet(results) {
  const hits = results.filter(Boolean).length;
  const verdict = hits === SET_SIZE ? 'push' : hits <= 2 ? 'drop' : 'stick';
  return { hits, verdict };
}

// What to do after a set, given where you are in the trick's steps.
export function advise(trick, step, verdict) {
  const last = trick.steps.length - 1;
  if (verdict === 'push') return step >= last ? { to: step, done: true } : { to: step + 1 };
  if (verdict === 'drop') return { to: Math.max(0, step - 1), easier: step === 0 };
  return { to: step };
}

// Progress on one trick. status: new → learning → known (on cue) → solid (proofed).
export function entry(prog, id) {
  return (prog && prog[id]) || { status: 'new', step: 0 };
}

export const isKnown = e => e.status === 'known' || e.status === 'solid';

export function knownCount(prog) {
  return TRICKS.filter(t => isKnown(entry(prog, t.id))).length;
}

export function missingNeeds(trick, prog) {
  return trick.needs.filter(id => !isKnown(entry(prog, id)));
}

export const isReady = (trick, prog) => missingNeeds(trick, prog).length === 0;

// Cards to learn next: not started, everything they build on is known, easiest first.
export function suggestions(prog, n = 3) {
  return TRICKS
    .filter(t => entry(prog, t.id).status === 'new' && isReady(t, prog))
    .sort((a, b) => a.level - b.level || a.n - b.n)
    .slice(0, n);
}

export function inProgress(prog) {
  return TRICKS
    .filter(t => entry(prog, t.id).status === 'learning')
    .sort((a, b) => (entry(prog, b.id).last || 0) - (entry(prog, a.id).last || 0));
}

// Proofing: a trick is solid when it works in new places, around distractions,
// from a distance, and (for held positions) for as long as you need.
export const PROOF = [
  { id: 'place', label: 'Somewhere new', about: 'Works in three different places, like another room, the yard, and a friend’s house.' },
  { id: 'distraction', label: 'With distractions', about: 'Works with something going on, like a toy on the floor or someone walking past.' },
  { id: 'distance', label: 'From a distance', about: 'Works when you give the cue from a few steps away.' },
  { id: 'duration', label: 'Holds it', about: 'Holds the position until you release them, 10 seconds or more.', hold: true },
];

export const proofItems = trick => PROOF.filter(p => !p.hold || trick.hold);

export function proofDone(trick, e) {
  const p = e.proof || {};
  return proofItems(trick).every(item => p[item.id]);
}

// Titles for the number of tricks on cue.
export const TITLES = [
  { at: 0, name: 'New recruit' },
  { at: 1, name: 'Good dog' },
  { at: 3, name: 'Quick study' },
  { at: 6, name: 'Clever dog' },
  { at: 10, name: 'Trickster' },
  { at: 16, name: 'Show dog' },
  { at: 24, name: 'Headliner' },
  { at: 36, name: 'Star of the show' },
  { at: TRICKS.length, name: 'Legend' },
];

export function titleFor(count) {
  let i = 0;
  while (i + 1 < TITLES.length && TITLES[i + 1].at <= count) i++;
  return { ...TITLES[i], next: TITLES[i + 1] || null };
}

// First-cue reliability from the trick show.
export function reliability(checks = [], last = 10) {
  const recent = checks.slice(-last);
  return { first: recent.filter(c => c.r === 'first').length, total: recent.length };
}

// Days, using the device's local calendar.
const pad = n => String(n).padStart(2, '0');
export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Consecutive days with training. A streak stays alive until a whole day is missed.
export function streak(sessions, now = Date.now()) {
  const days = new Set(sessions.map(s => dayKey(s.start)));
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// Minutes trained per day for the last `weeks` weeks, oldest first, ending on today's week.
// Weeks start on Sunday. Days after today are marked future.
export function calendar(sessions, weeks = 12, now = Date.now()) {
  const ms = {};
  for (const s of sessions) { const k = dayKey(s.start); ms[k] = (ms[k] || 0) + (s.ms || 0); }
  const today = new Date(now);
  today.setHours(12, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - start.getDay() - 7 * (weeks - 1));
  const days = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = dayKey(d);
    days.push({ key, date: d, ms: ms[key] || 0, future: d > today });
  }
  return days;
}

export function sessionsOn(sessions, key) {
  return sessions.filter(s => dayKey(s.start) === key);
}

// Treat calories. Resting energy is 70 × kg^0.75; daily needs are that times a
// life-stage factor. Treats, training treats included, should stay under 10%.
export const STAGES = [
  { id: 'puppy4', label: 'Puppy under 4 months', factor: 3.0 },
  { id: 'puppy', label: 'Puppy, 4–12 months', factor: 2.0 },
  { id: 'adult', label: 'Adult, spayed or neutered', factor: 1.6 },
  { id: 'intact', label: 'Adult, not spayed or neutered', factor: 1.8 },
  { id: 'easy', label: 'Senior or couch potato', factor: 1.3 },
  { id: 'active', label: 'Very active or working', factor: 2.5 },
  { id: 'diet', label: 'On a diet', factor: 1.0 },
];

export const TREATS = [
  { id: 'kibble', label: 'Kibble from their meals', kcal: 0 },
  { id: 'tiny', label: 'Tiny training treats (about 1.5 kcal)', kcal: 1.5 },
  { id: 'small', label: 'Small soft treats (about 3 kcal)', kcal: 3 },
  { id: 'big', label: 'Bigger treats (about 8 kcal)', kcal: 8 },
];

export const rer = kg => 70 * Math.pow(kg, 0.75);

export function dailyKcal(dog) {
  if (!dog || !(dog.kg > 0)) return null;
  const stage = STAGES.find(s => s.id === dog.stage) || STAGES[2];
  return rer(dog.kg) * stage.factor;
}

export function treatKcal(dog) {
  if (dog?.treat === 'custom') return Math.max(0, Number(dog.treatKcal) || 0);
  return (TREATS.find(t => t.id === (dog?.treat || 'small')) || TREATS[2]).kcal;
}

export function treatReport(dog, treats) {
  const daily = dailyKcal(dog);
  const per = treatKcal(dog);
  const kcal = treats * per;
  const budget = daily ? daily * 0.1 : null;
  return {
    treats, per, kcal, daily, budget,
    kibble: dog?.treat === 'kibble',
    ratio: budget ? kcal / budget : null,
    over: budget ? kcal > budget : false,
  };
}

export const kgFromLb = lb => lb * 0.45359237;
export const lbFromKg = kg => kg / 0.45359237;

// Readable durations: 45 s, 3 min, 1 h 20 min.
export function duration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

export function clock(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

export { BY_ID };
