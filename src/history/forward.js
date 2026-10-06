// Generating a sheet's present: its backstory millennium (1000-2000 CE)
// simulated forwards in 50-year steps from a drawn, spun-up starting state,
// by a pipeline of systems.
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
  federations, fallen, emergence, expansion, incursions, secession, collapse, decline, reforms, unions, formBlocs,
} from './politics.js';

// Steering first, so every system sees this step's multipliers; narration last.
const steering = { name: 'steering', step(run, { Y }) { run.steer(Y); } };
const narration = { name: 'narration', step(run, { Y }) { run.log.milestones(Y, run.snap); run.log.advanced(Y, run.snap); } };

export const FORWARD_SYSTEMS = Object.freeze([
  steering, federations, technology, shocks, peoples, languages,
  fallen, emergence, expansion, incursions, secession, collapse, decline, reforms, unions, narration,
]);

export class ForwardRun extends SheetRun {
  /** @param {{systems?: readonly object[]}} [opts]  the pipeline (default FORWARD_SYSTEMS) */
  constructor(world, x, y, t, { systems = FORWARD_SYSTEMS } = {}) {
    super(world, x, y, t);
    this.systems = systems;
  }

  // One 50-year step (s = 0 while spinning up).
  step(s, Y) {
    const tick = { s, Y, shocked: new Set() };
    for (const sys of this.systems) sys.step(this, tick, this.rng(sys.name));
  }

  run() {
    startingState(this);
    const { log } = this;
    log.begin(this.snap, Math.max(0, ...this.snap.tech));

    const snaps = [cloneSnap(this.snap)];
    let prevSizes = this.sizes(), prevMean = this.sheetTech();
    for (let s = 1; s <= STEPS; s++) {
      const Y = this.start + s * STEP_YEARS;
      this.step(s, Y);
      if (s % STEPS_PER_SNAP) continue;
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

// Draw a plausible starting state from the era's distribution, shaped by the
// neighbouring sheets, then spin it up.
function startingState(run) {
  const { n, R, start: Y } = run;
  const rng = run.rng('start');
  run.snap = newSnap(n);
  const { owner, tech } = run.snap;

  // technology: era baseline, smoothed, nudged towards the neighbouring sheets
  for (let r = 0; r < n; r++) {
    if (run.cap(r, Y) < 0.03) continue;
    tech[r] = run.techCeil(r, Y) * rng.range(0.6, 1.0);
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

  startingPeoples(run, rng);

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
    if (!alive.has(id)) { world.polities.delete(id); continue; }
    p.founded = null; p.ended = null; // "before this millennium"
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

// Peoples across the edges reach in; the rest of the land is shared out among
// new peoples, fewer where technology is higher.
function startingPeoples(run, rng) {
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
