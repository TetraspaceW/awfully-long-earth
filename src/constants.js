// Shape of Big Earth and its timeline.
//
// Big Earth has 100x the surface area of Earth: a 10 x 10 grid of Earth-sized tiles.
// Columns wrap east-west; rows run from the north pole (row -4) to the south pole
// (row 5). Real Earth is tile (0, 0). Each tile is an equirectangular 240 x 120 grid
// of 1.5-degree cells (in Earth's own frame), so Big Earth is 2400 x 1200 cells.
//
// Time is cut into millennia: tile layer t spans years [1000t, 1000t + 1000]
// (negative = BCE). Earth's own record covers t = 0 and t = 1 (1 CE - 2000 CE);
// Big Earth's 20,000 years of earlier history are t = -20 ... -1.

export const W = 240;
export const H = 120;
export const COLS = 10;
export const ROW_MIN = -4;
export const ROW_MAX = 5;
export const WORLD_W = W * COLS;

export const SNAPS = 5;          // snapshots per tile: start, +250, +500, +750, end
export const SNAP_YEARS = 250;
export const STEP_YEARS = 50;
export const STEPS = 1000 / STEP_YEARS;
export const STEPS_PER_SNAP = SNAP_YEARS / STEP_YEARS;

export const HISTORY_START = -20000;
export const PRESENT = 2000;

export function wrapX(x) {
  return ((((x + 5) % COLS) + COLS) % COLS) - 5;
}

export function tileKey(x, y, t) { return `${wrapX(x)},${y},${t}`; }
export function posKey(x, y) { return `${wrapX(x)},${y}`; }

export function parseKey(k) {
  const [x, y, t] = k.split(',').map(Number);
  return { x, y, t };
}

export function tileStart(t) { return t * 1000; }

export function formatYear(y) {
  if (y === 0) return '1 CE';
  const a = Math.abs(Math.round(y)).toLocaleString('en-US');
  return y < 0 ? `${a} BCE` : `${a} CE`;
}

export function formatRange(t) {
  return `${formatYear(tileStart(t))} – ${formatYear(tileStart(t) + 1000)}`;
}

// Soft ceiling on technological complexity at absolute year Y. Before the modern
// breakthrough, civilisations on Big Earth climb towards this plateau and fall back,
// over and over, which is what twenty millennia of history look like.
export function techCap(Y) {
  const pts = [
    [-40000, 0.8], [-23000, 1.2], [-20000, 3.0], [-16000, 4.2], [-11000, 4.9],
    [-10000, 4.6], [-8000, 5.2], [0, 5.7], [1000, 6.1], [1500, 7.0], [1800, 8.0],
    [2000, 9.3], [3000, 10.6], [10000, 11],
  ];
  if (Y <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (Y <= pts[i][0]) {
      const [y0, v0] = pts[i - 1], [y1, v1] = pts[i];
      return v0 + ((v1 - v0) * (Y - y0)) / (y1 - y0);
    }
  }
  return pts[pts.length - 1][1];
}

// Sea level offset in elevation units (0 = today). The last glacial maximum
// exposes continental shelves (Beringia, Doggerland, Sundaland on Earth).
export function seaLevel(Y) {
  if (Y <= -19000) return -0.055;
  if (Y >= -5000) return 0;
  const f = (Y + 19000) / 14000;
  return -0.055 * (1 - f * f * (3 - 2 * f));
}

// Global temperature offset in degrees C.
export function tempOffset(Y) {
  if (Y <= -19000) return -6;
  if (Y >= -9000) return Y > 2000 ? Math.min(3, (Y - 2000) / 300) : 0;
  if (Y > -10900 && Y < -9700) return -4; // a Younger Dryas of Big Earth's own
  return -6 * (1 - (Y + 19000) / 10000);
}

export const ERAS = [
  'Paleolithic foragers', 'Neolithic villages', 'Chalcolithic chiefdoms', 'Bronze Age',
  'Iron Age', 'Classical', 'Medieval', 'Early modern', 'Industrial', 'Information age',
  'Post-industrial', 'Spacefaring',
];

export function eraName(tech) {
  return ERAS[Math.max(0, Math.min(ERAS.length - 1, Math.floor(tech)))];
}

export function isSpeculative(t) { return tileStart(t) >= PRESENT; }
