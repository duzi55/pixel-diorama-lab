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
  const p = toScreen(cx, cy, z);
  const hw = r * S, hh = r * .5 * S + .6;
  const x0 = Math.max(0, Math.floor(p.sx - hw)), x1 = Math.min(W - 1, Math.ceil(p.sx + hw));
  const y0 = Math.max(0, Math.floor(p.sy - hh)), y1 = Math.min(H - 1, Math.ceil(p.sy + hh));
  const dir = typeof LIGHT !== 'undefined' && LIGHT.dir ? LIGHT.dir : { x: -.55, y: -.6, z: .58 };
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
      /* 球面法线光照：左上亮、右下暗，簇才有体积 */
      const nx = dx / re, ny = dy / re;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const l = -dir.x * nx - dir.y * ny + dir.z * nz;
      const t = tone + (l - .55) * 2.4 + (hash(ix * 1.7 + 3, iy * 1.3 + 7) - .5) * 1.1;
      ctx.plot(g[0], g[1], z, CONE_PACKED[clamp(Math.round(t), 0, 3)]);
    }
  }
}

/* 锥形树冠：叶簇团块堆叠 */
function coneCanopy(ctx, cx, cy, z0, z1, cr, seed, density) {
  const h = z1 - z0;
  /* 内芯：沿轴心的一串大簇，先垫出实心体块（防止叶缝透背景） */
  const coreN = Math.max(8, Math.round(h / (cr * .22)));
  for (let i = 0; i <= coreN; i++) {
    const u = i / coreN;
    const z = z1 - u * h;
    const env = cr * Math.pow(u, .9);          // u=0 顶 → 窄；u=1 底 → 宽
    if (env < .3) continue;
    leafBlob(ctx, cx, cy, z, Math.max(.45, env * .58), u > .6 ? 1 : 2);
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
    leafBlob(ctx, bx, by, z + zj, r, clamp(Math.round(tone), 0, 3));
  }
  /* 顶层亮簇 */
  leafBlob(ctx, cx, cy, z1 - .55, Math.max(.45, cr * .14), 3);
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
