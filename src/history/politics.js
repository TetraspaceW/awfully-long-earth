// Systems for states: how they emerge, expand, push in from neighbouring
// sheets, break apart, collapse, decline, reform, unite, and join the macro
// layer's interworld federations (for sheets running far enough ahead of
// Terra). Systems are { name, step(run, tick, rng) } (see nature.js).

import { clamp } from '../core/util.js';
import { Rng, hashN } from '../core/random.js';
import { federationAt, federationWorlds } from '../macro.js';
import { placeName, randomPhon, adjective } from '../names.js';
import { coreName, familyName, ofName } from './naming.js';

// ------------------------------------------------------------- shared helpers

// A state's power: its provinces here plus its holdings on neighbouring sheets.
function strength(run, pid, mem, s, Y) {
  let p = 0;
  for (const r of mem.get(pid) || []) p += run.power(r, Y);
  const e = run.extPower(pid, s, Y);
  return { p: p + e.p, extCount: e.c };
}

function attackRate(run, Y, pTech, tTech, pid) {
  const E = run.E(Y);
  const colonial = E >= 1500 && E < 1950 && pTech - tTech >= 1.5;
  let base = 0.3;
  if (E >= 1850) base = 0.05;
  if (E >= 1950) base = 0.004;
  if (E >= 2000) base = 0.03; // speculative: wars never quite end
  if (colonial) base = Math.max(base, 0.5);
  return base * (run.pol(pid).agg || 1);
}

const shortTitle = (n) => n.replace(/^(Kingdom|Republic|Federation|Empire|Commonwealth) of /, '');

// pid takes province r from q (0: stateless land).
export function annex(run, pid, r, q, Y, rng) {
  const { owner } = run.snap;
  const { log } = run;
  owner[r] = pid;
  if (q && run.E(Y) >= 1850 && owner.includes(q)) {
    const verb = log.pick(run.E(Y) >= 2000 ? ['seizes', 'annexes', 'occupies', 'wins', 'takes'] : ['seizes', 'annexes', 'conquers']);
    const war = log.chance(0.3) ? ` in the ${shortTitle(log.pname(pid, Y))}–${shortTitle(log.pname(q, Y))} War` : '';
    log.ev(Y, 'war', `${log.pref(pid, Y, true)} ${verb} ${log.rname(r)} from ${log.pref(q, Y)}${war}.`, pid);
  }
  const p = run.pol(pid);
  if (p.type === 'horde' && rng.chance(0.25)) run.snap.culture[r] = p.culture || run.snap.culture[r];
  if (q) capitalCheck(run, q, Y, pid);
}

// A state that lost its capital moves it, or dies.
function capitalCheck(run, q, Y, by) {
  const p = run.pol(q);
  if (p.macro || run.homeCapital(q) < 0 || run.snap.owner[p.capital.r] === q) return;
  let best = -1, bc = -1;
  for (let r = 0; r < run.n; r++) if (run.snap.owner[r] === q) { const c = run.cap(r, Y); if (c > bc) { bc = c; best = r; } }
  if (best >= 0) { p.capital = { x: run.x, y: run.y, r: best }; return; }
  for (const nb of run.nbs) {
    const rr = nb.hist.snaps[4].owner.indexOf(q);
    if (rr >= 0) { p.capital = { x: nb.x, y: nb.y, r: rr }; return; }
  }
  p.ended = Y;
  const { log } = run;
  log.ev(Y, 'war', by ? `${log.pref(q, Y, true)} is conquered by ${log.pref(by, Y)}.` : `${log.pref(q, Y, true)} is extinguished.`, q);
}

// A state's provinces here fall away; connected stretches of one people may
// become successor states.
export function fragment(run, pid, Y, rng, text) {
  const { owner, culture, tech } = run.snap;
  const { log } = run;
  const list = [];
  for (let r = 0; r < run.n; r++) if (owner[r] === pid) { list.push(r); owner[r] = 0; }
  if (!list.length) return;
  if (text) log.ev(Y, 'war', text, pid);
  const successors = [];
  for (const comp of run.components(list).flatMap((c) => run.byCulture(c))) {
    if (run.E(Y) < 1900) for (const r of comp) if (tech[r] >= 3) tech[r] = Math.max(2.5, tech[r] - rng.range(0.1, 0.6));
    const best = comp.reduce((a, b) => (tech[b] > tech[a] ? b : a));
    if (tech[best] < 2.6 || !culture[best] || !rng.chance(run.ctl.succ)) continue;
    const np = run.createPolity(best, Y, rng, { parent: pid });
    if (!np) continue;
    for (const r of comp) owner[r] = np;
    successors.push([np, comp.length]);
  }
  successors.sort((a, b) => b[1] - a[1]);
  if (successors.length && list.length >= 3) {
    const names = successors.slice(0, 3).map(([s]) => log.pref(s, Y));
    log.ev(Y, 'polity', `Successor states arise: ${names.join(', ')}${successors.length > 3 ? ` and ${successors.length - 3} more` : ''}.`, pid);
  }
}

