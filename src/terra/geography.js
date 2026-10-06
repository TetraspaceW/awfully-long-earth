// Terra's physical geography: Natural Earth country outlines, rasterised to the
// sheet grid, with hand-placed relief and climate, and its provinces (modern
// countries, the big ones split so history has something to hold onto).
//
// Terra's geography does not depend on the world seed.

import { W, H, CELLS, lonOf, latOf } from '../core/grid.js';
import { EARTH_GEO } from './data/earth-geo.js';
import { bfsDistance, growInto } from '../geo/grid-algos.js';
import { regionCapacity } from '../geo/cells.js';

function decodeRle(rle) {
  const out = new Int16Array(CELLS);
  let p = 0;
  for (const tok of rle.split(',')) {
    if (!tok) continue;
    const [a, b] = tok.split('*');
    const v = a === '.' ? -1 : parseInt(a, 36);
    const n = parseInt(b, 36);
    out.fill(v, p, p + n);
    p += n;
  }
  return out;
}

// Provinces: boxes are [code, lonMin, lonMax, latMin, latMax]; the first match
// wins, otherwise the country's own code is used.
const SPLITS = {
  RUS: [['RUS-FE', 120, 180, -90, 90], ['RUS-FE', -180, 0, -90, 90], ['RUS-CS', 90, 120, -90, 90],
    ['RUS-WS', 60, 90, -90, 90], ['RUS-S', 0, 60, -90, 52], ['RUS-V', 44, 60, 52, 90], ['RUS-NW', -180, 180, -90, 90]],
  CAN: [['CAN-N', -180, 0, 60, 90], ['CAN-W', -180, -110, -90, 90], ['CAN-C', -110, -85, -90, 90], ['CAN-E', -180, 180, -90, 90]],
  USA: [['USA-HI', -180, -150, -90, 25], ['USA-AK', -180, -130, 50, 90], ['USA-W', -180, -104, -90, 90],
    ['USA-C', -104, -90, -90, 90], ['USA-SE', -90, 0, -90, 37], ['USA-NE', -180, 180, -90, 90]],
  MEX: [['MEX-Y', -94.5, 0, -90, 90], ['MEX-N', -180, 180, 22, 90], ['MEX-C', -180, 180, -90, 90]],
  BRA: [['BRA-N', -180, 180, -8, 90], ['BRA-SE', -50, 0, -90, 90], ['BRA-SE', -180, 180, -90, -22], ['BRA-W', -180, 180, -90, 90]],
  ARG: [['ARG-S', -180, 180, -90, -39], ['ARG-N', -180, 180, -90, 90]],
  CHN: [['CHN-XJ', -180, 93, 35, 90], ['CHN-TB', -180, 101, -90, 36.5], ['CHN-NE', 118, 180, 40, 90],
    ['CHN-NE', 115, 180, 43, 90], ['CHN-IM', 97, 118, 41.5, 90], ['CHN-IM', 97, 106, 36.5, 90],
    ['CHN-N', -180, 180, 32, 90], ['CHN-SW', -180, 110, -90, 90], ['CHN-S', -180, 180, -90, 90]],
  IND: [['IND-S', -180, 180, -90, 21.5], ['IND-E', 83, 180, -90, 90], ['IND-N', -180, 180, -90, 90]],
  AUS: [['AUS-W', -180, 129, -90, 90], ['AUS-E', 141, 180, -90, 90], ['AUS-C', -180, 180, -90, 90]],
  IDN: [['IDN-W', -180, 106, -90, 90], ['IDN-JV', -180, 116, -90, -5.5], ['IDN-K', 108.5, 119, -4.3, 8],
    ['IDN-E', -180, 180, -90, 90]],
  KAZ: [['KAZ-W', -180, 63, -90, 90], ['KAZ-E', -180, 180, -90, 90]],
  FRA: [['FRA-GF', -180, 0, -90, 20], ['FRA', -180, 180, -90, 90]],
};

// Hand-placed climate and relief, since Terra has no noise to lean on.
const EARTH_DESERTS = [[-17, 33, 15, 32], [35, 60, 13, 32], [52, 64, 27, 35], [69, 75, 24, 30],
  [75, 115, 37, 46], [55, 66, 38, 46], [12, 25, -28, -18], [116, 145, -32, -19], [-75, -68, -30, -15],
  [-120, -103, 29, 40], [-72, -64, -50, -40]];
