// The map: camera, drawing revealed sheets / fog / frames / labels, the tooltip,
// and pointer, wheel and button input.

import { H, W, tileKey } from '../core/frame.js';
import { fmtPop } from '../core/util.js';
import { cultureCss, polityCss } from '../render.js';
import { $, cssVar as css, esc, signed } from './app.js';

// The map camera: which part of Big Earth is on screen. Positions are in
// sheet units; a sheet is drawn `scale` pixels wide and scale / 2 tall.

export class Camera {
  constructor(cx = 0.5, cy = 0.5, scale = 400) { Object.assign(this, { cx, cy, scale, vw: 0, vh: 0 }); }

  setViewport(vw, vh) { this.vw = vw; this.vh = vh; }

  toScreen(tx, ty) { return [(tx - this.cx) * this.scale + this.vw / 2, (ty - this.cy) * this.scale / 2 + this.vh / 2]; }
  toSheet(sx, sy) { return [(sx - this.vw / 2) / this.scale + this.cx, ((sy - this.vh / 2) * 2) / this.scale + this.cy]; }

  // Zoom by factor f keeping screen point (sx, sy) fixed.
  zoomAt(sx, sy, f) {
    const [tx, ty] = this.toSheet(sx, sy);
    this.scale = Math.max(20, Math.min(4000, this.scale * f));
    const [nx, ny] = this.toSheet(sx, sy);
    this.cx += tx - nx; this.cy += ty - ny;
  }

  panBy(cx0, cy0, dx, dy) {
    this.cx = cx0 - dx / this.scale;
    this.cy = cy0 - (2 * dy) / this.scale;
  }

  defaultScale() { return Math.max(160, Math.min(this.vw / 2.4, this.vh * 2 / 2.4)); }

  centreOn(cx, cy, scale = this.defaultScale()) { Object.assign(this, { cx, cy, scale }); }

  // Fit a box of sheets [x0, x1] x [y0, y1] plus a margin of `pad` sheets.
  fit({ x0, x1, y0, y1 }, pad = 3) {
    const w = x1 - x0 + pad, hgt = y1 - y0 + pad;
    this.centreOn((x0 + x1 + 1) / 2, (y0 + y1 + 1) / 2, Math.max(20, Math.min(this.vw / w, (2 * this.vh) / hgt)));
  }
}

// Draws revealed sheets, fog over unrevealed ones, sheet frames and state
// labels onto the map canvas.


export function createMapView(app, canvas) {
  const ctx = canvas.getContext('2d');
  const { state, engine } = app;
  const cam = state.cam;
  const imgCache = new Map();
  let dpr = 1;

  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    cam.setViewport(r.width, r.height);
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    canvas.style.width = `${r.width}px`; canvas.style.height = `${r.height}px`;
    draw();
  }

  function tileImage(x, y, st) {
    const key = `${tileKey(x, y, st.hist.t)}|${app.Y}|${state.mode}|${state.nation}`;
    let c = imgCache.get(key);
    if (!c) {
      if (imgCache.size > 300) imgCache.clear();
      c = document.createElement('canvas');
      c.width = W; c.height = H;
      const px = engine.raster(x, y, state.mode, { Y: app.Y, focus: state.nation });
      c.getContext('2d').putImageData(new ImageData(px, W, H), 0, 0);
      imgCache.set(key, c);
    }
    return c;
  }

  function draw() {
    if (!engine.world) return;
    const { vw, vh } = cam;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = css('--sea-deep');
    ctx.fillRect(0, 0, vw, vh);
    ctx.imageSmoothingEnabled = false;
    const s = cam.scale, th = s / 2;
    const [l, t] = cam.toSheet(0, 0), [r, b] = cam.toSheet(vw, vh);
    const x0 = Math.floor(l), x1 = Math.ceil(r);
    const y0 = Math.floor(t), y1 = Math.ceil(b);
    const labels = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const [sx, sy] = cam.toScreen(x, y);
        const st = engine.stateAt(x, y, app.Y);
        if (st) {
          ctx.drawImage(tileImage(x, y, st), sx, sy, s, th);
          if (state.mode === 'political' && s > 260) labels.push(...polityLabels(x, y, st, sx, sy, s));
        } else {
          drawFog(x, y, sx, sy, s, th);
        }
        drawFrame(x, y, sx, sy, s, th);
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
  }

  // sheet frame & label
  function drawFrame(x, y, sx, sy, s, th) {
    const sel = state.sel.x === x && state.sel.y === y;
    ctx.strokeStyle = sel ? css('--marker') : css('--grid');
    ctx.lineWidth = sel ? 2.5 : 1;
    ctx.strokeRect(sx + 0.5, sy + 0.5, s - 1, th - 1);
    if (s > 120) {
      ctx.font = `600 ${Math.min(13, s / 22)}px ${css('--font-ui')}`;
      ctx.textBaseline = 'top';
      const label = `${engine.sheetName(x, y)}  ${signed(x)}/${signed(y)}`;
      ctx.fillStyle = 'rgba(10,14,20,0.55)';
      const w = ctx.measureText(label).width;
      ctx.fillRect(sx + 4, sy + 4, w + 10, Math.min(13, s / 22) + 8);
      ctx.fillStyle = sel ? css('--marker') : '#e9edf0';
      ctx.fillText(label, sx + 9, sy + 8);
    }
  }

  function polityLabels(x, y, st, sx, sy, s) {
    const geo = engine.sheet(x, y);
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
      out.push({ text: engine.world.polityName(o, app.Y), x: sx + (a.cx / a.w / W) * s, y: sy + (a.cy / a.w / H) * (s / 2), size });
    }
    return out;
  }

  // the hatch for unrevealed sheets, rebuilt when the colour scheme changes
  const hatch = document.createElement('canvas');
  hatch.width = hatch.height = 8;
  let fogFill = null, fogKey = '';
  function fogPattern() {
    const key = css('--fog') + css('--fog-line');
    if (fogFill && fogKey === key) return fogFill;
    const g = hatch.getContext('2d');
    g.clearRect(0, 0, 8, 8);
    g.fillStyle = css('--fog'); g.fillRect(0, 0, 8, 8);
    g.strokeStyle = css('--fog-line'); g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, 8); g.lineTo(8, 0); g.stroke();
    fogFill = ctx.createPattern(hatch, 'repeat'); fogKey = key;
    return fogFill;
  }

  function drawFog(x, y, sx, sy, s, th) {
    const ok = engine.canReveal(x, y);
    ctx.fillStyle = fogPattern();
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
        ctx.fillText('Reveal this world', cx, cy + r + 16);
        ctx.textAlign = 'left';
      }
    }
  }

  // Which sheet and cell is under screen point (sx, sy).
  function cellAt(sx, sy) {
    const [tx, ty] = cam.toSheet(sx, sy);
    const x = Math.floor(tx), y = Math.floor(ty);
    const i = Math.floor((tx - Math.floor(tx)) * W), j = Math.floor((ty - y) * H);
    return { x, y, i, j, k: j * W + i };
  }

  app.bus.on('draw', draw);
  app.bus.on('invalidate', () => imgCache.clear());
  window.addEventListener('resize', resize);
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', draw);

  return { canvas, draw, resize, cellAt };
}

