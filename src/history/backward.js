// Reverse-time generation: with only a future face, run time backwards from it, undoing what
// history does going forwards.
//
// Methods of TileSim (see tile-sim.js), installed with mixin().

import { clamp } from '../core/math.js';
import { STEPS, STEPS_PER_SNAP, STEP_YEARS } from '../core/timeline.js';
import { cloneSnap } from '../world/snapshot.js';
import { newCulture } from './naming.js';

// backward generation drifts technology towards this share of the era ceiling,
// matching where forward runs settle
const BACK_TECH = 1.05;
const BACK_LAG = 400;

export class Backward {
  // With only a future face, run time backwards from it. Each 50-year step undoes
  // what history would have done: states shrink back towards their founding (and
  // vanish at it), conquered predecessors reappear, clusters of successor states
  // re-merge into the empire that fragmented, languages recede from their margins
  // and daughter languages fold back into their parents, and technology drifts
  // back towards its era's typical level, with the occasional dark age undone.
  // Read forwards, the snapshots are continuous: no forced jump at the end.

  runBackward() {
    const { world } = this;
    this.destined = new Map();
    this.s = cloneSnap(this.target);
    const snaps = new Array(5);
    snaps[4] = cloneSnap(this.s);
    this.sched = new Map();
    for (const [pid, N] of this.sizes()) this.makeSched(pid, N, this.end);
    for (let s = STEPS; s >= 1; s--) {
      const Y = this.start + s * STEP_YEARS, Yp = Y - STEP_YEARS;
      this.backStep(Y, Yp);
      if ((s - 1) % STEPS_PER_SNAP === 0) snaps[(s - 1) / STEPS_PER_SNAP] = cloneSnap(this.s);
    }
    this.narrateSnaps(snaps);
    const hist = { x: this.x, y: this.y, t: this.t, snaps, events: this.pruneEvents() };
    if (this.commit) world.setTile(hist);
    return hist;
  }

  // When was this polity founded (or, for a foreign one, when did it arrive)?
  makeSched(pid, N, at) {
    const p = this.pol(pid);
    const home = this.isHome(pid);
    let f = home ? p.founded : null;
    let drawn = false;
    if (f == null || f >= at) {
      f = at - Math.round(this.rng.range(200, 600 + 100 * N));
      drawn = true;
      if (home && !p.earth) p.founded = f;
    }
    this.sched.set(pid, { N, at, f, drawn });
  }

  schedSize(pid, Y) {
    const sc = this.sched.get(pid);
    if (Y < sc.f) return 0;
    const frac = Math.min(1, (Y - sc.f) / Math.max(50, sc.at - sc.f)) ** 0.8;
    return Math.max(1, Math.round(1 + (sc.N - 1) * frac));
  }

  aliveAt(pid, Y) {
    const sc = this.sched.get(pid);
    return sc ? Y >= sc.f : true;
  }

