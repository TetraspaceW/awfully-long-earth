// The Atlas: every sheet's geography for one world seed, built on demand and
// cached. Geography is a pure function of (seed, x, y), so evicted sheets are
// simply rebuilt. Terra's sheet does not depend on the seed and is shared.

import { LRU } from '../core/lru.js';
import { isTerra, posKey } from '../core/coords.js';
import { buildSheet } from './sheet.js';
import { climateAt } from './climate.js';

let terra = null;
/** Terra's sheet (the same for every seed). */
export function terraSheet() {
  if (!terra) terra = buildSheet(0, 0, 0);
  return terra;
}

export class Atlas {
  /**
   * @param {number} seed  world seed
   * @param {{capacity?: number}} [opts]  how many sheets to keep in memory (each is roughly 0.5 MB)
   */
  constructor(seed, { capacity = 512 } = {}) {
    this.seed = seed;
    this.cache = new LRU(capacity);
  }

  /** @returns {import('./sheet.js').Sheet} */
  sheet(x, y) {
    if (isTerra(x, y)) return terraSheet();
    const k = posKey(x, y);
    let g = this.cache.get(k);
    if (!g) g = this.cache.set(k, buildSheet(this.seed, x, y));
    return g;
  }

  /** Mean warming (deg C) against Terra at a continuous position in sheet units. */
  climateAt(gx, gy) { return climateAt(this.seed, gx, gy); }

  // One atlas per seed, shared by every World with that seed.
  static for(seed) {
    let a = shared.get(seed);
    if (!a) {
      if (shared.size >= 4) shared.delete(shared.keys().next().value);
      a = new Atlas(seed);
      shared.set(seed, a);
    }
    return a;
  }
}
const shared = new Map();
