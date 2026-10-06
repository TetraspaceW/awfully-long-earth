// Awfully Long Earth: public API of the headless engine.
//
// Most games only need BigEarth. The layers below it are exported for
// anything that needs to go deeper; see ARCHITECTURE.md for what each does.

export { BigEarth, START_RING } from './engine.js';

export * as core from './core/index.js';
export * as geo from './geo/index.js';
export * as macro from './macro/index.js';
export { World } from './world/world.js';
export { SAVE_VERSION } from './world/codec.js';
export { tileStateAt, players, worldPowers, peoplesOn } from './world/query.js';
export { regionPop, perCapita, regionPower, density, regionFigures } from './world/economy.js';
export { canGenerate, generateTile, regionName, TileSim } from './history/index.js';
export { buildTerra } from './terra/history.js';
export { nationProfile } from './lore/profile.js';
export { registerMapMode, getMapMode, mapModes } from './render/modes.js';
export { rasterTile, terrainRgb } from './render/raster.js';
export * as palette from './render/palette.js';
