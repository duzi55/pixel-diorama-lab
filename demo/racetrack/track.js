'use strict';
/* ------------------------------------------------------------------
 * 像素大奖赛 · 真正 oval 赛道（双直道 + 半圆弯）
 *
 * 现实布局：
 *   后侧主直道 —— 外侧是阶梯主看台与广告板，内侧是维修车库
 *   两端半圆弯 —— 外侧轮胎墙 + 白护栏
 *   前侧直道 —— 对面看台，围栏外站散客
 *   内场 —— 记分塔、领奖台、队旗、树、轮胎堆
 *
 * 尺度基准：人高 1.6，赛车长 3.2（约两人高），赛道宽 5.6（三车可并排）。
 * 逐像素按“到中心线的距离”分层：沥青 / 白线 / 弯道路肩 / 草地。
 * ------------------------------------------------------------------ */

const STRAIGHT = 10.5;              // 半直道长度
const CURVE_R = 7;                  // 弯道半径（= 直道偏移）
const TRACK_HALF = 2.8;             // 赛道半宽（整宽 5.6）
const KERB = .75;                   // 弯道路肩宽
const WALL_OFF = 2.1;               // 护栏离路边
const PERIM = 4 * STRAIGHT + 2 * Math.PI * CURVE_R;

const GRASS = [96, 124, 72], ASPHALT = [88, 90, 96];
const KERB_RED = [206, 72, 62], KERB_WHITE = [240, 236, 224];
const LINE_WHITE = [236, 234, 224], LINE_DARK = [42, 42, 48];
const CONCRETE = [198, 190, 174], POST = [210, 206, 194];
const FENCE_WHITE = [242, 240, 232], PIT = [214, 208, 194], PIT_DARK = [54, 60, 70];
const BAND_COLORS = [[214, 72, 62], [62, 108, 190], [226, 180, 52], [72, 148, 108]];

/* ---------------- 赛道中心线（弧长参数 u ∈ [0,1)） ---------------- */

function trackAt(u) {
  let s = (((u % 1) + 1) % 1) * PERIM;
  /* 后侧直道：左 → 右，y = -R */
  if (s < 2 * STRAIGHT) return { x: -STRAIGHT + s, y: -CURVE_R, tx: 1, ty: 0 };
  s -= 2 * STRAIGHT;
  /* 右弯：从 (L,-R) 顺时针绕到 (L,R) */
  if (s < Math.PI * CURVE_R) {
    const a = -Math.PI / 2 + s / CURVE_R;
    return { x: STRAIGHT + CURVE_R * Math.cos(a), y: CURVE_R * Math.sin(a), tx: -Math.sin(a), ty: Math.cos(a) };
  }
  s -= Math.PI * CURVE_R;
  /* 前侧直道：右 → 左，y = +R */
  if (s < 2 * STRAIGHT) return { x: STRAIGHT - s, y: CURVE_R, tx: -1, ty: 0 };
  s -= 2 * STRAIGHT;
  /* 左弯：从 (-L,R) 顺时针绕到 (-L,-R) */
  const a = Math.PI / 2 + s / CURVE_R;
  return { x: -STRAIGHT + CURVE_R * Math.cos(a), y: CURVE_R * Math.sin(a), tx: -Math.sin(a), ty: Math.cos(a) };
}

/* 到中心线的距离（用于逐像素分带；直道段是垂距，弯道段是到圆心的径向差） */
function trackNearest(x, y) {
  const ax = Math.abs(x), ay = Math.abs(y);
  let dist, cx, cy;
  if (ax <= STRAIGHT) {
    cx = x; cy = Math.sign(y) * CURVE_R;
    dist = Math.abs(ay - CURVE_R);
  } else {
    const dx = ax - STRAIGHT;
    const d = Math.hypot(dx, ay) || .001;
    cx = Math.sign(x) * (STRAIGHT + dx / d * CURVE_R);
    cy = Math.sign(y) * (ay / d * CURVE_R);
    dist = Math.abs(d - CURVE_R);
  }
  const inside = ax <= STRAIGHT
    ? Math.abs(y) < CURVE_R
    : Math.hypot(ax - STRAIGHT, y) < CURVE_R;
  return { dist, inside, cx, cy };
}

