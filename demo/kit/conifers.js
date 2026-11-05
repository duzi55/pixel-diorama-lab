'use strict';
/* ------------------------------------------------------------------
 * 构件库 · 秋日金黄锥塔树
 *
 * ★ 画法（第六版：叶簇团块）
 *   参考图的树冠是**一团团圆润金叶簇**堆成的锥体，轮廓是一串圆弧鼓包。
 *   所以：树冠由 80~120 个"叶簇球"组成；每个球用 plot 逐像素填充
 *   （不用 sphere —— 球体的深度描边会把簇勾出黑边，读作爆米花）。
 *   簇与簇高低错落、半径各异 → 轮廓自然起伏；簇色按高度/方位/随机微差。
 * ------------------------------------------------------------------ */

const CONE_TONES = [
  [206, 140, 30],   // 0 深（背光/下层）
  [228, 164, 34],   // 1 暖
  [246, 194, 40],   // 2 主体金
  [255, 224, 82],   // 3 亮（受光/上层）
];
/* plot 只吃打包像素（rgba 整数），不是 [r,g,b] 数组。
   预打包一次，避免每像素 spread —— 也避免"数组写进 Uint32Array 变 0"的黑块。 */
const CONE_PACKED = CONE_TONES.map(c => rgb(...c));

/* 屏幕像素 → 高度 z 水平面上的世界坐标 */
function coneUnproject(ix, iy, z) {
  const sum = 2 * R2 * ((iy + .5 - OY) / S + z * COS);
  const dif = R2 * (ix + .5 - OX) / S;
  return [(sum + dif) / 2, (sum - dif) / 2];
}

/* 一片圆叶簇：逐像素填充的实心椭圆（plot，无描边）
   ★ 必须走 ctx.screen / ctx.unproject：构件可能被 ctx.rot 旋转，
     用全局 project/coneUnproject 算包围盒会落在未旋转的位置，
     叶簇只画出一小块碎片 → 树冠全是透出背景的黑点。
   ★ tone 是色阶索引（不是颜色）：簇内按球面法线算光照 + 颗粒抖动，
     否则每簇是一整块纯色，放大后读作"叠盘子"。 */
function leafBlob(ctx, cx, cy, z, r, tone) {
  const toScreen = ctx.screen || ((x, y, zz) => project(x, y, zz));
  const toLocal = ctx.unproject || coneUnproject;
  const dir = typeof LIGHT !== 'undefined' && LIGHT.dir ? LIGHT.dir : { x: -.55, y: -.6, z: .58 };
  /* 颜色：球面法线光照 + 颗粒 */
  const shade = (nx, ny, hx, hy) => {
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const l = -dir.x * nx - dir.y * ny + dir.z * nz;
    const t = tone + (l - .55) * 2.4 + (hash(hx, hy) - .5) * 1.1;
    return CONE_PACKED[clamp(Math.round(t), 0, 3)];
  };

  const is3D = (ctx.rotX || 0) !== 0 || (ctx.rotY || 0) !== 0;
  if (is3D) {
    /* ★ 叶簇是"水平圆盘"：2D 等距下投影成 2:1 椭圆刚好读作叶团，
       但三轴倾斜后圆盘几乎侧对视线，会被压成细线 —— 树冠变条纹草裙。
       3D 预览时改用球体（任意视角投影都是圆），形态才立得住。
       球体的深描边在 2D 下会爆米花，3D 下由 shadeEdges 统一压边，观感可接受。 */
    ctx.sphere(cx, cy, z, r * .92, CONE_TONES[tone], 'rough');
    return;
  }

  /* 包围盒：把圆盘边缘 8 个点投影后取 min/max。
     三轴旋转后圆盘在屏幕上是斜椭圆，用未旋转的 r*S 取盒会把椭圆裁成条纹。 */
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4;
    const sp = toScreen(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z);
    if (sp.sx < minX) minX = sp.sx;
    if (sp.sx > maxX) maxX = sp.sx;
    if (sp.sy < minY) minY = sp.sy;
    if (sp.sy > maxY) maxY = sp.sy;
  }
  const x0 = Math.max(0, Math.floor(minX - 1)), x1 = Math.min(W - 1, Math.ceil(maxX + 1));
  const y0 = Math.max(0, Math.floor(minY - 1)), y1 = Math.min(H - 1, Math.ceil(maxY + 1));
  for (let iy = y0; iy <= y1; iy++) {
    for (let ix = x0; ix <= x1; ix++) {
      const g = toLocal(ix, iy, z);
      const dx = g[0] - cx, dy = g[1] - cy;
      const d = Math.hypot(dx, dy);
      /* 半径带 8% 波动 + 边缘抖动 → 团块边缘不规则（不是标准椭圆） */
      const a = Math.atan2(dy, dx);
      const re = r * (1 + .07 * Math.sin(a * 5 + z * 3.1));
      if (d > re) continue;
      if (d > re * .90 && hash(ix * .9, iy * .9) > .55) continue;
      ctx.plot(g[0], g[1], z, shade(dx / re, dy / re, ix * 1.7 + 3, iy * 1.3 + 7));
    }
  }
}

