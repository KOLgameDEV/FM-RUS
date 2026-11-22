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
// budgets/prices internally in mln ₽; wages in тыс ₽/нед; $ shown at fixed 92 ₽/$
function F(mln) { // ₽ money for display
  mln = Math.round(mln);
  if (Math.abs(mln) >= 1000) {
    const rd = Math.round(mln / 100) / 10;
    return (rd % 1 === 0 ? rd.toFixed(0) : rd.toFixed(1)) + ' млрд ₽';
  }
  return mln + ' млн ₽';
}
function IW(tysPerWeek) {
  if (tysPerWeek >= 1000) {
    const m = Math.round(tysPerWeek / 100) / 10;
    return (m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)) + ' млн ₽/нед';
  }
  return Math.round(tysPerWeek) + ' тыс ₽/нед';
}
function USD(mlnRub) {
  const usd = Math.round(mlnRub * 1e6 / GD.RUB_PER_USD);
  return '$' + String(usd).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

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
  if (pos === 'GK' && rand() < 0.4) age = rint(rand, 28, 34);
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
    injured: 0, goals: 0, assists: 0, apps: 0, ratingSum: 0, yellow: 0, ban: 0, listed: false,
  };
  let raw;
  if (club.league === 'media' && GD.MEDIA_BASE[club.id] !== undefined) {
    const b = GD.MEDIA_BASE[club.id];
    raw = clamp(58, 78, b + (idx < 3 ? 2 : idx < 11 ? 0 : -4) + Math.round((rand() - .5) * 3));
    p.ovr = raw; p.pot = clamp(88, 44, raw + rint(rand, 0, 4));
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

// ---------- market pool players (deterministic, 32 per extra country) ----------
const MARKET_BANDS = [[74, 83], [72, 80], [70, 77], [66, 74]];
function genMarketPlayer(mk, i, rand) {
  const pos = pick(['GK', 'DR', 'DL', 'DC', 'DM', 'MC', 'AM', 'MR', 'ML', 'ST'], rand);
  const band = MARKET_BANDS[Math.min(3, Math.floor(i / 8))];
  const ovr = rint(rand, band[0], band[1]);
  const age = rint(rand, 18, 32);
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
    injured: 0, goals: 0, assists: 0, apps: 0, ratingSum: 0, yellow: 0, ban: 0, listed: false,
  };
  p.pot = age <= 21 ? Math.min(93, ovr + rint(rand, 4, 10)) : ovr;
  p.ovr = star ? Math.min(93, mk.star) : Math.min(ovr, p.pot);
  p.growth = 0;
  const v = Math.max(2, Math.round(Math.pow(1.13, p.ovr - 60) * ageMult(p.age) * mk.priceK * 100));
  p.value = v;
  p.wage = Math.max(12, Math.round(v * 0.9));
  return p;
}
function marketPlayers(mk) {
  const out = [];
  for (let i = 0; i < 32; i++) {
    const rand = rng('pool-' + mk.id + '-' + i);
    out.push(genMarketPlayer(mk, i, rand));
  }
  return out;
}
function poolPlayers() {
  // all non-inGame markets materialized lazily via pool:country clubIds
  const out = [];
  for (const mk of GD.MARKETS) {
    if (mk.inGame) continue;
    out.push(...marketPlayers(mk));
  }
  return out;
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
    v: 3, manager: (managerName || '').trim() || 'Алексей Орлов',
    clubId, date: season + '-07-11', season,
    clubs, players, fixtures,
    inbox: welcomeMessages(club),
    tactics, budget: club.budget, balance: Math.round(club.budget * 0.35 * 10) / 10,
    confidence: 68, played: 0, focus: null, sacked: false, offers: [], log: [],
    kit: defaultKit(club, hashIdx),
    badSeasons: 0,
    cup: { byes: [], userOut: false, stage: 'live' },
    euro: { comp: null, stage: 'done', pts: 0, gf: 0, ga: 0, round: 0 },
    phase: 'season', difficulty: 'experienced', matchMins: 2,
    euroTickets: {},
  };
  S.tactics.slots = autoLineup(S, clubId, S.tactics.formation).map(x => x.pid);
  genCupFixtures(S);
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
function lambdas(S, homeId, awayId) {
  const hTac = tacOf(S, homeId), aTac = tacOf(S, awayId);
  const H = teamScores(S, homeId, hTac), A = teamScores(S, awayId, aTac);
  let lh = clamp(0.32 + H.att / Math.max(8, A.def) * 0.95 * 1.08, 0.25, 3.3);
  let la = clamp(0.28 + A.att / Math.max(8, H.def) * 0.9, 0.2, 3.1);
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
      const ku = clamp(1.08 + diff * 0.04, .5, 1.8), ko = clamp(1.02 - diff * 0.025, .45, 1.5);
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
  return { lh: clamp(lh, 0.05, 3.4), la: clamp(la, 0.04, 3.1), H, A };
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
    const n = poisson(lam * 3.1, rand);
    const scorers = plan.filter(s => s.pos !== 'DC' && s.pos !== 'GK');
    for (let i = 0; i < n; i++) {
      const min = fromMin + Math.floor(rand() * (toMin - fromMin));
      const s = scorers.length ? pick(scorers, rand) : plan[0];
      const p = S.players.find(x => x.id === s.pid);
      const d = 0.06 + rand() * (0.28 + lam * 0.08);
      const shot = { min, side, kind: 'shot', xg: d, pid: p.id, text: '' };
      if (rand() < d * (0.75 + p.sho / 40)) {
        shot.kind = 'goal';
        shot.piece = 'open';
        shot.text = fullName(p) + ' ' + pickText(GOAL_TEXTS, rand);
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
    // injury feint 4%
    if (rand() < 0.04) {
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
  if (rand() < Math.min(0.8, segLen / 26)) {
    const takerC = plan.filter(s => s.pos !== 'GK')
      .sort((x, y) => (S.players.find(q => q.id === y.pid).sho + S.players.find(q => q.id === y.pid).tec) - (S.players.find(q => q.id === x.pid).sho + S.players.find(q => q.id === x.pid).tec))[0];
    if (takerC) {
      const taker = S.players.find(q => q.id === takerC.pid);
      const min = fromMin + Math.floor(rand() * segLen);
      const r = rand();
      if (r < 0.42) events.push({ min, side, kind: 'throwin', pid: taker.id, text: fullName(taker) + ' быстро вводит мяч из аута' });
      else if (r <= 0.70) {
        events.push({ min, side, kind: 'corner', pid: taker.id, piece: 'corner', text: fullName(taker) + ' навешивает в штрафную с углового' });
      } else if (r <= 0.78) {
        // penalty
        const scoreP = clamp(0.72 + taker.sho / 80, 0.4, 0.95);
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
        const base = type === 'curl' ? 0.34 : type === 'chip' ? 0.28 : 0.2;
        if (rand() < base * (0.7 + taker.sho / 20)) {
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
  fx.played = true; fx.hg = res.hg; fx.ag = res.ag;
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
      if (e.kind === 'card' && e.pid) yMap[e.pid] = (yMap[e.pid] || 0) + 1;
      if (e.kind === 'injury' && e.pid) inMap[e.pid] = true;
    });
    if (live) Object.assign(minsMap, live.mins);
    plan.forEach(s => {
      const p = S.players.find(x => x.id === s.pid);
      if (!p) return;
      const playedMin = minsMap[p.id] !== undefined ? Math.min(90, minsMap[p.id]) : (live ? 90 : rint(rng(fx.id + p.id), 60, 90));
      if (playedMin < 1 && live) return;
      p.apps++;
      p.goals += gMap[p.id] || 0;
      const rate = clamp(6.4 + (gMap[p.id] || 0) * 0.9 + (rng(fx.id + ':' + p.id)() * 0.5 - 0.15)
        - 0.4 * (yMap[p.id] ? 1 : 0)
        + (s.pos === 'GK' && (myHome ? res.ag : res.hg) === 0 ? 0.6 : 0), 4.5, 9.6);
      p.ratingSum += rate;
      p.yellow += yMap[p.id] || 0;
      if (p.yellow >= 4) { p.yellow = 0; p.ban = Math.max(p.ban, 1); }
      if (inMap[p.id] && rng('inj' + fx.id + p.id)() < 0.45) p.injured = rint(rng('injd' + fx.id + p.id), 10, 27);
      p.cond = clamp(p.cond - (playedMin / 11 + (p.age >= 34 ? 8 : p.age >= 30 ? 5 : 0) + (p.sta < 11 ? 3 : 0)), 28, 100);
      p.sharp = clamp(p.sharp + (playedMin >= 25 ? 3 : -2), 20, 100);
      growthTick(p, playedMin, rate);
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
  addMsg(S, 'Протокол', 'Итог матча с «' + oppClub.name + '»', protocolBody(S, fx, res));
  S.tactics.slots.length && 0;
  checkSack(S);
  return { win, draw };
}
function protocolBody(S, fx, res) {
  const rank = tablePos(S, S.clubId);
  const grown = S.players.filter(p => p.clubId === S.clubId && p.ovr >= 70).length;
  return 'Место в таблице: ' + rank + '. xG ' + res.xgH.toFixed(2) + ':' + res.xgA.toFixed(2) + '. Доверие совета: ' + S.confidence + '.';
}
function growthTick(p, mins, rate) {
  const cap = p.age <= 21 ? 4 : p.age <= 24 ? 3 : p.age <= 28 ? 2 : 1;
  if (mins >= 20 && p.age < 33 && p.growth < cap && p.ovr < p.pot &&
    ((p.age <= 23 && rate >= 6.9 && Math.random() < 0.28) ||
     (p.age <= 28 && rate >= 7.6 && Math.random() < 0.12) ||
     (p.age >= 30 && rate >= 8.2 && p.growth < 1))) { p.ovr++; p.growth++; }
  if (p.age >= 32 && mins >= 60 && rate < 6.3 && Math.random() < 0.22) p.ovr = Math.max(44, p.ovr - 1);
}

// ---------- helpers ----------
function clubById(S, id) { return S.clubs.find(c => c.id === id); }
function playersOf(S, id) { return S.players.filter(p => p.clubId === id); }
function myClub(S) { return clubById(S, S.clubId); }
function addMsg(S, from, subject, body) {
  S.inbox.unshift({ id: 'msg-' + fnv(from + subject + S.date) + '-' + S.inbox.length, from, subject, body, date: S.date, read: false });
  if (S.inbox.length > 40) S.inbox.length = 40;
}
function inWindow(dateISO) {
  const d = toDate(dateISO), m = d.getMonth() + 1, day = d.getDate();
  return (m === 6 && day >= 15) || (m === 7) || (m === 8) || (m === 9 && day <= 12)
    || (m === 1 && day >= 20) || (m === 2 && day <= 25);
}

// ---------- calendar ----------
function seasonDates(season) {
  const dates = [];
  const d = new Date(season, 6, 18);
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
  while (dates.length < 56) {
    if (!inWinter(d)) dates.push(toISO(new Date(d)));
    d.setDate(d.getDate() + 7);
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
    const dates = seasonDates(season);
    const dbl = lg !== 'fnl3';
    const nRounds = dbl ? rounds.length * 2 : rounds.length;
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
    const dates = seasonDates(season);
    rounds.concat(rounds.map(rr => rr.map(p => ({ home: p.away, away: p.home }))))
      .forEach((pairs, r) => pairs.forEach((pr, i) => {
        fixtures.push({ id: lg + '-' + (r + 1) + '-' + i, league: lg, round: r + 1,
          date: dates[r], home: pr.home, away: pr.away, played: false, comp: 'league', label: '' });
      }));
  });
  return fixtures;
}
const CUP_GROUP_DATES = ['08-05', '08-19', '09-02', '10-14', '10-28', '11-25'];
const CUP_KD_DATES = ['07-29', '08-12', '08-26', '09-16'];
const CUP_KNOCK = { r16: ['03-03', '03-17'], qf: ['04-07', '04-21'], sf: ['05-05', '05-19'], final: ['06-02'] };
function genCupFixtures(S) {
  const rpl = S.clubs.filter(c => c.league === 'rpl');
  const groups = GD.CUP_GROUPS.map(g => g.map(id => id)).filter(g => g.every(id => rpl.some(c => c.id === id)));
  if (groups.length < 4) {
    const byRep = rpl.slice().sort((a, b) => b.rep - a.rep).map(c => c.id);
    for (let i = 0; i < 4; i++) groups.push(byRep.slice(i * 4, i * 4 + 4));
  }
  S.cup.groups = groups;
  let round = 0;
  groups.forEach((g, gi) => {
    for (let w = 0; w < 2; w++) {
      for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
        const a = w ? g[j] : g[i], b = w ? g[i] : g[j];
        const d = CUP_GROUP_DATES[round % 6];
        fixtures1(S, a, b, S.season + '-' + d, 'cup', 'Группа ' + 'ABCD'[gi]);
      }
      round++;
    }
  });
  // региональный плей-офф: ФНЛ/ФНЛ-2/ФНЛ-3/ЛФК + 4 хэш-клуба Медиа
  const region = S.clubs.filter(c => ['fnl', 'fnl2', 'fnl3', 'amateur'].includes(c.league)).map(c => c.id);
  const media = S.clubs.filter(c => c.league === 'media').slice().sort((a, b) => fnv(a.id + S.season) - fnv(b.id + S.season)).slice(0, 4).map(c => c.id);
  S.cup.region = shuffleSeeded(region.concat(media), 'reg' + S.season);
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
  const date = S.season + '-' + dates[roundIdx];
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
  const gF = S.fixtures.filter(f => f.comp === 'cup' && /^Группа/.test(f.label) && f.played);
  if (!gF.length) return;
  const adv = [];
  (S.cup.groups || []).forEach((g, gi) => {
    const lab = 'Группа ' + 'ABCD'[gi];
    const stat = {};
    g.forEach(id => stat[id] = { pts: 0, gd: 0 });
    S.fixtures.filter(f => f.comp === 'cup' && f.label === lab).forEach(f => {
      if (!f.played) return;
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
    fixtures1(S, home, away, (S.season + (+(dates[0].split('-')[0]) >= 6 ? 1 : 0)) + '-' + dates[0], 'cup', label + ' · 1-й матч', { leg: 1, tie: i / 2 });
    fixtures1(S, away, home, (S.season + (+(dates[1].split('-')[0]) >= 6 ? 1 : 0)) + '-' + dates[1], 'cup', label + ' · 2-й матч', { leg: 2, tie: i / 2 });
  }
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

// ---------- daily ----------
function advanceDay(S) {
  S.date = addDays(S.date, 1);
  const d = toDate(S.date), day = S.date;
  // simulate other fixtures today (assistant handles user's if skipped)
  const todays = S.fixtures.filter(f => f.date === day && !f.played);
  const out = [];
  todays.forEach(f => {
    if (f.home === S.clubId || f.away === S.clubId) {
      if (f.comp === 'league' || true) {
        const r = instantMatch(S, f.home, f.away, f.id + ':auto');
        postMatch(S, f, r, null);
        addMsg(S, 'Помощник', 'Матч без вас', 'Ваш матч с «' + clubById(S, f.home === S.clubId ? f.away : f.home).name + '» досиммулирован: ' + r.hg + ':' + r.ag + '.');
      }
    } else {
      const r = instantMatch(S, f.home, f.away, f.id + ':ai');
      f.played = true; f.hg = r.hg; f.ag = r.ag;
    }
    out.push(f);
  });
  // cup regional rounds trigger
  if (todays.length) nextCupRegionRound(S);
  const groupDates = CUP_GROUP_DATES.map(x => S.season + '-' + x);
  if (groupDates.includes(day)) finishCupGroups(S);
  // Mondays: wages
  if (d.getDay() === 1) {
    const w = playersOf(S, S.clubId).reduce((a, p) => a + p.wage, 0);
    S.balance = Math.round((S.balance - w / 1000) * 10) / 10;
    if (S.balance < -30) S.confidence = clamp(S.confidence - 2, 1, 99);
  }
  // 1st: sponsor
  if (d.getDate() === 1) {
    const inc = myClub(S).rep * 0.55;
    S.balance = Math.round((S.balance + inc) * 10) / 10;
    addMsg(S, 'Бухгалтерия', 'Спонсорский транш', 'Клуб получил ' + F(inc) + ' от спонсора.');
    monthlyRegen(S);
  }
  // daily upkeep for all players
  S.players.forEach(p => {
    if (p.injured) p.injured = Math.max(0, p.injured - 1);
    else { p.cond = clamp(p.cond + (S.focus === 'rest' && p.clubId === S.clubId ? 8 : 4), 28, 100); }
    if (p.ban) p.ban = Math.max(0, p.ban - (fnv(day + p.id) % 6 === 0 ? 1 : 0));
    if (p.sharp < 55 && !p.injured) p.sharp = clamp(p.sharp + 1, 20, 100);
  });
  // incoming offers during window
  if (inWindow(day)) maybeIncomingOffer(S);
  // euro fixtures
  tickEuro(S);
  checkSack(S);
  return out;
}
function monthlyRegen(S) {
  const rand = rng('regen' + S.date);
  S.players.forEach(p => {
    if (p.clubId === 'free' || String(p.clubId).startsWith('pool:')) return;
    if (p.age <= 23 && p.sharp > 60 && rand() < 0.12) {
      const k = pick(['pac', 'sho', 'pas', 'tec', 'def'], rand);
      p[k] = clamp(p[k] + 1, 4, 19); p.ovr = clamp(Math.round((posScore(p) * 3.05 + 30)), 44, p.pot);
    }
    if (p.age >= 33 && rand() < 0.10) p.pac = clamp(p.pac - 1, 4, 19);
  });
}

// ---------- training ----------
function train(S, focus) {
  if (S.trainedOn === S.date) return false;
  S.trainedOn = S.date;
  S.focus = focus;
  const squad = playersOf(S, S.clubId);
  if (focus === 'rest') squad.forEach(p => { p.cond = clamp(p.cond + 12, 28, 100); p.sharp = clamp(p.sharp - 2, 20, 100); });
  else if (focus === 'physical') {
    squad.forEach(p => { p.cond = clamp(p.cond - 5, 28, 100); p.sharp = clamp(p.sharp + 4, 20, 100); });
    squad.filter(p => p.age <= 23 && p.growth < 4).forEach(p => {
      if (Math.random() < 0.06) { p.sta = clamp(p.sta + 1, 4, 19); p.ovr = Math.min(p.pot, p.ovr + 1); p.growth++; }
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
  if (!inWindow(S.date) && player.clubId !== 'free' && !String(player.clubId).startsWith('pool:')) return { ok: false, why: 'window' };
  if (fee > S.budget) return { ok: false, why: 'money' };
  const target = String(player.clubId).startsWith('pool:') ? null : clubById(S, player.clubId);
  const theirRep = target ? target.rep : Math.min(90, 50 + fnv(String(player.clubId)) % 40);
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
    if (rank >= n - 3 && rank <= n - 1) return 'po'; // 13-14 => po
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
function endSeason(S) {
  const season = S.season;
  const lg = myClub(S).league;
  const t = table(S, lg);
  const rank = t.findIndex(r => r.id === S.clubId) + 1;
  // prizes
  const P = GD.PRIZES;
  let prize = 0;
  const pz = { rpl: P.rpl, fnl: P.fnl, fnl2: P.fnl2, fnl3: P.fnl3, media: P.media, amateur: P.amateur };
  if (pz[lg]) { const arr = pz[lg]; prize = arr[rank - 1] !== undefined ? arr[rank - 1] : (lg === 'rpl' ? (rank <= 10 ? P.rpl7 : P.rplRest) : lg === 'fnl3' ? 6 : 2); }
  else prize = P.foreign[Math.min(3, rank - 1)];
  S.budget = Math.round((S.budget + prize) * 10) / 10;
  S.balance = Math.round((S.balance + prize * 0.35) * 10) / 10;
  if (rank === 1) championGlory(S, lg);
  // promotion/relegation across rus pyramid
  const rplLen = table(S, 'rpl').length, fnlLen = table(S, 'fnl').length, fnl2Len = table(S, 'fnl2').length;
  moveLeague(S, 'fnl', [0, 1], 'rpl', 'up', 'прямой выход в РПЛ');
  moveLeague(S, 'rpl', [rplLen - 2, rplLen - 1], 'fnl', 'down', 'вылет в Первую лигу');
  moveLeague(S, 'fnl2', [0, 1], 'fnl', 'up', 'выход в Первую лигу');
  moveLeague(S, 'fnl', [fnlLen - 4, fnlLen - 1], 'fnl2', 'down', 'вылет в ФНЛ-2');
  moveLeague(S, 'fnl3', [0, 1], 'fnl2', 'up', 'выход в ФНЛ-2');
  moveLeague(S, 'fnl2', [fnl2Len - 4, fnl2Len - 1], 'fnl3', 'down', 'вылет в ФНЛ-3');
  // стыки РПЛ 13-14 vs ФНЛ 4-3
  const rplT = table(S, 'rpl'), fnlT = table(S, 'fnl');
  playOff(S, rplT[12].id, fnlT[3].id, season, 'Стыки РПЛ · 13-е против 4-го Первой лиги');
  playOff(S, rplT[13].id, fnlT[2].id, season, 'Стыки РПЛ · 14-е против 3-го Первой лиги');
  // pyramid: 5th of each rus league mini-group, winner +1 league
  const pyr = ['fnl3', 'fnl2', 'fnl', 'rpl'].map(id => (table(S, id)[4] || {}).id).filter(Boolean);
  if (pyr.length > 1) {
    const rand = rng('pyr' + season);
    const pts = pyr.map(id => ({ id, p: rint(rand, 0, 9) }));
    pts.sort((a, b) => b.p - a.p);
    const upMap = { fnl3: 'fnl2', fnl2: 'fnl', fnl: 'rpl' };
    const w = pts[0];
    if (upMap[w.id]) {
      clubById(S, w.id).league = upMap[w.id];
      clubById(S, w.id).rep = clamp(clubById(S, w.id).rep + 3, 28, 95);
      S.log.push(clubById(S, w.id).name + ' — победа в стыках пирамиды');
      if (w.id === S.clubId) addMsg(S, 'Лига', 'Пирамида', 'Вы выиграли мини-группу пирамиды и поднимаетесь в ' + GD.LEAGUES[upMap[w.id]].name + '!');
    }
  }
  // user season verdicts
  const zone = zoneOf(lg, rank - 1, t.length);
  if (lg === 'fnl3') {
    if (rank > Math.ceil(t.length * 0.55) || S.confidence < 36) S.badSeasons++; else S.badSeasons = 0;
    if (S.badSeasons >= 2) { doSack(S); return finalizeSeason(S, season, lg, rank, prize); }
  } else if ((zone === 'down' || (zone === 'po')) ) {
    S.badSeasons++;
    if (S.badSeasons >= 2 && S.confidence < 42) doSack(S);
  } else S.badSeasons = 0;
  if (lg === 'rpl') setEuroTickets(S, rplT);
  finalizeSeason(S, season, lg, rank, prize);
}
function finalizeSeason(S, season, lg, rank, prize) {
  // cup & euro closure
  closeCupSeason(S);
  closeEuroSeason(S);
  // aging
  S.players.forEach(p => {
    p.age++;
    if (p.age >= 33) p.ovr = Math.max(46, p.ovr - 1);
    else if (p.age >= 31 && Math.random() < 0.4) p.ovr = Math.max(48, p.ovr - 1);
    if (p.contract <= 1 && Math.random() < 0.5) {
      p.clubId = 'free'; p.contract = 2;
    } else p.contract = Math.max(1, p.contract - 1);
    p.goals = p.assists = p.apps = p.ratingSum = p.yellow = p.ban = 0;
    p.renewed = false;
  });
  // keep squads >= 18 with youth
  S.clubs.forEach(c => {
    const sq = playersOf(S, c.id);
    const rand = rng('youth' + c.id + S.season);
    while (sq.length + 0 < 18) {
      const pos = pick(['MC', 'DC', 'ST', 'GK', 'DR'], rand);
      const yp = genPlayer(c, 17 + sq.length, pos, rand, new Set());
      yp.age = rint(rand, 18, 20);
      yp.value = Math.max(1, Math.round(yp.value * 0.45));
      yp.wage = Math.max(8, Math.round(yp.wage * 0.5));
      S.players.push(yp); sq.push(yp);
    }
    c.budget = Math.round(c.budget * (['rpl', 'fnl', 'fnl2'].includes(c.league) ? 1 : 1));
  });
  S.season++;
  S.budget = Math.round(myClub(S).budget * 0.35 + S.budget * 0.7);
  S.balance = Math.round(S.balance + myClub(S).rep * 2);
  S.confidence = clamp(S.confidence + 4, 1, 99);
  S.fixtures = buildAllFixtures(S.clubs, S.season);
  S.cup = { byes: [], userOut: false, stage: 'live' };
  genCupFixtures(S);
  if (S.euro && S.euro.stage === 'champion') S.confidence = 99;
  initEuro(S);
  S.date = S.season + '-07-11';
  S.trainedOn = null;
  S.log.push('Сезон ' + (S.season - 1) + '/' + S.season + ' закрыт. Место: ' + rank + '. Призовые: ' + F(prize) + '.');
  addMsg(S, 'Лига', 'Новый сезон', 'Сезон ' + (S.season - 1) + '/' + (S.season) + ' закрыт. Новый чемпионат — ' + GD.LEAGUES[myClub(S).league].name + '. Вы в «' + myClub(S).name + '».');
}
function moveLeague(S, from, idxs, to, dir, text) {
  const tt = table(S, from);
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
function setEuroTickets(S, rplT) {
  const map = { 1: 'ucl', 2: 'ucl', 3: 'uclq', 4: 'uel', 5: 'uecl', 6: 'uecl' };
  S.euroTickets = {};
  rplT.slice(0, 6).forEach((row, i) => S.euroTickets[row.id] = map[i + 1]);
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

// ---------- sack / vacancies ----------
function checkSack(S) {
  if (S.played >= 8 && S.confidence <= 16 && !S.sacked) doSack(S);
}
function doSack(S) {
  if (S.sacked) return;
  S.sacked = true;
  const club = myClub(S);
  const near = S.clubs.filter(c => Math.abs(c.rep - (club.rep - 6)) <= 6 && c.id !== club.id && !['amateur'].includes(c.league)).slice(0, 3);
  const foreign = pick(S.clubs.filter(c => GD.FOREIGN_LEAGUES.includes(c.league)), rng('vac' + S.manager + S.season));
  S.vacancies = shuffleSeeded(near.concat([foreign]), 'vac' + S.manager + S.season).map(c => c.id);
  addMsg(S, 'Совет директоров', 'Отставка', 'Вы освобождены от должности главного тренера «' + club.name + '».');
}
function takeJob(S, clubId) {
  S.clubId = clubId;
  S.sacked = false;
  S.confidence = 62;
  S.budget = clubById(S, clubId).budget;
  S.balance = Math.round(S.budget * 0.35);
  S.kit = defaultKit(clubById(S, clubId), fnv(clubId));
  S.tactics = { formation: '4-3-3', slots: [], style: 'direct', mentality: 0, press: 2, tempo: 3, line: 2, width: 2 };
  S.tactics.slots = autoLineup(S, clubId, '4-3-3').map(x => x.pid);
  S.played = 0;
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
  return line + ' Ожидаемый стиль: ' + styleName + ', схемa ' + t.formation + '.';
}

// ---------- european comps ----------
const EURO_LP_DATES = ['09-16', '10-01', '10-22', '11-05', '11-26', '12-10', '01-21', '01-29'];
const EURO_POOL = { ucl: 'ucl', uclq: 'uclq', uel: 'uel', uecl: 'uecl' };
function euroPoolFor(ticket) {
  let pool = GD.EURO_TEAMS.filter(t => t.ticket === ticket);
  if (ticket === 'uclq') pool = GD.EURO_TEAMS.filter(t => t.ticket === 'uclq' || t.rep < 75);
  if (pool.length < 8) pool = GD.EURO_TEAMS.slice();
  return pool;
}
function ensureEuroClub(S, t) {
  if (!S.clubs.some(c => c.id === 'eu-' + t.id)) {
    S.clubs.push({ id: 'eu-' + t.id, name: t.name, short: t.short, city: t.city, league: 'euro',
      rep: t.rep, budget: 500, color: t.color, color2: t.color2, stadium: t.name, capacity: 50000 });
    const rand = rng('eusq-' + t.id);
    S.players.push(...makeSquad(S.clubs[S.clubs.length - 1], rand, new Set()));
  }
}
function initEuro(S) {
  S.euro = { comp: null, stage: 'done', pts: 0, gf: 0, ga: 0, round: 0, played: 0 };
  const ticket = (S.euroTickets || {})[S.clubId];
  if (!ticket || ENG.myClub(S).league !== 'rpl') return;
  if (ticket === 'uclq') {
    const pool = euroPoolFor('uclq');
    const opp = pool[fnv(S.clubId + S.season) % pool.length];
    ensureEuroClub(S, opp);
    S.euro = { comp: 'uclq', stage: 'qual', pts: 0, gf: 0, ga: 0, played: 0 };
    fixtures1(S, S.clubId, 'eu-' + opp.id, S.season + '-08-15', 'ucl', 'Квалификация ЛЧ · 1-й матч', { leg: 1 });
    fixtures1(S, 'eu-' + opp.id, S.clubId, S.season + '-08-22', 'ucl', 'Квалификация ЛЧ · 2-й матч', { leg: 2 });
  } else {
    startEuroLeaguePhase(S, ticket === 'uel' ? 'uel' : ticket === 'uecl' ? 'uecl' : 'ucl');
  }
}
function startEuroLeaguePhase(S, comp) {
  const pool = shuffleSeeded(euroPoolFor(comp), 'lp' + comp + S.season);
  pool.forEach((t, i) => ensureEuroClub(S, t));
  S.euro = { comp, stage: 'league', pts: 0, gf: 0, ga: 0, played: 0,
    opps: pool.slice(0, 8).map(t => 'eu-' + t.id) };
  S.euro.opps.forEach((oid, i) => {
    const yr = EURO_LP_DATES[i].split('-')[0] >= 6 ? S.season : S.season + 1;
    const home = i % 2 ? oid : S.clubId, away = i % 2 ? S.clubId : oid;
    fixtures1(S, home, away, yr + '-' + EURO_LP_DATES[i], comp, 'Общий этап · тур ' + (i + 1));
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
        fixtures1(S, S.clubId, opp, (S.season + 1) + '-02-17', e.comp, '1/8 · 1-й матч', { leg: 1 });
        fixtures1(S, opp, S.clubId, (S.season + 1) + '-03-03', e.comp, '1/8 · 2-й матч', { leg: 2 });
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
          const dates = next === 'qf' ? ['-04-14', '-04-28'] : ['-05-05', '-05-19'];
          const pool = GD.EURO_TEAMS.filter(t => t.ticket === (e.comp === 'ucl' ? 'ucl' : e.comp));
          const opp = 'eu-' + pool[(fnv(S.clubId + next) % pool.length)].id;
          ensureEuroClub(S, GD.EURO_TEAMS.find(t => 'eu-' + t.id === opp));
          e.koOpp = opp;
          const yr = S.season + 1;
          fixtures1(S, S.clubId, opp, yr + dates[0], e.comp, (next === 'qf' ? '1/4' : '1/2') + ' · 1-й матч', { leg: 1 });
          fixtures1(S, opp, S.clubId, yr + dates[1], e.comp, (next === 'qf' ? '1/4' : '1/2') + ' · 2-й матч', { leg: 2 });
        } else {
          const pool = GD.EURO_TEAMS.filter(t => t.ticket === (e.comp === 'ucl' ? 'ucl' : e.comp));
          const opp = 'eu-' + pool[(fnv(S.clubId + 'fin') % pool.length)].id;
          ensureEuroClub(S, GD.EURO_TEAMS.find(t => 'eu-' + t.id === opp));
          e.koOpp = opp;
          fixtures1(S, S.clubId, opp, S.season + 1 + '-06-05', e.comp, 'Финал', { leg: 1 });
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
  fnv, rng, clamp, poisson, pick, rint, F, IW, USD,
  toDate, toISO, addDays, fmtDate, fmtDateFull, fmtDDMM, inWinter,
  attrM, ageMult, valModel, posScore, rating, genPlayer, makeSquad, genMarketPlayer, marketPlayers, poolPlayers,
  newCareer, defaultKit,
  ft, ht, tacOf, autoLineup, lineupPlayers, teamScores, ovrXI, lambdas,
  instantMatch, simSegment, createLive, liveStep, applyLiveSub, postMatch,
  fullName, clubById, playersOf, myClub, addMsg, inWindow,
  seasonDates, circleFixtures, buildAllFixtures, genCupFixtures, nextCupRegionRound, finishCupGroups,
  table, tablePos, leagueDone, advanceDay, train,
  buyPlayer, acceptOfferById, maybeIncomingOffer, renewContract, listPlayer,
  wageCap, totalWage, endSeason, zoneOf, checkSack, doSack, takeJob,
  scoutReport, DIFFS, euroName, initEuro, tickEuro, ensureEuroClub,
};
})();
if (typeof module !== 'undefined') module.exports = ENG;
