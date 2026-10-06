// Generation must be deterministic: the same seed and the same survey order
// give byte-identical worlds, maps and profiles. This pins hashes of all of
// them, so a change that alters generation (on purpose or not) shows up here.
//
// After an intended change to generation, refresh the hashes with
//   UPDATE_GOLDEN=1 npm run test:determinism
// and say in the commit that saves made before it will load but play out
// differently from then on.

import crypto from 'node:crypto';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { buildTerra } from '../src/terra.js';
import { generateTile, regionName } from '../src/history/index.js';
import { players } from '../src/world/stats.js';
import { nationProfile } from '../src/profile.js';
import { rasterTile, mapModes } from '../src/render.js';
import { climateAt } from '../src/geo/climate.js';

const FILE = new URL('./golden.json', import.meta.url);
const h = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
// forwards, backwards, sideways, a gap between past and future, and the future
const ORDER = [[1, 0, 1], [-1, 0, 1], [0, -1, 1], [0, 1, 1], [2, 0, 1], [1, 0, 0], [1, 0, 2], [1, 0, -1],
  [3, 0, 1], [2, 0, 0], [0, 0, -1], [0, 0, 2]];

const got = {};
for (const seed of [20000, 7]) {
  const w = new World(seed); buildTerra(w);
  for (const [x, y, t] of ORDER) generateTile(w, x, y, t);
  const p = `${seed}:`;
  got[p + 'save'] = h(w.serialize());
  got[p + 'players'] = h(JSON.stringify(players(w, 2000, null, 30).map((q) => [q.name, Math.round(q.pop), Math.round(q.gdp)])));
  const prof = [];
  for (const pid of [...w.polities.keys()].slice(0, 400)) {
    const b = nationProfile(w, pid, 2000);
    prof.push(JSON.stringify({ ...b, p: undefined, typeLabel: undefined, pop: Math.round(b.pop), gdp: Math.round(b.gdp), tech: b.tech.toFixed(4), perHead: Math.round(b.perHead) }));
  }
  got[p + 'profiles'] = h(prof.join('\n'));
  for (const [x, y] of [[0, 0], [1, 0], [2, 0], [3, 0]]) {
    const snap = w.tile(x, y, 1).snaps[4];
    for (const m of mapModes()) {
      if (['political', 'culture', 'tech', 'density', 'terrain'].includes(m.id)) got[`${p}render ${x},${y} ${m.id}`] = h(Buffer.from(rasterTile(w, x, y, snap, 2000, m.id)));
    }
    const g = w.geo(x, y);
    got[`${p}names ${x},${y}`] = h(g.regions.map((r) => regionName(w, g, r.id)).join('|'));
  }
  got[p + 'climate'] = [[5, 5], [-30, 12], [100, -40]].map(([a, b]) => climateAt(seed, a + 0.5, b + 0.5).toFixed(6)).join(' ');
  got[p + 'sheet names'] = h([...Array(20)].map((_, i) => w.tileName(i - 10, (i % 7) - 3)).join('|'));
}

if (process.env.UPDATE_GOLDEN) {
  fs.writeFileSync(FILE, JSON.stringify(got, null, 1) + '\n');
  console.log(`wrote ${Object.keys(got).length} hashes to test/golden.json`);
} else {
  const want = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const diff = Object.keys({ ...want, ...got }).filter((k) => want[k] !== got[k]);
  assert.deepEqual(diff, [], `generation changed: ${diff.join(', ')}\n(if intended, rerun with UPDATE_GOLDEN=1)`);
  console.log(`determinism ok: ${Object.keys(got).length} hashes match`);
}
