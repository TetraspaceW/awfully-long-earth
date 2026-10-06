// The side panel: the selected state's profile (if any), the selected sheet,
// and the leading powers of revealed Big Earth.

import { formatYear } from '../core/frame.js';
import { fmtMoney, fmtPop } from '../core/util.js';
import { cultureCss, polityCss } from '../render.js';
import { $, esc, signed, speciesTag, tick } from './app.js';

// The side panel: the selected state's profile (if any), the selected sheet,
// and the leading powers of revealed Big Earth.


export function createPanel(app) {
  const el = $('panel');
  const { state, engine } = app;

  function render() {
    const { x, y } = state.sel;
    const st = engine.stateAt(x, y, app.Y);
    let html = sheetHeader(app, x, y, st) + compass(app, x, y, st);
    if (st) html += powersHere(app, x, y) + peoplesHere(app, x, y) + chronicle(st.hist);
    else html += unrevealedNote(app, x, y);
    html += globalPowers(app);
    if (state.nation) html = nationCard(app, state.nation) + html;
    el.innerHTML = html;
    el.querySelector('.allstates')?.addEventListener('toggle', (e) => { state.allOpen = e.target.open; });
  }

  // one set of delegated handlers survives every rerender
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button, [data-nation]');
    if (!b || !el.contains(b) || b.disabled) return;
    if (b.dataset.ext) {
      const [nx, ny] = b.dataset.ext.split(',').map(Number);
      app.reveal(nx, ny);
    } else if (b.dataset.go) {
      const [nx, ny] = b.dataset.go.split(',').map(Number);
      app.select(nx, ny);
      app.refresh();
    } else if (b.dataset.nation) {
      app.openNation(Number(b.dataset.nation));
    } else if (b.id === 'closeNation') {
      state.nation = 0;
      app.refresh();
    } else if (b.id === 'ring') {
      revealRing(state.sel.x, state.sel.y);
    }
  });
  el.addEventListener('keydown', (e) => {
    const b = e.target.closest('[data-nation]');
    if (!b || b.tagName === 'BUTTON' || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    app.openNation(Number(b.dataset.nation));
  });

  async function revealRing(x, y) {
    for (const d of ['N', 'E', 'S', 'W']) {
      engine.revealAround(x, y, [d]);
      await tick();
    }
    app.toast('Revealed the neighbouring worlds');
    app.refresh();
  }

  app.bus.on('panel', render);
  app.bus.on('panelTop', () => { el.scrollTop = 0; });
  return { render };
}

// Panel sections about the selected sheet and about all of revealed Big Earth.


export function sheetHeader(app, x, y, st) {
  const { engine } = app;
  let chip = '<span class="chip">Unrevealed</span>';
  if (st) chip = st.hist.fixed ? '<span class="chip real">Real Earth</span>' : '<span class="chip gen">Generated</span>';
  return `<header class="sheet">
    <div class="sheet-id">Sheet ${signed(x)} / ${signed(y)}</div>
    <h2>${esc(engine.sheetName(x, y))}</h2>
    <div class="meta">${chip}<span>2000 CE</span></div>
    ${climateNote(app, x, y)}
    ${speciesNote(app, x, y)}
    ${driftNote(app, x, y)}
  </header>`;
}

