// The frame of Big Earth in space and time: the cell grid inside a sheet, sheet
// coordinates, the millennium timeline and the technology eras.

import { piecewise } from './util.js';

// The cell grid inside one sheet: an equirectangular W x H raster of 1.5-degree
// cells (in Earth's own frame). Cell k = j * W + i.

export const W = 240;
export const H = 120;
export const CELLS = W * H;

// 4-neighbourhood offsets
export const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export const cellI = (k) => k % W;
export const cellJ = (k) => (k / W) | 0;
export const inGrid = (i, j) => i >= 0 && j >= 0 && i < W && j < H;

// Longitude / latitude of a cell centre in a sheet's own Earth-like frame.
export const lonOf = (i) => -180 + (i + 0.5) * (360 / W);
export const latOf = (j) => 90 - (j + 0.5) * (180 / H);

// Where things are on Big Earth.
//
// Big Earth is an endless plane of Earth-sized sheets, with no wrap and no poles.
// Real Earth (Terra) is sheet (0, 0). Three coordinate systems are used:
//   sheet      integer (x, y); y grows southwards
//   sheet units continuous (gx, gy): sheet (x, y) covers gx in [x, x+1), gy in [y, y+1)
//   global cells continuous (X, Y) in cells, used by terrain noise


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

// Big Earth's timeline.
//
// Big Earth is shown at one moment, the PRESENT (2000 CE). Each sheet's present
// is reached by simulating its backstory millennium, the tile layer
// PRESENT_LAYER: tile layer t spans years [1000t, 1000t + 1000]. Terra's own
// record also covers layer 0 (1 CE - 1000 CE). A tile is stored as SNAPS
// snapshots, SNAP_YEARS apart, and simulated in STEP_YEARS steps.
//
// Other eras appear only through the macro layer: a sheet can run ahead of or
// behind Terra's timeline (macro.js, eraShift).

export const TILE_YEARS = 1000;
export const SNAPS = 5;          // snapshots per tile: start, +250, +500, +750, end
export const SNAP_YEARS = 250;
export const STEP_YEARS = 50;
export const STEPS = TILE_YEARS / STEP_YEARS;
export const STEPS_PER_SNAP = SNAP_YEARS / STEP_YEARS;

export const PRESENT = 2000;
export const PRESENT_LAYER = 1;

export function tileStart(t) { return t * TILE_YEARS; }
// year of snapshot k of layer t
export function snapYear(t, k) { return tileStart(t) + k * SNAP_YEARS; }

export function formatYear(y) {
  if (y === 0) return '1 CE';
  const a = Math.abs(Math.round(y)).toLocaleString('en-US');
  return y < 0 ? `${a} BCE` : `${a} CE`;
}

// Technology: the era ceiling and the names of technology levels.


// Soft ceiling on technological complexity at absolute year Y. Before the modern
// breakthrough, civilisations on Big Earth climb towards this plateau and fall back,
// over and over, which is what twenty millennia of history look like.
const TECH_CAP = [
  [-40000, 0.8], [-23000, 1.2], [-20000, 3.0], [-16000, 4.2], [-11000, 4.9],
  [-10000, 4.6], [-8000, 5.2], [0, 5.7], [1000, 6.1], [1500, 7.0], [1800, 8.0],
  [2000, 9.3], [3000, 10.6], [10000, 11],
];
export function techCap(Y) { return piecewise(TECH_CAP, Y); }

export const MAX_TECH = 12;

export const ERAS = [
  'Paleolithic foragers', 'Neolithic villages', 'Chalcolithic chiefdoms', 'Bronze Age',
  'Iron Age', 'Classical', 'Medieval', 'Early modern', 'Industrial', 'Information age',
  'Post-industrial', 'Spacefaring',
];

export function eraIndex(tech) { return Math.max(0, Math.min(ERAS.length - 1, Math.floor(tech))); }
export function eraName(tech) { return ERAS[eraIndex(tech)]; }
