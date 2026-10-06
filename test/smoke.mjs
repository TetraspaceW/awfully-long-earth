// Generates a patch of Big Earth around Terra and some far-off sheets, and
// checks the invariants that make sheets fit together. Run with `npm test`.

import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { buildTerra } from '../src/terra.js';
import { generateTile, canGenerate } from '../src/history/index.js';
import { edgeLinks } from '../src/geo/provinces.js';
import { regionCapacity } from '../src/geo/climate.js';
import { players, worldPowers } from '../src/world/stats.js';
import { fmtPop, fmtMoney } from '../src/core/util.js';
import { federationAt, eraShift, effectiveYear } from '../src/macro.js';
import { nationProfile } from '../src/profile.js';
import { techCap, neighbourPos, regionPos, PRESENT_LAYER as T } from '../src/core/frame.js';

const warnings = [];
const world = new World(20000);
buildTerra(world, (m) => warnings.push(m));
assert.deepEqual(warnings, [], `Earth data warnings:\n${warnings.join('\n')}`);

const order = [
  [1, 0], [-1, 0], [0, -1], [0, 1],     // around Terra
  [2, 0], [1, 1], [1, -1], [-1, 1],     // further out
  [2, 1], [3, 1], [3, 2],               // a chain out to (3, 2)
];
let total = 0;
for (const [x, y] of order) {
  assert.ok(canGenerate(world, x, y), `cannot reveal ${x},${y}`);
  const t0 = Date.now();
  const h = generateTile(world, x, y);
  const ms = Date.now() - t0;
  total += ms;
  console.log(`sheet ${x},${y}: ${ms} ms, ${h.events.length} events, ${new Set(h.snaps[4].owner).size - 1} states in 2000 CE`);
}
assert.ok(!canGenerate(world, 1, 0), 'a revealed sheet cannot be revealed again');
assert.ok(!canGenerate(world, 9, 9), 'only sheets next to revealed ones can be revealed');

// invariants
for (const h of world.tiles.values()) {
  const geo = world.geo(h.x, h.y);
  assert.equal(h.snaps.length, 5);
  for (const s of h.snaps) {
    assert.equal(s.owner.length, geo.regions.length);
    for (const o of s.owner) assert.ok(o === 0 || world.polities.has(o), `unknown polity ${o} in ${h.x},${h.y},${h.t}`);
    for (const c of s.culture) assert.ok(c === 0 || world.cultures.has(c), `unknown culture ${c}`);
    for (const t of s.tech) assert.ok(Number.isFinite(t) && t >= 0 && t < 12, `bad tech ${t}`);
  }
}

// Terra's present-day neighbours are in Terra's era
{
  for (const [x, y] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) {
    const g = world.geo(x, y), sn = world.tile(x, y, T).snaps[4];
    let tw = 0, ts = 0;
    for (const r of g.regions) if (sn.culture[r.id]) { const c = regionCapacity(r, 2000); ts += sn.tech[r.id] * c; tw += c; }
    assert.ok(ts / tw > 7 && ts / tw < 10.5, `sheet ${x},${y} mean technology ${(ts / tw).toFixed(2)} in 2000 CE`);
  }
}

