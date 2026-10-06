// History generation: filling sheet x millennium tiles from their neighbours.
// This is the history module's only public entry.
//
// Which generator runs depends on which neighbours in time are known:
//   past only, or nothing  ForwardRun (forward.js), the systems pipeline
//   future only            ReverseRun (reverse.js)
//   both                   runBridge (reverse.js): both, then hand over
// Generators only compute a tile; generateTile stores it in the world.

import { T_MIN, T_MAX, DIR_ORDER, neighbourPos } from '../core/frame.js';
import { ForwardRun, FORWARD_SYSTEMS } from './forward.js';
import { ReverseRun, runBridge } from './reverse.js';

export { regionName } from './naming.js';
export { FORWARD_SYSTEMS };

// A tile can be generated when it doesn't exist yet and touches one that does,
// in space (same millennium) or in time (same sheet).
export function canGenerate(world, x, y, t) {
  if (t < T_MIN || t > T_MAX) return false;
  if (world.hasTile(x, y, t)) return false;
  if (world.hasTile(x, y, t - 1) || world.hasTile(x, y, t + 1)) return true;
  for (const d of DIR_ORDER) {
    const p = neighbourPos(x, y, d);
    if (world.hasTile(p.x, p.y, t)) return true;
  }
  return false;
}

/**
 * Generate tile (x, y, t), store it in the world and return it.
 * @param {{systems?: readonly {name: string, step: Function}[]}} [opts]
 *   systems: the forward pipeline (default FORWARD_SYSTEMS); a game can add its
 *   own systems or replace any of them
 */
export function generateTile(world, x, y, t, { systems = FORWARD_SYSTEMS } = {}) {
  const past = world.hasTile(x, y, t - 1), future = world.hasTile(x, y, t + 1);
  const tile = past && future ? runBridge(world, x, y, t, { systems })
    : future ? new ReverseRun(world, x, y, t).run()
      : new ForwardRun(world, x, y, t, { systems }).run();
  world.setTile(tile);
  return tile;
}
