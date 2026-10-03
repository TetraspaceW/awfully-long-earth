// Physical geography of every Big Earth tile: elevation, climate, biomes and the
// regions (provinces) history is played out on. Geography is a pure function of the
// world seed and tile position, so it never needs saving.
//
// Real Earth (tile 0,0) comes from Natural Earth country outlines. Its neighbours'
// noise terrain is corrected near the shared edge so coastlines run on across it.

import { W, H, WORLD_W, GX0, GY0, seaLevel, tempOffset } from './constants.js';
import { fbm, valueNoise } from './noise.js';
import { Rng, hashN } from './rng.js';
import { EARTH_GEO } from './data/earth-geo.js';

export const BIOME = {
  OCEAN: 0, ICE: 1, TUNDRA: 2, TAIGA: 3, MOUNTAIN: 4, DESERT: 5, STEPPE: 6,
  TEMPERATE: 7, SAVANNA: 8, TROPICAL: 9, FERTILE: 10, HOTHOUSE: 11, SCORCHED: 12,
};
export const BIOME_NAMES = ['Ocean', 'Ice', 'Tundra', 'Taiga', 'Mountains', 'Desert', 'Steppe',
  'Temperate forest', 'Savanna', 'Tropical forest', 'River valley', 'Hothouse swamp', 'Scorched rock'];
export const HAB = [0, 0, 0.04, 0.15, 0.25, 0.04, 0.45, 1.0, 0.6, 0.55, 1.3, 0.1, 0];
const NB = BIOME_NAMES.length;

const MIN_SEA = -0.055;   // lowest sea level ever (glacial maximum)
const BLEND = 40;
const LAND_BIAS = 0.1;  // tuned so tiles average roughly Earth's 30% land         // cells over which neighbours bend towards Earth's edge

export const isEarthPos = (x, y) => x === 0 && y === 0;

const lonOf = (i) => -180 + (i + 0.5) * (360 / W);
const latOf = (j) => 90 - (j + 0.5) * (180 / H);

// ---------------------------------------------------------------- Earth tile

function decodeRle(rle) {
  const out = new Int16Array(W * H);
  let p = 0;
  for (const tok of rle.split(',')) {
    if (!tok) continue;
    const [a, b] = tok.split('*');
    const v = a === '.' ? -1 : parseInt(a, 36);
    const n = parseInt(b, 36);
    out.fill(v, p, p + n);
    p += n;
  }
  return out;
}

// Provinces: modern countries, with the big ones split so that history has
// something to hold onto. Boxes are [code, lonMin, lonMax, latMin, latMax];
// the first match wins, otherwise the country's own code is used.
const SPLITS = {
  RUS: [['RUS-FE', 120, 180, -90, 90], ['RUS-FE', -180, 0, -90, 90], ['RUS-CS', 90, 120, -90, 90],
    ['RUS-WS', 60, 90, -90, 90], ['RUS-S', 0, 60, -90, 52], ['RUS-V', 44, 60, 52, 90], ['RUS-NW', -180, 180, -90, 90]],
  CAN: [['CAN-N', -180, 0, 60, 90], ['CAN-W', -180, -110, -90, 90], ['CAN-C', -110, -85, -90, 90], ['CAN-E', -180, 180, -90, 90]],
  USA: [['USA-HI', -180, -150, -90, 25], ['USA-AK', -180, -130, 50, 90], ['USA-W', -180, -104, -90, 90],
    ['USA-C', -104, -90, -90, 90], ['USA-SE', -90, 0, -90, 37], ['USA-NE', -180, 180, -90, 90]],
  MEX: [['MEX-Y', -94.5, 0, -90, 90], ['MEX-N', -180, 180, 22, 90], ['MEX-C', -180, 180, -90, 90]],
  BRA: [['BRA-N', -180, 180, -8, 90], ['BRA-SE', -50, 0, -90, 90], ['BRA-SE', -180, 180, -90, -22], ['BRA-W', -180, 180, -90, 90]],
  ARG: [['ARG-S', -180, 180, -90, -39], ['ARG-N', -180, 180, -90, 90]],
  CHN: [['CHN-XJ', -180, 93, 35, 90], ['CHN-TB', -180, 101, -90, 36.5], ['CHN-NE', 118, 180, 40, 90],
    ['CHN-NE', 115, 180, 43, 90], ['CHN-IM', 97, 118, 41.5, 90], ['CHN-IM', 97, 106, 36.5, 90],
    ['CHN-N', -180, 180, 32, 90], ['CHN-SW', -180, 110, -90, 90], ['CHN-S', -180, 180, -90, 90]],
  IND: [['IND-S', -180, 180, -90, 21.5], ['IND-E', 83, 180, -90, 90], ['IND-N', -180, 180, -90, 90]],
  AUS: [['AUS-W', -180, 129, -90, 90], ['AUS-E', 141, 180, -90, 90], ['AUS-C', -180, 180, -90, 90]],
  IDN: [['IDN-W', -180, 106, -90, 90], ['IDN-JV', -180, 116, -90, -5.5], ['IDN-K', 108.5, 119, -4.3, 8],
    ['IDN-E', -180, 180, -90, 90]],
  KAZ: [['KAZ-W', -180, 63, -90, 90], ['KAZ-E', -180, 180, -90, 90]],
  FRA: [['FRA-GF', -180, 0, -90, 20], ['FRA', -180, 180, -90, 90]],
};

