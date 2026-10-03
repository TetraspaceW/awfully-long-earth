// Generates a patch of Big Earth in every direction and checks the invariants
// that make tiles fit together. Run with `npm test`.

import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { buildEarth } from '../src/earth.js';
import { generateTile, canGenerate } from '../src/sim.js';
import { getGeo, edgeLinks, neighbourPos } from '../src/geo.js';
import { players, fmtPop, fmtMoney } from '../src/stats.js';
import { federationAt, eraShift, effectiveYear } from '../src/macro.js';
import { techCap } from '../src/constants.js';
import { regionCapacity } from '../src/geo.js';
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
  buildEarth(fw);
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
    const g = getGeo(x, y), h = w.tile(x, y, t);
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
      const mk = () => { const w = new World(seed); buildEarth(w); return w; };
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
    const w = new World(seed); buildEarth(w);
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

// drift from Terra: tiny next to Terra's record, large far away in space and time
{
  let near = 0, farDeep = 0;
  for (let sd = 1; sd <= 40; sd++) {
    for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]]) near = Math.max(near, Math.abs(eraShift(sd, x, y, 2000)));
    for (let y = -4; y <= 5; y++) for (let x = -5; x <= 4; x++) if (techCap(effectiveYear(sd, x, y, -2500)) >= 10) farDeep++;
  }
  console.log(`drift: largest shift next to Terra in 2000 CE ${near} years; world-state-level sheets in 2500 BCE across 40 seeds: ${farDeep}`);
  assert.ok(near <= 500, 'Terra\'s present-day neighbours drift too far');
  assert.ok(farDeep >= 1, 'far reaches never get strange enough');
}

// multi-world federations come from the macro layer, so every sheet agrees on
// membership whatever order the sheets were surveyed in
{
  const check = (w) => {
    for (const h of w.tiles.values()) {
      for (let k = 0; k < 5; k++) {
        const Y = h.t * 1000 + k * 250;
        const fed = federationAt(w.seed, h.x, h.y, Y);
        const owners = [...h.snaps[k].owner].filter(Boolean);
        const inFed = (o) => w.polities.get(o)?.key === (fed && fed.key);
        const share = owners.length ? owners.filter(inFed).length / owners.length : 0;
        // (a sheet takes a step or two to accede after its federation forms)
        if (fed && fed.share >= 0.6) {
          assert.ok(share >= fed.share - 0.15, `${h.x},${h.y} at ${Y} should be in ${fed.edge.id} (share ${share.toFixed(2)})`);
        }
        if (!fed) assert.ok(!owners.some((o) => w.polities.get(o)?.macro), `${h.x},${h.y} at ${Y} holds a federation it is not in`);
      }
    }
  };
  const a = new World(20000), b = new World(20000);
  buildEarth(a); buildEarth(b);
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