  backStep(Y, Yp) {
    const { rng, n, R } = this;
    const { owner, culture, tech } = this.s;

    // land that was under ice or sea
    for (let r = 0; r < n; r++) {
      if (culture[r] && this.cap(r, Yp) < 0.03) { owner[r] = 0; culture[r] = 0; tech[r] = 0; }
    }

    // technology drifts towards the era's typical level; undo the odd dark age
    for (let r = 0; r < n; r++) {
      if (!culture[r]) continue;
      const c = this.techCeil(r, Yp);
      const ramp = clamp((this.Er(r, Yp) - 1550) / 300, 0, 1);
      // forward runs climb towards a rising ceiling and lag behind it; aim where they actually are
      const goal = (1 - ramp) * BACK_TECH * this.techCeil(r, Yp - BACK_LAG) + ramp * this.modernGoal(r, Yp - BACK_LAG);
      const t = tech[r] + (goal - tech[r]) * (0.07 + 0.43 * ramp) + rng.normal() * 0.03;
      tech[r] = clamp(t, 0.3, Math.max(c, goal) + 0.2);
    }
    if (this.E(Yp) < 1900 && rng.chance(0.012)) {
      const live = [];
      for (let r = 0; r < n; r++) if (culture[r] && tech[r] >= 3) live.push(r);
      if (live.length) {
        const r0 = rng.pick(live);
        const area = this.ball(r0, rng.int(2, 5));
        for (const r of area) if (culture[r]) tech[r] = Math.min(this.techCeil(r, Yp) + 0.2, tech[r] + rng.range(0.25, 0.6));
        this.ev(Y - rng.int(0, 49), 'disaster', `A dark age falls on the lands around ${this.rname(r0)}: cities shrink, trade fails and old learning is lost.`);
      }
    }
    if (rng.chance(this.E(Yp) >= 1900 ? 0.006 : 0.015)) {
      const live = [];
      for (let r = 0; r < n; r++) if (culture[r] && tech[r] >= 1) live.push(r);
      if (live.length) this.ev(Y - rng.int(0, 49), 'disaster', `${rng.pick(this.shockKinds(Y))} strikes ${this.rname(rng.pick(live))} and the lands around it.`);
    }

    // worlds leave and rejoin federations exactly when the macro layer says
    this.alignFeds(Y, false, Yp);
    this.control(Yp);

    // states shrink back towards their founding
    const mem = this.members();
    for (const [pid, list] of mem) {
      if (this.pol(pid).macro) continue;
      if (!this.sched.has(pid)) this.makeSched(pid, list.length, Y);
      const d = this.schedSize(pid, Yp);
      let k = list.length - d;
      if (k <= 0) continue;
      if (d > 0 && k > 1 && rng.chance(0.3)) k--;
      const p = this.pol(pid);
      const capR = p.capital && p.capital.x === this.x && p.capital.y === this.y && owner[p.capital.r] === pid
        ? p.capital.r : list.reduce((a, b) => (this.cap(b, Y) > this.cap(a, Y) ? b : a));
      const dist = this.distWithin(capR, new Set(list));
      const order = list.slice().sort((a, b) => (dist.get(b) ?? 99) - (dist.get(a) ?? 99) || rng.next() - 0.5);
      const removed = d === 0 ? list : order.filter((r) => r !== capR).slice(0, k);
      for (const r of removed) owner[r] = 0;
      for (const comp of this.components(removed)) this.reassign(comp, pid, d === 0, Y, Yp, capR);
    }

    // stateless land that a since-fallen state used to hold
    this.revive(Y, Yp);

    // steer towards the macro target for how unified the sheet is
    const consol = this.ctl.consol;
    const merges = Math.min(3, Math.ceil(consol));
    for (let i = 0; i < merges; i++) if (rng.chance(clamp(0.15 * consol ** 1.5, 0.01, 0.85))) this.unfragment(Y, Yp, consol > 1.5 ? 12 : 5);
    if (consol < 1) {
      const splits = Math.min(3, Math.ceil(1 / consol - 1));
      for (let i = 0; i < splits; i++) if (rng.chance(clamp(0.5 * (1 / consol - 1), 0, 0.85))) this.unmerge(Y, Yp);
    }

    this.advancedEvents(Y);

    // languages recede
    for (const c of new Set(culture)) {
      const rec = c && this.world.cultures.get(c);
      if (!rec || rec.origin == null || rec.origin < Yp || rec.origin > Y) continue;
      const par = rec.parent && this.world.cultures.has(rec.parent) ? rec.parent : 0;
      if (!par) continue;
      for (let r = 0; r < n; r++) if (culture[r] === c) culture[r] = par;
      this.ev(rec.origin, 'culture', `The ${this.cname(c)} language emerges from ${this.cname(par)}.`);
    }
    const nc = culture.slice();
    for (let r = 0; r < n; r++) {
      const c = culture[r];
      if (!c) continue;
      const others = R[r].adj.filter((o) => culture[o] && culture[o] !== c);
      if (!others.length) continue;
      let P = 0.012;
      const o = owner[r];
      if (o && this.pol(o).culture === c) P += 0.012; // spread by its rulers
      if (rng.chance(P)) nc[r] = culture[rng.pick(others)];
    }
    culture.set(nc);
    if (rng.chance(0.06)) this.unabsorb(Y);
  }

