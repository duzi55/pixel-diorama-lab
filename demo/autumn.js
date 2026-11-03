'use strict';
/* ------------------------------------------------------------------
 * 秋日野餐 · 等距像素微缩景观
 *
 * 三棵法国梧桐：笔直的灰白树干、细密的分枝、秋天已经落光叶子
 * 菱形地台铺满金黄落叶，红白格子野餐布上坐着两个人
 * 树在风里轻摆，偶发阵风，零星落叶飘下
 *
 * 取舍：梧桐的美在枝干骨架，所以整棵树只由 capsule 组成，
 * 树上没有一片叶子；地面的形状、颜色都服从这一个重点。
 * ------------------------------------------------------------------ */

const RX = 9.5, RY = 7.6, SOIL_H = 1.3;

/* 落叶地：暗棕 → 金 */
const FLOOR = [[136, 94, 50], [166, 116, 52], [194, 142, 58], [216, 172, 76], [234, 202, 112]];

/* 树皮：梧桐的灰白，带一点冷绿 */
const BARK_HI = [186, 180, 164], BARK_LO = [150, 144, 130];

/* 散落的叶子 */
const LEAF_COLORS = [
  [206, 128, 40], [224, 168, 62], [186, 86, 36],
  [156, 60, 34], [138, 88, 44], [232, 190, 88],
];

/* 野餐布 */
const CLOTH = { x: .4, y: 1.0, hw: 2.8, hh: 2.2, cell: .36 };
const CREAM = [238, 224, 200], RED = [170, 74, 58], RED_DEEP = [136, 52, 46];

/* 人物：比例照搬原项目 engine.js 的 figure()，人高约 2.1 世界单位 */
const SKIN = [228, 180, 148];
const HAIR = [46, 36, 32];
const SHOE = [226, 222, 212];
const SHIRT_A = [52, 74, 118], STRIPE_A = [232, 228, 214], PANTS_A = [92, 82, 68];
const SHIRT_B = [64, 90, 62], STRIPE_B = [216, 198, 166], PANTS_B = [58, 62, 78];

/* 三棵梧桐：高矮接近，笔直 */
const TREES = [
  { x: -3.6, y: 0.2, h: 3.55, seed: 11, phase: 0.0 },
  { x: 3.4, y: -1.6, h: 3.75, seed: 137, phase: 2.1 },
  { x: -2.2, y: -3.4, h: 3.95, seed: 253, phase: 4.3 },
];

const BG = rgb(250, 244, 230);

/* 菱形地台：在屏幕的 uv 空间取曼哈顿距离，投影出来就是一个扁菱形 */
const RU = 7.0, RV = 8.2;

function islandE(x, y) {
  const u = (x - y) / R2, v = (x + y) / R2;
  return Math.abs(u) / RU + Math.abs(v) / RV;
}

/* ---------------- 地面 ---------------- */

function clothAt(x, y) {
  const dx = x - CLOTH.x, dy = y - CLOTH.y;
  if (Math.abs(dx) > CLOTH.hw || Math.abs(dy) > CLOTH.hh) return 0;
  if (Math.abs(dx) > CLOTH.hw - .07 || Math.abs(dy) > CLOTH.hh - .07) return rgb(...RED_DEEP);

  const gx = Math.floor((dx + CLOTH.hw) / CLOTH.cell) & 1;
  const gy = Math.floor((dy + CLOTH.hh) / CLOTH.cell) & 1;
  const k = gx + gy;
  const c = k === 0 ? CREAM : k === 1 ? RED : RED_DEEP;
  const n = hash(x * 41.7, y * 53.3) - .5;
  return rgb(c[0] + n * 12, c[1] + n * 9, c[2] + n * 9);
}

function groundColor(x, y, ix, iy) {
  const e = islandE(x, y);
  if (e > 1) return 0;
  const cloth = clothAt(x, y);
  if (cloth) return cloth;
  if (e > .982) return rgb(150, 110, 66);

  const t = noise(x * 1.3, y * 1.3) * .75
          + noise(x * 3.9, y * 3.9) * .18
          + (hash(ix, iy) - .5) * .25;
  return rgb(...FLOOR[clamp(Math.floor(t * 4.8), 0, 4)]);
}

