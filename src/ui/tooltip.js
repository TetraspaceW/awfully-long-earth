// The map tooltip: what is under the pointer.

import { SEA_STATES } from '../geo/cells.js';
import { fmtPop } from '../core/format.js';
import { polityCss, cultureCss } from '../render/palette.js';
import { esc } from './dom.js';

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
    return `<b>${SEA_STATES[info.sea || 'water']}</b><span>${name} · ${deg}</span>`;
  }
  const { owner: o, culture: cu } = info;
  return `<b>${esc(info.regionName)}</b>
        <span>${o ? `<i class="sw" style="background:${polityCss(world, o)}"></i>${esc(world.polityName(o, app.Y))}` : 'No state'}</span>
        <span>${cu ? `<i class="sw" style="background:${cultureCss(world, cu)}"></i>${esc(world.cultureName(cu))}` : 'Uninhabited'}</span>
        <span>${esc(info.biomeName)} · ${deg} · ${cu ? esc(info.era) : '—'}${cu ? ` · ${fmtPop(info.pop)} people` : ''}</span>`;
}
