'use strict';
/* ------------------------------------------------------------------
 * 秋日山村 · 树木植被
 * 两种骨架（配方卡 docs/kit/trees.md §1 / §6）：
 *   broadleaf —— 三段分叉干 + 6 簇球堆冠（金黄，画面主体）
 *   pine      —— 直干 + 锥面塔冠（橙褐剪影，远景高处）
 * 树冠进 capture 缓存（生成一次、每帧平移像素 → 风动）；树干不进 capture
 * （根不该跟着平移），每帧重画。随机一律 hash(k, seed)，确定性可复现。
 * 名字一律加 FOL_ 前缀；`trees` 按 CONTRACT §11 归本模块。
 * ------------------------------------------------------------------ */

/* 地面椭圆（CONTRACT §1）；公路几何直接引用 terrain.js 的 ROAD（唯一真相源） */
const FOL_RX = 26, FOL_RY = 30;
const FOL_RHALF = ROAD.halfW, FOL_RCLEAR = 2.6; /* 路半宽 + 冠半径余量 */
/* 阔叶冠簇表 x,y,z,spread —— 改树形改这里 */
const FOL_CROWN = [
  [.1, 0, 3.7, 1.6], [-1.4, -.7, 3.3, 1.2], [1.6, .7, 3.4, 1.25],
  [-.6, 1.1, 3.9, 1.1], [.9, -1.1, 4, 1.1], [.2, .1, 4.9, 1.05],
];
/* 团心：用**路的参数坐标**钉死，天然跟着路走（台地就是沿路的一条斜带）。
   每项 = [t 沿路(0远→1近), lat 横向(正=屏幕右上侧), 世界半径, 针叶倾向]。
   lat 必须明显大于路半宽+余量(~4)，否则树会长在路上；两侧的团在 t 上错开
   → 屏幕上树团呈之字形，团与团之间留出天空。针叶只占少数（参考图里金黄
   阔叶是主角，针叶是高处背景的深色剪影）。 */
const FOL_CLUMPS = [
  /* ★ lat 必须**避开房子带**（房子在 ±6~8.6）。
   *   参考图里房子是清晰可见的主角，树丛在房子**外侧**。
   *   → 主树丛的 lat 全部 ≥ 11，或 ≤ -11。 */
  [.06, 12.0, 4.2, .70],    /* 最远右上：针叶林 */
  [.24, -11.5, 4.2, .62],   /* 远左下：针叶为主 */
  [.42, 12.8, 4.4, .38],    /* 中上 */
  [.60, -12.0, 4.4, .22],   /* 中下 */
  [.78, 12.4, 4.2, .14],    /* 近上 */
  [.94, -11.2, 3.8, .08],   /* 最近下 */
  [1.08, 10.0, 3.0, .04],   /* 画外右下角 */
];

/* 全局树表（CONTRACT §11 规定归 foliage.js） */
const trees = [];
/* 飘落落叶的源点：每棵树冠中心，供 falling.js 生成落叶 */
const FOL_LEAF_SOURCES = [];
const FOL_SHRUBS = [];
let FOL_READY = false;

/* ---------------- 几何小工具 ---------------- */
/* 路的参数坐标：t 沿路，lat 横向 */
function folRoadFrame() {
  const dx = ROAD.bx - ROAD.ax, dy = ROAD.by - ROAD.ay;
  const len = Math.hypot(dx, dy) || 1;
  return { ax: ROAD.ax, ay: ROAD.ay, dx, dy, len, nx: dy / len, ny: -dx / len };
}
/* 路坐标 → 世界坐标 */
function folRoadPoint(t, lat) {
  const f = folRoadFrame();
  return [f.ax + f.dx * t + f.nx * lat, f.ay + f.dy * t + f.ny * lat];
}
/* 到公路中心线的距离（点到线段） */
function folRoadDist(x, y) {
  const f = folRoadFrame();
  const t = clamp(((x - f.ax) * f.dx + (y - f.ay) * f.dy) / (f.dx * f.dx + f.dy * f.dy), 0, 1);
  return Math.hypot(x - f.ax - f.dx * t, y - f.ay - f.dy * t);
}
/* 台地归一化半径：1 = 地面边缘。优先用 terrain.js 的 hillE()
   （真实台地是沿路的超椭圆，不是正椭圆）；terrain.js 没就位时退回 RX/RY 椭圆。 */
