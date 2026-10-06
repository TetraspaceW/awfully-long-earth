import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Atlas, terraSheet, buildSheet } from '../../src/geo/index.js';
import { edgeLinks } from '../../src/geo/provinces.js';
import { climateName } from '../../src/geo/climate.js';
import { CELLS } from '../../src/core/frame.js';

test('a sheet is a pure function of seed and position', () => {
  const a = new Atlas(5, { capacity: 1 });
  const s1 = a.sheet(2, -1);
  a.sheet(3, 3); // evicts (2, -1)
  const s2 = a.sheet(2, -1);
  assert.notEqual(s1, s2);
  assert.deepEqual([...s1.elev], [...s2.elev]);
  assert.deepEqual([...s1.region], [...s2.region]);
  assert.equal(s1.regions.length, s2.regions.length);
});

test('Terra is shared by every seed and carries real figures', () => {
  assert.equal(new Atlas(1).sheet(0, 0), new Atlas(2).sheet(0, 0));
  const t = terraSheet();
  assert.ok(t.earth && t.prepared && t.realTotal > 5e9);
  assert.ok(t.regions.every((r) => typeof r.name === 'string' && r.realPop >= 0));
});

test('different seeds give different sheets', () => {
  const a = buildSheet(1, 4, 4), b = buildSheet(2, 4, 4);
  let same = 0;
  for (let k = 0; k < CELLS; k++) if (a.elev[k] === b.elev[k]) same++;
  assert.ok(same < CELLS / 10);
});

test('provinces cover land and link across sheet edges', () => {
  const atlas = new Atlas(20000);
  const g = atlas.sheet(1, 0);
  for (let k = 0; k < CELLS; k++) if (g.elev[k] >= 0) assert.ok(g.region[k] >= 0, 'land without a province');
  assert.ok(edgeLinks(atlas.sheet(0, 0), g, 'E').length > 0);
  for (const r of g.regions) for (const o of r.adj) assert.ok(g.regions[o].adj.includes(r.id), 'adjacency is symmetric');
});

test('climate names cover the whole range', () => {
  assert.equal(climateName(0), 'Earthlike');
  assert.equal(climateName(-100), 'Snowball (Cryogenian)');
  assert.equal(climateName(1000), 'Runaway greenhouse (Venusian)');
});

test('climate bands run on across sheet edges, and turn far from Terra', async () => {
  const { latitudes } = await import('../../src/geo/bands.js');
  const { latOf, W, H } = await import('../../src/core/frame.js');
  // Terra and its neighbours keep north up, poles at the sheet edges
  for (const [x, y] of [[1, 1], [-1, 0], [0, -1]]) {
    const L = latitudes(7, x, y);
    for (let j = 0; j < H; j += 7) assert.equal(L[j * W + 11], Math.abs(latOf(j)));
  }
  let step = 0, tilted = 0;
  for (const [x, y] of [[40, 7], [-120, 300], [900, -40], [2, 0], [0, 2]]) {
    const A = latitudes(7, x, y), B = latitudes(7, x + 1, y), C = latitudes(7, x, y + 1);
    for (let j = 0; j < H; j++) step = Math.max(step, Math.abs(A[j * W + W - 1] - B[j * W]));
    for (let i = 0; i < W; i++) step = Math.max(step, Math.abs(A[(H - 1) * W + i] - C[i]));
    // north up means every row has one latitude; a turned sheet does not
    let spread = 0;
    for (let j = 0; j < H; j++) spread = Math.max(spread, Math.abs(A[j * W] - A[j * W + W - 1]));
    if (spread > 20) tilted++;
  }
  assert.ok(step < 3, `latitude jumps ${step.toFixed(1)} degrees at a sheet edge`);
  assert.ok(tilted >= 2, 'far sheets all keep north up');
});

test('other planets blend into their neighbours at the edges', async () => {
  const { planetAt } = await import('../../src/planet.js');
  const { W, H } = await import('../../src/core/frame.js');
  // a Gap beside an ordinary world, and a small world beside one, in seed 20000
  const pairs = [];
  for (let x = -200; x < -170 && pairs.length < 4; x++) for (let y = 395; y < 420 && pairs.length < 4; y++) {
    const a = planetAt(20000, x, y).kind, b = planetAt(20000, x + 1, y).kind;
    if (a !== b) pairs.push([x, y]);
  }
  assert.ok(pairs.length >= 2);
  const atlas = new Atlas(20000);
  for (const [x, y] of pairs) {
    const A = atlas.sheet(x, y), B = atlas.sheet(x + 1, y);
    for (let j = 0; j < H; j++) {
      const ka = j * W + W - 1, kb = j * W;
      assert.ok(Math.abs(A.temp[ka] - B.temp[kb]) < 25, `temperature jumps at ${x},${y} row ${j}: ${A.temp[ka]} vs ${B.temp[kb]}`);
      assert.ok(Math.abs(A.elev[ka] - B.elev[kb]) < 0.3 || A.elev[ka] < 0 && B.elev[kb] < 0, `a cliff at ${x},${y} row ${j}`);
    }
  }
});
