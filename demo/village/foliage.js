'use strict';
/* ------------------------------------------------------------------
 * 秋日山村 · 金黄层叠塔林（参考图神韵还原）
 * ------------------------------------------------------------------ */

/* 核心树木配置表（严格对照参考图错落构图，全部完整绘制） */
const FOL_TREE_SPECS = [
  // 1. 👑【全图画眼】黄金参天巨树（中景木屋背后高耸入云，遮天蔽日）
  { x: -4.0, y:  8.5, kind: 'cone-mast',  h: 25.0, cr: 5.8, tkH: 5.5, layers: 8, seed: 777 },

  // 2. 山坡后排参天金杉群（构筑深远秀丽的天际线）
  { x: -13.5, y: 14.5, kind: 'cone-mast',  h: 20.0, cr: 4.8, tkH: 4.5, layers: 7, seed: 101 },
  { x:  -5.0, y: 19.5, kind: 'cone-mast',  h: 22.5, cr: 5.2, tkH: 4.8, layers: 8, seed: 202 },
  { x:   5.5, y: 18.5, kind: 'cone-spire', h: 18.5, cr: 4.2, tkH: 3.8,           seed: 303 },
  { x:  14.0, y: 13.5, kind: 'cone-spire', h: 16.5, cr: 4.0, tkH: 3.5,           seed: 404 },

  // 3. 中景木屋周围掩映穿插的树木
  { x: -14.5, y:  6.0, kind: 'cone-spire', h: 13.5, cr: 3.5, tkH: 3.0,           seed: 505 },
  { x:   4.5, y:  9.5, kind: 'cone-mast',  h: 15.0, cr: 4.0, tkH: 3.4, layers: 6, seed: 606 },
  { x:  12.5, y:  3.5, kind: 'cone-spire', h: 13.0, cr: 3.4, tkH: 2.8,           seed: 707 },

  // 4. 近景公路侧与路边错落树木
  { x: -17.5, y: -2.0, kind: 'cone-spire', h: 11.5, cr: 3.0, tkH: 2.6,           seed: 808 },
  { x:   6.5, y:-12.5, kind: 'cone-spire', h: 10.0, cr: 2.8, tkH: 2.2,           seed: 909 },
  { x:  14.5, y:-10.0, kind: 'cone-mast',  h:  9.0, cr: 2.6, tkH: 2.0, layers: 5, seed: 919 },
];

/* 全局树表 */
const trees = [];
const FOL_LEAF_SOURCES = [];
let FOL_READY = false;

/* 绘制单棵大树 */
function drawSingleTree(spec) {
  const isMast = spec.kind === 'cone-mast';
  const p = isMast
    ? { height: spec.h, crownR: spec.cr, trunkH: spec.tkH, layers: spec.layers }
    : { height: spec.h, crownR: spec.cr, trunkH: spec.tkH };

  const inst = {
    id: 'tree_' + spec.seed,
    kind: spec.kind,
    x: spec.x,
    y: spec.y,
    z: 0,
    rot: 0,
    params: p,
    seed: spec.seed,
  };

  KIT.get(spec.kind).draw(KIT_RENDER.makeCtx(inst), inst);

  FOL_LEAF_SOURCES.push({ x: spec.x, y: spec.y, z: spec.h * 0.72 });
  trees.push({ x: spec.x, y: spec.y, kind: spec.kind, h: spec.h, crownR: spec.cr, seed: spec.seed });
}

/* 烘焙生成植被树木 */
function growFoliage() {
  if (FOL_READY) return;
  FOL_READY = true;
  trees.length = 0;
  FOL_LEAF_SOURCES.length = 0;

  // 画家算法：由远及近绘制
  const sorted = [...FOL_TREE_SPECS].sort((a, b) => b.y - a.y);
  for (const spec of sorted) {
    drawSingleTree(spec);
  }
}

/* 树木投射在落叶地面的柔和阴影 */
function castTreeShadows() {
  for (const t of FOL_TREE_SPECS) {
    castShadow(t.x, t.y, t.tkH + 1.0, t.cr * 1.3, 1, 0.45);
    castShadow(t.x, t.y, 0, 0.45, 2, 0);
  }
}

/* 每帧动画接口 */
function drawFoliage() {}
