// Who the people are. A world's point of divergence decides which lineages
// could have become its sapient one. Diverge less than 300,000 years ago and
// it is still us. Earlier, other hominids. Before 2.5 million years ago, other
// branches of the tree of life entirely. Each clade is characterised by when it
// branched off from our lineage, and is possible only if it had already branched
// off when history diverged: it then existed as a line of its own, while
// anything that split from ours later (Neanderthals, for a divergence 13 million
// years ago) never came to be. The likeliest lineages branched off just before
// the divergence.
//
// A lineage, once reached, holds for a long way: it changes only when deeper
// divergence rules it out, or across regions about 1000 sheets wide.

import { hashN } from './core/random.js';
import { divergence } from './macro.js';

const u01 = (...k) => hashN(...k) / 4294967296;

// branch: years since this lineage split from ours; it is possible for any
// divergence up to that (for mammals and other kingdoms, their deepest variant).
// weight: relative likelihood among those available.
export const SPECIES = [
  {
    id: 'human', branch: 0, weight: 1, name: 'Human', plural: 'humans', sci: 'Homo sapiens', voice: 'human', hue: 210,
    blurb: 'Humans, much like Terra\'s own.',
  },
  {
    id: 'archaic', branch: 3e5, weight: 1, name: 'Archaic human', plural: 'archaic humans', sci: 'Homo heidelbergensis', voice: 'human', hue: 195,
    blurb: 'A heavier-browed sister species of Homo sapiens. Here, it was their line that left the savannas and filled the world.',
  },
  {
    id: 'neanderthal', branch: 5e5, weight: 1.2, name: 'Neanderthal', plural: 'Neanderthals', sci: 'Homo neanderthalensis', voice: 'stocky', hue: 25,
    blurb: 'Stocky, cold-adapted and strong, with large eyes and larger brains than Terra\'s humans. Their societies are built around small, tight kin groups that federate slowly.',
  },
  {
    id: 'denisovan', branch: 6e5, weight: 1, name: 'Denisovan', plural: 'Denisovans', sci: 'Homo denisova', voice: 'stocky', hue: 40,
    blurb: 'Highland hominids adapted to thin air and long winters, known on Terra only from a finger bone and a few teeth.',
  },
  {
    id: 'floresian', branch: 1e6, weight: 0.8, name: 'Floresian', plural: 'Floresians', sci: 'Homo floresiensis', voice: 'small', hue: 140,
    blurb: 'A metre tall, island-dwarfed descendants of early Homo. They build small, densely and well, and their cities look like models of other peoples\'.',
  },
  {
    id: 'erectus', branch: 1.9e6, weight: 1, name: 'Erectine', plural: 'Erectines', sci: 'Homo erectus', voice: 'stocky', hue: 60,
    blurb: 'Descendants of Homo erectus, the great walker. Their ancestors kept the same hand-axe for a million years; once they changed, they changed everything at once.',
  },
  {
    id: 'habiline', branch: 2.5e6, weight: 0.9, name: 'Habiline', plural: 'Habilines', sci: 'Homo habilis', voice: 'small', hue: 85,
    blurb: 'Long-armed and small-bodied, the "handy" hominids. They are still at home in trees, and their cities grow upwards.',
  },
  {
    id: 'mammal', branch: 1.8e8, weight: 2.5, name: 'Mammal', plural: 'mammals', sci: 'Mammalia', voice: 'mammal', hue: 330,
    blurb: '',   // filled in by mammalKind()
  },
  {
    id: 'cetacean', branch: 9e7, weight: 1.2, name: 'Cetacean', plural: 'cetaceans', sci: 'Cetacea', voice: 'cetacean', hue: 200,
    blurb: 'Dolphin people. They took to the land late and reluctantly, and rule from tidal cities and canals. Clever, playful, and, everyone else agrees, not to be trusted.',
  },
  {
    id: 'reptile', branch: 3.2e8, weight: 1, name: 'Reptilian', plural: 'reptilians', sci: 'Squamata', voice: 'reptile', hue: 100,
    blurb: 'Cold-blooded and patient. They work in the warm hours and fast through the cold ones, and their empires are measured in long, slow lifetimes.',
  },
  {
    id: 'dinosaur', branch: 3.2e8, weight: 1.2, name: 'Saurian', plural: 'saurians', sci: 'Troodontidae', voice: 'reptile', hue: 15,
    blurb: 'The asteroid missed. Upright, feathered, warm-blooded theropods, the troodontids\' heirs: homo saurians, big-eyed and quick.',
  },
  {
    id: 'avian', branch: 3.2e8, weight: 1, name: 'Avian', plural: 'avians', sci: 'Aves', voice: 'avian', hue: 50,
    blurb: 'Crow- and parrot-like birds with clever feet. Most no longer fly, but they build tall and they all remember how.',
  },
  {
    id: 'amphibian', branch: 3.52e8, weight: 0.9, name: 'Amphibian', plural: 'amphibians', sci: 'Lissamphibia', voice: 'amphibian', hue: 160,
    blurb: 'Smooth-skinned, never far from water, hatched in ponds and raised as tadpoles in nursery pools. Their cities are mostly marsh.',
  },
  {
    id: 'fish', branch: 4.35e8, weight: 0.9, name: 'Ichthyan', plural: 'ichthyans', sci: 'Actinopterygii', voice: 'fish', hue: 220,
    blurb: 'Fish that learned to walk the shallows a second time. They keep their cities half-flooded and wear water in their armour.',
  },
  {
    id: 'mollusc', branch: 6e8, weight: 1, name: 'Cephalopod', plural: 'cephalopods', sci: 'Cephalopoda', voice: 'mollusc', hue: 280,
    blurb: 'Octopus-kin, eight-armed and colour-speaking. Short-lived, so they write everything down.',
  },
  {
    id: 'arthropod', branch: 6e8, weight: 0.9, name: 'Arthropod', plural: 'arthropods', sci: 'Arthropoda', voice: 'insect', hue: 30,
    blurb: 'Armoured, many-legged and moulting, descendants of the crab-like things that crawled ashore. Big for their kind, by gills that became lungs.',
  },
  {
    id: 'insect', branch: 6e8, weight: 1, name: 'Insectoid', plural: 'insectoids', sci: 'Insecta', voice: 'insect', hue: 70,
    blurb: 'Hive-born, smell-speaking. Each city is half a family, and the line between a state and a colony is philosophy.',
  },
  {
    id: 'trichordate', branch: 6.5e8, weight: 0.8, name: 'Trichordate', plural: 'trichordates', sci: 'Trilobozoa', voice: 'trichordate', hue: 300,
    blurb: 'Whatever the Ediacaran biota were doing, it kept going. Threefold, fronded and radially odd, they think in threes.',
  },
  {
    id: 'radiate', branch: 6.8e8, weight: 0.8, name: 'Radiate', plural: 'radiates', sci: 'Cnidaria', voice: 'radiate', hue: 320,
    blurb: 'Jelly- and coral-kin: colonies that became individuals, and individuals that still bud. A person here is partly a polity.',
  },
  {
    id: 'eukaryote', branch: 2e9, weight: 0.8, name: 'Eukaryote', plural: 'eukaryotes', sci: 'Eukaryota', voice: 'fungal', hue: 120,
    blurb: '',   // filled in by eukaryoteKind()
  },
  {
    id: 'archaean', branch: 2.7e9, weight: 0.8, name: 'Archaean', plural: 'archaeans', sci: 'Archaea', voice: 'archaean', hue: 345,
    blurb: 'Another domain of life: our own ancestors\' cousins, the archaea. Born in hot springs and methane seeps, they think in slow chemical gradients and build where everyone else would boil.',
  },
  {
    id: 'prokaryote', branch: 3.8e9, weight: 0.7, name: 'Bacterial', plural: 'bacterials', sci: 'Bacteria', voice: 'prokaryote', hue: 0,
    blurb: 'Another domain of life: vast bacterial mats whose chemistry learned to think. A person is a quorum.',
  },
  {
    // a domain that branched off the prokaryotes after history parted, and so has
    // no counterpart in Terra's history; possible for any divergence from before
    // the eukaryotes, and the only life left past the last common ancestor
    id: 'novel', branch: 2e9, opensAt: 2e9, weight: 1.4, name: 'Novel domain', plural: 'novel-domain life', sci: '', voice: 'xeno', hue: 265,
    blurb: '',   // filled in by novelKind()
  },
];
export const SPECIES_BY_ID = new Map(SPECIES.map((s) => [s.id, s]));

