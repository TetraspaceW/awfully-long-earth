// Enforces the module layering described in ARCHITECTURE.md:
//   - each layer imports only from the layers it is allowed to
//   - no import cycles between files
//   - nothing outside src/ui touches the DOM
// Run with `npm run check:layers` (part of `npm test`).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'src');

// layer -> layers it may import (besides itself)
export const RULES = {
  'core': [],
  'lang': ['core'],
  'terra/data': [],
  'macro': ['core'],
  'geo': ['core', 'terra/geography', 'terra/data'],
  'terra/geography': ['core', 'geo', 'terra/data'],
  'world': ['core', 'geo', 'lang', 'terra/data'],
  'terra/history': ['core', 'world', 'lang', 'terra/geography', 'terra/data'],
  'history': ['core', 'geo', 'macro', 'world', 'lang', 'lore/chronicle'],
  'lore/chronicle': [],
  'lore': ['core', 'world', 'macro', 'lang', 'history/naming', 'lore/chronicle'],
  'render': ['core', 'geo', 'world'],
  'engine': ['core', 'geo', 'macro', 'world', 'history', 'terra/history', 'lore', 'render', 'history/naming', 'lore/chronicle'],
  'ui': ['*'],
};

// the most specific layer a file belongs to
function layerOf(rel) {
  const noExt = rel.replace(/\.js$/, '');
  if (noExt === 'engine' || noExt === 'index') return 'engine';
  const keys = Object.keys(RULES).sort((a, b) => b.length - a.length);
  return keys.find((k) => noExt === k || noExt.startsWith(k + '/') || noExt.startsWith(k + '.')) || null;
}

// whether file `rel` lies in layer (or file) `k`
const within = (rel, k) => { const n = rel.replace(/\.js$/, ''); return n === k || n.startsWith(k + '/'); };

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(path.join(dir, d.name)) : d.name.endsWith('.js') ? [path.join(dir, d.name)] : []);
}

const files = walk(src);
const graph = new Map();
const errors = [];
for (const f of files) {
  const rel = path.relative(src, f).split(path.sep).join('/');
  const text = fs.readFileSync(f, 'utf8');
  const deps = [...text.matchAll(/^\s*(?:import|export)[^'"]*?from\s+['"](\.[^'"]+)['"]/gm)].map((m) =>
    path.relative(src, path.resolve(path.dirname(f), m[1])).split(path.sep).join('/'));
  graph.set(rel, deps);
  const layer = layerOf(rel);
  if (!layer) { errors.push(`${rel}: not in any layer (add it to RULES)`); continue; }
  const allowed = RULES[layer];
  for (const d of deps) {
    if (d.startsWith('..')) { errors.push(`${rel}: imports outside src: ${d}`); continue; }
    if (allowed.includes('*')) continue;
    if (layerOf(d) === layer || allowed.some((a) => within(d, a))) continue;
    if (layerOf(d) === 'ui') { errors.push(`${rel}: only the UI may import ${d}`); continue; }
    errors.push(`${rel} (${layer}) may not import ${d} (${layerOf(d)})`);
  }
  if (layer !== 'ui' && /\b(document|window|localStorage|HTMLElement)\s*[.(]/.test(text.replace(/\/\/.*$/gm, ''))) {
    errors.push(`${rel}: touches the DOM outside src/ui`);
  }
}

// file-level cycles
const state = new Map();
const stack = [];
function visit(n) {
  state.set(n, 1); stack.push(n);
  for (const d of graph.get(n) || []) {
    if (!graph.has(d)) { errors.push(`${n}: missing import ${d}`); continue; }
    if (state.get(d) === 1) errors.push(`import cycle: ${[...stack.slice(stack.indexOf(d)), d].join(' -> ')}`);
    else if (!state.has(d)) visit(d);
  }
  stack.pop(); state.set(n, 2);
}
for (const n of graph.keys()) if (!state.has(n)) visit(n);

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`layers ok: ${files.length} modules`);
