// Small shared pieces of the page: escaping, the card face, avatars, glyphs.

import { suitOf, LEVELS } from './tricks.js';
import { entry, isKnown, missingNeeds } from './coach.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Suit glyphs: bone, paw, turn arrow, ball. Card 0 gets a star.
export const GLYPH = {
  manners: '<g transform="rotate(-40 12 12)"><rect x="6" y="10" width="12" height="4" rx="1"/><circle cx="6.2" cy="9.9" r="2.7"/><circle cx="6.2" cy="14.1" r="2.7"/><circle cx="17.8" cy="9.9" r="2.7"/><circle cx="17.8" cy="14.1" r="2.7"/></g>',
  poses: '<ellipse cx="12" cy="16" rx="4.8" ry="3.9"/><ellipse cx="5.9" cy="10.6" rx="1.9" ry="2.5" transform="rotate(-24 5.9 10.6)"/><ellipse cx="9.7" cy="6.7" rx="2" ry="2.7" transform="rotate(-8 9.7 6.7)"/><ellipse cx="14.3" cy="6.7" rx="2" ry="2.7" transform="rotate(8 14.3 6.7)"/><ellipse cx="18.1" cy="10.6" rx="1.9" ry="2.5" transform="rotate(24 18.1 10.6)"/>',
  moves: '<path d="M18.6 13.2A6.9 6.9 0 1 1 16.4 6.8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M20 3.6 19.4 9.6 13.6 8.4Z"/>',
  helpers: '<circle cx="12" cy="12" r="9"/><path d="M4.8 6.6c3.6 2.6 3.6 8.2 0 10.8M19.2 6.6c-3.6 2.6-3.6 8.2 0 10.8" fill="none" style="stroke:var(--card-bg)" stroke-width="1.8" stroke-linecap="round"/>',
  start: '<path d="M12 2.8l2.7 5.8 6.3.7-4.7 4.3 1.3 6.3L12 16.7l-5.6 3.2 1.3-6.3L3 9.3l6.3-.7z"/>',
};

export const glyph = (suit, size = 16) =>
  `<svg class="glyph" viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true">${GLYPH[suit] || GLYPH.start}</svg>`;

export const ICON = {
  home: '<path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  deck: '<rect x="8" y="3.5" width="11" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5.5 7.5 5 8.2l.1 11.3a1.6 1.6 0 0 0 1.6 1.5H15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  clicker: '<rect x="4" y="6" width="16" height="12" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/>',
  show: '<path d="M12 3.5l2.4 5.1 5.6.6-4.2 3.8 1.2 5.5L12 15.7l-5 2.8 1.2-5.5L4 9.2l5.6-.6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  back: '<path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  next: '<path d="M9.5 5.5 16 12l-6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  play: '<path d="M8 5.5v13l10.5-6.5Z" fill="currentColor"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>',
  x: '<path d="m6.5 6.5 11 11m0-11-11 11" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
  gear: '<path fill="currentColor" d="M19.4 13a7.7 7.7 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1l-.4-2.7h-4l-.4 2.7a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L4.6 11a7.7 7.7 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1l.4 2.7h4l.4-2.7c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"/>',
  undo: '<path d="M9 7 4.5 11.5 9 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 11.5h9a5 5 0 0 1 0 10h-2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
};

export const icon = (name, size = 20) =>
  `<svg class="icon" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${ICON[name]}</svg>`;

export const DOG_COLORS = ['amber', 'sky', 'sage', 'rose', 'plum', 'slate'];
export const DOG_EMOJI = ['🐶', '🐕', '🐩', '🦮', '🐕‍🦺', '🐺'];

export function avatar(dog, cls = '') {
  if (!dog) return '';
  if (dog.photo) return `<img class="av ${cls}" src="${esc(dog.photo)}" alt="">`;
  return `<span class="av av-${esc(dog.color || 'amber')} ${cls}" aria-hidden="true">${esc(dog.emoji || '🐶')}</span>`;
}

export function pips(level) {
  return `<span class="pips" title="${esc(LEVELS[level])}">${[1, 2, 3, 4].map(i => `<i class="${i <= level ? 'on' : ''}"></i>`).join('')}</span>`;
}

// The trick as a playing card: number, suit, picture, name, level and status.
export function card(t, prog, { href = true, big = false, cls = '' } = {}) {
  const e = entry(prog, t.id);
  const later = e.status === 'new' && missingNeeds(t, prog).length > 0;
  const stamp = e.status === 'solid' ? `<span class="stamp solid" title="Solid">★</span>`
    : e.status === 'known' ? `<span class="stamp known" title="On cue">✓</span>` : '';
  const bar = e.status === 'learning'
    ? `<span class="c-bar" title="Step ${e.step + 1} of ${t.steps.length}"><i style="width:${Math.round(100 * e.step / t.steps.length)}%"></i></span>` : '';
  const label = `${t.name}, card ${t.n}, ${suitOf(t).name}, ${LEVELS[t.level]}${statusWords(t, e)}`;
  const tag = href ? 'a' : 'div';
  return `<${tag} class="card s-${t.suit} st-${e.status}${later ? ' later' : ''}${big ? ' big' : ''} ${cls}"${href ? ` href="#/trick/${t.id}"` : ''} aria-label="${esc(label)}">
    <span class="c-top"><span class="c-n">${t.n}</span>${glyph(t.suit, big ? 22 : 14)}</span>
    <span class="c-art" aria-hidden="true"><span>${t.emoji}</span>${stamp}</span>
    <span class="c-name">${esc(t.name)}</span>
    <span class="c-foot">${pips(t.level)}${bar}</span>
  </${tag}>`;
}

function statusWords(t, e) {
  if (e.status === 'solid') return ', solid';
  if (e.status === 'known') return ', on cue';
  if (e.status === 'learning') return `, learning, step ${e.step + 1} of ${t.steps.length}`;
  return '';
}

export function rosette(size = 44) {
  const petals = Array.from({ length: 12 }, (_, i) => {
    const a = (i * 30 * Math.PI) / 180;
    return `<circle cx="${(22 + Math.cos(a) * 11).toFixed(1)}" cy="${(19 + Math.sin(a) * 11).toFixed(1)}" r="6"/>`;
  }).join('');
  return `<svg class="rosette" viewBox="0 0 44 48" width="${size}" height="${Math.round(size * 48 / 44)}" aria-hidden="true">
    <path d="M13 26 7 46l7-4 4 6 6-19Z M31 26l6 20-7-4-4 6-6-19Z" class="r-tail"/>
    <g class="r-petal">${petals}</g><circle cx="22" cy="19" r="11.5" class="r-ring"/><circle cx="22" cy="19" r="8" class="r-mid"/>
  </svg>`;
}

export function when(ts, now = Date.now(), short = false) {
  const d = new Date(ts);
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: short ? 'short' : 'long' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2600);
}

export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
