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

/* 树冠像素精灵（风动回放用）：{px:[ix,iy,d,color,...], top, rows, phase} */
const treeSprites = [];
let folPlaced = [];

function folInst(sp, part) {
  /* 场景实例（来自 Studio 场景文件）自带完整参数；手写树表只有 h/cr/tkH */
  const p = sp.params || (sp.kind === 'cone-mast'
    ? { height: sp.h, crownR: sp.cr, trunkH: sp.tkH, layers: sp.layers }
    : { height: sp.h, crownR: sp.cr, trunkH: sp.tkH });
  return { id: 'tree_' + sp.seed, kind: sp.kind, x: sp.x, y: sp.y, z: 0, rot: sp.rot || 0,
    params: p, seed: sp.seed, part };
}

/* 第一遍：只画树干（静态，进底图） */
function drawTreeTrunks() {
  folPlaced = FOL_TREE_SPECS.map(sp => {
    /* 场景文件里的实例是世界坐标，手写树表是路轴坐标 */
    const [x, y] = sp.x != null ? [sp.x, sp.y] : folAt(sp.t, sp.lat);
    return { ...sp, x, y };
  }).sort((a, b) => b.y - a.y);          // 画家算法：远先画
  for (const sp of folPlaced) {
    const inst = folInst(sp, 'trunk');
    KIT.get(sp.kind).draw(KIT_RENDER.makeCtx(inst), inst);
  }
}

/* 第二遍：只画树冠，并把像素录进精灵供每帧风动回放 */
function drawTreeCanopies() {
  treeSprites.length = 0;
  FOL_LEAF_SOURCES.length = 0;
  for (const sp of folPlaced) {
    const inst = folInst(sp, 'canopy');
    plotCapture = [];
    KIT.get(sp.kind).draw(KIT_RENDER.makeCtx(inst), inst);
    const px = plotCapture;
    plotCapture = null;
    if (!px.length) continue;
    let top = 1e9, bottom = -1;
    for (let k = 1; k < px.length; k += 4) {
      if (px[k] < top) top = px[k];
      if (px[k] > bottom) bottom = px[k];
    }
    treeSprites.push({
      px, top, rows: Math.max(1, bottom - top + 1),
      phase: hash(sp.seed, 301) * 6.283,
      tall: sp.h,
    });
    FOL_LEAF_SOURCES.push({ x: sp.x, y: sp.y, z: sp.h * .7 });
    trees.push({ x: sp.x, y: sp.y, kind: sp.kind, h: sp.h, crownR: sp.cr, seed: sp.seed });
  }
}

/* 每帧：树冠随风平移回放（顶部摆幅大、根部不动） */
function drawTreeWind(t) {
  if (!treeSprites.length) return;
  /* 阵风包络：多个低频正弦叠加（和 grass/落叶同一套手绘语言） */
  const gust = Math.sin(t * .62 + .4) * .55 + Math.sin(t * 1.55) * .3 + Math.sin(t * .27 + 2.1) * .15;
  for (const sp of treeSprites) {
    const sway = Math.sin(t * 1.05 + sp.phase) * .6 + gust * .55;
    const amp = 2.4;                                       // 树梢最大位移（像素）
    const rowOff = sp.rowOff || (sp.rowOff = new Int8Array(sp.rows));
    for (let r = 0; r < sp.rows; r++) {
      const hf = 1 - r / sp.rows;                          // 顶部 1 / 底部 0
      rowOff[r] = Math.round(sway * amp * hf * hf);
    }
    const px = sp.px;
    for (let k = 0; k < px.length; k += 4) {
      const iy = px[k + 1];
      const jx = px[k] + rowOff[iy - sp.top], jy = iy;
      if (jx < 0 || jx >= W || jy < 0 || jy >= H) continue;
      const j = jy * W + jx, d = px[k + 2];
      if (d <= zb[j]) continue;
      zb[j] = d;
      pix[j] = px[k + 3];
    }
  }
}

/* 兼容旧接口：growFoliage = 两遍都跑（测试/编辑器可能直接调） */
function growFoliage() {
  if (FOL_READY) return;
  FOL_READY = true;
  trees.length = 0;
  drawTreeTrunks();
  drawTreeCanopies();
}

/* 树影：轻——参考图是晴天，影子只是树根处一小片 */
function castTreeShadows() {
  for (const t of folPlaced) {
    /* 晴天柔影：贴地、小半径、极轻 —— 大偏移的深椭圆会读作"泥坑" */
    castShadow(t.x, t.y, 1.0, t.cr * .55, 4, .85);
    castShadow(t.x, t.y, 0, .28, 3, .85);
  }
}

/* ---------------- 场景文件覆盖（可选） ----------------
 * 在 Studio 编辑器里摆好树 → 保存为 demo/scenes/village.json →
 * 山村优先用它布树；没有这个文件就用手写的路轴树表。
 * 场景对象存的是世界坐标（建议先在编辑器里用"抓取底图"载入山村再摆，
 * 坐标就和地形/房屋对齐）。
 */
async function loadSceneTrees() {
  try {
    const res = await fetch('../scenes/village.json', { cache: 'no-store' });
    if (!res.ok) return false;
    const scene = await res.json();
    const objs = Array.isArray(scene.objects) ? scene.objects : [];
    const specs = [];
    for (const o of objs) {
      const comp = KIT.get(o.kind);
      if (!comp || comp.category !== 'tree') continue;
      const p = KIT.resolve(o.kind, o.params);
      specs.push({
        kind: o.kind, x: +o.x || 0, y: +o.y || 0, rot: o.rot || 0,
        h: p.height, cr: p.crownR, tkH: p.trunkH,
        seed: o.seed == null ? 1 : o.seed, params: p,
      });
    }
    if (!specs.length) return false;
    /* 场景若是围着一小块局部坐标摆的（没抓底图），整体平移到路中段，
       免得树全落在画布外的角落 */
    const cx = specs.reduce((s, o) => s + o.x, 0) / specs.length;
    const cy = specs.reduce((s, o) => s + o.y, 0) / specs.length;
    const midX = (ROAD.ax + ROAD.bx) / 2, midY = (ROAD.ay + ROAD.by) / 2;
    if (Math.hypot(cx - midX, cy - midY) > 30) {
      const dx = midX - cx, dy = midY - cy;
      for (const s of specs) { s.x += dx; s.y += dy; }
    }
    FOL_TREE_SPECS.length = 0;
    FOL_TREE_SPECS.push(...specs);
    return true;
  } catch {
    return false;   // file:// 打开 / 没有场景文件 → 用默认树表
  }
}

