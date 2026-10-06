// The explorable world: registries of cultures and polities shared by all tiles,
// plus the history of every tile generated so far, and the snapshot type tiles
// are made of. Geography comes from the world's Atlas and is never stored here.

import { tileKey, SNAPS } from '../core/frame.js';
import { Rng, hashN } from '../core/random.js';
import { Atlas } from '../geo/index.js';
import { placeName, randomPhon } from '../names.js';
import { decodeInto, encodeWorld, parseSave } from './save.js';

export { SAVE_VERSION } from './save.js';

// Snapshots: the state of every province of one sheet at one moment.


/**
 * @typedef {object} Snapshot
 * @property {Int32Array} owner    per province: polity id, 0 = stateless
 * @property {Int32Array} culture  per province: culture id, 0 = uninhabited
 * @property {Float32Array} tech   per province: technology level (see core/eras.js)
 *
 * @typedef {object} TileHistory  one sheet over one millennium
 * @property {number} x
 * @property {number} y
 * @property {number} t           millennium layer: years [1000t, 1000t + 1000]
 * @property {Snapshot[]} snaps   SNAPS snapshots, SNAP_YEARS apart
 * @property {{y: number, kind: string, text: string, pid?: number}[]} events
 * @property {boolean} [fixed]    Terra's hand-authored record
 * @property {number} [order]     generation order within its world
 */

export function newSnap(n) {
  return { owner: new Int32Array(n), culture: new Int32Array(n), tech: new Float32Array(n) };
}

export function cloneSnap(s) {
  return { owner: s.owner.slice(), culture: s.culture.slice(), tech: s.tech.slice() };
}

export function emptySnaps(n) {
  return Array.from({ length: SNAPS }, () => newSnap(n));
}


/**
 * @typedef {object} Culture  a people and its language
 * @property {number} id
 * @property {string} [key]      stable key for Terra's peoples ("e:latin")
 * @property {string} name
 * @property {string} adj
 * @property {number} hue        map colour
 * @property {object} phon       phonology names are drawn from (names.js)
 * @property {number} parent     culture it split from, 0 = none
 * @property {number|null} origin year it emerged, null = before the record
 * @property {boolean} [earth]
 *
 * @typedef {object} Polity  a state
 * @property {number} id
 * @property {string} [key]       stable key ("c:FRA", "e:rome", "fed:core:3:1")
 * @property {string} name
 * @property {[number, string][]} [names]  [from year, name] renames
 * @property {string} adj
 * @property {string} [base]      short name renames are built from
 * @property {number} culture     ruling people
 * @property {string} type        kingdom, empire, republic, horde, ... (profile.js)
 * @property {number} [parent]    predecessor
 * @property {number|null} founded
 * @property {number|null} ended
 * @property {{x: number, y: number, r: number}} capital  sheet and province
 * @property {string} home        "x,y" of its home sheet
 * @property {[number, number, number]} color  HSL
 * @property {number} agg         aggressiveness multiplier
 * @property {boolean} [earth]    from Terra's record
 * @property {boolean} [macro]    an interworld federation from the macro layer
 *
 * @typedef {object} Bloc  a group of states counted as one player (the EU)
 * @property {number} id
 * @property {string} name
 * @property {number} from
 * @property {number|null} to
 * @property {number[]} members
 */

export class World {
  constructor(seed = 20000, { atlas } = {}) {
    this.seed = seed;
    this.atlas = atlas || Atlas.for(seed);
    /** @type {Map<number, Culture>} */
    this.cultures = new Map();
    /** @type {Map<number, Polity>} */
    this.polities = new Map();
    /** @type {Map<string, import('./snapshot.js').TileHistory>} */
    this.tiles = new Map();
    /** @type {Bloc[]} */
    this.blocs = [];
    this.keys = new Map();
    this.nextId = 1;
    this.order = 0;
    // Free-form, saved data for whatever is built on top (a game's own state).
    this.ext = {};
  }

  id() { return this.nextId++; }

  /** Geography of sheet (x, y). */
  geo(x, y) { return this.atlas.sheet(x, y); }

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

  // Every sheet position with at least one generated tile, as "x,y" keys.
  positions() {
    const out = new Set();
    for (const h of this.tiles.values()) out.add(`${h.x},${h.y}`);
    return out;
  }

  tileName(x, y) {
    if (x === 0 && y === 0) return 'Terra';
    const rng = new Rng(hashN(this.seed, 'tilename', x, y));
    const p = randomPhon(rng);
    const base = placeName(p, rng);
    const forms = ['{}', '{}', 'the {} Reach', 'the {} Expanse', '{} Lands', 'the {} Basin', 'Greater {}', 'the {} Marches'];
    return rng.pick(forms).replace('{}', base);
  }

  // ------------------------------------------------------------ persistence

  toJSON() { return encodeWorld(this); }
  serialize() { return JSON.stringify(encodeWorld(this)); }

  static deserialize(json) {
    const d = parseSave(json);
    return decodeInto(new World(d.seed), d);
  }
}
