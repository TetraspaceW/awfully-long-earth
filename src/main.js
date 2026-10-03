// Browser UI: a pannable map of Big Earth's sheets, a time control, and a panel
// for the selected sheet. Click a "+" sheet to survey (generate) it.

import { W, H, ROW_MIN, ROW_MAX, COLS, wrapX, tileKey, formatYear, formatRange, eraName, isSpeculative, HISTORY_START } from './constants.js';
import { getGeo, BIOME_NAMES, cellBiome, neighbourPos } from './geo.js';
import { World } from './world.js';
import { buildEarth, prepareEarthGeo } from './earth.js';
import { generateTile, canGenerate, regionName, T_MIN, T_MAX } from './sim.js';
import { tileStateAt, players, worldPowers, regionPop, perCapita, fmtPop, fmtMoney } from './stats.js';
import { renderTile, polityCss, cultureCss, rampCss, clearColorCache } from './render.js';
import { eraShift } from './macro.js';
import { nationProfile } from './bio.js';

const STORE = 'awfully-long-earth:world';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const state = {
  world: null, Y: 2000, mode: 'political',
  cam: { cx: 0.5, cy: 0.5, scale: 400 },
  sel: { x: 0, y: 0 }, busy: false, nation: 0,
};

// --------------------------------------------------------------- storage

async function gzip(str) {
  if (typeof CompressionStream === 'undefined') return 'raw:' + str;
  const cs = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = new Uint8Array(await new Response(cs).arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return 'gz:' + btoa(s);
}
async function gunzip(code) {
  if (code.startsWith('raw:')) return code.slice(4);
  if (!code.startsWith('gz:')) return code;
  const bin = atob(code.slice(3));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(ds).text();
}

let saveTimer = 0;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      localStorage.setItem(STORE, await gzip(state.world.serialize()));
    } catch (e) {
      toast('This world is too large to keep in the browser. Use Save to copy or download it.');
    }
  }, 600);
}

async function loadSaved() {
  try {
    const code = localStorage.getItem(STORE);
    if (!code) return null;
    return World.deserialize(await gunzip(code));
  } catch (e) {
    return null;
  }
}

function newWorld(seed) {
  const w = new World(seed);
  buildEarth(w);
  // start with Earth's present-day neighbours already surveyed
  for (const [x, y] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) generateTile(w, x, y, 1);
  return w;
}

// ------------------------------------------------------------------ map

const canvas = $('map');
const ctx = canvas.getContext('2d');
const imgCache = new Map();
let dpr = 1, vw = 0, vh = 0;

function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  dpr = window.devicePixelRatio || 1;
  vw = r.width; vh = r.height;
  canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
  canvas.style.width = `${vw}px`; canvas.style.height = `${vh}px`;
  draw();
}

function tileImage(x, y, st) {
  const key = `${tileKey(x, y, st.hist.t)}|${state.Y}|${state.mode}|${state.nation}`;
  let c = imgCache.get(key);
  if (!c) {
    if (imgCache.size > 300) imgCache.clear();
    c = document.createElement('canvas');
    c.width = W; c.height = H;
    c.getContext('2d').putImageData(renderTile(state.world, x, y, st.snap, state.Y, state.mode, state.nation), 0, 0);
    imgCache.set(key, c);
  }
  return c;
}

// which millennium a click on an empty sheet should survey
function layerFor(x, y) {
  const t = Math.floor(state.Y / 1000);
  if (state.Y % 1000 === 0 && canGenerate(state.world, x, y, t - 1)) return t - 1;
  return t;
}

const toScreen = (tx, ty) => [(tx - state.cam.cx) * state.cam.scale + vw / 2, (ty - state.cam.cy) * state.cam.scale / 2 + vh / 2];
const toTile = (sx, sy) => [(sx - vw / 2) / state.cam.scale + state.cam.cx, ((sy - vh / 2) * 2) / state.cam.scale + state.cam.cy];

