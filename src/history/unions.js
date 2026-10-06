// The speculative future: unions, federations and blocs formed by treaty.
//
// Methods of TileSim (see tile-sim.js), installed with mixin().

import { clamp } from '../core/math.js';
import { randomPhon, placeName, adjective } from '../lang/names.js';
import { ofName, familyName } from './naming.js';

export class Unions {
  // The speculative future: as technology rises, states unite (by treaty far more
  // than by conquest), first into continental federations, then whole worlds,
  // then federations spanning several worlds across the sheet edges.
  futureUnions(s, Y, mem) {
    if (this.E(Y) < 2000) return;
    const { rng, world } = this;
    const info = new Map();
    let tsum = 0, tn = 0;
    for (const [pid, list] of mem) {
      const t = this.meanTech(list);
      info.set(pid, { t, size: list.length + this.extPower(pid, s, Y).c });
      tsum += t * list.length; tn += list.length;
    }
    const tAvg = tn ? tsum / tn : 0;
    const rate = clamp((tAvg - 8.6) * 0.1 * this.ctl.consol, 0.005, 0.8);
    const attempts = Math.ceil(mem.size * rate);
    for (let k = 0; k < attempts; k++) {
      const pids = [...mem.keys()].filter((p) => mem.get(p).length && !this.isDestined(p) && !this.pol(p).macro);
      if (pids.length < 2) break;
      const a = rng.weighted(pids, (p) => Math.sqrt(info.get(p)?.size || 1));
      const ia = info.get(a);
      const cand = new Map();
      for (const r of mem.get(a)) {
        for (const o of this.neighbours(r, ia.t + 2)) {
          const b = this.s.owner[o];
          if (b && b !== a && mem.has(b) && mem.get(b).length && !this.isDestined(b) && !this.pol(b).macro) cand.set(b, true);
        }
      }
      if (!cand.size) continue;
      const rootA = world.cultureRoot(this.pol(a).culture);
      const b = rng.weighted([...cand.keys()], (q) => (world.cultureRoot(this.pol(q).culture) === rootA ? 3 : 1));
      const ib = info.get(b);
      const t = Math.min(ia.t, ib.t);
      if (t < 8.8 || ia.size + ib.size > 0.8 * this.limit(a, t, Y)) continue;
      this.unite(a, b, mem, info, Y);
    }
    for (const bloc of world.blocs) {
      if (bloc.to || Y < Math.max(2050, bloc.from + 60)) continue;
      const here = bloc.members.filter((m) => mem.has(m) && mem.get(m).length);
      if (here.length < 3 || !rng.chance(0.04)) continue;
      const name = bloc.name.replace(/ (Union|Community|Compact)$/, '').replace(/^Council of (.*) States$/, '$1') + ' Federation';
      this.merge(here, here.flatMap((m) => mem.get(m)), name, 'federation', Y,
        `The ${here.length} members of the ${bloc.name} merge into a single state, the ${name}.`);
      bloc.to = Y;
      return;
    }
  }

  // Two states become one: the much larger absorbs the smaller, equals federate.
  unite(a, b, mem, info, Y) {
    const { rng, world } = this;
    const [big, small] = info.get(a).size >= info.get(b).size ? [a, b] : [b, a];
    const homeSmall = this.isHome(small) && !this.extPower(small, 0, Y).c;
    if (info.get(big).size >= 2 * info.get(small).size && homeSmall) {
      for (const r of mem.get(small)) this.s.owner[r] = big;
      this.pol(small).ended = Y;
      this.ev(Y - rng.int(0, 49), 'polity', `${this.pref(small, Y, true)} ${rng.pick(['accedes to', 'votes to join', 'is admitted to'])} ${this.pref(big, Y)}.`, big);
      info.get(big).size += info.get(small).size;
      mem.set(big, [...mem.get(big), ...mem.get(small)]);
      mem.set(small, []);
      return;
    }
    if (!this.isHome(a) || !this.isHome(b) || this.extPower(a, 0, Y).c || this.extPower(b, 0, Y).c) return;
    const root = world.cultureRoot(this.pol(a).culture);
    const fam = root === world.cultureRoot(this.pol(b).culture) ? world.cultures.get(root) : null;
    const size = info.get(a).size + info.get(b).size;
    const name = this.unionName(a, b, fam, size, Y);
    const regs = [...mem.get(a), ...mem.get(b)];
    const np = this.merge([a, b], regs, name, 'federation', Y, `${this.pref(a, Y, true)} and ${this.pref(b, Y)} unite as the ${name}.`);
    if (!np) return;
    info.set(np, { t: Math.min(info.get(a).t, info.get(b).t), size });
    mem.set(np, regs); mem.set(a, []); mem.set(b, []);
  }

