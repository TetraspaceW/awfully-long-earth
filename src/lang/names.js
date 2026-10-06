// Phonologies and names. Every culture gets a little sound system; polity, place
// and ruler names are drawn from it so that neighbouring names feel related.

const ONSETS = ['p', 'b', 't', 'd', 'k', 'g', 'm', 'n', 's', 'z', 'l', 'r', 'v', 'f', 'h', 'sh', 'ch',
  'j', 'th', 'kh', 'y', 'w', 'q', 'ts', 'x', 'gh', 'dr', 'tr', 'kr', 'br', 'pr', 'st', 'sk', 'ng', 'ny', 'mb', 'nd'];
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'aa', 'ei', 'ai', 'au', 'ou', 'y', 'ae', 'ia', 'ua', 'oe'];
const CODAS = ['n', 'm', 'r', 'l', 's', 'k', 't', 'sh', 'th', 'ng', 'x', 'nd', 'rt', 'st', 'lk', 'rn', 'z'];
const PLACE_ENDS = ['ia', 'a', 'an', 'ar', 'eth', 'os', 'is', 'um', 'ene', 'ara', 'ur', 'ai', 'esh', 'una',
  'ost', 'and', 'ika', 'ova', 'ir', 'ul', 'eia', 'orra', 'imba', 'ane', 'ath', 'ek'];
const ADJ_ENDS = ['ian', 'an', 'ese', 'i', 'ic', 'ite', 'ene', 'ish'];

// A phonology from a compact spec of space-separated sound lists
// ({ on, vo, co, ends, adj }), as used for Terra's language families.
export function phonFromSpec(e) {
  if (!e) return null;
  const sp = (s) => s.split(' ').filter(Boolean);
  return { on: sp(e.on), vo: sp(e.vo), co: sp(e.co), ends: sp(e.ends), adj: sp(e.adj), maxSyl: 3, codaP: e.co ? 0.3 : 0 };
}

export function randomPhon(rng) {
  const take = (arr, n) => rng.shuffle(arr.slice()).slice(0, n);
  return {
    on: take(ONSETS, rng.int(7, 14)),
    vo: ['a', 'i', ...take(VOWELS.slice(2), rng.int(2, 5))],
    co: take(CODAS, rng.int(0, 6)),
    ends: take(PLACE_ENDS, rng.int(3, 6)),
    adj: take(ADJ_ENDS, rng.int(1, 2)),
    maxSyl: rng.int(2, 3),
    codaP: rng.range(0.05, 0.5),
  };
}

// A daughter language: keeps most sounds, swaps a few.
export function mutatePhon(p, rng) {
  const q = JSON.parse(JSON.stringify(p));
  const swap = (arr, pool) => {
    if (arr.length && rng.chance(0.8)) arr.splice(rng.int(0, arr.length - 1), 1);
    const add = rng.pick(pool);
    if (!arr.includes(add)) arr.push(add);
  };
  swap(q.on, ONSETS); swap(q.on, ONSETS); swap(q.vo, VOWELS); swap(q.ends, PLACE_ENDS);
  if (rng.chance(0.4)) swap(q.co, CODAS);
  if (!q.on.length) q.on.push('t');
  if (!q.vo.length) q.vo.push('a');
  return q;
}

function syllable(p, rng, last) {
  let s = rng.pick(p.on) + rng.pick(p.vo);
  if (!last && p.co.length && rng.chance(p.codaP)) s += rng.pick(p.co);
  return s;
}

export function word(p, rng, minSyl = 1, maxLen = 9) {
  const n = rng.int(minSyl, Math.max(minSyl, p.maxSyl));
  let w = '';
  for (let i = 0; i < n; i++) {
    const syl = syllable(p, rng, i === n - 1);
    if (i >= minSyl && (w + syl).length > maxLen) break;
    w += syl;
  }
  return cap(clean(w));
}

export function shortWord(p, rng) {
  for (let i = 0; i < 6; i++) {
    const w = word(p, rng, 1, 5);
    if (w.length <= 5) return w;
  }
  return word(p, rng, 1, 5).slice(0, 5);
}

export function placeName(p, rng) {
  const base = word(p, rng, 1, 7).toLowerCase();
  let w = rng.chance(0.7) || base.length < 4 ? join(base, rng.pick(p.ends)) : base;
  if (w.length < 4) w = join(w, rng.pick(p.ends));
  if (w.length > 11) w = base.slice(0, 7) + rng.pick(p.ends).slice(-2);
  return cap(clean(w));
}

export function adjective(name, p, rng) {
  const n = name.toLowerCase();
  const end = p && p.adj.length ? p.adj[0] : 'ian';
  if (/ia$/.test(n)) return cap(n + 'n');
  if (/i$/.test(n)) return cap(n + 'an');
  if (/[aeiou]$/.test(n)) return cap(n.replace(/[aeiou]$/, '') + (end === 'ese' ? 'ese' : end === 'i' ? 'i' : 'an'));
  if (end === 'i' || end === 'ic' || end === 'ese' || end === 'ish') return cap(n + end);
  return cap(n + 'ian');
}

function join(a, b) {
  if (/[aeiouy]$/.test(a) && /^[aeiouy]/.test(b)) return a.slice(0, -1) + b;
  return a + b;
}

function clean(w) {
  return w.replace(/(.)\1+/g, '$1$1')
    .replace(/([aeiouyü])[aeiouyü]+([aeiouyü])/g, '$1$2')   // at most two vowels in a row
    .replace(/([^aeiouyü\s'-]{2})[^aeiouyü\s'-]+/g, '$1')   // at most two consonants in a row
    .replace(/^(ng|nd|mb|ny|x)/, (m) => m[m.length - 1]);
}

export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const EPITHETS = ['the Great', 'the Conqueror', 'the Lawgiver', 'the Unifier', 'the Bold', 'the Wise',
  'Ironhand', 'the Builder', 'the Restorer', 'the Pious', 'the Terrible', 'the Navigator', 'the Reformer',
  'the Red', 'the Lame', 'the Young', 'the Just', 'Stormborn', 'the Golden'];
const TITLES = ['King', 'Queen', 'Emperor', 'Empress', 'Khagan', 'High Chief', 'Archon', 'Consul',
  'Regent', 'Prophet-King', 'Warlord', 'General'];
const MODERN_TITLES = ['President', 'Premier', 'Chancellor', 'First Minister', 'General Secretary'];
// monarchies and theocracies keep their crowns into the modern era
const MONARCH_TITLES = {
  kingdom: ['King', 'Queen'], empire: ['Emperor', 'Empress'], chiefdom: ['High Chief', 'Paramount Chief'],
  theocracy: ['Supreme Leader', 'High Priest', 'Prophet-King'],
};

export function rulerName(p, rng, Y, type) {
  const name = word(p, rng, 2);
  const crowned = MONARCH_TITLES[type];
  if (Y >= 1850 && crowned) return `${rng.pick(crowned)} ${name}`;
  if (Y >= 1850 && type !== 'horde') return `${rng.pick(MODERN_TITLES)} ${name}`;
  const title = type === 'horde' ? rng.pick(['Khagan', 'Warlord', 'High Chief'])
    : type === 'republic' || type === 'league' ? rng.pick(['Consul', 'Archon', 'General', 'Doge'])
      : rng.pick(TITLES);
  return rng.chance(0.6) ? `${title} ${name} ${rng.pick(EPITHETS)}` : `${title} ${name}`;
}
