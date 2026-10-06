// Interworld federations, as territory.
//
// Federations are territorial. Federation cores sit at fixed places: Big Earth
// is cut into unit cells (one sheet each), and most cells hold one core at a
// seeded spot. A core lights up once its own surroundings reach its founding
// era (in local effective years), then its domain grows outward over centuries,
// holds, and contracts as the core's era ends. A province belongs to the core
// whose domain reaches furthest past it, provided the province itself is in the
// federal era. Domains ignore sheet edges, so federations span worlds (sheets)
// whenever their domains do, and their frontiers move continuously.

import { u01 } from './field.js';
import { effectiveYear } from './drift.js';
import { clamp, fade } from '../core/math.js';

export const FED_ERA = 2400;   // local effective year from which provinces can federate
const FED_RAMP = 600;   // years over which a region's reach into federations grows
const CORE_P = 0.7;      // share of cells holding a core
const CORE_REACH = 4;   // cells to search: a core's radius never exceeds 3.3

const coreMemo = new Map();
function coreAt(seed, cx, cy) {
  const key = `${seed}|${cx}|${cy}`;
  if (coreMemo.has(key)) return coreMemo.get(key);
  const u = (t) => u01(seed, 'core', cx, cy, t);
  let c = null;
  if (u('p') < CORE_P) {
    const R = 0.5 + 2.8 * u('R') ** 0.8;         // full radius in sheet widths
    // the frontier advances at most about a sheet every 500 years
    const grow = R * (800 + 600 * u('g'));       // years to reach full extent
    c = {
      i: `${cx}:${cy}`,
      gx: cx + u('x'),
      gy: cy + u('y'),
      J: FED_ERA + 3500 * u('J') ** 1.3,         // founding, in local effective years
      grow,
      span: grow + 1000 + 4000 * u('D'),         // how long it lasts
      R,
      w: 0.7 + 0.6 * u('w'),                     // pull where domains overlap
    };
  }
  if (coreMemo.size > 20000) coreMemo.clear();
  coreMemo.set(key, c);
  return c;
}

function coreRadius(seed, c, Y) {
  const E = effectiveYear(seed, c.gx, c.gy, Y);
  const a = E - c.J;
  if (a <= 0 || a >= c.span) return 0;
  const up = fade(clamp(a / c.grow, 0, 1));
  const down = fade(clamp((c.span - a) / Math.min(800, c.span / 2), 0, 1));
  return c.R * up * down;
}

const radiusMemo = new Map();
function radius(seed, c, Y) {
  const key = `${seed}|${c.i}|${Y}`;
  let r = radiusMemo.get(key);
  if (r === undefined) {
    r = coreRadius(seed, c, Y);
    if (radiusMemo.size > 50000) radiusMemo.clear();
    radiusMemo.set(key, r);
  }
  return r;
}

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// The federation (if any) holding position (gx, gy) in year Y.
export function federationAt(seed, gx, gy, Y) {
  const E = effectiveYear(seed, gx, gy, Y);
  if (E < FED_ERA) return null;
  // a region entering the federal era joins from the core outward, not all at once
  const ramp = fade(clamp((E - FED_ERA) / FED_RAMP, 0, 1));
  let best = null, bs = 0, br = 0;
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  for (let cy = y0 - CORE_REACH; cy <= y0 + CORE_REACH; cy++) for (let cx = x0 - CORE_REACH; cx <= x0 + CORE_REACH; cx++) {
    const c = coreAt(seed, cx, cy);
    if (!c) continue;
    const d = dist(gx, gy, c.gx, c.gy);
    if (d >= c.R) continue;
    const r = radius(seed, c, Y) * ramp;
    if (r <= 0.02 || d >= r) continue;
    const s = c.w * (1 - d / r);
    if (s > bs) { bs = s; best = c; br = r; }
  }
  if (!best) return null;
  return { id: best.i, key: `fed:core:${best.i}`, core: best, radius: br / ramp };
}

// How many sheets (worlds) a federation's domain touches in year Y.
export function federationWorlds(seed, fed, Y) {
  const r = radius(seed, fed.core, Y), { gx, gy } = fed.core;
  let n = 0;
  for (let y = Math.floor(gy - r); y <= Math.floor(gy + r); y++) for (let x = Math.floor(gx - r); x <= Math.floor(gx + r); x++) {
    const nx = clamp(gx, x, x + 1), ny = clamp(gy, y, y + 1);
    if (dist(gx, gy, nx, ny) < r) n++;
  }
  return n;
}