/* 主直道起跑格：横跨路宽的黑白格 */
function onStartGrid(x, y, dist) {
  if (Math.abs(y + CURVE_R) > TRACK_HALF || Math.abs(x) > 1.3 || dist > TRACK_HALF - .12) return -1;
  const col = Math.floor((x + 1.3) / .38);
  const row = Math.floor((y + CURVE_R + TRACK_HALF) / .4);
  return (col + row) & 1;
}

/* ---------------- 地面 ---------------- */

function groundColor(x, y, ix, iy) {
  const n = trackNearest(x, y), dist = n.dist;

  /* 岛式草地边缘：只看外场；内场（inside）无条件保留 */
  const edge = TRACK_HALF + WALL_OFF + 6.5 + (noise(n.cx * .12 + 3, n.cy * .12 + 7) - .5) * 3;
  if (!n.inside && dist > edge) return 0;

  const onCurve = Math.abs(x) > STRAIGHT - 1.5;

  if (dist < TRACK_HALF) {
    const chk = onStartGrid(x, y, dist);
    if (chk >= 0) return chk ? rgb(...LINE_WHITE) : rgb(...LINE_DARK);
    if (dist > TRACK_HALF - .1) return rgb(...LINE_WHITE);
    /* 沥青：低频补丁 + 两条行车胎痕 + 偶尔的裂缝 */
    const patch = noise(x * .42 + 2, y * .42 + 9);
    let level = clamp(Math.floor(2.0 + patch * 1.2 + (bayerAt(ix, iy) - .5) * .8), 1, 3);
    if (Math.abs(dist - .7) < .12 || Math.abs(dist - 2.0) < .1) level = Math.max(1, level - 1);
    if (hash(ix, iy) > .994) level = 4;
    return rampOf(ASPHALT)[level];
  }

  /* 弯道路肩：红白相间（直道不铺） */
  if (onCurve && dist < TRACK_HALF + KERB) {
    const block = Math.floor((n.cx + n.cy) * .55) & 1;
    return rampOf(block ? KERB_RED : KERB_WHITE)[3];
  }
  if (dist < TRACK_HALF + .1) return rgb(...LINE_WHITE);

  /* 草地：内场略亮，外场略沉；零星小花 */
  const g = rampOf(GRASS);
  const tone = noise(x * .55 + 5, y * .55 + 1) + (n.inside ? .18 : 0);
  let c = g[clamp(Math.floor(1.9 + tone * 1.5 + (bayerAt(ix, iy) - .5) * .6), 1, 4)];
  if (hash(ix, iy) > .994) c = rgb(236, 214, 104);
  return c;
}

/* ---------------- 主看台（后侧直道外侧） ---------------- */

const STAND = { x0: -10, x1: 10, front: -10.2, rows: 4, depth: 1.2, rise: .55, gap: 1.18 };

function buildStand() {
  const step = .06;
  for (let r = 0; r < STAND.rows; r++) {
    const y1 = STAND.front - r * STAND.gap;
    const y0 = y1 - STAND.depth;
    const z1 = STAND.rise * (r + 1);
    box(STAND.x0, y0, 0, STAND.x1, y1, z1, CONCRETE, 20 + r);
    /* 台阶前缘：赞助商色带 */
    for (let x = STAND.x0 + .25; x <= STAND.x1 - .2; x += step) {
      const band = BAND_COLORS[Math.floor((x - STAND.x0) / 1.5) % BAND_COLORS.length];
      for (let z = z1 - .26; z <= z1 - .06; z += step) plot(x, y1 + .01, z, rampOf(band)[3]);
    }
    for (let x = STAND.x0; x <= STAND.x1; x += .8) for (let z = .2; z < z1; z += .5) castShadow(x, y1, z, .5);
  }

  /* 看台背后的广告板，给观众一个背景，不挡视线 */
  box(STAND.x0 - .4, -16.5, 0, STAND.x1 + .4, -16.1, 2.5, CONCRETE, 31);
  for (let x = STAND.x0 + .1; x <= STAND.x1 - .1; x += .5) {
    const c = BAND_COLORS[Math.floor((x - STAND.x0) / 1.3) % BAND_COLORS.length];
    for (let z = .35; z < 2.25; z += .06) plot(x, -16.09, z, rampOf(c)[3]);
  }
  for (let x = STAND.x0; x <= STAND.x1; x += 1.2) castShadow(x, -16.3, 1.2, .6);
}

