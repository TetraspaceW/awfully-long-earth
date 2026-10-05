// Phonologies and names. Every culture gets a little sound system; polity, place
// and ruler names are drawn from it so that neighbouring names feel related.

import { Rng } from './rng.js';

const ONSETS = ['p', 'b', 't', 'd', 'k', 'g', 'm', 'n', 's', 'z', 'l', 'r', 'v', 'f', 'h', 'sh', 'ch',
  'j', 'th', 'kh', 'y', 'w', 'q', 'ts', 'x', 'gh', 'dr', 'tr', 'kr', 'br', 'pr', 'st', 'sk', 'ng', 'ny', 'mb', 'nd'];
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'aa', 'ei', 'ai', 'au', 'ou', 'y', 'ae', 'ia', 'ua', 'oe'];
const CODAS = ['n', 'm', 'r', 'l', 's', 'k', 't', 'sh', 'th', 'ng', 'x', 'nd', 'rt', 'st', 'lk', 'rn', 'z'];
const PLACE_ENDS = ['ia', 'a', 'an', 'ar', 'eth', 'os', 'is', 'um', 'ene', 'ara', 'ur', 'ai', 'esh', 'una',
  'ost', 'and', 'ika', 'ova', 'ir', 'ul', 'eia', 'orra', 'imba', 'ane', 'ath', 'ek'];
const ADJ_ENDS = ['ian', 'an', 'ese', 'i', 'ic', 'ite', 'ene', 'ish'];

