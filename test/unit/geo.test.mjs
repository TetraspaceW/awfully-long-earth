import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Atlas, terraSheet } from '../../src/geo/atlas.js';
import { buildSheet } from '../../src/geo/sheet.js';
import { edgeLinks } from '../../src/geo/edges.js';
import { climateName } from '../../src/geo/climate.js';
import { CELLS } from '../../src/core/grid.js';

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
