'use strict';
/* ------------------------------------------------------------------
 * 编辑器 · 地形层
 *
 * 地形不是"选一种材质"，而是**逐格绘制**。
 *
 * 网格模型：格 (gx,gy) 覆盖世界坐标 x∈[gx,gx+1], y∈[gy,gy+1]，
 * 也就是**世界轴对齐的正方形**。投影到屏幕后正好是标准等距菱形瓦片，
 * 与 engine 的 box() 可见面约定（+x 面 / +y 面）一致。
 *
 * 每格记录：材质 id + 高度 z。
 * 相邻格高低不同时画"侧壁"，地形才有立体感。
 * ------------------------------------------------------------------ */

/* ==================================================================
 * 地形材质：三层体系（主体 / 过渡 / 子项）
 *
 * 参考社区成熟做法：
 *   - Splat blending（Unity Terrain / Godot）：按权重混合相邻材质
 *   - Noise-jittered band：用噪声抖动把边界打散成不规则锯齿
 *     （docs/kit/scene.md §2 的溶解带，从"岛边缘"推广到"任意材质边界"）
 *   - Height blending：过渡带内做高度插值，高差变成缓坡而非断崖
 *
 * 每层职责：
 *   base  主体 —— 大面积底色 [r,g,b]
 *   blend 过渡 —— width 过渡带宽（格），jitter 抖动强度，slope 坡度混合
 *   detail 子项 —— 材质自带的装饰（斑块/杂点/缝隙/波纹）
 * ================================================================== */
const TERRAIN = {
  /* 网格半径（格）。世界坐标范围约 [-20, 20] */
  R: 20,

  /* 全局过渡参数（编辑器可调） */
  /* 边缘溶解配置：mode 选预设，band/strength 可微调 */
  edge: { mode: 'scatter', band: 0.5, strength: 0.62, curve: 1.0 },
  blend: {
    width: 0.42,     /* 过渡带宽度（格）：0.2 窄而硬 · 0.7 宽而柔 */
    jitter: 0.55,    /* 边界抖动：0 平滑渐变 · 1 碎片化锯齿 */
    slope: true,     /* 高度坡面混合：光线步进渲染，高差自动成缓坡 */
  },

  /* 材质表：id → { name, base, kind, blend, detail } */
  mats: {
    grass: {
      name: '草地', base: [104, 132, 62], kind: KIND_GRASS,
      absorb: 1.0,
      blend: { width: 0.45, jitter: 0.6 },
      detail: { clump: 0.45, speckle: 0.22 },   /* 苔藓斑块 + 杂点 */
    },
    soil: {
      name: '泥土', base: [176, 148, 104], kind: KIND_NONE,
      absorb: 0.22,
      blend: { width: 0.55, jitter: 0.75 },     /* 泥土边界最松散 */
      detail: { pebble: 0.05, speckle: 0.3 },
    },
    sand: {
      name: '沙地', base: [200, 172, 130], kind: KIND_NONE,
      absorb: 0.75,
      blend: { width: 0.6, jitter: 0.8 },       /* 沙会渗进邻格 */
      detail: { ripple: 0.5, speckle: 0.2 },
    },
    stone: {
      name: '石板', base: [150, 146, 138], kind: KIND_NONE,
      absorb: 0.15,
      blend: { width: 0.2, jitter: 0.25 },      /* 人工铺装：边界利落 */
      detail: { seam: true, speckle: 0.12 },
    },
    water: {
      name: '水面', base: [58, 96, 122], kind: KIND_NONE,
      absorb: 0.5,
      blend: { width: 0.35, jitter: 0.45 },
      detail: { wave: 0.6, speckle: 0.1 },
    },
    litter: {
      name: '落叶', base: [228, 172, 62], kind: KIND_NONE,
      absorb: 0.85,
      blend: { width: 0.5, jitter: 0.7 },
      detail: { clump: 0.55, speckle: 0.35 },   /* 落叶团块 + 细碎颗粒 */
    },
  },

  /* 网格数据：key = (gy + R) * (2R+1) + (gx + R) */
  cells: new Map(),

  /* 字符串 key：不再有 ±R 的绘制范围限制（无限画布） */
  key(gx, gy) { return gx + ',' + gy; },

  /* 取格，不存在返回 null */
  get(gx, gy) {
    return TERRAIN.cells.get(TERRAIN.key(gx, gy)) || null;
  },

  /* 写格 */
  set(gx, gy, mat, z) {
    const c = TERRAIN.get(gx, gy);
    if (c) { c.mat = mat; c.z = z; }
    else TERRAIN.cells.set(TERRAIN.key(gx, gy), { gx, gy, mat, z });
  },

  /* 擦除 */
  erase(gx, gy) {
    TERRAIN.cells.delete(TERRAIN.key(gx, gy));
  },

  /* 世界坐标 → 格坐标 */
  toGrid(x, y) {
    return { gx: Math.floor(x), gy: Math.floor(y) };
  },

  /* 格子中心的世界坐标 */
  cellCenter(gx, gy) {
    return { x: gx + .5, y: gy + .5 };
  },

  /* 画笔：半径（格），圆形 + 边缘抖动 */
  paint(gx, gy, mat, radius, z, mode) {
    const r = Math.ceil(radius);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > radius + .35) continue;
      const edge = radius * (.86 + noise((gx + dx) * .8, (gy + dy) * .8) * .28);
      if (d > edge) continue;
      if (mode === 'erase') TERRAIN.erase(gx + dx, gy + dy);
      else TERRAIN.set(gx + dx, gy + dy, mat, z);
    }
  },

  /* 塑形：raise / lower / flat */
  sculpt(gx, gy, radius, amount, mode) {
    const r = Math.ceil(radius);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > radius + .35) continue;
      const edge = radius * (.86 + noise((gx + dx) * .8, (gy + dy) * .8) * .28);
      if (d > edge) continue;
      const c = TERRAIN.get(gx + dx, gy + dy);
      if (!c) continue;
      if (mode === 'raise') c.z = Math.min(3, c.z + amount);
      else if (mode === 'lower') c.z = Math.max(0, c.z - amount);
      else if (mode === 'flat') c.z = amount;
    }
  },

  /* 某点的地面高度（没有格子返回 0） */
  heightAt(x, y) {
    const { gx, gy } = TERRAIN.toGrid(x, y);
    const c = TERRAIN.get(gx, gy);
    return c ? (c.z || 0) : 0;
  },

  /* 某点是否在地面上（有格子） */
  hasAt(x, y) {
    const { gx, gy } = TERRAIN.toGrid(x, y);
    return !!TERRAIN.get(gx, gy);
  },

  /* 清空 */
  clear() { TERRAIN.cells.clear(); },

  /* 序列化（含过渡参数，保证场景复现） */
  toJSON() {
    const cells = [];
    for (const c of TERRAIN.cells.values())
      cells.push([c.gx, c.gy, c.mat, Math.round(c.z * 100) / 100]);
    return { r: TERRAIN.R, cells, blend: { ...TERRAIN.blend }, edge: { ...TERRAIN.edge } };
  },

  /* 反序列化 */
  fromJSON(data) {
    TERRAIN.clear();
    if (!data || !data.cells) return;
    for (const [gx, gy, mat, z] of data.cells) TERRAIN.set(gx, gy, mat, z);
    if (data.blend) Object.assign(TERRAIN.blend, data.blend);
    if (data.edge) Object.assign(TERRAIN.edge, data.edge);
  },
};
