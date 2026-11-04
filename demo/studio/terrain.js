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

const TERRAIN = {
  /* 网格半径（格）。世界坐标范围约 [-20, 20] */
  R: 20,
  /* 材质表：id → { name, color, kind } */
  mats: {
    grass: { name: '草地', color: [104, 132, 62], kind: KIND_GRASS },
    soil: { name: '泥土', color: [176, 148, 104], kind: KIND_NONE },
    sand: { name: '沙地', color: [200, 172, 130], kind: KIND_NONE },
    stone: { name: '石板', color: [150, 146, 138], kind: KIND_NONE },
    water: { name: '水面', color: [58, 96, 122], kind: KIND_NONE },
  },

  /* 网格数据：key = (gy + R) * (2R+1) + (gx + R) */
  cells: new Map(),

  key(gx, gy) { return (gy + TERRAIN.R) * (TERRAIN.R * 2 + 1) + (gx + TERRAIN.R); },

  /* 取格，不存在返回 null */
  get(gx, gy) {
    if (gx < -TERRAIN.R || gy < -TERRAIN.R || gx > TERRAIN.R || gy > TERRAIN.R) return null;
    return TERRAIN.cells.get(TERRAIN.key(gx, gy)) || null;
  },

  /* 写格 */
  set(gx, gy, mat, z) {
    if (gx < -TERRAIN.R || gy < -TERRAIN.R || gx > TERRAIN.R || gy > TERRAIN.R) return;
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

  /* 序列化 */
  toJSON() {
    const cells = [];
    for (const c of TERRAIN.cells.values())
      cells.push([c.gx, c.gy, c.mat, Math.round(c.z * 100) / 100]);
    return { r: TERRAIN.R, cells };
  },

  /* 反序列化 */
  fromJSON(data) {
    TERRAIN.clear();
    if (!data || !data.cells) return;
    for (const [gx, gy, mat, z] of data.cells) TERRAIN.set(gx, gy, mat, z);
  },
};
