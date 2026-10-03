// Builds the fixed Earth tiles (1 CE - 2000 CE) into a World.

import { getGeo, setGeoSeed } from './geo.js';
import { EARTH_GEO } from './data/earth-geo.js';
import {
  EARTH_YEARS, EARTH_CULTURES, EARTH_POLITIES, EARTH_SNAPSHOTS, EARTH_EVENTS, EU_MEMBERS,
  earthCultureAt, earthTechAt,
} from './data/earth-history.js';
import { phonFromEarth, adjective } from './names.js';
import { regionCapacity } from './geo.js';
import { calibrate } from './stats.js';
import { hashStr } from './rng.js';
import { emptySnaps } from './world.js';

const FALLBACK_CULTURE = { Africa: 'bantu', Oceania: 'austronesian', Asia: 'sinitic', Europe: 'germanic',
  'North America': 'amerind_n', 'South America': 'amazonian' };

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

// present-day monarchies; everything else counts as a republic today
const MONARCHIES = new Set('GBR ESP SWE NOR DNK NLD BEL LUX JPN THA SAU MAR JOR KHM OMN BRN BTN KWT QAT ARE BHR LSO SWZ MYS TON'.split(' '));

export function fullName(n) {
  if (n === 'Dem. Rep. Congo') return 'DR Congo';
  return n.replace('Herz.', 'Herzegovina').replace(/\bRep\./, 'Republic').replace(/\bIs\./, 'Islands')
    .replace(/\bEq\./, 'Equatorial').replace(/\bDem\./, 'Democratic').replace(/^S\. /, 'South ').replace(/^N\. /, 'North ')
    .replace(/^W\. /, 'Western ').replace(/^Fr\. /, 'French ').replace(/^Central African Rep$/, 'Central African Republic');
}

export function earthRegionName(r) {
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
  const full = fullName;
  return suf ? `${c ? full(c.name) : r.code} (${part[suf] || suf})` : (c ? full(c.name) : r.code);
}

// Real present-day population & GDP per province, region names, and the
// population model's calibration. Needed whenever a world is built or loaded.
export function prepareEarthGeo(world) {
  setGeoSeed(world.seed);
  const geo = getGeo(0, 0);
  if (geo.prepared) return geo;

  // real present-day population & GDP per province
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
    r.name = earthRegionName(r);
    realTotal += r.realPop;
  }
  calibrate(geo, (r) => earthTechAt(r.code, 2000, r.income), realTotal);
  geo.prepared = true;
  return geo;
}

