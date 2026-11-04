'use strict';
/* ------------------------------------------------------------------
 * 秋日山村 · 树木（极简版）
 * 全村统一锥树构件（demo/kit/conifers.js）：几棵树，高矮不一，
 * 沿公路两侧错落。树影烘焙一次。落叶源供 falling.js。
 * ------------------------------------------------------------------ */

/* 树表：[t 沿路, lat 横向, kind, height, crownR] —— 高矮不一 */
const FOL_TREES = [
  [-.10,  8.5, 'mast',  4.6, 1.75],
  [ .06, -8.8, 'spire', 5.4, 1.35],
  [ .20,  9.2, 'spire', 4.2, 1.20],
  [ .30, -9.4, 'mast',  5.8, 2.10],
  [ .46,  9.6, 'mast',  6.6, 2.30],
  [ .60, -8.6, 'spire', 3.8, 1.10],
  [ .72,  8.8, 'spire', 5.0, 1.30],
  [ .84, -9.2, 'mast',  4.4, 1.70],
  [ .97,  7.6, 'mast',  3.6, 1.45],
];

/* 全局树表（CONTRACT §11 规定归 foliage.js）；落叶源供 falling.js */
const trees = [];
const FOL_LEAF_SOURCES = [];
let FOL_READY = false;

/* 路参数坐标 → 世界坐标 */
function folRoadPoint(t, lat) {
  const dx = ROAD.bx - ROAD.ax, dy = ROAD.by - ROAD.ay;
  return [ROAD.ax + dx * t + dy / Math.hypot(dx, dy) * lat,
          ROAD.ay + dy * t - dx / Math.hypot(dx, dy) * lat];
}

/* 树 = KIT 锥树构件，烘焙一次（静态）；动态由草外的落叶/车/村民承担 */
function growFoliage() {
  if (FOL_READY) return;
  FOL_READY = true;
  trees.length = 0;
  for (let i = 0; i < FOL_TREES.length; i++) {
    const [t, lat, kind, h, cr] = FOL_TREES[i];
    const [x, y] = folRoadPoint(t, lat);
    const seed = 1000 + i * 37;
    const isMast = kind === 'mast';
    const p = isMast
      ? { height: h, crownR: cr, layers: 5 + (i % 2), golden: .95, trunkV: .18 }
      : { height: h, crownR: cr, rows: 8, golden: .85 };
    const o = { id: 'fol' + i, kind: 'cone-' + kind, x, y, z: 0, rot: 0, params: p, seed };
    KIT.get('cone-' + kind).draw(KIT_RENDER.makeCtx(o), o);
    trees.push({ x, y, kind: 'cone-' + kind, scale: h / 6, seed });
    FOL_LEAF_SOURCES.push({ x, y, z: h * .75 });
    /* 投影：离路近只投脚下小影 */
    const r = roadDist(x, y);
    if (r.d > ROAD.halfW + 2.5) castShadow(x, y, h * .35, cr * 1.7, 1, .5);
    castShadow(x, y, 0, .28, 2, 0);
  }
}