// mammals that diverged further back are less and less like us
// the closest relatives still possible: those that had split off by the divergence
function mammalKind(pod) {
  if (pod < 1.5e7) return { name: 'Ape', plural: 'apes', sci: 'Hominidae', blurb: 'Chimpanzee-, gorilla- or orangutan-kin who came down from the trees in our place.' };
  if (pod < 3.5e7) return { name: 'Simian', plural: 'simians', sci: 'Simiiformes', blurb: 'Monkey people, tail and all: quick, social and loud.' };
  if (pod < 1.6e8) return { name: 'Placental', plural: 'placentals', sci: 'Placentalia', blurb: 'Raccoon-, elephant- or bear-kin: some other branch of the placental mammals got hands, or the use of a trunk, first.' };
  if (pod < 1.8e8) return { name: 'Marsupial', plural: 'marsupials', sci: 'Marsupialia', blurb: 'Pouched mammals, the young carried for years. Their homes are always crowded.' };
  return { name: 'Monotreme', plural: 'monotremes', sci: 'Monotremata', blurb: 'Egg-laying mammals, venom-spurred, sensing the world by electricity.' };
}
function eukaryoteKind(pod) {
  if (pod < 1.1e9) return { name: 'Mycelian', plural: 'mycelians', sci: 'Fungi', blurb: 'A different kingdom: fungal minds woven through the soil, fruiting into bodies when they need hands.' };
  if (pod < 1.5e9) return { name: 'Vegetal', plural: 'vegetals', sci: 'Plantae', blurb: 'A different kingdom: plants that learned to move, slowly and then all at once.' };
  return { name: 'Protist', plural: 'protists', sci: 'Protista', blurb: 'A different kingdom: giant amoeboid colonies that flow, merge and part.' };
}