// ------------------------------------------------------------------- systems

// States whose home has fallen lose their provinces here too.
export const fallen = {
  name: 'fallen',
  step(run, { Y }, rng) {
    const ended = new Set();
    for (const o of run.snap.owner) {
      if (!o || ended.has(o)) continue;
      const p = run.pol(o);
      if (!p.macro && p.ended != null && p.ended <= Y) ended.add(o);
    }
    for (const pid of ended) fragment(run, pid, Y, rng, `After the fall of ${run.log.pref(pid, Y)}, its provinces here go their own way.`);
  },
};

// States arise where farming societies are complex enough, more readily where
// the macro layer wants more of the land under states.
export const emergence = {
  name: 'emergence',
  step(run, { Y }, rng) {
    const { owner, tech, culture } = run.snap;
    const lt = run.targets(Y);
    for (let r = 0; r < run.n; r++) {
      if (owner[r] || !culture[r] || tech[r] < 2.6) continue;
      const cap = run.cap(r, Y);
      if (cap < 0.3) continue;
      const P = 0.025 * (tech[r] - 2.4) * Math.min(1, cap / 3) * (run.Er(r, Y) >= 1950 ? 6 : 1) * run.ctl.emerge
        * Math.exp(4 * (lt.S[r] - lt.Smean));
      if (!rng.chance(P)) continue;
      const pid = run.createPolity(r, Y, rng);
      if (pid && (tech[r] >= 3 || run.log.chance(0.3))) run.log.ev(Y, 'polity', `${run.log.pref(pid, Y, true)} is founded in ${run.log.rname(r)}.`, pid);
    }
  },
};

// States attack their neighbours, weighed by power, cohesion and era.
export const expansion = {
  name: 'expansion',
  step(run, { s, Y }, rng) {
    const { owner, tech, culture } = run.snap;
    const mem = run.members();
    const str = new Map();
    const S = (pid) => { if (!str.has(pid)) str.set(pid, strength(run, pid, mem, s, Y)); return str.get(pid); };
    for (const pid of rng.shuffle([...mem.keys()])) {
      const list = mem.get(pid);
      const p = run.pol(pid);
      if (p.macro || (p.ended != null && p.ended <= Y)) continue;
      const pt = run.meanTech(list);
      const st = S(pid);
      const size = list.length + st.extCount;
      const coh = clamp(1.25 - size / run.limit(pid, pt, Y), 0.03, 1);
      const tries = 1 + Math.min(3, Math.floor(size / 8));
      for (let k = 0; k < tries; k++) {
        const cand = new Set();
        for (const r of list) {
          if (owner[r] !== pid) continue;
          for (const o of run.neighbours(r, pt)) {
            if (owner[o] === pid || !culture[o] || run.cap(o, Y) < 0.05) continue;
            if (owner[o] && run.pol(owner[o]).macro) continue;
            cand.add(o);
          }
        }
        if (!cand.size) break;
        const r = rng.weighted([...cand], (o) => (run.cap(o, Y) + 0.3) * (owner[o] ? 1 : 1.5));
        const q = owner[r];
        let D;
        if (q) D = S(q).p * 1.1;
        else {
          D = run.power(r, Y) * 0.8 + 0.5;
          if (tech[r] < 2) D *= 0.3;
        }
        const A = st.p * coh;
        const ratio = A / (A + D);
        let P = attackRate(run, Y, pt, tech[r], pid) * ratio * ratio * 2 * (q ? 0.7 : 1) * run.ctl.consol * run.unity(r, Y);
        if (!q && tech[r] >= 2.6) P *= Math.min(1, run.ctl.emerge); // over target: stop swallowing stateless land
        if (rng.chance(Math.min(0.9, P))) annex(run, pid, r, q, Y, rng);
      }
    }
  },
};

