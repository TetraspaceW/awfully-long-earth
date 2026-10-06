// Read-only questions about a World: what a sheet looks like at a year, and
// who the leading powers are.

import { SNAP_YEARS, SNAPS } from '../core/timeline.js';
import { regionPop, perCapita } from './economy.js';

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
