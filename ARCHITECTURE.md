# Architecture

Awfully Long Earth is a **headless world engine** with an **explorer UI** on
top. A game uses the engine the way the explorer does: through `BigEarth`
(`src/engine.js`).

## Units

The code is 15 units, each a file or a directory. Units are **deep**: few,
with a small public surface and their workings private. A directory unit is
imported only through its public entry files. `npm run check:layers` enforces
this, along with which units may depend on which, no import cycles, and no
DOM outside `src/ui`.

| Unit | Job | Public entry | May use |
|---|---|---|---|
| `core/` | `frame.js`: grid, sheet coordinates, timeline, technology eras. `random.js`: hashes, seeded RNG, noise. `util.js`: maths, number formats, LRU, event emitter | all three | — |
| `data/` | Natural Earth outlines (generated), Terra's hand-authored history, its language families | all | — |
| `names.js` | Phonologies; place, people and ruler names | itself | core |
| `macro.js` | The macro layer: point of divergence and drift from Terra, development, state-share and unity targets, territorial federations. Pure functions of (seed, position, year) | itself | core |
| `species.js` | Which lineage became sapient where (from the point of divergence), and what each species is like | itself | core, macro |
| `planet.js` | What kind of planet each sheet is, and its sky: tilt, day, year, orbit, moons, star (from the point of divergence) | itself | core, macro |
| `geo/` | Physical geography of a sheet, built and cached per seed by an `Atlas`. Private: `climate.js` (sea level, ice, climate field, biomes), `terrain.js`, `provinces.js`, `terra.js` (real Earth's sheet) | `index.js` | core, data, planet |
| `world/` | `world.js`: `World` (registries of peoples, states, blocs, generated tiles) and snapshots. `stats.js`: population, economy, queries. Private: `save.js` (the save format) | `world.js`, `stats.js` | core, geo, names, data |
| `history/` | Sheet generation. Private: `kernel.js` (`SheetRun`), `chronicle.js`, the systems in `nature.js` and `politics.js`, `forward.js`, `naming.js` | `index.js` | core, geo, macro, species, world, names |
| `terra.js` | Writes Terra's 1–2000 CE record into a World | itself | core, geo, world, names, data |
| `profile.js` | A state's profile: government, peoples, species, backstory | itself | core, macro, species, world, history, names |
| `render.js` | Headless rasteriser, map-mode registry, palette | itself | core, geo, world, species |
| `engine.js` | `BigEarth`: reveal, query, render, save, events | itself | all of the above |
| `index.js` | The package's public API | itself | core, engine, render, world |
| `ui/` | The explorer | `main.js` | core, engine, render |

Nothing but `engine.js` sees more than a few other units, and the UI sees
only the engine, the renderer and core.

## The data model

- **Sheet** (`geo/index.js`): one Earth-sized map, a 240 × 120 grid of cells.
  Geography is a pure function of `(seed, x, y)` and is never saved. Terra
  (0, 0) is real Earth and is the same for every seed. Its cells are grouped
  into **provinces** (`regions`), the units history happens on. `sheet.planet`
  (`planet.js`) says what kind of planet it is: far enough from Terra, an ocean
  world, a small barren world, or the Gap, a sheet with no land and no provinces.
- **Tile** (`world/world.js`, `TileHistory`): one sheet's backstory millennium,
  stored as 5 **snapshots** 250 years apart. A snapshot is three arrays over
  the sheet's provinces: `owner` (polity id), `culture` (people id) and `tech`.
  Plus the tile's chronicle `events`.
- **World**: every generated tile, keyed `"x,y,t"`, and the registries they
  refer to: `polities`, `cultures`, `blocs`. Stable string keys (`c:FRA`,
  `e:rome`, `fed:core:…`) find records by meaning (`world.byKey`).
  `world.ext` is free space a game can use; it is saved.
- **Coordinates** (`core/frame.js`): sheets are integers `(x, y)` with y
  growing south; continuous positions are in sheet units `(gx, gy)`; cells are
  `k = j * W + i` within a sheet.
- **Time**: Big Earth exists only in its present, 2000 CE. A tile still covers
  a millennium (layer `t` is years `[1000t, 1000t + 1000]`): generated sheets
  are layer 1 (1000–2000 CE), whose last snapshot is the present and the rest
  backstory; Terra's fixed record also has layer 0. Other eras appear only
  through `macro.js`: each sheet's development runs ahead of or behind
  Terra's (`eraShift`), so its present can look like Terra's past or future.

## How a sheet is generated

`history/index.js#generateTile(world, x, y)` runs a `ForwardRun`
(`forward.js`) over the sheet's backstory millennium and stores the tile.
The run draws a starting state for 1000 CE from the era's distribution,
shaped by the revealed sheets around it, spins it up silently so it looks
like the result of history, then runs the systems pipeline every 50 years
to 2000 CE.

It is built on a kernel, `SheetRun` (`kernel.js`), which keeps apart three
kinds of thing:

- **environment**, fixed for the run: the sheet, its revealed neighbours, the
  macro layer's fields at each province, graph helpers;
- **state**: `snap`, the one snapshot being simulated (owner, culture, tech
  per province), plus the steering multipliers `ctl` and `warm` (set during
  spin-up);
- **services**: `rng(stream)`, a separate random stream per system; `log`, the
  chronicle; and operations on the world's registries (`createPolity`,
  `rename`).

### The forward pipeline

