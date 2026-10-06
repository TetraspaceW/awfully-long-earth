// Generating history forwards in time: a pipeline of systems run over a
// SheetRun every 50 years, from a known past or from a drawn starting state.
//
// The pipeline is a plain list of systems ({ name, step(run, tick, rng) }),
// so a game can insert its own (player actions, scripted events) or replace
// any of them; see FORWARD_SYSTEMS and generateTile's `systems` option.

import { STEPS, STEP_YEARS, STEPS_PER_SNAP } from '../core/frame.js';
import { cloneSnap, newSnap } from '../world/world.js';
import { SheetRun } from './kernel.js';
import { newCulture } from './naming.js';
import { technology, shocks, peoples, languages } from './nature.js';
import {
  destiny, federations, fallen, emergence, expansion, incursions, secession, collapse, decline, reforms, unions, pull,
  setupDestiny, enforceTarget, formBlocs,
} from './politics.js';

// Steering first, so every system sees this step's multipliers; narration last.
const steering = { name: 'steering', step(run, { Y }) { run.steer(Y); } };
const narration = { name: 'narration', step(run, { Y }) { run.log.milestones(Y, run.snap); run.log.advanced(Y, run.snap); } };

export const FORWARD_SYSTEMS = Object.freeze([
  steering, destiny, federations, technology, shocks, peoples, languages,
  fallen, emergence, expansion, incursions, secession, collapse, decline, reforms, unions, pull, narration,
]);

export class ForwardRun extends SheetRun {
  /** @param {{systems?: readonly object[]}} [opts]  the pipeline (default FORWARD_SYSTEMS) */
  constructor(world, x, y, t, opts = {}) {
    super(world, x, y, t, opts);
    this.systems = opts.systems || FORWARD_SYSTEMS;
  }

  // One 50-year step (s = 0 while spinning up).
  step(s, Y) {
    const tick = { s, Y, shocked: new Set() };
    for (const sys of this.systems) sys.step(this, tick, this.rng(sys.name));
  }

  run() {
    setupDestiny(this, this.rng('destiny'));
    let pastMax;
    if (this.past) {
      this.snap = cloneSnap(this.past.snaps[4]);
      pastMax = Math.max(...this.past.snaps.map((sn) => Math.max(0, ...sn.tech)));
    } else {
      startingState(this);
      pastMax = this.target ? 0 : Math.max(0, ...this.snap.tech);
    }
    const { log } = this;
    log.begin(this.snap, pastMax);

    const snaps = [cloneSnap(this.snap)];
    let prevSizes = this.sizes(), prevMean = this.sheetTech();
    for (let s = 1; s <= STEPS; s++) {
      const Y = this.start + s * STEP_YEARS;
      this.step(s, Y);
      if (s % STEPS_PER_SNAP) continue;
      if (s === STEPS && this.target) enforceTarget(this, Y);
      const sizes = this.sizes(), mean = this.sheetTech();
      log.growth(Y, prevSizes, sizes);
      log.darkAge(Y, prevMean, mean);
      prevSizes = sizes; prevMean = mean;
      snaps.push(cloneSnap(this.snap));
    }
    formBlocs(this, this.rng('blocs'));
    return this.result(snaps, log.close(this.snap));
  }
}

// ------------------------------------------------------------ starting state

// With no past, draw a plausible starting state from the era's distribution,
// shaped by the known faces, then spin it up.
function startingState(run) {
  const { n, R, start: Y, target: T } = run;
  const rng = run.rng('start');
  run.snap = newSnap(n);
  const { owner, tech } = run.snap;

  // technology: era baseline, smoothed, nudged towards the edges and the future
  for (let r = 0; r < n; r++) {
    if (run.cap(r, Y) < 0.03 && !(T && T.culture[r])) continue;
    let v = run.techCeil(r, Y) * rng.range(0.6, 1.0);
    if (T) v = 0.5 * v + 0.5 * Math.min(v, T.tech[r] + 0.3);
    tech[r] = v;
  }
  for (let it = 0; it < 2; it++) {
    const nt = tech.slice();
    for (let r = 0; r < n; r++) {
      if (!tech[r]) continue;
      let s = tech[r], c = 1;
      for (const o of R[r].adj) if (tech[o]) { s += tech[o]; c++; }
      for (const e of run.ext[r]) { s += 2 * e.nb.hist.snaps[0].tech[e.rr]; c += 2; }
      nt[r] = s / c;
    }
    tech.set(nt);
  }

  if (T) peoplesFromFuture(run, rng);
  else if (!peoplesFromDistant(run, rng)) peoplesFromScratch(run, rng);

  // neighbouring states reach across the edge
  for (let r = 0; r < n; r++) {
    for (const e of run.ext[r]) {
      const o = e.nb.hist.snaps[0].owner[e.rr];
      const p = o && run.pol(o);
      if (p && (p.ended == null || p.ended > Y) && run.cap(r, Y) >= 0.05 && rng.chance(0.35)) owner[r] = o;
    }
  }
  spinUp(run, Y);
}