// States on neighbouring sheets push across the edge.
export const incursions = {
  name: 'incursions',
  step(run, { s, Y }, rng) {
    const { owner, tech, culture } = run.snap;
    let mem = null;
    for (let r = 0; r < run.n; r++) {
      if (!run.ext[r].length || run.cap(r, Y) < 0.05 || !culture[r]) continue;
      const e = rng.pick(run.ext[r]);
      const sn = run.nbSnap(e.nb, s);
      const q = sn.owner[e.rr];
      if (!q || q === owner[r]) continue;
      const p = run.pol(q);
      if (!p || p.macro || (p.ended != null && p.ended <= Y)) continue;
      if (owner[r] && run.pol(owner[r]).macro) continue;
      const A = run.extPower(q, s, Y).p;
      if (owner[r] && !mem) mem = run.members();
      const D = owner[r] ? strength(run, owner[r], mem, s, Y).p * 1.2 : run.power(r, Y) * 0.8 + 0.5;
      const ratio = A / (A + D);
      const P = attackRate(run, Y, sn.tech[e.rr], tech[r], q) * ratio * ratio * 0.6;
      if (!rng.chance(Math.min(0.8, P))) continue;
      annex(run, q, r, owner[r], Y, rng);
      run.log.incursion(q, e.nb.dir, Y, r);
    }
  },
};

// Overextended and foreign-ruled provinces break away; after 1945, colonies.
export const secession = {
  name: 'secession',
  step(run, { s, Y }, rng) {
    const { culture, owner, tech } = run.snap;
    const { log } = run;
    for (const [pid, list] of run.members()) {
      if (list.length < 4) continue;
      const p = run.pol(pid);
      if (p.macro) continue;
      const pt = run.meanTech(list);
      const L = run.limit(pid, pt, Y);
      const foreignShare = list.filter((r) => culture[r] !== p.culture).length / list.length;
      const colonialShare = list.filter((r) => culture[r] !== p.culture && tech[r] < pt - 0.8).length / list.length;
      let P = (0.02 * Math.max(0, list.length / L - 0.6) + 0.015 * foreignShare) / run.ctl.consol;
      if (run.E(Y) >= 1945 && colonialShare > 0.2) P += 0.3; // decolonisation
      if (run.E(Y) >= 2000) P += 0.008; // independence movements
      if (!rng.chance(P)) continue;
      const capR = run.homeCapital(pid);
      const cx = capR >= 0 ? run.R[capR].cx : 120, cy = capR >= 0 ? run.R[capR].cy : 60;
      const rest = list.filter((r) => r !== capR);
      const seed = rng.weighted(rest, (r) => (culture[r] !== p.culture ? 3 : 1) * (1 + Math.hypot(run.R[r].cx - cx, run.R[r].cy - cy)));
      if (seed === undefined) continue;
      const cluster = run.cluster(seed, new Set(rest), Math.max(1, Math.round(list.length * rng.range(0.15, 0.4))),
        (o) => culture[o] === culture[seed]);
      const np = run.createPolity(seed, Y, rng, { parent: pid, type: run.E(Y) >= 1945 ? 'republic' : undefined });
      if (!np) continue;
      for (const r of cluster) owner[r] = np;
      if (cluster.length >= 2 || run.E(Y) >= 1800) {
        const verb = run.E(Y) >= 1945 ? 'wins independence from' : log.pick(['breaks away from', 'rebels against', 'throws off the rule of']);
        log.ev(Y, 'war', `${log.pref(np, Y, true)} ${verb} ${log.pref(pid, Y)}.`, np);
      }
    }
  },
};

