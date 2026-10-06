// The chronicle of one run: the events a tile records, and everything that is
// only there to tell its story.
//
// It has its own random stream, for event dates within a step and for the
// choice of words, so narration can never change what happens. While the run
// is warming up (spinning up a starting state) nothing is recorded.

import { DIR_NAME } from '../core/frame.js';
import { rulerName } from '../names.js';
import { regionName } from './naming.js';

// beyond Terra's present the future is speculation; far from Terra, a sheet can
// reach those levels in what is Terra's distant past
const milestoneText = (t, r, Y) => (Y > 2000 && /post-industrial|Spaceports/.test(t) ? '(Speculative) ' : '') + t.replace('{r}', r);
const MILESTONES = {
  1: 'Farming villages appear around {r}.',
  2: 'Copper-working chiefdoms arise in {r}.',
  3: 'Bronze, writing and the first cities appear in {r}.',
  4: 'Iron-working spreads out from {r}.',
  5: 'A classical age of coinage, philosophy and great roads dawns in {r}.',
  6: 'Agrarian states mature; {r} becomes a centre of learning and long-distance trade.',
  7: 'Printing, gunpowder and ocean-going ships transform {r}.',
  8: 'Industrialisation begins in {r}.',
  9: '{r} enters the information age.',
  10: '{r} becomes post-industrial: automated, long-lived and post-scarcity.',
  11: 'Spaceports and orbital industry rise in {r}.',
};

export class Chronicle {
  /** @param {import('./kernel.js').SheetRun} run */
  constructor(run, rng) {
    this.run = run;
    this.rng = rng;
    this.events = [];
    this.seenCultures = new Set();  // peoples already present or announced
    this.seenForeign = new Set();   // foreign states already announced
    this.peak = new Map();          // largest size each state reached here
    this.techMax = 0;               // highest technology reached so far
    this.startMax = 0;              // highest technology at the start of the run
    this.milestone = 0;             // highest milestone announced
  }

  get quiet() { return this.run.warm; }

  // Record an event in year Y, dated up to `jitter` years earlier (or within
  // [lo, hi] years earlier). pid: the state it is about, used when pruning.
  ev(Y, kind, text, pid = 0, jitter = 49) {
    if (this.quiet) return;
    const [lo, hi] = Array.isArray(jitter) ? jitter : [0, jitter];
    const y = hi > 0 ? Y - this.rng.int(lo, hi) : Y;
    this.events.push({ y: Math.round(y), kind, text, pid });
  }

  pick(list) { return this.rng.pick(list); }
  chance(p) { return this.rng.chance(p); }

  // ------------------------------------------------------------ names

  rname(r) { return regionName(this.run.world, this.run.geo, r); }
  pname(id, Y) { return this.run.world.polityName(id, Y); }
  pref(id, Y, cap = false) { return this.run.world.polityRef(id, Y, cap); }
  cname(id) { return this.run.world.cultureName(id); }
  sheetName() { return this.run.world.tileName(this.run.x, this.run.y); }

  // -------------------------------------------------------- bookkeeping

  // What the tile starts with is not news.
  begin(snap, startMax) {
    const { run } = this;
    this.startMax = startMax;
    this.techMax = Math.max(startMax, ...snap.tech);
    this.milestone = Math.floor(this.techMax);
    for (const nb of run.nbs) for (const c of nb.hist.snaps[0].culture) this.seenCultures.add(c);
    for (const c of snap.culture) this.seenCultures.add(c);
    for (const o of snap.owner) if (o && !run.isHome(o)) this.seenForeign.add(o);
  }

  // A people turns up somewhere on this sheet (from across edge `dir`, or not).
  arrival(c, dir, Y, r) {
    if (this.seenCultures.has(c)) return;
    this.seenCultures.add(c);
    this.ev(Y, 'contact', dir
      ? `${this.cname(c)} migrants arrive from the ${DIR_NAME[dir]} and settle ${this.rname(r)}.`
      : `The ${this.cname(c)} language takes hold in ${this.rname(r)}.`);
  }

  // A foreign state takes a province from across edge `dir`.
  incursion(q, dir, Y, r) {
    if (this.seenForeign.has(q)) return;
    this.seenForeign.add(q);
    this.ev(Y, 'contact', `${this.pref(q, Y, true)} pushes in from the ${DIR_NAME[dir]} and takes ${this.rname(r)}.`, q);
  }

  noteSizes(sizes) { for (const [o, c] of sizes) this.peak.set(o, Math.max(this.peak.get(o) || 0, c)); }

  // ------------------------------------------------------- narration

