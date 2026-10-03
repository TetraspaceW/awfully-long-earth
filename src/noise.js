// Value noise on global cell coordinates, periodic in x so Big Earth wraps east-west.
import { hash2 } from './rng.js';

function lattice(seed, ix, iy, periodX) {
  const x = ((ix % periodX) + periodX) % periodX;
  return hash2(hash2(seed, x), iy) / 4294967296;
}

const fade = (t) => t * t * (3 - 2 * t);

// Smooth noise in [0,1]; `scale` is the lattice spacing in cells; `period` the
// world circumference in cells (must be a multiple of scale).
export function valueNoise(seed, x, y, scale, period) {
  const px = Math.round(period / scale);
  const fx = x / scale, fy = y / scale;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fade(fx - ix), ty = fade(fy - iy);
  const a = lattice(seed, ix, iy, px), b = lattice(seed, ix + 1, iy, px);
  const c = lattice(seed, ix, iy + 1, px), d = lattice(seed, ix + 1, iy + 1, px);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

// Fractal sum in roughly [-1,1].
export function fbm(seed, x, y, scale, period, octaves = 5, gain = 0.5) {
  let amp = 1, sum = 0, norm = 0, s = scale;
  for (let o = 0; o < octaves && s >= 2; o++) {
    sum += amp * (valueNoise(seed + o * 1013, x, y, s, period) * 2 - 1);
    norm += amp;
    amp *= gain;
    s /= 2;
  }
  return sum / norm;
}
