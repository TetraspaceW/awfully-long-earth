// Turns a sheet's state at one snapshot into a W x H RGBA image for one map
// mode. Headless: returns pixels, so it runs in a worker or in Node too.

import { W, H } from '../core/grid.js';
import { BIOME } from '../geo/biomes.js';
import { cellBiome, cellTemp, seaState } from '../geo/cells.js';
import { BIOME_RGB, mix } from './palette.js';
import { getMapMode } from './modes.js';

// The bare terrain colour of cell k at year Y.
export function terrainRgb(geo, k, Y, b = cellBiome(geo, k, Y)) {
  let rgb = BIOME_RGB[b];
  if (b === BIOME.OCEAN) {
    const depth = Math.min(1, -geo.elev[k] / 0.4);
    const sea = seaState(geo, k, Y);
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
      d[k * 4] = rgb[0]; d[k * 4 + 1] = rgb[1]; d[k * 4 + 2] = rgb[2]; d[k * 4 + 3] = 255;
    }
  }
  return d;
}