// Hand-placed climate for Earth, which has no noise to lean on.
const EARTH_DESERTS = [[-17, 33, 15, 32], [35, 60, 13, 32], [52, 64, 27, 35], [69, 75, 24, 30],
  [75, 115, 37, 46], [55, 66, 38, 46], [12, 25, -28, -18], [116, 145, -32, -19], [-75, -68, -30, -15],
  [-120, -103, 29, 40], [-72, -64, -50, -40]];
const EARTH_RIVERS = [[30, 33, 22, 31.5], [42, 48.5, 30, 36], [67, 73, 24, 31], [72, 90, 24, 30],
  [105, 122, 28, 40], [100, 107, 9, 17], [-91, -89, 29, 38], [3, 7, 11, 15]];
const EARTH_MOUNTAINS = [[73, 104, 27, 38, 0.4], [-79, -64, -40, 6, 0.32], [-125, -104, 32, 60, 0.22],
  [5, 16, 44, 48, 0.25], [38, 49, 40, 44, 0.25], [45, 62, 27, 38, 0.18], [35, 42, 6, 15, 0.25],
  [70, 95, 40, 50, 0.22], [30, 44, 37, 41, 0.12]];
const inBox = (b, lon, lat) => lon >= b[0] && lon <= b[1] && lat >= b[2] && lat <= b[3];

let earthBase = null;
function earthData() {
  if (earthBase) return earthBase;
  const cgrid = decodeRle(EARTH_GEO.rle);
  const land = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) land[k] = cgrid[k] >= 0 ? 1 : 0;
  const dist = bfsDistance(land);
  const elev = new Float32Array(W * H);
  const moistOverride = new Float32Array(W * H).fill(-1);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, lon = lonOf(i), lat = latOf(j);
    if (land[k]) {
      let e = 0.04 + 0.012 * Math.min(dist[k], 20);
      for (const m of EARTH_MOUNTAINS) if (inBox(m, lon, lat)) e += m[4];
      if (cgrid[k] >= 0 && EARTH_GEO.countries[cgrid[k]].a3 === 'ATA') e += 0.2;
      elev[k] = e;
      for (const d of EARTH_DESERTS) if (inBox(d, lon, lat)) moistOverride[k] = 0.1;
      for (const r of EARTH_RIVERS) if (inBox(r, lon, lat)) moistOverride[k] = 2; // marker: fertile valley
    } else {
      const d = dist[k];
      elev[k] = d <= 1 ? -0.03 : d === 2 ? -0.07 : -0.12 - 0.01 * Math.min(d, 30);
    }
  }
  earthBase = { cgrid, land, elev, moistOverride };
  return earthBase;
}

// Distance (in cells) from each cell to the nearest cell of the other kind.
function bfsDistance(land) {
  const dist = new Int16Array(W * H).fill(-1);
  const q = new Int32Array(W * H);
  let head = 0, tail = 0;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
      if (land[jj * W + ii] !== land[k]) { dist[k] = 1; q[tail++] = k; break; }
    }
  }
  while (head < tail) {
    const k = q[head++], i = k % W, j = (k / W) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
      const kk = jj * W + ii;
      if (dist[kk] < 0 && land[kk] === land[k]) { dist[kk] = dist[k] + 1; q[tail++] = kk; }
    }
  }
  for (let k = 0; k < W * H; k++) if (dist[k] < 0) dist[k] = 60;
  return dist;
}

// ---------------------------------------------------------- procedural terrain

