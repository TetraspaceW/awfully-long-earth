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