function bakeSoil() {
  const drop = SOIL_H * COS * S;
  for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
    const g = unproject(ix + .5, iy + .5 - drop);
    if (islandE(g.x, g.y) > 1) continue;
    if (iy < OY) continue; // 侧壁只出现在屏幕下半部分
    // 两个可见侧面分开打光：朝右下的面亮，朝左下的面暗
    const fx = g.x / RX, fy = g.y / RY;
    const isX = fx > Math.abs(fy);
    const t = noise(g.x * 3.2, iy * .18);
    const ramp = rampOf([176, 132, 86]);
    const base = isX ? 2.2 : 1.2;
    pix[iy * W + ix] = ramp[clamp(Math.floor(base + t * 1.2 + (bayerAt(ix, iy) - .5) * .4), 0, 4)];
  }
}

function scatterLeaves() {
  for (let n = 0; n < 2200; n++) {
    const x = (hash(n, 61) - .5) * 2 * RX;
    const y = (hash(n, 62) - .5) * 2 * RY;
    if (islandE(x, y) > .93 || clothAt(x, y)) continue;

    const p = project(x, y, 0);
    const ix = p.sx | 0, iy = p.sy | 0;
    if (ix < 1 || iy < 4 || ix >= W - 2 || iy >= H - 1) continue;

    const i = iy * W + ix;
    if (!ground[i] || zb[i] !== groundZ[i]) continue;

    const c = rgb(...LEAF_COLORS[(hash(n, 63) * LEAF_COLORS.length) | 0]);
    const shape = hash(n, 64);
    pix[i] = c;
    if (shape < .42) pix[i + 1] = c;
    else if (shape < .62) pix[i - W] = c;
  }
}

/* ---------------- 野餐布上的东西 ---------------- */

function basket(bx, by) {
  const bark = () => [126, 92, 54];
  box(bx, by, 0, bx + .62, by + .5, .34, [150, 110, 64], 5);
  box(bx + .03, by + .03, .32, bx + .59, by + .47, .37, [110, 76, 44], 7);

  const cx = bx + .31, cy = by + .25;
  capsule([bx + .08, cy, .36], [cx, cy, .84], .045, .04, bark, 'rough');
  capsule([cx, cy, .84], [bx + .54, cy, .36], .04, .04, bark, 'rough');
}

function food() {
  const crust = () => [214, 172, 108];

  capsule([.05, .05, .09], [.75, -.10, .11], .085, .075, crust, 'rough');
  for (let k = 0; k < 4; k++) {
    const t = .15 + k * .2;
    plot(lerp(.05, .75, t), lerp(.05, -.10, t), .19, rgb(168, 122, 72));
  }

  sphere(-.22, .45, .14, .155, [188, 62, 46], 'rough');
  sphere(.45, .72, .13, .14, [220, 140, 48], 'rough');
  box(-.95, .00, 0, -.60, .32, .15, [226, 196, 108], 3);
  box(.68, .38, 0, 1.08, .76, .17, [190, 138, 72], 9);
  plot(.88, .57, .21, rgb(226, 176, 104));

  sphere(1.32, .30, .10, .085, [232, 224, 206], 'rough');
  sphere(1.18, .50, .10, .075, [232, 224, 206], 'rough');
}

/* ---------------- 人物 ---------------- */

/* A：仰坐，一手撑在身后，一手搭在膝上
   骨骼沿用 figure()：臀 → 肩 → 头，臀 → 膝 → 脚，肩 → 肘 → 手 */