const EARTH_RIVERS = [[30, 33, 22, 31.5], [42, 48.5, 30, 36], [67, 73, 24, 31], [72, 90, 24, 30],
  [105, 122, 28, 40], [100, 107, 9, 17], [-91, -89, 29, 38], [3, 7, 11, 15]];
const EARTH_MOUNTAINS = [[73, 104, 27, 38, 0.4], [-79, -64, -40, 6, 0.32], [-125, -104, 32, 60, 0.22],
  [5, 16, 44, 48, 0.25], [38, 49, 40, 44, 0.25], [45, 62, 27, 38, 0.18], [35, 42, 6, 15, 0.25],
  [70, 95, 40, 50, 0.22], [30, 44, 37, 41, 0.12]];
const inBox = (b, lon, lat) => lon >= b[0] && lon <= b[1] && lat >= b[2] && lat <= b[3];

// Terra's base rasters: country grid, land mask, elevation and moisture overrides
// (-1 = none; 2 marks a fertile river valley).
let terraBase = null;
export function terraTerrain() {
  if (terraBase) return terraBase;
  const cgrid = decodeRle(EARTH_GEO.rle);
  const land = new Uint8Array(CELLS);
  for (let k = 0; k < CELLS; k++) land[k] = cgrid[k] >= 0 ? 1 : 0;
  const dist = bfsDistance(land);
  const elev = new Float32Array(CELLS);
  const moistOverride = new Float32Array(CELLS).fill(-1);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, lon = lonOf(i), lat = latOf(j);
    if (land[k]) {
      let e = 0.04 + 0.012 * Math.min(dist[k], 20);
      for (const m of EARTH_MOUNTAINS) if (inBox(m, lon, lat)) e += m[4];
      if (cgrid[k] >= 0 && EARTH_GEO.countries[cgrid[k]].a3 === 'ATA') e += 0.2;
      elev[k] = e;
      for (const d of EARTH_DESERTS) if (inBox(d, lon, lat)) moistOverride[k] = 0.1;
      for (const r of EARTH_RIVERS) if (inBox(r, lon, lat)) moistOverride[k] = 2; // marker: fertile valley
    } else {
      const d = dist[k];
      elev[k] = d <= 1 ? -0.03 : d === 2 ? -0.07 : -0.12 - 0.01 * Math.min(d, 30);
    }
  }
  terraBase = { cgrid, land, elev, moistOverride };
  return terraBase;
}

function splitCode(a3, lon, lat) {
  const s = SPLITS[a3];
  if (!s) return a3;
  for (const [code, a, b, c, d] of s) if (lon >= a && lon <= b && lat >= c && lat <= d) return code;
  return a3;
}

// Fill `region` (cell -> province) and `regions` with Terra's provinces.
export function terraProvinces(region, regions, everLand) {
  const E = terraTerrain();
  const codes = new Map();
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    const c = E.cgrid[k];
    if (c < 0) continue;
    const a3 = EARTH_GEO.countries[c].a3;
    const code = splitCode(a3, lonOf(i), latOf(j));
    if (!codes.has(code)) {
      codes.set(code, regions.length);
      regions.push({ id: regions.length, code, country: a3 });
    }
    region[k] = codes.get(code);
  }
  // continental shelves exposed in glacial times join the nearest province
  growInto(region, (k) => everLand(k));
}

// ------------------------------------------------------------ names & figures

export function countryOf(code) {
  return EARTH_GEO.countries.find((c) => c.a3 === code.split('-')[0]);
}