  // Who held these provinces before `pid` took them (or before it existed)?
  reassign(comp, pid, founding, Y, Yp, capR) {
    const { rng } = this;
    const { owner, tech } = this.s;
    const yy = Y - rng.int(0, 49);
    const neigh = new Set();
    for (const r of comp) for (const o of this.R[r].adj) {
      const q = owner[o];
      if (q && q !== pid && this.aliveAt(q, Yp)) neigh.add(q);
    }
    const home = this.isHome(pid);
    if (founding) {
      if (neigh.size && rng.chance(0.4)) {
        const q = rng.pick([...neigh]);
        for (const r of comp) owner[r] = q;
        if (home) this.ev(yy, 'war', `${this.pref(pid, Y, true)} ${rng.pick(['breaks away from', 'rebels against', 'throws off the rule of'])} ${this.pref(q, Y)}.`, pid);
      } else if (home) {
        this.ev(yy, 'polity', `${this.pref(pid, Y, true)} is founded in ${this.rname(comp.includes(capR) ? capR : comp[0])}.`, pid);
      }
      if (!home && comp.includes(capR)) {
        this.ev(yy, 'contact', `${this.pref(pid, Y, true)} extends its rule into ${this.rname(comp[0])}.`, pid);
      }
      return;
    }
    if (neigh.size && rng.chance(0.25)) {
      const q = rng.pick([...neigh]);
      for (const r of comp) owner[r] = q;
      return;
    }
    const best = comp.reduce((a, b) => (tech[b] > tech[a] ? b : a));
    if (tech[best] >= 2.6 && rng.chance(0.6)) {
      const x = this.createPolity(best, Yp, null);
      if (!x) return;
      for (const r of comp) owner[r] = x;
      const px = this.pol(x);
      px.founded = null;
      px.ended = yy;
      this.makeSched(x, comp.length, Yp);
      this.ev(yy, 'war', `${this.pref(x, Yp, true)} is conquered by ${this.pref(pid, Y)}.`, comp.length >= 3 ? 0 : x);
    }
  }

  // Forward in time: a state collapses and leaves stateless land behind at Y.
  // Keeps the share of state-ready land under states near what forward runs show.
  revive(Y, Yp) {
    const { rng } = this;
    const { owner, culture, tech } = this.s;
    const ready = [], free = [];
    for (let r = 0; r < this.n; r++) {
      if (!culture[r] || tech[r] < 2.6 || this.cap(r, Yp) < 0.3) continue;
      ready.push(r);
      if (!owner[r]) free.push(r);
    }
    if (!ready.length) return;
    const want = this.ctl.Sstar;
    const share = 1 - free.length / ready.length;
    let budget = Math.round((want - share) * ready.length * 0.9 + rng.normal() * 0.7);
    rng.shuffle(free);
    for (const seed of free) {
      if (budget <= 0) break;
      if (owner[seed]) continue;
      // revived states come in the sizes the macro target implies
      const mean = Math.max(1, (this.ctl.Sstar * ready.length) / Math.max(1, this.ctl.Nstar));
      const size = Math.min(budget, Math.max(1, Math.round(mean * rng.range(0.3, 1.7))));
      const cluster = [seed], seen = new Set([seed]);
      for (let i = 0; i < cluster.length && cluster.length < size; i++) {
        for (const o of this.R[cluster[i]].adj) {
          if (!seen.has(o) && !owner[o] && culture[o] && tech[o] >= 2.4) { seen.add(o); cluster.push(o); }
        }
      }
      const x = this.createPolity(seed, Yp, null, { type: cluster.length >= 12 ? 'empire' : undefined });
      if (!x) continue;
      for (const r of cluster) owner[r] = x;
      const px = this.pol(x), yy = Y - rng.int(0, 49);
      px.founded = null; px.ended = yy;
      this.makeSched(x, cluster.length, Yp);
      budget -= cluster.length;
      const how = ['collapses', 'falls into civil war and breaks apart', 'is torn apart by rival claimants', 'fragments after its last strong ruler dies', 'is abandoned as its cities empty'];
      this.ev(yy, 'war', `${this.pref(x, Yp, true)} ${rng.pick(how)}.`, x);
    }
  }

  // Forward in time: an empire collapses into successor states at Y.
  unfragment(Y, Yp, maxSize = 5) {
    const { rng } = this;
    const mem = this.members();
    const small = [...mem.keys()].filter((p) => {
      const sc = this.sched.get(p);
      return sc && (sc.drawn || maxSize > 5) && this.isHome(p) && !this.pol(p).earth && !this.pol(p).macro && mem.get(p).length <= maxSize;
    });
    if (small.length < 2) return;
    const a = rng.pick(small);
    const root = this.world.cultureRoot(this.pol(a).culture);
    const group = [a], inGroup = new Set([a]);
    for (let i = 0; i < group.length && group.length < (maxSize > 5 ? 10 : 6); i++) {
      for (const r of mem.get(group[i])) for (const o of this.R[r].adj) {
        const b = this.s.owner[o];
        if (!b || inGroup.has(b) || !small.includes(b)) continue;
        if (maxSize <= 5 && this.world.cultureRoot(this.pol(b).culture) !== root) continue;
        inGroup.add(b); group.push(b);
      }
    }
    if (group.length < 2) return;
    const regs = group.flatMap((g) => mem.get(g));
    const capR = mem.get(a)[0];
    const big = this.createPolity(capR, Yp, null, { type: regs.length >= 10 ? 'empire' : undefined });
    if (!big) return;
    const yy = Y - rng.int(0, 49);
    for (const r of regs) this.s.owner[r] = big;
    const pb = this.pol(big);
    pb.founded = null; pb.ended = yy;
    this.makeSched(big, regs.length, Yp);
    for (const g of group) {
      this.pol(g).founded = yy;
      this.sched.delete(g);
    }
    const how = ['collapses', 'falls into civil war and breaks apart', 'is torn apart by rival claimants', 'fragments after its last strong ruler dies'];
    const names = group.slice(0, 3).map((g) => this.pref(g, Y));
    this.ev(yy, 'war', `${this.pref(big, Yp, true)} ${rng.pick(how)}. Successor states arise: ${names.join(', ')}${group.length > 3 ? ` and ${group.length - 3} more` : ''}.`, regs.length >= 4 ? 0 : big);
  }

