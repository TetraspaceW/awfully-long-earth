// Starting states for tiles with no past: drawn from the era's distribution, shaped by the known
// faces, then spun up silently so they look like the result of simulating forwards.
//
// Methods of TileSim (see tile-sim.js), installed with mixin().

import { newCulture } from './naming.js';

export class Prior {
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
      culture[r] = newCulture(this.world, rng, { origin: null, home: this.pos });
      order.push(r);
    }
    this.floodFill(culture, order, (r) => this.cap(r, Y) >= 0.03);
    // stragglers on unreachable islands get their own peoples
    for (const r of habitable) {
      if (culture[r]) continue;
      culture[r] = newCulture(this.world, rng, { origin: null, home: this.pos });
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
          : newCulture(this.world, rng, { origin: null, home: this.pos });
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
      if (!sub || rng.chance(0.55)) sub = newCulture(this.world, rng, { origin: null, home: this.pos });
      for (const r of cluster) culture[r] = sub;
    }
    for (let r = 0; r < n; r++) if (!culture[r]) tech[r] = 0;
  }
}
