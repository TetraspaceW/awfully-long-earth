# Awfully Long Earth

An explorable alternate Earth that just keeps going, in space and in time.

**Big Earth** has 100 times the surface area of Earth: a 10 × 10 grid of Earth-sized
*sheets*. Real Earth is one of them, sheet **Terra (0, 0)**. Its last 2,000 years are
our real history: the Roman Empire, the Song, the Mongols, the United States, the
European Union, China. Before that, Big Earth has 20,000 years of history, with
civilisations rising and falling everywhere, Terra included.

The map is divided into tiles of **1 Earth × 1 Earth × 1000 years**. You click to
extend the survey north, south, east, west, earlier or later. Each new tile is filled
in from its **boundary conditions**, meaning whatever tiles already exist around it.

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

- **Click a `+` sheet** to survey it for the millennium shown. The panel's compass
  buttons extend the survey from the selected sheet in all six directions.
  **Back to 20,000 BCE** surveys a whole column of time.
- **Time**: the slider moves in 250-year snapshots. Move one millennium past the
  surveyed range to extend into an earlier or later layer.
- **Map modes**: states, peoples (language families, where related peoples share
  hues), technology, population density, and bare terrain. Sea level and ice follow
  the glacial cycle, so Doggerland and Beringia appear before about 6,000 BCE.
- **Panel**: the leading powers on the sheet and across all surveyed Big Earth
  (blocs like the EU are counted as one player), the peoples living there, and a
  chronicle of the millennium.
- The survey is saved in your browser. **Save & worlds** copies or loads a world
  code, or starts a new world from another seed.

## How tiles are filled

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

## Assumptions and liberties

- **Geometry**: each sheet is an equirectangular Earth-sized map. Big Earth wraps
  east–west and has real poles at its top and bottom rows. Climate bands repeat
  within every row of sheets, plus a global gradient towards Big Earth's poles, so
  Terra's Arctic and Antarctic sit against cold belts on the neighbouring sheets.
  Terrain is noise tuned to Earth's roughly 30% land, bent near Terra's edges so its
  coastlines continue. Physics, such as surface gravity on a planet 10 times wider,
  is ignored.
- **Earth's record (1–2000 CE)** is hand-authored at 250-year snapshots on
  provinces that are modern countries, with the big ones split. Borders are coarse.
  Present-day borders, population and GDP come from Natural Earth 1:50m (public
  domain); the "2000 CE" snapshot uses those present-day figures.
- **Earth before 1 CE** is generated, constrained only by needing to arrive at the
  real world of 1 CE (Rome, Han, Parthia and the rest are founded at their real dates).
- **Larger states with higher technology.** A state's sustainable size grows
  roughly linearly with technology until the information age, then steeply.
  Treaties unite states into continental federations, then world states, and a
  state on one sheet can join a federation centred on the next, so in the far
  future single polities span several worlds.
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
