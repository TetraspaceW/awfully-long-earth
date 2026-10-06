// The side panel: the selected state's profile (if any), the selected sheet,
// and the leading powers of revealed Big Earth.

import { $, tick } from '../dom.js';
import { nationCard } from './nation.js';
import { sheetHeader, compass, unrevealedNote, powersHere, peoplesHere, chronicle, globalPowers } from './sheet.js';

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
      engine.revealAround(x, y, engine.layer, [d]);
      await tick();
    }
    app.toast('Revealed the neighbouring worlds');
    app.refresh();
  }

  app.bus.on('panel', render);
  app.bus.on('panelTop', () => { el.scrollTop = 0; });
  return { render };
}
