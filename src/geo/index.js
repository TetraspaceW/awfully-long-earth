// Geography: every sheet's physical geography (elevation, climate, biomes,
// provinces) as a pure function of the world seed and its position, built on
// demand and cached by an Atlas. This is the geo module's only public entry.

import { globalX, globalY, isTerra, posKey, CELLS, H, W, latOf, lonOf } from '../core/frame.js';
import { LRU } from '../core/util.js';
import { annotateTerraSheet, terraTerrain, terraProvinces } from './terra.js';
import { BARREN_MOIST, SURFACE, climateAt, climateShift, climateZ, terrainSeed } from './climate.js';
import { bfsDistance, buildRegions } from './provinces.js';
import { baseMoist, baseTemp, blendTowardsTerra, noiseElev, noiseMoist, noiseTemp, riverNoise } from './terrain.js';
import { latitudes } from './bands.js';
import { SMALL_WORLD_COLD, SPACE_TEMP, past, planetFields } from './blend.js';
import { TERRA_PLANET, planetAt } from '../planet.js';

// One sheet's physical geography: elevation, climate, biomes and provinces.
// A pure function of the world seed and the sheet's position, so it never needs
// saving. Terra (0, 0) comes from Natural Earth; its neighbours' noise terrain
// is bent near the shared edge so coastlines run on across it. Which way a
// sheet's north points, and so its climate bands, comes from a field that runs
// on across sheets too (bands.js). Worlds that diverged from Terra far enough
// back are other planets (see planet.js): an ocean world's land lies deeper, a
// small world's is higher, airless and barren, the Gap is open space, and
// tilt and orbit change the climate. These blend into the neighbouring worlds
// near the edges (blend.js), so nothing jumps at an edge.

/** @returns {Sheet} */
export function buildSheet(worldSeed, x, y) {
  const earth = isTerra(x, y);
  const planet = earth ? TERRA_PLANET : planetAt(worldSeed, x, y);
  const elev = new Float32Array(CELLS);
  const temp = new Float32Array(CELLS);
  const moist = new Float32Array(CELLS);
  const surface = new Uint8Array(CELLS);   // SURFACE: air, airless or open space
  const seed = terrainSeed(worldSeed);
  const pf = earth ? null : planetFields(worldSeed, seed, x, y);
  const alat = earth ? null : latitudes(seed, x, y);

  if (earth) {
    elev.set(terraTerrain().elev);
  } else {
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) elev[j * W + i] = noiseElev(seed, globalX(x, i), globalY(y, j));
    blendTowardsTerra(x, y, elev, terraTerrain().elev);
    if (pf) {
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const k = j * W + i, X = globalX(x, i), Y = globalY(y, j);
        elev[k] -= pf.sea[k];
        if (past(seed, X, Y, pf.space[k], 81)) { surface[k] = SURFACE.SPACE; elev[k] = -1; } else if (past(seed, X, Y, pf.airless[k], 83)) surface[k] = SURFACE.AIRLESS;
      }
    }
  }

  const land = new Uint8Array(CELLS);
  for (let k = 0; k < CELLS; k++) land[k] = elev[k] >= 0 ? 1 : 0;
  const dist = bfsDistance(land);

  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    const X = globalX(x, i), Y = globalY(y, j);
    const coast = land[k] ? dist[k] : 0;
    if (earth) {
      const a = Math.abs(latOf(j));
      temp[k] = baseTemp(a, elev[k]) + 2 * Math.sin(lonOf(i) / 30); // a little east-west texture
      const mo = terraTerrain().moistOverride[k];
      moist[k] = mo >= 0 ? mo : baseMoist(a, coast, 0.15);
      continue;
    }
    if (!pf) {
      temp[k] = baseTemp(alat[k], elev[k]) + climateShift(climateZ(seed, X, Y)) + 4 * noiseTemp(seed, X, Y);
    } else {
      // an airless world keeps no greenhouse, and is a Mars; open space is colder still
      const air = 1 - pf.airless[k];
      let T = baseTemp(alat[k], elev[k], pf.g[k]) + pf.dT[k] + air * climateShift(climateZ(seed, X, Y))
        + (1 - air) * SMALL_WORLD_COLD + 4 * noiseTemp(seed, X, Y);
      T += pf.space[k] * (SPACE_TEMP - T);
      temp[k] = T;
    }
    if (surface[k]) { moist[k] = surface[k] === SURFACE.AIRLESS ? BARREN_MOIST : 0; continue; }
    moist[k] = baseMoist(alat[k], coast, noiseMoist(seed, X, Y));
    if (elev[k] >= 0 && moist[k] < 0.45 && temp[k] > 8 && riverNoise(seed, X, Y) > 0.62) moist[k] = 2;
  }

  const geo = { x, y, earth, planet, elev, temp, moist, land, surface, name: null };
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
