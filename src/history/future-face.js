// The future face: when the next millennium is known, states that must exist are founded on the
// way, and everything converges on its start state.
//
// Methods of TileSim (see tile-sim.js), installed with mixin().

import { STEPS, STEP_YEARS } from '../core/timeline.js';
import { cloneSnap } from '../world/snapshot.js';

export class FutureFace {
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
}
