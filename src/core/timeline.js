// Big Earth's timeline.
//
// Time is cut into millennia: tile layer t spans years [1000t, 1000t + 1000]
// (negative = BCE). Earth's own record covers t = 0 and t = 1 (1 CE - 2000 CE).
// Each tile is stored as SNAPS snapshots, SNAP_YEARS apart, and simulated in
// STEP_YEARS steps.

export const TILE_YEARS = 1000;
export const SNAPS = 5;          // snapshots per tile: start, +250, +500, +750, end
export const SNAP_YEARS = 250;
export const STEP_YEARS = 50;
export const STEPS = TILE_YEARS / STEP_YEARS;
export const STEPS_PER_SNAP = SNAP_YEARS / STEP_YEARS;

export const HISTORY_START = -20000;
export const PRESENT = 2000;
// tile layers the generator accepts
export const T_MIN = -60, T_MAX = 9;

export function tileStart(t) { return t * TILE_YEARS; }
export function layerOf(Y) { return Math.floor(Y / TILE_YEARS); }
// year of snapshot k of layer t
export function snapYear(t, k) { return tileStart(t) + k * SNAP_YEARS; }

export function isSpeculative(t) { return tileStart(t) >= PRESENT; }

export function formatYear(y) {
  if (y === 0) return '1 CE';
  const a = Math.abs(Math.round(y)).toLocaleString('en-US');
  return y < 0 ? `${a} BCE` : `${a} CE`;
}

export function formatRange(t) {
  return `${formatYear(tileStart(t))} – ${formatYear(tileStart(t) + TILE_YEARS)}`;
}
