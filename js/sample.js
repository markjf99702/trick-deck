// A made-up dog with six weeks of history, for trying the app out and for screenshots.
// Everything is built relative to `now`, and the random numbers are seeded so it's
// the same every time.

import { newId } from './store.js';

export function sampleDog(now = Date.now()) {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const id = 'sample-' + newId();
  const day = 864e5;

  const dog = {
    id, name: 'Biscuit', sample: true, emoji: '🐶', color: 'amber',
    kg: 11, stage: 'adult', treat: 'small',
  };

  const known = ['charge', 'name', 'sit', 'down', 'touch', 'leave', 'drop', 'shake', 'spin', 'findit', 'come'];
  const solid = { sit: 1, down: 1, touch: 1 };
  const learning = { rollover: 2, highfive: 1, stay: 2, place: 3 };
  const prog = {};
  known.forEach((t, i) => {
    prog[t] = {
      status: solid[t] ? 'solid' : 'known', step: 0,
      since: now - (40 - i * 3) * day, last: now - (12 - i) * day,
      proof: solid[t] ? { place: 1, distraction: 1, distance: 1, duration: 1 } : {},
      checks: [],
    };
  });
  for (const [t, step] of Object.entries(learning)) prog[t] = { status: 'learning', step, proof: {}, checks: [] };

  const sessions = [];
  const pool = [...known.slice(2), ...Object.keys(learning)];
  for (let ago = 42; ago >= 0; ago--) {
    const busy = ago <= 3 || rand() < (ago < 14 ? 0.62 : 0.45);
    if (!busy) continue;
    const count = rand() < 0.3 ? 2 : 1;
    for (let k = 0; k < count; k++) {
      const trick = ago === 0 ? 'rollover' : pool[Math.floor(rand() * pool.length)];
      const reps = 10 + Math.floor(rand() * 16);
      const hits = Math.round(reps * (0.6 + rand() * 0.35));
      const start = now - ago * day - (k ? 9 : 2) * 36e5 - Math.floor(rand() * 36e5);
      const ms = (90 + Math.floor(rand() * 200)) * 1000;
      sessions.push({ id: newId(), dog: id, trick, kind: 'train', start, ms, hits, misses: reps - hits });
      const p = prog[trick];
      p.reps = (p.reps || 0) + reps;
      p.hits = (p.hits || 0) + hits;
      p.ms = (p.ms || 0) + ms;
      p.sessions = (p.sessions || 0) + 1;
      p.last = Math.max(p.last || 0, start + ms);
    }
  }

  // A few trick shows.
  const shown = ['sit', 'down', 'shake', 'spin', 'touch', 'come'];
  for (const ago of [9, 5, 2]) {
    const start = now - ago * day - 5 * 36e5;
    let first = 0;
    for (const t of shown) {
      const r = rand() < (solid[t] ? 0.92 : 0.7) ? 'first' : rand() < 0.7 ? 'help' : 'miss';
      if (r === 'first') first++;
      prog[t].checks.push({ t: start, r });
    }
    sessions.push({ id: newId(), dog: id, trick: null, kind: 'show', start, ms: 150000, hits: first, misses: shown.length - first });
  }
  sessions.sort((a, b) => a.start - b.start);
  return { dog, prog, sessions };
}
