// Deterministic randomness: hashes, a seeded generator and value noise.

// Deterministic hashing and random numbers.

export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function hash2(a, b) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function hashN(...xs) {
  let h = 0x9e3779b9;
  for (const x of xs) h = hash2(h, typeof x === 'string' ? hashStr(x) : x);
  return h;
}

export class Rng {
  constructor(seed) { this.s = seed >>> 0 || 1; }
  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  weighted(items, weightFn) {
    let total = 0;
    for (const it of items) total += Math.max(0, weightFn(it));
    if (total <= 0) return items.length ? this.pick(items) : undefined;
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, weightFn(it));
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  normal() {
    const u = Math.max(1e-9, this.next()), v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

// Value noise on global cell coordinates; periodic in x when given a finite period.

function lattice(seed, ix, iy, periodX) {
  const x = Number.isFinite(periodX) ? ((ix % periodX) + periodX) % periodX : ix;
  return hash2(hash2(seed, x), iy) / 4294967296;
}

const fade = (t) => t * t * (3 - 2 * t);

// Smooth noise in [0,1]; `scale` is the lattice spacing in cells; `period` the
// world circumference in cells (a multiple of scale), or Infinity for none.
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
