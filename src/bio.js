// A profile of one state: how it is governed, what it can do, who lives in it,
// where it came from and how it has fared, gathered from every surveyed tile.

import { formatYear, eraName } from './constants.js';
import { getGeo } from './geo.js';
import { regionPop, perCapita, tileStateAt } from './stats.js';
import { regionName } from './sim.js';
import { Rng, hashN } from './rng.js';
import { rulerName, shortWord, placeName, randomPhon } from './names.js';
import { federationWorlds, federationAt } from './macro.js';
import { cultureSpecies } from './species.js';

const pick = (rng, l) => l[Math.floor(rng.next() * l.length)];

const TECH_LIFE = [
  'Stone tools, foraging and seasonal camps.',
  'Farming villages, pottery and herds; land is worked by the household.',
  'Copper working, the plough and chiefly centres where surplus is gathered and feasted.',
  'Bronze, writing and the first cities; temples and palaces keep the accounts.',
  'Iron tools and weapons, the first coins and long caravans of trade.',
  'Paved roads, aqueducts, coinage, written law and schools of philosophy.',
  'Water mills, fortresses, universities and trade networks reaching across seas.',
  'Printing, gunpowder, ocean-going ships and the beginnings of experimental science.',
  'Railways, steam and then electricity; factories, cities and mass schooling.',
  'Computers and global networks, mass air travel, near-universal literacy.',
  'Automation, abundant clean power and long healthy lives; work is largely optional.',
  'Orbital industry, space elevators and probes sent to other stars.',
];

// Terra's states change form over their history; read it off the name they bore.
function typeAt(p, name, Y) {
  if (p.macro) return 'macro';
  if (!p.earth || Y >= 2000) return p.type;
  if (/Empire|dynasty|Caliphate|Shogunate|Khaganate|Mongol/.test(name)) return 'empire';
  if (/Horde|hordes|confederacy|Xiongnu|Sarmatian|Wusun|Kangju|Rouran|Xianbei|Uyghur|Hephthalite/i.test(name)) return 'horde';
  if (/Republic|Confederacy|States/.test(name)) return 'republic';
  if (/League|city-states|Italian states|Confederation|Commonwealth/.test(name)) return 'league';
  if (/Order|Imamate|Theocra/.test(name)) return 'theocracy';
  if (/chiefdoms/.test(name)) return 'chiefdom';
  return 'kingdom';
}

function government(p, type, tech, title, capital, worlds, rng) {
  const modern = tech >= 7.8, future = tech >= 9.6;
  switch (type) {
    case 'macro':
      return `An interworld federation reaching across ${worlds} world${worlds === 1 ? '' : 's'}. Each member keeps its own government; a federal assembly, sitting in rotation, handles trade, defence, the shared networks and disputes between worlds.`;
    case 'chiefdom':
      return pick(rng, [
        `A confederacy of chiefdoms bound by kinship, marriage and feasting. The paramount ${title} settles feuds and leads raids, but has no officials and no standing army.`,
        `A loose chiefdom: villages owe tribute and warriors to the ${title} at ${capital}, whose authority rests on generosity and success in war.`,
      ]);
    case 'city-states':
      return pick(rng, [
        `A league of walled cities, each run by a council of elders and merchant houses, sharing gods, markets and a common levy in war.`,
        `A city-state ruling its hinterland from ${capital}; assemblies of citizens choose magistrates, while most of the countryside has no vote.`,
      ]);
    case 'league':
      return `A league of allied cities and lords that elects a war-leader in times of crisis and meets in council at ${capital}.`;
    case 'horde':
      return future || modern
        ? `A confederation of clans that has kept its old council of chiefs as a constitutional senate, while an elected ${title} runs the government.`
        : `A nomadic confederation of clans under a ${title}, held together by plunder, tribute and the prestige of victory; its herds and horsemen move with the seasons.`;
    case 'theocracy':
      return future
        ? `A state governed by a synod of its faith, which sets the law; ordinary administration is left to elected councils and machine clerks.`
        : `A theocracy. Priests of the state cult hold much of the land and all of the law; the ${title} is both ruler and high priest, and rules from the temple city of ${capital}.`;
    case 'empire':
      return modern
        ? `A multinational empire held together by an imperial bureaucracy, a large army and shared markets; its provinces elect assemblies, but the ${title} keeps real power.`
        : `An imperial monarchy ruling many peoples from ${capital}. Governors run the provinces, roads and garrisons bind them, and conquered elites are brought into the court.`;
    case 'kingdom':
      if (future) return `A ceremonial monarchy: the ${title} reigns, while government is by citizens' assemblies advised by machine-run ministries.`;
      if (modern) return `A constitutional monarchy: the ${title} reigns, and an elected parliament governs from ${capital}.`;
      if (tech >= 6) return `A monarchy with a growing royal bureaucracy, salaried officials and a standing army; the great nobles still hold their own lands and courts.`;
      return pick(rng, [
        `A hereditary monarchy. The ${title} rules through a court of nobles and temple officials, taxing grain and calling up levies from great landholders.`,
        `A kingdom of lords and vassals: the ${title} holds ${capital}, and the lords hold the rest in return for service and tribute.`,
      ]);
    case 'republic':
      if (future) return `A digital republic: citizens vote continuously on proposals, and machine-assisted ministries carry out what passes. A small elected council handles emergencies.`;
      if (modern) return `A parliamentary republic with universal suffrage, an independent judiciary and a president elected for fixed terms.`;
      return `An oligarchic republic. Magistrates drawn from the great families serve fixed terms, and an assembly of property-owners approves war and taxes.`;
    case 'federation':
      return future
        ? `A federation of self-governing regions, coordinated by an elected council and a constitutional court; most decisions are made locally.`
        : `A federal republic: member states keep their own governments and laws, while the federal government in ${capital} handles defence, money and foreign affairs.`;
    case 'union':
      return `A political union of formerly independent states, with a shared parliament, currency and courts, and a rotating presidency.`;
    default:
      return `A state ruled from ${capital}.`;
  }
}

