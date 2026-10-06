// The kernel history generation is built on: one run over one sheet's
// backstory millennium (1000-2000 CE), which ends in its present.
//
// A SheetRun holds three kinds of thing, kept apart on purpose:
//
//   environment  fixed for the run: the sheet, its neighbouring sheets, the
//                macro layer's fields there, and graph helpers over the sheet's
//                provinces. Read-only after construction.
//   state        `snap`, the one snapshot being simulated (owner, culture and
//                tech per province); `ctl`, the steering multipliers; `warm`,
//                set while the starting state is being spun up. Systems change
//                `snap` and nothing else on the run.
//   services     `rng(stream)` (a separate random stream per system, so one
//                system's draws never shift another's), `log` (the chronicle,
//                with its own stream: narration can't change history), and the
//                operations on the world's registries (founding, ending states).
//
// The dynamics live outside, as systems (nature.js, politics.js) that
// forward.js runs over a SheetRun.

import { DIR_ORDER, neighbourPos, regionPos, sheetCentre, techCap, tileStart, TILE_YEARS, STEPS_PER_SNAP } from '../core/frame.js';
import { clamp } from '../core/util.js';
import { Rng, hashN } from '../core/random.js';
import { regionCapacity, edgeLinks } from '../geo/index.js';
import { effectiveYear, humanPresence, development, targetStateCount, targetStateShare } from '../macro.js';
import { habitatFactor, lineageAt } from '../species.js';
import { regionPower } from '../world/stats.js';
import { namePolity } from './naming.js';
import { Chronicle } from './chronicle.js';

export class SheetRun {
  /**
   * @param {import('../world/world.js').World} world
   * @param {number} x
   * @param {number} y
   * @param {number} t  the layer of the backstory millennium (PRESENT_LAYER)
   */
  constructor(world, x, y, t) {
    // ---------------------------------------------------------- environment
    this.world = world; this.x = x; this.y = y; this.t = t;
    this.pos = `${x},${y}`;
    this.geo = world.geo(x, y);
    this.R = this.geo.regions;
    this.n = this.R.length;
    this.start = tileStart(t);
    this.end = this.start + TILE_YEARS;
    // each province's persistent institutional quality, and its position in sheet units
    this.inst = Float32Array.from(this.R, (r) => 0.4 + 1.2 * (hashN(world.seed, 'inst', x, y, r.id) / 4294967296));
    this.rpos = this.R.map((reg) => regionPos(x, y, reg));
    // land the local lineage can use, relative to a typical sheet
    let hab = 0;
    for (let r = 0; r < this.n; r++) if (regionCapacity(this.R[r], 2000) * habitatFactor(this.R[r], this.lineage(r)) >= 0.3) hab++;
    this.sizeFactor = Math.max(0.05, hab / 200);

    // neighbouring sheets' tiles, already revealed. ext[r] lists the provinces
    // across the edge that province r touches.
    this.nbs = [];
    this.ext = Array.from({ length: this.n }, () => []);
    for (const dir of DIR_ORDER) {
      const p = neighbourPos(x, y, dir);
      const h = world.tile(p.x, p.y, t);
      if (!h) continue;
      const g = world.geo(p.x, p.y);
      const nb = { dir, x: p.x, y: p.y, hist: h, geo: g, pow: [] };
      for (const [ra, rb] of edgeLinks(this.geo, g, dir)) this.ext[ra].push({ nb, rr: rb });
      this.nbs.push(nb);
    }

    // ---------------------------------------------------------------- state
    this.snap = null;
    this.ctl = { emerge: 1, succ: 0.85, consol: 1, decay: 1, Sstar: 0.6, Nstar: 10 };
    this.warm = false;

    // ------------------------------------------------------------- services
    this.streams = new Map();
    this.log = new Chronicle(this, this.rng('chronicle'));
    this.memo = { E: new Map(), dev: new Map(), regions: new Map(), targets: null };
  }

  // A random stream of its own for each system.
  rng(stream) {
    let r = this.streams.get(stream);
    if (!r) {
      r = new Rng(hashN(this.world.seed, 'hist', this.x, this.y, this.t, stream));
      this.streams.set(stream, r);
    }
    return r;
  }

  // ------------------------------------------------------ environment: time

  // The year whose technology and institutions this sheet is living through
  // (Terra's timeline plus the sheet's drift from it); sea level and ice follow
  // real time.
  E(Y) {
    let e = this.memo.E.get(Y);
    if (e === undefined) { e = effectiveYear(this.world.seed, ...sheetCentre(this.x, this.y), Y); this.memo.E.set(Y, e); }
    return e;
  }

