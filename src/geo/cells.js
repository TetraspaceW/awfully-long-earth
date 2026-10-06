// Per-cell and per-region state at a given year: what changes with ice ages
// and sea level on top of a sheet's fixed geography.

import { seaLevel, tempOffset } from './paleoclimate.js';
import { classify } from './biomes.js';

// Habitability-weighted size of a region at year Y (sea level and ice change).
export function regionCapacity(r, Y) {
  const g = Math.max(0, Math.min(1, -tempOffset(Y) / 6));
  const s = Math.max(0, Math.min(1, -seaLevel(Y) / 0.055));
  const f = Math.max(g, s);
  return r.habNow * (1 - f) + r.habGlacial * f;
}

// Surface temperature of a cell (deg C) at year Y.
export function cellTemp(geo, k, Y) { return geo.temp[k] + tempOffset(Y); }

// What the sea is doing at an ocean cell: frozen over, open water, steaming, or
// boiled away to bare seabed.
export const SEA_STATES = { ice: 'Frozen ocean', water: 'Ocean', steam: 'Steaming ocean', dry: 'Boiled-off seabed' };
export function seaState(geo, k, Y) {
  const T = cellTemp(geo, k, Y);
  return T < -12 ? 'ice' : T > 110 ? 'dry' : T > 60 ? 'steam' : 'water';
}

// Biome of one cell at year Y.
export function cellBiome(geo, k, Y) {
  const off = tempOffset(Y);
  const m = off < 0 ? geo.moist[k] * (1 + off / 40) : geo.moist[k];
  return classify(geo.elev[k], geo.temp[k] + off, m > 1.5 ? m : Math.min(m, 1.49), seaLevel(Y));
}