function sitPerson(px, py, br) {
  const shirt = z => (Math.floor(z * 8) % 2 ? SHIRT_A : STRIPE_A);
  const pants = () => PANTS_A;
  const skin = () => SKIN;

  const hip = [px, py, .24];
  const chest = [px - .20, py, .76 + br * .012];
  const sh = [px - .32, py, 1.00 + br * .024];

  // 躯干分两段，后仰带一点弧度，不是一根直杆
  capsule(hip, chest, .24, .235, shirt, 'solid');
  capsule(chest, sh, .235, .21, shirt, 'solid');

  // 脖子向前探，头略微低着
  const neck = [px - .30, py, 1.10 + br * .024];
  const head = [px - .28, py, 1.28 + br * .034];
  capsule(sh, neck, .09, .10, skin, 'solid');
  sphere(head[0], head[1], head[2] + .10, .19, SKIN, 'solid');
  sphere(head[0] - .04, head[1] - .05, head[2] + .20, .16, HAIR, 'solid');

  // 远侧腿伸直
  const k1 = [px + .54, py - .22, .26];
  const f1 = [px + 1.02, py - .26, .12];
  capsule(hip, k1, .14, .11, pants, 'solid');
  capsule(k1, f1, .11, .09, pants, 'solid');
  capsule(f1, [f1[0] + .12, f1[1], .09], .09, .08, () => SHOE, 'solid');

  // 近侧腿屈膝，脚踩在地上
  const k2 = [px + .32, py + .27, .58];
  const f2 = [px + .66, py + .31, .12];
  capsule(hip, k2, .14, .11, pants, 'solid');
  capsule(k2, f2, .11, .09, pants, 'solid');
  capsule(f2, [f2[0] + .10, f2[1], .09], .09, .08, () => SHOE, 'solid');

  // 双臂撑在身后：肘部向外张，前臂垂直落地
  for (const s of [-1, 1]) {
    const el = [px - .56, py + s * .40, .52 + br * .012];
    const hd = [px - .62, py + s * .48, .10];
    capsule(sh, el, .096, .08, shirt, 'solid');
    capsule(el, hd, .08, .065, skin, 'solid');
  }

  // 接触影：臀与两只脚
  castShadow(px, py, 0, .40, 2, .25);
  castShadow(f1[0], f1[1], 0, .20, 2, .25);
  castShadow(f2[0], f2[1], 0, .20, 2, .25);
}

/* B：双手枕头躺着，一条腿屈膝 */
function liePerson(hx, hy, br) {
  const pants = () => PANTS_B;
  const skin = () => SKIN;

  // 躺着的躯干近似水平，z 方向取条纹会失效，改成沿身体轴分段
  const stripedTorso = (a, b, r0, r1) => {
    const N = 3;
    for (let i = 0; i < N; i++) {
      const t0 = i / N, t1 = (i + 1) / N;
      const p0 = [lerp(a[0], b[0], t0), lerp(a[1], b[1], t0), lerp(a[2], b[2], t0)];
      const p1 = [lerp(a[0], b[0], t1), lerp(a[1], b[1], t1), lerp(a[2], b[2], t1)];
      const col = i % 2 ? STRIPE_B : SHIRT_B;
      capsule(p0, p1, lerp(r0, r1, t0), lerp(r0, r1, t1), () => col, 'solid');
    }
  };

  const head = [hx, hy, .26 + br * .006];
  const sh = [hx + .40, hy, .28 + br * .018];
  const waist = [hx + .84, hy, .24 + br * .008];
  const hip = [hx + 1.22, hy, .26];

  box(hx - .32, hy - .32, 0, hx + .16, hy + .32, .12, [226, 216, 196], 11);

  sphere(head[0], head[1], head[2], .19, SKIN, 'solid');
  sphere(head[0] - .07, head[1], head[2] - .03, .155, HAIR, 'solid');
  capsule(head, sh, .10, .11, skin, 'solid');

  // 躯干两段：胸腔略高，腰略沉
  stripedTorso(sh, waist, .24, .235);
  stripedTorso(waist, hip, .235, .225);

  // 双臂枕在脑后，肘部向外张开
  for (const s of [-1, 1]) {
    const elbow = [hx + .10, hy + s * .44, .42];
    const hand = [hx - .22, hy + s * .26, .24];
    capsule(sh, elbow, .096, .08, () => SHIRT_B, 'solid');
    capsule(elbow, hand, .08, .065, skin, 'solid');
  }

  // 远侧腿平伸
  const knee1 = [hx + 1.72, hy - .20, .20];
  const foot1 = [hx + 2.18, hy - .22, .13];
  capsule(hip, knee1, .14, .11, pants, 'solid');
  capsule(knee1, foot1, .11, .09, pants, 'solid');
  capsule(foot1, [foot1[0] + .12, foot1[1], .09], .09, .08, () => SHOE, 'solid');

  // 近侧腿屈膝
  const knee2 = [hx + 1.50, hy + .36, .66];
  const foot2 = [hx + 2.04, hy + .42, .17];
  capsule(hip, knee2, .14, .11, pants, 'solid');
  capsule(knee2, foot2, .11, .09, pants, 'solid');
  capsule(foot2, [foot2[0] + .10, foot2[1] + .04, .13], .09, .08, () => SHOE, 'solid');

  // 接触影
  castShadow(hx + .84, hy, 0, .60, 2, .22);
  castShadow(foot1[0], foot1[1], 0, .20, 2, .25);
}