// Pointer, wheel and button input on the map: pan, zoom, hover and click.


export function attachMapInput(app, view) {
  const { canvas } = view;
  const { state, engine } = app;
  const cam = state.cam;
  const tip = $('tip');
  let drag = null;

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, cx: cam.cx, cy: cam.cy, moved: false };
  });
  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (drag.moved) {
        cam.panBy(drag.cx, drag.cy, dx, dy);
        tip.hidden = true;
        view.draw();
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
  canvas.addEventListener('pointerleave', () => { tip.hidden = true; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  function zoomAt(sx, sy, f) { cam.zoomAt(sx, sy, f); view.draw(); }

  function hover(sx, sy) {
    const c = view.cellAt(sx, sy);
    tip.innerHTML = tooltipHtml(app, c);
    tip.hidden = false;
    const wrap = canvas.parentElement.getBoundingClientRect();
    const tw = tip.offsetWidth, tH = tip.offsetHeight;
    tip.style.left = `${Math.min(wrap.width - tw - 8, sx + 14)}px`;
    tip.style.top = `${Math.min(wrap.height - tH - 8, sy + 14)}px`;
  }

  // Clicking an unrevealed sheet reveals it; clicking a state opens its
  // profile, and clicking sea or stateless land closes it.
  function click(sx, sy) {
    const c = view.cellAt(sx, sy);
    app.select(c.x, c.y);
    const st = engine.stateAt(c.x, c.y, app.Y);
    if (!st) {
      state.nation = 0;
      if (app.reveal(c.x, c.y)) return;
    } else {
      const info = engine.cell(c.x, c.y, c.k, undefined, app.Y);
      state.nation = info.region >= 0 && !info.ocean ? info.owner || 0 : 0;
    }
    app.refresh();
    if (state.nation) app.bus.emit('panelTop');
  }

  $('zoomIn').addEventListener('click', () => zoomAt(cam.vw / 2, cam.vh / 2, 1.4));
  $('zoomOut').addEventListener('click', () => zoomAt(cam.vw / 2, cam.vh / 2, 1 / 1.4));
  $('home').addEventListener('click', () => { cam.centreOn(0.5, 0.5); app.select(0, 0); app.refresh(); });
  // fit every revealed sheet, plus a ring of unrevealed ones to reveal next
  $('whole').addEventListener('click', () => { cam.fit(engine.bounds()); view.draw(); });
}

// The map tooltip: what is under the pointer.


export function tooltipHtml(app, c) {
  const { engine } = app;
  const world = engine.world;
  const info = engine.cell(c.x, c.y, c.k, undefined, app.Y);
  const name = esc(engine.sheetName(c.x, c.y));
  if (!info.revealed) {
    return engine.canReveal(c.x, c.y)
      ? `<b>${name}</b><span>Unrevealed. Click to generate it from the worlds around it.</span>`
      : '<b>Unrevealed</b><span>Reveal a neighbouring sheet first.</span>';
  }
  const deg = `${Math.round(info.temp)} °C`;
  if (info.region < 0 || info.ocean) {
    return `<b>${info.seaName}</b><span>${name} · ${deg}</span>`;
  }
  const { owner: o, culture: cu } = info;
  return `<b>${esc(info.regionName)}</b>
        <span>${o ? `<i class="sw" style="background:${polityCss(world, o)}"></i>${esc(world.polityName(o, app.Y))}` : 'No state'}</span>
        <span>${cu ? `<i class="sw" style="background:${cultureCss(world, cu)}"></i>${esc(world.cultureName(cu))}` : 'Uninhabited'}</span>
        <span>${esc(info.biomeName)} · ${deg} · ${cu ? esc(info.era) : '—'}${cu ? ` · ${fmtPop(info.pop)} people` : ''}</span>`;
}
