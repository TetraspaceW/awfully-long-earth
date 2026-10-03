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
// Each border between two sheets has a seeded window of union (in effective
// years). The whole history of federations is worked out once per seed, step by
// step through time, so identities persist: a federation keeps its identity as
// it grows; when two merge, or one splits, the larger part keeps it. Borders have
// hysteresis so they don't flicker. A sheet's accession ramps up over a couple
// of centuries after it joins and down before it leaves (the share of the sheet
// inside the federation), and every generation mode steers towards that share.
// Every sheet gets the same answer whatever order it is surveyed in.

const FED_START = 2400; // in effective years
const STEP = 50, T0 = -30000, T1 = 10050;
const RAMP = 500;       // years for a world to accede fully, or to leave
const MIN_STAY = 150;   // shorter memberships are treated as noise

let timeline = null;

function buildTimeline(seed) {
  const sheets = [];
  for (let y = ROW_MIN; y <= ROW_MAX; y++) for (let x = -5; x < 5; x++) sheets.push([x, y]);
  const idx = new Map(sheets.map(([x, y], i) => [`${x},${y}`, i]));
  const edges = [];
  for (const [x, y] of sheets) {
    const add = (bx, by) => {
      const id = `${x},${y}|${bx},${by}`;
      const J = FED_START + Math.round(3200 * u01(seed, 'fedJ', id) ** 1.3 / 50) * 50;
      const D = 800 + Math.round(4500 * u01(seed, 'fedD', id) / 50) * 50;
      edges.push({ id, a: idx.get(`${x},${y}`), b: idx.get(`${bx},${by}`), J, end: J + D, open: false });
    };
    add(wrapX(x + 1), y);
    if (y < ROW_MAX) add(x, y + 1);
  }
  const nS = sheets.length, nT = Math.round((T1 - T0) / STEP) + 1;
  const ids = Array.from({ length: nS }, () => new Int32Array(nT));   // federation id per sheet per step (0 = none)
  const feds = [null];                                                  // id -> { edge, founded }
  let prev = new Map();                                                 // id -> Set of sheets
  for (let k = 0; k < nT; k++) {
    const Y = T0 + k * STEP;
    const E = sheets.map(([x, y]) => effectiveYear(seed, x, y, Y));
    // borders: open once both sides are well into the window; close at its end or
    // if either side falls well back out of the federal era
    const parent = Int32Array.from({ length: nS }, (_, i) => i);
    const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    for (const e of edges) {
      const avg = (E[e.a] + E[e.b]) / 2, lo = Math.min(E[e.a], E[e.b]);
      if (!e.open && avg >= e.J && avg < e.end - 100 && lo >= FED_START) e.open = true;
      else if (e.open && (avg >= e.end || lo < FED_START - 300 || avg < e.J - 300)) e.open = false;
      if (e.open) { const ra = find(e.a), rb = find(e.b); if (ra !== rb) parent[ra] = rb; }
    }
    const clusters = new Map();
    for (let i = 0; i < nS; i++) { const r = find(i); if (!clusters.has(r)) clusters.set(r, []); clusters.get(r).push(i); }
    // match clusters to last step's federations by overlap; the largest overlap keeps the identity
    const claims = [];
    for (const members of clusters.values()) {
      if (members.length < 2) continue;
      const overlap = new Map();
      for (const m of members) { const old = k ? ids[m][k - 1] : 0; if (old) overlap.set(old, (overlap.get(old) || 0) + 1); }
      for (const [old, n] of overlap) claims.push({ members, old, n });
      if (!overlap.size) claims.push({ members, old: 0, n: 0 });
    }
    claims.sort((a, b) => b.n - a.n || (prev.get(b.old)?.size || 0) - (prev.get(a.old)?.size || 0));
    const taken = new Set(), assigned = new Map();
    for (const c of claims) {
      if (assigned.has(c.members)) continue;
      if (c.old && !taken.has(c.old)) { taken.add(c.old); assigned.set(c.members, c.old); }
    }
    const now = new Map();
    for (const members of clusters.values()) {
      if (members.length < 2) continue;
      let id = assigned.get(members);
      if (!id) {
        // a new federation, named after its founding border
        const e = edges.filter((ed) => ed.open && members.includes(ed.a)).sort((p, q) => p.J - q.J || (p.id < q.id ? -1 : 1))[0];
        id = feds.length;
        feds.push({ edge: e, founded: Y });
      }
      for (const m of members) ids[m][k] = id;
      now.set(id, new Set(members));
    }
    prev = now;
  }
  // memberships shorter than MIN_STAY are noise; drop them
  for (let i = 0; i < nS; i++) {
    const a = ids[i];
    let k = 0;
    while (k < nT) {
      if (!a[k]) { k++; continue; }
      let j = k;
      while (j < nT && a[j]) j++;
      if ((j - k) * STEP < MIN_STAY) a.fill(0, k, j);
      k = j;
    }
  }
  return { seed, sheets, idx, ids, feds, nT };
}

function tl(seed) {
  if (!timeline || timeline.seed !== seed) timeline = buildTimeline(seed);
  return timeline;
}

// The federation (if any) sheet (x,y) belongs to in year Y, and how far it has
// acceded (share in (0,1]: ramps up after joining and down before leaving).
export function federationAt(seed, x, y, Y) {
  const T = tl(seed);
  const k = Math.round((Y - T0) / STEP);
  if (k < 0 || k >= T.nT) return null;
  const i = T.idx.get(`${wrapX(x)},${y}`);
  const a = T.ids[i];
  const id = a[k];
  if (!id) return null;
  let s = k, e = k;
  while (s > 0 && a[s - 1]) s--;
  while (e < T.nT - 1 && a[e + 1]) e++;
  const joined = T0 + s * STEP, leaves = T0 + (e + 1) * STEP;
  const share = clamp(Math.min((Y - joined + STEP) / RAMP, (leaves - Y) / RAMP), 0.05, 1);
  const members = [];
  for (let j = 0; j < T.sheets.length; j++) if (T.ids[j][k] === id) members.push(T.sheets[j].join(','));
  const f = T.feds[id];
  return { id, key: `fed:${id}:${f.edge.id}`, edge: f.edge, founded: f.founded, nameSheet: T.sheets[f.edge.a], members, share, joined, leaves };
}

// The polity record for a federation, created on first use by any sheet.
export function federationPolity(world, fed, Y) {
  const key = fed.key;
  let id = world.byKey(key);
  if (id && world.polities.has(id)) return id;
  const rng = new Rng(hashN(world.seed, key));
  const [ax, ay] = fed.nameSheet;
  const core = world.tileName(ax, ay).replace(/^the /, '');
  const name = rng.pick([`${core} Concord of Worlds`, `United Worlds of ${core}`, `${core} Interworld Federation`, `Commonwealth of the ${core} Worlds`]);
  id = world.addPolity({
    key, name, adj: core, base: core, core, culture: 0, type: 'federation', macro: true,
    founded: fed.founded, ended: null, capital: { x: ax, y: ay, r: -1 }, home: `${ax},${ay}`,
    color: [Math.round(rng.range(0, 360)), 70, 52], agg: 1,
  });
  return id;
}
