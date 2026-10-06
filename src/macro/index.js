// The macro layer: what Big Earth looks like at the scale of continents and
// centuries, as a pure function of the world seed, a position and a year.
//
// Positions are continuous: (gx, gy) in sheet units, so sheet (x, y) covers
// gx in [x, x+1), gy in [y, y+1). Sheets are how the map is cut up, not
// features of the territory, so nothing here knows where a sheet edge is.
//
// Tiles are generated in whatever order the explorer chooses, from different
// boundary conditions. The micro history differs with the order, but every mode
// is steered towards these targets, so the macro picture (how advanced a place
// is, how much of it is under states, how unified it is, which federation holds
// it) does not depend on the order, and does not jump at sheet edges.
//
// Nothing here reads or writes a World.

export { field } from './field.js';
export { driftYears, eraShift, effectiveYear } from './drift.js';
export { development, imperialPhase, targetStateShare, targetStateCount, macroTech } from './targets.js';
export { federationAt, federationWorlds, FED_ERA } from './federations.js';
