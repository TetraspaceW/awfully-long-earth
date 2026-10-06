# Awfully Long Earth

An explorable alternate Earth that just keeps going, frozen at a single moment: **2000 CE**.

**Big Earth** is endless: a plane of Earth-sized *sheets* that goes on forever in every
direction, with no wrap-around and no poles. Real Earth is one of them, sheet **Terra (0, 0)**, exactly as it was in 2000:
the United States, the European Union, China and the rest. On Big Earth they are regional
players among many. Every other sheet is generated so that it is drawn from the same
distributions as Earth, and continues it across its edges.

You start with Terra and its four neighbours. Click a `+` sheet next to a revealed one to
**reveal** it. Each new sheet is filled in from its **boundary conditions**, meaning the
revealed sheets around it.

There is no time control: Big Earth exists only in its present. Other eras show up
only as distance from Terra: the further out a sheet is, the further its
development can run ahead of or behind Terra's timeline. Each sheet's present is
reached by simulating its last millennium (1000–2000 CE), and that history is kept
as backstory: a sheet's "How this world came to be" and each state's origin,
predecessor and key events.

## Running it

Open `dist/index.html` in a browser. It's a single self-contained file with no server.

To work on the code:

```sh
npm install
npm test            # lint, layer rules, unit tests, determinism, and a patch of Big Earth
npm run build       # rebuilds dist/index.html and dist/artifact.html
npm run build-earth # re-rasterises Natural Earth country outlines (needs network)
```

## Building on it

The world is a headless engine with no DOM. A game can drive it directly:

```js
import { BigEarth } from './src/index.js';

const earth = BigEarth.create({ seed: 20000 });
earth.on('reveal', ({ x, y }) => console.log(`revealed ${earth.sheetName(x, y)}`));
earth.reveal(2, 0);
earth.cell(2, 0, 120, 60);   // what is at a cell: terrain, province, owner, people, technology
earth.players(2000);         // leading powers
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the layers, the data model, how
generation works and the extension points (map modes, events, saved game data).

## Using it

- **Click a `+` sheet** to reveal it. The panel's compass buttons reveal the selected
  sheet's north, west, east and south neighbours, or take you to them.
- **Map buttons**: **Terra** recentres on Earth; **All** fits every revealed sheet.
- **Map modes**: states, peoples (language families, where related peoples share
  hues), species, technology, population density, and terrain.
- **Panel**: the leading powers on the sheet and across all revealed Big Earth
  (blocs like the EU are counted as one player), the peoples living there, and
  "How this world came to be": the sheet's millennium of history up to 2000.
- **Tap a state** on the map, in a sheet's power list, or under "All states on
  this sheet" to open its profile (tap sea or stateless land to close it):
  - how it is governed and who leads it;
  - what its technology lets it do, and its economy;
  - the peoples living in it;
  - its backstory: how it emerged, its predecessor, its successors, and its key
    events across every revealed sheet.

  The rest of the map fades back while a state is selected.
- The map is saved in your browser. **Save & worlds** copies or loads a world
  code, or starts a new world from another seed.

## How a sheet is made

A sheet's present is the end of its backstory millennium, 1000–2000 CE, stored
as five snapshots (1000, 1250, 1500, 1750 and 2000 CE). A snapshot gives every
province an owner, a people and a technology level.

The millennium starts from a rough state drawn from the era's distribution
(in the sheet's own effective year: see **Drift from Terra**), shaped by the
revealed sheets around it: their peoples reach across the edges, their states
may already hold land across them, and technology is nudged towards theirs.
The full dynamics then run silently at that era for 800–1500 years
("spin-up"), so the start looks like the result of history rather than a
random draw; this also lets federations and world states form on sheets far
ahead of Terra, where they take centuries. States and peoples that existed
only during spin-up are discarded.

Then the millennium is simulated in 50-year steps. Throughout, the revealed
neighbours act as **boundary conditions**: technology and peoples diffuse
across the edges, and neighbouring states push in, so a state can straddle
sheets.

The simulation (`src/history/`) runs in 50-year steps, using deliberately Earth-like
dynamics. States emerge where farming societies get complex enough. They expand by
weighted conquest, overextend, lose provinces to secession, and collapse into
successor states. Steppe hordes rise fast and fall fast. Languages spread with
farmers and conquerors and split into daughter languages that keep their parent's
sound system. Technology climbs towards an era ceiling, diffuses, and is knocked
back by collapses, plagues, droughts and dark ages. That ceiling is a long plateau
from about 16,000 BCE, which is why sheets that run far behind Terra are worlds of
rising and falling classical-to-medieval civilisations. After about 1550 CE the
modern breakthrough spreads everywhere, unevenly, so by 2000 the sheets have
Earth-like inequality. The population and economy models are calibrated on Earth's
real 2000 figures, so other sheets' powers are comparable to the US, EU and China.

## Order independence

You can reveal sheets in any order: outwards from Terra, or along a different
path to the same place. The micro history (which kingdom, which war) depends on
the order, but the macro picture is meant not to.
`src/macro.js` defines it as a pure function of the seed, a position and a year.
Positions are continuous: each province is evaluated where it actually lies, and
nothing in the macro layer knows where a sheet edge is, because sheets are how the
map is cut up, not features of the territory.

| Macro quantity | Meaning |
|---|---|
| Development | Golden and dark ages: a smooth space-time field scaling the era's technology ceiling (fades out after 1500) |
| Modern technology | Each province's level after 1550: the frontier minus a persistent institutional gap that fades after 2000 |
| State share | How much state-ready land is under states, which depends on technology and the imperial phase |
| Effective number of states | How unified a region is: empires and fragmentation cycle, nation states arrive, then unification |
| Federations | Territorial. Federation cores sit at fixed places, about seven for every ten sheets. A core lights up once its surroundings reach its founding era, then its domain grows outward over centuries, holds, and contracts as its era ends. A province belongs to the core whose domain reaches furthest past it, if the province itself is in the federal era. A region entering that era is drawn in from the core outward over about 600 years, rather than all at once. Domains ignore sheet edges, so a federation spans worlds whenever its domain does, and frontiers move continuously |

The simulation is steered towards these targets each step: emergence,
conquest, collapse, decline and unions all scale with how far the sheet is from
them. A sheet only measures how it is doing against the average of its
provinces' targets, while the targets themselves vary smoothly across it and
into the next sheet. `npm test` checks that the same sheet revealed directly,
after a neighbour on one side, or after neighbours on two others agrees on
state share, largest-state share and technology, and that federation
membership matches the macro layer whichever order the sheets were revealed in.

### Drift from Terra

Terra is the one fixed point. Every other world has a **point of divergence**: how
long ago its history parted from Terra's. A world runs ahead of or behind Terra's
timeline by up to half that (see below). This is the only way time enters Big
Earth: a sheet's present can look like Terra's past or future. Its technology,
institutions, nation-state era, colonial window and federations all follow its own
effective year, while sea level and ice follow real time.

Between neighbouring worlds the point of divergence swings by at most about
max(1,000 years, 20% of itself) (`POD_SWING` in `src/macro.js`). Near Terra it grows
by up to a millennium a sheet. Once it passes 5,000 years it grows geometrically, so
the difference is arbitrary far enough out:

| Distance | Typical point of divergence |
|---|---|
| 1 sheet | under a century |
| 10 sheets | about 1,000 years |
| 100 sheets | about 10,000 years (some over a million) |
| 1,000 sheets | about 20 million years, sometimes far more than the age of the universe |
| 100,000 sheets | around 10<sup>34</sup> years |

This holds around every world, not just Terra: each has close neighbours and wildly
different far-offs.

How far ahead or behind a world runs is not simply half its divergence. Half the
divergence is only the limit. A smooth field puts each world behind (four in five)
or ahead (one in five), and the size of the gap on each side follows a
**log-logistic distribution** (a power law), cut off at half the divergence. Near
Terra the cutoff dominates, so its neighbours run within centuries of it. As the
divergence grows the cutoff matters less, and in the limit the gap settles to a
fixed shape:

| Where a world sits, far from Terra | Share of worlds |
|---|---|
| Within 2,000 years ahead of Terra's era | 8% |
| More than 10,000 years ahead | 4% |
| Within 2,000 years behind | 8% |
| 2,000 to 300,000 years behind: their own Stone Ages and early histories | 12% |
| Before 300,000 BCE: no species there has become sapient yet | 60% |

The share of pre-sapient worlds grows with distance from Terra: about 4% at 300
sheets, a fifth at 1,000, two fifths at 10,000, heading for 60%. Far-future
worlds stay rare throughout. Where a world sits in the distribution is a smooth
field, so neighbours stay alike (`eraGap` in `src/macro.js`). Worlds far ahead stay
at the top of the technology scale, and their federations rise and fall in cycles.
The panel shows each sheet's divergence and how far it runs ahead or behind.

The field is a pure function of position, so it does not depend on survey order. It
is built from octaves of smooth noise 3, 9, 27, … sheets across, anchored at zero
over Terra, with weights growing like a random walk's. There is no largest octave:
at distance d from Terra, octaves up to about 300d sheets across take part, fading
in smoothly, so the divergence never levels off. Further walks make some far civilisations persistently unified or
splintered, more or less dominated by states, and more boom-and-bust.

### Species

The point of divergence also decides who the people are. A lineage is possible
only if it had already branched off from ours when history diverged: it then
existed as a line of its own. Anything that split from ours later never came to
be. For a divergence 13 million years ago, for example, there are no Neanderthals,
and no humans.

- **Under 300,000 years:** humans.
- **300,000 to 2.5 million years:** other hominids that already existed then.
  These are archaic humans, Neanderthals, Denisovans, Floresians, Erectines and
  Habilines, dropping out as the divergence passes their split from our line.
- **Over 2.5 million years:** other branches of the tree of life, each possible
  until the divergence predates its branch point:

  | Lineage | Possible for divergences up to |
  |---|---|
  | Mammals (apes, then simians, placentals, marsupials and monotremes: the closest relatives that had split off) | 180 million years |
  | Cetaceans (dolphin people; they are not to be trusted) | 90 million |
  | Reptilians, saurians (the asteroid missed) and avians | 320 million |
  | Amphibians | 352 million |
  | Ichthyans (fish) | 435 million |
  | Cephalopods, arthropods and insectoids | 600 million |
  | Trichordates (whatever the Ediacaran biota were doing, it kept going) | 650 million |
  | Radiates (jellies and corals) | 680 million |
  | Another kingdom: mycelians, vegetals or protists | 2 billion |
  | Archaeans | 2.7 billion |
  | Bacterials | 3.8 billion (the last universal common ancestor) |
  | A novel domain of life | possible for any divergence from before the eukaryotes (over 2 billion years) |

  A *novel domain* is a branch of life that came off the prokaryotes after history
  parted, so it has no counterpart in Terra's history. Each region has its own,
  with a generated name such as *Heliomorpha*, and its own body plan: multicellular
  (a nice multicellular boy), lattice-grown, swarm-colonial, or giant single cells.
  For a divergence older than the last common ancestor, novel domains are all that
  is left: life that began separately.

Among the lineages available, the likeliest are the closest relatives, those that
branched off just before the divergence. Lineages are sticky. Within a region about 1,000 sheets across,
each lineage has a fixed random priority, and the highest-priority lineage that
is available wins. As divergence deepens and rules lineages out, the next in rank
takes over, so the odds stay the same while a lineage, once reached, holds until
the divergence rules it out or the region ends. That
is like the 300 sheets it takes to leave Terra's humans behind. Each people
records the species of the place it arose and keeps it as it spreads, so
lineages can meet and mix at realm edges. Non-human peoples have their own sound
systems, so a cetacean language sounds like *K'iichoi* and a saurian one like
*Zhaskaan*.

Humans stay near Terra: other hominids appear a few hundred sheets out, and
other branches of life about a thousand sheets out. Snowball and Venusian worlds,
small worlds and the Gap have no sapient lineage. The **Species** map mode colours
peoples by lineage.

### Other Earths

Go back far enough and it isn't only history that parts from Terra's: the sky
and the planet do too (`src/planet.js`). Each sheet is one world, so its
planet is drawn once per sheet, and the odds of each outcome depend on its point of divergence:

| Divergence | What can differ |
|---|---|
| Under 50 million years | Nothing: the Solar System runs as it did for Terra |
| Over 50 million years | The astrodynamics. The Solar System's orbits are chaotic and can't be traced back this far, so the world gets its own axial tilt, length of day and year, and an orbit a little nearer or further out (a few °C warmer or colder). These spread out fully by 500 million years. The chaos can be violent too: the further back a world parted, the likelier (up to one in five) that Earth has since been thrown onto a much nearer orbit (a hothouse or a runaway greenhouse), a further one (deep ice), or lost altogether, in a collision or flung out of the Solar System, leaving **the Gap** |
| Over 4.51 billion years (the giant impact) | The Moon. A world may have no Moon, two, or a far bigger one. Without a Moon to steady it, its axis can lie anywhere, and with no tides to brake it, its day is short |
| Over 4.54 billion years (Earth's assembly, complete by 4.57 billion) | The planet itself. One in two is still an Earth. Otherwise it is an **ocean world** (a few islands), a **small world** (a Mars: airless, frozen, dry basins, lifeless), or the Gap: no Earth ever formed, just a belt of asteroids where it should be |
| Over 4.57 billion years | The star: a dim orange dwarf or a hot white star in place of the Sun |

Axial tilt changes the climate: more tilt spreads warmth towards the poles, and
past about 54° the poles are warmer than the equator over the year. None of this
jumps at a sheet edge: a world's orbit, tilt, sea level and air blend into its
neighbours' over the outer 24 cells, meeting half and half at the edge, so
coasts sink into an ocean world's sea or the Gap's emptiness, seas freeze as
they near open space, and a Mars's barren rock gives way to its neighbours'
land along a ragged line (`src/geo/blend.js`). The panel
describes each world's planet and sky once they can differ. Worlds with their
own sky, and the first lost or thrown Earths, start a few hundred sheets out.
About 1,000 sheets out a twentieth of worlds are past Earth's formation; at
10,000 sheets it is about three in five.

### Climate

Big Earth has no single climate. Each place's climate state comes from a smooth
field, built from octaves 3, 10, 30 and 90 sheets across and anchored so Terra has
its real climate. The field has the same statistics everywhere: every world's
neighbours are within a few degrees of it, and its far-off worlds can be anything
from a Cryogenian snowball (ice to the equator, frozen seas) to a runaway Venusian
greenhouse (boiled-off oceans, rock at 400 °C or more). The stages in between are
ice ages, deep glaciation, warm and hothouse worlds, and moist greenhouses with
scorched tropics and steaming seas. A world only tips into a runaway greenhouse
through the broad-scale octaves, so it does so gradually over many sheets.
Snowball and Venusian worlds are uninhabited. The panel names each sheet's
climate, and the map tooltip gives each cell's temperature.

### Climate bands

Every world has poles and an equator, but not every world's north points the
same way, and the belts still run on across sheet edges (`src/geo/bands.js`).
A stripe pattern whose direction changes from place to place has to bend, and
where it can't bend far enough it breaks, as a fingerprint's ridges do. So the
belts are phasor noise: overlapping wave patterns, each one band period long,
pointing along a smooth orientation field that turns over a few tens of sheets.
Where the patterns agree the belts are straight, where the field turns they
bend, and where neighbouring patterns fall out of step a belt forks; there the
latitude fades to the mid-latitudes rather than jump. Terra and its eight
neighbours keep the plain layout (north up, poles at the top and bottom edges),
and north is let go gradually over the next several sheets.

## Assumptions and liberties

- **Geometry**: each sheet is an Earth-sized map, and Big Earth is an endless flat
  plane of them. Each sheet has polar and equatorial belts a sheet-height apart,
  but which way its north points varies across the plane (see **Climate bands**
  below). Around Terra north is up and the belts repeat along every row of
  sheets, so Terra's Arctic and Antarctic sit against cold belts on the
  neighbouring sheets. With no poles there is no global gradient. Instead, see **Climate** below. Terrain is noise tuned to Earth's roughly 30% land
  and to Terra's spectrum: continents of the same size, coastlines as intricate.
  It is bent near Terra's edges so its coastlines continue. Terra's own relief
  is synthetic (only its outlines are real), textured with the same kinds of
  hills, uplands and ridged ranges as every other sheet, its real mountain
  ranges tapering into the lowlands. Physics, such as what holds an
  infinite plane together, is ignored.
- **Earth's record (1–2000 CE)** is hand-authored at 250-year snapshots on
  provinces that are modern countries, with the big ones split. Borders are coarse.
  Present-day borders, population and GDP come from Natural Earth 1:50m (public
  domain); the "2000 CE" snapshot uses those present-day figures.
- **Larger states with higher technology.** A state's sustainable size grows
  roughly linearly with technology until the information age, then steeply.
  Treaties unite states into continental federations and then world states.
  On sheets whose effective year has passed 2400, worlds federate across sheet
  borders, following the macro layer above.
- **Sheets running ahead of Terra** live in speculative futures. Wars resume at a
  low rate, independence movements succeed, constitutions change, kin states
  unite and blocs may federate.
- Earth's own polities can push a little way into neighbouring sheets. In this
  world, Terra's history looks the same from inside, and Terra is one regional
  system among many.

## Layout

```
src/engine.js   BigEarth: the engine API (reveal, query, render, save, events)
src/index.js    the package's public API
src/core/       frame (grid, coordinates, timeline, eras), random, util
src/geo/        sheet geography and the Atlas; public entry geo/index.js
src/macro.js    drift from Terra, macro targets, interworld federations
src/species.js  which lineage became sapient where
src/planet.js   other Earths: each world's planet and sky
src/world/      the World and its snapshots; population, economy, queries
src/history/    sheet generation: the backstory millennium as a pipeline of systems
src/terra.js    real Earth's 1-2000 CE record
src/profile.js  state profiles
src/names.js    phonologies and names
src/render.js   headless rasteriser and map modes
src/data/       Natural Earth outlines and Terra's hand-authored history
src/ui/         the explorer (browser only)
```

Details in [ARCHITECTURE.md](ARCHITECTURE.md).
