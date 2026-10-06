// Saving and loading worlds. Geography is never saved: it is rebuilt from the
// seed. Snapshots are stored as base64 typed arrays, technology quantised to
// 1/20 of a level.
//
// To change the format, bump SAVE_VERSION and add a migration from the old
// version to MIGRATIONS; loading runs every migration in turn.

export const SAVE_VERSION = 1;

// MIGRATIONS[v] turns a version-v save object into a version-(v+1) one.
const MIGRATIONS = {};

export function encodeWorld(world) {
  const tiles = [];
  for (const h of world.tiles.values()) {
    tiles.push({
      x: h.x, y: h.y, t: h.t, order: h.order, events: h.events, fixed: !!h.fixed,
      snaps: h.snaps.map((s) => ({ o: b64(s.owner), c: b64(s.culture), q: b64(quantTech(s.tech)) })),
    });
  }
  return {
    v: SAVE_VERSION, seed: world.seed, nextId: world.nextId, order: world.order,
    cultures: [...world.cultures.values()], polities: [...world.polities.values()], blocs: world.blocs, tiles,
    ...(world.ext && Object.keys(world.ext).length ? { ext: world.ext } : {}),
  };
}

// Fills `world` (a fresh World with the save's seed) from a save object.
export function decodeInto(world, d) {
  d = migrate(d);
  world.nextId = d.nextId; world.order = d.order;
  for (const c of d.cultures) world.addCulture(c);
  for (const p of d.polities) world.addPolity(p);
  world.blocs = d.blocs || [];
  world.ext = d.ext || {};
  for (const t of d.tiles) {
    world.tiles.set(`${t.x},${t.y},${t.t}`, {
      x: t.x, y: t.y, t: t.t, order: t.order, events: t.events, fixed: t.fixed,
      snaps: t.snaps.map((s) => ({
        owner: new Int32Array(unb64(s.o)), culture: new Int32Array(unb64(s.c)),
        tech: dequantTech(new Uint8Array(unb64(s.q))),
      })),
    });
  }
  return world;
}

export function parseSave(json) {
  const d = typeof json === 'string' ? JSON.parse(json) : json;
  if (!d || typeof d.v !== 'number' || d.v > SAVE_VERSION || (d.v < SAVE_VERSION && !MIGRATIONS[d.v])) {
    throw new Error('unknown save version');
  }
  return d;
}

function migrate(d) {
  while (d.v < SAVE_VERSION) d = MIGRATIONS[d.v](d);
  return d;
}

function quantTech(t) {
  const q = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) q[i] = Math.max(0, Math.min(255, Math.round(t[i] * 20)));
  return q;
}
function dequantTech(q) {
  const t = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) t[i] = q[i] / 20;
  return t;
}

function b64(arr) {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64');
}
function unb64(s) {
  const bin = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}
