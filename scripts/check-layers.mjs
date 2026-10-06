// Enforces the module structure described in ARCHITECTURE.md:
//   - the code is a small number of units; each unit is a file or a directory
//   - a unit may only depend on the units listed for it (no upward imports)
//   - from outside, a directory unit may only be imported through its public
//     entry files; everything else in it is private
//   - no import cycles between files
//   - nothing outside src/ui touches the DOM
// Run with `npm run check:layers` (part of `npm test`).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'src');

// unit -> { public entry files (directory units), units it may import }
export const UNITS = {
  'core':       { public: ['core/frame.js', 'core/random.js', 'core/util.js'], uses: [] },
  'data':       { public: ['data/earth-geo.js', 'data/earth-history.js', 'data/phonologies.js'], uses: [] },
  'names.js':   { uses: ['core'] },
  'macro.js':   { uses: ['core'] },
  'species.js': { uses: ['core', 'macro.js'] },
  'planet.js':  { uses: ['core', 'macro.js'] },
  'geo':        { public: ['geo/index.js'], uses: ['core', 'data', 'planet.js'] },
  'world':      { public: ['world/world.js', 'world/stats.js'], uses: ['core', 'geo', 'names.js', 'species.js', 'data'] },
  'history':    { public: ['history/index.js'], uses: ['core', 'geo', 'macro.js', 'species.js', 'world', 'names.js'] },
  'terra.js':   { uses: ['core', 'geo', 'world', 'names.js', 'data'] },
  'profile.js': { uses: ['core', 'macro.js', 'species.js', 'world', 'history', 'names.js'] },
  'render.js':  { uses: ['core', 'geo', 'world', 'species.js'] },
  'engine.js':  { uses: ['core', 'geo', 'macro.js', 'species.js', 'planet.js', 'world', 'history', 'terra.js', 'profile.js', 'render.js'] },
  'index.js':   { uses: ['core', 'engine.js', 'render.js', 'world', 'history'] },
  'ui':         { public: ['ui/main.js'], uses: ['core', 'engine.js', 'render.js'] },
};

const unitOf = (rel) => (UNITS[rel] ? rel : rel.split('/')[0]);

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
  const unit = unitOf(rel);
  const spec = UNITS[unit];
  if (!spec) { errors.push(`${rel}: not in any unit (add it to UNITS)`); continue; }
  for (const d of deps) {
    if (d.startsWith('..')) { errors.push(`${rel}: imports outside src: ${d}`); continue; }
    const du = unitOf(d);
    if (du === unit) continue;
    if (!spec.uses.includes(du)) { errors.push(`${rel} (${unit}) may not depend on ${du} (imports ${d})`); continue; }
    const pub = UNITS[du]?.public;
    if (pub && !pub.includes(d)) errors.push(`${rel} imports ${d}, which is private to ${du}; use ${pub.join(' or ')}`);
  }
  if (unit !== 'ui' && /\b(document|window|localStorage|HTMLElement)\s*[.(]/.test(text.replace(/\/\/.*$/gm, ''))) {
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
const unitEdges = new Set();
for (const [f, deps] of graph) for (const d of deps) if (unitOf(f) !== unitOf(d)) unitEdges.add(`${unitOf(f)}>${unitOf(d)}`);
console.log(`structure ok: ${files.length} files in ${Object.keys(UNITS).length} units, ${unitEdges.size} unit dependencies`);
