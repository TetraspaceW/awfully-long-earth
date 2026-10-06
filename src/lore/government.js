// How states are governed and what their technology lets them do, as prose.

const pick = (rng, l) => l[Math.floor(rng.next() * l.length)];

export const TECH_LIFE = [
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
export function typeAt(p, name, Y) {
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

export function government(p, type, tech, title, capital, worlds, rng) {
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

// Display labels for state types.
export const TYPE_LABEL = {
  chiefdom: 'Chiefdom', 'city-states': 'City league', kingdom: 'Kingdom', empire: 'Empire', horde: 'Nomadic confederation',
  republic: 'Republic', federation: 'Federation', union: 'Union', theocracy: 'Theocracy', league: 'League',
  'interworld federation': 'Interworld federation',
};