/* ---------------- 梧桐（每帧重绘） ---------------- */

/* 梧桐：主干笔直，分叉是分层的——主干分出主枝，主枝再分细枝，
   不是从一点井喷。半径照搬原项目的 growTree（主干 0.36 起） */
function drawTree(t, sway) {
  const bark = z => (z > t.h * .6 ? BARK_HI : BARK_LO);
  const fork = [t.x + sway * .10, t.y, t.h * .52];

  capsule([t.x, t.y, 0], fork, .25, .16, bark, 'rough');

  for (let k = 0; k < 3; k++) {
    const s = t.seed + k * 17;
    const a = k / 3 * 6.283 + hash(s, 101) * .55;
    const reach = .55 + hash(s, 102) * .30;
    const midZ = t.h * (.66 + hash(s, 103) * .08);

    const mid = [
      t.x + Math.cos(a) * reach + sway * .55,
      t.y + Math.sin(a) * reach,
      midZ,
    ];
    capsule(fork, mid, .11, .065, bark, 'rough');

    // 每根主枝再分三根细枝，向外上方岔开
    for (let m = 0; m < 3; m++) {
      const q = s + m * 7;
      const aa = a + (hash(q, 104) - .5) * 1.3;
      const len = .40 + hash(q, 105) * .38;
      const tip = [
        mid[0] + Math.cos(aa) * len + sway * .55,
        mid[1] + Math.sin(aa) * len,
        midZ + .48 + hash(q, 106) * .44,
      ];
      capsule(mid, tip, .048, .010, bark, 'rough');
    }
  }
}

/* ---------------- 风 ---------------- */

function gustAt(t) {
  const v = Math.sin(t * .41 + .7) * .5
          + Math.sin(t * .67 + 2.3) * .3
          + Math.sin(t * .23 + 4.1) * .2;
  return Math.max(0, v - .28) / .72;
}

function swayAt(t, ph, gust) {
  const base = Math.sin(t * 2.9 + ph) * .6 + Math.sin(t * 5.1 + ph * 2.1) * .4;
  return base * (.09 + gust * .38);
}

/* 飘落的叶子 */
const motes = [];

function resetMote(m, ti, z) {
  const t = TREES[ti % 3];
  m.x = t.x + (Math.random() - .5) * 1.4;
  m.y = t.y + (Math.random() - .5) * 1.4;
  m.z = z * t.h;
  m.vz = .28 + Math.random() * .3;
  m.ph = Math.random() * 6.283;
  m.c = LEAF_COLORS[(Math.random() * LEAF_COLORS.length) | 0];
  return m;
}

for (let i = 0; i < 14; i++) motes.push(resetMote({}, i, Math.random()));

function update(t, dt) {
  const gust = gustAt(t);
  for (const m of motes) {
    m.z -= m.vz * dt * (1 + gust * .9);
    m.x += (.16 + gust * .8 + Math.sin(t * 2.3 + m.ph) * .12) * dt;
    m.y += Math.cos(t * 1.9 + m.ph) * .08 * dt;
    if (m.z < .04) resetMote(m, (Math.random() * 3) | 0, .6 + Math.random() * .4);
  }
}

