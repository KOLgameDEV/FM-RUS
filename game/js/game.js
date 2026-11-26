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
    marketSection: 'era', marketSearch: '', marketSort: 'ovr', marketSortDir: 'desc', marketAge: 'all',
    tableLeague: null, selectedSlot: -1, viewingPlayer: null,
    calendarMonth: null, calendarDate: null, euroComp: 'all', euroLevel: 'all',
    academyFilter: 'all', academySort: 'pot', careerLeague: 'all', careerSearch: '',
    inboxOpen: {}, inboxFilter: 'all', focusedMessage: null, msgIdx: 0,
    alertQueue: [], importantAlert: null, simulatingCalendar: false,
    matchSpeed: 1, matchTab: 'controls',
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
function readStore(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; }
}
function folderKey() { return 'kabinet-folder-v4:' + deviceId(); }
function legacyFolderKey() { return 'kabinet-folder-v2:' + deviceId(); }
function slotKey(i) { return 'kabinet-save-v4:' + deviceId() + ':' + i; }
const CAREER_DB = 'kabinet-careers-v4';
let careerDbPromise = null;
function openCareerDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!careerDbPromise) careerDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(CAREER_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('careers')) req.result.createObjectStore('careers');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch(() => null);
  return careerDbPromise;
}
function readCareerSlots(db) {
  return new Promise((resolve, reject) => {
    const slots = [null, null, null];
    const tx = db.transaction('careers', 'readonly');
    const req = tx.objectStore('careers').openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) { resolve(slots); return; }
      if (typeof cursor.key === 'number' && cursor.key >= 0 && cursor.key < 3) slots[cursor.key] = cursor.value;
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}
function putCareer(db, i, save) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('careers', 'readwrite');
    tx.objectStore('careers').put(save, i);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
function removeCareer(db, i) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('careers', 'readwrite');
    tx.objectStore('careers').delete(i);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
async function loadFolder() {
  let f = readStore(folderKey());
  let legacy = readStore(legacyFolderKey());
  const v1 = readStore('kabinet-folder-v1');
  if (!f && !legacy) legacy = v1 || null;
  if (!f) f = { v: 4, active: legacy && legacy.active >= 0 ? legacy.active : 0, glory: (legacy && legacy.glory) || [] };
  const inheritLegacy = !f.migrated;
  if (inheritLegacy && (!legacy || !legacy.slots || !legacy.slots.some(Boolean))) {
    const old = readStore('kabinet-save-v1');
    if (old && old.clubId) f.slots = [old, null, null];
  }
  const inheritedSlots = inheritLegacy ? (legacy && legacy.slots ? legacy.slots : f.slots || []) : [];
  f.v = 4;
  f.migrated = true;
  f.active = f.active >= 0 && f.active < 3 ? f.active : -1;
  f.glory = f.glory || [];
  f.settings = Object.assign({ difficulty: 'experienced', matchMins: 2, currency: 'rub' }, f.settings || {});
  ENG.setCurrency(f.settings.currency);
  const db = await openCareerDb();
  let stored = null;
  if (db) {
    try { stored = await readCareerSlots(db); } catch (_) {}
  }
  const slots = [];
  for (let i = 0; i < 3; i++) {
    const source = stored && stored[i] || readStore(slotKey(i)) || inheritedSlots[i] || null;
    const save = source && migrate(source);
    if (!db && inheritedSlots[i]) {
      try { localStorage.setItem(slotKey(i), JSON.stringify(inheritedSlots[i])); } catch (_) {}
    }
    if (db && !(stored && stored[i]) && save) {
      try {
        await putCareer(db, i, save);
        localStorage.removeItem(slotKey(i));
      } catch (_) {}
    }
    slots.push(save);
  }
  f.slots = slots;
  storeFolder(f);
  return f;
}
function storeFolder(folder) {
  const f = folder || G.folder;
  localStorage.setItem(folderKey(), JSON.stringify({ v: 4, migrated: true, active: f.active, glory: f.glory || [], settings: f.settings || { difficulty: 'experienced', matchMins: 2 } }));
}
async function storeSlot(i, save) {
  const db = await openCareerDb();
  if (db) {
    try {
      await putCareer(db, i, save);
      localStorage.removeItem(slotKey(i));
      return;
    } catch (_) {}
  }
  localStorage.setItem(slotKey(i), JSON.stringify(save));
}
function deleteSlot(i) {
  localStorage.removeItem(slotKey(i));
  G.folder.slots[i] = null;
  if (G.folder.active === i) G.folder.active = -1;
  storeFolder();
  openCareerDb().then(db => db && removeCareer(db, i)).catch(() => {});
}
function migrate(s) {
  if (!s) return s;
  if (s.v < 3) {
    const d = { manager: 'Тренер', date: '2026-07-01', season: 2026, played: 0, confidence: 68,
      focus: null, sacked: false, offers: [], log: [], badSeasons: 0,
      cup: { byes: [], userOut: false, stage: 'live' }, euro: { comp: null, stage: 'done', pts: 0, gf: 0, ga: 0 },
      phase: 'season', difficulty: 'experienced', matchMins: 2 };
    for (const k in d) if (s[k] === undefined) s[k] = d[k];
  }
  // older saves receive the same backfills before being migrated to v4
  if (s.v !== 4) {
    if (window.ENG && ENG.migrateSave) ENG.migrateSave(s);
    s.v = 4;
    return s;
  }
  if (window.ENG && ENG.migrateSave) ENG.migrateSave(s);
  return s;
}
function saveGame() {
  if (!G.S || G.slotIdx < 0) return Promise.resolve(false);
  G.folder.slots[G.slotIdx] = G.S;
  G.folder.active = G.slotIdx;
  syncGlory();
  try { storeFolder(); } catch (_) {}
  return storeSlot(G.slotIdx, G.S)
    .then(() => true)
    .catch(() => {
      toast('Не удалось сохранить карьеру. Проверьте доступ к хранилищу браузера.');
      return false;
    });
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
  if (screen !== 'desk' && G.screen !== screen && ['squad', 'tactics', 'academy', 'objectives', 'league', 'market', 'player', 'other', 'calendar', 'cups', 'euro', 'inbox', 'money'].includes(G.screen)) G.hist.push(G.screen);
  if (screen === 'desk') G.hist = [];
  if (G.hist.length > 12) G.hist.shift();
  G.screen = screen;
  if (screen === 'calendar' && G.S) {
    G.ui.calendarMonth = G.S.date.slice(0, 7);
    G.ui.calendarDate = G.S.date;
  }
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
function queueImportantMessage(msg, save) {
  if (!G.S || G.S !== save || G.ui.simulatingCalendar) return;
  if (G.ui.importantAlert === msg.id || G.ui.alertQueue.includes(msg.id)) return;
  G.ui.alertQueue.push(msg.id);
}
function showNextImportantMessage() {
  if (G.ui.importantAlert || !G.ui.alertQueue.length) return false;
  let msg = null;
  while (G.ui.alertQueue.length && !msg) {
    const id = G.ui.alertQueue.shift();
    msg = (G.S.inbox || []).find(m => m.id === id);
  }
  if (!msg) return false;
  G.ui.importantAlert = msg.id;
  msg.read = true;
  saveGame();
  render();
  return true;
}
function flushImportantMessages() {
  if (!G.ui.simulatingCalendar) showNextImportantMessage();
}
function dismissImportantMessage() {
  G.ui.importantAlert = null;
  if (!showNextImportantMessage()) render();
}
function openImportantMessage() {
  const msg = (G.S.inbox || []).find(m => m.id === G.ui.importantAlert);
  if (!msg) { dismissImportantMessage(); return; }
  msg.read = true;
  G.ui.inboxOpen[msg.id] = true;
  G.ui.focusedMessage = msg.id;
  G.ui.importantAlert = null;
  saveGame();
  go('inbox');
  setTimeout(() => {
    const el = document.getElementById('message-' + msg.id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 40);
}
window.onImportantMessage = queueImportantMessage;

// ---------- actions ----------
function returnToMenuIfReady() {
  if (!G.S || !ENG.seasonReady(G.S)) return false;
  G.ui.alertQueue = [];
  G.ui.importantAlert = null;
  saveGame();
  go('boot');
  toast('Сезон завершён. Подведите итоги в главном меню.');
  return true;
}
function finishSeasonFromMenu() {
  if (!G.S || G.ui.seasonClosing) return;
  if (!ENG.seasonReady(G.S)) { toast('Итоги можно подвести 1 июня.'); return; }
  G.ui.seasonClosing = true;
  G.ui.closeProgress = 'Считаем таблицы и итоги сезона…';
  render();
  setTimeout(async () => {
    try {
      ENG.endSeason(G.S);
      const saved = await saveGame();
      toast(saved ? 'Сезон закрыт. Новый сезон ' + G.S.season + '/' + (G.S.season + 1) + '.' : 'Сезон закрыт, но сохранение не записано.');
    } catch (err) {
      console.error(err);
      toast('Не удалось закрыть сезон. Попробуйте ещё раз.');
    } finally {
      G.ui.seasonClosing = false;
      G.ui.closeProgress = '';
      go('boot');
    }
  }, 80);
}
function openCareer(i) {
  const save = G.folder.slots[i];
  if (!save) return;
  G.S = migrate(save);
  ENG.setCurrency(G.S.currency || G.folder.settings.currency || 'rub');
  G.slotIdx = i;
  G.folder.active = i;
  storeFolder();
  go(G.S.sacked ? 'sacked' : ENG.seasonReady(G.S) ? 'boot' : 'desk');
}
const ACT = {
  // boot
  'menu-continue'() {
    const i = G.folder.active >= 0 && G.folder.slots[G.folder.active] ? G.folder.active : G.folder.slots.findIndex(Boolean);
    if (i < 0) { toast('Создайте первую карьеру.'); return; }
    openCareer(i);
  },
  'menu-create'() {
    const i = G.folder.slots.findIndex(s => !s);
    if (i < 0) { go('slots'); toast('Все три карьеры заняты. Выберите слот для новой карьеры.'); return; }
    G.slotIdx = i;
    G.ui.pickLeague = 'rpl'; G.ui.pickCountry = 'ru';
    go('pick');
  },
  'menu-settings'() { go('settings'); },
  'menu-slots'() { go('slots'); },
  'slot-continue'(el) { openCareer(+el.dataset.i); },
  'slot-new'(el) {
    G.slotIdx = +el.dataset.i;
    G.ui.pickLeague = 'rpl'; G.ui.pickCountry = 'ru';
    go('pick');
  },
  'slot-delete'(el) {
    const i = +el.dataset.i;
    if (!confirm('Удалить карьеру из слота ' + (i + 1) + '?')) return;
    deleteSlot(i);
    if (G.slotIdx === i) { G.S = null; G.slotIdx = -1; }
    toast('Слот ' + (i + 1) + ' свободен.');
    go('slots');
  },
  'slots-back'() { go('boot'); },
  'settings-back'() { go('boot'); },
  'honors'() { go('honors'); },
  'honors-back'() { go('boot'); },
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
    S.difficulty = G.folder.settings.difficulty;
    S.matchMins = G.folder.settings.matchMins;
    S.currency = G.folder.settings.currency || 'rub';
    ENG.setCurrency(S.currency);
    const d = G.ui.kitDraft || UI.kitDefaults(club);
    S.kit = { home: Object.assign({}, d.home), away: Object.assign({}, d.away), goal: Object.assign({}, d.goal) };
    G.S = S;
    G.folder.slots[G.slotIdx] = S;
    saveGame();
    toast('Карьера начата в «' + club.name + '».');
    go('desk');
  },
  // desk / nav
  'nav'(el) {
    const target = el.dataset.v;
    if (window.MatchView && MatchView.active && G.screen === 'match-live' && ['squad', 'tactics'].includes(target)) {
      MatchView.pauseForMenu();
      G.ui.matchTab = 'tactics';
      G.sheet = { kind: 'match', title: 'Тактика и состав', html: MENU_HTML() };
      render();
      return;
    }
    go(target);
  },
  'euro-comp'(el) { G.ui.euroComp = el.dataset.v; render(); },
  'euro-view'(el) { G.ui.euroComp = el.dataset.v; go('euro'); },
  'euro-level'(el) { G.ui.euroLevel = el.dataset.v; render(); },
  'open-match'(el) {
    const fx = fxById(el.dataset.id);
    if (!fx) return;
    G.ui.fxId = fx.id; go('match-pre');
  },
  'next-day'(el) {
    ENG.advanceDay(G.S);
    saveGame();
    if (returnToMenuIfReady()) return;
    if (G.S.sacked) { go('sacked'); flushImportantMessages(); return; }
    go('calendar');
    flushImportantMessages();
  },
  'calendar-month'(el) {
    const d = ENG.toDate((G.ui.calendarMonth || G.S.date.slice(0, 7)) + '-01');
    d.setMonth(d.getMonth() + +el.dataset.v);
    G.ui.calendarMonth = ENG.toISO(d).slice(0, 7);
    G.ui.calendarDate = ENG.toISO(d);
    render();
  },
  'calendar-date'(el) {
    G.ui.calendarDate = el.dataset.v;
    G.ui.calendarMonth = el.dataset.v.slice(0, 7);
    render();
  },
  'calendar-today'() {
    G.ui.calendarMonth = G.S.date.slice(0, 7);
    G.ui.calendarDate = G.S.date;
    render();
  },
  'calendar-simulate'(el) {
    const cutoff = ENG.seasonCutoff(G.S);
    const target = (G.ui.calendarDate || G.S.date) > cutoff ? cutoff : (G.ui.calendarDate || G.S.date);
    if (target <= G.S.date) { toast('Этот день уже наступил.'); return; }
    const skipped = G.S.fixtures.filter(f => f.date && !f.played && f.date > G.S.date && f.date <= target &&
      (f.home === G.S.clubId || f.away === G.S.clubId));
    if (skipped.length && !confirm('Досимитировать до ' + ENG.fmtDate(target) + '? Ваших пропущенных матчей: ' + skipped.length + '. Они будут сыграны помощником.')) return;
    let days = 0;
    G.ui.simulatingCalendar = true;
    try {
      while (G.S.date < target && !ENG.seasonReady(G.S) && !G.S.sacked && days < 400) { ENG.advanceDay(G.S); days++; }
    } finally {
      G.ui.simulatingCalendar = false;
    }
    saveGame();
    if (returnToMenuIfReady()) return;
    if (G.S.sacked) { go('sacked'); return; }
    G.ui.calendarMonth = G.S.date.slice(0, 7);
    G.ui.calendarDate = G.S.date;
    render();
    toast('Симулировано дней: ' + days + '. Пропущенные матчи закрыты помощником.');
  },
  'season-close'() { finishSeasonFromMenu(); },
  'season-close-from-menu'() { finishSeasonFromMenu(); },
  'train'(el) {
    if (ENG.train(G.S, el.dataset.v)) {
      toast('Тренировка: ' + el.dataset.v + '. Фокус до конца матча.');
      saveGame();
    } else toast('Сегодня тренировка уже была.');
    go('tactics');
  },
  // squad, academy & player
  'squad-filter'(el) { G.ui.squadFilter = el.dataset.v; go('squad'); },
  'academy-filter'(el) { G.ui.academyFilter = el.dataset.v; render(); },
  'academy-sort'(el) { G.ui.academySort = el.dataset.v; render(); },
  'academy-train'() {
    const r = ENG.trainYouth(G.S);
    if (r.ok) { saveGame(); toast('Тренировка завершена. Рост игроков: ' + r.grown + '.'); }
    else toast(r.why === 'money' ? 'Не хватает 0.5 млн ₽ на развитие.' : 'Следующая развивающая тренировка будет доступна через неделю.');
    render();
  },
  'promote-youth'(el) {
    if (ENG.promoteYouth(G.S, el.dataset.pid)) { saveGame(); toast('Игрок подписал профессиональный контракт.'); }
    go('academy');
  },
  'release-youth'(el) {
    if (!confirm('Отпустить игрока из академии?')) return;
    ENG.releaseYouth(G.S, el.dataset.pid);
    saveGame(); toast('В академию приглашён новый игрок.'); go('academy');
  },
  'bench-open'() {
    if (window.MatchView && MatchView.active && G.screen === 'match-live') {
      MatchView.pauseForMenu();
      G.ui.matchTab = 'tactics';
      G.sheet = { kind: 'match', title: 'Запас', html: MENU_HTML() };
      render();
      return;
    }
    openSheet('Замены', UI.benchSheetHtml());
  },
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
    const rawFee = +(document.getElementById('bid-fee') || {}).value;
    const perRub = (ENG.curDef() || { perRub: 1 }).perRub;
    const fee = rawFee ? rawFee * perRub : p.value; // ввод в млн выбранной валюты
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
    G.ui.selectedSlot = -1;
    refreshAfterTacticsChange();
  },
  'style'(el) {
    const preset = GD.TACTICS.find(t => t.id === el.dataset.v);
    Object.assign(G.S.tactics, { style: preset.id, mentality: preset.mentality, press: preset.press, tempo: preset.tempo, line: preset.line, width: preset.width });
    refreshAfterTacticsChange();
  },
  'tac-auto'(el) {
    G.S.tactics.slots = ENG.autoLineup(G.S, G.S.clubId, G.S.tactics.formation).map(x => x.pid);
    G.ui.selectedSlot = -1;
    refreshAfterTacticsChange();
  },
  'slot-select'(el) {
    G.ui.selectedSlot = G.ui.selectedSlot === +el.dataset.i ? -1 : +el.dataset.i;
    refreshAfterTacticsChange();
  },
  'assign'(el) {
    const i = G.ui.selectedSlot;
    if (i >= 0) {
      if (inLiveMatch()) {
        const target = ENG.lineupPlayers(G.S, G.S.clubId, G.S.tactics).find(s => s.slot === i);
        if (target) MatchView.doUserSub(target.pid, el.dataset.pid);
      } else {
        G.S.tactics.slots[i] = el.dataset.pid;
      }
      saveGame();
    }
    G.ui.selectedSlot = -1;
    refreshAfterTacticsChange();
  },
  'slider'(el) {
    const key = el.dataset.k;
    G.S.tactics[key] = +el.value;
    saveGame();
    UI.updateTacticSlider(el);
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
  'market-sort-dir'(el) { G.ui.marketSortDir = G.ui.marketSortDir === 'asc' ? 'desc' : 'asc'; go('market'); },
  'market-floor'(el) { G.ui.marketFloor = +el.value; renderMarketList(); },
  // inbox
  'msg-open'(el) {
    const id = el.dataset.id;
    const m = G.S.inbox.find(x => x.id === id);
    if (m) m.read = true;
    G.ui.inboxOpen[id] = !G.ui.inboxOpen[id];
    G.ui.focusedMessage = id;
    saveGame(); render();
  },
  'inbox-filter'(el) { G.ui.inboxFilter = el.dataset.v; render(); },
  'msg-player'(el) { G.ui.viewingPlayer = el.dataset.id; go('player'); },
  'important-open'() { openImportantMessage(); },
  'dismiss-important'() { dismissImportantMessage(); },
  'offer-accept'(el) {
    if (ENG.acceptOfferById(G.S, +el.dataset.i)) { saveGame(); toast('Сделка состоялась.'); }
    render();
  },
  'offer-refuse'(el) {
    G.S.offers.splice(+el.dataset.i, 1);
    saveGame(); render();
  },
  // settings
  'difficulty'(el) {
    if (G.S) { G.S.difficulty = el.dataset.v; saveGame(); }
    else { G.folder.settings.difficulty = el.dataset.v; storeFolder(); }
    toast('Сложность: ' + el.textContent.trim());
    render();
  },
  'matchmins'(el) {
    if (G.S) { G.S.matchMins = +el.dataset.v; saveGame(); }
    else { G.folder.settings.matchMins = +el.dataset.v; storeFolder(); }
    toast('Время матча: ' + el.dataset.v + ' мин.');
    render();
  },
  'currency'(el) {
    ENG.setCurrency(el.dataset.v);
    const name = (ENG.curDef() || {}).name || el.dataset.v;
    if (G.S) { G.S.currency = el.dataset.v; saveGame(); }
    else { G.folder.settings.currency = el.dataset.v; storeFolder(); }
    toast('Валюта: ' + name);
    render();
  },
  'manual-save'(el) {
    if (!G.S) { toast('Сначала выберите клуб.'); return; }
    saveGame(); toast('Карьера записана в этот кабинет.');
  },
  'resign'() {
    if (!confirm('Расторгнуть контракт и стать свободным агентом?')) return;
    ENG.resign(G.S);
    saveGame(); toast('Вы свободны от контракта.'); go('sacked');
  },
  'delete-career'(el) {
    if (!confirm('Точно удалить карьеру')) return;
    deleteSlot(G.slotIdx);
    G.S = null; G.slotIdx = -1;
    toast('Карьера удалена. Заслуги этого кабинета остались.');
    go('boot');
  },
  // free agent / vacancies
  'take-job'(el) {
    if (!ENG.takeJob(G.S, el.dataset.id)) return;
    saveGame();
    toast('Подписан контракт с «' + ENG.myClub(G.S).name + '».');
    go('desk');
  },
  'career-wait'() {
    for (let i = 0; i < 7 && !ENG.seasonReady(G.S); i++) ENG.advanceDay(G.S);
    saveGame();
    if (returnToMenuIfReady()) return;
    render(); toast('Прошла неделя. Проверьте почту и предложения.');
    flushImportantMessages();
  },
  'career-league'(el) { G.ui.careerLeague = el.dataset.v; render(); },
  'career-apply'(el) {
    const r = ENG.applyForJob(G.S, el.dataset.id);
    if (r.ok) { saveGame(); toast('Заявка отправлена. Клуб ответит через несколько дней.'); }
    else toast({ pending: 'Вы уже отправили заявку в этот клуб.', offered: 'Этот клуб уже сделал вам предложение.', unavailable: 'Сейчас нельзя отправить заявку.' }[r.why]);
    render();
  },
  'restart'(el) {
    deleteSlot(G.slotIdx);
    G.S = null; G.slotIdx = -1;
    go('boot');
  },
  'close-sheet'(el) { closeSheet(); },
  // match screens
  'watch-live'(el) {
    G.ui.menuOut = null; G.ui.liveSubsUsed = 0; G.ui.matchTab = 'controls';
    go('match-live');
  },
  'watch-instant'(el) {
    const fx = fxById(G.ui.fxId);
    const r = ENG.instantMatch(G.S, fx.home, fx.away, G.S.season + ':' + fx.id + ':' + G.S.date);
    ENG.postMatch(G.S, fx, r, null);
    saveGame();
    if (G.S.sacked) { go('sacked'); flushImportantMessages(); return; }
    G.ui.lastResult = { fx, r, live: null };
    go('match-end');
    flushImportantMessages();
  },
  'match-menu-open'(el) {
    if (window.MatchView && MatchView.active) MatchView.pauseForMenu();
    G.ui.matchTab = 'controls';
    G.sheet = { kind: 'match', title: 'Меню матча', html: MENU_HTML() };
    render();
  },
  'match-timeout'(el) {
    if (window.MatchView && MatchView.active) MatchView.pauseForMenu();
    G.ui.matchTab = 'subs';
    G.sheet = { kind: 'match', title: 'Тайм-аут · замены', html: MENU_HTML() };
    render();
  },
  'match-resume'(el) { closeSheet(); if (window.MatchView) MatchView.resume(); },
  'match-second-half'(el) { closeSheet(); if (window.MatchView) MatchView.secondHalf(); },
  'match-pause'(el) { if (window.MatchView) MatchView.togglePause(); },
  'match-speed'(el) { if (window.MatchView) MatchView.setSpeed(el.dataset.v); },
  'match-tab'(el) {
    G.ui.matchTab = el.dataset.v;
    G.sheet = { kind: 'match', title: 'Меню матча', html: MENU_HTML() };
    render();
  },
  'menu-cancel-sub'() {
    G.ui.menuOut = null;
    G.sheet = { kind: 'match', title: 'Замены', html: MENU_HTML() };
    render();
  },
  'live-sub'(el) {
    const ok = window.MatchView && MatchView.doUserSub(el.dataset.out, el.dataset.inn);
    if (ok) saveGame();
    closeSheet();
    if (ok && window.MatchView && MatchView.active && !MatchView.halftime) MatchView.resume();
  },
  'match-back'(el) { go('desk'); },
  'trophy-honors'(el) { saveGame(); go('honors'); },
  'landscape'(el) { document.body.classList.toggle('wide-canvas'); },
  'sheet-only'(el) {},
};
function inLiveMatch() {
  return !!(window.MatchView && MatchView.active && G.screen === 'match-live');
}
function refreshAfterTacticsChange() {
  saveGame();
  if (inLiveMatch()) {
    G.ui.matchTab = 'tactics';
    G.sheet = { kind: 'match', title: 'Тактика и состав', html: MENU_HTML() };
    render();
  } else {
    go('tactics');
  }
}
function MENU_TITLE() {
  return window.MatchView && MatchView.htDone ? 'План на ходу' : 'Перерыв';
}
function S_player(id) { return G.S.players.find(p => p.id === id) || (G.S.youth || []).find(p => p.id === id); }
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
window.flushImportantMessages = flushImportantMessages; window.openImportantMessage = openImportantMessage; window.dismissImportantMessage = dismissImportantMessage;
window.saveGame = saveGame; window.fxById = fxById; window.S_player = S_player; window.deviceStamp = deviceStamp;
window.gloryKind = gloryKind; window.shade = shade;
async function boot() {
  G.device = deviceId();
  G.folder = await loadFolder();
  const act = G.folder.active;
  G.S = act >= 0 ? G.folder.slots[act] || null : null;
  if (G.S && G.S.currency) ENG.setCurrency(G.S.currency);
  G.slotIdx = G.S ? act : -1;
  G.screen = 'boot';
  G.sheet = null;
  G.hist = [];
  G.ui.seasonClosing = false;
  G.ui.closeProgress = '';
}
window.boot = boot;
