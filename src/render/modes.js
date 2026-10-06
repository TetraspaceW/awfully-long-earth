// Map modes: how a province's state is drawn over the terrain. Register new
// ones with registerMapMode(); a game can add its own (territory, supply,
// fog of war...) without touching the rasteriser.
//
// A mode is { id, label, legend, paint?, border? }:
//   paint(rgb, cell) -> rgb   tint a land cell that belongs to a province
//   border(cell) -> value     cells whose value differs from their right or
//                             lower neighbour's (and is non-zero) get a dark edge
//   legend                    { kind: 'text', text } or { kind: 'ramp', title, from, to }
// `cell` is { world, snap, r (province id), biome, Y, focus }.

import { HAB } from '../geo/biomes.js';
import { density } from '../world/economy.js';
import { mix, ramp, polityRgb, cultureRgb, GREY } from './palette.js';

const modes = new Map();

export function registerMapMode(mode) {
  if (!mode.id) throw new Error('map mode needs an id');
  modes.set(mode.id, mode);
  return mode;
}
export function getMapMode(id) { return modes.get(id); }
export function mapModes() { return [...modes.values()]; }

registerMapMode({
  id: 'political', label: 'States',
  legend: { kind: 'text', text: 'States; grey land is stateless' },
  paint(rgb, { world, snap, r, focus }) {
    const o = snap.owner[r];
    if (o) rgb = mix(rgb, polityRgb(world, o), 0.78);
    else rgb = mix(rgb, GREY, snap.culture[r] ? 0.55 : 0.2);
    // a selected nation stands out; everyone else fades back
    if (focus && o !== focus) rgb = mix(rgb, [110, 112, 116], 0.6);
    return rgb;
  },
  border: (snap, r) => snap.owner[r],
});

registerMapMode({
  id: 'culture', label: 'Peoples',
  legend: { kind: 'text', text: 'Language families; related peoples share hues' },
  paint(rgb, { world, snap, r }) {
    const c = snap.culture[r];
    return c ? mix(rgb, cultureRgb(world, c), 0.8) : mix(rgb, GREY, 0.3);
  },
  border: (snap, r) => snap.culture[r],
});

registerMapMode({
  id: 'tech', label: 'Technology',
  legend: { kind: 'ramp', title: 'Technology', from: 'Foragers', to: 'Information age' },
  paint(rgb, { snap, r }) {
    return snap.culture[r] ? mix(rgb, ramp(snap.tech[r] / 11), 0.85) : mix(rgb, GREY, 0.3);
  },
});

registerMapMode({
  id: 'density', label: 'Density',
  legend: { kind: 'ramp', title: 'People per cell', from: 'Sparse', to: 'Dense' },
  paint(rgb, { snap, r, biome }) {
    const dd = snap.culture[r] ? Math.log10(1 + 1000 * density(snap.tech[r]) * HAB[biome]) / 3 : 0;
    return mix(rgb, ramp(dd), 0.85);
  },
});

registerMapMode({
  id: 'terrain', label: 'Terrain',
  legend: { kind: 'text', text: 'Climate and terrain at this date' },
});