// Whether a state holds any land on a tile, at any snapshot. A cheap scan of the
// owner arrays, so only the few tiles a state touches need their geography.
function holds(h, pid) {
  for (const sn of h.snaps) if (sn.owner.includes(pid)) return true;
  return false;
}

// Every snapshot of every surveyed tile in which the state holds land.
function footprint(world, pid) {
  const byYear = new Map();
  for (const h of world.tiles.values()) {
    if (!holds(h, pid)) continue;
    const geo = getGeo(h.x, h.y);
    h.snaps.forEach((sn, k) => {
      const Y = h.t * 1000 + k * 250;
      let prov = 0, pop = 0;
      for (const r of geo.regions) {
        if (sn.owner[r.id] !== pid) continue;
        prov++;
        pop += geo.earth && Y === 2000 && h.fixed ? r.realPop : regionPop(r, sn.tech[r.id], Y);
      }
      if (!prov) return;
      const key = `${Y}|${h.x},${h.y}`;
      if (!byYear.has(Y)) byYear.set(Y, new Map());
      byYear.get(Y).set(key, { prov, pop });
    });
  }
  return [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([Y, m]) => {
    let prov = 0, pop = 0;
    for (const v of m.values()) { prov += v.prov; pop += v.pop; }
    return { Y, prov, pop, worlds: m.size };
  });
}

// State of the nation at year Y: territory, people, technology.
function present(world, pid, Y) {
  const out = { prov: 0, pop: 0, gdp: 0, techSum: 0, worlds: new Set(), cultures: new Map() };
  const seen = new Set();
  for (const h of world.tiles.values()) {
    const pos = `${h.x},${h.y}`;
    if (seen.has(pos)) continue;
    seen.add(pos);
    const st = tileStateAt(world, h.x, h.y, Y);
    if (!st || !st.snap.owner.includes(pid)) continue;
    const geo = getGeo(h.x, h.y);
    const real = geo.earth && Y === 2000 && st.hist.fixed;
    for (const r of geo.regions) {
      if (st.snap.owner[r.id] !== pid) continue;
      const tech = st.snap.tech[r.id];
      const pop = real ? r.realPop : regionPop(r, tech, Y);
      out.prov++; out.pop += pop; out.gdp += real ? r.realGdp : pop * perCapita(tech);
      out.techSum += tech * pop;
      out.worlds.add(pos);
      const c = st.snap.culture[r.id];
      if (c) out.cultures.set(c, (out.cultures.get(c) || 0) + pop);
    }
  }
  out.tech = out.pop ? out.techSum / out.pop : 0;
  return out;
}

