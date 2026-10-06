// The tile generator: fills one sheet x one millennium from its boundary
// conditions.
//
// Boundary conditions are whatever already exists around the new tile:
//   past face    - the tile one millennium earlier: its end state is our start state
//   future face  - the tile one millennium later: its start state is our end state,
//                  so we steer towards it (polities that must exist get founded,
//                  cultures and technology converge on it)
//   side faces   - neighbouring tiles in the same millennium: their technology and
//                  cultures diffuse across the edge, and their polities can push in
// With no past face, a plausible starting state is drawn from the era's
// distribution, shaped by whatever faces are known.
//
// The simulation runs in 50-year steps and records 5 snapshots (every 250 years).
// Dynamics are deliberately simple and Earth-like: states emerge where farming
// societies get complex enough, expand by weighted wars of conquest, overextend,
// fragment and collapse; steppe hordes rise fast and fall fast; languages spread
// with farmers and conquerors and split into daughters; technology climbs towards
// an era ceiling, diffuses, and is knocked back by collapses and disasters.
//
// TileSim holds the state of one run and the helpers every part of the dynamics
// shares. The dynamics themselves live in the sibling modules, each a bag of
// methods installed on TileSim's prototype:
//   forward.js     one forward step; technology and disasters
//   peoples.js     settlement, migration, assimilation, language splits
//   polities.js    states: emergence, conquest, secession, collapse, reform
//   unions.js      the speculative future's unions, federations and blocs
//   federations.js keeping in line with the macro layer's interworld federations
//   steering.js    steering every mode towards the macro layer's targets
//   future-face.js converging on a known future
//   prior.js       starting states for tiles with no past, and spin-up
//   backward.js    generating in reverse from a known future
//   bridge.js      filling a gap between a known past and future
//   narration.js   the chronicle
//   graph.js       graph helpers over the province adjacency
// They share state through `this`; read the constructor for what there is.

import { techCap } from '../core/eras.js';
import { clamp } from '../core/math.js';
import { Rng, hashN } from '../core/rng.js';
import { STEPS, STEPS_PER_SNAP, STEP_YEARS, tileStart } from '../core/timeline.js';
import { regionCapacity } from '../geo/cells.js';
import { edgeLinks } from '../geo/edges.js';
import { effectiveYear } from '../macro/drift.js';
import { development } from '../macro/targets.js';
import { regionPower } from '../world/economy.js';
import { cloneSnap } from '../world/snapshot.js';
import { regionName } from './naming.js';
import { DIR_ORDER, neighbourPos, regionPos, sheetCentre } from '../core/coords.js';
import { Steering } from './steering.js';
import { Forward } from './forward.js';
import { Peoples } from './peoples.js';
import { Polities } from './polities.js';
import { Unions } from './unions.js';
import { Federations } from './federations.js';
import { FutureFace } from './future-face.js';
import { Prior } from './prior.js';
import { Backward } from './backward.js';
import { Bridge } from './bridge.js';
import { Narration } from './narration.js';
import { Graph } from './graph.js';

