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

/* 地面深度：与 engine 的约定一致 —— zb[i] = (x+y)/R2 * COS */
function terrainGroundDepth(x, y) {
  return (x + y) / Math.SQRT2 * (Math.sqrt(3) / 2);
}

/* 屏幕空间凸四边形包含测试（叉积同侧）。
   用它做像素归属，而不是"世界坐标落在 [gx,gx+1)" ——
   后者在格边界处会因浮点误差把像素判给"谁也不认"，留下一圈网格状细缝。 */
function terrainInQuad(px, py, quad) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i], b = quad[(i + 1) & 3];
    const cross = (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]);
    if (sign === 0) {
      if (Math.abs(cross) > 1e-6) sign = cross > 0 ? 1 : -1;
      continue;
    }
    /* 容差：边界像素恰好压在边上时，浮点抖动会让相邻两格都判"外"，
       留下 1px 网格状细缝。允许半像素越界 —— 相邻格会重叠，
       深度相同的情况下颜色相近，肉眼不可见。 */
    if (cross * sign < -0.5) return false;
  }
  return true;
}

/* 按高度反投影：屏幕点 → 平面 z 上的世界坐标。
   engine 的 unproject 只解 z=0；抬高的格子必须用它，
   否则"屏幕包围盒"和"像素归属判定"会错位，高台顶面整片漏画。 */