function eventsAbout(world, p) {
  const names = [...new Set([p.name, ...(p.names || []).map(([, n]) => n)])].filter(Boolean);
  const out = [];
  const seen = new Set();
  for (const h of world.tiles.values()) {
    for (const e of h.events) {
      const hit = e.pid === p.id || names.some((n) => e.text.includes(n));
      if (!hit) continue;
      const k = `${e.y}|${e.text}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ ...e, where: world.tileName(h.x, h.y) });
    }
  }
  return out.sort((a, b) => a.y - b.y);
}

export function nationProfile(world, pid, Y) {
  const p = world.polities.get(pid);
  if (!p) return null;
  const rng = new Rng(hashN(world.seed, 'bio', pid));
  const now = present(world, pid, Y);
  const series = footprint(world, pid);
  const culture = world.cultures.get(p.culture);
  const phon = culture?.phon || randomPhon(new Rng(hashN(world.seed, 'phon', pid)));
  const title = shortWord(phon, new Rng(hashN(world.seed, 'title', pid))).toLowerCase();
  const endonym = p.earth ? null : placeName(phon, new Rng(hashN(world.seed, 'endonym', pid)));

  let capital = '—';
  if (p.capital && p.capital.r >= 0) {
    try { capital = regionName(world, getGeo(p.capital.x, p.capital.y), p.capital.r); } catch (e) { /* unsurveyed */ }
  } else if (p.macro) capital = world.tileName(p.capital.x, p.capital.y);

  let worlds = now.worlds.size;
  if (p.macro) {
    const fed = federationAt(world.seed, p.capital.x + 0.5, p.capital.y + 0.5, Y);
    if (fed && fed.key === p.key) worlds = federationWorlds(world.seed, fed, Y);
  }

  const tech = now.tech;
  const name = world.polityName(pid, Y);
  const type = typeAt(p, name, Y);
  const ruler = rulerName(phon, new Rng(hashN(world.seed, 'ruler', pid, Math.floor(Y / 35))), Y, p.type);

  const totalPop = [...now.cultures.values()].reduce((a, b) => a + b, 0) || 1;
  const peoples = [...now.cultures.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c, pop]) => {
    const cu = world.cultures.get(c);
    const par = cu && cu.parent ? world.cultures.get(cu.parent) : null;
    return { id: c, name: cu ? cu.name : '?', from: par ? par.name : null, share: pop / totalPop, ruling: c === p.culture, species: cultureSpecies(cu) };
  });

  const parent = p.parent ? world.polities.get(p.parent) : null;
  const successors = [...world.polities.values()].filter((q) => q.parent === pid).slice(0, 8);
  const events = eventsAbout(world, p);
  const first = series[0], last = series[series.length - 1];
  const peak = series.reduce((a, b) => (b.prov > (a?.prov || 0) ? b : a), null);

  // origin story
  let origin;
  const foundingEvent = events.find((e) => /founded|breaks away|rebels|throws off|wins independence|unite|merge|proclaim|secedes|begins to join/.test(e.text));
  if (p.macro) origin = `Formed as the worlds around ${capital} entered their federal age${p.founded != null ? `, around ${formatYear(p.founded)}` : ''}.`;
  else if (foundingEvent) origin = foundingEvent.text;
  else if (p.founded != null) origin = `Founded in ${formatYear(p.founded)}${parent ? ` out of ${world.polityRef(parent.id, p.founded)}` : ''}.`;
  else if (first) origin = `Already established when the record of these lands begins, in ${formatYear(first.Y)}.`;
  else origin = 'Its origins are not recorded in the surveyed sheets.';

  const alive = now.prov > 0;
  let fate = null;
  if (p.ended != null && Y >= p.ended) fate = `Ended in ${formatYear(p.ended)}.`;
  else if (!alive && last && Y > last.Y) fate = `No longer holds land in the surveyed sheets after ${formatYear(last.Y)}.`;
  else if (!alive && first && Y < first.Y) fate = `Does not yet exist here in ${formatYear(Y)}; it first appears around ${formatYear(first.Y)}.`;

  return {
    id: pid, p, name, names: p.names || [], endonym, type: type === 'macro' ? 'interworld federation' : type,
    capital, ruler, title, alive, fate,
    pop: now.pop, gdp: now.gdp, prov: now.prov, worlds, tech, era: eraName(tech),
    perHead: now.pop ? now.gdp / now.pop : 0,
    government: government(p, type, tech, title, capital, worlds, rng),
    life: TECH_LIFE[Math.max(0, Math.min(TECH_LIFE.length - 1, Math.floor(tech)))],
    peoples, rulingCulture: culture ? culture.name : null, species: speciesMix(world, now.cultures, totalPop),
    origin, parent: parent ? { id: parent.id, name: world.polityName(parent.id, p.founded ?? Y) } : null,
    successors: successors.map((q) => ({ id: q.id, name: world.polityName(q.id, q.founded ?? Y) })),
    founded: p.founded, ended: p.ended, series, peak, events,
  };
}

// Shares of each sapient species among a state's people, largest first.
function speciesMix(world, cultures, total) {
  const by = new Map();
  for (const [c, pop] of cultures) {
    const s = cultureSpecies(world.cultures.get(c));
    const a = by.get(s.name) || { ...s, share: 0 };
    a.share += pop / (total || 1);
    by.set(s.name, a);
  }
  return [...by.values()].sort((a, b) => b.share - a.share);
}
