// Peoples and languages going forwards: settlement, migration, assimilation, and languages splitting.
//
// Methods of TileSim (see tile-sim.js), installed with mixin().

import { DIR_NAME } from '../core/coords.js';
import { newCulture } from './naming.js';

export class Peoples {
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
}
