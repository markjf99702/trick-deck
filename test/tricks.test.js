import test from 'node:test';
import assert from 'node:assert/strict';
import { TRICKS, BY_ID, SUITS, METHODS, LEVELS } from '../js/tricks.js';

test('card 0 and four suits of twelve', () => {
  assert.equal(TRICKS.length, 49);
  assert.equal(TRICKS[0].id, 'charge');
  assert.equal(TRICKS[0].n, 0);
  for (const s of SUITS) assert.equal(TRICKS.filter(t => t.suit === s.id).length, 12, s.id);
  TRICKS.forEach((t, i) => assert.equal(t.n, i));
});

test('every trick is complete', () => {
  const ids = new Set();
  for (const t of TRICKS) {
    assert.ok(!ids.has(t.id), `duplicate ${t.id}`);
    ids.add(t.id);
    assert.ok(t.name && t.emoji && t.blurb, t.id);
    assert.ok(METHODS[t.method], `${t.id} method`);
    assert.ok(LEVELS[t.level], `${t.id} level`);
    assert.ok(t.steps.length >= 3 && t.steps.length <= 5, `${t.id} has ${t.steps.length} steps`);
    for (const s of t.steps) {
      assert.ok(s.do && s.click && s.tip, `${t.id} step`);
      assert.match(s.click, /^Click /, `${t.id}: "${s.click}" should say what to click`);
    }
    assert.ok(t.fix?.length, `${t.id} troubleshooting`);
    if (t.id !== 'charge') assert.ok(t.cue?.word, `${t.id} cue`);
  }
});

test('no two cards share a picture', () => {
  const seen = new Map();
  for (const t of TRICKS) {
    assert.ok(!seen.has(t.emoji), `${t.id} and ${seen.get(t.emoji)} both use ${t.emoji}`);
    seen.set(t.emoji, t.id);
  }
});

test('prerequisites exist, come earlier in difficulty, and never loop', () => {
  for (const t of TRICKS) {
    for (const n of t.needs) {
      assert.ok(BY_ID[n], `${t.id} needs missing ${n}`);
      assert.ok(BY_ID[n].level <= t.level, `${t.id} (level ${t.level}) needs harder ${n}`);
    }
  }
  const visiting = new Set();
  const done = new Set();
  const walk = id => {
    if (done.has(id)) return;
    assert.ok(!visiting.has(id), `cycle through ${id}`);
    visiting.add(id);
    BY_ID[id].needs.forEach(walk);
    visiting.delete(id);
    done.add(id);
  };
  TRICKS.forEach(t => walk(t.id));
});

test('copy stays plain: no em dashes in anything a person reads', () => {
  const text = JSON.stringify(TRICKS);
  assert.ok(!text.includes('—'), 'found an em dash');
});