// Hand-made flavours for Earth's language families, so their descendants and
// offshoots beyond Earth's edges sound like they belong.
export const EARTH_PHON = {
  latin: { on: 'v l t c r m s p b d n f g', vo: 'a e i o u ae', co: 'n s r l x', ends: 'ia um us ana ensis ona ium', adj: 'ian an' },
  germanic: { on: 'w th b g h k l m n r s st sk fr gr', vo: 'a e i o u ea ei', co: 'n d rd ng ld rk th s', ends: 'land heim mark burg wald a', adj: 'ish ic' },
  celtic: { on: 'b c d g l m n r t br dr gw', vo: 'a e i o u ia', co: 'n r d c', ends: 'ia on os ach an', adj: 'ic ian' },
  slavic: { on: 'b v g d z k l m n p r s t ch sh zh pr kr sv', vo: 'a e i o u y', co: 'v n k sk l r', ends: 'ia ov ograd sk ava ina', adj: 'ian ic' },
  baltic: { on: 'k l v s t g d j r', vo: 'a e i u ai', co: 's n r', ends: 'ava ia as us', adj: 'ian' },
  hellenic: { on: 'p t k th ph kh l m n r s d', vo: 'a e i o y eu', co: 's n r', ends: 'os ia is on ene eia', adj: 'ian ic' },
  paleobalkan: { on: 'd t b z s m r', vo: 'a e i u', co: 's r z', ends: 'ava ia ara is', adj: 'ian' },
  albanian: { on: 'd sh k t b gj r l', vo: 'a e i u', co: 'r n t', ends: 'ia ar', adj: 'ian' },
  uralic: { on: 'k h j l m n p s t v', vo: 'a e i o u aa ii', co: 'n s t', ends: 'maa la ja ki', adj: 'ic ian' },
  turkic: { on: 'b t k q s y ch sh m ar o', vo: 'a e i o u ü', co: 'n r k q z sh', ends: 'stan ir kent ul abad', adj: 'ic i' },
  mongolic: { on: 'b t kh g s ts ch m n d', vo: 'a e i o u', co: 'n r g l', ends: 'ai or ul an', adj: 'ic ian' },
  tungusic: { on: 'n s m d g b kh', vo: 'a e i o u', co: 'n g r', ends: 'ai un en', adj: 'ic' },
  iranian: { on: 'p b t d k g s z sh kh f r m n', vo: 'a e i o u aa', co: 'r n sh d z', ends: 'an istan shahr ad ia', adj: 'ian i' },
  indoaryan: { on: 'p b t d k g bh dh s sh m n r v j ch', vo: 'a i u aa ii e o', co: 'n m r t', ends: 'pur ra desh nagar ala', adj: 'i an' },
  dravidian: { on: 'k t p m n v r l y ch', vo: 'a i u e o aa', co: 'l n m r', ends: 'ur am alai adu', adj: 'i an' },
  arabic: { on: 'q k t d s sh h kh m n r l b f z j', vo: 'a i u aa ii', co: 'r m n d b', ends: 'iya an ah ain', adj: 'i ite' },
  aramaic: { on: 'b g d k t m n s sh r', vo: 'a e i o', co: 'n t r', ends: 'a ath on', adj: 'ean ite' },
  hebrew: { on: 'b g d h k m n s sh r t y', vo: 'a e i o', co: 'n m l t', ends: 'el on a', adj: 'ite i' },
  egyptian: { on: 'p t k m n s h dj kh r w', vo: 'a e i u', co: 't n s', ends: 'et is os', adj: 'ian' },
  berber: { on: 't m g z y d n s r', vo: 'a i u', co: 't n s r', ends: 'it en ast', adj: 'ian i' },
  horn: { on: 'g d b k t m n s y w h', vo: 'a e i o u', co: 'l r n', ends: 'a o ar', adj: 'i an' },
  nilosaharan: { on: 'k t d n m l b g w', vo: 'a e i o u', co: 'n r k', ends: 'ur ok a', adj: 'i ese' },
  westafrican: { on: 'k g b d m n s y w kp gb f', vo: 'a e i o u', co: 'n', ends: 'a ou ba ye ne', adj: 'an i' },
  bantu: { on: 'mb nd ng k t z m n b l s w', vo: 'a e i o u', co: '', ends: 'a ve we ni ga', adj: 'an i' },
  khoisan: { on: 'k t g n ts x', vo: 'a e i o u', co: 'n b', ends: 'a ub', adj: 'i' },
  sinitic: { on: 'zh ch sh j q x h l m n b p d t g k s', vo: 'a e i o u ia ao ou ua', co: 'n ng', ends: 'an ing ou zhou', adj: 'ese' },
  tibetoburman: { on: 'b d g k t m n ny s sh ts ky gy', vo: 'a e i o u', co: 'n ng k', ends: 'pa ma ling yi', adj: 'an ese' },
  japonic: { on: 'k s t n h m y r w g z d b', vo: 'a e i o u', co: 'n', ends: 'shima kawa no to ya', adj: 'ese' },
  koreanic: { on: 'g n d r m b s j ch k t p h', vo: 'a eo o u eu i ae', co: 'n ng l k m', ends: 'ra ryeo seon', adj: 'an' },
  taikadai: { on: 'kh ph th s ch l n m b d', vo: 'a e i o u ai', co: 'ng n m', ends: 'ai ang ung', adj: 'ese i' },
  austroasiatic: { on: 'k t p ch m n ng s l v h', vo: 'a e i o u ie', co: 'm n ng t', ends: 'am ong et', adj: 'ese' },
  austronesian: { on: 'k t p m n ng l s r b d h', vo: 'a e i o u', co: 'n ng', ends: 'ua ana awa api', adj: 'an ese' },
  papuan: { on: 'k t p m n w y g', vo: 'a e i o u', co: 'n', ends: 'a i u', adj: 'an' },
  aboriginal: { on: 'k t p m n ng w y l r', vo: 'a i u', co: 'n l r', ends: 'arra unga', adj: 'an' },
  eskimo: { on: 'k q t n s', vo: 'a i u', co: 'q k t', ends: 'uq it aaq', adj: 'ian' },
  amerind_n: { on: 'k t m n s w ch sh h', vo: 'a e i o u', co: 'n k', ends: 'ota ewa ka anee', adj: 'an' },
  mesoamerican: { on: 'tl x ch k t m n p y', vo: 'a e i o', co: 'l n tl k', ends: 'tlan co pan al', adj: 'ec an' },
  andean: { on: 'k q t p ch s m n w y ll', vo: 'a i u', co: 'n q y', ends: 'ay ana suyu', adj: 'an' },
  amazonian: { on: 't p k m n j r w y', vo: 'a e i o u y', co: 'n', ends: 'ara ua upi', adj: 'an' },
  chibchan: { on: 'b t k s m n g', vo: 'a e i o u', co: 'n', ends: 'ca ta', adj: 'an' },
  caucasian: { on: 'k t ts dz g m n v l sh', vo: 'a e i o u', co: 'n r l', ends: 'eti ia an', adj: 'ian' },
  siberian: { on: 'k t ch n s y', vo: 'a e i o u', co: 'n k', ends: 'yr et', adj: 'ian' },
};

