// Terra's fixed record, 1 CE - 2000 CE: its peoples, states, borders,
// technology and events, written into a World as two fixed tiles.

import { EARTH_GEO } from './data/earth-geo.js';
import {
  EARTH_YEARS, EARTH_CULTURES, EARTH_POLITIES, EARTH_SNAPSHOTS, EARTH_EVENTS, EU_MEMBERS,
  earthCultureAt, earthTechAt,
} from './data/earth-history.js';
import { EARTH_PHON } from './data/phonologies.js';
import { countryOf, fullName } from './geo/index.js';
import { phonFromSpec } from './names.js';
import { hashStr } from './core/random.js';
import { newSnap } from './world/world.js';

const FALLBACK_CULTURE = { Africa: 'bantu', Oceania: 'austronesian', Asia: 'sinitic', Europe: 'germanic',
  'North America': 'amerind_n', 'South America': 'amazonian' };

// present-day monarchies; everything else counts as a republic today
const MONARCHIES = new Set('GBR ESP SWE NOR DNK NLD BEL LUX JPN THA SAU MAR JOR KHM OMN BRN BTN KWT QAT ARE BHR LSO SWZ MYS TON'.split(' '));

// Writes Terra's peoples, states, 1-2000 CE tiles and the EU bloc into a fresh
// world. warn(message) reports inconsistencies in the hand-authored data.
export function buildTerra(world, warn = () => {}) {
  const geo = world.geo(0, 0);
  const byCode = new Map(geo.regions.map((r) => [r.code, r]));
  const nR = geo.regions.length;

  // cultures
  for (const [key, name, hue] of EARTH_CULTURES) {
    world.addCulture({ key: `e:${key}`, name, adj: name, hue, phon: phonFromSpec(EARTH_PHON[key]), parent: 0,
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
    const s = newSnap(nR);
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

