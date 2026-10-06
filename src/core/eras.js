// Technology: the era ceiling and the names of technology levels.

import { piecewise } from './math.js';

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
