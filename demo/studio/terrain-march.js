'use strict';
/* ------------------------------------------------------------------
 * 编辑器 · 坡面渲染（terrain-march.js）
 *
 * 高度场光线步进（height-field ray marching）：
 *
 *   每个屏幕像素 → 一条等距视线 → 沿 z 从高到低步进
 *   → 找到射线与高度场的交点 → 交点就是真实可见表面
 *
 * 这样解决了逐格 quad 光栅化的两个固有问题：
 *   1. 高低相邻格的四边形在屏幕上错位，留下网格状细缝
 *   2. "坡面"只能改深度不能改几何，一开就露洞
 *
 * 高度场用**格心双线性插值**：同高度平台保持平坦，
 * 高差处自然过渡成缓坡（真正的 Height blending）。
 * 法线由高度场梯度求得，坡面朝光一侧亮、背光一侧暗。
 * ------------------------------------------------------------------ */

const TERRAIN_MARCH = {
  H: null,        /* Float32Array：格心高度，NaN = 无地形 */
  N: 0,           /* 网格边长 2R+1 */
  maxZ: 0,        /* 地形最高点 */
  box: null,      /* 屏幕包围盒 { x0, x1, y0, y1 } */
};

/* ---------------- 高度场 ---------------- */

function terrainBuildHeightGrid() {
  const R = TERRAIN.R, N = R * 2 + 1;
  const H = new Float32Array(N * N);
  const EX = new Uint8Array(N * N);      /* 格子是否存在（查表比 Map 快一个量级） */
  H.fill(NaN);
  let maxZ = 0;

  for (const c of TERRAIN.cells.values()) {
    const idx = (c.gy + R) * N + (c.gx + R);
    H[idx] = c.z || 0;
    EX[idx] = 1;
    if ((c.z || 0) > maxZ) maxZ = c.z;
  }

  TERRAIN_MARCH.H = H;
  TERRAIN_MARCH.EX = EX;
  TERRAIN_MARCH.N = N;
  TERRAIN_MARCH.maxZ = maxZ;

  /* 高度场梯度上界（相邻格心最大高差 / 格距 1.0）—— sphere tracing 的
     安全系数由它决定，宁大勿小（偏保守只损失速度，不损失正确性） */
  let maxSlope = 0;
  for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
    const h0 = H[gy * N + gx];
    if (Number.isNaN(h0)) continue;
    if (gx + 1 < N && !Number.isNaN(H[gy * N + gx + 1])) maxSlope = Math.max(maxSlope, Math.abs(H[gy * N + gx + 1] - h0));
    if (gy + 1 < N && !Number.isNaN(H[(gy + 1) * N + gx])) maxSlope = Math.max(maxSlope, Math.abs(H[(gy + 1) * N + gx] - h0));
  }
  TERRAIN_MARCH.maxSlope = maxSlope;
}

/**
 * 采样高度场：格心双线性插值。
 * 格心在 (gx+0.5, gy+0.5)；无地形返回 NaN。
 * 边缘格子的越界格心用本格高度兜底，避免岛缘被裁掉半格。
 */
function terrainSampleHeight(x, y) {
  const R = TERRAIN.R, N = TERRAIN_MARCH.N;
  const gx = Math.floor(x), gy = Math.floor(y);
  if (gx < -R || gy < -R || gx > R || gy > R) return NaN;
  const ci = (gy + R) * N + (gx + R);
  if (!TERRAIN_MARCH.EX[ci]) return NaN;

  const H = TERRAIN_MARCH.H;
  const fallback = H[ci];

  const fx = x - 0.5, fy = y - 0.5;
  let x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;

  /* 四个格心索引；越界或无效用本格高度兜底 */
  const ax0 = x0 + R, ay0 = y0 + R;
  const i00 = ay0 * N + ax0, i10 = i00 + 1, i01 = i00 + N, i11 = i01 + 1;
  const okX = ax0 >= 0 && ax0 + 1 < N, okY = ay0 >= 0 && ay0 + 1 < N;

  const h00 = okX && okY && !Number.isNaN(H[i00]) ? H[i00] : fallback;
  const h10 = okX && okY && !Number.isNaN(H[i10]) ? H[i10] : fallback;
  const h01 = okX && okY && !Number.isNaN(H[i01]) ? H[i01] : fallback;
  const h11 = okX && okY && !Number.isNaN(H[i11]) ? H[i11] : fallback;

  const a = h00 + (h10 - h00) * tx;
  const b = h01 + (h11 - h01) * tx;
  return a + (b - a) * ty;
}