// The species as seen at a point of divergence, with any variant filled in.
// A domain of life Terra never had: named and shaped per region (variant in [0, 1)).
const NOVEL_HEAD = ['Allo', 'Xeno', 'Crypto', 'Helio', 'Litho', 'Chromo', 'Neo', 'Plexo', 'Thalasso', 'Aero'];
const NOVEL_TAIL = ['karya', 'phyta', 'zoa', 'thrix', 'blasta', 'cyta', 'morpha', 'coela'];
function novelKind(pod, variant) {
  const v = hashN(Math.floor(variant * 4294967296), 'novel');
  const sci = NOVEL_HEAD[v % NOVEL_HEAD.length] + NOVEL_TAIL[Math.floor(v / 16) % NOVEL_TAIL.length];
  const name = /a$/.test(sci) ? `${sci}n` : `${sci}ian`;
  const separate = pod > 3.8e9;
  const origin = separate
    ? 'Life here never shared Terra\'s last universal common ancestor: it began separately, with a chemistry of its own.'
    : 'A domain of life Terra never had, branching off the prokaryotes after history parted here.';
  const forms = [
    ' And it went multicellular: tissue-built bodies, hands of a sort, and a fondness for being patted.',
    ' Multicellular, but not as Terra knows it: bodies grown as lattices, every cell a citizen.',
    ' It never quite chose between cell and colony: people assemble from swarms and disperse again at night.',
    ' Giant single cells, metres across, with organelles where we have organs.',
  ];
  const form = forms[Math.floor(v / 256) % forms.length];
  return { name, plural: `${name}s`, sci, blurb: origin + form };
}