function gx(x, i) { return (x - GX0) * W + i; }
function gy(y, j) { return (y - GY0) * H + j; }

function noiseElev(seed, X, Y) {
  const wx = X + 50 * fbm(seed + 11, X, Y, 150, WORLD_W, 3);
  const wy = Y + 50 * fbm(seed + 12, X, Y, 150, WORLD_W, 3);
  let e = fbm(seed + 1, wx, wy, 75, WORLD_W, 5, 0.5) + 0.3 * fbm(seed + 2, X, Y, 300, WORLD_W, 2);
  e = e / 1.1 - LAND_BIAS;
  if (e > 0) {
    const ridge = 1 - Math.abs(fbm(seed + 3, wx, wy, 150, WORLD_W, 4));
    e += 0.55 * Math.pow(ridge, 6) * Math.min(1, e * 6);
  }
  return e;
}

function noiseMoist(seed, X, Y) { return fbm(seed + 21, X, Y, 150, WORLD_W, 5); }
function noiseTemp(seed, X, Y) { return fbm(seed + 31, X, Y, 300, WORLD_W, 3); }

// Temperature (deg C, today) from local latitude band and elevation.
function baseTemp(j, e) {
  const lat = latOf(j);
  return 28 - 52 * Math.pow(Math.abs(lat) / 90, 1.4) - 22 * Math.max(0, e - 0.12);
}

// ---------------------------------------------------------------- climate
//
// Big Earth has no poles and no single climate. A smooth field of octaves 3 to
// 90 sheets across sets each place's climate state, anchored at Terra's present
// one. Neighbouring sheets differ by a few degrees; far away the field wanders
// from Cryogenian snowball (ice to the equator, frozen seas) to a runaway
// Venusian greenhouse (boiled-off oceans, rock hot enough to melt lead).

const CLIMATE_OCTAVES = [[3, 0.5], [10, 0.9], [30, 1.3], [90, 1.8]]; // [sheets, weight]
const TERRA_X = -GX0 * W + W / 2, TERRA_Y = -GY0 * H + H / 2;

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
let anchor = { seed: null, v: null };
function climateZ(seed, X, Y) {
  if (anchor.seed !== seed) anchor = { seed, v: climateRaw(seed, TERRA_X, TERRA_Y) };
  const [s, b] = climateRaw(seed, X, Y), [s0, b0] = anchor.v;
  return [s - s0, b - b0];
}

// Mean warming (deg C): ice ages and snowballs below zero, hothouses above. The
// runaway greenhouse follows only the broad-scale driver, so a world tips into
// it over many sheets instead of flickering in and out of it.
export function climateShift([z, zb]) {
  const base = z < 0 ? Math.max(-80, 12 * z - 6 * z * z) : 11 * z + 3 * z * z;
  return base + 440 * smooth(clamp01((zb - 1.4) / 1.8));
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (t) => t * t * (3 - 2 * t);

export function climateName(dT) {
  if (dT < -35) return 'Snowball (Cryogenian)';
  if (dT < -18) return 'Deep glaciation';
  if (dT < -7) return 'Ice age';
  if (dT < 6) return 'Earthlike';
  if (dT < 16) return 'Warm';
  if (dT < 30) return 'Hothouse';
  if (dT < 120) return 'Moist greenhouse';
  return 'Runaway greenhouse (Venusian)';
}

// Climate at a continuous position in sheet units, for the panel.
export function climateAt(gxs, gys) {
  const seed = hashN(worldSeed, 'terrain');
  return climateShift(climateZ(seed, (gxs - GX0) * W, (gys - GY0) * H));
}

function baseMoist(j, coastDist, n) {
  const lat = Math.abs(latOf(j));
  return 0.5 + 0.38 * n + 0.28 * Math.exp(-coastDist / 10)
    - 0.38 * Math.exp(-(((lat - 24) / 9) ** 2)) + 0.25 * Math.exp(-((lat / 10) ** 2));
}

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

// --------------------------------------------------------------- geo objects

const cache = new Map();
let worldSeed = 1;

export function setGeoSeed(seed) {
  if (seed !== worldSeed) cache.clear();
  worldSeed = seed;
}

export function getGeo(x, y) {
  const k = `${x},${y}`;
  let g = cache.get(k);
  if (!g) { g = buildGeo(x, y); cache.set(k, g); }
  return g;
}

function buildGeo(x, y) {
  const earth = isEarthPos(x, y);
  const elev = new Float32Array(W * H);
  const temp = new Float32Array(W * H);
  const moist = new Float32Array(W * H);
  const seed = hashN(worldSeed, 'terrain');

  if (earth) {
    const E = earthData();
    elev.set(E.elev);
  } else {
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) elev[j * W + i] = noiseElev(seed, gx(x, i), gy(y, j));
    blendTowardsEarth(x, y, elev, seed);
  }

  const land = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) land[k] = elev[k] >= 0 ? 1 : 0;
  const dist = bfsDistance(land);

  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    const X = gx(x, i), Y = gy(y, j);
    const coast = land[k] ? dist[k] : 0;
    if (earth) {
      temp[k] = baseTemp(j, elev[k]) + 2 * Math.sin(lonOf(i) / 30); // a little east-west texture
      const mo = earthData().moistOverride[k];
      moist[k] = mo >= 0 ? mo : baseMoist(j, coast, 0.15);
    } else {
      temp[k] = baseTemp(j, elev[k]) + climateShift(climateZ(seed, X, Y)) + 4 * noiseTemp(seed, X, Y);
      moist[k] = baseMoist(j, coast, noiseMoist(seed, X, Y));
      // a few big river valleys in dry lands
      if (elev[k] >= 0 && moist[k] < 0.45 && temp[k] > 8 && fbm(seed + 41, X, Y, 37.5, WORLD_W, 2) > 0.62) moist[k] = 2;
    }
  }

  const geo = { x, y, earth, elev, temp, moist, land, name: null };
  buildRegions(geo);
  return geo;
}

