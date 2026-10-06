// Procedural terrain and climate texture for every sheet but Terra: elevation,
// temperature and moisture as noise over global cell coordinates, so they run
// on seamlessly across sheet edges.

import { W, H, WORLD_W } from '../core/frame.js';
import { fbm } from '../core/random.js';

const LAND_BIAS = 0.1;   // tuned so sheets average roughly Earth's 30% land
const BLEND = 40;        // cells over which neighbours bend towards Terra's edge

// Scales are set so generated land matches Terra's spectrum: continents a few
// tens of cells across (value noise on a lattice of L cells is mostly at
// wavelengths over 2L), and coastlines as intricate as Terra's.
const CONTINENT = 32;    // lattice of the main octave, cells
const WARP = 64;         // scale of the domain warp that bends coastlines
const RIDGES = 64;       // scale of mountain chains

export function noiseElev(seed, X, Y) {
  const wx = X + 21 * fbm(seed + 11, X, Y, WARP, WORLD_W, 3);
  const wy = Y + 21 * fbm(seed + 12, X, Y, WARP, WORLD_W, 3);
  let e = fbm(seed + 1, wx, wy, CONTINENT, WORLD_W, 6, 0.55) + 0.3 * fbm(seed + 2, X, Y, 300, WORLD_W, 2);
  e = e / 1.1 - LAND_BIAS;
  if (e > 0) {
    const ridge = 1 - Math.abs(fbm(seed + 3, wx, wy, RIDGES, WORLD_W, 4));
    e += 0.35 * Math.pow(ridge, 6) * Math.min(1, e * 6);
    // hills and valleys, kept off the coast so they don't move it
    e += 0.1 * fbm(seed + 4, X, Y, 24, WORLD_W, 4, 0.7) * Math.min(1, e * 8);
  }
  return e;
}

export function noiseMoist(seed, X, Y) { return fbm(seed + 21, X, Y, 150, WORLD_W, 5); }
export function noiseTemp(seed, X, Y) { return fbm(seed + 31, X, Y, 300, WORLD_W, 3); }
// a few big river valleys in dry lands
export function riverNoise(seed, X, Y) { return fbm(seed + 41, X, Y, 37.5, WORLD_W, 2); }

// Temperature (deg C, today) from absolute latitude (degrees) and elevation.
// g scales the pole-to-equator gradient for a planet whose axis tilts more or
// less than Terra's (see blend.js tiltGradient); the mean stays about the same.
export function baseTemp(alat, e, g = 1) {
  const f = Math.pow(alat / 90, 1.4);
  return 28 - 52 * (g * f + (1 - g) * 0.3) - 22 * Math.max(0, e - 0.12);
}

export function baseMoist(alat, coastDist, n) {
  return 0.5 + 0.38 * n + 0.28 * Math.exp(-coastDist / 10)
    - 0.38 * Math.exp(-(((alat - 24) / 9) ** 2)) + 0.25 * Math.exp(-((alat / 10) ** 2));
}

// Bend a neighbour's noise elevation towards Terra's fixed edge values.
// terraElev is Terra's elevation grid.
export function blendTowardsTerra(x, y, elev, terraElev) {
  const E = terraElev;
  const sides = [];
  if (y === 0 && x === 1) sides.push('W'); // Terra lies to our west
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
