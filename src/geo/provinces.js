// Provinces ("regions"): the units history is played out on. Each sheet's land
// (including shelves exposed in glacial times) is cut into roughly 40-cell
// provinces, linked by land borders, by short sea crossings, and across sheet
// edges. Also the grid flood fills and distance transforms they are built with.

import { CELLS, H, N4, W } from '../core/frame.js';
import { Rng, hashN } from '../core/random.js';
import { BIOME, HAB, NB, classify, MIN_SEA } from './climate.js';

// Flood fills and distance transforms over one sheet's cell grid.


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

// Provinces ("regions"): the units history is played out on. Each sheet's land
// (including shelves exposed in glacial times) is cut into roughly 40-cell
// provinces, linked by land borders and by short sea crossings.


// How many cells of sea a province can reach across to trade and invade.
const SEA_RANGE = 6;

// assignFixed(region, regions, everLand), when given, lays out provinces that
// are fixed rather than generated (Terra's countries).
export function buildRegions(geo, worldSeed, assignFixed = null) {
  const { elev } = geo;
  const region = new Int16Array(CELLS).fill(-1);
  const everLand = (k) => elev[k] >= MIN_SEA;
  const regions = [];

  if (assignFixed) assignFixed(region, regions, everLand);
  else proceduralProvinces(geo, worldSeed, region, regions, everLand);

  regionStats(geo, region, regions);
  seaLinks(geo, region, regions);
  geo.region = region;
  geo.regions = regions;
}

function proceduralProvinces(geo, worldSeed, region, regions, everLand) {
  const rng = new Rng(hashN(worldSeed, 'regions', geo.x, geo.y));
  const cand = [];
  for (let k = 0; k < CELLS; k++) if (everLand(k)) cand.push(k);
  rng.shuffle(cand);
  const target = Math.max(1, Math.round(cand.length / 40));
  const seeds = [];
  const R = 4;
  for (const k of cand) {
    if (seeds.length >= target) break;
    const i = k % W, j = (k / W) | 0;
    if (seeds.some((s) => Math.abs(s % W - i) < R && Math.abs(((s / W) | 0) - j) < R)) continue;
    seeds.push(k);
  }
  for (const s of seeds) {
    region[s] = regions.length;
    regions.push({ id: regions.length, code: String(regions.length) });
  }
  growInto(region, (k) => everLand(k), rng);
  // islands no seed could reach
  for (const k of cand) {
    if (region[k] >= 0) continue;
    const comp = component(k, (kk) => everLand(kk) && region[kk] < 0);
    if (comp.length >= 6) {
      const id = regions.length;
      regions.push({ id, code: String(id) });
      for (const c of comp) region[c] = id;
    } else {
      // join the nearest region on the same sheet
      let best = -1, bd = Infinity;
      const i = k % W, j = (k / W) | 0;
      for (let r = 1; r < 30 && best < 0; r++) {
        for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
          const v = region[jj * W + ii];
          if (v >= 0) { const d = di * di + dj * dj; if (d < bd) { bd = d; best = v; } }
        }
      }
      for (const c of comp) region[c] = best >= 0 ? best : 0;
    }
  }
}

