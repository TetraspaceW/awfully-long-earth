import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/world.js';
import { buildTerra } from '../../src/terra.js';
import { generateTile, canGenerate, FORWARD_SYSTEMS } from '../../src/history/index.js';
import { BigEarth } from '../../src/engine.js';

const fresh = () => { const w = new World(77); buildTerra(w); return w; };
const same = (a, b) => a.snaps.every((s, k) =>
  [...s.owner].join() === [...b.snaps[k].owner].join() && [...s.culture].join() === [...b.snaps[k].culture].join()
  && [...s.tech].join() === [...b.snaps[k].tech].join());

test('the forward pipeline is a list of named systems', () => {
  const names = FORWARD_SYSTEMS.map((s) => s.name);
  assert.equal(new Set(names).size, names.length, 'system names are unique (they key the random streams)');
  for (const s of FORWARD_SYSTEMS) assert.equal(typeof s.step, 'function');
  assert.ok(Object.isFrozen(FORWARD_SYSTEMS));
});

test('a system drawing random numbers does not change what the others do', () => {
  const noisy = { name: 'noisy', step(run, tick, rng) { for (let i = 0; i < 50; i++) rng.next(); } };
  const a = generateTile(fresh(), 1, 0, 1);
  const b = generateTile(fresh(), 1, 0, 1, { systems: [...FORWARD_SYSTEMS.slice(0, 5), noisy, ...FORWARD_SYSTEMS.slice(5)] });
  assert.ok(same(a, b));
});

test('narration cannot change history', () => {
  // a system that only writes to the chronicle, consuming its random stream
  const gossip = { name: 'gossip', step(run, { Y }) { run.log.ev(Y, 'culture', 'Gossip.'); run.log.pick([1, 2, 3]); } };
  const a = generateTile(fresh(), 1, 0, 1);
  const b = generateTile(fresh(), 1, 0, 1, { systems: [gossip, ...FORWARD_SYSTEMS] });
  assert.ok(same(a, b));
  assert.ok(b.events.some((e) => e.text === 'Gossip.'));
});

test('a custom system can change history, and runs every step', () => {
  let steps = 0;
  // a game rule: no state may hold the province with id 0
  const rule = { name: 'free-province', step(run) { steps++; run.snap.owner[0] = 0; } };
  const w = fresh();
  const tile = generateTile(w, 1, 0, 1, { systems: [...FORWARD_SYSTEMS, rule] });
  assert.ok(steps >= 20, `ran ${steps} times`);
  for (const s of tile.snaps.slice(1)) assert.equal(s.owner[0], 0);
});

test('the engine generates with its own pipeline', () => {
  const seen = [];
  const watcher = { name: 'watcher', step(run, { s, Y }) { if (s) seen.push(Y); } };
  const e = BigEarth.create({ seed: 5, ring: [], systems: [...FORWARD_SYSTEMS, watcher] });
  e.reveal(1, 0);
  assert.equal(seen.length, 20);
  assert.equal(seen[0], 1050);
});

test('generators fill tiles in every direction in time', () => {
  const w = fresh();
  generateTile(w, 2, 0, 1);              // forwards, with neighbours only at the side
  generateTile(w, 2, 0, -1);             // with no neighbours at all: a drawn, spun-up start
  assert.ok(canGenerate(w, 2, 0, 0));
  const gap = generateTile(w, 2, 0, 0);  // between a past and a future
  assert.deepEqual([...gap.snaps[0].owner], [...w.tile(2, 0, -1).snaps[4].owner]);
  assert.deepEqual([...gap.snaps[4].owner], [...w.tile(2, 0, 1).snaps[0].owner]);
  const back = generateTile(w, 2, 0, -2); // backwards from a future
  assert.deepEqual([...back.snaps[4].owner], [...w.tile(2, 0, -1).snaps[0].owner]);
});
