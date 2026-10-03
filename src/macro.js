// The macro layer: what Big Earth looks like at the scale of continents and
// centuries, as a pure function of the world seed, a position and a year.
//
// Positions are continuous: (gx, gy) in sheet units, so sheet (x, y) covers
// gx in [x, x+1), gy in [y, y+1). Sheets are how the map is cut up, not
// features of the territory, so nothing here knows where a sheet edge is.
//
// Tiles are generated in whatever order the explorer chooses, from different
// boundary conditions. The micro history differs with the order, but every mode
// is steered towards these targets, so the macro picture (how advanced a place
// is, how much of it is under states, how unified it is, which federation holds
// it) does not depend on the order, and does not jump at sheet edges.

import { COLS, ROW_MIN, ROW_MAX, W, H, techCap } from './constants.js';
import { hashN, Rng } from './rng.js';

const u01 = (...k) => hashN(...k) / 4294967296;
const fade = (t) => t * t * (3 - 2 * t);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapG = (gx) => ((((gx + 5) % COLS) + COLS) % COLS) - 5;

// Position of a province: its centroid in continuous sheet units.
export function regionPos(x, y, reg) { return [x + (reg.cx + 0.5) / W, y + (reg.cy + 0.5) / H]; }
export function sheetCentre(x, y) { return [x + 0.5, y + 0.5]; }

// Smooth noise in [0,1] over space and time. Lattice every 2 sheets and
// `period` years; periodic east-west like Big Earth.
function field(seed, tag, gx, gy, Y, period) {
  const fx = (wrapG(gx) + 5) / 2, fy = (gy - ROW_MIN) / 2, fz = Y / period;
  const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
  const tx = fade(fx - ix), ty = fade(fy - iy), tz = fade(fz - iz);
  const P = COLS / 2;
  const v = (a, b, c) => u01(seed, tag, ((a % P) + P) % P, b, c);
  let s = 0;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) {
    s += v(ix + a, iy + b, iz + c) * (a ? tx : 1 - tx) * (b ? ty : 1 - ty) * (c ? tz : 1 - tz);
  }
  return s;
}

// ---------------------------------------------------------- drift from Terra
//
// Terra's record (the area of sheet 0,0 in 1-2000 CE) is the one fixed point.
// Everything else is joined to it through chains of boundary conditions, and each
// link lets history wander a little, so the further a place is from that record
// (in space and in millennia) the further its history can have drifted: a random
// walk anchored at Terra, whose variance adds up with distance.

function terraDistance(gx, gy, Y) {
  const x = wrapG(gx);
  const dx = Math.max(0, -x, x - 1), dy = Math.max(0, -gy, gy - 1);
  const ds = Math.sqrt(dx * dx + dy * dy);
  const dt = Y < 0 ? -Y / 1000 : Y > 2000 ? (Y - 2000) / 1000 : 0;
  return { ds, dt };
}

// Variance per link: a little per sheet-width near the present (Terra's
// neighbours share its world), more per millennium along Terra's own history,
// and most for places far away in both space and time.
export function driftYears(gx, gy, Y) {
  const { ds: d0, dt } = terraDistance(gx, gy, Y);
  const ds = Math.max(0, d0 - 0.1);
  return Math.sqrt(60000 * ds ** 1.5 + 800000 * dt + 1700000 * ds * dt);
}

// one heavy-tailed smooth walk in about [-1.3, 1.3]
function walk(seed, tag, gx, gy, Y) {
  const n = 2 * (0.7 * field(seed, tag, gx, gy, Y, 4000) + 0.3 * field(seed, tag + '2', gx, gy, Y, 1500)) - 1;
  return Math.sign(n) * Math.min(1.3, 1.6 * Math.abs(n) ** 0.8);
}

// Years this place runs ahead (+) or behind (-) Terra's timeline.
export function eraShift(seed, gx, gy, Y) {
  return Math.round(driftYears(gx, gy, Y) * walk(seed, 'shift', gx, gy, Y));
}

// The year whose technology and institutions this place is living through.
// Sea level and ice follow real time.
export function effectiveYear(seed, gx, gy, Y) { return Y + eraShift(seed, gx, gy, Y); }

const bias = (seed, tag, gx, gy, Y) => Math.min(1.5, 0.35 * driftYears(gx, gy, Y) / 1000) * walk(seed, tag, gx, gy, Y);

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