/* ---------------- 屏幕包围盒 ---------------- */

/* 地形投影的屏幕范围（按最高/最低高度取包络），框外像素直接跳过 */
function terrainComputeBox() {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const top = TERRAIN_MARCH.maxZ + 0.5;

  for (const c of TERRAIN.cells.values()) {
    for (const [x, y] of terrainCorners(c.gx, c.gy)) {
      for (const z of [c.z || 0, top]) {
        const p = project(x, y, z);
        if (p.sx < x0) x0 = p.sx;
        if (p.sx > x1) x1 = p.sx;
        if (p.sy < y0) y0 = p.sy;
        if (p.sy > y1) y1 = p.sy;
      }
    }
  }

  TERRAIN_MARCH.box = {
    x0: Math.max(0, Math.floor(x0)),
    x1: Math.min(W - 1, Math.ceil(x1)),
    y0: Math.max(0, Math.floor(y0)),
    y1: Math.min(H - 1, Math.ceil(y1)),
  };
}

/* ---------------- 光线求交 ---------------- */

/**
 * 求屏幕像素与高度场的交点。
 *
 * 等距投影下，固定屏幕点时世界 (x,y) 随 z 线性移动：
 *   v(z) = (syBase + z*COS) / SIN
 *   x(z) = (u + v)/R2,  y = (v - u)/R2
 * 所以 dx/dz = dy/dz = COS/(SIN*R2) —— 射线世界方向是 (1,1,k)。
 */
function terrainMarch(sx, sy, zTop, step) {
  const u = (sx - OX) / S;
  const syBase = (sy - OY) / S;

  /* Sphere tracing：按「到地形的垂直距离」跳跃。
     关键：等距射线每降 1 个 z，水平面要走 R2*COS/SIN ≈ 1.73 的距离，
     所以高度会变化的"提前量"是 1.73×梯度。安全步长 =
     (z-h) / (1 + maxSlope*1.74)，maxSlope 由 buildHeightGrid 按格心
     最大高差估计。旧实现用固定 0.6 系数：梯度 >0.48 的陡崖
     （比如 3 格高的 hill 边缘）必然一步跨过交点 → 黑洞。 */
  const stepSafe = Math.min(0.42, 1 / (1 + TERRAIN_MARCH.maxSlope * 1.74));

  /* 粗筛：沿射线取 5 个高度，全都不在地形内 → 这条射线大概率是天空，
     直接放弃（bbox 里约 40% 是这种像素，能省掉整段扫描） */
  let anyTerrain = false;
  for (let k = 0; k <= 4; k++) {
    const zc = zTop - (zTop + 0.25) * k / 4;
    const vc = (syBase + zc * COS) / SIN;
    const hc = terrainSampleHeight((u + vc) / R2, (vc - u) / R2);
    if (!Number.isNaN(hc)) { anyTerrain = true; break; }
  }
  if (!anyTerrain) return null;

  let z = zTop, prevZ = zTop + step;

  while (z >= -0.3) {
    const v = (syBase + z * COS) / SIN;
    const x = (u + v) / R2, y = (v - u) / R2;
    const h = terrainSampleHeight(x, y);

    if (!Number.isNaN(h) && z <= h) {
      /* 二分细化：lo 在地形内（f<=0），hi 在地形外（f>0） */
      let lo = z, hi = prevZ;
      for (let k = 0; k < 6; k++) {
        const mid = (lo + hi) * 0.5;
        const vv = (syBase + mid * COS) / SIN;
        const xx = (u + vv) / R2, yy = (vv - u) / R2;
        const hh = terrainSampleHeight(xx, yy);
        if (!Number.isNaN(hh) && mid <= hh) lo = mid; else hi = mid;
      }
      const zh = (lo + hi) * 0.5;
      const vf = (syBase + zh * COS) / SIN;
      return { x: (u + vf) / R2, y: (vf - u) / R2, z: zh };
    }

    prevZ = z;
    z -= Number.isNaN(h) ? step : Math.max(step, (z - h) * stepSafe);
  }
  return null;
}

