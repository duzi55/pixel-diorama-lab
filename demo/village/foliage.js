'use strict';
/* ------------------------------------------------------------------
 * 秋日山村 · 树木植被
 * ★ 树型统一（用户明确要求）：全村只认 demo/kit/conifers.js 的锥树：
 *   cone-mast 金黄巨塔（主体）/ cone-spire 尖锥（点缀）， bushes 也是小尖锥。
 *   旧的球堆坨坨树（broadleaf 式 6 簇球冠）已整体删除。
 * 树在烘焙期由构件画一次（静态）；动态由草、落叶、车、村民承担。
 * 随机一律 hash(k, seed)，确定性可复现。
 * 名字一律加 FOL_ 前缀；`trees` 按 CONTRACT §11 归本模块。
 * ------------------------------------------------------------------ */

/* 地面椭圆（CONTRACT §1）；公路几何直接引用 terrain.js 的 ROAD（唯一真相源） */
const FOL_RX = 26, FOL_RY = 30;
const FOL_RHALF = ROAD.halfW, FOL_RCLEAR = 4.0; /* 路半宽 + 冠半径余量（保证公路全程可见） */
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
    const spire = hash(tries, 73) < cl[3];                    /* 尖锥偏远处点缀 */
    const scale = (.86 + depth * .4) * (.92 + hash(tries, 74) * .18);
    trees.push({
      x, y, kind: spire ? 'cone-spire' : 'cone-mast', scale,
      seed: 1000 + tries * 37,
    });
  }
  trees.sort((a, b) => a.y - b.y);        /* 画家算法：远(y小)先画 */
  return trees;
}

/* ---------------- 树 = KIT 锥树构件（完整绘制） ---------------- */
function folDrawTree(t) {
  const s = t.scale;
  /* 高矮不一：height/crownR 都带随机 —— 每棵都是完整的树 */
  const p = t.kind === 'cone-mast'
    ? { height: 9.5 * s * (.9 + hash(t.seed, 76) * .3),
        crownR: 3.4 * s * (.9 + hash(t.seed, 77) * .2),
        layers: 5 + (hash(t.seed, 78) * 2 | 0),
        golden: .9 + hash(t.seed, 79) * .1, trunkV: .18 }
    : { height: 11 * s * (.9 + hash(t.seed, 76) * .3),
        crownR: 2.3 * s * (.9 + hash(t.seed, 77) * .2),
        rows: 8 + (hash(t.seed, 78) * 3 | 0),
        golden: .8 + hash(t.seed, 79) * .15 };
  const o = { id: 'fol' + t.seed, kind: t.kind, x: t.x, y: t.y, z: 0, rot: 0,
    params: p, seed: t.seed };
  KIT.get(t.kind).draw(KIT_RENDER.makeCtx(o), o);
  FOL_LEAF_SOURCES.push({ x: t.x, y: t.y, z: 7 * s });
}

/* ---------------- 建立缓存 ---------------- */
function growFoliage() {
  if (FOL_READY) return;
  FOL_READY = true;
  if (!trees.length) planTrees();
  for (const t of trees) folDrawTree(t);
  folPlanShrubs();
}

/* ---------------- 树的投影（烘焙时投一次） ---------------- */
function castTreeShadows() {
  for (const t of trees) {
    const s = t.scale;
    castShadow(t.x, t.y, 4 * s, 3.4 * s, 1, .5);
    castShadow(t.x, t.y, 0, .3 * s, 2, 0);
  }
}

/* ---------------- 每帧 ---------------- */
/* 树是烘焙静态（锥树融合体不适合 capture 平移回放 —— 会破融合）；
 * 场景动态由草（figures.js drawTufts）、落叶、车、村民承担。 */
function drawFoliage() {}

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

/* 灌木位也是小尖锥（统一树型语言） */
function drawShrubs() {
  if (!FOL_SHRUBS.length) folPlanShrubs();
  for (const sb of FOL_SHRUBS) {
    const o = { id: 'sh' + sb.seed, kind: 'cone-spire', x: sb.x, y: sb.y, z: 0, rot: 0,
      params: { height: 2.2 + hash(sb.seed, 96) * 1.2, crownR: .9 + hash(sb.seed, 95) * .4,
                rows: 6, golden: .8 }, seed: sb.seed };
    KIT.get('cone-spire').draw(KIT_RENDER.makeCtx(o), o);
    castShadow(sb.x, sb.y, .12, 1.1, 1, .4);
  }
}
