// The polity record standing for a macro-layer federation, created in the world
// on first use by any sheet.

import { Rng, hashN } from '../core/rng.js';

export function federationPolity(world, fed, Y) {
  const key = fed.key;
  let id = world.byKey(key);
  if (id && world.polities.has(id)) return id;
  const rng = new Rng(hashN(world.seed, key));
  const sx = Math.floor(fed.core.gx), sy = Math.floor(fed.core.gy);
  const core = world.tileName(sx, sy).replace(/^the /, '');
  const name = rng.pick([`${core} Concord of Worlds`, `United Worlds of ${core}`, `${core} Interworld Federation`, `Commonwealth of the ${core} Worlds`]);
  id = world.addPolity({
    key, name, adj: core, base: core, core, culture: 0, type: 'federation', macro: true,
    founded: Y, ended: null, capital: { x: sx, y: sy, r: -1 }, home: `${sx},${sy}`,
    color: [Math.round(rng.range(0, 360)), 70, 52], agg: 1,
  });
  return id;
}