  unionName(a, b, fam, size, Y) {
    const { rng, world } = this;
    let habitable = 0;
    for (let r = 0; r < this.n; r++) if (this.cap(r, Y) >= 0.3) habitable++;
    if (size >= 0.4 * habitable) {
      const t = world.tileName(this.x, this.y).replace(/^the /, '');
      return rng.pick([`World State of ${t}`, `${t} Planetary Union`, `Federated ${t}`, `Commonwealth of ${t}`]);
    }
    const na = world.polityName(a, Y), nb = world.polityName(b, Y);
    const short = (n) => n.length <= 14 && !/Union|Federation|States|Commonwealth|Republic|Kingdom/.test(n);
    if (short(na) && short(nb) && rng.chance(0.5)) return `Union of ${ofName(na)} and ${ofName(nb)}`;
    if (fam && rng.chance(0.5)) {
      const w = rng.pick(size >= 60 ? ['Continental Federation', 'Union', 'Commonwealth'] : ['Federation', 'Union', 'United States']);
      return w === 'United States' ? `United ${familyName(fam)} States` : `${familyName(fam)} ${w}`;
    }
    const c = world.cultures.get(this.pol(a).culture);
    const base = placeName(c && c.phon ? c.phon : randomPhon(rng), rng);
    return rng.pick([`${adjective(base, c && c.phon, rng)} Federation`, `Federation of ${base}`, `${base} Concord`, `United ${base}`]);
  }

  merge(pids, regs, name, type, Y, text) {
    const first = this.pol(pids[0]);
    const capR = first.capital && first.capital.x === this.x && first.capital.y === this.y ? first.capital.r : regs[0];
    const np = this.createPolity(capR, Y, null, { type, culture: first.culture, parent: pids[0] });
    if (!np) return;
    const p = this.pol(np);
    p.name = name;
    p.base = name;
    p.adj = name.replace(/^(Union of|United) /, '').replace(/ (Federation|Union|Commonwealth|Continental Federation|States|Compact|Community)$/, '');
    p.core = name.replace(/^(World State of|Federated|Commonwealth of|Federation of|United|Union of) /, '')
      .replace(/ (Planetary Union|Continental Federation|Federation|Union|Commonwealth|Concord|States)$/, '');
    for (const r of regs) this.s.owner[r] = np;
    for (const q of pids) this.pol(q).ended = Y;
    this.ev(Y - this.rng.int(0, 49), 'polity', text, np);
    return np;
  }

  formBlocs() {
    if (this.E(this.end) <= 1950 || this.E(this.start) >= 3000) return;
    const { rng } = this;
    const mem = this.members();
    const cands = [...mem.keys()].filter((p) => this.isHome(p) && !this.pol(p).earth && this.meanTech(mem.get(p)) >= 8.3);
    const byRoot = new Map();
    for (const p of cands) {
      const root = this.world.cultureRoot(this.pol(p).culture);
      if (!byRoot.has(root)) byRoot.set(root, []);
      byRoot.get(root).push(p);
    }
    for (const [root, list] of byRoot) {
      if (list.length < 3 || !rng.chance(0.6)) continue;
      const c = this.world.cultures.get(root);
      const base = familyName(c);
      const from = Math.min(this.end, Math.max(this.start, 1950 - (this.E(this.start) - this.start)) + rng.int(0, 50));
      const name = rng.pick([`${base} Union`, `${base} Community`, `Council of ${base} States`, `${base} Compact`]);
      this.world.blocs.push({ id: this.world.id(), name, from, to: null, home: this.pos, members: list });
      this.ev(from, 'polity', `${list.length} states found the ${name}.`);
    }
  }
}
