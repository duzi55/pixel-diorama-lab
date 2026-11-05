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

/* 参考项目 rampOf 的 5 档色阶（暗部 40% + 冷调，亮部 110% + 暖调） */
const CONE_PACKED = rampOf([246, 198, 78]);

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
   ★ tone 是色阶索引（不是颜色）：簇内只留亮/中两种硬色块 + 颗粒，
     不做球面渐变 —— 放大的树冠也不能读成 3D 体积。 */
function leafBlob(ctx, cx, cy, z, r, tone) {
  /* 叶簇 = 不规则的面片（不是球、不是圆盘）：
     - 轮廓：多频正弦扰动 + 边缘缺口，读作手绘叶团
     - 明暗：平面光照（面片倾斜），不是球面法线
     - 色阶：5 档 + Bayer 抖动，硬边（像素画）
     ★ 用 ctx.plot 写像素：village 的树冠风动靠 plotCapture 录像素。 */
  const toScreen = ctx.screen || ((x, y, zz) => project(x, y, zz));
  const toLocal = ctx.unproject || coneUnproject;
  const p = toScreen(cx, cy, z);
  const rp = Math.max(r * S, 1.5);
  const x0 = Math.max(0, Math.floor(p.sx - rp * 1.35)), x1 = Math.min(W - 1, Math.ceil(p.sx + rp * 1.35));
  const y0 = Math.max(0, Math.floor(p.sy - rp * 1.35)), y1 = Math.min(H - 1, Math.ceil(p.sy + rp * 1.35));
  const seed = hash(cx * 13.1 + 3, cy * 7.7 + z * 11.3) * 6.283;
  const off = Math.round(tone) - 2;
  for (let iy = y0; iy <= y1; iy++) {
    for (let ix = x0; ix <= x1; ix++) {
      const dx = (ix + .5 - p.sx) / rp, dy = (iy + .5 - p.sy) / rp;
      const d = Math.hypot(dx, dy);
      if (d > 1.4) continue;
      const a = Math.atan2(dy, dx);
      /* 不规则边缘：三个频率的鼓包，轮廓不再是圆 */
      const re = 1 + .22 * Math.sin(a * 3 + seed) + .13 * Math.sin(a * 5 + seed * 2.3)
                   + .07 * Math.sin(a * 8 + seed * 1.7);
      if (d > re) continue;
      /* 边缘缺口：碎叶感 */
      if (d > re * .86 && hash(ix * .8 + 5, iy * .8 + 9) > .55) continue;
      /* 去 3D 感：簇内不再按 dx/dy 做球面光照，只留两种硬色块 + 颗粒。
         暗档（0/1）整档禁用，树冠不再有黑黢黢的体积阴影。 */
      const grain = hash(ix * .9 + 11, iy * .7 + 5) > .8 ? 1 : 0;
      const idx = clamp(2 + Math.round(off * .6) + grain, 2, 4);
      const g = toLocal(ix, iy, z);
      ctx.plot(g[0], g[1], z, CONE_PACKED[idx]);
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
    blobs.push({ x: cx, y: cy, z, r: Math.max(.38, env * .44), tone: u > .6 ? 2 : 3 });
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
    const r = Math.max(.22, env * (.10 + hash(k, 14) * .07));
    /* 受光侧提亮：投影到当前光源方向（不是写死的左上），光源转树冠亮面跟着转 */
    const lx = (bx - cx) * (typeof LIGHT !== 'undefined' ? LIGHT.dir.x : -.55)
             + (by - cy) * (typeof LIGHT !== 'undefined' ? LIGHT.dir.y : -.6);
    const lit = -lx * .1;
    const tone = 2.2 + (1 - u) * .7 + lit + (hash(k, 15) - .5) * .5;
    blobs.push({ x: bx, y: by, z: z + zj, r, tone: clamp(Math.round(tone), 2, 3) });
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
    density: { def: 700, min: 300, max: 1000, step: 10, desc: '叶簇数量（越大越密实）' },
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
    const bark = [150, 108, 66], barkLit = [186, 140, 88];
    /* part：'trunk' 只画干 / 'canopy' 只画冠 / 缺省两者都画。
       场景用它把干（静态）和冠（每帧风动回放）分两遍烘焙。 */
    const part = inst && inst.part;
    if (part !== 'canopy') {
    ctx.capsule([ctx.x, ctx.y, 0], [ctx.x, ctx.y, tkH + .8], tr, tr * .55, () => bark, 'rough');
    ctx.capsule([ctx.x + tr * .42, ctx.y + tr * .42, 0],
      [ctx.x + tr * .18, ctx.y + tr * .18, tkH + .6], tr * .34, tr * .12, () => barkLit, 'rough');
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
    density: { def: 460, min: 200, max: 700, step: 10, desc: '叶簇数量' },
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
    const bark = [146, 104, 62], barkLit = [180, 134, 82];
    const part = inst && inst.part;

    if (part !== 'canopy') {
      ctx.capsule([ctx.x, ctx.y, 0], [ctx.x, ctx.y, tkH + .6], tr, tr * .5, () => bark, 'rough');
      ctx.capsule([ctx.x + tr * .34, ctx.y + tr * .34, 0],
        [ctx.x + tr * .14, ctx.y + tr * .14, tkH + .45], tr * .28, tr * .1, () => barkLit, 'rough');
    }
    if (part !== 'trunk') coneCanopy(ctx, ctx.x, ctx.y, tkH, h, cr, seed, ctx.params.density);
    if (!part) ctx.shadow(cr * .95, 1, .35);
  },
});
