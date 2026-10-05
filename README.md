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

There is no time control. Each sheet's present is still reached by simulating its
last millennium (1000–2000 CE), and that history is kept as backstory: a sheet's
"How this world came to be" and each state's origin, predecessor and key events.

## Running it

Open `dist/index.html` in a browser. It's a single self-contained file with no server.

To work on the code:

```sh
npm install
npm test            # generates a patch of Big Earth and checks invariants
npm run build       # rebuilds dist/index.html and dist/artifact.html
npm run build-earth # re-rasterises Natural Earth country outlines (needs network)
```

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

## How tiles are filled

The engine still works in tiles of **1 Earth × 1000 years** and can generate any
millennium from 20,000 BCE to 10,000 CE, in any order. The app only uses each sheet's
1000–2000 CE tile and shows its end. The rest of this section describes the engine;
`npm test` exercises all of it.

Each tile's state is stored as five snapshots (start, +250, +500, +750, end). A
snapshot gives every province an owner, a people and a technology level. A new
tile reads these faces:

| Face | What it contributes |
|---|---|
| Past (one millennium earlier) | Our start state is its end state, exactly. |
| Future (one millennium later) | Our end state is its start state, exactly. States that must exist then are founded on the way (at their recorded founding date when one is known), peoples that must have spread do spread, and technology converges on it. |
| East, west, north, south (same millennium) | Technology and peoples diffuse across the edge, and neighbouring states push in. A state can straddle sheets. |

When only the future face is known (the usual case when exploring backwards),
the tile is generated **in reverse**. Time runs backwards from the known future in
50-year steps, undoing what history does going forwards:
- states shrink back towards their founding dates and vanish at them;
- conquered predecessors and collapsed empires reappear;
- languages recede from their margins, and daughter languages fold back into
  their parents;
- technology drifts back towards its era's typical level, with the occasional
  dark age undone.

Read forwards, the result is continuous.

When **both** the past and the future are known (filling a gap), the millennium is
generated twice: forwards from the past and in reverse from the future. Each
province then hands over from the forward history to the reverse one at its own
moment. These moments are spatially smooth, cluster by the state that ends up
holding the province, and fall where one of the two histories changes that
province anyway. The two ends' disagreement is therefore spread over the
millennium and reads as states rising at others' expense.

Languages are slow variables. A tile with no adjacent millennium inherits its
peoples from the nearest surveyed millennium on the same sheet, up to five
away, so separately surveyed eras agree about who lives there.

With no past or future face, the tile still has to start like one reached by
simulating forwards. A rough starting state is drawn from the era's distribution,
shaped by whichever side faces are known. The full dynamics then run silently at
that era for 800–1500 years ("spin-up") before the tile begins. This lets
federations and world states form in the far future, where they take centuries.
States and peoples that existed only during spin-up are discarded.

The simulation (`src/sim.js`) runs in 50-year steps, using deliberately Earth-like
dynamics. States emerge where farming societies get complex enough. They expand by
weighted conquest, overextend, lose provinces to secession, and collapse into
successor states. Steppe hordes rise fast and fall fast. Languages spread with
farmers and conquerors and split into daughter languages that keep their parent's
sound system. Technology climbs towards an era ceiling, diffuses, and is knocked
back by collapses, plagues, droughts and dark ages. That ceiling is a long plateau
from about 16,000 BCE, which is why Big Earth's history is twenty millennia of
rising and falling classical-to-medieval civilisations. After about 1550 CE the
modern breakthrough spreads everywhere, unevenly, so by 2000 the sheets have
Earth-like inequality. The population and economy models are calibrated on Earth's
real 2000 figures, so other sheets' powers are comparable to the US, EU and China.

## Order independence

You can survey sheets in any order: forwards from a past, backwards from a
future, or by tapping a sheet in the middle of nowhere. The micro history (which
kingdom, which war) depends on the order, but the macro picture is meant not to.
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

Every generation mode is steered towards these targets each step: emergence,
conquest, collapse, decline and unions forwards; revival, re-merging and
splitting in reverse. A sheet only measures how it is doing against the
average of its provinces' targets, while the targets themselves vary smoothly
across it and into the next sheet. `npm test` checks that the same sheet and era reached
forwards, directly and backwards agree on state share, largest-state share and
technology. It also checks that federation membership matches the macro layer
whatever order sheets are surveyed in. The effective number of states still
varies somewhat during the fast 2000–3000 CE unification.

### Drift from Terra

Terra's record (the area of sheet 0,0 in 1–2000 CE) is the one fixed point. Every
other world has a **point of divergence**: how long ago its history parted from
Terra's. A world runs half that ahead of or behind Terra's timeline. Its technology,
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
different far-offs. Worlds living before 300,000 BCE have no sapient species yet. Worlds far
ahead stay at the top of the technology scale, and their federations rise and fall
in cycles. The panel shows each sheet's divergence and how far it runs ahead or
behind.