export class TileSim {
  /**
   * @param {import('../world/world.js').World} world
   * @param {number} x
   * @param {number} y
   * @param {number} t  millennium layer
   * @param {{ignorePast?: boolean, ignoreFuture?: boolean, tag?: string, commit?: boolean}} [opts]
   *   commit: store the result in the world (bridges run two uncommitted sims)
   */
  constructor(world, x, y, t, { ignorePast = false, ignoreFuture = false, tag = '', commit = true } = {}) {
    this.world = world; this.x = x; this.y = y; this.t = t;
    this.commit = commit;
    this.pos = `${x},${y}`;
    this.geo = world.geo(x, y);
    this.R = this.geo.regions;
    this.n = this.R.length;
    this.start = tileStart(t);
    this.end = this.start + 1000;
    this.rng = new Rng(hashN(world.seed, 'hist' + tag, x, y, t));
    this.past = ignorePast ? null : world.tile(x, y, t - 1) || null;
    this.future = ignoreFuture ? null : world.tile(x, y, t + 1) || null;
    this.target = this.future ? this.future.snaps[0] : null;
    this.events = [];
    this.inst = Float32Array.from(this.R, (r) => 0.4 + 1.2 * (hashN(world.seed, 'inst', x, y, r.id) / 4294967296));

    // side faces
    this.nbs = [];
    this.ext = Array.from({ length: this.n }, () => []);
    for (const dir of DIR_ORDER) {
      const p = neighbourPos(x, y, dir);
      if (!p) continue;
      const h = world.tile(p.x, p.y, t);
      if (!h) continue;
      const g = world.geo(p.x, p.y);
      const nb = { dir, x: p.x, y: p.y, hist: h, geo: g, pow: [] };
      for (const [ra, rb] of edgeLinks(this.geo, g, dir)) this.ext[ra].push({ nb, rr: rb });
      this.nbs.push(nb);
    }
    this.seenForeign = new Set();
    this.seenCultures = new Set();
    this.peak = new Map();
    let hab = 0;
    for (const r of this.R) if (regionCapacity(r, 2000) >= 0.3) hab++;
    this.sizeFactor = Math.max(0.05, hab / 200);
    this.devMemo = new Map();
    this.effMemo = new Map();
    this.regMemo = new Map();
    this.pos = this.R.map((reg) => regionPos(x, y, reg));
    this.ctl = { emerge: 1, succ: 0.85, consol: 1, decay: 1, Sstar: 0.6 };
  }

  ev(Y, kind, text, pid = 0) { if (!this.warm) this.events.push({ y: Math.round(Y), kind, text, pid }); }

  rname(r) { return regionName(this.world, this.geo, r); }

  pol(id) { return this.world.polities.get(id); }

  pname(id, Y) { return this.world.polityName(id, Y); }

  pref(id, Y, cap = false) { return this.world.polityRef(id, Y, cap); }

  cname(id) { return this.world.cultureName(id); }

  isHome(pid) { const p = this.pol(pid); return p && p.capital && p.capital.x === this.x && p.capital.y === this.y; }

  cap(r, Y) { return regionCapacity(this.R[r], Y); }

  habFactor(r, Y) {
    const reg = this.R[r];
    const m = reg.cellsNow ? this.cap(r, Y) / Math.max(1, reg.cells) : 0;
    const hf = 0.45 + 0.55 * Math.min(1, m / 0.6);
    return hf + (1 - hf) * clamp((this.Er(r, Y) - 1500) / 400, 0, 1);
  }

  // the year whose technology and institutions this sheet is living through
  // (Terra's timeline plus the sheet's drift from it); sea level and ice follow real time
  E(Y) {
    let e = this.effMemo.get(Y);
    if (e === undefined) { e = effectiveYear(this.world.seed, ...sheetCentre(this.x, this.y), Y); this.effMemo.set(Y, e); }
    return e;
  }

  // Per province: macro fields are evaluated where each province actually is, so
  // they run smoothly across sheet edges. Cached per year.
  perRegion(Y) {
    let m = this.regMemo.get(Y);
    if (!m) {
      const seed = this.world.seed;
      m = { E: new Float32Array(this.n), dev: new Float32Array(this.n) };
      for (let r = 0; r < this.n; r++) {
        const [gx, gy] = this.pos[r];
        m.E[r] = effectiveYear(seed, gx, gy, Y);
        m.dev[r] = development(seed, gx, gy, Y);
      }
      if (this.regMemo.size > 64) this.regMemo.clear();
      this.regMemo.set(Y, m);
    }
    return m;
  }

  Er(r, Y) { return this.perRegion(Y).E[r]; }

  dev(Y) {
    let d = this.devMemo.get(Y);
    if (d === undefined) { d = development(this.world.seed, ...sheetCentre(this.x, this.y), Y); this.devMemo.set(Y, d); }
    return d;
  }

  // after 1550 every region converges on the frontier minus a persistent
  // institutional gap, giving Earth-like inequality; all modes share this target
  // (the gap fades over the millennium after 2000)
  modernGoal(r, Y) {
    const E = this.Er(r, Y);
    const gap = (1.6 - this.inst[r]) * 1.6 * (1 - clamp((E - 2000) / 1000, 0, 1));
    return techCap(E) - 0.1 - gap;
  }

