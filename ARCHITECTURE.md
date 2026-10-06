# Architecture

Awfully Long Earth is a **headless world engine** with an **explorer UI** on
top. A game uses the engine the way the explorer does: through `BigEarth`
(`src/engine.js`).

## Units

The code is 13 units, each a file or a directory. Units are **deep**: few,
with a small public surface and their workings private. A directory unit is
imported only through its public entry files. `npm run check:layers` enforces
this, along with which units may depend on which, no import cycles, and no
DOM outside `src/ui`.

| Unit | Job | Public entry | May use |
|---|---|---|---|
| `core/` | `frame.js`: grid, sheet coordinates, timeline, technology eras. `random.js`: hashes, seeded RNG, noise. `util.js`: maths, number formats, LRU, event emitter | all three | — |
| `data/` | Natural Earth outlines (generated), Terra's hand-authored history, its language families | all | — |
| `names.js` | Phonologies; place, people and ruler names | itself | core |
| `macro.js` | The macro layer: drift from Terra, development, state-share and unity targets, territorial federations. Pure functions of (seed, position, year) | itself | core |
| `geo/` | Physical geography of a sheet, built and cached per seed by an `Atlas`. Private: `climate.js` (sea level, ice, climate field, biomes), `terrain.js`, `provinces.js`, `terra.js` (real Earth's sheet) | `index.js` | core, data |
| `world/` | `world.js`: `World` (registries of peoples, states, blocs, generated tiles) and snapshots. `stats.js`: population, economy, queries. Private: `save.js` (the save format) | `world.js`, `stats.js` | core, geo, names, data |
| `history/` | The tile generator. Private: `sim.js` (`TileSim`, forwards in time), `reverse.js` (`ReverseSim` and the gap-filling bridge), `naming.js` | `index.js` | core, geo, macro, world, names |
| `terra.js` | Writes Terra's 1–2000 CE record into a World | itself | core, geo, world, names, data |
| `profile.js` | A state's profile: government, peoples, backstory | itself | core, macro, world, history, names |
| `render.js` | Headless rasteriser, map-mode registry, palette | itself | core, geo, world |
| `engine.js` | `BigEarth`: reveal, query, render, save, events | itself | all of the above |
| `index.js` | The package's public API | itself | core, engine, render, world |
| `ui/` | The explorer | `main.js` | core, engine, render |

Nothing but `engine.js` sees more than a few other units, and the UI sees
only the engine, the renderer and core.

## The data model

- **Sheet** (`geo/index.js`): one Earth-sized map, a 240 × 120 grid of cells.
  Geography is a pure function of `(seed, x, y)` and is never saved. Terra
  (0, 0) is real Earth and is the same for every seed. Its cells are grouped
  into **provinces** (`regions`), the units history happens on.
- **Tile** (`world/world.js`, `TileHistory`): one sheet over one millennium,
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
- **Time**: layer `t` covers years `[1000t, 1000t + 1000]`. The explorer shows
  2000 CE, the end of layer 1.

## How a tile is generated

`history/index.js#generateTile` picks a generator from the tile's known
neighbours in time:

| Known | Generator |
|---|---|
| past only, or nothing | `TileSim` (`sim.js`), forwards; with no past it first draws a starting state and spins it up |
| future only | `ReverseSim` (`reverse.js`), backwards from the future |
| past and future | `runBridge` (`reverse.js`): both, then provinces hand over between them |

`TileSim` is one coupled simulation (state shared across many dynamics), so
it is kept in one class, in sections: helpers, forward run, steering,
graph helpers, one forward step, peoples, states, unions and blocs,
interworld federations, the future face, starting states, narration.
`ReverseSim` extends it and overrides `run()`; the two hooks `revived` and
`unscheduled` are the only places the base class calls into it.

Every generator is steered towards `macro.js`, which is why the survey order
does not change the big picture. Everything random goes through `Rng` seeded
from `hashN(seed, …)`, so the same seed and survey order give byte-identical
results; `test/golden.json` pins hashes of saves, renders and profiles.

## Using the engine

```js
import { BigEarth } from './src/index.js';

const earth = BigEarth.create({ seed: 20000 });   // Terra + its 4 neighbours
earth.on('reveal', ({ x, y, tile }) => console.log('revealed', earth.sheetName(x, y)));

earth.canReveal(2, 0);            // touches a revealed sheet?
earth.reveal(2, 0);               // generate it (1000-2000 CE)
earth.cell(2, 0, 120, 60);        // biome, temperature, province, owner, people, tech, pop, gdp
earth.province(2, 0, 17);         // one province and its state
earth.players(2000, null, 10);    // leading powers (blocs count as one)
earth.profile(pid);               // a state's government, peoples, backstory
earth.raster(2, 0, 'political');  // RGBA pixels, 240 x 120
earth.world.ext.myGame = { … };   // saved with the world
const json = earth.save();        // BigEarth.load(json)
```

### Extension points

- **Map modes** (`render.js`): `registerMapMode({ id, label, legend,
  paint(rgb, cell), border(snap, r) })`. Registered modes appear in the
  explorer's mode bar automatically, and `earth.raster(x, y, id)` draws them.
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
| `npm run test:unit` | Small, fast tests of core, geography and the engine API |
| `npm run test:determinism` | Generation matches `test/golden.json` (`UPDATE_GOLDEN=1` after an intended change) |
| `npm run test:smoke` | Generates a patch of Big Earth and checks the world-building invariants |
| `npm test` | All of the above |