// Overstretched, ageing or disaster-struck states collapse into successors.
export const collapse = {
  name: 'collapse',
  step(run, { s, Y, shocked }, rng) {
    const { log } = run;
    for (const [pid, list] of run.members()) {
      if (!run.isHome(pid)) continue;
      const p = run.pol(pid);
      if (p.macro) continue;
      const t = run.meanTech(list);
      const size = list.length + run.extPower(pid, s, Y).c;
      const L = run.limit(pid, t, Y);
      const age = Y - (p.founded ?? run.start - 200);
      // dynasties age; constitutional high-tech states mostly don't
      const ageing = Math.min(0.04, Math.max(0, age - 200) / 20000) * (t >= 8 ? 0.15 : 1);
      let P = (0.004 + 0.07 * Math.max(0, size / L - 0.85) + ageing) / run.ctl.consol * run.ctl.decay
        / run.unity(p.capital.r >= 0 ? p.capital.r : list[0], Y);
      if (p.type === 'horde') P *= 2.2;
      if (run.E(Y) >= 1850 && t >= 7.5) P *= run.E(Y) >= 2000 ? 0.5 : 0.15;
      if (shocked.has(p.capital.r)) P += 0.12;
      if (!rng.chance(P)) continue;
      p.ended = Y;
      const how = run.E(Y) >= 1850
        ? ['collapses in revolution', 'dissolves', 'breaks apart in civil war']
        : ['collapses', 'falls into civil war and breaks apart', 'is torn apart by rival claimants', 'fragments after its last strong ruler dies'];
      fragment(run, pid, Y, rng, `${log.pref(pid, Y, true)} ${log.pick(how)}${size >= 10 ? ` after ${Math.max(50, Y - (p.founded ?? Y - 200))} years` : ''}.`);
    }
  },
};

// When more land is under states than the macro target, small states decline
// into chiefdoms.
export const decline = {
  name: 'decline',
  step(run, { Y }, rng) {
    if (run.E(Y) >= 1900) return;
    const m = run.measure(Y);
    let excess = Math.round((m.S - run.ctl.Sstar - 0.03) * m.ready);
    if (excess <= 0) return;
    excess = Math.min(excess, Math.ceil(0.05 * m.ready));
    const mem = run.members();
    const small = rng.shuffle([...mem.keys()].filter((p) => {
      const q = run.pol(p);
      return mem.get(p).length <= 3 && run.isHome(p) && !q.macro && !q.earth;
    }));
    const { log } = run;
    for (const pid of small) {
      if (excess <= 0) break;
      const list = mem.get(pid);
      for (const r of list) run.snap.owner[r] = 0;
      run.pol(pid).ended = Y;
      excess -= list.length;
      if (list.length >= 2) log.ev(Y, 'polity', `${log.pref(pid, Y, true)} ${log.pick(['declines into scattered chiefdoms', 'is abandoned as its towns empty', 'dissolves into feuding clans'])}.`, pid);
    }
  },
};

// Kingdoms proclaim empires, revolutions found republics, constitutions
// change, and small kin states unite by marriage or vote.
export const reforms = {
  name: 'reforms',
  step(run, { Y }, rng) {
    const { log } = run;
    const mem = run.members();
    for (const [pid, list] of mem) {
      const p = run.pol(pid);
      if (!run.isHome(pid) || p.macro) continue;
      const t = run.meanTech(list);
      if (p.type === 'kingdom' && list.length >= 14 && rng.chance(0.2)) {
        const nm = `${p.adj} Empire`;
        p.type = 'empire';
        log.ev(Y, 'polity', `The ${p.name} proclaims itself the ${nm}.`, pid);
        run.rename(pid, Y, nm);
      } else if (run.E(Y) >= 2000 && rng.chance(p.type === 'federation' ? 0.004 : 0.012)) {
        const b = ofName(coreName(p));
        const nm = rng.pick([`Second Republic of ${b}`, `Commonwealth of ${b}`, `${b} Directorate`, `Free State of ${b}`, `Restored Kingdom of ${b}`, `People's Assembly of ${b}`]);
        run.rename(pid, Y, nm);
        log.ev(Y, 'polity', `${log.pick(['After a constitutional crisis', 'After years of unrest', 'In a bloodless revolution', 'After a disputed succession'])}, ${log.pref(pid, Y - 1)} becomes the ${nm}.`, pid);
      } else if (!['republic', 'federation', 'union'].includes(p.type) && run.E(Y) >= 1780 && t >= 7.3
        && rng.chance(p.type === 'kingdom' ? (run.E(Y) >= 2000 ? 0.008 : 0.06) : 0.15)) {
        const big = list.length >= 8;
        const nm = p.earth ? `Republic of ${ofName(p.name)}` : big && rng.chance(0.5) ? `Federation of ${p.base ?? p.adj}` : rng.chance(0.5) ? `${p.adj} Republic` : `Republic of ${p.base ?? p.adj}`;
        p.type = big ? 'federation' : 'republic';
        run.rename(pid, Y, nm);
        log.ev(Y, 'polity', `Revolution: ${log.pref(pid, Y - 1)} becomes the ${nm}.`, pid);
      }
    }
    // dynastic unions of small kin states
    if (!rng.chance(0.08 * run.ctl.consol)) return;
    for (const a of [...mem.keys()].filter((q) => mem.get(q).length < 6 && run.isHome(q))) {
      const ca = run.pol(a).culture;
      for (const r of mem.get(a)) {
        for (const o of run.R[r].adj) {
          const b = run.snap.owner[o];
          if (!b || b === a || run.pol(b).culture !== ca || !run.isHome(b)) continue;
          const [big, small] = (mem.get(b)?.length || 0) >= mem.get(a).length ? [b, a] : [a, b];
          for (let q = 0; q < run.n; q++) if (run.snap.owner[q] === small) run.snap.owner[q] = big;
          run.pol(small).ended = Y;
          log.ev(Y, 'polity', run.E(Y) >= 1800 ? `${log.pref(small, Y, true)} votes to join ${log.pref(big, Y)}.` : `A dynastic marriage unites ${log.pref(small, Y)} with ${log.pref(big, Y)}.`, big);
          return;
        }
      }
    }
  },
};

