// Big Earth's shared climate history: sea level and global temperature by year.
// Every sheet follows these in real time (not in its drifted effective year).

// lowest sea level ever (glacial maximum), in elevation units
export const MIN_SEA = -0.055;

// Sea level offset in elevation units (0 = today). The last glacial maximum
// exposes continental shelves (Beringia, Doggerland, Sundaland on Earth).
export function seaLevel(Y) {
  if (Y <= -19000) return -0.055;
  if (Y >= -5000) return 0;
  const f = (Y + 19000) / 14000;
  return -0.055 * (1 - f * f * (3 - 2 * f));
}

// Global temperature offset in degrees C.
export function tempOffset(Y) {
  if (Y <= -19000) return -6;
  if (Y >= -9000) return Y > 2000 ? Math.min(3, (Y - 2000) / 300) : 0;
  if (Y > -10900 && Y < -9700) return -4; // a Younger Dryas of Big Earth's own
  return -6 * (1 - (Y + 19000) / 10000);
}
