// The explorer app's shared state, the bus its parts talk over, and DOM helpers.

import { Emitter } from '../core/util.js';

// DOM helpers.

export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const tick = () => new Promise((r) => setTimeout(r, 0));
export const signed = (n) => `${n >= 0 ? '+' : ''}${n}`;

// The explorer app's shared state, and the bus its parts talk over.
//
// Parts (map, panel, legend, dialogs) get the app object and never import each
// other: they change `app.state` and call app.refresh() / app.redraw(), and
// they listen on app.bus.
//
// Bus events: 'draw' (map needs redrawing), 'panel' (panel needs rerendering),
// 'mode' (map mode changed), 'invalidate' (cached map images are stale),
// 'toast' (message), 'world' (a different world was adopted).


// cam: the map camera (map.js), shared so the panel and input agree on it
export function createApp(engine, cam) {
  const bus = new Emitter();
  const app = {
    engine,
    bus,
    state: {
      mode: 'political',
      cam,
      sel: { x: 0, y: 0 },
      nation: 0,     // polity whose profile is open
      allOpen: false, // "all states on this sheet" expanded
    },
    get world() { return engine.world; },
    get Y() { return engine.year; },
    redraw() { bus.emit('draw'); },
    refresh() { bus.emit('draw'); bus.emit('panel'); },
    toast(msg) { bus.emit('toast', msg); },
    select(x, y) { app.state.sel = { x, y }; },
    openNation(pid) { app.state.nation = pid; app.refresh(); bus.emit('panelTop'); },
    setMode(id) { app.state.mode = id; bus.emit('mode', id); app.redraw(); },

    // Reveal a sheet. Quiet reveals (a batch) skip selection and redraws.
    reveal(x, y, quiet = false) {
      if (!engine.reveal(x, y)) return false;
      if (!quiet) {
        app.select(x, y);
        app.toast(`Revealed ${engine.sheetName(x, y)}`);
        app.refresh();
      }
      return true;
    },

    adopt(world) {
      engine.adopt(world);
      app.state.sel = { x: 0, y: 0 };
      app.refresh();
    },
  };
  // anything that changes the world makes cached images stale
  engine.on('reveal', () => bus.emit('invalidate'));
  engine.on('load', ({ world }) => { bus.emit('invalidate'); bus.emit('world', world); });
  return app;
}