  shockKinds(Y) {
    const E = this.run.E(Y);
    if (E >= 2000) return ['A pandemic', 'Sea-level rise and great storms', 'A grid collapse and civil strife', 'Crop blight from a shifting climate', 'An automation crash and mass unrest'];
    if (E >= 1800) return ['A pandemic', 'A great famine', 'A financial crash and civil strife'];
    return ['A plague', 'A great drought', 'A volcanic winter', 'A cattle plague and famine', 'A succession of failed harvests', 'Earthquakes and floods'];
  }

  disaster(Y, r0) { this.ev(Y, 'disaster', `${this.pick(this.shockKinds(Y))} strikes ${this.rname(r0)} and the lands around it.`); }

  // New technology levels reached during the run.
  milestones(Y, snap) {
    for (const t of snap.tech) if (t > this.techMax) this.techMax = t;
    const lvl = Math.floor(this.techMax);
    if (lvl <= this.milestone) return;
    for (let k = this.milestone + 1; k <= lvl; k++) {
      if (k <= Math.floor(this.startMax) || !MILESTONES[k]) continue;
      this.ev(Y, 'tech', milestoneText(MILESTONES[k], this.rname(argmax(snap.tech)), Y));
    }
    this.milestone = lvl;
  }

  // Advanced worlds have their own history even when their borders are settled.
  advanced(Y, snap) {
    if (this.quiet || !this.chance(0.12)) return;
    const live = [];
    for (let r = 0; r < this.run.n; r++) if (snap.culture[r] && snap.tech[r] >= 9.3) live.push(r);
    if (live.length < 3) return;
    const r = this.rname(this.pick(live));
    const o = snap.owner[live[0]];
    const who = o ? this.pref(o, Y, true) : 'The peoples of ' + this.sheetName();
    const t = this.run.meanTech(live);
    const pool = [
      `${who} holds a constitutional convention in ${r} and rewrites its founding charter.`,
      `Machine minds are granted citizenship after a long struggle centred on ${r}.`,
      `${r} is rebuilt as an arcology after a catastrophic flood.`,
      `A great desalination and reforestation programme greens the drylands around ${r}.`,
      `${who} abolishes ageing as a cause of death; the gerontocracy debates begin in ${r}.`,
      `A schism over memory-editing splits the churches of ${r}.`,
      `The last coal mine in ${r} becomes a museum.`,
      `A cultural renaissance in ${r} revives the old languages of the region.`,
    ];
    if (t >= 10) pool.push(
      `Orbital elevators rise from ${r}; the sky fills with stations.`,
      `${who} launches its first crewed probe to another star.`,
      `A rogue artificial intelligence briefly seizes the networks of ${r} before it is talked down.`,
      `Weather control ends famine around ${r}, and starts a century of lawsuits.`,
    );
    this.ev(Y, 'tech', this.pick(pool));
  }

  // Great conquests and new dominant powers between two snapshots.
  growth(Y, prev, now) {
    const { run } = this;
    this.noteSizes(now);
    for (const [pid, size] of now) {
      const p = run.pol(pid);
      if (!run.isHome(pid) || p.earth || p.macro) continue;
      const before = prev.get(pid) || 0;
      if (size >= 6 && size - before >= Math.max(4, before)) {
        const c = run.world.cultures.get(p.culture);
        const ruler = c && c.phon ? rulerName(c.phon, this.rng, run.E(Y), p.type) : 'a new dynasty';
        this.ev(Y, 'war', `Under ${ruler}, ${this.pref(pid, Y)} conquers ${size - before} provinces.`, pid, [60, 240]);
      }
      if (size >= 18 && before < 18) {
        this.ev(Y, 'polity', `${this.pref(pid, Y, true)} becomes the dominant power of ${this.sheetName()}.`, pid, 200);
      }
    }
  }

  // A sheet-wide fall in technology over an interval.
  darkAge(Y, prevMean, mean) {
    if (prevMean - mean > 0.35 && this.run.E(Y) < 1900) {
      this.ev(Y, 'disaster', `A dark age settles over ${this.sheetName()}: cities shrink, trade routes fail and old learning is lost.`, 0, 200);
    }
  }

  // The finished chronicle: sorted, without the comings and goings of
  // statelets that never amounted to anything.
  close(finalSnap) {
    const { run } = this;
    this.noteSizes(run.sizes(finalSnap));
    const evs = this.events.filter((e) => {
      if (!e.pid || (e.kind !== 'polity' && e.kind !== 'war')) return true;
      if (/independence|proclaims|Revolution|dominant|pushes in|foothold/.test(e.text)) return true;
      const p = run.pol(e.pid);
      const life = (p.ended ?? run.end) - (p.founded ?? run.start);
      const peak = this.peak.get(e.pid) || 0;
      return peak >= 4 || (life >= 400 && peak >= 2);
    });
    evs.sort((a, b) => a.y - b.y);
    return evs;
  }
}

function argmax(a) {
  let best = 0;
  for (let i = 1; i < a.length; i++) if (a[i] > a[best]) best = i;
  return best;
}
