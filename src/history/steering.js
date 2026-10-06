// Steering towards the macro layer: every generation mode measures how the sheet is doing against the
// macro targets (state share, effective number of states) and scales its rates to close the gap.
//
// Methods of TileSim (see tile-sim.js), installed with mixin().

import { techCap } from '../core/eras.js';
import { clamp } from '../core/math.js';
import { effectiveYear } from '../macro/drift.js';
import { development, targetStateShare, targetStateCount } from '../macro/targets.js';

export class Steering {
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
      const [gx, gy] = this.pos[r];
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
}
