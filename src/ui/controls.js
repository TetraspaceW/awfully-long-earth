// Controls around the map: the map-mode bar and legend (from the map-mode
// registry), toasts, the Save & worlds dialog, and browser storage.

import { BigEarth } from '../engine.js';
import { getMapMode, mapModes, rampCss } from '../render.js';
import { $, esc } from './app.js';

// The map legend and the map-mode buttons, both drawn from the map-mode registry.


export function createModeBar(app) {
  const bar = $('modes');
  bar.innerHTML = mapModes().map((m) =>
    `<button data-mode="${esc(m.id)}" aria-pressed="${m.id === app.state.mode}">${esc(m.label)}</button>`).join('');
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (b) app.setMode(b.dataset.mode);
  });
  app.bus.on('mode', (id) => {
    for (const o of bar.querySelectorAll('[data-mode]')) o.setAttribute('aria-pressed', String(o.dataset.mode === id));
  });
}

export function legendHtml(mode) {
  const l = mode?.legend;
  if (!l) return '';
  if (l.kind === 'ramp') {
    return `<span>${esc(l.title)}</span><span class="rampbar" style="background:linear-gradient(90deg,${[0, 0.2, 0.4, 0.6, 0.8, 1].map(rampCss).join(',')})"></span><span class="ends"><small>${esc(l.from)}</small><small>${esc(l.to)}</small></span>`;
  }
  return `<span>${esc(l.text)}</span>`;
}

export function createLegend(app) {
  const el = $('legend');
  const render = () => { el.innerHTML = legendHtml(getMapMode(app.state.mode)); };
  app.bus.on('mode', render);
  render();
}

// Toasts and the Save & worlds dialog.


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
    } catch (e) {
      msg(/unknown save version/.test(e.message)
        ? 'That world was saved by a different version of Big Earth and cannot be loaded.'
        : 'That code could not be read. Paste the whole code, starting with gz:');
    }
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

// Keeping the world in the browser, and world codes (gzipped saves) for
// copying, downloading and loading.


const STORE = 'awfully-long-earth:climate-2000';

export async function gzip(str) {
  if (typeof CompressionStream === 'undefined') return 'raw:' + str;
  const cs = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = new Uint8Array(await new Response(cs).arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return 'gz:' + btoa(s);
}

export async function gunzip(code) {
  if (code.startsWith('raw:')) return code.slice(4);
  if (!code.startsWith('gz:')) return code;
  const bin = atob(code.slice(3));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(ds).text();
}

export const worldCode = (world) => gzip(world.serialize());
export async function worldFromCode(code) { return BigEarth.load(await gunzip(code)).world; }

// The world is kept in IndexedDB, which holds far more than localStorage's few
// megabytes; localStorage is only a fallback (and where older versions saved).
function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('awfully-long-earth', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbDo(mode, fn) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', mode);
    const req = fn(tx.objectStore('kv'));
    tx.oncomplete = () => { db.close(); resolve(req.result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

async function storeSave(code) {
  try {
    await idbDo('readwrite', (st) => st.put(code, STORE));
    try { localStorage.removeItem(STORE); } catch (e) { /* not available */ }
  } catch (e) {
    localStorage.setItem(STORE, code);
  }
}
async function storeLoad() {
  try {
    const code = await idbDo('readonly', (st) => st.get(STORE));
    if (code) return code;
  } catch (e) { /* fall back to localStorage */ }
  try { return localStorage.getItem(STORE); } catch (e) { return null; }
}

// Debounced autosave; onFail is called if the browser refuses to store it.
export function autosaver(getWorld, onFail) {
  let timer = 0;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        await storeSave(await worldCode(getWorld()));
      } catch (e) {
        onFail(e);
      }
    }, 600);
  };
}

export async function loadSaved() {
  try {
    const code = await storeLoad();
    if (!code) return null;
    return await worldFromCode(code);
  } catch (e) {
    return null;
  }
}
