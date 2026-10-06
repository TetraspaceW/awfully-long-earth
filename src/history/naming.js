// Names for provinces, states and peoples created by the generator.

import { Rng, hashN } from '../core/rng.js';
import { randomPhon, mutatePhon, placeName, adjective, word, shortWord } from '../lang/names.js';

// Provinces off Terra are named from a phonology of their sheet; names are
// cached on the region (a sheet is a pure function of the seed, so a rebuilt
// sheet gets the same names).
const sheetPhon = new Map();
export function regionName(world, geo, r) {
  const reg = geo.regions[r];
  if (!reg) return '?';
  if (reg.name) return reg.name;
  const k = `${geo.x},${geo.y}`;
  let p = sheetPhon.get(k);
  if (!p || p.seed !== world.seed) {
    p = { seed: world.seed, phon: randomPhon(new Rng(hashN(world.seed, 'tilephon', geo.x, geo.y))) };
    sheetPhon.set(k, p);
  }
  reg.name = placeName(p.phon, new Rng(hashN(world.seed, 'rname', geo.x, geo.y, r)));
  return reg.name;
}

export function namePolity(world, rng, cultureId, type) {
  const c = world.cultures.get(cultureId);
  const p = c && c.phon ? c.phon : randomPhon(rng);
  const base = placeName(p, rng);
  const adj = adjective(base, p, rng);
  const title = () => shortWord(p, rng).toLowerCase();
  const forms = {
    chiefdom: [`${adj} Confederacy`, `${base} Chiefdom`],
    'city-states': [`${base} League`, `${adj} League`, `City of ${base}`],
    kingdom: [`Kingdom of ${base}`, `${adj} Kingdom`, `Kingdom of ${base}`, `Realm of ${base}`],
    empire: [`${adj} Empire`, `Empire of ${base}`],
    horde: [`${base} Horde`, `${adj} Confederacy`, `${base} ${title()}ate`],
    republic: [`${adj} Republic`, `Republic of ${base}`],
    federation: [`Federation of ${base}`, `United ${base}`],
    union: [`${adj} Union`],
    theocracy: [`Holy ${adj} Realm`, `Theocracy of ${base}`, `${base} ${title()}ate`],
    league: [`${base} League`, `${adj} League`],
  };
  return { name: rng.pick(forms[type] || forms.kingdom), adj, base };
}

export function newCulture(world, rng, { parent = 0, origin = null, home = null } = {}) {
  const par = parent ? world.cultures.get(parent) : null;
  const phon = par && par.phon ? mutatePhon(par.phon, rng) : randomPhon(rng);
  const name = adjective(word(phon, rng, 2), phon, rng);
  const hue = par ? (par.hue + rng.range(-30, 30) + 360) % 360 : rng.int(0, 359);
  return world.addCulture({ name, adj: name, phon, hue: Math.round(hue), parent, origin, home });
}

// "Republic of France", "Republic of the United Kingdom"
export const ofName = (n) => (/^(United|Czech|Dominican|Central|Democratic|Solomon|Marshall)|s$|Kingdom|Republic|Emirates/.test(n) ? `the ${n}` : n);
// the short name a state's renames are built from: "Krou", "Terra", "France"
export const coreName = (p) => p.core ?? p.base ?? p.name.replace(/^(The |Kingdom of |Republic of |Federation of )/, '');
export const familyName = (c) => (c ? c.name.replace(/ \(.*\)$/, '').replace(/ & .*$/, '') : 'Common');
