'use strict';
/* ------------------------------------------------------------------
 * 天气（docs/kit/weather.md）
 *   ① 粒子：雨丝 / 云 / 闪电
 *   ② 地面响应：溅射 / 水洼
 *   ③ 全局调色：去饱和 + 偏蓝 + 云影 + 闪光
 *
 * 时间线：0–10s 晴 · 10–28s 起风 · 28–36s 下雨 · 48s 结束
 * ------------------------------------------------------------------ */

const STORM_FROM = 10, STORM_TO = 28, RAIN_FROM = 28, RAIN_TO = 36, GAME_LENGTH = 48;
const CLOUD_COLOR = [172, 170, 188];
const DROP_COLOR = rgb(126, 150, 204);
const SPLASH_COLOR = rgb(212, 224, 244);

const stormLevel = () => ease(clamp((G.t - STORM_FROM) / (STORM_TO - STORM_FROM), 0, 1));
const rainLevel = () => clamp((G.t - RAIN_FROM) / (RAIN_TO - RAIN_FROM), 0, 1);

/* ---------------- 云 ---------------- */

const drops = [], splashes = [];
const CELLS_W = (W >> 3) + 1, CELLS_H = (H >> 3) + 1;
const cloudCells = new Float32Array(CELLS_W * CELLS_H);
let cloudStamp = -1;
const CLOUDS = [];
for (let k = 0; k < 18; k++) {
  CLOUDS.push({
    x: hash(k, 61) * W,
    y: 6 + hash(k, 62) * 30,
    r: 6 + hash(k, 63) * 7,
    speed: 2 + hash(k, 64) * 3,
    from: hash(k, 65),
  });
}

/* 屏幕空间椭圆云：Bayer 阈值当透明度，边缘淡出，只盖空白处 */
function drawClouds(storm, windT) {
  if (storm <= 0) return;
  const ramp = rampOf(CLOUD_COLOR);
  for (const c of CLOUDS) {
    const show = clamp(storm * 1.5 - c.from * .6, 0, 1);
    if (show <= 0) continue;
    const cx = 30 + ((c.x + windT * c.speed) % (W - 60));
    const edge = clamp((Math.min(cx, W - cx) - 18) / 34, 0, 1), alpha = show * edge;
    const rx = c.r * 1.5, ry = c.r;
    const y0 = Math.max(0, Math.floor(c.y - ry)), y1 = Math.min(H - 1, Math.ceil(c.y + ry));
    const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(W - 1, Math.ceil(cx + rx));
    for (let iy = y0; iy <= y1; iy++) for (let ix = x0; ix <= x1; ix++) {
      const dx = (ix - cx) / rx, dy = (iy - c.y) / ry, nn = dx * dx + dy * dy, i = iy * W + ix;
      if (nn > 1 || zb[i] > -1e8) continue;
      if (bayerAt(ix, iy) > alpha * 1.3 * (1.15 - nn * .4)) continue;
      const l = -.45 * dx - .75 * dy + .5 * Math.sqrt(1 - nn);
      pix[i] = ramp[clamp(Math.floor(l * 3.2 + 1 + (bayerAt(ix, iy) - .5) * .6), 0, 4)];
    }
  }
}

/* ---------------- 雨 ---------------- */

function newDrop(anywhere) {
  return {
    x: (Math.random() - .5) * (ROOF_X * 2 + 8) - 2,
    y: (Math.random() - .5) * ROOF_Y * 2.2,
    z: anywhere ? Math.random() * 11 : 10 + Math.random() * 3,
  };
}

function updateRain(dt, rain) {
  const want = Math.floor(rain * 460);
  while (drops.length < want) drops.push(newDrop(true));
  if (drops.length > want) drops.length = want;
  const wind = 3 + G.gustGlow * 5;
  for (let k = 0; k < drops.length; k++) {
    const d = drops[k];
    d.z -= 26 * dt;
    d.x += wind * dt;
    if (d.z <= 0) {
      if (Math.abs(d.x) < ROOF_X && Math.abs(d.y) < ROOF_Y) splashes.push({ x: d.x, y: d.y, life: .12 });
      drops[k] = newDrop(false);
    }
  }
  for (let k = splashes.length - 1; k >= 0; k--) if ((splashes[k].life -= dt) <= 0) splashes.splice(k, 1);
}