export function phonFromEarth(key) {
  const e = EARTH_PHON[key];
  if (!e) return null;
  const sp = (s) => s.split(' ').filter(Boolean);
  return { on: sp(e.on), vo: sp(e.vo), co: sp(e.co), ends: sp(e.ends), adj: sp(e.adj), maxSyl: 3, codaP: e.co ? 0.3 : 0 };
}

// Sound inventories for non-human peoples, as transliterated by humans.
const sp = (x) => x.split(' ').filter(Boolean);
const VOICES = {
  stocky: { on: 'g d b k h m n r t gr dr kh', vo: 'a o u aa oo', co: 'k g rk rg m n', ends: 'ag og ur urg aak' },
  small: { on: 'p t k l m n s w y pl tl', vo: 'i e a ee ia', co: 'n l', ends: 'i ee ini ika ip' },
  mammal: { on: 'h r m n w b g ch y gr hr', vo: 'a o u aa oo ou', co: 'r m n f', ends: 'oo ar um ouf aa' },
  cetacean: { on: "k' kl w wh ch tw ee", vo: 'ee ii oo ia ei', co: "k' !", ends: "ee'i ik-ik oo'a ii!" },
  reptile: { on: 'ss sk kr hs zh th z k t h', vo: 'a i aa ss ae', co: 'ss sk th k x', ends: 'ssa ith ak ess ix' },
  avian: { on: 'tr tw pr kr r l ch pi k', vo: 'ee i a ii ei', co: 'r rr t', ends: 'ree eek irri itt' },
  amphibian: { on: 'gl gr b bl m rr w ng', vo: 'oo u o ou', co: 'b rr m ng', ends: 'oop ub ung oor' },
  fish: { on: 'bl gl w l m b sh', vo: 'o u ou oo uu', co: 'b l sh', ends: 'oul ush ob oo' },
  mollusc: { on: 'th sh l s m n y', vo: 'u ai ae oi ui', co: 'th sh l', ends: 'uth aith oil yl' },
  insect: { on: 'tz kk zz x ch tch k t', vo: 'i e ee', co: 'k x tz kk', ends: 'ix ekk itz eex' },
  trichordate: { on: 'tr thr t r', vo: 'i ai ei', co: 'r', ends: 'tri-tri iri thrir' },
  radiate: { on: 'm n l y h ny', vo: 'u o a uu oo', co: 'm n', ends: 'umu ola alu oom' },
  fungal: { on: 'sp m r s mr sk', vo: 'o y u oo', co: 'r m s', ends: 'ory omm usk yr' },
  prokaryote: { on: 'x q z k v qx', vo: 'a e y', co: 'x q z', ends: '-7 -3 ax yx -12' },
  archaean: { on: 'm th h s sm thr', vo: 'e ei ae a', co: 'th m n', ends: 'eth ane ith -9' },
  xeno: { on: 'v vr zh ql y yl ph', vo: 'oa ue ai y', co: 'l vr zh', ends: 'oal yr ue ixa' },
};

export function randomPhon(rng, voice = null) {
  const take = (arr, n) => rng.shuffle(arr.slice()).slice(0, n);
  const v = voice && VOICES[voice];
  if (v) {
    return {
      on: take(sp(v.on), rng.int(4, sp(v.on).length)),
      vo: take(sp(v.vo), rng.int(2, sp(v.vo).length)),
      co: take(sp(v.co), rng.int(0, sp(v.co).length)),
      ends: take(sp(v.ends), rng.int(2, sp(v.ends).length)),
      adj: take(ADJ_ENDS, rng.int(1, 2)),
      maxSyl: rng.int(2, 3),
      codaP: rng.range(0.1, 0.5),
      voice,
    };
  }
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
  const v = q.voice && VOICES[q.voice];
  const pool = (k, dflt) => (v ? sp(v[k]) : dflt);
  swap(q.on, pool('on', ONSETS)); swap(q.on, pool('on', ONSETS)); swap(q.vo, pool('vo', VOWELS)); swap(q.ends, pool('ends', PLACE_ENDS));
  if (rng.chance(0.4) && pool('co', CODAS).length) swap(q.co, pool('co', CODAS));
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

export function newRng(seed) { return new Rng(seed); }
