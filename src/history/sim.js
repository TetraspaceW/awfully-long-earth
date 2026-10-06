// The forward-time tile generator: one sheet x one millennium, simulated in
// 50-year steps from a known past (or from a drawn starting state when there
// is none), optionally converging on a known future.
//
// Boundary conditions are whatever already exists around the new tile:
//   past face    - the tile one millennium earlier: its end state is our start state
//   future face  - the tile one millennium later: its start state is our end state,
//                  so we steer towards it (polities that must exist get founded,
//                  cultures and technology converge on it)
//   side faces   - neighbouring tiles in the same millennium: their technology and
//                  cultures diffuse across the edge, and their polities can push in
//
// Dynamics are deliberately simple and Earth-like: states emerge where farming
// societies get complex enough, expand by weighted wars of conquest, overextend,
// fragment and collapse; steppe hordes rise fast and fall fast; languages spread
// with farmers and conquerors and split into daughters; technology climbs towards
// an era ceiling, diffuses, and is knocked back by collapses and disasters.
//
// TileSim is one coupled simulation, kept in one class. Its sections:
// helpers, forward run, steering, graph helpers, one forward step, peoples,
// states, unions and blocs, interworld federations, the future face, starting
// states, narration. Reverse-time generation (reverse.js) subclasses it.

import { DIR_NAME, DIR_ORDER, neighbourPos, regionPos, sheetCentre, techCap, STEPS, STEPS_PER_SNAP, STEP_YEARS, tileStart } from '../core/frame.js';
import { clamp } from '../core/util.js';
import { Rng, hashN } from '../core/random.js';
import { regionCapacity, edgeLinks } from '../geo/index.js';
import { adjective, placeName, randomPhon, rulerName } from '../names.js';
import { effectiveYear, humanPresence, federationAt, federationWorlds, development, targetStateCount, targetStateShare } from '../macro.js';
import { regionPower } from '../world/stats.js';
import { cloneSnap } from '../world/world.js';
import { coreName, familyName, namePolity, newCulture, ofName, regionName } from './naming.js';
import { habitatFactor, lineageAt } from '../species.js';

// beyond Terra's present the future is speculation; far from Terra, a sheet can
// reach those levels in what is Terra's distant past
const milestoneText = (t, r, Y) => (Y > 2000 && /post-industrial|Spaceports/.test(t) ? '(Speculative) ' : '') + t.replace('{r}', r);
const MILESTONES = {
  1: 'Farming villages appear around {r}.',
  2: 'Copper-working chiefdoms arise in {r}.',
  3: 'Bronze, writing and the first cities appear in {r}.',
  4: 'Iron-working spreads out from {r}.',
  5: 'A classical age of coinage, philosophy and great roads dawns in {r}.',
  6: 'Agrarian states mature; {r} becomes a centre of learning and long-distance trade.',
  7: 'Printing, gunpowder and ocean-going ships transform {r}.',
  8: 'Industrialisation begins in {r}.',
  9: '{r} enters the information age.',
  10: '{r} becomes post-industrial: automated, long-lived and post-scarcity.',
  11: 'Spaceports and orbital industry rise in {r}.',
};

// The polity record standing for a macro-layer federation, created in the world
// on first use by any sheet.
function federationPolity(world, fed, Y) {
  const key = fed.key;
  let id = world.byKey(key);
  if (id && world.polities.has(id)) return id;
  const rng = new Rng(hashN(world.seed, key));
  const sx = Math.floor(fed.core.gx), sy = Math.floor(fed.core.gy);
  const core = world.tileName(sx, sy).replace(/^the /, '');
  const name = rng.pick([`${core} Concord of Worlds`, `United Worlds of ${core}`, `${core} Interworld Federation`, `Commonwealth of the ${core} Worlds`]);
  id = world.addPolity({
    key, name, adj: core, base: core, core, culture: 0, type: 'federation', macro: true,
    founded: Y, ended: null, capital: { x: sx, y: sy, r: -1 }, home: `${sx},${sy}`,
    color: [Math.round(rng.range(0, 360)), 70, 52], agg: 1,
  });
  return id;
}

