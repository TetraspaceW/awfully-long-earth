// History generation: a sheet's present (2000 CE), made by simulating its
// backstory millennium (1000-2000 CE) forwards from the sheets already revealed
// around it. This is the history module's only public entry.
//
// Big Earth is shown only in the present. Time enters only through the macro
// layer: each sheet runs ahead of or behind Terra's timeline (macro.js,
// eraShift), so its present can look like Terra's past or future.

import { PRESENT_LAYER, DIR_ORDER, neighbourPos } from '../core/frame.js';
import { ForwardRun, FORWARD_SYSTEMS } from './forward.js';

export { regionName } from './naming.js';
export { FORWARD_SYSTEMS };

// A sheet can be revealed when it isn't yet and touches one that is.
export function canGenerate(world, x, y) {
  if (world.hasTile(x, y, PRESENT_LAYER)) return false;
  for (const d of DIR_ORDER) {
    const p = neighbourPos(x, y, d);
    if (world.hasTile(p.x, p.y, PRESENT_LAYER)) return true;
  }
  return false;
}

/**
 * Generate sheet (x, y)'s present and its backstory, store the tile in the
 * world and return it.
 * @param {{systems?: readonly {name: string, step: Function}[]}} [opts]
 *   systems: the pipeline (default FORWARD_SYSTEMS); a game can add its own
 *   systems or replace any of them
 */
export function generateTile(world, x, y, { systems = FORWARD_SYSTEMS } = {}) {
  const tile = new ForwardRun(world, x, y, PRESENT_LAYER, { systems }).run();
  world.setTile(tile);
  return tile;
}
