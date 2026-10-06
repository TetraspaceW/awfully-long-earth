// Flood fills and distance transforms over one sheet's cell grid.

import { W, H, CELLS, N4 } from '../core/grid.js';

// Distance (in cells) from each cell to the nearest cell of the other kind.
export function bfsDistance(land) {
  const dist = new Int16Array(CELLS).fill(-1);
  const q = new Int32Array(CELLS);
  let head = 0, tail = 0;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    for (const [di, dj] of N4) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
      if (land[jj * W + ii] !== land[k]) { dist[k] = 1; q[tail++] = k; break; }
    }
  }
  while (head < tail) {
    const k = q[head++], i = k % W, j = (k / W) | 0;
    for (const [di, dj] of N4) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
      const kk = jj * W + ii;
      if (dist[kk] < 0 && land[kk] === land[k]) { dist[kk] = dist[k] + 1; q[tail++] = kk; }
    }
  }
  for (let k = 0; k < CELLS; k++) if (dist[k] < 0) dist[k] = 60;
  return dist;
}

// Grow labelled cells outwards into unlabelled cells where ok(k) holds,
// breadth first (in a shuffled order when given an rng).
export function growInto(region, ok, rng) {
  let frontier = [];
  for (let k = 0; k < CELLS; k++) if (region[k] >= 0) frontier.push(k);
  while (frontier.length) {
    if (rng) rng.shuffle(frontier);
    const next = [];
    for (const k of frontier) {
      const i = k % W, j = (k / W) | 0;
      for (const [di, dj] of N4) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
        const kk = jj * W + ii;
        if (region[kk] < 0 && ok(kk)) { region[kk] = region[k]; next.push(kk); }
      }
    }
    frontier = next;
  }
}

// The 4-connected component of cells where ok(k) holds, starting from start.
export function component(start, ok) {
  const out = [start], seen = new Set([start]);
  for (let p = 0; p < out.length; p++) {
    const k = out[p], i = k % W, j = (k / W) | 0;
    for (const [di, dj] of N4) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
      const kk = jj * W + ii;
      if (!seen.has(kk) && ok(kk)) { seen.add(kk); out.push(kk); }
    }
  }
  return out;
}