// The species as seen at a point of divergence, with any variant filled in.
export function speciesInfo(id, pod = 0, variant = 0) {
  const s = SPECIES_BY_ID.get(id) || SPECIES[0];
  if (id === 'mammal') return { ...s, ...mammalKind(pod) };
  if (id === 'eukaryote') return { ...s, ...eukaryoteKind(pod) };
  if (id === 'novel') return { ...s, ...novelKind(pod, variant) };
  return s;
}

// Lineages possible at a point of divergence: those that had already branched
// off from ours by then. Before 2.5 million years ago only other hominids, after
// it only other branches of life. Before the eukaryotes, a novel domain of life
// can branch off the prokaryotes too, and past the last common ancestor it is
// all that is left.
// Weighted towards the closest relatives (those that branched off just before).
export function availableSpecies(pod) {
  if (pod < 3e5) return [[SPECIES[0], 1]];
  const out = [];
  for (const s of SPECIES) {
    if (s.id === 'human') continue;
    const hominid = s.branch <= 2.5e6;
    if (hominid !== pod < 2.5e6) continue;
    if (s.opensAt ? pod < s.opensAt : s.branch < pod) continue;
    out.push([s, s.weight * Math.sqrt(pod / s.branch)]);
  }
  return out;
}

// Lineages are sticky. Within a region about 1000 sheets across, every lineage
// gets a fixed random priority, weighted by its likelihood (weighted reservoir
// sampling), and the highest-priority lineage available wins. As divergence
// grows, lineages that split off too recently drop out and the next in rank takes
// over, so the odds match availableSpecies() while a lineage, once reached,
// holds until divergence rules it out or the region ends. Like the 300 sheets it takes to leave Terra's
// humans behind, it takes a long way to leave any lineage.
const REGION = 1000;
function regionId(seed, gx, gy) {
  const cx = Math.floor(gx / REGION), cy = Math.floor(gy / REGION);
  let best = Infinity, id = '';
  for (let j = cy - 1; j <= cy + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) {
    const px = (i + u01(seed, 'regionx', i, j)) * REGION, py = (j + u01(seed, 'regiony', i, j)) * REGION;
    const d = (px - gx) ** 2 + (py - gy) ** 2;
    if (d < best) { best = d; id = `${i},${j}`; }
  }
  return id;
}

// availableSpecies() weights each lineage by weight * sqrt(pod / branch); the
// pod cancels between lineages, so a fixed weight per lineage gives the same odds.
const fixedWeight = (sp) => sp.weight / Math.sqrt(sp.branch);

// Which lineage became sapient at position (gx, gy), in sheet units, and the
// divergence there (which picks a lineage's variant, such as which kind of mammal).
const memo = new Map();
export function lineageAt(seed, gx, gy) {
  const key = `${seed}|${gx}|${gy}`;
  let v = memo.get(key);
  if (v) return v;
  const pod = divergence(seed, gx, gy, 2000);
  if (pod < 3e5) v = { species: 'human', pod };
  else {
    const region = regionId(seed, gx, gy);
    let id = 'archaic', top = -1;
    for (const [sp] of availableSpecies(pod)) {
      const key = Math.pow(u01(seed, 'lineage', sp.id, region) || 1e-12, 1 / fixedWeight(sp));
      if (key > top) { top = key; id = sp.id; }
    }
    v = { species: id, pod, variant: u01(seed, 'novel', region) };
  }
  if (memo.size > 50000) memo.clear();
  memo.set(key, v);
  return v;
}
export function speciesAt(seed, gx, gy) { return lineageAt(seed, gx, gy).species; }