// order independence: the same sheet revealed directly, after a neighbour on
// one side, or after neighbours on two others, looks alike at the macro scale
{
  const stats = (w, x, y) => {
    const g = w.geo(x, y), sn = w.tile(x, y, T).snaps[4];
    let ready = 0, owned = 0, tw = 0, ts = 0, oc = 0;
    const cells = new Map();
    for (const r of g.regions) {
      const c = regionCapacity(r, 2000);
      if (sn.culture[r.id]) { ts += sn.tech[r.id] * c; tw += c; }
      if (!sn.culture[r.id] || sn.tech[r.id] < 2.6 || c < 0.3) continue;
      ready++;
      const o = sn.owner[r.id];
      if (o) { owned++; oc += r.cells; cells.set(o, (cells.get(o) || 0) + r.cells); }
    }
    return { S: ready ? owned / ready : 0, big: oc ? Math.max(...cells.values()) / oc : 0, tech: tw ? ts / tw : 0 };
  };
  const acc = { direct: [], west: [], 'north+east': [] };
  for (const seed of [11, 12, 13, 14]) for (const [x, y] of [[3, 2], [-6, -1]]) {
    const mk = () => { const w = new World(seed); buildTerra(w); return w; };
    let w = mk(); generateTile(w, x, y); acc.direct.push(stats(w, x, y));
    w = mk(); generateTile(w, x - 1, y); generateTile(w, x, y); acc.west.push(stats(w, x, y));
    w = mk(); generateTile(w, x, y - 1); generateTile(w, x + 1, y); generateTile(w, x, y); acc['north+east'].push(stats(w, x, y));
  }
  const avg = (l, k) => l.reduce((a, b) => a + b[k], 0) / l.length;
  console.log(`order check: ${Object.entries(acc).map(([m, l]) => `${m} S ${avg(l, 'S').toFixed(2)} biggest ${avg(l, 'big').toFixed(2)} tech ${avg(l, 'tech').toFixed(2)}`).join(' | ')}`);
  for (const [k, tol] of [['S', 0.12], ['big', 0.12], ['tech', 0.4]]) {
    const v = Object.values(acc).map((l) => avg(l, k));
    assert.ok(Math.max(...v) - Math.min(...v) < tol, `order dependence in ${k}: ${v.map((x) => x.toFixed(2))}`);
  }
}

// drift from Terra: tiny next to Terra, large far away, small between any two
// neighbours
{
  let near = 0, farAhead = 0;
  for (let sd = 1; sd <= 40; sd++) {
    for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]]) near = Math.max(near, Math.abs(eraShift(sd, x + 0.5, y + 0.5, 2000)));
    for (let y = -60; y <= 60; y += 6) for (let x = -60; x <= 60; x += 6) if (techCap(effectiveYear(sd, x + 0.5, y + 0.5, 2000)) >= 10.5) farAhead++;
  }
  let step = 0;
  for (let sd = 1; sd <= 10; sd++) for (let i = 0; i < 60; i++) {
    const x = ((i * 7919) % 400) - 200 + 0.5, y = ((i * 104729) % 400) - 200 + 0.5;
    step = Math.max(step, Math.abs(eraShift(sd, x + 1, y, 2000) - eraShift(sd, x, y, 2000)), Math.abs(eraShift(sd, x, y + 1, 2000) - eraShift(sd, x, y, 2000)));
  }
  console.log(`drift: largest shift next to Terra ${near} years; largest step between neighbours anywhere ${step} years; sheets near 3000 CE technology (sampled to 60 sheets out, 40 seeds): ${farAhead}`);
  assert.ok(step <= 600, 'far-off worlds differ wildly from their own neighbours');
  assert.ok(near <= 500, 'Terra\'s neighbours drift too far');
  assert.ok(farAhead >= 1, 'no world anywhere runs far ahead of Terra');
}

// Interworld federations come from the macro layer: far enough ahead of Terra,
// sheets join them, and every sheet agrees on membership whatever order the
// sheets were revealed in.
{
  // in seed 20000, one federation's domain covers almost all of sheets
  // (-24, -40) and (-23, -40), and part of (-24, -39)
  const sheets = [[-24, -40], [-23, -40], [-24, -39]];
  assert.ok(federationAt(20000, -23.5, -39.5, 2000), 'expected a federation at the test sheets');
  const check = (w) => {
    for (const [x, y] of sheets) {
      const g = w.geo(x, y), sn = w.tile(x, y, T).snaps[4];
      let should = 0, are = 0, stray = 0, owned = 0;
      for (const r of g.regions) {
        const o = sn.owner[r.id];
        if (!o) continue;
        owned++;
        const fed = federationAt(w.seed, ...regionPos(x, y, r), 2000);
        const p = w.polities.get(o);
        if (fed) { should++; if (p?.key === fed.key) are++; } else if (p?.macro) stray++;
      }
      if (should >= 10) assert.ok(are / should >= 0.75, `${x},${y}: only ${are}/${should} federal provinces follow the domains`);
      if (owned) assert.ok(stray / owned <= 0.1, `${x},${y}: ${stray} provinces held by a federation outside its domain`);
    }
  };
  const share = (w) => sheets.map(([x, y]) => {
    let own = 0, f = 0;
    for (const o of w.tile(x, y, T).snaps[4].owner) if (o) { own++; if (w.polities.get(o)?.macro) f++; }
    return own ? f / own : 0;
  });
  const a = new World(20000), b = new World(20000);
  buildTerra(a); buildTerra(b);
  for (const [x, y] of sheets) generateTile(a, x, y);
  for (const [x, y] of sheets.slice().reverse()) generateTile(b, x, y);
  check(a); check(b);
  const sa = share(a), sb = share(b);
  const diff = sa.reduce((d, v, i) => d + Math.abs(v - sb[i]), 0) / sa.length;
  const feds = [...worldPowers(a, 2000).values()].filter((p) => a.polities.get(p.id).macro);
  const span = Math.max(0, ...feds.map((p) => p.tiles.size));
  console.log(`federations: federated share ${sa.map((v) => v.toFixed(2)).join(' ')}; mean difference between reveal orders ${diff.toFixed(3)}; ${feds.map((p) => `${a.polityName(p.id, 2000)} (${p.tiles.size} world${p.tiles.size === 1 ? '' : 's'})`).join(', ')}`);
  assert.ok(Math.min(sa[0], sa[1]) > 0.5, 'sheets inside a federation\'s domain do not join it');
  assert.ok(diff < 0.05, 'reveal order changes how far worlds have federated');
  assert.ok(span >= 2, 'no federation spans several worlds');
}

