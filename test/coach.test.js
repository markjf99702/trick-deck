import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/coach.js';
import { BY_ID, TRICKS } from '../js/tricks.js';

test('push, drop, stick', () => {
  assert.deepEqual(C.judgeSet([true, true, true, true, true]), { hits: 5, verdict: 'push' });
  assert.equal(C.judgeSet([true, true, true, true, false]).verdict, 'stick');
  assert.equal(C.judgeSet([true, false, true, false, true]).verdict, 'stick');
  assert.equal(C.judgeSet([true, true, false, false, false]).verdict, 'drop');
  assert.equal(C.judgeSet([false, false, false, false, false]).verdict, 'drop');
});

test('advice moves one step at a time and knows the ends', () => {
  const spin = BY_ID.spin; // five steps
  assert.deepEqual(C.advise(spin, 0, 'push'), { to: 1 });
  assert.deepEqual(C.advise(spin, 4, 'push'), { to: 4, done: true });
  assert.deepEqual(C.advise(spin, 2, 'drop'), { to: 1, easier: false });
  assert.deepEqual(C.advise(spin, 0, 'drop'), { to: 0, easier: true });
  assert.deepEqual(C.advise(spin, 3, 'stick'), { to: 3 });
});

test('suggestions start with card 0, then open up as tricks are learned', () => {
  assert.equal(C.suggestions({}, 1)[0].id, 'charge');
  const first = C.suggestions({}, 50).map(t => t.id);
  assert.ok(!first.includes('down'), 'Down waits for Sit');
  const prog = { charge: { status: 'known' }, sit: { status: 'known' } };
  const next = C.suggestions(prog, 50).map(t => t.id);
  assert.ok(next.includes('down'));
  assert.ok(!next.includes('sit'));
  assert.ok(next.indexOf('shake') < next.indexOf('stay'), 'easier first');
});

test('titles', () => {
  assert.equal(C.titleFor(0).name, 'New recruit');
  assert.equal(C.titleFor(1).name, 'Good dog');
  assert.equal(C.titleFor(9).name, 'Clever dog');
  assert.equal(C.titleFor(9).next.at, 10);
  assert.equal(C.titleFor(TRICKS.length).name, 'Legend');
  assert.equal(C.titleFor(TRICKS.length).next, null);
});

test('proofing: held positions need duration, moves do not', () => {
  assert.equal(C.proofItems(BY_ID.sit).length, 4);
  assert.equal(C.proofItems(BY_ID.spin).length, 3);
  assert.ok(C.proofDone(BY_ID.spin, { proof: { place: 1, distraction: 1, distance: 1 } }));
  assert.ok(!C.proofDone(BY_ID.sit, { proof: { place: 1, distraction: 1, distance: 1 } }));
});

test('streak survives until a whole day is missed', () => {
  const now = new Date(2026, 8, 25, 18, 0).getTime();
  const at = (d, h = 9) => ({ start: new Date(2026, 8, d, h).getTime() });
  assert.equal(C.streak([at(23), at(24), at(25)], now), 3);
  assert.equal(C.streak([at(23), at(24)], now), 2, 'not trained yet today');
  assert.equal(C.streak([at(22), at(24), at(25)], now), 2);
  assert.equal(C.streak([at(20)], now), 0);
  assert.equal(C.streak([], now), 0);
});

test('calendar ends on the current week and sums minutes per day', () => {
  const now = new Date(2026, 8, 25, 18, 0).getTime(); // a Friday
  const days = C.calendar([
    { start: new Date(2026, 8, 25, 8).getTime(), ms: 60e3 },
    { start: new Date(2026, 8, 25, 19).getTime(), ms: 120e3 },
  ], 12, now);
  assert.equal(days.length, 84);
  assert.equal(days[0].date.getDay(), 0, 'weeks start on Sunday');
  const today = days.find(d => d.key === C.dayKey(now));
  assert.equal(today.ms, 180e3);
  assert.equal(days.filter(d => d.future).length, 1, 'Saturday is still to come');
});

test('treat calories follow RER × life stage, 10% for treats', () => {
  assert.equal(Math.round(C.rer(10)), 394);
  const dog = { kg: 10, stage: 'adult', treat: 'small' };
  assert.equal(Math.round(C.dailyKcal(dog)), 630);
  const r = C.treatReport(dog, 30);
  assert.equal(r.kcal, 90);
  assert.equal(Math.round(r.budget), 63);
  assert.ok(r.over);
  assert.ok(!C.treatReport({ ...dog, treat: 'kibble' }, 30).over);
  assert.equal(C.treatReport({ treat: 'small' }, 5).budget, null, 'no weight, no budget');
  assert.equal(C.treatKcal({ treat: 'custom', treatKcal: '4.5' }), 4.5);
});

test('reliability counts first-try answers in the last ten', () => {
  const checks = [...Array(12)].map((_, i) => ({ r: i < 4 ? 'miss' : 'first' }));
  assert.deepEqual(C.reliability(checks), { first: 8, total: 10 });
});

test('durations read naturally', () => {
  assert.equal(C.duration(42e3), '42 s');
  assert.equal(C.duration(185e3), '3 min');
  assert.equal(C.duration(80 * 60e3), '1 h 20 min');
  assert.equal(C.clock(125e3), '2:05');
});