/* ---------------- 维修区（后侧直道内侧） ---------------- */

function buildPitLane() {
  const bays = 6, w = 2.45, gap = .18;
  const total = bays * w + (bays - 1) * gap;
  const x0 = -total / 2;
  for (let k = 0; k < bays; k++) {
    const xa = x0 + k * (w + gap), xb = xa + w;
    box(xa, -4.05, 0, xb, -2.25, 1.8, PIT, 50 + k);
    /* 车库门（朝内场 +y）：深色卷帘 + 顶部横线 */
    for (let x = xa + .22; x <= xb - .2; x += .06) {
      for (let z = .18; z <= 1.25; z += .06) {
        const stripe = Math.floor(z / .14) & 1;
        plot(x, -2.24, z, stripe ? rampOf(PIT_DARK)[1] : rampOf(PIT_DARK)[2]);
      }
    }
    /* 屋顶空调/天线 */
    box(xa + .5, -3.4, 1.8, xa + 1.1, -2.9, 2.05, POST, 60 + k);
    if (k === 1 || k === 4) capsule([xb - .4, -3.2, 1.8], [xb - .4, -3.2, 2.9], .05, .04, () => POST, 'solid');
    for (let x = xa; x <= xb; x += .7) castShadow(x, -3.2, .9, .5);
  }
}

/* ---------------- 内场：记分塔 / 领奖台 / 旗 / 树 / 轮胎堆 ---------------- */

function buildInfield() {
  /* 记分塔：方柱 + 顶部深色大屏（朝 +y，面向看台） */
  box(-1.1, .6, 0, .5, 2.2, 3.4, CONCRETE, 70);
  box(-1.8, .55, 3.4, 1.2, 1.1, 4.5, PIT_DARK, 71);
  for (let x = -1.55; x <= .95; x += .09) for (let z = 3.55; z <= 4.35; z += .09)
    if (hash(x * 20 | 0, z * 20 | 0) > .45) plot(x, 1.11, z, rampOf([86, 190, 120])[3]);
  castShadow(0, 1.4, 2, .9);

  /* 领奖台：三级台阶，沿 y 排开 */
  const podium = [[-1.6, 1.15, [206, 72, 62]], [-.5, .82, [236, 236, 228]], [.6, .52, [62, 108, 190]]];
  for (const [y, h, c] of podium) {
    box(-6.4, y, 0, -5.2, y + 1.15, h, c, (y * 9) | 0);
    castShadow(-5.8, y + .55, h * .5, .6);
  }

  /* 三面队旗 */
  for (const [x, y, c] of [[-8.4, 2.8, [214, 72, 62]], [-8.4, 1.4, [62, 108, 190]], [-8.4, 0, [226, 180, 52]]]) {
    capsule([x, y, 0], [x, y, 2.7], .05, .04, () => POST, 'solid');
    box(x, y, 2.25, x + .95, y + .06, 2.6, c, 44);
    castShadow(x, y, 1.2, .16, 1, 0);
  }

  /* 轮胎堆（内场角落） */
  for (let k = 0; k < 6; k++) {
    const a = hash(k, 71) * 6.28, d = hash(k, 72) * .7;
    sphere(5.4 + Math.cos(a) * d, 3.4 + Math.sin(a) * d, .3 + (k % 3) * .3, .36, [52, 52, 58], 'rough');
  }
  castShadow(5.4, 3.4, .6, .9);

  /* 内场两棵阔叶树 */
  growTree(-9.2, 5.2, .55, 120, 700);
  growTree(8.6, -1.2, .5, 100, 900);
  castShadow(-9.2, 5.2, .3, .7);
  castShadow(8.6, -1.2, .3, .6);
}

const CROWN = [[.1, 0, 3.7, 1.6], [-1.4, -.7, 3.3, 1.2], [1.6, .7, 3.4, 1.25], [-.6, 1.1, 3.9, 1.1], [.9, -1.1, 4, 1.1], [.2, .1, 4.9, 1.05]];
const BARK = [92, 74, 60], LEAF_DEEP = [66, 92, 66], LEAF_MID = [110, 140, 82], LEAF_SILVER = [158, 172, 120];

