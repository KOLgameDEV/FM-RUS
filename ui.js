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
const KIT_DESIGNS = ['Сплошная', 'Вертикальные полосы', 'Горизонтальные полосы', 'Диагональ', 'Саше', 'Половина', 'Кольцо', 'Шеврон', 'Шахматка', 'Центральная полоса', 'Пояс', 'Центральный шов'];
function shirtSvg(design, c1, c2, size) {
  const w = size || 56, h = Math.round(w * 0.9);
  const body = `<rect x="10" y="10" width="${w - 20}" height="${h - 14}" rx="6" fill="${c1}"/>
    <path d="M10 10 L${w / 2 - 10} 2 L${w / 2 + 10} 2 L${w - 10} 10 Z" fill="${c1}"/>
    <rect x="2" y="10" width="9" height="22" rx="4" fill="${c2}"/><rect x="${w - 11}" y="10" width="9" height="22" rx="4" fill="${c2}"/>`;
  let deco = '';
  const inner = `<svg viewBox="0 0 ${w} ${h}">`;
  const clip = `<clipPath id="cp${design}${w}"><rect x="10" y="10" width="${w - 20}" height="${h - 14}" rx="6"/></clipPath>`;
  const D = [
    '',
    `<g clip-path="url(#cp${design}${w})">${[...Array(5)].map((_, i) => `<rect x="${12 + i * ((w - 24) / 5)}" y="10" width="${(w - 24) / 10}" height="${h}" fill="${c2}"/>`).join('')}</g>`,
    `<g clip-path="url(#cp${design}${w})">${[...Array(4)].map((_, i) => `<rect x="10" y="${12 + i * ((h - 14) / 4)}" width="${w}" height="${(h - 14) / 8}" fill="${c2}"/>`).join('')}</g>`,
    `<g clip-path="url(#cp${design}${w})"><path d="M10 ${h} L${w} 10 L${w} 26 L26 ${h} Z" fill="${c2}"/></g>`,
    `<g clip-path="url(#cp${design}${w})"><path d="M10 12 L${w - 10} ${h - 4} L${w - 10} ${h + 4} L10 20 Z" fill="${c2}"/></g>`,
    `<g clip-path="url(#cp${design}${w})"><rect x="${w / 2}" y="0" width="${w}" height="${h}" fill="${c2}"/></g>`,
    `<g clip-path="url(#cp${design}${w})"><rect x="10" y="${h / 2 - 5}" width="${w - 20}" height="10" fill="${c2}"/></g>`,
    `<g clip-path="url(#cp${design}${w})"><path d="M10 ${h * 0.35} L${w / 2} ${h * 0.55} L${w - 10} ${h * 0.35} L${w - 10} ${h * 0.5} L${w / 2} ${h * 0.7} L10 ${h * 0.5} Z" fill="${c2}"/></g>`,
    `<g clip-path="url(#cp${design}${w})">${[...Array(4)].map((_, r) => [...Array(4)].map((_, c) => (r + c) % 2 ? `<rect x="${12 + c * (w - 24) / 4}" y="${12 + r * (h - 16) / 4}" width="${(w - 24) / 4}" height="${(h - 16) / 4}" fill="${c2}"/>` : '').join('')).join('')}</g>`,
    `<g clip-path="url(#cp${design}${w})"><rect x="${w / 2 - 5}" y="0" width="10" height="${h}" fill="${c2}"/></g>`,
    `<g clip-path="url(#cp${design}${w})"><rect x="0" y="${h * 0.6}" width="${w}" height="9" fill="${c2}"/></g>`,
    `<g clip-path="url(#cp${design}${w})"><rect x="${w / 2 - 1}" y="0" width="2" height="${h}" fill="${c2}"/></g>`,
  ];
  return `${inner}<defs>${clip}</defs>${body}${D[design % 12]}</svg>`;
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
  const tone = G.ui.kitTone || 0;
  const design = G.ui.kitDesign || 0;
  const homeC2 = club.color2;
  let homeC1 = club.color;
  if (tone === 1) homeC1 = club.color2 === '#ffffff' ? club.color : club.color2;
  if (tone === 2) homeC1 = shade(club.color, -25);
  if (tone === 3) homeC1 = club.color;
  const awayC1 = G.ui.kitAwayColor || (club.color2 === '#ffffff' ? '#1a1a1a' : club.color2);
  const COLORS = ['#1d4e89', '#c8102e', '#0d5c38', '#0b3d91', '#f2c200', '#111111', '#ffffff', '#6b1d2a', '#7ec8e3', '#b6ff3b', '#d4af37', '#8b1e3f', '#a50044', '#004d98', '#f26b1f', '#1f4e79', '#e10600', '#6cabdd'];
  return `
  <div class="kicker">Перед стартом</div><h1>Форма «${esc(club.name)}»</h1>
  <div class="card"><h3>Домашняя</h3>
    <div style="display:flex;gap:14px;align-items:center">
      ${shirtSvg(design, homeC1, homeC2, 90)} ${shirtSvg(design, homeC1, homeC2, 90)}
      <div class="grow muted small">Два комплекта: основной и вратарский. Тон и фасон.</div>
    </div>
    <div class="chips">${[0, 1, 2, 3].map(t => `<button class="chip ${tone === t ? 'on' : ''}" data-act="kit-tone" data-v="${t}">Тон ${t + 1}</button>`).join('')}</div>
    <div class="kit-grid">${[...Array(12)].map((_, i) => `<button class="kit-cell ${design === i ? 'on' : ''}" data-act="kit-design" data-i="${i}" title="${KIT_DESIGNS[i]}">${shirtSvg(i, homeC1, homeC2, 44)}</button>`).join('')}</div>
  </div>
  <div class="card"><h3>Гостевая</h3>
    <div style="display:flex;gap:14px;align-items:center">${shirtSvg(design, awayC1, '#111111', 90)}
      <div class="grow muted small">Гостевая — любой цвет и любой из 12 фасонов.</div></div>
    <div class="swatches">${COLORS.map(c => `<button class="sw ${awayC1 === c ? 'on' : ''}" data-act="kit-color" data-v="${c}" style="background:${c}"></button>`).join('')}</div>
  </div>
  <div class="note">Домашняя остаётся в тонах клуба, меняется только фасон. Гостевая — любой цвет.</div>
  <button class="btn" data-act="kit-start" style="width:100%">Начать сезон</button>`;
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
  let sq = ENG.playersOf(G.S, G.S.clubId).slice().sort((a, b) => b.ovr - a.ovr);
  const groups = { all: null, gk: ['GK'], def: ['DR', 'DL', 'DC'], mid: ['DM', 'MC', 'AM', 'MR', 'ML'], fwd: ['ST'] };
  const g = groups[filter];
  if (g) sq = sq.filter(p => g.includes(p.pos));
  return sq.map(p => `
    <button class="row" data-act="open-player" data-id="${p.id}">
      ${posTag(p)}<div class="grow"><b>${esc(pname(p))}</b> <span class="muted small">${p.age} лет</span>
      <div class="sub muted">${p.mor < 45 ? 'настрой ' + p.mor + ' · ' : ''}${p.injured ? 'травма ' + p.injured + ' дн. · ' : ''}${p.ban ? 'дискв. · ' : ''}${p.cond < 65 ? 'тонус ' + p.cond + ' · ' : ''}${p.apps ? p.goals + ' гол' : ''}</div></div>
      <span class="ovr ${ovrCls(p.ovr)}">${p.ovr}</span>
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
function attrLine(label, v) {
  return `<div class="attrline"><span class="muted">${label}</span><b>${v}</b><div class="bar"><i style="width:${v * 5}%"></i></div></div>`;
}
function playerCard(p) {
  const own = p.clubId === G.S.clubId;
  const club = String(p.clubId).startsWith('pool:') ? null : ENG.clubById(G.S, p.clubId);
  const clubLabel = own ? 'свой клуб' : club ? club.name : (String(p.clubId).startsWith('pool:') ? (GD.MARKETS.find(m => 'pool:' + m.id === p.clubId) || {}).country : 'свободный агент');
  const attrs = p.pos === 'GK'
    ? [['Вратарская', p.gk], ['Игра руками', p.def], ['Характер', p.men], ['Выбор позиции', p.pas]]
    : [['Скорость', p.pac], ['Удар', p.sho], ['Пас', p.pas], ['Техника', p.tec], ['Отбор', p.def], ['Мощь', p.strn], ['Выносливость', p.sta], ['Характер', p.men]];
  const avgRate = p.apps ? (p.ratingSum / p.apps).toFixed(2) : '—';
  const cond = scoutingBlurb(p);
  const isForeign = !own && !String(p.clubId).startsWith('pool:') && p.clubId !== 'free';
  const canBuy = !own;
  const window = ENG.inWindow(G.S.date);
  return `
  <div class="kicker">${GD.POS_FULL[p.pos]} · ${esc(p.nat)}</div>
  <h1>${esc(pname(p))}</h1>
  <div class="muted small">${p.age} лет · ${p.foot} нога · №${p.number || '—'} · ${esc(clubLabel)}${club ? ' · ' + (GD.LEAGUES[club.league] || { short: 'Евро' }).short : p.clubId === 'free' ? ' | свободный агент' : ' | трансферный лист'}</div>
  <div style="display:flex;gap:16px;align-items:flex-end;margin:12px 0">
    <div><div class="kicker">общий</div><div class="score" style="font-size:44px;text-align:left">${p.ovr}</div></div>
    <div class="grow">${attrLine('Настрой', p.mor)}</div>
  </div>
  <div class="card">${attrs.map(a => attrLine(a[0], a[1])).join('')}</div>
  <div class="note">${esc(cond)}</div>
  <div class="strip">
    <div class="cell"><div class="k">Игры</div><div class="v">${p.apps}</div></div>
    <div class="cell"><div class="k">Голы</div><div class="v">${p.goals}</div></div>
    <div class="cell"><div class="k">Оценка</div><div class="v">${avgRate}</div></div>
  </div>
  <div class="strip">
    <div class="cell"><div class="k">Рейтинг+потолок</div><div class="v">${p.ovr}+${Math.max(0, p.pot - p.ovr)}</div></div>
    <div class="cell"><div class="k">Цена</div><div class="v small" style="font-size:13px">${ENG.USD(p.value)}</div></div>
    <div class="cell"><div class="k">Контракт</div><div class="v small" style="font-size:13px">${p.contract} г.</div></div>
  </div>
  <div class="muted small" style="margin-bottom:10px">${ENG.IW(p.wage)}${p.clause ? ' · Условие: отступные ' + ENG.USD(p.clause) : ''}</div>
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
  const free = p.clubId === 'free' || String(p.clubId).startsWith('pool:');
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
    return `<button class="dot ${G.ui.selectedSlot === i ? 'sel' : ''}" style="left:${xy.x}%;top:${xy.y}%" data-act="slot-select" data-i="${i}">
      <span class="ball-dot" style="--c1:${club.color}">${p.number}</span><span class="lbl">${GD.POS_ABBR[xy.pos]}</span></button>`;
  }).join('');
  return `
  <div class="kicker">Матч-план</div><h1>Тактика</h1>
  <div class="chips">${GD.FORM_LIST.map(f => `<button class="chip ${tac.formation === f ? 'on' : ''}" data-act="formation" data-v="${f}">${f}</button>`).join('')}</div>
  <div class="pitch" id="tac-pitch">${dots}</div>
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
      ${posTag(p)}<div class="grow"><b>${esc(pname(p))}</b><div class="sub muted">${p.age} лет · ${p.pos === pos ? 'родная позиция' : 'адаптация ' + Math.round(fit * 100)}%</div></div>
      <span class="ovr ${ovrCls(p.ovr)}">${p.ovr}</span></button>`).join('')}</div>`;
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
  return `
  <div class="kicker">Чемпионаты</div><h1>Таблица</h1>
  <div class="chips">${chipLgs.map(l => `<button class="chip ${lg === l ? 'on' : ''}" data-act="table-league" data-v="${l}">${GD.LEAGUES[l].short}</button>`).join('')}</div>
  <div class="card">${tableHtml(lg)}</div>
  ${lg === myLg && done ? `<button class="btn" data-act="season-close" style="width:100%">Закрыть сезон и перейти дальше</button>` : ''}`;
}

// ---------- market ----------
function marketRows() {
  const mk = GD.MARKETS.find(m => m.id === G.ui.marketCountry) || GD.MARKETS[0];
  let list;
  if (mk.inGame) {
    list = ENG.playersOf(G.S, undefined), list = G.S.players.filter(p => {
      const c = ENG.clubById(G.S, p.clubId);
      return c && c.league === mk.inGame;
    });
  } else {
    list = ENG.marketPlayers(mk);
  }
  const featAttr = { tech: 'tec', strong: 'strn', fast: 'pac', shot: 'sho', pass: 'pas', tackle: 'def' }[G.ui.marketFeat];
  if (featAttr) list = list.filter(p => p[featAttr] >= 15);
  if (G.ui.marketPos !== 'all') {
    const g = { gk: ['GK'], def: ['DR', 'DL', 'DC'], mid: ['DM', 'MC', 'AM', 'MR', 'ML'], fwd: ['ST'] }[G.ui.marketPos];
    if (g) list = list.filter(p => g.includes(p.pos));
  }
  list = list.filter(p => p.ovr >= G.ui.marketFloor && p.clubId !== G.S.clubId);
  return list.sort((a, b) => b.ovr - a.ovr).slice(0, 60).map(p => {
    const price = p.clubId === G.S.clubId ? null : p.value;
    return `<button class="row" data-act="open-player" data-id="${p.id}">
      ${posTag(p)}<div class="grow"><b>${esc(pname(p))}</b>
      <div class="sub muted">${esc(p.nat)} · ${p.age} лет${p.mor < 45 ? ' · настрой ' + p.mor : ''} · ${ENG.USD(price)}</div></div>
      <span class="ovr ${ovrCls(p.ovr)}">${p.ovr}</span></button>`;
  }).join('');
}
function scrMarket() {
  const top = GD.MARKETS.filter(m => m.top).map(m => m.id);
  const rest = GD.MARKETS.filter(m => !m.top).map(m => m.id);
  const mk = m => GD.MARKETS.find(x => x.id === m);
  return `
  <div class="kicker">Все рынки</div><h1>Рынок</h1>
  <div class="chips">${top.map(id => `<button class="chip ${G.ui.marketCountry === id ? 'on' : ''}" data-act="market-country" data-v="${id}">${mk(id).country}</button>`).join('')}</div>
  <div class="chips">${rest.map(id => `<button class="chip ${G.ui.marketCountry === id ? 'on' : ''}" data-act="market-country" data-v="${id}">${mk(id).country} · ${mk(id).league}</button>`).join('')}</div>
  <div class="chips">${[['all', 'Все'], ['tech', 'Техничный'], ['strong', 'Сильный'], ['fast', 'Быстрый'], ['shot', 'Удар'], ['pass', 'Пас'], ['tackle', 'Отбор']].map(([k, n]) =>
    `<button class="chip ${G.ui.marketFeat === k ? 'on' : ''}" data-act="market-feat" data-v="${k}">${n}</button>`).join('')}</div>
  <div class="chips">${[['all', 'Амплуа: все'], ['gk', 'ВРТ'], ['def', 'Защита'], ['mid', 'Полузащита'], ['fwd', 'Атака']].map(([k, n]) =>
    `<button class="chip ${G.ui.marketPos === k ? 'on' : ''}" data-act="market-pos" data-v="${k}">${n}</button>`).join('')}</div>
  <label class="field"><span class="muted">Рейтинг не ниже: ${G.ui.marketFloor}</span>
    <input type="range" data-act="market-floor" data-sync="marketFloor" min="50" max="90" value="${G.ui.marketFloor}"></label>
  <div class="card rowlist" id="market-list" style="padding:6px 10px">${marketRows()}</div>
  <div class="note">Цены в долларах. Страна — это лига. Топ-15 по уровню FC 27, остальные — ближайший уровень Football Manager.</div>`;
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
function scrCups() {
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
  <div class="kicker">Сетка и группы</div><h1>Кубки</h1>
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
    <button class="btn ghost small" data-act="match-menu-open">Меню матча</button>
    <button class="btn ghost small" data-act="landscape">Поле шире</button>
  </div>
  <div class="note">Большую часть матча мяч в ногах. Поверните телефон — поле станет шире. Замены — в меню матча.</div>`;
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
  const bench = ENG.playersOf(G.S, G.S.clubId).filter(p => !starters.some(s => s.pid === p.id) && !p.injured && !p.ban);
  const selOut = G.ui.menuOut;
  return `
  <h2>${MENU_TITLE()}<button class="x" data-act="match-resume">×</button></h2>
  <div class="chips">${GD.FORM_LIST.map(f => `<button class="chip ${tac.formation === f ? 'on' : ''}" data-act="formation" data-v="${f}">${f}</button>`).join('')}</div>
  ${SLIDERS.map(s => `<label class="field"><span class="muted">${s[1]}</span>
    <input type="range" data-act="slider" data-k="${s[0]}" min="${s[0] === 'mentality' ? -2 : 0}" max="${s[0] === 'mentality' ? 2 : 4}" value="${s[0] === 'mentality' ? tac.mentality : tac[s[0]] ?? 2}"></label>`).join('')}
  <div class="chips">${GD.TACTICS.map(t => `<button class="chip ${tac.style === t.id ? 'on' : ''}" data-act="style" data-v="${t.id}">${t.name}</button>`).join('')}</div>
  <h3 style="margin-top:12px">Замены (${G.ui.liveSubsUsed || 0}/5)</h3>
  ${selOut ? `<div class="note">Снять: <b>${esc(pname(S_player(selOut)))}</b> — выберите, кто выйдет.</div>` : '<div class="muted small">Сначала снимите игрока.</div>'}
  ${(selOut ? bench : starters.map(s => S_player(s.pid)).filter(Boolean)).map(p => `
    <button class="row" data-act="${selOut ? 'live-sub' : ''}" ${selOut ? `data-out="${selOut}" data-inn="${p.id}"` : ''} ${selOut ? '' : `data-act="menu-pick-out" data-pid="${p.id}"`}>
      ${posTag(p)}<div class="grow">${esc(pname(p))} <span class="muted small">тонус ${p.cond}</span></div>
      <span class="ovr ${ovrCls(p.ovr)}">${p.ovr}</span></button>`).join('')}
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
const NAV = [['desk', 'Кабинет'], ['squad', 'Состав'], ['tactics', 'Тактика'], ['league', 'Лига'], ['other', 'Прочее']];
function sheetOther() {
  return `
  <h2>Прочее<button class="x" data-act="close-sheet">×</button></h2>
  <div class="rowlist">
    <button class="row" data-act="nav" data-v="market"><div class="grow">Рынок</div><span class="muted">→</span></button>
    <button class="row" data-act="nav" data-v="inbox"><div class="grow">Почта</div><span class="muted">→</span></button>
    <button class="row" data-act="nav" data-v="money"><div class="grow">Финансы</div><span class="muted">→</span></button>
    <button class="row" data-act="nav" data-v="calendar"><div class="grow">Календарь</div><span class="muted">→</span></button>
    <button class="row" data-act="nav" data-v="cups"><div class="grow">Кубки</div><span class="muted">→</span></button>
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
  const sheet = G.sheet ? `<div class="sheet-wrap" data-act="close-sheet"><div class="sheet" onclick="event.stopPropagation()">${G.sheet.html}</div></div>`
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
    if (act === 'menu-pick-out') { G.ui.menuOut = t.dataset.pid; G.sheet = { html: MENU_HTML() }; return; }
    if (act === 'close-sheet' && t.classList.contains('sheet-wrap')) { closeSheet(); return; }
    const fn = window.ACT[act];
    if (fn) { e.preventDefault(); fn(t, e); }
  });
  document.body.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.sync) { G.ui[t.dataset.sync] = t.type === 'range' ? +t.value : t.value; }
    if (t.dataset.act === 'slider') window.ACT.slider(t, e);
    if (t.dataset.act === 'market-floor') { G.ui.marketFloor = +t.value; const m = t.closest('.card, label'); const lb = t.previousElementSibling; if (lb) lb.textContent = 'Рейтинг не ниже: ' + t.value; }
  });
  document.body.addEventListener('change', e => {
    if (e.target.dataset.act === 'market-floor') render();
  });
}

return { esc, badge, ovrCls, posTag, pname, myNextFixture, avgCond, trophySvg, shirtSvg, KIT_DESIGNS,
  scrBoot, scrHonors, scrPick, scrKits, scrDesk, scrSquad, playerCard, squadRows,
  scrTactics, scrLeague, scrMarket, scrInbox, scrMoney, scrCalendar, scrCups, scrSacked,
  scrMatchPre, scrMatchLive, scrMatchEnd, render, initEvents, updateTacSummary, renderMarketList,
  MENU_HTML, euroTitle, euroStageName, tableHtml, tacSummary };
})();
window.UI = UI;
window.render = UI.render;
window.updateTacSummary = UI.updateTacSummary;
window.renderMarketList = UI.renderMarketList;