function folEdge(x, y) {
  if (typeof hillE === 'function') return hillE(x, y);
  return Math.pow(Math.pow(Math.abs(x) / FOL_RX, 4) + Math.pow(Math.abs(y) / FOL_RY, 4), .25);
}
/* 房子配置表（houses.js 可能还没就位，防御性退化） */
function folHouses() {
  try { return (typeof HOUSES !== 'undefined' && HOUSES) ? HOUSES : []; }
  catch (e) { return []; }
}

function folNearHouse(x, y, pad) {
  for (const h of folHouses()) {
    if (x > h.x0 - pad && x < h.x1 + pad && y > h.y0 - pad && y < h.y1 + pad) return true;
  }
  return false;
}
/* 树基是否落在地面上：查 ground[] 的 9 个采样点（烘焙好的真实像素最准） */
function folOnGround(x, y) {
  const p = project(x, y, 0);
  const ix = Math.round(p.sx), iy = Math.round(p.sy);
  let hit = 0, tot = 0;
  for (let dy = -3; dy <= 3; dy += 3) for (let dx = -3; dx <= 3; dx += 3) {
    const jx = ix + dx, jy = iy + dy;
    if (jx < 0 || jy < 0 || jx >= W || jy >= H) continue;
    tot++; if (ground[jy * W + jx]) hit++;
  }
  return tot > 0 && hit / tot >= .45;
}

/* ---------------- 布点 ---------------- */
function planTrees() {
  trees.length = 0;
  const roadLen = folRoadFrame().len;
  const TARGET = 40;
  for (let tries = 0; trees.length < TARGET && tries < 8000; tries++) {
    const cl = FOL_CLUMPS[tries % FOL_CLUMPS.length];
    /* 团内抖动：t 是 0~1 归一化量，抖动量要除以路长；lat 直接是世界单位 */
    const t = cl[0] + (hash(tries, 71) - .5) * cl[2] * 2 / roadLen;
    const lat = cl[1] + (hash(tries, 72) - .5) * cl[2] * 1.6;
    const [x, y] = folRoadPoint(t, lat);
    if (folEdge(x, y) > .82) continue;                        /* 别长出台地 */
    /* ★ 让路距离 = 路半宽 + 冠半径（最大 2.0）+ 余量。
       之前 FOL_RCLEAR=1.6，冠直接伸到路中心上方，把路盖掉。 */
    if (folRoadDist(x, y) < FOL_RHALF + FOL_RCLEAR) continue;  /* 让开公路 */
    if (folNearHouse(x, y, 1.9)) continue;                    /* 让开房子 */
    if (!folOnGround(x, y)) continue;                         /* 必须在地面上 */
    let ok = true;
    for (const tr of trees) if (Math.hypot(tr.x - x, tr.y - y) < 1.85) { ok = false; break; }
    if (!ok) continue;

    const depth = clamp((y + FOL_RY) / (2 * FOL_RY), 0, 1);   /* 0 远 → 1 近 */
    const pine = hash(tries, 73) < cl[3];                     /* 针叶偏远处 */
    const scale = (pine ? 1.08 : 1) * (.86 + depth * .4) * (.92 + hash(tries, 74) * .18);
    trees.push({
      x, y, kind: pine ? 'pine' : 'broadleaf', scale,
      h: (pine ? 5.2 : 5.9) * scale, crownR: (pine ? 1.45 : 1.6) * scale,
      crownZ: (pine ? 3.0 : 3.9) * scale,
      seed: 1000 + tries * 37, phase: hash(tries, 75) * 6.283,
    });
  }
  trees.sort((a, b) => a.y - b.y);        /* 画家算法：远(y小)先画 */
  return trees;
}

