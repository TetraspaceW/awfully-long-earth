// Filling a gap in time between a known past and a known future.
//
// Methods of TileSim (see tile-sim.js), installed with mixin().

import { clamp } from '../core/math.js';
import { cloneSnap } from '../world/snapshot.js';

export class Bridge {
  // With both a past and a future face, run the full millennium twice: forwards
  // from the past and in reverse from the future, each steered by the same macro
  // layer. Then hand each province over from the forward history to the reverse
  // one at its own moment. Moments are spatially smooth and cluster by the state
  // that will eventually hold the province, so rising states take over their
  // lands together; the disagreement between the two histories is spread over
  // the millennium instead of landing in its last years.

  runBridge() {
    const { world, rng, n, R } = this;
    const opts = { commit: false };
    const F = new this.constructor(world, this.x, this.y, this.t, { ...opts, ignoreFuture: true, tag: 'F' }).run();
    const B = new this.constructor(world, this.x, this.y, this.t, { ...opts, ignorePast: true, tag: 'B' }).run();
    const end = B.snaps[4];

    // handover times in (start, end): smooth noise over the province graph,
    // pulled together for provinces that end up in the same state or people
    let u = Float32Array.from({ length: n }, () => rng.next());
    for (let it = 0; it < 3; it++) {
      const nu = u.slice();
      for (let r = 0; r < n; r++) {
        let s = u[r], c = 1;
        for (const o of R[r].adj) { s += u[o]; c++; }
        nu[r] = s / c;
      }
      u = nu;
    }
    const groupRand = new Map();
    const gr = (key) => { if (!groupRand.has(key)) groupRand.set(key, rng.next()); return groupRand.get(key); };
    const rankNorm = (vals) => {
      const order = [...vals.keys()].sort((a, b) => vals[a] - vals[b]);
      const out = new Float32Array(vals.length);
      order.forEach((r, i) => { out[r] = (i + 0.5) / vals.length; });
      return out;
    };
    const ownTau = rankNorm(Array.from(u, (v, r) => 0.4 * v + 0.6 * gr(`o${end.owner[r]}`)));
    const culTau = rankNorm(Array.from(u, (v, r) => 0.4 * v + 0.6 * gr(`c${end.culture[r]}`)));
    // Each province switches from the forward history to the reverse one at a
    // snapshot interval. Prefer an interval in which one of the two histories
    // changes that province anyway (the handover then costs no extra change),
    // nearest to the province's smooth handover time.
    const pickInterval = (r, tau, field) => {
      const want = clamp(Math.ceil(tau * 4), 1, 4);
      let best = want, bd = Infinity;
      for (let k = 1; k <= 4; k++) {
        const fch = F.snaps[k - 1][field][r] !== F.snaps[k][field][r];
        const bch = B.snaps[k - 1][field][r] !== B.snaps[k][field][r];
        if (!fch && !bch) continue;
        const d = Math.abs(k - want) + rng.next() * 0.1;
        if (d < bd) { bd = d; best = k; }
      }
      return best;
    };
    const ownK = Int8Array.from({ length: n }, (_, r) => pickInterval(r, ownTau[r], 'owner'));
    const culK = Int8Array.from({ length: n }, (_, r) => pickInterval(r, culTau[r], 'culture'));

    const snaps = [cloneSnap(F.snaps[0])];
    for (let k = 1; k <= 3; k++) {
      const f = F.snaps[k], b = B.snaps[k];
      const s = { owner: new Int32Array(n), culture: new Int32Array(n), tech: new Float32Array(n) };
      for (let r = 0; r < n; r++) {
        s.owner[r] = k < ownK[r] ? f.owner[r] : b.owner[r];
        // peoples hand over straight to whoever holds the land at the end
        s.culture[r] = k < culK[r] ? f.culture[r] : end.culture[r];
        s.tech[r] = f.tech[r] + (b.tech[r] - f.tech[r]) * (k / 4);
        if (!s.culture[r]) s.owner[r] = 0;
      }
      snaps.push(s);
    }
    snaps.push(cloneSnap(end));

    // events: the forward history early on, the reverse history later, and the
    // handover between them
    const mid = this.start + 500;
    const events = [...F.events.filter((e) => e.y < mid), ...B.events.filter((e) => e.y >= mid)];
    for (let k = 1; k <= 4; k++) {
      const before = new Map(), gained = new Map();
      for (let r = 0; r < n; r++) {
        const o = snaps[k].owner[r], p = snaps[k - 1].owner[r];
        if (p) before.set(p, (before.get(p) || 0) + 1);
        if (o && o !== p && p) {
          const g = gained.get(o) || new Map();
          g.set(p, (g.get(p) || 0) + 1);
          gained.set(o, g);
        }
      }
      for (const [o, from] of gained) {
        const total = [...from.values()].reduce((a, b) => a + b, 0);
        if (total < 3 || this.pol(o)?.macro) continue;
        const [loser] = [...from.entries()].sort((a, b) => b[1] - a[1])[0];
        const lost = before.get(loser) || 0;
        const Y = this.start + 250 * k - rng.int(20, 220);
        const verb = from.get(loser) >= lost * 0.7 ? rng.pick(['overthrows', 'supplants', 'absorbs']) : rng.pick(['rises at the expense of', 'takes provinces from', 'expands into the lands of']);
        events.push({ y: Y, kind: 'war', text: `${this.pref(o, Y, true)} ${verb} ${this.pref(loser, Y)}.`, pid: 0 });
      }
    }
    events.sort((a, b) => a.y - b.y);
    const hist = { x: this.x, y: this.y, t: this.t, snaps, events };
    if (this.commit) world.setTile(hist);
    return hist;
  }
}
