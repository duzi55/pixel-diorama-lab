'use strict';
/* ------------------------------------------------------------------
 * 编辑器 · 地形渲染
 *
 * 把 TERRAIN 网格渲染成等距画面。
 *
 * 格 (gx,gy) 是世界轴对齐的正方形，投影后是标准等距菱形瓦片。
 * 画家算法：按 (gx+gy) 从大到小画 —— 越靠近观众越晚画。
 *
 * 侧壁是立体感的关键：本格比邻格高时，画出垂直墙面。
 * ------------------------------------------------------------------ */

/* 地面深度：与 engine 的约定一致 —— zb[i] = (x+y)/R2 * COS */
function terrainGroundDepth(x, y) {
  return (x + y) / Math.SQRT2 * (Math.sqrt(3) / 2);
}

/* 一个格的世界坐标角点（逆时针：SW, SE, NE, NW） */
function terrainCorners(gx, gy) {
  return [
    [gx, gy],           /* SW */
    [gx + 1, gy],       /* SE */
    [gx + 1, gy + 1],   /* NE */
    [gx, gy + 1],       /* NW */
  ];
}

/* 画一个格的顶面：菱形内逐像素填充 */
function terrainDrawTop(gx, gy) {
  const cell = TERRAIN.get(gx, gy);
  if (!cell) return;
  const mat = TERRAIN.mats[cell.mat];
  if (!mat) return;

  const z = cell.z || 0;
  const ramp = rampOf(mat.color);
  const c = terrainCorners(gx, gy);

  /* 屏幕包围盒 */
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of c) {
    const p = project(x, y, z);
    if (p.sx < minX) minX = p.sx; if (p.sx > maxX) maxX = p.sx;
    if (p.sy < minY) minY = p.sy; if (p.sy > maxY) maxY = p.sy;
  }
  const x0 = Math.max(0, Math.floor(minX)), x1 = Math.min(W - 1, Math.ceil(maxX));
  const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(H - 1, Math.ceil(maxY));

  for (let iy = y0; iy <= y1; iy++) for (let ix = x0; ix <= x1; ix++) {
    /* 反投影回 z=0 平面，判断是否落在本格正方形内 */
    const g = unproject(ix + .5, iy + .5);
    if (g.x < gx || g.x >= gx + 1 || g.y < gy || g.y >= gy + 1) continue;

    const d = terrainGroundDepth(g.x, g.y) - z * .5;
    const i = iy * W + ix;
    if (d <= zb[i]) continue;

    /* 材质细节：低频噪声明度 + 单像素杂点 + Bayer 抖动 */
    const v = 2.6 + (noise(g.x * 1.5, g.y * 1.5) - .5) * 1.1
      + (hash(ix, iy) - .5) * .7 + (bayerAt(ix, iy) - .5) * .6;
    const idx = clamp(Math.floor(v), 0, 4);
    pix[i] = ramp[idx];
    zb[i] = d;
    ground[i] = 1;
    kinds[i] = mat.kind;
    groundZ[i] = d;
  }
}

/* 画侧壁：本格高过邻格时，在 +x / +y 两个朝外的面上画竖直墙 */
function terrainDrawWalls(gx, gy) {
  const cell = TERRAIN.get(gx, gy);
  if (!cell) return;
  const mat = TERRAIN.mats[cell.mat];
  if (!mat) return;

  const z = cell.z || 0;
  if (z <= .01) return;
  const ramp = rampOf(mat.color);

  /* 两个朝外的面：
     +x 面 —— 邻格 (gx+1, gy)，沿 y 方向的一条边
     +y 面 —— 邻格 (gx, gy+1)，沿 x 方向的一条边 */
  const faces = [
    { nb: [gx + 1, gy], a: [gx + 1, gy], b: [gx + 1, gy + 1] },
    { nb: [gx, gy + 1], a: [gx, gy + 1], b: [gx + 1, gy + 1] },
  ];

  for (const f of faces) {
    const n = TERRAIN.get(f.nb[0], f.nb[1]);
    const nz = n ? (n.z || 0) : 0;
    if (z <= nz + .01) continue;

    const steps = 14;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const wx = f.a[0] + (f.b[0] - f.a[0]) * t;
      const wy = f.a[1] + (f.b[1] - f.a[1]) * t;
      for (let zz = nz; zz < z; zz += .1) {
        const p = project(wx, wy, zz);
        const ix = p.sx | 0, iy = p.sy | 0;
        if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
        const i = iy * W + ix;
        if (p.d <= zb[i]) continue;
        zb[i] = p.d;
        /* 墙脚暗、墙顶亮 —— 读出厚度 */
        const t2 = z > nz ? (zz - nz) / (z - nz) : 0;
        const lv = clamp(Math.floor(1.2 + t2 * 1.7 + (hash(ix, iy) - .5) * .6), 0, 4);
        pix[i] = ramp[lv];
      }
    }
  }
}

/* 渲染整张地形 */
function terrainRender() {
  const cells = [...TERRAIN.cells.values()].sort((a, b) => (b.gx + b.gy) - (a.gx + a.gy));
  for (const c of cells) terrainDrawWalls(c.gx, c.gy);
  for (const c of cells) terrainDrawTop(c.gx, c.gy);
}

/* 网格线（调试用，画在最上层） */
function terrainDrawGrid() {
  const c = rgb(255, 255, 255, 0);
  const line = rgb(120, 130, 150);
  for (let g = -TERRAIN.R; g <= TERRAIN.R; g++) {
    /* 沿 x 方向的格线（固定 gy） */
    for (const gy of [g]) {
      const a = project(g, gy, 0), b = project(g + 1, gy, 0);
      terrainLine(a.sx, a.sy, b.sx, b.sy, line);
      const a2 = project(g, gy, 0), b2 = project(g, gy + 1, 0);
      terrainLine(a2.sx, a2.sy, b2.sx, b2.sy, line);
    }
  }
}

/* 像素级直线（画在最上层） */
function terrainLine(x0, y0, x1, y1, color) {
  const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + (x1 - x0) * i / n);
    const y = Math.round(y0 + (y1 - y0) * i / n);
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    pix[y * W + x] = color;
  }
}
