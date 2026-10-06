// The cell grid inside one sheet: an equirectangular W x H raster of 1.5-degree
// cells (in Earth's own frame). Cell k = j * W + i.

export const W = 240;
export const H = 120;
export const CELLS = W * H;

// 4-neighbourhood offsets
export const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export const cellI = (k) => k % W;
export const cellJ = (k) => (k / W) | 0;
export const inGrid = (i, j) => i >= 0 && j >= 0 && i < W && j < H;

// Longitude / latitude of a cell centre in a sheet's own Earth-like frame.
export const lonOf = (i) => -180 + (i + 0.5) * (360 / W);
export const latOf = (j) => 90 - (j + 0.5) * (180 / H);
