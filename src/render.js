// Map rendering, headless: colours, the map-mode registry, and the rasteriser
// that turns a sheet's state into W x H RGBA pixels (runs in a worker or Node).
//
// Map modes say how a province's state is drawn over the terrain. Register new
// ones with registerMapMode(); a game can add its own (territory, supply, fog of
// war...) without touching the rasteriser. A mode is
// { id, label, legend, paint?, border? }:
//   paint(rgb, cell) -> rgb   tint a land cell that belongs to a province
//   border(snap, r) -> value  cells whose value differs from their right or
//                             lower neighbour's (and is non-zero) get a dark edge
//   legend                    { kind: 'text', text } or { kind: 'ramp', title, from, to }
// `cell` is { world, snap, r (province id), biome, Y, focus }.

import { H, W } from './core/frame.js';
import { hashN } from './core/random.js';
import { BIOME, HAB, cellBiome, cellTemp, seaState } from './geo/index.js';
import { density } from './world/stats.js';
import { cultureSpecies } from './species.js';

// Colours: biomes, the technology/density ramp, and per-world colours for
// states and peoples.

export const BIOME_RGB = [
  [27, 52, 78], [232, 238, 240], [160, 163, 140], [78, 105, 78], [136, 125, 112], [214, 192, 140],
  [184, 180, 112], [108, 150, 84], [181, 164, 82], [62, 122, 62], [128, 174, 92], [92, 112, 70],
  [150, 98, 66], [168, 104, 72],
];

export const GREY = [150, 150, 145];
export const UNKNOWN = [128, 128, 128];

export function hsl(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}

export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const rgbCss = ([r, g, b]) => `rgb(${r},${g},${b})`;

// perceptually ordered ramp for technology (0..11) and density
const RAMP = [[38, 24, 64], [60, 64, 130], [36, 120, 150], [40, 160, 120], [150, 196, 70], [240, 214, 70], [250, 240, 200]];
export function ramp(f) {
  f = Math.max(0, Math.min(0.9999, f)) * (RAMP.length - 1);
  const i = Math.floor(f), t = f - i;
  return RAMP[i].map((v, k) => Math.round(v + (RAMP[i + 1][k] - v) * t));
}
export function rampCss(f) { return rgbCss(ramp(f)); }

// Per-world caches of polity and culture colours.
const caches = new WeakMap();
function cacheOf(world) {
  let c = caches.get(world);
  if (!c) { c = new Map(); caches.set(world, c); }
  return c;
}

