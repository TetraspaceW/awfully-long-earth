// The macro layer: what Big Earth looks like at the scale of continents and
// centuries, as a pure function of the world seed, a position and a year.
//
// Positions are continuous: (gx, gy) in sheet units, so sheet (x, y) covers
// gx in [x, x+1), gy in [y, y+1). Sheets are how the map is cut up, not
// features of the territory, so nothing here knows where a sheet edge is.
//
// Sheets are revealed in whatever order the explorer chooses, from different
// boundary conditions. The micro history differs with the order, but the
// simulation is steered towards these targets, so the macro picture (how advanced a place
// is, how much of it is under states, how unified it is, which federation holds
// it) does not depend on the order, and does not jump at sheet edges.
//
// Nothing here reads or writes a World.

import { GX0, GY0, techCap } from './core/frame.js';
import { clamp, fade } from './core/util.js';
import { hashN } from './core/random.js';

// Smooth noise over space (sheet units) and time (years), for the macro layer.


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

// Drift from Terra.
//
// Terra is the one fixed point. Everything else is joined to it through chains
// of boundary conditions, and each link lets history wander a little, so the
// further a place is from Terra the further its history can have drifted. This
// is the only way time enters Big Earth: a sheet's present can look like
// Terra's past or future.
//
// The drift is a field with the same statistics everywhere, anchored at Terra:
// octaves 3 to 90 sheets across, minus their value at Terra's own area. So every
// world, not just Terra, has neighbours a few centuries off and far-off worlds
// thousands of years off; Terra only fixes where the zero is.

// distance from Terra's sheet, in sheet widths
function terraDistance(gx, gy) {
  const dx = Math.max(0, -gx, gx - 1), dy = Math.max(0, -gy, gy - 1);
  return Math.sqrt(dx * dx + dy * dy);
}

// Typical drift in years: a little per sheet-width near Terra (its neighbours
// share its world), growing with distance.
export function driftYears(gx, gy) {
  const ds = Math.max(0, terraDistance(gx, gy) - 0.1);
  return Math.sqrt(60000 * ds ** 1.5);
}

// one heavy-tailed smooth walk in about [-1.3, 1.3]
function walk(seed, tag, gx, gy, Y) {
  const n = 2 * (0.7 * field(seed, tag, gx, gy, Y, 4000) + 0.3 * field(seed, tag + '2', gx, gy, Y, 1500)) - 1;
  return Math.sign(n) * Math.min(1.3, 1.6 * Math.abs(n) ** 0.8);
}

// A persistent local leaning (unified or splintered, boom or bust...), growing
// with the drift from Terra.
export const bias = (seed, tag, gx, gy, Y) => Math.min(1.5, 0.35 * driftYears(gx, gy) / 1000) * walk(seed, tag, gx, gy, Y);

const SHIFT_OCTAVES = [[3, 300], [10, 900], [30, 2000], [90, 4000]]; // [sheets, years]

function shiftField(seed, gx, gy, Y) {
  let s = 0;
  for (const [sc, a] of SHIFT_OCTAVES) s += a * (2 * field(seed, 'shift' + sc, gx, gy, Y, 4000, sc) - 1);
  return s;
}

// Years this place runs ahead (+) or behind (-) Terra's timeline.
const shiftMemo = new Map();
export function eraShift(seed, gx, gy, Y) {
  const key = `${seed}|${gx}|${gy}|${Y}`;
  let v = shiftMemo.get(key);
  if (v === undefined) {
    v = computeShift(seed, gx, gy, Y);
    if (shiftMemo.size > 200000) shiftMemo.clear();
    shiftMemo.set(key, v);
  }
  return v;
}

function computeShift(seed, gx, gy, Y) {
  const tx = Math.max(0, Math.min(1, gx)), ty = Math.max(0, Math.min(1, gy));
  return Math.round(shiftField(seed, gx, gy, Y) - shiftField(seed, tx, ty, Y));
}

// The year whose technology and institutions this place is living through.
// Sea level and ice follow real time.
export function effectiveYear(seed, gx, gy, Y) { return Y + eraShift(seed, gx, gy, Y); }

// What history should look like at continental scale: golden and dark ages,
// how much land is under states, how unified it is.


// Golden ages and dark ages: a multiplier on the era's technology ceiling.
// Strong before the modern era, fading out after 1500 (in local effective
// years). Far from Terra the swings can be wilder.
export function development(seed, gx, gy, Y) {
  const E = effectiveYear(seed, gx, gy, Y);
  const n = 0.6 * field(seed, 'dev', gx, gy, Y, 900) + 0.4 * field(seed, 'dev2', gx, gy, Y, 350);
  const swing = Math.min(0.5, 0.3 * (1 + 0.3 * Math.abs(bias(seed, 'swing', gx, gy, Y)))) * clamp((1800 - E) / 300, 0, 1);
  return 1 - swing * (1 - n);
}

// Imperial phase in [0,1]: 1 = an age of empires, 0 = an age of many small states.
export function imperialPhase(seed, gx, gy, Y) {
  return clamp((field(seed, 'imp', gx, gy, Y, 600) - 0.2) / 0.6 + 0.25 * bias(seed, 'imp', gx, gy, Y), 0, 1);
}

// Share of state-ready land (farming societies complex enough for states)
// actually held by states, around this place.
export function targetStateShare(seed, gx, gy, Y, tech) {
  const E = effectiveYear(seed, gx, gy, Y);
  if (E >= 1950) return 1;
  const phase = imperialPhase(seed, gx, gy, Y);
  const pre = clamp((0.25 + 0.14 * (tech - 2.6)) * (1 + 0.2 * bias(seed, 'share', gx, gy, Y)), 0.1, 0.9) * (0.8 + 0.4 * phase);
  const f = clamp((E - 1800) / 150, 0, 1);
  return Math.min(1, pre * (1 - f) + f);
}

// Effective number of states expected over an Earth-sized area here (inverse
// Herfindahl over land held). `size` scales it by how much habitable land the
// area has relative to a typical one. Far from Terra, some civilisations are
// persistently unified, others splintered.
export function targetStateCount(seed, gx, gy, Y, tech, size) {
  const phase = imperialPhase(seed, gx, gy, Y);
  size *= Math.exp(-0.7 * bias(seed, 'unity', gx, gy, Y));
  let base;
  if (tech < 7.5) base = 14 * (1.6 - 1.1 * phase);           // empires come and go
  else if (tech < 9.3) base = 20 * (1.2 - 0.4 * phase);      // the nation-state era
  else base = 18 * Math.exp(-(tech - 9.3) * 1.9) * (1.2 - 0.4 * phase); // unification
  return clamp(base * Math.sqrt(size), 1, 80);
}

export function macroTech(seed, gx, gy, Y) { return techCap(effectiveYear(seed, gx, gy, Y)) * development(seed, gx, gy, Y); }

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
