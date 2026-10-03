// The explorable world: registries of cultures and polities shared by all tiles,
// plus the history of every tile generated so far.

import { tileKey, posKey, wrapX, SNAPS } from './constants.js';
import { Rng, hashN } from './rng.js';
import { randomPhon, placeName } from './names.js';

export class World {
  constructor(seed = 20000) {
    this.seed = seed;
    this.cultures = new Map();
    this.polities = new Map();
    this.tiles = new Map();
    this.blocs = [];
    this.keys = new Map();
    this.nextId = 1;
    this.order = 0;
  }

  id() { return this.nextId++; }

  addCulture(c) {
    c.id = c.id || this.id();
    this.cultures.set(c.id, c);
    if (c.key) this.keys.set(c.key, c.id);
    return c.id;
  }

  addPolity(p) {
    p.id = p.id || this.id();
    this.polities.set(p.id, p);
    if (p.key) this.keys.set(p.key, p.id);
    return p.id;
  }

  byKey(k) { return this.keys.get(k); }

  tile(x, y, t) { return this.tiles.get(tileKey(x, y, t)); }
  hasTile(x, y, t) { return this.tiles.has(tileKey(x, y, t)); }

  setTile(h) {
    h.order = this.order++;
    this.tiles.set(tileKey(h.x, h.y, h.t), h);
  }

  polityName(id, Y) {
    const p = this.polities.get(id);
    if (!p) return '—';
    if (p.names) {
      let n = p.name;
      for (const [y, nm] of p.names) if (Y >= y) n = nm;
      // before its first recorded name, use the earliest one
      if (Y < p.names[0][0]) n = p.names[0][1];
      return n;
    }
    return p.name;
  }

  // "the Kingdom of X", but "France"
  polityRef(id, Y, capital = false) {
    const n = this.polityName(id, Y);
    const titled = /\b(Kingdom|Empire|Republic|League|Horde|hordes|Confedera\w+|Realm|Union|Federation|Sultanate|Caliphate|dynasty|Khanate|Khaganate|city-states|Theocracy|Order|Emirate|Commonwealth|Monarchy|Shogunate|States|Chiefdom|chiefdoms|Imamate|Assembly|Concord|Directorate|Worlds|Free State|Principality|Duchy|kingdoms|Yabghu|Community|Compact|Council|Netherlands|Philippines|Bahamas|Gambia|City|Crowns?|Nawabs|realm|state)\b|ate$|^United /.test(n);
    if (!titled || /^the /i.test(n)) return n;
    return `${capital ? 'The' : 'the'} ${n}`;
  }

  cultureName(id) {
    const c = this.cultures.get(id);
    return c ? c.name : 'Uninhabited';
  }

  cultureRoot(id) {
    let c = this.cultures.get(id);
    while (c && c.parent && this.cultures.has(c.parent)) c = this.cultures.get(c.parent);
    return c ? c.id : 0;
  }

  // Spatial / temporal extent of what has been generated.
  timeRange() {
    let lo = Infinity, hi = -Infinity;
    for (const h of this.tiles.values()) { lo = Math.min(lo, h.t); hi = Math.max(hi, h.t); }
    return { lo, hi };
  }

  tilesAt(t) {
    const out = [];
    for (const h of this.tiles.values()) if (h.t === t) out.push(h);
    return out;
  }

  tileName(x, y) {
    x = wrapX(x);
    if (x === 0 && y === 0) return 'Terra';
    const rng = new Rng(hashN(this.seed, 'tilename', x, y));
    const p = randomPhon(rng);
    const base = placeName(p, rng);
    const forms = ['{}', '{}', 'the {} Reach', 'the {} Expanse', '{} Lands', 'the {} Basin', 'Greater {}', 'the {} Marches'];
    return rng.pick(forms).replace('{}', base);
  }

  // ------------------------------------------------------------ persistence

  serialize() {
    const tiles = [];
    for (const h of this.tiles.values()) {
      tiles.push({
        x: h.x, y: h.y, t: h.t, order: h.order, events: h.events, fixed: !!h.fixed,
        snaps: h.snaps.map((s) => ({ o: b64(s.owner), c: b64(s.culture), q: b64(quantTech(s.tech)) })),
      });
    }
    return JSON.stringify({
      v: 1, seed: this.seed, nextId: this.nextId, order: this.order,
      cultures: [...this.cultures.values()], polities: [...this.polities.values()], blocs: this.blocs, tiles,
    });
  }

  static deserialize(json) {
    const d = typeof json === 'string' ? JSON.parse(json) : json;
    if (d.v !== 1) throw new Error('unknown save version');
    const w = new World(d.seed);
    w.nextId = d.nextId; w.order = d.order;
    for (const c of d.cultures) w.addCulture(c);
    for (const p of d.polities) w.addPolity(p);
    w.blocs = d.blocs || [];
    for (const t of d.tiles) {
      w.tiles.set(tileKey(t.x, t.y, t.t), {
        x: t.x, y: t.y, t: t.t, order: t.order, events: t.events, fixed: t.fixed,
        snaps: t.snaps.map((s) => ({
          owner: new Int32Array(unb64(s.o)), culture: new Int32Array(unb64(s.c)),
          tech: dequantTech(new Uint8Array(unb64(s.q))),
        })),
      });
    }
    return w;
  }
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

export function cloneSnap(s) {
  return { owner: s.owner.slice(), culture: s.culture.slice(), tech: s.tech.slice() };
}

export function emptySnaps(n) {
  return Array.from({ length: SNAPS }, () => ({
    owner: new Int32Array(n), culture: new Int32Array(n), tech: new Float32Array(n),
  }));
}

export { posKey };
