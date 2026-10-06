// The profile card of one state.

import { formatYear } from '../../core/timeline.js';
import { fmtPop, fmtMoney } from '../../core/format.js';
import { TYPE_LABEL } from '../../lore/government.js';
import { polityCss, cultureCss } from '../../render/palette.js';
import { esc } from '../dom.js';

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
    <p class="prose">${esc(b.government)}${b.alive && !b.p.macro && !b.p.earth ? ` It is led by ${esc(b.ruler)}.` : ''}</p>
    ${b.alive ? `<h3>What it can do</h3><p class="prose">${esc(b.life)}</p>` : ''}
    ${b.peoples.length ? `<h3>Peoples</h3><ul class="peoples">${b.peoples.map((c) => `
      <li><span class="sw" style="background:${cultureCss(world, c.id)}"></span><span class="pn">${esc(c.name)}${c.ruling ? ' <em>ruling people</em>' : c.from ? ` <em>from ${esc(c.from)}</em>` : ''}</span><span class="num">${Math.round(100 * c.share)}%</span></li>`).join('')}</ul>` : ''}
    <h3>Backstory</h3>
    <p class="prose">${esc(b.origin)}${b.parent ? ` It grew out of ${link(b.parent)}.` : ''}</p>
    ${also.length ? `<p class="fine">Also known as ${also.map(esc).join(', ')}.</p>` : ''}
    ${evs.length ? `<h3>Key events</h3><ol class="chron short">${evs.map((e) => `
      <li class="ev k-${e.kind}"><span class="yr">${esc(formatYear(e.y))}</span><span class="kind">${esc(e.where)}</span><p>${esc(e.text)}</p></li>`).join('')}</ol>` : ''}
    ${b.successors.length ? `<p class="prose">Successors: ${b.successors.map(link).join(', ')}.</p>` : ''}
  </section>`;
}
