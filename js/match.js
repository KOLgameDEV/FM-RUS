/* ============================================================
 * MATCH — live view: clock, ticker, canvas pitch renderer
 * ============================================================ */
'use strict';
window.MatchView = (() => {

let live = null, fx = null, timer = null, raf = 0;
let ball = { x: 0.5, y: 0.55, tx: 0.5, ty: 0.55, t: 1 };
let scene = { kind: null, until: 0, caption: '', capUntil: 0 };
let paused = false, waiting45 = false;
const canvas = { ctx: null, w: 0, h: 0 };

const MARGIN = { x: 0.06, ytop: 0.1, ybot: 0.9 };

function anchors(cid, isAway) {
  const S = G.S;
  const tac = ENG.tacOf(S, cid);
  const plan = ENG.lineupPlayers(S, cid, tac);
  const pts = [];
  GD.FORMATIONS[tac.formation].forEach((c, i) => {
    const slot = plan.find(p => p.slot === i);
    if (!slot) return;
    let x = c.x / 100, y = c.y / 100;
    if (isAway) x = 1 - x;
    return pts.push({ pid: slot.pid, x, y, pos: c.pos });
  });
  return pts;
}
function fieldPt(q) {
  return { x: (MARGIN.x + q.x * (1 - 2 * MARGIN.x)) * canvas.w, y: (MARGIN.ytop + q.y * (MARGIN.ybot - MARGIN.ytop)) * canvas.h };
}
function ptsFor(cid) {
  const isAway = cid !== fx.home;
  return anchors(cid, isAway).map(p => Object.assign(p, { home: !isAway }));
}
function allPts() { return ptsFor(fx.home).concat(ptsFor(fx.away)); }

function resize() {
  const c = document.getElementById('mpitch');
  if (!c) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const r = c.getBoundingClientRect();
  c.width = r.width * dpr; c.height = r.height * dpr;
  canvas.ctx = c.getContext('2d');
  canvas.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  canvas.w = r.width; canvas.h = r.height;
}

function drawPitch(t) {
  const ctx = canvas.ctx, w = canvas.w, h = canvas.h;
  const band = Math.max(24, w / 12);
  for (let i = 0; i * band < w; i++) {
    ctx.fillStyle = i % 2 ? '#187a40' : '#146536';
    ctx.fillRect(i * band, 0, band, h);
  }
  ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.6;
  const mx = w * 0.04, my = h * 0.07;
  ctx.strokeRect(mx, my, w - 2 * mx, h - 2 * my);
  ctx.beginPath(); ctx.moveTo(w / 2, my); ctx.lineTo(w / 2, h - my); ctx.stroke();
  ctx.beginPath(); ctx.arc(w / 2, h / 2, h * 0.12, 0, 7); ctx.stroke();
  // penalty boxes + goals
  const bw = w * 0.12, bh = h * 0.46;
  ctx.strokeRect(mx, h / 2 - bh / 2, bw, bh);
  ctx.strokeRect(w - mx - bw, h / 2 - bh / 2, bw, bh);
  const gw = h * 0.24;
  ctx.strokeStyle = '#ddd';
  ctx.strokeRect(mx - 8, h / 2 - gw / 2, 8, gw);
  ctx.strokeRect(w - mx, h / 2 - gw / 2, 8, gw);
}
function hex2(c) { return parseInt(String(c).slice(1), 16); }
function colorDist(a, b) {
  const pa = hex2(a), pb = hex2(b);
  return Math.abs((pa >> 16 & 255) - (pb >> 16 & 255)) + Math.abs((pa >> 8 & 255) - (pb >> 8 & 255)) + Math.abs((pa & 255) - (pb & 255));
}
function kitsOf(cid) {
  const S = G.S;
  if (cid === S.clubId) return { field: S.kit.home, goal: S.kit.goal || null };
  const club = ENG.clubById(S, cid) || { color: '#cccccc', color2: '#333333' };
  const k = ENG.defaultKit(club, ENG.fnv(cid));
  return { field: k.home, goal: k.goal };
}
function gkTone(kit, opp) {
  let c = '#f5d000';
  if (colorDist(c, opp.primary) < 200) c = '#b6ff3b';
  if (colorDist(c, opp.primary) < 200) c = '#ff8c42';
  return c;
}
function gkKit(team, opp) {
  return team.goal || { primary: gkTone(team.field, opp.field), secondary: '#1a1a1a', shorts: '#1a1a1a', socks: '#1a1a1a' };
}
function inkOf(hex) {
  const n = parseInt(String(hex).slice(1), 16) || 0;
  return (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255 > 0.62 ? '#15181a' : '#ffffff';
}
function drawPlayer(ctx, x, y, kit, phase, num) {
  const s = Math.max(10, canvas.h * 0.045);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath(); ctx.ellipse(0, s * 0.9, s * 0.55, s * 0.16, 0, 0, 7); ctx.fill();
  const swing = Math.sin(phase) * s * 0.35;
  // legs
  ctx.strokeStyle = kit.socks || kit.primary; ctx.lineWidth = s * 0.18; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-s * 0.12, s * 0.2); ctx.lineTo(-s * 0.12 + swing, s * 0.85); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s * 0.12, s * 0.2); ctx.lineTo(s * 0.12 - swing, s * 0.85); ctx.stroke();
  // shorts
  ctx.fillStyle = kit.shorts || kit.secondary || '#fff';
  ctx.fillRect(-s * 0.28, s * 0.05, s * 0.56, s * 0.22);
  // shirt
  ctx.fillStyle = kit.primary;
  ctx.fillRect(-s * 0.34, -s * 0.5, s * 0.68, s * 0.6);
  // sleeve accent
  ctx.fillStyle = kit.secondary || '#fff';
  ctx.fillRect(-s * 0.5, -s * 0.45, s * 0.14, s * 0.3);
  ctx.fillRect(s * 0.36, -s * 0.45, s * 0.14, s * 0.3);
  // head
  ctx.fillStyle = '#e2b48a';
  ctx.beginPath(); ctx.arc(0, -s * 0.72, s * 0.24, 0, 7); ctx.fill();
  // number
  ctx.fillStyle = inkOf(kit.primary); ctx.font = `700 ${Math.round(s * 0.42)}px Outfit, Manrope, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(num, 0, -s * 0.16);
  ctx.restore();
}
function drawBall(ctx, x, y, t) {
  const r = Math.max(4, canvas.h * 0.016);
  ctx.save(); ctx.translate(x, y); ctx.rotate(t * 2.2);
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5 - Math.PI / 2;
    ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5);
  }
  ctx.closePath(); ctx.fill();
  ctx.restore();
}
function caption(ctx, text) {
  if (!text) return;
  ctx.font = '600 13px Manrope, sans-serif';
  const w = ctx.measureText(text).width + 22;
  ctx.fillStyle = 'rgba(12,16,14,.82)';
  ctx.fillRect(canvas.w / 2 - w / 2, 12, w, 26);
  ctx.fillStyle = '#d6a85c';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.w / 2, 25);
}
function locate(pid) {
  const S = G.S;
  const side = fx.home === S.players.find(p => p.id === pid)?.clubId ? ptsFor(fx.home) : ptsFor(fx.away);
  let p = side.find(q => q.pid === pid);
  if (!p) {
    const other = side === ptsFor(fx.home) ? ptsFor(fx.away) : ptsFor(fx.home);
    p = other.find(q => q.pid === pid);
  }
  return p || null;
}
function drawFrame(ts) {
  const ctx = canvas.ctx;
  if (!ctx || !live) return;
  const t = ts / 1000;
  drawPitch(t);
  const hk = kitsOf(fx.home), ak = kitsOf(fx.away);
  const pts = allPts();
  pts.forEach((q, i) => {
    const p = S_player(q.pid);
    if (!p) return;
    const fp = fieldPt(q);
    const isUserMoving = scene.kind === 'pass' && scene.movedPids && scene.movedPids.includes(q.pid);
    const bob = (Math.sin(t * 0.52 + i) + 1) / 2;
    const swing = Math.sin(t * 0.84) * 4 * (isUserMoving ? 2 : 0.3);
    const opp = q.home ? ak : hk;
    const team = q.home ? hk : ak;
    const kit = q.pos === 'GK' ? gkKit(team, opp) : team.field;
    drawPlayer(ctx, fp.x + swing * 0.2, fp.y - bob * 2, kit, isUserMoving ? t * 8 : t * 2 + i, p.number);
  });
  // ball
  const bx = MARGIN.x * 0 + ball.x * canvas.w, by = (MARGIN.ytop + ball.y * (MARGIN.ybot - MARGIN.ytop)) * canvas.h;
  drawBall(ctx, bx, by, t);
  if ((scene.kind === 'pen' || scene.kind === 'fk') && scene.caption && Date.now() < scene.until) caption(ctx, scene.caption);
  raf = requestAnimationFrame(drawFrame);
}

function moveBallTo(pid, dur) {
  const q = locate(pid);
  if (!q) return;
  ball.tx = MARGIN.x + q.x * (1 - 2 * MARGIN.x);
  ball.ty = q.y;
  ball.t = 0;
  const sx = ball.x, sy = ball.y, steps = (dur || 0.62) * 60;
  let step = 0;
  const anim = () => {
    step++;
    const k = Math.min(1, step / steps);
    ball.x = sx + (ball.tx - sx) * k;
    ball.y = sy + (ball.ty - sy) * k;
    if (k < 1 && live) requestAnimationFrame(anim);
  };
  anim();
}

function setScore() {
  const hs = document.getElementById('lv-score');
  if (!hs || !live) return;
  hs.textContent = live.hg + ':' + live.ag;
  const info = document.getElementById('lv-info');
  if (info) {
    const opp = ENG.clubById(G.S, fx.home === G.S.clubId ? fx.away : fx.home);
    info.textContent = (fx.label || 'Тур ' + fx.round) + ' · ' + Math.min(90, live.minute) + "' · xG " + live.xgH.toFixed(2) + ':' + live.xgA.toFixed(2);
  }
  const A = ENG.clubById(G.S, fx.home), B = ENG.clubById(G.S, fx.away);
  document.getElementById('lv-hs').textContent = A.short;
  document.getElementById('lv-as').textContent = B.short;
}
function ticker(html) {
  const el = document.getElementById('lv-ticker');
  if (el) el.innerHTML = html;
}
function onEvents(evs) {
  const S = G.S;
  evs.forEach(e => {
    if (e.pid) moveBallTo(e.pid, 0.62);
    const mine = (e.side === 'h' && fx.home === S.clubId) || (e.side === 'a' && fx.away === S.clubId);
    if (e.kind === 'goal') {
      ticker(`<b>${e.min}'</b> ГОЛ! ${esc(e.text)} — <b>${live.hg}:${live.ag}</b>`);
      scene.kind = 'shot'; scene.caption = 'Гол · ' + e.min + "'";
      if (e.piece === 'pen') scene.kind = 'pen'; scene.until = Date.now() + 4000;
      if (e.piece === 'fk') { scene.kind = 'fk'; scene.until = Date.now() + 4000; }
    } else if (e.kind === 'save' && e.piece === 'pen') {
      scene.kind = 'pen'; scene.until = Date.now() + 4000; scene.until = Date.now() + 4000; ticker(`<b>${e.min}'</b> Пенальти! ${esc(e.text)}`);
    } else if (e.kind === 'save') ticker(`<b>${e.min}'</b> ${esc(e.text)}`);
    else if (e.kind === 'card') ticker(`<b>${e.min}'</b> Жёлтая карточка: ${esc(e.text)}`);
    else if (e.kind === 'sub') ticker(`<b>${e.min}'</b> Замена: ${esc(e.text)}`);
    else if (e.kind === 'injury') ticker(`<b>${e.min}'</b> ${esc(e.text)}`);
    else if (e.kind === 'corner') { scene.kind = 'corner'; ticker(`<b>${e.min}'</b> Угловой. ${esc(e.text)}`); }
    else if (e.kind === 'throwin') ticker(`<b>${e.min}'</b> ${esc(e.text)}`);
    else if (e.kind === 'poss' && Math.random() < 0.7) ticker(`<b>${e.min}'</b> ${esc(e.text)}`);
    else if (e.kind === 'miss' || e.kind === 'block') ticker(`<b>${e.min}'</b> ${esc(e.text)}`);
    setScore();
  });
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function tick() {
  const S = G.S;
  if (paused || !live || live.over) return;
  const evs = ENG.liveStep(S, live, 1);
  if (evs.length) onEvents(evs);
  // cond drain handled in engine liveStep? engine only drains per match; ok
  setScore();
  if (live.halftime && !waiting45) {
    waiting45 = true; paused = true;
    MatchView.htDone = false;
    autoSubOpp();
    G.sheet = { html: MENU_HTML() };
    UI.render();
    // render() replaced canvas contents? screen is still match-live; MatchView.active keeps loop
    setTimeout(() => { const c = document.getElementById('mpitch'); if (c) { resize(); } }, 30);
  }
  if (live.over) finish();
}
function autoSubOpp() {
  const S = G.S;
  const oppId = fx.home === S.clubId ? fx.away : fx.home;
  const tac = ENG.tacOf(S, oppId);
  const plan = ENG.lineupPlayers(S, oppId, tac);
  const squad = ENG.playersOf(S, oppId);
  const starterObjs = plan.map(p => S_player(p.pid)).filter(Boolean);
  const coldest = starterObjs.filter(p => p.pos !== 'GK').sort((a, b) => a.cond - b.cond)[0];
  const best = squad.filter(p => !plan.some(s => s.pid === p.id) && !p.injured).sort((a, b) => b.ovr - a.ovr)[0];
  if (coldest && best && best.ovr > coldest.ovr) ENG.applyLiveSub(S, live, oppId, coldest.id, best.id);
}
function finish() {
  paused = true;
  const S = G.S;
  ticker(`<b>${Math.min(90, live.minute)}'</b> Финальный свисток. Матч закончен, оценки уже у аналитиков.`);
  ENG.postMatch(S, fx, { hg: live.hg, ag: live.ag, xgH: live.xgH, xgA: live.xgA }, live);
  UI.render();
  saveGame();
  G.ui.lastResult = { fx, r: { hg: live.hg, ag: live.ag, xgH: live.xgH, xgA: live.xgA }, live };
  setTimeout(() => { active = false; go('match-end'); }, 1400);
}

