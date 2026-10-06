// Small general-purpose helpers: maths, number formatting, an LRU cache and an
// event emitter.

// Small numeric helpers shared by every layer.

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const clamp01 = (v) => Math.max(0, Math.min(1, v));
// cubic smoothstep on [0, 1]
export const fade = (t) => t * t * (3 - 2 * t);
export const lerp = (a, b, t) => a + (b - a) * t;

// Piecewise-linear lookup in a table of [x, y] points (flat beyond the ends).
export function piecewise(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, v0] = pts[i - 1], [x1, v1] = pts[i];
      return v0 + ((v1 - v0) * (x - x0)) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}

// Linear interpolation in a table sampled at 0, 1, 2, ...
export function interpTable(table, x) {
  if (x <= 0) return table[0];
  const i = Math.min(table.length - 2, Math.floor(x));
  const f = Math.min(1, x - i);
  return table[i] + (table[i + 1] - table[i]) * f;
}

// Human-readable numbers.

export function fmtPop(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} bn`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)} m`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} k`;
  return `${Math.round(n)}`;
}

export function fmtMoney(n) {
  if (n >= 1e15) return `$${(n / 1e15).toFixed(1)} qd`;
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)} tn`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(n >= 1e11 ? 0 : 1)} bn`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)} m`;
  return `$${Math.round(n / 1e3)} k`;
}

// A small least-recently-used cache.

export class LRU {
  constructor(capacity = 256) { this.capacity = capacity; this.map = new Map(); }
  get(k) {
    const v = this.map.get(k);
    if (v !== undefined) { this.map.delete(k); this.map.set(k, v); }
    return v;
  }
  set(k, v) {
    this.map.delete(k);
    this.map.set(k, v);
    while (this.map.size > this.capacity) this.map.delete(this.map.keys().next().value);
    return v;
  }
  has(k) { return this.map.has(k); }
  clear() { this.map.clear(); }
  get size() { return this.map.size; }
}

// A minimal event emitter, so the engine can tell a game (or the UI) what
// happened without knowing who is listening.

export class Emitter {
  constructor() { this._handlers = new Map(); }

  // Returns an unsubscribe function.
  on(type, fn) {
    if (!this._handlers.has(type)) this._handlers.set(type, new Set());
    this._handlers.get(type).add(fn);
    return () => this.off(type, fn);
  }

  once(type, fn) {
    const off = this.on(type, (...a) => { off(); fn(...a); });
    return off;
  }

  off(type, fn) { this._handlers.get(type)?.delete(fn); }

  emit(type, payload) {
    for (const fn of [...(this._handlers.get(type) || [])]) fn(payload);
    for (const fn of [...(this._handlers.get('*') || [])]) fn({ type, payload });
  }
}
