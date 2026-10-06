import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BigEarth } from '../../src/engine.js';
import { World } from '../../src/world/world.js';
import { SAVE_VERSION } from '../../src/world/world.js';
import { registerMapMode, mapModes } from '../../src/render.js';
import { W, H } from '../../src/core/frame.js';

const earth = BigEarth.create({ seed: 99, ring: [[1, 0]] });

test('a new world has Terra and its starting ring', () => {
  assert.ok(earth.isRevealed(0, 0) && earth.isRevealed(1, 0));
  assert.ok(!earth.isRevealed(-1, 0));
  assert.equal(earth.layer, 1);
  assert.equal(earth.sheetName(0, 0), 'Terra');
});

test('reveal emits an event, and only for revealable sheets', () => {
  const seen = [];
  const off = earth.on('reveal', (e) => seen.push(`${e.x},${e.y}`));
  assert.equal(earth.canReveal(5, 5), false);
  assert.equal(earth.reveal(5, 5), null);
  assert.ok(earth.reveal(2, 0));
  assert.equal(earth.reveal(2, 0), null, 'cannot reveal twice');
  off();
  assert.deepEqual(seen, ['2,0']);
});

test('cell and province queries', () => {
  // somewhere in France
  const geo = earth.sheet(0, 0);
  const fr = geo.regions.find((r) => r.code === 'FRA');
  const k = Math.round(fr.cy) * W + Math.round(fr.cx);
  const c = earth.cell(0, 0, k);
  assert.equal(c.revealed, true);
  assert.equal(earth.world.polityName(c.owner, 2000), 'France');
  assert.ok(c.pop > 0 && c.gdp > 0 && typeof c.era === 'string');
  const p = earth.province(0, 0, fr.id);
  assert.equal(p.owner, c.owner);
  const fog = earth.cell(-3, 0, 10, 10);
  assert.equal(fog.revealed, false);
  assert.ok(typeof fog.biomeName === 'string');
});

test('players, profiles, peoples and the macro layer', () => {
  const top = earth.players(2000, null, 5);
  assert.equal(top.length, 5);
  assert.ok(top[0].gdp >= top[1].gdp);
  const prof = earth.profile(earth.world.byKey('c:FRA'));
  assert.equal(prof.name, 'France');
  assert.ok(earth.peoples(1, 0).length > 0);
  assert.equal(typeof earth.climate(3, 3).name, 'string');
  assert.equal(earth.drift(0, 0), 0);
});

test('save and load round-trip, keeping game data in ext', () => {
  earth.world.ext.game = { turn: 3 };
  const json = earth.save();
  assert.equal(JSON.parse(json).v, SAVE_VERSION);
  const back = BigEarth.load(json);
  assert.equal(back.save(), json);
  assert.deepEqual(back.world.ext, { game: { turn: 3 } });
  assert.throws(() => World.deserialize({ v: 999 }), /unknown save version/);
});

test('custom map modes plug into the rasteriser', () => {
  registerMapMode({
    id: 'test-owned', label: 'Owned', legend: { kind: 'text', text: 'test' },
    paint: (rgb, { snap, r }) => (snap.owner[r] ? [255, 0, 0] : rgb),
  });
  assert.ok(mapModes().some((m) => m.id === 'test-owned'));
  const px = earth.raster(0, 0, 'test-owned');
  assert.equal(px.length, W * H * 4);
  let red = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i] === 255 && px[i + 1] === 0 && px[i + 2] === 0) red++;
  assert.ok(red > 1000);
  assert.equal(earth.raster(-7, 0), null, 'unrevealed sheets have no raster');
  assert.throws(() => earth.raster(0, 0, 'no-such-mode'));
});

test('saves from before the home fix load with sane homes', () => {
  const d = JSON.parse(earth.save());
  const p = d.polities.find((q) => !q.earth && q.capital);
  p.home = [[1.5, 0.5], [1.6, 0.4]];
  d.cultures[d.cultures.length - 1].home = [[1, 2]];
  const w = World.deserialize(d);
  assert.equal(w.polities.get(p.id).home, `${p.capital.x},${p.capital.y}`);
  assert.ok(![...w.cultures.values()].some((c) => Array.isArray(c.home)));
});

test('generated states and peoples record their home sheet', () => {
  for (const r of [...earth.world.polities.values(), ...earth.world.cultures.values()]) {
    if (r.home != null) assert.match(r.home, /^-?\d+,-?\d+$/);
  }
});
