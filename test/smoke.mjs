// Generates a patch of Big Earth in every direction and checks the invariants
// that make tiles fit together. Run with `npm test`.

import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { buildTerra } from '../src/terra.js';
import { generateTile, canGenerate } from '../src/history/index.js';
import { edgeLinks } from '../src/geo/provinces.js';
import { regionCapacity } from '../src/geo/climate.js';
import { players } from '../src/world/stats.js';
import { fmtPop, fmtMoney } from '../src/core/util.js';
import { federationAt, eraShift, effectiveYear, divergence, POD_SWING } from '../src/macro.js';
import { nationProfile } from '../src/profile.js';
import { techCap, tileKey, neighbourPos, regionPos } from '../src/core/frame.js';

const warnings = [];
const world = new World(20000);
buildTerra(world, (m) => warnings.push(m));
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
  const geo = world.geo(h.x, h.y);
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

// generating backwards must not pile all change into a tile's last 250 years
const churn = (a, b) => {
  let n = 0, c = 0;
  for (let i = 0; i < a.owner.length; i++) if (a.culture[i] || b.culture[i]) { n++; if (a.owner[i] !== b.owner[i]) c++; }
  return c / Math.max(1, n);
};
for (const t of [-1, -2, -3]) {
  const s = world.tile(0, 0, t).snaps;
  const inner = (churn(s[0], s[1]) + churn(s[1], s[2]) + churn(s[2], s[3])) / 3;
  const last = churn(s[3], s[4]);
  assert.ok(last < inner * 2 + 0.1, `backward tile ${t}: last-interval churn ${last.toFixed(2)} vs ${inner.toFixed(2)}`);
}
// the speculative future should not freeze
{
  const s = world.tile(0, 0, 2).snaps;
  assert.ok(churn(s[0], s[4]) > 0.1, `Terra's future barely changes (${churn(s[0], s[4]).toFixed(2)})`);
}

// far enough ahead, technology allows federations spanning several worlds
{
  const fw = new World(20000);
  buildTerra(fw);
  const ring = [[1, 0], [-1, 0], [0, -1], [0, 1]];
  for (const [x, y] of ring) generateTile(fw, x, y, 1);
  for (let t = 2; t <= 4; t++) { generateTile(fw, 0, 0, t); for (const [x, y] of ring) generateTile(fw, x, y, t); }
  const top = players(fw, 5000, null, 3);
  const span = Math.max(...top.map((p) => (p.tiles ? p.tiles.size : 0)));
  console.log(`5000 CE: ${top.map((p) => `${p.name} (${p.tiles ? p.tiles.size : '?'} worlds)`).join(', ')}`);
  assert.ok(span >= 2, 'no multi-world federation by 5000 CE');
}

// order independence: the same sheet and era reached forwards, directly and
// backwards should look alike at the macro scale
{
  const stats = (w, x, y, t) => {
    const g = w.geo(x, y), h = w.tile(x, y, t);
    let S = 0, big = 0, tech = 0;
    for (let k = 0; k < 5; k++) {
      const sn = h.snaps[k], Y = t * 1000 + k * 250;
      let ready = 0, owned = 0, tw = 0, ts = 0, oc = 0;
      const cells = new Map();
      for (const r of g.regions) {
        const c = regionCapacity(r, Y);
        if (sn.culture[r.id]) { ts += sn.tech[r.id] * c; tw += c; }
        if (!sn.culture[r.id] || sn.tech[r.id] < 2.6 || c < 0.3) continue;
        ready++;
        const o = sn.owner[r.id];
        if (o) { owned++; oc += r.cells; cells.set(o, (cells.get(o) || 0) + r.cells); }
      }
      S += (ready ? owned / ready : 0) / 5; tech += (tw ? ts / tw : 0) / 5;
      big += (oc ? Math.max(...cells.values()) / oc : 0) / 5;
    }
    return { S, big, tech };
  };
  for (const T of [-4, 3]) {
    const acc = { forward: [], direct: [], backward: [] };
    for (const seed of [11, 12, 13]) for (const [x, y] of [[3, 2], [-3, -1]]) {
      const mk = () => { const w = new World(seed); buildTerra(w); return w; };
      let w = mk(); generateTile(w, x, y, T - 2); generateTile(w, x, y, T - 1); generateTile(w, x, y, T); acc.forward.push(stats(w, x, y, T));
      w = mk(); generateTile(w, x, y, T); acc.direct.push(stats(w, x, y, T));
      w = mk(); generateTile(w, x, y, T + 2); generateTile(w, x, y, T + 1); generateTile(w, x, y, T); acc.backward.push(stats(w, x, y, T));
    }
    const avg = (l, k) => l.reduce((a, b) => a + b[k], 0) / l.length;
    const line = Object.entries(acc).map(([m, l]) => `${m} S ${avg(l, 'S').toFixed(2)} biggest ${avg(l, 'big').toFixed(2)} tech ${avg(l, 'tech').toFixed(2)}`);
    console.log(`order check t=${T}: ${line.join(' | ')}`);
    for (const k of ['S', 'big']) {
      const v = Object.values(acc).map((l) => avg(l, k));
      assert.ok(Math.max(...v) - Math.min(...v) < 0.15, `order dependence in ${k} at t=${T}: ${v.map((x) => x.toFixed(2))}`);
    }
    const tv = Object.values(acc).map((l) => avg(l, 'tech'));
    assert.ok(Math.max(...tv) - Math.min(...tv) < 0.4, `order dependence in tech at t=${T}: ${tv.map((x) => x.toFixed(2))}`);
  }
}