  // Macro fields where each province actually is, so they run smoothly across
  // sheet edges. Cached per year.
  perRegion(Y) {
    let m = this.memo.regions.get(Y);
    if (!m) {
      const seed = this.world.seed;
      m = { E: new Float32Array(this.n), dev: new Float32Array(this.n) };
      for (let r = 0; r < this.n; r++) {
        const [gx, gy] = this.rpos[r];
        m.E[r] = effectiveYear(seed, gx, gy, Y);
        m.dev[r] = development(seed, gx, gy, Y);
      }
      if (this.memo.regions.size > 64) this.memo.regions.clear();
      this.memo.regions.set(Y, m);
    }
    return m;
  }

  Er(r, Y) { return this.perRegion(Y).E[r]; }

  // How many people province r can hold in year Y. The land suits each lineage
  // differently (species.js habitats): the people living there, or the local
  // lineage where no one does yet; and no one lives where it is not yet sapient.
  cap(r, Y) { return regionCapacity(this.R[r], Y) * habitatFactor(this.R[r], this.people(r)) * humanPresence(this.Er(r, Y)); }

  // the people in province r (a culture record), or the local lineage if none
  people(r) {
    const c = this.snap && this.snap.culture[r];
    return c ? this.world.cultures.get(c) : this.lineage(r);
  }

  // the sapient lineage where province r lies, and how far back history parted there
  lineage(r) { return lineageAt(this.world.seed, ...this.rpos[r]); }

  habFactor(r, Y) {
    const reg = this.R[r];
    const m = reg.cellsNow ? this.cap(r, Y) / Math.max(1, reg.cells) : 0;
    const hf = 0.45 + 0.55 * Math.min(1, m / 0.6);
    return hf + (1 - hf) * clamp((this.Er(r, Y) - 1500) / 400, 0, 1);
  }

  // The era's technology ceiling in province r, with its golden or dark age.
  techCeil(r, Y) { const m = this.perRegion(Y); return techCap(m.E[r]) * this.habFactor(r, Y) * m.dev[r]; }

  // After 1550 every province converges on the frontier minus a persistent
  // institutional gap, giving Earth-like inequality; the gap fades over the
  // millennium after 2000.
  modernGoal(r, Y) {
    const E = this.Er(r, Y);
    const gap = (1.6 - this.inst[r]) * 1.6 * (1 - clamp((E - 2000) / 1000, 0, 1));
    return techCap(E) - 0.1 - gap;
  }

  // The macro targets at each province (refreshed every 250 years) and their
  // averages over the sheet: S, the share of state-ready land under states,
  // and N, the effective number of states.
  targets(Y) {
    const key = Math.floor(Y / 250);
    const memo = this.memo.targets;
    if (memo && memo.key === key) return memo;
    const seed = this.world.seed;
    const S = new Float32Array(this.n), N = new Float32Array(this.n);
    let sS = 0, sN = 0, w = 0;
    for (let r = 0; r < this.n; r++) {
      const [gx, gy] = this.rpos[r];
      const Tm = techCap(effectiveYear(seed, gx, gy, Y)) * development(seed, gx, gy, Y);
      S[r] = targetStateShare(seed, gx, gy, Y, Tm);
      N[r] = targetStateCount(seed, gx, gy, Y, Tm, this.sizeFactor);
      const c = this.R[r].cells;
      sS += S[r] * c; sN += Math.log(N[r]) * c; w += c;
    }
    this.memo.targets = { key, S, N, Smean: w ? sS / w : 0.5, Nmean: w ? Math.exp(sN / w) : 10 };
    return this.memo.targets;
  }

  // >1 where province r's surroundings should be more unified than the sheet average.
  unity(r, Y) { const t = this.targets(Y); return clamp((t.Nmean / t.N[r]) ** 0.7, 0.4, 2.5); }

  // ------------------------------------------------ environment: neighbours

  // the neighbour tile's snapshot nearest to step s
  nbSnap(nb, s) { return nb.hist.snaps[clamp(Math.round(s / STEPS_PER_SNAP), 0, 4)]; }

