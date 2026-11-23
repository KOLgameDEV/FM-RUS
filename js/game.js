/* ============================================================
 * GAME — state, save slots (Кабинет), routing, actions
 * ============================================================ */
'use strict';

const G = {
  screen: 'boot',
  sheet: null,          // html of open sheet or null
  S: null,              // current save object
  slotIdx: -1,
  folder: null,         // {v, active, slots[], glory[]}
  device: null,
  ui: {
    pickLeague: 'rpl', pickCountry: 'ru',
    squadFilter: 'all', marketCountry: 'eng', marketFeat: 'all', marketPos: 'all', marketFloor: 50,
    marketSection: 'stars', marketSearch: '', marketSort: 'ovr', marketAge: 'all',
    tableLeague: null, selectedSlot: -1, viewingPlayer: null,
    inboxOpen: {}, msgIdx: 0,
  },
  hist: [],
};

// ---------- device & folder ----------
function deviceId() {
  let id = localStorage.getItem('kabinet-device');
  if (!id) {
    id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 8)
      : Math.random().toString(16).slice(2, 10);
    localStorage.setItem('kabinet-device', id);
  }
  return id;
}
function deviceStamp() { return deviceId().slice(0, 4).toUpperCase(); }
function folderKey() { return 'kabinet-folder-v2:' + deviceId(); }
function loadFolder() {
  let f = JSON.parse(localStorage.getItem(folderKey()) || 'null');
  if (!f) {
    const v1 = JSON.parse(localStorage.getItem('kabinet-folder-v1') || 'null');
    f = v1 || { v: 2, active: 0, slots: [null, null, null], glory: [] };
    if (v1 && !f.slots) f = { v: 2, active: 0, slots: [v1.save || null, null, null], glory: v1.glory || [] };
  }
  // legacy single save
  if (!f.slots || !f.slots.some(Boolean)) {
    const old = JSON.parse(localStorage.getItem('kabinet-save-v1') || 'null');
    if (old && old.clubId) { f.slots[0] = old; f.glory = parseGlory(old.log || []); }
  }
  f.v = 2;
  f.slots = (f.slots || [null, null, null]).map(s => s && migrate(s));
  while (f.slots.length < 3) f.slots.push(null);
  f.glory = f.glory || [];
  return f;
}
function storeFolder() { localStorage.setItem(folderKey(), JSON.stringify(G.folder)); }
function migrate(s) {
  if (!s || s.v === 3) return s;
  // tolerate older/partial saves by re-filling defaults
  const d = { v: 3, manager: 'Тренер', date: '2026-07-11', season: 2026, played: 0, confidence: 68,
    focus: null, sacked: false, offers: [], log: [], badSeasons: 0,
    cup: { byes: [], userOut: false, stage: 'live' }, euro: { comp: null, stage: 'done', pts: 0, gf: 0, ga: 0 },
    phase: 'season', difficulty: 'experienced', matchMins: 2 };
  for (const k in d) if (s[k] === undefined) s[k] = d[k];
  s.v = 3;
  if (window.ENG && ENG.migrateSave) ENG.migrateSave(s);
  return s;
}
function saveGame() {
  if (!G.S || G.slotIdx < 0) return;
  G.folder.slots[G.slotIdx] = G.S;
  G.folder.active = G.slotIdx;
  syncGlory();
  storeFolder();
}
function parseGlory(log) {
  const out = [];
  (log || []).forEach(l => {
    const m = l.match(/^HONOR:(\d+)\|(.+)$/);
    if (!m) return;
    if (/вылет|выход|стык/.test(m[2])) return;
    out.push({ who: '', text: m[2], season: m[1], kind: gloryKind(m[2]) });
  });
  return out;
}
function gloryKind(text) {
  const t = text.toLowerCase();
  if (t.includes('чемпион рпл') || t.includes('лигу чемпионов')) return 'ucl';
  if (t.includes('европы')) return 'uel';
  if (t.includes('конферен')) return 'uecl';
  if (t.includes('кубок') || t.includes('обладатель')) return 'cup';
  if (t.includes('медиа')) return 'media';
  if (t.includes('фнл-3')) return 'fnl3';
  if (t.includes('фнл-2')) return 'fnl2';
  if (t.includes('фнл') || t.includes('первая')) return 'fnl';
  if (t.includes('рпл')) return 'rpl';
  if (t.includes('чемпион')) return 'league';
  return 'league';
}
function syncGlory() {
  // merge HONOR lines of active save into permanent wall (dedupe by text+season)
  const seen = new Set(G.folder.glory.map(g => g.text + '|' + g.season));
  parseGlory(G.S.log).forEach(g => {
    g.who = G.S.manager;
    if (!seen.has(g.text + '|' + g.season)) { G.folder.glory.push(g); seen.add(g.text + '|' + g.season); }
  });
}

