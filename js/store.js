// Everything is kept in this browser's localStorage. No account, no server.

export const KEY = 'trickdeck.v1';
const MAX_SESSIONS = 2000;

export function defaults() {
  return {
    v: 1,
    dogs: [],
    dog: null,       // id of the dog you're training
    prog: {},        // dog id → trick id → progress
    sessions: [],    // { id, dog, trick, kind: train|free|show, start, ms, hits, misses, from, to }
    settings: {
      sound: 'box',
      volume: 0.8,
      vibrate: true,
      voice: true,
      units: guessUnits(),
      round: 5,
    },
  };
}

function guessUnits() {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    return ['US', 'LR', 'MM'].includes(region) ? 'lb' : 'kg';
  } catch { return 'lb'; }
}

export function normalize(s) {
  const d = defaults();
  if (!s || typeof s !== 'object') return d;
  const out = {
    ...d,
    ...s,
    settings: { ...d.settings, ...(s.settings || {}) },
    dogs: Array.isArray(s.dogs) ? s.dogs.filter(x => x && x.id && typeof x.name === 'string') : [],
    prog: s.prog && typeof s.prog === 'object' ? s.prog : {},
    sessions: Array.isArray(s.sessions) ? s.sessions.filter(x => x && x.start) : [],
  };
  if (!out.dogs.some(x => x.id === out.dog)) out.dog = out.dogs[0]?.id || null;
  return out;
}

// What's saved, as text: null if nothing is, or if the browser won't say.
export function read() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function parse(raw) {
  try {
    if (raw) return normalize(JSON.parse(raw));
  } catch { /* corrupt: start fresh */ }
  return defaults();
}

export const load = () => parse(read());

// Returns the text saved, or null when the browser won't save.
export function save(state) {
  if (state.sessions.length > MAX_SESSIONS) state.sessions = state.sessions.slice(-MAX_SESSIONS);
  try {
    const raw = JSON.stringify(state);
    localStorage.setItem(KEY, raw);
    return raw;
  } catch {
    return null;
  }
}

// Another tab, or the installed app, saved while this one was open. merge() brings its changes into `mine`,
// this tab's state, in place, so a screen holding a trick's progress keeps a good hold on it. `base` is what
// this tab last read or saved: where `mine` differs from it, that's this tab's own change and it stays;
// everything else comes from `theirs`. Dogs, sessions (by id), each trick's progress and the settings merge
// field by field, so changes to different things in two tabs both survive, and where both changed the same
// field, the change being saved now, the newest, wins. A dog or session removed in either tab stays removed.
// The dog this tab is showing stays, unless it's gone.
const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
const UNSTARTED = { status: 'new', step: 0, proof: {}, checks: [] }; // what a trick with no progress reads as

function fields(m, b = {}, t) {
  for (const k of new Set([...Object.keys(m), ...Object.keys(b), ...Object.keys(t)])) {
    if (!same(m[k], b[k])) continue;
    if (t[k] === undefined) delete m[k]; else m[k] = t[k];
  }
  return m;
}

function records(mine, base, theirs) {
  const m = new Map(mine.map(x => [x.id, x]));
  const b = new Map(base.map(x => [x.id, x]));
  const t = new Set(theirs.map(x => x.id));
  const out = [];
  for (const x of theirs) {
    if (b.has(x.id) && !m.has(x.id)) continue; // removed here
    out.push(m.has(x.id) ? fields(m.get(x.id), b.get(x.id), x) : x);
  }
  for (const x of mine) if (!t.has(x.id) && !b.has(x.id)) out.push(x); // added here
  return out;
}

export function merge(mine, base, theirs) {
  mine.dogs = records(mine.dogs, base.dogs, theirs.dogs);
  mine.sessions = records(mine.sessions, base.sessions, theirs.sessions).sort((a, b) => a.start - b.start);
  for (const d of new Set([...Object.keys(mine.prog), ...Object.keys(theirs.prog)])) {
    const m = mine.prog[d], b = base.prog[d], t = theirs.prog[d];
    if (b && (!m || !t)) { delete mine.prog[d]; continue; } // the dog was removed
    if (!t) continue;
    if (!m) { mine.prog[d] = t; continue; }
    for (const id of new Set([...Object.keys(m), ...Object.keys(t)])) {
      if (!t[id]) { if (b?.[id]) delete m[id]; continue; } // gone there (a restored backup), or started here
      if (!m[id]) m[id] = t[id];
      else fields(m[id], b?.[id] || UNSTARTED, t[id]);
    }
  }
  fields(mine.settings, base.settings, theirs.settings);
  const has = id => mine.dogs.some(x => x.id === id);
  if (!has(mine.dog)) mine.dog = has(theirs.dog) ? theirs.dog : mine.dogs[0]?.id || null;
  return mine;
}

export function backup(state) {
  return JSON.stringify({ app: 'trick-deck', saved: new Date().toISOString(), ...state }, null, 1);
}

// Returns the restored state, or throws with a message a person can act on.
export function restore(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('That file isn’t a Trick Deck backup. Pick the .json file you saved from Settings.'); }
  if (!data || data.app !== 'trick-deck' || !Array.isArray(data.dogs)) {
    throw new Error('That file isn’t a Trick Deck backup. Pick the .json file you saved from Settings.');
  }
  delete data.app;
  delete data.saved;
  return normalize(data);
}

export const newId = () => Math.random().toString(36).slice(2, 10);