// Size, centroid, habitability (now and at the glacial maximum), biome mix,
// coastline and land neighbours of each province.
function regionStats(geo, region, regions) {
  const { elev } = geo;
  for (const r of regions) Object.assign(r, {
    cells: 0, cellsNow: 0, cx: 0, cy: 0, habNow: 0, habGlacial: 0, coastal: false,
    biomes: new Float32Array(NB), adj: new Set(), sea: new Map(),
  });
  for (let k = 0; k < CELLS; k++) {
    const id = region[k];
    if (id < 0) continue;
    const r = regions[id], i = k % W, j = (k / W) | 0;
    r.cells++; r.cx += i; r.cy += j;
    const bNow = classify(elev[k], geo.temp[k], geo.moist[k], 0);
    const bG = classify(elev[k], geo.temp[k] - 6, geo.moist[k] * 0.85, MIN_SEA);
    r.habGlacial += HAB[bG];
    if (bNow !== BIOME.OCEAN) { r.cellsNow++; r.habNow += HAB[bNow]; r.biomes[bNow]++; }
    for (const [di, dj] of N4) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
      const v = region[jj * W + ii];
      if (v >= 0 && v !== id) r.adj.add(v);
      if (elev[jj * W + ii] < 0 && elev[k] >= 0) r.coastal = true;
    }
  }
  for (const r of regions) {
    r.cx /= Math.max(1, r.cells); r.cy /= Math.max(1, r.cells);
    let best = 0;
    for (let b = 1; b < NB; b++) if (r.biomes[b] > r.biomes[best]) best = b;
    r.biome = r.cellsNow ? best : BIOME.OCEAN;
    r.steppe = r.cellsNow ? (r.biomes[BIOME.STEPPE] + r.biomes[BIOME.DESERT] * 0.5) / r.cellsNow : 0;
    r.adj = [...r.adj];
  }
}

// Regions within a few cells of each other across water can trade and invade:
// r.sea maps each such region to the crossing's length in cells.
function seaLinks(geo, region, regions) {
  const { elev } = geo;
  const dist = new Int16Array(CELLS);
  const coast = new Map();
  for (const r of regions) if (r.coastal) coast.set(r.id, []);
  for (let k = 0; k < CELLS; k++) {
    const id = region[k];
    if (id < 0 || elev[k] < 0) continue;
    const i = k % W, j = (k / W) | 0;
    for (const [di, dj] of N4) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
      if (elev[jj * W + ii] < 0) { coast.get(id)?.push(jj * W + ii); break; }
    }
  }
  const stamp = new Int32Array(CELLS).fill(-1);
  for (const r of regions) {
    const start = coast.get(r.id);
    if (!start || !start.length) continue;
    let frontier = [];
    for (const k of start) if (stamp[k] !== r.id) { stamp[k] = r.id; dist[k] = 1; frontier.push(k); }
    for (let d = 1; d <= SEA_RANGE && frontier.length; d++) {
      const next = [];
      for (const k of frontier) {
        const i = k % W, j = (k / W) | 0;
        for (const [di, dj] of N4) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
          const kk = jj * W + ii;
          if (stamp[kk] === r.id) continue;
          stamp[kk] = r.id;
          if (elev[kk] < 0) { dist[kk] = d + 1; next.push(kk); continue; }
          const v = region[kk];
          if (v >= 0 && v !== r.id && !r.adj.includes(v)) {
            const old = r.sea.get(v);
            if (old === undefined || d < old) r.sea.set(v, d);
          }
        }
      }
      frontier = next;
    }
  }
}

// Links between the provinces of neighbouring sheets.


// Pairs [ourRegion, theirRegion] of regions touching across the shared edge.
// dir: 'E' (x+1), 'W' (x-1), 'N' (y-1), 'S' (y+1).
export function edgeLinks(a, b, dir) {
  const pairs = new Map();
  const add = (ka, kb) => {
    const ra = a.region[ka], rb = b.region[kb];
    if (ra < 0 || rb < 0) return;
    if (a.elev[ka] < MIN_SEA || b.elev[kb] < MIN_SEA) return;
    pairs.set(`${ra},${rb}`, [ra, rb]);
  };
  if (dir === 'E') for (let j = 0; j < H; j++) add(j * W + W - 1, j * W);
  if (dir === 'W') for (let j = 0; j < H; j++) add(j * W, j * W + W - 1);
  if (dir === 'S') for (let i = 0; i < W; i++) add((H - 1) * W + i, i);
  if (dir === 'N') for (let i = 0; i < W; i++) add(i, (H - 1) * W + i);
  return [...pairs.values()];
}
