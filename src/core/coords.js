// Where things are on Big Earth.
//
// Big Earth is an endless plane of Earth-sized sheets, with no wrap and no poles.
// Real Earth (Terra) is sheet (0, 0). Three coordinate systems are used:
//   sheet      integer (x, y); y grows southwards
//   sheet units continuous (gx, gy): sheet (x, y) covers gx in [x, x+1), gy in [y, y+1)
//   global cells continuous (X, Y) in cells, used by terrain noise

import { W, H } from './grid.js';

// Origin of global cell coordinates, in sheets. Global coordinates are not
// periodic; the origin only keeps Terra's surroundings identical to the old
// 10 x 10 globe's.
export const GX0 = -5;
export const GY0 = -4;
export const WORLD_W = Infinity;

export const TERRA = Object.freeze({ x: 0, y: 0 });
export const isTerra = (x, y) => x === 0 && y === 0;

export function tileKey(x, y, t) { return `${x},${y},${t}`; }
export function posKey(x, y) { return `${x},${y}`; }
export function parseKey(k) {
  const [x, y, t] = k.split(',').map(Number);
  return { x, y, t };
}
export function parsePos(k) {
  const [x, y] = k.split(',').map(Number);
  return { x, y };
}

// Compass directions between sheets. N is y - 1.
export const DIRS = { E: [1, 0], W: [-1, 0], N: [0, -1], S: [0, 1] };
export const DIR_ORDER = ['E', 'W', 'N', 'S'];
export const DIR_NAME = { E: 'east', W: 'west', N: 'north', S: 'south' };

export function neighbourPos(x, y, dir) {
  const [dx, dy] = DIRS[dir];
  return { x: x + dx, y: y + dy };
}

// Global cell coordinates of cell (i, j) of sheet (x, y).
export const globalX = (x, i) => (x - GX0) * W + i;
export const globalY = (y, j) => (y - GY0) * H + j;

// Continuous sheet units -> global cells.
export const unitsToCellsX = (gx) => (gx - GX0) * W;
export const unitsToCellsY = (gy) => (gy - GY0) * H;

// Position of a province: its centroid in continuous sheet units.
export function regionPos(x, y, reg) { return [x + (reg.cx + 0.5) / W, y + (reg.cy + 0.5) / H]; }
export function sheetCentre(x, y) { return [x + 0.5, y + 0.5]; }