  // A polity's power and province count on the neighbouring sheets near step s.
  extPower(pid, s, Y) {
    let sum = 0, cnt = 0;
    const k = clamp(Math.round(s / STEPS_PER_SNAP), 0, 4);
    for (const nb of this.nbs) {
      if (!nb.pow[k]) {
        const m = new Map(), snap = nb.hist.snaps[k];
        for (const reg of nb.geo.regions) {
          const o = snap.owner[reg.id];
          if (!o) continue;
          const e = m.get(o) || { p: 0, c: 0 };
          e.p += regionPower(reg, snap.tech[reg.id], Y, this.world.cultures.get(snap.culture[reg.id])); e.c++;
          m.set(o, e);
        }
        nb.pow[k] = m;
      }
      const e = nb.pow[k].get(pid);
      if (e) { sum += e.p; cnt += e.c; }
    }
    return { p: sum, c: cnt };
  }

  // ------------------------------------------- environment: province graph

  // Land neighbours, plus sea crossings short enough for this technology.
  neighbours(r, techMin = 0) {
    const out = this.R[r].adj.slice();
    for (const [o, d] of this.R[r].sea) if (d <= 2 + Math.max(0, techMin - 3) * 1.5) out.push(o);
    return out;
  }

  // provinces within `radius` land steps of r0
  ball(r0, radius) {
    const out = new Set([r0]);
    let frontier = [r0];
    for (let d = 0; d < radius; d++) {
      const next = [];
      for (const r of frontier) for (const o of this.R[r].adj) if (!out.has(o)) { out.add(o); next.push(o); }
      frontier = next;
    }
    return out;
  }

  // steps from `start` to each province of `set`, moving within it
  distWithin(start, set) {
    const dist = new Map([[start, 0]]);
    const q = [start];
    for (let i = 0; i < q.length; i++) {
      for (const o of this.neighbours(q[i], 4)) {
        if (set.has(o) && !dist.has(o)) { dist.set(o, dist.get(q[i]) + 1); q.push(o); }
      }
    }
    return dist;
  }

  // connected components of a list of provinces
  components(list) {
    const set = new Set(list), seen = new Set(), out = [];
    for (const r0 of list) {
      if (seen.has(r0)) continue;
      const comp = [r0];
      seen.add(r0);
      for (let i = 0; i < comp.length; i++) {
        for (const o of this.R[comp[i]].adj) if (set.has(o) && !seen.has(o)) { seen.add(o); comp.push(o); }
      }
      out.push(comp);
    }
    return out;
  }

  // a connected cluster of up to `want` provinces from `pool` (a Set), grown from seed
  cluster(seed, pool, want, ok = () => true) {
    const out = [seed], seen = new Set([seed]);
    for (let i = 0; i < out.length && out.length < want; i++) {
      for (const o of this.R[out[i]].adj) if (pool.has(o) && !seen.has(o) && ok(o)) { seen.add(o); out.push(o); }
    }
    return out;
  }

  // spread values outwards from seeds into provinces where ok(r) holds
  floodFill(arr, seeds, ok, rng) {
    let frontier = seeds.slice();
    while (frontier.length) {
      rng.shuffle(frontier);
      const next = [];
      for (const r of frontier) {
        for (const o of this.neighbours(r, 3)) {
          if (arr[o] || !ok(o)) continue;
          arr[o] = arr[r];
          next.push(o);
        }
      }
      frontier = next;
    }
  }

  // ---------------------------------------------------- state: measurements

  // provinces of each polity on this sheet
  members() {
    const m = new Map();
    const { owner } = this.snap;
    for (let r = 0; r < this.n; r++) {
      const o = owner[r];
      if (!o) continue;
      let a = m.get(o);
      if (!a) m.set(o, (a = []));
      a.push(r);
    }
    return m;
  }

  // province count of each polity on this sheet
  sizes(snap = this.snap) {
    const m = new Map();
    for (const o of snap.owner) if (o) m.set(o, (m.get(o) || 0) + 1);
    return m;
  }

  // provinces of each people on this sheet
  peoples() {
    const by = new Map();
    const { culture } = this.snap;
    for (let r = 0; r < this.n; r++) if (culture[r]) { if (!by.has(culture[r])) by.set(culture[r], []); by.get(culture[r]).push(r); }
    return by;
  }

  // split a connected set of provinces by people
  byCulture(comp) {
    const by = new Map();
    for (const r of comp) { const c = this.snap.culture[r]; if (!by.has(c)) by.set(c, []); by.get(c).push(r); }
    return [...by.values()].flatMap((l) => this.components(l));
  }

  meanTech(list) {
    let s = 0;
    for (const r of list) s += this.snap.tech[r];
    return list.length ? s / list.length : 0;
  }

  // capacity-weighted mean technology of the sheet
  sheetTech() {
    let s = 0, w = 0;
    for (let r = 0; r < this.n; r++) {
      const c = this.cap(r, this.start + 500);
      s += this.snap.tech[r] * c; w += c;
    }
    return w ? s / w : 0;
  }

