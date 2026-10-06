// Forward time: one 50-year step of history, and the technology and disaster dynamics.
//
// Methods of TileSim (see tile-sim.js), installed with mixin().

import { techCap } from '../core/eras.js';
import { clamp } from '../core/math.js';

export class Forward {
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
}
