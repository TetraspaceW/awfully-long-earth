// Generates a patch of Big Earth in every direction and checks the invariants
// that make tiles fit together. Run with `npm test`.

import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { buildEarth } from '../src/earth.js';
import { generateTile, canGenerate } from '../src/sim.js';
import { getGeo, edgeLinks, neighbourPos } from '../src/geo.js';
import { players, fmtPop, fmtMoney } from '../src/stats.js';
import { tileKey } from '../src/constants.js';

const warnings = [];
const world = new World(20000);
buildEarth(world, (m) => warnings.push(m));
assert.deepEqual(warnings, [], `Earth data warnings:\n${warnings.join('\n')}`);

const order = [
  [1, 0, 1], [-1, 0, 1], [0, -1, 1], [0, 1, 1],   // around Earth today
  [0, 0, -1], [0, 0, -2], [1, 0, 0], [1, 0, -1],  // back in time
  [2, 0, 1], [1, 1, 1], [1, -1, 1], [-1, 0, 0],   // further out
  [0, 0, 2],                                        // speculative future
  [3, 2, 1], [3, 2, 0],                             // isolated, then the past of it
  [1, 0, -2], [1, 0, -3], [0, 0, -3],               // deep time
];
let total = 0;
for (const [x, y, t] of order) {
  if (!canGenerate(world, x, y, t)) {
    // isolated tiles are generated through a chain of neighbours
    assert.ok(world.hasTile(x, y, t) || x === 3, `cannot generate ${x},${y},${t}`);
    if (x === 3) {
      for (const [a, b, c] of [[2, 1, 1], [3, 1, 1], [3, 2, 1]]) if (canGenerate(world, a, b, c)) generateTile(world, a, b, c);
      continue;
    }
  }
  const t0 = Date.now();
  const h = generateTile(world, x, y, t);
  const ms = Date.now() - t0;
  total += ms;
  console.log(`tile ${tileKey(x, y, t)}: ${ms} ms, ${h.events.length} events, ${new Set(h.snaps[4].owner).size - 1} polities at end`);
}

// invariants
for (const h of world.tiles.values()) {
  const geo = getGeo(h.x, h.y);
  assert.equal(h.snaps.length, 5);
  for (const s of h.snaps) {
    assert.equal(s.owner.length, geo.regions.length);
    for (const o of s.owner) assert.ok(o === 0 || world.polities.has(o), `unknown polity ${o} in ${h.x},${h.y},${h.t}`);
    for (const c of s.culture) assert.ok(c === 0 || world.cultures.has(c), `unknown culture ${c}`);
    for (const t of s.tech) assert.ok(Number.isFinite(t) && t >= 0 && t < 12, `bad tech ${t}`);
  }
  // the time faces agree
  const next = world.tile(h.x, h.y, h.t + 1);
  if (next) {
    const a = h.snaps[4], b = next.snaps[0];
    assert.deepEqual([...a.owner], [...b.owner], `owner mismatch across time at ${h.x},${h.y},${h.t}`);
    assert.deepEqual([...a.culture], [...b.culture], `culture mismatch across time at ${h.x},${h.y},${h.t}`);
  }
}

// across Earth's eastern edge, land should mostly continue as land
const e = getGeo(0, 0), east = getGeo(1, 0);
console.log(`Earth/east edge land links: ${edgeLinks(e, east, 'E').length}`);
assert.ok(neighbourPos(0, -4, 'N') === null, 'north pole has no neighbour');

// round trip
const json = world.serialize();
const w2 = World.deserialize(json);
assert.equal(w2.tiles.size, world.tiles.size);
assert.equal(w2.polities.size, world.polities.size);
console.log(`save size: ${(json.length / 1024).toFixed(0)} KB for ${world.tiles.size} tiles`);

const ring = new Set(['0,0', '1,0', '-1,0', '0,-1', '0,1', '2,0', '1,1', '1,-1']);
console.log('\nLeading players at 2000 CE (Earth and neighbours):');
for (const p of players(world, 2000, ring, 12)) console.log(`  ${p.name.padEnd(36)} ${fmtPop(p.pop).padStart(9)} ${fmtMoney(p.gdp).padStart(10)}`);
console.log('\nLeading players at 1000 BCE:');
for (const p of players(world, -1000, null, 6)) console.log(`  ${p.name.padEnd(36)} ${fmtPop(p.pop).padStart(9)} ${fmtMoney(p.gdp).padStart(10)}`);

const sample = world.tile(1, 0, 1);
console.log('\nSample chronicle, east of Earth, 1000-2000 CE:');
for (const ev of sample.events.slice(0, 25)) console.log(`  ${ev.y}: ${ev.text}`);
const deep = world.tile(0, 0, -2);
console.log('\nSample chronicle, Earth, 2000-1000 BCE:');
for (const ev of deep.events.slice(0, 20)) console.log(`  ${ev.y}: ${ev.text}`);
console.log(`\nall ok (${total} ms generating)`);
