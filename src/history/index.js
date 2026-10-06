// History generation: filling sheet x millennium tiles from their neighbours.
// This is the history module's only public entry.

import { T_MIN, T_MAX, DIR_ORDER, neighbourPos } from '../core/frame.js';
import { TileSim } from './sim.js';
import { ReverseSim, runBridge } from './reverse.js';

export { regionName } from './naming.js';

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

// Generate and store tile (x, y, t); returns its TileHistory. Which generator
// runs depends on which neighbours in time are known.
export function generateTile(world, x, y, t) {
  const past = world.hasTile(x, y, t - 1), future = world.hasTile(x, y, t + 1);
  if (past && future) return runBridge(world, x, y, t);
  if (future) return new ReverseSim(world, x, y, t).run();
  return new TileSim(world, x, y, t).run();
}