  // Forward in time: the largest state conquers a neighbour at Y.
  unmerge(Y, Yp) {
    const { rng } = this;
    const mem = this.members();
    let big = 0, bs = 0;
    for (const [p, l] of mem) if (l.length > bs && !this.pol(p).macro && !this.pol(p).earth) { big = p; bs = l.length; }
    if (!big || bs < 4) return;
    const list = mem.get(big);
    const p = this.pol(big);
    const capR = p.capital && p.capital.x === this.x && p.capital.y === this.y && this.s.owner[p.capital.r] === big ? p.capital.r : list[0];
    const dist = this.distWithin(capR, new Set(list));
    const far = list.filter((r) => r !== capR).sort((a, b) => (dist.get(b) ?? 99) - (dist.get(a) ?? 99));
    const seed = far[0];
    if (seed === undefined) return;
    const want = Math.max(1, Math.round(bs * rng.range(0.2, 0.4)));
    const set = new Set(far), cluster = [seed], seen = new Set([seed]);
    for (let i = 0; i < cluster.length && cluster.length < want; i++) {
      for (const o of this.R[cluster[i]].adj) if (set.has(o) && !seen.has(o)) { seen.add(o); cluster.push(o); }
    }
    for (const r of cluster) this.s.owner[r] = 0;
    this.reassignAsPredecessor(cluster, big, Y, Yp);
    const sc = this.sched.get(big);
    if (sc) { sc.N = Math.max(1, sc.N - cluster.length); }
  }

  reassignAsPredecessor(comp, pid, Y, Yp) {
    const { rng } = this;
    const best = comp.reduce((a, b) => (this.s.tech[b] > this.s.tech[a] ? b : a));
    const x = this.createPolity(best, Yp, null);
    if (!x) return;
    for (const r of comp) this.s.owner[r] = x;
    const px = this.pol(x), yy = Y - rng.int(0, 49);
    px.founded = null; px.ended = yy;
    this.makeSched(x, comp.length, Yp);
    this.ev(yy, 'war', `${this.pref(x, Yp, true)} is conquered by ${this.pref(pid, Y)}.`, comp.length >= 3 ? 0 : x);
  }

  // Forward in time: a people is absorbed by its neighbours.
  unabsorb(Y) {
    const { rng } = this;
    const { culture } = this.s;
    const byC = new Map();
    for (let r = 0; r < this.n; r++) if (culture[r]) { if (!byC.has(culture[r])) byC.set(culture[r], []); byC.get(culture[r]).push(r); }
    const big = [...byC.entries()].filter(([, l]) => l.length >= 8);
    if (!big.length) return;
    const [c, regs] = rng.pick(big);
    const edge = regs.filter((r) => this.R[r].adj.some((o) => culture[o] !== c));
    if (!edge.length) return;
    const seed = rng.pick(edge);
    const set = new Set(regs), cluster = [seed], seen = new Set([seed]);
    const want = rng.int(2, Math.min(6, Math.floor(regs.length / 3)));
    for (let i = 0; i < cluster.length && cluster.length < want; i++) {
      for (const o of this.R[cluster[i]].adj) if (set.has(o) && !seen.has(o)) { seen.add(o); cluster.push(o); }
    }
    const old = newCulture(this.world, rng, { origin: null, home: this.pos });
    for (const r of cluster) culture[r] = old;
    this.ev(Y - rng.int(0, 200), 'culture', `The last ${this.cname(old)}-speaking communities around ${this.rname(seed)} are absorbed by the ${this.cname(c)}.`);
  }
}
