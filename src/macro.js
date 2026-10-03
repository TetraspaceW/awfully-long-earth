// The macro layer: what Big Earth looks like at the scale of whole sheets and
// centuries, as a pure function of the world seed, sheet position and year.
//
// Tiles are generated in whatever order the explorer chooses, from different
// boundary conditions (forwards from a past, in reverse from a future, or from
// nothing). The micro history differs with the order, but every mode is steered
// towards these targets, so the macro picture (how advanced a sheet is, how much
// of it is under states, how unified it is, which worlds federate when) does not.

import { COLS, ROW_MIN, ROW_MAX, wrapX, techCap } from './constants.js';
import { hashN, Rng } from './rng.js';

const u01 = (...k) => hashN(...k) / 4294967296;
const fade = (t) => t * t * (3 - 2 * t);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Smooth noise in [0,1] over sheet space and time. Lattice every 2 sheets and
// `period` years; periodic east-west like Big Earth.
function field(seed, tag, x, y, Y, period) {
  const fx = (wrapX(x) + 5) / 2, fy = (y - ROW_MIN) / 2, fz = Y / period;
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
// Terra's record (sheet 0,0, 1-2000 CE) is the one fixed point. Everything else
// is joined to it through chains of boundary conditions, and each link lets
// history wander a little, so the further a place is from that record (in
// sheets and in millennia) the further its history can have drifted: a random
// walk anchored at Terra. It is modelled as smooth noise whose spread grows
// with that distance. Near Terra the world is Earth-like; far away, a sheet can
// be running thousands of years ahead of or behind Terra's timeline, or be
// unusually unified, fragmented or boom-and-bust.

// Variance of the walk adds up along the chain of links back to Terra's record:
// a little per sheet near the present (Terra's neighbours share its world), more
// per millennium along Terra's own column, and most for places far away in both
// space and time, where nothing has tied history to Terra's for a very long while.
function walkVariance(x, y, Y) {
  const dx = Math.abs(wrapX(x)), dy = Math.abs(y);
  const ds = Math.max(0, Math.sqrt(dx * dx + dy * dy) - 0.6);
  const dt = Y < 0 ? -Y / 1000 : Y > 2000 ? (Y - 2000) / 1000 : 0;
  return 60000 * ds ** 1.5 + 800000 * dt + 1200000 * ds * dt;
}

// typical size of the drift here, in years
export function driftYears(x, y, Y) { return Math.sqrt(walkVariance(x, y, Y)); }

// one heavy-tailed smooth walk in about [-1.3, 1.3]
function walk(seed, tag, x, y, Y) {
  const n = 2 * (0.7 * field(seed, tag, x, y, Y, 4000) + 0.3 * field(seed, tag + '2', x, y, Y, 1500)) - 1;
  return Math.sign(n) * Math.min(1.3, 1.6 * Math.abs(n) ** 0.8);
}

// Years this place runs ahead (+) or behind (-) Terra's timeline.
export function eraShift(seed, x, y, Y) {
  return Math.round(driftYears(x, y, Y) * walk(seed, 'shift', x, y, Y));
}

// The year whose technology and institutions this place is living through.
export function effectiveYear(seed, x, y, Y) { return Y + eraShift(seed, x, y, Y); }

const bias = (seed, tag, x, y, Y) => Math.min(1.5, 0.35 * driftYears(x, y, Y) / 1000) * walk(seed, tag, x, y, Y);

// Golden ages and dark ages: a multiplier on the era's technology ceiling.
// Strong before the modern era, fading out as the world converges after 1500
// (in the place's own effective era). Far from Terra the swings can be wilder.
export function development(seed, x, y, Y) {
  const E = effectiveYear(seed, x, y, Y);
  const n = 0.6 * field(seed, 'dev', x, y, Y, 900) + 0.4 * field(seed, 'dev2', x, y, Y, 350);
  const swing = Math.min(0.5, 0.3 * (1 + 0.3 * Math.abs(bias(seed, 'swing', x, y, Y)))) * clamp((1800 - E) / 300, 0, 1);
  return 1 - swing * (1 - n);
}

// Imperial phase in [0,1]: 1 = an age of empires, 0 = an age of many small states.
export function imperialPhase(seed, x, y, Y) {
  return clamp((field(seed, 'imp', x, y, Y, 600) - 0.2) / 0.6 + 0.25 * bias(seed, 'imp', x, y, Y), 0, 1);
}

// Share of state-ready land (farming societies complex enough for states)
// actually held by states.
export function targetStateShare(seed, x, y, Y, tech) {
  const E = effectiveYear(seed, x, y, Y);
  if (E >= 1950) return 1;
  const phase = imperialPhase(seed, x, y, Y);
  const pre = clamp((0.25 + 0.14 * (tech - 2.6)) * (1 + 0.2 * bias(seed, 'share', x, y, Y)), 0.1, 0.9) * (0.8 + 0.4 * phase);
  const f = clamp((E - 1800) / 150, 0, 1);
  return Math.min(1, pre * (1 - f) + f);
}

// Effective number of states on the sheet (inverse Herfindahl over land held).
// `size` is the sheet's habitable province count relative to a typical sheet.
// Far from Terra, some civilisations are persistently unified, others splintered.
export function targetStateCount(seed, x, y, Y, tech, size) {
  const phase = imperialPhase(seed, x, y, Y);
  size *= Math.exp(-0.7 * bias(seed, 'unity', x, y, Y));
  let base;
  if (tech < 7.5) base = 14 * (1.6 - 1.1 * phase);           // empires come and go
  else if (tech < 9.3) base = 20 * (1.2 - 0.4 * phase);      // the nation-state era
  else base = 18 * Math.exp(-(tech - 9.3) * 1.9) * (1.2 - 0.4 * phase); // unification
  return clamp(base * Math.sqrt(size), 1, 80);
}

export function macroTech(seed, x, y, Y) { return techCap(effectiveYear(seed, x, y, Y)) * development(seed, x, y, Y); }

// ------------------------------------------------------ multi-world federations
//
// Each border between two sheets has its own window of union, drawn from the
// seed. At any year, sheets joined by open borders form one federation, whose
// identity is its earliest open border. Every sheet asks the same question and
// gets the same answer, whatever order it is surveyed in.

const FED_START = 2400; // in effective years
let edgeCache = null;

function edges(seed) {
  if (edgeCache && edgeCache.seed === seed) return edgeCache.list;
  const list = [];
  for (let y = ROW_MIN; y <= ROW_MAX; y++) {
    for (let x = -5; x < 5; x++) {
      const add = (bx, by) => {
        const id = `${x},${y}|${bx},${by}`;
        const J = FED_START + Math.round(3200 * u01(seed, 'fedJ', id) ** 1.3 / 50) * 50;
        const D = 800 + Math.round(4500 * u01(seed, 'fedD', id) / 50) * 50;
        list.push({ id, a: `${x},${y}`, b: `${bx},${by}`, J, end: J + D });
      };
      add(wrapX(x + 1), y);
      if (y < ROW_MAX) add(x, y + 1);
    }
  }
  edgeCache = { seed, list };
  return list;
}

const fedMemo = new Map();

// The federation (if any) that sheet (x,y) belongs to in year Y.
export function federationAt(seed, x, y, Y) {
  if (effectiveYear(seed, x, y, Y) < FED_START) return null;
  const key = `${seed}|${Y}`;
  let clusters = fedMemo.get(key);
  if (!clusters) {
    const parent = new Map();
    const find = (a) => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
    // a border is open when both sides, in their own effective era, are inside its window
    const effAt = new Map();
    const eff = (k) => {
      if (!effAt.has(k)) { const [a, b] = k.split(',').map(Number); effAt.set(k, effectiveYear(seed, a, b, Y)); }
      return effAt.get(k);
    };
    const open = edges(seed).filter((e) => {
      const E = (eff(e.a) + eff(e.b)) / 2;
      return E >= e.J && E < e.end && Math.min(eff(e.a), eff(e.b)) >= FED_START;
    });
    for (const e of open) { if (!parent.has(e.a)) parent.set(e.a, e.a); if (!parent.has(e.b)) parent.set(e.b, e.b); }
    for (const e of open) { const ra = find(e.a), rb = find(e.b); if (ra !== rb) parent.set(ra, rb); }
    clusters = new Map();
    const founding = new Map();
    for (const e of open) {
      const r = find(e.a);
      const f = founding.get(r);
      if (!f || e.J < f.J || (e.J === f.J && e.id < f.id)) founding.set(r, e);
    }
    for (const [sheet] of parent) {
      const r = find(sheet);
      const members = [...parent.keys()].filter((s) => find(s) === r);
      clusters.set(sheet, { edge: founding.get(r), members });
    }
    if (fedMemo.size > 400) fedMemo.clear();
    fedMemo.set(key, clusters);
  }
  return clusters.get(`${wrapX(x)},${y}`) || null;
}

// The polity record for a federation, created on first use by any sheet.
export function federationPolity(world, fed, Y) {
  const key = `fed:${fed.edge.id}`;
  let id = world.byKey(key);
  if (id && world.polities.has(id)) return id;
  const rng = new Rng(hashN(world.seed, key));
  const [ax, ay] = fed.edge.a.split(',').map(Number);
  const core = world.tileName(ax, ay).replace(/^the /, '');
  const name = rng.pick([`${core} Concord of Worlds`, `United Worlds of ${core}`, `${core} Interworld Federation`, `Commonwealth of the ${core} Worlds`]);
  id = world.addPolity({
    key, name, adj: core, base: core, core, culture: 0, type: 'federation', macro: true,
    founded: Y, ended: null, capital: { x: ax, y: ay, r: -1 }, home: fed.edge.a,
    color: [Math.round(rng.range(0, 360)), 70, 52], agg: 1,
  });
  return id;
}