function growTree(x, y, scale, count, seed) {
  const bark = () => BARK;
  capsule([x, y, 0], [x + .3 * scale, y + .1 * scale, 2.2 * scale], .36 * scale, .22 * scale, bark, 'rough');
  capsule([x + .3 * scale, y + .1 * scale, 2.2 * scale], [x - .8 * scale, y - .4 * scale, 3.3 * scale], .2 * scale, .13 * scale, bark, 'rough');
  capsule([x + .3 * scale, y + .1 * scale, 2.2 * scale], [x + 1.2 * scale, y + .4 * scale, 3.4 * scale], .2 * scale, .13 * scale, bark, 'rough');
  for (let n = 0; n < count; n++) {
    const k = n + seed, [cx, cy, cz, spread] = CROWN[n % CROWN.length];
    const a = hash(k, 7) * 6.283, tilt = hash(k, 8) * 2 - 1, d = Math.cbrt(hash(k, 9)) * spread;
    const flat = Math.sqrt(1 - tilt * tilt);
    const rx = cx + Math.cos(a) * flat * d, ry = cy + Math.sin(a) * flat * d, rz = cz + tilt * d * .8;
    const tone = hash(k, 10) + (rz - 4.2) * .22 + (d / spread - .5) * .3;
    const leaf = tone > .72 ? LEAF_SILVER : tone > .3 ? LEAF_MID : LEAF_DEEP;
    captureSphere(x + rx * scale, y + ry * scale, rz * scale, (.2 + hash(k, 11) * .22) * scale, leaf, 'rough');
  }
}

/* ---------------- 护栏 + 轮胎墙 ---------------- */

function buildBarrier() {
  /* 沿赛道外缘偏移 4.9 世界，白色低墙 + 立柱 */
  const wall = [], mid = [];
  for (let k = 0; k < 220; k++) {
    const t = trackAt(k / 220);
    const len = Math.hypot(t.tx, t.ty) || 1;
    const nx = t.ty / len, ny = -t.tx / len;
    const px = t.x + nx * (TRACK_HALF + WALL_OFF), py = t.y + ny * (TRACK_HALF + WALL_OFF);
    wall.push([px, py, .85]);
    mid.push([px, py, .55]);
  }
  strokePath(wall, rgb(...FENCE_WHITE), null);
  strokePath(mid, rgb(...FENCE_WHITE), null);
  for (let k = 0; k < 56; k++) {
    const t = trackAt(k / 56);
    const len = Math.hypot(t.tx, t.ty) || 1;
    const nx = t.ty / len, ny = -t.tx / len;
    const px = t.x + nx * (TRACK_HALF + WALL_OFF), py = t.y + ny * (TRACK_HALF + WALL_OFF);
    capsule([px, py, 0], [px, py, .9], .05, .045, () => POST, 'solid');
    castShadow(px, py, .4, .12, 1, 0);
  }

  /* 两个弯道外侧的轮胎墙：黑球沿弧线排 */
  for (const side of [-1, 1]) {
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k + .5) / 10 * Math.PI;
      const cx = side * STRAIGHT + Math.cos(a) * (CURVE_R + TRACK_HALF + WALL_OFF * .55);
      const cy = Math.sin(a) * (CURVE_R + TRACK_HALF + WALL_OFF * .55);
      sphere(cx, cy, .3, .34, [52, 52, 58], 'rough');
      if (k % 2 === 0) castShadow(cx, cy, .25, .35);
    }
  }
}

/* ---------------- 烘焙 ---------------- */

function bakeTrack() {
  zb.fill(-1e9);
  pix.fill(rgb(255, 255, 255));
  for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
    const g = unproject(ix + .5, iy + .5), c = groundColor(g.x, g.y, ix, iy), i = iy * W + ix;
    if (!c) continue;
    pix[i] = c;
    ground[i] = 1;
    zb[i] = (g.x + g.y) / R2 * COS;
  }
  groundZ.set(zb);
  buildStand();
  buildPitLane();
  buildInfield();
  buildBarrier();
  applyShadows(groundZ);
  bakeOcclusion();
  bakedPix.set(pix);
  bakedZ.set(zb);
}
