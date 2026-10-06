// Colours: biomes, the technology/density ramp, and per-world colours for
// states and peoples.

export const BIOME_RGB = [
  [27, 52, 78], [232, 238, 240], [160, 163, 140], [78, 105, 78], [136, 125, 112], [214, 192, 140],
  [184, 180, 112], [108, 150, 84], [181, 164, 82], [62, 122, 62], [128, 174, 92], [92, 112, 70],
  [150, 98, 66],
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
export function polityCss(world, id) { return rgbCss(polityRgb(world, id)); }
export function cultureCss(world, id) { return rgbCss(cultureRgb(world, id)); }
export function clearColorCache(world) { if (world) caches.delete(world); }
