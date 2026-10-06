// Awfully Long Earth: the public API of the headless engine.
//
// A game needs BigEarth, the forward-history pipeline to add its own
// systems to, the map-mode registry to draw its own layers, and the frame
// constants to make sense of positions. Everything else is
// internal; see ARCHITECTURE.md.

export { BigEarth, START_RING } from './engine.js';
export { FORWARD_SYSTEMS } from './history/index.js';
export { registerMapMode, getMapMode, mapModes, polityCss, cultureCss } from './render.js';
export { W, H, CELLS, PRESENT, formatYear, eraName, DIRS, neighbourPos } from './core/frame.js';
export { SAVE_VERSION } from './world/world.js';
