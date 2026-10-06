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
import { federationAt, eraShift, effectiveYear, divergence, POD_SWING } from '../src/macro.js';
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
  // every world's neighbours stay close, wherever it is, not just Terra's: the
  // point of divergence swings by about max(1000 years, POD_SWING of itself)
  let step = 0, far = 0;
  for (let sd = 1; sd <= 10; sd++) for (let i = 0; i < 60; i++) {
    const x = ((i * 7919) % 2000) - 1000 + 0.5, y = ((i * 104729) % 2000) - 1000 + 0.5;
    const P = divergence(sd, x, y, 2000);
    far = Math.max(far, P);
    for (const [qx, qy] of [[x + 1, y], [x, y + 1]]) step = Math.max(step, Math.abs(divergence(sd, qx, qy, 2000) - P) / Math.max(1000, POD_SWING * P));
  }
  console.log(`drift: largest shift next to Terra in 2000 CE ${near} years; largest divergence step between neighbours ${step.toFixed(2)} x max(1000 years, ${POD_SWING * 100}%); largest divergence sampled ${far.toExponential(1)} years; sheets near 3000 CE technology (sampled to 60 sheets out, 40 seeds): ${farAhead}`);
  assert.ok(step <= 2, 'far-off worlds differ wildly from their own neighbours');
  assert.ok(far > 1e6, 'divergence never gets arbitrary');
  // no largest octave: it keeps growing far beyond the old 2,430-sheet scale
  const at = (d) => { const v = []; for (let sd = 1; sd <= 10; sd++) for (let a = 0; a < 12; a++) v.push(divergence(sd, d * Math.cos(a / 2), d * Math.sin(a / 2), 2000)); return v.sort((p, q) => p - q)[60]; };
  const d1 = at(10000), d2 = at(100000);
  console.log(`divergence keeps growing: median ${d1.toExponential(1)} years at 10,000 sheets, ${d2.toExponential(1)} at 100,000`);
  assert.ok(d2 > 1e6 * d1 && Number.isFinite(d2), 'divergence levels off far away');
  // how far ahead or behind far worlds run: mostly near Terra's era or not yet
  // sapient, rarely far in the future; pre-sapient worlds grow towards 60%
  const { eraGap } = await import('../src/macro.js');
  let pre = 0, farFuture = 0;
  for (let i = 0; i < 10000; i++) { const g = eraGap((i + 0.5) / 10000, 1e300); if (g < -3e5) pre++; if (g > 1e4) farFuture++; }
  console.log(`era gap in the limit: ${(pre / 100).toFixed(0)}% pre-sapient, ${(farFuture / 100).toFixed(0)}% over 10,000 years ahead`);
  assert.ok(pre > 5000 && pre < 7000 && farFuture < 800, 'far worlds: a majority pre-sapient, few far-future');
  let close = 0, n = 0;
  for (let sd = 1; sd <= 10; sd++) for (const [x, y] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) { n++; if (Math.abs(eraShift(sd, x + 0.5, y + 0.5, 2000)) < 500) close++; }
  assert.equal(close, n, "Terra's neighbours run within centuries of it");
  assert.ok(near <= 500, 'Terra\'s neighbours drift too far');
  assert.ok(farAhead >= 1, 'no world anywhere runs far ahead of Terra');
}

