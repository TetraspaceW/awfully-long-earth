// History generation: filling sheet x millennium tiles from their neighbours.

import { T_MIN, T_MAX } from '../core/timeline.js';
import { DIR_ORDER, neighbourPos } from '../core/coords.js';
import { TileSim } from './tile-sim.js';

export { regionName } from './naming.js';
export { TileSim };

// A tile can be generated when it doesn't exist yet and touches one that does,
// in space (same millennium) or in time (same sheet).
export function canGenerate(world, x, y, t) {
  if (t < T_MIN || t > T_MAX) return false;
  if (world.hasTile(x, y, t)) return false;
  if (world.hasTile(x, y, t - 1) || world.hasTile(x, y, t + 1)) return true;
  for (const d of DIR_ORDER) {
    const p = neighbourPos(x, y, d);
    if (p && world.hasTile(p.x, p.y, t)) return true;
  }
  return false;
}

// Generate and store tile (x, y, t); returns its TileHistory.
export function generateTile(world, x, y, t) {
  return new TileSim(world, x, y, t).run();
}