function terrainUnprojectZ(sx, sy, z) {
  const u = (sx - OX) / S;
  const v = ((sy - OY) / S + z * COS) / SIN;
  return { x: (u + v) / Math.SQRT2, y: (v - u) / Math.SQRT2 };
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

/* ---------------- 过渡：抖动混合 ---------------- */

/**
 * 求某像素的过渡结果。
 * @returns {{ mat:object, w:number }} w = 过渡强度（0 纯主体，1 完全是邻格）
 */
function terrainBlend(gx, gy, wx, wy, ix, iy, cell, mat) {
  const B = TERRAIN.blend;
  const bwBase = B.width * (mat.blend ? mat.blend.width / 0.45 : 1);
  if (bwBase <= 0.01) return { mat, matId: cell.mat, w: 0 };

  /* 局部带宽：低频噪声调制 0.45~1.5 倍 —— 有的地方咬得深、有的地方浅，
     边界因此长出不规则毛刺，而不是均匀的一圈描边 */
  const bw = bwBase * (0.45 + noise(wx * 1.9 + 31, wy * 1.9 + 17) * 1.05);

  /* 到四条边的距离（0 = 边界，0.5 = 格心） */
  const dl = wx - gx, dr = gx + 1 - wx;
  const dt = wy - gy, db = gy + 1 - wy;
  const dEdge = Math.min(dl, dr, dt, db);
  if (dEdge > bw) return { mat, matId: cell.mat, w: 0 };

  /* 四条边各自对应的邻格 */
  const sides = [
    { d: dl, gx: gx - 1, gy, ix: -1, iy: 0 },
    { d: dr, gx: gx + 1, gy, ix: 1, iy: 0 },
    { d: dt, gx, gy: gy - 1, ix: 0, iy: -1 },
    { d: db, gx, gy: gy + 1, ix: 0, iy: 1 },
  ];

  let best = null, bestId = null, bestW = 0;
  for (const s of sides) {
    if (s.d > bw) continue;
    const nc = TERRAIN.get(s.gx, s.gy);
    if (!nc || nc.mat === cell.mat) continue;
    const nm = TERRAIN.mats[nc.mat];
    if (!nm) continue;

    /* 基础权重：越贴边越强 */
    let w = 1 - s.d / bw;

    /* 抖动：两条低频噪声叠加，把直线边界咬成不规则形状 */
    const j = B.jitter * ((mat.blend ? mat.blend.jitter : 0.6) + (nm.blend ? nm.blend.jitter : 0.6)) / 2;
    const n = noise(wx * 5.6, wy * 5.6) * 0.65 + noise(wx * 15.3, wy * 15.3) * 0.35;

    /* 像素风的"渐变"：Bayer + 噪声阈值。
       w≈1 时 t = 0.35~1.45 —— 噪声小处不命中（留缺口），
       噪声大处命中，边界因此是碎片化咬合而非实心环 */
    const t = w * (0.35 + n * 1.1) + (bayerAt(ix, iy) - 0.5) * j * 0.85;
    if (t > 0.5 && w > bestW) { bestW = w; best = nm; bestId = nc.mat; }
  }

  return { mat: best || mat, matId: bestId || cell.mat, w: best ? bestW : 0 };
}

/**
 * 坡度混合：本格边缘向更高的邻格高度靠拢，断崖变缓坡。
 * 只向更高的邻格抬升（向下会与侧壁打架）。
 */
function terrainSlopeHeight(gx, gy, wx, wy, z, mat) {
  if (!TERRAIN.blend.slope) return z;
  const bw = TERRAIN.blend.width * (mat.blend ? mat.blend.width / 0.45 : 1);
  if (bw <= 0.01) return z;

  const dl = wx - gx, dr = gx + 1 - wx;
  const dt = wy - gy, db = gy + 1 - wy;
  const dEdge = Math.min(dl, dr, dt, db);
  if (dEdge > bw) return z;

  const sides = [
    { d: dl, gx: gx - 1, gy },
    { d: dr, gx: gx + 1, gy },
    { d: dt, gx, gy: gy - 1 },
    { d: db, gx, gy: gy + 1 },
  ];

  let bestZ = z, bestGain = 0;
  for (const s of sides) {
    if (s.d > bw) continue;
    const nc = TERRAIN.get(s.gx, s.gy);
    if (!nc) continue;
    const dz = (nc.z || 0) - z;
    if (dz <= 0.02) continue;                    /* 只向更高处抬 */
    const w = 1 - s.d / bw;
    const e = w * w * (3 - 2 * w);               /* smoothstep */
    const gain = dz * e * 0.9;
    if (gain > bestGain) { bestGain = gain; bestZ = z + gain; }
  }
  return bestZ;
}

/* ---------------- 子项：材质自带的装饰 ---------------- */

function terrainDetail(matId, mat, wx, wy, ix, iy, ramp, baseLevel) {
  const d = mat.detail || {};
  let lv = baseLevel;

  if (matId === 'grass') {
    /* 苔藓斑块：低频选区 + 高频打散（docs/kit/scene.md §5.3） */
    if (d.clump && noise(wx * 0.55, wy * 0.55) > 0.72 && hash(ix, iy) > 0.55) {
      return ramp[0];
    }
    if (d.speckle && hash(ix * 1.7 + 3, iy * 2.3 + 7) > 0.985) lv = Math.min(4, lv + 1);
  } else if (matId === 'soil') {
    /* 石子：亮点 + 偏移一格的暗点，避免成簇 */
    if (d.pebble && hash(ix, iy) > 0.975) return ramp[4];
    if (d.pebble && hash(ix - 1, iy - 1) > 0.978) return ramp[1];
    if (d.speckle && hash(ix * 2.1, iy * 1.3) > 0.99) lv = Math.max(0, lv - 1);
  } else if (matId === 'sand') {
    /* 风纹：两条不同频率的正弦叠加 */
    if (d.ripple) {
      const r = Math.sin(wx * 2.2 + wy * 0.7) * 0.5 + Math.sin(wx * 0.9 - wy * 3.1) * 0.5;
      if (r > 0.55) lv = Math.min(4, lv + 1);
      else if (r < -0.6) lv = Math.max(0, lv - 1);
    }
  } else if (matId === 'stone') {
    /* 石板缝：格内 2×2 分块，缝处压暗一档 */
    if (d.seam) {
      const sx = (wx - Math.floor(wx)) * 2, sy = (wy - Math.floor(wy)) * 2;
      if (Math.abs(sx - 0.5) < 0.045 || Math.abs(sy - 0.5) < 0.045) return ramp[0];
    }
  } else if (matId === 'water') {
    /* 波纹 + 波峰高光 */
    if (d.wave) {
      const w = Math.sin(wx * 1.4 + wy * 0.6) * 0.5 + Math.sin(wx * 0.5 - wy * 1.9) * 0.5;
      if (w > 0.62) return ramp[4];
      if (w > 0.3) lv = Math.min(4, lv + 1);
      else if (w < -0.55) lv = Math.max(0, lv - 1);
    }
  }

  return ramp[lv];
}

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

/* ---------------- 收边补洞 ----------------
 *
 * 等距投影下，高低相邻格的顶面四边形在屏幕上会错位 1~2px，
 * 严格的像素归属会留下一圈网格状细缝（相邻两格都判"外"）。
 * 像素艺术里的标准收边做法：渲染后扫一遍，被地形包围的背景像素
 * 用邻域众数色填上，并把深度设为邻域最大（保证后续物体遮挡关系正确）。
 */
function terrainPatchSeams() {
  const BG = rgb(250, 246, 232);
  const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

  for (let iy = 1; iy < H - 1; iy++) for (let ix = 1; ix < W - 1; ix++) {
    const i = iy * W + ix;
    if (pix[i] !== BG) continue;

    let n = 0, orth = 0, bestColor = 0, bestCount = 0, bestZ = -1e9;
    const seen = new Map();
    for (const [dx, dy] of N8) {
      const j = (iy + dy) * W + ix + dx;
      if (pix[j] === BG) continue;
      n++;
      if (dx === 0 || dy === 0) orth++;
      const c = pix[j];
      const cnt = (seen.get(c) || 0) + 1;
      seen.set(c, cnt);
      if (cnt > bestCount) { bestCount = cnt; bestColor = c; }
      if (zb[j] > bestZ) bestZ = zb[j];
    }

    /* 4 邻中至少 3 个是地形才补 —— 内部洞必补，岛屿外缘的锯齿不会被糊 */
    if (orth < 3) continue;
    pix[i] = bestColor;
    zb[i] = bestZ;
    ground[i] = 1;
    groundZ[i] = bestZ;
  }
}

/* ---------------- 总渲染 ---------------- */

function terrainRender() {
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