/* ---------------- 树干（不进 capture，每帧重画） ---------------- */
function folTrunk(t) {
  const s = t.scale;
  const bark = z => (z > t.h * .42 ? BARK_HI : BARK);
  if (t.kind === 'pine') {
    /* 针叶树干只到最底层，锥体内部不留一根穿透的树干线 */
    capsule([t.x, t.y, 0], [t.x + .04 * s, t.y, 1.0 * s], .16 * s, .06 * s, bark, 'rough');
    return;
  }
  /* 三段分叉：主干 + 左右不对称分枝（-.8 vs +1.2） */
  const jx = (hash(t.seed, 81) - .5) * .3 * s, jy = (hash(t.seed, 82) - .5) * .3 * s;
  const mid = [t.x + jx + .3 * s, t.y + jy + .1 * s, 2.2 * s];
  capsule([t.x, t.y, 0], mid, .32 * s, .2 * s, bark, 'rough');
  capsule(mid, [t.x + jx - .8 * s, t.y + jy - .4 * s, 3.3 * s], .18 * s, .11 * s, bark, 'rough');
  capsule(mid, [t.x + jx + 1.2 * s, t.y + jy + .4 * s, 3.4 * s], .18 * s, .11 * s, bark, 'rough');

}

/* ---------------- 树冠（进 capture 缓存） ---------------- */
/* r 压到 .05：关掉引擎逐叶投影，改由 castTreeShadows() 统一投一片干净的影 */
function folCap(x, y, z, r, c) { captureSphere(x, y, z, r, c, 'rough', { r: .05 }); }

/* 阔叶：6 簇球堆。核心大球要够大够叠，连成圆润体块
   （冠内漏光 / 葡萄串感都源于此），表层小球只负责把边缘打毛。 */
function folBroadCrown(t) {
  const s = t.scale, k0 = t.seed;
  folCap(t.x + .05 * s, t.y + .05 * s, 3.95 * s, 1.78 * s, LEAF[1]);   /* 核心球 */
  for (let c = 0; c < FOL_CROWN.length; c++) {
    const [cx, cy, cz, sp] = FOL_CROWN[c];
    const tone = hash(k0 + c, 41) + (cz - 4.2) * .22;
    const inner = tone > .55 ? LEAF[1] : LEAF[0];
    folCap(t.x + cx * s, t.y + cy * s, cz * s, sp * .8 * s, inner);      /* 居中 */
    folCap(t.x + (cx + .3) * s, t.y + (cy - .22) * s, (cz + .22) * s, sp * .62 * s, inner);
  }
  for (let k = 0; k < 175; k++) {                       /* 表层小球做轮廓 */
    const kk = k0 + k;
    const [cx, cy, cz, sp] = FOL_CROWN[k % FOL_CROWN.length];
    const a = hash(kk, 7) * 6.283, tilt = hash(kk, 8) * 2 - 1;
    const d = Math.cbrt(hash(kk, 9)) * sp * 1.08, flat = Math.sqrt(1 - tilt * tilt);
    const rx = cx + Math.cos(a) * flat * d, ry = cy + Math.sin(a) * flat * d;
    const rz = cz + tilt * d * .8;
    const tone = hash(kk, 10) + (rz - 4.2) * .24 + (d / (sp * 1.08) - .5) * .32;
    const leaf = tone > .8 ? LEAF[3] : tone > .52 ? LEAF[2] : tone > .22 ? LEAF[1] : LEAF[0];
    folCap(t.x + rx * s, t.y + ry * s, rz * s, (.24 + hash(kk, 11) * .24) * s, leaf);
  }
}

/* 针叶：沿锥面排行的塔。外圈定轮廓（三角形），内圈 + 中心球堵体积。
   半径二次收缩 → 顶尖而不是圆顶。 */
