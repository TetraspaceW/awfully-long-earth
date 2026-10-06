// The map legend and the map-mode buttons, both drawn from the map-mode registry.

import { mapModes, getMapMode } from '../render/modes.js';
import { rampCss } from '../render/palette.js';
import { $, esc } from './dom.js';

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
