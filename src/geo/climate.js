// Big Earth has no poles and no single climate. A smooth field of octaves 3 to
// 90 sheets across sets each place's climate state, anchored at Terra's present
// one. Neighbouring sheets differ by a few degrees; far away the field wanders
// from Cryogenian snowball (ice to the equator, frozen seas) to a runaway
// Venusian greenhouse (boiled-off oceans, rock hot enough to melt lead).

import { W, H } from '../core/grid.js';
import { GX0, GY0, WORLD_W, unitsToCellsX, unitsToCellsY } from '../core/coords.js';
import { valueNoise } from '../core/noise.js';
import { hashN } from '../core/rng.js';
import { clamp01, fade } from '../core/math.js';

const CLIMATE_OCTAVES = [[3, 0.5], [10, 0.9], [30, 1.3], [90, 1.8]]; // [sheets, weight]
const TERRA_X = -GX0 * W + W / 2, TERRA_Y = -GY0 * H + H / 2;

// The seed every terrain and climate field of a world is drawn from.
export function terrainSeed(worldSeed) { return hashN(worldSeed, 'terrain'); }

// [all octaves, the two broadest only]
function climateRaw(seed, X, Y) {
  let s = 0, broad = 0;
  // y counts double: a sheet is half as many cells tall as it is wide
  for (const [sc, a] of CLIMATE_OCTAVES) {
    const v = a * (valueNoise(seed + 61 + sc, X, 2 * Y, sc * W, WORLD_W) * 2 - 1);
    s += v;
    if (sc >= 30) broad += v;
  }
  return [s, broad];
}

// Climate drivers at global cell (X, Y), both 0 at Terra: z is about +-1 ten
// sheets out and +-2 to 3.5 a hundred out; zb is its broad-scale part.
const anchors = new Map();
export function climateZ(seed, X, Y) {
  let a = anchors.get(seed);
  if (!a) { a = climateRaw(seed, TERRA_X, TERRA_Y); anchors.set(seed, a); }
  const [s, b] = climateRaw(seed, X, Y), [s0, b0] = a;
  return [s - s0, b - b0];
}

// Mean warming (deg C): ice ages and snowballs below zero, hothouses above. The
// runaway greenhouse follows only the broad-scale driver, so a world tips into
// it over many sheets instead of flickering in and out of it.
export function climateShift([z, zb]) {
  const base = z < 0 ? Math.max(-80, 12 * z - 6 * z * z) : 11 * z + 3 * z * z;
  return base + 440 * fade(clamp01((zb - 1.4) / 1.8));
}

export const CLIMATE_STATES = [
  [-35, 'Snowball (Cryogenian)'], [-18, 'Deep glaciation'], [-7, 'Ice age'], [6, 'Earthlike'],
  [16, 'Warm'], [30, 'Hothouse'], [120, 'Moist greenhouse'], [Infinity, 'Runaway greenhouse (Venusian)'],
];
export function climateName(dT) {
  for (const [below, name] of CLIMATE_STATES) if (dT < below) return name;
  return CLIMATE_STATES[CLIMATE_STATES.length - 1][1];
}

// Mean warming at a continuous position in sheet units.
export function climateAt(worldSeed, gxs, gys) {
  return climateShift(climateZ(terrainSeed(worldSeed), unitsToCellsX(gxs), unitsToCellsY(gys)));
}