// A tile with no past should start the way a tile reached by simulating
// forwards would: run the full dynamics silently at this era for long enough
// to reach its typical state (unions and federations take many centuries to
// form, so high-tech eras spin up longer). Throwaway states and peoples from
// the spin-up are then forgotten.
function spinUp(run, Y) {
  const { world } = run;
  const firstId = world.nextId;
  const steps = run.E(Y) >= 2000 ? 30 : run.E(Y) >= 1500 ? 20 : 16;
  run.warm = true;
  for (let i = 0; i < steps; i++) run.step(0, Y);
  run.warm = false;
  const alive = new Set(run.snap.owner);
  for (const [id, p] of world.polities) {
    if (id < firstId || p.macro) continue;
    if (!alive.has(id) && !run.isDestined(id)) { world.polities.delete(id); continue; }
    if (!run.isDestined(id)) { p.founded = null; p.ended = null; } // "before this millennium"
  }
  const keep = new Set();
  for (const c of run.snap.culture) {
    for (let k = c; k && !keep.has(k); k = world.cultures.get(k)?.parent) keep.add(k);
  }
  for (const id of [...world.cultures.keys()]) {
    if (id >= firstId && !keep.has(id)) world.cultures.delete(id);
    else if (id >= firstId) world.cultures.get(id).origin = null;
  }
}

const habitable = (run, Y) => (r) => run.cap(r, Y) >= 0.03;

// Peoples from scratch: those across the edges reach in, the rest of the land
// is shared out among new peoples, fewer where technology is higher.
function peoplesFromScratch(run, rng) {
  const { n, start: Y } = run;
  const { culture, tech } = run.snap;
  const ok = habitable(run, Y);
  const order = [];
  for (let r = 0; r < n; r++) {
    if (!ok(r)) continue;
    for (const e of run.ext[r]) {
      const c = e.nb.hist.snaps[0].culture[e.rr];
      if (c) { culture[r] = c; order.push(r); break; }
    }
  }
  const land = [];
  for (let r = 0; r < n; r++) if (ok(r)) land.push(r);
  const k = Math.max(1, Math.round(land.length / (6 + 2.5 * run.meanTech(land))) - order.length);
  rng.shuffle(land);
  for (const r of land.slice(0, k)) {
    if (culture[r]) continue;
    culture[r] = newCulture(run.world, rng, { origin: null, home: run.pos });
    order.push(r);
  }
  run.floodFill(culture, order, ok, rng);
  // stragglers on unreachable islands get their own peoples
  for (const r of land) {
    if (culture[r]) continue;
    culture[r] = newCulture(run.world, rng, { origin: null, home: run.pos });
    run.floodFill(culture, [r], ok, rng);
  }
  for (let r = 0; r < n; r++) if (!culture[r]) tech[r] = 0;
}

// Languages are slow: with no adjacent millennium on this sheet, inherit the
// peoples of the nearest surveyed one (up to five millennia away).
function peoplesFromDistant(run, rng) {
  const { world, x, y, t, n, start: Y } = run;
  let snap = null;
  for (let dt = 2; dt <= 5 && !snap; dt++) {
    const older = world.tile(x, y, t - dt), newer = world.tile(x, y, t + dt);
    if (older) snap = older.snaps[4];
    else if (newer) snap = newer.snaps[0];
  }
  if (!snap) return false;
  const { culture, tech } = run.snap;
  const ok = habitable(run, Y);
  const seeds = [];
  for (let r = 0; r < n; r++) {
    const c = snap.culture[r];
    if (c && ok(r) && world.cultures.has(c)) { culture[r] = c; seeds.push(r); }
  }
  if (!seeds.length) return false;
  run.floodFill(culture, seeds, ok, rng);
  for (let r = 0; r < n; r++) if (!culture[r]) tech[r] = 0;
  return true;
}

// Start from the future's languages, leaving room for them to have spread:
// parts of a family's range begin under older peoples it will absorb, and
// languages born this millennium begin as their parents (run.emerging).
function peoplesFromFuture(run, rng) {
  const { n, start, target: T, world } = run;
  const { culture, tech } = run.snap;
  culture.set(T.culture);
  const byC = new Map();
  for (let r = 0; r < n; r++) { const c = T.culture[r]; if (c) { if (!byC.has(c)) byC.set(c, []); byC.get(c).push(r); } }
  run.emerging = [];
  for (const [c, regs] of byC) {
    const rec = world.cultures.get(c);
    if (rec && rec.origin != null && rec.origin > start) {
      const par = rec.parent && world.cultures.has(rec.parent) ? rec.parent
        : newCulture(world, rng, { origin: null, home: run.pos });
      for (const r of regs) culture[r] = par;
      run.emerging.push({ c, from: par, regs, year: rec.origin });
      continue;
    }
    if (regs.length < 4 || !rng.chance(0.4)) continue;
    const set = new Set(regs);
    const cluster = run.cluster(rng.pick(regs), set, regs.length * rng.range(0.25, 0.55));
    if (cluster.length === regs.length) cluster.pop();
    let sub = 0;
    for (const r of cluster) for (const o of run.R[r].adj) if (!set.has(o) && T.culture[o]) sub = T.culture[o];
    if (!sub || rng.chance(0.55)) sub = newCulture(world, rng, { origin: null, home: run.pos });
    for (const r of cluster) culture[r] = sub;
  }
  for (let r = 0; r < n; r++) if (!culture[r]) tech[r] = 0;
}
