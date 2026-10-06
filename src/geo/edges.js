// Links between the provinces of neighbouring sheets.

import { W, H } from '../core/grid.js';
import { MIN_SEA } from './paleoclimate.js';

// Pairs [ourRegion, theirRegion] of regions touching across the shared edge.
// dir: 'E' (x+1), 'W' (x-1), 'N' (y-1), 'S' (y+1).
export function edgeLinks(a, b, dir) {
  const pairs = new Map();
  const add = (ka, kb) => {
    const ra = a.region[ka], rb = b.region[kb];
    if (ra < 0 || rb < 0) return;
    if (a.elev[ka] < MIN_SEA || b.elev[kb] < MIN_SEA) return;
    pairs.set(`${ra},${rb}`, [ra, rb]);
  };
  if (dir === 'E') for (let j = 0; j < H; j++) add(j * W + W - 1, j * W);
  if (dir === 'W') for (let j = 0; j < H; j++) add(j * W, j * W + W - 1);
  if (dir === 'S') for (let i = 0; i < W; i++) add((H - 1) * W + i, i);
  if (dir === 'N') for (let i = 0; i < W; i++) add(i, (H - 1) * W + i);
  return [...pairs.values()];
}
