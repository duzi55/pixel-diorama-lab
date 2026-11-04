'use strict';
/* ------------------------------------------------------------------
 * 秋日山村 · 金黄层叠塔林
 *
 * 树全部摆在**路轴坐标**（t 沿路 / lat 法向）上，跟随 ROAD 自动定位。
 * 主角：中景一棵参天巨塔（参考图画眼），周围塔林错落成林。
 * ------------------------------------------------------------------ */

/* [t 沿路, lat 法向, kind, 高, 冠幅, 干高, 层数] —— 高矮不一 */
const FOL_TREE_SPECS = [
  /* 👑 画眼：参天巨塔（窄高，鹤立鸡群） */
  { t: .46, lat: 13.5, kind: 'cone-mast',  h: 33.0, cr: 6.6, tkH: 10.0, seed: 777 },
  /* 后排塔群（天际线） */
  { t: .14, lat: 17.0, kind: 'cone-mast',  h: 24.0, cr: 4.9, tkH: 7.0, seed: 101 },
  { t: .28, lat: 20.0, kind: 'cone-spire', h: 21.0, cr: 3.9, tkH: 5.6, seed: 202 },
  { t: .40, lat: 18.5, kind: 'cone-mast',  h: 23.0, cr: 4.7, tkH: 6.4, seed: 242 },
  { t: .58, lat: 15.5, kind: 'cone-mast',  h: 25.0, cr: 5.0, tkH: 7.0, seed: 303 },
  { t: .70, lat: 12.0, kind: 'cone-spire', h: 20.0, cr: 3.7, tkH: 5.0, seed: 404 },
  { t: .76, lat: 10.5, kind: 'cone-mast',  h: 22.0, cr: 4.5, tkH: 6.0, seed: 505 },
  { t: .08, lat: 12.0, kind: 'cone-mast',  h: 20.0, cr: 4.1, tkH: 5.4, seed: 1313 },
  /* 中景：夹在房屋之间的塔 */
  { t: .22, lat: 7.5,  kind: 'cone-spire', h: 14.5, cr: 2.7, tkH: 3.6, seed: 606 },
  { t: .34, lat: 11.5, kind: 'cone-spire', h: 16.0, cr: 3.0, tkH: 4.0, seed: 707 },
  { t: .52, lat: 8.0,  kind: 'cone-spire', h: 14.0, cr: 2.6, tkH: 3.2, seed: 808 },
  { t: .70, lat: 11.0, kind: 'cone-mast',  h: 17.0, cr: 3.5, tkH: 4.6, seed: 909 },
  { t: .82, lat: 5.5,  kind: 'cone-spire', h: 14.5, cr: 2.7, tkH: 3.2, seed: 1010 },
  /* 前景（路南） */
  { t: .16, lat: -6.8, kind: 'cone-mast',  h: 15.0, cr: 3.2, tkH: 4.0, seed: 121 },
  { t: .34, lat: -6.2, kind: 'cone-spire', h: 12.0, cr: 2.4, tkH: 2.8, seed: 232 },
  { t: .56, lat: -7.5, kind: 'cone-spire', h: 13.0, cr: 2.5, tkH: 3.0, seed: 343 },
  { t: .84, lat: -5.5, kind: 'cone-mast',  h: 13.0, cr: 2.9, tkH: 3.2, seed: 454 },
];

const trees = [];
const FOL_LEAF_SOURCES = [];
let FOL_READY = false;

/* 路轴坐标 → 世界坐标 */
function folAt(t, lat) {
  const dx = ROAD.bx - ROAD.ax, dy = ROAD.by - ROAD.ay, len = Math.hypot(dx, dy);
  return [ROAD.ax + dx * t + (dy / len) * lat, ROAD.ay + dy * t - (dx / len) * lat];
}

function growFoliage() {
  if (FOL_READY) return;
  FOL_READY = true;
  trees.length = 0;
  FOL_LEAF_SOURCES.length = 0;

  const placed = FOL_TREE_SPECS.map(sp => {
    const [x, y] = folAt(sp.t, sp.lat);
    return { ...sp, x, y };
  });
  /* 画家算法：y 大（远）先画 */
  placed.sort((a, b) => b.y - a.y);
  for (const sp of placed) {
    const p = sp.kind === 'cone-mast'
      ? { height: sp.h, crownR: sp.cr, trunkH: sp.tkH, layers: sp.layers }
      : { height: sp.h, crownR: sp.cr, trunkH: sp.tkH, layers: sp.layers };
    const inst = { id: 'tree_' + sp.seed, kind: sp.kind, x: sp.x, y: sp.y, z: 0, rot: 0,
      params: p, seed: sp.seed };
    KIT.get(sp.kind).draw(KIT_RENDER.makeCtx(inst), inst);
    FOL_LEAF_SOURCES.push({ x: sp.x, y: sp.y, z: sp.h * .7 });
    trees.push({ x: sp.x, y: sp.y, kind: sp.kind, h: sp.h, crownR: sp.cr, seed: sp.seed });
  }
}

/* 树影：轻——参考图是晴天，影子只是树根处一小片 */
function castTreeShadows() {
  for (const t of trees) {
    /* 晴天柔影：贴地、小半径、极轻 —— 大偏移的深椭圆会读作"泥坑" */
    castShadow(t.x, t.y, 1.0, t.crownR * .55, 4, .85);
    castShadow(t.x, t.y, 0, .28, 3, .85);
  }
}

function drawFoliage() {}
