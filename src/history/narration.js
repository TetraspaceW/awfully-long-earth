// Narration: the chronicle's events that are read off the dynamics or the finished snapshots.
//
// Methods of TileSim (see tile-sim.js), installed with mixin().

import { rulerName } from '../lang/names.js';
import { MILESTONES, milestoneText } from '../lore/chronicle.js';

export class Narration {
  // Advanced worlds have their own history even when their borders are settled.
  advancedEvents(Y) {
    if (this.warm || !this.rng.chance(0.12)) return;
    const { rng } = this;
    const live = [];
    for (let r = 0; r < this.n; r++) if (this.s.culture[r] && this.s.tech[r] >= 9.3) live.push(r);
    if (live.length < 3) return;
    const r = this.rname(rng.pick(live));
    const o = this.s.owner[live[0]];
    const who = o ? this.pref(o, Y, true) : 'The peoples of ' + this.world.tileName(this.x, this.y);
    const t = this.meanTech(live);
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
    this.ev(Y - rng.int(0, 49), 'tech', rng.pick(pool));
  }

  shockKinds(Y) {
    if (this.E(Y) >= 2000) return ['A pandemic', 'Sea-level rise and great storms', 'A grid collapse and civil strife', 'Crop blight from a shifting climate', 'An automation crash and mass unrest'];
    if (this.E(Y) >= 1800) return ['A pandemic', 'A great famine', 'A financial crash and civil strife'];
    return ['A plague', 'A great drought', 'A volcanic winter', 'A cattle plague and famine', 'A succession of failed harvests', 'Earthquakes and floods'];
  }

  // Narrative that is easiest to read off the finished snapshots.
  narrateSnaps(snaps) {
    const { rng } = this;
    const sizes = (sn) => { const m = new Map(); for (const o of sn.owner) if (o) m.set(o, (m.get(o) || 0) + 1); return m; };
    let prev = sizes(snaps[0]);
    for (const [o, c] of prev) this.peak.set(o, c);
    for (let k = 1; k < 5; k++) {
      const Y = this.start + k * 250;
      const now = sizes(snaps[k]);
      for (const [pid, size] of now) {
        this.peak.set(pid, Math.max(this.peak.get(pid) || 0, size));
        if (!this.isHome(pid) || this.pol(pid).macro) continue;
        const before = prev.get(pid) || 0;
        const p = this.pol(pid);
        if (size >= 6 && size - before >= Math.max(4, before) && !p.earth) {
          const c = this.world.cultures.get(p.culture);
          const ruler = c && c.phon ? rulerName(c.phon, rng, this.E(Y), p.type) : 'a new dynasty';
          this.ev(Y - rng.int(30, 220), 'war', `Under ${ruler}, ${this.pref(pid, Y)} conquers ${size - before} provinces.`, pid);
        }
        if (size >= 18 && before < 18) this.ev(Y - rng.int(0, 200), 'polity', `${this.pref(pid, Y, true)} becomes the dominant power of ${this.world.tileName(this.x, this.y)}.`, pid);
      }
      prev = now;
    }
    const maxT = snaps.map((sn) => Math.max(0, ...sn.tech));
    const texts = MILESTONES;
    for (let lvl = Math.floor(maxT[0]) + 1; lvl <= Math.floor(maxT[4]); lvl++) {
      const k = maxT.findIndex((m) => m >= lvl);
      if (k <= 0 || !texts[lvl]) continue;
      const sn = snaps[k];
      let best = 0;
      for (let r = 0; r < this.n; r++) if (sn.tech[r] > sn.tech[best]) best = r;
      const yy = this.start + k * 250 - rng.int(0, 249);
      this.ev(yy, 'tech', milestoneText(texts[lvl], this.rname(best), yy));
    }
  }

  milestones(Y) {
    const lvl = Math.floor(this.techMax);
    if (lvl <= this.milestone) return;
    for (let k = this.milestone + 1; k <= lvl; k++) {
      if (k <= Math.floor(this.pastMax)) continue;
      let best = 0;
      for (let r = 0; r < this.n; r++) if (this.s.tech[r] > this.s.tech[best]) best = r;
      const texts = MILESTONES;
      if (texts[k]) this.ev(Y - this.rng.int(0, 49), 'tech', milestoneText(texts[k], this.rname(best), Y));
    }
    this.milestone = lvl;
  }

  narrateInterval(Y, prev, prevMean) {
    const { rng } = this;
    const now = this.sizes();
    for (const [o, c] of now) this.peak.set(o, Math.max(this.peak.get(o) || 0, c));
    for (const [pid, size] of now) {
      if (!this.isHome(pid) || this.pol(pid).earth || this.pol(pid).macro) continue;
      const before = prev.get(pid) || 0;
      if (size >= 6 && size - before >= Math.max(4, before)) {
        const p = this.pol(pid);
        const c = this.world.cultures.get(p.culture);
        const ruler = c && c.phon ? rulerName(c.phon, rng, this.E(Y), p.type) : 'a new dynasty';
        this.ev(Y - rng.int(60, 240), 'war', `Under ${ruler}, ${this.pref(pid, Y)} conquers ${size - before} provinces.`, pid);
      }
      if (size >= 18 && before < 18) {
        this.ev(Y - rng.int(0, 200), 'polity', `${this.pref(pid, Y, true)} becomes the dominant power of ${this.world.tileName(this.x, this.y)}.`, pid);
      }
    }
    const mean = this.tileMeanTech();
    if (prevMean - mean > 0.35 && this.E(Y) < 1900) {
      this.ev(Y - rng.int(0, 200), 'disaster', `A dark age settles over ${this.world.tileName(this.x, this.y)}: cities shrink, trade routes fail and old learning is lost.`);
    }
  }

  sizes() {
    const m = new Map();
    for (const o of this.s.owner) if (o) m.set(o, (m.get(o) || 0) + 1);
    return m;
  }

  tileMeanTech() {
    let s = 0, w = 0;
    for (let r = 0; r < this.n; r++) {
      const c = this.cap(r, this.start + 500);
      s += this.s.tech[r] * c; w += c;
    }
    return w ? s / w : 0;
  }

  // Drop the comings and goings of statelets that never amounted to anything.
  pruneEvents() {
    const peak = this.peak;
    for (const [o, c] of this.sizes()) peak.set(o, Math.max(peak.get(o) || 0, c));
    const evs = this.events.filter((e) => {
      if (!e.pid || (e.kind !== 'polity' && e.kind !== 'war')) return true;
      if (/independence|proclaims|Revolution|dominant|pushes in|foothold/.test(e.text)) return true;
      const p = this.pol(e.pid);
      const life = (p.ended ?? this.end) - (p.founded ?? this.start);
      return (peak.get(e.pid) || 0) >= 4 || (life >= 400 && (peak.get(e.pid) || 0) >= 2);
    });
    evs.sort((a, b) => a.y - b.y);
    return evs;
  }
}
