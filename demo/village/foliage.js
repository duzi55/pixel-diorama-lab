'use strict';
/* ------------------------------------------------------------------
 * 秋日山村 · 树木植被
 *
 * 两种骨架（配方卡 docs/kit/trees.md §1 / §6）：
 *   broadleaf —— 三段分叉干 + 6 簇球堆冠（金黄）
 *   pine      —— 直干 + 锥面塔冠（橙褐剪影，高处远景）
 *
 * 树冠进 capture 缓存（生成一次、每帧平移像素 → 风动）；
 * 树干不进 capture（根不该跟着平移），每帧重画。
 * 随机一律 hash(k, seed)，确定性可复现。
 *
 * 常量一律加 FOL_ 前缀：terrain/houses 也可能声明 RX/RY，撞名直接语法报错。
 * ------------------------------------------------------------------ */

const FOL_RX = 26, FOL_RY = 30;                 /* 地面椭圆（CONTRACT §1） */
const FOL_RA = [-13, -18], FOL_RB = [17, 19];   /* 公路中心线 */
const FOL_RHALF = 3.1, FOL_RCLEAR = 2.0;        /* 路半宽 + 外侧余量 */
const FOL_CROWN = [                              /* 阔叶冠簇表 x,y,z,spread */
  [.1, 0, 3.7, 1.6], [-1.4, -.7, 3.3, 1.2], [1.6, .7, 3.4, 1.25],
  [-.6, 1.1, 3.9, 1.1], [.9, -1.1, 4, 1.1], [.2, .1, 4.9, 1.05],
];
/* 团心：显式钉死的 6 个山头，团与团之间留出天空。
   坐标已按画布可见菱形校准（|x-y| <= 20，画面内）。
   每项 = [x, y, 半径, 针叶倾向]。针叶只占少数（参考图里金黄阔叶是主角，
   针叶是高处背景的深色剪影）。 */
const FOL_CLUMPS = [
  [-17, -5, 5.0, .50],   /* 远左上 */
  [-3, -21, 4.6, .80],   /* 最远右上（针叶为主） */
  [9, -8, 5.2, .45],     /* 右中 */
  [17, 5, 4.8, .15],     /* 右下近处（阔叶为主） */
  [-8, 10, 5.0, .12],    /* 左中 */
  [2, 24, 4.6, .05],     /* 近处左下角 */
];
const FOL_TREES = [];
const FOL_SHRUBS = [];
let FOL_READY = false;

/* ---------------- 地理小工具 ---------------- */

