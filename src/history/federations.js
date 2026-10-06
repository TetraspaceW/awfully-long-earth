// Multi-world federations: keeping a sheet in line with the macro layer's federation domains.
//
// Methods of TileSim (see tile-sim.js), installed with mixin().

import { federationAt, federationWorlds } from '../macro/federations.js';
import { federationPolity } from './federation-polity.js';

export class Federations {
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
          if (this.sched) this.makeSched(np, comp.length, Yp);
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
        if (whole && this.sched) this.sched.delete(pid);
        if (whole || inside >= 3) this.ev(yy, 'polity', whole
          ? `${this.pref(pid, Y, true)} secedes from ${this.pref(F, Yp)}.`
          : `${inside} provinces break away from ${this.pref(F, Yp)} and rejoin ${this.pref(pid, Y)}.`, F);
      }
    }
  }
}