let active = false;
function start() {
  const S = G.S;
  if (active) { resize(); setScore(); return; }
  fx = fxById(G.ui.fxId);
  if (!fx) { go('desk'); return; }
  if (fx.played) { toast('Матч уже сыгран.'); go('desk'); return; }
  active = true;
  MatchView.active = true;
  live = ENG.createLive(S, fx);
  waiting45 = false; paused = false; MatchView.htDone = false;
  ball = { x: 0.5, y: 0.55, tx: 0.5, ty: 0.55 };
  scene = { kind: null, caption: '', until: 0 };
  resize();
  setScore();
  raf = requestAnimationFrame(drawFrame);
  const tickMs = Math.max(700, (G.S.matchMins || 2) * 60 * 1000 / 90);
  timer = setInterval(tick, tickMs);
}
function stop() {
  clearInterval(timer); cancelAnimationFrame(raf);
  timer = null; raf = 0; active = false; MatchView.active = false;
}
function resume() {
  if (!live) return;
  paused = false;
  waiting45 = false;
  live.halftime = false;
  closeSheet();
}
function secondHalf() {
  waiting45 = false;
  if (live) live.halftime = false;
  paused = false;
  MatchView.htDone = true;
  closeSheet();
}
function doUserSub(outPid, inPid) {
  const S = G.S;
  if (live.subsUsed >= 5) { toast('Все 5 замен использованы.'); return; }
  if (ENG.applyLiveSub(S, live, S.clubId, outPid, inPid)) {
    G.ui.liveSubsUsed = live.subsUsed;
    toast('Замена исполнена при паузе.');
  } else toast('Не удалось провести замену.');
}
window.addEventListener('resize', () => { if (active) resize(); });
return {
  get active() { return active; },
  set active(v) { active = v; },
  start, stop, resume, secondHalf, doUserSub,
  get htDone() { return this._ht; }, set htDone(v) { this._ht = v; },
};
})();
