// Toasts and the Save & worlds dialog.

import { BigEarth } from '../engine.js';
import { $ } from './dom.js';
import { worldCode, worldFromCode } from './store.js';

export function createToast(app) {
  const t = $('toast');
  let timer = 0;
  app.bus.on('toast', (msg) => {
    t.textContent = msg; t.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(() => { t.hidden = true; }, 3200);
  });
}

export function createSaveDialog(app) {
  const msg = (m) => { $('dlgMsg').textContent = m; };
  $('saveBtn').addEventListener('click', () => { $('dlg').hidden = false; msg(''); });
  $('dlgClose').addEventListener('click', () => { $('dlg').hidden = true; });
  $('copyCode').addEventListener('click', async () => {
    const code = await worldCode(app.world);
    const ta = $('code');
    ta.value = code;
    try { await navigator.clipboard.writeText(code); msg('World code copied.'); } catch (e) {
      ta.select(); msg('Select the code above and copy it.');
    }
  });
  // embedded viewers can't save files; the world code covers that case
  try { if (window.self !== window.top) $('download').hidden = true; } catch (e) { $('download').hidden = true; }
  $('download').addEventListener('click', async () => {
    const blob = new Blob([await worldCode(app.world)], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'big-earth-world.txt';
    a.click();
    msg('If no file appeared, use Copy world code instead.');
  });
  $('loadCode').addEventListener('click', async () => {
    try {
      app.adopt(await worldFromCode($('code').value.trim()));
      $('dlg').hidden = true; app.toast('World loaded');
    } catch (e) { msg('That code could not be read. Paste the whole code, starting with gz:'); }
  });
  $('loadFile').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    $('code').value = await f.text();
    $('loadCode').click();
  });
  $('newWorld').addEventListener('click', () => { $('confirmNew').hidden = false; });
  $('confirmNo').addEventListener('click', () => { $('confirmNew').hidden = true; });
  $('confirmYes').addEventListener('click', () => {
    const seed = Number($('seed').value) || Math.floor(Math.random() * 1e6);
    $('confirmNew').hidden = true; $('dlg').hidden = true;
    app.adopt(BigEarth.create({ seed }).world);
    app.toast(`New Big Earth, seed ${seed}`);
  });
  app.bus.on('world', (w) => { $('seed').value = w.seed; });
}
