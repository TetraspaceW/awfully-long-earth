// Snapshots: the state of every province of one sheet at one moment.

import { SNAPS } from '../core/timeline.js';

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
