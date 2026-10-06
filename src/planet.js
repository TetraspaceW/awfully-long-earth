// What kind of planet a sheet is. A world's point of divergence (macro.js)
// decides how much of the sky and the planet itself can differ from Terra's.
//
// Within about 50 million years, the Solar System runs as it did for Terra:
// its orbits are chaotic, but not that chaotic. Past ASTRO_ERA they can't be
// traced back, so a world that parted earlier can have its own axial tilt,
// length of day and year, and a slightly nearer or further orbit, spreading
// out fully by ten times that. The chaos can also be violent: the further back
// a world parted, the likelier that since then Earth was thrown onto a much
// nearer or further orbit, or lost altogether, in a collision or flung out of
// the Solar System, leaving a Gap. Past MOON_FORMED (the giant impact that made the
// Moon), it may have no Moon, two, or a bigger one; without a Moon to steady
// it, its axis wanders anywhere. Past EARTH_FORMED, Earth itself was still
// being assembled from planetesimals, and by SUN_FORMED there was nothing yet,
// so the planet can come out quite different: an ocean world, a small, cold,
// airless Mars, or nothing at all, just a belt of asteroids where Earth should
// be (the Gap). Before the Sun formed, it can circle a different star.
//
// A sheet is one world, so its planet is drawn once per sheet. Divergence is
// smooth, so neighbouring worlds pass the thresholds together.

import { isTerra } from './core/frame.js';
import { clamp, fade } from './core/util.js';
import { divergence, u01 } from './macro.js';

export const ASTRO_ERA = 5e7;       // orbits can no longer be traced back
export const MOON_FORMED = 4.51e9;  // the giant impact
export const EARTH_FORMED = 4.54e9; // Earth assembled from planetesimals
export const SUN_FORMED = 4.57e9;   // the Solar System's collapse

/**
 * @typedef {object} Planet
 * @property {'earth'|'ocean'|'small'|'gap'} kind
 * @property {'one'|'none'|'two'|'big'} moon
 * @property {number} tilt     axial tilt, degrees
 * @property {number} day      hours
 * @property {number} year     days
 * @property {number} dT       mean warming from its orbit, deg C
 * @property {'sun'|'orange'|'white'} star
 * @property {boolean} differs  whether its astronomy can differ from Terra's at all
 * @property {''|'lost'|'inward'|'outward'} upheaval  how the Solar System's chaos threw Earth off course, if it did
 * @property {number} pod      its point of divergence, years
 */

/** @type {Planet} */
export const TERRA_PLANET = Object.freeze({ kind: 'earth', moon: 'one', tilt: 23.4, day: 24, year: 365.25, dT: 0, star: 'sun', differs: false, upheaval: '', pod: 0 });

// 0 at a, 1 at b, smooth in log years between
const logRamp = (p, a, b) => fade(clamp(Math.log(p / a) / Math.log(b / a), 0, 1));

// Ways a planet assembled from scratch can come out, with their odds.
// Since a world parted from Terra, odds that the Solar System's chaos threw
// Earth off course, growing from nothing at ASTRO_ERA; and what became of it.
const UPHEAVAL_P = 0.2;
const UPHEAVALS = [['lost', 0.3], ['inward', 0.35], ['outward', 0.35]];
const KINDS = [['gap', 0.15], ['small', 0.15], ['ocean', 0.2], ['earth', 0.5]];
const MOONS = [['none', 0.35], ['two', 0.15], ['big', 0.1], ['one', 0.4]];
const STARS = [['orange', 0.25], ['white', 0.15], ['sun', 0.6]];
const pick = (table, u) => {
  for (const [v, p] of table) { if (u < p) return v; u -= p; }
  return table[table.length - 1][0];
};