function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function draw() {
  if (!state.world) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = css('--sea-deep');
  ctx.fillRect(0, 0, vw, vh);
  ctx.imageSmoothingEnabled = false;
  const s = state.cam.scale, th = s / 2;
  const [l, t] = toTile(0, 0), [r, b] = toTile(vw, vh);
  const x0 = Math.floor(l), x1 = Math.ceil(r);
  const y0 = Math.max(ROW_MIN, Math.floor(t)), y1 = Math.min(ROW_MAX, Math.ceil(b));
  const labels = [];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const x = wrapX(tx);
      const [sx, sy] = toScreen(tx, ty);
      const st = tileStateAt(state.world, x, ty, state.Y);
      if (st) {
        ctx.drawImage(tileImage(x, ty, st), sx, sy, s, th);
        if (state.mode === 'political' && s > 260) labels.push(...polityLabels(x, ty, st, sx, sy, s));
      } else {
        drawFog(x, ty, sx, sy, s, th);
      }
      // sheet frame & label
      const sel = state.sel.x === x && state.sel.y === ty;
      ctx.strokeStyle = sel ? css('--marker') : css('--grid');
      ctx.lineWidth = sel ? 2.5 : 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, s - 1, th - 1);
      if (s > 120) {
        ctx.font = `600 ${Math.min(13, s / 22)}px ${css('--font-ui')}`;
        ctx.textBaseline = 'top';
        const name = state.world.tileName(x, ty);
        const label = `${name}  ${x >= 0 ? '+' : ''}${x}/${ty >= 0 ? '+' : ''}${ty}`;
        ctx.fillStyle = 'rgba(10,14,20,0.55)';
        const w = ctx.measureText(label).width;
        ctx.fillRect(sx + 4, sy + 4, w + 10, Math.min(13, s / 22) + 8);
        ctx.fillStyle = sel ? css('--marker') : '#e9edf0';
        ctx.fillText(label, sx + 9, sy + 8);
      }
    }
  }
  // labels on top
  for (const lb of labels) {
    ctx.font = `600 ${lb.size}px ${css('--font-ui')}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(12,16,22,0.75)';
    ctx.strokeText(lb.text, lb.x, lb.y);
    ctx.fillStyle = '#f4f2ec';
    ctx.fillText(lb.text, lb.x, lb.y);
    ctx.textAlign = 'left';
  }
  // poles
  ctx.fillStyle = css('--fg-dim');
  ctx.font = `500 12px ${css('--font-ui')}`;
  const [, ny] = toScreen(0, ROW_MIN);
  if (ny > 14) ctx.fillText('North pole of Big Earth', 12, ny - 8);
  const [, sy2] = toScreen(0, ROW_MAX + 1);
  if (sy2 < vh - 4) ctx.fillText('South pole of Big Earth', 12, sy2 + 16);
}

function polityLabels(x, y, st, sx, sy, s) {
  const geo = getGeo(x, y);
  const acc = new Map();
  for (const r of geo.regions) {
    const o = st.snap.owner[r.id];
    if (!o) continue;
    const a = acc.get(o) || { n: 0, cx: 0, cy: 0, w: 0 };
    a.n++; a.cx += r.cx * r.cells; a.cy += r.cy * r.cells; a.w += r.cells;
    acc.set(o, a);
  }
  const out = [];
  const minN = s > 900 ? 2 : s > 500 ? 4 : 7;
  for (const [o, a] of acc) {
    if (a.n < minN) continue;
    const size = Math.max(9, Math.min(15, (s / 120) * Math.sqrt(a.n) * 0.9));
    out.push({ text: state.world.polityName(o, state.Y), x: sx + (a.cx / a.w / W) * s, y: sy + (a.cy / a.w / H) * (s / 2), size });
  }
  return out;
}

const hatch = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  return c;
})();

function drawFog(x, y, sx, sy, s, th) {
  const t = layerFor(x, y);
  const ok = canGenerate(state.world, x, y, t);
  const g = hatch.getContext('2d');
  g.clearRect(0, 0, 8, 8);
  g.fillStyle = css('--fog'); g.fillRect(0, 0, 8, 8);
  g.strokeStyle = css('--fog-line'); g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, 8); g.lineTo(8, 0); g.stroke();
  ctx.fillStyle = ctx.createPattern(hatch, 'repeat');
  ctx.fillRect(sx, sy, s, th);
  if (ok && s > 60) {
    const cx = sx + s / 2, cy = sy + th / 2, r = Math.min(26, s / 10);
    ctx.fillStyle = css('--marker');
    ctx.globalAlpha = 0.92;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = css('--marker-ink'); ctx.lineWidth = Math.max(2, r / 6);
    ctx.beginPath(); ctx.moveTo(cx - r / 2, cy); ctx.lineTo(cx + r / 2, cy); ctx.moveTo(cx, cy - r / 2); ctx.lineTo(cx, cy + r / 2); ctx.stroke();
    if (s > 200) {
      ctx.fillStyle = '#e9edf0';
      ctx.font = `500 12px ${css('--font-ui')}`;
      ctx.textAlign = 'center';
      ctx.fillText(`Survey ${formatRange(t)}`, cx, cy + r + 16);
      ctx.textAlign = 'left';
    }
  }
}

// ---------------------------------------------------------- interaction

let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, cx: state.cam.cx, cy: state.cam.cy, moved: false };
});
canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (drag.moved) {
      state.cam.cx = drag.cx - dx / state.cam.scale;
      state.cam.cy = clampCy(drag.cy - (2 * dy) / state.cam.scale);
      $('tip').hidden = true;
      draw();
      return;
    }
  }
  hover(e.clientX - rect.left, e.clientY - rect.top);
});
canvas.addEventListener('pointerup', (e) => {
  const rect = canvas.getBoundingClientRect();
  if (drag && !drag.moved) click(e.clientX - rect.left, e.clientY - rect.top);
  drag = null;
});
canvas.addEventListener('pointerleave', () => { $('tip').hidden = true; });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0015));
}, { passive: false });

function clampCy(cy) { return Math.max(ROW_MIN - 0.5, Math.min(ROW_MAX + 1.5, cy)); }
function zoomAt(sx, sy, f) {
  const [tx, ty] = toTile(sx, sy);
  state.cam.scale = Math.max(60, Math.min(4000, state.cam.scale * f));
  const [nx, ny] = toTile(sx, sy);
  state.cam.cx += tx - nx; state.cam.cy = clampCy(state.cam.cy + ty - ny);
  draw();
}

function cellAt(sx, sy) {
  const [tx, ty] = toTile(sx, sy);
  const x = wrapX(Math.floor(tx)), y = Math.floor(ty);
  if (y < ROW_MIN || y > ROW_MAX) return null;
  const i = Math.floor((tx - Math.floor(tx)) * W), j = Math.floor((ty - y) * H);
  return { x, y, i, j, k: j * W + i };
}

function hover(sx, sy) {
  const c = cellAt(sx, sy);
  const tip = $('tip');
  if (!c) { tip.hidden = true; return; }
  const st = tileStateAt(state.world, c.x, c.y, state.Y);
  const geo = getGeo(c.x, c.y);
  let html;
  if (!st) {
    const t = layerFor(c.x, c.y);
    html = canGenerate(state.world, c.x, c.y, t)
      ? `<b>${esc(state.world.tileName(c.x, c.y))}</b><span>Unsurveyed. Click to fill ${esc(formatRange(t))} from its neighbours.</span>`
      : `<b>Unsurveyed</b><span>Survey a neighbouring sheet first.</span>`;
  } else {
    const r = geo.region[c.k];
    const biome = BIOME_NAMES[cellBiome(geo, c.k, state.Y)];
    if (r < 0 || biome === 'Ocean') {
      html = `<b>Ocean</b><span>${esc(state.world.tileName(c.x, c.y))}</span>`;
    } else {
      const reg = geo.regions[r];
      const o = st.snap.owner[r], cu = st.snap.culture[r], tech = st.snap.tech[r];
      const pop = geo.earth && state.Y === 2000 ? reg.realPop : regionPop(reg, tech, state.Y);
      html = `<b>${esc(regionName(state.world, geo, r))}</b>
        <span>${o ? `<i class="sw" style="background:${polityCss(state.world, o)}"></i>${esc(state.world.polityName(o, state.Y))}` : 'No state'}</span>
        <span>${cu ? `<i class="sw" style="background:${cultureCss(state.world, cu)}"></i>${esc(state.world.cultureName(cu))}` : 'Uninhabited'}</span>
        <span>${esc(biome)} · ${cu ? esc(eraName(tech)) : '—'}${cu ? ` · ${fmtPop(pop)} people` : ''}</span>`;
    }
  }
  tip.innerHTML = html;
  tip.hidden = false;
  const wrap = canvas.parentElement.getBoundingClientRect();
  const tw = tip.offsetWidth, tH = tip.offsetHeight;
  tip.style.left = `${Math.min(wrap.width - tw - 8, sx + 14)}px`;
  tip.style.top = `${Math.min(wrap.height - tH - 8, sy + 14)}px`;
}

function click(sx, sy) {
  const c = cellAt(sx, sy);
  if (!c) return;
  state.sel = { x: c.x, y: c.y };
  // the map is for moving around and surveying; state profiles open from the lists
  if (!tileStateAt(state.world, c.x, c.y, state.Y)) {
    const t = layerFor(c.x, c.y);
    if (canGenerate(state.world, c.x, c.y, t)) { survey(c.x, c.y, t); return; }
  }
  draw(); renderPanel();
}

function survey(x, y, t, quiet = false) {
  if (!canGenerate(state.world, x, y, t)) return false;
  generateTile(state.world, x, y, t);
  imgCache.clear(); clearColorCache();
  if (!quiet) {
    state.sel = { x, y };
    // show the new millennium: jump into its middle unless we're already inside it
    if (Math.floor(state.Y / 1000) !== t || state.Y % 1000 === 0) state.Y = t * 1000 + 500;
    toast(`Surveyed ${state.world.tileName(x, y)}, ${formatRange(t)}`);
    syncTime(); draw(); renderPanel();
  }
  scheduleSave();
  return true;
}

// ------------------------------------------------------------- time

function timeBounds() {
  const { lo, hi } = state.world.timeRange();
  return { min: Math.max(T_MIN, lo - 1) * 1000, max: Math.min(T_MAX + 1, hi + 2) * 1000 };
}

function syncTime() {
  const { min, max } = timeBounds();
  const sl = $('year');
  sl.min = min; sl.max = max; sl.step = 250; sl.value = state.Y;
  $('yearLabel').textContent = formatYear(state.Y);
  const t = Math.floor(state.Y / 1000);
  $('yearSub').textContent = state.Y % 1000 === 0 ? `End of ${formatRange(t - 1)} · start of the next` : formatRange(t);
  $('yearLabel').classList.toggle('spec', state.Y > 2000);
}

function setYear(Y) {
  const { min, max } = timeBounds();
  state.Y = Math.max(min, Math.min(max, Math.round(Y / 250) * 250));
  syncTime(); draw(); renderPanel();
}

$('year').addEventListener('input', (e) => setYear(Number(e.target.value)));
$('back1000').addEventListener('click', () => setYear(state.Y - 1000));
$('back250').addEventListener('click', () => setYear(state.Y - 250));
$('fwd250').addEventListener('click', () => setYear(state.Y + 250));
$('fwd1000').addEventListener('click', () => setYear(state.Y + 1000));
let playing = 0;
$('play').addEventListener('click', () => {
  if (playing) { clearInterval(playing); playing = 0; $('play').textContent = 'Play'; return; }
  $('play').textContent = 'Pause';
  playing = setInterval(() => {
    const { max } = timeBounds();
    if (state.Y + 250 > max) { clearInterval(playing); playing = 0; $('play').textContent = 'Play'; return; }
    setYear(state.Y + 250);
  }, 700);
});

for (const b of document.querySelectorAll('[data-mode]')) {
  b.addEventListener('click', () => {
    state.mode = b.dataset.mode;
    for (const o of document.querySelectorAll('[data-mode]')) o.setAttribute('aria-pressed', String(o === b));
    renderLegend(); draw();
  });
}

$('zoomIn').addEventListener('click', () => zoomAt(vw / 2, vh / 2, 1.4));
$('zoomOut').addEventListener('click', () => zoomAt(vw / 2, vh / 2, 1 / 1.4));
$('home').addEventListener('click', () => { state.cam = { cx: 0.5, cy: 0.5, scale: defaultScale() }; state.sel = { x: 0, y: 0 }; draw(); renderPanel(); });
$('whole').addEventListener('click', () => { state.cam = { cx: 0, cy: 0.5, scale: Math.min(vw / COLS, (2 * vh) / 10.5) }; draw(); });

function defaultScale() { return Math.max(160, Math.min(vw / 2.4, vh * 2 / 2.4)); }

// ------------------------------------------------------------- panel

const DIRS = [['N', 'North', '↑'], ['W', 'West', '←'], ['E', 'East', '→'], ['S', 'South', '↓']];

function renderPanel() {
  const { world } = state;
  const { x, y } = state.sel;
  const st = tileStateAt(world, x, y, state.Y);
  const t = st ? st.hist.t : layerFor(x, y);
  const geo = getGeo(x, y);
  const earth = geo.earth;
  let chip = '<span class="chip">Unsurveyed</span>';
  if (st) chip = earth && !st.hist.fixed && !isSpeculative(t) ? '<span class="chip gen">Earth, alternate deep past</span>'
    : st.hist.fixed ? '<span class="chip real">Real Earth record</span>'
      : isSpeculative(t) ? '<span class="chip spec">Speculative future</span>' : '<span class="chip gen">Generated</span>';

  const extendBtn = (dx, dy, dt, label, arrow) => {
    let nx = x, ny = y + dy;
    if (dx) nx = wrapX(x + dx);
    const pole = ny < ROW_MIN || ny > ROW_MAX;
    const tt = t + dt;
    const exists = !pole && world.hasTile(nx, ny, tt);
    const ok = !pole && canGenerate(world, nx, ny, tt) && (dt !== 0 || st);
    const reason = pole ? 'Pole' : exists ? `Go to ${formatRange(tt)}` : ok ? `Survey ${formatRange(tt)}` : 'Not adjacent';
    const attr = exists ? `data-go="${nx},${ny},${tt}"` : `data-ext="${nx},${ny},${tt}"`;
    return `<button class="ext ${exists ? 'go' : ''}" ${ok || exists ? '' : 'disabled'} ${attr} title="${esc(reason)}">
      <span class="arrow" aria-hidden="true">${arrow}</span><span>${label}</span><small>${esc(reason)}</small></button>`;
  };

  let html = `<header class="sheet">
    <div class="sheet-id">Sheet ${x >= 0 ? '+' : ''}${x} / ${y >= 0 ? '+' : ''}${y}</div>
    <h2>${esc(world.tileName(x, y))}</h2>
    <div class="meta">${chip}<span>${esc(formatRange(t))}</span></div>
    ${driftNote(x, y)}
  </header>
  <section>
    <h3>Extend the survey</h3>
    <div class="compass">
      ${extendBtn(0, -1, 0, 'North', '↑')}
      ${extendBtn(-1, 0, 0, 'West', '←')}
      ${extendBtn(1, 0, 0, 'East', '→')}
      ${extendBtn(0, 1, 0, 'South', '↓')}
      ${extendBtn(0, 0, -1, 'Earlier', '⟲')}
      ${extendBtn(0, 0, 1, 'Later', '⟳')}
    </div>
    <div class="row-btns">
      <button id="ring" ${st ? '' : 'disabled'}>Survey all neighbours</button>
      <button id="deep" ${st || world.hasTile(x, y, t + 1) ? '' : 'disabled'}>Back to ${formatYear(HISTORY_START)}</button>
    </div>
    ${timeColumn(x, y)}
  </section>`;

  if (st) {
    html += powersHere(x, y);
    html += peoplesHere(x, y, st, geo);
    html += chronicle(st.hist);
  } else {
    html += `<section><p class="note">This sheet has not been surveyed for ${esc(formatRange(t))}.
      ${canGenerate(world, x, y, t) ? 'Click it on the map, or use the buttons above, to fill it in from the sheets around it.' : 'Survey a sheet next to it (in space or time) first.'}</p></section>`;
  }
  html += globalPowers();
  if (state.nation) html = nationCard(state.nation) + html;
  $('panel').innerHTML = html;

  for (const b of $('panel').querySelectorAll('[data-ext]')) {
    b.addEventListener('click', () => {
      const [nx, ny, nt] = b.dataset.ext.split(',').map(Number);
      survey(nx, ny, nt);
    });
  }
  for (const b of $('panel').querySelectorAll('[data-go]')) {
    b.addEventListener('click', () => {
      const [nx, ny, nt] = b.dataset.go.split(',').map(Number);
      state.sel = { x: nx, y: ny };
      if (Math.floor(state.Y / 1000) !== nt || state.Y % 1000 === 0) state.Y = nt * 1000 + 500;
      syncTime(); draw(); renderPanel();
    });
  }
  for (const b of $('panel').querySelectorAll('[data-year]')) b.addEventListener('click', () => setYear(Number(b.dataset.year)));
  for (const b of $('panel').querySelectorAll('[data-nation]')) {
    b.addEventListener('click', () => { openNation(Number(b.dataset.nation)); });
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openNation(Number(b.dataset.nation)); } });
  }
  $('panel').querySelector('.allstates')?.addEventListener('toggle', (e) => { state.allOpen = e.target.open; });
  $('closeNation')?.addEventListener('click', () => { state.nation = 0; draw(); renderPanel(); });
  wireChart();
  $('ring')?.addEventListener('click', () => surveyRing(x, y, t));
  $('deep')?.addEventListener('click', () => surveyDeep(x, y, t));
  const cur = $('panel').querySelector('.ev.now');
  const box = cur && cur.parentElement;
  if (box && box.scrollHeight > box.clientHeight) box.scrollTop = cur.offsetTop - box.offsetTop - box.clientHeight / 3;
}

function timeColumn(x, y) {
  const { lo, hi } = state.world.timeRange();
  const a = Math.min(lo, -20), b = Math.max(hi, 1);
  let cells = '';
  for (let t = a; t <= b; t++) {
    const has = state.world.hasTile(x, y, t);
    const cur = Math.floor((state.Y - (state.Y % 1000 === 0 && !state.world.hasTile(x, y, Math.floor(state.Y / 1000)) ? 1 : 0)) / 1000) === t;
    cells += `<button class="tc ${has ? 'has' : ''} ${cur ? 'cur' : ''} ${t >= 2 ? 'spec' : ''}" data-year="${t * 1000 + 500}" title="${esc(formatRange(t))}${has ? '' : ' · unsurveyed'}" aria-label="${esc(formatRange(t))}"></button>`;
  }
  return `<div class="timecol"><div class="tc-row">${cells}</div>
    <div class="tc-axis"><span>${esc(formatYear(a * 1000))}</span><span>${esc(formatYear((b + 1) * 1000))}</span></div></div>`;
}

function powersHere(x, y) {
  const list = players(state.world, state.Y, new Set([`${x},${y}`]), 8);
  if (!list.length) return `<section><h3>Powers in ${formatYear(state.Y)}</h3><p class="note">No states here yet: bands, villages and chiefdoms.</p></section>`;
  const max = list[0].gdp || 1;
  return `<section><h3>Powers here in ${formatYear(state.Y)}</h3><ol class="powers">${list.map((p) => `
    <li ${p.bloc ? '' : `data-nation="${p.id}" class="pickable" tabindex="0" title="Open profile"`}><span class="sw" style="background:${p.bloc ? 'var(--marker)' : polityCss(state.world, p.id)}"></span>
      <span class="pn">${esc(p.name)}${p.bloc ? ` <em>bloc of ${p.members.length}</em>` : ''}${worldsTag(p)}</span>
      <span class="num">${fmtPop(p.pop)}</span><span class="num">${fmtMoney(p.gdp)}</span>
      <span class="bar"><i style="width:${Math.max(2, (100 * p.gdp) / max)}%"></i></span></li>`).join('')}</ol>
    <p class="fine">Population · economy (present-day dollars)${geoNote(x, y)}. Tap a state for its profile.</p>
    ${allStatesHere(x, y)}</section>`;
}

// Every state holding land on this sheet, blocs broken out into their members.
function allStatesHere(x, y) {
  const agg = [...worldPowers(state.world, state.Y, new Set([`${x},${y}`])).values()].sort((a, b) => b.gdp - a.gdp);
  if (agg.length <= 8) return '';
  return `<details class="allstates" ${state.allOpen ? 'open' : ''}><summary>All ${agg.length} states on this sheet</summary>
    <ol class="powers compact">${agg.map((a) => `
      <li data-nation="${a.id}" class="pickable" tabindex="0" title="Open profile"><span class="sw" style="background:${polityCss(state.world, a.id)}"></span>
        <span class="pn">${esc(state.world.polityName(a.id, state.Y))}</span><span class="num">${fmtPop(a.pop)}</span><span class="num">${a.regions} prov.</span></li>`).join('')}</ol></details>`;
}

function openNation(pid) {
  state.nation = pid;
  draw(); renderPanel();
  $('panel').scrollTop = 0;
}

const TYPE_LABEL = {
  chiefdom: 'Chiefdom', 'city-states': 'City league', kingdom: 'Kingdom', empire: 'Empire', horde: 'Nomadic confederation',
  republic: 'Republic', federation: 'Federation', union: 'Union', theocracy: 'Theocracy', league: 'League',
  'interworld federation': 'Interworld federation',
};

function nationCard(pid) {
  const b = nationProfile(state.world, pid, state.Y);
  if (!b) return '';
  const link = (n) => `<button class="linkish" data-nation="${n.id}">${esc(n.name)}</button>`;
  const also = b.names.map(([, n]) => n).filter((n, i, a) => n !== b.name && a.indexOf(n) === i);
  const stat = (label, value) => `<div class="stat"><span>${label}</span><b>${value}</b></div>`;
  const evs = b.events.slice(-14);
  return `<section class="nation" aria-label="Nation profile">
    <div class="nation-head">
      <span class="sw big" style="background:${polityCss(state.world, pid)}"></span>
      <div class="nation-title">
        <div class="sheet-id">${esc(TYPE_LABEL[b.type] || b.type)}${b.p.earth ? ' · Terra record' : ''}</div>
        <h2>${esc(b.name)}</h2>
        ${b.endonym && !b.p.macro ? `<div class="endonym">In its own tongue, <i>${esc(b.endonym)}</i></div>` : ''}
      </div>
      <button id="closeNation" class="close" aria-label="Close profile">×</button>
    </div>
    ${b.fate ? `<p class="note">${esc(b.fate)}</p>` : ''}
    ${b.alive ? `<div class="stats">
      ${stat('People', fmtPop(b.pop))}${stat('Economy', fmtMoney(b.gdp))}
      ${stat('Per head', fmtMoney(b.perHead).replace(' k', 'k'))}${stat('Provinces', b.prov)}
      ${stat(b.worlds > 1 ? 'Worlds' : 'Capital', b.worlds > 1 ? b.worlds : esc(b.capital))}${stat('Era', esc(b.era))}
    </div>` : ''}
    <h3>How it is governed</h3>
    <p class="prose">${esc(b.government)}${b.alive && !b.p.macro && !b.p.earth ? ` In ${esc(formatYear(state.Y))} it is led by ${esc(b.ruler)}.` : ''}</p>
    ${b.alive ? `<h3>What it can do</h3><p class="prose">${esc(b.life)}</p>` : ''}
    ${b.peoples.length ? `<h3>Peoples</h3><ul class="peoples">${b.peoples.map((c) => `
      <li><span class="sw" style="background:${cultureCss(state.world, c.id)}"></span><span class="pn">${esc(c.name)}${c.ruling ? ' <em>ruling people</em>' : c.from ? ` <em>from ${esc(c.from)}</em>` : ''}</span><span class="num">${Math.round(100 * c.share)}%</span></li>`).join('')}</ul>` : ''}
    <h3>How it emerged</h3>
    <p class="prose">${esc(b.origin)}${b.parent ? ` It grew out of ${link(b.parent)}.` : ''}</p>
    ${also.length ? `<p class="fine">Also known as ${also.map(esc).join(', ')}.</p>` : ''}
    ${b.series.length > 1 ? `<h3>Extent over time</h3>${extentChart(b)}` : ''}
    ${evs.length ? `<h3>Key events</h3><ol class="chron short">${evs.map((e) => `
      <li class="ev k-${e.kind}"><button class="yr" data-year="${e.y}">${esc(formatYear(e.y))}</button><span class="kind">${esc(e.where)}</span><p>${esc(e.text)}</p></li>`).join('')}</ol>` : ''}
    ${b.successors.length ? `<p class="prose">Successors: ${b.successors.map(link).join(', ')}.</p>` : ''}
  </section>`;
}

// Provinces held over time, as a small area chart with a hover readout.
function extentChart(b) {
  const s = b.series, w = 340, h = 96, pad = { l: 30, r: 8, t: 8, b: 18 };
  const x0 = s[0].Y, x1 = s[s.length - 1].Y, ymax = Math.max(...s.map((d) => d.prov));
  const X = (Y) => pad.l + ((Y - x0) / Math.max(1, x1 - x0)) * (w - pad.l - pad.r);
  const Yp = (v) => pad.t + (1 - v / ymax) * (h - pad.t - pad.b);
  const line = s.map((d, i) => `${i ? 'L' : 'M'}${X(d.Y).toFixed(1)},${Yp(d.prov).toFixed(1)}`).join('');
  const area = `${line}L${X(x1).toFixed(1)},${Yp(0)}L${X(x0).toFixed(1)},${Yp(0)}Z`;
  const now = state.Y >= x0 && state.Y <= x1 ? `<line class="now" x1="${X(state.Y)}" x2="${X(state.Y)}" y1="${pad.t}" y2="${Yp(0)}"/>` : '';
  const cur = s.reduce((a, d) => (Math.abs(d.Y - state.Y) < Math.abs(a.Y - state.Y) ? d : a), s[0]);
  const data = esc(JSON.stringify(s.map((d) => [d.Y, d.prov, Math.round(d.pop)])));
  return `<div class="chart" data-series="${data}" data-x0="${x0}" data-x1="${x1}" data-ymax="${ymax}">
    <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Provinces held from ${esc(formatYear(x0))} to ${esc(formatYear(x1))}, peaking at ${b.peak.prov} in ${esc(formatYear(b.peak.Y))}">
      <line class="grid" x1="${pad.l}" x2="${w - pad.r}" y1="${Yp(ymax)}" y2="${Yp(ymax)}"/>
      <line class="axis" x1="${pad.l}" x2="${w - pad.r}" y1="${Yp(0)}" y2="${Yp(0)}"/>
      <text x="${pad.l - 4}" y="${Yp(ymax) + 3}" text-anchor="end">${ymax}</text>
      <text x="${pad.l - 4}" y="${Yp(0) + 3}" text-anchor="end">0</text>
      <text x="${pad.l}" y="${h - 4}">${esc(formatYear(x0))}</text>
      <text x="${w - pad.r}" y="${h - 4}" text-anchor="end">${esc(formatYear(x1))}</text>
      <path class="area" d="${area}"/><path class="line" d="${line}"/>
      ${now}<circle class="dot" cx="${X(cur.Y)}" cy="${Yp(cur.prov)}" r="4"/>
      <circle class="hover" r="4" cx="-10" cy="-10"/>
    </svg>
    <div class="chart-tip" hidden></div>
    <p class="fine">Provinces held, across all surveyed sheets. Peak: ${b.peak.prov} province${b.peak.prov === 1 ? '' : 's'} around ${esc(formatYear(b.peak.Y))}.</p>
  </div>`;
}

function wireChart() {
  const box = $('panel').querySelector('.chart');
  if (!box) return;
  const s = JSON.parse(box.dataset.series), x0 = +box.dataset.x0, x1 = +box.dataset.x1, ymax = +box.dataset.ymax;
  const svg = box.querySelector('svg'), tip = box.querySelector('.chart-tip'), dot = box.querySelector('circle.hover');
  const w = 340, h = 96, pad = { l: 30, r: 8, t: 8, b: 18 };
  const X = (Y) => pad.l + ((Y - x0) / Math.max(1, x1 - x0)) * (w - pad.l - pad.r);
  const Yp = (v) => pad.t + (1 - v / ymax) * (h - pad.t - pad.b);
  const move = (ev) => {
    const rect = svg.getBoundingClientRect();
    const vx = ((ev.clientX - rect.left) / rect.width) * w;
    const d = s.reduce((a, q) => (Math.abs(X(q[0]) - vx) < Math.abs(X(a[0]) - vx) ? q : a), s[0]);
    dot.setAttribute('cx', X(d[0])); dot.setAttribute('cy', Yp(d[1]));
    tip.hidden = false;
    tip.innerHTML = `<b>${esc(formatYear(d[0]))}</b> ${d[1]} province${d[1] === 1 ? '' : 's'} · ${fmtPop(d[2])} people`;
    tip.style.left = `${Math.min(rect.width - tip.offsetWidth, Math.max(0, (X(d[0]) / w) * rect.width - tip.offsetWidth / 2))}px`;
  };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerleave', () => { tip.hidden = true; dot.setAttribute('cx', -10); });
  svg.addEventListener('click', (ev) => {
    const rect = svg.getBoundingClientRect();
    const vx = ((ev.clientX - rect.left) / rect.width) * w;
    const d = s.reduce((a, q) => (Math.abs(X(q[0]) - vx) < Math.abs(X(a[0]) - vx) ? q : a), s[0]);
    setYear(d[0]);
  });
}

// How far this sheet's history has drifted from Terra's timeline at this date.
function driftNote(x, y) {
  const shift = eraShift(state.world.seed, x + 0.5, y + 0.5, state.Y);
  if (Math.abs(shift) < 150) return '';
  const rounded = Math.round(shift / 50) * 50;
  const E = state.Y + rounded;
  const yrs = Math.abs(rounded).toLocaleString('en-US');
  return `<p class="drift">At its centre, living in its own ${esc(formatYear(E))}: ${yrs} years ${shift > 0 ? 'ahead of' : 'behind'} Terra's timeline</p>`;
}

