// Turns a tile's state at one snapshot into a 240 x 120 image for one map mode.

import { W, H } from './constants.js';
import { getGeo, cellBiome, cellTemp, seaState, BIOME, HAB } from './geo.js';
import { density } from './stats.js';
import { cultureSpecies } from './species.js';

const BIOME_RGB = [
  [27, 52, 78], [232, 238, 240], [160, 163, 140], [78, 105, 78], [136, 125, 112], [214, 192, 140],
  [184, 180, 112], [108, 150, 84], [181, 164, 82], [62, 122, 62], [128, 174, 92], [92, 112, 70],
  [150, 98, 66],
];

export function hsl(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}

// perceptually ordered ramp for technology (0..11) and density
const RAMP = [[38, 24, 64], [60, 64, 130], [36, 120, 150], [40, 160, 120], [150, 196, 70], [240, 214, 70], [250, 240, 200]];
function ramp(f) {
  f = Math.max(0, Math.min(0.9999, f)) * (RAMP.length - 1);
  const i = Math.floor(f), t = f - i;
  return RAMP[i].map((v, k) => Math.round(v + (RAMP[i + 1][k] - v) * t));
}
export function rampCss(f) { const [r, g, b] = ramp(f); return `rgb(${r},${g},${b})`; }

const colorCache = new Map();
function polityRgb(world, id) {
  let c = colorCache.get(id);
  if (!c) {
    const p = world.polities.get(id);
    c = p ? hsl(...p.color) : [128, 128, 128];
    colorCache.set(id, c);
  }
  return c;
}
function cultureRgb(world, id) {
  const k = -id;
  let c = colorCache.get(k);
  if (!c) {
    const cu = world.cultures.get(id);
    c = cu ? hsl(cu.hue, 55, 52) : [128, 128, 128];
    colorCache.set(k, c);
  }
  return c;
}
// Species colours: humans a muted slate so every other lineage stands out.
function speciesRgb(world, cid) {
  const k = `s${cid}`;
  let c = colorCache.get(k);
  if (!c) {
    const sp = cultureSpecies(world.cultures.get(cid));
    c = sp.id === 'human' ? [120, 130, 150] : hsl(sp.hue, 70, 52);
    colorCache.set(k, c);
  }
  return c;
}
export function speciesCss(world, cid) { const [r, g, b] = speciesRgb(world, cid); return `rgb(${r},${g},${b})`; }
export function polityCss(world, id) { const [r, g, b] = polityRgb(world, id); return `rgb(${r},${g},${b})`; }
export function cultureCss(world, id) { const [r, g, b] = cultureRgb(world, id); return `rgb(${r},${g},${b})`; }
export function clearColorCache() { colorCache.clear(); }

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function renderTile(world, x, y, snap, Y, mode, focus = 0) {
  const geo = getGeo(x, y);
  const img = new ImageData(W, H);
  const d = img.data;
  const { region } = geo;
  const val = (k) => {
    const r = region[k];
    if (r < 0) return 0;
    if (mode === 'political') return snap.owner[r];
    if (mode === 'culture') return snap.culture[r];
    return 0;
  };
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      const b = cellBiome(geo, k, Y);
      let rgb = BIOME_RGB[b];
      if (b === BIOME.OCEAN) {
        const depth = Math.min(1, -geo.elev[k] / 0.4);
        const sea = seaState(geo, k, Y);
        const T = cellTemp(geo, k, Y);
        if (sea === 'dry') rgb = mix([128, 84, 62], [84, 50, 40], depth);
        else {
          rgb = mix([52, 92, 120], [20, 38, 60], depth);
          // pack ice thickens poleward of the freezing line; steam rises off hot seas
          if (T < -6) rgb = mix(rgb, mix([214, 226, 234], [176, 196, 212], depth), Math.min(1, (-6 - T) / 8));
          if (sea === 'steam') rgb = mix(rgb, [150, 146, 130], Math.min(1, (T - 60) / 50));
        }
      } else {
        const shade = 1 + Math.min(0.25, geo.elev[k] * 0.3);
        rgb = rgb.map((v) => v * shade);
        // scorched rock darkens and reddens as it heats towards Venus
        if (b === BIOME.SCORCHED) rgb = mix(rgb, [96, 40, 30], Math.min(1, (cellTemp(geo, k, Y) - 48) / 350));
        const r = region[k];
        if (r >= 0 && snap && mode !== 'terrain') {
          if (mode === 'political') {
            const o = snap.owner[r];
            if (o) rgb = mix(rgb, polityRgb(world, o), 0.78);
            else rgb = mix(rgb, [150, 150, 145], snap.culture[r] ? 0.55 : 0.2);
            // a selected nation stands out; everyone else fades back
            if (focus && o !== focus) rgb = mix(rgb, [110, 112, 116], 0.6);
          } else if (mode === 'species') {
            const c = snap.culture[r];
            rgb = c ? mix(rgb, speciesRgb(world, c), 0.85) : mix(rgb, [150, 150, 145], 0.3);
          } else if (mode === 'culture') {
            const c = snap.culture[r];
            rgb = c ? mix(rgb, cultureRgb(world, c), 0.8) : mix(rgb, [150, 150, 145], 0.3);
          } else if (mode === 'tech') {
            rgb = snap.culture[r] ? mix(rgb, ramp(snap.tech[r] / 11), 0.85) : mix(rgb, [150, 150, 145], 0.3);
          } else if (mode === 'density') {
            const dd = snap.culture[r] ? Math.log10(1 + 1000 * density(snap.tech[r]) * HAB[b]) / 3 : 0;
            rgb = mix(rgb, ramp(dd), 0.85);
          }
        }
        // borders
        if (mode === 'political' || mode === 'culture') {
          const v = val(k);
          const right = i < W - 1 ? val(k + 1) : v, down = j < H - 1 ? val(k + W) : v;
          if (v && (right !== v || down !== v)) rgb = rgb.map((c) => c * 0.45);
        }
      }
      d[k * 4] = rgb[0]; d[k * 4 + 1] = rgb[1]; d[k * 4 + 2] = rgb[2]; d[k * 4 + 3] = 255;
    }
  }
  return img;
}
