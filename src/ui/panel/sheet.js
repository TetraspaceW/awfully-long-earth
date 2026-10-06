// Panel sections about the selected sheet and about all of revealed Big Earth.

import { formatYear } from '../../core/timeline.js';
import { fmtPop, fmtMoney } from '../../core/format.js';
import { EVENT_KINDS } from '../../lore/chronicle.js';
import { polityCss, cultureCss } from '../../render/palette.js';
import { esc, signed } from '../dom.js';

export function sheetHeader(app, x, y, st) {
  const { engine } = app;
  let chip = '<span class="chip">Unrevealed</span>';
  if (st) chip = st.hist.fixed ? '<span class="chip real">Real Earth</span>' : '<span class="chip gen">Generated</span>';
  return `<header class="sheet">
    <div class="sheet-id">Sheet ${signed(x)} / ${signed(y)}</div>
    <h2>${esc(engine.sheetName(x, y))}</h2>
    <div class="meta">${chip}<span>2000 CE</span></div>
    ${climateNote(app, x, y)}
    ${driftNote(app, x, y)}
  </header>`;
}

export function compass(app, x, y, st) {
  const { engine } = app;
  const t = st ? st.hist.t : engine.layer;
  const extendBtn = (dx, dy, label, arrow) => {
    const nx = x + dx, ny = y + dy;
    const exists = engine.isRevealed(nx, ny, t);
    const ok = st && engine.canReveal(nx, ny, t);
    const reason = exists ? 'Go there' : ok ? 'Reveal' : 'Not adjacent';
    const attr = exists ? `data-go="${nx},${ny}"` : `data-ext="${nx},${ny}"`;
    return `<button class="ext ${exists ? 'go' : ''}" ${ok || exists ? '' : 'disabled'} ${attr} title="${esc(reason)}">
      <span class="arrow" aria-hidden="true">${arrow}</span><span>${label}</span><small>${esc(reason)}</small></button>`;
  };
  return `<section>
    <h3>Reveal neighbouring worlds</h3>
    <div class="compass">
      ${extendBtn(0, -1, 'North', '↑')}
      ${extendBtn(-1, 0, 'West', '←')}
      ${extendBtn(1, 0, 'East', '→')}
      ${extendBtn(0, 1, 'South', '↓')}
    </div>
    <div class="row-btns">
      <button id="ring" ${st ? '' : 'disabled'}>Reveal all neighbours</button>
    </div>
  </section>`;
}

export function unrevealedNote(app, x, y) {
  return `<section><p class="note">This world has not been revealed yet.
      ${app.engine.canReveal(x, y) ? 'Click it on the map to generate it from the worlds around it.' : 'Reveal a world next to it first.'}</p></section>`;
}

// This sheet's climate state, against Terra's.
function climateNote(app, x, y) {
  const { dT, name } = app.engine.climate(x, y);
  const d = Math.round(dT);
  const rel = Math.abs(d) < 1 ? 'about as warm as Terra' : `${Math.abs(d)} °C ${d > 0 ? 'warmer' : 'colder'} than Terra`;
  return `<p class="climate"><b>${esc(name)}</b> climate, ${rel}.</p>`;
}

// How far this sheet's development has drifted from Terra's.
function driftNote(app, x, y) {
  const shift = app.engine.drift(x, y, app.Y);
  if (Math.abs(shift) < 150) return '';
  const yrs = Math.abs(Math.round(shift / 50) * 50).toLocaleString('en-US');
  return `<p class="drift">Its development runs about ${yrs} years ${shift > 0 ? 'ahead of' : 'behind'} Terra's.</p>`;
}

const worldsTag = (p) => (p.tiles && p.tiles.size > 1 ? ` <em>${p.tiles.size} worlds</em>` : '');