export function buildEarth(world, warn = () => {}) {
  const geo = prepareEarthGeo(world);
  const byCode = new Map(geo.regions.map((r) => [r.code, r]));
  const nR = geo.regions.length;

  // cultures
  for (const [key, name, hue] of EARTH_CULTURES) {
    world.addCulture({ key: `e:${key}`, name, adj: name, hue, phon: phonFromEarth(key), parent: 0,
      origin: null, earth: true });
  }

  // polities
  // big countries split into several provinces, and not otherwise in the record:
  // which province holds the capital, and when the present state began
  const SPLIT_CAPITAL = {
    USA: ['USA-NE', 1776], CHN: ['CHN-N', 1949], CAN: ['CAN-E', 1867], AUS: ['AUS-E', 1901], BRA: ['BRA-W', 1822],
    ARG: ['ARG-N', 1816], IND: ['IND-N', 1947], IDN: ['IDN-JV', 1945], KAZ: ['KAZ-E', 1991], MEX: ['MEX-C', 1821],
  };
  const sovName = new Map();
  for (const c of EARTH_GEO.countries) if (c.a3 === c.sov || !sovName.has(c.sov)) sovName.set(c.sov, c.name);
  const sovereigns = new Set(EARTH_GEO.countries.map((c) => c.sov));
  for (const sov of sovereigns) {
    if (sov === 'ATA') continue;
    const def = EARTH_POLITIES[`c:${sov}`];
    const name = fullName(sovName.get(sov) || sov);
    const split = SPLIT_CAPITAL[sov];
    const capCode = def ? def[5] : split ? split[0] : [...byCode.keys()].find((k) => k.split('-')[0] === sov);
    const capRegion = byCode.get(capCode) || geo.regions.find((r) => countryOf(r.country)?.sov === sov);
    world.addPolity({
      key: `c:${sov}`, name, adj: name, culture: world.byKey(`e:${def ? def[1] : modernCultureOf(sov, byCode)}`) || 0,
      type: MONARCHIES.has(sov) ? 'kingdom' : 'republic', founded: def ? def[3] : split && !def ? split[1] : null, ended: null,
      capital: { x: 0, y: 0, r: capRegion ? capRegion.id : 0 }, home: '0,0', earth: true,
      color: colorFor(`c:${sov}`), agg: 1,
    });
  }
  for (const [key, def] of Object.entries(EARTH_POLITIES)) {
    if (key.startsWith('c:')) continue;
    const [name, culture, type, founded, ended, cap] = def;
    const r = byCode.get(cap);
    if (!r) warn(`polity ${key}: unknown capital ${cap}`);
    world.addPolity({
      key: `e:${key}`, name, adj: name, culture: world.byKey(`e:${culture}`) || 0, type, founded, ended,
      capital: { x: 0, y: 0, r: r ? r.id : 0 }, home: '0,0', earth: true, color: colorFor(key), agg: 1,
    });
  }

  // snapshots
  const snaps = {};
  for (const Y of EARTH_YEARS) {
    const s = { owner: new Int32Array(nR), culture: new Int32Array(nR), tech: new Float32Array(nR) };
    for (const r of geo.regions) {
      let ck = earthCultureAt(r.code, Y);
      if (ck === undefined) {
        warn(`no culture for ${r.code}`);
        ck = FALLBACK_CULTURE[countryOf(r.country)?.continent] || null;
      }
      s.culture[r.id] = ck ? world.byKey(`e:${ck}`) : 0;
      let tech = earthTechAt(r.code, Y, r.income);
      if (tech === undefined) {
        if (ck) warn(`no tech for ${r.code} at ${Y}`);
        tech = ck ? 2 : 0;
      }
      s.tech[r.id] = tech;
    }
    if (Y === 2000) {
      for (const r of geo.regions) {
        const sov = countryOf(r.country).sov;
        s.owner[r.id] = sov === 'ATA' ? 0 : world.byKey(`c:${sov}`);
      }
    } else {
      for (const entry of EARTH_SNAPSHOTS[Y].split(';')) {
        const m = entry.trim().match(/^([^:=]+?(?::[A-Z]{3})?)(?:=([^:]+))?:\s*(.*)$/s);
        if (!m) { if (entry.trim()) warn(`bad snapshot entry ${entry}`); continue; }
        const [, rawKey, alias, list] = m;
        const key = rawKey.startsWith('c:') ? rawKey : `e:${rawKey}`;
        const pid = world.byKey(key);
        if (!pid) { warn(`unknown polity ${rawKey} at ${Y}`); continue; }
        const p = world.polities.get(pid);
        const shown = alias ? alias.trim() : (key.startsWith('c:') ? null : p.name);
        if (shown) {
          p.names = p.names || [];
          const last = p.names[p.names.length - 1];
          if (!last || last[1] !== shown) p.names.push([Y, shown]);
        }
        for (const code of list.split(/\s+/).filter(Boolean)) {
          const r = byCode.get(code);
          if (!r) { warn(`unknown province ${code} at ${Y}`); continue; }
          s.owner[r.id] = pid;
        }
      }
    }
    snaps[Y] = s;
  }
  // modern countries keep their modern name from 2000 on
  for (const p of world.polities.values()) {
    if (p.key?.startsWith('c:') && p.names) p.names.push([2000, p.name]);
  }

  const evs = (lo, hi) => EARTH_EVENTS.filter(([y]) => y >= lo && y < hi)
    .map(([y, text]) => ({ y, kind: 'earth', text }));
  world.setTile({ x: 0, y: 0, t: 0, fixed: true, snaps: [0, 250, 500, 750, 1000].map((Y) => snaps[Y]),
    events: evs(0, 1000) });
  world.setTile({ x: 0, y: 0, t: 1, fixed: true, snaps: [1000, 1250, 1500, 1750, 2000].map((Y) => snaps[Y]),
    events: evs(1000, 2001) });

  world.blocs.push({ id: world.id(), name: 'European Union', from: 1993, to: null, home: '0,0',
    members: EU_MEMBERS.split(' ').map((a) => world.byKey(`c:${a}`)).filter(Boolean) });
  return world;
}

function modernCultureOf(sov, byCode) {
  for (const [code] of byCode) {
    if (code.split('-')[0] === sov) {
      const c = earthCultureAt(code, 2000);
      if (c) return c;
    }
  }
  return 'germanic';
}

function colorFor(key) {
  const h = hashStr(key);
  return [h % 360, 45 + ((h >>> 9) % 30), 45 + ((h >>> 17) % 20)];
}

export { emptySnaps };
