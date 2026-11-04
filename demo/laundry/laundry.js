'use strict';
/* ------------------------------------------------------------------
 * 屋顶晾衣 · 状态机 / 交互 / 主循环
 *
 * 玩法：把绳上的衣服拖进藤篮，阵风会吹松衣物，暴雨会打湿衣服。
 * 交互来自参考项目的设计：拾取缓冲 + 拖拽 + 空格收下一件。
 * ------------------------------------------------------------------ */

const G = {
  phase: 'play', t: 0, time: 0, items: [], held: null, auto: false,
  pointer: { x: W / 2, y: H / 2 }, score: 0, gustIn: 8,
  gustGlow: 0, flash: 0, boltIn: 22, bolt: null, wetness: 0, overT: 0, status: '',
};

const nodes = {
  score: document.getElementById('score'),
  status: document.getElementById('status'),
};

function setStatus(text) {
  if (text === G.status) return;
  G.status = text;
  if (nodes.status) nodes.status.textContent = text;
}

function reset() {
  G.t = 0; G.score = 0; G.held = null; G.auto = false; G.phase = 'play';
  G.gustIn = 8; G.gustGlow = 0; G.flash = 0; G.boltIn = 22; G.bolt = null;
  G.wetness = 0; G.overT = 0;
  splashes.length = 0;
  drops.length = 0;
  hangWashing();
  G.items = ITEMS;
  if (nodes.score) nodes.score.textContent = '0';
  setStatus('把衣服拖进藤篮');
}

const live = i => i.state !== 'basket' && i.state !== 'lost';

function bank(item) {
  item.state = 'basket';
  G.score = Math.round((G.score + item.value * (1 - item.wet * .7)) * 10) / 10;
  if (nodes.score) nodes.score.textContent = G.score % 1 ? G.score.toFixed(1) : String(G.score);
}

/* 阵风：按风暴等级一次吹松 1–3 件；地上的衣物有概率被卷起 */
function gust() {
  const count = 1 + Math.round(stormLevel() * 2);
  const hanging = G.items.filter(i => i.state === 'line');
  for (let k = hanging.length - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    [hanging[k], hanging[j]] = [hanging[j], hanging[k]];
  }
  G.gustGlow = 1;
  for (const item of hanging.slice(0, count)) {
    item.state = 'loose';
    item.pop = 1.8;
  }
  for (const item of G.items) if (item.state === 'ground' && Math.random() < .5) launch(item);
}

/* 松脱的衣物起飞；靠近边缘的往回吹，总给玩家留出接住的时间 */
function launch(item) {
  const side = Math.abs(item.x) > 3 ? -Math.sign(item.x) : (Math.random() < .5 ? -1 : 1);
  const a = (Math.random() - .5) * .7, speed = 3.2 + stormLevel() * 1.8;
  item.state = 'flying';
  item.vx = side * Math.cos(a) * speed;
  item.vy = Math.sin(a) * speed;
  item.spin = (Math.random() - .5) * 2.6;
  item.z = Math.max(item.z, 2.4);
}

function endGame() {
  G.phase = 'over';
  G.overT = 0;
  if (G.held) { G.held.state = 'falling'; G.held = null; G.auto = false; }
  const banked = G.items.filter(i => i.state === 'basket');
  const dry = banked.filter(i => i.wet < .25).length;
  const lost = G.items.filter(i => i.state === 'lost').length;
  setStatus(`收了 ${banked.length} 件 · 干 ${dry} · 湿 ${banked.length - dry} · 吹走 ${lost} · 点击重来`);
}

function statusLine() {
  if (G.held) return G.auto ? '正在送往藤篮' : '松手放进藤篮';
  if (G.t < STORM_FROM) return '把衣服拖进藤篮';
  if (G.t < RAIN_FROM) return '风起来了，注意黄色衣夹';
  if (G.t < RAIN_TO) return '下雨了';
  return '暴雨倾盆';
}

const pointerWorld = () => {
  const g = unproject(G.pointer.x, G.pointer.y + CARRY_Z * COS * S);
  return { x: clamp(g.x, -ROOF_X - 1, ROOF_X + 1), y: clamp(g.y, -ROOF_Y - 1, ROOF_Y + 1) };
};

function overBasket(item) {
  const a = project(item.x, item.y, item.z - item.h / 2);
  const b = project(BASKET.x, BASKET.y, BASKET.h);
  return Math.hypot(a.sx - b.sx, a.sy - b.sy) < DROP_PX;
}

/* ---------------- 更新 ---------------- */