/* ---------------- 坡度光照 ---------------- */

/**
 * 高度场梯度 → 表面法线 → 与光源方向点积。
 * 光源方向与 engine 的 sphere 一致：(-.55, -.6, .58)。
 * 返回 0..1 的明度系数（0.58 = 平地）。
 */
function terrainSlopeLight(x, y, h0) {
  const e = 0.1;
  const hx = terrainSampleHeight(x + e, y);
  const hy = terrainSampleHeight(x, y + e);

  /* 前向差分（h0 是交点高度）：省一半采样量，坡度大于 1 格时饱和，
     对光照足够 */
  const nx = Number.isNaN(hx) ? 0 : -(hx - h0) / e;
  const ny = Number.isNaN(hy) ? 0 : -(hy - h0) / e;

  const len = Math.hypot(nx, ny, 1);
  return clamp((-0.55 * nx - 0.6 * ny + 0.58) / len, 0, 1);
}

/* ---------------- 主渲染 ---------------- */

function terrainRenderMarch() {
  terrainBuildHeightGrid();
  terrainComputeBox();

  const box = TERRAIN_MARCH.box;
  const zTop = TERRAIN_MARCH.maxZ + 0.45;
  /* 步长随高度范围自适应：层数约 16 步 */
  const step = Math.max(0.06, zTop / 16);

  for (let iy = box.y0; iy <= box.y1; iy++) {
    for (let ix = box.x0; ix <= box.x1; ix++) {
      const i = iy * W + ix;
      const hit = terrainMarch(ix + 0.5, iy + 0.5, zTop, step);
      if (!hit) continue;

      const gx = Math.floor(hit.x), gy = Math.floor(hit.y);
      const cell = TERRAIN.get(gx, gy);
      if (!cell) continue;
      const mat = TERRAIN.mats[cell.mat];
      if (!mat) continue;

      /* ---- 过渡层：抖动混合决定这个像素属于哪种材质 ---- */
      const bl = terrainBlend(gx, gy, hit.x, hit.y, ix, iy, cell, mat);
      const useMat = bl.mat;
      const useRamp = useMat === mat ? rampOf(mat.base) : rampOf(useMat.base);

      /* ---- 坡度光照 ---- */
      const light = terrainSlopeLight(hit.x, hit.y, hit.z);

      /* ---- 主体 + 子项 ---- */
      const v = 2.55
        + (noise(hit.x * 1.5, hit.y * 1.5) - 0.5) * 1.05
        + (hash(ix, iy) - 0.5) * 0.55
        + (bayerAt(ix, iy) - 0.5) * 0.5
        + (light - 0.58) * 2.1;
      const lv = clamp(Math.floor(v), 0, 4);

      pix[i] = terrainDetail(bl.matId, useMat, hit.x, hit.y, ix, iy, useRamp, lv);

      /* 深度按交点算：d = (x+y)/R2*COS + z*SIN */
      const d = (hit.x + hit.y) / R2 * COS + hit.z * SIN;
      zb[i] = d;
      ground[i] = 1;
      kinds[i] = useMat.kind;
      groundZ[i] = d;
    }
  }

  terrainPatchSeams();
}
