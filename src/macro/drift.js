// Drift from Terra.
//
// Terra's record (the area of sheet 0,0 in 1-2000 CE) is the one fixed point.
// Everything else is joined to it through chains of boundary conditions, and each
// link lets history wander a little, so the further a place is from that record
// (in space and in millennia) the further its history can have drifted.
//
// The drift is a field with the same statistics everywhere, anchored at Terra:
// octaves 3 to 90 sheets across, minus their value at Terra's own area. So every
// world, not just Terra, has neighbours a few centuries off and far-off worlds
// thousands of years off; Terra only fixes where the zero is.

import { clamp } from '../core/math.js';
import { field } from './field.js';

function terraDistance(gx, gy, Y) {
  const dx = Math.max(0, -gx, gx - 1), dy = Math.max(0, -gy, gy - 1);
  const ds = Math.sqrt(dx * dx + dy * dy);
  const dt = Y < 0 ? -Y / 1000 : Y > 2000 ? (Y - 2000) / 1000 : 0;
  return { ds, dt };
}

// Variance per link: a little per sheet-width near the present (Terra's
// neighbours share its world), more per millennium along Terra's own history,
// and most for places far away in both space and time.
export function driftYears(gx, gy, Y) {
  const { ds: d0, dt } = terraDistance(gx, gy, Y);
  const ds = Math.max(0, d0 - 0.1);
  return Math.sqrt(60000 * ds ** 1.5 + 800000 * dt + 1700000 * ds * dt);
}

// one heavy-tailed smooth walk in about [-1.3, 1.3]
function walk(seed, tag, gx, gy, Y) {
  const n = 2 * (0.7 * field(seed, tag, gx, gy, Y, 4000) + 0.3 * field(seed, tag + '2', gx, gy, Y, 1500)) - 1;
  return Math.sign(n) * Math.min(1.3, 1.6 * Math.abs(n) ** 0.8);
}

// A persistent local leaning (unified or splintered, boom or bust...), growing
// with the drift from Terra.
export const bias = (seed, tag, gx, gy, Y) => Math.min(1.5, 0.35 * driftYears(gx, gy, Y) / 1000) * walk(seed, tag, gx, gy, Y);

const SHIFT_OCTAVES = [[3, 300], [10, 900], [30, 2000], [90, 4000]]; // [sheets, years]

function shiftField(seed, gx, gy, Y) {
  let s = 0;
  for (const [sc, a] of SHIFT_OCTAVES) s += a * (2 * field(seed, 'shift' + sc, gx, gy, Y, 4000, sc) - 1);
  return s;
}

// Years this place runs ahead (+) or behind (-) Terra's timeline. Away from
// Terra's own millennia the spread widens everywhere at once (so it stays the
// same from place to place), and Terra's own column wanders too.
const shiftMemo = new Map();
export function eraShift(seed, gx, gy, Y) {
  const key = `${seed}|${gx}|${gy}|${Y}`;
  let v = shiftMemo.get(key);
  if (v === undefined) {
    v = computeShift(seed, gx, gy, Y);
    if (shiftMemo.size > 200000) shiftMemo.clear();
    shiftMemo.set(key, v);
  }
  return v;
}

function computeShift(seed, gx, gy, Y) {
  const { dt } = terraDistance(gx, gy, Y);
  const tx = clamp(gx, 0, 1), ty = clamp(gy, 0, 1);
  const space = (shiftField(seed, gx, gy, Y) - shiftField(seed, tx, ty, Y)) * (1 + 0.5 * dt);
  const time = Math.sqrt(800000 * dt) * (2 * field(seed, 'shiftT', gx, gy, Y, 4000, 10) - 1) * 1.6;
  return Math.round(space + time);
}

// The year whose technology and institutions this place is living through.
// Sea level and ice follow real time.
export function effectiveYear(seed, gx, gy, Y) { return Y + eraShift(seed, gx, gy, Y); }