// Bend a neighbour's noise elevation towards Earth's fixed edge values.
function blendTowardsEarth(x, y, elev, seed) {
  const E = earthData().elev;
  const sides = [];
  if (y === 0 && x === 1) sides.push('W'); // Earth lies to our west
  if (y === 0 && x === -1) sides.push('E');
  if (x === 0 && y === 1) sides.push('N');
  if (x === 0 && y === -1) sides.push('S');
  for (const side of sides) {
    const n = side === 'W' || side === 'E' ? H : W;
    const diff = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      let earthK, ownI, ownJ;
      if (side === 'W') { earthK = k * W + (W - 1); ownI = 0; ownJ = k; }
      if (side === 'E') { earthK = k * W; ownI = W - 1; ownJ = k; }
      if (side === 'N') { earthK = (H - 1) * W + k; ownI = k; ownJ = 0; }
      if (side === 'S') { earthK = k; ownI = k; ownJ = H - 1; }
      diff[k] = E[earthK] - elev[ownJ * W + ownI];
    }
    const sm = smooth1d(diff, 3);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      let d, k;
      if (side === 'W') { d = i; k = j; }
      if (side === 'E') { d = W - 1 - i; k = j; }
      if (side === 'N') { d = j; k = i; }
      if (side === 'S') { d = H - 1 - j; k = i; }
      if (d >= BLEND) continue;
      const w = (1 - d / BLEND) ** 2;
      elev[j * W + i] += sm[k] * w;
    }
  }
}

function smooth1d(a, r) {
  const out = new Float32Array(a.length);
  for (let k = 0; k < a.length; k++) {
    let s = 0, n = 0;
    for (let d = -r; d <= r; d++) {
      const kk = k + d;
      if (kk < 0 || kk >= a.length) continue;
      s += a[kk]; n++;
    }
    out[k] = s / n;
  }
  // keep the exact edge value where it matters most
  return a.map((v, k) => (out[k] + v) / 2);
}

