// Smooth noise over space (sheet units) and time (years), for the macro layer.

import { GX0, GY0 } from '../core/coords.js';
import { hashN } from '../core/rng.js';
import { fade } from '../core/math.js';

export const u01 = (...k) => hashN(...k) / 4294967296;

// Smooth noise in [0,1] over space and time. Lattice every `scale` sheets and
// `period` years. Big Earth is an endless plane, so nothing repeats.
export function field(seed, tag, gx, gy, Y, period, scale = 2) {
  const fx = (gx - GX0) / scale, fy = (gy - GY0) / scale, fz = Y / period;
  const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
  const tx = fade(fx - ix), ty = fade(fy - iy), tz = fade(fz - iz);
  const v = (a, b, c) => u01(seed, tag, a, b, c);
  let s = 0;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) {
    s += v(ix + a, iy + b, iz + c) * (a ? tx : 1 - tx) * (b ? ty : 1 - ty) * (c ? tz : 1 - tz);
  }
  return s;
}