// ------------------------------------------------------------------- unions

// The speculative future: as technology rises, states unite (by treaty far more
// than by conquest), first into continental federations, then whole worlds;
// and blocs merge into single states.
export const unions = {
  name: 'unions',
  step(run, { s, Y }, rng) {
    if (run.E(Y) < 2000) return;
    const { world } = run;
    const mem = run.members();
    const info = new Map();
    let tsum = 0, tn = 0;
    for (const [pid, list] of mem) {
      const t = run.meanTech(list);
      info.set(pid, { t, size: list.length + run.extPower(pid, s, Y).c });
      tsum += t * list.length; tn += list.length;
    }
    const tAvg = tn ? tsum / tn : 0;
    const attempts = Math.ceil(mem.size * clamp((tAvg - 8.6) * 0.1 * run.ctl.consol, 0.005, 0.8));
    const free = (q) => mem.get(q)?.length && !run.pol(q).macro;
    for (let k = 0; k < attempts; k++) {
      const pids = [...mem.keys()].filter(free);
      if (pids.length < 2) break;
      const a = rng.weighted(pids, (p) => Math.sqrt(info.get(p)?.size || 1));
      const ia = info.get(a);
      const cand = new Set();
      for (const r of mem.get(a)) for (const o of run.neighbours(r, ia.t + 2)) {
        const b = run.snap.owner[o];
        if (b && b !== a && free(b)) cand.add(b);
      }
      if (!cand.size) continue;
      const rootA = world.cultureRoot(run.pol(a).culture);
      const b = rng.weighted([...cand], (q) => (world.cultureRoot(run.pol(q).culture) === rootA ? 3 : 1));
      const ib = info.get(b);
      const t = Math.min(ia.t, ib.t);
      if (t < 8.8 || ia.size + ib.size > 0.8 * run.limit(a, t, Y)) continue;
      unite(run, a, b, mem, info, Y, rng);
    }
    for (const bloc of world.blocs) {
      if (bloc.to || Y < Math.max(2050, bloc.from + 60)) continue;
      const here = bloc.members.filter((m) => mem.get(m)?.length);
      if (here.length < 3 || !rng.chance(0.04)) continue;
      const name = bloc.name.replace(/ (Union|Community|Compact)$/, '').replace(/^Council of (.*) States$/, '$1') + ' Federation';
      merge(run, here, here.flatMap((m) => mem.get(m)), name, Y, rng,
        `The ${here.length} members of the ${bloc.name} merge into a single state, the ${name}.`);
      bloc.to = Y;
      return;
    }
  },
};

