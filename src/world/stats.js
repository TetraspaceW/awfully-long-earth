// Population, economy and power, and the queries built on them: what a sheet
// looks like at a year and who the leading powers are. Calibrated so the model
// reproduces Terra's present-day population from Terra's own provinces and
// technology levels.

import { interpTable } from '../core/util.js';
import { SNAPS, SNAP_YEARS } from '../core/frame.js';
import { regionCapacity, terraSheet } from '../geo/index.js';
import { earthTechAt } from '../data/earth-history.js';

// Population, economy and power, shared by the simulator and the UI.
// Calibrated so the model reproduces Terra's present-day population when fed
// Terra's own provinces and technology levels.


// Relative population density by technology level.
const DENS = [0.002, 0.01, 0.02, 0.035, 0.05, 0.075, 0.1, 0.2, 0.62, 0.8, 0.85, 0.9];

export function density(tech) { return interpTable(DENS, tech); }

// People per unit of habitable capacity at density 1, calibrated on Terra in 2000.
let K = 0;
export function popScale() {
  if (!K) {
    const geo = terraSheet();
    let s = 0;
    for (const r of geo.regions) {
      const t = earthTechAt(r.code, 2000, r.income);
      if (t === undefined) continue;
      s += regionCapacity(r, 2000) * density(t);
    }
    K = geo.realTotal / s;
  }
  return K;
}

export function regionPop(r, tech, Y) {
  return popScale() * regionCapacity(r, Y) * density(tech);
}

// GDP per head in present-day dollars.
export function perCapita(tech) {
  return 250 + 90 * tech + 900 * Math.exp(1.9 * (tech - 7));
}

// Military and economic weight.
export function regionPower(r, tech, Y) {
  return regionPop(r, tech, Y) * perCapita(tech) / 1000;
}

// Population and GDP of one province of a sheet. Terra in 2000 CE uses the
// real Natural Earth figures.
export function regionFigures(geo, r, tech, Y, real = geo.earth && Y === 2000) {
  const pop = real ? r.realPop : regionPop(r, tech, Y);
  return { pop, gdp: real ? r.realGdp : pop * perCapita(tech) };
}

// Read-only questions about a World: what a sheet looks like at a year, and
// who the leading powers are.


// The state of the world at year Y for a sheet: the generated millennium tile
// (and snapshot) that covers it, or null.
export function tileStateAt(world, x, y, Y) {
  const t = Math.floor(Y / 1000);
  const k = Math.round((Y - t * 1000) / SNAP_YEARS);
  let h = world.tile(x, y, t);
  if (h) return { hist: h, snap: h.snaps[k], k };
  if (Y % 1000 === 0) {
    h = world.tile(x, y, t - 1);
    if (h) return { hist: h, snap: h.snaps[SNAPS - 1], k: SNAPS - 1 };
  }
  return null;
}

// Aggregate every polity across all generated tiles at year Y (only: a set of
// "x,y" sheet keys to restrict to).
export function worldPowers(world, Y, only = null) {
  const agg = new Map();
  for (const pk of world.positions()) {
    const [x, y] = pk.split(',').map(Number);
    if (only && !only.has(pk)) continue;
    const st = tileStateAt(world, x, y, Y);
    if (!st) continue;
    const geo = world.geo(x, y);
    const real = geo.earth && Y === 2000;
    for (const r of geo.regions) {
      const pid = st.snap.owner[r.id];
      if (!pid) continue;
      let a = agg.get(pid);
      if (!a) { a = { id: pid, pop: 0, gdp: 0, regions: 0, tiles: new Set() }; agg.set(pid, a); }
      const tech = st.snap.tech[r.id];
      const pop = real ? r.realPop : regionPop(r, tech, Y);
      a.pop += pop;
      a.gdp += real ? r.realGdp : pop * perCapita(tech);
      a.regions++;
      a.tiles.add(pk);
    }
  }
  return agg;
}

// Ranked list of the leading players: blocs absorb their members.
export function players(world, Y, only = null, n = 10) {
  const agg = worldPowers(world, Y, only);
  const out = [];
  const absorbed = new Set();
  for (const b of world.blocs) {
    if (Y < b.from || (b.to && Y >= b.to)) continue;
    const members = b.members.filter((m) => agg.has(m));
    if (members.length < 2) continue;
    const e = { bloc: b, id: `b${b.id}`, name: b.name, pop: 0, gdp: 0, regions: 0, members };
    for (const m of members) {
      const a = agg.get(m);
      e.pop += a.pop; e.gdp += a.gdp; e.regions += a.regions;
      absorbed.add(m);
    }
    out.push(e);
  }
  for (const a of agg.values()) {
    if (absorbed.has(a.id)) continue;
    out.push({ ...a, name: world.polityName(a.id, Y) });
  }
  out.sort((a, b) => b.gdp - a.gdp);
  return out.slice(0, n);
}

// Population of each people on a sheet at a snapshot, largest first.
export function peoplesOn(world, x, y, snap, Y) {
  const geo = world.geo(x, y);
  const pops = new Map();
  for (const r of geo.regions) {
    const c = snap.culture[r.id];
    if (!c) continue;
    pops.set(c, (pops.get(c) || 0) + regionPop(r, snap.tech[r.id], Y));
  }
  return [...pops.entries()].sort((a, b) => b[1] - a[1]);
}