The field is a pure function of position, so it does not depend on survey order. It
is built from octaves of smooth noise 3, 9, 27, … sheets across, anchored at zero
over Terra, with weights growing like a random walk's. There is no largest octave:
at distance d from Terra, octaves up to about 300d sheets across take part, fading
in smoothly, so the divergence never levels off. Further walks make some far civilisations persistently unified or
splintered, more or less dominated by states, and more boom-and-bust.

### Species

The point of divergence also decides who the people are:

- **Under 300,000 years:** humans.
- **300,000 to 2.5 million years:** other hominids. These are archaic humans,
  Neanderthals, Denisovans, Floresians, Erectines and Habilines, each available
  once history diverged before its line branched off from ours.
- **Over 2.5 million years:** other branches of the tree of life, each available
  once history diverged before it branched off from our lineage:

  | Lineage | Branched off |
  |---|---|
  | Mammals (apes, simians, placentals, marsupials or monotremes, by depth) | 2.5 million years |
  | Cetaceans (dolphin people; they are not to be trusted) | 90 million |
  | Reptilians, saurians (the asteroid missed) and avians | 320 million |
  | Amphibians | 352 million |
  | Ichthyans (fish) | 435 million |
  | Cephalopods, arthropods and insectoids | 600 million |
  | Trichordates (whatever the Ediacaran biota were doing, it kept going) | 650 million |
  | Radiates (jellies and corals) | 680 million |
  | Another kingdom: mycelians, vegetals or protists | 1.2 billion |
  | Another domain: prokaryotes | 3 billion |

Among the lineages available, the likeliest are those that branched off close to
the divergence. Lineages are sticky. Within a region about 1,000 sheets across,
each lineage has a fixed random priority, and the highest-priority lineage that
is available wins. When deeper divergence unlocks a new lineage, it takes over
only if it outranks the one already there, so the odds stay the same while a
lineage, once reached, typically holds for 75–200 sheets of travel or more. That
is like the 300 sheets it takes to leave Terra's humans behind. Each people
records the species of the place it arose and keeps it as it spreads, so
lineages can meet and mix at realm edges. Non-human peoples have their own sound
systems, so a cetacean language sounds like *K'iichoi* and a saurian one like
*Zhaskaan*.

Humans stay near Terra: other hominids appear a few hundred sheets out, and
other branches of life about a thousand sheets out. Snowball and Venusian worlds
have no sapient lineage. The **Species** map mode colours peoples by lineage.

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

## Assumptions and liberties

- **Geometry**: each sheet is an equirectangular Earth-sized map, and Big Earth is
  an endless flat plane of them. Climate bands repeat within every row of sheets, so
  Terra's Arctic and Antarctic sit against cold belts on the neighbouring sheets.
  With no poles there is no global gradient. Instead, see **Climate** below. Terrain is noise tuned to Earth's roughly 30% land,
  bent near Terra's edges so its coastlines continue. Physics, such as what holds an
  infinite plane together, is ignored.
- **Earth's record (1–2000 CE)** is hand-authored at 250-year snapshots on
  provinces that are modern countries, with the big ones split. Borders are coarse.
  Present-day borders, population and GDP come from Natural Earth 1:50m (public
  domain); the "2000 CE" snapshot uses those present-day figures.
- **Earth before 1 CE** is generated, constrained only by needing to arrive at the
  real world of 1 CE (Rome, Han, Parthia and the rest are founded at their real dates).
- **Larger states with higher technology.** A state's sustainable size grows
  roughly linearly with technology until the information age, then steeply.
  Treaties unite states into continental federations and then world states.
  From 2400 CE, worlds federate across sheet borders, following the macro
  layer above.
- **After 2000 CE** tiles are speculative and marked as such. Wars resume at a low
  rate, independence movements succeed, constitutions change, kin states unite and
  blocs such as the EU may federate.
- Earth's own polities can push a little way into neighbouring sheets. In this
  world, Terra's history looks the same from inside, and Terra is one regional
  system among many.

## Layout

```
src/constants.js          grid shape, timeline, era ceiling, sea level
src/geo.js                terrain, climate, biomes, provinces, cross-sheet links
src/data/earth-geo.js     rasterised Natural Earth countries (generated)
src/data/earth-history.js Earth 1-2000 CE: polities, borders, peoples, technology, events
src/earth.js              builds Terra's fixed tiles
src/sim.js                the tile generator
src/stats.js              population, economy, rankings
src/names.js              per-culture phonologies and names
src/render.js, main.js    canvas map and UI
src/app.html              page markup and styles
```
