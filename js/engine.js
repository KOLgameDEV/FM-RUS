/* ============================================================
 * ENGINE — deterministic world, players, match, season logic
 * Rebuilt and improved from the original game's formulas.
 * Fixes vs original:
 *  - defence training focus now actually reduces opponent xG
 *  - bench slot attribute bonus no longer inverted
 * ============================================================ */
'use strict';

const ENG = (() => {

// ---------- utils ----------
function fnv(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function rng(seedStr) {
  let a = fnv(String(seedStr)) >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function poisson(lambda, rand) {
  // Knuth, cap 12
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rand(); } while (p > L && k < 13);
  return Math.min(12, k - 1);
}
const pick = (arr, rand) => arr[Math.floor(rand() * arr.length) % arr.length];
const rint = (rand, lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

// ---------- money ----------
// budgets/prices internally in mln ₽; wages in тыс ₽/нед; display currency is user-selectable
const CURS = [
  { code: 'rub', sym: '₽', perRub: 1, name: 'Рубли' },
  { code: 'usd', sym: '$', perRub: GD.RUB_PER_USD, name: 'Доллары' },
  { code: 'eur', sym: '€', perRub: Math.round(GD.RUB_PER_USD * 1.09), name: 'Евро' },
  { code: 'gbp', sym: '£', perRub: Math.round(GD.RUB_PER_USD * 1.27), name: 'Фунты' },
  { code: 'try', sym: '₺', perRub: 2.9, name: 'Лиры' },
  { code: 'brl', sym: 'R$', perRub: 18, name: 'Реалы' },
  { code: 'mxn', sym: 'MX$', perRub: 5.4, name: 'Песо' },
  { code: 'aed', sym: 'AED', perRub: 25, name: 'Дирхамы' },
  { code: 'cny', sym: '¥', perRub: 12.8, name: 'Юани' },
  { code: 'inr', sym: '₹', perRub: 1.1, name: 'Рупии' },
];
let CUR = 'rub';
function setCurrency(code) { if (CURS.some(c => c.code === code)) CUR = code; }
function getCurrency() { return CUR; }
function curDef() { return CURS.find(c => c.code === CUR) || CURS[0]; }
function shortNum(x) {
  const r = Math.round(x * 10) / 10;
  return (r % 1 === 0 ? r.toFixed(0) : r.toFixed(1)).replace('.', ',');
}
function moneyRub(rub) { // rub — сумма в рублях
  const d = curDef();
  const v = rub / d.perRub;
  const a = Math.abs(v);
  if (a >= 1e9) return shortNum(v / 1e9) + ' млрд ' + d.sym;
  if (a >= 1e6) return shortNum(v / 1e6) + ' млн ' + d.sym;
  if (a >= 1e3) return shortNum(v / 1e3) + ' тыс ' + d.sym;
  return Math.round(v) + ' ' + d.sym;
}
function F(mln) { return moneyRub(Math.round(mln) * 1e6); }
function IW(tysPerWeek) { return moneyRub(Math.round(tysPerWeek) * 1e3) + '/нед'; }
function USD(mlnRub) { return moneyRub(Math.round(mlnRub) * 1e6); }

// ---------- dates ----------
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
function toDate(str) { return new Date(str + 'T12:00:00'); }
function toISO(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function addDays(iso, n) { const d = toDate(iso); d.setDate(d.getDate() + n); return toISO(d); }
function fmtDate(iso) { const d = toDate(iso); return d.getDate() + ' ' + MONTHS[d.getMonth()]; }
function fmtDateFull(iso) { const d = toDate(iso); return WDAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
function fmtDDMM(iso) { const d = toDate(iso); return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0'); }
// winter break: Dec 7 .. Mar 1 blocked for league fixtures
function inWinter(d) { return (d.getMonth() === 11 && d.getDate() >= 7) || d.getMonth() < 2; }
function seasonCutoff(S) { return ((Number(S && S.season) || 2026) + 1) + '-06-01'; }
function seasonDate(S, mmdd) {
  const month = +mmdd.slice(0, 2);
  return (month >= 6 ? S.season : S.season + 1) + '-' + mmdd;
}
function competitionDate(S, base, spread, salt) {
  const rand = rng('calendar:' + S.season + ':' + (salt || '') + ':' + base);
  const date = addDays(seasonDate(S, base), rint(rand, -Math.abs(spread || 0), Math.abs(spread || 0)));
  const cutoff = seasonCutoff(S);
  return date > cutoff ? cutoff : date;
}
function seasonReady(S) { return !!S && (S.phase === 'review' || S.date >= seasonCutoff(S)); }

// ---------- player generation ----------
function attrM(rand, mean, spread) {
  return clamp(Math.round(mean + (rand() * 2 - 1) * (spread === undefined ? 1.7 : spread)), 4, 19);
}
const AGE_MULT = [[21, 1.55], [23, 1.28], [26, 1.05], [28, 0.82], [30, 0.55], [32, 0.32], [99, 0.18]];
function ageMult(age) { for (const [a, m] of AGE_MULT) if (age <= a) return m; return .18; }
function valModel(ovr, age, league, rep) {
  const lm = GD.LEAGUE_MULT[league] ?? .3;
  const rf = 0.62 + clamp(rep, 30, 95) / 180;
  return Math.pow(1.13, ovr - 60) * ageMult(age) * lm * rf;
}
// position-weighted attribute score -> display rating scale
function posScore(p) {
  const a = p;
  if (p.pos === 'GK') return a.gk * .72 + a.men * .16 + a.def * .12;
  if (['ST', 'AM', 'MR', 'ML'].includes(p.pos)) return a.sho * .3 + a.tec * .25 + a.pac * .25 + a.pas * .2;
  if (['DC', 'DR', 'DL'].includes(p.pos)) return a.def * .45 + a.strn * .2 + a.pac * .15 + a.men * .2;
  return a.pas * .3 + a.tec * .25 + a.men * .2 + a.def * .15 + a.sta * .1;
}
const rating = p => clamp(Math.round(30 + posScore(p) * 3.05), 44, 88);

// ---------- dynamic FC-27-style live rating ----------
// base ovr is moved by condition, morale, sharpness, recent form, injury/ban.
function recentAvg(p) {
  const a = (p.recent || []).slice(-5);
  if (!a.length) return null;
  return a.reduce((x, y) => x + y, 0) / a.length;
}
function dynMods(p) {
  const m = [];
  const cond = p.cond >= 90 ? 2 : p.cond >= 80 ? 1 : p.cond >= 70 ? 0 : p.cond >= 60 ? -2 : p.cond >= 45 ? -4 : -6;
  if (cond) m.push(['Тонус ' + p.cond, cond]);
  if (p.mor >= 85) m.push(['Отличный настрой', 1]);
  else if (p.mor < 35) m.push(['Кризис уверенности (' + p.mor + ')', -4]);
  else if (p.mor < 45) m.push(['Упал духом (' + p.mor + ')', -3]);
  if (p.sharp >= 80) m.push(['Свеж', 1]);
  else if (p.sharp < 45) m.push(['Сбитый игровой ритм', -2]);
  const ra = recentAvg(p);
  if (ra != null && ra >= 7.2) m.push(['Форма ' + ra.toFixed(2), 2]);
  else if (ra != null && ra <= 5.8) m.push(['Провал в форме ' + ra.toFixed(2), -4]);
  else if (ra != null && ra <= 6.3) m.push(['Форма ' + ra.toFixed(2), -2]);
  if (p.age >= 31) m.push(['Возраст ' + p.age, -Math.min(5, Math.round((p.age - 30) * 0.8))]);
  if (p.injured) m.push([(p.injuryType || 'Травма') + ' (' + p.injured + ' дн.)', -Math.min(8, 4 + Math.floor(p.injured / 7))]);
  if (p.ban) m.push(['Дисквалификация', -1]);
  return m;
}
function dynRating(p) {
  let r = p.ovr;
  dynMods(p).forEach(m => r += m[1]);
  return clamp(Math.round(r), 40, Math.max(44, p.pot));
}
// generated clubs are scaled down; real FC-27 players carry their own ovr
function fc27Equiv(p) {
  return p.real ? p.ovr : clamp(Math.round(30 + p.ovr * 0.7), 50, 86);
}

function ruName(rand, used) {
  for (let i = 0; i < 30; i++) {
    const first = pick(GD.NAMES_RU_FIRST, rand), last = pick(GD.NAMES_RU_LAST, rand);
    const full = first + ' ' + last;
    if (!used || !used.has(full)) { used && used.add(full); return { first, last }; }
  }
  const first = pick(GD.NAMES_RU_FIRST, rand), last = pick(GD.NAMES_RU_LAST, rand);
  return { first, last };
}
function natName(natKey, rand) {
  const pool = GD.NAT_POOL[natKey];
  return { first: pick(pool.first, rand), last: pick(pool.last, rand) };
}
function playerNat(club, rand) {
  const r = rand();
  if (GD.FOREIGN_LEAGUES.includes(club.league)) return { nat: (GD.NAT_POOL[club.league] || {}).nat || club.city, key: club.league };
  if (club.league === 'rpl' && club.rep > 68 && r < 0.22) {
    const st = pick(GD.STARS, rand);
    return { nat: st[2], star: st };
  }
  if (r < 0.08) return { nat: pick(['Беларусь', 'Казахстан', 'Армения', 'Узбекистан'], rand) };
  return { nat: 'Россия' };
}

// we() rebuilt: idxMod fixed (bench is weaker, not stronger)
function genPlayer(club, idx, pos, rand, usedNames) {
  const base = 6 + club.rep * 0.1;
  let age;
  let mediaArch = null;
  if (club.league === 'media') {
    // медийная лига: в основном юные новички или потерявшие форму ветераны
    const r = rand();
    if (r < 0.6) { age = rint(rand, 17, 22); mediaArch = 'young'; }
    else if (r < 0.92) { age = rint(rand, 29, 39); mediaArch = 'vet'; }
    else { age = rint(rand, 23, 28); mediaArch = 'ace'; }
  } else if (pos === 'GK' && rand() < 0.4) age = rint(rand, 28, 34);
  else age = rint(rand, 18, 32);
  const ageMod = age <= 21 ? -1.1 : age >= 33 ? -0.8 : 0.35;
  const idxMod = idx >= 16 ? -0.6 : idx >= 12 ? -0.2 : 0.4; // FIX: starters stronger
  const m = base + ageMod + idxMod;
  const a = {
    pac: attrM(rand, m), sta: attrM(rand, m), strn: attrM(rand, m),
    def: attrM(rand, m + ((pos === 'DC' || pos === 'DM') ? 1.4 : pos === 'GK' ? 0.4 : -0.6)),
    pas: attrM(rand, m + (pos === 'MC' || pos === 'DM' || pos === 'AM' ? 0.8 : -0.3)),
    tec: attrM(rand, m + (['AM', 'ML', 'MR'].includes(pos) ? 0.9 : 0)),
    sho: attrM(rand, m + (pos === 'ST' ? 1.8 : ['AM', 'MR', 'ML'].includes(pos) ? 0.7 : -1.4)),
    men: attrM(rand, m),
    gk: pos === 'GK' ? attrM(rand, m + 1.5, 1.2) : attrM(rand, 3, 1),
  };
  const nk = playerNat(club, rand);
  let name;
  if (nk.star) name = { first: nk.star[0], last: nk.star[1] };
  else if (nk.key) name = natName(nk.key, rand);
  else name = ruName(rand, usedNames);
  const p = {
    id: club.id + '-' + idx + '-' + Math.floor(rand() * 1e6),
    clubId: club.id, first: name.first, last: name.last,
    age, nat: nk.nat, pos, foot: rand() < 0.78 ? 'Прав' : 'Лев',
    ...a,
    cond: rint(rand, 78, 97), sharp: rint(rand, 55, 84), mor: rint(rand, 62, 89),
    contract: rint(rand, 1, 4),
    injured: 0, goals: 0, assists: 0, apps: 0, ratingSum: 0, yellow: 0, ban: 0, listed: false, recent: [],
  };
  let raw;
  if (club.league === 'media' && GD.MEDIA_BASE[club.id] !== undefined) {
    const b = GD.MEDIA_BASE[club.id];
    const archMod = mediaArch === 'young' ? rint(rand, -6, 0) : mediaArch === 'vet' ? rint(rand, -5, 1) : rint(rand, 2, 7);
    raw = clamp(b + archMod + (idx < 3 ? 1 : idx >= 12 ? -2 : 0) + Math.round((rand() - .5) * 4), 44, 74);
    p.ovr = raw;
    p.pot = mediaArch === 'young' ? clamp(raw + rint(rand, 5, 16), 44, 84) : raw + (rand() < 0.2 ? 1 : 0);
  } else {
    raw = clamp(Math.round(30 + ((pos === 'GK' ? p.gk : (p.def + p.sho + p.men) / 3)) * 3.05), 44, 88);
    p.pot = age <= 21 ? Math.min(88, raw + rint(rand, 6, 12))
      : age <= 24 ? Math.min(86, raw + rint(rand, 3, 6))
      : age <= 29 ? Math.min(86, raw + rint(rand, 0, 1))
      : raw + (rand() < 0.15 ? 1 : 0);
    p.ovr = Math.min(raw, p.pot);
  }
  p.growth = 0;
  const v = valModel(p.ovr, p.age, club.league, club.rep);
  p.value = Math.max(2, Math.round(v * 100));
  p.wage = Math.max(8, Math.round(v * 140));
  p.baseValue = p.value;
  return p;
}

function makeSquad(club, rand) {
  const used = new Set();
  const nums = new Set([1, 2]);
  const squad = [];
  GD.SQUAD_TEMPLATE.forEach((pos, idx) => {
    const p = genPlayer(club, idx, pos, rand, used);
    let n = idx === 0 ? 1 : idx === 1 ? 21 : rint(rand, 2, 97);
    while (nums.has(n)) n = rint(rand, 2, 97);
    nums.add(n); p.number = n;
    squad.push(p);
  });
  return squad;
}

// ---------- youth academy ----------
const YOUTH_TEMPLATE = ['GK', 'GK', 'DR', 'DL', 'DC', 'DC', 'DC', 'DC', 'DM', 'DM', 'MC', 'MC', 'MC', 'AM', 'MR', 'ML', 'ST', 'ST', 'ST', 'ST'];
const YOUTH_TRAITS = ['Техничный', 'Спринтер', 'Силовой', 'Лидер', 'Работяга', 'Точный пас', 'Хладнокровный', 'Второй этаж'];
function genYouthPlayer(S, idx) {
  const club = myClub(S), season = S.season;
  S.youthIntake = (S.youthIntake || 0) + 1;
  const rand = rng('academy:' + club.id + ':' + season + ':' + S.youthIntake + ':' + idx);
  const pos = YOUTH_TEMPLATE[idx % YOUTH_TEMPLATE.length];
  const age = rint(rand, 16, 20);
  const mean = clamp(11 + (club.rep - 50) * .035, 9.5, 14.5);
  const a = {
    pac: attrM(rand, mean + (['ST', 'MR', 'ML'].includes(pos) ? .8 : 0), 1.7),
    sta: attrM(rand, mean, 1.6), strn: attrM(rand, mean + (['DC', 'ST'].includes(pos) ? .7 : 0), 1.6),
    def: attrM(rand, mean + (['DC', 'DR', 'DL', 'DM'].includes(pos) ? 1.1 : -.5), 1.6),
    pas: attrM(rand, mean + (['MC', 'DM', 'AM'].includes(pos) ? .9 : -.2), 1.6),
    tec: attrM(rand, mean + (['AM', 'MR', 'ML'].includes(pos) ? 1 : 0), 1.6),
    sho: attrM(rand, mean + (pos === 'ST' ? 1.3 : ['AM', 'MR', 'ML'].includes(pos) ? .5 : -1), 1.6),
    men: attrM(rand, mean, 1.5),
    gk: pos === 'GK' ? attrM(rand, mean + 1.2, 1.3) : attrM(rand, 3, 1),
  };
  const nk = playerNat(club, rand);
  const name = nk.star ? { first: nk.star[0], last: nk.star[1] } : nk.key ? natName(nk.key, rand) : ruName(rand);
  const raw = clamp(48 + Math.round((mean - 11) * 2) + rint(rand, -3, 3), 45, 64);
  const growth = rint(rand, 5, 24);
  const pot = clamp(raw + growth, 62, 92);
  const usedNums = new Set((S.youth || []).filter(p => p.academyStatus !== 'released').map(p => p.number));
  let number = idx + 2;
  while (usedNums.has(number)) number = number % 97 + 2;
  const p = {
    id: 'youth-' + club.id + '-' + season + '-' + S.youthIntake + '-' + idx + '-' + Math.floor(rand() * 1e5),
    clubId: club.id, first: name.first, last: name.last,
    age, nat: nk.nat, pos, foot: rand() < .76 ? 'Прав' : 'Лев', number,
    ...a,
    ovr: raw, pot, growth: 0, development: 0,
    cond: rint(rand, 82, 99), sharp: rint(rand, 58, 82), mor: rint(rand, 70, 94),
    contract: 1, injured: 0, goals: 0, assists: 0, apps: 0, ratingSum: 0, yellow: 0, ban: 0, listed: false, recent: [],
    value: Math.max(.5, Math.round((raw - 42) * .12 * 10) / 10), wage: 8, baseValue: 1,
    youth: true, academyStatus: 'active', academyJoined: season,
    trait: YOUTH_TRAITS[(idx + fnv(club.id + S.youthIntake)) % YOUTH_TRAITS.length],
  };
  p.baseValue = p.value;
  return p;
}
function ensureYouthSquad(S) {
  S.youth = S.youth || [];
  S.youthIntake = S.youthIntake || 0;
  while (youthPlayers(S).length < 20) S.youth.push(genYouthPlayer(S, youthPlayers(S).length));
  return youthPlayers(S);
}
function youthPlayers(S) {
  return (S.youth || []).filter(p => !p.academyStatus || p.academyStatus === 'active');
}
function promoteYouth(S, pid) {
  const p = youthPlayers(S).find(x => x.id === pid);
  if (!p) return false;
  p.academyStatus = 'promoted';
  p.youth = false;
  p.contract = 3;
  p.wage = Math.max(14, Math.round(p.wage * 1.8));
  p.value = Math.max(3, Math.round(p.value * 2));
  p.baseValue = p.value;
  S.players.push(p);
  S.tactics.slots = autoLineup(S, S.clubId, S.tactics.formation).map(x => x.pid);
  ensureYouthSquad(S);
  addMsg(S, 'Академия', 'Первый контракт', fullName(p) + ' переведён в основной состав и подписал профессиональный контракт.');
  return true;
}
function releaseYouth(S, pid) {
  const p = youthPlayers(S).find(x => x.id === pid);
  if (!p) return false;
  p.academyStatus = 'released';
  ensureYouthSquad(S);
  addMsg(S, 'Академия', 'Решение по составу', fullName(p) + ' покинул академию. На его место приглашён новый игрок.');
  return true;
}
function trainYouth(S) {
  if (S.youthTrainedOn && S.date < addDays(S.youthTrainedOn, 7)) return { ok: false, why: 'cooldown' };
  if (S.budget < .5) return { ok: false, why: 'money' };
  S.budget = Math.round((S.budget - .5) * 10) / 10;
  S.youthTrainedOn = S.date;
  const rand = rng('youth-train:' + S.date + ':' + S.clubId);
  let grown = 0;
  youthPlayers(S).forEach(p => {
    p.development++;
    p.sharp = clamp(p.sharp + 3, 20, 100);
    if (p.ovr < p.pot && rand() < .16) { p.ovr++; p.growth++; grown++; }
  });
  return { ok: true, grown };
}
function advanceYouthSeason(S) {
  youthPlayers(S).forEach(p => {
    p.age++;
    p.growth = 0;
    if (p.age > 20) p.academyStatus = 'graduated';
    else if (p.ovr < p.pot && rng('academy-growth:' + p.id + S.season)() < .32) p.ovr++;
  });
  ensureYouthSquad(S);
  const active = S.youth.filter(p => !p.academyStatus || p.academyStatus === 'active');
  const archived = S.youth.filter(p => p.academyStatus && p.academyStatus !== 'active');
  S.youth = active.concat(archived.slice(-60));
}

// ---------- market pool players (deterministic, deep squad per extra country) ----------
const MARKET_BANDS = [[77, 85], [74, 82], [71, 79], [69, 77], [67, 75], [65, 73]];
// возраст чередуется по слоям, чтобы в каждом рынке были юноши, прайм и ветераны
const AGE_TIERS = [[17, 20], [21, 24], [25, 29], [30, 33], [34, 39]];
const MK_POS = ['GK', 'DR', 'DL', 'DC', 'DM', 'MC', 'AM', 'MR', 'ML', 'ST'];
function genMarketPlayer(mk, i, rand) {
  const pos = MK_POS[i % MK_POS.length];
  const band = mk.band || MARKET_BANDS[Math.min(MARKET_BANDS.length - 1, Math.floor(i / 8))];
  const tier = AGE_TIERS[i % AGE_TIERS.length];
  // в слабых лигах рейтинг тянется к нижней границе: 75+ там редкость
  const skew = mk.top || band[1] >= 72 ? rand() : Math.pow(rand(), 1.6);
  const ovr = band[0] + Math.floor((band[1] - band[0] + 1) * skew);
  const age = rint(rand, tier[0], tier[1]);
  const star = i === 0 && mk.star;
  const mean = 6 + (ovr - 30) / 3.05;
  const attr = () => clamp(Math.round(mean + (rand() * 2 - 1) * 1.7), 4, 19);
  const firsts = (GD.MARKET_NAMES[mk.id] || GD.NAMES_RU_FIRST);
  const lasts = (GD.MARKET_LAST[mk.id] || GD.NAMES_RU_LAST);
  const p = {
    id: 'pool:' + mk.id + ':' + i,
    clubId: 'pool:' + mk.id,
    first: pick(firsts, rand), last: pick(lasts, rand),
    age, nat: mk.country, pos, foot: rand() < 0.78 ? 'Прав' : 'Лев',
    pac: attr(), sta: attr(), strn: attr(), def: attr(), pas: attr(),
    tec: attr(), sho: attr(), men: attr(), gk: pos === 'GK' ? clamp(Math.round(mean + 1.5), 4, 19) : 4,
    cond: rint(rand, 80, 96), sharp: rint(rand, 55, 84), mor: rint(rand, 62, 89),
    contract: rint(rand, 1, 4), number: 0,
    injured: 0, goals: 0, assists: 0, apps: 0, ratingSum: 0, yellow: 0, ban: 0, listed: false, recent: [],
  };
  p.pot = age <= 21 ? Math.min(93, ovr + rint(rand, 4, 10)) : ovr;
  p.ovr = star ? Math.min(93, mk.star) : Math.min(ovr, p.pot);
  p.growth = 0;
  const v = Math.max(2, Math.round(Math.pow(1.13, p.ovr - 60) * ageMult(p.age) * mk.priceK * 100));
  p.value = v;
  p.baseValue = v;
  p.wage = Math.max(12, Math.round(v * 0.9));
  return p;
}
const MARKET_POOL_SIZE = 48;
function marketPlayers(mk) {
  const out = [];
  for (let i = 0; i < MARKET_POOL_SIZE; i++) {
    const rand = rng('pool-' + mk.id + '-' + i);
    out.push(genMarketPlayer(mk, i, rand));
  }
  return out;
}
function poolPlayers() {
  // пул заполняет и зарубежные лиги вне движка; inGame-чемпионаты уже покрыты клубными составами,
  // но для глубины добавляем туда скамейку свободных игроков этой лиги
  const out = [];
  for (const mk of GD.MARKETS) out.push(...marketPlayers(mk));
  return out;
}
function ensureMarketDepth(S) {
  if (!S || !Array.isArray(S.players)) return;
  const ids = new Set(S.players.map(p => p.id));
  const counts = new Map();
  S.players.forEach(p => {
    if (String(p.clubId).startsWith('pool:')) counts.set(p.clubId, (counts.get(p.clubId) || 0) + 1);
  });
  for (const mk of GD.MARKETS) {
    if ((counts.get('pool:' + mk.id) || 0) >= MARKET_POOL_SIZE) continue;
    for (const p of marketPlayers(mk)) {
      if (ids.has(p.id)) continue;
      ids.add(p.id);
      S.players.push(p);
    }
  }
  S.marketDepth = MARKET_POOL_SIZE;
}

// ---------- real FC-27 players (GD.REALS) ----------
function realPlayer(r, i) {
  const rand = rng('real-' + i + '-' + r.last);
  const mean = clamp((r.ovr - 30) / 3.05, 4, 19);
  const attr = (bias) => clamp(Math.round(mean + (bias || 0) + (rand() * 2 - 1) * 1.4), 4, 19);
  const pos = r.pos;
  const p = {
    id: 'real:' + i, clubId: r.free ? 'free' : 'pool:real',
    first: r.first, last: r.last, age: r.age, nat: r.nat, pos,
    foot: rand() < 0.78 ? 'Прав' : 'Лев',
    pac: attr(['ST', 'MR', 'ML', 'DR', 'DL'].includes(pos) ? 0.6 : 0),
    sta: attr(), strn: attr(pos === 'DC' || pos === 'DM' ? 0.6 : 0),
    def: attr(['DC', 'DM', 'DR', 'DL'].includes(pos) ? 0.8 : pos === 'GK' ? 0 : -2),
    pas: attr(['MC', 'DM', 'AM'].includes(pos) ? 0.7 : 0),
    tec: attr(['AM', 'ML', 'MR', 'MC'].includes(pos) ? 0.7 : 0),
    sho: attr(pos === 'ST' ? 1.2 : ['AM', 'MR', 'ML'].includes(pos) ? 0.4 : -1.2),
    men: attr(), gk: pos === 'GK' ? clamp(Math.round(mean + 1), 4, 19) : 4,
    cond: rint(rand, 78, 96), sharp: rint(rand, 58, 86), mor: rint(rand, 60, 90),
    contract: r.free ? 1 : rint(rand, 2, 4), number: 0,
    injured: 0, goals: 0, assists: 0, apps: 0, ratingSum: 0, yellow: 0, ban: 0, listed: false, recent: [],
    ovr: clamp(r.ovr, 44, 99), pot: clamp(Math.max(r.pot || r.ovr, r.ovr), 44, 99),
    growth: 0, real: true, freeAgent: !!r.free, era: !!r.era || (r.ovr >= 80 && r.age >= 33), realClub: r.free ? '' : (r.club || ''), league: r.league || 'other',
  };
  const usdM = Math.max(0.5, (r.fee || 1) * 1.12); // EUR -> USD
  p.baseValue = Math.max(2, Math.round(usdM * GD.RUB_PER_USD));
  p.value = p.baseValue;
  p.wage = Math.max(40, Math.round(p.baseValue * 0.55));
  return p;
}
function ensureReals(S) {
  if (!GD.REALS || !GD.REALS.length || !S || !Array.isArray(S.players)) return;
  const ids = new Set(S.players.map(p => p.id));
  let added = false;
  GD.REALS.forEach((r, i) => {
    const id = 'real:' + i;
    if (ids.has(id)) return;
    ids.add(id);
    S.players.push(realPlayer(r, i));
    added = true;
  });
  if (added) S.realsAdded = true;
}

// ---------- in-season value drift (like real markets) ----------
function revalueAll(S) {
  const clubs = new Map(S.clubs.map(c => [c.id, c]));
  S.players.forEach(p => {
    const club = clubs.get(p.clubId);
    if (!p.baseValue) p.baseValue = p.value || valModel(p.ovr, p.age, (club || { league: 'euro' }).league, (club || { rep: 70 }).rep) * 100;
    const d = dynRating(p) - p.ovr;
    let f = 1 + d * 0.06;
    if (p.apps) f += clamp(p.goals * 0.004 + p.assists * 0.002, 0, 0.18);
    if (p.injured) f -= 0.15;
    if (p.age >= 33) f -= (p.age - 33) * 0.08;
    if (p.age <= 21 && p.pot > p.ovr) f += 0.08;
    p.value = Math.max(1, Math.round(p.baseValue * clamp(f, 0.55, 2.2)));
  });
}

// ---------- bench (запас) ----------
const BENCH_MAX = 9;
function benchOf(S) {
  const starters = new Set(lineupPlayers(S, S.clubId, S.tactics).map(s => s.pid));
  return (S.bench || []).map(id => S.players.find(p => p.id === id))
    .filter(p => p && p.clubId === S.clubId && !starters.has(p.id));
}
function setBench(S, pid, on) {
  S.bench = S.bench || [];
  if (on) {
    if (S.bench.length >= BENCH_MAX) return false;
    if (!S.bench.includes(pid)) S.bench.push(pid);
  } else S.bench = S.bench.filter(x => x !== pid);
  return true;
}

// ---------- career/world bootstrap ----------
function newCareer(clubId, managerName) {
  const rand = rng('world-' + clubId + '-' + managerName);
  const clubs = JSON.parse(JSON.stringify(GD.CLUBS));
  const players = [];
  const nameUsed = new Set();
  for (const c of clubs) players.push(...makeSquad(c, rng('sq-' + c.id + '-' + c.league), nameUsed));
  players.push(...poolPlayers());

  const season = 2026;
  const fixtures = buildAllFixtures(clubs, season, rand);
  const club = clubs.find(c => c.id === clubId);
  const hashIdx = fnv(clubId);
  const tactics = {
    formation: GD.FORM_LIST[hashIdx % 6],
    slots: [],
    ...GD.TACTICS[hashIdx % 7],
    style: GD.TACTICS[hashIdx % 7].id,
  };
  const S = {
    v: 4, manager: (managerName || '').trim() || 'Алексей Орлов',
    clubId, date: season + '-07-01', season,
    clubs, players, fixtures,
    clubForm: {},
    inbox: welcomeMessages(club),
    tactics, budget: club.budget, balance: Math.round(club.budget * 0.35 * 10) / 10,
    confidence: 68, played: 0, focus: null, sacked: false, offers: [], log: [],
    kit: defaultKit(club, hashIdx),
    badSeasons: 0,
    cup: { byes: [], userOut: false, stage: 'live' },
    euro: { comp: null, stage: 'done', pts: 0, gf: 0, ga: 0, round: 0 },
    phase: 'season', difficulty: 'experienced', matchMins: 2,
    euroTickets: euroTicketsForClubs(clubs), bench: [],
    youth: [], youthIntake: 0, youthTrainedOn: null,
    managerRep: clamp(club.rep - 8, 35, 90), form: [], objectives: [],
    freeAgent: false, unemployedSince: null, jobOffers: [], applications: [],
    msgSeq: 5, boardWarnedPlayed: 0, lastAssistantReport: null,
  };
  S.tactics.slots = autoLineup(S, clubId, S.tactics.formation).map(x => x.pid);
  ensureReals(S);
  ensureMarketDepth(S);
  ensureYouthSquad(S);
  setObjectives(S);
  genCupFixtures(S);
  nextCupRegionRound(S);
  initEuro(S);
  S.clubHistory = seedClubHistory(S.clubs, season);
  return S;
}
function kitShift(hex, amt) {
  const n = parseInt(String(hex).slice(1), 16) || 0;
  const f = v => Math.max(0, Math.min(255, v + amt));
  return '#' + ((f(n >> 16 & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, '0');
}
function kitGap(a, b) {
  const pa = parseInt(String(a).slice(1), 16) || 0, pb = parseInt(String(b).slice(1), 16) || 0;
  return Math.abs((pa >> 16 & 255) - (pb >> 16 & 255)) + Math.abs((pa >> 8 & 255) - (pb >> 8 & 255)) + Math.abs((pa & 255) - (pb & 255));
}
const KIT_N = 24;               // must match UI.KIT_PATTERNS.length
const GK_HIGHVIS = ['#f5d000', '#b6ff3b', '#ff8c42', '#00e5ff', '#ff2d95', '#ffffff'];
function gkHighVis(avoid) {
  let best = GK_HIGHVIS[0], score = -1;
  GK_HIGHVIS.forEach(c => {
    const s = Math.min.apply(null, avoid.map(a => kitGap(c, a)));
    if (s > score) { score = s; best = c; }
  });
  return best;
}
function defaultKit(club, hashIdx) {
  const c2 = club.color2 === club.color ? kitShift(club.color, -60) : club.color2;
  const home = { design: hashIdx % KIT_N, primary: club.color, secondary: c2, shorts: c2.toLowerCase() === '#ffffff' ? club.color : c2, socks: club.color };
  const away = { design: (hashIdx + 11) % KIT_N, primary: club.color2 === '#ffffff' ? club.color : club.color2, secondary: club.color, shorts: club.color, socks: club.color2 };
  const goal = { design: 0, primary: gkHighVis([home.primary, home.secondary, away.primary]), secondary: '#111111', shorts: '#111111', socks: '#111111' };
  return { home, away, goal };
}
function welcomeMessages(club) {
  return [
    { id: 'm1', from: 'Президент клуба', subject: 'Добро пожаловать', date: '2026-07-11', read: false,
      body: 'Клуб «' + club.name + '» доверяет вам команду. Задача — радовать болельщиков и не разочаровывать совет. Бюджет: ' + F(club.budget) + '.' },
    { id: 'm2', from: 'Спортивный директор', subject: 'Трансферное окно', date: '2026-07-11', read: false,
      body: 'Летнее окно до 12 сентября, зимнее — 20 января по 25 февраля. Цены на рынке в долларах, курсы фиксирует клубный бухгалтер: 92 рубля за доллар.' },
    { id: 'm3', from: 'Помощник', subject: 'Первое собрание', date: '2026-07-11', read: false,
      body: 'Состав готов, тактика по умолчанию выставлена под характер клуба. Средний тонус следите на «Кабинете»: ниже 65 нужна восстановительная тренировка.' },
    { id: 'm4', from: 'Начальник академии', subject: 'Молодёжная команда', date: '2026-07-11', read: false,
      body: 'В академии 20 воспитанников 16–20 лет. Следите за OVR и POT, проводите развивающие тренировки и подписывайте лучших игроков в основу.' },
    { id: 'm5', from: 'Медицинский штаб', subject: 'Как работают травмы', date: '2026-07-11', read: false,
      body: 'Красный крест рядом с игроком означает травму. Такой футболист автоматически пропускает матчи до даты восстановления; важные медицинские письма открываются сразу.' },
  ];
}

// ---------- tactics helpers ----------
function hashIdx(str, mod) { return fnv(str) % mod; }
function tacOf(S, clubId) {
  const c = S.tactics && clubId === S.clubId ? S.tactics : null;
  if (c) return c;
  const h = fnv(clubId);
  const preset = GD.TACTICS[h % 7];
  return { formation: GD.FORM_LIST[h % 6], slots: [], style: preset.id, mentality: preset.mentality, press: preset.press, tempo: preset.tempo, line: preset.line, width: preset.width };
}
function ht(tac) {
  const ment = tac.mentality || 0, press = tac.press || 2, tempo = tac.tempo || 2, line = tac.line || 2, width = tac.width || 2;
  let mod = 1 + ment * .02;
  mod *= 1 + (press - 2) * .015;
  let att = (1 + Math.max(0, ment) * .045) * (1 + (tempo - 2) * .035) * (1 + (width - 2) * .03) * mod;
  let def = (1 + Math.max(0, -ment) * .045) * (1 + (2 - line) * .04) * mod;
  const concede = 1 + (line - 2) * .045 + Math.max(0, press - 2) * .02;
  const st = tac.style;
  if (st === 'bus') { att *= .84; def *= 1.16; }
  else if (st === 'counter') { att *= ment <= 0 ? 1.1 : 1.04; def *= 1.06; }
  else if (st === 'direct') att *= 1.08;
  else if (st === 'gegen') { att *= 1.1; def *= .94; }
  else if (st === 'wing') att *= 1.06;
  else if (st === 'vertical') { att *= 1.09; def *= .98; }
  else if (st === 'tiki') { att *= tempo <= 2 ? 1.06 : 1.02; def *= 1.03; }
  return { att, def, concede };
}

// ---------- slot fit ----------
function adapt(p, slotPos) { return GD.ADJ[p.pos] && GD.ADJ[p.pos][slotPos] !== undefined ? GD.ADJ[p.pos][slotPos] : 0.28; }
function ft(p, slotPos) {
  const a = p;
  let r;
  if (slotPos === 'GK') r = a.gk * .75 + a.men * .15 + a.def * .1;
  else if (slotPos === 'DC' || slotPos === 'DR' || slotPos === 'DL') r = a.def * .5 + a.strn * .18 + a.pac * .14 + a.men * .18;
  else if (slotPos === 'DM') r = a.def * .32 + a.pas * .28 + a.men * .22 + a.tec * .18;
  else if (slotPos === 'MC') r = a.pas * .32 + a.tec * .24 + a.men * .18 + a.sta * .14 + a.def * .12;
  else if (slotPos === 'AM' || slotPos === 'MR' || slotPos === 'ML') r = a.tec * .28 + a.pac * .24 + a.pas * .2 + a.sho * .18 + a.men * .1;
  else r = a.sho * .4 + a.pac * .24 + a.tec * .2 + a.strn * .16; // ST
  r = r * .42 + (p.ovr / 5.15) * .58;
  const form = (.72 + p.cond / 380) * (.82 + p.mor / 560) * (.86 + p.sharp / 700);
  const ageF = p.age >= 36 ? .74 : p.age >= 34 ? .8 : p.age >= 32 ? .86 : p.age >= 30 ? .9 : p.age <= 19 ? .96 : 1;
  const condF = p.cond < 48 ? .8 : p.cond < 62 ? .88 : p.cond < 75 ? .95 : 1;
  return r * adapt(p, slotPos) * form * ageF * condF;
}
function available(p) { return !p.injured && !p.ban; }

// greedy auto-lineup: maximizes total slot fit
function autoLineup(S, clubId, formation) {
  const slots = GD.FORMATIONS[formation] || GD.FORMATIONS['4-3-3'];
  const squad = S.players.filter(p => p.clubId === clubId && available(p));
  const chosen = [];
  const used = new Set();
  slots.forEach((slot, i) => {
    let best = null, bestV = -1;
    for (const p of squad) {
      if (used.has(p.id)) continue;
      const v = ft(p, slot.pos) + (p.pos === slot.pos ? 0.3 : 0);
      if (v > bestV) { bestV = v; best = p; }
    }
    if (best) { used.add(best.id); }
    chosen.push({ slot: i, pos: slot.pos, pid: best ? best.id : null, fit: bestV });
  });
  return chosen;
}
function lineupPlayers(S, clubId, tac) {
  let plan = (tac.slots && tac.slots.length === 11) ? tac.slots.map((pid, i) => ({ slot: i, pos: GD.FORMATIONS[tac.formation][i].pos, pid })) : autoLineup(S, clubId, tac.formation);
  plan.forEach(s => { if (!s.pid) return; const p = S.players.find(x => x.id === s.pid); if (!p || !available(p)) s.pid = null; });
  // fill holes from bench
  const missing = plan.filter(s => !s.pid).map(s => s.slot);
  if (missing.length) {
    const used = new Set(plan.filter(s => s.pid).map(s => s.pid));
    const bench = S.players.filter(p => p.clubId === clubId && available(p) && !used.has(p.id));
    for (const slotIdx of missing) {
      const pos = GD.FORMATIONS[tac.formation][slotIdx].pos;
      let best = null, bv = -1;
      for (const p of bench) { if (used.has(p.id)) continue; const v = ft(p, pos); if (v > bv) { bv = v; best = p; } }
      if (best) { plan[slotIdx].pid = best.id; used.add(best.id); }
    }
  }
  return plan.filter(s => s.pid);
}
function teamScores(S, clubId, tac) {
  const plan = lineupPlayers(S, clubId, tac);
  const vals = plan.map(s => ft(S.players.find(p => p.id === s.pid), s.pos));
  if (!vals.length) return { avg: 8, att: 8, def: 8, plan };
  const attSet = ['AM', 'MR', 'ML', 'ST', 'MC'];
  const attV = vals.filter((v, i) => attSet.includes(plan[i].pos));
  const defV = vals.filter((v, i) => !attSet.includes(plan[i].pos));
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const m = ht(tac);
  return {
    avg, plan,
    att: (attV.length ? attV.reduce((a, b) => a + b, 0) / attV.length : avg) * m.att,
    def: (defV.length ? defV.reduce((a, b) => a + b, 0) / defV.length : avg) * m.def,
  };
}

// ---------- difficulty ----------
function ovrXI(S, clubId, tac) {
  const plan = lineupPlayers(S, clubId, tac);
  if (!plan.length) return 50;
  return plan.reduce((a, s) => a + S.players.find(p => p.id === s.pid).ovr, 0) / plan.length;
}
const DIFFS = {
  novice: { scale: 1.08, desc: 'Почти все ваши матчи заканчиваются победой.' },
  experienced: { scale: 1.0, desc: 'Честный футбол: фаворит выигрывает, но сенсации возможны.' },
  pro: { scale: 0.92, desc: 'Соперники собраннее, очки даются тяжело.' },
  world: { scale: 0.82, desc: 'Элита против вас: каждый матч как экзамен.' },
};
function effectiveTeamScores(S, clubId, tac) {
  const base = teamScores(S, clubId, tac);
  const history = clubHistoryProfile(S, clubId);
  return {
    ...base,
    att: base.att * history.att * history.form,
    def: base.def * history.def,
    history,
  };
}
function lambdas(S, homeId, awayId) {
  const hTac = tacOf(S, homeId), aTac = tacOf(S, awayId);
  const H = effectiveTeamScores(S, homeId, hTac), A = effectiveTeamScores(S, awayId, aTac);
  // realistic baseline: league average ≈ 2.6-2.8 goals per match
  let lh = clamp(0.18 + Math.pow(H.att / Math.max(8, A.def), 1.05) * 0.92 * 1.06, 0.12, 2.9);
  let la = clamp(0.16 + Math.pow(A.att / Math.max(8, H.def), 1.02) * 0.92, 0.10, 2.7);
  const powerGap = Math.log((H.att * H.def) / Math.max(1, A.att * A.def));
  lh *= clamp(1 + powerGap * 0.08, 0.8, 1.25);
  la *= clamp(1 - powerGap * 0.08, 0.78, 1.22);
  // class gap between clubs (elite top-5 sides vs weaker nations): strong side scores more, weak side dries up
  const repH = (clubById(S, homeId) || {}).rep || 60, repA = (clubById(S, awayId) || {}).rep || 60;
  const repGap = clamp(repH - repA, -30, 30);
  lh *= clamp(1 + repGap * 0.026, 0.5, 1.7);
  la *= clamp(1 - repGap * 0.026, 0.44, 1.62);
  const userSide = S.clubId === homeId ? 'h' : S.clubId === awayId ? 'a' : null;
  const d = S.difficulty || 'experienced';
  if (userSide) {
    const my = tacOf(S, S.clubId), oppClub = userSide === 'h' ? awayId : homeId;
    const diff = ovrXI(S, S.clubId, my) - ovrXI(S, oppClub, tacOf(S, oppClub));
    let drawCut = 0;
    if (d === 'novice') {
      const k = 1.9 + diff * 0.02;
      if (userSide === 'h') lh *= k; else la *= k;
      if (userSide === 'h') la *= 0.36; else lh *= 0.36;
      drawCut = 0; // no draws: handled by integer nudge
    } else if (d === 'experienced') {
      const ku = clamp(1.03 + diff * 0.035, .5, 1.6), ko = clamp(1.02 - diff * 0.025, .45, 1.5);
      if (userSide === 'h') { lh *= ku; la *= ko; } else { la *= ku; lh *= ko; }
      if (Math.abs(diff) < 3) drawCut = 0.06;
    } else if (d === 'pro') {
      const ku = clamp(0.78 + diff * 0.028, .38, 1.65), ko = clamp(1.12 - diff * 0.018, .45, 1.55);
      if (userSide === 'h') { lh *= ku; la *= ko; } else { la *= ku; lh *= ko; }
      drawCut = diff < 9 ? 0.14 : 0.04;
    } else if (d === 'world') {
      const e = Math.max(0, diff - 6);
      const ku = clamp(0.7 + e * 0.09 + Math.min(0, diff) * 0.045, .3, 1.85);
      const ko = clamp(1.15 - e * 0.065 - Math.min(0, diff) * 0.03, .4, 1.65);
      if (userSide === 'h') { lh *= ku; la *= ko; } else { la *= ku; lh *= ko; }
      drawCut = diff < 9 ? 0.14 : 0.04;
    }
    if (drawCut) {
      const leader = lh >= la ? 'h' : 'a';
      if (leader === 'h') lh *= 1 - drawCut; else la *= 1 - drawCut;
      if (leader === 'h') la *= 1 - drawCut * 0.5; else lh *= 1 - drawCut * 0.5;
    }
  } else {
    const sc = (DIFFS[d] || DIFFS.experienced).scale;
    lh *= sc; la *= sc;
  }
  // training focus (FIXED: defence now strengthens own defense)
  if (S.focus && userSide) {
    if (S.focus === 'attack') { if (userSide === 'h') lh *= 1.06; else la *= 1.06; }
    else if (S.focus === 'defence') { if (userSide === 'h') la *= 1 / 1.06; else lh *= 1 / 1.06; }
  }
  return { lh: clamp(lh, 0.05, 3.2), la: clamp(la, 0.04, 3.0), H, A };
}

// ---------- instant match ----------
function instantMatch(S, homeId, awayId, seedStr) {
  const rand = rng(seedStr || (homeId + '-' + awayId + '-' + S.date));
  const { lh, la } = lambdas(S, homeId, awayId);
  const hg = poisson(lh, rand), ag = poisson(la, rand);
  return { hg, ag, xgH: lh, xgA: la };
}

// ---------- live segment engine ----------
const GOAL_TEXTS = [
  ['обыгрывает защитника и закатывает мяч в дальний угол', 0.22],
  ['замыкает передачу в касание', 0.5],
  ['бьёт в дальний угол с линии штрафной, мяч в сетке', 0.78],
  ['добивает после рикошета', 1],
];
const SAVE_TEXT = 'в падении забирает удар';
const MISS_TEXT = 'бьёт мимо';
const POSS_TEXTS = [
  ['принимает мяч в ноги', 0.28],
  ['ускоряется с мячом по флангу', 0.5],
  ['в касание отдаёт на партнёра', 0.72],
  ['обыгрывает оппонента корпусом', 0.88],
];
function pickText(pairs, rand) {
  const r = rand();
  for (const [t, c] of pairs) if (r <= c) return t;
  return pairs[pairs.length - 1][0];
}
function fullName(p) { return p.first + ' ' + p.last; }

const INJURY_TYPES = [
  { name: 'Ушиб', min: 2, max: 6, weight: 30 },
  { name: 'Растяжение', min: 7, max: 18, weight: 27 },
  { name: 'Травма голеностопа', min: 12, max: 28, weight: 20 },
  { name: 'Разрыв мышцы', min: 24, max: 48, weight: 15 },
  { name: 'Перелом', min: 40, max: 75, weight: 8 },
];
function rollInjury(rand) {
  const total = INJURY_TYPES.reduce((sum, t) => sum + t.weight, 0);
  let roll = rand() * total;
  let type = INJURY_TYPES[0];
  for (const candidate of INJURY_TYPES) {
    roll -= candidate.weight;
    if (roll <= 0) { type = candidate; break; }
  }
  const days = rint(rand, type.min, type.max);
  return { type: type.name, days, severity: days <= 6 ? 'light' : days <= 28 ? 'medium' : 'heavy' };
}

// simulate a window [fromMin..toMin] of a live match, deterministic per seed
function simSegment(S, homeId, awayId, fromMin, toMin, seedStr, opts) {
  const rand = rng(seedStr);
  const { lh, la } = lambdas(S, homeId, awayId);
  const frac = (toMin - fromMin) / 90;
  const events = [];
  let xgH = 0, xgA = 0;
  const hPlan = lineupPlayers(S, homeId, tacOf(S, homeId));
  const aPlan = lineupPlayers(S, awayId, tacOf(S, awayId));
  const hTac = tacOf(S, homeId), aTac = tacOf(S, awayId);
  const hConc = ht(hTac).concede, aConc = ht(aTac).concede;
  const lamH = clamp(lh * hConc * frac + (S.focus === 'set' && homeId === S.clubId ? 0.04 : 0), 0.02, 2.8);
  const lamA = clamp(la * aConc * frac + (S.focus === 'set' && awayId === S.clubId ? 0.04 : 0), 0.02, 2.6);
  xgH = lamH; xgA = lamA;
  const sideSim = (plan, oppGk, lam, side, isUser) => {
    const n = poisson(lam * 4.9, rand);
    const scorers = plan.filter(s => s.pos !== 'DC' && s.pos !== 'GK');
    for (let i = 0; i < n; i++) {
      const min = fromMin + Math.floor(rand() * (toMin - fromMin));
      const s = scorers.length ? pick(scorers, rand) : plan[0];
      const p = S.players.find(x => x.id === s.pid);
      const d = 0.05 + rand() * (0.16 + lam * 0.05);
      const shot = { min, side, kind: 'shot', xg: d, pid: p.id, text: '' };
      if (rand() < clamp(0.04 + d * (0.6 + p.sho / 55), 0.02, 0.34)) {
        shot.kind = 'goal';
        shot.piece = 'open';
        shot.text = fullName(p) + ' ' + pickText(GOAL_TEXTS, rand);
        if (rand() < 0.6) {
          const mates = plan.filter(s => s.pid !== p.id && s.pos !== 'GK');
          if (mates.length) shot.assistPid = pick(mates, rand).pid;
        }
      } else {
        const r = rand();
        if (r < 0.62) { shot.kind = 'save'; shot.text = 'Вратарь ' + SAVE_TEXT + ' после удара — ' + fullName(p); }
        else if (r < 0.84) { shot.kind = 'miss'; shot.text = fullName(p) + ' ' + MISS_TEXT; }
        else if (r < 0.93) { shot.kind = 'corner'; shot.text = 'Удар ' + fullName(p) + ' проходит рядом со штангой'; }
        else { shot.kind = 'block'; shot.text = 'Защитник в подкате выбивает мяч'; }
      }
      events.push(shot);
    }
  };
  sideSim(hPlan, aPlan, lamH, 'h');
  sideSim(aPlan, hPlan, lamA, 'a');
  // fouls / yellow cards
  [['h', hPlan, hTac], ['a', aPlan, aTac]].forEach(([side, plan, tac]) => {
    if (rand() < 0.15 + (tac.press || 2) * 0.06) {
      const p = pick(plan.filter(s => s.pos !== 'GK'), rand);
      if (p) events.push({ min: fromMin + Math.floor(rand() * (toMin - fromMin)), side, kind: 'card',
        pid: p.pid, text: fullName(S.players.find(x => x.id === p.pid)) + ' срывает атаку грубым подкатом и получает жёлтую карточку' });
    }
    // injury feint 8%
    if (rand() < 0.08) {
      const p = pick(plan.filter(s => s.pos !== 'GK'), rand);
      if (p) events.push({ min: fromMin + Math.floor(rand() * (toMin - fromMin)), side, kind: 'injury',
        pid: p.pid, text: fullName(S.players.find(x => x.id === p.pid)) + ' прихрамывает после стыка и просит паузу' });
    }
  });
  // possession flavor
  const nPoss = (toMin - fromMin) < 20 ? 2 : 5;
  for (let i = 0; i < nPoss; i++) {
    const side = rand() < 0.5 ? 'h' : 'a';
    const plan = side === 'h' ? hPlan : aPlan;
    const s = pick(plan.filter(x => x.pos !== 'GK'), rand);
    if (!s) continue;
    const p = S.players.find(x => x.id === s.pid);
    const r = rand();
    const text = r < 0.88 ? pickText(POSS_TEXTS, rand) : 'держит мяч в опорной зоне';
    events.push({ min: fromMin + Math.floor(rand() * (toMin - fromMin)), side, kind: 'poss', pid: p.id,
      text: fullName(p) + ' ' + text });
  }
  // one set piece per segment
  const side = rand() < 0.5 ? 'h' : 'a';
  const plan = side === 'h' ? hPlan : aPlan;
  const segLen = toMin - fromMin;
  if (rand() < Math.min(0.55, segLen / 40)) {
    const takerC = plan.filter(s => s.pos !== 'GK')
      .sort((x, y) => (S.players.find(q => q.id === y.pid).sho + S.players.find(q => q.id === y.pid).tec) - (S.players.find(q => q.id === x.pid).sho + S.players.find(q => q.id === x.pid).tec))[0];
    if (takerC) {
      const taker = S.players.find(q => q.id === takerC.pid);
      const min = fromMin + Math.floor(rand() * segLen);
      const r = rand();
      if (r < 0.44) events.push({ min, side, kind: 'throwin', pid: taker.id, text: fullName(taker) + ' быстро вводит мяч из аута' });
      else if (r <= 0.70) {
        events.push({ min, side, kind: 'corner', pid: taker.id, piece: 'corner', text: fullName(taker) + ' навешивает в штрафную с углового' });
      } else if (r <= 0.735) {
        // penalty
        const scoreP = clamp(0.7 + taker.sho / 90, 0.45, 0.9);
        if (rand() < scoreP) {
          events.push({ min, side, kind: 'goal', piece: 'pen', pid: taker.id, xg: 0.76,
            text: fullName(taker) + ' реализует пенальти — ' + (rand() < 0.5 ? 'низом в угол' : 'мощно под перекладину') });
        } else {
          events.push({ min, side, kind: 'save', piece: 'pen', pid: taker.id,
            text: 'Вратарь угадывает угол и отражает удар ' + fullName(taker) });
        }
      } else {
        // free kick
        const type = rand() < 0.34 ? 'chip' : rand() < 0.45 ? 'curl' : 'power';
        const base = type === 'curl' ? 0.13 : type === 'chip' ? 0.1 : 0.07;
        if (rand() < base * (0.7 + taker.sho / 45)) {
          events.push({ min, side, kind: 'goal', piece: 'fk', fkType: type, pid: taker.id, xg: 0.15,
            text: fullName(taker) + ' пробивает со штрафного — мяч в сетке' });
        } else {
          events.push({ min, side, kind: 'save', piece: 'fk', fkType: type, pid: taker.id,
            text: 'Вратарь снимает мяч после удара ' + fullName(taker) + ' со штрафного' });
        }
      }
    }
  }
  events.sort((a, b) => a.min - b.min);
  return { events, xgH, xgA };
}

// ---------- live controller ----------
function createLive(S, fx) {
  const home = fx.home, away = fx.away;
  return {
    fixtureId: fx.id, home, away, isHome: true,
    userSide: S.clubId === home ? 'h' : 'a',
    minute: 0, hg: 0, ag: 0, xgH: 0, xgA: 0,
    events: [], // played-out events with computed scores
    done: false, halftime: false,
    windowTo: 0, // end minute of already-simulated window
    subsUsed: 0, oppSubs: 0, pendingSub: null,
    scorers: [], mins: {}, ratingsSeed: {},
    over: false,
  };
}
function liveStep(S, live, nMin) {
  // advance game clock nMin minutes, appending events
  if (live.over) return [];
  const from = live.windowTo;
  const to = Math.min(90, from + (nMin || 1 + Math.floor(rng('win' + live.fixtureId + ':' + from + ':' + live.subsUsed)() * 4)));
  if (to <= from) return [];
  const seed = live.fixtureId + ':' + from + ':' + live.subsUsed + ':' + S.date;
  const seg = simSegment(S, live.home, live.away, from, to, seed);
  live.xgH += seg.xgH; live.xgA += seg.xgA;
  const out = [];
  seg.events.forEach(e => {
    const ev = Object.assign({}, e);
    // score at event time
    ev.hg = live.hg; ev.ag = live.ag;
    if (e.kind === 'goal') {
      if (e.side === 'h') live.hg++; else live.ag++;
      ev.hg = live.hg; ev.ag = live.ag;
      const p = S.players.find(x => x.id === e.pid);
      if (p) { live.scorers.push({ pid: e.pid, min: e.min, side: e.side }); }
    }
    live.events.push(ev);
    out.push(ev);
  });
  live.windowTo = to;
  live.minute = to;
  // track minutes played
  [live.home, live.away].forEach(cid => {
    lineupPlayers(S, cid, tacOf(S, cid)).forEach(s => {
      live.mins[s.pid] = (live.mins[s.pid] || 0) + (to - from);
    });
  });
  if (to >= 45 && from < 45) live.halftime = true;
  if (to >= 90) live.over = true;
  return out;
}
function applyLiveSub(S, live, clubId, outPid, inPid) {
  const tac = tacOf(S, clubId);
  const plan = lineupPlayers(S, clubId, tac);
  const s = plan.find(x => x.pid === outPid);
  if (!s) return false;
  if (clubId === S.clubId) {
    S.tactics.slots = S.tactics.slots.slice();
    S.tactics.slots[s.slot] = inPid;
    live.subsUsed++;
  } else live.oppSubs++;
  live.events.push({ min: live.minute, side: clubId === live.home ? 'h' : 'a', kind: 'sub',
    text: fullName(S.players.find(p => p.id === inPid)) + ' выходит на поле вместо ' + fullName(S.players.find(p => p.id === outPid)) });
  return true;
}

// ---------- post-match ----------
function postMatch(S, fx, res, live) {
  const homeId = fx.home, awayId = fx.away;
  const myHome = S.clubId === homeId;
  const my = myHome ? res.hg : res.ag, opp = myHome ? res.ag : res.hg;
  const win = my > opp, draw = my === opp;
  S.form = (S.form || []).concat([win ? 'W' : draw ? 'D' : 'L']).slice(-5);
  fx.played = true; fx.hg = res.hg; fx.ag = res.ag;
  fx.xgH = res.xgH; fx.xgA = res.xgA;
  applyClubForm(S, homeId, awayId, res.hg, res.ag);
  S.played++;
  [homeId, awayId].forEach(cid => {
    const myClub = cid === S.clubId;
    const squad = S.players.filter(p => p.clubId === cid);
    const plan = lineupPlayers(S, cid, tacOf(S, cid));
    const gMap = {}, aMap = {}, yMap = {}, inMap = {}, minsMap = {};
    const evs = live ? live.events : [];
    evs.forEach(e => {
      const side = e.side === 'h' ? homeId : awayId;
      if (side !== cid) return;
      if (e.kind === 'goal' && e.pid) gMap[e.pid] = (gMap[e.pid] || 0) + 1;
      if (e.kind === 'goal' && e.assistPid) aMap[e.assistPid] = (aMap[e.assistPid] || 0) + 1;
      if (e.kind === 'card' && e.pid) yMap[e.pid] = (yMap[e.pid] || 0) + 1;
      if (e.kind === 'injury' && e.pid) inMap[e.pid] = true;
    });
    if (live) Object.assign(minsMap, live.mins);
    if (!Object.keys(inMap).length && rng('match-injury:' + fx.id + ':' + cid)() < (live ? .07 : .13)) {
      const candidates = plan.map(s => s.pid).filter(pid => {
        const p = S.players.find(x => x.id === pid);
        return p && !p.injured;
      });
      const pid = candidates.length ? pick(candidates, rng('injury-player:' + fx.id + ':' + cid)) : null;
      if (pid) inMap[pid] = { source: 'match' };
    }
    plan.forEach(s => {
      const p = S.players.find(x => x.id === s.pid);
      if (!p) return;
      const playedMin = minsMap[p.id] !== undefined ? Math.min(90, minsMap[p.id]) : (live ? 90 : rint(rng(fx.id + p.id), 60, 90));
      if (playedMin < 1 && live) return;
      p.apps++;
      if (myClub && p.apps === 1 && p.age <= 20) S.youthDebs = (S.youthDebs || 0) + 1;
      p.goals += gMap[p.id] || 0;
      p.assists += aMap[p.id] || 0;
      const rate = clamp(6.4 + (gMap[p.id] || 0) * 0.9 + (aMap[p.id] || 0) * 0.5 + (rng(fx.id + ':' + p.id)() * 0.5 - 0.15)
        - 0.4 * (yMap[p.id] ? 1 : 0)
        + (s.pos === 'GK' && (myHome ? res.ag : res.hg) === 0 ? 0.6 : 0), 4.5, 9.6);
      p.ratingSum += rate;
      p.recent = (p.recent || []).concat([+rate.toFixed(2)]).slice(-5);
      p.yellow += yMap[p.id] || 0;
      if (p.yellow >= 4) { p.yellow = 0; p.ban = Math.max(p.ban, 1); }
      if (inMap[p.id] && !p.injured && (!live || rng('inj-confirm:' + fx.id + p.id)() < .65)) {
        const injury = rollInjury(rng('injury-detail:' + fx.id + p.id));
        p.injured = injury.days;
        p.injuryType = injury.type;
        p.injurySeverity = injury.severity;
        p.injuryReturn = addDays(S.date, injury.days);
        p.injuryMatch = fx.id;
        p.mor = clamp(p.mor - 5, 20, 99);
        if (myClub) addMsg(S, 'Медицинский штаб', 'Травма: ' + p.last,
          fullName(p) + ': ' + injury.type + '. Ориентировочный срок возвращения — ' + fmtDate(p.injuryReturn) + ' (' + injury.days + ' дн.). Игрок автоматически исключён из состава до восстановления.',
          { important: true, kind: 'injury', playerId: p.id });
      }
      p.cond = clamp(p.cond - (playedMin / 11 + (p.age >= 34 ? 8 : p.age >= 30 ? 5 : 0) + (p.sta < 11 ? 3 : 0)), 28, 100);
      p.sharp = clamp(p.sharp + (playedMin >= 25 ? 3 : -2), 20, 100);
      growthTick(p, playedMin, rate, fx.id);
    });
    const bench = squad.filter(p => !plan.some(s => s.pid === p.id) && minsMap[p.id] >= 15);
    bench.forEach(p => { p.ratingSum += 6.5; });
    // morale
    squad.forEach(p => { p.mor = clamp(p.mor + (win && myClub ? 6 : draw ? 1 : myClub ? -5 : 0) + (p.men - 12) * (myClub ? 1 : 0), 20, 99); });
  });
  // confidence
  const club = clubById(S, S.clubId);
  S.confidence = clamp(S.confidence + (win ? 5 : draw ? 0 : -6) + (club.rep > 80 && !win ? -3 : club.rep < 62 && win ? 3 : 0), 1, 99);
  if (S.focus) S.focus = null;
  // log + inbox
  const oppClub = clubById(S, myHome ? awayId : homeId);
  S.log.push(res.hg + ':' + res.ag + ' с «' + oppClub.name + '»');
  if (!S.freeAgent && !S.sacked) {
    S.streak = (win || draw) ? (S.streak || 0) + 1 : 0;
    S.streakBest = Math.max(S.streakBest || 0, S.streak);
    if (win && oppClub.rep > club.rep) S.strongerWins = (S.strongerWins || 0) + 1;
    if (win && fx.comp === 'cup') S.cupWins = (S.cupWins || 0) + 1;
  }
  addMsg(S, 'Протокол', 'Итог матча с «' + oppClub.name + '»', protocolBody(S, fx, res));
  updateObjectives(S);
  checkSack(S);
  if (S.date >= seasonCutoff(S)) S.phase = 'review';
  S.log = (S.log || []).slice(-500);
  return { win, draw };
}
function protocolBody(S, fx, res) {
  const rank = tablePos(S, S.clubId);
  const grown = S.players.filter(p => p.clubId === S.clubId && p.ovr >= 70).length;
  return 'Место в таблице: ' + rank + '. xG ' + res.xgH.toFixed(2) + ':' + res.xgA.toFixed(2) + '. Доверие совета: ' + S.confidence + '.';
}
function growthTick(p, mins, rate, seed) {
  const cap = p.age <= 21 ? 4 : p.age <= 24 ? 3 : p.age <= 28 ? 2 : 1;
  const rand = rng('growth:' + (seed || p.id) + ':' + p.id + ':' + p.age);
  if (mins >= 20 && p.age < 33 && p.growth < cap && p.ovr < p.pot &&
    ((p.age <= 23 && rate >= 6.9 && rand() < 0.28) ||
     (p.age <= 28 && rate >= 7.6 && rand() < 0.12) ||
     (p.age >= 30 && rate >= 8.2 && p.growth < 1))) { p.ovr++; p.growth++; }
  if (p.age >= 32 && mins >= 60 && rate < 6.3 && rand() < 0.22) p.ovr = Math.max(44, p.ovr - 1);
}

// ---------- helpers ----------
function applyClubForm(S, homeId, awayId, hg, ag) {
  S.clubForm = S.clubForm || {};
  [[homeId, hg > ag ? 'W' : hg === ag ? 'D' : 'L'],
    [awayId, ag > hg ? 'W' : hg === ag ? 'D' : 'L']].forEach(([id, result]) => {
    S.clubForm[id] = (S.clubForm[id] || []).concat([result]).slice(-5);
  });
}
function clubById(S, id) { return S.clubs.find(c => c.id === id); }
function playersOf(S, id) { return S.players.filter(p => p.clubId === id); }
function myClub(S) { return clubById(S, S.clubId); }
function addMsg(S, from, subject, body, opts) {
  S.inbox = S.inbox || [];
  S.msgSeq = (S.msgSeq || 0) + 1;
  const msg = Object.assign({
    id: 'msg-' + S.msgSeq + '-' + fnv(from + subject + S.date),
    from, subject, body, date: S.date, read: false,
  }, opts || {});
  S.inbox.unshift(msg);
  if (S.inbox.length > 40) S.inbox.length = 40;
  if (msg.important && typeof window !== 'undefined' && window.onImportantMessage) window.onImportantMessage(msg, S);
}
function inWindow(dateISO) {
  const d = toDate(dateISO), m = d.getMonth() + 1, day = d.getDate();
  return (m === 6 && day >= 15) || (m === 7) || (m === 8) || (m === 9 && day <= 12)
    || (m === 1 && day >= 20) || (m === 2 && day <= 25);
}

// ---------- calendar ----------
// Real-world season windows per league: sm/sd — start month (1-12) and day, em/ed — end.
// end month < 7 means the season ends in the next calendar year. winter — break Dec 7..Mar 1.
const LEAGUE_CAL = {
  rpl: { sm: 8, sd: 3, em: 5, ed: 20, winter: true },     // РПЛ стартует в августе
  fnl: { sm: 7, sd: 15, em: 5, ed: 20, winter: true },
  fnl2: { sm: 7, sd: 10, em: 5, ed: 15, winter: true },
  fnl3: { sm: 7, sd: 5, em: 10, ed: 25, winter: false },  // осень-весна сокращённая
  media: { sm: 7, sd: 20, em: 11, ed: 10, winter: false },
  amateur: { sm: 7, sd: 12, em: 10, ed: 5, winter: false },
  tur: { sm: 8, sd: 11, em: 5, ed: 25, winter: true },    // Суперлига — середина августа
  bra: { sm: 7, sd: 5, em: 11, ed: 25, winter: false },   // бразильяно — без зимней паузы
  ned: { sm: 8, sd: 5, em: 5, ed: 16, winter: true },
  por: { sm: 8, sd: 9, em: 5, ed: 18, winter: true },
  bel: { sm: 7, sd: 25, em: 5, ed: 18, winter: true },
  gre: { sm: 8, sd: 20, em: 5, ed: 10, winter: false },
  srb: { sm: 7, sd: 18, em: 5, ed: 25, winter: true },
  pol: { sm: 7, sd: 18, em: 5, ed: 25, winter: true },
  aut: { sm: 7, sd: 25, em: 5, ed: 25, winter: true },
  den: { sm: 7, sd: 15, em: 5, ed: 25, winter: true },
};
function seasonDates(season, league, count) {
  const cal = LEAGUE_CAL[league] || { sm: 7, sd: 12, em: 5, ed: 31, winter: true };
  const rand = rng('calendar:' + season + ':' + (league || 'all'));
  const start = new Date(season, cal.sm - 1, cal.sd + rint(rand, 0, 6), 12);
  const end = new Date(season + (cal.em >= 7 ? 0 : 1), cal.em - 1, cal.ed, 12);
  const pool = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (!cal.winter || !inWinter(d)) pool.push(toISO(new Date(d)));
  }
  const total = Math.min(count || 40, pool.length);
  const dates = [];
  let previous = -1;
  for (let i = 0; i < total; i++) {
    const ideal = i * (pool.length - 1) / Math.max(1, total - 1);
    const maxIndex = pool.length - (total - i);
    const index = clamp(Math.round(ideal) + rint(rand, -2, 2), previous + 1, maxIndex);
    dates.push(pool[index]);
    previous = index;
  }
  return dates;
}
function circleFixtures(ids) {
  // round-robin, odd team gets null (BYE)
  const arr = ids.slice();
  if (arr.length % 2) arr.push(null);
  const n = arr.length, rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i], b = arr[n - 1 - i];
      if (a === null) pairs.push({ home: b, away: a });
      else if (b === null) pairs.push({ home: a, away: b });
      else pairs.push({ home: r % 2 ? b : a, away: r % 2 ? a : b });
    }
    rounds.push(pairs);
    arr.splice(1, 0, arr.pop());
  }
  return rounds;
}
function buildAllFixtures(clubs, season) {
  const fixtures = [];
  const byLeague = {};
  clubs.forEach(c => (byLeague[c.league] = byLeague[c.league] || []).push(c.id));
  const RUS = ['rpl', 'fnl', 'fnl2', 'fnl3', 'media', 'amateur'];
  RUS.forEach((lg, li) => {
    const ids = byLeague[lg] || [];
    const rounds = circleFixtures(ids);
    const dbl = lg !== 'fnl3';
    const nRounds = dbl ? rounds.length * 2 : rounds.length;
    const dates = seasonDates(season, lg, nRounds);
    for (let r = 0; r < nRounds; r++) {
      const base = r % rounds.length;
      const second = dbl && r >= rounds.length;
      rounds[base].forEach((pr, i) => {
        if (!pr.home || !pr.away) return;
        const home = second ? pr.away : pr.home, away = second ? pr.home : pr.away;
        fixtures.push({
          id: lg + '-' + (r + 1) + '-' + i, league: lg, round: r + 1,
          date: dates[r], home, away, played: false, comp: 'league', label: '',
        });
      });
    }
  });
  GD.FOREIGN_LEAGUES.forEach(lg => {
    const ids = byLeague[lg] || [];
    const rounds = circleFixtures(ids);
    const schedule = rounds.concat(rounds.map(rr => rr.map(p => ({ home: p.away, away: p.home }))));
    const dates = seasonDates(season, lg, schedule.length);
    schedule.forEach((pairs, r) => pairs.forEach((pr, i) => {
        fixtures.push({ id: lg + '-' + (r + 1) + '-' + i, league: lg, round: r + 1,
          date: dates[r], home: pr.home, away: pr.away, played: false, comp: 'league', label: '' });
      }));
  });
  return fixtures;
}
const CUP_GROUP_DATES = ['08-05', '08-19', '09-02', '10-14', '10-28', '11-25'];
const CUP_KD_DATES = ['07-29', '08-12', '08-26', '09-16'];
const CUP_KNOCK = { r16: ['03-03', '03-17'], qf: ['04-07', '04-21'], sf: ['05-05', '05-19'], final: ['05-28'] };
function genCupFixtures(S) {
  const rpl = S.clubs.filter(c => c.league === 'rpl');
  const rplIds = new Set(rpl.map(c => c.id));
  const groups = [], used = new Set();
  GD.CUP_GROUPS.forEach(g => {
    if (groups.length >= 4 || g.length !== 4 || !g.every(id => rplIds.has(id) && !used.has(id))) return;
    groups.push(g.map(id => id));
    g.forEach(id => used.add(id));
  });
  const remaining = rpl.filter(c => !used.has(c.id)).sort((a, b) => b.rep - a.rep).map(c => c.id);
  while (groups.length < 4 && remaining.length) groups.push(remaining.splice(0, 4));
  S.cup.groups = groups;
  groups.forEach((g, gi) => {
    const rounds = circleFixtures(g);
    const schedule = rounds.concat(rounds.map(rr => rr.map(p => ({ home: p.away, away: p.home }))));
    schedule.forEach((pairs, w) => pairs.forEach(pr => {
      fixtures1(S, pr.home, pr.away, competitionDate(S, CUP_GROUP_DATES[w], 5, 'cup-group'), 'cup', 'Группа ' + 'ABCD'[gi]);
    }));
  });
  // региональный плей-офф: ФНЛ/ФНЛ-2/ФНЛ-3/ЛФК + 4 хэш-клуба Медиа
  const region = S.clubs.filter(c => ['fnl', 'fnl2', 'fnl3', 'amateur'].includes(c.league)).map(c => c.id);
  const media = S.clubs.filter(c => c.league === 'media').slice().sort((a, b) => fnv(a.id + S.season) - fnv(b.id + S.season)).slice(0, 4).map(c => c.id);
  S.cup.region = shuffleSeeded(region.concat(media), 'reg' + S.season);
}
function repairCupGroupDates(S) {
  const groupFx = S.fixtures.filter(f => f.comp === 'cup' && /^Группа/.test(f.label));
  if (!groupFx.length || groupFx.some(f => f.played)) return;
  const expected = [];
  ((S.cup && S.cup.groups) || []).forEach((g, gi) => {
    const rounds = circleFixtures(g);
    const schedule = rounds.concat(rounds.map(rr => rr.map(p => ({ home: p.away, away: p.home }))));
    schedule.forEach((pairs, w) => pairs.forEach(pr => expected.push({
      home: pr.home, away: pr.away, date: competitionDate(S, CUP_GROUP_DATES[w], 5, 'cup-group'), label: 'Группа ' + 'ABCD'[gi]
    })));
  });
  if (expected.length !== groupFx.length) return;
  const used = new Set();
  const dates = groupFx.map(f => {
    const i = expected.findIndex((e, idx) => !used.has(idx) && e.label === f.label && e.home === f.home && e.away === f.away);
    if (i < 0) return null;
    used.add(i);
    return expected[i].date;
  });
  if (dates.some(d => !d)) return;
  groupFx.forEach((f, i) => { f.date = dates[i]; });
}
function shuffleSeeded(arr, seedStr) {
  const rand = rng(seedStr), a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function fixtures1(S, home, away, date, comp, label, extra) {
  const f = { id: comp + '-' + S.season + '-' + (S.fixtures.length) + '-' + home + '-' + away,
    league: '', round: 0, date, home, away, played: false, comp, label: label || '', label2: '' };
  if (extra) Object.assign(f, extra);
  S.fixtures.push(f);
  return f;
}
function nextCupRegionRound(S) {
  const alive = cupRegionAlive(S);
  const dates = CUP_KD_DATES;
  const already = S.fixtures.some(f => f.comp === 'cup' && f.label.startsWith('Регионы'));
  const roundIdx = S.cup.regionRound || 0;
  if (roundIdx >= 4 || alive.length < 2) return;
  const pairs = shuffleSeeded(alive, 'cupr' + S.season + roundIdx);
  const date = competitionDate(S, dates[roundIdx], 5, 'cup-region');
  for (let i = 0; i + 1 < pairs.length; i += 2) {
    fixtures1(S, pairs[i], pairs[i + 1], date, 'cup', 'Регионы · раунд ' + (roundIdx + 1));
  }
  if (pairs.length % 2) {
    fixtures1(S, pairs[pairs.length - 1], pairs[0], date, 'cup', 'Регионы · раунд ' + (roundIdx + 1));
    S.cup.byes.push(pairs[pairs.length - 1]);
  }
  S.cup.regionRound = roundIdx + 1;
}
function cupRegionAlive(S) {
  const played = S.fixtures.filter(f => f.comp === 'cup' && f.label.startsWith('Регионы') && f.played);
  const losers = new Set(played.map(f => f.hg >= f.ag ? f.away : f.home).filter(id => !S.cup.byes.includes(id)));
  const all = S.cup.region || [];
  const stillInRounds = played.map(f => f.hg >= f.ag ? f.home : f.away);
  const lastRoundPlayed = Math.max(...played.map(f => +(f.label.match(/раунд (\d)/) || [0, 0])[1]), 0);
  if (!played.length) return all;
  const winners = played.filter(f => +(f.label.match(/раунд (\d)/) || [0, 0])[1] === lastRoundPlayed)
    .map(f => f.hg >= f.ag ? f.home : f.away);
  const byesThisRound = (S.cup.byes || []).filter(b => !played.some(f => f.home === b || f.away === b));
  return winners.concat(byesThisRound);
}
function finishCupGroups(S) {
  if (S.cup.knockReady) return;
  // compute top-2 of each RPL group
  const gF = S.fixtures.filter(f => f.comp === 'cup' && /^Группа/.test(f.label));
  if (!gF.length || gF.some(f => !f.played)) return;
  const adv = [];
  (S.cup.groups || []).forEach((g, gi) => {
    const lab = 'Группа ' + 'ABCD'[gi];
    const stat = {};
    g.forEach(id => stat[id] = { pts: 0, gd: 0 });
    S.fixtures.filter(f => f.comp === 'cup' && f.label === lab).forEach(f => {
      if (!f.played || !stat[f.home] || !stat[f.away]) return;
      stat[f.home].pts += f.hg > f.ag ? 3 : f.hg === f.ag ? 1 : 0;
      stat[f.away].pts += f.ag > f.hg ? 3 : f.hg === f.ag ? 1 : 0;
      stat[f.home].gd += f.hg - f.ag; stat[f.away].gd += f.ag - f.hg;
    });
    const sorted = g.slice().sort((a, b) => stat[b].pts - stat[a].pts || stat[b].gd - stat[a].gd);
    adv.push(sorted[0], sorted[1]);
  });
  const regionAdv = S.fixtures.filter(f => f.comp === 'cup' && f.label === 'Регионы · финал пути')
    .map(f => f.hg >= f.ag ? f.home : f.away);
  S.cup.advancedRpl = adv;
  S.cup.knockReady = true;
  // 1/8: adv + top region survivors
  const pool = shuffleSeeded(adv.concat(cupRegionAlive(S)), 'k16' + S.season);
  makeCupKnock(S, pool, '1/8', CUP_KNOCK.r16, 'r16');
}
function makeCupKnock(S, pool, label, dates, key) {
  S.cup.knock = S.cup.knock || {};
  S.cup.knock[key] = pool;
  if (!pool.includes(S.clubId)) { if (S.clubId) S.cup.userOut = S.cup.userOut || !pool.includes(S.clubId); return; }
  for (let i = 0; i + 1 < pool.length; i += 2) {
    const home = pool[i], away = pool[i + 1];
    if (home !== S.clubId && away !== S.clubId) continue;
    fixtures1(S, home, away, competitionDate(S, dates[0], 3, 'cup-' + key), 'cup', label + ' · 1-й матч', { leg: 1, tie: i / 2 });
    fixtures1(S, away, home, competitionDate(S, dates[1], 3, 'cup-' + key), 'cup', label + ' · 2-й матч', { leg: 2, tie: i / 2 });
  }
}

// ---------- five-season club history ----------
function seedClubHistory(clubs, season) {
  const history = {};
  Object.keys(GD.LEAGUES).forEach(league => {
    const teams = clubs.filter(c => c.league === league);
    const size = teams.length;
    if (!size) return;
    for (let back = 5; back >= 1; back--) {
      const year = season - back;
      const ranked = teams.slice().sort((a, b) => {
        const av = a.rep + (fnv(a.id + year) % 11 - 5) * 0.65;
        const bv = b.rep + (fnv(b.id + year) % 11 - 5) * 0.65;
        return bv - av || a.name.localeCompare(b.name, 'ru');
      });
      ranked.forEach((club, index) => {
        const rand = rng('history:' + club.id + ':' + year);
        const played = league === 'fnl3' ? size - 1 : (size - 1) * 2;
        const ppg = clamp(2.05 - index / Math.max(1, size - 1) * 1.15 + (rand() - 0.5) * 0.3, 0.55, 2.65);
        const pts = Math.round(ppg * played);
        const w = Math.min(played, Math.floor(pts / 3));
        const d = Math.min(played - w, pts - w * 3);
        const gfRate = 1.2 + (size - index - 1) / Math.max(1, size - 1) * 0.95 + (rand() - 0.5) * 0.35;
        const gaRate = 1.2 + index / Math.max(1, size - 1) * 0.95 + (rand() - 0.5) * 0.35;
        const gf = Math.max(0, Math.round(played * gfRate));
        const ga = Math.max(0, Math.round(played * gaRate));
        const row = { season: year, league, rank: index + 1, size, i: played,
          w, d, l: played - w - d, gf, ga, pts, xgf: gf, xga: ga };
        (history[club.id] = history[club.id] || []).push(row);
      });
    }
  });
  const covered = new Set(Object.keys(history));
  const european = clubs.filter(c => !covered.has(c.id));
  const size = european.length;
  if (size) {
    for (let back = 5; back >= 1; back--) {
      const year = season - back;
      const ranked = european.slice().sort((a, b) => {
        const av = a.rep + (fnv(a.id + year) % 11 - 5) * 0.65;
        const bv = b.rep + (fnv(b.id + year) % 11 - 5) * 0.65;
        return bv - av || a.name.localeCompare(b.name, 'ru');
      });
      ranked.forEach((club, index) => {
        const rand = rng('history:' + club.id + ':' + year);
        const played = 8;
        const ppg = clamp(2.35 - index / Math.max(1, size - 1) * 1.25 + (rand() - 0.5) * 0.3, 0.65, 2.75);
        const pts = Math.round(ppg * played);
        const w = Math.min(played, Math.floor(pts / 3));
        const d = Math.min(played - w, pts - w * 3);
        const gfRate = 1.65 + (size - index - 1) / Math.max(1, size - 1) * 0.65 + (rand() - 0.5) * 0.3;
        const gaRate = 1.15 + index / Math.max(1, size - 1) * 0.75 + (rand() - 0.5) * 0.3;
        const gf = Math.max(0, Math.round(played * gfRate));
        const ga = Math.max(0, Math.round(played * gaRate));
        (history[club.id] = history[club.id] || []).push({ season: year, league: 'euro', rank: index + 1, size, i: played,
          w, d, l: played - w - d, gf, ga, pts, xgf: gf, xga: ga });
      });
    }
  }
  return history;
}
function recordSeasonHistory(S, tables) {
  S.clubHistory = S.clubHistory || {};
  const xg = {};
  S.fixtures.forEach(f => {
    if (f.comp !== 'league' || !f.played) return;
    xg[f.home] = xg[f.home] || { gf: 0, ga: 0 };
    xg[f.away] = xg[f.away] || { gf: 0, ga: 0 };
    xg[f.home].gf += f.xgH || f.hg; xg[f.home].ga += f.xgA || f.ag;
    xg[f.away].gf += f.xgA || f.ag; xg[f.away].ga += f.xgH || f.hg;
  });
  Object.keys(tables).forEach(league => {
    tables[league].forEach((row, index) => {
      const shot = xg[row.id] || { gf: row.gf, ga: row.ga };
      const entry = { season: S.season, league, rank: index + 1, size: tables[league].length,
        i: row.i, w: row.w, d: row.d, l: row.l, gf: row.gf, ga: row.ga, pts: row.pts,
        xgf: Math.round(shot.gf * 10) / 10, xga: Math.round(shot.ga * 10) / 10 };
      const rows = (S.clubHistory[row.id] = S.clubHistory[row.id] || []).concat(entry);
      S.clubHistory[row.id] = rows.slice(-5);
    });
  });
  S.clubForm = {};
}
function clubHistoryProfile(S, clubId) {
  const rows = (S.clubHistory && S.clubHistory[clubId]) || [];
  if (!rows.length) {
    const club = clubById(S, clubId);
    const rep = club ? club.rep : 60;
    const overall = clamp(0.84 + (rep - 55) * 0.004, 0.80, 1.14);
    return { att: overall, def: 2 - overall, form: 1, overall, trend: 0 };
  }
  let weightSum = 0, rankScore = 0, gfRate = 0, gaRate = 0, oldest = 0, newest = 0;
  rows.forEach((row, index) => {
    const weight = index + 1;
    const score = clamp(1.08 - (row.rank - 1) / Math.max(1, row.size - 1) * 0.30, 0.78, 1.08);
    const games = Math.max(1, row.i);
    rankScore += score * weight;
    gfRate += ((row.gf * 0.55 + (row.xgf || row.gf) * 0.45) / games) * weight;
    gaRate += ((row.ga * 0.55 + (row.xga || row.ga) * 0.45) / games) * weight;
    weightSum += weight;
    if (index === 0) oldest = score;
    if (index === rows.length - 1) newest = score;
  });
  rankScore /= weightSum; gfRate /= weightSum; gaRate /= weightSum;
  const formRows = (S.clubForm && S.clubForm[clubId]) || [];
  const formPoints = formRows.length ? formRows.reduce((sum, result) => sum + (result === 'W' ? 1 : result === 'D' ? 0.5 : 0), 0) / formRows.length : 0.5;
  return {
    att: clamp(1 + (gfRate - 1.35) * 0.10 + (rankScore - 0.95) * 0.35, 0.82, 1.18),
    def: clamp(1 + (gaRate - 1.35) * 0.10 - (rankScore - 0.95) * 0.35, 0.82, 1.18),
    form: 0.94 + formPoints * 0.14,
    overall: rankScore,
    trend: newest - oldest,
  };
}

// ---------- table ----------
function table(S, league) {
  const ids = S.clubs.filter(c => c.league === league).map(c => c.id);
  const rows = {};
  ids.forEach(id => rows[id] = { id, i: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
  S.fixtures.filter(f => f.comp === 'league' && f.league === league && f.played).forEach(f => {
    const h = rows[f.home], a = rows[f.away];
    if (!h || !a) return;
    h.i++; a.i++;
    h.gf += f.hg; h.ga += f.ag; a.gf += f.ag; a.ga += f.hg;
    if (f.hg > f.ag) { h.w++; h.pts += 3; a.l++; }
    else if (f.hg < f.ag) { a.w++; a.pts += 3; h.l++; }
    else { h.d++; a.d++; h.pts++; a.pts++; }
  });
  return ids.map(id => rows[id]).sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf ||
    clubById(S, x.id).name.localeCompare(clubById(S, y.id).name, 'ru'));
}
function tablePos(S, clubId) {
  const c = clubById(S, clubId);
  if (!c) return 0;
  const t = table(S, c.league);
  return t.findIndex(r => r.id === clubId) + 1;
}
function leagueDone(S, league) {
  return !S.fixtures.some(f => f.comp === 'league' && f.league === league && !f.played);
}

// ---------- board objectives ----------
function squadStrength(S, clubId) {
  const c = clubById(S, clubId);
  return (c ? c.rep : 50) * 0.6 + ovrXI(S, clubId, tacOf(S, clubId)) * 0.4;
}
function expectedRank(S) {
  const club = myClub(S);
  const mine = squadStrength(S, club.id);
  let better = 0;
  S.clubs.forEach(c => { if (c.league === club.league && c.id !== club.id && squadStrength(S, c.id) > mine) better++; });
  return better + 1;
}
function seasonRoundCount(S) {
  const lg = myClub(S).league;
  const size = S.clubs.filter(c => c.league === lg).length;
  return lg === 'fnl3' ? size - 1 : (size - 1) * 2;
}
function setObjectives(S) {
  const club = myClub(S), lg = club.league;
  const size = S.clubs.filter(c => c.league === lg).length;
  S.seasonIdx = (S.seasonIdx || 0) + 1;
  const idx = S.seasonIdx;
  const exp = expectedRank(S);
  const rounds = seasonRoundCount(S);
  // цели всегда по составу и уровню лиги: никакой «только чемпионство» для слабаков
  let rankT = exp <= 3 ? Math.max(1, exp - Math.floor((idx - 1) / 2))
    : exp <= 7 ? Math.max(2, exp - Math.floor((idx - 1) / 2))
    : Math.max(3, exp - Math.floor(idx / 2));
  rankT = Math.min(rankT, Math.max(1, size - 2));
  const hard = 1 + Math.min(0.2, (idx - 1) * 0.04);
  const ppg = clamp(2.3 - (rankT - 1) * 0.12, 0.8, 2.35);
  const ptsT = Math.min(rounds * 3 - 2, Math.round(ppg * rounds * hard));
  const winsT = Math.max(1, Math.round(ptsT * 0.31 * hard));
  const gfT = Math.round(rounds * clamp(1.9 - (rankT - 1) * 0.055, 0.7, 1.9) * hard);
  const csT = Math.round(rounds * clamp(0.45 - (rankT - 1) * 0.02, 0.12, 0.45) * hard);
  const isRus = ['rpl', 'fnl', 'fnl2', 'fnl3', 'media', 'amateur'].includes(lg);
  const core = [
    { id: 'league', type: 'rank', label: 'Место в чемпионате', target: rankT },
    { id: 'points', type: 'points', label: 'Очки в лиге', target: ptsT },
  ];
  const extras = [
    { id: 'wins', type: 'wins', label: 'Победы в лиге', target: winsT },
    { id: 'gf', type: 'gf', label: 'Забитые мячи', target: gfT },
    { id: 'cs', type: 'cs', label: 'Сухие матчи', target: csT },
    exp > 1 ? { id: 'stronger', type: 'strongerWin', label: 'Победы над клубом сильнее в рейтинге', target: idx <= 2 ? 1 : 2 } : null,
    { id: 'streak', type: 'unbeaten', label: 'Серия без поражений подряд', target: Math.min(3 + Math.floor(idx / 2), 8) },
    { id: 'youth', type: 'youth', label: 'Дебюты воспитанников до 21 года', target: idx >= 4 ? 2 : 1 },
    isRus ? { id: 'cup', type: 'cup', label: 'Победы в Кубке страны', target: idx <= 3 ? 1 : 2 } : null,
  ].filter(Boolean);
  const count = Math.min(2 + idx, 7); // 3 в первом сезоне, дальше больше, максимум 7
  const take = count - core.length;
  const start = (idx - 1) % Math.max(1, extras.length);
  const picked = [];
  for (let i = 0; i < take; i++) picked.push(extras[(start + i) % extras.length]);
  S.objectives = core.concat(picked).map((o, i) => ({
    id: o.id + '-' + S.season, type: o.type, label: o.label, target: o.target,
    done: false, announced: false,
  }));
  S.streak = 0; S.streakBest = 0; S.strongerWins = 0; S.cupWins = 0; S.youthDebs = 0;
  return S.objectives;
}
function cleanSheets(S) {
  return S.fixtures.filter(f => f.played && f.comp === 'league' &&
    (f.home === S.clubId || f.away === S.clubId) &&
    (f.home === S.clubId ? f.ag : f.hg) === 0).length;
}
function objectiveValue(S, o) {
  if (o.type === 'rank') return tablePos(S, S.clubId);
  if (o.type === 'unbeaten') return S.streakBest || 0;
  if (o.type === 'strongerWin') return S.strongerWins || 0;
  if (o.type === 'youth') return S.youthDebs || 0;
  if (o.type === 'cup') return S.cupWins || 0;
  if (o.type === 'cs') return cleanSheets(S);
  const row = table(S, myClub(S).league).find(r => r.id === S.clubId);
  if (!row) return 0;
  if (o.type === 'points') return row.pts;
  if (o.type === 'wins') return row.w;
  if (o.type === 'gf') return row.gf;
  return 0;
}
function objTargetText(o) {
  const unit = { points: 'очков', wins: 'побед', gf: 'голов', cs: 'сухих матчей',
    strongerWin: 'побед над более сильным клубом', youth: 'дебютов', cup: 'побед в кубке',
    unbeaten: 'матчей без поражений подряд' }[o.type];
  if (o.type === 'rank') return 'Топ-' + o.target;
  return o.target + (unit ? ' ' + unit : '');
}
function objValueText(o, value) {
  if (o.type === 'rank') return value > 0 ? value + '-е место' : '—';
  return String(value);
}
function objectiveProgress(S, o) {
  const value = objectiveValue(S, o);
  return { value, met: o.type === 'rank' ? value > 0 && value <= o.target : value >= o.target };
}
function updateObjectives(S) {
  (S.objectives || []).forEach(o => {
    const progress = objectiveProgress(S, o);
    const finalRank = o.type !== 'rank' || leagueDone(S, myClub(S).league);
    if (progress.met && finalRank && !o.announced) {
      o.announced = true;
      S.confidence = clamp(S.confidence + 2, 1, 99);
      addMsg(S, 'Спортивный директор', 'Задача выполнена', '«' + o.label + '»: ' + objValueText(o, progress.value) + ' — цель «' + objTargetText(o) + '» достигнута. Совет директоров доволен прогрессом.');
    }
  });
}
function evaluateObjectives(S, currentTable) {
  const list = S.objectives && S.objectives.length ? S.objectives : setObjectives(S);
  const n = list.length;
  let met = 0;
  list.forEach(o => {
    const row = currentTable && currentTable.find(r => r.id === S.clubId);
    const value = row && (o.type === 'rank' || o.type === 'points' || o.type === 'wins' || o.type === 'gf')
      ? (o.type === 'rank' ? currentTable.indexOf(row) + 1 : o.type === 'points' ? row.pts : o.type === 'wins' ? row.w : row.gf)
      : objectiveValue(S, o);
    const ok = o.type === 'rank' ? value > 0 && value <= o.target : value >= o.target;
    o.done = ok; o.value = value;
    if (ok) met++;
  });
  S.confidence = clamp(S.confidence + met * 4 - (n - met) * 3, 1, 99);
  addMsg(S, 'Совет директоров', 'Итоги задач сезона', 'Выполнено задач: ' + met + ' из ' + n + '. Доверие совета: ' + S.confidence + '.');
  if ((met === 0 && S.confidence <= 38) || (met < Math.ceil(n / 2) && S.confidence <= 24)) doSack(S, 'objectives');
  return met;
}

// ---------- daily ----------
function advanceDay(S) {
  if (seasonReady(S)) { S.phase = 'review'; return []; }
  S.date = addDays(S.date, 1);
  const d = toDate(S.date), day = S.date;
  const employed = !S.freeAgent && !S.sacked;
  // simulate other fixtures today (assistant handles user's if skipped)
  const todays = S.fixtures.filter(f => f.date === day && !f.played);
  const out = [];
  todays.forEach(f => {
    if (employed && (f.home === S.clubId || f.away === S.clubId)) {
      const r = instantMatch(S, f.home, f.away, S.season + ':' + f.id + ':auto');
      postMatch(S, f, r, null);
      addMsg(S, 'Помощник', 'Матч без вас', 'Ваш матч с «' + clubById(S, f.home === S.clubId ? f.away : f.home).name + '» досиммулирован: ' + r.hg + ':' + r.ag + '.');
    } else {
      const r = instantMatch(S, f.home, f.away, S.season + ':' + f.id + ':ai');
      f.played = true; f.hg = r.hg; f.ag = r.ag;
      f.xgH = r.xgH; f.xgA = r.xgA;
      applyClubForm(S, f.home, f.away, r.hg, r.ag);
    }
    out.push(f);
  });
  // cup regional rounds trigger
  if (todays.length) nextCupRegionRound(S);
  const groupDates = CUP_GROUP_DATES.map(x => competitionDate(S, x, 5, 'cup-group'));
  if (groupDates.includes(day)) finishCupGroups(S);
  // Mondays: wages
  if (d.getDay() === 1) {
    if (employed) {
      const w = playersOf(S, S.clubId).reduce((a, p) => a + p.wage, 0);
      S.balance = Math.round((S.balance - w / 1000) * 10) / 10;
      if (S.balance < -30) S.confidence = clamp(S.confidence - 2, 1, 99);
    }
    revalueAll(S);
    if (employed && S.played > 0 && S.lastAssistantReport !== day) {
      const squad = playersOf(S, S.clubId);
      const injured = squad.filter(p => p.injured);
      const tired = squad.filter(p => !p.injured && p.cond < 65).length;
      const losses = (S.form || []).slice(-5).filter(x => x === 'L').length;
      const advice = losses >= 3 ? 'Стоит пересмотреть матч-план и снизить прессинг.' : tired >= 5 ? 'Проведите восстановительную тренировку перед следующим матчем.' : 'Состав в порядке. Следите за свежестью игроков основы.';
      addMsg(S, 'Помощник', 'Сводка недели',
        'Форма: ' + ((S.form || []).slice(-5).join(' · ') || 'нет матчей') + '. Травмированных: ' + injured.length + (injured.length ? ' (' + injured.map(p => p.last).join(', ') + ')' : '') + '. Низкий тонус: ' + tired + '. ' + advice,
        { kind: 'assistant' });
      S.lastAssistantReport = day;
    }
  }
  // 1st: sponsor
  if (d.getDate() === 1) {
    if (employed) {
      const inc = myClub(S).rep * 0.55;
      S.balance = Math.round((S.balance + inc) * 10) / 10;
      addMsg(S, 'Бухгалтерия', 'Спонсорский транш', 'Клуб получил ' + F(inc) + ' от спонсора.');
    }
    monthlyRegen(S);
  }
  // daily upkeep for all players
  S.players.forEach(p => {
    if (p.injured) {
      p.injured = Math.max(0, p.injured - 1);
      if (!p.injured) {
        p.injuryType = null;
        p.injurySeverity = null;
        p.injuryReturn = null;
        p.injuryMatch = null;
        p.cond = Math.min(p.cond, 72);
        if (employed && p.clubId === S.clubId) addMsg(S, 'Медицинский штаб', 'Игрок восстановился', fullName(p) + ' прошёл медосмотр и снова доступен для тренировок и матчей.', { kind: 'injury', playerId: p.id });
      }
    } else { p.cond = clamp(p.cond + (S.focus === 'rest' && p.clubId === S.clubId ? 8 : 4), 28, 100); }
    if (p.ban) p.ban = Math.max(0, p.ban - (fnv(day + p.id) % 6 === 0 ? 1 : 0));
    if (p.sharp < 55 && !p.injured) p.sharp = clamp(p.sharp + 1, 20, 100);
  });
  if (employed && inWindow(day)) maybeIncomingOffer(S);
  if (employed) tickEuro(S);
  else { processJobApplications(S); maybeJobOffer(S); }
  checkSack(S);
  if (S.date >= seasonCutoff(S)) S.phase = 'review';
  return out;
}
function monthlyRegen(S) {
  const rand = rng('regen' + S.date);
  S.players.forEach(p => {
    if (p.clubId === 'free' || String(p.clubId).startsWith('pool:')) return;
    if (p.age <= 23 && p.sharp > 60 && rand() < 0.12) {
      const k = pick(['pac', 'sho', 'pas', 'tec', 'def'], rand);
      p[k] = clamp(p[k] + 1, 4, 19);
      p.ovr = Math.min(p.pot, Math.max(p.ovr, clamp(Math.round(posScore(p) * 3.05 + 30), 44, p.pot)));
    }
    if (p.age >= 33 && rand() < 0.10) p.pac = clamp(p.pac - 1, 4, 19);
  });
}

// ---------- training ----------
function train(S, focus) {
  if (S.trainedOn === S.date) return false;
  S.trainedOn = S.date;
  S.focus = focus;
  const rand = rng('training:' + S.date + ':' + S.clubId);
  const squad = playersOf(S, S.clubId);
  if (focus === 'rest') squad.forEach(p => { p.cond = clamp(p.cond + 12, 28, 100); p.sharp = clamp(p.sharp - 2, 20, 100); });
  else if (focus === 'physical') {
    squad.forEach(p => { p.cond = clamp(p.cond - 5, 28, 100); p.sharp = clamp(p.sharp + 4, 20, 100); });
    squad.filter(p => p.age <= 23 && p.growth < 4).forEach(p => {
      if (rand() < 0.06) { p.sta = clamp(p.sta + 1, 4, 19); p.ovr = Math.min(p.pot, p.ovr + 1); p.growth++; }
    });
  } else if (focus === 'attack') squad.filter(p => ['ST', 'AM', 'MR', 'ML'].includes(p.pos)).forEach(p => { p.sharp = clamp(p.sharp + 8, 20, 100); p.cond = clamp(p.cond - 3, 28, 100); });
  else if (focus === 'defence') squad.filter(p => ['DC', 'GK', 'DM', 'DR', 'DL'].includes(p.pos)).forEach(p => { p.sharp = clamp(p.sharp + 8, 20, 100); p.cond = clamp(p.cond - 3, 28, 100); });
  else if (focus === 'set') squad.forEach(p => { p.sharp = clamp(p.sharp + 4, 20, 100); });
  return true;
}

// ---------- transfers ----------
function wageCap(club) { return Math.round(club.rep * club.rep * 9); }
function totalWage(S) { return playersOf(S, S.clubId).reduce((a, p) => a + p.wage, 0); }
function buyPlayer(S, player, fee) {
  const club = myClub(S);
  const noWindow = player.clubId === 'free' || (String(player.clubId).startsWith('pool:') && !player.realClub);
  if (!inWindow(S.date) && !noWindow) return { ok: false, why: 'window' };
  if (fee > S.budget) return { ok: false, why: 'money' };
  const target = String(player.clubId).startsWith('pool:') ? null : clubById(S, player.clubId);
  const theirRep = target ? target.rep : (player.realClub ? 88 : Math.min(90, 50 + fnv(String(player.clubId)) % 40));
  const newWage = Math.round(player.wage * ((theirRep && theirRep > club.rep) ? 1.25 : 1.05));
  if (totalWage(S) + newWage > wageCap(club)) return { ok: false, why: 'cap' };
  const v = player.value;
  let d = clamp(0.15 + (fee / v - 0.75 + (player.clubId === 'free' ? 1.4 : 0)) * 0.7
    + (club.rep - theirRep) * 0.008
    + (player.age >= 32 ? 0.1 : 0) + (player.contract <= 1 ? 0.12 : 0) + (player.mor < 55 ? 0.08 : 0), 0.05, 0.92);
  if (fee < v * 0.62) d = Math.min(d, 0.18);
  const rand = rng('buy' + S.date + player.id + fee);
  if (rand() > d) {
    addMsg(S, 'Спортивный директор', 'Отказ по трансферу',
      '«' + (target ? target.name : 'Клуб') + '» отклонил переход ' + fullName(player) + '. Нужны деньги ближе к ' + USD(v) + ' и внятная зарплата.');
    return { ok: false, why: 'refused' };
  }
  S.budget = Math.round((S.budget - fee) * 10) / 10;
  if (target) target.budget = Math.round((target.budget + fee * 0.8) * 10) / 10;
  player.clubId = S.clubId;
  player.wage = newWage;
  player.mor = clamp(player.mor + 8, 20, 99);
  player.contract = player.age >= 31 ? 2 : 3;
  player.listed = false;
  player.realClub = '';
  player.freeAgent = false;
  S.tactics.slots = autoLineup(S, S.clubId, S.tactics.formation).map(x => x.pid);
  addMsg(S, 'Спортивный директор', 'Трансфер закрыт', fullName(player) + ' подписан за ' + USD(fee) + ' (зарплата ' + IW(newWage) + ').');
  S.log.push('Куплен ' + fullName(player) + ' за ' + USD(fee));
  return { ok: true };
}
function maybeIncomingOffer(S) {
  const club = myClub(S);
  if (fnv(S.date + S.clubId) % 17 !== 0) return;
  const squad = playersOf(S, S.clubId).filter(p => S.players && !p.injured && p.listed !== 'off');
  const strong = squad.filter((p, i) => i >= 11 || p.ovr >= 60);
  if (!strong.length) return;
  const p = pick(strong, rng('off' + S.date + club.id));
  const buyers = S.clubs.filter(c => c.rep >= club.rep - 8 && c.id !== club.id && (GD.FOREIGN_LEAGUES.includes(c.league) || ['rpl', 'media'].includes(c.league)));
  if (!buyers.length) return;
  const from = pick(buyers, rng('offb' + S.date));
  const fee = Math.max(2, Math.round(p.value * (0.85 + rng('offf' + S.date)() * 0.3)));
  S.offers.push({ pid: p.id, clubId: from.id, fee });
  addMsg(S, from.name, 'Предложение по ' + p.last,
    '«' + from.name + '» предлагает ' + USD(fee) + ' за ' + fullName(p) + '.');
}
function acceptOfferById(S, offerIdx) {
  const o = S.offers[offerIdx];
  if (!o) return false;
  const p = S.players.find(x => x.id === o.pid);
  if (!p) return false;
  S.budget = Math.round((S.budget + o.fee) * 10) / 10;
  p.clubId = o.clubId;
  S.offers.splice(offerIdx, 1);
  addMsg(S, 'Спортивный директор', 'Продажа закрыта', fullName(p) + ' продан в «' + clubById(S, o.clubId).name + '» за ' + USD(o.fee) + '.');
  S.log.push('Продан ' + fullName(p) + ' за ' + USD(o.fee));
  return true;
}
function renewContract(S, p, years, wageNew, clause) {
  if (p.renewed) return false;
  const fee = Math.round(years * p.wage * 0.04);
  if (fee > S.budget) return false;
  S.budget = Math.round((S.budget - fee) * 10) / 10;
  p.contract = years; p.wage = wageNew; p.renewed = true;
  if (clause === 'release') p.clause = p.value * 2;
  else if (clause === 'bonus10') p.bonus10 = true;
  else if (clause === 'loan') p.loanOpt = true;
  else if (clause === 'captain') p.captain = true;
  p.mor = clamp(p.mor + 6, 20, 99);
  addMsg(S, 'Юрист клуба', 'Контракт продлён', fullName(p) + ' подписал соглашение на ' + years + ' г. за ' + IW(wageNew) + '. Сбор агента: ' + F(fee) + '.');
  return true;
}
function listPlayer(S, p, on) {
  p.listed = !!on;
  addMsg(S, 'Спортивный директор', on ? 'Выставлен на трансфер' : 'Снят с трансфера',
    fullName(p) + (on ? ' внесён в список продающихся.' : ' убран из списка продающихся.'));
}
function championGlory(S, lg) {
  S.log.push('HONOR:' + S.season + '|Чемпион — ' + myClub(S).name + ' (' + GD.LEAGUES[lg].name + ')');
  addMsg(S, 'Лига', 'Чемпион', '«' + myClub(S).name + '» — чемпион ' + GD.LEAGUES[lg].name + '!');
}
function zoneOf(league, idx, n) {
  const rank = idx + 1;
  if (league === 'rpl') {
    if (rank <= 2) return 'ucl'; if (rank === 3) return 'uclq'; if (rank === 4) return 'uel';
    if (rank <= 6) return 'uecl';
    if (rank >= n - 3 && rank <= n - 2) return 'po'; // 13-14 => po
    if (rank >= n - 1) return 'down';
    return '';
  }
  if (league === 'fnl' || league === 'fnl2') {
    if (rank <= 2) return 'up';
    if (league === 'fnl' && (rank === 3 || rank === 4)) return 'po';
    if (rank === 5) return 'pyr';
    if (rank > n - 4) return 'down';
    return '';
  }
  if (league === 'fnl3') {
    if (rank <= 2) return 'up';
    if (rank === 5) return 'pyr';
    return '';
  }
  if (rank === 1) return 'up';
  return '';
}
function allLeagueTables(S) {
  const tables = {};
  Object.keys(GD.LEAGUES).forEach(league => { tables[league] = table(S, league); });
  return tables;
}
function endSeason(S) {
  const season = S.season;
  const lg = myClub(S).league;
  const tables = allLeagueTables(S);
  const t = tables[lg];
  const rank = t.findIndex(r => r.id === S.clubId) + 1;
  recordSeasonHistory(S, tables);
  // prizes
  const P = GD.PRIZES;
  let prize = 0;
  const pz = { rpl: P.rpl, fnl: P.fnl, fnl2: P.fnl2, fnl3: P.fnl3, media: P.media, amateur: P.amateur };
  if (pz[lg]) { const arr = pz[lg]; prize = arr[rank - 1] !== undefined ? arr[rank - 1] : (lg === 'rpl' ? (rank <= 10 ? P.rpl7 : P.rplRest) : lg === 'fnl3' ? 6 : 2); }
  else prize = P.foreign[Math.min(3, rank - 1)];
  S.budget = Math.round((S.budget + prize) * 10) / 10;
  S.balance = Math.round((S.balance + prize * 0.35) * 10) / 10;
  if (rank === 1) championGlory(S, lg);
  evaluateObjectives(S, t);
  // promotion/relegation across rus pyramid
  const rplLen = tables.rpl.length, fnlLen = tables.fnl.length, fnl2Len = tables.fnl2.length;
  moveLeague(S, 'fnl', [0, 1], 'rpl', 'up', 'прямой выход в РПЛ', tables.fnl);
  moveLeague(S, 'rpl', [rplLen - 2, rplLen - 1], 'fnl', 'down', 'вылет в Первую лигу', tables.rpl);
  moveLeague(S, 'fnl2', [0, 1], 'fnl', 'up', 'выход в Первую лигу', tables.fnl2);
  moveLeague(S, 'fnl', [fnlLen - 4, fnlLen - 1], 'fnl2', 'down', 'вылет в ФНЛ-2', tables.fnl);
  moveLeague(S, 'fnl3', [0, 1], 'fnl2', 'up', 'выход в ФНЛ-2', tables.fnl3);
  moveLeague(S, 'fnl2', [fnl2Len - 4, fnl2Len - 1], 'fnl3', 'down', 'вылет в ФНЛ-3', tables.fnl2);
  // стыки РПЛ 13-14 vs ФНЛ 4-3
  const rplT = tables.rpl, fnlT = tables.fnl;
  playOff(S, rplT[12].id, fnlT[3].id, season, 'Стыки РПЛ · 13-е против 4-го Первой лиги');
  playOff(S, rplT[13].id, fnlT[2].id, season, 'Стыки РПЛ · 14-е против 3-го Первой лиги');
  // pyramid: 5th of each rus league mini-group, winner +1 league
  const pyr = ['fnl3', 'fnl2', 'fnl', 'rpl'].map(id => (tables[id][4] || {}).id).filter(Boolean);
  if (pyr.length > 1) {
    const rand = rng('pyr' + season);
    const pts = pyr.map(id => ({ id, p: rint(rand, 0, 9) }));
    pts.sort((a, b) => b.p - a.p);
    const upMap = { fnl3: 'fnl2', fnl2: 'fnl', fnl: 'rpl' };
    const w = pts[0];
    if (upMap[w.id]) {
      const club = clubById(S, w.id);
      club.league = upMap[w.id];
      club.rep = clamp(club.rep + 3, 28, 95);
      S.log.push(club.name + ' — победа в стыках пирамиды');
      if (w.id === S.clubId) addMsg(S, 'Лига', 'Пирамида', 'Вы выиграли мини-группу пирамиды и поднимаетесь в ' + GD.LEAGUES[upMap[w.id]].name + '!');
    }
  }
  // user season verdicts
  const zone = zoneOf(lg, rank - 1, t.length);
  if (lg === 'fnl3') {
    if (rank > Math.ceil(t.length * 0.55) || S.confidence < 36) S.badSeasons++; else S.badSeasons = 0;
    if (S.sacked) return finalizeSeason(S, season, lg, rank, prize);
    if (S.badSeasons >= 2) { doSack(S, 'confidence'); return finalizeSeason(S, season, lg, rank, prize); }
  } else if (zone === 'down' || zone === 'po') {
    S.badSeasons++;
    if (S.badSeasons >= 2 && S.confidence < 42) doSack(S, 'form');
  } else S.badSeasons = 0;
  refreshEuroTickets(S, tables);
  finalizeSeason(S, season, lg, rank, prize);
}
function finalizeSeason(S, season, lg, rank, prize) {
  // cup & euro closure
  closeCupSeason(S);
  closeEuroSeason(S);
  // aging, contracts and retirements
  const squads = new Map(S.clubs.map(c => [c.id, []]));
  const remaining = [], retired = [];
  S.players.forEach(p => {
    p.age++;
    const rand = rng('age:' + p.id + ':' + S.season);
    const chance = p.age >= 38 ? 1 : p.age >= 35 ? 0.55 : p.age >= 33 ? 0.16 : 0;
    if (chance && rand() < chance) {
      if (p.clubId === S.clubId) retired.push(fullName(p));
      return;
    }
    if (p.age >= 33) p.ovr = Math.max(46, p.ovr - 1);
    else if (p.age >= 31 && rand() < 0.4) p.ovr = Math.max(48, p.ovr - 1);
    if (p.contract <= 1 && rand() < 0.5) {
      p.clubId = 'free'; p.contract = 2;
    } else p.contract = Math.max(1, p.contract - 1);
    p.goals = p.assists = p.apps = p.ratingSum = p.yellow = p.ban = 0;
    p.recent = [];
    p.injured = 0;
    p.injuryType = null;
    p.injurySeverity = null;
    p.injuryReturn = null;
    p.injuryMatch = null;
    p.renewed = false;
    remaining.push(p);
    const squad = squads.get(p.clubId);
    if (squad) squad.push(p);
  });
  S.players = remaining;
  if (retired.length) addMsg(S, 'Спортивный директор', 'Завершили карьеру', retired.slice(0, 6).join(', ') + (retired.length > 6 ? ' и ещё ' + (retired.length - 6) : '') + '. Ветераны покинули профессиональный футбол.');
  // keep every squad sustainable at 18 players
  S.clubs.forEach(c => {
    const squad = squads.get(c.id);
    const rand = rng('youth' + c.id + S.season);
    while (squad.length < 18) {
      const pos = pick(['MC', 'DC', 'ST', 'GK', 'DR'], rand);
      const player = genPlayer(c, 18 + squad.length, pos, rand, new Set());
      player.age = rint(rand, 18, 20);
      player.value = Math.max(1, Math.round(player.value * 0.45));
      player.baseValue = player.value;
      player.wage = Math.max(8, Math.round(player.wage * 0.5));
      S.players.push(player); squad.push(player);
    }
  });
  ensureMarketDepth(S);
  const freePlayers = S.players.filter(p => p.clubId === 'free').sort((a, b) => b.ovr - a.ovr).slice(0, 72);
  const freeIds = new Set(freePlayers.map(p => p.id));
  S.players = S.players.filter(p => p.clubId !== 'free' || freeIds.has(p.id));
  S.season++;
  advanceYouthSeason(S);
  const clubIndex = new Map(S.clubs.map(c => [c.id, c]));
  const marketIndex = new Map(GD.MARKETS.map(m => ['pool:' + m.id, m]));
  S.players.forEach(p => {
    const market = marketIndex.get(p.clubId);
    const club = clubIndex.get(p.clubId);
    if (p.real) p.baseValue = Math.max(2, Math.round(p.baseValue * (p.age >= 32 ? 0.7 : p.age <= 22 ? 1.15 : 0.95)));
    else if (market) p.baseValue = Math.max(2, Math.round(Math.pow(1.13, p.ovr - 60) * ageMult(p.age) * market.priceK * 100));
    else if (club) p.baseValue = Math.max(2, Math.round(valModel(p.ovr, p.age, club.league, club.rep) * 100));
    if (p.real) p.ovr = Math.min(p.ovr, p.pot);
  });
  revalueAll(S);
  if (!S.sacked && !S.freeAgent) {
    S.tactics.slots = autoLineup(S, S.clubId, S.tactics.formation).map(x => x.pid);
    const squadIds = new Set(playersOf(S, S.clubId).map(p => p.id));
    S.bench = (S.bench || []).filter(id => squadIds.has(id));
  }
  S.budget = Math.round(myClub(S).budget * 0.35 + S.budget * 0.7);
  S.balance = Math.round(S.balance + myClub(S).rep * 2);
  S.confidence = clamp(S.confidence + 4, 1, 99);
  S.fixtures = buildAllFixtures(S.clubs, S.season);
  S.cup = { byes: [], userOut: false, stage: 'live' };
  genCupFixtures(S);
  nextCupRegionRound(S);
  if (S.euro && S.euro.stage === 'champion') S.confidence = 99;
  initEuro(S);
  S.date = S.season + '-07-01';
  S.phase = 'season';
  S.played = 0;
  S.form = [];
  S.focus = null;
  S.offers = [];
  S.boardWarnedPlayed = 0;
  S.lastAssistantReport = null;
  S.trainedOn = null;
  S.youthTrainedOn = null;
  setObjectives(S);
  S.log.push('Сезон ' + (S.season - 1) + '/' + S.season + ' закрыт. Место: ' + rank + '. Призовые: ' + F(prize) + '.');
  S.log = S.log.slice(-240);
  addMsg(S, 'Лига', 'Новый сезон', 'Сезон ' + (S.season - 1) + '/' + (S.season) + ' закрыт. Новый чемпионат — ' + GD.LEAGUES[myClub(S).league].name + '. Вы в «' + myClub(S).name + '».');
}
function moveLeague(S, from, idxs, to, dir, text, standings) {
  const tt = standings || table(S, from);
  idxs.forEach(i => {
    const row = tt[i];
    if (!row) return;
    const c = clubById(S, row.id);
    c.league = to;
    c.rep = clamp(c.rep + (dir === 'up' ? 3 : -3), 28, 95);
    c.budget = Math.round(c.budget * (dir === 'up' ? 1.4 : 0.72));
    S.log.push(c.name + ' — ' + text);
    if (c.id === S.clubId) addMsg(S, 'Лига', dir === 'up' ? 'Поздравляем' : 'Вылет', '«' + c.name + '» — ' + text + '.');
  });
}
function playOff(S, a, b, season, label) {
  const r1 = instantMatch(S, a, b, label + '1'), r2 = instantMatch(S, b, a, label + '2');
  const aggH = r1.hg + r2.ag, aggA = r1.ag + r2.hg;
  const winner = aggH >= aggA ? a : b;
  if (winner !== a) { clubById(S, a).league = 'fnl'; clubById(S, b).league = 'rpl'; }
  S.log.push(label + ': ' + clubById(S, winner).name + ' (' + aggH + ':' + aggA + ' по сумме)');
  if (a === S.clubId || b === S.clubId) {
    addMsg(S, 'Лига', 'Стыки', label + ' — ' + (winner === S.clubId ? 'выстояли' : 'прогнали вас') + '. Итог ' + aggH + ':' + aggA + '.');
  }
}
function closeCupSeason(S) {
  const cf = S.fixtures.filter(f => f.comp === 'cup' && f.label.includes('Финал') && f.played);
  if (cf.length) {
    const f = cf[cf.length - 1];
    const winner = f.hg >= f.ag ? f.home : f.away;
    const w = clubById(S, winner);
    let prize = GD.PRIZES.cupWin + (w.league === 'media' ? GD.PRIZES.cupWinMedia : 0);
    w.budget += prize;
    if (winner === S.clubId) {
      S.budget += prize;
      S.log.push('HONOR:' + S.season + '|Обладатель кубка — ' + w.name);
      addMsg(S, 'Кубок России', 'Кубок!', '«' + w.name + '» берёт FONBET Кубок России!');
    }
  } else {
    const pool = S.fixtures.filter(f => f.comp === 'cup').flatMap(f => [f.home, f.away]);
    if (pool.length) {
      const winner = [...new Set(pool)].sort((a, b) => clubById(S, b).rep - clubById(S, a).rep)[0];
      if (winner !== S.clubId) clubById(S, winner).budget += GD.PRIZES.cupWin;
    }
  }
}
function closeEuroSeason(S) {
  if (S.euro && S.euro.comp && S.euro.stage !== 'done') {
    const prize = { ucl: GD.PRIZES.uclWin, uel: GD.PRIZES.uelWin, uecl: GD.PRIZES.ueclWin }[S.euro.comp];
    if (S.euro.stage === 'champion') {
      S.budget += prize;
      S.log.push('HONOR:' + S.season + '|Победитель ' + euroName(S.euro.comp));
    } else if (S.euro.pts >= 8) { S.budget += GD.PRIZES.euroPts; }
  }
}
function euroName(c) { return c === 'ucl' ? 'Лигу чемпионов' : c === 'uel' ? 'Лигу Европы' : 'Лигу конференций'; }

// ---------- sack / vacancies / free agent ----------
function checkSack(S) {
  if (S.sacked || S.freeAgent) return;
  const form = (S.form || []).slice(-5);
  const losses = form.filter(x => x === 'L').length;
  const wins = form.filter(x => x === 'W').length;
  if (S.played >= 5 && S.confidence <= 28 && S.played >= (S.boardWarnedPlayed || 0) + 3) {
    S.boardWarnedPlayed = S.played;
    addMsg(S, 'Совет директоров', 'Предупреждение совету', 'Доверие совета упало до ' + S.confidence + '. Следующие результаты и задачи сезона находятся под особым контролем.', { kind: 'board' });
  }
  if (S.played >= 6 && form.length >= 4 && (losses >= 4 || (form.length === 5 && wins === 0 && losses >= 3)) && S.confidence <= 34) {
    doSack(S, 'form'); return;
  }
  if (S.played >= 8 && S.confidence <= 16) doSack(S, 'confidence');
}
function doSack(S, reason) {
  if (S.sacked) return;
  const club = myClub(S);
  S.sacked = true;
  S.freeAgent = true;
  S.sackReason = reason || 'confidence';
  S.lastClubId = club.id;
  S.unemployedSince = S.date;
  S.managerRep = clamp((S.managerRep || club.rep - 8) - 3, 30, 92);
  S.jobOffers = [];
  S.applications = [];
  const near = S.clubs.filter(c => Math.abs(c.rep - (club.rep - 6)) <= 7 && c.id !== club.id && c.league !== 'amateur').slice(0, 3);
  const foreignPool = S.clubs.filter(c => GD.FOREIGN_LEAGUES.includes(c.league) && c.id !== club.id);
  const foreign = foreignPool.length ? [pick(foreignPool, rng('vac' + S.manager + S.season))] : [];
  S.vacancies = shuffleSeeded(near.concat(foreign), 'vac' + S.manager + S.season).map(c => c.id);
  const reasonText = { confidence: 'Доверие совета исчерпано.', form: 'Серия плохих результатов поставила крест на вашей работе.', objectives: 'Клуб не выполнил поставленные задачи сезона.' }[S.sackReason];
  addMsg(S, 'Совет директоров', 'Отставка', reasonText + ' Вы освобождены от должности главного тренера «' + club.name + '».', { important: true, kind: 'board' });
}
function resign(S) {
  if (S.sacked) return false;
  const club = myClub(S);
  S.sacked = true;
  S.freeAgent = true;
  S.sackReason = 'resigned';
  S.lastClubId = club.id;
  S.unemployedSince = S.date;
  S.managerRep = clamp((S.managerRep || club.rep - 8) - 1, 30, 92);
  S.vacancies = [];
  S.jobOffers = [];
  S.applications = [];
  addMsg(S, 'Президент клуба', 'Расторжение контракта', 'Вы по собственному желанию покинули «' + club.name + '» и теперь свободны от контрактных обязательств.');
  return true;
}
function applyForJob(S, clubId) {
  const club = clubById(S, clubId);
  if (!club || !S.freeAgent) return { ok: false, why: 'unavailable' };
  if ((S.applications || []).some(a => a.clubId === clubId && a.status === 'pending')) return { ok: false, why: 'pending' };
  if ((S.jobOffers || []).some(o => o.clubId === clubId)) return { ok: false, why: 'offered' };
  const rep = S.managerRep || 55;
  const chance = clamp(.16 + (rep - club.rep) * .035 + (S.confidence - 55) * .004 - (S.applications || []).length * .02, .04, .9);
  const responseDate = addDays(S.date, rint(rng('apply:' + clubId + S.date), 3, 7));
  S.applications = (S.applications || []).concat([{ clubId, status: 'pending', sent: S.date, responseDate, chance }]);
  addMsg(S, 'Ваш агент', 'Заявка отправлена', 'Резюме направлено в «' + club.name + '». Ответ ожидается ' + fmtDate(responseDate) + '.');
  return { ok: true };
}
function processJobApplications(S) {
  S.applications = (S.applications || []).filter(a => {
    const club = clubById(S, a.clubId);
    if (!club || a.status !== 'pending') return false;
    if (a.responseDate > S.date) return true;
    const rand = rng('job-response:' + a.clubId + a.sent);
    if (rand() < a.chance) {
      S.jobOffers = (S.jobOffers || []).filter(o => o.clubId !== club.id).concat([{ clubId: club.id, date: S.date }]);
      addMsg(S, 'Ваш агент', 'Приглашение на собеседование', '«' + club.name + '» готово обсудить с вами должность главного тренера. Предложение уже доступно в разделе «Предложения работы».', { important: true, kind: 'job', clubId: club.id });
    } else addMsg(S, 'Ваш агент', 'Ответ клуба', '«' + club.name + '» отказала. Попробуйте другой клуб или повысьте репутацию новой работой.', { kind: 'job', clubId: club.id });
    return false;
  });
}
function maybeJobOffer(S) {
  if (!S.freeAgent || (S.jobOffers || []).length >= 3) return;
  const last = S.lastOfferDay || S.unemployedSince || S.date;
  if (S.date < addDays(last, 7)) return;
  const rep = S.managerRep || 55;
  let pool = S.clubs.filter(c => c.id !== S.lastClubId && c.league !== 'amateur' && c.rep <= rep + 12 && c.rep >= rep - 28);
  if (!pool.length) pool = S.clubs.filter(c => c.id !== S.lastClubId && c.league !== 'amateur');
  const club = pick(pool, rng('free-offer:' + S.date + S.manager));
  if (!club || (S.jobOffers || []).some(o => o.clubId === club.id)) return;
  S.jobOffers.push({ clubId: club.id, date: S.date });
  S.lastOfferDay = S.date;
  addMsg(S, 'Ваш агент', 'Новое предложение', '«' + club.name + '» интересуется вами. Можно принять предложение или продолжить поиск.', { important: true, kind: 'job', clubId: club.id });
}
function takeJob(S, clubId) {
  const club = clubById(S, clubId);
  const available = (S.vacancies || []).includes(clubId) || (S.jobOffers || []).some(o => o.clubId === clubId);
  if (!club || !S.freeAgent || !available) return false;
  S.lastClubId = S.clubId;
  S.clubId = clubId;
  S.sacked = false;
  S.freeAgent = false;
  S.sackReason = null;
  S.unemployedSince = null;
  S.jobOffers = [];
  S.applications = [];
  S.vacancies = [];
  S.lastOfferDay = null;
  S.confidence = 62;
  S.managerRep = clamp(Math.max(S.managerRep || 35, club.rep - 6), 30, 92);
  S.budget = club.budget;
  S.balance = Math.round(S.budget * 0.35);
  S.kit = defaultKit(club, fnv(clubId));
  S.tactics = { formation: '4-3-3', slots: [], style: 'direct', mentality: 0, press: 2, tempo: 3, line: 2, width: 2 };
  S.tactics.slots = autoLineup(S, clubId, '4-3-3').map(x => x.pid);
  S.bench = [];
  S.played = 0;
  S.form = [];
  S.badSeasons = 0;
  S.boardWarnedPlayed = 0;
  S.lastAssistantReport = null;
  S.youth = [];
  S.youthIntake = 0;
  S.youthTrainedOn = null;
  ensureYouthSquad(S);
  setObjectives(S);
  S.cup.userOut = false;
  S.cup.stage = 'live';
  S.euro = { comp: null, stage: 'done', pts: 0, gf: 0, ga: 0, round: 0, played: 0 };
  const hasEuroFixtures = S.fixtures.some(f => ['ucl', 'uel', 'uecl', 'uclq'].includes(f.comp) && (f.home === clubId || f.away === clubId));
  if (!hasEuroFixtures && S.date <= S.season + '-09-15') initEuro(S);
  addMsg(S, 'Президент клуба', 'Новый контракт', 'Вы возглавили «' + club.name + '». Совет ждёт выполнения задач сезона.');
  return true;
}
// backfill for saves made before dynamic ratings / bench / real players existed
function migrateSave(s) {
  if (!s) return s;
  s.bench = s.bench || [];
  s.euroTickets = Object.assign(euroTicketsForClubs(s.clubs), s.euroTickets || {});
  s.played = s.played || 0;
  s.focus = s.focus || null;
  s.offers = s.offers || [];
  s.log = s.log || [];
  s.inbox = s.inbox || [];
  s.trainedOn = s.trainedOn || null;
  s.phase = s.phase || 'season';
  s.clubForm = s.clubForm || {};
  s.clubHistory = s.clubHistory || seedClubHistory(s.clubs, s.season);
  Object.keys(s.clubHistory).forEach(id => {
    s.clubHistory[id] = (s.clubHistory[id] || []).slice(-5);
  });
  s.players.forEach(p => {
    if (!p.recent) p.recent = [];
    if (!p.baseValue) p.baseValue = p.value;
    if (p.injured && !p.injuryType) p.injuryType = 'Травма';
    if (p.injured && !p.injuryReturn) p.injuryReturn = addDays(s.date, p.injured);
  });
  s.youth = s.youth || [];
  s.youthIntake = s.youthIntake || 0;
  s.youthTrainedOn = s.youthTrainedOn || null;
  s.managerRep = s.managerRep || clamp(myClub(s).rep - 8, 35, 90);
  s.form = s.form || [];
  s.jobOffers = s.jobOffers || [];
  s.applications = s.applications || [];
  s.msgSeq = Math.max(s.msgSeq || 0, (s.inbox || []).length);
  s.boardWarnedPlayed = s.boardWarnedPlayed || 0;
  s.lastAssistantReport = s.lastAssistantReport || null;
  s.freeAgent = s.freeAgent === undefined ? !!s.sacked : s.freeAgent;
  if (s.freeAgent && !s.unemployedSince) s.unemployedSince = s.date;
  ensureYouthSquad(s);
  if (!s.objectives || !s.objectives.length) setObjectives(s);
  else s.objectives.forEach(o => { if (o.announced === undefined) o.announced = !!o.done; });
  ensureReals(s);
  ensureMarketDepth(s);
  repairCupGroupDates(s);
  if (s.cup && (s.cup.groups || []).length > 4) {
    const validGroupLabels = new Set(['Группа A', 'Группа B', 'Группа C', 'Группа D']);
    s.cup.groups = s.cup.groups.slice(0, 4);
    s.fixtures = s.fixtures.filter(f => !(f.comp === 'cup' && /^Группа /.test(f.label) && !validGroupLabels.has(f.label) && !f.played));
  }
  if (s.date >= seasonCutoff(s)) s.phase = 'review';
  s.log = s.log.slice(-240);
  return s;
}

// ---------- scouting flavor ----------
function scoutReport(S, oppClubId) {
  const me = myClub(S);
  const myR = ovrXI(S, S.clubId, S.tactics), oppR = ovrXI(S, oppClubId, tacOf(S, oppClubId));
  const line = oppR > myR + 3 ? 'Соперник заметно сильнее на бумаге.' :
    myR > oppR + 6 ? 'Небольшой перевес у вас — надо брать.' :
    myR > oppR + 2 ? 'Небольшой перевес у вас — надо брать.' : 'Силы равны, всё решит реализация.';
  const t = tacOf(S, oppClubId);
  const styleName = (GD.TACTICS.find(x => x.id === t.style) || {}).name || 'Баланс';
  const history = clubHistoryProfile(S, oppClubId);
  const trend = history.trend > 0.025 ? ' По последним сезонам соперник прибавляет.' : history.trend < -0.025 ? ' В последних сезонах соперник сдаёт позиции.' : ' За последние пять сезонов результаты стабильные.';
  return line + ' Ожидаемый стиль: ' + styleName + ', схемa ' + t.formation + '.' + trend;
}

// ---------- european comps ----------
const EURO_LP_DATES = ['09-16', '10-01', '10-22', '11-05', '11-26', '12-10', '01-21', '01-29'];
const EURO_TICKETS = {
  rpl: ['ucl', 'ucl', 'uclq', 'uel', 'uecl', 'uecl'],
  ned: ['ucl', 'uclq', 'uel', 'uecl'],
  por: ['ucl', 'uclq', 'uel', 'uecl'],
  tur: ['uclq', 'uel', 'uecl'],
  bel: ['uclq', 'uel', 'uecl'],
  aut: ['uclq', 'uel', 'uecl'],
  gre: ['uclq', 'uel', 'uecl'],
  srb: ['uclq', 'uel', 'uecl'],
  pol: ['uclq', 'uel', 'uecl'],
  den: ['uclq', 'uel', 'uecl'],
};
const EURO_LEVELS = [
  { id: 'elite', name: 'Элита', short: 'Элита', min: 85 },
  { id: 'strong', name: 'Сильный евроклуб', short: 'Сильный', min: 75 },
  { id: 'europe', name: 'Еврокубковый', short: 'Евроклуб', min: 65 },
  { id: 'base', name: 'Базовый уровень', short: 'Базовый', min: 0 },
];
function euroTicketMap(league) { return EURO_TICKETS[league] || []; }
function euroTicketsForClubs(clubs) {
  const tickets = {};
  Object.keys(EURO_TICKETS).forEach(lg => {
    const table = clubs.filter(c => c.league === lg).slice().sort((a, b) => b.rep - a.rep || a.name.localeCompare(b.name, 'ru'));
    euroTicketMap(lg).forEach((ticket, i) => { if (table[i]) tickets[table[i].id] = ticket; });
  });
  return tickets;
}
function refreshEuroTickets(S, tables) {
  const tickets = {};
  const cached = tables || {};
  Object.keys(EURO_TICKETS).forEach(lg => {
    euroTicketMap(lg).forEach((ticket, i) => {
      const row = (cached[lg] || table(S, lg))[i];
      if (row) tickets[row.id] = ticket;
    });
  });
  S.euroTickets = tickets;
}
function euroSeasonRatings(t, season) {
  const endYear = (season || 2026) - 1;
  const trend = fnv(String(t.id) + 'euro-trend') % 7 - 3;
  return Array.from({ length: 5 }, (_, i) => {
    const year = endYear - 4 + i;
    const swing = fnv(String(t.id) + year) % 5 - 2;
    return clamp(Math.round((t.rep || 60) + swing + (i - 2) * trend * 0.9), 35, 99);
  });
}
function euroCoefficient(t, season) {
  const history = euroSeasonRatings(t, season);
  return Math.round(history.reduce((a, b) => a + b, 0) / history.length * 10) / 10;
}
function euroLevel(coef) { return EURO_LEVELS.find(l => coef >= l.min) || EURO_LEVELS[EURO_LEVELS.length - 1]; }
function euroRoster(S, season) {
  const roster = new Map();
  GD.EURO_TEAMS.forEach(t => roster.set(t.id, {
    id: t.id, name: t.name, short: t.short, city: t.city, country: t.city,
    rep: t.rep, color: t.color, color2: t.color2, ticket: t.ticket, source: 'euro', playable: false,
  }));
  const tickets = S && S.euroTickets ? S.euroTickets : euroTicketsForClubs(S ? S.clubs : GD.CLUBS);
  Object.keys(tickets).forEach(id => {
    const c = S ? clubById(S, id) : GD.CLUBS.find(x => x.id === id);
    if (!c) return;
    const prev = roster.get(id) || {};
    roster.set(id, Object.assign({}, prev, {
      id, name: c.name, short: c.short, city: c.city,
      country: c.league === 'rpl' ? 'Россия' : (GD.LEAGUES[c.league] || {}).short || c.city,
      rep: c.rep, color: c.color, color2: c.color2, ticket: tickets[id], source: 'club', playable: true,
    }));
  });
  const yr = season || (S && S.season) || 2026;
  const rows = [...roster.values()].map(t => {
    const playedHistory = S && S.clubHistory && S.clubHistory[t.id];
    const history = playedHistory && playedHistory.length
      ? playedHistory.map(row => clamp(Math.round(57 + (row.pts / Math.max(1, row.i) - 1.1) * 18 + (row.gf - row.ga) / Math.max(1, row.i) * 2), 35, 99))
      : euroSeasonRatings(t, yr);
    const coef = Math.round(history.reduce((a, b) => a + b, 0) / history.length * 10) / 10;
    return Object.assign({}, t, { history, coef, level: euroLevel(coef) });
  }).sort((a, b) => b.coef - a.coef || b.rep - a.rep || a.name.localeCompare(b.name, 'ru'));
  rows.forEach((t, i) => t.rank = i + 1);
  return rows;
}
function euroPoolFor(ticket, S) {
  let pool = GD.EURO_TEAMS.filter(t => t.ticket === ticket && (!S || t.id !== S.clubId));
  if (ticket === 'uclq') pool = GD.EURO_TEAMS.filter(t => (t.ticket === 'uclq' || t.rep < 75) && (!S || t.id !== S.clubId));
  if (pool.length < 8) pool = GD.EURO_TEAMS.filter(t => !S || t.id !== S.clubId);
  return pool;
}
function ensureEuroClub(S, t) {
  if (!S.clubs.some(c => c.id === 'eu-' + t.id)) {
    S.clubs.push({ id: 'eu-' + t.id, name: t.name, short: t.short, city: t.city, league: 'euro',
      rep: t.rep, budget: 500, color: t.color, color2: t.color2, stadium: t.name, capacity: 50000,
      euroCoef: euroCoefficient(t, S.season), euroLevel: euroLevel(euroCoefficient(t, S.season)).id });
    const rand = rng('eusq-' + t.id);
    S.players.push(...makeSquad(S.clubs[S.clubs.length - 1], rand, new Set()));
  }
}
function initEuro(S) {
  const me = myClub(S);
  const profile = { id: me.id, rep: me.rep };
  S.euro = { comp: null, stage: 'done', pts: 0, gf: 0, ga: 0, round: 0, played: 0,
    coef: euroCoefficient(profile, S.season), level: euroLevel(euroCoefficient(profile, S.season)).id };
  const ticket = (S.euroTickets || {})[S.clubId];
  if (!ticket) return;
  if (ticket === 'uclq') {
    const pool = euroPoolFor('uclq', S);
    const opp = pool[fnv(S.clubId + S.season) % pool.length];
    ensureEuroClub(S, opp);
    S.euro = { comp: 'uclq', stage: 'qual', pts: 0, gf: 0, ga: 0, played: 0,
      coef: S.euro.coef, level: S.euro.level };
    fixtures1(S, S.clubId, 'eu-' + opp.id, competitionDate(S, '08-15', 5, 'euro-qual'), 'ucl', 'Квалификация ЛЧ · 1-й матч', { leg: 1 });
    fixtures1(S, 'eu-' + opp.id, S.clubId, competitionDate(S, '08-22', 5, 'euro-qual'), 'ucl', 'Квалификация ЛЧ · 2-й матч', { leg: 2 });
  } else {
    startEuroLeaguePhase(S, ticket === 'uel' ? 'uel' : ticket === 'uecl' ? 'uecl' : 'ucl');
  }
}
function startEuroLeaguePhase(S, comp) {
  const pool = shuffleSeeded(euroPoolFor(comp, S), 'lp' + comp + S.season);
  pool.forEach((t, i) => ensureEuroClub(S, t));
  const me = myClub(S), coef = euroCoefficient(me, S.season);
  S.euro = { comp, stage: 'league', pts: 0, gf: 0, ga: 0, played: 0,
    coef, level: euroLevel(coef).id, opps: pool.slice(0, 8).map(t => 'eu-' + t.id) };
  S.euro.opps.forEach((oid, i) => {
    const home = i % 2 ? oid : S.clubId, away = i % 2 ? S.clubId : oid;
    fixtures1(S, home, away, competitionDate(S, EURO_LP_DATES[i], 5, 'euro-lp'), comp, 'Общий этап · тур ' + (i + 1));
  });
}
function tickEuro(S) {
  const e = S.euro;
  if (!e || !e.comp) return;
  const my = S.fixtures.filter(f => (f.comp === 'ucl' || f.comp === 'uel' || f.comp === 'uecl' || f.comp === 'uclq') && (f.home === S.clubId || f.away === S.clubId));
  if (e.stage === 'qual') {
    if (my.length === 2 && my.every(f => f.played)) {
      const gf = my.reduce((a, f) => a + (f.home === S.clubId ? f.hg + f.ag : f.ag + f.hg), 0);
      const ga = my.reduce((a, f) => a + (f.home === S.clubId ? f.ag + f.hg : f.hg + f.ag), 0);
      const won = gf > ga || (gf === ga && fnv(S.clubId + S.season) % 2 === 0);
      if (won) startEuroLeaguePhase(S, 'ucl');
      else startEuroLeaguePhase(S, 'uel');
    }
    return;
  }
  if (e.stage === 'league') {
    const lp = my.filter(f => /^Общий этап/.test(f.label));
    if (lp.length && lp.every(f => f.played) && !e.knockDone) {
      e.played = lp.length;
      e.pts = lp.reduce((a, f) => {
        const myH = f.home === S.clubId;
        const mg = myH ? f.hg : f.ag, og = myH ? f.ag : f.hg;
        e.gf += mg; e.ga += og;
        return a + (mg > og ? 3 : mg === og ? 1 : 0);
      }, 0);
      if (e.pts >= Math.max(8, e.played * 1.25)) {
        e.stage = 'r16';
        const pool = shuffleSeeded(GD.EURO_TEAMS.filter(t => t.ticket === (e.comp === 'ucl' ? 'ucl' : e.comp)).map(t => 'eu-' + t.id).filter(id => id !== S.clubId && S.clubs.some(c => c.id === id)), 'ko' + S.season);
        const opp = pool[e.gf % Math.max(1, pool.length)] || ('eu-' + GD.EURO_TEAMS[0].id);
        ensureEuroClub(S, GD.EURO_TEAMS.find(t => 'eu-' + t.id === opp) || GD.EURO_TEAMS[0]);
        e.koOpp = opp;
        fixtures1(S, S.clubId, opp, competitionDate(S, '02-17', 4, 'euro-r16'), e.comp, '1/8 · 1-й матч', { leg: 1 });
        fixtures1(S, opp, S.clubId, competitionDate(S, '03-03', 4, 'euro-r16'), e.comp, '1/8 · 2-й матч', { leg: 2 });
      } else { e.stage = 'done'; }
    }
    return;
  }
  if (['r16', 'qf', 'sf', 'final'].includes(e.stage)) {
    const lab = e.stage === 'r16' ? '1/8' : e.stage === 'qf' ? '1/4' : e.stage === 'sf' ? '1/2' : 'Финал';
    const roundFx = my.filter(f => f.label.startsWith(lab));
    if (roundFx.length && roundFx.every(f => f.played)) {
      if (lab === 'Финал') {
        const f = roundFx[0];
        const won = (f.home === S.clubId ? f.hg > f.ag : f.ag > f.hg);
        e.stage = won ? 'champion' : 'done';
        if (won) {
          const prize = { ucl: GD.PRIZES.uclWin, uel: GD.PRIZES.uelWin, uecl: GD.PRIZES.ueclWin }[e.comp] || GD.PRIZES.uelWin;
          S.budget += prize;
          S.log.push('HONOR:' + S.season + '|Победитель ' + euroName(e.comp) + ' — ' + myClub(S).name);
          addMsg(S, 'Лига', 'Еврокубок', '«' + myClub(S).name + '» выигрывает ' + euroName(e.comp) + '!');
        }
        return;
      }
      const gf = roundFx.reduce((a, f) => a + (f.home === S.clubId ? f.hg : f.ag), 0);
      const ga = roundFx.reduce((a, f) => a + (f.home === S.clubId ? f.ag : f.hg), 0);
      if (gf > ga || (gf === ga && fnv(e.comp + e.stage + S.date) % 2 === 0)) {
        const next = e.stage === 'r16' ? 'qf' : e.stage === 'qf' ? 'sf' : 'final';
        e.stage = next;
        if (next !== 'final') {
          const base = next === 'qf' ? ['04-14', '04-28'] : ['05-05', '05-19'];
          const pool = GD.EURO_TEAMS.filter(t => t.ticket === (e.comp === 'ucl' ? 'ucl' : e.comp));
          const opp = 'eu-' + pool[(fnv(S.clubId + next) % pool.length)].id;
          ensureEuroClub(S, GD.EURO_TEAMS.find(t => 'eu-' + t.id === opp));
          e.koOpp = opp;
          fixtures1(S, S.clubId, opp, competitionDate(S, base[0], 3, 'euro-' + next), e.comp, (next === 'qf' ? '1/4' : '1/2') + ' · 1-й матч', { leg: 1 });
          fixtures1(S, opp, S.clubId, competitionDate(S, base[1], 3, 'euro-' + next), e.comp, (next === 'qf' ? '1/4' : '1/2') + ' · 2-й матч', { leg: 2 });
        } else {
          const pool = GD.EURO_TEAMS.filter(t => t.ticket === (e.comp === 'ucl' ? 'ucl' : e.comp));
          const opp = 'eu-' + pool[(fnv(S.clubId + 'fin') % pool.length)].id;
          ensureEuroClub(S, GD.EURO_TEAMS.find(t => 'eu-' + t.id === opp));
          e.koOpp = opp;
          fixtures1(S, S.clubId, opp, competitionDate(S, '05-28', 2, 'euro-final'), e.comp, 'Финал', { leg: 1 });
        }
      } else { e.stage = 'done'; }
    } else if (roundFx.some(f => f.label === 'Финал' && f.played)) {
      const f = roundFx[0];
      const won = (f.home === S.clubId ? f.hg > f.ag : f.ag > f.hg);
      e.stage = won ? 'champion' : 'done';
      if (won) {
        const prize = { ucl: GD.PRIZES.uclWin, uel: GD.PRIZES.uelWin, uecl: GD.PRIZES.ueclWin }[e.comp] || GD.PRIZES.uelWin;
        S.budget += prize;
        S.log.push('HONOR:' + S.season + '|Победитель ' + euroName(e.comp) + ' — ' + myClub(S).name);
        addMsg(S, 'Лига', 'Еврокубок', '«' + myClub(S).name + '» выигрывает ' + euroName(e.comp) + '!');
      }
    }
  }
}

return {
  fnv, rng, clamp, poisson, pick, rint, F, IW, USD, moneyRub,
  CURS, setCurrency, getCurrency, curDef,
  toDate, toISO, addDays, fmtDate, fmtDateFull, fmtDDMM, inWinter,
  seasonCutoff, seasonReady, clubHistoryProfile,
  attrM, ageMult, valModel, posScore, rating, dynRating, dynMods, recentAvg, fc27Equiv,
  genPlayer, makeSquad, genMarketPlayer, marketPlayers, poolPlayers, ensureMarketDepth,
  realPlayer, ensureReals, revalueAll, benchOf, setBench, BENCH_MAX, migrateSave,
  newCareer, defaultKit,
  adapt, ft, ht, tacOf, autoLineup, lineupPlayers, teamScores, ovrXI, lambdas, available,
  instantMatch, simSegment, createLive, liveStep, applyLiveSub, postMatch,
  fullName, clubById, playersOf, myClub, addMsg, inWindow,
  seasonDates, circleFixtures, buildAllFixtures, genCupFixtures, nextCupRegionRound, finishCupGroups,
  table, tablePos, leagueDone, advanceDay, train,
  buyPlayer, acceptOfferById, maybeIncomingOffer, renewContract, listPlayer,
  wageCap, totalWage, endSeason, zoneOf, checkSack, doSack, takeJob, resign, applyForJob,
  youthPlayers, promoteYouth, releaseYouth, trainYouth,
  setObjectives, objectiveValue, objectiveProgress, updateObjectives, evaluateObjectives,
  objTargetText, objValueText, expectedRank,
  scoutReport, DIFFS, euroName, initEuro, tickEuro, ensureEuroClub,
  euroTicketsForClubs, refreshEuroTickets, euroSeasonRatings, euroCoefficient, euroLevel, euroRoster,
};
})();
if (typeof module !== 'undefined') module.exports = ENG;
if (typeof window !== 'undefined') window.ENG = ENG;