function folPineCrown(t) {
  const s = t.scale, k0 = t.seed;
  const rows = 11 + (hash(t.seed, 61) * 3 | 0);        /* 11~13 行，行密轮廓才干净 */
  const z0 = 1.0 * s, z1 = t.h, R0 = 1.45 * s;
  for (let i = 0; i < rows; i++) {
    const u = i / (rows - 1);
    const z = z0 + u * (z1 - z0);
    const R = R0 * (1 - u * .9) * (1 - .18 * u * u);   /* 二次收缩 */
    const base = clamp(Math.floor(u * 3.9) + 1, 0, 4); /* 底暗顶亮 */
    for (let k = 0; k < 11; k++) {                     /* 外圈：轮廓 */
      const kk = k0 + i * 40 + k, a = k / 11 * 6.283 + hash(kk, 51) * .16;
      const rr = R * (.9 + hash(kk, 52) * .14);
      folCap(t.x + Math.cos(a) * rr, t.y + Math.sin(a) * rr, z, R * .3, NEEDLE[base]);
    }
    for (let k = 0; k < 7; k++) {                      /* 内圈：体积 */
      const kk = k0 + i * 70 + k, a = hash(kk, 55) * 6.283;
      const rr = Math.sqrt(hash(kk, 56)) * R * .6, dz = (hash(kk, 57) - .5) * .2 * s;
      folCap(t.x + Math.cos(a) * rr, t.y + Math.sin(a) * rr, z + dz, R * .4,
        NEEDLE[clamp(base + 1, 0, 4)]);
    }
    folCap(t.x, t.y, z, R * .38, NEEDLE[clamp(base + 1, 0, 4)]);  /* 中心堵空 */
  }
  folCap(t.x, t.y, z1 + .2 * s, .17 * s, NEEDLE[4]);               /* 尖顶 */
}

/* ---------------- 建立缓存 ---------------- */
function growFoliage() {
  if (FOL_READY) return;                 /* leaves 只增不减，重复调用会翻倍 */
  FOL_READY = true;
  if (!trees.length) planTrees();
  for (const t of trees) folTrunk(t);             /* 先落干 → capture 有遮挡依据 */
  for (const t of trees) {                       /* 再按 y 升序注册 capture */
    if (t.kind === 'pine') folPineCrown(t); else folBroadCrown(t);
    FOL_LEAF_SOURCES.push({ x: t.x, y: t.y, z: t.crownZ });
  }
  folPlanShrubs();
}

/* ---------------- 树的投影（烘焙时投一次） ---------------- */
function castTreeShadows() {
  for (const t of trees) {
    castShadow(t.x, t.y, t.h * .3, t.crownR * 1.5, 1, .5);
    castShadow(t.x, t.y, 0, .22 * t.scale, 2, 0);
  }
}

/* ---------------- 每帧绘制 ---------------- */
function drawFoliage(t) {
  for (const tr of trees) folTrunk(tr);            /* 干：根不动，每帧重画 */
  drawLeaves(t);                                   /* 冠：capture 像素平移 */
}

/* ---------------- 灌木（静态，不风动） ---------------- */
function folPlanShrubs() {
  FOL_SHRUBS.length = 0;
  for (let k = 0; k < 30; k++) {
    const t = hash(k, 91);
    const side = (k & 1) ? 1 : -1;
    const [x, y] = folRoadPoint(t, side * (FOL_RHALF + 2.4 + hash(k, 92) * 3.6));
    FOL_SHRUBS.push({
      x: x + (hash(k, 93) - .5) * 1.6, y: y + (hash(k, 94) - .5) * 1.6,
      r: .34 + hash(k, 95) * .34, h: .3 + hash(k, 96) * .38, seed: 300 + k });
  }
}

function drawShrubs() {
  if (!FOL_SHRUBS.length) folPlanShrubs();
  for (const s of FOL_SHRUBS) {
    for (let k = 0; k < 5; k++) {
      const kk = s.seed + k;
      const a = hash(kk, 97) * 6.283, d = Math.cbrt(hash(kk, 98)) * s.r;
      const c = SHRUB[clamp(Math.floor(hash(kk, 100) * 2.999), 0, 2)];
      sphere(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d, s.h * (.5 + hash(kk, 99) * .55),
        s.r * (.5 + hash(kk, 101) * .32), c, 'rough');
    }
    castShadow(s.x, s.y, .12, s.r * 1.15, 1, .4);
  }
}
