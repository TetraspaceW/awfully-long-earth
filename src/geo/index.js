// Geography: every sheet's physical geography (elevation, climate, biomes,
// provinces) as a pure function of the world seed and its position, built on
// demand and cached by an Atlas. This is the geo module's only public entry.

import { globalX, globalY, isTerra, posKey, CELLS, H, W, lonOf } from '../core/frame.js';
import { LRU } from '../core/util.js';
import { annotateTerraSheet, terraTerrain, terraProvinces } from './terra.js';
import { climateAt, climateShift, climateZ, terrainSeed } from './climate.js';
import { bfsDistance, buildRegions } from './provinces.js';
import { baseMoist, baseTemp, blendTowardsTerra, noiseElev, noiseMoist, noiseTemp, riverNoise } from './terrain.js';

// One sheet's physical geography: elevation, climate, biomes and provinces.
// A pure function of the world seed and the sheet's position, so it never needs
// saving. Terra (0, 0) comes from Natural Earth; its neighbours' noise terrain
// is bent near the shared edge so coastlines run on across it.


/**
 * @typedef {object} Region  a province
 * @property {number} id       index in sheet.regions
 * @property {string} code     Terra: ISO code with split suffix ("RUS-FE"); elsewhere the index
 * @property {number} cells    cells, including shelves that are only land in glacial times
 * @property {number} cellsNow cells above today's sea level
 * @property {number} cx       centroid, in cells
 * @property {number} cy
 * @property {number} habNow   habitability today; habGlacial at the glacial maximum
 * @property {number} habGlacial
 * @property {boolean} coastal
 * @property {number[]} adj    land-neighbour region ids on the same sheet
 * @property {Map<number, number>} sea  regions reachable by sea -> crossing length
 * @property {number} biome    dominant biome today
 * @property {number} steppe   share of steppe and desert
 *
 * @typedef {object} Sheet
 * @property {number} x
 * @property {number} y
 * @property {boolean} earth       whether this is Terra
 * @property {Float32Array} elev   per cell; 0 = today's sea level
 * @property {Float32Array} temp   per cell, deg C today
 * @property {Float32Array} moist  per cell; >= 1.5 marks a fertile river valley
 * @property {Uint8Array} land     per cell, today
 * @property {Int16Array} region   per cell: province id, or -1
 * @property {Region[]} regions
 */

/** @returns {Sheet} */
export function buildSheet(worldSeed, x, y) {
  const earth = isTerra(x, y);
  const elev = new Float32Array(CELLS);
  const temp = new Float32Array(CELLS);
  const moist = new Float32Array(CELLS);
  const seed = terrainSeed(worldSeed);

  if (earth) {
    elev.set(terraTerrain().elev);
  } else {
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) elev[j * W + i] = noiseElev(seed, globalX(x, i), globalY(y, j));
    blendTowardsTerra(x, y, elev, terraTerrain().elev);
  }

  const land = new Uint8Array(CELLS);
  for (let k = 0; k < CELLS; k++) land[k] = elev[k] >= 0 ? 1 : 0;
  const dist = bfsDistance(land);

  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    const X = globalX(x, i), Y = globalY(y, j);
    const coast = land[k] ? dist[k] : 0;
    if (earth) {
      temp[k] = baseTemp(j, elev[k]) + 2 * Math.sin(lonOf(i) / 30); // a little east-west texture
      const mo = terraTerrain().moistOverride[k];
      moist[k] = mo >= 0 ? mo : baseMoist(j, coast, 0.15);
    } else {
      temp[k] = baseTemp(j, elev[k]) + climateShift(climateZ(seed, X, Y)) + 4 * noiseTemp(seed, X, Y);
      moist[k] = baseMoist(j, coast, noiseMoist(seed, X, Y));
      if (elev[k] >= 0 && moist[k] < 0.45 && temp[k] > 8 && riverNoise(seed, X, Y) > 0.62) moist[k] = 2;
    }
  }

  const geo = { x, y, earth, elev, temp, moist, land, name: null };
  buildRegions(geo, worldSeed, earth ? terraProvinces : null);
  if (earth) annotateTerraSheet(geo);
  return geo;
}

// The Atlas: every sheet's geography for one world seed, built on demand and
// cached. Geography is a pure function of (seed, x, y), so evicted sheets are
// simply rebuilt. Terra's sheet does not depend on the seed and is shared.


let terra = null;
/** Terra's sheet (the same for every seed). */
export function terraSheet() {
  if (!terra) terra = buildSheet(0, 0, 0);
  return terra;
}

export class Atlas {
  /**
   * @param {number} seed  world seed
   * @param {{capacity?: number}} [opts]  how many sheets to keep in memory (each is roughly 0.5 MB)
   */
  constructor(seed, { capacity = 512 } = {}) {
    this.seed = seed;
    this.cache = new LRU(capacity);
  }

  /** @returns {import('./sheet.js').Sheet} */
  sheet(x, y) {
    if (isTerra(x, y)) return terraSheet();
    const k = posKey(x, y);
    let g = this.cache.get(k);
    if (!g) g = this.cache.set(k, buildSheet(this.seed, x, y));
    return g;
  }

  /** Mean warming (deg C) against Terra at a continuous position in sheet units. */
  climateAt(gx, gy) { return climateAt(this.seed, gx, gy); }

  // One atlas per seed, shared by every World with that seed.
  static for(seed) {
    let a = shared.get(seed);
    if (!a) {
      if (shared.size >= 4) shared.delete(shared.keys().next().value);
      a = new Atlas(seed);
      shared.set(seed, a);
    }
    return a;
  }
}
const shared = new Map();

export { BIOME, BIOME_NAMES, HAB, classify } from './climate.js';
export { regionCapacity, cellTemp, cellBiome, seaState, SEA_STATES } from './climate.js';
export { climateAt, climateName, climateShift, terrainSeed } from './climate.js';
export { seaLevel, tempOffset, MIN_SEA } from './climate.js';
export { edgeLinks } from './provinces.js';
export { countryOf, fullName } from './terra.js';