const GEO_NAMES = {
  'USA-W': 'the American West', 'USA-C': 'the Great Plains', 'USA-NE': 'the Great Lakes and Northeast',
  'USA-SE': 'the American Southeast', 'USA-AK': 'Alaska', 'USA-HI': 'Hawaii', 'CAN-W': 'Western Canada',
  'CAN-C': 'the Canadian Prairies', 'CAN-E': 'Eastern Canada', 'CAN-N': 'the Canadian Arctic',
  'RUS-NW': 'European Russia', 'RUS-V': 'the Volga–Urals', 'RUS-S': 'the Pontic–Caspian steppe',
  'RUS-WS': 'West Siberia', 'RUS-CS': 'Central Siberia', 'RUS-FE': 'the Russian Far East',
  'CHN-N': 'the North China Plain', 'CHN-S': 'South China', 'CHN-SW': 'Sichuan and Yunnan',
  'CHN-NE': 'Manchuria', 'CHN-IM': 'Inner Mongolia', 'CHN-XJ': 'the Tarim Basin', 'CHN-TB': 'Tibet',
  'IND-N': 'the Indo-Gangetic Plain', 'IND-E': 'Eastern India', 'IND-S': 'the Deccan',
  'MEX-N': 'Northern Mexico', 'MEX-C': 'the Valley of Mexico', 'MEX-Y': 'Yucatán',
  'BRA-N': 'Amazonia', 'BRA-SE': 'Southeast Brazil', 'BRA-W': 'the Brazilian interior',
  'ARG-N': 'the Pampas', 'ARG-S': 'Patagonia', 'AUS-W': 'Western Australia', 'AUS-C': 'Central Australia',
  'AUS-E': 'Eastern Australia', 'IDN-W': 'Sumatra', 'IDN-JV': 'Java', 'IDN-K': 'Borneo',
  'IDN-E': 'Sulawesi and the Moluccas', 'KAZ-W': 'the Caspian steppe', 'KAZ-E': 'the Kazakh steppe',
  'FRA-GF': 'French Guiana', USA: 'the United States',
};

export function fullName(n) {
  if (n === 'Dem. Rep. Congo') return 'DR Congo';
  return n.replace('Herz.', 'Herzegovina').replace(/\bRep\./, 'Republic').replace(/\bIs\./, 'Islands')
    .replace(/\bEq\./, 'Equatorial').replace(/\bDem\./, 'Democratic').replace(/^S\. /, 'South ').replace(/^N\. /, 'North ')
    .replace(/^W\. /, 'Western ').replace(/^Fr\. /, 'French ').replace(/^Central African Rep$/, 'Central African Republic');
}

export function terraRegionName(r) {
  if (GEO_NAMES[r.code]) return GEO_NAMES[r.code];
  const c = countryOf(r.country || r.code);
  const part = { NW: 'European', V: 'Volga–Urals', S: 'South', WS: 'West Siberia', CS: 'Central Siberia',
    FE: 'Far East', N: 'North', W: 'West', C: 'Centre', E: 'East', NE: 'Northeast', SE: 'Southeast',
    SW: 'Southwest', AK: 'Alaska', HI: 'Hawaii', Y: 'Yucatán', XJ: 'Xinjiang', TB: 'Tibet', IM: 'Inner Mongolia',
    JV: 'Java', K: 'Kalimantan', GF: 'French Guiana' };
  const suf = r.code.includes('-') ? r.code.split('-')[1] : null;
  if (r.code === 'RUS-NW') return 'Russia (European)';
  if (r.code === 'IDN-W') return 'Sumatra';
  if (suf === 'GF') return 'French Guiana';
  return suf ? `${c ? fullName(c.name) : r.code} (${part[suf] || suf})` : (c ? fullName(c.name) : r.code);
}

// Real present-day population, GDP and names for Terra's provinces, shared out
// within each country by habitable capacity. Called once when Terra's sheet is built.
export function annotateTerraSheet(geo) {
  const capByCountry = new Map();
  for (const r of geo.regions) {
    const c = countryOf(r.country);
    capByCountry.set(c.a3, (capByCountry.get(c.a3) || 0) + regionCapacity(r, 2000) + 0.01 * r.cellsNow);
  }
  let realTotal = 0;
  for (const r of geo.regions) {
    const c = countryOf(r.country);
    const share = (regionCapacity(r, 2000) + 0.01 * r.cellsNow) / capByCountry.get(c.a3);
    r.realPop = c.pop * share;
    r.realGdp = c.gdp * 1e6 * share;
    r.income = c.income;
    r.name = terraRegionName(r);
    realTotal += r.realPop;
  }
  geo.realTotal = realTotal;
  geo.prepared = true;
}
