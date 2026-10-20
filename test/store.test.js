import test from 'node:test';
import assert from 'node:assert/strict';
import { merge, normalize } from '../js/store.js';

// Two tabs that both started from the same save: `base` is what each read, and each changes its own copy.
const start = () => normalize({
  dog: 'd1',
  dogs: [{ id: 'd1', name: 'Pepper', emoji: '🐶', color: 'amber' }, { id: 'd2', name: 'Mochi', emoji: '🐩', color: 'sky' }],
  prog: {
    d1: { sit: { status: 'known', step: 0, proof: {}, checks: [] }, spin: { status: 'learning', step: 1, proof: {}, checks: [], reps: 10, hits: 8 } },
    d2: { sit: { status: 'learning', step: 2, proof: {}, checks: [] } },
  },
  sessions: [{ id: 's1', dog: 'd1', trick: 'spin', kind: 'train', start: 1000, ms: 60e3, hits: 8, misses: 2 }],
  settings: { sound: 'box', volume: 0.8, units: 'lb' },
});
const copy = x => JSON.parse(JSON.stringify(x));
const tabs = () => { const base = start(); return { base, mine: copy(base), theirs: copy(base) }; };

test('changes to different things in two tabs both survive', () => {
  const { base, mine, theirs } = tabs();
  mine.dogs[0].name = 'Pepper Pot';
  mine.prog.d1.sit.proof.place = 1;
  mine.settings.volume = 0.5;
  theirs.prog.d1.spin.step = 2;
  theirs.prog.d1.spin.reps = 15;
  theirs.sessions.push({ id: 's2', dog: 'd1', trick: 'spin', kind: 'train', start: 2000, ms: 30e3, hits: 5, misses: 0 });
  theirs.settings.sound = 'soft';
  merge(mine, base, theirs);
  assert.equal(mine.dogs[0].name, 'Pepper Pot');
  assert.deepEqual(mine.prog.d1.sit.proof, { place: 1 });
  assert.equal(mine.prog.d1.spin.step, 2);
  assert.equal(mine.prog.d1.spin.reps, 15);
  assert.deepEqual(mine.sessions.map(s => s.id), ['s1', 's2']);
  assert.equal(mine.settings.volume, 0.5);
  assert.equal(mine.settings.sound, 'soft');
});

test('the same field changed in both: the one being saved now wins', () => {
  const { base, mine, theirs } = tabs();
  theirs.prog.d1.spin.step = 3;
  mine.prog.d1.spin.step = 2;
  merge(mine, base, theirs);
  assert.equal(mine.prog.d1.spin.step, 2);
});

test('progress keeps its object, so the training screen’s hold on it stays good', () => {
  const { base, mine, theirs } = tabs();
  const held = mine.prog.d1.spin;
  theirs.prog.d1.spin.proof = { place: 1 };
  merge(mine, base, theirs);
  assert.equal(mine.prog.d1.spin, held);
  assert.deepEqual(held.proof, { place: 1 });
});

test('an empty start on a trick here doesn’t hide real progress made there', () => {
  const { base, mine, theirs } = tabs();
  mine.prog.d1.down = { status: 'new', step: 0, proof: {}, checks: [] }; // opened the training screen, nothing saved
  theirs.prog.d1.down = { status: 'learning', step: 2, proof: {}, checks: [], reps: 20 };
  merge(mine, base, theirs);
  assert.equal(mine.prog.d1.down.status, 'learning');
  assert.equal(mine.prog.d1.down.step, 2);
  assert.equal(mine.prog.d1.down.reps, 20);
});

test('a dog or session removed in either tab stays removed', () => {
  let { base, mine, theirs } = tabs();
  theirs.dogs = theirs.dogs.filter(d => d.id !== 'd2');
  delete theirs.prog.d2;
  merge(mine, base, theirs);
  assert.deepEqual(mine.dogs.map(d => d.id), ['d1']);
  assert.equal(mine.prog.d2, undefined);

  ({ base, mine, theirs } = tabs());
  mine.dogs = mine.dogs.filter(d => d.id !== 'd2');
  delete mine.prog.d2;
  mine.sessions = [];
  theirs.prog.d1.sit.proof = { place: 1 };
  merge(mine, base, theirs);
  assert.deepEqual(mine.dogs.map(d => d.id), ['d1']);
  assert.equal(mine.prog.d2, undefined);
  assert.deepEqual(mine.sessions, []);
  assert.deepEqual(mine.prog.d1.sit.proof, { place: 1 });
});

test('dogs and sessions added in each tab are all kept, sessions in time order', () => {
  const { base, mine, theirs } = tabs();
  mine.dogs.push({ id: 'd3', name: 'Rex' });
  mine.prog.d3 = { sit: { status: 'known', step: 0 } };
  mine.sessions.push({ id: 'mine', dog: 'd1', kind: 'free', start: 3000, ms: 5e3, hits: 2, misses: 0 });
  theirs.dogs.push({ id: 'd4', name: 'Juniper' });
  theirs.prog.d4 = { down: { status: 'known', step: 0 } };
  theirs.sessions.push({ id: 'theirs', dog: 'd1', kind: 'show', start: 2000, ms: 9e3, hits: 3, misses: 1 });
  merge(mine, base, theirs);
  assert.deepEqual(mine.dogs.map(d => d.id), ['d1', 'd2', 'd4', 'd3']);
  assert.equal(mine.prog.d3.sit.status, 'known');
  assert.equal(mine.prog.d4.down.status, 'known');
  assert.deepEqual(mine.sessions.map(s => s.id), ['s1', 'theirs', 'mine']);
});

test('a session saved again under the same id takes the newer numbers', () => {
  const { base, mine, theirs } = tabs();
  Object.assign(theirs.sessions[0], { ms: 90e3, hits: 12, misses: 3 });
  merge(mine, base, theirs);
  assert.equal(mine.sessions.length, 1);
  assert.deepEqual([mine.sessions[0].ms, mine.sessions[0].hits, mine.sessions[0].misses], [90e3, 12, 3]);
});

test('this tab keeps its own dog, unless that dog is gone', () => {
  let { base, mine, theirs } = tabs();
  theirs.dog = 'd2';
  merge(mine, base, theirs);
  assert.equal(mine.dog, 'd1');

  ({ base, mine, theirs } = tabs());
  theirs.dogs = theirs.dogs.filter(d => d.id !== 'd1');
  delete theirs.prog.d1;
  theirs.dog = 'd2';
  merge(mine, base, theirs);
  assert.equal(mine.dog, 'd2');
});

test('with nothing changed here, the other tab’s save comes over whole', () => {
  const { base, mine, theirs } = tabs();
  theirs.prog.d1.spin = { status: 'known', step: 0, since: 5, proof: {}, checks: [{ t: 9, r: 'first' }] };
  theirs.dogs[1].kg = 11;
  merge(mine, base, theirs);
  assert.deepEqual(mine, theirs);
});
