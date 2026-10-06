// Other Earths without seams. Each sheet is one world with its own planet
// (planet.js): its orbit's warmth, its tilt, its sea level, whether it has air,
// whether it is there at all. To keep geography continuous, these blend into
// the neighbouring worlds' over a band EDGE cells wide along each sheet edge,
// meeting half and half at the edge itself; inside, a sheet is wholly its own
// world. Whether a cell is airless or open space is a threshold on the blend,
// dithered with noise so the line wanders instead of following the edge.

import { CELLS, H, W, globalX, globalY } from '../core/frame.js';
import { fade } from '../core/util.js';
import { fbm } from '../core/random.js';
import { planetAt } from '../planet.js';
import { noiseElev } from './terrain.js';

export const EDGE = 24;          // cells
const OCEAN_WORLD_LAND = 0.03;   // share of an ocean world above its sea
const SMALL_WORLD_LAND = 0.75;   // the rest of a small world is dry basins
const GAP_SINK = 1.5;            // elevation units: nothing stays above the sea
export const SMALL_WORLD_COLD = -60;   // deg C, against Terra: a Mars
export const SPACE_TEMP = -270;

// How strongly tilt flattens (or steepens) the pole-to-equator gradient: 1 at
// Terra's 23.4 degrees, 0 past about 54 (no gradient over the year), below 0
// beyond (poles warmer than the equator).
export const tiltGradient = (tilt) => (tilt < 23.4 ? 1 + 0.25 * (23.4 - tilt) / 23.4 : Math.max(-0.6, 1 - (tilt - 23.4) / 30.6));

// How far a world's sea lies above or below Terra-like terrain, in elevation
// units, from a coarse sample of its terrain: an ocean world keeps 3% land, a
// small world 75%.
const seaMemo = new Map();
function seaOffset(seed, x, y, kind) {
  if (kind === 'gap') return GAP_SINK;
  if (kind !== 'ocean' && kind !== 'small') return 0;
  const key = `${seed}|${x}|${y}`;
  let v = seaMemo.get(key);
  if (v !== undefined) return v;
  const e = [];
  for (let j = 1; j < H; j += 4) for (let i = 2; i < W; i += 4) e.push(noiseElev(seed, globalX(x, i), globalY(y, j)));
  e.sort((a, b) => a - b);
  v = e[Math.floor((1 - (kind === 'ocean' ? OCEAN_WORLD_LAND : SMALL_WORLD_LAND)) * e.length)];
  if (seaMemo.size > 5000) seaMemo.clear();
  seaMemo.set(key, v);
  return v;
}

// Own and neighbour weights along one axis, for a cell centred at t in (0, 1)
// across a sheet whose blend band is b of its width: [before, own, after].
function axis(t, b) {
  if (t < b) { const w = 0.5 + 0.5 * fade(t / b); return [1 - w, w, 0]; }
  if (t > 1 - b) { const w = 0.5 + 0.5 * fade((1 - t) / b); return [0, w, 1 - w]; }
  return [0, 1, 0];
}

/**
 * Per-cell planet fields of sheet (x, y), blended across its edges; null where
 * neither it nor any neighbour differs from Terra's planet.
 * worldSeed picks the planets; seed is the world's terrain seed.
 */
export function planetFields(worldSeed, seed, x, y) {
  const P = [];
  let any = false;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const p = planetAt(worldSeed, x + dx, y + dy);
    if (p.differs) any = true;
    P.push({
      dT: p.dT, g: tiltGradient(p.tilt), sea: seaOffset(seed, x + dx, y + dy, p.kind),
      air: p.kind === 'small' ? 0 : 1, space: p.kind === 'gap' ? 1 : 0,
    });
  }
  if (!any) return null;
  const f = { dT: new Float32Array(CELLS), g: new Float32Array(CELLS), sea: new Float32Array(CELLS), airless: new Float32Array(CELLS), space: new Float32Array(CELLS) };
  const ax = [], ay = [];
  for (let i = 0; i < W; i++) ax.push(axis((i + 0.5) / W, EDGE / W));
  for (let j = 0; j < H; j++) ay.push(axis((j + 0.5) / H, EDGE / H));
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    let dT = 0, g = 0, sea = 0, air = 0, space = 0;
    for (let b = 0; b < 3; b++) for (let a = 0; a < 3; a++) {
      const w = ay[j][b] * ax[i][a];
      if (!w) continue;
      const p = P[b * 3 + a];
      dT += w * p.dT; g += w * p.g; sea += w * p.sea; air += w * p.air; space += w * p.space;
    }
    f.dT[k] = dT; f.g[k] = g; f.sea[k] = sea; f.airless[k] = 1 - air; f.space[k] = space;
  }
  return f;
}

// Whether a cell whose blend is w towards some condition has it: past one half,
// give or take a wandering margin.
export const past = (seed, X, Y, w, tag) => w > 0 && (w >= 1 || w > 0.5 + 0.2 * fbm(seed + tag, X, Y, 12, Infinity, 3));
