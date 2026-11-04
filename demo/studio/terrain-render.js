'use strict';
/* ------------------------------------------------------------------
 * 编辑器 · 地形渲染（terrain-render.js）
 *
 * 三层材质体系的渲染端：
 *
 *   ┌─ 主体 base ────────────────────────────────────────┐
 *   │ 每格自己的材质底色，按噪声做明度起伏                │
 *   ├─ 过渡 blend ───────────────────────────────────────┤
 *   │ ① 抖动过渡带：靠近异材质边界时，用 Bayer + 噪声      │
 *   │    决定该像素是否"咬"进邻格材质（像素风的渐变）      │
 *   │ ② 坡面混合：高差处让本格边缘向邻格高度靠拢，         │
 *   │    断崖变成缓坡（Height blending）                  │
 *   ├─ 子项 detail ──────────────────────────────────────┤
 *   │ 材质自带装饰：苔藓斑/石子/沙纹/石板缝/水波           │
 *   └────────────────────────────────────────────────────┘
 *
 * 格 (gx,gy) 是世界轴对齐正方形，投影后是标准等距菱形瓦片。
 * 画家算法：按 (gx+gy) 从大到小画。
 * ------------------------------------------------------------------ */

/* ---------------- 顶面 ---------------- */

function terrainDrawTop(gx, gy) {
  const cell = TERRAIN.get(gx, gy);
  if (!cell) return;
  const mat = TERRAIN.mats[cell.mat];
  if (!mat) return;

  const z = cell.z || 0;
  const ramp = rampOf(mat.base);
  const c = terrainCorners(gx, gy);

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of c) {
    /* 坡面混合会把边缘像素抬向更高的邻格（最高 +3），
       包围盒必须按"可能的最大高度"算，否则顶部会漏出背景 */
    const p = project(x, y, z);
    if (p.sx < minX) minX = p.sx; if (p.sx > maxX) maxX = p.sx;
    if (p.sy < minY) minY = p.sy;
    const pTop = project(x, y, z + 3);
    if (pTop.sy < minY) minY = pTop.sy;
    if (p.sy > maxY) maxY = p.sy;
  }
  const x0 = Math.max(0, Math.floor(minX)), x1 = Math.min(W - 1, Math.ceil(maxX));
  const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(H - 1, Math.ceil(maxY));

  /* 4 个角在当前高度的屏幕坐标 —— 归属判定用它 */
  const quad = c.map(([x, y]) => {
    const p = project(x, y, z);
    return [p.sx, p.sy];
  });

  for (let iy = y0; iy <= y1; iy++) for (let ix = x0; ix <= x1; ix++) {
    /* 归属：像素中心落在本格投影四边形内（相邻格无缝拼接） */
    if (!terrainInQuad(ix + .5, iy + .5, quad)) continue;
    /* 世界坐标只用于过渡噪声与坡面采样，按格子所在高度反投影 */
    const g = terrainUnprojectZ(ix + .5, iy + .5, z);

    /* ---- 过渡层 ① 抖动混合：决定这个像素属于哪种材质 ---- */
    const bl = terrainBlend(gx, gy, g.x, g.y, ix, iy, cell, mat);
    const useMat = bl.mat;
    const useRamp = useMat === mat ? ramp : rampOf(useMat.base);
    const useId = bl.matId;

    /* ---- 过渡层 ② 坡度混合：边缘向更高邻格靠拢 ---- */
    const zAt = terrainSlopeHeight(gx, gy, g.x, g.y, z, mat);
    /* 深度必须与 project() 一致：d = (x+y)/R2*COS + z*SIN（SIN = 0.5）。
       写成减号会让抬高的格子反而"更远"，被低地压住、露出背景。 */
    const d = terrainGroundDepth(g.x, g.y) + zAt * .5;
    const i = iy * W + ix;
    if (d <= zb[i]) continue;

    /* ---- 主体 + 子项 ---- */
    const v = 2.55 + (noise(g.x * 1.5, g.y * 1.5) - .5) * 1.05
      + (hash(ix, iy) - .5) * .55 + (bayerAt(ix, iy) - .5) * .5;
    const lv = clamp(Math.floor(v), 0, 4);

    pix[i] = terrainDetail(useId, useMat, g.x, g.y, ix, iy, useRamp, lv);
    zb[i] = d;
    ground[i] = 1;
    kinds[i] = useMat.kind;
    groundZ[i] = d;
  }
}

