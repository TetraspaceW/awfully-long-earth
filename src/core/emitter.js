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