export function polityRgb(world, id) {
  const cache = cacheOf(world);
  let c = cache.get(id);
  if (!c) {
    const p = world.polities.get(id);
    c = p ? hsl(...p.color) : UNKNOWN;
    cache.set(id, c);
  }
  return c;
}
export function cultureRgb(world, id) {
  const cache = cacheOf(world), k = -id;
  let c = cache.get(k);
  if (!c) {
    const cu = world.cultures.get(id);
    c = cu ? hsl(cu.hue, 55, 52) : UNKNOWN;
    cache.set(k, c);
  }
  return c;
}
// Species colours: humans a muted slate so every other lineage stands out.
export function speciesRgb(world, cid) {
  const cache = cacheOf(world), k = `s${cid}`;
  let c = cache.get(k);
  if (!c) {
    const sp = cultureSpecies(world.cultures.get(cid));
    c = sp.id === 'human' ? [120, 130, 150] : hsl(sp.hue, 70, 52);
    cache.set(k, c);
  }
  return c;
}
export function speciesCss(world, cid) { return rgbCss(speciesRgb(world, cid)); }
export function polityCss(world, id) { return rgbCss(polityRgb(world, id)); }
export function cultureCss(world, id) { return rgbCss(cultureRgb(world, id)); }
export function clearColorCache(world) { if (world) caches.delete(world); }

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
  paint(rgb, { world, snap, r }) {
    const o = snap.owner[r];
    if (o) rgb = mix(rgb, polityRgb(world, o), 0.78);
    else rgb = mix(rgb, GREY, snap.culture[r] ? 0.55 : 0.2);
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
  id: 'species', label: 'Species',
  legend: { kind: 'text', text: 'Sapient species; humans in slate' },
  paint(rgb, { world, snap, r }) {
    const c = snap.culture[r];
    return c ? mix(rgb, speciesRgb(world, c), 0.85) : mix(rgb, GREY, 0.3);
  },
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

// A selected nation stands out; everything else, sea included, fades towards
// this colour by this much. A sheet the nation does not touch fades uniformly,
// so a viewer can draw its usual image under a translucent overlay instead.
export const FOCUS_FADE = [110, 112, 116], FOCUS_ALPHA = 0.6;

// Turns a sheet's state at one snapshot into a W x H RGBA image for one map
// mode. Headless: returns pixels, so it runs in a worker or in Node too.


// The bare terrain colour of cell k at year Y.
export function terrainRgb(geo, k, Y, b = cellBiome(geo, k, Y)) {
  let rgb = BIOME_RGB[b];
  if (b === BIOME.OCEAN) {
    const depth = Math.min(1, -geo.elev[k] / 0.4);
    const sea = seaState(geo, k, Y);
    if (sea === 'void') return spaceRgb(geo, k);
    // a small world's lowlands: dust-filled basins that never held seas long
    if (sea === 'basin') return mix([150, 92, 64], [110, 64, 48], Math.min(1, -geo.elev[k] / 0.3));
    const T = cellTemp(geo, k, Y);
    if (sea === 'dry') return mix([128, 84, 62], [84, 50, 40], depth);
    rgb = mix([52, 92, 120], [20, 38, 60], depth);
    // pack ice thickens poleward of the freezing line; steam rises off hot seas
    if (T < -6) rgb = mix(rgb, mix([214, 226, 234], [176, 196, 212], depth), Math.min(1, (-6 - T) / 8));
    if (sea === 'steam') rgb = mix(rgb, [150, 146, 130], Math.min(1, (T - 60) / 50));
    return rgb;
  }
  const shade = 1 + Math.min(0.25, geo.elev[k] * 0.3);
  rgb = rgb.map((v) => v * shade);
  // scorched rock darkens and reddens as it heats towards Venus
  if (b === BIOME.SCORCHED) rgb = mix(rgb, [96, 40, 30], Math.min(1, (cellTemp(geo, k, Y) - 48) / 350));
  return rgb;
}

// The Gap: dark space with a scatter of asteroids, thicker along the belt.
function spaceRgb(geo, k) {
  const i = k % W, j = (k / W) | 0;
  const belt = Math.exp(-(((j - H / 2) / (H / 5)) ** 2));
  const h = hashN(geo.x, geo.y, k, 'rock') / 4294967296;
  if (h < 0.015 + 0.06 * belt) return mix([92, 86, 78], [150, 140, 124], h * 20 % 1);
  const glow = 6 * belt + 4 * Math.sin(i / 17 + j / 9) ** 2;
  return [10 + glow, 12 + glow, 20 + glow];
}

/**
 * @param {import('../world/world.js').World} world
 * @param {number} x
 * @param {number} y
 * @param {import('../world/snapshot.js').Snapshot|null} snap
 * @param {number} Y        year (sets sea level, ice and biomes)
 * @param {string} modeId   a registered map mode
 * @param {{focus?: number, out?: Uint8ClampedArray}} [opts]  focus: a polity to highlight
 * @returns {Uint8ClampedArray} W * H * 4 RGBA bytes
 */
export function rasterTile(world, x, y, snap, Y, modeId, { focus = 0, out } = {}) {
  const geo = world.geo(x, y);
  const d = out || new Uint8ClampedArray(W * H * 4);
  const mode = getMapMode(modeId);
  if (!mode) throw new Error(`unknown map mode ${modeId}`);
  const { region } = geo;
  const border = snap && mode.border;
  const val = (k) => (region[k] < 0 ? 0 : border(snap, region[k]));
  const cell = { world, snap, r: -1, biome: 0, Y, focus };
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      const b = cellBiome(geo, k, Y);
      let rgb = terrainRgb(geo, k, Y, b);
      if (b !== BIOME.OCEAN) {
        const r = region[k];
        if (r >= 0 && snap && mode.paint) {
          cell.r = r; cell.biome = b;
          rgb = mode.paint(rgb, cell);
        }
        if (border) {
          const v = val(k);
          const right = i < W - 1 ? val(k + 1) : v, down = j < H - 1 ? val(k + W) : v;
          if (v && (right !== v || down !== v)) rgb = rgb.map((c) => c * 0.45);
        }
      }
      if (focus && !(b !== BIOME.OCEAN && region[k] >= 0 && snap && snap.owner[region[k]] === focus)) rgb = mix(rgb, FOCUS_FADE, FOCUS_ALPHA);
      d[k * 4] = rgb[0]; d[k * 4 + 1] = rgb[1]; d[k * 4 + 2] = rgb[2]; d[k * 4 + 3] = 255;
    }
  }
  return d;
}
