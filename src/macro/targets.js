// What history should look like at continental scale: golden and dark ages,
// how much land is under states, how unified it is.

import { techCap } from '../core/eras.js';
import { clamp } from '../core/math.js';
import { field } from './field.js';
import { effectiveYear, bias } from './drift.js';

// Golden ages and dark ages: a multiplier on the era's technology ceiling.
// Strong before the modern era, fading out after 1500 (in local effective
// years). Far from Terra the swings can be wilder.
export function development(seed, gx, gy, Y) {
  const E = effectiveYear(seed, gx, gy, Y);
  const n = 0.6 * field(seed, 'dev', gx, gy, Y, 900) + 0.4 * field(seed, 'dev2', gx, gy, Y, 350);
  const swing = Math.min(0.5, 0.3 * (1 + 0.3 * Math.abs(bias(seed, 'swing', gx, gy, Y)))) * clamp((1800 - E) / 300, 0, 1);
  return 1 - swing * (1 - n);
}

// Imperial phase in [0,1]: 1 = an age of empires, 0 = an age of many small states.
export function imperialPhase(seed, gx, gy, Y) {
  return clamp((field(seed, 'imp', gx, gy, Y, 600) - 0.2) / 0.6 + 0.25 * bias(seed, 'imp', gx, gy, Y), 0, 1);
}

// Share of state-ready land (farming societies complex enough for states)
// actually held by states, around this place.
export function targetStateShare(seed, gx, gy, Y, tech) {
  const E = effectiveYear(seed, gx, gy, Y);
  if (E >= 1950) return 1;
  const phase = imperialPhase(seed, gx, gy, Y);
  const pre = clamp((0.25 + 0.14 * (tech - 2.6)) * (1 + 0.2 * bias(seed, 'share', gx, gy, Y)), 0.1, 0.9) * (0.8 + 0.4 * phase);
  const f = clamp((E - 1800) / 150, 0, 1);
  return Math.min(1, pre * (1 - f) + f);
}

// Effective number of states expected over an Earth-sized area here (inverse
// Herfindahl over land held). `size` scales it by how much habitable land the
// area has relative to a typical one. Far from Terra, some civilisations are
// persistently unified, others splintered.
export function targetStateCount(seed, gx, gy, Y, tech, size) {
  const phase = imperialPhase(seed, gx, gy, Y);
  size *= Math.exp(-0.7 * bias(seed, 'unity', gx, gy, Y));
  let base;
  if (tech < 7.5) base = 14 * (1.6 - 1.1 * phase);           // empires come and go
  else if (tech < 9.3) base = 20 * (1.2 - 0.4 * phase);      // the nation-state era
  else base = 18 * Math.exp(-(tech - 9.3) * 1.9) * (1.2 - 0.4 * phase); // unification
  return clamp(base * Math.sqrt(size), 1, 80);
}

export function macroTech(seed, gx, gy, Y) { return techCap(effectiveYear(seed, gx, gy, Y)) * development(seed, gx, gy, Y); }
