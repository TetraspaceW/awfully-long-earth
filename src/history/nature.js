// Systems for technology, disasters and peoples: how knowledge climbs and
// spreads, what knocks it back, and how languages spread, assimilate and split.
//
// A system is { name, step(run, tick, rng) }: run is the SheetRun (kernel.js),
// tick is { s, Y, shocked } for the current 50-year step (s = 0 while warming
// up), and rng is the system's own random stream. Systems change run.snap.

import { techCap } from '../core/frame.js';
import { clamp } from '../core/util.js';
import { newCulture } from './naming.js';

// Technology climbs towards the era's ceiling, diffuses from neighbours (over
// land, sea and sheet edges), and after 1550 converges on the modern frontier.
export const technology = {
  name: 'technology',
  step(run, { s, Y }, rng) {
    const { n, R } = run;
    const { tech, owner, culture } = run.snap;
    const nt = tech.slice();
    const pr = run.perRegion(Y);
    for (let r = 0; r < n; r++) {
      const Ereg = pr.E[r];
      if (!culture[r]) { nt[r] = 0; continue; }
      const c = run.techCeil(r, Y);
      let t = tech[r];
      const m = R[r].cellsNow ? run.cap(r, Y) / R[r].cells : 0;
      const rate = (0.02 + 0.05 * Math.min(1, m / 0.6)) * (owner[r] ? 1.4 : 1) * rng.range(0.5, 1.5);
      if (t < c) t += (c - t) * rate;
      else t -= (t - c) * 0.15;
      let best = 0;
      for (const o of R[r].adj) if (tech[o] > best) best = tech[o];
      for (const [o, d] of R[r].sea) if (tech[o] >= 3 && t >= 2) best = Math.max(best, tech[o] - 0.25 * d);
      for (const e of run.ext[r]) best = Math.max(best, run.nbSnap(e.nb, s).tech[e.rr]);
      if (best > t + 0.3) t += (best - t - 0.3) * 0.15;
      // the modern breakthrough spreads everywhere, unevenly
      if (Ereg >= 1550) t += (run.modernGoal(r, Y) - t) * 0.5 * clamp((Ereg - 1550) / 300, 0, 1);
      nt[r] = Math.min(t, techCap(Ereg) + 0.2);
    }
    tech.set(nt);
  },
};

// Plagues, droughts and the like: a ball of provinces loses technology.
// Leaves the struck provinces in tick.shocked, where collapses look for them.
export const shocks = {
  name: 'shocks',
  step(run, tick, rng) {
    const { Y } = tick;
    const { tech, culture } = run.snap;
    tick.shocked = new Set();
    const p = run.E(Y) >= 2000 ? 0.02 : run.E(Y) >= 1900 ? 0.004 : 0.02;
    if (!rng.chance(p)) return;
    const live = [];
    for (let r = 0; r < run.n; r++) if (culture[r] && tech[r] >= 1) live.push(r);
    if (!live.length) return;
    const r0 = rng.weighted(live, (r) => run.cap(r, Y) * tech[r]);
    const struck = run.ball(r0, rng.int(2, 6));
    tick.shocked = struck;
    if (run.E(Y) < 1900) for (const r of struck) if (tech[r] >= 2) tech[r] = Math.max(0.5, tech[r] - rng.range(0.1, 0.45));
    if (struck.size >= 4) run.log.disaster(Y, r0);
  },
};

// Settlers colonise empty land and migrate into less developed land, rulers
// assimilate their subjects, and land lost to ice or sea empties.
export const peoples = {
  name: 'peoples',
  step(run, { s, Y }, rng) {
    const { n, R, log } = run;
    const { culture, tech, owner } = run.snap;
    const spread = new Map();
    for (let r = 0; r < n; r++) {
      if (run.cap(r, Y) < 0.03) {
        culture[r] = 0; tech[r] = 0; owner[r] = 0;
        continue;
      }
      const cands = [];
      for (const o of R[r].adj) if (culture[o]) cands.push([culture[o], tech[o], null]);
      for (const [o, d] of R[r].sea) if (culture[o] && tech[o] >= 1.5 + d * 0.3) cands.push([culture[o], tech[o] - 0.2 * d, null]);
      for (const e of run.ext[r]) {
        const sn = run.nbSnap(e.nb, s);
        if (sn.culture[e.rr]) cands.push([sn.culture[e.rr], sn.tech[e.rr], e.nb.dir]);
      }
      if (!culture[r]) {
        if (cands.length && rng.chance(0.35)) {
          const [c, t, dir] = cands.reduce((a, b) => (b[1] > a[1] ? b : a));
          culture[r] = c; tech[r] = Math.max(0.5, t - 0.5);
          log.arrival(c, dir, Y, r);
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
            log.arrival(c, dir, Y, r);
            break;
          }
        }
      }
      // assimilation by rulers
      const o = owner[r];
      if (o) {
        const p = run.pol(o);
        if (p.culture && p.culture !== culture[r] && run.world.cultures.has(p.culture)) {
          const pr = run.E(Y) > 1900 ? 0.003 : 0.008 + (p.type === 'horde' ? 0.02 : 0);
          if (rng.chance(pr)) { culture[r] = p.culture; log.arrival(p.culture, null, Y, r); }
        }
      }
    }
    for (const [c, k] of spread) {
      if (k >= 3) log.ev(Y, 'culture', `${log.cname(c)}-speaking settlers spread into ${k} new lands, bringing their crops and herds.`);
    }
  },
};

// Large peoples cut off from their kin drift apart into daughter languages.
export const languages = {
  name: 'languages',
  step(run, { Y }, rng) {
    const { culture } = run.snap;
    const { log } = run;
    for (const [c, regs] of run.peoples()) {
      if (regs.length < 6) continue;
      const rec = run.world.cultures.get(c);
      const age = rec.origin == null ? 2000 : Y - rec.origin;
      if (age < 1000) continue;
      if (!rng.chance(0.004 * (regs.length / 6) * Math.min(2, age / 1500))) continue;
      const seed = rng.pick(regs);
      const cluster = run.cluster(seed, new Set(regs), Math.max(2, Math.round(regs.length * rng.range(0.25, 0.45))));
      if (cluster.length < 2) continue;
      const d = newCulture(run.world, rng, { parent: c, origin: Y, home: run.pos });
      for (const r of cluster) culture[r] = d;
      log.seenCultures.add(d);
      log.ev(Y, 'culture', `Cut off from their kin, the ${log.cname(c)} speakers around ${log.rname(seed)} drift apart: the ${log.cname(d)} language emerges.`);
    }
  },
};
