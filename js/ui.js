/* ============================================================
 * UI — all screens rendered as HTML, actions via data-act
 * ============================================================ */
'use strict';
const UI = (() => {

// ---------- helpers ----------
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function badge(c, big) {
  return `<span class="badge${big ? ' big' : ''}" style="--c1:${c.color};--c2:${c.color2}">${esc(c.short.slice(0, 3).toUpperCase())}</span>`;
}
function ovrCls(v) { return v >= 75 ? 'hi' : v >= 62 ? 'mid' : 'lo'; }
function dynCls(v) { return v >= 80 ? 'hi' : v >= 68 ? 'mid' : v >= 56 ? 'ok' : 'lo'; }
// живой рейтинг как в FC 27:数字 + стрелка тренда относительно базового
function rateChip(p) {
  const d = ENG.dynRating(p);
  const tr = d > p.ovr ? '<i class="tr up">▲</i>' : d < p.ovr ? '<i class="tr dn">▼</i>' : '';
  return `<span class="ovr dyn ${dynCls(d)}">${d}${tr}</span>`;
}
function posTag(p) { return `<span class="pos">${GD.POS_ABBR[p.pos]}</span>`; }
function pname(p) { return p.first + ' ' + p.last; }
function leagueClubs(lg) { return G.S ? G.S.clubs.filter(c => c.league === lg) : GD.CLUBS.filter(c => c.league === lg); }
function myNextFixture() {
  const up = G.S.fixtures.filter(f => !f.played && (f.home === G.S.clubId || f.away === G.S.clubId) && f.date >= G.S.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  return up[0] || null;
}
function avgCond() {
  const sq = ENG.playersOf(G.S, G.S.clubId);
  return Math.round(sq.reduce((a, p) => a + p.cond, 0) / Math.max(1, sq.length));
}
function trophySvg(kind, size) {
  const col = { ucl: '#e4c56a', uel: '#c4622d', uecl: '#1f8a6a', cup: '#d5dbe3', media: '#1a1a1a', fnl3: '#a56b3c', fnl2: '#d6a85c', fnl: '#d6a85c', rpl: '#d6a85c', league: '#d6a85c' }[kind] || '#d6a85c';
  const s = size || 46;
  return `<svg width="${s}" height="${s}" viewBox="0 0 48 48" fill="none">
    <path d="M12 8h24v10c0 7-5 12-12 12S12 25 12 18V8z" fill="${col}" stroke="#00000040"/>
    <path d="M12 10H6c0 8 4 10 7 10M36 10h6c0 8-4 10-7 10" stroke="${col}" stroke-width="2.5"/>
    <path d="M20 30h8l1 6h-10l1-6z" fill="${col}"/><rect x="14" y="38" width="20" height="4" rx="2" fill="${col}"/>
  </svg>`;
}
// ---------- kit studio: geometry, patterns, palettes ----------
// art lives in a fixed 100x86 space, so one set of patterns scales with any svg size
const KIT_GEO = {
  shirt: 'M36 6 L22 10 L4 20 L12 36 L21 32 L19 80 L81 80 L79 32 L88 36 L96 20 L78 10 L64 6 C64 6 58 15 50 15 C42 15 36 6 36 6 Z',
  sleeveL: 'M22 10 L4 20 L12 36 L21 32 Z',
  sleeveR: 'M78 10 L96 20 L88 36 L79 32 Z',
  collar: 'M36 6 C42 15 58 15 64 6',
  shorts: 'M22 6 H78 L84 64 H60 L50 30 L40 64 H16 Z',
  sock: x => `M${x} 10 h22 v50 q0 6 -6 6 h-10 q-6 0 -6 -6 z`,
};
const HEM = 80;
const seq = (n, f) => [...Array(n)].map((_, i) => f(i)).join('');
const KIT_PATTERNS = [
  { n: 'Сплошная', d: () => '' },
  { n: 'Вертикальные полосы', d: t => seq(7, i => `<rect x="${-4 + i * 15}" y="0" width="8" height="${HEM}" fill="${t}"/>`) },
  { n: 'Горизонтальные полосы', d: t => seq(5, i => `<rect x="0" y="${2 + i * 17}" width="100" height="8" fill="${t}"/>`) },
  { n: 'Диагональ', d: t => `<path d="M14 0 L40 0 L100 58 L100 78 Z" fill="${t}"/>` },
  { n: 'Двойная диагональ', d: t => `<path d="M0 0 H16 L100 84 V96 H80 L0 16 Z" fill="${t}"/><path d="M34 0 H50 L100 50 V64 L88 56 Z" fill="${t}"/>` },
  { n: 'Половинное деление', d: t => `<rect x="50" y="0" width="50" height="${HEM}" fill="${t}"/>` },
  { n: 'Кольцо', d: t => `<rect x="0" y="28" width="100" height="11" fill="${t}"/>` },
  { n: 'Двойное кольцо', d: t => `<rect x="0" y="22" width="100" height="9" fill="${t}"/><rect x="0" y="38" width="100" height="9" fill="${t}"/>` },
  { n: 'Пояс', d: t => `<rect x="0" y="54" width="100" height="14" fill="${t}"/>` },
  { n: 'Шеврон', d: t => `<path d="M0 16 L50 42 L100 16 L100 32 L50 58 L0 32 Z" fill="${t}"/>` },
  { n: 'Саше', d: t => `<path d="M0 0 L24 0 L50 52 L76 0 L100 0 L62 ${HEM} L38 ${HEM} Z" fill="${t}"/>` },
  { n: 'Шахматка', d: t => seq(4, r => seq(5, c => (r + c) % 2 ? `<rect x="${c * 20}" y="${r * 20}" width="20" height="20" fill="${t}"/>` : '')) },
  { n: 'Центральная полоса', d: t => `<rect x="41" y="0" width="18" height="${HEM}" fill="${t}"/>` },
  { n: 'Три кантона', d: t => seq(3, i => `<rect x="${27 + i * 21.5}" y="0" width="3" height="${HEM}" fill="${t}"/>`) },
  { n: 'Крест', d: t => `<rect x="44" y="0" width="12" height="${HEM}" fill="${t}"/><rect x="0" y="30" width="100" height="12" fill="${t}"/>` },
  { n: 'Кокетка', d: t => `<path d="M0 0 H100 V22 L50 34 L0 22 Z" fill="${t}"/>` },
  { n: 'Лучи', d: t => seq(5, i => `<path d="M50 ${HEM} L${i * 26 - 3} 0 L${i * 26 + 9} 0 Z" fill="${t}"/>`) },
  { n: 'Волны', d: t => `<g fill="none" stroke="${t}" stroke-width="7"><path d="M0 30 Q12 18 25 30 T50 30 T75 30 T100 30"/><path d="M0 56 Q12 44 25 56 T50 56 T75 56 T100 56"/></g>` },
  { n: 'Точки', d: t => seq(4, r => seq(5, c => `<circle cx="${12 + c * 19}" cy="${14 + r * 20}" r="5" fill="${t}"/>`)) },
  { n: 'Треугольники', d: t => seq(5, i => `<path d="M${i * 20} ${HEM} L${i * 20 + 10} 56 L${i * 20 + 20} ${HEM} Z" fill="${t}"/>`) },
  { n: 'Омбре', d: t => seq(4, i => `<rect x="0" y="${i * 20}" width="100" height="20" fill="${t}" opacity="${(0.85 - i * 0.22).toFixed(2)}"/>`) },
  { n: 'Блоки', d: t => `<rect x="0" y="0" width="50" height="30" fill="${t}"/><rect x="50" y="50" width="50" height="30" fill="${t}"/>` },
  { n: 'Контрастные рукава', d: t => `<path d="${KIT_GEO.sleeveL}" fill="${t}"/><path d="${KIT_GEO.sleeveR}" fill="${t}"/>` },
  { n: 'Ромбы', d: t => seq(4, r => seq(4, c => `<path d="M${12 + c * 25} ${4 + r * 20} L${24 + c * 25} ${15 + r * 20} L${12 + c * 25} ${26 + r * 20} L${0 + c * 25} ${15 + r * 20} Z" fill="${t}"/>`)) },
];
// palette names are shared by the previews and the club row that ui builds at runtime
const KIT_PALETTE = [
  ['Классические', [['#ffffff', 'Белый'], ['#111111', 'Чёрный'], ['#0b3d91', 'Тёмно-синий'], ['#c8102e', 'Красный'], ['#0d5c38', 'Лесной'], ['#6b1d2a', 'Бордовый'], ['#8b95a1', 'Серый'], ['#f5f0e6', 'Кремовый'], ['#d6a85c', 'Золото']]],
  ['Яркие', [['#f2c200', 'Жёлтый'], ['#ff6b00', 'Оранжевый'], ['#e10600', 'Алый'], ['#b6ff3b', 'Лайм'], ['#00b3a4', 'Бирюза'], ['#7ec8e3', 'Небесный'], ['#a50044', 'Фуксия'], ['#8a2be2', 'Фиолет'], ['#ff9ec7', 'Розовый']]],
  ['Глубокие', [['#1d4e89', 'Кобальт'], ['#004d98', 'Индиго'], ['#1338be', 'Электрик'], ['#012169', 'Флот'], ['#14532d', 'Хвоя'], ['#3b0d1c', 'Коньяк'], ['#1f2937', 'Графит'], ['#4b3621', 'Кофейный']]],
];
const KIT_GK_COLORS = [['#f5d000', 'Визовый жёлтый'], ['#b6ff3b', 'Кислотный'], ['#ff8c42', 'Оранж'], ['#00e5ff', 'Циан'], ['#ff2d95', 'Магента'], ['#7cff00', 'Салат'], ['#ffea00', 'Жёлтокислот'], ['#ffffff', 'Белый'], ['#ff5ec4', 'Розовый неон'], ['#00ffd0', 'Мята']];
const KIT_PARTS = [['primary', 'База'], ['secondary', 'Отделка'], ['shorts', 'Шорты'], ['socks', 'Гетры']];
const KIT_TITLES = {
  home: ['Домашняя', 'Основной комплект — в нём команда выходит дома.'],
  away: ['Гостевая', 'Не должна сливаться с домашней: совет подбирает контраст.'],
  goal: ['Вратарская', 'Отдельный комплект вратаря. Ключевое — отличие от полевых.'],
};
let kitUid = 0;
function lum(hex) {
  const n = parseInt(String(hex).slice(1), 16) || 0;
  return (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255;
}
function inkOn(hex) { return lum(hex) > 0.62 ? '#15181a' : '#ffffff'; }
// outline flips on dark kits so black gear stays visible on the dark UI
function edgeOf(hex) { return lum(hex) > 0.45 ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.34)'; }
function colorDist(a, b) {
  const pa = parseInt(String(a).slice(1), 16) || 0, pb = parseInt(String(b).slice(1), 16) || 0;
  return Math.abs((pa >> 16 & 255) - (pb >> 16 & 255)) + Math.abs((pa >> 8 & 255) - (pb >> 8 & 255)) + Math.abs((pa & 255) - (pb & 255));
}
function kitColorName(c) {
  for (const [, list] of KIT_PALETTE.concat([['вратарская', KIT_GK_COLORS]])) {
    const hit = list.find(x => x[0].toLowerCase() === String(c).toLowerCase());
    if (hit) return hit[1];
  }
  return String(c).toUpperCase();
}
function patIdx(design) { return ((design | 0) % KIT_PATTERNS.length + KIT_PATTERNS.length) % KIT_PATTERNS.length; }
function shirtSvg(design, c1, c2, size, o) {
  const opt = o || {}, id = 'kg' + (++kitUid), i = patIdx(design), trim = opt.trim || c2;
  const dim = size ? ` width="${size}" height="${Math.round(size * 0.86)}"` : '';
  return `<svg class="kit-art"${dim} viewBox="0 0 100 86" fill="none" aria-hidden="true">
  <defs><clipPath id="${id}"><path d="${KIT_GEO.shirt}"/></clipPath></defs>
  <path d="${KIT_GEO.shirt}" fill="${c1}"/>
  <g clip-path="url(#${id})">${KIT_PATTERNS[i].d(trim, c1)}</g>
  ${i === 22 ? '' : `<g clip-path="url(#${id})" opacity=".9"><path d="M7 19 L13 33" stroke="${trim}" stroke-width="4"/><path d="M93 19 L87 33" stroke="${trim}" stroke-width="4"/></g>`}
  <path d="${KIT_GEO.shirt}" fill="none" stroke="${edgeOf(c1)}" stroke-width="1.6"/>
  <path d="${KIT_GEO.collar}" fill="none" stroke="${trim}" stroke-width="4.5" stroke-linecap="round"/>
  ${opt.num ? `<text x="50" y="58" text-anchor="middle" font-family="Unbounded, Manrope, sans-serif" font-size="21" font-weight="700" fill="${opt.ink || inkOn(c1)}">${esc(opt.num)}</text>` : ''}
</svg>`;
}
function shortsSvg(c1, trim, num) {
  const id = 'sh' + (++kitUid);
  return `<svg class="kit-art" viewBox="0 0 100 74" fill="none" aria-hidden="true">
  <defs><clipPath id="${id}"><path d="${KIT_GEO.shorts}"/></clipPath></defs>
  <path d="${KIT_GEO.shorts}" fill="${c1}"/>
  <g clip-path="url(#${id})"><path d="M22 6 H78 L79 17 H21 Z" fill="${trim}"/><path d="M24 18 L27 66" stroke="${trim}" stroke-width="5"/><path d="M76 18 L73 66" stroke="${trim}" stroke-width="5"/></g>
  <path d="${KIT_GEO.shorts}" fill="none" stroke="${edgeOf(c1)}" stroke-width="1.6"/>
  ${num ? `<text x="31" y="42" text-anchor="middle" font-family="Unbounded, Manrope, sans-serif" font-size="15" font-weight="700" fill="${inkOn(c1)}">${esc(num)}</text>` : ''}
</svg>`;
}
function socksSvg(c1, trim) {
  const pair = x => `<path d="${KIT_GEO.sock(x)}" fill="${c1}"/>
    <rect x="${x}" y="10" width="22" height="7" fill="${trim}"/>
    <rect x="${x}" y="24" width="22" height="5" fill="${trim}" opacity=".6"/>
    <path d="${KIT_GEO.sock(x)}" fill="none" stroke="${edgeOf(c1)}" stroke-width="1.6"/>`;
  return `<svg class="kit-art" viewBox="0 0 100 74" fill="none" aria-hidden="true">${pair(20)}${pair(56)}</svg>`;
}
// kit-independent helpers
function clubKitColors(club) {
  return [[club.color, 'Клубный основной'], [club.color2, 'Клубный второй'], [shade(club.color, -22), 'Клубный тёмный'], [shade(club.color, 26), 'Клубный светлый'], [shade(club.color2, -22), 'Второй тёмный']];
}
function contrastColor(avoid, pool) {
  let best = pool[0][0], bestScore = -1;
  pool.forEach(([c]) => {
    const score = Math.min(...avoid.map(a => colorDist(c, a)));
    if (score > bestScore) { bestScore = score; best = c; }
  });
  return best;
}
function kitDefaults(club) {
  const c1 = club.color, c2 = club.color2 === club.color ? shade(club.color, -25) : club.color2;
  const home = { design: 0, primary: c1, secondary: c2, shorts: c2 === '#ffffff' ? c1 : c2, socks: c1 };
  const awayC = lum(c1) > 0.62 ? '#111111' : '#ffffff';
  const away = { design: 6, primary: awayC, secondary: c1, shorts: c1, socks: awayC };
  const goal = { design: 0, primary: contrastColor([home.primary, home.secondary, away.primary], KIT_GK_COLORS), secondary: '#111111', shorts: '#111111', socks: '#111111' };
  return { home, away, goal };
}

// ---------- screens ----------
function scrBoot() {
  const slots = G.folder.slots.map((s, i) => {
    if (!s || !s.clubId) {
      return `<div class="card"><div class="kicker">Слот ${i + 1}</div><div class="muted">пусто</div>
        <div class="btnrow"><button class="btn" data-act="slot-new" data-i="${i}">Создать тренера</button></div></div>`;
    }
    const club = ENG.clubById(s, s.clubId);
    return `<div class="card"><div class="kicker">Слот ${i + 1}</div>
      <div class="row" style="cursor:default">
        ${badge(club, true)}
        <div class="grow"><b>${esc(s.manager)}</b><div class="sub muted">${esc(club.name)} · ${GD.LEAGUES[club.league].short} · сезон ${s.season}/${s.season + 1}</div></div>
      </div>
      <div class="btnrow">
        <button class="btn" data-act="slot-continue" data-i="${i}">Продолжить</button>
        <button class="btn ghost" data-act="slot-new" data-i="${i}">Новый тренер</button>
      </div></div>`;
  }).join('');
  return `
  <div class="kicker">Сезон 2026/27 · кабинет ${esc(deviceStamp())}</div>
  <h1>Кабинет</h1>
  <p class="muted small">Три сохранения — три тренера. Фамилию задаёте сами. РПЛ, Первая лига, ФНЛ-2, ФНЛ-3, медийная лига и десять зарубежных чемпионатов.</p>
  <div class="note">Кабинет ···· только на этом телефоне или компьютере. Ссылка не переносит чужую карьеру: у другого человека свои слоты, свои клубы и свои заслуги.</div>
  ${slots}
  <div class="btnrow"><button class="btn ghost" data-act="honors">Заслуги тренеров</button></div>`;
}
function scrHonors() {
  const g = G.folder.glory;
  return `
  <div class="kicker">Стена кабинета</div><h1>Заслуги</h1>
  ${g.length ? g.map(x => `<div class="plaque" style="display:flex;gap:12px;align-items:center">
    ${trophySvg(x.kind)}<div class="grow"><div class="who">${esc(x.who || G.S && G.S.manager || '')}</div>
    <div>${esc(x.text)}</div><div class="muted small">Сезон ${esc(x.season)}</div></div></div>`).join('')
    : '<div class="note">Пока пусто. Выиграйте лигу или кубок — здесь появится табличка.</div>'}
  <div class="note">Сюда попадают только кубки и чемпионства этого кабинета. Запись остаётся, даже если стереть карьеру.</div>
  <button class="btn ghost" data-act="back">Назад</button>`;
}
function scrPick() {
  const ru = ['rpl', 'fnl', 'fnl2', 'fnl3', 'media', 'amateur'];
  const foreign = GD.FOREIGN_LEAGUES;
  const lgId = G.ui.pickCountry === 'ru' ? G.ui.pickLeague : G.ui.pickCountry;
  const clubs = leagueClubs(lgId).slice().sort((a, b) => b.rep - a.rep);
  return `
  <div class="kicker">Новая карьера · слот ${G.slotIdx + 1}</div><h1>Тренер и клуб</h1>
  <label class="field"><span class="muted">Фамилия и имя — так подпишутся заслуги</span>
    <input type="text" id="mgr-name" data-sync="mgrName" value="${esc(G.ui.mgrName || 'А. Рубанова')}"></label>
  <div class="chips">${ru.map(l => `<button class="chip ${G.ui.pickCountry === 'ru' && G.ui.pickLeague === l ? 'on' : ''}" data-act="pick-league" data-v="${l}">${GD.LEAGUES[l].short}</button>`).join('')}</div>
  <div class="chips">${foreign.map(l => `<button class="chip ${G.ui.pickCountry === l ? 'on' : ''}" data-act="pick-country" data-v="${l}">${GD.LEAGUES[l].short}</button>`).join('')}</div>
  <div class="rowlist card">
    ${clubs.map(c => `<button class="row" data-act="pick-club" data-id="${c.id}">
      ${badge(c)}<div class="grow"><b>${esc(c.name)}</b><div class="sub muted">${esc(c.city)} · ${esc(c.stadium)}</div></div>
      <div class="val muted small">${ENG.F(c.budget)}</div></button>`).join('')}
  </div>
  <div class="note">В РПЛ 1–2 места идут в Лигу чемпионов, 3-е — в квалификацию, 4-е в Лигу Европы, 5–6 в Лигу конференций.</div>`;
}
function scrKits() {
  const club = GD.CLUBS.find(c => c.id === G.ui.pickClub);
  if (!club) { G.screen = 'pick'; return scrPick(); }
  if (G.ui.kitDraftClub !== club.id) {
    G.ui.kitDraft = kitDefaults(club);
    G.ui.kitDraftClub = club.id;
    G.ui.kitPart = { home: 'primary', away: 'primary', goal: 'primary' };
  }
  return `
  <div class="kicker">Новая карьера · ${esc(club.name)}</div><h1>Форма на сезон</h1>
  <p class="muted small">24 фасона и палитра для каждой детали: база, отделка, шорты, гетры. Вратарская форма — отдельным блоком.</p>
  ${kitCard('home', club)}
  ${kitCard('away', club)}
  ${kitCard('goal', club)}
  <div class="note">Клубные тона подставляются в домашнюю форму по умолчанию, но менять можно всё. Гостевая и вратарская проверяются на контраст — так в матче не будет совпадений цветов.</div>
  <button class="btn" data-act="kit-start" style="width:100%">Начать сезон за «${esc(club.name)}»</button>`;
}
function kitDraft(k) { return G.ui.kitDraft && G.ui.kitDraft[k]; }
function kitPart(k) { return (G.ui.kitPart && G.ui.kitPart[k]) || 'primary'; }
function kitPartName(k) { return (KIT_PARTS.find(p => p[0] === kitPart(k)) || KIT_PARTS[0])[1]; }
function kitFigureHtml(k) {
  const d = kitDraft(k), num = k === 'goal' ? 1 : k === 'away' ? 10 : 7;
  return `<div class="kit-fig">
    <div class="kit-fig-shirt">${shirtSvg(d.design, d.primary, d.secondary, 0, { num })}</div>
    <div class="kit-fig-side">${shortsSvg(d.shorts, d.secondary, num)}${socksSvg(d.socks, d.secondary)}</div>
  </div>`;
}
function kitTagsHtml(k) {
  const d = kitDraft(k);
  return `<span class="kit-tag kit-tag-pat">${esc(KIT_PATTERNS[patIdx(d.design)].n)}</span>`
    + KIT_PARTS.map(([p, n]) => `<span class="kit-tag"><i style="background:${d[p]}"></i>${n} · ${esc(kitColorName(d[p]))}</span>`).join('');
}
function kitPartsHtml(k) {
  const cur = kitPart(k);
  return KIT_PARTS.map(([p, n]) => `<button class="chip ${cur === p ? 'on' : ''}" data-act="kit-part" data-k="${k}" data-v="${p}">${n}</button>`).join('');
}
function kitPaletteHtml(k, club) {
  const d = kitDraft(k), part = kitPart(k), seen = new Set();
  const groups = [['Клубные', clubKitColors(club)]].concat(KIT_PALETTE);
  if (k === 'goal') groups.splice(1, 0, ['Неоновые вратарские', KIT_GK_COLORS]);
  return groups.map(([name, list]) => {
    const items = list.filter(([c]) => !seen.has(c.toLowerCase()) && seen.add(c.toLowerCase()));
    if (!items.length) return '';
    return `<div class="kit-pal-group"><div class="muted small">${esc(name)}</div><div class="kit-pal">${
      items.map(([c, n]) => `<button class="sw ${String(d[part]).toLowerCase() === c.toLowerCase() ? 'on' : ''}" data-act="kit-color" data-k="${k}" data-c="${c}" title="${esc(n)}" style="background:${c}"></button>`).join('')
    }</div></div>`;
  }).join('');
}
function kitPatternsHtml(k) {
  const d = kitDraft(k), cur = patIdx(d.design);
  return KIT_PATTERNS.map((p, i) => `<button class="kit-cell ${cur === i ? 'on' : ''}" data-act="kit-design" data-k="${k}" data-i="${i}" title="${esc(p.n)}">${shirtSvg(i, d.primary, d.secondary, 0)}</button>`).join('');
}
function kitWarnHtml(k) {
  const d = kitDraft(k), out = [];
  if (colorDist(d.primary, d.secondary) < 55) out.push(['warn', 'База и отделка почти одного тона — узор не будет читаться.']);
  if (k === 'away') {
    const h = kitDraft('home');
    if (h && colorDist(d.primary, h.primary) < 110) out.push(['warn', 'Гостевая близка к домашней. На выезде возможна путаница цветов.']);
    else out.push(['ok', 'Гостевая отличается от домашней.']);
  }
  if (k === 'goal') {
    const h = kitDraft('home');
    if (h && colorDist(d.primary, h.primary) < 150) out.push(['warn', 'Вратарь теряется на фоне своих полевых игроков.']);
    else out.push(['ok', 'Вратарь контрастирует с полевым комплектом.']);
  }
  return out.map(([t, m]) => `<div class="kit-hint ${t}">${m}</div>`).join('');
}
function kitCard(k, club) {
  const [title, sub] = KIT_TITLES[k], gk = k === 'goal';
  return `<div class="card kit-card${gk ? ' kit-gk' : ''}">
    <div class="kit-card-head">
      <div><div class="kit-card-title">${esc(title)}</div><div class="muted small">${esc(sub)}</div></div>
      ${gk ? '<span class="kit-gk-flag">ВР</span>' : ''}
    </div>
    <div class="kit-preview" id="kit-fig-${k}">${kitFigureHtml(k)}</div>
    <div class="kit-tags" id="kit-tags-${k}">${kitTagsHtml(k)}</div>
    <div id="kit-warn-${k}">${kitWarnHtml(k)}</div>
    <div class="kit-label">Деталь формы</div>
    <div class="chips" id="kit-parts-${k}">${kitPartsHtml(k)}</div>
    <div class="kit-label">Цвет<span class="muted"> · <b id="kit-partname-${k}">${esc(kitPartName(k))}</b></span></div>
    <div id="kit-pal-${k}">${kitPaletteHtml(k, club)}</div>
    <div class="kit-label">Фасон<span class="muted"> · <b id="kit-patname-${k}">${esc(KIT_PATTERNS[patIdx(kitDraft(k).design)].n)}</b></span></div>
    <div class="kit-grid" id="kit-pat-${k}">${kitPatternsHtml(k)}</div>
    <div class="btnrow">
      ${gk ? '<button class="btn ghost small" data-act="kit-gk-auto">Подобрать контраст</button>' : ''}
      <button class="btn ghost small" data-act="kit-reset" data-k="${k}">Вернуть клубное</button>
    </div>
  </div>`;
}
function kitGkAuto() {
  const d = G.ui.kitDraft;
  if (!d) return;
  const pool = KIT_GK_COLORS.concat(KIT_PALETTE[1][1], KIT_PALETTE[0][1]);
  d.primary = contrastColor([d.home.primary, d.home.secondary, d.away.primary], pool);
  d.design = 0;
}
// targeted repaint: keeps the page scroll position while the coach picks colors
function kitRepaint(k) {
  const keys = k ? [k] : ['home', 'away', 'goal'];
  const club = GD.CLUBS.find(c => c.id === G.ui.pickClub);
  if (!club) return;
  keys.forEach(key => {
    const d = kitDraft(key); if (!d) return;
    const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    set('kit-fig-' + key, kitFigureHtml(key));
    set('kit-tags-' + key, kitTagsHtml(key));
    set('kit-warn-' + key, kitWarnHtml(key));
    set('kit-parts-' + key, kitPartsHtml(key));
    set('kit-pal-' + key, kitPaletteHtml(key, club));
    set('kit-pat-' + key, kitPatternsHtml(key));
    const pn = document.getElementById('kit-partname-' + key); if (pn) pn.textContent = kitPartName(key);
    const dn = document.getElementById('kit-patname-' + key); if (dn) dn.textContent = KIT_PATTERNS[patIdx(d.design)].n;
  });
  // away/goal warnings compare against the home kit, so they refresh with any change
  ['away', 'goal'].forEach(other => {
    const el = document.getElementById('kit-warn-' + other);
    if (el && kitDraft(other)) el.innerHTML = kitWarnHtml(other);
  });
}
function scrDesk() {
  const club = ENG.myClub(G.S);
  const fx = myNextFixture();
  const leagueDone = fx ? false : true;
  const pos = ENG.tablePos(G.S, G.S.clubId);
  const unread = G.S.inbox.filter(m => !m.read).length;
  const tbl = ENG.table(G.S, club.league).slice(0, 4).map((r, i) =>
    `<div class="row" style="cursor:default"><span class="val muted">${i + 1}</span><div class="grow">${esc(ENG.clubById(G.S, r.id).name)}</div><span class="val"><b>${r.pts}</b></span></div>`).join('');
  const nextCard = fx ? `
    <div class="card"><h3>Следующий матч</h3>
      <div class="match-head">
        ${badge(ENG.clubById(G.S, fx.home))} <div class="grow" style="text-align:center"><b>${fx.home === G.S.clubId ? 'дома' : 'в гостях'}</b>
        <div class="muted small">${esc((fx.label || GD.LEAGUES[fx.league || '']?.short || 'кубок') + ' · ' + ENG.fmtDate(fx.date))}</div>
        <div class="muted small">${esc(ENG.clubById(G.S, fx.home === G.S.clubId ? fx.away : fx.home).stadium)}</div></div>
        ${badge(ENG.clubById(G.S, fx.away))}
      </div>
      <button class="btn" data-act="open-match" data-id="${fx.id}" style="width:100%;margin-top:10px">К матчу</button>
    </div>` : `
    <div class="card"><h3>Матчей нет</h3>
      <div class="muted small">Календарь вашей лиги закрыт.</div>
      <div class="btnrow"><button class="btn" data-act="season-close">Подвести итог сезона</button></div>
    </div>`;
  return `
  <div class="kicker">${GD.LEAGUES[club.league].name}</div>
  <div style="display:flex;gap:12px;align-items:center">
    ${badge(club, true)}
    <div class="grow"><h1 style="margin:0">${esc(club.name)}</h1>
      <div class="muted small">${esc(ENG.fmtDateFull(G.S.date))}</div></div>
    <div style="text-align:right"><div class="kicker">место</div><div class="score" style="font-size:26px">${pos || '—'}</div></div>
  </div>
  ${nextCard}
  <div class="strip">
    <div class="cell"><div class="k">Бюджет</div><div class="v">${ENG.F(G.S.budget)}</div></div>
    <div class="cell"><div class="k">Зарплаты</div><div class="v">${ENG.IW(ENG.totalWage(G.S))}</div></div>
    <div class="cell"><div class="k">Доверие</div><div class="v">${G.S.confidence}</div></div>
  </div>
  <div class="card rowlist" style="padding:6px 10px">
    <button class="row" data-act="nav" data-v="inbox"><div class="grow">Почта</div><span class="tag${unread ? ' warn' : ''}">${unread ? unread + ' новых' : 'нет новых'}</span></button>
    <button class="row" data-act="nav" data-v="league"><div class="grow">Таблица</div><span class="muted small">${esc(ENG.clubById(G.S, (ENG.table(G.S, club.league)[0] || {}).id || club.id).name)} лидирует</span></button>
  </div>
  <div class="note">Средний тонус состава ${avgCond()}. Ниже 65 нужна восстановительная, иначе в матче команда играет слабее.</div>
  <div class="btnrow">
    <button class="btn ghost" data-act="nav" data-v="tactics">Тактика</button>
    <button class="btn ghost" data-act="nav" data-v="squad">Состав</button>
  </div>`;
}
function squadRows(filter) {
  let sq = ENG.playersOf(G.S, G.S.clubId).slice().sort((a, b) => ENG.dynRating(b) - ENG.dynRating(a));
  const groups = { all: null, gk: ['GK'], def: ['DR', 'DL', 'DC'], mid: ['DM', 'MC', 'AM', 'MR', 'ML'], fwd: ['ST'] };
  const g = groups[filter];
  if (g) sq = sq.filter(p => g.includes(p.pos));
  const starters = new Set(ENG.lineupPlayers(G.S, G.S.clubId, G.S.tactics).map(s => s.pid));
  const bench = new Set((G.S.bench || []).map(id => id));
  return sq.map(p => `
    <button class="row${starters.has(p.id) ? ' starter' : ''}" data-act="open-player" data-id="${p.id}">
      ${posTag(p)}<div class="grow"><b>${esc(pname(p))}</b> <span class="muted small">${p.age} лет · ${p.apps ? p.goals + 'г ' + p.assists + 'п' : 'тонус ' + p.cond}</span>
      <div class="sub muted">${starters.has(p.id) ? 'основа · ' : bench.has(p.id) ? 'запас · ' : 'резерв · '}${p.mor < 45 ? 'настрой ' + p.mor + ' · ' : ''}${p.injured ? 'травма ' + p.injured + ' дн. · ' : ''}${p.ban ? 'дискв. · ' : ''}${p.cond < 65 ? 'тонус ' + p.cond + ' · ' : ''}${p.apps ? 'оц. ' + (p.ratingSum / p.apps).toFixed(2) : ''}</div></div>
      ${rateChip(p)}
    </button>`).join('');
}
function scrSquad() {
  const f = G.ui.squadFilter;
  return `
  <button class="bench-arrow" data-act="bench-open" title="Замены">⇤</button>
  <div class="kicker">${esc(ENG.myClub(G.S).name)}</div><h1>Состав</h1>
  <div class="chips">${[['all', 'Все'], ['gk', 'Вратари'], ['def', 'Защита'], ['mid', 'Полузащита'], ['fwd', 'Атака']].map(([k, n]) =>
    `<button class="chip ${f === k ? 'on' : ''}" data-act="squad-filter" data-v="${k}">${n}</button>`).join('')}</div>
  <div class="card rowlist" style="padding:6px 10px">${squadRows(f)}</div>
  <div class="muted small" style="margin-top:8px">Стрелка слева — шторка замен: сначала поставьте игроков на замену, потом выпускайте их в матче при паузе или тайм-ауте.</div>`;
}
function benchSheetHtml() {
  const S = G.S, tac = S.tactics;
  const starters = ENG.lineupPlayers(S, S.clubId, tac);
  const stIds = new Set(starters.map(s => s.pid));
  const bench = ENG.benchOf(S);
  const all = ENG.playersOf(S, S.clubId).sort((a, b) => b.ovr - a.ovr);
  const reserve = all.filter(p => !stIds.has(p.id) && !bench.some(b => b.id === p.id));
  const row = (p, kind, btn) => `
    <div class="row" style="cursor:default">${posTag(p)}<div class="grow"><b>${esc(pname(p))}</b>
      <div class="sub muted">${GD.POS_FULL[p.pos]} · тонус ${p.cond}${p.injured ? ' · травма ' + p.injured + ' дн.' : ''}${p.ban ? ' · дискв.' : ''}</div></div>
      ${rateChip(p)}${btn || ''}</div>`;
  const b = (pid, on) => `<button class="btn small ${on ? 'ghost' : ''}" data-act="${on ? 'bench-remove' : 'bench-add'}" data-pid="${pid}">${on ? 'убрать' : 'на замену'}</button>`;
  return `
  <h2>Замены<button class="x" data-act="close-sheet">×</button></h2>
  <h3 class="sheet-h3">Первыйнадцать (${starters.length})</h3>
  <div class="rowlist">${starters.map(s => row(S_player(s.pid), 'st')).join('')}</div>
  <h3 class="sheet-h3">Запас (${bench.length}/${ENG.BENCH_MAX}) <span class="muted small">выходят при паузе матча или тайм-ауте</span></h3>
  ${bench.length ? `<div class="rowlist">${bench.map(p => row(p, 'bn', b(p.id, true))).join('')}</div>` : '<div class="note">Пусто. Отметьте игроков ниже кнопкой «на замену».</div>'}
  <h3 class="sheet-h3">Резерв</h3>
  <div class="rowlist">${reserve.map(p => row(p, 'rs', b(p.id, false))).join('')}</div>`;
}
function attrLine(label, v) {
  const n = Math.round(v);
  const w = n <= 20 ? n * 5 : Math.min(100, n);
  return `<div class="attrline"><span class="muted">${label}</span><b>${n}</b><div class="bar"><i style="width:${w}%"></i></div></div>`;
}
function playerCard(p) {
  const own = p.clubId === G.S.clubId;
  const club = String(p.clubId).startsWith('pool:') ? null : ENG.clubById(G.S, p.clubId);
  const clubLabel = own ? 'свой клуб' : p.realClub ? p.realClub : club ? club.name : p.clubId === 'free' ? 'свободный агент' : String(p.clubId).startsWith('pool:') ? ((GD.MARKETS.find(m => 'pool:' + m.id === p.clubId) || {}).country || 'рынок') : 'свободный агент';
  const attrs = p.pos === 'GK'
    ? [['Вратарская', p.gk], ['Игра руками', p.def], ['Характер', p.men], ['Выбор позиции', p.pas]]
    : [['Скорость', p.pac], ['Удар', p.sho], ['Пас', p.pas], ['Техника', p.tec], ['Отбор', p.def], ['Мощь', p.strn], ['Выносливость', p.sta], ['Характер', p.men]];
  const avgRate = p.apps ? (p.ratingSum / p.apps).toFixed(2) : '—';
  const dyn = ENG.dynRating(p);
  const mods = ENG.dynMods(p);
  const ra = ENG.recentAvg(p);
  const cond = scoutingBlurb(p);
  const trend = dyn > p.ovr ? '▲ растёт' : dyn < p.ovr ? '▼ просел' : '= стабилен';
  const isForeign = !own && !(!p.realClub && String(p.clubId).startsWith('pool:')) && p.clubId !== 'free';
  const canBuy = !own;
  const window = ENG.inWindow(G.S.date);
  return `
  <div class="kicker">${GD.POS_FULL[p.pos]} · ${esc(p.nat)}${p.real ? ' · FC 27' : ''}</div>
  <h1>${esc(pname(p))}</h1>
  <div class="muted small">${p.age} лет · ${p.foot} нога · №${p.number || '—'} · ${esc(p.realClub || clubLabel)}${club ? ' · ' + (GD.LEAGUES[club.league] || { short: 'Евро' }).short : p.clubId === 'free' ? ' | свободный агент' : ' | трансферный лист'}</div>
  <div style="display:flex;gap:16px;align-items:flex-end;margin:12px 0">
    <div><div class="kicker">живой рейтинг</div><div class="score dynbig ${dyn >= 75 ? 'up' : dyn < p.ovr ? 'down' : ''}" style="font-size:44px;text-align:left">${dyn}<span class="trend">${trend}</span></div></div>
    <div class="grow">
      ${attrLine('Тонус', p.cond)}
      ${attrLine('Свежесть', p.sharp)}
      ${attrLine('Настрой', p.mor)}
    </div>
  </div>
  ${mods.length ? `<div class="chips">${mods.map(m => `<span class="chip mod ${m[1] > 0 ? 'pos' : 'neg'}">${esc(m[0])} ${m[1] > 0 ? '+' : ''}${m[1]}</span>`).join('')}</div>
  <div class="muted small" style="margin:6px 0 10px">База ${p.ovr} · потолок ${p.pot}${p.real ? '' : ' · аналог в FC 27: ~' + ENG.fc27Equiv(p)}. Рейтинг дышит: травмы и усталость снижают, тонус, форма и удачная игра — поднимают, но не выше потолка.</div>` : `<div class="muted small" style="margin:6px 0 10px">База ${p.ovr} · потолок ${p.pot}${p.real ? '' : ' · аналог в FC 27: ~' + ENG.fc27Equiv(p)} — полное здоровье и тонус.</div>`}
  <div class="card">${attrs.map(a => attrLine(a[0], a[1] * 5)).join('')}</div>
  <div class="note">${esc(cond)}</div>
  <h3 class="stats-h3">Статистика сезона</h3>
  <div class="strip">
    <div class="cell"><div class="k">Игры</div><div class="v">${p.apps}</div></div>
    <div class="cell"><div class="k">Голы</div><div class="v">${p.goals}</div></div>
    <div class="cell"><div class="k">Ассисты</div><div class="v">${p.assists || 0}</div></div>
    <div class="cell"><div class="k">Ж.К.</div><div class="v">${p.yellow}</div></div>
  </div>
  <div class="strip">
    <div class="cell"><div class="k">Средняя оценка</div><div class="v">${avgRate}</div></div>
    <div class="cell"><div class="k">Оц. последних</div><div class="v">${ra == null ? '—' : ra.toFixed(2)}</div></div>
    <div class="cell"><div class="k">Гол+пас / 90</div><div class="v">${p.apps ? ((p.goals + (p.assists || 0)) * 90 / Math.max(1, p.apps)).toFixed(1) : '—'}</div></div>
  </div>
  ${(p.recent && p.recent.length) ? `<div class="chips">${p.recent.slice(-5).map(r => `<span class="chip mr ${r >= 7.3 ? 'pos' : r < 6.2 ? 'neg' : ''}">${r.toFixed(2)}</span>`).join('')}</div>` : ''}
  <div class="strip">
    <div class="cell"><div class="k">Рейтинг+потолок</div><div class="v">${p.ovr}+${Math.max(0, p.pot - p.ovr)}</div></div>
    <div class="cell"><div class="k">Цена (живая)</div><div class="v small" style="font-size:13px">${ENG.USD(p.value)}</div></div>
    <div class="cell"><div class="k">Контракт</div><div class="v small" style="font-size:13px">${p.contract} г.</div></div>
  </div>
  <div class="muted small" style="margin-bottom:10px">${ENG.IW(p.wage)}${p.clause ? ' · Условие: отступные ' + ENG.USD(p.clause) : ''} · цена пересчитывается по форме, тонусу и статистике</div>
  ${own ? renewPanel(p) : (canBuy ? buyPanel(p, isForeign, window) : '')}
  <div class="btnrow">
    ${own ? `<button class="btn ghost" data-act="to-first-eleven">В основу</button>
    <button class="btn ${p.listed ? 'ghost' : 'danger'}" data-act="toggle-list">${p.listed ? 'Снять с трансфера' : 'Выставить на трансфер'}</button>` : ''}
    <button class="btn ghost" data-act="back">Назад</button>
  </div>`;
}
function renewPanel(p) {
  if (p.renewed) return '<div class="note">Контракт уже продлён в этом сезоне.</div>';
  const years = G.ui.renewYears || 2;
  const clause = G.ui.renewClause || 'none';
  const wMin = Math.round(p.wage * 0.8), wMax = Math.round(p.wage * 1.8);
  const wVal = G.ui.renewWage || p.wage;
  return `<div class="card"><h3>Продление контракта</h3>
    <div class="chips">${[1, 2, 3, 4, 5].map(y => `<button class="chip ${years === y ? 'on' : ''}" data-act="renew-years" data-v="${y}">${y} г.</button>`).join('')}</div>
    <label class="field"><span class="muted">Зарплата: ${ENG.IW(wVal)}</span>
      <input type="range" id="wage-slider" data-sync="renewWage" min="${wMin}" max="${wMax}" value="${wVal}" step="1"></label>
    <div class="chips">${[['none', 'без особых условий'], ['release', 'отступные ×2'], ['bonus10', 'бонус за 10 голов'], ['loan', 'опция аренды'], ['captain', 'капитанская надбавка']].map(([k, n]) =>
      `<button class="chip ${clause === k ? 'on' : ''}" data-act="renew-clause" data-v="${k}">${n}</button>`).join('')}</div>
    <button class="btn" data-act="renew-sign">Подписать</button>
  </div>`;
}
function buyPanel(p, isForeign, window) {
  const free = p.clubId === 'free' || (String(p.clubId).startsWith('pool:') && !p.realClub);
  const fee = G.ui.bidFee || p.value;
  if (free || !isForeign) {
    return `<div class="card"><h3>Трансфер</h3>
      <label class="field"><span class="muted">Запрос клуба ${ENG.USD(p.value)}. Сумма в долларах, тысячи через точку.</span>
      <input type="number" id="bid-fee" data-sync="bidFee" step="0.05" min="0.05" value="${fee}"></label>
      <div class="chips">${[0.8, 1, 1.25].map(m => `<button class="chip ${Math.abs(fee - p.value * m) < 0.5 ? 'on' : ''}" data-act="bid-chip" data-v="${(p.value * m).toFixed(2)}">${m === 1 ? '100%' : Math.round(m * 100) + '%'} · ${ENG.USD(p.value * m)}</button>`).join('')}</div>
      ${window || free ? `<button class="btn" data-act="buy">Подписать</button>` : `<div class="note">Окно закрыто. Лето до 12 сентября, зима 20 января — 25 февраля.</div>`}
    </div>`;
  }
  return `<div class="card"><h3>Предложение</h3>
    <label class="field"><span class="muted">Запрос клуба ${ENG.USD(p.value)}. Сумма в долларах.</span>
    <input type="number" id="bid-fee" data-sync="bidFee" step="0.05" min="0.05" value="${fee}"></label>
    <div class="chips">${[0.8, 1, 1.25].map(m => `<button class="chip ${Math.abs(fee - p.value * m) < 0.5 ? 'on' : ''}" data-act="bid-chip" data-v="${(p.value * m).toFixed(2)}">${m === 1 ? '100%' : Math.round(m * 100) + '%'} · ${ENG.USD(p.value * m)}</button>`).join('')}</div>
    ${window ? `<button class="btn" data-act="buy">Предложить ${ENG.USD(fee)}</button>` : '<div class="note">Окно закрыто. Лето до 12 сентября, зима 20 января — 25 февраля.</div>'}
  </div>`;
}
function scoutingBlurb(p) {
  const t = [];
  if (p.pac >= 15) t.push('Быстрый, выигрывает забегания.');
  if (p.sho >= 15) t.push('Удар поставлен — опасен из-за штрафной.');
  if (p.pas >= 15) t.push('Видит пас как на ладони.');
  if (p.tec >= 15) t.push('Технарь, мяч не теряет.');
  if (p.def >= 15) t.push('Чистильщик: отбирает начисто.');
  if (p.strn >= 15) t.push('В верховых дуэлях выигрывает воздух.');
  if (p.men >= 16) t.push('Лидер, не проседает в дерби.');
  if (p.sta >= 16) t.push('Двигатель — бегает все 90.');
  if (p.age <= 21 && p.pot > p.ovr + 4) t.push('Сырой, но потолок заметно выше текущего уровня.');
  if (p.age >= 31) t.push('Опытный, близок к закату.');
  if (!t.length) t.push('Ровный исполнитель, без вау-эффекта.');
  return t.join(' ');
}

// ---------- tactics ----------
const SLIDERS = [
  ['mentality', 'Менталитет', ['Очень низко', 'Низко', 'Баланс', 'Атака', 'Все вперёд']],
  ['press', 'Прессинг', ['Нет', 'Низкий', 'Середина', 'Высокий', 'Прессинг']],
  ['tempo', 'Темп', ['Медленно', 'Спокойно', 'Середина', 'Быстро', 'Рвать']],
  ['line', 'Линия обороны', ['Низко', 'Ниже', 'Середина', 'Высоко', 'Вперёд']],
  ['width', 'Ширина', ['Узко', 'Уже', 'Середина', 'Широко', 'Во фланг']],
];
function slotCoords(s, i, tac) {
  const c = GD.FORMATIONS[tac.formation][i];
  const ment = (tac.mentality || 0) * 1.8, ln = (tac.line || 2) - 2, pr = (tac.press || 2) - 2;
  const wid = ((tac.width || 2) - 2) * 2.2;
  let x = c.x + (c.y > 60 ? 0 : wid * (c.x < 50 ? -1 : 1)) * (c.y > 30 ? 1 : 0.6);
  let y = c.y - ment - (c.y > 50 ? ln * 2 : ln * 3) - pr * 1.2;
  return { x: Math.max(6, Math.min(94, x)), y: Math.max(8, Math.min(94, y)), pos: c.pos };
}
function tacSummary(tac) {
  const st = GD.TACTICS.find(t => t.id === tac.style);
  const avg = Math.round(SLIDERS.reduce((a, s) => a + (tac[s[0]] || 0), 0) / 5);
  const m = ENG.ht(tac);
  return `${tac.formation} · ${st ? st.name : ''} · атака ${Math.round(m.att * 100)} / оборона ${Math.round(m.def * 100)}`;
}
function scrTactics() {
  const tac = G.S.tactics;
  const plan = ENG.lineupPlayers(G.S, G.S.clubId, tac);
  const dots = GD.FORMATIONS[tac.formation].map((c, i) => {
    const xy = slotCoords(tac, i, tac);
    const slot = plan.find(p => p.slot === i);
    const p = slot && S_player(slot.pid);
    const club = ENG.myClub(G.S);
    if (!p) return '';
    const d = ENG.dynRating(p);
    const tr = d > p.ovr ? '▲' : d < p.ovr ? '▼' : '';
    return `<button class="dot ${G.ui.selectedSlot === i ? 'sel' : ''}" style="left:${xy.x}%;top:${xy.y}%" data-act="slot-select" data-i="${i}">
      <span class="ball-dot" style="--c1:${club.color}">${p.number}</span><span class="lbl">${GD.POS_ABBR[xy.pos]} <b class="dot-rate ${d >= 75 ? 'up' : d < p.ovr ? 'dn' : ''}">${d}${tr}</b></span></button>`;
  }).join('');
  return `
  <div class="kicker">Матч-план</div><h1>Тактика</h1>
  <div class="chips">${GD.FORM_LIST.map(f => `<button class="chip ${tac.formation === f ? 'on' : ''}" data-act="formation" data-v="${f}">${f}</button>`).join('')}</div>
  <div class="pitch" id="tac-pitch">${dots}</div>
  <div class="card rowlist tac-eleven" style="padding:4px 10px;margin:8px 0">
    ${plan.map(s => { const p = S_player(s.pid); return p ? `<button class="row" data-act="open-player" data-id="${p.id}">${posTag(p)}<div class="grow"><b>${esc(pname(p))}</b> <span class="muted small">№${p.number}</span></div>${rateChip(p)}</button>` : ''; }).join('')}
  </div>
  <div class="muted small" id="tac-summary" style="margin:8px 0">${esc(tacSummary(tac))}</div>
  <div class="chips">${GD.TACTICS.map(t => `<button class="chip ${tac.style === t.id ? 'on' : ''}" data-act="style" data-v="${t.id}">${t.name}</button>`).join('')}</div>
  ${SLIDERS.map(s => `<label class="field"><span class="muted">${s[1]}: ${s[2][Math.max(0, Math.min(4, tac[s[0]] === undefined ? 2 : s[0] === 'mentality' ? tac.mentality + 2 : tac[s[0]] ?? 2))] || ''}</span>
    <input type="range" data-act="slider" data-k="${s[0]}" min="${s[0] === 'mentality' ? -2 : 0}" max="${s[0] === 'mentality' ? 2 : 4}" value="${s[0] === 'mentality' ? tac.mentality : tac[s[0]] ?? 2}"></label>`).join('')}
  <div class="btnrow">
    ${[['attack', 'Установка: атака'], ['defence', 'Установка: оборона'], ['set', 'Стандарты'], ['physical', 'Объём'], ['rest', 'Восстановление']].map(t =>
      `<button class="btn ghost small ${G.S.focus === t[0] ? 'on' : ''}" data-act="train" data-v="${t[0]}">${t[1]}</button>`).join('')}
    <button class="btn small" data-act="tac-auto">Авто</button>
  </div>
  <div class="note">Средний тонус состава ${UI_avgCond()}. Фокус тренировки действует до ближайшего матча.</div>`;
}
function assignmentHtml() {
  const tac = G.S.tactics;
  const i = G.ui.selectedSlot;
  const pos = GD.FORMATIONS[tac.formation][i].pos;
  const used = new Set(tac.slots.filter(Boolean));
  const list = ENG.playersOf(G.S, G.S.clubId).filter(p => !p.injured && !p.ban)
    .map(p => ({ p, fit: ENG.ft(p, pos) })).sort((a, b) => b.fit - a.fit);
  return `<h2>Кто на позиции ${GD.POS_ABBR[pos]}<button class="x" data-act="close-sheet">×</button></h2>
  <div class="rowlist">${list.slice(0, 14).map(({ p, fit }) => `
    <button class="row" data-act="${used.has(p.id) ? 'close-sheet' : 'assign'}" data-pid="${p.id}">
      ${posTag(p)}<div class="grow"><b>${esc(pname(p))}</b><div class="sub muted">${p.age} лет · ${p.pos === pos ? 'родная позиция' : 'адаптация ' + Math.round(fit * 100)}% · тонус ${p.cond}${p.injured ? ' · травма' : ''}</div></div>
      ${rateChip(p)}</button>`).join('')}</div>`;
}
function UI_avgCond() { return avgCond(); }

// ---------- league / table ----------
const LEGENDS = {
  rpl: [[1, 2, 'Лига чемпионов'], [3, 3, 'Квалификация ЛЧ'], [4, 4, 'Лига Европы'], [5, 6, 'Лига конференций'], [13, 14, 'Стыки за место в РПЛ'], [15, 16, 'Вылет в Первую лигу']],
  fnl: [[1, 2, 'Прямой выход в РПЛ'], [3, 4, 'Стыки за РПЛ'], [5, 5, 'Пирамида'], [15, 18, 'Вылет в ФНЛ-2']],
  fnl2: [[1, 2, 'Выход в Первую лигу'], [12, 15, 'Вылет в ФНЛ-3']],
  fnl3: [[1, 2, 'Выход в ФНЛ-2'], [5, 5, 'Пирамида']],
};
function zoneClass(lg, rank, n) {
  const z = ENG.zoneOf(lg, rank - 1, n);
  return z ? 'z-' + z : '';
}
function tableHtml(lg) {
  const rows = ENG.table(G.S, lg);
  const n = rows.length;
  return `<table class="lg"><thead><tr><th>#</th><th>Клуб</th><th>И</th><th>В</th><th>Н</th><th>П</th><th>М</th><th>О</th></tr></thead><tbody>
  ${rows.map((r, i) => `<tr class="${zoneClass(lg, i + 1, n)} ${r.id === G.S.clubId ? 'me' : ''}">
    <td>${i + 1}</td><td>${esc(ENG.clubById(G.S, r.id).name)}</td><td>${r.i}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf}:${r.ga}</td><td><b>${r.pts}</b></td></tr>`).join('')}
  </tbody></table>
  ${(LEGENDS[lg] || []).map(l => `<div class="legend"><span><i style="background:${l[0] <= 2 && lg !== 'rpl' ? '#1f7a3a' : 'rgba(214,168,92,.6)'}"></i>${l[0] === l[1] ? l[0]-1 + ' место' : (l[0] === 0 ? l[1] : l[0]-1) + '–' + (l[1]-1) + ' — ' + l[2]}</span></div>`).join('')}`;
}
function scrLeague() {
  const myLg = ENG.myClub(G.S).league;
  const lg = G.ui.tableLeague || myLg;
  const chipLgs = ['rpl', 'fnl', 'fnl2', 'fnl3', 'media', 'amateur'].concat(GD.FOREIGN_LEAGUES);
  const done = ENG.leagueDone(G.S, myLg);
  const chips = `<div class="chips">
    ${chipLgs.map(l => `<button class="chip ${lg === l ? 'on' : ''}" data-act="table-league" data-v="${l}">${GD.LEAGUES[l].short}</button>`).join('')}
    <button class="chip ${lg === 'cup' ? 'on' : ''}" data-act="table-league" data-v="cup">Кубок России</button>
  </div>`;
  if (lg === 'cup') {
    return `
  <div class="kicker">Чемпионаты и кубок</div><h1>Лига</h1>
  ${chips}
  ${cupHtml()}`;
  }
  return `
  <div class="kicker">Чемпионаты и кубок</div><h1>Лига</h1>
  ${chips}
  <div class="card">${tableHtml(lg)}</div>
  ${lg === myLg && done ? `<button class="btn" data-act="season-close" style="width:100%">Закрыть сезон и перейти дальше</button>` : ''}`;
}

// ---------- market ----------
const MK_SECTIONS = [['stars', 'Звёзды FC 27'], ['promise', 'Высокий потенциал'], ['free', 'Свободные агенты'], ['all', 'Лиги и страны']];
function mkMatches(p, mk) {
  if (mk.inGame) { const c = ENG.clubById(G.S, p.clubId); return c && c.league === mk.inGame; }
  return p.clubId === 'pool:' + mk.id;
}
function marketRows() {
  const sec = G.ui.marketSection || 'stars';
  const mk = GD.MARKETS.find(m => m.id === G.ui.marketCountry) || GD.MARKETS[0];
  let list = G.S.players.filter(p => p.clubId !== G.S.clubId && !String(p.clubId).startsWith('eu-'));
  if (sec === 'stars') list = list.filter(p => p.real && p.ovr >= 82);
  else if (sec === 'promise') list = list.filter(p => (p.real ? p.pot >= 84 && p.age <= 21 : p.pot - p.ovr >= 5 && p.age <= 21));
  else if (sec === 'free') list = list.filter(p => p.clubId === 'free' || p.freeAgent);
  else list = list.filter(p => mkMatches(p, mk) || p.clubId === 'free');
  const q = (G.ui.marketSearch || '').trim().toLowerCase();
  if (q) list = list.filter(p => (pname(p) + ' ' + p.nat + ' ' + (p.realClub || '')).toLowerCase().includes(q));
  const featAttr = { tech: 'tec', strong: 'strn', fast: 'pac', shot: 'sho', pass: 'pas', tackle: 'def' }[G.ui.marketFeat];
  if (featAttr) list = list.filter(p => p[featAttr] >= 15);
  if (G.ui.marketPos !== 'all') {
    const g = { gk: ['GK'], def: ['DR', 'DL', 'DC'], mid: ['DM', 'MC', 'AM', 'MR', 'ML'], fwd: ['ST'] }[G.ui.marketPos];
    if (g) list = list.filter(p => g.includes(p.pos));
  }
  const age = G.ui.marketAge;
  if (age === 'u21') list = list.filter(p => p.age <= 21);
  else if (age === 'u25') list = list.filter(p => p.age <= 25);
  else if (age === 'o26') list = list.filter(p => p.age >= 26);
  list = list.filter(p => ENG.dynRating(p) >= G.ui.marketFloor);
  const sort = G.ui.marketSort || 'ovr';
  list = list.sort((a, b) =>
    sort === 'value' ? b.value - a.value :
    sort === 'pot' ? b.pot - a.pot || b.ovr - a.ovr :
    sort === 'age' ? a.age - b.age || b.ovr - a.ovr :
    ENG.dynRating(b) - ENG.dynRating(a));
  return list.slice(0, 80).map(p => {
    const price = p.value;
    const delta = p.baseValue ? Math.round((p.value / p.baseValue - 1) * 100) : 0;
    const dt = delta >= 3 ? '<i class="tr up">+' + delta + '%</i>' : delta <= -3 ? '<i class="tr dn">' + delta + '%</i>' : '';
    return `<button class="row" data-act="open-player" data-id="${p.id}">
      ${posTag(p)}<div class="grow"><b>${esc(pname(p))}</b>${p.real ? ' <span class="fc-tag">FC 27</span>' : ''}
      <div class="sub muted">${esc(p.nat)} · ${p.age} лет${p.realClub ? ' · ' + esc(p.realClub) : p.clubId === 'free' ? ' · без клуба' : ''}${p.mor < 45 ? ' · настрой ' + p.mor : ''} · ${ENG.USD(price)}${dt ? ' ' : ''}${dt}</div></div>
      ${rateChip(p)}</button>`;
  }).join('');
}
function scrMarket() {
  const sec = G.ui.marketSection || 'stars';
  const top = GD.MARKETS.filter(m => m.top).map(m => m.id);
  const rest = GD.MARKETS.filter(m => !m.top).map(m => m.id);
  const mk = m => GD.MARKETS.find(x => x.id === m);
  return `
  <div class="kicker">Все рынки · цены как в жизни, меняются по ходу сезона</div><h1>Рынок</h1>
  <div class="chips">${MK_SECTIONS.map(([k, n]) => `<button class="chip ${sec === k ? 'on' : ''}" data-act="market-section" data-v="${k}">${n}</button>`).join('')}</div>
  ${sec === 'all' ? `<div class="chips">${top.map(id => `<button class="chip ${G.ui.marketCountry === id ? 'on' : ''}" data-act="market-country" data-v="${id}">${mk(id).country}</button>`).join('')}</div>
  <div class="chips">${rest.map(id => `<button class="chip ${G.ui.marketCountry === id ? 'on' : ''}" data-act="market-country" data-v="${id}">${mk(id).country} · ${mk(id).league}</button>`).join('')}</div>` : ''}
  <label class="field"><span class="muted">Поиск: имя, фамилия, страна, клуб</span>
    <input type="search" id="mk-search" data-sync="marketSearch" placeholder="например: Левандовски" value="${esc(G.ui.marketSearch || '')}"></label>
  <div class="chips">${[['all', 'Все'], ['tech', 'Техничный'], ['strong', 'Сильный'], ['fast', 'Быстрый'], ['shot', 'Удар'], ['pass', 'Пас'], ['tackle', 'Отбор']].map(([k, n]) =>
    `<button class="chip ${G.ui.marketFeat === k ? 'on' : ''}" data-act="market-feat" data-v="${k}">${n}</button>`).join('')}</div>
  <div class="chips">${[['all', 'Амплуа: все'], ['gk', 'ВРТ'], ['def', 'Защита'], ['mid', 'Полузащита'], ['fwd', 'Атака']].map(([k, n]) =>
    `<button class="chip ${G.ui.marketPos === k ? 'on' : ''}" data-act="market-pos" data-v="${k}">${n}</button>`).join('')}</div>
  <div class="chips">${[['all', 'Возраст: любой'], ['u21', 'до 21'], ['u25', 'до 25'], ['o26', '26+']].map(([k, n]) =>
    `<button class="chip ${(G.ui.marketAge || 'all') === k ? 'on' : ''}" data-act="market-age" data-v="${k}">${n}</button>`).join('')}</div>
  <div class="chips">${[['ovr', 'По рейтингу'], ['pot', 'По потенциалу'], ['value', 'По цене'], ['age', 'По возрасту']].map(([k, n]) =>
    `<button class="chip ${(G.ui.marketSort || 'ovr') === k ? 'on' : ''}" data-act="market-sort" data-v="${k}">${n}</button>`).join('')}</div>
  <label class="field"><span class="muted">Живой рейтинг не ниже: ${G.ui.marketFloor}</span>
    <input type="range" data-act="market-floor" data-sync="marketFloor" min="50" max="95" value="${G.ui.marketFloor}"></label>
  <div class="card rowlist" id="market-list" style="padding:6px 10px">${marketRows()}</div>
  <div class="note">Звёзды и потенциал — реальные игроки с рейтингами образца FC 27 (по открытым данным рейтингов и Transfermarkt). Свободные агенты — без клуба. Цены и цифры рейтинга «дышат»: форма, травмы и статистика двигают их во время сезона и после него.</div>`;
}

// ---------- inbox / money / calendar / cups / sacked ----------
function scrInbox() {
  const offers = G.S.offers.map((o, i) => {
    const p = S_player(o.pid);
    if (!p) return '';
    return `<div class="card"><h3>Предложение по ${esc(p.last)}</h3>
      <div class="muted small">«${esc(ENG.clubById(G.S, o.clubId).name)}» предлагает ${ENG.USD(o.fee)} за ${esc(pname(p))}.</div>
      <div class="btnrow"><button class="btn small" data-act="offer-accept" data-i="${i}">Продать за ${ENG.USD(o.fee)}</button>
      <button class="btn ghost small" data-act="offer-refuse" data-i="${i}">Отказать</button></div></div>`;
  }).join('');
  const msgs = G.S.inbox.map(m => `
    <div class="card" style="padding:10px 14px">
      <button class="row" style="cursor:pointer" data-act="msg-open" data-id="${m.id}">
        <div class="grow"><b>${m.read ? '' : '● '}<span class="kicker" style="display:inline;margin-right:8px">${esc(m.from)}</span>${esc(m.subject)}</b>
        <div class="sub muted">${ENG.fmtDDMM(m.date)}</div></div><span class="muted">${G.ui.inboxOpen[m.id] ? '▴' : '▾'}</span></button>
      ${G.ui.inboxOpen[m.id] ? `<div class="muted small" style="padding:8px 12px">${esc(m.body)}</div>` : ''}
    </div>`).join('');
  return `<div class="kicker">Связь с клубом</div><h1>Почта</h1>${offers}${msgs || '<div class="note">Писем нет.</div>'}`;
}
function scrMoney() {
  const cap = ENG.wageCap(ENG.myClub(G.S)), wage = ENG.totalWage(G.S);
  return `
  <div class="kicker">Клубная касса</div><h1>Финансы</h1>
  <div class="card rowlist" style="padding:6px 10px">
    <div class="row"><div class="grow">Трансферный бюджет</div><b>${ENG.F(G.S.budget)}</b></div>
    <div class="row"><div class="grow">Счёт клуба</div><b class="${G.S.balance < 0 ? 'danger' : ''}">${ENG.F(G.S.balance)}</b></div>
    <div class="row"><div class="grow">Зарплаты в неделю</div><b>${ENG.IW(wage)}</b></div>
    <div class="row" style="flex-direction:column;align-items:stretch"><div class="muted small">Потолок: ${ENG.IW(cap)} · занято ${Math.round(wage / cap * 100)}%</div>
      <div class="bar"><i style="width:${Math.min(100, wage / cap * 100)}%"></i></div></div>
  </div>
  <div class="note">Спонсор приходит 1-го числа. Зарплаты списываются по понедельникам. Долг на счёте злит совет.</div>
  <div class="card"><h3>Доверие совета</h3>
    <div class="bar trust ${G.S.confidence < 30 ? 'low' : ''}"><i style="width:${G.S.confidence}%"></i></div>
    <div class="muted small" style="margin-top:6px">${G.S.confidence} / 99</div></div>
  <div class="note">Ниже 16 после восьми туров совет увольняет. Победа крупного клуба ценится выше, чем ничья аутсайдера.</div>`;
}
function scrCalendar() {
  const fx = G.S.fixtures.filter(f => (f.home === G.S.clubId || f.away === G.S.clubId)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 30);
  const isMatchToday = fx.some(f => !f.played && f.date === G.S.date);
  return `
  <div class="kicker">${ENG.fmtDateFull(G.S.date)}</div><h1>Календарь</h1>
  <div class="btnrow"><button class="btn" data-act="next-day"${isMatchToday ? '' : ''}>+ день</button></div>
  <div class="note">Зимняя пауза с 7 декабря по 1 марта. Если уйти с игрового дня кнопкой «+ день», матч досимулирует помощник.</div>
  <div class="card rowlist" style="padding:6px 10px">
  ${fx.map(f => {
    const oppId = f.home === G.S.clubId ? f.away : f.home;
    const home = f.home === G.S.clubId;
    const lab = f.label || (f.comp === 'league' ? 'Тур ' + f.round : f.comp);
    return `<button class="row" ${f.played ? '' : `data-act="open-match" data-id="${f.id}"`}>
      <span class="muted small" style="width:46px">${ENG.fmtDDMM(f.date)}</span>
      <span class="tag">${home ? 'Д' : 'Г'}</span>
      <div class="grow">${esc(ENG.clubById(G.S, oppId).name)} <span class="muted small">${esc(lab)}</span></div>
      ${f.played ? `<b>${f.hg}:${f.ag}</b>` : '<span class="muted small">→</span>'}</button>`;
  }).join('')}</div>`;
}
function cupHtml() {
  const groups = (G.S.cup.groups || []).map((g, gi) => {
    const lab = 'Группа ' + 'ABCD'[gi];
    const rows = g.map(id => {
      const fx = G.S.fixtures.filter(f => f.comp === 'cup' && f.label === lab && f.played && (f.home === id || f.away === id));
      let pts = 0, gf = 0, ga = 0;
      fx.forEach(f => { const myH = f.home === id; gf += myH ? f.hg : f.ag; ga += myH ? f.ag : f.hg; pts += (myH ? f.hg > f.ag : f.ag > f.hg) ? 3 : f.hg === f.ag ? 1 : 0; });
      return { id, pts, gd: gf - ga };
    }).sort((a, b) => b.pts - a.pts || b.gd - a.gd);
    return `<div class="card"><h3>${lab}</h3>${rows.map(r =>
      `<div class="row" style="cursor:default"><div class="grow ${r.id === G.S.clubId ? 'me' : ''}" ${r.id === G.S.clubId ? 'style=color:#f2d7a2;font-weight:700' : ''}>${esc(ENG.clubById(G.S, r.id).name)}</div><b>${r.pts}</b></div>`).join('')}</div>`;
  }).join('');
  const e = G.S.euro || {};
  const myCupFx = G.S.fixtures.filter(f => f.comp === 'cup' && (f.home === G.S.clubId || f.away === G.S.clubId)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12);
  const myEuroFx = G.S.fixtures.filter(f => ['ucl', 'uel', 'uecl', 'uclq'].includes(f.comp) && (f.home === G.S.clubId || f.away === G.S.clubId)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12);
  const fxList = arr => arr.map(f => {
    const oppId = f.home === G.S.clubId ? f.away : f.home;
    return `<div class="row" style="cursor:default"><span class="muted small" style="width:46px">${ENG.fmtDDMM(f.date)}</span>
      <div class="grow">${esc(ENG.clubById(G.S, oppId).name)} <span class="muted small">${esc(f.label)}</span></div>
      ${f.played ? `<b>${f.hg}:${f.ag}</b>` : ''}</div>`;
  }).join('');
  return `
  <div class="card"><h3>FONBET Кубок России</h3>
    <div class="muted small">РПЛ: четыре группы по четыре, два круга. Регионы: плей-офф с июля. 1/8 — март, финал — 2 июня.</div>
    ${fxList(myCupFx)}</div>
  ${groups}
  <div class="card"><h3>Еврокубки · сетка</h3>
    <div class="muted small">${e.comp ? `${euroTitle(e.comp)} · ${euroStageName(e.stage)} · очки ${e.pts}` : 'Еврокубковый билет даётся по месту в РПЛ: 1–2 ЛЧ, 3 квалификация, 4 ЛЕ, 5–6 ЛК.'}</div>
    <div class="chips">${['Квалификация', 'Общий этап', '1/8', '1/4', '1/2', 'Финал'].map(s =>
      `<span class="chip ${(euroStageName(e.stage) || '').startsWith(s) ? 'on' : ''}">${s}</span>`).join('')}</div>
    ${fxList(myEuroFx)}</div>`;
}
function scrCups() {
  return `<div class="kicker">Сетка и группы</div><h1>Кубки</h1>${cupHtml()}`;
}
function euroTitle(c) { return c === 'ucl' ? 'Лига чемпионов' : c === 'uel' ? 'Лига Европы' : c === 'uecl' ? 'Лига конференций' : 'Квалификация ЛЧ'; }
function euroStageName(st) {
  return { qual: 'Квалификация', league: 'Общий этап', r16: '1/8', qf: '1/4', sf: '1/2', final: 'Финал', champion: 'Победитель', done: '' }[st] || '';
}
function scrSacked() {
  return `
  <div class="kicker">Совет директоров</div><h1>Вы уволены</h1>
  <p class="muted small">Доверие упало до ${G.S.confidence}. Ниже — клубы, которые готовы поговорить.</p>
  ${(G.S.vacancies || []).map(id => {
    const c = ENG.clubById(G.S, id);
    return `<button class="row" data-act="take-job" data-id="${id}">${badge(c)}<div class="grow"><b>${esc(c.name)}</b>
      <div class="sub muted">${esc(GD.LEAGUES[c.league].short)} · ${ENG.F(c.budget)}</div></div><span class="muted">→</span></button>`;
  }).join('')}
  <div class="btnrow"><button class="btn danger" data-act="restart">Начать заново</button></div>`;
}

// ---------- match screens ----------
function scrMatchPre() {
  const fx = fxById(G.ui.fxId);
  if (!fx) { go('desk'); return ''; }
  const oppId = fx.home === G.S.clubId ? fx.away : fx.home;
  const opp = ENG.clubById(G.S, oppId);
  return `
  <div class="kicker">${esc(fx.label || 'Тур ' + (fx.round || ''))} · ${ENG.fmtDate(fx.date)}</div>
  <h1>Матч ${fx.home === G.S.clubId ? 'дома' : 'в гостях'}</h1>
  <div class="match-head card">${badge(ENG.clubById(G.S, fx.home), true)}<div class="score" style="flex:1">:</div>${badge(ENG.clubById(G.S, fx.away), true)}</div>
  <div class="card"><h3>Справка на соперника</h3><div class="muted small">${esc(ENG.scoutReport(G.S, oppId))}</div></div>
  <div class="btnrow"><button class="btn" data-act="watch-live">Смотреть матч</button>
  <button class="btn ghost" data-act="watch-instant">Сразу результат</button></div>`;
}
function scrMatchLive() {
  return `
  <div class="match-head"><span id="lv-hs" class="grow small muted" style="text-align:right"></span>
    <div class="score" id="lv-score">0:0</div><span id="lv-as" class="grow small muted"></span></div>
  <div class="muted small" style="text-align:center" id="lv-info">—</div>
  <canvas id="mpitch" class="pitch-canvas"></canvas>
  <div class="fm-line" id="lv-ticker">Разминка…</div>
  <div class="btnrow" style="justify-content:center">
    <button class="btn ghost small" data-act="match-timeout">Тайм-аут · замены</button>
    <button class="btn ghost small" data-act="match-menu-open">Меню матча</button>
    <button class="btn ghost small" data-act="landscape">Поле шире</button>
  </div>
  <div class="note">Большую часть матча мяч в ногах. Поверните телефон — поле станет шире. Тайм-аут останавливает часы: в паузе доступны замены из запаса (сначала отметьте их на вкладке «Состав»).</div>`;
}
function scrMatchEnd() {
  const { fx, r, live } = G.ui.lastResult || {};
  if (!fx) { go('desk'); return ''; }
  const myHome = fx.home === G.S.clubId;
  const my = myHome ? r.hg : r.ag, opp = myHome ? r.ag : r.hg;
  const verdict = my > opp ? 'Победа' : my === opp ? 'Ничья' : 'Поражение';
  const ratings = ENG.playersOf(G.S, G.S.clubId).filter(p => p.apps && p.ratingSum).sort((a, b) => (b.ratingSum / b.apps) - (a.ratingSum / a.apps)).slice(0, 5)
    .map(p => `<div class="row" style="cursor:default">${posTag(p)}<div class="grow">${esc(pname(p))}</div><b>${(p.ratingSum / p.apps).toFixed(2)}</b></div>`).join('');
  const scorers = (live ? live.events.filter(e => e.kind === 'goal') : [])
    .map(e => `<div class="row" style="cursor:default"><span class="muted small" style="width:40px">${e.min}'</span><div class="grow">${esc(e.text)}</div><span class="tag">${e.side === 'h' ? (myHome ? '+' : '−') : (myHome ? '−' : '+')}</span></div>`).join('');
  return `
  <div class="kicker" style="text-align:center">${GD.LEAGUES[(ENG.clubById(G.S, fx.home) || {}).league || 'rpl']?.short || ''} · ${ENG.fmtDate(fx.date)}</div>
  <div class="score">${r.hg} : ${r.ag}</div>
  <div class="match-head">${badge(ENG.clubById(G.S, fx.home))}<span class="muted">xG ${r.xgH.toFixed(2)}:${r.xgA.toFixed(2)}</span>${badge(ENG.clubById(G.S, fx.away))}</div>
  <div class="card" style="text-align:center;font-family:Unbounded;font-size:20px;color:var(--gold)">${verdict}</div>
  ${scorers ? `<div class="card rowlist" style="padding:4px 10px">${scorers}</div>` : ''}
  <div class="muted small" style="text-align:center">Вы ${ENG.tablePos(G.S, G.S.clubId)}-е. Доверие ${G.S.confidence}.</div>
  <div class="card rowlist" style="padding:4px 10px">${ratings}</div>
  <button class="btn" data-act="match-back" style="width:100%">Дальше</button>`;
}
function trophyOverlay() {
  const t = G.ui.trophyScene;
  if (!t) return '';
  return `<div class="trophy-scene"><div class="kicker h">Заслуга сезона</div>
    <div class="cup">${trophySvg(t.kind, 110)}</div>
    <div class="team"><div class="score" style="font-size:20px">${esc(t.club)}</div><div class="muted">${esc(t.text)}</div></div>
    <div class="btnrow"><button class="btn" data-act="trophy-honors">В заслуги</button>
    <button class="btn ghost" data-act="match-back">Дальше</button></div></div>`;
}
function MENU_HTML() {
  const tac = G.S.tactics;
  const starters = ENG.lineupPlayers(G.S, G.S.clubId, tac);
  const bench = ENG.benchOf(G.S).filter(p => ENG.available(p));
  const selOut = G.ui.menuOut;
  const subRows = () => selOut
    ? (bench.length
      ? bench.map(p => `<button class="row" data-act="live-sub" data-out="${selOut}" data-inn="${p.id}">
          ${posTag(p)}<div class="grow">${esc(pname(p))} <span class="muted small">тонус ${p.cond}</span></div>${rateChip(p)}</button>`).join('')
      : '<div class="note">Запас пуст. Откройте «Состав» → стрелка слева → «на замену». Без запаса замены в матче недоступны.</div>')
    : starters.map(s => S_player(s.pid)).filter(Boolean).map(p => `
        <button class="row" data-act="menu-pick-out" data-pid="${p.id}">
          ${posTag(p)}<div class="grow">${esc(pname(p))} <span class="muted small">тонус ${p.cond}</span></div>${rateChip(p)}</button>`).join('');
  return `
  <h2>${MENU_TITLE()}<button class="x" data-act="match-resume">×</button></h2>
  <div class="chips">${GD.FORM_LIST.map(f => `<button class="chip ${tac.formation === f ? 'on' : ''}" data-act="formation" data-v="${f}">${f}</button>`).join('')}</div>
  ${SLIDERS.map(s => `<label class="field"><span class="muted">${s[1]}</span>
    <input type="range" data-act="slider" data-k="${s[0]}" min="${s[0] === 'mentality' ? -2 : 0}" max="${s[0] === 'mentality' ? 2 : 4}" value="${s[0] === 'mentality' ? tac.mentality : tac[s[0]] ?? 2}"></label>`).join('')}
  <div class="chips">${GD.TACTICS.map(t => `<button class="chip ${tac.style === t.id ? 'on' : ''}" data-act="style" data-v="${t.id}">${t.name}</button>`).join('')}</div>
  <h3 style="margin-top:12px">Замены (${G.ui.liveSubsUsed || 0}/5)</h3>
  ${selOut ? `<div class="note">Снять: <b>${esc(pname(S_player(selOut)))}</b> — выберите, кто выйдет из запаса.</div>` : '<div class="muted small">Сначала снимите игрока, затем выберите замену из запаса.</div>'}
  <div class="rowlist">${subRows()}</div>
  <div class="btnrow">
    ${window.MatchView && MatchView.htDone ? '<button class="btn" data-act="match-resume">Продолжить матч</button>' : '<button class="btn" data-act="match-second-half">Второй тайм</button>'}
    <button class="btn ghost" data-act="match-resume">Закрыть</button>
  </div>`;
}
window.MENU_HTML = MENU_HTML;

// ---------- render ----------
const SCREENS = {
  boot: scrBoot, honors: scrHonors, pick: scrPick, kits: scrKits, desk: scrDesk, squad: scrSquad,
  player: () => { const p = S_player(G.ui.viewingPlayer); return p ? playerCard(p) : '<div class="note">Игрок не найден.</div>'; },
  tactics: scrTactics, league: scrLeague, market: scrMarket, inbox: scrInbox, money: scrMoney,
  calendar: scrCalendar, cups: scrCups, sacked: scrSacked,
  'match-pre': scrMatchPre, 'match-live': scrMatchLive, 'match-end': scrMatchEnd,
};
const NAV = [['desk', 'Кабинет'], ['squad', 'Состав'], ['tactics', 'Тактика'], ['league', 'Лига'], ['market', 'Рынок'], ['other', 'Прочее']];
function sheetOther() {
  return `
  <h2>Прочее<button class="x" data-act="close-sheet">×</button></h2>
  <div class="rowlist">
    <button class="row" data-act="nav" data-v="inbox"><div class="grow">Почта</div><span class="muted">→</span></button>
    <button class="row" data-act="nav" data-v="money"><div class="grow">Финансы</div><span class="muted">→</span></button>
    <button class="row" data-act="nav" data-v="calendar"><div class="grow">Календарь</div><span class="muted">→</span></button>
    <button class="row" data-act="honors"><div class="grow">Заслуги</div><span class="muted">→</span></button>
    <button class="row" data-act="manual-save"><div class="grow">Сохранить вручную</div></button>
  </div>
  <h3 style="margin-top:14px">Сложность ботов на все матчи и сезоны</h3>
  <div class="chips">${Object.keys(ENG.DIFFS).map(d => `<button class="chip ${G.S.difficulty === d ? 'on' : ''}" data-act="difficulty" data-v="${d}">${{ novice: 'Новичок', experienced: 'Опытный', pro: 'Профессионал', world: 'Мировой класс' }[d]}</button>`).join('')}</div>
  <div class="muted small">${esc((ENG.DIFFS[G.S.difficulty] || {}).desc || '')}</div>
  <h3 style="margin-top:14px">Время матча, оба тайма</h3>
  <div class="chips">${[2, 3, 5].map(m => `<button class="chip ${G.S.matchMins === m ? 'on' : ''}" data-act="matchmins" data-v="${m}">${m} мин</button>`).join('')}</div>
  <div class="btnrow" style="margin-top:16px"><button class="btn danger" data-act="delete-career">Удалить карьеру</button></div>`;
}
function render() {
  if (window.MatchView && window.MatchView.active && G.screen !== 'match-live') window.MatchView.stop();
  const app = document.getElementById('app');
  let html = '';
  const preScreens = ['boot', 'honors', 'pick', 'kits', 'sacked'];
  if (preScreens.includes(G.screen)) {
    html = (SCREENS[G.screen] || scrBoot)();
  } else if (!G.S || G.S.sacked && G.screen !== 'sacked') {
    G.screen = 'boot'; html = scrBoot();
  } else {
    html = (SCREENS[G.screen] || scrDesk)();
  }
  const inCareer = G.S && !preScreens.includes(G.screen);
  const nav = inCareer ? `<nav class="tabs">${NAV.map(([v, n]) =>
    `<button class="${G.screen === v ? 'on' : ''}" data-act="nav" data-v="${v}">${n}</button>`).join('')}</nav>` : '';
  const sheet = G.sheet ? `<div class="sheet-wrap" data-act="close-sheet"><div class="sheet">${G.sheet.html}</div></div>`
    : (G.screen === 'other' && G.S ? `<div class="sheet-wrap"><div class="sheet">${sheetOther()}</div></div>` : '');
  app.innerHTML = html + trophyOverlay();
  document.body.dataset.screen = G.screen;
  document.querySelectorAll('nav.tabs').forEach(n => n.remove());
  if (nav) document.body.insertAdjacentHTML('beforeend', nav);
  document.querySelectorAll('.sheet-wrap').forEach(n => n.remove());
  if (sheet && G.screen !== 'other') document.body.insertAdjacentHTML('beforeend', sheet);
  else if (G.screen === 'other') document.body.insertAdjacentHTML('beforeend', sheetOtherSheet());
  if (G.screen === 'match-live' && window.MatchView) window.MatchView.start();
  if (G.screen === 'match-end') { G.ui.lastResult.played = true; }
  document.querySelectorAll('.back-top').forEach(n => n.remove());
  const showBack = inCareer && ['squad', 'tactics', 'league', 'market', 'other', 'player', 'calendar', 'inbox', 'money'].includes(G.screen);
  document.body.classList.toggle('has-back', showBack);
  if (showBack) {
    document.body.insertAdjacentHTML('beforeend', '<button class="back-top" data-act="go-back" title="Назад">←</button>');
  }
}
function sheetOtherSheet() { return `<div class="sheet-wrap">${'<div class="sheet">' + sheetOther() + '</div>'}</div>`; }
function updateTacSummary() {
  const el2 = document.getElementById('tac-summary');
  if (el2) el2.textContent = tacSummary(G.S.tactics);
}
function renderMarketList() { render(); }
function adaptWrap(p, pos) { return ENG.ADJ[p.pos] && ENG.ADJ[p.pos][pos] !== undefined ? ENG.ADJ[p.pos][pos] : 0.28; }

// ---------- global event wiring ----------
function initEvents() {
  document.body.addEventListener('click', e => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'menu-pick-out') { G.ui.menuOut = t.dataset.pid; G.sheet = { html: MENU_HTML() }; render(); return; }
    if (act === 'close-sheet' && t.classList.contains('sheet-wrap')) { if (t === e.target) closeSheet(); return; }
    const fn = window.ACT[act];
    if (fn) { e.preventDefault(); fn(t, e); }
  });
  document.body.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.sync) { G.ui[t.dataset.sync] = t.type === 'range' ? +t.value : t.value; }
    if (t.dataset.act === 'slider') window.ACT.slider(t, e);
    if (t.dataset.act === 'market-floor') { G.ui.marketFloor = +t.value; const m = t.closest('.card, label'); const lb = t.previousElementSibling; if (lb) lb.textContent = 'Живой рейтинг не ниже: ' + t.value; }
  });
  document.body.addEventListener('change', e => {
    if (e.target.dataset.act === 'market-floor') render();
    if (e.target.id === 'mk-search') render();
  });
}

return { esc, badge, ovrCls, posTag, pname, myNextFixture, avgCond, trophySvg,
  shirtSvg, shortsSvg, socksSvg, KIT_PATTERNS, kitDefaults, kitDraft, kitRepaint, kitGkAuto, kitColorName, colorDist,
  scrBoot, scrHonors, scrPick, scrKits, scrDesk, scrSquad, playerCard, squadRows,
  scrTactics, scrLeague, scrMarket, scrInbox, scrMoney, scrCalendar, scrCups, scrSacked,
  scrMatchPre, scrMatchLive, scrMatchEnd, render, initEvents, updateTacSummary, renderMarketList,
  MENU_HTML, benchSheetHtml, euroTitle, euroStageName, tableHtml, tacSummary };
})();
window.UI = UI;
window.render = UI.render;
window.updateTacSummary = UI.updateTacSummary;
window.renderMarketList = UI.renderMarketList;
