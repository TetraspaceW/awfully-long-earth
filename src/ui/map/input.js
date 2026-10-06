// Pointer, wheel and button input on the map: pan, zoom, hover and click.

import { $ } from '../dom.js';
import { tooltipHtml } from '../tooltip.js';

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