// filling a gap between a known past and a known future: change is spread over
// the millennium instead of piling up at the end, and peoples stay put
{
  const ch = (a, b, f) => { let n = 0, c = 0; for (let i = 0; i < a[f].length; i++) { if (!a.culture[i] && !b.culture[i]) continue; n++; if (a[f][i] !== b[f][i]) c++; } return c / Math.max(1, n); };
  const own = [0, 0, 0, 0], cul = [0, 0, 0, 0];
  let runs = 0;
  for (const seed of [1, 2, 3]) for (const [x, y, T] of [[3, 2, -3], [-2, 1, 0]]) {
    const w = new World(seed); buildTerra(w);
    generateTile(w, x, y, T - 1); generateTile(w, x, y, T + 1);
    const g = generateTile(w, x, y, T);
    assert.deepEqual([...g.snaps[0].owner], [...w.tile(x, y, T - 1).snaps[4].owner], 'gap tile must start where its past ends');
    assert.deepEqual([...g.snaps[4].owner], [...w.tile(x, y, T + 1).snaps[0].owner], 'gap tile must end where its future starts');
    for (let k = 0; k < 4; k++) { own[k] += ch(g.snaps[k], g.snaps[k + 1], 'owner'); cul[k] += ch(g.snaps[k], g.snaps[k + 1], 'culture'); }
    runs++;
  }
  const o = own.map((v) => v / runs), c = cul.map((v) => v / runs);
  console.log(`gap tiles: provinces changing hands ${o.map((v) => v.toFixed(2)).join(' ')}; peoples ${c.map((v) => v.toFixed(2)).join(' ')}`);
  assert.ok(o[3] < 1.6 * Math.min(...o), 'gap tile change piles up at the end');
  assert.ok(Math.max(...c) < 0.12, 'gap tile replaces too many peoples');
}

// drift from Terra: tiny next to Terra's record, large far away in space and time,
// and small between any two neighbours
{
  let near = 0, farDeep = 0;
  for (let sd = 1; sd <= 40; sd++) {
    for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]]) near = Math.max(near, Math.abs(eraShift(sd, x + 0.5, y + 0.5, 2000)));
    for (let y = -60; y <= 60; y += 6) for (let x = -60; x <= 60; x += 6) if (techCap(effectiveYear(sd, x + 0.5, y + 0.5, -2500)) >= 10) farDeep++;
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
  console.log(`drift: largest shift next to Terra in 2000 CE ${near} years; largest divergence step between neighbours ${step.toFixed(2)} x max(1000 years, ${POD_SWING * 100}%); largest divergence sampled ${far.toExponential(1)} years; world-state-level sheets in 2500 BCE (sampled to 60 sheets out, 40 seeds): ${farDeep}`);
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
  assert.ok(near <= 500, 'Terra\'s present-day neighbours drift too far');
  assert.ok(farDeep >= 1, 'far reaches never get strange enough');
}