// ------------------------------------------------------------------ regions

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function buildRegions(geo) {
  const { elev, earth } = geo;
  const region = new Int16Array(W * H).fill(-1);
  const everLand = (k) => elev[k] >= MIN_SEA;
  const regions = [];

  if (earth) {
    const E = earthData();
    const codes = new Map();
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i;
      const c = E.cgrid[k];
      if (c < 0) continue;
      const a3 = EARTH_GEO.countries[c].a3;
      const code = splitCode(a3, lonOf(i), latOf(j));
      if (!codes.has(code)) {
        codes.set(code, regions.length);
        regions.push({ id: regions.length, code, country: a3 });
      }
      region[k] = codes.get(code);
    }
    // continental shelves exposed in glacial times join the nearest province
    growInto(region, (k) => everLand(k));
  } else {
    const rng = new Rng(hashN(worldSeed, 'regions', geo.x, geo.y));
    const cand = [];
    for (let k = 0; k < W * H; k++) if (everLand(k)) cand.push(k);
    rng.shuffle(cand);
    const target = Math.max(1, Math.round(cand.length / 40));
    const seeds = [];
    const R = 4;
    for (const k of cand) {
      if (seeds.length >= target) break;
      const i = k % W, j = (k / W) | 0;
      if (seeds.some((s) => Math.abs(s % W - i) < R && Math.abs(((s / W) | 0) - j) < R)) continue;
      seeds.push(k);
    }
    for (const s of seeds) {
      region[s] = regions.length;
      regions.push({ id: regions.length, code: String(regions.length) });
    }
    growInto(region, (k) => everLand(k), rng);
    // islands no seed could reach
    for (const k of cand) {
      if (region[k] >= 0) continue;
      const comp = component(k, (kk) => everLand(kk) && region[kk] < 0);
      if (comp.length >= 6) {
        const id = regions.length;
        regions.push({ id, code: String(id) });
        for (const c of comp) region[c] = id;
      } else {
        // join the nearest region on the same tile
        let best = -1, bd = Infinity;
        const i = k % W, j = (k / W) | 0;
        for (let r = 1; r < 30 && best < 0; r++) {
          for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
            const ii = i + di, jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
            const v = region[jj * W + ii];
            if (v >= 0) { const d = di * di + dj * dj; if (d < bd) { bd = d; best = v; } }
          }
        }
        for (const c of comp) region[c] = best >= 0 ? best : 0;
      }
    }
  }

  // per-region statistics
  for (const r of regions) Object.assign(r, {
    cells: 0, cellsNow: 0, cx: 0, cy: 0, habNow: 0, habGlacial: 0, coastal: false,
    biomes: new Float32Array(NB), adj: new Set(), sea: new Map(),
  });
  for (let k = 0; k < W * H; k++) {
    const id = region[k];
    if (id < 0) continue;
    const r = regions[id], i = k % W, j = (k / W) | 0;
    r.cells++; r.cx += i; r.cy += j;
    const bNow = classify(elev[k], geo.temp[k], geo.moist[k], 0);
    const bG = classify(elev[k], geo.temp[k] - 6, geo.moist[k] * 0.85, MIN_SEA);
    r.habGlacial += HAB[bG];
    if (bNow !== BIOME.OCEAN) { r.cellsNow++; r.habNow += HAB[bNow]; r.biomes[bNow]++; }
    for (const [di, dj] of N4) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
      const v = region[jj * W + ii];
      if (v >= 0 && v !== id) r.adj.add(v);
      if (elev[jj * W + ii] < 0 && elev[k] >= 0) r.coastal = true;
    }
  }
  for (const r of regions) {
    r.cx /= Math.max(1, r.cells); r.cy /= Math.max(1, r.cells);
    let best = 0;
    for (let b = 1; b < NB; b++) if (r.biomes[b] > r.biomes[best]) best = b;
    r.biome = r.cellsNow ? best : BIOME.OCEAN;
    r.steppe = r.cellsNow ? (r.biomes[BIOME.STEPPE] + r.biomes[BIOME.DESERT] * 0.5) / r.cellsNow : 0;
    r.adj = [...r.adj];
  }
  seaLinks(geo, region, regions);
  geo.region = region;
  geo.regions = regions;
}

function splitCode(a3, lon, lat) {
  const s = SPLITS[a3];
  if (!s) return a3;
  for (const [code, a, b, c, d] of s) if (lon >= a && lon <= b && lat >= c && lat <= d) return code;
  return a3;
}

function growInto(region, ok, rng) {
  let frontier = [];
  for (let k = 0; k < W * H; k++) if (region[k] >= 0) frontier.push(k);
  while (frontier.length) {
    if (rng) rng.shuffle(frontier);
    const next = [];
    for (const k of frontier) {
      const i = k % W, j = (k / W) | 0;
      for (const [di, dj] of N4) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
        const kk = jj * W + ii;
        if (region[kk] < 0 && ok(kk)) { region[kk] = region[k]; next.push(kk); }
      }
    }
    frontier = next;
  }
}

function component(start, ok) {
  const out = [start], seen = new Set([start]);
  for (let p = 0; p < out.length; p++) {
    const k = out[p], i = k % W, j = (k / W) | 0;
    for (const [di, dj] of N4) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
      const kk = jj * W + ii;
      if (!seen.has(kk) && ok(kk)) { seen.add(kk); out.push(kk); }
    }
  }
  return out;
}

