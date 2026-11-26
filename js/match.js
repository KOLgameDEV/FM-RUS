'use strict';
window.MatchView = (() => {

let live = null, fx = null, timer = null, raf = 0;
let ball = { x: .5, y: .55, z: 0, sx: .5, sy: .55, tx: .5, ty: .55, progress: 1, duration: .6, arc: 0, spin: 0, owner: null };
let scene = { kind: null, until: 0, caption: '', capUntil: 0 };
let paused = false, waiting45 = false, active = false, htDone = false;
let speed = 1, tickAccumulator = 0, animTime = 0, lastFrame = 0;
const playerStates = new Map();
const canvas = { ctx: null, w: 0, h: 0 };
const MARGIN = { x: .06, ytop: .1, ybot: .9 };
const SPEEDS = [.5, 1, 2, 4, 8];

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function smooth(k) { return k * k * (3 - 2 * k); }
function hashPhase(pid) { return (ENG.fnv(String(pid)) % 1000) / 1000 * Math.PI * 2; }

function anchorCoords(c, tac, isAway) {
  const ment = (tac.mentality || 0) * 1.8;
  const ln = (tac.line || 2) - 2;
  const press = (tac.press || 2) - 2;
  const wid = ((tac.width || 2) - 2) * 2.2;
  let x = c.x + (c.y > 60 ? 0 : wid * (c.x < 50 ? -1 : 1)) * (c.y > 30 ? 1 : .6);
  let y = c.y - ment - (c.y > 50 ? ln * 2 : ln * 3) - press * 1.2;
  x = clamp(x, 6, 94) / 100;
  y = clamp(y, 8, 94) / 100;
  if (isAway) { x = 1 - x; y = 1 - y; }
  return { x, y, pos: c.pos };
}
function anchors(cid, isAway) {
  const S = G.S;
  const tac = ENG.tacOf(S, cid);
  const plan = ENG.lineupPlayers(S, cid, tac);
  const pts = [];
  GD.FORMATIONS[tac.formation].forEach((c, i) => {
    const slot = plan.find(p => p.slot === i);
    if (!slot) return;
    pts.push(Object.assign({ pid: slot.pid }, anchorCoords(c, tac, isAway)));
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
  canvas.w = r.width;
  canvas.h = r.height;
  c.width = Math.round(r.width * dpr);
  c.height = Math.round(r.height * dpr);
  canvas.ctx = c.getContext('2d');
  canvas.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawPitch() {
  const ctx = canvas.ctx, w = canvas.w, h = canvas.h;
  const left = w * MARGIN.x, right = w * (1 - MARGIN.x);
  const top = h * MARGIN.ytop, bottom = h * MARGIN.ybot;
  const fw = right - left, fh = bottom - top;
  ctx.fillStyle = '#0b2d1b';
  ctx.fillRect(0, 0, w, h);
  const band = Math.max(22, fh / 12);
  for (let y = top, i = 0; y < bottom; y += band, i++) {
    ctx.fillStyle = i % 2 ? '#176e3b' : '#125f32';
    ctx.fillRect(left, y, fw, Math.min(band, bottom - y));
  }
  const shade = ctx.createLinearGradient(0, 0, 0, h);
  shade.addColorStop(0, 'rgba(0,0,0,.16)');
  shade.addColorStop(.5, 'rgba(255,255,255,.025)');
  shade.addColorStop(1, 'rgba(0,0,0,.2)');
  ctx.fillStyle = shade;
  ctx.fillRect(left, top, fw, fh);
  ctx.strokeStyle = 'rgba(238,248,239,.82)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(left, top, fw, fh);
  ctx.beginPath(); ctx.moveTo(left, h / 2); ctx.lineTo(right, h / 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(w / 2, h / 2, Math.min(fw, fh) * .145, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(238,248,239,.9)';
  ctx.beginPath(); ctx.arc(w / 2, h / 2, 2.2, 0, Math.PI * 2); ctx.fill();
  const boxW = fw * .58, boxH = fh * .16, sixW = fw * .28, sixH = fh * .055;
  ctx.strokeRect(w / 2 - boxW / 2, top, boxW, boxH);
  ctx.strokeRect(w / 2 - boxW / 2, bottom - boxH, boxW, boxH);
  ctx.strokeRect(w / 2 - sixW / 2, top, sixW, sixH);
  ctx.strokeRect(w / 2 - sixW / 2, bottom - sixH, sixW, sixH);
  const spotTop = top + fh * .11, spotBottom = bottom - fh * .11;
  const arcR = fh * .09;
  ctx.beginPath(); ctx.arc(w / 2, spotTop, arcR, 0, Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.arc(w / 2, spotBottom, arcR, Math.PI, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(w / 2, spotTop, 2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(w / 2, spotBottom, 2, 0, Math.PI * 2); ctx.fill();
  const corner = Math.min(12, fw * .025);
  [[left, top, 0], [right, top, Math.PI / 2], [right, bottom, Math.PI], [left, bottom, Math.PI * 1.5]].forEach(([x, y, a]) => {
    ctx.beginPath(); ctx.arc(x, y, corner, a, a + Math.PI / 2); ctx.stroke();
  });
  const goalW = fw * .18, goalD = Math.max(8, h * .025);
  ctx.strokeStyle = 'rgba(235,240,236,.9)';
  ctx.strokeRect(w / 2 - goalW / 2, top - goalD, goalW, goalD);
  ctx.strokeRect(w / 2 - goalW / 2, bottom, goalW, goalD);
  ctx.strokeStyle = 'rgba(235,240,236,.25)';
  ctx.lineWidth = .7;
  for (let i = 1; i < 6; i++) {
    const x = w / 2 - goalW / 2 + goalW * i / 6;
    ctx.beginPath(); ctx.moveTo(x, top - goalD); ctx.lineTo(x, top); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, bottom); ctx.lineTo(x, bottom + goalD); ctx.stroke();
  }
  for (let i = 1; i < 3; i++) {
    const y1 = top - goalD + goalD * i / 3, y2 = bottom + goalD * i / 3;
    ctx.beginPath(); ctx.moveTo(w / 2 - goalW / 2, y1); ctx.lineTo(w / 2 + goalW / 2, y1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w / 2 - goalW / 2, y2); ctx.lineTo(w / 2 + goalW / 2, y2); ctx.stroke();
  }
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
  return (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255 > .62 ? '#15181a' : '#ffffff';
}
function drawPlayer(ctx, x, y, kit, st, num) {
  const s = clamp(canvas.h * .041, 11, 18);
  const run = clamp(Math.hypot(st.vx, st.vy) * 22 + (ball.owner === st.pid ? .32 : 0), 0, 1);
  const phase = animTime * (4.5 + run * 8) + st.phase;
  const swing = Math.sin(phase) * s * (.12 + run * .34);
  const lean = clamp(st.vx * 2.2, -.2, .2);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,.34)';
  ctx.beginPath(); ctx.ellipse(0, s * .82, s * (.5 + run * .08), s * .15, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(lean);
  ctx.lineCap = 'round';
  ctx.strokeStyle = kit.socks || kit.primary;
  ctx.lineWidth = s * .17;
  ctx.beginPath(); ctx.moveTo(-s * .13, s * .18); ctx.lineTo(-s * .13 + swing, s * .78); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s * .13, s * .18); ctx.lineTo(s * .13 - swing, s * .78); ctx.stroke();
  ctx.strokeStyle = '#202522';
  ctx.lineWidth = s * .12;
  ctx.beginPath(); ctx.moveTo(-s * .13 + swing, s * .78); ctx.lineTo(-s * .13 + swing + s * .12, s * .82); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s * .13 - swing, s * .78); ctx.lineTo(s * .13 - swing + s * .12, s * .82); ctx.stroke();
  ctx.strokeStyle = '#d5a57f';
  ctx.lineWidth = s * .13;
  ctx.beginPath(); ctx.moveTo(-s * .28, -s * .3); ctx.lineTo(-s * .42, -s * .05 - swing * .45); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s * .28, -s * .3); ctx.lineTo(s * .42, -s * .05 + swing * .45); ctx.stroke();
  ctx.fillStyle = kit.shorts || kit.secondary || '#fff';
  ctx.fillRect(-s * .27, s * .02, s * .54, s * .23);
  ctx.fillStyle = kit.primary;
  ctx.beginPath();
  ctx.moveTo(-s * .22, -s * .48); ctx.lineTo(s * .22, -s * .48); ctx.lineTo(s * .32, -s * .2);
  ctx.lineTo(s * .25, s * .08); ctx.lineTo(-s * .25, s * .08); ctx.lineTo(-s * .32, -s * .2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = kit.secondary || '#fff';
  ctx.fillRect(-s * .32, -s * .38, s * .1, s * .25);
  ctx.fillRect(s * .22, -s * .38, s * .1, s * .25);
  ctx.fillStyle = '#d8aa83';
  ctx.beginPath(); ctx.arc(0, -s * .65, s * .22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#33271f';
  ctx.beginPath(); ctx.arc(0, -s * .72, s * .22, Math.PI, Math.PI * 2); ctx.fill();
  ctx.fillStyle = inkOf(kit.primary);
  ctx.font = `700 ${Math.round(s * .38)}px Outfit, Manrope, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(num, 0, -s * .17);
  ctx.restore();
}
function pentagon(ctx, x, y, r, rot) {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5 + rot;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath(); ctx.fill();
}
function drawBall(ctx, x, y) {
  const r = clamp(canvas.h * .015, 4.5, 8) * (1 + ball.z * .12);
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${.26 - ball.z * .08})`;
  ctx.beginPath(); ctx.ellipse(x, y + ball.z * canvas.h * .055, r * (1.15 - ball.z * .25), r * .38, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(x, y - ball.z * canvas.h * .055);
  ctx.rotate(ball.spin);
  ctx.fillStyle = '#f7f7f2';
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(20,24,22,.55)'; ctx.lineWidth = .7; ctx.stroke();
  ctx.fillStyle = '#17201b';
  pentagon(ctx, 0, 0, r * .34, -Math.PI / 2);
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5 - Math.PI / 2;
    pentagon(ctx, Math.cos(a) * r * .79, Math.sin(a) * r * .79, r * .2, a);
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * .34, Math.sin(a) * r * .34);
    ctx.lineTo(Math.cos(a) * r * .62, Math.sin(a) * r * .62); ctx.stroke();
  }
  ctx.restore();
}
function caption(ctx, text) {
  if (!text) return;
  ctx.font = '700 12px Manrope, sans-serif';
  const w = ctx.measureText(text).width + 24;
  ctx.fillStyle = 'rgba(5,12,9,.86)';
  ctx.fillRect(canvas.w / 2 - w / 2, 10, w, 27);
  ctx.fillStyle = '#e7c477';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.w / 2, 23);
}

function syncPlayerStates(points) {
  const ids = new Set(points.map(p => p.pid));
  playerStates.forEach((_, id) => { if (!ids.has(id)) playerStates.delete(id); });
  points.forEach(q => {
    let st = playerStates.get(q.pid);
    if (!st) {
      st = { pid: q.pid, x: q.x, y: q.y, vx: 0, vy: 0, phase: hashPhase(q.pid) };
      playerStates.set(q.pid, st);
    }
    st.home = q.home;
    st.pos = q.pos;
    st.baseX = q.x;
    st.baseY = q.y;
  });
}
function separatePlayers() {
  const list = [...playerStates.values()];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      let dx = b.x - a.x, dy = (b.y - a.y) * 1.35;
      const d2 = dx * dx + dy * dy;
      if (d2 > .0018 || d2 < .000001) continue;
      const d = Math.sqrt(d2), push = (.0425 - d) * .32;
      dx /= d; dy /= d;
      a.x -= dx * push; b.x += dx * push;
      a.y -= dy * push / 1.35; b.y += dy * push / 1.35;
    }
  }
}
function updatePlayers(dt, points) {
  syncPlayerStates(points);
  const possession = live.possession || (ball.owner ? (playerStates.get(ball.owner)?.home ? 'h' : 'a') : null);
  points.forEach(q => {
    const st = playerStates.get(q.pid);
    const attacking = possession && possession === (st.home ? 'h' : 'a');
    const dir = st.home ? -1 : 1;
    const wide = ['ML', 'MR', 'DL', 'DR'].includes(st.pos);
    let tx = st.baseX + (ball.x - .5) * (wide ? .07 : .17);
    let ty = st.baseY + (attacking ? dir * .052 : -dir * .032) + (ball.y - .5) * (attacking ? .2 : .13);
    if (st.pos === 'GK') {
      tx = st.baseX + (ball.x - .5) * .16;
      ty = st.baseY + (ball.y - .5) * .025;
    } else if (!attacking && possession) {
      const d = Math.hypot(ball.x - st.baseX, ball.y - st.baseY);
      if (d < .24) {
        tx += (ball.x - st.baseX) * .24;
        ty += (ball.y - st.baseY) * .24;
      }
    }
    if (ball.owner === q.pid) {
      tx = ball.x + Math.sin(animTime * 2.1 + st.phase) * .004;
      ty = ball.y + Math.cos(animTime * 1.7 + st.phase) * .005;
    }
    tx += Math.sin(animTime * .7 + st.phase) * .006;
    ty += Math.cos(animTime * .58 + st.phase * 1.3) * .007;
    const oldX = st.x, oldY = st.y;
    const k = Math.min(1, dt * (ball.owner === q.pid ? 8 : 4.2));
    st.x = clamp(st.x + (tx - st.x) * k, .025, .975);
    st.y = clamp(st.y + (ty - st.y) * k, .025, .975);
    st.vx = dt ? (st.x - oldX) / dt : 0;
    st.vy = dt ? (st.y - oldY) / dt : 0;
  });
  separatePlayers();
}
function locate(pid) {
  let st = playerStates.get(pid);
  if (st) return st;
  const points = allPts();
  const q = points.find(p => p.pid === pid);
  if (!q) return null;
  st = { pid, x: q.x, y: q.y, vx: 0, vy: 0, phase: hashPhase(pid), home: q.home, pos: q.pos, baseX: q.x, baseY: q.y };
  playerStates.set(pid, st);
  return st;
}
function moveBallTo(pid, dur, opts) {
  const q = locate(pid);
  if (!q) return;
  animateBallTo(q.x, q.y, dur, Object.assign({ owner: pid, arc: .012 }, opts || {}));
}
function animateBallTo(x, y, dur, opts) {
  const o = opts || {};
  ball.sx = ball.x; ball.sy = ball.y;
  ball.tx = clamp(x, .01, .99); ball.ty = clamp(y, .01, .99);
  ball.progress = 0;
  ball.duration = Math.max(.18, dur || .6);
  ball.arc = o.arc || 0;
  ball.owner = o.owner || null;
}
function updateBall(dt) {
  if (ball.progress < 1) {
    ball.progress = Math.min(1, ball.progress + dt / ball.duration);
    const k = smooth(ball.progress);
    ball.x = ball.sx + (ball.tx - ball.sx) * k;
    ball.y = ball.sy + (ball.ty - ball.sy) * k;
    ball.z = Math.sin(Math.PI * ball.progress) * ball.arc;
    ball.spin += dt * 11;
    if (ball.progress >= 1) ball.z = 0;
    return;
  }
  const owner = ball.owner && locate(ball.owner);
  if (owner) {
    const tx = owner.x + Math.sin(animTime * 2.4 + owner.phase) * .006;
    const ty = owner.y + Math.cos(animTime * 2 + owner.phase) * .007;
    const k = Math.min(1, dt * 11);
    ball.x += (tx - ball.x) * k;
    ball.y += (ty - ball.y) * k;
    ball.z = Math.abs(Math.sin(animTime * 8 + owner.phase)) * .006;
    ball.spin += dt * 2;
  } else ball.z = 0;
}
function drawFrame(ts) {
  const ctx = canvas.ctx;
  if (!ctx || !live) { raf = requestAnimationFrame(drawFrame); return; }
  const realDt = Math.min(.05, Math.max(0, (ts - lastFrame) / 1000));
  lastFrame = ts;
  const dt = paused ? 0 : realDt * speed;
  if (!paused) animTime += dt;
  const points = allPts();
  updatePlayers(dt, points);
  updateBall(dt);
  drawPitch();
  const hk = kitsOf(fx.home), ak = kitsOf(fx.away);
  points.slice().sort((a, b) => (playerStates.get(a.pid)?.y || a.y) - (playerStates.get(b.pid)?.y || b.y)).forEach(q => {
    const p = S_player(q.pid), st = playerStates.get(q.pid);
    if (!p || !st) return;
    const fp = fieldPt(st);
    const opp = q.home ? ak : hk, team = q.home ? hk : ak;
    const kit = q.pos === 'GK' ? gkKit(team, opp) : team.field;
    if (ball.owner === q.pid) {
      ctx.strokeStyle = 'rgba(255,222,128,.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(fp.x, fp.y + 4, 11, 4.5, 0, 0, Math.PI * 2); ctx.stroke();
    }
    drawPlayer(ctx, fp.x, fp.y, kit, st, p.number);
  });
  const bp = fieldPt(ball);
  drawBall(ctx, bp.x, bp.y);
  if (scene.caption && animTime < scene.capUntil) caption(ctx, scene.caption);
  raf = requestAnimationFrame(drawFrame);
}

function setScore() {
  const score = document.getElementById('lv-score');
  if (!score || !live) return;
  score.textContent = live.hg + ':' + live.ag;
  const info = document.getElementById('lv-info');
  if (info) {
    const opp = ENG.clubById(G.S, fx.home === G.S.clubId ? fx.away : fx.home);
    info.textContent = (fx.label || 'Тур ' + fx.round) + ' · ' + Math.min(90, live.minute) + "' · xG " + live.xgH.toFixed(2) + ':' + live.xgA.toFixed(2);
  }
  const A = ENG.clubById(G.S, fx.home), B = ENG.clubById(G.S, fx.away);
  const hs = document.getElementById('lv-hs'), as = document.getElementById('lv-as');
  if (hs) hs.textContent = A.short;
  if (as) as.textContent = B.short;
  const state = document.getElementById('lv-play-state');
  if (state) state.textContent = live.over ? 'Финальный свисток' : live.halftime ? 'Перерыв' : paused ? 'Пауза' : '×' + speed;
}
function ticker(html) {
  const el = document.getElementById('lv-ticker');
  if (el) el.innerHTML = html;
}
function onEvents(evs) {
  const S = G.S;
  evs.forEach(e => {
    if (e.side) live.possession = e.side;
    const mine = (e.side === 'h' && fx.home === S.clubId) || (e.side === 'a' && fx.away === S.clubId);
    const goalY = e.side === 'h' ? .015 : .985;
    if (e.kind === 'goal') {
      animateBallTo(.5 + (ENG.fnv(e.text || e.min) % 100 - 50) / 700, goalY, .85, { arc: e.piece === 'open' ? .075 : .045 });
      scene.kind = e.piece === 'pen' ? 'pen' : e.piece === 'fk' ? 'fk' : 'goal';
      scene.caption = 'ГОЛ · ' + e.min + "'";
      scene.capUntil = animTime + 2.4;
      ticker(`<b>${e.min}'</b> ГОЛ! ${esc(e.text)} — <b>${live.hg}:${live.ag}</b>`);
    } else if (e.kind === 'save') {
      animateBallTo(.5, goalY, .65, { arc: e.piece === 'pen' || e.piece === 'fk' ? .09 : .055 });
      scene.kind = e.piece === 'pen' ? 'pen' : e.piece === 'fk' ? 'fk' : 'save';
      scene.caption = e.piece === 'pen' ? 'Пенальти' : e.piece === 'fk' ? 'Штрафной' : 'Сейв';
      scene.capUntil = animTime + 1.5;
      ticker(`<b>${e.min}'</b> ${esc(e.text)}`);
    } else if (e.kind === 'miss' || e.kind === 'block') {
      animateBallTo(.5 + (e.kind === 'miss' ? .16 : -.08), goalY, .62, { arc: .045 });
      scene.kind = 'shot'; scene.caption = e.kind === 'miss' ? 'Мимо' : 'Блок'; scene.capUntil = animTime + 1.1;
      ticker(`<b>${e.min}'</b> ${esc(e.text)}`);
    } else if (e.kind === 'corner') {
      animateBallTo(e.side === 'h' ? .015 : .985, goalY, .55, { arc: .12 });
      scene.kind = 'corner'; scene.caption = 'Угловой'; scene.capUntil = animTime + 1.4;
      ticker(`<b>${e.min}'</b> Угловой. ${esc(e.text)}`);
    } else if (e.kind === 'poss') {
      moveBallTo(e.pid, .28, { arc: .008 });
      if (Math.random() < .7) ticker(`<b>${e.min}'</b> ${esc(e.text)}`);
    } else if (e.kind === 'throwin') {
      moveBallTo(e.pid, .42, { arc: .035 });
      ticker(`<b>${e.min}'</b> ${esc(e.text)}`);
    } else if (e.kind === 'card') {
      moveBallTo(e.pid, .22, { arc: .006 });
      ticker(`<b>${e.min}'</b> Жёлтая карточка: ${esc(e.text)}`);
    } else if (e.kind === 'sub') {
      ticker(`<b>${e.min}'</b> Замена: ${esc(e.text)}`);
    } else if (e.kind === 'injury') {
      moveBallTo(e.pid, .22, { arc: .006 });
      ticker(`<b>${e.min}'</b> ${esc(e.text)}`);
    } else if (e.kind === 'shot') {
      animateBallTo(.5, goalY, .55, { arc: .06 });
      scene.kind = 'shot'; scene.caption = 'Удар'; scene.capUntil = animTime + 1;
    }
    if (mine && e.kind === 'card') ticker(`<b>${e.min}'</b> ${mine ? 'Ваш игрок' : ''}: ${esc(e.text)}`);
    setScore();
  });
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function baseTickMs() { return Math.max(700, (G.S.matchMins || 2) * 60000 / 90); }
function openHalftime() {
  waiting45 = true;
  paused = true;
  htDone = false;
  autoSubOpp();
  G.sheet = { kind: 'match', title: 'Перерыв', html: MENU_HTML() };
  UI.render();
  setTimeout(() => { const c = document.getElementById('mpitch'); if (c) resize(); }, 30);
}
function tick() {
  if (paused || !live || live.over) return;
  tickAccumulator += 100 * speed;
  const need = baseTickMs();
  let steps = 0;
  while (tickAccumulator >= need && steps < 8 && !paused && live && !live.over) {
    tickAccumulator -= need;
    const evs = ENG.liveStep(G.S, live, 1);
    if (evs.length) onEvents(evs);
    setScore();
    if (live.halftime && !waiting45) { openHalftime(); break; }
    if (live.over) { finish(); break; }
    steps++;
  }
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
  const sacked = S.sacked;
  if (!sacked) UI.render();
  saveGame();
  G.ui.lastResult = { fx, r: { hg: live.hg, ag: live.ag, xgH: live.xgH, xgA: live.xgA }, live };
  setTimeout(() => {
    active = false;
    MatchView.active = false;
    go(sacked ? 'sacked' : 'match-end');
    if (window.flushImportantMessages) window.flushImportantMessages();
  }, 1400);
}

function start() {
  const S = G.S;
  if (active) { resize(); setScore(); return; }
  fx = fxById(G.ui.fxId);
  if (!fx) { go('desk'); return; }
  if (fx.played) { toast('Матч уже сыгран.'); go('desk'); return; }
  active = true;
  MatchView.active = true;
  live = ENG.createLive(S, fx);
  G.ui.liveSubsUsed = 0;
  speed = SPEEDS.includes(+G.ui.matchSpeed) ? +G.ui.matchSpeed : 1;
  G.ui.matchSpeed = speed;
  waiting45 = false; paused = false; htDone = false;
  tickAccumulator = 0; animTime = 0; lastFrame = performance.now();
  ball = { x: .5, y: .55, z: 0, sx: .5, sy: .55, tx: .5, ty: .55, progress: 1, duration: .6, arc: 0, spin: 0, owner: null };
  scene = { kind: null, until: 0, caption: '', capUntil: 0 };
  playerStates.clear();
  syncPlayerStates(allPts());
  resize();
  setScore();
  raf = requestAnimationFrame(drawFrame);
  clearInterval(timer);
  timer = setInterval(tick, 100);
}
function stop() {
  clearInterval(timer); cancelAnimationFrame(raf);
  timer = null; raf = 0; active = false; paused = true; MatchView.active = false;
}
function resume() {
  if (!live || live.over) return;
  paused = false;
  waiting45 = false;
  live.halftime = false;
  closeSheet();
}
function secondHalf() {
  if (!live || live.over) return;
  waiting45 = false;
  live.halftime = false;
  paused = false;
  htDone = true;
  closeSheet();
}
function doUserSub(outPid, inPid) {
  const S = G.S;
  if (!live || live.over || !paused) return false;
  if (outPid === inPid) return false;
  if (live.subsUsed >= 5) { toast('Все 5 замен использованы.'); return false; }
  const incoming = S.players.find(p => p.id === inPid);
  if (!incoming || !ENG.available(incoming)) { toast('Этот игрок недоступен для замены.'); return false; }
  if (ENG.lineupPlayers(S, S.clubId, ENG.tacOf(S, S.clubId)).some(s => s.pid === inPid)) { toast('Этот игрок уже находится на поле.'); return false; }
  const bench = ENG.benchOf(S).filter(p => ENG.available(p));
  if (bench.length && !bench.some(p => p.id === inPid)) { toast('Игрок не в заядлом запасе. Добавьте его в шторке «Замены» на вкладке «Состав».'); return false; }
  if (ENG.applyLiveSub(S, live, S.clubId, outPid, inPid)) {
    G.ui.liveSubsUsed = live.subsUsed;
    const out = S.players.find(p => p.id === outPid);
    toast((out ? out.last : 'Игрок') + ' → ' + incoming.last + '. Замена исполнена.');
    return true;
  }
  toast('Не удалось провести замену.');
  return false;
}
function pauseForMenu() {
  if (!live || live.over) return;
  paused = true;
  tickAccumulator = 0;
}
function togglePause() {
  if (!live || live.over) return paused;
  if (live.halftime && paused) { toast('Сначала начните второй тайм.'); return paused; }
  paused = !paused;
  tickAccumulator = 0;
  render();
  return paused;
}
function setSpeed(v) {
  const next = SPEEDS.includes(+v) ? +v : 1;
  speed = next;
  G.ui.matchSpeed = next;
  render();
}
function snapshot() {
  return live ? {
    minute: Math.min(90, live.minute), hg: live.hg, ag: live.ag,
    xgH: live.xgH, xgA: live.xgA, subsUsed: live.subsUsed,
    home: fx.home, away: fx.away, speed, paused,
    halftime: !!live.halftime, over: !!live.over,
  } : null;
}

window.addEventListener('resize', () => { if (active) resize(); });
return {
  get active() { return active; },
  set active(v) { active = !!v; },
  get paused() { return paused; },
  get speed() { return speed; },
  get htDone() { return htDone; },
  set htDone(v) { htDone = !!v; },
  get halftime() { return !!(live && live.halftime); },
  start, stop, resume, secondHalf, doUserSub, pauseForMenu, togglePause, setSpeed, snapshot,
};
})();
