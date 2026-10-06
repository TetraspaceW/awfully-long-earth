// Population, economy and power, shared by the simulator and the UI.
// Calibrated so the model reproduces Terra's present-day population when fed
// Terra's own provinces and technology levels.

import { interpTable } from '../core/math.js';
import { regionCapacity } from '../geo/cells.js';
import { terraSheet } from '../geo/atlas.js';
import { earthTechAt } from '../terra/data/earth-history.js';

// Relative population density by technology level.
const DENS = [0.002, 0.01, 0.02, 0.035, 0.05, 0.075, 0.1, 0.2, 0.62, 0.8, 0.85, 0.9];

export function density(tech) { return interpTable(DENS, tech); }

// People per unit of habitable capacity at density 1, calibrated on Terra in 2000.
let K = 0;
export function popScale() {
  if (!K) {
    const geo = terraSheet();
    let s = 0;
    for (const r of geo.regions) {
      const t = earthTechAt(r.code, 2000, r.income);
      if (t === undefined) continue;
      s += regionCapacity(r, 2000) * density(t);
    }
    K = geo.realTotal / s;
  }
  return K;
}

export function regionPop(r, tech, Y) {
  return popScale() * regionCapacity(r, Y) * density(tech);
}

// GDP per head in present-day dollars.
export function perCapita(tech) {
  return 250 + 90 * tech + 900 * Math.exp(1.9 * (tech - 7));
}

// Military and economic weight.
export function regionPower(r, tech, Y) {
  return regionPop(r, tech, Y) * perCapita(tech) / 1000;
}

// Population and GDP of one province of a sheet. Terra in 2000 CE uses the
// real Natural Earth figures.
export function regionFigures(geo, r, tech, Y, real = geo.earth && Y === 2000) {
  const pop = real ? r.realPop : regionPop(r, tech, Y);
  return { pop, gdp: real ? r.realGdp : pop * perCapita(tech) };
}