function drawMotes() {
  for (const m of motes) {
    const p = project(m.x, m.y, m.z);
    const ix = p.sx | 0, iy = p.sy | 0;
    if (ix < 0 || iy < 0 || ix >= W - 2 || iy >= H - 1) continue;
    const c = rgb(...m.c);
    const i = iy * W + ix;
    pix[i] = c;
    if (((ix + iy) & 1) === 0) pix[i + 1] = c;
  }
}

/* 地台落在背景上的接触影：只在地台边缘下方几像素内生效 */
function bakeGroundShadow() {
  const solid = new Uint8Array(W * H);
  for (let i = 0; i < pix.length; i++) solid[i] = pix[i] !== BG ? 1 : 0;

  for (let iy = 1; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
    const i = iy * W + ix;
    if (solid[i]) continue;
    let d = 0;
    for (let k = 1; k <= 5 && !d; k++) {
      if (solid[(iy - k) * W + ix]) d = k;
    }
    if (!d) continue;
    const a = (6 - d) / 5 * .16;
    pix[i] = rgb(250 * (1 - a), 244 * (1 - a), 230 * (1 - a));
  }
}

/* 暖色阴影：保留地面的金色，只压暗一点 */
function applyWarmShadows(refZ) {
  for (let i = 0; i < pix.length; i++) {
    const s = shadowMask[i];
    if (!s) continue;
    shadowMask[i] = 0;
    if (!ground[i] || zb[i] !== refZ[i]) continue;
    if (s === 1) tint(i, .58, .48, .38);
    else tint(i, .82, .74, .62);
  }
}

/* ---------------- 烘焙静态场景 ---------------- */

function bake() {
  zb.fill(-1e9);
  pix.fill(BG);
  ground.fill(0);
  shadowMask.fill(0);
  bakeSoil();

  for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
    const g = unproject(ix + .5, iy + .5);
    const c = groundColor(g.x, g.y, ix, iy);
    if (!c) continue;
    const i = iy * W + ix;
    pix[i] = c;
    ground[i] = 1;
    zb[i] = (g.x + g.y) / R2 * COS;
  }
  groundZ.set(zb);
  scatterLeaves();

  basket(1.85, .10);
  food();

  // 枝影细碎，沿光方向排成一串
  for (const t of TREES) {
    for (let k = 0; k < 6; k++) {
      castShadow(t.x, t.y, t.h * .55 * k / 5, .34 + k * .10, 1, .3);
    }
    castShadow(t.x, t.y, 0, .16, 2, .2);
  }
  applyWarmShadows(groundZ);
  bakeGroundShadow();

  bakedPix.set(pix);
  bakedZ.set(zb);
}

/* ---------------- 主循环 ---------------- */

const FPS = 12;
let lastStep = -1;

function draw(t) {
  pix.set(bakedPix);
  zb.set(bakedZ);

  const gust = gustAt(t);
  // 呼吸：两人不同频率，看不出同步的机械感
  const brA = Math.sin(t * 1.7) * .5 + Math.sin(t * 2.9 + .8) * .5;
  const brB = Math.sin(t * 1.4 + 1.2);
  sitPerson(-.75, .85, brA);
  liePerson(.75, 1.30, brB);
  applyWarmShadows(groundZ);

  for (const tr of TREES) drawTree(tr, swayAt(t, tr.phase, gust));

  shadeEdges();
  drawMotes();
  ctx.putImageData(image, 0, 0);
}

function frame(now) {
  const step = Math.floor(now / 1000 * FPS);
  if (step !== lastStep) {
    const t = step / FPS;
    const dt = lastStep < 0 ? 1 / FPS : Math.min(.3, (step - lastStep) / FPS);
    lastStep = step;
    update(t, dt);
    draw(t);
  }
  requestAnimationFrame(frame);
}

addEventListener('resize', fit);
fit();
bake();
requestAnimationFrame(frame);