  power(r, Y) { return regionPower(this.R[r], this.snap.tech[r], Y, this.people(r)); }

  // Share of state-ready land under states, and the effective number of states.
  measure(Y) {
    const { owner, culture, tech } = this.snap;
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

  // Refresh the steering multipliers that nudge the dynamics towards the macro
  // targets: emerge (new states), succ (successor states after a
  // collapse), decay (collapse), consol (conquest and unions against splits).
  steer(Y) {
    const m = this.measure(Y);
    const lt = this.targets(Y);
    const gS = m.ready ? lt.Smean - m.S : 0;
    const gN = m.effN > 0 && m.ready >= 3 ? Math.log(m.effN / lt.Nmean) : 0;
    this.ctl = {
      Sstar: lt.Smean, Nstar: lt.Nmean,
      emerge: clamp(Math.exp(6 * gS), 0.1, this.warm ? 2 : 4),
      succ: clamp(0.85 + 2 * gS, 0.15, 0.97),
      decay: clamp(Math.exp(-9 * gS), 0.3, 10),
      consol: clamp(Math.exp(2.5 * gN), 0.15, 6),
    };
    return this.ctl;
  }

  // -------------------------------------------------------- registry services

  pol(id) { return this.world.polities.get(id); }

  // whether a polity's capital is on this sheet
  isHome(pid) { const p = this.pol(pid); return p && p.capital && p.capital.x === this.x && p.capital.y === this.y; }

  // its capital province here, if it has one
  homeCapital(pid) {
    const p = this.pol(pid);
    return p && p.capital && p.capital.x === this.x && p.capital.y === this.y ? p.capital.r : -1;
  }

  // Found a state in province r (it takes r). Returns its id, or 0 when
  // nobody lives there.
  createPolity(r, Y, rng, { type, culture, parent } = {}) {
    const c = culture || this.snap.culture[r];
    if (!c) return 0;
    if (!type) type = this.typeFor(r, this.snap.tech[r], Y, rng);
    const nm = namePolity(this.world, rng, c, type);
    const par = parent && this.pol(parent);
    const hue = par ? (par.color[0] + rng.range(-35, 35) + 360) % 360 : rng.int(0, 359);
    const pid = this.world.addPolity({
      name: nm.name, adj: nm.adj, base: nm.base, culture: c, type, parent: parent || 0, founded: Y, ended: null,
      capital: { x: this.x, y: this.y, r }, home: this.pos, agg: Math.round(rng.range(0.6, 1.4) * 100) / 100,
      color: [Math.round(hue), rng.int(40, 70), rng.int(40, 60)],
    });
    this.snap.owner[r] = pid;
    return pid;
  }

  // What kind of state arises in province r.
  typeFor(r, tech, Y, rng) {
    const reg = this.R[r];
    if (this.E(Y) >= 1800 && tech >= 7) return rng.pick(['republic', 'republic', 'kingdom', 'federation', 'union']);
    if (reg.steppe > 0.4 && tech < 6.5 && rng.chance(0.7)) return 'horde';
    if (tech < 3.2) return rng.chance(0.5) ? 'chiefdom' : 'city-states';
    const r0 = rng.next();
    if (r0 < 0.62) return 'kingdom';
    if (r0 < 0.76 && tech < 5.5) return 'city-states';
    if (r0 < 0.84) return 'republic';
    if (r0 < 0.92) return 'theocracy';
    return 'league';
  }

  // How many provinces a state of this kind and technology can hold together.
  // Nation-state era: many mid-sized states. Past the information age the reach
  // of one government grows steeply: a whole world near tech 9.5, many beyond 10.
  limit(pid, tech, Y) {
    const p = this.pol(pid);
    const tf = { horde: 1.4, 'city-states': 0.35, chiefdom: 0.3, league: 0.6, empire: 1.2 }[p.type] ?? 1;
    const modern = this.E(Y) >= 1850 && tech < 9 ? 0.6 : 1;
    return (3 + 5 * tech) * tf * modern * Math.exp(Math.max(0, tech - 7) * 1.1);
  }

  // Rename a state from year Y.
  rename(pid, Y, name) {
    const p = this.pol(pid);
    p.names = p.names || [[p.founded ?? this.start, p.name]];
    p.names.push([Y, name]);
  }

  // The finished tile.
  result(snaps, events) { return { x: this.x, y: this.y, t: this.t, snaps, events }; }
}