// Two states become one: the much larger absorbs the smaller, equals federate.
function unite(run, a, b, mem, info, Y, rng) {
  const { log, world } = run;
  const [big, small] = info.get(a).size >= info.get(b).size ? [a, b] : [b, a];
  if (info.get(big).size >= 2 * info.get(small).size && run.isHome(small) && !run.extPower(small, 0, Y).c) {
    for (const r of mem.get(small)) run.snap.owner[r] = big;
    run.pol(small).ended = Y;
    log.ev(Y, 'polity', `${log.pref(small, Y, true)} ${log.pick(['accedes to', 'votes to join', 'is admitted to'])} ${log.pref(big, Y)}.`, big);
    info.get(big).size += info.get(small).size;
    mem.set(big, [...mem.get(big), ...mem.get(small)]);
    mem.set(small, []);
    return;
  }
  if (!run.isHome(a) || !run.isHome(b) || run.extPower(a, 0, Y).c || run.extPower(b, 0, Y).c) return;
  const root = world.cultureRoot(run.pol(a).culture);
  const fam = root === world.cultureRoot(run.pol(b).culture) ? world.cultures.get(root) : null;
  const size = info.get(a).size + info.get(b).size;
  const name = unionName(run, a, b, fam, size, Y, rng);
  const regs = [...mem.get(a), ...mem.get(b)];
  const np = merge(run, [a, b], regs, name, Y, rng, `${log.pref(a, Y, true)} and ${log.pref(b, Y)} unite as the ${name}.`);
  if (!np) return;
  info.set(np, { t: Math.min(info.get(a).t, info.get(b).t), size });
  mem.set(np, regs); mem.set(a, []); mem.set(b, []);
}

function unionName(run, a, b, fam, size, Y, rng) {
  const { world } = run;
  let habitable = 0;
  for (let r = 0; r < run.n; r++) if (run.cap(r, Y) >= 0.3) habitable++;
  if (size >= 0.4 * habitable) {
    const t = world.tileName(run.x, run.y).replace(/^the /, '');
    return rng.pick([`World State of ${t}`, `${t} Planetary Union`, `Federated ${t}`, `Commonwealth of ${t}`]);
  }
  const na = world.polityName(a, Y), nb = world.polityName(b, Y);
  const short = (n) => n.length <= 14 && !/Union|Federation|States|Commonwealth|Republic|Kingdom/.test(n);
  if (short(na) && short(nb) && rng.chance(0.5)) return `Union of ${ofName(na)} and ${ofName(nb)}`;
  if (fam && rng.chance(0.5)) {
    const w = rng.pick(size >= 60 ? ['Continental Federation', 'Union', 'Commonwealth'] : ['Federation', 'Union', 'United States']);
    return w === 'United States' ? `United ${familyName(fam)} States` : `${familyName(fam)} ${w}`;
  }
  const c = world.cultures.get(run.pol(a).culture);
  const base = placeName(c && c.phon ? c.phon : randomPhon(rng), rng);
  return rng.pick([`${adjective(base, c && c.phon, rng)} Federation`, `Federation of ${base}`, `${base} Concord`, `United ${base}`]);
}

// Several states become one new federation over `regs`.
function merge(run, pids, regs, name, Y, rng, text) {
  const first = run.pol(pids[0]);
  const home = run.homeCapital(pids[0]);
  const np = run.createPolity(home >= 0 ? home : regs[0], Y, rng, { type: 'federation', culture: first.culture, parent: pids[0] });
  if (!np) return 0;
  const p = run.pol(np);
  p.name = name;
  p.base = name;
  p.adj = name.replace(/^(Union of|United) /, '').replace(/ (Federation|Union|Commonwealth|Continental Federation|States|Compact|Community)$/, '');
  p.core = name.replace(/^(World State of|Federated|Commonwealth of|Federation of|United|Union of) /, '')
    .replace(/ (Planetary Union|Continental Federation|Federation|Union|Commonwealth|Concord|States)$/, '');
  for (const r of regs) run.snap.owner[r] = np;
  for (const q of pids) run.pol(q).ended = Y;
  run.log.ev(Y, 'polity', text, np);
  return np;
}

// At the end of a modern millennium: advanced kin states form blocs (the EU's
// counterparts), which count as one player and may later merge.
export function formBlocs(run, rng) {
  if (run.E(run.end) <= 1950 || run.E(run.start) >= 3000) return;
  const { world } = run;
  const mem = run.members();
  const byRoot = new Map();
  for (const p of mem.keys()) {
    if (!run.isHome(p) || run.pol(p).earth || run.meanTech(mem.get(p)) < 8.3) continue;
    const root = world.cultureRoot(run.pol(p).culture);
    if (!byRoot.has(root)) byRoot.set(root, []);
    byRoot.get(root).push(p);
  }
  for (const [root, list] of byRoot) {
    if (list.length < 3 || !rng.chance(0.6)) continue;
    const base = familyName(world.cultures.get(root));
    const from = Math.min(run.end, Math.max(run.start, 1950 - (run.E(run.start) - run.start)) + rng.int(0, 50));
    const name = rng.pick([`${base} Union`, `${base} Community`, `Council of ${base} States`, `${base} Compact`]);
    world.blocs.push({ id: world.id(), name, from, to: null, home: run.pos, members: list });
    run.log.ev(from, 'polity', `${list.length} states found the ${name}.`, 0, 0);
  }
}