// Interworld federations come from the macro layer: far enough ahead of Terra,
// sheets join them, and every sheet agrees on membership whatever order the
// sheets were revealed in.
{
  // in seed 20000, one federation's domain covers all of sheets (13, -10) and
  // (14, -10), and most of (13, -9)
  const sheets = [[13, -10], [14, -10], [13, -9]];
  assert.ok(federationAt(20000, 13.5, -9.5, 2000), 'expected a federation at the test sheets');
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

// species: humans near Terra; other hominids past 300,000 years of divergence;
// other branches of the tree of life past 2.5 million, each only if it had
// already branched off from ours when history diverged; peoples carry their species
{
  const { availableSpecies, speciesAt, SPECIES_BY_ID } = await import('../src/species.js');
  for (const x of [1, -1, 3]) assert.equal(speciesAt(20000, x + 0.5, 0.5), 'human', 'Terra\'s neighbours are human');
  assert.deepEqual(availableSpecies(2e5).map(([s]) => s.id), ['human']);
  const mid = availableSpecies(1e6).map(([s]) => s.id);
  assert.ok(mid.includes('erectus') && !mid.includes('neanderthal') && !mid.includes('mammal') && !mid.includes('human'),
    'at 1 million years: only hominids that had already split off (Erectines, not Neanderthals)');
  for (const pod of [3e6, 1.3e7, 1e8, 4e8, 7e8, 2e9, 1e10]) {
    const ids = availableSpecies(pod).map(([s]) => s.id);
    assert.ok(!ids.some((id) => ['neanderthal', 'denisovan', 'archaic', 'erectus', 'habiline', 'floresian'].includes(id)), `hominids at ${pod}`);
    for (const [s] of availableSpecies(pod)) assert.ok(s.branch >= pod || s.id === 'novel', `${s.id} available though it split off after the divergence`);
  }
  // before the eukaryotes: bacteria, archaea, or a domain Terra never had; past
  // the last common ancestor, only the last
  assert.deepEqual(availableSpecies(2.2e9).map(([s]) => s.id).sort(), ['archaean', 'novel', 'prokaryote']);
  assert.ok(!availableSpecies(1.5e9).some(([s]) => s.id === 'novel'), 'novel domains need a divergence from before the eukaryotes');
  assert.deepEqual(availableSpecies(1e10).map(([s]) => s.id), ['novel']);
  // lineages are sticky: far out, you travel a long way before the lineage changes
  const runs = [];
  for (let sd = 1; sd <= 6; sd++) for (let a = 0; a < 10; a++) {
    const th = (a / 10) * 2 * Math.PI, dir = th + 1.3;
    let gx = 3000 * Math.cos(th), gy = 3000 * Math.sin(th);
    const first = speciesAt(sd, gx, gy);
    let n = 0;
    for (; n < 1500; n++) { gx += Math.cos(dir); gy += Math.sin(dir); if (speciesAt(sd, gx, gy) !== first) break; }
    runs.push(n);
  }
  runs.sort((p, q) => p - q);
  console.log(`species: median ${runs[30]} sheets of travel before the lineage changes, 3,000 sheets out`);
  assert.ok(runs[30] >= 60, 'lineages reroll every few sheets');
  const far = new World(20000);
  buildTerra(far);
  const h = generateTile(far, -333, 170, 1);   // a world of dolphin people, for this seed
  const sp = new Map();
  for (const c of h.snaps[4].culture) if (c) { const k = far.cultures.get(c).species || 'human'; sp.set(k, (sp.get(k) || 0) + 1); }
  const top = [...sp].sort((a, b) => b[1] - a[1])[0];
  console.log(`species: a far world's peoples are ${[...sp].map(([k, n]) => `${k} ${n}`).join(', ')}`);
  assert.ok(top && SPECIES_BY_ID.get(top[0]).branch >= 2.5e6, 'a deeply diverged world is not peopled by hominids');

  // species keep to the country they like: a water-bound lineage's states hold
  // coastal land, a warmth-loving one's shun the tundra
  const { lineageAt, habitatOf } = await import('../src/species.js');
  const { climateAt } = await import('../src/geo/index.js');
  const want = new Set(['aquatic', 'warm']);
  for (let rad = 300; rad < 5000 && want.size; rad += 41) for (let a = 0; a < 24 && want.size; a++) {
    const x = Math.round(rad * Math.cos(a / 24 * 2 * Math.PI)), y = Math.round(rad * Math.sin(a / 24 * 2 * Math.PI));
    const h = habitatOf(lineageAt(far.seed, x + 0.5, y + 0.5));
    if (!want.has(h) || Math.abs(climateAt(far.seed, x + 0.5, y + 0.5)) > 12 || eraShift(far.seed, x + 0.5, y + 0.5, 2000) < -250000) continue;
    want.delete(h);
    const tile = generateTile(far, x, y, 1), geo = far.geo(x, y), snap = tile.snaps[4];
    let land = 0, coast = 0, held = 0, heldCoast = 0, tundra = 0, heldTundra = 0;
    for (const r of geo.regions) {
      if (!r.cellsNow) continue;
      land++; if (r.coastal) coast++; if (r.biome === 2) tundra++;
      if (snap.owner[r.id]) { held++; if (r.coastal) heldCoast++; if (r.biome === 2) heldTundra++; }
    }
    if (h === 'aquatic') {
      console.log(`species: aquatic world ${x},${y}: coastal share of land ${(coast / land).toFixed(2)}, of state-held land ${(heldCoast / held).toFixed(2)}`);
      assert.ok(held && heldCoast / held > coast / land + 0.1, 'water-bound peoples should keep to the coasts');
    } else {
      console.log(`species: warm world ${x},${y}: tundra share of land ${(tundra / land).toFixed(2)}, of state-held land ${(heldTundra / Math.max(1, held)).toFixed(2)}`);
      assert.ok(heldTundra / Math.max(1, held) <= tundra / land, 'warmth-loving peoples should shun the tundra');
    }
  }
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