/* 锥形树冠：叶簇团块堆叠 */
function coneCanopy(ctx, cx, cy, z0, z1, cr, seed, density) {
  const h = z1 - z0;
  const blobs = [];              // { x, y, z, r, tone }
  /* 内芯：沿轴心的一串大簇，先垫出实心体块（防止叶缝透背景） */
  const coreN = Math.max(8, Math.round(h / (cr * .22)));
  for (let i = 0; i <= coreN; i++) {
    const u = i / coreN;
    const z = z1 - u * h;
    const env = cr * Math.pow(u, .9);          // u=0 顶 → 窄；u=1 底 → 宽
    if (env < .3) continue;
    blobs.push({ x: cx, y: cy, z, r: Math.max(.45, env * .58), tone: u > .6 ? 1 : 2 });
  }
  /* 外壳叶簇：沿锥面密排，半径大、重叠 → 蓬松轮廓 */
  const N = Math.round(density);
  for (let i = 0; i < N; i++) {
    const k = seed * 31 + i * 17;
    const u = Math.pow(hash(k, 11), .62);            // 0 顶 → 1 底（偏下密集）
    const z = z1 - u * h;
    const env = cr * Math.pow(u, .9) * (1 + .09 * Math.sin(u * 8 + seed * 1.7));
    if (env < .35) continue;
    /* 定位在锥面附近（60%~108% 半径）→ 轮廓由这圈簇决定 */
    const rho = env * (.60 + hash(k, 12) * .48);
    const ang = hash(k, 13) * 6.283;
    const bx = cx + Math.cos(ang) * rho, by = cy + Math.sin(ang) * rho;
    /* 簇要小、要高低错落：大簇在同一锥面上会连成"鳞片"。
       抖动幅度随包络收窄（顶部不乱抖，否则树尖会断成悬空小簇） */
    const zj = (hash(k, 16) - .5) * h * .09 * Math.min(1, u * 2.2);
    const r = Math.max(.40, env * (.16 + hash(k, 14) * .10));
    const lit = -(bx - cx) * .05 - (by - cy) * .04;
    const tone = 1.5 + (1 - u) * .9 + lit * .8 + (hash(k, 15) - .5) * 1.1;
    blobs.push({ x: bx, y: by, z: z + zj, r, tone: clamp(Math.round(tone), 0, 3) });
  }
  /* 顶层亮簇 */
  blobs.push({ x: cx, y: cy, z: z1 - .55, r: Math.max(.45, cr * .14), tone: 3 });

  /* ★ 三轴旋转时叶簇的深度沿倾斜平面线性变化：若按原顺序画，
     后画的簇只有"比已有更近"的一条等深线能通过深度测试 → 树冠变条纹。
     先按深度从远到近排序（画家算法），每簇都能完整画上。 */
  if ((ctx.rotX || 0) !== 0 || (ctx.rotY || 0) !== 0) {
    const toScreen = ctx.screen || ((x, y, z) => project(x, y, z));
    for (const b of blobs) b.d = toScreen(b.x, b.y, b.z).d;
    blobs.sort((a, b) => a.d - b.d);
  }
  for (const b of blobs) leafBlob(ctx, b.x, b.y, b.z, b.r, b.tone);
}