/* ---------------- 侧壁 ---------------- */

function terrainDrawWalls(gx, gy) {
  const cell = TERRAIN.get(gx, gy);
  if (!cell) return;
  const mat = TERRAIN.mats[cell.mat];
  if (!mat) return;

  const z = cell.z || 0;
  if (z <= .01) return;
  const ramp = rampOf(mat.base);

  const faces = [
    { nb: [gx + 1, gy], a: [gx + 1, gy], b: [gx + 1, gy + 1] },
    { nb: [gx, gy + 1], a: [gx, gy + 1], b: [gx + 1, gy + 1] },
  ];

  for (const f of faces) {
    const n = TERRAIN.get(f.nb[0], f.nb[1]);
    const nz = n ? (n.z || 0) : 0;
    if (z <= nz + .01) continue;

    /* 坡面混合开启时，边界处的高度已被抬向邻格，
       侧壁只需画"剩余"的那一小段，否则会和坡面重叠 */
    const topZ = TERRAIN.blend.slope ? nz + (z - nz) * 0.1 : z;
    if (topZ <= nz + .02) continue;

    const steps = 14;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const wx = f.a[0] + (f.b[0] - f.a[0]) * t;
      const wy = f.a[1] + (f.b[1] - f.a[1]) * t;
      for (let zz = nz; zz < topZ; zz += .1) {
        const p = project(wx, wy, zz);
        const ix = p.sx | 0, iy = p.sy | 0;
        if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
        const i = iy * W + ix;
        if (p.d <= zb[i]) continue;
        zb[i] = p.d;
        const t2 = topZ > nz ? (zz - nz) / (topZ - nz) : 0;
        const lv = clamp(Math.floor(1.2 + t2 * 1.7 + (hash(ix, iy) - .5) * .6), 0, 4);
        pix[i] = ramp[lv];
      }
    }
  }
}

/* ---------------- 分发 ---------------- */

/* slope=false 走台阶渲染（quad + 侧壁）；
   slope=true 走坡面渲染（高度场光线步进，见 terrain-march.js）。 */
function terrainRender(fast) {
  /* fast=true（拖动笔刷期间）强制走台阶渲染：march 要几百毫秒，
     拖动时每帧都跑会卡死；松手后再跑一次完整坡面渲染。 */
  if (!fast && TERRAIN.blend.slope && typeof terrainRenderMarch === 'function') {
    terrainRenderMarch();
    return;
  }
  terrainRenderQuad();
}

/* ---------------- 台阶渲染（quad + 侧壁） ---------------- */

function terrainRenderQuad() {
  const cells = [...TERRAIN.cells.values()].sort((a, b) => (b.gx + b.gy) - (a.gx + a.gy));
  for (const c of cells) terrainDrawWalls(c.gx, c.gy);
  for (const c of cells) terrainDrawTop(c.gx, c.gy);
  terrainPatchSeams();
}

/* 网格线（调试用）：x = const 与 y = const 两族平行线 */
function terrainDrawGrid() {
  const line = rgb(120, 130, 150);
  const R = TERRAIN.R;
  for (let g = -R; g <= R + 1; g++) {
    /* 沿 y 方向的一条线（x = g） */
    let a = project(g, -R, 0), b = project(g, R + 1, 0);
    terrainLine(a.sx, a.sy, b.sx, b.sy, line);
    /* 沿 x 方向的一条线（y = g） */
    a = project(-R, g, 0); b = project(R + 1, g, 0);
    terrainLine(a.sx, a.sy, b.sx, b.sy, line);
  }
}

function terrainLine(x0, y0, x1, y1, color) {
  const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + (x1 - x0) * i / n);
    const y = Math.round(y0 + (y1 - y0) * i / n);
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    pix[y * W + x] = color;
  }
}
