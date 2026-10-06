import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASTRO_ERA, EARTH_FORMED, TERRA_PLANET, planetAt, planetNote } from '../../src/planet.js';
import { buildSheet, cellBiome, seaState, BIOME } from '../../src/geo/index.js';
import { World } from '../../src/world/world.js';
import { buildTerra } from '../../src/terra.js';
import { generateTile } from '../../src/history/index.js';
import { BigEarth } from '../../src/engine.js';
import { CELLS, H, W } from '../../src/core/frame.js';

// cells away from the sheet's edges, where the neighbouring worlds blend in
const EDGE = 24;
const inner = (k) => { const i = k % W, j = (k / W) | 0; return i >= EDGE && i < W - EDGE && j >= EDGE && j < H - EDGE; };

// The first sheet of each kind, searching outwards from Terra in seed 20000.
const found = new Map();
for (let r = 300; r < 3000 && found.size < 4; r += 7) for (let a = 0; a < 40; a++) {
  const x = Math.round(r * Math.cos(a)), y = Math.round(r * Math.sin(a));
  const p = planetAt(20000, x, y);
  if (!found.has(p.kind)) found.set(p.kind, [x, y, p]);
}

test('near Terra, every world is Terra\'s planet under Terra\'s sky', () => {
  assert.equal(planetAt(20000, 0, 0), TERRA_PLANET);
  for (let x = -20; x <= 20; x += 4) for (let y = -20; y <= 20; y += 4) {
    const p = planetAt(20000, x, y);
    assert.ok(!p.differs && p.kind === 'earth' && p.dT === 0 && p.tilt === 23.4, `${x},${y}`);
    assert.equal(planetNote(p), null);
  }
});

test('past the astrodynamic threshold the sky differs; past formation, the planet', () => {
  let astro = 0, other = 0;
  for (let r = 300; r < 3000; r += 50) for (let a = 0; a < 20; a++) {
    const x = Math.round(r * Math.cos(a)), y = Math.round(r * Math.sin(a));
    const p = planetAt(20000, x, y);
    assert.equal(p.differs, p.pod >= ASTRO_ERA);
    if (p.differs) astro++;
    if (p.kind !== 'earth' || p.upheaval) other++;
    if (p.kind !== 'earth' && p.kind !== 'gap') assert.ok(p.pod > EARTH_FORMED, 'a different planet from a world that parted after Earth formed');
    if (p.kind === 'gap') assert.ok(p.pod > EARTH_FORMED || p.upheaval === 'lost', 'a Gap with no cause');
  }
  assert.ok(astro > 50 && other > 10, `${astro} worlds with their own sky, ${other} other Earths`);
  // the chaos alone, before Earth formed, can lose or move it
  let lost = 0, thrown = 0;
  for (let r = 300; r < 3000; r += 10) for (let a = 0; a < 20; a++) {
    const p = planetAt(20000, Math.round(r * Math.cos(a)), Math.round(r * Math.sin(a)));
    if (p.pod < EARTH_FORMED && p.upheaval === 'lost') lost++;
    if (p.pod < EARTH_FORMED && (p.upheaval === 'inward' || p.upheaval === 'outward')) thrown++;
  }
  assert.ok(lost > 0 && thrown > 0, `${lost} lost and ${thrown} thrown worlds that parted after Earth formed`);
  for (const k of ['gap', 'small', 'ocean', 'earth']) assert.ok(found.has(k), `no ${k} world found`);
});

test('the Gap has no land and no one; a small world is barren; an ocean world is islands', () => {
  const land = (g) => { let n = 0; for (let k = 0; k < CELLS; k++) if (g.elev[k] >= 0) n++; return n / CELLS; };
  const innerLand = (g) => { let n = 0; for (let k = 0; k < CELLS; k++) if (inner(k) && g.elev[k] >= 0) n++; return n; };
  const [gx, gy] = found.get('gap'), [sx, sy] = found.get('small'), [ox, oy] = found.get('ocean');
  const gap = buildSheet(20000, gx, gy), small = buildSheet(20000, sx, sy), ocean = buildSheet(20000, ox, oy);
  assert.equal(innerLand(gap), 0);
  assert.ok(land(gap) < 0.005, 'a Gap keeps at most a sliver of its neighbours\' land');
  for (let k = 0; k < CELLS; k++) if (inner(k)) assert.equal(seaState(gap, k, 2000), 'void');
  assert.ok(land(ocean) < 0.1, 'an ocean world is mostly sea');
  for (let k = 0; k < CELLS; k++) if (inner(k) && small.elev[k] >= 0) assert.equal(cellBiome(small, k, 2000), BIOME.BARREN);
  assert.ok(small.regions.filter((r) => r.habNow > 0).length <= small.regions.length / 10);

  const w = new World(20000);
  buildTerra(w);
  for (const [x, y] of [[gx, gy], [sx, sy]]) {
    const h = generateTile(w, x, y);
    assert.ok(h.snaps[4].culture.every((c) => c === 0), `people on ${x},${y}`);
  }
  const e = new BigEarth(w);
  assert.equal(e.climate(gx, gy), null);
  assert.equal(e.lineage(gx, gy), null);
  assert.equal(e.lineage(sx, sy), null);
  assert.match(e.planet(gx, gy).note, /^The Gap/);
  assert.equal(e.cell(gx, gy, 120, 60).seaName, 'Asteroid belt');
});