function worldsTag(p) {
  return p.tiles && p.tiles.size > 1 ? ` <em>${p.tiles.size} worlds</em>` : '';
}

function geoNote(x, y) {
  return getGeo(x, y).earth && state.Y === 2000 ? ' · Natural Earth figures' : ' · modelled';
}

function peoplesHere(x, y, st, geo) {
  const pops = new Map();
  for (const r of geo.regions) {
    const c = st.snap.culture[r.id];
    if (!c) continue;
    pops.set(c, (pops.get(c) || 0) + regionPop(r, st.snap.tech[r.id], state.Y));
  }
  const list = [...pops.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const tot = [...pops.values()].reduce((a, b) => a + b, 0) || 1;
  if (!list.length) return '';
  return `<section><h3>Peoples</h3><ul class="peoples">${list.map(([c, p]) => {
    const cu = state.world.cultures.get(c);
    const par = cu && cu.parent ? state.world.cultures.get(cu.parent) : null;
    return `<li><span class="sw" style="background:${cultureCss(state.world, c)}"></span><span class="pn">${esc(cu ? cu.name : '?')}${par ? ` <em>from ${esc(par.name)}</em>` : ''}</span><span class="num">${Math.round((100 * p) / tot)}%</span></li>`;
  }).join('')}</ul></section>`;
}

const KIND = { polity: 'State', war: 'War', culture: 'People', tech: 'Ideas', disaster: 'Disaster', contact: 'Contact', earth: 'Record' };

function chronicle(hist) {
  const evs = hist.events;
  if (!evs.length) return '<section><h3>Chronicle</h3><p class="note">A quiet millennium.</p></section>';
  const near = evs.reduce((best, e) => (Math.abs(e.y - state.Y) < Math.abs(best.y - state.Y) ? e : best), evs[0]);
  return `<section><h3>Chronicle, ${esc(formatRange(hist.t))}</h3><ol class="chron">${evs.map((e) => `
    <li class="ev k-${e.kind} ${e === near ? 'now' : ''}"><button class="yr" data-year="${e.y}" title="Go to ${esc(formatYear(e.y))}">${esc(formatYear(e.y))}</button>
    <span class="kind">${KIND[e.kind] || ''}</span><p>${esc(e.text)}</p></li>`).join('')}</ol></section>`;
}

function globalPowers() {
  const list = players(state.world, state.Y, null, 10);
  if (!list.length) return '';
  const max = list[0].gdp || 1;
  return `<section><h3>Leading powers of surveyed Big Earth, ${formatYear(state.Y)}</h3><ol class="powers">${list.map((p) => `
    <li ${p.bloc ? '' : `data-nation="${p.id}" class="pickable" tabindex="0" title="Open profile"`}><span class="sw" style="background:${p.bloc ? 'var(--marker)' : polityCss(state.world, p.id)}"></span>
      <span class="pn">${esc(p.name)}${worldsTag(p)}</span><span class="num">${fmtPop(p.pop)}</span><span class="num">${fmtMoney(p.gdp)}</span>
      <span class="bar"><i style="width:${Math.max(2, (100 * p.gdp) / max)}%"></i></span></li>`).join('')}</ol></section>`;
}

async function surveyRing(x, y, t) {
  for (const d of ['N', 'E', 'S', 'W']) {
    const p = neighbourPos(x, y, d);
    if (p) survey(p.x, p.y, t, true);
    await tick();
  }
  imgCache.clear(); toast('Surveyed the neighbouring sheets'); draw(); renderPanel();
}

async function surveyDeep(x, y, t) {
  if (state.busy) return;
  state.busy = true;
  const btn = $('deep');
  let n = 0;
  for (let tt = t; tt >= HISTORY_START / 1000; tt--) {
    if (state.world.hasTile(x, y, tt)) continue;
    if (!survey(x, y, tt, true)) break;
    n++;
    if (btn) btn.textContent = `Surveying ${formatYear(tt * 1000)}…`;
    await tick();
  }
  state.busy = false;
  imgCache.clear(); syncTime();
  toast(n ? `Surveyed ${n} millennia of ${state.world.tileName(x, y)}` : 'Already surveyed');
  draw(); renderPanel();
}

const tick = () => new Promise((r) => setTimeout(r, 0));

// ------------------------------------------------------------- legend

function renderLegend() {
  const L = $('legend');
  if (state.mode === 'tech') {
    L.innerHTML = `<span>Technology</span><span class="rampbar" style="background:linear-gradient(90deg,${[0, 0.2, 0.4, 0.6, 0.8, 1].map(rampCss).join(',')})"></span><span class="ends"><small>Foragers</small><small>Information age</small></span>`;
  } else if (state.mode === 'density') {
    L.innerHTML = `<span>People per cell</span><span class="rampbar" style="background:linear-gradient(90deg,${[0, 0.2, 0.4, 0.6, 0.8, 1].map(rampCss).join(',')})"></span><span class="ends"><small>Sparse</small><small>Dense</small></span>`;
  } else if (state.mode === 'political') {
    L.innerHTML = '<span>States; grey land is stateless</span>';
  } else if (state.mode === 'culture') {
    L.innerHTML = '<span>Language families; related peoples share hues</span>';
  } else {
    L.innerHTML = '<span>Climate and terrain at this date</span>';
  }
}

// ------------------------------------------------------------- dialogs

let toastTimer = 0;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}

