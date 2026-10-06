import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng, hashN } from '../../src/core/random.js';
import { LRU, Emitter, piecewise, interpTable, clamp } from '../../src/core/util.js';
import { tileKey, parseKey, neighbourPos, regionPos, isTerra, formatYear, layerOf, snapYear, tileStart, techCap, eraName } from '../../src/core/frame.js';

test('rng is deterministic per seed', () => {
  const a = new Rng(hashN(1, 'x')), b = new Rng(hashN(1, 'x')), c = new Rng(hashN(2, 'x'));
  const sa = [a.next(), a.next(), a.next()];
  assert.deepEqual(sa, [b.next(), b.next(), b.next()]);
  assert.notDeepEqual(sa, [c.next(), c.next(), c.next()]);
  for (let i = 0; i < 1000; i++) { const v = a.next(); assert.ok(v >= 0 && v < 1); }
});

test('LRU evicts the least recently used', () => {
  const l = new LRU(2);
  l.set('a', 1); l.set('b', 2); l.get('a'); l.set('c', 3);
  assert.equal(l.has('b'), false);
  assert.equal(l.get('a'), 1);
  assert.equal(l.size, 2);
});

test('Emitter delivers, unsubscribes and forwards to *', () => {
  const e = new Emitter(), got = [], all = [];
  const off = e.on('x', (p) => got.push(p));
  e.on('*', (ev) => all.push(ev.type));
  e.once('x', (p) => got.push('once' + p));
  e.emit('x', 1); off(); e.emit('x', 2);
  assert.deepEqual(got, [1, 'once1']);
  assert.deepEqual(all, ['x', 'x']);
});

test('math helpers', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(piecewise([[0, 0], [10, 1]], 5), 0.5);
  assert.equal(piecewise([[0, 0], [10, 1]], 20), 1);
  assert.equal(interpTable([0, 10, 20], 1.5), 15);
});

test('coordinates and timeline', () => {
  assert.deepEqual(parseKey(tileKey(-3, 4, -2)), { x: -3, y: 4, t: -2 });
  assert.deepEqual(neighbourPos(0, 0, 'N'), { x: 0, y: -1 });
  assert.ok(isTerra(0, 0) && !isTerra(1, 0));
  const [gx, gy] = regionPos(2, 3, { cx: 119.5, cy: 59.5 });
  assert.equal(gx, 2.5); assert.equal(gy, 3.5);
  assert.equal(formatYear(-500), '500 BCE');
  assert.equal(formatYear(0), '1 CE');
  assert.equal(layerOf(1999), 1); assert.equal(layerOf(-1), -1);
  assert.equal(snapYear(1, 4), 2000); assert.equal(tileStart(-3), -3000);
  assert.ok(techCap(2000) > techCap(0));
  assert.equal(eraName(9.4), 'Information age');
  assert.equal(eraName(99), 'Spacefaring');
});