// The species of a people (as recorded when it arose), with its variant.
export function cultureSpecies(cu) { return speciesInfo(cu && cu.species ? cu.species : 'human', cu && cu.pod ? cu.pod : 0, cu && cu.variant ? cu.variant : 0); }

// Re-derive the species of non-human peoples in a loaded world from their home
// sheets, so worlds saved under earlier species rules follow the current ones.
// Daughter peoples take their parent's. Names keep the sounds they were made with.
export function refreshSpecies(world) {
  const done = new Map();
  const fix = (cu) => {
    if (done.has(cu.id)) return done.get(cu.id);
    done.set(cu.id, cu.species);   // guards against cycles
    const par = cu.parent ? world.cultures.get(cu.parent) : null;
    if (par && (par.species || cu.species)) {
      const sp = fix(par);
      if (sp) { cu.species = sp; cu.pod = par.pod; cu.variant = par.variant; } else { delete cu.species; delete cu.pod; delete cu.variant; }
    } else if (cu.species && typeof cu.home === 'string') {
      const [x, y] = cu.home.split(',').map(Number);
      const lin = lineageAt(world.seed, x + 0.5, y + 0.5);
      if (lin.species === 'human') { delete cu.species; delete cu.pod; delete cu.variant; } else { cu.species = lin.species; cu.pod = lin.pod; cu.variant = lin.variant; }
    }
    done.set(cu.id, cu.species);
    return cu.species;
  };
  for (const cu of world.cultures.values()) fix(cu);
}

// Where each lineage likes to live. Habitability per biome, in the order of
// geo's BIOME (ocean, ice, tundra, taiga, mountains, desert, steppe, temperate
// forest, savanna, tropical forest, river valley, hothouse swamp, scorched rock),
// on the same scale as Terra's humans (geo's HAB), plus how much a coast helps.
// Ice and scorched rock stay uninhabitable for everyone, so snowball and runaway
// greenhouse worlds stay empty.
const HUMAN_HAB = [0, 0, 0.04, 0.15, 0.25, 0.04, 0.45, 1.0, 0.6, 0.55, 1.3, 0.1, 0];
export const HABITATS = {
  // generalists: Terra's own pattern
  human: { hab: HUMAN_HAB, coast: 1, inland: 1 },
  // cold-adapted: tundra, taiga and steppe; the tropics wear them down
  cold: { hab: [0, 0, 0.35, 0.65, 0.4, 0, 0.7, 1.0, 0.15, 0.05, 1.1, 0, 0], coast: 1, inland: 1 },
  // small tropical hominids: forests and savanna, little use for the cold
  tropical: { hab: [0, 0, 0, 0.04, 0.15, 0.05, 0.35, 0.7, 0.9, 1.0, 1.2, 0.3, 0], coast: 1.1, inland: 0.9 },
  // water-bound: coasts, river valleys, swamps; inland and dry country is no good
  aquatic: { hab: [0, 0, 0, 0.1, 0, 0, 0.05, 0.7, 0.2, 0.9, 1.6, 0.8, 0], coast: 1.7, inland: 0.12 },
  // amphibious: wetlands first, the coast a bonus
  amphibious: { hab: [0, 0, 0.02, 0.2, 0.05, 0.01, 0.2, 0.8, 0.35, 1.0, 1.5, 1.0, 0], coast: 1.3, inland: 0.6 },
  // warmth-loving: deserts, savanna and hothouse; the cold is deadly
  warm: { hab: [0, 0, 0, 0, 0.2, 0.4, 0.55, 0.4, 1.0, 0.9, 1.2, 0.9, 0], coast: 1, inland: 1 },
  // highland fliers: mountains and forests
  avian: { hab: [0, 0, 0.08, 0.35, 0.8, 0.05, 0.4, 1.0, 0.6, 0.85, 1.1, 0.3, 0], coast: 1.1, inland: 1 },
  // forest and swamp dwellers that live off decay and wet soil
  damp: { hab: [0, 0, 0.05, 0.6, 0.15, 0.01, 0.2, 0.9, 0.4, 1.1, 1.3, 1.0, 0], coast: 1, inland: 1 },
  // extremophiles: hot, dry and mineral country others avoid
  extreme: { hab: [0, 0, 0.1, 0.2, 0.6, 0.7, 0.5, 0.4, 0.6, 0.4, 0.7, 1.0, 0], coast: 1, inland: 1 },
  // mats and films: anywhere damp and warm enough, nowhere outstanding
  film: { hab: [0, 0, 0.15, 0.35, 0.3, 0.2, 0.45, 0.65, 0.55, 0.7, 0.9, 0.7, 0], coast: 1.2, inland: 0.9 },
};
const HABITAT_OF = {
  human: 'human', archaic: 'human', erectus: 'human', mammal: 'human',
  neanderthal: 'cold', denisovan: 'cold', floresian: 'tropical', habiline: 'tropical',
  cetacean: 'aquatic', fish: 'aquatic', mollusc: 'aquatic', radiate: 'aquatic', trichordate: 'aquatic',
  amphibian: 'amphibious', reptile: 'warm', dinosaur: 'warm', insect: 'warm', arthropod: 'warm',
  avian: 'avian', eukaryote: 'damp', archaean: 'extreme', prokaryote: 'film',
};
// a novel domain picks its own habitat
const NOVEL_HABITATS = ['cold', 'warm', 'aquatic', 'damp', 'extreme', 'film'];

