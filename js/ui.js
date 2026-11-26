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
// живой рейтинг как в FC 27: серый базовый + текущий динамический со стрелкой тренда
function rateChip(p) {
  const d = ENG.dynRating(p);
  const tr = d > p.ovr ? '<i class="tr up">▲</i>' : d < p.ovr ? '<i class="tr dn">▼</i>' : '';
  return `<span class="ovr base" title="Базовый рейтинг">${p.ovr}</span><span class="ovr dyn ${dynCls(d)}">${d}${tr}</span>`;
}
function posTag(p) { return `<span class="pos">${GD.POS_ABBR[p.pos]}</span>`; }
function pname(p) { return p.first + ' ' + p.last; }
function injuryTag(p) {
  if (!p || !p.injured) return '';
  const label = (p.injuryType || 'Травма') + ' · ещё ' + p.injured + ' дн.' + (p.injuryReturn ? ' · до ' + ENG.fmtDate(p.injuryReturn) : '');
  return `<span class="injury-mark" role="img" aria-label="${esc(label)}" title="${esc(label)}">✚</span>`;
}
function leagueClubs(lg) { return G.S ? G.S.clubs.filter(c => c.league === lg) : GD.CLUBS.filter(c => c.league === lg); }
function myNextFixture() {
  const up = G.S.fixtures.filter(f => f.date && !f.played && (f.home === G.S.clubId || f.away === G.S.clubId) && f.date >= G.S.date)
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
function menuIcon(name) {
  const paths = {
    settings: '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="m19 13 2 1-2 3-2-1a7 7 0 0 1-2 1l-.4 2h-4L10 17a7 7 0 0 1-2-1l-2 1-2-3 2-1a7 7 0 0 1 0-2l-2-1 2-3 2 1a7 7 0 0 1 2-1l.4-2h4l.4 2a7 7 0 0 1 2 1l2-1 2 3-2 1a7 7 0 0 1 0 2Z"/>',
    play: '<path d="m9 6 9 6-9 6V6Z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    slots: '<rect x="4" y="5" width="16" height="6" rx="2"/><rect x="4" y="14" width="16" height="6" rx="2"/><path d="M8 8h.01M8 17h.01"/>',
    trophy: '<path d="M8 4h8v6a4 4 0 0 1-8 0V4ZM8 6H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4M12 14v5m-4 1h8"/>',
  };
  return `<svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.play}</svg>`;
}
function menuBackground() {
  return `<div class="main-menu-scene" aria-hidden="true"><svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="menuSky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#06101a"/><stop offset=".65" stop-color="#163448"/><stop offset="1" stop-color="#091b22"/></linearGradient>
      <linearGradient id="menuGrass" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#2f7b54"/><stop offset="1" stop-color="#0d3e2c"/></linearGradient>
      <radialGradient id="menuLight"><stop stop-color="#efffff"/><stop offset=".2" stop-color="#d8ffff" stop-opacity=".9"/><stop offset="1" stop-color="#c9f5ff" stop-opacity="0"/></radialGradient>
      <pattern id="menuCrowd" width="18" height="16" patternUnits="userSpaceOnUse"><circle cx="4" cy="5" r="2" fill="#8da5ad" opacity=".32"/><circle cx="13" cy="11" r="2" fill="#d7e3df" opacity=".22"/></pattern>
    </defs>
    <rect width="1600" height="1000" fill="url(#menuSky)"/>
    <circle cx="275" cy="170" r="190" fill="url(#menuLight)" opacity=".35"/><circle cx="1325" cy="170" r="190" fill="url(#menuLight)" opacity=".35"/>
    <path d="M0 270 225 190h1150l225 80v365H0Z" fill="#0a1820"/>
    <path d="M0 270 225 190h1150l225 80-90 72H90Z" fill="#1d3038"/>
    <path d="M0 310h1600v250H0Z" fill="url(#menuCrowd)"/>
    <path d="M0 470c310-95 1290-95 1600 0v116c-330 125-1270 125-1600 0Z" fill="#12262a"/>
    <path d="M225 342h1150l-52 132H277Z" fill="#0c171c"/>
    <g fill="#e9ffff"><rect x="198" y="175" width="54" height="13" rx="3"/><rect x="208" y="193" width="34" height="10" rx="2"/><rect x="1348" y="175" width="54" height="13" rx="3"/><rect x="1358" y="193" width="34" height="10" rx="2"/></g>
    <path d="M150 575c390-155 910-155 1300 0l235 370H-85Z" fill="url(#menuGrass)"/>
    <path d="M150 575c390-155 910-155 1300 0l235 370H-85Z" fill="none" stroke="#d8efe1" stroke-width="7" opacity=".75"/>
    <path d="m535 610 530 0 238 353H297Z" fill="none" stroke="#d8efe1" stroke-width="6" opacity=".72"/>
    <path d="M800 575v388" stroke="#d8efe1" stroke-width="6" opacity=".72"/>
    <ellipse cx="800" cy="765" rx="102" ry="73" fill="none" stroke="#d8efe1" stroke-width="6" opacity=".72"/>
    <path d="M505 665h-75v140h75m660-140h75v140h-75" fill="none" stroke="#d8efe1" stroke-width="6" opacity=".72"/>
    <circle cx="800" cy="765" r="7" fill="#e6f4eb"/>
    <g fill="#e9ffff" opacity=".85"><circle cx="205" cy="252" r="5"/><circle cx="1395" cy="252" r="5"/><circle cx="800" cy="292" r="5"/></g>
  </svg></div>`;
}
function scrBoot() {
  let active = G.folder.active >= 0 && G.folder.slots[G.folder.active] ? G.folder.active : G.folder.slots.findIndex(Boolean);
  const save = active >= 0 ? G.folder.slots[active] : null;
  const ready = save && ENG.seasonReady(save);
  const club = save && ENG.clubById(save, save.clubId);
  const summary = save && club ? `<div class="menu-career-summary">
    <div class="menu-career-top"><span>Карьера ${active + 1}</span><span class="menu-status${ready ? ' ready' : ''}">${ready ? 'Итоги готовы' : 'В процессе'}</span></div>
    <div class="menu-career-main">${badge(club)}<div class="grow"><b>${esc(save.manager)}</b><span>${esc(club.name)}</span></div><strong>${save.season}/${save.season + 1}</strong></div>
  </div>` : '<div class="menu-career-summary menu-empty"><span>Три независимые карьеры</span><b>Ваш клуб. Ваши правила.</b></div>';
  return `<main class="main-menu">
    ${menuBackground()}
    <div class="menu-shade"></div>
    <header class="menu-brand"><div class="menu-brand-mark">FM</div><div><div class="menu-brand-overline">ФУТБОЛЬНЫЙ МЕНЕДЖЕР</div><h1>FM RUS <span>27</span></h1></div></header>
    <section class="menu-content">
      ${summary}
      <div class="main-menu-actions">
        <button class="fc-menu-button secondary" data-act="menu-settings">${menuIcon('settings')}<span><b>Настройки</b><small>Сложность, время матча и валюта</small></span><i>›</i></button>
        ${save ? `<button class="fc-menu-button primary${ready ? ' season-ready' : ''}" data-act="${ready ? 'season-close-from-menu' : 'menu-continue'}">${menuIcon(ready ? 'trophy' : 'play')}<span><b>${ready ? 'Завершить итоги сезона' : 'Продолжить'}</b><small>${ready ? 'Сезон ' + save.season + '/' + (save.season + 1) + ' · 1 июня' : esc(save.manager) + ' · ' + esc(club.name)}</small></span><i>›</i></button>`
          : `<button class="fc-menu-button primary" data-act="menu-create">${menuIcon('plus')}<span><b>Создать карьеру</b><small>Выберите клуб и начните сезон</small></span><i>›</i></button>`}
        <button class="fc-menu-button secondary" data-act="menu-slots">${menuIcon('slots')}<span><b>Карьеры</b><small>Три отдельных сохранения</small></span><i>›</i></button>
      </div>
      <button class="menu-honors" data-act="honors">${menuIcon('trophy')} Заслуги тренеров</button>
    </section>
    <footer class="menu-footer"><span>КАБИНЕТ ${esc(deviceStamp())}</span><span>Сезоны без конца · прогнозы по истории клубов</span></footer>
  </main>`;
}
function scrSlots() {
  const cards = G.folder.slots.map((s, i) => {
    if (!s) return `<article class="slot-card empty"><div class="kicker">Карьера ${i + 1}</div><h2>Свободный слот</h2><p class="muted small">Отдельное сохранение на этом устройстве.</p><button class="btn" data-act="slot-new" data-i="${i}">Создать карьеру</button></article>`;
    const c = ENG.clubById(s, s.clubId), ready = ENG.seasonReady(s);
    return `<article class="slot-card"><div class="slot-card-head"><div class="kicker">Карьера ${i + 1}</div><span class="menu-status${ready ? ' ready' : ''}">${ready ? 'Итоги готовы' : 'Сезон ' + s.season + '/' + (s.season + 1)}</span></div>
      <div class="slot-manager">${badge(c, true)}<div class="grow"><h2>${esc(s.manager)}</h2><p class="muted small">${esc(c.name)} · ${esc(GD.LEAGUES[c.league].short)}</p></div></div>
      <div class="slot-meta"><span>${esc(ENG.fmtDate(s.date))}</span><span>${s.players.length} игроков</span></div>
      <div class="btnrow"><button class="btn" data-act="slot-continue" data-i="${i}">${ready ? 'К итогам' : 'Продолжить'}</button><button class="btn danger" data-act="slot-delete" data-i="${i}">Удалить</button></div></article>`;
  }).join('');
  return `<section class="pre-screen slots-screen"><button class="btn ghost" data-act="slots-back">← Главное меню</button><div class="kicker">Кабинет ${esc(deviceStamp())}</div><h1>Ваши карьеры</h1><p class="muted small">У каждого слота собственный файл сохранения. Переключение не меняет другие карьеры.</p><div class="slots-grid">${cards}</div></section>`;
}
function scrSettings() {
  const settings = G.S || G.folder.settings;
  return `<section class="pre-screen settings-screen"><button class="btn ghost" data-act="settings-back">← Главное меню</button><div class="kicker">Настройки</div><h1>Игра на вашем уровне</h1>
    <div class="card"><h3>Сложность ботов</h3><div class="chips">${Object.keys(ENG.DIFFS).map(d => `<button class="chip ${settings.difficulty === d ? 'on' : ''}" data-act="difficulty" data-v="${d}">${{ novice: 'Новичок', experienced: 'Опытный', pro: 'Профессионал', world: 'Мировой класс' }[d]}</button>`).join('')}</div><p class="muted small">${esc((ENG.DIFFS[settings.difficulty] || {}).desc || '')}</p></div>
    <div class="card"><h3>Длительность матча</h3><div class="chips">${[2, 3, 5].map(m => `<button class="chip ${settings.matchMins === m ? 'on' : ''}" data-act="matchmins" data-v="${m}">${m} мин</button>`).join('')}</div><p class="muted small">Время указано для одного тайма. Можно менять в любой момент.</p></div>
    <div class="card"><h3>Валюта</h3><div class="chips">${ENG.CURS.map(c => `<button class="chip ${(settings.currency || 'rub') === c.code ? 'on' : ''}" data-act="currency" data-v="${c.code}">${c.sym} ${c.name}</button>`).join('')}</div><p class="muted small">Все цены, зарплаты и бюджеты показываются в выбранной валюте. Пример: ${ENG.F(120)}.</p></div>
    <div class="note">${G.S ? 'Настройки применяются к текущей карьере «' + esc(ENG.myClub(G.S).name) + '».' : 'Эти настройки станут стандартными для новых карьер.'}</div></section>`;
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
  <button class="btn ghost" data-act="honors-back">Назад</button>`;
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
  <div class="note">В РПЛ 1–2 места идут в Лигу чемпионов, 3-е — в квалификацию, 4-е в Лигу Европы, 5–6 в Лигу конференций. В зарубежных чемпионатах билеты распределяются по своим слотам УЛС, ЛЕ и ЛК.</div>`;
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
  const objectivesDone = (G.S.objectives || []).filter(o => ENG.objectiveProgress(G.S, o).met).length;
  const injured = ENG.playersOf(G.S, G.S.clubId).filter(p => p.injured).sort((a, b) => b.injured - a.injured);
  const medicalCard = injured.length ? `<div class="card medical-card"><h3>Медицинский штаб · ${injured.length}</h3>
    ${injured.slice(0, 4).map(p => `<button class="row" data-act="open-player" data-id="${p.id}">${injuryTag(p)}<div class="grow"><b>${esc(pname(p))}</b><div class="sub muted">${esc(p.injuryType || 'Травма')} · ещё ${p.injured} дн.</div></div><span class="tag">${p.injuryReturn ? 'до ' + ENG.fmtDate(p.injuryReturn) : 'восстановление'}</span></button>`).join('')}
    ${injured.length > 4 ? `<div class="muted small">И ещё ${injured.length - 4} — подробности в составе.</div>` : ''}</div>` : '';
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
      ${fx.date > G.S.date ? `<button class="btn ghost" data-act="nav" data-v="calendar" style="width:100%;margin-top:6px">Открыть календарь</button>` : ''}
    </div>` : `
    <div class="card"><h3>Матчей нет</h3>
      <div class="muted small">${ENG.seasonReady(G.S) ? 'Сезон завершён. Пора подвести итоги.' : 'Продолжайте календарь до 1 июня — тогда откроются итоги сезона.'}</div>
      <div class="btnrow">${ENG.seasonReady(G.S) ? '<button class="btn" data-act="season-close-from-menu">Завершить итоги сезона</button>' : '<button class="btn ghost" data-act="nav" data-v="calendar">Открыть календарь</button>'}</div>
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
  ${medicalCard}
  <div class="card rowlist" style="padding:6px 10px">
    <button class="row" data-act="nav" data-v="inbox"><div class="grow">Почта</div><span class="tag${unread ? ' warn' : ''}">${unread ? unread + ' новых' : 'нет новых'}</span></button>
    <button class="row" data-act="nav" data-v="league"><div class="grow">Таблица</div><span class="muted small">${esc(ENG.clubById(G.S, (ENG.table(G.S, club.league)[0] || {}).id || club.id).name)} лидирует</span></button>
    <button class="row" data-act="nav" data-v="cups"><div class="grow">Кубок России</div><span class="muted small">сетка и группы</span></button>
    <button class="row" data-act="nav" data-v="euro"><div class="grow">Еврокубки</div><span class="muted small">УЛС · ЛЕ · ЛК</span></button>
    <button class="row" data-act="nav" data-v="academy"><div class="grow">Молодёжная академия</div><span class="muted small">20 игроков · развитие</span></button>
    <button class="row" data-act="nav" data-v="objectives"><div class="grow">Задачи сезона</div><span class="muted small">${objectivesDone}/${(G.S.objectives || []).length} выполняются</span></button>
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
      ${posTag(p)}<div class="grow"><b>${esc(pname(p))}</b>${injuryTag(p)} <span class="muted small">${p.age} лет · ${p.apps ? p.goals + 'г ' + p.assists + 'п' : 'тонус ' + p.cond}</span>
      <div class="sub muted">${starters.has(p.id) ? 'основа · ' : bench.has(p.id) ? 'запас · ' : 'резерв · '}${p.mor < 45 ? 'настрой ' + p.mor + ' · ' : ''}${p.injured ? 'травма ' + p.injured + ' дн. · ' : ''}${p.ban ? 'дискв. · ' : ''}${p.cond < 65 ? 'тонус ' + p.cond + ' · ' : ''}${p.apps ? 'оц. ' + (p.ratingSum / p.apps).toFixed(2) : ''}</div></div>
      ${rateChip(p)}
    </button>`).join('');
}
function scrSquad() {
  const f = G.ui.squadFilter;
  return `
  <div class="kicker">${esc(ENG.myClub(G.S).name)}</div><h1>Состав</h1>
  <div class="chips">${[['all', 'Все'], ['gk', 'Вратари'], ['def', 'Защита'], ['mid', 'Полузащита'], ['fwd', 'Атака']].map(([k, n]) =>
    `<button class="chip ${f === k ? 'on' : ''}" data-act="squad-filter" data-v="${k}">${n}</button>`).join('')}</div>
  <div class="card rowlist" style="padding:6px 10px">${squadRows(f)}</div>`;
}
function academyGroup(p) {
  if (p.pos === 'GK') return 'gk';
  if (['DR', 'DL', 'DC'].includes(p.pos)) return 'def';
  if (['DM', 'MC', 'AM', 'MR', 'ML'].includes(p.pos)) return 'mid';
  return 'fwd';
}
function academyPlayers() {
  const filter = G.ui.academyFilter || 'all';
  let list = ENG.youthPlayers(G.S).filter(p => filter === 'all' || academyGroup(p) === filter);
  const sort = G.ui.academySort || 'pot';
  list = list.slice().sort((a, b) =>
    sort === 'age' ? a.age - b.age || b.pot - a.pot :
    sort === 'ovr' ? b.ovr - a.ovr || b.pot - a.pot :
    sort === 'growth' ? (b.pot - b.ovr) - (a.pot - a.ovr) : b.pot - a.pot || b.ovr - a.ovr
  );
  return list;
}
function academyRow(p) {
  const growth = Math.max(0, p.pot - p.ovr);
  const band = p.pot >= 85 ? 'elite' : p.pot >= 78 ? 'standout' : p.pot >= 70 ? 'solid' : 'squad';
  return `<button class="academy-player" data-act="open-player" data-id="${p.id}">
    <span class="academy-number">${p.number}</span>${posTag(p)}
    <span class="academy-name"><b>${esc(pname(p))}</b>${injuryTag(p)}<small>${p.age} лет · ${esc(p.trait)}</small></span>
    <span class="academy-rating ${dynCls(p.ovr)}"><b>${p.ovr}</b><small>OVR</small></span>
    <span class="academy-potential ${band}"><b>${p.pot}</b><small>POT +${growth}</small></span>
    <span class="academy-growth"><i style="width:${Math.min(100, growth * 4)}%"></i></span>
    <span class="academy-open">→</span>
  </button>`;
}
function scrAcademy() {
  const all = ENG.youthPlayers(G.S);
  const avgOvr = Math.round(all.reduce((a, p) => a + p.ovr, 0) / Math.max(1, all.length));
  const avgPot = Math.round(all.reduce((a, p) => a + p.pot, 0) / Math.max(1, all.length));
  const best = all.slice().sort((a, b) => b.pot - a.pot || b.ovr - a.ovr)[0];
  const cooldown = G.S.youthTrainedOn && G.S.date < ENG.addDays(G.S.youthTrainedOn, 7);
  return `<section class="academy-hub">
    <div class="academy-brand"><span>FC 27</span><i>YOUTH ACADEMY</i></div>
    <div class="academy-hero">
      <div><div class="kicker">${esc(ENG.myClub(G.S).name)} · сезон ${G.S.season}/${G.S.season + 1}</div><h1>Молодёжная академия</h1>
      <p>Двадцать воспитанников. Низкий текущий уровень, разный потолок и шанс добраться до первой команды.</p></div>
      ${badge(ENG.myClub(G.S), true)}
    </div>
    <div class="academy-metrics">
      <div><span>Состав</span><b>${all.length}</b><small>игроков</small></div>
      <div><span>Средний OVR</span><b>${avgOvr}</b><small>текущий</small></div>
      <div><span>Средний POT</span><b>${avgPot}</b><small>потолок</small></div>
      <div><span>Лучший потолок</span><b>${best ? best.pot : '—'}</b><small>${best ? esc(best.last) : ''}</small></div>
    </div>
    ${best ? `<button class="academy-prospect" data-act="open-player" data-id="${best.id}">
      <span class="academy-prospect-label">Главный талант</span>${posTag(best)}
      <span class="grow"><b>${esc(pname(best))}</b><small>${best.age} лет · ${esc(best.trait)} · запас роста +${best.pot - best.ovr}</small></span>
      <span class="academy-potential elite"><b>${best.pot}</b><small>POT</small></span><span>→</span>
    </button>` : ''}
    <div class="academy-toolbar">
      <div class="chips">${[['all', 'Все'], ['gk', 'Вратари'], ['def', 'Защита'], ['mid', 'Полузащита'], ['fwd', 'Атака']].map(([k, n]) =>
        `<button class="chip ${(G.ui.academyFilter || 'all') === k ? 'on' : ''}" data-act="academy-filter" data-v="${k}">${n}</button>`).join('')}</div>
      <div class="chips">${[['pot', 'По потолку'], ['ovr', 'По рейтингу'], ['growth', 'По запасу роста'], ['age', 'По возрасту']].map(([k, n]) =>
        `<button class="chip ${(G.ui.academySort || 'pot') === k ? 'on' : ''}" data-act="academy-sort" data-v="${k}">${n}</button>`).join('')}</div>
    </div>
    <div class="academy-list">${academyPlayers().map(academyRow).join('') || '<div class="note">В этой группе игроков нет.</div>'}</div>
    <div class="academy-development">
      <div><b>Развивающая тренировка</b><span>Один раз в неделю · 0.5 млн ₽. Повышает тонус и даёт шанс прибавить рейтинг до потолка.</span></div>
      <button class="btn" data-act="academy-train" ${cooldown || G.S.budget < .5 ? 'disabled' : ''}>${cooldown ? 'Доступна через неделю' : 'Провести тренировку'}</button>
    </div>
    <div class="academy-foot">OVR — текущий рейтинг · POT — возможный потолок · +N — запас роста. Юноши не участвуют в матчах основной команды, пока не подпишут профессиональный контракт.</div>
  </section>`;
}
function youthPlayerCard(p) {
  const attrs = p.pos === 'GK'
    ? [['Вратарская', p.gk], ['Игра руками', p.def], ['Характер', p.men], ['Выбор позиции', p.pas]]
    : [['Скорость', p.pac], ['Удар', p.sho], ['Пас', p.pas], ['Техника', p.tec], ['Отбор', p.def], ['Мощь', p.strn], ['Выносливость', p.sta], ['Характер', p.men]];
  const growth = Math.max(0, p.pot - p.ovr);
  return `<section class="academy-hub academy-player-card">
    <div class="academy-brand"><span>FC 27</span><i>YOUTH PROFILE</i></div>
    <button class="academy-back" data-act="go-back">← Академия</button>
    <div class="kicker">${GD.POS_FULL[p.pos]} · ${esc(p.nat)} · №${p.number}</div><h1>${esc(pname(p))}${injuryTag(p)}</h1>
    <div class="academy-profile-head">
      <div class="academy-big-rating ${dynCls(p.ovr)}"><b>${p.ovr}</b><span>OVR</span></div>
      <div class="academy-big-pot"><b>${p.pot}</b><span>POT</span><small>+${growth} до потолка</small></div>
      <div class="grow"><b>${p.age} лет · ${p.foot} нога</b><span>${esc(p.trait)}</span><span>В академии с ${p.academyJoined} года</span></div>
    </div>
    <div class="academy-pot-bar"><i style="width:${Math.min(100, growth * 4)}%"></i></div>
    <div class="academy-metrics">
      <div><span>Тонус</span><b>${p.cond}</b><small>состояние</small></div>
      <div><span>Свежесть</span><b>${p.sharp}</b><small>ритм</small></div>
      <div><span>Настрой</span><b>${p.mor}</b><small>мотивация</small></div>
      <div><span>Развитие</span><b>${p.development}</b><small>тренировок</small></div>
    </div>
    <div class="academy-attributes">${attrs.map(a => attrLine(a[0], a[1] * 5)).join('')}</div>
    <div class="note">${esc(scoutingBlurb(p))} Юный игрок не выступает за основу до подписания профессионального контракта.</div>
    <div class="btnrow"><button class="btn" data-act="promote-youth" data-pid="${p.id}">Подписать и перевести в основу</button>
      <button class="btn danger" data-act="release-youth" data-pid="${p.id}">Отпустить из академии</button></div>
  </section>`;
}
function objectiveBoardHtml() {
  return (G.S.objectives || []).map(o => {
    const p = ENG.objectiveProgress(G.S, o);
    return `<div class="objective-row ${p.met ? 'done' : ''}"><span class="objective-check">${p.met ? '✓' : '•'}</span>
      <div class="grow"><b>${esc(o.label)}</b><small>${esc(ENG.objValueText(o, p.value))} · цель: ${esc(ENG.objTargetText(o))}</small></div>
      <span class="tag">${p.met ? 'Выполняется' : 'В работе'}</span></div>`;
  }).join('');
}
function scrObjectives() {
  const form = (G.S.form || []).slice(-5);
  return `<div class="kicker">Совет директоров</div><h1>Задачи сезона</h1>
    <div class="strip"><div class="cell"><div class="k">Репутация</div><div class="v">${G.S.managerRep || 55}</div></div>
      <div class="cell"><div class="k">Доверие</div><div class="v">${G.S.confidence}</div></div>
      <div class="cell"><div class="k">Последние</div><div class="v">${form.length ? form.map(x => `<span class="form-${x.toLowerCase()}">${x}</span>`).join('') : '—'}</div></div></div>
    <div class="card rowlist" style="padding:6px 10px">${objectiveBoardHtml()}</div>
    <div class="note">Совет ставит задачи по силе состава и уровню лиги — с каждым сезоном их больше и они требовательнее. Невыполнение большинства задач при низком доверии, длинная серия поражений или доверие ниже 16 после восьми матчей может стоить работы. Репутация влияет на шанс получить место в другом клубе.</div>
    <button class="btn ghost" data-act="back">Назад</button>`;
}
function benchSheetHtml() {
  const S = G.S;
  const starters = ENG.lineupPlayers(S, S.clubId, S.tactics);
  const stIds = new Set(starters.map(s => s.pid));
  const bench = ENG.benchOf(S);
  const all = ENG.playersOf(S, S.clubId).sort((a, b) => b.ovr - a.ovr);
  const reserve = all.filter(p => !stIds.has(p.id) && !bench.some(b => b.id === p.id));
  const row = (p, kind, btn) => `
    <div class="row" style="cursor:default">${posTag(p)}<div class="grow"><b>${esc(pname(p))}</b>${injuryTag(p)}
      <div class="sub muted">${GD.POS_FULL[p.pos]} · тонус ${p.cond}${p.injured ? ' · ' + esc(p.injuryType || 'травма') + ' ' + p.injured + ' дн.' : ''}${p.ban ? ' · дискв.' : ''}</div></div>
      ${rateChip(p)}${btn || ''}</div>`;
  const b = (pid, on) => `<button class="btn small ${on ? 'ghost' : ''}" data-act="${on ? 'bench-remove' : 'bench-add'}" data-pid="${pid}">${on ? 'убрать' : 'на замену'}</button>`;
  return `
  <h2>Замены<button class="x" data-act="close-sheet">×</button></h2>
  <p class="muted small">Отметьте до ${ENG.BENCH_MAX} игроков. Они смогут выйти при паузе матча или тайм-ауте.</p>
  <h3 class="sheet-h3">Запас (${bench.length}/${ENG.BENCH_MAX})</h3>
  ${bench.length ? `<div class="rowlist">${bench.map(p => row(p, 'bn', b(p.id, true))).join('')}</div>` : '<div class="note">Пока пусто. Выберите игроков из резерва ниже.</div>'}
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
  <h1>${esc(pname(p))}${injuryTag(p)}</h1>
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
  const perRub = (ENG.curDef() || { perRub: 1 }).perRub;
  const cv = mlnRub => Math.round(mlnRub * 100 / perRub) / 100; // млн ₽ → млн выбранной валюты
  const fee = G.ui.bidFee || cv(p.value);
  if (free || !isForeign) {
    return `<div class="card"><h3>Трансфер</h3>
      <label class="field"><span class="muted">Запрос клуба ${ENG.USD(p.value)}. Сумму вводите в млн ${esc((ENG.curDef() || {}).sym || '')}.</span>
      <input type="number" id="bid-fee" data-sync="bidFee" step="0.05" min="0.05" value="${fee}"></label>
      <div class="chips">${[0.8, 1, 1.25].map(m => `<button class="chip ${Math.abs(fee - cv(p.value * m)) < 0.05 ? 'on' : ''}" data-act="bid-chip" data-v="${cv(p.value * m)}">${m === 1 ? '100%' : Math.round(m * 100) + '%'} · ${ENG.USD(p.value * m)}</button>`).join('')}</div>
      ${window || free ? `<button class="btn" data-act="buy">Подписать</button>` : `<div class="note">Окно закрыто. Лето до 12 сентября, зима 20 января — 25 февраля.</div>`}
    </div>`;
  }
  return `<div class="card"><h3>Предложение</h3>
    <label class="field"><span class="muted">Запрос клуба ${ENG.USD(p.value)}. Сумму вводите в млн ${esc((ENG.curDef() || {}).sym || '')}.</span>
    <input type="number" id="bid-fee" data-sync="bidFee" step="0.05" min="0.05" value="${fee}"></label>
    <div class="chips">${[0.8, 1, 1.25].map(m => `<button class="chip ${Math.abs(fee - cv(p.value * m)) < 0.05 ? 'on' : ''}" data-act="bid-chip" data-v="${cv(p.value * m)}">${m === 1 ? '100%' : Math.round(m * 100) + '%'} · ${ENG.USD(p.value * m)}</button>`).join('')}</div>
    ${window ? `<button class="btn" data-act="buy">Предложить ${ENG.USD(fee * perRub)}</button>` : '<div class="note">Окно закрыто. Лето до 12 сентября, зима 20 января — 25 февраля.</div>'}
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
function sliderIndex(key, value) {
  const idx = key === 'mentality' ? +value + 2 : +value;
  return Math.max(0, Math.min(4, Number.isFinite(idx) ? idx : 2));
}
function sliderWord(key, value) {
  const s = SLIDERS.find(x => x[0] === key);
  return s ? s[2][sliderIndex(key, value)] : '';
}
function slotFit(p, pos) {
  const adapt = ENG.adapt(p, pos);
  const cls = adapt >= .9 ? 'good' : adapt >= .65 ? 'warn' : 'bad';
  const rating = Math.max(1, Math.round(ENG.dynRating(p) * (.78 + .22 * adapt)));
  return { adapt, cls, rating };
}
function slotFitChip(p, pos) {
  const fit = slotFit(p, pos);
  const label = fit.cls === 'good' ? 'родная позиция' : fit.cls === 'warn' ? 'небольшая несоответствующая позиция' : 'серьёзное несоответствие позиции';
  return `<span class="ovr dyn slot-fit ${fit.cls}" title="${esc(label)} · адаптация ${Math.round(fit.adapt * 100)}%">${fit.rating}</span>`;
}
function tacticsDots(prefix) {
  const tac = G.S.tactics;
  const plan = ENG.lineupPlayers(G.S, G.S.clubId, tac);
  const club = ENG.myClub(G.S);
  return GD.FORMATIONS[tac.formation].map((c, i) => {
    const xy = slotCoords(tac, i, tac);
    const slot = plan.find(p => p.slot === i);
    const p = slot && S_player(slot.pid);
    if (!p) return '';
    const fit = slotFit(p, xy.pos);
    return `<button class="dot slot-fit-${fit.cls} ${G.ui.selectedSlot === i ? 'sel' : ''}" style="left:${xy.x}%;top:${xy.y}%" data-act="slot-select" data-i="${i}" data-drag-pid="${p.id}" data-drag-kind="starter" data-drag-slot="${i}" data-drop-slot="${i}" title="${esc(pname(p))} · ${GD.POS_FULL[xy.pos]} · рейтинг ${fit.rating}">
      <span class="ball-dot" style="--c1:${club.color}">${p.number}</span><span class="lbl">${GD.POS_ABBR[xy.pos]} <b class="dot-rate">${fit.rating}</b></span></button>`;
  }).join('');
}
function lineupBenchRows(inMatch) {
  const tac = G.S.tactics;
  const plan = ENG.lineupPlayers(G.S, G.S.clubId, tac);
  const starters = new Set(plan.map(s => s.pid));
  const namedBench = ENG.benchOf(G.S).filter(p => ENG.available(p) && !starters.has(p.id));
  const list = (namedBench.length ? namedBench : ENG.playersOf(G.S, G.S.clubId).filter(p => ENG.available(p) && !starters.has(p.id)))
    .slice().sort((a, b) => ENG.dynRating(b) - ENG.dynRating(a));
  return list.map(p => `<button class="lineup-bench-player${G.ui.selectedSlot >= 0 ? ' assignable' : ''}" data-drag-pid="${p.id}" data-drag-kind="bench"${G.ui.selectedSlot >= 0 ? ` data-act="assign" data-pid="${p.id}"` : ''}>
    ${posTag(p)}<span class="grow"><b>${esc(pname(p))}</b><small>${GD.POS_FULL[p.pos]} · тонус ${p.cond}</small></span>${rateChip(p)}</button>`).join('') || '<div class="note">Нет доступных запасных.</div>';
}
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
  return `
  <button class="bench-arrow tactics-bench-arrow" data-act="bench-open" title="Запас и резерв" aria-label="Открыть запас и резерв">⇥</button>
  <div class="kicker">Матч-план</div><h1>Тактика</h1>
  <div class="chips">${GD.FORM_LIST.map(f => `<button class="chip ${tac.formation === f ? 'on' : ''}" data-act="formation" data-v="${f}">${f}</button>`).join('')}</div>
  <div class="pitch" id="tac-pitch">${tacticsDots('tac')}</div>
  <div class="lineup-bench-panel">
    <div class="lineup-bench-head"><b>Запас</b><span>Перетащите игрока на позицию, чтобы заменить или поменять футболистов местами.</span></div>
    <div class="lineup-bench-list">${lineupBenchRows(false)}</div>
  </div>
  <div class="card rowlist tac-eleven" style="padding:4px 10px;margin:8px 0">
    ${plan.map(s => { const p = S_player(s.pid); return p ? `<button class="row" data-act="open-player" data-id="${p.id}">${posTag(p)}<div class="grow"><b>${esc(pname(p))}</b>${injuryTag(p)} <span class="muted small">${GD.POS_ABBR[s.pos]} · №${p.number}</span></div>${slotFitChip(p, s.pos)}</button>` : ''; }).join('')}
  </div>
  <div class="muted small" id="tac-summary" style="margin:8px 0">${esc(tacSummary(tac))}</div>
  <div class="chips">${GD.TACTICS.map(t => `<button class="chip ${tac.style === t.id ? 'on' : ''}" data-act="style" data-v="${t.id}">${t.name}</button>`).join('')}</div>
  ${SLIDERS.map(s => {
    const value = s[0] === 'mentality' ? tac.mentality : tac[s[0]] ?? 2;
    const word = sliderWord(s[0], value);
    return `<label class="field"><span class="muted">${s[1]}: <b class="slider-word" data-slider-word="${s[0]}">${word}</b></span>
      <input type="range" data-act="slider" data-k="${s[0]}" min="${s[0] === 'mentality' ? -2 : 0}" max="${s[0] === 'mentality' ? 2 : 4}" value="${value}" aria-valuetext="${word}"></label>`;
  }).join('')}
  <div class="btnrow">
    ${[['attack', 'Установка: атака'], ['defence', 'Установка: оборона'], ['set', 'Стандарты'], ['physical', 'Объём'], ['rest', 'Восстановление']].map(t =>
      `<button class="btn ghost small ${G.S.focus === t[0] ? 'on' : ''}" data-act="train" data-v="${t[0]}">${t[1]}</button>`).join('')}
    <button class="btn small" data-act="tac-auto">Авто</button>
  </div>
  <div class="note">Жёлтая подсветка — небольшая смена позиции, красная — серьёзная; рейтинг уже учитывает адаптацию. Средний тонус состава ${UI_avgCond()}.</div>`;
}
function assignmentHtml() {
  const tac = G.S.tactics;
  const i = G.ui.selectedSlot;
  const pos = GD.FORMATIONS[tac.formation][i].pos;
  const used = new Set(tac.slots.filter(Boolean));
  const list = ENG.playersOf(G.S, G.S.clubId).filter(p => !p.injured && !p.ban)
    .map(p => ({ p, fit: ENG.ft(p, pos) })).sort((a, b) => b.fit - a.fit);
  return `<h2>Кто на позиции ${GD.POS_ABBR[pos]}<button class="x" data-act="close-sheet">×</button></h2>
  <div class="rowlist">${list.slice(0, 14).map(({ p }) => `
    <button class="row" data-act="${used.has(p.id) ? 'close-sheet' : 'assign'}" data-pid="${p.id}">
      ${posTag(p)}<div class="grow"><b>${esc(pname(p))}</b><div class="sub muted">${p.age} лет · адаптация ${Math.round(ENG.adapt(p, pos) * 100)}% · тонус ${p.cond}${p.injured ? ' · травма' : ''}</div></div>
      ${slotFitChip(p, pos)}</button>`).join('')}</div>`;
}
function UI_avgCond() { return avgCond(); }
function updateTacticSlider(el) {
  const key = el.dataset.k;
  const word = sliderWord(key, el.value);
  const label = document.querySelector('[data-slider-word="' + key + '"]');
  if (label) label.textContent = word;
  el.setAttribute('aria-valuetext', word);
  document.querySelectorAll('#tac-pitch .dot, #match-tac-pitch .dot').forEach(dot => {
    const xy = slotCoords(G.S.tactics, +dot.dataset.i, G.S.tactics);
    dot.style.left = xy.x + '%';
    dot.style.top = xy.y + '%';
  });
}

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
  ${lg === myLg && done && ENG.seasonReady(G.S) ? `<button class="btn" data-act="season-close-from-menu" style="width:100%">Завершить итоги сезона</button>` : ''}`;
}

// ---------- market ----------
const MK_SECTIONS = [['era', 'Старая эпоха'], ['promise', 'Высокий потенциал'], ['free', 'Свободные агенты'], ['all', 'Страны и лиги']];
// реальные игроки лиги/страны 65+ + сгенерированный пул этой страны; свободные агенты — только во вкладке «Свободные агенты»
function inLeagueMarket(p, mk) {
  const lg = mk.inGame || mk.id;
  if (p.clubId === 'pool:' + mk.id) return ENG.dynRating(p) >= 65;
  if (p.real) return p.league === lg && ENG.dynRating(p) >= 65;
  if (mk.inGame) { const c = ENG.clubById(G.S, p.clubId); return c && c.league === mk.inGame; }
  return false;
}
function marketRows() {
  const sec = G.ui.marketSection || 'era';
  const mk = GD.MARKETS.find(m => m.id === G.ui.marketCountry) || GD.MARKETS[0];
  let list = G.S.players.filter(p => p.clubId !== G.S.clubId && !String(p.clubId).startsWith('eu-'));
  if (sec === 'era') list = list.filter(p => p.era || (p.real && p.age >= 33));
  else if (sec === 'promise') list = list.filter(p => (p.real ? p.pot >= 84 && p.age <= 21 : p.pot - p.ovr >= 5 && p.age <= 21));
  else if (sec === 'free') list = list.filter(p => p.clubId === 'free' || p.freeAgent);
  else list = list.filter(p => inLeagueMarket(p, mk));
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
  else if (age === 'a27_30') list = list.filter(p => p.age >= 27 && p.age <= 30);
  else if (age === 'a30_35') list = list.filter(p => p.age >= 30 && p.age <= 35);
  else if (age === 'o35') list = list.filter(p => p.age >= 35);
  const floor = sec === 'all' ? Math.max(G.ui.marketFloor, 65) : G.ui.marketFloor;
  list = list.filter(p => ENG.dynRating(p) >= floor);
  const sort = G.ui.marketSort || 'ovr';
  const dir = G.ui.marketSortDir === 'asc' ? 1 : -1; // ▲ (desc) — сначала высокие значения
  list = list.sort((a, b) => dir * (
    sort === 'value' ? a.value - b.value :
    sort === 'pot' ? (a.pot - b.pot) || (a.ovr - b.ovr) :
    sort === 'age' ? a.age - b.age :
    ENG.dynRating(a) - ENG.dynRating(b)));
  return list.map(p => {
    const price = p.value;
    const delta = p.baseValue ? Math.round((p.value / p.baseValue - 1) * 100) : 0;
    const dt = delta >= 3 ? '<i class="tr up">+' + delta + '%</i>' : delta <= -3 ? '<i class="tr dn">' + delta + '%</i>' : '';
    return `<button class="row" data-act="open-player" data-id="${p.id}">
      ${posTag(p)}<div class="grow"><b class="mk-name">${esc(pname(p))}</b>${injuryTag(p)}${p.era ? ' <span class="fc-tag era-tag">эпоха</span>' : p.real ? ' <span class="fc-tag">FC 27</span>' : ''}
      <div class="sub muted">${esc(p.nat)} · ${p.age} лет${p.realClub ? ' · ' + esc(p.realClub) : p.clubId === 'free' ? ' · без клуба' : ''}${p.mor < 45 ? ' · настрой ' + p.mor : ''} · ${ENG.USD(price)}${dt ? ' ' : ''}${dt}</div></div>
      ${rateChip(p)}</button>`;
  }).join('');
}
function scrMarket() {
  const sec = G.ui.marketSection || 'era';
  const selectedMarket = GD.MARKETS.find(m => m.id === G.ui.marketCountry) || GD.MARKETS[0];
  return `
  <div class="kicker">Все рынки · цены как в жизни, меняются по ходу сезона</div><h1>Рынок</h1>
  <div class="chips">${MK_SECTIONS.map(([k, n]) => `<button class="chip ${sec === k ? 'on' : ''}" data-act="market-section" data-v="${k}">${n}</button>`).join('')}</div>
  ${sec === 'all' ? `<div class="market-country-head"><b>${esc(selectedMarket.country)} — ${esc(selectedMarket.league)}</b><span class="muted small">${GD.MARKETS.length} рынков</span></div>
  <div class="chips market-countries">${GD.MARKETS.map(m => `<button class="chip ${G.ui.marketCountry === m.id ? 'on' : ''}" data-act="market-country" data-v="${m.id}">${esc(m.country)} — ${esc(m.league)}</button>`).join('')}</div>` : ''}
  <label class="field"><span class="muted">Поиск: имя и фамилия, страна, клуб</span>
    <input type="search" id="mk-search" data-sync="marketSearch" placeholder="имя и фамилия игрока" value="${esc(G.ui.marketSearch || '')}"></label>
  <div class="chips">${[['all', 'Все'], ['tech', 'Техничный'], ['strong', 'Сильный'], ['fast', 'Быстрый'], ['shot', 'Удар'], ['pass', 'Пас'], ['tackle', 'Отбор']].map(([k, n]) =>
    `<button class="chip ${G.ui.marketFeat === k ? 'on' : ''}" data-act="market-feat" data-v="${k}">${n}</button>`).join('')}</div>
  <div class="chips">${[['all', 'Амплуа: все'], ['gk', 'ВРТ'], ['def', 'Защита'], ['mid', 'Полузащита'], ['fwd', 'Атака']].map(([k, n]) =>
    `<button class="chip ${G.ui.marketPos === k ? 'on' : ''}" data-act="market-pos" data-v="${k}">${n}</button>`).join('')}</div>
  <div class="chips">${[['all', 'Возраст: любой'], ['u21', 'до 21'], ['u25', 'до 25'], ['a27_30', '27–30'], ['a30_35', '30–35'], ['o35', '35+']].map(([k, n]) =>
    `<button class="chip ${(G.ui.marketAge || 'all') === k ? 'on' : ''}" data-act="market-age" data-v="${k}">${n}</button>`).join('')}</div>
  <div class="chips sort-chips">${[['ovr', 'По рейтингу'], ['pot', 'По потенциалу'], ['value', 'По цене'], ['age', 'По возрасту']].map(([k, n]) =>
    `<span class="sort-cell"><button class="chip ${(G.ui.marketSort || 'ovr') === k ? 'on' : ''}" data-act="market-sort" data-v="${k}">${n}</button>${(G.ui.marketSort || 'ovr') === k ? `<button class="tri-btn" data-act="market-sort-dir" title="${(G.ui.marketSortDir === 'asc') ? 'По возрастанию — сначала низкие значения' : 'По убыванию — сначала высокие значения'}">${G.ui.marketSortDir === 'asc' ? '▼' : '▲'}</button>` : ''}</span>`).join('')}</div>
  <label class="field"><span class="muted">Живой рейтинг не ниже: ${G.ui.marketFloor}</span>
    <input type="range" data-act="market-floor" data-sync="marketFloor" min="50" max="95" value="${G.ui.marketFloor}"></label>
  <div class="card rowlist" id="market-list" style="padding:6px 10px">${marketRows() || '<div class="note">По этим фильтрам игроков нет. Выберите другую страну или снизьте минимальный рейтинг.</div>'}</div>
  <div class="note">Старая эпоха — легенды 2000-х/2010-х, которые всё ещё в строю (по открытым данным Transfermarkt и рейтингов FC 27). Свободные агенты — без клуба. В разделе «Страны и лиги» показаны все игроки выбранной страны или лиги с рейтингом 65+. Треугольник у сортировки: ▲ — сначала высокие значения (цена, возраст, рейтинг), ▼ — сначала низкие. Цены и цифры рейтинга «дышат»: форма, травмы и статистика двигают их во время сезона и после него.</div>`;
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
  const filter = G.ui.inboxFilter || 'all';
  const unread = G.S.inbox.filter(m => !m.read).length;
  const important = G.S.inbox.filter(m => m.important).length;
  const visible = G.S.inbox.filter(m => filter === 'all' || filter === 'unread' && !m.read || filter === 'important' && m.important);
  const kindName = { injury: 'Медицина', job: 'Карьера', board: 'Совет', assistant: 'Помощник' };
  const msgs = visible.map(m => {
    const p = m.playerId ? S_player(m.playerId) : null;
    return `<div class="card message-card${m.important ? ' important' : ''}${G.ui.focusedMessage === m.id ? ' focused' : ''}" id="message-${esc(m.id)}">
      <button class="row" style="cursor:pointer" data-act="msg-open" data-id="${esc(m.id)}">
        <div class="grow"><b>${m.read ? '' : '<span class="unread-dot">●</span> '}<span class="kicker" style="display:inline;margin-right:8px">${esc(m.from)}</span>${esc(m.subject)}</b>
        <div class="sub muted">${ENG.fmtDDMM(m.date)}${m.kind ? ' · ' + esc(kindName[m.kind] || 'Письмо') : ''}</div></div>
        ${m.important ? '<span class="tag important-tag">Важное</span>' : ''}<span class="muted">${G.ui.inboxOpen[m.id] ? '▴' : '▾'}</span></button>
      ${G.ui.inboxOpen[m.id] ? `<div class="message-body">${esc(m.body)}</div>${p ? `<div class="btnrow"><button class="btn ghost small" data-act="msg-player" data-id="${esc(p.id)}">${injuryTag(p)} Открыть карточку игрока</button></div>` : ''}` : ''}
    </div>`;
  }).join('');
  return `<div class="kicker">Связь с клубом</div><h1>Почта</h1>
    <div class="chips">${[['all', 'Все', G.S.inbox.length], ['important', 'Важные', important], ['unread', 'Непрочитанные', unread]].map(([k, n, count]) =>
      `<button class="chip ${filter === k ? 'on' : ''}" data-act="inbox-filter" data-v="${k}">${n} · ${count}</button>`).join('')}</div>
    ${offers}${msgs || '<div class="note">Писем нет.</div>'}`;
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
const CAL_MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const CAL_WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
function calendarCompetition(f) {
  if (f.comp === 'league') {
    const lg = GD.LEAGUES[f.league];
    return { kind: 'league', short: lg ? lg.short : 'Лига', name: (lg ? lg.name : 'Лига') + (f.round ? ' · Тур ' + f.round : '') };
  }
  if (f.comp === 'cup') return { kind: 'cup', short: 'Кубок', name: 'FONBET Кубок России' + (f.label ? ' · ' + f.label : '') };
  if (['ucl', 'uel', 'uecl', 'uclq'].includes(f.comp)) {
    const kind = f.comp === 'uel' ? 'uel' : f.comp === 'uecl' ? 'uecl' : 'ucl';
    return { kind, short: kind === 'ucl' ? 'ЛЧ' : kind === 'uel' ? 'ЛЕ' : 'ЛК', name: euroTitle(f.comp) + (f.label ? ' · ' + f.label : '') };
  }
  return { kind: 'other', short: 'Матч', name: f.label || 'Товарищеский матч' };
}
function calendarIcon(f) {
  if (f.comp === 'cup') return trophySvg('cup', 18);
  if (f.comp === 'league') return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="m12 7 4 3-1.5 4.5h-5L8 10l4-3Zm0 0V3m4 7 4-2m-5.5 6.5 2.5 4m-7-4L7.5 19M8 10 4 8" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
  if (['ucl', 'uel', 'uecl', 'uclq'].includes(f.comp)) return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><ellipse cx="12" cy="12" rx="4" ry="9" stroke="currentColor" stroke-width="1.4"/><path d="M3 12h18M5 7h14M5 17h14" stroke="currentColor" stroke-width="1.3"/></svg>`;
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="m8 12 3 3 5-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function calendarHasResult(f) {
  return !!(f && f.played && Number.isFinite(f.hg) && Number.isFinite(f.ag));
}
function calendarOutcome(f) {
  if (!calendarHasResult(f)) return null;
  const home = f.home === G.S.clubId;
  const my = home ? f.hg : f.ag, opp = home ? f.ag : f.hg;
  return { code: my > opp ? 'W' : my < opp ? 'L' : 'D', cls: my > opp ? 'w' : my < opp ? 'l' : 'd', score: my + ':' + opp };
}
function calendarResultHtml(f) {
  const outcome = calendarOutcome(f);
  if (outcome) return `<span class="fifa-event-result fifa-wld ${outcome.cls}" title="Счёт ${outcome.score}">${outcome.code}</span>`;
  return '<span class="fifa-event-result fifa-event-pending" title="Матч ещё не сыгран">—</span>';
}
function scrCalendar() {
  const month = G.ui.calendarMonth || G.S.date.slice(0, 7);
  const selected = G.ui.calendarDate || G.S.date;
  const club = ENG.myClub(G.S);
  const fixtures = G.S.fixtures.filter(f => f.date && (f.home === G.S.clubId || f.away === G.S.clubId)).sort((a, b) => a.date.localeCompare(b.date));
  const byDate = new Map();
  fixtures.forEach(f => { if (!byDate.has(f.date)) byDate.set(f.date, []); byDate.get(f.date).push(f); });
  const monthFixtures = fixtures.filter(f => f.date.startsWith(month));
  const selectedFixtures = byDate.get(selected) || [];
  const first = ENG.toDate(month + '-01');
  const gridStart = new Date(first.getFullYear(), first.getMonth(), 1, 12);
  gridStart.setDate(gridStart.getDate() - (gridStart.getDay() + 6) % 7);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    const iso = ENG.toISO(d);
    const dayFx = byDate.get(iso) || [];
    const outside = d.getMonth() !== first.getMonth();
    const dayLabel = ENG.fmtDateFull(iso) + (dayFx.length ? '. ' + dayFx.map(f => {
      const comp = calendarCompetition(f);
      const opp = ENG.clubById(G.S, f.home === G.S.clubId ? f.away : f.home);
      return comp.name + ': ' + opp.name;
    }).join('; ') : '. Матчей нет');
    cells.push(`<button class="fifa-cal-day${outside ? ' outside' : ''}${iso === G.S.date ? ' today' : ''}${iso === selected ? ' selected' : ''}${iso < G.S.date ? ' past' : ''}${dayFx.length ? ' has-match' : ''}" data-act="calendar-date" data-v="${iso}" aria-label="${esc(dayLabel)}" title="${esc(dayLabel)}">
      <span class="fifa-cal-day-top"><span class="fifa-cal-day-num">${d.getDate()}</span>${iso === G.S.date ? '<span class="fifa-cal-today-label">Сегодня</span>' : ''}</span>
      <span class="fifa-cal-events">${dayFx.map(f => {
        const comp = calendarCompetition(f);
        const opp = ENG.clubById(G.S, f.home === G.S.clubId ? f.away : f.home);
        return `<span class="fifa-cal-event fifa-event-${comp.kind}"><span class="fifa-event-icon">${calendarIcon(f)}</span><span class="fifa-event-copy"><b>${esc(comp.short)}</b><span>${esc(opp.name)}</span></span>${calendarResultHtml(f)}</span>`;
      }).join('')}</span>
    </button>`);
  }
  const seasonEnd = ENG.seasonCutoff(G.S);
  const canSimulate = selected > G.S.date && selected <= seasonEnd;
  const detail = selectedFixtures.map(f => {
    const home = ENG.clubById(G.S, f.home), away = ENG.clubById(G.S, f.away);
    const myHome = f.home === G.S.clubId;
    const comp = calendarCompetition(f);
    const hasResult = calendarHasResult(f);
    const status = hasResult ? 'Сыгран' : f.date < G.S.date ? 'Не сыгран' : f.date === G.S.date ? 'Сегодня' : 'Запланирован';
    return `<article class="fifa-match-card fifa-event-${comp.kind}">
      <div class="fifa-match-meta"><span>${calendarIcon(f)} ${esc(comp.short)}</span><span>${status}${hasResult ? calendarResultHtml(f) : ''}</span></div>
      <div class="fifa-match-comp">${esc(comp.name)}</div>
      <div class="fifa-match-teams">
        <div class="fifa-match-team">${badge(home, true)}<b>${esc(home.name)}</b></div>
        <div class="fifa-match-score"><b>${hasResult ? f.hg + ':' + f.ag : 'VS'}</b><span>${myHome ? 'Дома' : 'В гостях'}</span></div>
        <div class="fifa-match-team">${badge(away, true)}<b>${esc(away.name)}</b></div>
      </div>
      <div class="fifa-match-place"><span>${myHome ? 'Домашний матч' : 'Выездной матч'}</span><span>${esc(home.stadium)}</span></div>
      ${f.played ? '' : `<button class="fifa-match-button" data-act="open-match" data-id="${f.id}">К матчу <span>→</span></button>`}
    </article>`;
  }).join('');
  const agenda = monthFixtures.map(f => {
    const opp = ENG.clubById(G.S, f.home === G.S.clubId ? f.away : f.home);
    const comp = calendarCompetition(f), myHome = f.home === G.S.clubId;
    return `<button class="fifa-agenda-item fifa-event-${comp.kind}" data-act="calendar-date" data-v="${f.date}">
      <span class="fifa-agenda-date">${ENG.fmtDDMM(f.date)}</span>
      <span class="fifa-agenda-icon">${calendarIcon(f)}</span>
      <span class="fifa-agenda-copy"><b>${esc(opp.name)}</b><span>${esc(comp.name)}</span></span>
      ${calendarHasResult(f) ? calendarResultHtml(f) : `<span class="fifa-agenda-result">${myHome ? 'Д →' : 'Г →'}</span>`}
    </button>`;
  }).join('');
  const legend = [['league', 'Лига', 'league'], ['cup', 'Кубок', 'cup'], ['ucl', 'Лига чемпионов', 'ucl'], ['uel', 'Лига Европы', 'uel'], ['uecl', 'Лига конференций', 'uecl'], ['other', 'Матч', 'other']]
    .filter(([kind]) => fixtures.some(f => calendarCompetition(f).kind === kind))
    .map(([kind, name, comp]) => `<span class="fifa-legend-item fifa-event-${kind}"><i>${calendarIcon({ comp })}</i>${name}</span>`).join('');
  return `
  <section class="fifa-calendar" aria-label="Календарь матчей">
    <div class="fifa-calendar-heading">
      <div class="fifa-breadcrumb"><span>Карьера</span><i>/</i>Календарь</div>
      <div class="fifa-calendar-title-row">
        <div><div class="kicker">${esc(ENG.fmtDateFull(G.S.date))}</div><h1>Календарь</h1></div>
        <div class="fifa-calendar-club">${badge(club, true)}<div><b>${esc(club.name)}</b><span>Сезон ${G.S.season}/${G.S.season + 1}</span></div></div>
      </div>
    </div>
    <div class="fifa-calendar-toolbar">
      <div class="fifa-month-switcher">
        <button data-act="calendar-month" data-v="-1" aria-label="Предыдущий месяц">‹</button>
        <div><span>Расписание клуба</span><b>${CAL_MONTHS[first.getMonth()]} ${first.getFullYear()}</b></div>
        <button data-act="calendar-month" data-v="1" aria-label="Следующий месяц">›</button>
      </div>
      <div class="fifa-calendar-actions"><button data-act="calendar-today">Текущий день</button><button data-act="next-day">+ день</button></div>
    </div>
    <div class="fifa-calendar-layout">
      <div class="fifa-calendar-main">
        <div class="fifa-calendar-legend">${legend}<span class="fifa-result-key"><i class="w">W</i> победа <i class="d">D</i> ничья <i class="l">L</i> поражение</span><span class="fifa-today-key">Сегодня</span></div>
        <div class="fifa-calendar-shell">
          <div class="fifa-calendar-weekdays">${CAL_WEEKDAYS.map(d => `<span>${d}</span>`).join('')}</div>
          <div class="fifa-calendar-grid">${cells.join('')}</div>
        </div>
      </div>
      <aside class="fifa-calendar-sidebar">
        <div class="fifa-sidebar-heading"><span>Выбранный день</span><b>${ENG.fmtDateFull(selected)}</b></div>
        <div class="fifa-selected-matches">${selectedFixtures.length ? detail : '<div class="fifa-empty">В этот день матчей нет.<span>Выберите дату с отметкой матча.</span></div>'}</div>
        ${canSimulate ? `<div class="fifa-sim-box"><button data-act="calendar-simulate">Досимитировать до ${ENG.fmtDate(selected)}</button><p>Пропущенные матчи сыграет помощник. Тренировки, финансы и состояние игроков тоже продвинутся.</p></div>` : selected > seasonEnd ? '<div class="fifa-empty">Симуляция текущего сезона заканчивается 1 июня. После этого игра вернётся в главное меню.</div>' : ''}
        <div class="fifa-sidebar-heading fifa-agenda-heading"><span>Расписание</span><b>${CAL_MONTHS[first.getMonth()]}</b></div>
        <div class="fifa-agenda-list">${agenda || '<div class="fifa-empty">В этом месяце матчей нет.</div>'}</div>
      </aside>
    </div>
    <div class="fifa-calendar-note">Зимняя пауза: 7 декабря — 1 марта. Максимальная дата симуляции — 1 июня. В этот день игра вернётся в главное меню, где можно завершить итоги сезона.</div>
  </section>`;
}
const EURO_COMP_META = [
  { id: 'ucl', short: 'УЛС', label: 'Лига чемпионов', tickets: ['ucl', 'uclq'] },
  { id: 'uel', short: 'ЛЕ', label: 'Лига Европы', tickets: ['uel'] },
  { id: 'uecl', short: 'ЛК', label: 'Лига конференций', tickets: ['uecl'] },
];
function euroTicketLabel(ticket) {
  return { ucl: 'Лига чемпионов', uclq: 'Отбор ЛЧ', uel: 'Лига Европы', uecl: 'Лига конференций' }[ticket] || 'Без турнира';
}
function euroTicketShort(ticket) { return { ucl: 'ЛЧ', uclq: 'Отбор', uel: 'ЛЕ', uecl: 'ЛК' }[ticket] || '—'; }
function euroTeamsIn(roster, comp) {
  if (comp === 'all') return roster;
  const meta = EURO_COMP_META.find(c => c.id === comp);
  return meta ? roster.filter(t => meta.tickets.includes(t.ticket)) : [];
}
function euroOverviewHtml(roster, action) {
  return `<div class="euro-overview">${EURO_COMP_META.map(meta => {
    const teams = euroTeamsIn(roster, meta.id);
    const avg = teams.length ? (teams.reduce((a, t) => a + t.coef, 0) / teams.length).toFixed(1) : '—';
    const leader = teams[0];
    return `<${action === 'euro-view' ? 'button' : 'div'} class="euro-comp-card euro-comp-${meta.id}"${action === 'euro-view' ? ` data-act="${action}" data-v="${meta.id}"` : ''}>
      <span class="euro-comp-trophy">${trophySvg(meta.id, 34)}</span>
      <span class="euro-comp-copy"><span>${meta.short}</span><b>${meta.label}</b><small>${teams.length} команд · средний ${avg}</small>${leader ? `<em>Лидер: ${esc(leader.name)}</em>` : ''}</span>
      ${action === 'euro-view' ? '<span class="euro-comp-arrow">→</span>' : ''}
    </${action === 'euro-view' ? 'button' : 'div'}>`;
  }).join('')}</div>`;
}
function euroHistoryHtml(t, season) {
  const firstYear = season - 5;
  return `<div class="euro-history" aria-label="Рейтинг за пять сезонов">${t.history.map((v, i) => {
    const year = firstYear + i;
    return `<span class="euro-history-cell" title="${year}/${String(year + 1).slice(-2)}: ${v}"><b>${v}</b><i style="height:${v}%"></i></span>`;
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
  const roster = ENG.euroRoster(G.S, G.S.season);
  const myProfile = roster.find(t => t.id === G.S.clubId);
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
  <div class="card"><h3>Еврокубки · все участники</h3>
    <div class="muted small">Три турнира, ${roster.length} клубов и пятилетний рейтинг. Нажмите на турнир, чтобы открыть полный список.</div>
    ${euroOverviewHtml(roster, 'euro-view')}</div>
  <div class="card"><h3>Еврокубки · ваш путь</h3>
    <div class="muted small">${e.comp ? `${euroTitle(e.comp)} · ${euroStageName(e.stage)} · очки ${e.pts}` : 'Билеты распределяются по итогам чемпионатов: УЛС, отбор ЛЧ, ЛЕ и ЛК.'}${myProfile ? ` · ваш коэффициент ${myProfile.coef} · ${myProfile.level.name}` : ''}</div>
    <div class="chips">${['Квалификация', 'Общий этап', '1/8', '1/4', '1/2', 'Финал'].map(s =>
      `<span class="chip ${(euroStageName(e.stage) || '').startsWith(s) ? 'on' : ''}">${s}</span>`).join('')}</div>
    ${fxList(myEuroFx)}</div>`;
}
function scrCups() {
  return `<div class="kicker">Сетка и группы</div><h1>Кубки</h1>${cupHtml()}`;
}
function scrEuro() {
  const season = G.S.season;
  const roster = ENG.euroRoster(G.S, season);
  const comp = G.ui.euroComp || 'all';
  const level = G.ui.euroLevel || 'all';
  const levels = [...new Map(roster.map(t => [t.level.id, t.level])).values()];
  const rows = euroTeamsIn(roster, comp).filter(t => level === 'all' || t.level.id === level);
  const compLabel = comp === 'all' ? 'Все команды' : (EURO_COMP_META.find(c => c.id === comp) || {}).label;
  return `<section class="euro-hub">
    <div class="euro-hub-heading">
      <div class="euro-breadcrumb"><span>КАРЬЕРА</span><i>/</i>ЕВРОКУБКИ</div>
      <div class="euro-title-row"><div><div class="kicker">Сезон ${season}/${season + 1}</div><h1>Еврокубки</h1></div><div class="euro-season-mark"><b>5</b><span>сезонов<br>в рейтинге</span></div></div>
      <p>Участники Лиги чемпионов, Лиги Европы и Лиги конференций. Коэффициент — средний клубный рейтинг за ${season - 5}/${String(season - 4).slice(-2)}–${season - 1}/${String(season).slice(-2)}.</p>
    </div>
    ${euroOverviewHtml(roster, 'euro-comp')}
    <div class="euro-filters">
      <div class="chips">${[['all', 'Все'], ...EURO_COMP_META.map(c => [c.id, c.label])].map(([id, name]) =>
        `<button class="chip ${comp === id ? 'on' : ''}" data-act="euro-comp" data-v="${id}">${name}</button>`).join('')}</div>
      <div class="chips euro-level-chips">${[['all', 'Все уровни'], ...levels.map(l => [l.id, l.short])].map(([id, name]) =>
        `<button class="chip ${level === id ? 'on' : ''}" data-act="euro-level" data-v="${id}">${name}</button>`).join('')}</div>
    </div>
    <div class="euro-table" aria-label="${esc(compLabel)}">
      <div class="euro-table-head"><span>#</span><span>Клуб</span><span>5 сезонов</span><span>Средний</span><span>Уровень</span><span>Турнир</span></div>
      ${rows.length ? rows.map(t => `<div class="euro-row${t.id === G.S.clubId ? ' me' : ''}">
        <span class="euro-rank">${String(t.rank).padStart(2, '0')}</span>
        <span class="euro-club">${badge(t)}<span><b>${esc(t.name)}${t.id === G.S.clubId ? ' <em>вы</em>' : ''}</b><small>${esc(t.country)} · ${euroTicketLabel(t.ticket)}</small></span></span>
        ${euroHistoryHtml(t, season)}
        <span class="euro-coef"><b>${t.coef.toFixed(1)}</b><small>коэф.</small></span>
        <span class="euro-level level-${t.level.id}">${esc(t.level.short)}</span>
        <span class="euro-ticket ticket-${t.ticket}">${euroTicketShort(t.ticket)}</span>
      </div>`).join('') : '<div class="euro-empty">В этом фильтре нет команд.</div>'}
    </div>
    <div class="euro-table-footer"><span>${esc(compLabel)} · ${rows.length}</span><span>Элита 85+ · сильный 75+ · евроклуб 65+</span></div>
    <div class="euro-method"><b>Как считается уровень</b><span>Пять сезонных значений складываются и делятся на пять. Это внутренний модельный рейтинг игры, а не официальный коэффициент УЕФА. Турнир сезона показан отдельно: он зависит от места в чемпионате и пути квалификации.</span></div>
  </section>`;
}
function euroTitle(c) { return c === 'ucl' ? 'Лига чемпионов' : c === 'uel' ? 'Лига Европы' : c === 'uecl' ? 'Лига конференций' : 'Квалификация ЛЧ'; }
function euroStageName(st) {
  return { qual: 'Квалификация', league: 'Общий этап', r16: '1/8', qf: '1/4', sf: '1/2', final: 'Финал', champion: 'Победитель', done: '' }[st] || '';
}
function scrSacked() {
  const S = G.S;
  const lastClub = ENG.clubById(S, S.lastClubId || S.clubId);
  const offerIds = [...new Set((S.vacancies || []).concat((S.jobOffers || []).map(o => o.clubId)))];
  const applications = S.applications || [];
  const reason = { confidence: 'Совет директоров потерял доверие к вашей работе.', form: 'Серия плохих результатов стала причиной отставки.', objectives: 'Задачи сезона не выполнены, контракт расторгнут.', resigned: 'Вы расторгли контракт по собственному желанию.' }[S.sackReason] || 'Вы больше не работаете в клубе.';
  const leagues = ['rpl', 'fnl', 'fnl2', 'fnl3', 'media', 'amateur'].concat(GD.FOREIGN_LEAGUES);
  const league = G.ui.careerLeague || 'all';
  const search = (G.ui.careerSearch || '').trim().toLowerCase();
  const clubs = S.clubs.filter(c => c.league !== 'euro')
    .filter(c => league === 'all' || (league === 'foreign' ? GD.FOREIGN_LEAGUES.includes(c.league) : c.league === league))
    .filter(c => !search || (c.name + ' ' + c.city + ' ' + (GD.LEAGUES[c.league] || {}).name).toLowerCase().includes(search))
    .sort((a, b) => b.rep - a.rep || a.name.localeCompare(b.name, 'ru'));
  const clubRow = c => {
    const pending = applications.some(a => a.clubId === c.id && a.status === 'pending');
    const offered = offerIds.includes(c.id);
    const response = applications.find(a => a.clubId === c.id && a.status === 'pending');
    return `<div class="row career-club-row">${badge(c)}<div class="grow"><b>${esc(c.name)}</b>
      <div class="sub muted">${esc((GD.LEAGUES[c.league] || {}).short || c.league)} · репутация ${c.rep} · ${ENG.F(c.budget)}</div>
      ${response ? `<div class="sub muted">Заявка подана · ответ ${ENG.fmtDate(response.responseDate)}</div>` : ''}</div>
      ${offered ? '<span class="tag">Есть предложение</span>' : pending ? '<span class="tag">Ожидание</span>' :
        `<button class="btn small ghost" data-act="career-apply" data-id="${c.id}">Подать заявление</button>`}</div>`;
  };
  return `<section class="career-hub">
    <div class="career-kicker">FREE AGENT · ${esc(S.manager)}</div>
    <h1>${S.sackReason === 'resigned' ? 'Вы свободны' : 'Вас уволили'}</h1>
    <p class="career-reason">${esc(reason)}</p>
    <div class="career-status">
      <div><span>Последний клуб</span><b>${lastClub ? esc(lastClub.name) : '—'}</b></div>
      <div><span>Репутация</span><b>${S.managerRep || 55}</b><small>влияет на отклики</small></div>
      <div><span>Доверие</span><b>${S.confidence}</b><small>последний контракт</small></div>
      <div><span>Свободен с</span><b>${S.unemployedSince ? ENG.fmtDate(S.unemployedSince) : '—'}</b></div>
    </div>
    <div class="career-actions"><button class="btn" data-act="career-wait">Ждать 7 дней</button>
      <a class="btn ghost" href="#vacancies">Предложения</a><a class="btn ghost" href="#applications">Все клубы</a></div>
    <div class="career-section" id="vacancies"><div class="career-section-head"><span>01</span><div><b>Предложения работы</b><small>Можно принять сразу или продолжить поиск.</small></div></div>
      ${offerIds.length ? `<div class="card rowlist" style="padding:6px 10px">${offerIds.map(id => {
        const c = ENG.clubById(S, id);
        return c ? `<div class="row">${badge(c)}<div class="grow"><b>${esc(c.name)}</b><div class="sub muted">${esc((GD.LEAGUES[c.league] || {}).short || c.league)} · ${ENG.F(c.budget)}</div></div>
          <button class="btn small" data-act="take-job" data-id="${c.id}">Принять</button></div>` : '';
      }).join('')}</div>` : '<div class="note">Пока нет предложений. Отправляйте заявки или ждите — агент будет присылать новости.</div>'}
    </div>
    <div class="career-section" id="applications"><div class="career-section-head"><span>02</span><div><b>Поиск работы</b><small>Заявление в любой клуб. Ответ приходит через 3–7 дней.</small></div></div>
      <label class="field"><span class="muted">Лига</span><select id="career-league" data-sync="careerLeague">
        <option value="all" ${league === 'all' ? 'selected' : ''}>Все лиги</option><option value="foreign" ${league === 'foreign' ? 'selected' : ''}>Все зарубежные</option>
        ${leagues.map(l => `<option value="${l}" ${league === l ? 'selected' : ''}>${esc((GD.LEAGUES[l] || {}).name || l)}</option>`).join('')}
      </select></label>
      <label class="field"><span class="muted">Поиск клуба или города</span><input type="search" id="career-search" data-sync="careerSearch" value="${esc(G.ui.careerSearch || '')}" placeholder="например, Зенит или Мадрид"></label>
      <div class="career-club-list">${clubs.map(clubRow).join('') || '<div class="note">По этим фильтрам клубов нет.</div>'}</div>
    </div>
    <div class="career-section"><div class="career-section-head"><span>03</span><div><b>Последние сообщения</b><small>Ответы клубов и новости агента.</small></div></div>
      <div class="card rowlist" style="padding:6px 10px">${(S.inbox || []).slice(0, 5).map(m => `<div class="row" style="cursor:default;display:block"><b>${esc(m.subject)}</b><div class="sub muted">${esc(m.from)} · ${ENG.fmtDDMM(m.date)}</div><div class="small" style="margin-top:5px">${esc(m.body)}</div></div>`).join('')}</div>
    </div>
    <div class="btnrow"><button class="btn danger" data-act="restart">Начать заново</button></div>
  </section>`;
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
  const snap = window.MatchView ? MatchView.snapshot() : null;
  const currentSpeed = snap ? snap.speed : 1;
  const isPaused = !!(snap && snap.paused);
  const atHalf = !!(snap && snap.halftime);
  const playAct = atHalf ? 'match-second-half' : isPaused ? 'match-resume' : 'match-pause';
  const playLabel = atHalf ? 'Второй тайм' : isPaused ? 'Продолжить' : 'Пауза';
  return `
  <section class="live-match-hub">
    <div class="live-match-brand"><span>MATCH DAY</span><b id="lv-play-state">×${currentSpeed}</b></div>
    <div class="match-head live-scoreboard"><span id="lv-hs" class="grow small muted" style="text-align:right"></span>
      <div class="score" id="lv-score">0:0</div><span id="lv-as" class="grow small muted"></span></div>
    <div class="muted small" style="text-align:center" id="lv-info">—</div>
    <canvas id="mpitch" class="pitch-canvas"></canvas>
    <div class="fm-line" id="lv-ticker">Разминка…</div>
    <div class="match-toolbar">
      <button class="btn small" data-act="${playAct}">${playLabel}</button>
      <div class="match-speed-controls" aria-label="Скорость матча"><span>Темп</span>${[.5, 1, 2, 4, 8].map(v => `<button class="${v === currentSpeed ? 'on' : ''}" data-act="match-speed" data-v="${v}">×${v}</button>`).join('')}</div>
      <button class="btn ghost small" data-act="match-menu-open">Меню</button>
      <button class="btn ghost small" data-act="landscape">Поле шире</button>
    </div>
    ${isPaused && !G.sheet ? `<div class="match-pause-banner"><b>${atHalf ? 'Перерыв' : 'Матч на паузе'}</b><button class="btn small" data-act="${playAct}">${playLabel}</button></div>` : ''}
    <div class="note">В меню матча можно менять тактику и состав без выхода на главный экран. Перетащите запасного на игрока основы или поменяйте двух игроков местами. Жёлтый — небольшая смена позиции, красный — серьёзная.</div>
  </section>`;
}
function scrMatchEnd() {
  const { fx, r, live } = G.ui.lastResult || {};
  if (!fx) { go('desk'); return ''; }
  const myHome = fx.home === G.S.clubId;
  const my = myHome ? r.hg : r.ag, opp = myHome ? r.ag : r.hg;
  const verdict = my > opp ? 'Победа' : my === opp ? 'Ничья' : 'Поражение';
  const ratings = ENG.playersOf(G.S, G.S.clubId).filter(p => p.apps && p.ratingSum).sort((a, b) => (b.ratingSum / b.apps) - (a.ratingSum / a.apps)).slice(0, 5)
    .map(p => `<div class="row" style="cursor:default">${posTag(p)}<div class="grow">${esc(pname(p))}${injuryTag(p)}</div><b>${(p.ratingSum / p.apps).toFixed(2)}</b></div>`).join('');
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
function matchSheetSpeed(snap) {
  const current = snap ? snap.speed : 1;
  return `<div class="match-speed-row"><span>Скорость симуляции</span><div>${[.5, 1, 2, 4, 8].map(v => `<button class="${v === current ? 'on' : ''}" data-act="match-speed" data-v="${v}">×${v}</button>`).join('')}</div></div>`;
}
function matchSheetTabs() {
  const tab = G.ui.matchTab || 'controls';
  return `<div class="match-sheet-tabs">${[['controls', 'Управление'], ['tactics', 'Тактика и состав'], ['subs', 'Замены']].map(([id, name]) =>
    `<button class="${tab === id ? 'on' : ''}" data-act="match-tab" data-v="${id}">${name}</button>`).join('')}</div>`;
}
function matchSheetControls(snap) {
  const playAct = snap && snap.halftime ? 'match-second-half' : snap && snap.paused ? 'match-resume' : 'match-pause';
  const playLabel = snap && snap.halftime ? 'Второй тайм' : snap && snap.paused ? 'Продолжить матч' : 'Пауза';
  return `<div class="match-control-grid">
    <button class="match-primary-control" data-act="${playAct}"><span>${snap && snap.halftime ? 'ПЕРЕРЫВ' : snap && snap.paused ? 'ПАУЗА' : 'МАТЧ ИДЁТ'}</span><b>${playLabel}</b></button>
    <div class="match-quick-actions"><button data-act="match-tab" data-v="tactics"><b>Тактика</b><span>Формация, стиль, состав</span></button>
      <button data-act="match-tab" data-v="subs"><b>Замены</b><span>${snap ? snap.subsUsed : 0} из 5 использовано</span></button></div>
  </div>
  ${matchSheetSpeed(snap)}
  <div class="match-stats-strip"><div><span>Счёт</span><b>${snap ? snap.hg + ':' + snap.ag : '0:0'}</b></div>
    <div><span>Минута</span><b>${snap ? snap.minute : 0}'</b></div>
    <div><span>xG</span><b>${snap ? snap.xgH.toFixed(2) + ':' + snap.xgA.toFixed(2) : '0.00:0.00'}</b></div></div>
  <div class="note">Меню не выходит из матча. Часы остановлены, пока вы меняете тактику или состав.</div>`;
}
function matchSheetTactics() {
  const tac = G.S.tactics;
  return `<div class="match-tactics-heading"><div><span>МАТЧ-ПЛАН</span><b>${esc(tacSummary(tac))}</b></div><button class="btn ghost small" data-act="tac-auto">Авто-состав</button></div>
  <div class="chips">${GD.FORM_LIST.map(f => `<button class="chip ${tac.formation === f ? 'on' : ''}" data-act="formation" data-v="${f}">${f}</button>`).join('')}</div>
  <div class="live-tactics-layout">
    <div class="pitch match-tactics-pitch" id="match-tac-pitch">${tacticsDots('match')}</div>
    <div class="match-live-bench"><div class="lineup-bench-head"><b>Запас</b><span>Перетащите на позицию</span></div><div class="lineup-bench-list">${lineupBenchRows(true)}</div></div>
  </div>
  <div class="chips">${GD.TACTICS.map(t => `<button class="chip ${tac.style === t.id ? 'on' : ''}" data-act="style" data-v="${t.id}">${t.name}</button>`).join('')}</div>
  <div class="match-slider-grid">${SLIDERS.map(s => {
    const value = s[0] === 'mentality' ? tac.mentality : tac[s[0]] ?? 2;
    const word = sliderWord(s[0], value);
    return `<label class="field"><span class="muted">${s[1]}: <b class="slider-word" data-slider-word="${s[0]}">${word}</b></span>
      <input type="range" data-act="slider" data-k="${s[0]}" min="${s[0] === 'mentality' ? -2 : 0}" max="${s[0] === 'mentality' ? 2 : 4}" value="${value}" aria-valuetext="${word}"></label>`;
  }).join('')}</div>
  <div class="note">Рейтинг на поле учитывает позицию: жёлтый — небольшая потеря, красный — серьёзная. Два игрока основы можно поменять местами перетаскиванием.</div>`;
}
function matchSheetSubs() {
  const tac = G.S.tactics;
  const starters = ENG.lineupPlayers(G.S, G.S.clubId, tac);
  const namedBench = ENG.benchOf(G.S).filter(p => ENG.available(p) && !starters.some(s => s.pid === p.id));
  const bench = (namedBench.length ? namedBench : ENG.playersOf(G.S, G.S.clubId).filter(p => ENG.available(p) && !starters.some(s => s.pid === p.id)))
    .slice().sort((a, b) => ENG.dynRating(b) - ENG.dynRating(a));
  const selOut = G.ui.menuOut;
  const outSlot = starters.find(s => s.pid === selOut);
  const rows = selOut
    ? (bench.length ? bench.map(p => `<button class="row" data-act="live-sub" data-out="${selOut}" data-inn="${p.id}">
        ${posTag(p)}<div class="grow"><b>${esc(pname(p))}</b><div class="sub muted">${GD.POS_FULL[p.pos]} · тонус ${p.cond}</div></div>${outSlot ? slotFitChip(p, outSlot.pos) : rateChip(p)}</button>`).join('')
      : '<div class="note">Запас пуст. Добавьте игроков через «Состав» до матча или используйте авто-состав.</div>')
    : starters.map(s => { const p = S_player(s.pid); return p ? `<button class="row" data-act="menu-pick-out" data-pid="${p.id}">
        ${posTag(p)}<div class="grow"><b>${esc(pname(p))}</b><div class="sub muted">${GD.POS_FULL[s.pos]} · тонус ${p.cond}</div></div>${slotFitChip(p, s.pos)}</button>` : ''; }).join('');
  return `<div class="match-subs-heading"><div><span>ЗАМЕНЫ</span><b>${G.ui.liveSubsUsed || 0} / 5</b></div>${selOut ? '<button class="btn ghost small" data-act="menu-cancel-sub">Отмена</button>' : ''}</div>
    ${selOut ? `<div class="note">Снять: <b>${esc(pname(S_player(selOut)))}</b> — выберите игрока из запаса.</div>` : '<div class="muted small">Сначала выберите игрока, которого хотите снять.</div>'}
    <div class="rowlist match-sub-list">${rows}</div>`;
}
function MENU_HTML() {
  const snap = window.MatchView ? MatchView.snapshot() : null;
  const tab = G.ui.matchTab || 'controls';
  const home = snap ? ENG.clubById(G.S, snap.home) : null;
  const away = snap ? ENG.clubById(G.S, snap.away) : null;
  const content = tab === 'tactics' ? matchSheetTactics() : tab === 'subs' ? matchSheetSubs() : matchSheetControls(snap);
  return `<div class="match-sheet-inner">
    <div class="match-sheet-top"><div class="match-sheet-brand"><span>MATCH DAY</span><b>${snap && snap.halftime ? 'HALF TIME' : snap && snap.paused ? 'PAUSED' : 'LIVE'}</b></div>
      <button class="x" data-act="close-sheet" aria-label="Закрыть меню">×</button></div>
    ${home && away ? `<div class="match-sheet-score">${badge(home)}<b>${esc(home.short)}</b><strong>${snap.hg}:${snap.ag}</strong><b>${esc(away.short)}</b>${badge(away)}</div>` : ''}
    ${matchSheetTabs()}
    <div class="match-sheet-content">${content}</div>
  </div>`;
}
window.MENU_HTML = MENU_HTML;

function importantMessageAlert() {
  if (!G.S) return '';
  const msg = (G.S.inbox || []).find(m => m.id === G.ui.importantAlert);
  if (!msg) return '';
  const player = msg.playerId ? S_player(msg.playerId) : null;
  return `<div class="important-alert" data-act="dismiss-important" role="dialog" aria-modal="true" aria-labelledby="important-title">
    <div class="important-card important-${esc(msg.kind || 'message')}" data-act="sheet-only">
      <div class="important-kicker">${msg.kind === 'injury' ? '✚ Медицинский штаб' : msg.kind === 'job' ? 'Тренерская карьера' : 'Важное сообщение'} · ${ENG.fmtDDMM(msg.date)}</div>
      <h2 id="important-title">${esc(msg.subject)}</h2>
      <div class="important-from">${esc(msg.from)}</div>
      <p>${esc(msg.body)}</p>
      ${player ? `<div class="important-player">${injuryTag(player)}<b>${esc(pname(player))}</b><span>${GD.POS_ABBR[player.pos]} · ${player.age} лет</span></div>` : ''}
      <div class="btnrow"><button class="btn" data-act="important-open">Открыть почту</button><button class="btn ghost" data-act="dismiss-important">Закрыть</button></div>
    </div></div>`;
}

// ---------- render ----------
const SCREENS = {
  boot: scrBoot, honors: scrHonors, slots: scrSlots, settings: scrSettings, pick: scrPick, kits: scrKits, desk: scrDesk, squad: scrSquad,
  player: () => { const p = S_player(G.ui.viewingPlayer); return p ? (p.youth ? youthPlayerCard(p) : playerCard(p)) : '<div class="note">Игрок не найден.</div>'; },
  tactics: scrTactics, academy: scrAcademy, objectives: scrObjectives, league: scrLeague, market: scrMarket, inbox: scrInbox, money: scrMoney,
  calendar: scrCalendar, cups: scrCups, euro: scrEuro, sacked: scrSacked,
  'match-pre': scrMatchPre, 'match-live': scrMatchLive, 'match-end': scrMatchEnd,
};
const NAV = [['desk', 'Кабинет'], ['squad', 'Состав'], ['tactics', 'Тактика'], ['academy', 'Академия'], ['league', 'Лига'], ['market', 'Рынок'], ['other', 'Прочее']];
function sheetOther() {
  return `
  <h2>Прочее<button class="x" data-act="close-sheet">×</button></h2>
  <div class="rowlist">
    <button class="row" data-act="nav" data-v="inbox"><div class="grow">Почта</div><span class="muted">→</span></button>
    <button class="row" data-act="nav" data-v="money"><div class="grow">Финансы</div><span class="muted">→</span></button>
    <button class="row" data-act="nav" data-v="calendar"><div class="grow">Календарь</div><span class="muted">→</span></button>
    <button class="row" data-act="nav" data-v="cups"><div class="grow">Кубок России</div><span class="muted">→</span></button>
    <button class="row" data-act="nav" data-v="euro"><div class="grow">Еврокубки и рейтинг</div><span class="muted">→</span></button>
    <button class="row" data-act="nav" data-v="academy"><div class="grow">Молодёжная академия</div><span class="muted">→</span></button>
    <button class="row" data-act="nav" data-v="objectives"><div class="grow">Задачи сезона</div><span class="muted">→</span></button>
    <button class="row" data-act="honors"><div class="grow">Заслуги</div><span class="muted">→</span></button>
    <button class="row" data-act="manual-save"><div class="grow">Сохранить вручную</div></button>
  </div>
  <h3 style="margin-top:14px">Сложность ботов на все матчи и сезоны</h3>
  <div class="chips">${Object.keys(ENG.DIFFS).map(d => `<button class="chip ${G.S.difficulty === d ? 'on' : ''}" data-act="difficulty" data-v="${d}">${{ novice: 'Новичок', experienced: 'Опытный', pro: 'Профессионал', world: 'Мировой класс' }[d]}</button>`).join('')}</div>
  <div class="muted small">${esc((ENG.DIFFS[G.S.difficulty] || {}).desc || '')}</div>
  <h3 style="margin-top:14px">Время матча, оба тайма</h3>
  <div class="chips">${[2, 3, 5].map(m => `<button class="chip ${G.S.matchMins === m ? 'on' : ''}" data-act="matchmins" data-v="${m}">${m} мин</button>`).join('')}</div>
  <div class="btnrow" style="margin-top:16px"><button class="btn danger" data-act="resign">Расторгнуть контракт и уйти</button>
    <button class="btn danger" data-act="delete-career">Удалить карьеру</button></div>`;
}
function render() {
  if (window.MatchView && window.MatchView.active && G.screen !== 'match-live') window.MatchView.stop();
  const app = document.getElementById('app');
  let html = '';
  const preScreens = ['boot', 'honors', 'slots', 'settings', 'pick', 'kits', 'sacked'];
  if (preScreens.includes(G.screen)) {
    html = (SCREENS[G.screen] || scrBoot)();
  } else if (!G.S || G.S.sacked && G.screen !== 'sacked') {
    G.screen = 'boot'; html = scrBoot();
  } else {
    html = (SCREENS[G.screen] || scrDesk)();
  }
  const inCareer = G.S && !preScreens.includes(G.screen);
  const nav = inCareer && G.screen !== 'match-live' ? `<nav class="tabs">${NAV.map(([v, n]) =>
    `<button class="${G.screen === v ? 'on' : ''}" data-act="nav" data-v="${v}">${n}</button>`).join('')}</nav>` : '';
  const sheet = G.sheet ? `<div class="sheet-wrap${G.sheet.kind === 'match' ? ' match-sheet-wrap' : ''}" data-act="close-sheet"><div class="sheet${G.sheet.kind === 'match' ? ' match-sheet' : ''}">${G.sheet.html}</div></div>`
    : (G.screen === 'other' && G.S ? `<div class="sheet-wrap"><div class="sheet">${sheetOther()}</div></div>` : '');
  const closing = G.ui.seasonClosing ? `<div class="season-loading" role="status" aria-live="polite"><div class="season-loading-card"><div class="season-spinner"></div><div class="kicker">Завершение сезона</div><h2>${esc(G.ui.closeProgress || 'Подводим итоги…')}</h2><p class="muted small">Таблицы, история клубов, контракты и новое расписание.</p></div></div>` : '';
  app.innerHTML = html + trophyOverlay() + importantMessageAlert() + closing;
  document.body.dataset.screen = G.screen;
  document.querySelectorAll('nav.tabs').forEach(n => n.remove());
  if (nav) document.body.insertAdjacentHTML('beforeend', nav);
  document.querySelectorAll('.sheet-wrap').forEach(n => n.remove());
  if (sheet && G.screen !== 'other') document.body.insertAdjacentHTML('beforeend', sheet);
  else if (G.screen === 'other') document.body.insertAdjacentHTML('beforeend', sheetOtherSheet());
  if (G.screen === 'match-live' && window.MatchView) window.MatchView.start();
  if (G.screen === 'match-end') { G.ui.lastResult.played = true; }
  document.querySelectorAll('.back-top').forEach(n => n.remove());
  const showBack = inCareer && ['squad', 'tactics', 'academy', 'objectives', 'league', 'market', 'other', 'player', 'calendar', 'cups', 'euro', 'inbox', 'money'].includes(G.screen);
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

// ---------- lineup drag & drop ----------
let lineupDrag = null, lineupGhost = null, lineupDropTarget = null, suppressLineupClickUntil = 0;
function clearLineupDragVisual() {
  if (lineupGhost) lineupGhost.remove();
  if (lineupDropTarget) lineupDropTarget.classList.remove('drop-target');
  document.querySelectorAll('.lineup-drag-source').forEach(el => el.classList.remove('lineup-drag-source'));
  document.body.classList.remove('lineup-dragging');
  lineupGhost = null;
  lineupDropTarget = null;
}
function beginLineupDrag(e) {
  if (!G.S || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const tile = e.target.closest('[data-drag-pid]');
  if (!tile) return;
  lineupDrag = {
    pid: tile.dataset.dragPid,
    kind: tile.dataset.dragKind,
    slot: tile.dataset.dragSlot === undefined ? -1 : +tile.dataset.dragSlot,
    pointerId: e.pointerId,
    startX: e.clientX, startY: e.clientY,
    moved: false, source: tile,
  };
  if (tile.setPointerCapture) {
    try { tile.setPointerCapture(e.pointerId); } catch (_) {}
  }
}
function moveLineupDrag(e) {
  if (!lineupDrag || e.pointerId !== lineupDrag.pointerId) return;
  const distance = Math.hypot(e.clientX - lineupDrag.startX, e.clientY - lineupDrag.startY);
  if (!lineupDrag.moved && distance < 7) return;
  e.preventDefault();
  if (!lineupDrag.moved) {
    lineupDrag.moved = true;
    const p = S_player(lineupDrag.pid);
    lineupGhost = document.createElement('div');
    lineupGhost.className = 'lineup-drag-ghost';
    lineupGhost.textContent = p ? p.first + ' ' + p.last + ' · ' + p.pos : 'Игрок';
    document.body.appendChild(lineupGhost);
    lineupDrag.source.classList.add('lineup-drag-source');
    document.body.classList.add('lineup-dragging');
    if (inLiveMatch()) MatchView.pauseForMenu();
  }
  lineupGhost.style.transform = `translate3d(${e.clientX + 12}px, ${e.clientY + 12}px, 0)`;
  const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-drop-slot]') || null;
  if (target !== lineupDropTarget) {
    if (lineupDropTarget) lineupDropTarget.classList.remove('drop-target');
    lineupDropTarget = target;
    if (lineupDropTarget) lineupDropTarget.classList.add('drop-target');
  }
}
function dropLineupPlayer(drag, target) {
  if (!drag || !target) return;
  const targetSlot = +target.dataset.dropSlot;
  if (!Number.isInteger(targetSlot) || targetSlot < 0 || targetSlot > 10) return;
  const tac = G.S.tactics;
  const plan = ENG.lineupPlayers(G.S, G.S.clubId, tac);
  const targetPlayer = plan.find(s => s.slot === targetSlot);
  if (!targetPlayer || targetPlayer.pid === drag.pid) return;
  if (inLiveMatch()) {
    if (drag.kind === 'starter') {
      const source = plan.find(s => s.slot === drag.slot);
      if (!source) return;
      const slots = tac.slots.slice();
      slots[source.slot] = targetPlayer.pid;
      slots[targetSlot] = drag.pid;
      tac.slots = slots;
      toast('Игроки поменялись позициями.');
    } else {
      if (!MatchView.doUserSub(targetPlayer.pid, drag.pid)) return;
      toast('Замена выполнена перетаскиванием.');
    }
  } else {
    const slots = tac.slots.slice();
    if (drag.kind === 'starter') {
      const source = plan.find(s => s.slot === drag.slot);
      if (!source) return;
      slots[source.slot] = targetPlayer.pid;
      slots[targetSlot] = drag.pid;
      toast('Игроки поменялись позициями.');
    } else {
      slots[targetSlot] = drag.pid;
      toast('Игрок назначен на позицию.');
    }
  }
  G.ui.selectedSlot = -1;
  G.ui.menuOut = null;
  refreshAfterTacticsChange();
}
function endLineupDrag(e) {
  if (!lineupDrag || e.pointerId !== lineupDrag.pointerId) return;
  if (lineupDrag.moved) {
    e.preventDefault();
    suppressLineupClickUntil = Date.now() + 350;
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-drop-slot]') || lineupDropTarget;
    dropLineupPlayer(lineupDrag, target);
  }
  lineupDrag = null;
  clearLineupDragVisual();
}
function cancelLineupDrag(e) {
  if (!lineupDrag || e.pointerId !== lineupDrag.pointerId) return;
  lineupDrag = null;
  clearLineupDragVisual();
}

// ---------- global event wiring ----------
function initEvents() {
  document.body.addEventListener('pointerdown', beginLineupDrag, { passive: true });
  document.body.addEventListener('pointermove', moveLineupDrag, { passive: false });
  document.body.addEventListener('pointerup', endLineupDrag, { passive: false });
  document.body.addEventListener('pointercancel', cancelLineupDrag, { passive: true });
  document.body.addEventListener('click', e => {
    if (Date.now() < suppressLineupClickUntil) { e.preventDefault(); e.stopPropagation(); return; }
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
    if (e.target.id === 'mk-search' || e.target.id === 'career-search' || e.target.id === 'career-league') render();
  });
}

return { esc, badge, ovrCls, posTag, pname, injuryTag, myNextFixture, avgCond, trophySvg,
  shirtSvg, shortsSvg, socksSvg, KIT_PATTERNS, kitDefaults, kitDraft, kitRepaint, kitGkAuto, kitColorName, colorDist,
  scrBoot, scrHonors, scrSlots, scrSettings, scrPick, scrKits, scrDesk, scrSquad, playerCard, squadRows,
  scrAcademy, youthPlayerCard, scrObjectives, objectiveBoardHtml,
  scrTactics, scrLeague, scrMarket, scrInbox, scrMoney, scrCalendar, scrCups, scrEuro, scrSacked,
  scrMatchPre, scrMatchLive, scrMatchEnd, render, initEvents, updateTacSummary, updateTacticSlider, renderMarketList,
  slotFit, slotFitChip, tacticsDots, lineupBenchRows, MENU_HTML, benchSheetHtml, euroTitle, euroStageName, tableHtml, tacSummary };
})();
window.UI = UI;
window.render = UI.render;
window.updateTacSummary = UI.updateTacSummary;
window.renderMarketList = UI.renderMarketList;