// ---------- navigation ----------
function go(screen, opts) {
  if (screen !== 'desk') G.ui.trophyScene = null;
  if (screen !== 'desk' && G.screen !== screen && ['squad', 'tactics', 'league', 'market', 'player', 'other', 'calendar', 'inbox', 'money'].includes(G.screen)) G.hist.push(G.screen);
  if (screen === 'desk') G.hist = [];
  if (G.hist.length > 12) G.hist.shift();
  G.screen = screen;
  if (opts) Object.assign(G.ui, opts);
  G.sheet = null;
  render();
}
function goBack() {
  const prev = G.hist.pop();
  if (!prev) { go('desk'); return; }
  G.screen = prev;
  G.sheet = null;
  render();
}
function openSheet(title, html) {
  G.sheet = { title, html };
  render();
}
function closeSheet() { G.sheet = null; render(); }
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---------- actions ----------
const ACT = {
  // boot
  'slot-continue'(el) {
    const i = +el.dataset.i;
    G.S = migrate(G.folder.slots[i]);
    G.slotIdx = i;
    G.folder.active = i; storeFolder();
    go('desk');
  },
  'slot-new'(el) {
    G.slotIdx = +el.dataset.i;
    G.ui.pickLeague = 'rpl'; G.ui.pickCountry = 'ru';
    go('pick');
  },
  'honors'() { go('honors'); },
  'back'() { if (G.S) go('desk'); else go('boot'); },
  // pick
  'pick-country'(el) { G.ui.pickCountry = el.dataset.v; go('pick'); },
  'pick-league'(el) { G.ui.pickLeague = el.dataset.v; G.ui.pickCountry = 'ru'; go('pick'); },
  'pick-club'(el) {
    G.ui.pickClub = el.dataset.id;
    go('kits');
  },
  'mgr-name'(el) { /* input event handled separately */ },
  // kit studio
  'kit-part'(el) { G.ui.kitPart[el.dataset.k] = el.dataset.v; UI.kitRepaint(el.dataset.k); },
  'kit-color'(el) { UI.kitDraft(el.dataset.k)[G.ui.kitPart[el.dataset.k]] = el.dataset.c; UI.kitRepaint(el.dataset.k); },
  'kit-design'(el) { UI.kitDraft(el.dataset.k).design = +el.dataset.i; UI.kitRepaint(el.dataset.k); },
  'kit-reset'(el) {
    const k = el.dataset.k, fresh = UI.kitDefaults(GD.CLUBS.find(c => c.id === G.ui.pickClub));
    G.ui.kitDraft[k] = fresh[k]; UI.kitRepaint(k);
  },
  'kit-gk-auto'() { UI.kitGkAuto(); UI.kitRepaint('goal'); },
  'kit-start'(el) {
    const name = (document.getElementById('mgr-name') || {}).value || 'А. Рубанова';
    const club = GD.CLUBS.find(c => c.id === G.ui.pickClub);
    const S = ENG.newCareer(club.id, name);
    const d = G.ui.kitDraft || UI.kitDefaults(club);
    S.kit = { home: Object.assign({}, d.home), away: Object.assign({}, d.away), goal: Object.assign({}, d.goal) };
    G.S = S;
    G.folder.slots[G.slotIdx] = S;
    saveGame();
    toast('Карьера начата в «' + club.name + '».');
    go('desk');
  },
  // desk / nav
  'nav'(el) { go(el.dataset.v); },
  'open-match'(el) { G.ui.fxId = el.dataset.id; go('match-pre'); },
  'next-day'(el) {
    const before = G.S.date;
    ENG.advanceDay(G.S);
    saveGame();
    if (G.S.sacked) { go('sacked'); return; }
    if (G.S.date === before) toast('День не сдвинулся.');
    go('calendar');
  },
  'season-close'(el) {
    const ended = G.S.season;
    ENG.endSeason(G.S);
    saveGame();
    if (G.S.sacked) { go('sacked'); return; }
    const clubName = ENG.myClub(G.S).name;
    const gl = parseGlory(G.S.log).filter(g => +g.season === ended && g.text.includes(clubName)).slice(-1)[0];
    if (gl) G.ui.trophyScene = { kind: gl.kind, club: clubName, text: gl.text };
    toast('Сезон закрыт. Новый сезон ' + G.S.season + '/' + (G.S.season + 1) + '.');
    go('desk');
  },
  'train'(el) {
    if (ENG.train(G.S, el.dataset.v)) {
      toast('Тренировка: ' + el.dataset.v + '. Фокус до конца матча.');
      saveGame();
    } else toast('Сегодня тренировка уже была.');
    go('tactics');
  },
  // squad & player
  'squad-filter'(el) { G.ui.squadFilter = el.dataset.v; go('squad'); },
  'bench-open'() { openSheet('Замены', UI.benchSheetHtml()); },
  'bench-add'(el) {
    if (ENG.setBench(G.S, el.dataset.pid, true)) { saveGame(); toast('Игрок переведён на замену.'); }
    else toast('В заядном запасе максимум 9.');
    G.sheet = { title: 'Замены', html: UI.benchSheetHtml() }; render();
  },
  'bench-remove'(el) {
    ENG.setBench(G.S, el.dataset.pid, false);
    saveGame();
    G.sheet = { title: 'Замены', html: UI.benchSheetHtml() }; render();
  },
  'go-back'() { goBack(); },
  'open-player'(el) { G.ui.viewingPlayer = el.dataset.id; go('player'); },
  'renew-years'(el) { G.ui.renewYears = +el.dataset.v; go('player'); },
  'renew-clause'(el) { G.ui.renewClause = el.dataset.v; go('player'); },
  'renew-sign'(el) {
    const p = ENG.playersOf(G.S, G.S.clubId).find(x => x.id === G.ui.viewingPlayer);
    const slider = document.getElementById('wage-slider');
    const wage = Math.round(+slider.value);
    if (ENG.renewContract(G.S, p, G.ui.renewYears || 2, wage, G.ui.renewClause || 'none')) {
      saveGame(); toast('Контракт продлён.');
    } else toast(ENG.totalWage(G.S) + (G.ui.renewYears || 2) * p.wage * 0.04 > G.S.budget ? 'Не хватает денег на сбор агента.' : 'Не проходят по потолку зарплат.');
    go('player');
  },
  'to-first-eleven'(el) {
    const p = S_player(G.ui.viewingPlayer);
    const tac = G.S.tactics;
    const plan = ENG.autoLineup(G.S, G.S.clubId, tac.formation);
    tac.slots = plan.map(x => x.pid);
    saveGame(); toast('Авто-состав обновлён с учётом ' + p.last + '.');
    go('tactics');
  },
  'toggle-list'(el) {
    const p = S_player(G.ui.viewingPlayer);
    ENG.listPlayer(G.S, p, !p.listed);
    saveGame(); go('player');
  },
  'bid-chip'(el) {
    G.ui.bidFee = Math.round(+el.dataset.v * 10) / 10;
    const inp = document.getElementById('bid-fee'); if (inp) inp.value = G.ui.bidFee;
    go('player');
  },
  'buy'(el) {
    const p = S_player(G.ui.viewingPlayer);
    const fee = +(document.getElementById('bid-fee') || {}).value || p.value;
    const r = ENG.buyPlayer(G.S, p, fee);
    saveGame();
    if (r.ok) toast('Трансфер закрыт: ' + ENG.fullName(p) + '.');
    else toast({ window: 'Окно закрыто. Лето до 12 сентября, зима 20 января — 25 февраля.', money: 'Не хватает трансферного бюджета.', cap: 'Вы не проходите по потолку зарплат.', refused: 'Клуб отклонил предложение.' }[r.why]);
    go('player');
  },
  // tactics
  'formation'(el) {
    G.S.tactics.formation = el.dataset.v;
    G.S.tactics.slots = ENG.autoLineup(G.S, G.S.clubId, el.dataset.v).map(x => x.pid);
    saveGame(); go('tactics');
  },
  'style'(el) {
    const preset = GD.TACTICS.find(t => t.id === el.dataset.v);
    Object.assign(G.S.tactics, { style: preset.id, mentality: preset.mentality, press: preset.press, tempo: preset.tempo, line: preset.line, width: preset.width });
    saveGame(); go('tactics');
  },
  'tac-auto'(el) {
    G.S.tactics.slots = ENG.autoLineup(G.S, G.S.clubId, G.S.tactics.formation).map(x => x.pid);
    saveGame(); go('tactics');
  },
  'slot-select'(el) { G.ui.selectedSlot = +el.dataset.i; go('tactics'); },
  'assign'(el) {
    const i = G.ui.selectedSlot;
    if (i >= 0) { G.S.tactics.slots[i] = el.dataset.pid; saveGame(); }
    G.ui.selectedSlot = -1;
    go('tactics');
  },
  'slider'(el) {
    const key = el.dataset.k;
    G.S.tactics[key] = +el.value;
    saveGame();
    updateTacSummary();
  },
  // league screen
  'table-league'(el) { G.ui.tableLeague = el.dataset.v; go('league'); },
  // market
  'market-section'(el) { G.ui.marketSection = el.dataset.v; go('market'); },
  'market-country'(el) { G.ui.marketCountry = el.dataset.v; go('market'); },
  'market-feat'(el) { G.ui.marketFeat = el.dataset.v; go('market'); },
  'market-pos'(el) { G.ui.marketPos = el.dataset.v; go('market'); },
  'market-age'(el) { G.ui.marketAge = el.dataset.v; go('market'); },
  'market-sort'(el) { G.ui.marketSort = el.dataset.v; go('market'); },
  'market-floor'(el) { G.ui.marketFloor = +el.value; renderMarketList(); },
  // inbox
  'msg-open'(el) {
    const id = el.dataset.id;
    const m = G.S.inbox.find(x => x.id === id);
    if (m) m.read = true;
    G.ui.inboxOpen[id] = !G.ui.inboxOpen[id];
    saveGame(); render();
  },
  'offer-accept'(el) {
    if (ENG.acceptOfferById(G.S, +el.dataset.i)) { saveGame(); toast('Сделка состоялась.'); }
    render();
  },
  'offer-refuse'(el) {
    G.S.offers.splice(+el.dataset.i, 1);
    saveGame(); render();
  },
  // settings
  'difficulty'(el) { G.S.difficulty = el.dataset.v; saveGame(); toast('Сложность: ' + el.textContent.trim()); },
  'matchmins'(el) { G.S.matchMins = +el.dataset.v; saveGame(); toast('Время матча: ' + el.dataset.v + ' мин.'); },
  'manual-save'(el) {
    if (!G.S) { toast('Сначала выберите клуб.'); return; }
    saveGame(); toast('Карьера записана в этот кабинет.');
  },
  'delete-career'(el) {
    if (!confirm('Точно удалить карьеру')) return;
    G.folder.slots[G.slotIdx] = null;
    storeFolder();
    G.S = null; G.slotIdx = -1;
    toast('Карьера удалена. Заслуги этого кабинета остались.');
    go('boot');
  },
  // sacked
  'take-job'(el) {
    ENG.takeJob(G.S, el.dataset.id);
    saveGame();
    toast('Подписан контракт с «' + ENG.myClub(G.S).name + '».');
    go('desk');
  },
  'restart'(el) {
    G.folder.slots[G.slotIdx] = null; storeFolder();
    G.S = null; G.slotIdx = -1;
    go('boot');
  },
  'close-sheet'(el) { closeSheet(); },
  // match screens
  'watch-live'(el) { G.ui.menuOut = null; G.ui.liveSubsUsed = 0; go('match-live'); },
  'watch-instant'(el) {
    const fx = fxById(G.ui.fxId);
    const r = ENG.instantMatch(G.S, fx.home, fx.away, fx.id + ':' + G.S.date);
    ENG.postMatch(G.S, fx, r, null);
    saveGame();
    G.ui.lastResult = { fx, r, live: null };
    go('match-end');
  },
  'match-menu-open'(el) { G.sheet = { title: MENU_TITLE(), html: MENU_HTML() }; render(); },
  'match-timeout'(el) {
    if (window.MatchView && MatchView.active) MatchView.pauseForMenu();
    G.sheet = { title: 'Тайм-аут · замены', html: MENU_HTML() };
    render();
  },
  'match-resume'(el) { closeSheet(); if (window.MatchView) MatchView.resume(); },
  'match-second-half'(el) { closeSheet(); if (window.MatchView) MatchView.secondHalf(); },
  'live-sub'(el) {
    if (window.MatchView) window.MatchView.doUserSub(el.dataset.out, el.dataset.inn);
    closeSheet();
    if (window.MatchView && MatchView.active && !MatchView.htDone) MatchView.resume();
  },
  'match-back'(el) { go('desk'); },
  'trophy-honors'(el) { saveGame(); go('honors'); },
  'landscape'(el) { document.body.classList.toggle('wide-canvas'); },
  'sheet-only'(el) {},
};
function MENU_TITLE() {
  return window.MatchView && MatchView.htDone ? 'План на ходу' : 'Перерыв';
}
function S_player(id) { return G.S.players.find(p => p.id === id); }
function fxById(id) { return G.S.fixtures.find(f => f.id === id); }
function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  const adj = v => Math.max(0, Math.min(255, v + Math.round(255 * pct / 100)));
  return '#' + ((adj(n >> 16) << 16) | (adj((n >> 8) & 255) << 8) | adj(n & 255)).toString(16).padStart(6, '0');
}
// MENU_HTML provided by ui.js
window.ACT = ACT;
window.G = G;
window.go = go; window.openSheet = openSheet; window.closeSheet = closeSheet; window.toast = toast;
window.saveGame = saveGame; window.fxById = fxById; window.S_player = S_player; window.deviceStamp = deviceStamp;
window.gloryKind = gloryKind; window.shade = shade;
function boot() {
  G.device = deviceId();
  G.folder = loadFolder();
  const act = G.folder.active;
  if (act >= 0 && G.folder.slots[act]) { G.S = G.folder.slots[act]; G.slotIdx = act; }
  if (G.S && G.S.sacked) G.screen = 'sacked';
  else if (G.S) G.screen = 'desk';
  else G.screen = 'boot';
}
window.boot = boot;
