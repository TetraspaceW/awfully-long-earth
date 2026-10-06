// Biomes: what a cell is, from its elevation, temperature and moisture.

export const BIOME = {
  OCEAN: 0, ICE: 1, TUNDRA: 2, TAIGA: 3, MOUNTAIN: 4, DESERT: 5, STEPPE: 6,
  TEMPERATE: 7, SAVANNA: 8, TROPICAL: 9, FERTILE: 10, HOTHOUSE: 11, SCORCHED: 12,
};
export const BIOME_NAMES = ['Ocean', 'Ice', 'Tundra', 'Taiga', 'Mountains', 'Desert', 'Steppe',
  'Temperate forest', 'Savanna', 'Tropical forest', 'River valley', 'Hothouse swamp', 'Scorched rock'];
// habitability: how many people a cell of each biome supports, relative to temperate forest
export const HAB = [0, 0, 0.04, 0.15, 0.25, 0.04, 0.45, 1.0, 0.6, 0.55, 1.3, 0.1, 0];
export const NB = BIOME_NAMES.length;

// moisture at or above this marks a fertile river valley
export const FERTILE_MOIST = 1.5;

export function classify(e, T, M, sl) {
  if (e < sl) return BIOME.OCEAN;
  if (T < -9) return BIOME.ICE;
  if (T > 48) return BIOME.SCORCHED;
  if (T > 34) return BIOME.HOTHOUSE;
  if (e > 0.45) return BIOME.MOUNTAIN;
  if (T < -2) return BIOME.TUNDRA;
  if (M > 1.5) return BIOME.FERTILE;
  if (T < 4) return M < 0.3 ? BIOME.TUNDRA : BIOME.TAIGA;
  if (M < 0.22) return BIOME.DESERT;
  if (M < 0.38) return BIOME.STEPPE;
  if (T < 18) return BIOME.TEMPERATE;
  return M < 0.62 ? BIOME.SAVANNA : BIOME.TROPICAL;
}
