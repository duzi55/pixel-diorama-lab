'use strict';
/* ------------------------------------------------------------------
 * 编辑器 · 地形渲染共用层（terrain-common.js）
 *
 * 两种渲染器（台阶 quad / 坡面光线步进）共用的部分：
 *   投影与反投影、像素归属、材质过渡混合、子项装饰、收边补洞
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

/* ---------------- 收边补洞 ----------------
 *
 * 等距投影下，高低相邻格的顶面四边形在屏幕上会错位 1~2px，
 * 严格的像素归属会留下一圈网格状细缝（相邻两格都判"外"）。
 * 像素艺术里的标准收边做法：渲染后扫一遍，被地形包围的背景像素
 * 用邻域众数色填上，并把深度设为邻域最大（保证后续物体遮挡关系正确）。
 */
function terrainPatchSeams() {
  const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

  for (let iy = 1; iy < H - 1; iy++) for (let ix = 1; ix < W - 1; ix++) {
    const i = iy * W + ix;
    /* 用 ground 标记判断"未被地形覆盖"，而不是背景色 ——
       编辑器背景是深色、离线渲染是米色，颜色判断会失效 */
    if (ground[i]) continue;

    let orth = 0, bestColor = 0, bestCount = 0, bestZ = -1e9, bestKind = 0;
    const seen = new Map();
    for (const [dx, dy] of N8) {
      const j = (iy + dy) * W + ix + dx;
      if (!ground[j]) continue;
      if (dx === 0 || dy === 0) orth++;
      const c = pix[j];
      const cnt = (seen.get(c) || 0) + 1;
      seen.set(c, cnt);
      if (cnt > bestCount) { bestCount = cnt; bestColor = c; bestKind = kinds[j]; }
      if (zb[j] > bestZ) bestZ = zb[j];
    }

    /* 4 邻中至少 3 个是地形才补 —— 内部洞必补，岛屿外缘的锯齿不会被糊 */
    if (orth < 3) continue;
    pix[i] = bestColor;
    zb[i] = bestZ;
    ground[i] = 1;
    kinds[i] = bestKind;
    groundZ[i] = bestZ;
  }
}


/* ---------------- 地形边缘溶解 ----------------
 *
 * 参照秋日山村（village/terrain.js）的做法：
 * 岛屿边缘不是硬切，而是用低频团块噪声 + 像素哈希逐点"啃掉"，
 * 形成有机的、像手绘淡出纸面的边。
 *
 * Studio 的地形是格子系统，所以溶解只发生在**边缘格**（四邻缺失）
 * 靠边的 0.42 格范围内；内部格完全不动。
 * ------------------------------------------------------------------ */

const TERRAIN_EDGE_KEY = (gx, gy) => (gx + 512) * 1024 + (gy + 512);

/** 边缘溶解的几种风格（band=宽度格, curve=越外越易剔除, clump/grain=两种噪声权重） */
const TERRAIN_EDGE_MODES = {
  scatter: { name: '颗粒散落', band: .55, strength: .62, curve: 1.0, clumpFreq: 2.4, clumpAmp: .60, grain: .50 },
  grain:   { name: '细密砂边', band: .40, strength: .55, curve: 2.0, clumpFreq: 10.0, clumpAmp: .10, grain: 1.00 },
  fade:    { name: '渐变淡出', band: 1.00, strength: .72, curve: .60, clumpFreq: 1.2, clumpAmp: .30, grain: .85 },
  chunk:   { name: '块状碎裂', band: .90, strength: .62, curve: 1.8, clumpFreq: .45, clumpAmp: .95, grain: .05 },
  off:     { name: '关闭（硬边）', band: 0, strength: 0, curve: 1, clumpFreq: 1, clumpAmp: 0, grain: 0 },
};

/** 应用一种溶解预设到 TERRAIN.edge */
function terrainEdgeApplyMode(mode) {
  const m = TERRAIN_EDGE_MODES[mode] || TERRAIN_EDGE_MODES.scatter;
  TERRAIN.edge = {
    mode: TERRAIN_EDGE_MODES[mode] ? mode : 'scatter',
    band: m.band, strength: m.strength, curve: m.curve,
    clumpFreq: m.clumpFreq, clumpAmp: m.clumpAmp, grain: m.grain,
  };
  return TERRAIN.edge;
}

/** 边缘格集合（渲染前算一次） */
function terrainEdgeSet() {
  const s = new Set();
  for (const c of TERRAIN.cells.values()) {
    if (!TERRAIN.get(c.gx + 1, c.gy) || !TERRAIN.get(c.gx - 1, c.gy) ||
        !TERRAIN.get(c.gx, c.gy + 1) || !TERRAIN.get(c.gx, c.gy - 1)) {
      s.add(TERRAIN_EDGE_KEY(c.gx, c.gy));
    }
  }
  return s;
}

/**
 * 边缘溶解判定：返回 true 表示这个像素不画（被"啃掉"）。
 * @param {Set} edges 边缘格集合
 * @param {number} gx,gy 格坐标
 * @param {number} x,y 世界坐标（用于格内位置与低频团块）
 * @param {number} ix,iy 屏幕像素（像素级哈希）
 */
function terrainEdgeCut(edges, gx, gy, x, y, ix, iy) {
  if (!edges.has(TERRAIN_EDGE_KEY(gx, gy))) return false;

  const cfg = TERRAIN.edge || {};
  const band = cfg.band || 0;
  if (band <= 0) return false;                 /* off：硬边 */

  const u = x - gx, v = y - gy;
  const d = Math.min(u, 1 - u, v, 1 - v);      /* 到格边距离 0..0.5 */
  if (d > band) return false;

  const t = Math.pow((band - d) / band, cfg.curve || 1);   /* 0=内部 1=最外 */
  const clump = noise(x * (cfg.clumpFreq || 2.4) + 11.3, y * (cfg.clumpFreq || 2.4) + 4.1);
  const grain = hash(ix * 1.71, iy * 2.13);
  const n = clump * (cfg.clumpAmp == null ? .6 : cfg.clumpAmp) + grain * (cfg.grain == null ? .4 : cfg.grain);
  return n < t * (cfg.strength || 0);
}
