// Small numeric helpers shared by every layer.

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const clamp01 = (v) => Math.max(0, Math.min(1, v));
// cubic smoothstep on [0, 1]
export const fade = (t) => t * t * (3 - 2 * t);
export const lerp = (a, b, t) => a + (b - a) * t;

// Piecewise-linear lookup in a table of [x, y] points (flat beyond the ends).
export function piecewise(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, v0] = pts[i - 1], [x1, v1] = pts[i];
      return v0 + ((v1 - v0) * (x - x0)) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}

// Linear interpolation in a table sampled at 0, 1, 2, ...
export function interpTable(table, x) {
  if (x <= 0) return table[0];
  const i = Math.min(table.length - 2, Math.floor(x));
  const f = Math.min(1, x - i);
  return table[i] + (table[i + 1] - table[i]) * f;
}