/* 雨丝：每滴 4 个点，沿风向反向偏移；不写 zb、不参与描边 */
function drawRain() {
  if (!drops.length) return;
  const wind = 3 + G.gustGlow * 5;
  for (const d of drops) {
    for (let k = 0; k < 8; k++) {
      const p = project(d.x - wind * k * .22, d.y, d.z + k * .22), ix = p.sx | 0, iy = p.sy | 0;
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
      const i = iy * W + ix;
      if (p.d > zb[i]) pix[i] = DROP_COLOR;
    }
  }
  for (const s of splashes) {
    const p = project(s.x, s.y, 0), ix = p.sx | 0, iy = p.sy | 0;
    if (ix < 1 || iy < 0 || ix >= W - 1 || iy >= H) continue;
    const i = iy * W + ix;
    if (zb[i] === groundZ[i]) { pix[i] = SPLASH_COLOR; pix[i - 1] = SPLASH_COLOR; pix[i + 1] = SPLASH_COLOR; }
  }
}

/* ---------------- 闪电 ---------------- */

function strike() {
  G.flash = 1;
  const x0 = Math.random() < .5 ? 40 + Math.random() * 50 : 270 + Math.random() * 50;
  const points = [[x0, 44]];
  let x = x0, y = 44;
  while (y < 150) {
    x += (Math.random() - .5) * 18;
    y += 8 + Math.random() * 10;
    points.push([x, y]);
  }
  G.bolt = points;
}

function drawBolt() {
  if (!G.bolt) return;
  const bright = rgb(255, 250, 214), core = rgb(200, 196, 236);
  for (let k = 0; k < G.bolt.length - 1; k++) {
    const [ax, ay] = G.bolt[k], [bx, by] = G.bolt[k + 1];
    const n = Math.ceil(Math.hypot(bx - ax, by - ay));
    for (let j = 0; j <= n; j++) {
      const sx = lerp(ax, bx, j / n) | 0, sy = lerp(ay, by, j / n) | 0;
      for (const [ox, c] of [[0, bright], [-1, core], [1, core]]) {
        const ix = sx + ox;
        if (ix < 0 || ix >= W || sy < 0 || sy >= H) continue;
        const i = sy * W + ix;
        if (zb[i] < -1e8) pix[i] = c;
      }
    }
  }
}

/* ---------------- 全局调色 ---------------- */

function gradeStorm(storm, windT, wetness, flash) {
  if (storm <= 0 && flash <= 0 && wetness <= 0) return;
  if (windT !== cloudStamp) {
    cloudStamp = windT;
    for (let cy = 0; cy < CELLS_H; cy++) for (let cx = 0; cx < CELLS_W; cx++)
      cloudCells[cy * CELLS_W + cx] = noise(cx * .14 - windT * .22, cy * .2 + 3);
  }
  const rm = 1 - .46 * storm, gm = 1 - .36 * storm, bm = 1 - .2 * storm;
  const ra = 8 * storm, ga = 12 * storm, ba = 26 * storm;
  const wet = wetness, fl = flash * .4, puddleAt = 1 - wet * .42;
  for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
    const i = iy * W + ix;
    if (zb[i] < -1e8) continue;
    const c = pix[i];
    let r = (c & 255) * rm + ra, g = (c >> 8 & 255) * gm + ga, b = (c >> 16 & 255) * bm + ba;
    if (cloudCells[(iy >> 3) * CELLS_W + (ix >> 3)] + bayerAt(ix, iy) * .22 > 1 - storm * .62) {
      r *= .76; g *= .76; b *= .82;
    }
    if (wet > 0 && zb[i] === groundZ[i]) {
      const damp = 1 - wet * .24;
      r *= damp; g *= damp; b *= damp + wet * .05;
      if (puddle[i] > puddleAt) { r = lerp(r, 92, .7); g = lerp(g, 108, .7); b = lerp(b, 140, .7); }
    }
    if (fl > 0) { r = lerp(r, 244, fl); g = lerp(g, 244, fl); b = lerp(b, 255, fl); }
    pix[i] = rgb(r, g, b);
  }
}
