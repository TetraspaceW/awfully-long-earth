// Draws revealed sheets, fog over unrevealed ones, sheet frames and state
// labels onto the map canvas.

import { W, H } from '../../core/grid.js';
import { tileKey } from '../../core/coords.js';
import { cssVar as css, signed } from '../dom.js';

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