Forward history is a list of **systems**, each `{ name, step(run, tick, rng) }`,
run in order every step. `tick` is `{ s, Y, shocked }`; `rng` is the system's
own stream, keyed by its name. Systems change `run.snap` (and the registries
through the kernel), and nothing else.

| System | Module | What it does |
|---|---|---|
| `steering` | `forward.js` | Measures the sheet against the macro targets; sets `run.ctl` |
| `federations` | `politics.js` | For sheets far ahead of Terra: joins the macro layer's interworld federations |
| `technology` | `nature.js` | Climbs towards the era ceiling, diffuses, converges on the modern frontier |
| `shocks` | `nature.js` | Plagues and droughts knock technology back; marks `tick.shocked` |
| `peoples` | `nature.js` | Settlement, migration, assimilation |
| `languages` | `nature.js` | Daughter languages split off |
| `fallen` | `politics.js` | States whose home fell lose their provinces here |
| `emergence` | `politics.js` | New states where societies are complex enough |
| `expansion` | `politics.js` | Conquest |
| `incursions` | `politics.js` | States on neighbouring sheets push in |
| `secession` | `politics.js` | Breakaways and decolonisation |
| `collapse` | `politics.js` | Overstretched, ageing or struck states fall into successors |
| `decline` | `politics.js` | Small states fade when the land is over-governed |
| `reforms` | `politics.js` | Empires proclaimed, revolutions, dynastic unions |
| `unions` | `politics.js` | For sheets past Terra's present: treaties, federations and bloc mergers |
| `narration` | `forward.js` | Technology milestones and advanced-world events |

Two guarantees follow, and `test/unit/history.test.mjs` checks them:

- **A system's dice are its own.** Adding, removing or changing a system does
  not reshuffle what the others draw.
- **Narration cannot change history.** The chronicle (`chronicle.js`) has its
  own stream for event dates and choice of words, and owns the bookkeeping that
  only exists to tell the story (first contacts, peaks, milestones).

To change history, add or replace systems:
`generateTile(world, x, y, { systems })`, or
`BigEarth.create({ systems })` for every tile an engine generates. Start
from `FORWARD_SYSTEMS` (exported from `src/index.js`).

The pipeline is steered towards `macro.js`, which is why the order sheets are
revealed in does not change the big picture. The same seed, reveal order and
systems give byte-identical results; `test/golden.json` pins hashes of saves, renders and
profiles.

## Using the engine

```js
import { BigEarth } from './src/index.js';

const earth = BigEarth.create({ seed: 20000 });   // Terra + its 4 neighbours
earth.on('reveal', ({ x, y, tile }) => console.log('revealed', earth.sheetName(x, y)));

earth.canReveal(2, 0);            // touches a revealed sheet?
earth.reveal(2, 0);               // generate its present (and 1000-2000 CE backstory)
earth.cell(2, 0, 120, 60);        // biome, temperature, province, owner, people, tech, pop, gdp
earth.province(2, 0, 17);         // one province and its state
earth.players(2000, null, 10);    // leading powers (blocs count as one)
earth.profile(pid);               // a state's government, peoples, backstory
earth.planet(2, 0);               // its planet and sky; earth.climate(2, 0) is null on an airless world
earth.raster(2, 0, 'political');  // RGBA pixels, 240 x 120
earth.world.ext.myGame = { … };   // saved with the world
const json = earth.save();        // BigEarth.load(json)
```

### Extension points

- **Map modes** (`render.js`): `registerMapMode({ id, label, legend,
  paint(rgb, cell), border(snap, r) })`. Registered modes appear in the
  explorer's mode bar automatically, and `earth.raster(x, y, id)` draws them.
- **History systems**: insert your own into the forward pipeline (above);
  e.g. `{ name: 'player-orders', step(run, { Y }, rng) { … run.snap.owner[r] = … } }`.
- **Events**: `BigEarth` is an `Emitter` (`reveal`, `load`, `*`).
- **Save data**: `world.ext` round-trips through saves. For format changes,
  bump `SAVE_VERSION` in `world/save.js` and add a migration there.
- **Geography cache**: `new Atlas(seed, { capacity })` (from `geo/index.js`)
  sets how many sheets stay in memory (about 0.5 MB each); pass it as
  `new World(seed, { atlas })`.

## The explorer UI

`ui/main.js` boots a `BigEarth` and wires four parts that share an `app`
object (`ui/app.js`: state, DOM helpers and an event bus with `draw`,
`panel`, `mode`, `invalidate`, `toast`, `world`) and never import each other:
`map.js` (camera, drawing, tooltip, input), `panel.js` (the selected sheet
and the state profile card), `controls.js` (mode bar and legend from the
map-mode registry, toasts, the save dialog, browser storage). Markup is
`ui/app.html` and styles `ui/styles.css`; `npm run build` bundles everything
into `dist/index.html`.

## Tests

| Command | What |
|---|---|
| `npm run lint` | ESLint: undefined names, unused imports |
| `npm run check:layers` | Unit dependencies, public entries, import cycles, no DOM outside `ui/` |
| `npm run test:unit` | Small, fast tests of core, geography, the history pipeline and the engine API |
| `npm run test:determinism` | Generation matches `test/golden.json` (`UPDATE_GOLDEN=1` after an intended change) |
| `npm run test:smoke` | Generates a patch of Big Earth and checks the world-building invariants |
| `npm test` | All of the above |