// ---------------------------------------------------- interworld federations

// The polity record standing for a macro-layer federation, created in the
// world on first use by any sheet.
function federationPolity(world, fed, Y) {
  const key = fed.key;
  const id = world.byKey(key);
  if (id && world.polities.has(id)) return id;
  const rng = new Rng(hashN(world.seed, key));
  const sx = Math.floor(fed.core.gx), sy = Math.floor(fed.core.gy);
  const core = world.tileName(sx, sy).replace(/^the /, '');
  const name = rng.pick([`${core} Concord of Worlds`, `United Worlds of ${core}`, `${core} Interworld Federation`, `Commonwealth of the ${core} Worlds`]);
  return world.addPolity({
    key, name, adj: core, base: core, core, culture: 0, type: 'federation', macro: true,
    founded: Y, ended: null, capital: { x: sx, y: sy, r: -1 }, home: `${sx},${sy}`,
    color: [Math.round(rng.range(0, 360)), 70, 52], agg: 1,
  });
}

// The federation each province belongs to in year Y (0: none), and the macro
// record of each federation involved.
function federationTargets(run, Y) {
  const t = new Int32Array(run.n);
  const info = new Map();
  for (let r = 0; r < run.n; r++) {
    const fed = federationAt(run.world.seed, ...run.rpos[r], Y);
    if (!fed) continue;
    const F = federationPolity(run.world, fed, Y);
    t[r] = F;
    info.set(F, fed);
  }
  return { t, info };
}

// Make the sheet agree with the macro layer's federation domains in year Y:
// provinces outside a federation's domain secede, and states inside one accede.
function alignFederations(run, Y, rng) {
  const { t: tgt, info } = federationTargets(run, Y);
  const { owner } = run.snap;
  const { log } = run;
  // federal provinces whose domain has moved
  const out = new Map();
  for (let r = 0; r < run.n; r++) {
    const o = owner[r];
    if (!o || !run.pol(o).macro || tgt[r] === o) continue;
    if (tgt[r]) { owner[r] = tgt[r]; continue; } // frontier between two federations
    if (!out.has(o)) out.set(o, []);
    out.get(o).push(r);
  }
  for (const [G, regs] of out) {
    for (const comp of run.components(regs).flatMap((c) => run.byCulture(c))) {
      const best = comp.reduce((a, b) => (run.snap.tech[b] > run.snap.tech[a] ? b : a));
      const np = run.createPolity(best, Y, rng, { type: rng.pick(['republic', 'federation', 'union']) });
      if (!np) continue;
      for (const r of comp) owner[r] = np;
      if (comp.length >= 2) log.ev(Y, 'polity', `${log.pref(np, Y, true)} secedes from ${log.pref(G, Y)}.`, G);
    }
  }
  // provinces inside a domain join it, wherever the frontier happens to fall;
  // a state wholly inside joins as a whole
  for (const [pid, list] of run.members()) {
    const p = run.pol(pid);
    if (p.macro) continue;
    const counts = new Map();
    for (const r of list) if (tgt[r]) counts.set(tgt[r], (counts.get(tgt[r]) || 0) + 1);
    if (!counts.size) continue;
    for (const r of list) if (tgt[r]) owner[r] = tgt[r];
    const [F, inside] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const whole = inside === list.length;
    if (whole && run.isHome(pid) && !run.extPower(pid, 0, Y).c) p.ended = Y - 25;
    if (whole || inside >= 3) {
      const fed = info.get(F);
      const n = fed ? federationWorlds(run.world.seed, fed, Y) : 1;
      log.ev(Y, 'polity', whole
        ? `${log.pref(pid, Y, true)} accedes to ${log.pref(F, Y)}${n > 1 ? `, a federation reaching across ${n} worlds` : ''}.`
        : `${inside} provinces of ${log.pref(pid, Y)} vote to join ${log.pref(F, Y)}.`, F);
    }
  }
}

export const federations = {
  name: 'federations',
  step(run, { Y }, rng) { alignFederations(run, Y, rng); },
};
