// The clicker, made with Web Audio so it plays the instant you touch the screen.
// A box clicker makes two sounds: a sharp click when the metal tongue is pressed,
// and a softer one when it springs back. The click that counts is the first.

let ctx = null;
let noise = null;

export const SOUNDS = [
  { id: 'box', name: 'Box clicker', about: 'Sharp click and clack, like the real thing.' },
  { id: 'soft', name: 'Soft clicker', about: 'Muffled, for dogs who startle at noises.' },
  { id: 'tock', name: 'Tongue click', about: 'A low tock, like clicking your tongue.' },
  { id: 'chirp', name: 'Chirp', about: 'A short rising whistle that carries outdoors.' },
  { id: 'none', name: 'Silent', about: 'Use your own clicker or a marker word like “Yes!”. The app just counts.' },
];

// Call from inside a touch or click handler: browsers only allow sound after one.
export function unlock() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback'; // play even with the ringer off on iPhone
  } catch { /* not supported */ }
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC({ latencyHint: 'interactive' });
    noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.06), ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function env(gain, t, peak, decay, attack = 0.0008) {
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function burst(t, { freq, q = 1, peak, decay, lowpass }) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = freq;
  band.Q.value = q;
  const g = ctx.createGain();
  env(g, t, peak, decay);
  let node = src.connect(band);
  if (lowpass) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = lowpass;
    node = node.connect(lp);
  }
  node.connect(g).connect(ctx.destination);
  src.start(t);
  src.stop(t + decay + 0.02);
}

function tone(t, { type = 'sine', from, to = from, peak, decay, attack, sweep = decay }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + sweep);
  const g = ctx.createGain();
  env(g, t, peak, decay, attack);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + (attack || 0) + decay + 0.02);
}

export function press(sound = 'box', volume = 0.8) {
  if (sound === 'none' || !unlock()) return;
  const t = ctx.currentTime;
  const v = Math.max(0.02, Math.min(1, volume));
  if (sound === 'box') {
    burst(t, { freq: 3400, q: 0.8, peak: 0.9 * v, decay: 0.012 });
    tone(t, { from: 2450, peak: 0.22 * v, decay: 0.03 }); // the metal tongue ringing
    tone(t, { type: 'triangle', from: 190, to: 120, peak: 0.35 * v, decay: 0.012 }); // the plastic case
  } else if (sound === 'soft') {
    burst(t, { freq: 1500, q: 0.7, peak: 0.45 * v, decay: 0.014, lowpass: 2400 });
    tone(t, { type: 'triangle', from: 160, to: 110, peak: 0.25 * v, decay: 0.014 });
  } else if (sound === 'tock') {
    tone(t, { from: 1500, to: 650, peak: 0.7 * v, decay: 0.035, sweep: 0.018 });
    burst(t, { freq: 2200, q: 1.2, peak: 0.25 * v, decay: 0.006 });
  } else if (sound === 'chirp') {
    tone(t, { from: 1900, to: 3000, peak: 0.35 * v, decay: 0.08, attack: 0.004, sweep: 0.06 });
  }
}

export function release(sound = 'box', volume = 0.8) {
  if (sound !== 'box' || !ctx) return;
  const t = ctx.currentTime;
  const v = Math.max(0.02, Math.min(1, volume));
  burst(t, { freq: 2700, q: 0.8, peak: 0.5 * v, decay: 0.01 });
  tone(t, { from: 2050, peak: 0.12 * v, decay: 0.022 });
}

// A buzz for the hand holding the phone, where supported (not on iPhone).
export function buzz(on) {
  if (on && navigator.vibrate) { try { navigator.vibrate(12); } catch { /* ignore */ } }
}
