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
  hues), technology, population density, and terrain.
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

Terra is the one fixed point. Every other sheet is tied to it through chains of
boundary conditions, and each link lets history wander a little. The macro layer
therefore models history's drift from Terra's timeline as a smooth field
**anchored at Terra**, with octaves 3 to 90 sheets across. Its statistics are the
same everywhere, so every world, not just Terra, has neighbours within a few
centuries of it and far-off worlds thousands of years away. This is the only way
time enters Big Earth: a sheet's present can look like Terra's past or future.

The main walk is an **era shift**: a place can run thousands of years ahead of or
behind Terra's timeline. Its technology, institutions, nation-state era, colonial
window and federations all follow its own effective year, while sea level and ice
follow real time. Further walks make some far civilisations persistently unified
or splintered, more or less dominated by states, and more boom-and-bust.

As a result, Terra's neighbours in 2000 CE run within a few centuries of it. The
drift keeps growing with distance: tens of sheets out, whole worlds run a millennium
or more ahead or behind, and a hundred sheets out they can be thousands of years
off, still in the Bronze Age or long past any world state Terra has seen. The
panel shows how far each sheet's development runs ahead of or behind Terra's.

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