export function compass(app, x, y, st) {
  const { engine } = app;
  const extendBtn = (dx, dy, label, arrow) => {
    const nx = x + dx, ny = y + dy;
    const exists = engine.isRevealed(nx, ny);
    const ok = st && engine.canReveal(nx, ny);
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

// Which lineage became sapient on this sheet (nothing for Terra's humans).
function speciesNote(app, x, y) {
  const sp = app.engine.lineage(x, y, app.Y);
  if (!sp) return '';
  const lead = sp.notYet ? 'The lineage that will become sapient here' : 'The sapient lineage here';
  return `<p class="climate">${lead}: <b>${esc(sp.plural)}</b> (<i>${esc(sp.sci)}</i>). ${esc(sp.blurb)} <i>${esc(sp.habitat)}.</i></p>`;
}

// Spans of years, from "1,250" to "3.4 million" to "2.1 × 10^15".
function spanYears(n) {
  n = Math.abs(n);
  if (n < 1e6) return (n < 10000 ? Math.round(n / 50) * 50 : Math.round(n / 1000) * 1000).toLocaleString('en-US');
  if (n >= 1e15) { const e = Math.floor(Math.log10(n)); return `${(n / 10 ** e).toFixed(1)} × 10<sup>${e}</sup>`; }
  const [d, w] = [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million']].find(([d]) => n >= d);
  return `${(n / d).toFixed(n / d < 10 ? 1 : 0)} ${w}`;
}

// When this sheet's history parted from Terra's, and how far ahead or behind it runs.
function driftNote(app, x, y) {
  const shift = app.engine.drift(x, y, app.Y);
  if (Math.abs(shift) < 150) return '';
  const pod = app.engine.divergence(x, y, app.Y);
  const when = pod > 4.5e9 ? ' (before Terra itself formed)' : '';
  const own = app.Y + shift < -300000 ? ' No sapient species has arisen here yet.' : '';
  return `<p class="drift">Its history parted from Terra's about ${spanYears(pod)} years ago${when}, and it runs about ${spanYears(shift)} years ${shift > 0 ? 'ahead of' : 'behind'} Terra.${own}</p>`;
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
    return `<li><span class="sw" style="background:${cultureCss(world, c)}"></span><span class="pn">${esc(cu ? cu.name : '?')}${speciesTag(app, c)}${par ? ` <em>from ${esc(par.name)}</em>` : ''}</span><span class="num">${Math.round((100 * p) / tot)}%</span></li>`;
  }).join('')}</ul></section>`;
}

// Event categories shown in chronicles.
const EVENT_KINDS = { polity: 'State', war: 'War', culture: 'People', tech: 'Ideas', disaster: 'Disaster', contact: 'Contact', earth: 'Record' };

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

// The profile card of one state.


export function nationCard(app, pid) {
  const world = app.world;
  const b = app.engine.profile(pid, app.Y);
  if (!b) return '';
  const link = (n) => `<button class="linkish" data-nation="${n.id}">${esc(n.name)}</button>`;
  const also = b.names.map(([, n]) => n).filter((n, i, a) => n !== b.name && a.indexOf(n) === i);
  const stat = (label, value) => `<div class="stat"><span>${label}</span><b>${value}</b></div>`;
  const evs = b.events.slice(-14);
  return `<section class="nation" aria-label="Nation profile">
    <div class="nation-head">
      <span class="sw big" style="background:${polityCss(world, pid)}"></span>
      <div class="nation-title">
        <div class="sheet-id">${esc(b.typeLabel)}${b.p.earth ? ' · Terra record' : ''}</div>
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
    <p class="prose">${esc(b.government)}${b.alive && !b.p.macro && !b.p.earth ? ` It is led by ${esc(b.ruler)}.` : ''}</p>
    ${b.alive ? `<h3>What it can do</h3><p class="prose">${esc(b.life)}</p>` : ''}
    ${b.peoples.length ? `<h3>Peoples</h3><ul class="peoples">${b.peoples.map((c) => `
      <li><span class="sw" style="background:${cultureCss(world, c.id)}"></span><span class="pn">${esc(c.name)}${speciesTag(app, c.id)}${c.ruling ? ' <em>ruling people</em>' : c.from ? ` <em>from ${esc(c.from)}</em>` : ''}</span><span class="num">${Math.round(100 * c.share)}%</span></li>`).join('')}</ul>` : ''}
    ${b.species.length && !(b.species.length === 1 && b.species[0].id === 'human') ? `<h3>Who they are</h3>
      <p class="prose">${b.species.map((sp) => `${b.species.length > 1 ? `${Math.round(100 * sp.share)}% ` : ''}<b>${esc(sp.plural)}</b> (<i>${esc(sp.sci)}</i>)`).join(', ')}. ${esc(b.species[0].blurb)}</p>
      <p class="fine">Where they thrive: ${esc(b.species[0].habitat)}.</p>` : ''}
    <h3>Backstory</h3>
    <p class="prose">${esc(b.origin)}${b.parent ? ` It grew out of ${link(b.parent)}.` : ''}</p>
    ${also.length ? `<p class="fine">Also known as ${also.map(esc).join(', ')}.</p>` : ''}
    ${evs.length ? `<h3>Key events</h3><ol class="chron short">${evs.map((e) => `
      <li class="ev k-${e.kind}"><span class="yr">${esc(formatYear(e.y))}</span><span class="kind">${esc(e.where)}</span><p>${esc(e.text)}</p></li>`).join('')}</ol>` : ''}
    ${b.successors.length ? `<p class="prose">Successors: ${b.successors.map(link).join(', ')}.</p>` : ''}
  </section>`;
}