function FOL_roadDist(x, y) {
  const dx = FOL_RB[0] - FOL_RA[0], dy = FOL_RB[1] - FOL_RA[1];
  const t = clamp(((x - FOL_RA[0]) * dx + (y - FOL_RA[1]) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(x - FOL_RA[0] - dx * t, y - FOL_RA[1] - dy * t);
}

/* 椭圆归一化半径：1 = 地面边缘 */
function FOL_edge(x, y) {
  return Math.pow(Math.pow(Math.abs(x) / FOL_RX, 4) + Math.pow(Math.abs(y) / FOL_RY, 4), .25);
}

function FOL_houses() {
  try { return (typeof HOUSES !== 'undefined' && HOUSES) ? HOUSES : []; }
  catch (e) { return []; }               /* houses.js 还没写好时安全退化 */
}

function FOL_nearHouse(x, y, pad) {
  for (const h of FOL_houses()) {
    if (x > h.x0 - pad && x < h.x1 + pad && y > h.y0 - pad && y < h.y1 + pad) return true;
  }
  return false;
}

/* ---------------- 布点 ---------------- */

function planTrees() {
  FOL_TREES.length = 0;
  const TARGET = 42;
  for (let tries = 0; FOL_TREES.length < TARGET && tries < 6000; tries++) {
    const cl = FOL_CLUMPS[tries % FOL_CLUMPS.length];
    const a = hash(tries, 71) * 6.283;
    const rr = Math.sqrt(hash(tries, 72)) * cl[2];
    const x = cl[0] + Math.cos(a) * rr, y = cl[1] + Math.sin(a) * rr;

    if (FOL_edge(x, y) > .84) continue;                       /* 别长出台地 */
    if (FOL_roadDist(x, y) < FOL_RHALF + FOL_RCLEAR) continue; /* 让开公路 */
    if (FOL_nearHouse(x, y, 1.6)) continue;                   /* 让开房子 */
    let ok = true;
    for (const t of FOL_TREES) if (Math.hypot(t.x - x, t.y - y) < 2.55) { ok = false; break; }
    if (!ok) continue;

    const depth = clamp((y + FOL_RY) / (2 * FOL_RY), 0, 1);   /* 0 远 → 1 近 */
    const pine = hash(tries, 73) < cl[3];                      /* 针叶偏远处 */
    const scale = (pine ? 1.12 : 1) * (.86 + depth * .42) * (.92 + hash(tries, 74) * .18);
    FOL_TREES.push({
      x, y, kind: pine ? 'pine' : 'broadleaf', scale,
      h: (pine ? 6.4 : 6.0) * scale,
      crownR: (pine ? 1.5 : 1.6) * scale,
      seed: 1000 + tries * 37, phase: hash(tries, 75) * 6.283,
    });
  }
  FOL_TREES.sort((a, b) => a.y - b.y);        /* 画家算法：远(y小)先画 */
  return FOL_TREES;
}

/* ---------------- 树干（不进 capture，每帧重画） ---------------- */

function FOL_trunk(t) {
  const s = t.scale;
  const bark = z => (z > t.h * .42 ? BARK_HI : BARK);
  if (t.kind === 'pine') {
    /* 针叶树干只到最底层，锥体内部不留一根穿透的树干线 */
    capsule([t.x, t.y, 0], [t.x + .04 * s, t.y, 1.05 * s], .17 * s, .07 * s, bark, 'rough');
    return;
  }
  /* 三段分叉：主干 + 左右不对称分枝（-.8 vs +1.2） */
  const jx = (hash(t.seed, 81) - .5) * .3 * s, jy = (hash(t.seed, 82) - .5) * .3 * s;
  const mid = [t.x + jx + .3 * s, t.y + jy + .1 * s, 2.2 * s];
  capsule([t.x, t.y, 0], mid, .34 * s, .21 * s, bark, 'rough');
  capsule(mid, [t.x + jx - .8 * s, t.y + jy - .4 * s, 3.3 * s], .19 * s, .12 * s, bark, 'rough');
  capsule(mid, [t.x + jx + 1.2 * s, t.y + jy + .4 * s, 3.4 * s], .19 * s, .12 * s, bark, 'rough');
}

/* ---------------- 树冠（进 capture 缓存） ---------------- */

/* r 压到 .05：关掉引擎逐叶投影，改由每棵树自己投一片干净的影 */
function FOL_cap(x, y, z, r, c) {
  captureSphere(x, y, z, r, c, 'rough', { r: .05 });
}

/* 阔叶：6 簇球堆。内层大球要够大够叠，连成一个圆润体块（冠内漏光 / 葡萄串感
   都源于此），表层小球只负责把边缘打毛。 */
function FOL_broadCrown(t) {
  const s = t.scale, k0 = t.seed;
  /* 核心大球：把 6 簇连成一体。位置略低于簇心 → 冠底更实、顶部更松 */
  FOL_cap(t.x + .05 * s, t.y + .05 * s, 3.95 * s, 1.78 * s, LEAF[1]);
  for (let c = 0; c < FOL_CROWN.length; c++) {
    const [cx, cy, cz, sp] = FOL_CROWN[c];
    const tone = hash(k0 + c, 41) + (cz - 4.2) * .22;
    const inner = tone > .55 ? LEAF[1] : LEAF[0];
    FOL_cap(t.x + cx * s, t.y + cy * s, cz * s, sp * .8 * s, inner);    /* 居中大球 */
    FOL_cap(t.x + (cx + .3) * s, t.y + (cy - .22) * s, (cz + .22) * s,
      sp * .62 * s, inner);                                             /* 偏心大球 */
  }
  for (let k = 0; k < 175; k++) {                       /* 表层小球做轮廓 */
    const kk = k0 + k;
    const [cx, cy, cz, sp] = FOL_CROWN[k % FOL_CROWN.length];
    const a = hash(kk, 7) * 6.283, tilt = hash(kk, 8) * 2 - 1;
    const d = Math.cbrt(hash(kk, 9)) * sp * 1.08;
    const flat = Math.sqrt(1 - tilt * tilt);
    const rx = cx + Math.cos(a) * flat * d, ry = cy + Math.sin(a) * flat * d;
    const rz = cz + tilt * d * .8;
    const tone = hash(kk, 10) + (rz - 4.2) * .24 + (d / (sp * 1.08) - .5) * .32;
    const leaf = tone > .8 ? LEAF[3] : tone > .52 ? LEAF[2] : tone > .22 ? LEAF[1] : LEAF[0];
    FOL_cap(t.x + rx * s, t.y + ry * s, rz * s, (.24 + hash(kk, 11) * .24) * s, leaf);
  }
}

/* 针叶：沿锥面排行的塔。外圈定轮廓（三角形），内圈 + 中心球堵体积。
   越靠上半径收缩越快 → 顶尖而不是圆顶。 */
function FOL_pineCrown(t) {
  const s = t.scale, k0 = t.seed;
  const rows = 11 + (hash(t.seed, 61) * 3 | 0);        /* 11~13 行，行密轮廓才干净 */
  const z0 = 1.0 * s, z1 = t.h, R0 = 1.5 * s;
  for (let i = 0; i < rows; i++) {
    const u = i / (rows - 1);
    const z = z0 + u * (z1 - z0);
    const R = R0 * (1 - u * .9) * (1 - .18 * u * u);   /* 二次收缩 → 尖端更尖 */
    const base = clamp(Math.floor(u * 3.9) + 1, 0, 4); /* 底暗顶亮 */
    for (let k = 0; k < 11; k++) {                     /* 外圈：轮廓 */
      const kk = k0 + i * 40 + k;
      const a = k / 11 * 6.283 + hash(kk, 51) * .16;
      const rr = R * (.9 + hash(kk, 52) * .14);
      FOL_cap(t.x + Math.cos(a) * rr, t.y + Math.sin(a) * rr, z,
        R * .3, NEEDLE[base]);
    }
    for (let k = 0; k < 7; k++) {                      /* 内圈：体积 */
      const kk = k0 + i * 70 + k;
      const a = hash(kk, 55) * 6.283, rr = Math.sqrt(hash(kk, 56)) * R * .6;
      FOL_cap(t.x + Math.cos(a) * rr, t.y + Math.sin(a) * rr,
        z + (hash(kk, 57) - .5) * .2 * s, R * .4, NEEDLE[clamp(base + 1, 0, 4)]);
    }
    FOL_cap(t.x, t.y, z, R * .38, NEEDLE[clamp(base + 1, 0, 4)]);  /* 中心堵空 */
  }
  FOL_cap(t.x, t.y, z1 + .2 * s, .17 * s, NEEDLE[4]);               /* 尖顶 */
}

/* ---------------- 建立缓存 ---------------- */

function growFoliage() {
  if (FOL_READY) return;                 /* leaves 只增不减，重复调用会翻倍 */
  FOL_READY = true;
  if (!FOL_TREES.length) planTrees();
  for (const t of FOL_TREES) FOL_trunk(t);          /* 先落干 → capture 有遮挡依据 */
  for (const t of FOL_TREES) {                      /* 再按 y 升序注册 capture */
    if (t.kind === 'pine') FOL_pineCrown(t); else FOL_broadCrown(t);
  }
  FOL_planShrubs();
}

/* ---------------- 每帧绘制 ---------------- */

function drawFoliage(t) {
  for (const tr of FOL_TREES) FOL_trunk(tr);        /* 干：根不动，每帧重画 */
  drawLeaves(t);                                   /* 冠：capture 像素平移 */
  for (const tr of FOL_TREES) {
    const sway = Math.sin(t * .9 + tr.phase) * .3;  /* 影随风偏一点 */
    castShadow(tr.x + sway, tr.y, tr.h * .3, tr.crownR * 1.5, 1, .5);
    castShadow(tr.x, tr.y, 0, .22 * tr.scale, 2, 0);
  }
}

/* ---------------- 灌木（静态，不风动） ---------------- */

function FOL_planShrubs() {
  FOL_SHRUBS.length = 0;
  const dx = FOL_RB[0] - FOL_RA[0], dy = FOL_RB[1] - FOL_RA[1];
  const len = Math.hypot(dx, dy), px = -dy / len, py = dx / len;
  for (let k = 0; k < 30; k++) {
    const t = hash(k, 91);
    const side = (k & 1) ? 1 : -1;
    const off = side * (FOL_RHALF + 2.6 + hash(k, 92) * 3.4);
    const bx = FOL_RA[0] + dx * t + px * off, by = FOL_RA[1] + dy * t + py * off;
    const x = bx + (hash(k, 93) - .5) * 1.8, y = by + (hash(k, 94) - .5) * 1.8;
    FOL_SHRUBS.push({
      x, y, r: .34 + hash(k, 95) * .34, h: .3 + hash(k, 96) * .38, seed: 300 + k,
    });
  }
}

function drawShrubs() {
  if (!FOL_SHRUBS.length) FOL_planShrubs();
  for (const s of FOL_SHRUBS) {
    for (let k = 0; k < 5; k++) {
      const kk = s.seed + k;
      const a = hash(kk, 97) * 6.283, d = Math.cbrt(hash(kk, 98)) * s.r;
      const c = SHRUB[clamp(Math.floor(hash(kk, 100) * 2.999), 0, 2)];
      sphere(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d,
        s.h * (.5 + hash(kk, 99) * .55), s.r * (.5 + hash(kk, 101) * .32), c, 'rough');
    }
    castShadow(s.x, s.y, .12, s.r * 1.15, 1, .4);
  }
}