// nation profiles: every state on the map can be profiled
{
  const rome = nationProfile(world, world.byKey('e:rome'), 100);
  assert.ok(rome.alive && rome.prov > 10 && rome.peoples.length >= 3 && rome.type === 'empire', 'Rome profile');
  let n = 0;
  for (const h of world.tiles.values()) {
    for (const o of new Set(h.snaps[2].owner)) {
      if (!o) continue;
      const b = nationProfile(world, o, h.t * 1000 + 500);
      assert.ok(b && b.government && b.origin && b.series.length, `profile for ${o}`);
      n++;
    }
  }
  console.log(`nation profiles: built ${n}; e.g. ${rome.name}: ${rome.government}`);
}

// across Terra's eastern edge, land should mostly continue as land
console.log(`Terra/east edge land links: ${edgeLinks(world.geo(0, 0), world.geo(1, 0), 'E').length}`);

// Big Earth is an endless plane: no poles, no wrap, and far sheets generate
{
  assert.deepEqual(neighbourPos(0, -4, 'N'), { x: 0, y: -5 }, 'no north pole');
  assert.deepEqual(neighbourPos(4, 0, 'E'), { x: 5, y: 0 }, 'no east-west wrap');
  const far = new World(20000);
  buildTerra(far);
  for (let x = 1; x <= 12; x++) generateTile(far, x, 0);   // a 12-sheet march east
  for (let y = -1; y >= -6; y--) generateTile(far, 12, y); // then north, past the old pole
  const a = far.geo(5, 0), b = far.geo(-5, 0);
  let same = 0;
  for (let k = 0; k < a.elev.length; k++) if (a.elev[k] === b.elev[k]) same++;
  assert.ok(same < a.elev.length / 2, 'sheets 10 apart are no longer the same sheet');
  const shifts = [[12, -6], [40, 0], [0, 80], [-150, 30]].map(([x, y]) => eraShift(far.seed, x + 0.5, y + 0.5, 2000));
  console.log(`endless plane: 18 far sheets generated; era shifts at 12/-6, 40/0, 0/80, -150/30: ${shifts.join(', ')}`);
}

// round trip
const json = world.serialize();
const w2 = World.deserialize(json);
assert.equal(w2.tiles.size, world.tiles.size);
assert.equal(w2.polities.size, world.polities.size);
console.log(`save size: ${(json.length / 1024).toFixed(0)} KB for ${world.tiles.size} tiles`);

const ring = new Set(['0,0', '1,0', '-1,0', '0,-1', '0,1', '2,0', '1,1', '1,-1']);
console.log('\nLeading players at 2000 CE (Terra and neighbours):');
for (const p of players(world, 2000, ring, 12)) console.log(`  ${p.name.padEnd(36)} ${fmtPop(p.pop).padStart(9)} ${fmtMoney(p.gdp).padStart(10)}`);

const sample = world.tile(1, 0, T);
console.log('\nSample chronicle, east of Terra, 1000-2000 CE:');
for (const ev of sample.events.slice(0, 25)) console.log(`  ${ev.y}: ${ev.text}`);
console.log(`\nall ok (${total} ms generating)`);