export class TileSim {
  /**
   * @param {import('../world/world.js').World} world
   * @param {number} x
   * @param {number} y
   * @param {number} t  millennium layer
   * @param {{ignorePast?: boolean, ignoreFuture?: boolean, tag?: string, commit?: boolean}} [opts]
   *   commit: store the result in the world (bridges run two uncommitted sims)
   */
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
    this.devMemo = new Map();
    this.effMemo = new Map();
    this.regMemo = new Map();
    // each province's position in sheet units, where the macro layer is read
    this.rpos = this.R.map((reg) => regionPos(x, y, reg));
    // how much land the local lineage can use, relative to a typical sheet
    let hab = 0;
    for (let r = 0; r < this.n; r++) if (regionCapacity(this.R[r], 2000) * habitatFactor(this.R[r], this.lineage(r)) >= 0.3) hab++;
    this.sizeFactor = Math.max(0.05, hab / 200);
    this.ctl = { emerge: 1, succ: 0.85, consol: 1, decay: 1, Sstar: 0.6 };
  }

  ev(Y, kind, text, pid = 0) { if (!this.warm) this.events.push({ y: Math.round(Y), kind, text, pid }); }

  rname(r) { return regionName(this.world, this.geo, r); }

  pol(id) { return this.world.polities.get(id); }

  pname(id, Y) { return this.world.polityName(id, Y); }

  pref(id, Y, cap = false) { return this.world.polityRef(id, Y, cap); }

  cname(id) { return this.world.cultureName(id); }

  isHome(pid) { const p = this.pol(pid); return p && p.capital && p.capital.x === this.x && p.capital.y === this.y; }

  // no one lives where the local lineage has not yet become sapient
  // and the land suits each lineage differently (species.js habitats): the
  // people living there, or the local lineage where no one does yet
  cap(r, Y) { return regionCapacity(this.R[r], Y) * habitatFactor(this.R[r], this.people(r)) * humanPresence(this.Er(r, Y)); }
  people(r) {
    const c = this.s && this.s.culture[r];
    return c ? this.world.cultures.get(c) : this.lineage(r);
  }

  // the sapient lineage where province r lies, and how far back history parted there
  lineage(r) { return lineageAt(this.world.seed, ...this.rpos[r]); }

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
        const [gx, gy] = this.rpos[r];
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

  power(r, Y) { return regionPower(this.R[r], this.s.tech[r], Y, this.people(r)); }

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
          e.p += regionPower(reg, snap.tech[reg.id], Y, this.world.cultures.get(snap.culture[reg.id])); e.c++;
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

  // Hooks for reverse-time generation (reverse.js): a state that has to have
  // existed before Yp, and a state whose founding is no longer known.
  revived(pid, size, Yp) {}
  unscheduled(pid) {}

  meanTech(list) {
    let s = 0;
    for (const r of list) s += this.s.tech[r];
    return list.length ? s / list.length : 0;
  }

  // ------------------------------------------------- forward run

  run() {
    const { world } = this;
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

  // ---------------------------- steering towards the macro layer

  // Measured: share of state-ready land under states, effective number of states.
  measure(Y) {
    const { owner, culture, tech } = this.s;
    let ready = 0, owned = 0, cells = 0;
    const by = new Map();
    for (let r = 0; r < this.n; r++) {
      if (!culture[r] || tech[r] < 2.6 || this.cap(r, Y) < 0.3) continue;
      ready++;
      const o = owner[r];
      if (!o) continue;
      owned++;
      const c = this.R[r].cells;
      cells += c;
      by.set(o, (by.get(o) || 0) + c);
    }
    let h = 0;
    for (const c of by.values()) h += c * c;
    return { S: ready ? owned / ready : 0, effN: h ? (cells * cells) / h : 0, ready };
  }

  // Multipliers that nudge every generation mode towards the same macro targets.
  // Targets at each province's position (refreshed every 250 years), and their
  // averages over the sheet. The sheet only measures; the targets vary smoothly
  // across it and on into the next sheet.
  localTargets(Y) {
    const key = Math.floor(Y / 250);
    if (this.tgtMemo && this.tgtMemo.key === key) return this.tgtMemo;
    const seed = this.world.seed;
    const S = new Float32Array(this.n), N = new Float32Array(this.n);
    let sS = 0, sN = 0, w = 0;
    for (let r = 0; r < this.n; r++) {
      const [gx, gy] = this.rpos[r];
      const Tm = techCap(effectiveYear(seed, gx, gy, Y)) * development(seed, gx, gy, Y);
      S[r] = targetStateShare(seed, gx, gy, Y, Tm);
      N[r] = targetStateCount(seed, gx, gy, Y, Tm, this.sizeFactor);
      const c = this.R[r].cells;
      sS += S[r] * c; sN += Math.log(N[r]) * c; w += c;
    }
    this.tgtMemo = { key, S, N, Smean: w ? sS / w : 0.5, Nmean: w ? Math.exp(sN / w) : 10 };
    return this.tgtMemo;
  }

  // >1 where this province's surroundings should be more unified than the sheet average
  unity(r) { const t = this.tgtMemo; return t ? clamp((t.Nmean / t.N[r]) ** 0.7, 0.4, 2.5) : 1; }

  control(Y) {
    const m = this.measure(Y);
    const lt = this.localTargets(Y);
    const Sstar = lt.Smean;
    const Nstar = lt.Nmean;
    const gS = m.ready ? Sstar - m.S : 0;
    const gN = m.effN > 0 && m.ready >= 3 ? Math.log(m.effN / Nstar) : 0;
    this.ctl = {
      Sstar, Nstar,
      emerge: clamp(Math.exp(6 * gS), 0.1, this.warm ? 2 : 4),
      succ: clamp(0.85 + 2 * gS, 0.15, 0.97),
      decay: clamp(Math.exp(-9 * gS), 0.3, 10),
      consol: clamp(Math.exp(2.5 * gN), 0.15, 6),
    };
    return this.ctl;
  }

  // ----------------------------------------------- graph helpers

  ball(r0, radius) {
    const out = new Set([r0]);
    let frontier = [r0];
    for (let d = 0; d < radius; d++) {
      const next = [];
      for (const r of frontier) for (const o of this.R[r].adj) if (!out.has(o)) { out.add(o); next.push(o); }
      frontier = next;
    }
    return out;
  }

  distWithin(start, set) {
    const dist = new Map([[start, 0]]);
    const q = [start];
    for (let i = 0; i < q.length; i++) {
      for (const o of this.neighbours(q[i], 4)) {
        if (set.has(o) && !dist.has(o)) { dist.set(o, dist.get(q[i]) + 1); q.push(o); }
      }
    }
    return dist;
  }

  components(list) {
    const set = new Set(list), seen = new Set(), out = [];
    for (const r0 of list) {
      if (seen.has(r0)) continue;
      const comp = [r0];
      seen.add(r0);
      for (let i = 0; i < comp.length; i++) {
        for (const o of this.R[comp[i]].adj) if (set.has(o) && !seen.has(o)) { seen.add(o); comp.push(o); }
      }
      out.push(comp);
    }
    return out;
  }

  // split a connected set of provinces by people
  byCulture(comp) {
    const by = new Map();
    for (const r of comp) { const c = this.s.culture[r]; if (!by.has(c)) by.set(c, []); by.get(c).push(r); }
    return [...by.values()].flatMap((l) => this.components(l));
  }

  floodFill(arr, seeds, ok) {
    let frontier = seeds.slice();
    while (frontier.length) {
      this.rng.shuffle(frontier);
      const next = [];
      for (const r of frontier) {
        for (const o of this.neighbours(r, 3)) {
          if (arr[o] || !ok(o)) continue;
          arr[o] = arr[r];
          next.push(o);
        }
      }
      frontier = next;
    }
  }

  // -------------------------------------------- one forward step

  step(s, Y) {
    this.Y = Y;
    this.control(Y);
    this.seedDestined(Y, false);
    this.alignFeds(Y, true);
    this.techStep(s, Y);
    const shocked = this.shocks(s, Y);
    this.cultureStep(s, Y);
    const created = [];
    this.foreignEnds(Y);
    this.emergence(s, Y, created);
    let mem = this.members();
    this.expansion(s, Y, mem);
    this.incursions(s, Y);
    mem = this.members();
    this.secessions(s, Y, mem);
    mem = this.members();
    this.collapses(s, Y, mem, shocked);
    this.decline(Y);
    mem = this.members();
    this.reforms(s, Y, mem);
    this.futureUnions(s, Y, this.members());
    this.pull(s, Y);
    this.milestones(Y);
    this.advancedEvents(Y);
  }

  techStep(s, Y) {
    const { n, R, rng } = this;
    const { tech, owner, culture } = this.s;
    const nt = tech.slice();
    const pr = this.perRegion(Y);
    for (let r = 0; r < n; r++) {
      const Ereg = pr.E[r];
      if (!culture[r]) { nt[r] = 0; continue; }
      const c = this.techCeil(r, Y);
      let t = tech[r];
      const m = R[r].cellsNow ? this.cap(r, Y) / R[r].cells : 0;
      const rate = (0.02 + 0.05 * Math.min(1, m / 0.6)) * (owner[r] ? 1.4 : 1) * rng.range(0.5, 1.5);
      if (t < c) t += (c - t) * rate;
      else t -= (t - c) * 0.15;
      let best = 0;
      for (const o of R[r].adj) if (tech[o] > best) best = tech[o];
      for (const [o, d] of R[r].sea) if (tech[o] >= 3 && t >= 2) best = Math.max(best, tech[o] - 0.25 * d);
      for (const e of this.ext[r]) best = Math.max(best, this.nbSnap(e.nb, s).tech[e.rr]);
      if (best > t + 0.3) t += (best - t - 0.3) * 0.15;
      // the modern breakthrough spreads everywhere, unevenly: each region converges
      // on the frontier minus a persistent institutional gap, giving Earth-like
      // inequality by 2000
      if (Ereg >= 1550) t += (this.modernGoal(r, Y) - t) * 0.5 * clamp((Ereg - 1550) / 300, 0, 1);
      nt[r] = Math.min(t, techCap(Ereg) + 0.2);
    }
    tech.set(nt);
    for (let r = 0; r < n; r++) if (tech[r] > this.techMax) this.techMax = tech[r];
  }

  shocks(s, Y) {
    const { rng } = this;
    const shocked = new Set();
    const p = this.E(Y) >= 2000 ? 0.02 : this.E(Y) >= 1900 ? 0.004 : 0.02;
    if (!rng.chance(p)) return shocked;
    const live = [];
    for (let r = 0; r < this.n; r++) if (this.s.culture[r] && this.s.tech[r] >= 1) live.push(r);
    if (!live.length) return shocked;
    const r0 = rng.weighted(live, (r) => this.cap(r, Y) * this.s.tech[r]);
    const radius = rng.int(2, 6);
    let frontier = [r0];
    shocked.add(r0);
    for (let d = 0; d < radius; d++) {
      const next = [];
      for (const r of frontier) for (const o of this.R[r].adj) if (!shocked.has(o)) { shocked.add(o); next.push(o); }
      frontier = next;
    }
    const kinds = this.shockKinds(Y);
    for (const r of shocked) if (this.s.tech[r] >= 2 && this.E(Y) < 1900) this.s.tech[r] = Math.max(0.5, this.s.tech[r] - rng.range(0.1, 0.45));
    if (shocked.size >= 4) this.ev(Y - rng.int(0, 49), 'disaster', `${rng.pick(kinds)} strikes ${this.rname(r0)} and the lands around it.`);
    return shocked;
  }

  // ----------------------------------------------------- peoples

  cultureStep(s, Y) {
    const { n, R, rng } = this;
    const { culture, tech, owner } = this.s;
    const spread = new Map();
    for (let r = 0; r < n; r++) {
      const cap = this.cap(r, Y);
      if (cap < 0.03) { if (!(this.target && this.target.culture[r])) { culture[r] = 0; tech[r] = 0; owner[r] = 0; } continue; }
      // colonise empty land, migrate into less developed land
      const cands = [];
      for (const o of R[r].adj) if (culture[o]) cands.push([culture[o], tech[o], null]);
      for (const [o, d] of R[r].sea) if (culture[o] && tech[o] >= 1.5 + d * 0.3) cands.push([culture[o], tech[o] - 0.2 * d, null]);
      for (const e of this.ext[r]) {
        const sn = this.nbSnap(e.nb, s);
        if (sn.culture[e.rr]) cands.push([sn.culture[e.rr], sn.tech[e.rr], e.nb.dir]);
      }
      if (!culture[r]) {
        if (cands.length && rng.chance(0.35)) {
          const [c, t, dir] = cands.reduce((a, b) => (b[1] > a[1] ? b : a));
          culture[r] = c; tech[r] = Math.max(0.5, t - 0.5);
          this.noteArrival(c, dir, Y, r);
        }
        continue;
      }
      if (tech[r] < 2.6) {
        for (const [c, t, dir] of cands) {
          const diff = t - tech[r];
          if (c === culture[r] || diff < 0.9) continue;
          if (rng.chance(0.05 * diff)) {
            culture[r] = c; tech[r] += 0.5 * diff;
            spread.set(c, (spread.get(c) || 0) + 1);
            this.noteArrival(c, dir, Y, r);
            break;
          }
        }
      }
      // assimilation by rulers
      const o = owner[r];
      if (o) {
        const pc = this.pol(o).culture;
        if (pc && pc !== culture[r] && (this.world.cultures.has(pc))) {
          const pr = this.E(Y) > 1900 ? 0.003 : 0.008 + (this.pol(o).type === 'horde' ? 0.02 : 0);
          if (rng.chance(pr)) { culture[r] = pc; this.noteArrival(pc, null, Y, r); }
        }
      }
    }
    for (const [c, k] of spread) {
      if (k >= 3) this.ev(Y - rng.int(0, 49), 'culture', `${this.cname(c)}-speaking settlers spread into ${k} new lands, bringing their crops and herds.`);
    }
    this.divergence(Y);
    this.emergingCultures(Y);
  }

  noteArrival(c, dir, Y, r) {
    if (this.seenCultures.has(c)) return;
    this.seenCultures.add(c);
    if (this.warm) return;
    this.ev(Y - this.rng.int(0, 49), 'contact', dir
      ? `${this.cname(c)} migrants arrive from the ${DIR_NAME[dir]} and settle ${this.rname(r)}.`
      : `The ${this.cname(c)} language takes hold in ${this.rname(r)}.`);
  }

  divergence(Y) {
    const { rng } = this;
    const { culture } = this.s;
    const byC = new Map();
    for (let r = 0; r < this.n; r++) if (culture[r]) { if (!byC.has(culture[r])) byC.set(culture[r], []); byC.get(culture[r]).push(r); }
    for (const [c, regs] of byC) {
      if (regs.length < 6) continue;
      if (this.target) {
        // don't invent languages the future doesn't remember
        continue;
      }
      const rec = this.world.cultures.get(c);
      const age = rec.origin == null ? 2000 : Y - rec.origin;
      if (age < 1000) continue;
      if (!rng.chance(0.004 * (regs.length / 6) * Math.min(2, age / 1500))) continue;
      const set = new Set(regs);
      const seed = rng.pick(regs);
      const want = Math.max(2, Math.round(regs.length * rng.range(0.25, 0.45)));
      const cluster = [seed], seen = new Set([seed]);
      for (let i = 0; i < cluster.length && cluster.length < want; i++) {
        for (const o of this.R[cluster[i]].adj) if (set.has(o) && !seen.has(o)) { seen.add(o); cluster.push(o); }
      }
      if (cluster.length < 2) continue;
      const d = newCulture(this.world, rng, { parent: c, origin: Y, home: this.pos });
      for (const r of cluster) culture[r] = d;
      this.seenCultures.add(d);
      this.ev(Y - rng.int(0, 49), 'culture', `Cut off from their kin, the ${this.cname(c)} speakers around ${this.rname(seed)} drift apart: the ${this.cname(d)} language emerges.`);
    }
  }

  emergingCultures(Y) {
    if (!this.emerging) return;
    for (const e of this.emerging) {
      if (e.done || Y < e.year) continue;
      e.done = true;
      for (const r of e.regs) if (this.s.culture[r] === e.from) this.s.culture[r] = e.c;
      this.seenCultures.add(e.c);
      this.ev(e.year, 'culture', `The ${this.cname(e.c)} language emerges from ${this.cname(e.from)}.`);
    }
  }

  // ------------------------------------------------------ states

  limit(pid, tech, Y) {
    const p = this.pol(pid);
    const tf = { horde: 1.4, 'city-states': 0.35, chiefdom: 0.3, league: 0.6, empire: 1.2 }[p.type] ?? 1;
    // nation-state era: many mid-sized states. Past the information age the reach
    // of a single government grows steeply: a whole world near tech 9.5, many
    // worlds beyond 10.
    const modern = this.E(Y) >= 1850 && tech < 9 ? 0.6 : 1;
    return (3 + 5 * tech) * tf * modern * Math.exp(Math.max(0, tech - 7) * 1.1);
  }

  createPolity(r, Y, created, { type, culture, parent } = {}) {
    const { rng } = this;
    if (this.target && Y >= this.end) return 0; // the future face decides who exists at the end
    const c = culture || this.s.culture[r];
    if (!c) return 0;
    const tech = this.s.tech[r];
    if (!type) type = this.typeFor(r, tech, Y);
    const nm = namePolity(this.world, rng, c, type);
    const par = parent && this.pol(parent);
    const hue = par ? (par.color[0] + rng.range(-35, 35) + 360) % 360 : rng.int(0, 359);
    const pid = this.world.addPolity({
      name: nm.name, adj: nm.adj, base: nm.base, culture: c, type, parent: parent || 0, founded: Y, ended: null,
      capital: { x: this.x, y: this.y, r }, home: this.pos, agg: Math.round(rng.range(0.6, 1.4) * 100) / 100,
      color: [Math.round(hue), rng.int(40, 70), rng.int(40, 60)],
    });
    this.s.owner[r] = pid;
    if (created) created.push(pid);
    return pid;
  }

  typeFor(r, tech, Y) {
    const { rng } = this;
    const reg = this.R[r];
    if (this.E(Y) >= 1800 && tech >= 7) return rng.weighted(['republic', 'republic', 'kingdom', 'federation', 'union'], () => 1);
    if (reg.steppe > 0.4 && tech < 6.5 && rng.chance(0.7)) return 'horde';
    if (tech < 3.2) return rng.chance(0.5) ? 'chiefdom' : 'city-states';
    const r0 = rng.next();
    if (r0 < 0.62) return 'kingdom';
    if (r0 < 0.76 && tech < 5.5) return 'city-states';
    if (r0 < 0.84) return 'republic';
    if (r0 < 0.92) return 'theocracy';
    return 'league';
  }

  emergence(s, Y, created) {
    const { rng } = this;
    const { owner, tech, culture } = this.s;
    for (let r = 0; r < this.n; r++) {
      if (owner[r] || !culture[r] || tech[r] < 2.6) continue;
      const cap = this.cap(r, Y);
      if (cap < 0.3) continue;
      if (this.target && this.target.owner[r] && this.isDestined(this.target.owner[r]) && s > 14) continue;
      const P = 0.025 * (tech[r] - 2.4) * Math.min(1, cap / 3) * (this.Er(r, Y) >= 1950 ? 6 : 1) * this.ctl.emerge
        * (this.tgtMemo ? Math.exp(4 * (this.tgtMemo.S[r] - this.tgtMemo.Smean)) : 1);
      if (!rng.chance(P)) continue;
      const pid = this.createPolity(r, Y, created);
      if (pid && !this.warm && (tech[r] >= 3 || rng.chance(0.3))) {
        this.ev(Y - rng.int(0, 49), 'polity', `${this.pref(pid, Y, true)} is founded in ${this.rname(r)}.`, pid);
      }
    }
  }

  strength(pid, mem, s, Y) {
    let p = 0;
    for (const r of mem.get(pid) || []) p += this.power(r, Y);
    const e = this.extPower(pid, s, Y);
    return { p: p + e.p, extCount: e.c };
  }

  attackRate(Y, pTech, tTech, pid) {
    const colonial = this.E(Y) >= 1500 && this.E(Y) < 1950 && pTech - tTech >= 1.5;
    let base = 0.3;
    if (this.E(Y) >= 1850) base = 0.05;
    if (this.E(Y) >= 1950) base = 0.004;
    if (this.E(Y) >= 2000) base = 0.03; // speculative: wars never quite end
    if (colonial) base = Math.max(base, 0.5);
    return base * (this.pol(pid).agg || 1);
  }

  expansion(s, Y, mem) {
    const { rng } = this;
    const { owner, tech } = this.s;
    const pids = rng.shuffle([...mem.keys()]);
    const str = new Map();
    const S = (pid) => {
      if (!str.has(pid)) str.set(pid, this.strength(pid, mem, s, Y));
      return str.get(pid);
    };
    for (const pid of pids) {
      const list = mem.get(pid);
      if (!list || !list.length) continue;
      const p = this.pol(pid);
      if (p.macro || (p.ended != null && p.ended <= Y)) continue;
      const pt = this.meanTech(list);
      const st = S(pid);
      const size = list.length + st.extCount;
      const L = this.limit(pid, pt, Y);
      const coh = clamp(1.25 - size / L, 0.03, 1);
      const tries = 1 + Math.min(3, Math.floor(size / 8));
      const dest = this.destined.get(pid);
      for (let k = 0; k < tries; k++) {
        const cand = new Set();
        for (const r of list) {
          if (owner[r] !== pid) continue;
          for (const o of this.neighbours(r, pt)) {
            if (owner[o] === pid || !this.s.culture[o] || this.cap(o, Y) < 0.05) continue;
            if (owner[o] && this.pol(owner[o]).macro) continue;
            if (dest && !dest.regions.has(o)) continue;
            cand.add(o);
          }
        }
        if (!cand.size) break;
        const r = rng.weighted([...cand], (o) => (this.cap(o, Y) + 0.3) * (owner[o] ? 1 : 1.5));
        const q = owner[r];
        let D;
        if (q) {
          D = S(q).p * 1.1;
          const qd = this.destined.get(q);
          if (qd && qd.regions.has(r)) D *= 3 + 10 * (s / STEPS);
        } else {
          D = this.power(r, Y) * 0.8 + 0.5;
          if (tech[r] < 2) D *= 0.3;
        }
        const A = st.p * coh;
        const ratio = A / (A + D);
        let P = this.attackRate(Y, pt, tech[r], pid) * ratio * ratio * 2 * (q ? 0.7 : 1) * this.ctl.consol * this.unity(r);
        if (!q && tech[r] >= 2.6) P *= Math.min(1, this.ctl.emerge); // over target: stop swallowing stateless land
        if (dest) P *= 1 + 6 * (s / STEPS) ** 2;
        if (rng.chance(Math.min(0.9, P))) this.annex(pid, r, q, Y);
      }
    }
  }

  annex(pid, r, q, Y) {
    const { owner } = this.s;
    owner[r] = pid;
    if (q && this.E(Y) >= 1850 && !this.warm && !this.target && owner.includes(q)) {
      const verb = this.E(Y) >= 2000 ? this.rng.pick(['seizes', 'annexes', 'occupies', 'wins', 'takes']) : this.rng.pick(['seizes', 'annexes', 'conquers']);
      const war = this.rng.chance(0.3) ? ` in the ${this.pname(pid, Y).replace(/^(Kingdom|Republic|Federation|Empire|Commonwealth) of /, '')}–${this.pname(q, Y).replace(/^(Kingdom|Republic|Federation|Empire|Commonwealth) of /, '')} War` : '';
      this.ev(Y - this.rng.int(0, 49), 'war', `${this.pref(pid, Y, true)} ${verb} ${this.rname(r)} from ${this.pref(q, Y)}${war}.`, pid);
    }
    const p = this.pol(pid);
    if (p.type === 'horde' && this.rng.chance(0.25)) this.s.culture[r] = p.culture || this.s.culture[r];
    if (q) this.capitalCheck(q, Y, pid);
  }

  // a polity that lost its capital moves it, or dies
  capitalCheck(q, Y, by) {
    const p = this.pol(q);
    if (p.macro) return;
    if (!p.capital || p.capital.x !== this.x || p.capital.y !== this.y) return;
    if (this.s.owner[p.capital.r] === q) return;
    let best = -1, bc = -1;
    for (let r = 0; r < this.n; r++) if (this.s.owner[r] === q) { const c = this.cap(r, Y); if (c > bc) { bc = c; best = r; } }
    if (best >= 0) { p.capital = { x: this.x, y: this.y, r: best }; return; }
    // holdings elsewhere?
    for (const nb of this.nbs) {
      const sn = nb.hist.snaps[4];
      const rr = sn.owner.indexOf(q);
      if (rr >= 0) { p.capital = { x: nb.x, y: nb.y, r: rr }; return; }
    }
    if (this.isDestined(q)) return;
    p.ended = Y;
    if (!this.warm) this.ev(Y - this.rng.int(0, 49), 'war', by ? `${this.pref(q, Y, true)} is conquered by ${this.pref(by, Y)}.` : `${this.pref(q, Y, true)} is extinguished.`, q);
  }

  incursions(s, Y) {
    const { rng } = this;
    const { owner, tech } = this.s;
    let mem = null;
    for (let r = 0; r < this.n; r++) {
      if (!this.ext[r].length || this.cap(r, Y) < 0.05 || !this.s.culture[r]) continue;
      const e = rng.pick(this.ext[r]);
      const sn = this.nbSnap(e.nb, s);
      const q = sn.owner[e.rr];
      if (!q || q === owner[r]) continue;
      const p = this.pol(q);
      if (!p || p.macro || (p.ended != null && p.ended <= Y)) continue;
      if (owner[r] && this.pol(owner[r]).macro) continue;
      if (this.destined.size && !this.isDestined(q) && s > 10) continue;
      const qd = this.destined.get(q);
      if (qd && !qd.regions.has(r)) continue;
      const A = this.extPower(q, s, Y).p;
      if (owner[r] && !mem) mem = this.members();
      const D = owner[r] ? this.strength(owner[r], mem, s, Y).p * 1.2 : this.power(r, Y) * 0.8 + 0.5;
      const ratio = A / (A + D);
      const P = this.attackRate(Y, sn.tech[e.rr], tech[r], q) * ratio * ratio * (qd ? 2 : 0.6);
      if (!rng.chance(Math.min(0.8, P))) continue;
      const prev = owner[r];
      this.annex(q, r, prev, Y);
      if (!this.seenForeign.has(q)) {
        this.seenForeign.add(q);
        this.ev(Y - rng.int(0, 49), 'contact', `${this.pref(q, Y, true)} pushes in from the ${DIR_NAME[e.nb.dir]} and takes ${this.rname(r)}.`, q);
      }
    }
  }

  foreignEnds(Y) {
    const ended = new Set();
    for (let r = 0; r < this.n; r++) {
      const o = this.s.owner[r];
      if (!o || ended.has(o)) continue;
      const p = this.pol(o);
      if (!p.macro && p.ended != null && p.ended <= Y && !this.isDestined(o)) ended.add(o);
    }
    for (const pid of ended) this.fragment(pid, Y, `After the fall of ${this.pref(pid, Y)}, its provinces here go their own way.`);
  }

  fragment(pid, Y, text) {
    const { rng } = this;
    const { owner, culture, tech } = this.s;
    const list = [];
    for (let r = 0; r < this.n; r++) if (owner[r] === pid) { list.push(r); owner[r] = 0; }
    if (!list.length) return;
    if (text && !this.warm) this.ev(Y - rng.int(0, 49), 'war', text, pid);
    const set = new Set(list), seen = new Set();
    const successors = [];
    for (const r0 of list) {
      if (seen.has(r0)) continue;
      const comp = [r0];
      seen.add(r0);
      for (let i = 0; i < comp.length; i++) {
        for (const o of this.R[comp[i]].adj) {
          if (set.has(o) && !seen.has(o) && culture[o] === culture[r0]) { seen.add(o); comp.push(o); }
        }
      }
      if (this.E(Y) < 1900) for (const r of comp) if (tech[r] >= 3) tech[r] = Math.max(2.5, tech[r] - rng.range(0.1, 0.6));
      const best = comp.reduce((a, b) => (tech[b] > tech[a] ? b : a));
      if (tech[best] < 2.6 || !rng.chance(this.ctl.succ)) continue;
      const np = this.createPolity(best, Y, null, { parent: pid });
      if (!np) continue;
      for (const r of comp) owner[r] = np;
      successors.push([np, comp.length]);
    }
    successors.sort((a, b) => b[1] - a[1]);
    if (!this.warm && successors.length && list.length >= 3) {
      const names = successors.slice(0, 3).map(([s]) => `${this.pref(s, Y)}`);
      this.ev(Y - rng.int(0, 49), 'polity', `Successor states arise: ${names.join(', ')}${successors.length > 3 ? ` and ${successors.length - 3} more` : ''}.`, pid);
    }
  }

  secessions(s, Y, mem) {
    const { rng } = this;
    const { culture, owner } = this.s;
    for (const [pid, list] of mem) {
      if (list.length < 4 || this.isDestined(pid)) continue;
      const p = this.pol(pid);
      const L = this.limit(pid, this.meanTech(list), Y);
      const foreignShare = list.filter((r) => culture[r] !== p.culture).length / list.length;
      const pt = this.meanTech(list);
      const colonialShare = list.filter((r) => culture[r] !== p.culture && this.s.tech[r] < pt - 0.8).length / list.length;
      if (p.macro) continue;
      let P = (0.02 * Math.max(0, list.length / L - 0.6) + 0.015 * foreignShare) / this.ctl.consol;
      if (this.E(Y) >= 1945 && colonialShare > 0.2) P += 0.3; // decolonisation
      if (this.E(Y) >= 2000) P += 0.008; // independence movements
      if (this.target && s > 15) P *= 0.3;
      if (!rng.chance(P)) continue;
      const capR = p.capital && p.capital.x === this.x && p.capital.y === this.y ? p.capital.r : -1;
      const cx = capR >= 0 ? this.R[capR].cx : 120, cy = capR >= 0 ? this.R[capR].cy : 60;
      const seed = rng.weighted(list.filter((r) => r !== capR),
        (r) => (culture[r] !== p.culture ? 3 : 1) * (1 + Math.hypot(this.R[r].cx - cx, this.R[r].cy - cy)));
      if (seed === undefined) continue;
      const want = Math.max(1, Math.round(list.length * rng.range(0.15, 0.4)));
      const set = new Set(list.filter((r) => r !== capR));
      const cluster = [seed], seen = new Set([seed]);
      for (let i = 0; i < cluster.length && cluster.length < want; i++) {
        for (const o of this.R[cluster[i]].adj) {
          if (set.has(o) && !seen.has(o) && culture[o] === culture[seed]) { seen.add(o); cluster.push(o); }
        }
      }
      const np = this.createPolity(seed, Y, null, { parent: pid, type: this.E(Y) >= 1945 ? 'republic' : undefined });
      if (!np) continue;
      for (const r of cluster) owner[r] = np;
      if (cluster.length >= 2 || this.E(Y) >= 1800) {
        const verb = this.E(Y) >= 1945 ? 'wins independence from' : rng.pick(['breaks away from', 'rebels against', 'throws off the rule of']);
        this.ev(Y - rng.int(0, 49), 'war', `${this.pref(np, Y, true)} ${verb} ${this.pref(pid, Y)}.`, np);
      }
    }
  }

  collapses(s, Y, mem, shocked) {
    const { rng } = this;
    for (const [pid, list] of mem) {
      if (!this.isHome(pid) || this.isDestined(pid)) continue;
      const p = this.pol(pid);
      if (p.macro) continue;
      const t = this.meanTech(list);
      const ext = this.extPower(pid, s, Y).c;
      const size = list.length + ext;
      const L = this.limit(pid, t, Y);
      const age = Y - (p.founded ?? this.start - 200);
      // dynasties age; constitutional high-tech states mostly don't
      const ageing = Math.min(0.04, Math.max(0, age - 200) / 20000) * (t >= 8 ? 0.15 : 1);
      let P = (0.004 + 0.07 * Math.max(0, size / L - 0.85) + ageing) / this.ctl.consol * this.ctl.decay / this.unity(p.capital.r >= 0 ? p.capital.r : list[0]);
      if (p.type === 'horde') P *= 2.2;
      if (this.E(Y) >= 1850 && t >= 7.5) P *= this.E(Y) >= 2000 ? 0.5 : 0.15;
      if (shocked.has(p.capital.r)) P += 0.12;
      if (this.target) P += 0.25 * (s / STEPS) ** 3;
      if (!rng.chance(P)) continue;
      p.ended = Y;
      const how = this.E(Y) >= 1850
        ? ['collapses in revolution', 'dissolves', 'breaks apart in civil war']
        : ['collapses', 'falls into civil war and breaks apart', 'is torn apart by rival claimants', 'fragments after its last strong ruler dies'];
      this.fragment(pid, Y, `${this.pref(pid, Y, true)} ${rng.pick(how)}${size >= 10 ? ` after ${Math.max(50, Y - (p.founded ?? Y - 200))} years` : ''}.`);
    }
  }

  // Forwards: when more land is under states than the macro target, small
  // states decline into chiefdoms (the mirror of backward revival).
  decline(Y) {
    if (this.E(Y) >= 1900) return;
    const { rng } = this;
    const m = this.measure(Y);
    let excess = Math.round((m.S - this.ctl.Sstar - 0.03) * m.ready);
    if (excess <= 0) return;
    excess = Math.min(excess, Math.ceil(0.05 * m.ready));
    const mem = this.members();
    const small = rng.shuffle([...mem.keys()].filter((p) => {
      const q = this.pol(p);
      return mem.get(p).length <= 3 && this.isHome(p) && !q.macro && !q.earth && !this.isDestined(p);
    }));
    for (const pid of small) {
      if (excess <= 0) break;
      const list = mem.get(pid);
      for (const r of list) this.s.owner[r] = 0;
      this.pol(pid).ended = Y;
      excess -= list.length;
      if (list.length >= 2) this.ev(Y - rng.int(0, 49), 'polity', `${this.pref(pid, Y, true)} ${rng.pick(['declines into scattered chiefdoms', 'is abandoned as its towns empty', 'dissolves into feuding clans'])}.`, pid);
    }
  }

  reforms(s, Y, mem) {
    const { rng } = this;
    for (const [pid, list] of mem) {
      const p = this.pol(pid);
      if (!this.isHome(pid) || p.macro) continue;
      const t = this.meanTech(list);
      if (p.type === 'kingdom' && list.length >= 14 && rng.chance(0.2)) {
        p.type = 'empire';
        const nm = `${p.adj} Empire`;
        p.names = p.names || [[p.founded ?? this.start, p.name]];
        p.names.push([Y, nm]);
        this.ev(Y - rng.int(0, 49), 'polity', `The ${p.name} proclaims itself the ${nm}.`, pid);
      } else if (this.E(Y) >= 2000 && rng.chance(p.type === 'federation' ? 0.004 : 0.012)) {
        const b = ofName(coreName(p));
        const nm = rng.pick([`Second Republic of ${b}`, `Commonwealth of ${b}`, `${b} Directorate`, `Free State of ${b}`, `Restored Kingdom of ${b}`, `People's Assembly of ${b}`]);
        p.names = p.names || [[p.founded ?? this.start, p.name]];
        p.names.push([Y, nm]);
        this.ev(Y - rng.int(0, 49), 'polity', `${rng.pick(['After a constitutional crisis', 'After years of unrest', 'In a bloodless revolution', 'After a disputed succession'])}, ${this.pref(pid, Y - 1)} becomes the ${nm}.`, pid);
      } else if (!['republic', 'federation', 'union'].includes(p.type) && this.E(Y) >= 1780 && t >= 7.3 && rng.chance(p.type === 'kingdom' ? (this.E(Y) >= 2000 ? 0.008 : 0.06) : 0.15)) {
        const big = list.length >= 8;
        const nm = p.earth ? `Republic of ${ofName(p.name)}` : big && rng.chance(0.5) ? `Federation of ${p.base ?? p.adj}` : rng.chance(0.5) ? `${p.adj} Republic` : `Republic of ${p.base ?? p.adj}`;
        p.type = big ? 'federation' : 'republic';
        p.names = p.names || [[p.founded ?? this.start, p.name]];
        p.names.push([Y, nm]);
        this.ev(Y - rng.int(0, 49), 'polity', `Revolution: ${this.pref(pid, Y - 1)} becomes the ${nm}.`, pid);
      }
    }
    // dynastic unions of small kin states
    if (!this.target && rng.chance(0.08 * this.ctl.consol)) {
      const pids = [...mem.keys()].filter((p) => mem.get(p).length < 6 && this.isHome(p));
      for (const a of pids) {
        const ca = this.pol(a).culture;
        for (const r of mem.get(a)) {
          for (const o of this.R[r].adj) {
            const b = this.s.owner[o];
            if (!b || b === a || this.pol(b).culture !== ca || !this.isHome(b)) continue;
            const [big, small] = (mem.get(b)?.length || 0) >= mem.get(a).length ? [b, a] : [a, b];
            for (let q = 0; q < this.n; q++) if (this.s.owner[q] === small) this.s.owner[q] = big;
            this.pol(small).ended = Y;
            this.ev(Y - rng.int(0, 49), 'polity', this.E(Y) >= 1800 ? `${this.pref(small, Y, true)} votes to join ${this.pref(big, Y)}.` : `A dynastic marriage unites ${this.pref(small, Y)} with ${this.pref(big, Y)}.`, big);
            return;
          }
        }
      }
    }
  }

  // -------------------------------------------- unions and blocs

  // The speculative future: as technology rises, states unite (by treaty far more
  // than by conquest), first into continental federations, then whole worlds,
  // then federations spanning several worlds across the sheet edges.
  futureUnions(s, Y, mem) {
    if (this.E(Y) < 2000) return;
    const { rng, world } = this;
    const info = new Map();
    let tsum = 0, tn = 0;
    for (const [pid, list] of mem) {
      const t = this.meanTech(list);
      info.set(pid, { t, size: list.length + this.extPower(pid, s, Y).c });
      tsum += t * list.length; tn += list.length;
    }
    const tAvg = tn ? tsum / tn : 0;
    const rate = clamp((tAvg - 8.6) * 0.1 * this.ctl.consol, 0.005, 0.8);
    const attempts = Math.ceil(mem.size * rate);
    for (let k = 0; k < attempts; k++) {
      const pids = [...mem.keys()].filter((p) => mem.get(p).length && !this.isDestined(p) && !this.pol(p).macro);
      if (pids.length < 2) break;
      const a = rng.weighted(pids, (p) => Math.sqrt(info.get(p)?.size || 1));
      const ia = info.get(a);
      const cand = new Map();
      for (const r of mem.get(a)) {
        for (const o of this.neighbours(r, ia.t + 2)) {
          const b = this.s.owner[o];
          if (b && b !== a && mem.has(b) && mem.get(b).length && !this.isDestined(b) && !this.pol(b).macro) cand.set(b, true);
        }
      }
      if (!cand.size) continue;
      const rootA = world.cultureRoot(this.pol(a).culture);
      const b = rng.weighted([...cand.keys()], (q) => (world.cultureRoot(this.pol(q).culture) === rootA ? 3 : 1));
      const ib = info.get(b);
      const t = Math.min(ia.t, ib.t);
      if (t < 8.8 || ia.size + ib.size > 0.8 * this.limit(a, t, Y)) continue;
      this.unite(a, b, mem, info, Y);
    }
    for (const bloc of world.blocs) {
      if (bloc.to || Y < Math.max(2050, bloc.from + 60)) continue;
      const here = bloc.members.filter((m) => mem.has(m) && mem.get(m).length);
      if (here.length < 3 || !rng.chance(0.04)) continue;
      const name = bloc.name.replace(/ (Union|Community|Compact)$/, '').replace(/^Council of (.*) States$/, '$1') + ' Federation';
      this.merge(here, here.flatMap((m) => mem.get(m)), name, 'federation', Y,
        `The ${here.length} members of the ${bloc.name} merge into a single state, the ${name}.`);
      bloc.to = Y;
      return;
    }
  }

  // Two states become one: the much larger absorbs the smaller, equals federate.
  unite(a, b, mem, info, Y) {
    const { rng, world } = this;
    const [big, small] = info.get(a).size >= info.get(b).size ? [a, b] : [b, a];
    const homeSmall = this.isHome(small) && !this.extPower(small, 0, Y).c;
    if (info.get(big).size >= 2 * info.get(small).size && homeSmall) {
      for (const r of mem.get(small)) this.s.owner[r] = big;
      this.pol(small).ended = Y;
      this.ev(Y - rng.int(0, 49), 'polity', `${this.pref(small, Y, true)} ${rng.pick(['accedes to', 'votes to join', 'is admitted to'])} ${this.pref(big, Y)}.`, big);
      info.get(big).size += info.get(small).size;
      mem.set(big, [...mem.get(big), ...mem.get(small)]);
      mem.set(small, []);
      return;
    }
    if (!this.isHome(a) || !this.isHome(b) || this.extPower(a, 0, Y).c || this.extPower(b, 0, Y).c) return;
    const root = world.cultureRoot(this.pol(a).culture);
    const fam = root === world.cultureRoot(this.pol(b).culture) ? world.cultures.get(root) : null;
    const size = info.get(a).size + info.get(b).size;
    const name = this.unionName(a, b, fam, size, Y);
    const regs = [...mem.get(a), ...mem.get(b)];
    const np = this.merge([a, b], regs, name, 'federation', Y, `${this.pref(a, Y, true)} and ${this.pref(b, Y)} unite as the ${name}.`);
    if (!np) return;
    info.set(np, { t: Math.min(info.get(a).t, info.get(b).t), size });
    mem.set(np, regs); mem.set(a, []); mem.set(b, []);
  }

  unionName(a, b, fam, size, Y) {
    const { rng, world } = this;
    let habitable = 0;
    for (let r = 0; r < this.n; r++) if (this.cap(r, Y) >= 0.3) habitable++;
    if (size >= 0.4 * habitable) {
      const t = world.tileName(this.x, this.y).replace(/^the /, '');
      return rng.pick([`World State of ${t}`, `${t} Planetary Union`, `Federated ${t}`, `Commonwealth of ${t}`]);
    }
    const na = world.polityName(a, Y), nb = world.polityName(b, Y);
    const short = (n) => n.length <= 14 && !/Union|Federation|States|Commonwealth|Republic|Kingdom/.test(n);
    if (short(na) && short(nb) && rng.chance(0.5)) return `Union of ${ofName(na)} and ${ofName(nb)}`;
    if (fam && rng.chance(0.5)) {
      const w = rng.pick(size >= 60 ? ['Continental Federation', 'Union', 'Commonwealth'] : ['Federation', 'Union', 'United States']);
      return w === 'United States' ? `United ${familyName(fam)} States` : `${familyName(fam)} ${w}`;
    }
    const c = world.cultures.get(this.pol(a).culture);
    const base = placeName(c && c.phon ? c.phon : randomPhon(rng), rng);
    return rng.pick([`${adjective(base, c && c.phon, rng)} Federation`, `Federation of ${base}`, `${base} Concord`, `United ${base}`]);
  }

  merge(pids, regs, name, type, Y, text) {
    const first = this.pol(pids[0]);
    const capR = first.capital && first.capital.x === this.x && first.capital.y === this.y ? first.capital.r : regs[0];
    const np = this.createPolity(capR, Y, null, { type, culture: first.culture, parent: pids[0] });
    if (!np) return;
    const p = this.pol(np);
    p.name = name;
    p.base = name;
    p.adj = name.replace(/^(Union of|United) /, '').replace(/ (Federation|Union|Commonwealth|Continental Federation|States|Compact|Community)$/, '');
    p.core = name.replace(/^(World State of|Federated|Commonwealth of|Federation of|United|Union of) /, '')
      .replace(/ (Planetary Union|Continental Federation|Federation|Union|Commonwealth|Concord|States)$/, '');
    for (const r of regs) this.s.owner[r] = np;
    for (const q of pids) this.pol(q).ended = Y;
    this.ev(Y - this.rng.int(0, 49), 'polity', text, np);
    return np;
  }

  formBlocs() {
    if (this.E(this.end) <= 1950 || this.E(this.start) >= 3000) return;
    const { rng } = this;
    const mem = this.members();
    const cands = [...mem.keys()].filter((p) => this.isHome(p) && !this.pol(p).earth && this.meanTech(mem.get(p)) >= 8.3);
    const byRoot = new Map();
    for (const p of cands) {
      const root = this.world.cultureRoot(this.pol(p).culture);
      if (!byRoot.has(root)) byRoot.set(root, []);
      byRoot.get(root).push(p);
    }
    for (const [root, list] of byRoot) {
      if (list.length < 3 || !rng.chance(0.6)) continue;
      const c = this.world.cultures.get(root);
      const base = familyName(c);
      const from = Math.min(this.end, Math.max(this.start, 1950 - (this.E(this.start) - this.start)) + rng.int(0, 50));
      const name = rng.pick([`${base} Union`, `${base} Community`, `Council of ${base} States`, `${base} Compact`]);
      this.world.blocs.push({ id: this.world.id(), name, from, to: null, home: this.pos, members: list });
      this.ev(from, 'polity', `${list.length} states found the ${name}.`);
    }
  }

  // -------------------------------------- interworld federations

  // The federation (polity id) each province should belong to in year Y, from
  // the territorial federation domains of the macro layer.
  fedTargets(Y) {
    if (this.fedMemo && this.fedMemo.Y === Y) return this.fedMemo.t;
    const t = new Int32Array(this.n);
    const info = new Map();
    for (let r = 0; r < this.n; r++) {
      const [gx, gy] = this.rpos[r];
      const fed = federationAt(this.world.seed, gx, gy, Y);
      if (!fed) continue;
      const F = federationPolity(this.world, fed, Y);
      t[r] = F;
      info.set(F, fed);
    }
    this.fedMemo = { Y, t, info };
    return t;
  }

  // Make the sheet agree with the federation domains. Forwards (at Y), provinces
  // outside a federation's domain secede and states mostly inside one accede.
  // Backwards (towards Yp) the same differences are undone: provinces outside
  // the earlier domain were states that acceded at Y, and provinces inside it
  // that aren't federal yet had seceded at Y.
  alignFeds(Y, forward, Yp = Y) {
    const { rng } = this;
    const Yt = forward ? Y : Yp;
    const tgt = this.fedTargets(Yt);
    const { owner } = this.s;
    // federal provinces whose domain has moved
    const out = new Map();
    for (let r = 0; r < this.n; r++) {
      const o = owner[r];
      if (!o || !this.pol(o).macro || tgt[r] === o) continue;
      if (tgt[r]) { owner[r] = tgt[r]; continue; } // frontier between two federations
      if (!out.has(o)) out.set(o, []);
      out.get(o).push(r);
    }
    for (const [G, regs] of out) {
      for (const comp of this.components(regs).flatMap((c) => this.byCulture(c))) {
        const best = comp.reduce((a, b) => (this.s.tech[b] > this.s.tech[a] ? b : a));
        const np = this.createPolity(best, Yt, null, { type: rng.pick(['republic', 'federation', 'union']) });
        if (!np) continue;
        for (const r of comp) owner[r] = np;
        const yy = Y - rng.int(0, 49);
        if (forward) {
          if (comp.length >= 2 && !this.warm) this.ev(yy, 'polity', `${this.pref(np, Y, true)} secedes from ${this.pref(G, Y)}.`, G);
        } else {
          const p = this.pol(np);
          p.founded = null; p.ended = yy;
          this.revived(np, comp.length, Yp);
          if (comp.length >= 2) this.ev(yy, 'polity', `${this.pref(np, Yp, true)} accedes to ${this.pref(G, Y)}.`, G);
        }
      }
    }
    // provinces inside a domain join it, wherever the frontier happens to fall;
    // a state wholly inside joins as a whole
    const mem = this.members();
    for (const [pid, list] of mem) {
      const p = this.pol(pid);
      if (p.macro || this.isDestined(pid)) continue;
      const counts = new Map();
      for (const r of list) if (tgt[r]) counts.set(tgt[r], (counts.get(tgt[r]) || 0) + 1);
      if (!counts.size) continue;
      for (const r of list) if (tgt[r]) owner[r] = tgt[r];
      const [F, inside] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      const whole = inside === list.length;
      const yy = Y - rng.int(0, 49);
      if (forward) {
        if (whole && this.isHome(pid) && !this.extPower(pid, 0, Y).c) p.ended = yy;
        if (!this.warm && (whole || inside >= 3)) {
          const fed = this.fedMemo.info.get(F);
          const n = fed ? federationWorlds(this.world.seed, fed, Y) : 1;
          this.ev(yy, 'polity', whole
            ? `${this.pref(pid, Y, true)} accedes to ${this.pref(F, Y)}${n > 1 ? `, a federation reaching across ${n} worlds` : ''}.`
            : `${inside} provinces of ${this.pref(pid, Y)} vote to join ${this.pref(F, Y)}.`, F);
        }
      } else {
        if (whole && !p.earth) p.founded = yy;
        if (whole) this.unscheduled(pid);
        if (whole || inside >= 3) this.ev(yy, 'polity', whole
          ? `${this.pref(pid, Y, true)} secedes from ${this.pref(F, Yp)}.`
          : `${inside} provinces break away from ${this.pref(F, Yp)} and rejoin ${this.pref(pid, Y)}.`, F);
      }
    }
  }

  // --------------------------------------------- the future face

  setupTarget() {
    this.destined = new Map();
    if (!this.target) return;
    const T = this.target;
    for (let r = 0; r < this.n; r++) {
      const o = T.owner[r];
      if (!o) continue;
      let d = this.destined.get(o);
      if (!d) this.destined.set(o, (d = { regions: new Set(), capReg: -1, seedYear: null, seeded: false }));
      d.regions.add(r);
    }
    for (const [pid, d] of this.destined) {
      const p = this.pol(pid);
      if (p.capital && p.capital.x === this.x && p.capital.y === this.y && d.regions.has(p.capital.r)) {
        d.capReg = p.capital.r;
      } else {
        let best = -1, bc = -1;
        for (const r of d.regions) { const c = this.cap(r, this.end); if (c > bc) { bc = c; best = r; } }
        d.capReg = best;
      }
      const size = d.regions.size;
      if (p.founded != null && p.founded < this.end) d.seedYear = p.founded;
      else d.seedYear = this.end - Math.round(this.rng.range(60, Math.min(950, 150 + 70 * size)) / STEP_YEARS) * STEP_YEARS;
    }
  }

  isDestined(pid) { return this.destined.has(pid); }

  seedDestined(Y, quiet) {
    for (const [pid, d] of this.destined) {
      if (d.seeded || d.seedYear > Y) continue;
      d.seeded = true;
      if (this.s.owner.includes(pid)) continue;
      const r = d.capReg;
      if (r < 0) continue;
      this.s.owner[r] = pid;
      const p = this.pol(pid);
      if (p.founded == null) p.founded = Math.max(d.seedYear, this.start - 500);
      if (!quiet) {
        const where = this.rname(r);
        this.ev(Math.max(Y - this.rng.int(0, 49), d.seedYear), 'polity',
          this.isHome(pid) ? `${this.pref(pid, Y, true)} is founded in ${where}.` : `${this.pref(pid, Y, true)} gains a foothold in ${where}.`, pid);
      }
    }
  }

  enforceTarget(Y) {
    const T = this.target;
    const before = this.sizes();
    const after = new Map();
    for (const o of T.owner) if (o) after.set(o, (after.get(o) || 0) + 1);
    for (const [pid] of before) {
      if (after.has(pid)) continue;
      // who takes its lands?
      const heirs = new Map();
      for (let r = 0; r < this.n; r++) if (this.s.owner[r] === pid && T.owner[r]) heirs.set(T.owner[r], (heirs.get(T.owner[r]) || 0) + 1);
      let heir = 0, hc = 0;
      for (const [h, c] of heirs) if (c > hc) { hc = c; heir = h; }
      const yy = Y - this.rng.int(1, 40);
      if (this.isHome(pid)) {
        const p = this.pol(pid);
        if (p.ended == null || p.ended > yy) p.ended = yy;
        this.ev(yy, 'polity', heir ? `${this.pref(pid, yy, true)} is overrun and absorbed by ${this.pref(heir, yy)}.`
          : `${this.pref(pid, yy, true)} disintegrates.`, pid);
      }
    }
    // cultures that vanish here
    const cBefore = new Set(this.s.culture), cAfter = new Set(T.culture);
    for (const c of cBefore) {
      if (!c || cAfter.has(c)) continue;
      const heirs = new Map();
      for (let r = 0; r < this.n; r++) if (this.s.culture[r] === c && T.culture[r]) heirs.set(T.culture[r], (heirs.get(T.culture[r]) || 0) + 1);
      let heir = 0, hc = 0;
      for (const [h, n] of heirs) if (n > hc) { hc = n; heir = h; }
      if (heir) this.ev(Y - this.rng.int(10, 200), 'culture', `The last ${this.cname(c)}-speaking communities are absorbed by the ${this.cname(heir)}.`);
    }
    this.s = cloneSnap(T);
  }

  // steer towards the future face
  pull(s, Y) {
    const T = this.target;
    if (!T) return;
    const { rng } = this;
    const w = (s / STEPS) ** 3;
    for (let r = 0; r < this.n; r++) {
      this.s.tech[r] += (T.tech[r] - this.s.tech[r]) * w;
      if (s >= 10 && this.s.culture[r] !== T.culture[r] && rng.chance(0.5 * ((s - 10) / 10) ** 2)) {
        this.s.culture[r] = T.culture[r];
      }
    }
  }

  // --------------------------------------------- starting states

  prior() {
    const { n, R, rng, start: Y } = this;
    const T = this.target;
    const owner = new Int32Array(n), culture = new Int32Array(n), tech = new Float32Array(n);
    this.s = { owner, culture, tech };

    // technology: era baseline, smoothed, nudged towards the edges and the future
    for (let r = 0; r < n; r++) {
      if (this.cap(r, Y) < 0.03 && !(T && T.culture[r])) continue;
      let v = this.techCeil(r, Y) * rng.range(0.6, 1.0);
      if (T) v = 0.5 * v + 0.5 * Math.min(v, T.tech[r] + 0.3);
      tech[r] = v;
    }
    for (let it = 0; it < 2; it++) {
      const nt = tech.slice();
      for (let r = 0; r < n; r++) {
        if (!tech[r]) continue;
        let s = tech[r], c = 1;
        for (const o of R[r].adj) if (tech[o]) { s += tech[o]; c++; }
        for (const e of this.ext[r]) { s += 2 * e.nb.hist.snaps[0].tech[e.rr]; c += 2; }
        nt[r] = s / c;
      }
      tech.set(nt);
    }

    // cultures
    if (T) this.priorCulturesFromTarget();
    else if (!this.priorCulturesFromDistant()) this.priorCultures();

    // polities: neighbouring states reach across the edge, then a warm-up
    for (let r = 0; r < n; r++) {
      for (const e of this.ext[r]) {
        const o = e.nb.hist.snaps[0].owner[e.rr];
        const p = o && this.pol(o);
        if (p && (p.ended == null || p.ended > Y) && this.cap(r, Y) >= 0.05 && rng.chance(0.35)) owner[r] = o;
      }
    }
    this.spinUp(Y);
  }

  // A tile with no past should start the way a tile reached by simulating
  // forwards would: run the full dynamics silently at this era for long enough
  // to reach its typical state (unions and federations take many centuries to
  // form, so high-tech eras spin up longer). Throwaway states and peoples from
  // the spin-up are then forgotten.
  spinUp(Y) {
    const { world } = this;
    const firstId = world.nextId;
    const steps = this.E(Y) >= 2000 ? 30 : this.E(Y) >= 1500 ? 20 : 16;
    this.warm = true;
    for (let i = 0; i < steps; i++) this.step(0, Y);
    this.warm = false;
    const alive = new Set(this.s.owner);
    for (const [id, p] of world.polities) {
      if (id < firstId) continue;
      if (p.macro) continue;
      if (!alive.has(id) && !this.isDestined(id)) { world.polities.delete(id); continue; }
      if (!this.isDestined(id)) { p.founded = null; p.ended = null; } // "before this millennium"
    }
    const keep = new Set();
    for (const c of this.s.culture) {
      for (let k = c; k && !keep.has(k); k = world.cultures.get(k)?.parent) keep.add(k);
    }
    for (const id of [...world.cultures.keys()]) {
      if (id >= firstId && !keep.has(id)) world.cultures.delete(id);
      else if (id >= firstId) world.cultures.get(id).origin = null;
    }
  }

  priorCultures() {
    const { n, rng, start: Y } = this;
    const { culture, tech } = this.s;
    const order = [];
    for (let r = 0; r < n; r++) {
      if (this.cap(r, Y) < 0.03) continue;
      for (const e of this.ext[r]) {
        const c = e.nb.hist.snaps[0].culture[e.rr];
        if (c) { culture[r] = c; order.push(r); break; }
      }
    }
    const habitable = [];
    for (let r = 0; r < n; r++) if (this.cap(r, Y) >= 0.03) habitable.push(r);
    const mt = this.meanTech(habitable);
    const k = Math.max(1, Math.round(habitable.length / (6 + 2.5 * mt)) - order.length);
    rng.shuffle(habitable);
    for (const r of habitable.slice(0, k)) {
      if (culture[r]) continue;
      culture[r] = newCulture(this.world, rng, { origin: null, home: this.pos, ...this.lineage(r) });
      order.push(r);
    }
    this.floodFill(culture, order, (r) => this.cap(r, Y) >= 0.03);
    // stragglers on unreachable islands get their own peoples
    for (const r of habitable) {
      if (culture[r]) continue;
      culture[r] = newCulture(this.world, rng, { origin: null, home: this.pos, ...this.lineage(r) });
      this.floodFill(culture, [r], (q) => this.cap(q, Y) >= 0.03);
    }
    for (let r = 0; r < n; r++) if (!culture[r]) tech[r] = 0;
  }

  // Languages are slow: with no adjacent millennium on this sheet, inherit the
  // peoples of the nearest surveyed one (up to five millennia away), the older
  // first, and let the simulation drift from there.
  priorCulturesFromDistant() {
    const { world, x, y, t, n, start: Y } = this;
    let snap = null;
    for (let dt = 2; dt <= 5 && !snap; dt++) {
      const older = world.tile(x, y, t - dt), newer = world.tile(x, y, t + dt);
      if (older) snap = older.snaps[4];
      else if (newer) snap = newer.snaps[0];
    }
    if (!snap) return false;
    const { culture, tech } = this.s;
    const seeds = [];
    for (let r = 0; r < n; r++) {
      const c = snap.culture[r];
      if (c && this.cap(r, Y) >= 0.03 && world.cultures.has(c)) { culture[r] = c; seeds.push(r); }
    }
    if (!seeds.length) return false;
    this.floodFill(culture, seeds, (r) => this.cap(r, Y) >= 0.03);
    for (let r = 0; r < n; r++) if (!culture[r]) tech[r] = 0;
    return true;
  }

  // Start from the future's languages, but leave room for them to have spread:
  // parts of a family's range begin under older peoples it will absorb.
  priorCulturesFromTarget() {
    const { n, rng, start } = this;
    const T = this.target;
    const { culture, tech } = this.s;
    culture.set(T.culture);
    const byC = new Map();
    for (let r = 0; r < n; r++) { const c = T.culture[r]; if (c) { if (!byC.has(c)) byC.set(c, []); byC.get(c).push(r); } }
    this.emerging = [];
    for (const [c, regs] of byC) {
      const rec = this.world.cultures.get(c);
      if (rec && rec.origin != null && rec.origin > start) {
        // born during this millennium from its parent (or from an older people)
        const par = rec.parent && this.world.cultures.has(rec.parent) ? rec.parent
          : newCulture(this.world, rng, { origin: null, home: this.pos, ...this.lineage(regs[0]) });
        for (const r of regs) culture[r] = par;
        this.emerging.push({ c, from: par, regs, year: rec.origin });
        continue;
      }
      if (regs.length < 4 || !rng.chance(0.4)) continue;
      // a periphery of this family's range starts out as someone else's
      const frac = rng.range(0.25, 0.55);
      const set = new Set(regs);
      const seed = rng.pick(regs);
      const cluster = [seed], seen = new Set([seed]);
      for (let i = 0; i < cluster.length && cluster.length < regs.length * frac; i++) {
        for (const o of this.R[cluster[i]].adj) if (set.has(o) && !seen.has(o)) { seen.add(o); cluster.push(o); }
      }
      if (cluster.length === regs.length) cluster.pop();
      let sub = 0;
      for (const r of cluster) for (const o of this.R[r].adj) if (!set.has(o) && T.culture[o]) sub = T.culture[o];
      if (!sub || rng.chance(0.55)) sub = newCulture(this.world, rng, { origin: null, home: this.pos, ...this.lineage(cluster[0]) });
      for (const r of cluster) culture[r] = sub;
    }
    for (let r = 0; r < n; r++) if (!culture[r]) tech[r] = 0;
  }

  // --------------------------------------------------- narration

  // Advanced worlds have their own history even when their borders are settled.
  advancedEvents(Y) {
    if (this.warm || !this.rng.chance(0.12)) return;
    const { rng } = this;
    const live = [];
    for (let r = 0; r < this.n; r++) if (this.s.culture[r] && this.s.tech[r] >= 9.3) live.push(r);
    if (live.length < 3) return;
    const r = this.rname(rng.pick(live));
    const o = this.s.owner[live[0]];
    const who = o ? this.pref(o, Y, true) : 'The peoples of ' + this.world.tileName(this.x, this.y);
    const t = this.meanTech(live);
    const pool = [
      `${who} holds a constitutional convention in ${r} and rewrites its founding charter.`,
      `Machine minds are granted citizenship after a long struggle centred on ${r}.`,
      `${r} is rebuilt as an arcology after a catastrophic flood.`,
      `A great desalination and reforestation programme greens the drylands around ${r}.`,
      `${who} abolishes ageing as a cause of death; the gerontocracy debates begin in ${r}.`,
      `A schism over memory-editing splits the churches of ${r}.`,
      `The last coal mine in ${r} becomes a museum.`,
      `A cultural renaissance in ${r} revives the old languages of the region.`,
    ];
    if (t >= 10) pool.push(
      `Orbital elevators rise from ${r}; the sky fills with stations.`,
      `${who} launches its first crewed probe to another star.`,
      `A rogue artificial intelligence briefly seizes the networks of ${r} before it is talked down.`,
      `Weather control ends famine around ${r}, and starts a century of lawsuits.`,
    );
    this.ev(Y - rng.int(0, 49), 'tech', rng.pick(pool));
  }

  shockKinds(Y) {
    if (this.E(Y) >= 2000) return ['A pandemic', 'Sea-level rise and great storms', 'A grid collapse and civil strife', 'Crop blight from a shifting climate', 'An automation crash and mass unrest'];
    if (this.E(Y) >= 1800) return ['A pandemic', 'A great famine', 'A financial crash and civil strife'];
    return ['A plague', 'A great drought', 'A volcanic winter', 'A cattle plague and famine', 'A succession of failed harvests', 'Earthquakes and floods'];
  }

  // Narrative that is easiest to read off the finished snapshots.
  narrateSnaps(snaps) {
    const { rng } = this;
    const sizes = (sn) => { const m = new Map(); for (const o of sn.owner) if (o) m.set(o, (m.get(o) || 0) + 1); return m; };
    let prev = sizes(snaps[0]);
    for (const [o, c] of prev) this.peak.set(o, c);
    for (let k = 1; k < 5; k++) {
      const Y = this.start + k * 250;
      const now = sizes(snaps[k]);
      for (const [pid, size] of now) {
        this.peak.set(pid, Math.max(this.peak.get(pid) || 0, size));
        if (!this.isHome(pid) || this.pol(pid).macro) continue;
        const before = prev.get(pid) || 0;
        const p = this.pol(pid);
        if (size >= 6 && size - before >= Math.max(4, before) && !p.earth) {
          const c = this.world.cultures.get(p.culture);
          const ruler = c && c.phon ? rulerName(c.phon, rng, this.E(Y), p.type) : 'a new dynasty';
          this.ev(Y - rng.int(30, 220), 'war', `Under ${ruler}, ${this.pref(pid, Y)} conquers ${size - before} provinces.`, pid);
        }
        if (size >= 18 && before < 18) this.ev(Y - rng.int(0, 200), 'polity', `${this.pref(pid, Y, true)} becomes the dominant power of ${this.world.tileName(this.x, this.y)}.`, pid);
      }
      prev = now;
    }
    const maxT = snaps.map((sn) => Math.max(0, ...sn.tech));
    const texts = MILESTONES;
    for (let lvl = Math.floor(maxT[0]) + 1; lvl <= Math.floor(maxT[4]); lvl++) {
      const k = maxT.findIndex((m) => m >= lvl);
      if (k <= 0 || !texts[lvl]) continue;
      const sn = snaps[k];
      let best = 0;
      for (let r = 0; r < this.n; r++) if (sn.tech[r] > sn.tech[best]) best = r;
      const yy = this.start + k * 250 - rng.int(0, 249);
      this.ev(yy, 'tech', milestoneText(texts[lvl], this.rname(best), yy));
    }
  }

  milestones(Y) {
    const lvl = Math.floor(this.techMax);
    if (lvl <= this.milestone) return;
    for (let k = this.milestone + 1; k <= lvl; k++) {
      if (k <= Math.floor(this.pastMax)) continue;
      let best = 0;
      for (let r = 0; r < this.n; r++) if (this.s.tech[r] > this.s.tech[best]) best = r;
      const texts = MILESTONES;
      if (texts[k]) this.ev(Y - this.rng.int(0, 49), 'tech', milestoneText(texts[k], this.rname(best), Y));
    }
    this.milestone = lvl;
  }

  narrateInterval(Y, prev, prevMean) {
    const { rng } = this;
    const now = this.sizes();
    for (const [o, c] of now) this.peak.set(o, Math.max(this.peak.get(o) || 0, c));
    for (const [pid, size] of now) {
      if (!this.isHome(pid) || this.pol(pid).earth || this.pol(pid).macro) continue;
      const before = prev.get(pid) || 0;
      if (size >= 6 && size - before >= Math.max(4, before)) {
        const p = this.pol(pid);
        const c = this.world.cultures.get(p.culture);
        const ruler = c && c.phon ? rulerName(c.phon, rng, this.E(Y), p.type) : 'a new dynasty';
        this.ev(Y - rng.int(60, 240), 'war', `Under ${ruler}, ${this.pref(pid, Y)} conquers ${size - before} provinces.`, pid);
      }
      if (size >= 18 && before < 18) {
        this.ev(Y - rng.int(0, 200), 'polity', `${this.pref(pid, Y, true)} becomes the dominant power of ${this.world.tileName(this.x, this.y)}.`, pid);
      }
    }
    const mean = this.tileMeanTech();
    if (prevMean - mean > 0.35 && this.E(Y) < 1900) {
      this.ev(Y - rng.int(0, 200), 'disaster', `A dark age settles over ${this.world.tileName(this.x, this.y)}: cities shrink, trade routes fail and old learning is lost.`);
    }
  }

  sizes() {
    const m = new Map();
    for (const o of this.s.owner) if (o) m.set(o, (m.get(o) || 0) + 1);
    return m;
  }

  tileMeanTech() {
    let s = 0, w = 0;
    for (let r = 0; r < this.n; r++) {
      const c = this.cap(r, this.start + 500);
      s += this.s.tech[r] * c; w += c;
    }
    return w ? s / w : 0;
  }

  // Drop the comings and goings of statelets that never amounted to anything.
  pruneEvents() {
    const peak = this.peak;
    for (const [o, c] of this.sizes()) peak.set(o, Math.max(peak.get(o) || 0, c));
    const evs = this.events.filter((e) => {
      if (!e.pid || (e.kind !== 'polity' && e.kind !== 'war')) return true;
      if (/independence|proclaims|Revolution|dominant|pushes in|foothold/.test(e.text)) return true;
      const p = this.pol(e.pid);
      const life = (p.ended ?? this.end) - (p.founded ?? this.start);
      return (peak.get(e.pid) || 0) >= 4 || (life >= 400 && (peak.get(e.pid) || 0) >= 2);
    });
    evs.sort((a, b) => a.y - b.y);
    return evs;
  }
}
