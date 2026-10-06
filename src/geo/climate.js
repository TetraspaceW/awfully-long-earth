// Climate: Big Earth's shared climate history (sea level, ice ages), the
// smooth field that gives each place its own climate state, biomes, and what
// they mean for a cell or province in a given year.

import { GX0, GY0, WORLD_W, unitsToCellsX, unitsToCellsY, H, W } from '../core/frame.js';
import { clamp01, fade } from '../core/util.js';
import { valueNoise, hashN } from '../core/random.js';

// Big Earth's shared climate history: sea level and global temperature by year.
// Every sheet follows these in real time (not in its drifted effective year).

// lowest sea level ever (glacial maximum), in elevation units
export const MIN_SEA = -0.055;

// Sea level offset in elevation units (0 = today). The last glacial maximum
// exposes continental shelves (Beringia, Doggerland, Sundaland on Earth).
export function seaLevel(Y) {
  if (Y <= -19000) return -0.055;
  if (Y >= -5000) return 0;
  const f = (Y + 19000) / 14000;
  return -0.055 * (1 - f * f * (3 - 2 * f));
}

// Global temperature offset in degrees C.
export function tempOffset(Y) {
  if (Y <= -19000) return -6;
  if (Y >= -9000) return Y > 2000 ? Math.min(3, (Y - 2000) / 300) : 0;
  if (Y > -10900 && Y < -9700) return -4; // a Younger Dryas of Big Earth's own
  return -6 * (1 - (Y + 19000) / 10000);
}

// Biomes: what a cell is, from its elevation, temperature and moisture.

export const BIOME = {
  OCEAN: 0, ICE: 1, TUNDRA: 2, TAIGA: 3, MOUNTAIN: 4, DESERT: 5, STEPPE: 6,
  TEMPERATE: 7, SAVANNA: 8, TROPICAL: 9, FERTILE: 10, HOTHOUSE: 11, SCORCHED: 12,
};
export const BIOME_NAMES = ['Ocean', 'Ice', 'Tundra', 'Taiga', 'Mountains', 'Desert', 'Steppe',
  'Temperate forest', 'Savanna', 'Tropical forest', 'River valley', 'Hothouse swamp', 'Scorched rock'];
// habitability: how many people a cell of each biome supports, relative to temperate forest
export const HAB = [0, 0, 0.04, 0.15, 0.25, 0.04, 0.45, 1.0, 0.6, 0.55, 1.3, 0.1, 0];
export const NB = BIOME_NAMES.length;

// moisture at or above this marks a fertile river valley
export const FERTILE_MOIST = 1.5;

export function classify(e, T, M, sl) {
  if (e < sl) return BIOME.OCEAN;
  if (T < -9) return BIOME.ICE;
  if (T > 48) return BIOME.SCORCHED;
  if (T > 34) return BIOME.HOTHOUSE;
  if (e > 0.45) return BIOME.MOUNTAIN;
  if (T < -2) return BIOME.TUNDRA;
  if (M > 1.5) return BIOME.FERTILE;
  if (T < 4) return M < 0.3 ? BIOME.TUNDRA : BIOME.TAIGA;
  if (M < 0.22) return BIOME.DESERT;
  if (M < 0.38) return BIOME.STEPPE;
  if (T < 18) return BIOME.TEMPERATE;
  return M < 0.62 ? BIOME.SAVANNA : BIOME.TROPICAL;
}

// Big Earth has no poles and no single climate. A smooth field of octaves 3 to
// 90 sheets across sets each place's climate state, anchored at Terra's present
// one. Neighbouring sheets differ by a few degrees; far away the field wanders
// from Cryogenian snowball (ice to the equator, frozen seas) to a runaway
// Venusian greenhouse (boiled-off oceans, rock hot enough to melt lead).


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

// Per-cell and per-region state at a given year: what changes with ice ages
// and sea level on top of a sheet's fixed geography.


// Habitability-weighted size of a region at year Y (sea level and ice change).
export function regionCapacity(r, Y) {
  const g = Math.max(0, Math.min(1, -tempOffset(Y) / 6));
  const s = Math.max(0, Math.min(1, -seaLevel(Y) / 0.055));
  const f = Math.max(g, s);
  return r.habNow * (1 - f) + r.habGlacial * f;
}

// Surface temperature of a cell (deg C) at year Y.
export function cellTemp(geo, k, Y) { return geo.temp[k] + tempOffset(Y); }

// What the sea is doing at an ocean cell: frozen over, open water, steaming, or
// boiled away to bare seabed.
export const SEA_STATES = { ice: 'Frozen ocean', water: 'Ocean', steam: 'Steaming ocean', dry: 'Boiled-off seabed' };
export function seaState(geo, k, Y) {
  const T = cellTemp(geo, k, Y);
  return T < -12 ? 'ice' : T > 110 ? 'dry' : T > 60 ? 'steam' : 'water';
}

// Biome of one cell at year Y.
export function cellBiome(geo, k, Y) {
  const off = tempOffset(Y);
  const m = off < 0 ? geo.moist[k] * (1 + off / 40) : geo.moist[k];
  return classify(geo.elev[k], geo.temp[k] + off, m > 1.5 ? m : Math.min(m, 1.49), seaLevel(Y));
}