// The habitat of a people (a culture record, or { species, variant }).
export function habitatOf(cu) {
  const id = cu && cu.species ? cu.species : 'human';
  if (id === 'novel') return NOVEL_HABITATS[hashN(Math.floor((cu.variant || 0) * 4294967296), 'novelhab') % NOVEL_HABITATS.length];
  return HABITAT_OF[id] || 'human';
}
export function habitatName(cu) { return HABITAT_NAMES[habitatOf(cu)]; }
const HABITAT_NAMES = {
  human: 'Generalists, much like Terra\'s humans',
  cold: 'Cold-adapted: tundra, taiga and steppe suit them; the tropics do not',
  tropical: 'Tropical: forest and savanna, with little use for the cold',
  aquatic: 'Water-bound: coasts, river valleys and swamps; inland and dry country is empty to them',
  amphibious: 'Amphibious: wetlands first, and the coast',
  warm: 'Warmth-loving: deserts, savanna and hothouse swamps; the cold is deadly',
  avian: 'Highland: mountains and forests',
  damp: 'Damp-loving: forests and swamps',
  extreme: 'Extremophiles: hot, dry and mineral country others avoid',
  film: 'Anywhere damp and warm enough, nowhere outstanding',
};

// How much more (or less) a province can support of this people than of
// Terra's humans: its biomes weighed by the people's habitat, over the same
// weighed by HUMAN_HAB. Land a lineage finds hostile (under HOSTILE of what it
// would be for humans) it does not settle at all, so its nations keep to the
// country they like. Cached on the province.
const HOSTILE = 0.15;
export function habitatFactor(r, cu) {
  const h = habitatOf(cu);
  if (h === 'human') return 1;
  if (!r.habitat) r.habitat = new Map();
  let f = r.habitat.get(h);
  if (f === undefined) {
    const H = HABITATS[h];
    let mine = 0, ours = 0;
    for (let b = 1; b < H.hab.length; b++) { mine += r.biomes[b] * H.hab[b]; ours += r.biomes[b] * HUMAN_HAB[b]; }
    mine *= r.coastal ? H.coast : H.inland;
    f = ours > 0 ? mine / ours : 0;
    if (f < HOSTILE) f = 0;
    r.habitat.set(h, f);
  }
  return f;
}
