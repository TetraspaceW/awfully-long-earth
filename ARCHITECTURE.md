# Architecture

Awfully Long Earth is a **headless world engine** with an **explorer UI** on
top. A game uses the engine the way the explorer does: through `BigEarth`
(`src/engine.js`), or through the layers underneath it when it needs more.

## Layers

Each directory under `src/` is a layer. A layer imports only from the layers
listed for it; `npm run check:layers` enforces this, forbids import cycles, and
keeps the DOM inside `src/ui`.

Lower layers never import higher ones:

| Layer | May import |
|---|---|
| `core/` | nothing |
| `lang/`, `macro/` | `core` |
| `geo/` | `core`, `terra/geography`, `terra/data` |
| `world/` | `core`, `geo`, `lang`, `terra/data` |
| `history/` | `core`, `geo`, `macro`, `world`, `lang`, `lore/chronicle` |
| `terra/history.js` | `core`, `world`, `lang`, `terra/geography`, `terra/data` |
| `lore/` | `core`, `world`, `macro`, `lang`, `history/naming` |
| `render/` | `core`, `geo`, `world` |
| `engine.js`, `index.js` | everything but `ui` |
| `ui/` | everything |

| Layer | Job | Knows about a World? |
|---|---|---|
| `core/` | Grid, coordinates, timeline, technology eras, maths, RNG, noise, event emitter, LRU | no |
| `lang/` | Phonologies; place, people and ruler names | no |
| `geo/` | Physical geography of a sheet: terrain, climate, biomes, provinces, links across sheet edges. `Atlas` builds and caches sheets for one seed | no |
| `macro/` | The macro layer: drift from Terra, development, state-share and unity targets, territorial federations. Pure functions of (seed, position, year) | no |
| `terra/` | Real Earth: `data/` (generated and hand-authored), `geography.js` (its sheet), `history.js` (writes its 1–2000 CE record into a World) | `history.js` only |
| `world/` | `World` (registries of peoples, states, blocs and generated tiles), snapshots, the save codec, the economy model, queries | yes |
| `history/` | The tile generator (`TileSim`) | yes |
| `lore/` | Prose: state profiles, how states are governed, chronicle text | yes |
| `render/` | Headless rasteriser and the map-mode registry; palette | reads |
| `engine.js` | `BigEarth`, the facade: reveal, query, render, save, events | owns one |
| `ui/` | The explorer: map view, input, panel, legend, dialogs, storage | via `BigEarth` |

## The data model

- **Sheet** (`geo/sheet.js`): one Earth-sized map, a 240 × 120 grid of cells.
  Geography is a pure function of `(seed, x, y)` and is never saved. Terra
  (0, 0) is real Earth and is the same for every seed. Its cells are grouped
  into **provinces** (`regions`), the units history happens on.
- **Tile** (`world/snapshot.js`, `TileHistory`): one sheet over one millennium,
  stored as 5 **snapshots** 250 years apart. A snapshot is three arrays over
  the sheet's provinces: `owner` (polity id), `culture` (people id) and `tech`.
  Plus the tile's chronicle `events`.
- **World** (`world/world.js`): every generated tile, keyed `"x,y,t"`, and the
  registries they refer to: `polities`, `cultures`, `blocs`. Stable string
  keys (`c:FRA`, `e:rome`, `fed:core:…`) find records by meaning
  (`world.byKey`). `world.ext` is free space a game can use; it is saved.
- **Coordinates** (`core/coords.js`): sheets are integers `(x, y)` with y
  growing south; continuous positions are in sheet units `(gx, gy)`; cells are
  `k = j * W + i` within a sheet.
- **Time** (`core/timeline.js`): layer `t` covers years `[1000t, 1000t + 1000]`.
  The explorer shows 2000 CE, the end of layer 1.

## How a tile is generated

`history/index.js#generateTile` runs a `TileSim` (`history/tile-sim.js`).
Which mode it runs depends on the tile's known neighbours in time:

| Known | Mode | Module |
|---|---|---|
| past only, or nothing | forwards (from `prior` + spin-up if no past) | `forward.js`, `prior.js` |
| future only | in reverse from the future | `backward.js` |
| past and future | both, then hand provinces over between them | `bridge.js` |

Each mode is steered towards the macro layer (`steering.js` reading
`macro/`), which is why the survey order does not change the big picture.
`TileSim`'s dynamics are split across modules that each install methods on
its prototype (`mixin` at the end of `tile-sim.js`). They share state on
`this`; the constructor lists all of it.

Everything random goes through `Rng` seeded from `hashN(seed, …)`, so the
same seed and survey order give byte-identical results. `test/golden.json`
pins hashes of saves, renders and profiles; `npm run test:determinism`
fails when generation changes.

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

- **Map modes** (`render/modes.js`): `registerMapMode({ id, label, legend,
  paint(rgb, cell), border(snap, r) })`. Registered modes appear in the
  explorer's mode bar automatically, and `earth.raster(x, y, id)` draws them.
- **Events**: `BigEarth` is an `Emitter` (`reveal`, `load`, `*`).
- **Save data**: `world.ext` round-trips through saves. For format changes,
  bump `SAVE_VERSION` in `world/codec.js` and add a migration.
- **Text**: chronicle milestones and event labels live in `lore/chronicle.js`,
  government prose and type labels in `lore/government.js`.
- **Geography cache**: `new Atlas(seed, { capacity })` sets how many sheets
  stay in memory (about 0.5 MB each); pass it as `new World(seed, { atlas })`.

## The explorer UI

`ui/main.js` boots a `BigEarth`, then wires independent parts that share an
`app` object (`ui/app.js`) and talk over its bus (`draw`, `panel`, `mode`,
`invalidate`, `toast`, `world`): `map/view.js` (canvas drawing),
`map/input.js` (pan, zoom, hover, click), `map/camera.js`, `tooltip.js`,
`panel/` (sheet sections and the state profile card), `legend.js` (mode bar
and legend, from the registry), `dialogs.js`, `store.js` (autosave and world
codes). Markup is `ui/app.html` and styles `ui/styles.css`;
`npm run build` bundles everything into `dist/index.html`.

## Tests

| Command | What |
|---|---|
| `npm run lint` | ESLint: undefined names, unused imports |
| `npm run check:layers` | Layer rules, import cycles, no DOM outside `ui/` |
| `npm run test:unit` | Small, fast tests of each layer and the engine API |
| `npm run test:determinism` | Generation matches `test/golden.json` |
| `npm run test:smoke` | Generates a patch of Big Earth and checks the world-building invariants |
| `npm test` | All of the above |