const memo = new Map();
/** The planet of sheet (x, y). @returns {Planet} */
export function planetAt(seed, x, y) {
  if (isTerra(x, y)) return TERRA_PLANET;
  const key = `${seed}|${x}|${y}`;
  let p = memo.get(key);
  if (p) return p;
  const pod = divergence(seed, x + 0.5, y + 0.5, 2000);
  if (pod < ASTRO_ERA) p = { ...TERRA_PLANET, pod };
  else {
    const u = (t) => u01(seed, 'planet', x, y, t);
    const s = logRamp(pod, ASTRO_ERA, 10 * ASTRO_ERA);   // how far orbits have wandered
    let kind = u('formed') < logRamp(pod, EARTH_FORMED, SUN_FORMED) ? pick(KINDS, u('kind')) : 'earth';
    let upheaval = kind !== 'gap' && u('upheaval?') < UPHEAVAL_P * logRamp(pod, ASTRO_ERA, MOON_FORMED) ? pick(UPHEAVALS, u('upheaval')) : '';
    if (upheaval === 'lost') kind = 'gap';
    if (kind === 'small' && upheaval) upheaval = '';   // airless either way
    const moon = kind === 'gap' ? 'none' : u('moon?') < logRamp(pod, MOON_FORMED, EARTH_FORMED) ? pick(MOONS, u('moon')) : 'one';
    const star = u('star?') < logRamp(pod, SUN_FORMED, 1.05 * SUN_FORMED) ? pick(STARS, u('star')) : 'sun';
    const sym = (t) => 2 * u(t) - 1;
    // the Moon steadies Earth's axis; without one it can lie anywhere
    const tilt = moon === 'none' ? 85 * u('tilt') ** 1.2 : 23.4 + s * (moon === 'big' ? 6 : 12) * sym('tilt');
    // tides brake the spin: no Moon, a fast day; a big one, a slow day
    const day = { none: 7 + 9 * u('day'), two: 18 + 12 * u('day'), big: 30 + 20 * u('day'), one: 24 + s * 7 * sym('day') }[moon];
    // pushed inwards, from a hothouse to past the runaway greenhouse; outwards, into deep ice
    const thrown = { inward: 30 + 120 * u('thrown'), outward: -(25 + 45 * u('thrown')) }[upheaval] || 0;
    const dT = s * 5 * sym('orbit') + thrown;
    // Kepler: warmth goes as the inverse square root of the orbit's size, the year as its 3/2 power
    const orbit = (288 / (288 + dT)) ** 2;
    const year = orbit ** 1.5 * { sun: 365.25, orange: 180 + 120 * u('year'), white: 450 + 250 * u('year') }[star];
    p = { kind, moon, tilt, day, year, dT, star, differs: true, upheaval, pod };
  }
  if (memo.size > 20000) memo.clear();
  memo.set(key, p);
  return p;
}

// Whether anything could live on it at all.
export const habitable = (p) => p.kind === 'earth' || p.kind === 'ocean';

export const PLANET_KINDS = {
  earth: 'An Earth',
  ocean: 'An ocean world',
  small: 'A small, airless world',
  gap: 'The Gap',
};
const MOON_NAMES = { one: 'a Moon like Terra\'s', none: 'no Moon', two: 'two moons', big: 'a Moon far bigger than Terra\'s' };
const STAR_NAMES = { sun: 'a Sun like Terra\'s', orange: 'a dim orange dwarf', white: 'a hot white star' };

// A sentence or two on what is different about this world's planet and sky,
// or null if nothing is.
export function planetNote(p) {
  if (!p.differs) return null;
  if (p.kind === 'gap') {
    const how = p.upheaval === 'lost'
      ? 'Earth is gone here. Some time since this world parted from Terra, the Solar System\'s chaos threw it into a collision or out into interstellar space, and only a belt of debris is left'
      : 'no Earth formed here. Where it should be there is only a belt of asteroids,';
    return `The Gap: ${how} circling ${STAR_NAMES[p.star]}. Open space, and nothing lives here.`;
  }
  const lead = {
    earth: '',
    ocean: 'An ocean world: Earth came together with far more water here, and only a few islands stand above sea level. ',
    small: 'A small world: Earth never grew to full size here. Like Mars, it had too little gravity to keep its air or its seas, and it is frozen, dry and lifeless. ',
  }[p.kind];
  const facts = [];
  if (p.star !== 'sun') facts.push(STAR_NAMES[p.star]);
  if (p.moon !== 'one') facts.push(MOON_NAMES[p.moon]);
  const day = Math.round(p.day);
  facts.push(`${/^(8|11|18)$/.test(String(day)) ? 'an' : 'a'} ${day}-hour day`, `a ${Math.round(p.year)}-day year`, `an axis tilted ${Math.round(p.tilt)}°`);
  const deg = `${Math.abs(Math.round(p.dT))} °C ${p.dT > 0 ? 'warmer' : 'colder'}`;
  const orbit = p.upheaval
    ? ` The Solar System's chaos threw it onto a ${p.upheaval === 'inward' ? 'nearer' : 'further'} orbit than Terra's, ${deg}.`
    : Math.abs(p.dT) >= 1 ? ` Its orbit runs a little ${p.dT > 0 ? 'nearer' : 'further out'} than Terra's, ${deg}.` : '';
  return `${lead}Its sky is its own: ${facts.join(', ')}.${orbit}`;
}
