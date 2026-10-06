// Browser entry point: a pannable map of Big Earth's sheets in 2000 CE and a
// panel for the selected sheet. Click a "+" sheet to reveal (generate) it.
//
// Big Earth is shown at a single moment, 2000 CE: the end of each sheet's
// 1000-2000 CE tile. That millennium is still simulated, and becomes backstory.

import { BigEarth } from '../engine.js';
import { clearColorCache } from '../render.js';
import { $, createApp } from './app.js';
import { Camera, createMapView, attachMapInput } from './map.js';
import { createPanel } from './panel.js';
import { loadSaved, autosaver, createModeBar, createLegend, createToast, createSaveDialog } from './controls.js';

(async function boot() {
  const saved = await loadSaved();
  const engine = saved ? new BigEarth(saved) : BigEarth.create({ seed: 20000 });
  const app = createApp(engine, new Camera());

  createToast(app);
  createModeBar(app);
  createLegend(app);
  createPanel(app);
  createSaveDialog(app);
  const view = createMapView(app, $('map'));
  attachMapInput(app, view);

  const save = autosaver(() => engine.world,
    () => app.toast('This world is too large to keep in the browser. Use Save to copy or download it.'));
  engine.on('reveal', save);
  engine.on('load', save);
  // colours are cached per world; a new reveal may add states
  engine.on('reveal', () => clearColorCache(engine.world));

  $('seed').value = engine.seed;
  view.resize();
  app.state.cam.centreOn(0.5, 0.5);
  app.refresh();
  if (!saved) save();
  $('loading').hidden = true;
})();

