// BigEarth: the headless engine a game (or the explorer UI) is built on.
//
// It owns a World, reveals sheets, answers questions about the map, and emits
// events when the world changes. It touches no DOM.
//
//   const earth = BigEarth.create({ seed: 20000 });
//   earth.on('reveal', ({ x, y }) => ...);
//   if (earth.canReveal(2, 0)) earth.reveal(2, 0);
//   earth.cell(1, 0, 120, 60);          // what is at a cell, in 2000 CE
//   earth.players(2000);                // leading powers
//   const save = earth.save();          // JSON string; BigEarth.load(save)
//
// Events: 'reveal' { x, y, tile }, 'load' { world }, '*' (everything).

import { Emitter } from './core/util.js';
import { W, neighbourPos, posKey, PRESENT, PRESENT_LAYER, eraName } from './core/frame.js';
import { World } from './world/world.js';
import { tileStateAt, players, worldPowers, peoplesOn, regionFigures } from './world/stats.js';
import { buildTerra } from './terra.js';
import { canGenerate, generateTile, regionName, FORWARD_SYSTEMS } from './history/index.js';
import { nationProfile } from './profile.js';
import { BIOME, BIOME_NAMES, cellBiome, cellTemp, seaState, climateName, SEA_STATES } from './geo/index.js';
import { eraShift, federationAt } from './macro.js';
import { rasterTile } from './render.js';

// Terra's present-day neighbours, revealed in a new world.
export const START_RING = [[1, 0], [-1, 0], [0, -1], [0, 1]];

export class BigEarth extends Emitter {
  /**
   * @param {World} world
   * @param {{systems?: readonly object[]}} [opts]
   *   systems: the history pipeline new sheets are generated with (default
   *   FORWARD_SYSTEMS; see src/history/forward.js). Not saved.
   */
  constructor(world, { systems = FORWARD_SYSTEMS } = {}) {
    super();
    this.world = world;
    this.systems = systems;
  }

  /** A new world: Terra's record plus, by default, its four neighbours. */
  static create({ seed = 20000, ring = START_RING, systems, warn } = {}) {
    const w = new World(seed);
    buildTerra(w, warn);
    const e = new BigEarth(w, { systems });
    for (const [x, y] of ring) generateTile(w, x, y, { systems: e.systems });
    return e;
  }

  static load(json, opts) { return new BigEarth(World.deserialize(json), opts); }

  save() { return this.world.serialize(); }

  // Replace the world in place (keeps listeners).
  adopt(world) {
    this.world = world;
    this.emit('load', { world });
  }

  get seed() { return this.world.seed; }

  // The moment the map shows: Big Earth exists only in its present. Queries
  // take an earlier year to read a sheet's backstory (1000-2000 CE).
  get year() { return PRESENT; }

  // ------------------------------------------------------------- revealing

  canReveal(x, y) { return canGenerate(this.world, x, y); }

  isRevealed(x, y) { return this.world.hasTile(x, y, PRESENT_LAYER); }

  reveal(x, y) {
    if (!this.canReveal(x, y)) return null;
    const tile = generateTile(this.world, x, y, { systems: this.systems });
    this.emit('reveal', { x, y, tile });
    return tile;
  }

  // Reveal every revealable neighbour of (x, y), in this order; returns those revealed.
  revealAround(x, y, order = ['N', 'E', 'S', 'W']) {
    const out = [];
    for (const d of order) {
      const p = neighbourPos(x, y, d);
      if (this.reveal(p.x, p.y)) out.push(p);
    }
    return out;
  }

  // Bounding box of revealed sheets.
  bounds() {
    let x0 = 0, x1 = 0, y0 = 0, y1 = 0;
    for (const h of this.world.tiles.values()) {
      x0 = Math.min(x0, h.x); x1 = Math.max(x1, h.x); y0 = Math.min(y0, h.y); y1 = Math.max(y1, h.y);
    }
    return { x0, x1, y0, y1 };
  }

  // -------------------------------------------------------------- queries

  sheet(x, y) { return this.world.geo(x, y); }
  sheetName(x, y) { return this.world.tileName(x, y); }
  stateAt(x, y, Y = this.year) { return tileStateAt(this.world, x, y, Y); }

  /** Everything about cell (i, j) of sheet (x, y) in year Y; pass j = undefined to give a cell index k as i. */
  cell(x, y, i, j, Y = this.year) {
    const geo = this.sheet(x, y);
    const k = j === undefined ? i : j * W + i;
    const biome = cellBiome(geo, k, Y);
    const out = {
      x, y, k, biome, biomeName: BIOME_NAMES[biome], temp: cellTemp(geo, k, Y), elev: geo.elev[k],
      ocean: biome === BIOME.OCEAN, sea: biome === BIOME.OCEAN ? seaState(geo, k, Y) : null,
      seaName: SEA_STATES[seaState(geo, k, Y)],
      region: geo.region[k], revealed: false,
    };
    const st = this.stateAt(x, y, Y);
    if (!st) return out;
    out.revealed = true;
    const r = geo.region[k];
    if (r < 0) return out;
    const tech = st.snap.tech[r];
    const reg = geo.regions[r];
    Object.assign(out, {
      regionName: regionName(this.world, geo, r),
      owner: st.snap.owner[r], culture: st.snap.culture[r], tech, era: eraName(tech),
      ...regionFigures(geo, reg, tech, Y),
    });
    return out;
  }

  /** Province r of sheet (x, y) and its state in year Y. */
  province(x, y, r, Y = this.year) {
    const geo = this.sheet(x, y);
    const reg = geo.regions[r];
    if (!reg) return null;
    const st = this.stateAt(x, y, Y);
    const base = { x, y, r, name: regionName(this.world, geo, r), region: reg };
    if (!st) return base;
    const tech = st.snap.tech[r];
    return { ...base, owner: st.snap.owner[r], culture: st.snap.culture[r], tech, ...regionFigures(geo, reg, tech, Y) };
  }

  players(Y = this.year, only = null, n = 10) { return players(this.world, Y, only, n); }
  powers(Y = this.year, only = null) { return worldPowers(this.world, Y, only); }
  peoples(x, y, Y = this.year) {
    const st = this.stateAt(x, y, Y);
    return st ? peoplesOn(this.world, x, y, st.snap, Y) : [];
  }
  profile(pid, Y = this.year) { return nationProfile(this.world, pid, Y); }
  polity(pid) { return this.world.polities.get(pid); }
  culture(cid) { return this.world.cultures.get(cid); }

  // Mean warming against Terra and its name, for a sheet.
  climate(x, y) {
    const dT = this.world.atlas.climateAt(x + 0.5, y + 0.5);
    return { dT, name: climateName(dT) };
  }
  // Years this sheet's development runs ahead (+) or behind (-) Terra's.
  drift(x, y, Y = this.year) { return eraShift(this.seed, x + 0.5, y + 0.5, Y); }
  federation(gx, gy, Y = this.year) { return federationAt(this.seed, gx, gy, Y); }

  /** RGBA pixels of a sheet in a map mode (see render.js), or null if unrevealed. */
  raster(x, y, mode = 'political', { Y = this.year, focus = 0, out } = {}) {
    const st = this.stateAt(x, y, Y);
    if (!st) return null;
    return rasterTile(this.world, x, y, st.snap, Y, mode, { focus, out });
  }

  positions() { return [...this.world.positions()]; }
  key(x, y) { return posKey(x, y); }
}