/* ---- 巨层塔树 ---- */
KIT.register({
  id: 'cone-mast',
  name: '巨层塔树',
  category: 'tree',
  desc: '金黄锥塔大树：粗深褐直干 + 叶簇堆叠的蓬松金冠 + 参差轮廓',
  params: {
    height: { def: 24.0, min: 10.0, max: 34.0, step: .5, desc: '整树高度' },
    crownR: { def: 5.8,  min: 2.5, max: 9.5,  step: .2, desc: '底层冠幅' },
    trunkH: { def: 6.5,  min: 1.5, max: 12.0, step: .2, desc: '树干裸露高度' },
    density: { def: 380, min: 160, max: 520, step: 10, desc: '叶簇数量（越大越密实）' },
  },
  collision: { type: 'cylinder', radius: .9, height: 24 },
  behavior: {
    default: [
      { id: 'sway', params: { amp: 1.8 } },
      { id: 'chop', params: { hits: 4 } },
    ],
    allow: ['sway', 'chop', 'flicker'],
  },
  draw(ctx, inst) {
    const h = ctx.params.height, cr = ctx.params.crownR;
    const tkH = Math.min(ctx.params.trunkH, h * .45);
    const seed = ctx.seed;
    const tr = Math.max(.4, cr * .13);
    const bark = [94, 60, 38], barkLit = [140, 96, 58];
    /* part：'trunk' 只画干 / 'canopy' 只画冠 / 缺省两者都画。
       场景用它把干（静态）和冠（每帧风动回放）分两遍烘焙。 */
    const part = inst && inst.part;
    if (part !== 'canopy') {
    ctx.capsule([ctx.x, ctx.y, 0], [ctx.x, ctx.y, tkH + 2.5], tr, tr * .55, () => bark, 'rough');
    ctx.capsule([ctx.x + tr * .42, ctx.y + tr * .42, 0],
      [ctx.x + tr * .18, ctx.y + tr * .18, tkH + 1.8], tr * .34, tr * .12, () => barkLit, 'rough');
    for (let i = 0; i < 4; i++) {
      const a = i * 1.5708 + hash(seed + i, 7) * .5;
      ctx.capsule([ctx.x, ctx.y, .3], [ctx.x + Math.cos(a) * tr * 2.1, ctx.y + Math.sin(a) * tr * 2.1, 0],
        tr * .5, tr * .15, () => bark, 'rough');
    }

    }
    if (part !== 'trunk') coneCanopy(ctx, ctx.x, ctx.y, tkH, h, cr, seed, ctx.params.density);
    if (!part) ctx.shadow(cr * .95, 1, .4);
  },
});

/* ---- 尖锥树 ---- */
KIT.register({
  id: 'cone-spire',
  name: '尖锥树',
  category: 'tree',
  desc: '窄高金黄尖锥：细直干 + 叶簇堆叠的窄锥冠',
  params: {
    height: { def: 17.0, min: 8.0, max: 26.0, step: .5, desc: '整树高度' },
    crownR: { def: 3.5,  min: 1.4, max: 6.0,  step: .1, desc: '锥底冠幅' },
    trunkH: { def: 4.0,  min: 1.2, max: 8.0,  step: .2, desc: '树干裸露高度' },
    density: { def: 240, min: 100, max: 380, step: 10, desc: '叶簇数量' },
  },
  collision: { type: 'cylinder', radius: .6, height: 17 },
  behavior: {
    default: [
      { id: 'sway', params: { amp: 1.4 } },
      { id: 'chop', params: { hits: 3 } },
    ],
    allow: ['sway', 'chop', 'flicker'],
  },
  draw(ctx, inst) {
    const h = ctx.params.height, cr = ctx.params.crownR;
    const tkH = Math.min(ctx.params.trunkH, h * .35);
    const seed = ctx.seed;
    const tr = Math.max(.28, cr * .12);
    const bark = [88, 56, 34], barkLit = [128, 86, 52];
    const part = inst && inst.part;

    if (part !== 'canopy') {
      ctx.capsule([ctx.x, ctx.y, 0], [ctx.x, ctx.y, tkH + 1.8], tr, tr * .5, () => bark, 'rough');
      ctx.capsule([ctx.x + tr * .34, ctx.y + tr * .34, 0],
        [ctx.x + tr * .14, ctx.y + tr * .14, tkH + 1.3], tr * .28, tr * .1, () => barkLit, 'rough');
    }
    if (part !== 'trunk') coneCanopy(ctx, ctx.x, ctx.y, tkH, h, cr, seed, ctx.params.density);
    if (!part) ctx.shadow(cr * .95, 1, .35);
  },
});