$('saveBtn').addEventListener('click', () => { $('dlg').hidden = false; $('dlgMsg').textContent = ''; });
$('dlgClose').addEventListener('click', () => { $('dlg').hidden = true; });
$('copyCode').addEventListener('click', async () => {
  const code = await gzip(state.world.serialize());
  const ta = $('code');
  ta.value = code;
  try { await navigator.clipboard.writeText(code); $('dlgMsg').textContent = 'World code copied.'; } catch (e) {
    ta.select(); $('dlgMsg').textContent = 'Select the code above and copy it.';
  }
});
// embedded viewers can't save files; the world code covers that case
try { if (window.self !== window.top) $('download').hidden = true; } catch (e) { $('download').hidden = true; }
$('download').addEventListener('click', async () => {
  const blob = new Blob([await gzip(state.world.serialize())], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'big-earth-world.txt';
  a.click();
  $('dlgMsg').textContent = 'If no file appeared, use Copy world code instead.';
});
$('loadCode').addEventListener('click', async () => {
  try {
    const w = World.deserialize(await gunzip($('code').value.trim()));
    await adopt(w);
    $('dlg').hidden = true; toast('World loaded');
  } catch (e) { $('dlgMsg').textContent = 'That code could not be read. Paste the whole code, starting with gz:'; }
});
$('loadFile').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  $('code').value = await f.text();
  $('loadCode').click();
});
$('newWorld').addEventListener('click', () => { $('confirmNew').hidden = false; });
$('confirmNo').addEventListener('click', () => { $('confirmNew').hidden = true; });
$('confirmYes').addEventListener('click', async () => {
  const seed = Number($('seed').value) || Math.floor(Math.random() * 1e6);
  $('confirmNew').hidden = true; $('dlg').hidden = true;
  await adopt(newWorld(seed));
  toast(`New Big Earth, seed ${seed}`);
});

async function adopt(w) {
  state.world = w;
  prepareEarthGeo(w);
  imgCache.clear(); clearColorCache();
  state.Y = 2000; state.sel = { x: 0, y: 0 };
  $('seed').value = w.seed;
  syncTime(); draw(); renderPanel(); scheduleSave();
}

window.addEventListener('resize', resize);
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', draw);

// ---------------------------------------------------------------- boot

(async function boot() {
  const saved = await loadSaved();
  const w = saved || newWorld(20000);
  state.world = w;
  prepareEarthGeo(w);
  $('seed').value = w.seed;
  resize();
  state.cam = { cx: 0.5, cy: 0.5, scale: defaultScale() };
  renderLegend(); syncTime(); draw(); renderPanel();
  if (!saved) scheduleSave();
  $('loading').hidden = true;
})();