// multi-world federations come from the macro layer, so every sheet agrees on
// membership whatever order the sheets were surveyed in
{
  const check = (w) => {
    for (const h of w.tiles.values()) {
      const g = w.geo(h.x, h.y);
      for (let k = 0; k < 5; k++) {
        const Y = h.t * 1000 + k * 250;
        let should = 0, are = 0, stray = 0, owned = 0;
        for (const r of g.regions) {
          const o = h.snaps[k].owner[r.id];
          if (!o) continue;
          owned++;
          const fed = federationAt(w.seed, ...regionPos(h.x, h.y, r), Y);
          const p = w.polities.get(o);
          if (fed) { should++; if (p?.key === fed.key) are++; } else if (p?.macro) stray++;
        }
        if (should >= 10) assert.ok(are / should >= 0.75, `${h.x},${h.y} at ${Y}: only ${are}/${should} federal provinces follow the domains`);
        if (owned) assert.ok(stray / owned <= 0.1, `${h.x},${h.y} at ${Y}: ${stray} provinces held by a federation outside its domain`);
      }
    }
  };
  const a = new World(20000), b = new World(20000);
  buildTerra(a); buildTerra(b);
  for (const t of [1, 2, 3, 4, 5]) { generateTile(a, 1, 0, t); generateTile(a, 2, 0, t); }
  for (const t of [1, 2, 3, 4, 5]) generateTile(b, 2, 0, t);   // far sheet first this time
  for (const t of [5, 4, 3, 2, 1]) if (!b.hasTile(1, 0, t)) generateTile(b, 1, 0, t);
  check(a); check(b);
  // smooth: no world flips wholesale in or out between snapshots, and the two
  // survey orders agree on how far each world has acceded
  let maxJump = 0, diff = 0, n = 0;
  for (const [x, y] of [[1, 0], [2, 0]]) {
    let prev = null;
    for (let Y = 2250; Y < 6000; Y += 250) {
      const t = Math.floor(Y / 1000), k = (Y % 1000) / 250;
      const val = (w) => {
        const sn = w.tile(x, y, t).snaps[k];
        let own = 0, f = 0;
        for (const o of sn.owner) if (o) { own++; if (w.polities.get(o)?.macro) f++; }
        return own ? f / own : 0;
      };
      const va = val(a), vb = val(b);
      diff += Math.abs(va - vb); n++;
      if (prev !== null) maxJump = Math.max(maxJump, Math.abs(va - prev));
      prev = va;
    }
  }
  console.log(`federations: largest change in a world's federated share between snapshots ${maxJump.toFixed(2)}; mean difference between survey orders ${(diff / n).toFixed(3)}`);
  assert.ok(maxJump <= 0.8, 'a world flips wholesale into or out of a federation');
  assert.ok(diff / n < 0.05, 'survey order changes how far worlds have federated');
  console.log('federation membership agrees with the macro layer in both survey orders');
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

// across Earth's eastern edge, land should mostly continue as land
const e = world.geo(0, 0), east = world.geo(1, 0);
console.log(`Earth/east edge land links: ${edgeLinks(e, east, 'E').length}`);

// Big Earth is an endless plane: no poles, no wrap, and far sheets generate
{
  assert.deepEqual(neighbourPos(0, -4, 'N'), { x: 0, y: -5 }, 'no north pole');
  assert.deepEqual(neighbourPos(4, 0, 'E'), { x: 5, y: 0 }, 'no east-west wrap');
  const far = new World(20000);
  buildTerra(far);
  for (let x = 1; x <= 12; x++) generateTile(far, x, 0, 1);   // a 12-sheet march east
  for (let y = -1; y >= -6; y--) generateTile(far, 12, y, 1); // then north, past the old pole
  const a = far.geo(5, 0), b = far.geo(-5, 0);
  let same = 0;
  for (let k = 0; k < a.elev.length; k++) if (a.elev[k] === b.elev[k]) same++;
  assert.ok(same < a.elev.length / 2, 'sheets 10 apart are no longer the same sheet');
  const shifts = [[12, -6], [40, 0], [0, 80], [-150, 30]].map(([x, y]) => eraShift(far.seed, x + 0.5, y + 0.5, 2000));
  console.log(`endless plane: 18 far sheets generated; era shifts at 12/-6, 40/0, 0/80, -150/30 in 2000 CE: ${shifts.join(', ')}`);
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
