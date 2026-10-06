// States going forwards: emergence, conquest, incursions from neighbouring sheets, secession,
// collapse, decline and constitutional reform.
//
// Methods of TileSim (see tile-sim.js), installed with mixin().

import { DIR_NAME } from '../core/coords.js';
import { clamp } from '../core/math.js';
import { STEPS } from '../core/timeline.js';
import { namePolity, ofName, coreName } from './naming.js';

export class Polities {
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
}