// Regions within a few cells of each other across water can trade and invade.
function seaLinks(geo, region, regions) {
  const { elev } = geo;
  const RANGE = 6;
  const dist = new Int16Array(W * H);
  for (const r of regions) {
    if (!r.coastal) continue;
    // BFS through ocean starting from this region's coast
    const start = [];
    // collect coastal cells lazily: scan around centroid bounding box is unreliable, so scan all
    r._coast = start;
  }
  for (let k = 0; k < W * H; k++) {
    const id = region[k];
    if (id < 0 || elev[k] < 0) continue;
    const i = k % W, j = (k / W) | 0;
    for (const [di, dj] of N4) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
      if (elev[jj * W + ii] < 0) { regions[id]._coast?.push(jj * W + ii); break; }
    }
  }
  const stamp = new Int32Array(W * H).fill(-1);
  for (const r of regions) {
    if (!r._coast || !r._coast.length) { delete r._coast; continue; }
    let frontier = [];
    for (const k of r._coast) if (stamp[k] !== r.id) { stamp[k] = r.id; dist[k] = 1; frontier.push(k); }
    for (let d = 1; d <= RANGE && frontier.length; d++) {
      const next = [];
      for (const k of frontier) {
        const i = k % W, j = (k / W) | 0;
        for (const [di, dj] of N4) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
          const kk = jj * W + ii;
          if (stamp[kk] === r.id) continue;
          stamp[kk] = r.id;
          if (elev[kk] < 0) { dist[kk] = d + 1; next.push(kk); continue; }
          const v = region[kk];
          if (v >= 0 && v !== r.id && !r.adj.includes(v)) {
            const old = r.sea.get(v);
            if (old === undefined || d < old) r.sea.set(v, d);
          }
        }
      }
      frontier = next;
    }
    delete r._coast;
  }
}

// ------------------------------------------------------------ cross-tile links

// Pairs [ourRegion, theirRegion] of regions touching across the shared edge.
// dir: 'E' (x+1), 'W' (x-1), 'N' (y-1), 'S' (y+1).
export function edgeLinks(a, b, dir) {
  const pairs = new Map();
  const add = (ka, kb) => {
    const ra = a.region[ka], rb = b.region[kb];
    if (ra < 0 || rb < 0) return;
    if (a.elev[ka] < MIN_SEA || b.elev[kb] < MIN_SEA) return;
    pairs.set(`${ra},${rb}`, [ra, rb]);
  };
  if (dir === 'E') for (let j = 0; j < H; j++) add(j * W + W - 1, j * W);
  if (dir === 'W') for (let j = 0; j < H; j++) add(j * W, j * W + W - 1);
  if (dir === 'S') for (let i = 0; i < W; i++) add((H - 1) * W + i, i);
  if (dir === 'N') for (let i = 0; i < W; i++) add(i, (H - 1) * W + i);
  return [...pairs.values()];
}

export const DIRS = { E: [1, 0], W: [-1, 0], N: [0, -1], S: [0, 1] };

export function neighbourPos(x, y, dir) {
  const [dx, dy] = DIRS[dir];
  return { x: x + dx, y: y + dy };
}

// Habitability-weighted size of a region at year Y (sea level and ice change).
export function regionCapacity(r, Y) {
  const g = Math.max(0, Math.min(1, -tempOffset(Y) / 6));
  const s = Math.max(0, Math.min(1, -seaLevel(Y) / 0.055));
  const f = Math.max(g, s);
  return r.habNow * (1 - f) + r.habGlacial * f;
}

// Biome of one cell at year Y (for rendering).
// Surface temperature of a cell (deg C) at year Y.
export function cellTemp(geo, k, Y) { return geo.temp[k] + tempOffset(Y); }

// What the sea is doing at an ocean cell: frozen over, open water, steaming, or
// boiled away to bare seabed.
export function seaState(geo, k, Y) {
  const T = cellTemp(geo, k, Y);
  return T < -12 ? 'ice' : T > 110 ? 'dry' : T > 60 ? 'steam' : 'water';
}

export function cellBiome(geo, k, Y) {
  const off = tempOffset(Y);
  const m = off < 0 ? geo.moist[k] * (1 + off / 40) : geo.moist[k];
  return classify(geo.elev[k], geo.temp[k] + off, m > 1.5 ? m : Math.min(m, 1.49), seaLevel(Y));
}