// ------------------------------------------------------------- federations
//
// Federations are territorial. Each seed has a few dozen federation cores at
// fixed places. A core lights up once its own surroundings reach its founding
// era (in local effective years), then its domain grows outward over centuries,
// holds, and contracts as the core's era ends. A province belongs to the core
// whose domain reaches furthest past it, provided the province itself is in the
// federal era. Domains ignore sheet edges, so federations span worlds (sheets)
// whenever their domains do, and their frontiers move continuously.

const FED_ERA = 2400;   // local effective year from which provinces can federate
const N_CORES = 70;
let coreCache = null;

function cores(seed) {
  if (coreCache && coreCache.seed === seed) return coreCache.list;
  const list = [];
  for (let i = 0; i < N_CORES; i++) {
    const u = (t) => u01(seed, 'core', i, t);
    list.push({
      i,
      gx: -5 + 10 * u('x'),
      gy: ROW_MIN + (ROW_MAX - ROW_MIN + 1) * u('y'),
      J: FED_ERA + 3500 * u('J') ** 1.3,           // founding, in local effective years
      grow: 600 + 1800 * u('g'),                   // years to reach full extent
      span: 1500 + 5000 * u('D'),                  // how long it lasts
      R: 0.5 + 2.8 * u('R') ** 0.8,                // full radius in sheet widths
      w: 0.7 + 0.6 * u('w'),                       // pull where domains overlap
    });
  }
  coreCache = { seed, list };
  return list;
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
function radii(seed, Y) {
  const key = `${seed}|${Y}`;
  let r = radiusMemo.get(key);
  if (!r) {
    r = cores(seed).map((c) => coreRadius(seed, c, Y));
    if (radiusMemo.size > 2000) radiusMemo.clear();
    radiusMemo.set(key, r);
  }
  return r;
}

function dist(ax, ay, bx, by) {
  let dx = Math.abs(wrapG(ax) - wrapG(bx));
  if (dx > COLS / 2) dx = COLS - dx;
  return Math.hypot(dx, ay - by);
}

// The federation (if any) holding position (gx, gy) in year Y.
export function federationAt(seed, gx, gy, Y) {
  if (effectiveYear(seed, gx, gy, Y) < FED_ERA) return null;
  const rs = radii(seed, Y);
  let best = null, bs = 0;
  for (const c of cores(seed)) {
    const r = rs[c.i];
    if (r <= 0.02) continue;
    const d = dist(gx, gy, c.gx, c.gy);
    if (d >= r) continue;
    const s = c.w * (1 - d / r);
    if (s > bs) { bs = s; best = c; }
  }
  if (!best) return null;
  return { id: best.i, key: `fed:core:${best.i}`, core: best, radius: rs[best.i] };
}

// How many sheets (worlds) a federation's domain touches in year Y.
export function federationWorlds(seed, fed, Y) {
  const r = radii(seed, Y)[fed.id];
  let n = 0;
  for (let y = ROW_MIN; y <= ROW_MAX; y++) for (let x = -5; x < 5; x++) {
    const nx = clamp(wrapG(fed.core.gx), x, x + 1), ny = clamp(fed.core.gy, y, y + 1);
    if (dist(fed.core.gx, fed.core.gy, nx, ny) < r) n++;
  }
  return n;
}

// The polity record for a federation, created on first use by any sheet.
export function federationPolity(world, fed, Y) {
  const key = fed.key;
  let id = world.byKey(key);
  if (id && world.polities.has(id)) return id;
  const rng = new Rng(hashN(world.seed, key));
  const sx = Math.floor(wrapG(fed.core.gx)), sy = Math.floor(fed.core.gy);
  const core = world.tileName(sx, sy).replace(/^the /, '');
  const name = rng.pick([`${core} Concord of Worlds`, `United Worlds of ${core}`, `${core} Interworld Federation`, `Commonwealth of the ${core} Worlds`]);
  id = world.addPolity({
    key, name, adj: core, base: core, core, culture: 0, type: 'federation', macro: true,
    founded: Y, ended: null, capital: { x: sx, y: sy, r: -1 }, home: `${sx},${sy}`,
    color: [Math.round(rng.range(0, 360)), 70, 52], agg: 1,
  });
  return id;
}
