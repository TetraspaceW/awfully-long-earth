// Climate bands. Every sheet has poles and an equator, but which way its north
// points varies across Big Earth, and the bands run on across sheet edges.
//
// A stripe pattern whose direction changes from place to place must bend, and
// where it can't bend far enough, break: a band ends, or forks (as in a
// fingerprint). So the bands are phasor noise: a sum of overlapping wave
// patterns, each a band period long (one sheet height, pole to pole) and
// pointing along a smooth orientation field, windowed so each reaches only a
// couple of sheets. The phase of the sum gives the latitude. Where the patterns
// agree, the bands are straight; where they turn, they bend; where they fall
// out of step and cancel, there is a fork, and the latitude there fades to
// mid-latitudes rather than jump. Forks come every few tens of sheets, along the
// seams between domains of one orientation. Everything is a function of global position, so it is continuous across
// sheet edges.
//
// Terra and its eight neighbours keep the plain layout, north up, with poles at
// the sheet edges; the patterns around them are lined up with it, and the
// orientation is let go gradually over the next several sheets.

import { GX0, GY0, H, W, latOf } from '../core/frame.js';
import { clamp, fade } from '../core/util.js';
import { valueNoise } from '../core/random.js';

const D = 240;                      // kernel spacing, in cells
const R = 2 * D;                    // kernel reach
const K = (2 * Math.PI) / H;        // wavenumber: one band period per sheet height
const ORIENT_SCALE = 30 * W;        // how far the orientation field takes to turn
const FREE = 6 * D;                 // past the locked zone, kernels turn free over this
const Y_EQ = H / 2 - 0.5;           // global row of an equator in the plain layout

// The plain layout's zone, in global cells: Terra's sheet and its eight neighbours.
const LOCK = { x0: (-1 - GX0) * W, x1: (2 - GX0) * W, y0: (-1 - GY0) * H, y1: (2 - GY0) * H };
const lockDistance = (X, Y) => Math.hypot(Math.max(0, LOCK.x0 - X, X - LOCK.x1), Math.max(0, LOCK.y0 - Y, Y - LOCK.y1));

// Whether sheet (x, y) keeps the plain layout.
export const plainLayout = (x, y) => Math.abs(x) <= 1 && Math.abs(y) <= 1;


// Orientation of the bands' north at global cell (X, Y): an angle mod pi, from
// a smooth doubled-angle field, so every direction is equally likely.
function orientation(seed, X, Y) {
  const n = (t, s) => 2 * valueNoise(seed + t, X, Y, s, Infinity) - 1;
  const vx = n(71, ORIENT_SCALE) + 0.5 * n(73, ORIENT_SCALE / 3);
  const vy = n(72, ORIENT_SCALE) + 0.5 * n(74, ORIENT_SCALE / 3);
  return 0.5 * Math.atan2(vy, vx);
}

// Kernel at lattice point (a, b): position, wave vector and phase. Inside the
// locked zone's reach it is lined up with the plain layout; beyond, it turns
// to the orientation field and takes its own phase.
const kernelMemo = new Map();
function kernel(seed, a, b) {
  const key = `${seed}|${a}|${b}`;
  let k = kernelMemo.get(key);
  if (k) return k;
  const X = a * D, Y = b * D;
  const free = fade(clamp((lockDistance(X, Y) - R - D) / FREE, 0, 1));
  const th = free * orientation(seed, X, Y);
  const kx = K * Math.sin(th), ky = K * Math.cos(th);
  // One phase convention for every kernel: the wave is k . (P - (0, Y_EQ)).
  // Kernels pointing nearly the same way then agree over a long stretch, and
  // drift out of step (a fork) only after about 1 / (difference in angle) band
  // periods.
  const c = ky * Y_EQ;
  k = { X, Y, kx, ky, c };
  if (kernelMemo.size > 50000) kernelMemo.clear();
  kernelMemo.set(key, k);
  return k;
}

// Below this fraction of what the patterns would sum to in step, a fork.
const FORK = 0.12;

/**
 * Absolute latitude (degrees, 0 at an equator, 90 at a pole) of every cell of
 * sheet (x, y), for the world's terrain seed.
 * @returns {Float64Array}
 */
export function latitudes(seed, x, y) {
  const out = new Float64Array(W * H);
  if (plainLayout(x, y)) {
    for (let j = 0; j < H; j++) { const l = Math.abs(latOf(j)); for (let i = 0; i < W; i++) out[j * W + i] = l; }
    return out;
  }
  const X0 = (x - GX0) * W, Y0 = (y - GY0) * H;
  const ks = [];
  for (let b = Math.floor((Y0 - R) / D); b <= Math.ceil((Y0 + H + R) / D); b++) {
    for (let a = Math.floor((X0 - R) / D); a <= Math.ceil((X0 + W + R) / D); a++) ks.push(kernel(seed, a, b));
  }
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) out[j * W + i] = sum(ks, X0 + i, Y0 + j);
  return out;
}

function sum(ks, X, Y) {
  let re = 0, im = 0, ws = 0;
  for (const k of ks) {
    const dx = X - k.X, dy = Y - k.Y, r2 = dx * dx + dy * dy;
    if (r2 >= R * R) continue;
    const w = (1 - r2 / (R * R)) ** 2;
    const ph = k.kx * X + k.ky * Y - k.c;
    re += w * Math.cos(ph); im += w * Math.sin(ph); ws += w;
  }
  const lat = 90 * Math.abs(Math.atan2(im, re)) / Math.PI;
  // forks fade to mid-latitudes, so the field stays continuous through them
  return 45 + (lat - 45) * fade(clamp(Math.hypot(re, im) / (FORK * ws), 0, 1));
}

// The same for one global cell (for tests and probes).
export function latitudeAt(seed, X, Y) {
  const ks = [];
  const a0 = Math.round(X / D), b0 = Math.round(Y / D);
  for (let b = b0 - 3; b <= b0 + 3; b++) for (let a = a0 - 3; a <= a0 + 3; a++) ks.push(kernel(seed, a, b));
  return sum(ks, X, Y);
}
