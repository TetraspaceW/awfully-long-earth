// One sheet's physical geography: elevation, climate, biomes and provinces.
// A pure function of the world seed and the sheet's position, so it never needs
// saving. Terra (0, 0) comes from Natural Earth; its neighbours' noise terrain
// is bent near the shared edge so coastlines run on across it.

import { W, H, CELLS, lonOf } from '../core/grid.js';
import { isTerra, globalX, globalY } from '../core/coords.js';
import { terrainSeed, climateShift, climateZ } from './climate.js';
import { noiseElev, noiseMoist, noiseTemp, riverNoise, baseTemp, baseMoist, blendTowardsTerra } from './terrain.js';
import { bfsDistance } from './grid-algos.js';
import { buildRegions } from './regions.js';
import { terraTerrain, annotateTerraSheet } from '../terra/geography.js';

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
  buildRegions(geo, worldSeed);
  if (earth) annotateTerraSheet(geo);
  return geo;
}
