// Rasterises Natural Earth 1:50m admin-0 countries onto the Earth tile grid
// (240 x 120 cells, 1.5 degrees each) and writes src/data/earth-geo.js.
//
//   node scripts/build-earth.mjs [path/to/ne_50m_admin_0_countries.geojson]
//
// Without a path the GeoJSON is downloaded from the natural-earth-vector repo.
// Natural Earth data is public domain.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 240, H = 120, CELL = 360 / W;
const SS = 4; // supersamples per axis
const URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function load() {
  const p = process.argv[2];
  if (p) return JSON.parse(fs.readFileSync(p, 'utf8'));
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  return res.json();
}

// Territories folded into another feature's cells.
const MERGE = { CYN: 'CYP', KAS: 'IND' };
// Sovereign codes in Natural Earth that are not ISO codes.
const SOV = { US1: 'USA', GB1: 'GBR', FR1: 'FRA', DN1: 'DNK', NL1: 'NLD', NZ1: 'NZL', AU1: 'AUS',
  CH1: 'CHN', FI1: 'FIN', KA1: 'KAZ', CU1: 'CUB', IS1: 'ISR' };

function rings(geom) {
  if (geom.type === 'Polygon') return geom.coordinates;
  if (geom.type === 'MultiPolygon') return geom.coordinates.flat();
  return [];
}

function bbox(ring) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const [x, y] of ring) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }
  return [a, b, c, d];
}

function inRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const gj = await load();
const feats = [];
for (const f of gj.features) {
  const p = f.properties;
  const a3 = p.ADM0_A3;
  if (MERGE[a3]) continue; // handled by geometry merge below
  const rs = rings(f.geometry).map((r) => ({ r, bb: bbox(r) }));
  feats.push({ a3, p, rs });
}
for (const f of gj.features) {
  const tgt = MERGE[f.properties.ADM0_A3];
  if (!tgt) continue;
  const host = feats.find((x) => x.a3 === tgt);
  host.rs.push(...rings(f.geometry).map((r) => ({ r, bb: bbox(r) })));
}

function featureAt(x, y) {
  for (let k = 0; k < feats.length; k++) {
    let inside = false;
    for (const { r, bb } of feats[k].rs) {
      if (x < bb[0] || x > bb[2] || y < bb[1] || y > bb[3]) continue;
      if (inRing(r, x, y)) inside = !inside;
    }
    if (inside) return k;
  }
  return -1;
}

const grid = new Int16Array(W * H).fill(-1);
const cover = feats.map(() => new Map()); // feature -> cell -> hits
for (let j = 0; j < H; j++) {
  for (let i = 0; i < W; i++) {
    const counts = new Map();
    let land = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const x = -180 + (i + (sx + 0.5) / SS) * CELL;
      const y = 90 - (j + (sy + 0.5) / SS) * CELL;
      const k = featureAt(x, y);
      if (k < 0) continue;
      land++;
      counts.set(k, (counts.get(k) || 0) + 1);
      cover[k].set(j * W + i, (cover[k].get(j * W + i) || 0) + 1);
    }
    if (land * 2.5 >= SS * SS) {
      let best = -1, bc = 0;
      for (const [k, c] of counts) if (c > bc) { best = k; bc = c; }
      grid[j * W + i] = best;
    }
  }
  if (j % 20 === 0) process.stderr.write(`row ${j}\n`);
}

// Give small countries that lost every cell their best-covered cell, as long as
// that doesn't erase another country.
const cellCount = new Map();
for (const k of grid) if (k >= 0) cellCount.set(k, (cellCount.get(k) || 0) + 1);
const order = feats.map((f, k) => k).filter((k) => !cellCount.get(k) && cover[k].size)
  .sort((a, b) => (feats[b].p.POP_EST || 0) - (feats[a].p.POP_EST || 0));
for (const k of order) {
  const cells = [...cover[k].entries()].sort((a, b) => b[1] - a[1]);
  for (const [c] of cells) {
    const prev = grid[c];
    if (prev >= 0 && (cellCount.get(prev) || 0) <= 2) continue;
    if (prev >= 0) cellCount.set(prev, cellCount.get(prev) - 1);
    grid[c] = k; cellCount.set(k, 1);
    break;
  }
}

// Compact the country table to countries that own cells.
const used = [...new Set(grid)].filter((k) => k >= 0).sort((a, b) => feats[a].a3.localeCompare(feats[b].a3));
const remap = new Map(used.map((k, i) => [k, i]));
const countries = used.map((k) => {
  const p = feats[k].p;
  const sov = SOV[p.SOV_A3] || p.SOV_A3;
  return {
    a3: feats[k].a3 === 'PSX' ? 'PSE' : feats[k].a3,
    name: p.NAME,
    sov: feats[k].a3 === 'PSX' ? 'PSE' : sov,
    pop: Math.round(p.POP_EST || 0),
    gdp: Math.max(0, p.GDP_MD || 0),
    income: Number(String(p.INCOME_GRP || '5').slice(0, 1)),
    continent: p.CONTINENT,
  };
});

// Run-length encode: "<index base36>*<count base36>," with "." for ocean.
let rle = '', prev = null, run = 0;
const flush = () => { if (run) rle += `${prev < 0 ? '.' : prev.toString(36)}*${run.toString(36)},`; };
for (const k of grid) {
  const v = k < 0 ? -1 : remap.get(k);
  if (v === prev) run++; else { flush(); prev = v; run = 1; }
}
flush();

const out = `// Generated by scripts/build-earth.mjs from Natural Earth 1:50m admin-0 countries (public domain).
// Do not edit by hand.
export const EARTH_GEO = ${JSON.stringify({ W, H, countries, rle })};
`;
fs.writeFileSync(path.join(root, 'src/data/earth-geo.js'), out);
console.log(`wrote ${countries.length} countries, ${grid.filter((k) => k >= 0).length} land cells`);
