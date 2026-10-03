// Population, economy and power, shared by the simulator and the UI.
// Calibrated so the model reproduces Earth's present-day population when fed
// Earth's own provinces and technology levels.

import { regionCapacity } from './geo.js';
import { getGeo } from './geo.js';
import { SNAP_YEARS } from './constants.js';

// Relative population density by technology level.
const DENS = [0.002, 0.01, 0.02, 0.035, 0.05, 0.075, 0.1, 0.2, 0.62, 0.8, 0.85, 0.9];
// People per unit of habitable capacity at density 1. Set by calibrate().
let K = 1;

function interp(table, x) {
  if (x <= 0) return table[0];
  const i = Math.min(table.length - 2, Math.floor(x));
  const f = Math.min(1, x - i);
  return table[i] + (table[i + 1] - table[i]) * f;
}

export function density(tech) { return interp(DENS, tech); }

export function regionPop(r, tech, Y) {
  return K * regionCapacity(r, Y) * density(tech);
}

// GDP per head in present-day dollars.
export function perCapita(tech) {
  return 250 + 90 * tech + 900 * Math.exp(1.9 * (tech - 7));
}

// Military and economic weight.
export function regionPower(r, tech, Y) {
  return regionPop(r, tech, Y) * perCapita(tech) / 1000;
}

export function calibrate(earthGeo, techOf, realTotal) {
  let s = 0;
  for (const r of earthGeo.regions) {
    const t = techOf(r);
    if (t === undefined) continue;
    s += regionCapacity(r, 2000) * density(t);
  }
  K = realTotal / s;
  return K;
}

export function getK() { return K; }

// Look up the state of the world at year Y for a tile position, choosing the
// generated millennium tile (and snapshot) that covers it.
export function tileStateAt(world, x, y, Y) {
  const t = Math.floor(Y / 1000);
  const k = Math.round((Y - t * 1000) / SNAP_YEARS);
  let h = world.tile(x, y, t);
  if (h) return { hist: h, snap: h.snaps[k], k };
  if (Y % 1000 === 0) {
    h = world.tile(x, y, t - 1);
    if (h) return { hist: h, snap: h.snaps[4], k: 4 };
  }
  return null;
}

// Aggregate every polity (and bloc) across all generated tiles at year Y.
export function worldPowers(world, Y, only = null) {
  const agg = new Map();
  const positions = new Set();
  for (const h of world.tiles.values()) positions.add(`${h.x},${h.y}`);
  for (const pk of positions) {
    const [x, y] = pk.split(',').map(Number);
    if (only && !only.has(pk)) continue;
    const st = tileStateAt(world, x, y, Y);
    if (!st) continue;
    const geo = getGeo(x, y);
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

export function fmtPop(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} bn`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)} m`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} k`;
  return `${Math.round(n)}`;
}

export function fmtMoney(n) {
  if (n >= 1e15) return `$${(n / 1e15).toFixed(1)} qd`;
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)} tn`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(n >= 1e11 ? 0 : 1)} bn`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)} m`;
  return `$${Math.round(n / 1e3)} k`;
}
