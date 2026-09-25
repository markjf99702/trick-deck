// Everything is kept in this browser's localStorage. No account, no server.

const KEY = 'trickdeck.v1';
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

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch { /* blocked or corrupt: start fresh */ }
  return defaults();
}

export function save(state) {
  if (state.sessions.length > MAX_SESSIONS) state.sessions = state.sessions.slice(-MAX_SESSIONS);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
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