function powerList(app, list, withBlocSize) {
  const world = app.world;
  const max = list[0].gdp || 1;
  return `<ol class="powers">${list.map((p) => `
    <li ${p.bloc ? '' : `data-nation="${p.id}" class="pickable" tabindex="0" title="Open profile"`}><span class="sw" style="background:${p.bloc ? 'var(--marker)' : polityCss(world, p.id)}"></span>
      <span class="pn">${esc(p.name)}${withBlocSize && p.bloc ? ` <em>bloc of ${p.members.length}</em>` : ''}${worldsTag(p)}</span><span class="num">${fmtPop(p.pop)}</span><span class="num">${fmtMoney(p.gdp)}</span>
      <span class="bar"><i style="width:${Math.max(2, (100 * p.gdp) / max)}%"></i></span></li>`).join('')}</ol>`;
}

export function powersHere(app, x, y) {
  const { engine } = app;
  const only = new Set([engine.key(x, y)]);
  const list = engine.players(app.Y, only, 8);
  if (!list.length) return '<section><h3>Powers in this world</h3><p class="note">No states here: bands, villages and chiefdoms.</p></section>';
  const geoNote = engine.sheet(x, y).earth && app.Y === 2000 ? ' · Natural Earth figures' : ' · modelled';
  return `<section><h3>Powers in this world</h3>${powerList(app, list, true)}
    <p class="fine">Population · economy (present-day dollars)${geoNote}. Tap a state here or on the map for its profile.</p>
    ${allStatesHere(app, only)}</section>`;
}

// Every state holding land on this sheet, blocs broken out into their members.
function allStatesHere(app, only) {
  const world = app.world;
  const agg = [...app.engine.powers(app.Y, only).values()].sort((a, b) => b.gdp - a.gdp);
  if (agg.length <= 8) return '';
  return `<details class="allstates" ${app.state.allOpen ? 'open' : ''}><summary>All ${agg.length} states on this sheet</summary>
    <ol class="powers compact">${agg.map((a) => `
      <li data-nation="${a.id}" class="pickable" tabindex="0" title="Open profile"><span class="sw" style="background:${polityCss(world, a.id)}"></span>
        <span class="pn">${esc(world.polityName(a.id, app.Y))}</span><span class="num">${fmtPop(a.pop)}</span><span class="num">${a.regions} prov.</span></li>`).join('')}</ol></details>`;
}

export function peoplesHere(app, x, y) {
  const world = app.world;
  const all = app.engine.peoples(x, y, app.Y);
  const list = all.slice(0, 8);
  const tot = all.reduce((a, [, p]) => a + p, 0) || 1;
  if (!list.length) return '';
  return `<section><h3>Peoples</h3><ul class="peoples">${list.map(([c, p]) => {
    const cu = world.cultures.get(c);
    const par = cu && cu.parent ? world.cultures.get(cu.parent) : null;
    return `<li><span class="sw" style="background:${cultureCss(world, c)}"></span><span class="pn">${esc(cu ? cu.name : '?')}${par ? ` <em>from ${esc(par.name)}</em>` : ''}</span><span class="num">${Math.round((100 * p) / tot)}%</span></li>`;
  }).join('')}</ul></section>`;
}

// The sheet's last millennium, as backstory for how its present came about.
export function chronicle(hist) {
  const evs = hist.events.filter((e) => e.y <= 2000);
  if (!evs.length) return '<section><h3>How this world came to be</h3><p class="note">A quiet millennium.</p></section>';
  return `<section><details class="backstory" open><summary>How this world came to be</summary><ol class="chron">${evs.map((e) => `
    <li class="ev k-${e.kind}"><span class="yr">${esc(formatYear(e.y))}</span>
    <span class="kind">${EVENT_KINDS[e.kind] || ''}</span><p>${esc(e.text)}</p></li>`).join('')}</ol></details></section>`;
}

export function globalPowers(app) {
  const list = app.engine.players(app.Y, null, 10);
  if (!list.length) return '';
  return `<section><h3>Leading powers of revealed Big Earth</h3>${powerList(app, list, false)}</section>`;
}