  // the era's ceiling here, including the sheet's golden or dark age
  techCeil(r, Y) { const m = this.perRegion(Y); return techCap(m.E[r]) * this.habFactor(r, Y) * m.dev[r]; }

  power(r, Y) { return regionPower(this.R[r], this.s.tech[r], Y); }

  // neighbour tile state at the snapshot nearest to step s
  nbSnap(nb, s) { return nb.hist.snaps[clamp(Math.round(s / STEPS_PER_SNAP), 0, 4)]; }

  extPower(pid, s, Y) {
    let sum = 0, cnt = 0;
    for (const nb of this.nbs) {
      const k = clamp(Math.round(s / STEPS_PER_SNAP), 0, 4);
      if (!nb.pow[k]) {
        const m = new Map(), snap = nb.hist.snaps[k];
        for (const reg of nb.geo.regions) {
          const o = snap.owner[reg.id];
          if (!o) continue;
          const e = m.get(o) || { p: 0, c: 0 };
          e.p += regionPower(reg, snap.tech[reg.id], Y); e.c++;
          m.set(o, e);
        }
        nb.pow[k] = m;
      }
      const e = nb.pow[k].get(pid);
      if (e) { sum += e.p; cnt += e.c; }
    }
    return { p: sum, c: cnt };
  }

  neighbours(r, techMin = 0) {
    const out = this.R[r].adj.slice();
    for (const [o, d] of this.R[r].sea) if (d <= 2 + Math.max(0, techMin - 3) * 1.5) out.push(o);
    return out;
  }

  members() {
    const m = new Map();
    const { owner } = this.s;
    for (let r = 0; r < this.n; r++) {
      const o = owner[r];
      if (!o) continue;
      let a = m.get(o);
      if (!a) m.set(o, (a = []));
      a.push(r);
    }
    return m;
  }

  meanTech(list) {
    let s = 0;
    for (const r of list) s += this.s.tech[r];
    return list.length ? s / list.length : 0;
  }

  run() {
    const { world } = this;
    if (this.target && !this.past) return this.runBackward();
    if (this.target && this.past) return this.runBridge();
    this.setupTarget();
    if (this.past) {
      this.s = cloneSnap(this.past.snaps[4]);
      this.pastMax = Math.max(...this.past.snaps.map((sn) => Math.max(0, ...sn.tech)));
    } else {
      this.prior();
      this.pastMax = this.target ? 0 : Math.max(0, ...this.s.tech);
    }
    this.techMax = Math.max(this.pastMax, ...this.s.tech);
    this.milestone = Math.floor(this.techMax);
    for (const nb of this.nbs) for (const r of nb.hist.snaps[0].culture) this.seenCultures.add(r);
    for (const c of this.s.culture) this.seenCultures.add(c);
    for (const o of this.s.owner) if (o && !this.isHome(o)) this.seenForeign.add(o);

    const snaps = [cloneSnap(this.s)];
    let prevSizes = this.sizes();
    let prevMean = this.tileMeanTech();
    for (let s = 1; s <= STEPS; s++) {
      const Y = this.start + s * STEP_YEARS;
      this.step(s, Y);
      if (s % STEPS_PER_SNAP === 0) {
        if (s === STEPS && this.target) this.enforceTarget(Y);
        this.narrateInterval(Y, prevSizes, prevMean);
        prevSizes = this.sizes();
        prevMean = this.tileMeanTech();
        snaps.push(cloneSnap(this.s));
      }
    }
    this.formBlocs();
    const hist = { x: this.x, y: this.y, t: this.t, snaps, events: this.pruneEvents() };
    if (this.commit) world.setTile(hist);
    return hist;
  }
}

// Copy a method bag's methods onto a class's prototype.
function mixin(target, ...sources) {
  for (const src of sources) {
    for (const name of Object.getOwnPropertyNames(src.prototype)) {
      if (name === 'constructor') continue;
      if (Object.prototype.hasOwnProperty.call(target.prototype, name)) throw new Error(`TileSim.${name} defined twice`);
      Object.defineProperty(target.prototype, name, Object.getOwnPropertyDescriptor(src.prototype, name));
    }
  }
}

mixin(TileSim, Steering, Forward, Peoples, Polities, Unions, Federations, FutureFace, Prior, Backward, Bridge, Narration, Graph);