function update(dt) {
  G.time += dt;
  G.gustGlow = Math.max(0, G.gustGlow - dt * .8);
  G.flash = Math.max(0, G.flash - dt * 3.2);
  if (G.bolt && G.flash < .35) G.bolt = null;

  if (G.phase === 'play') {
    G.t += dt;
    setStatus(statusLine());
    if ((G.gustIn -= dt) <= 0) {
      gust();
      G.gustIn = lerp(10, 5, stormLevel()) * (.8 + Math.random() * .4);
    }
    if (G.t >= GAME_LENGTH || !G.items.some(live)) endGame();
  } else {
    G.overT += dt;
    G.t = Math.min(GAME_LENGTH, G.t + dt * 2);
  }

  if (G.t > 18 && (G.boltIn -= dt) <= 0) {
    strike();
    G.boltIn = 3.5 + Math.random() * 4;
  }

  const rain = rainLevel();
  G.wetness = Math.min(1, G.wetness + rain * dt / 14);

  for (const item of G.items) {
    if (item.state === 'basket' || item.state === 'lost') continue;
    item.wet = Math.min(1, item.wet + rain * dt / 8);

    if (item.state === 'loose') {
      if ((item.pop -= dt) <= 0) launch(item);
    } else if (item.state === 'flying') {
      item.x += item.vx * dt;
      item.y += item.vy * dt;
      item.rot += item.spin * dt;
      const away = Math.abs(item.x) > ROOF_X + 1.2 || Math.abs(item.y) > ROOF_Y + 1.2;
      item.vz = away ? -9 : Math.sin(G.time * 2.7 + item.phase) * 1.1 + (3 - item.z) * .7;
      item.z += item.vz * dt;
      if (item.z < -7) item.state = 'lost';
    } else if (item.state === 'falling') {
      item.vz -= 14 * dt;
      item.z += item.vz * dt;
      item.rot *= .9;
      if (item.z < .6) { item.state = 'ground'; item.rot = 0; item.vz = 0; }
    } else if (item.state === 'held') {
      const target = G.auto ? { x: BASKET.x, y: BASKET.y } : pointerWorld();
      const dx = target.x - item.x, dy = target.y - item.y, d = Math.hypot(dx, dy);
      const move = Math.min(d, item.speed * dt), px = item.x;
      if (d > 0) { item.x += dx / d * move; item.y += dy / d * move; }
      item.vx = (item.x - px) / Math.max(dt, .001);
      item.z += (CARRY_Z + item.h / 2 - item.z) * Math.min(1, dt * 10);
      item.rot *= .8;
      if (G.auto && overBasket(item)) { G.held = null; G.auto = false; bank(item); }
    }
  }
  updateRain(dt, rain);
}

function grab(item, auto) {
  G.held = item;
  G.auto = auto;
  item.state = 'held';
  item.vz = 0;
}

function letGo() {
  const item = G.held;
  if (!item) return;
  G.held = null;
  if (overBasket(item)) bank(item);
  else { item.state = 'falling'; item.vz = 0; }
}

function nextItem() {
  const order = { flying: 0, loose: 1, ground: 2, falling: 2, line: 3 };
  return G.items.filter(i => order[i.state] != null)
    .sort((p, q) => order[p.state] - order[q.state] || q.value - p.value)[0];
}

/* ---------------- 绘制 ---------------- */

function draw() {
  pix.set(bakedPix);
  zb.set(bakedZ);
  itemBuf.fill(0);
  pendingShadows.length = 0;

  const windT = Math.floor(G.time * 8) / 8;
  const storm = stormLevel();
  drawPile();
  for (const item of G.items) if (item.state !== 'basket' && item.state !== 'lost') drawCloth(item, windT);
  drawLeaves(windT);
  flushShadows();
  applyShadows(groundZ);
  shadeEdges();
  gradeStorm(storm, windT, G.wetness, G.flash);
  drawClouds(storm, windT);
  drawBolt();
  drawRain();

  if (G.held && !G.auto) {
    const p = project(BASKET.x, BASKET.y, BASKET.h + 1.3);
    drawArrow(p.sx, p.sy, G.time);
  }
  ctx.putImageData(image, 0, 0);
}

/* ---------------- 输入 ---------------- */

function toCanvas(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
}

canvas.addEventListener('pointerdown', e => {
  canvas.focus({ preventScroll: true });
  if (G.phase === 'over') { if (G.overT > .5) reset(); return; }
  if (G.held) return;
  G.pointer = toCanvas(e);
  const item = pickCloth(G.pointer.x, G.pointer.y);
  if (!item) return;
  canvas.setPointerCapture(e.pointerId);
  grab(item, false);
});

canvas.addEventListener('pointermove', e => { if (G.held && !G.auto) G.pointer = toCanvas(e); });
canvas.addEventListener('pointerup', () => { if (!G.auto) letGo(); });
canvas.addEventListener('pointercancel', () => { if (!G.auto) letGo(); });

addEventListener('keydown', e => {
  if (e.key !== ' ' && e.key !== 'Enter') return;
  e.preventDefault();
  if (e.repeat) return;
  if (G.phase === 'over') { if (G.overT > .5) reset(); return; }
  if (G.held) return;
  const item = nextItem();
  if (item) grab(item, true);
});

/* ---------------- 主循环 ---------------- */

const FPS = 30;
let lastStep = -1;

function frame(now) {
  const step = Math.floor(now / 1000 * FPS);
  if (step !== lastStep) {
    const dt = lastStep < 0 ? 1 / FPS : Math.min(.1, (step - lastStep) / FPS);
    lastStep = step;
    update(dt);
    draw();
  }
  requestAnimationFrame(frame);
}

addEventListener('resize', fit);
fit();
bakeScene();
reset();
requestAnimationFrame(frame);

/* 调试钩子（与参考项目一致）：控制台可 __laundry.step(1/30) 单步 */
window.__laundry = { G, update, draw, reset, grab, letGo, pickCloth, bank, overBasket };
