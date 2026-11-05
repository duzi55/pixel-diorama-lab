'use strict';
/* ------------------------------------------------------------------
 * 构件库 · 参考项目建筑表面与小件（ref-surfaces）
 *
 * 从 pixel-plays 已验证的材质算法移植（配方卡见 docs/kit/ref-surfaces.md）：
 *   masonry-wall  砖石墙   —— stari-most:100  masonry()
 *   plaster-wall  抹灰墙   —— laundry:98      wallColor()
 *   stair-house   楼梯间   —— laundry:138-140
 *
 * 颜色分两张皮（铁律 1）：
 *   RS_* 基色数组只喂 ctx.box / capsule / sphere；
 *   ctx.rampOf(...) 的返回值（打包像素）只喂 ctx.plot。
 * 随机只走 ctx.hash / ctx.noise，不用 Math.random。
 * ------------------------------------------------------------------ */

/* 参考项目原色 */
const RS_STONE = [216, 206, 184];      // stari-most STONE
const RS_PLASTER = [234, 224, 202];    // laundry PLASTER
const RS_CAP = [206, 194, 170];        // laundry STONE：石板压顶
const RS_SHUTTER = [70, 112, 104];     // laundry SHUTTER：百叶门

/* ================= 材质函数（返回打包像素，只能喂 ctx.plot） ================= */

/* 错缝砌体：砌层高 1/1.6、块长 1/1.2，隔层错半块；灰缝再压暗一档。
   seed 只平移纹理相位，第二参仍是 ctx.seed → 场景可复现。 */
function rsMasonry(ctx, a, z, base, seed) {
  const fz = z * 1.6 + seed * .37, course = Math.floor(fz);
  const fa = a * 1.2 + (course % 2) * .5 + seed * .63, block = Math.floor(fa);
  const mortar = fz - course < .14 || fa - block < .1;
  const tone = ctx.hash(block * 7 + course * 131 + seed * 53, ctx.seed);
  const lv = Math.round(base + (tone > .75 ? 1 : tone < .2 ? -1 : 0) - (mortar ? 1 : 0));
  return ctx.rampOf(RS_STONE)[ctx.clamp(lv, 0, 4)];
}

/* 顶面石板：沿 x 每 1.1 单位一道拼缝，逐块色差 */
function rsSlabTop(ctx, a, base, seed) {
  const u = a * .9, block = Math.floor(u), joint = u - block < .07;
  const tone = ctx.hash(block * 11 + seed * 29, ctx.seed);
  const lv = Math.round(base + (tone > .7 ? 1 : 0) - (joint ? 2 : 0));
  return ctx.rampOf(RS_STONE)[ctx.clamp(lv, 0, 4)];
}

/* 抹灰：低频噪声超过阈值 → 剥落露出后面的错缝石砌。斑块要跨过
   一块砖（约 1 单位）才读得出"露石"，所以频率压到 .75/.9；
   未剥落处再用更慢的一层噪声压暗一档，读成雨渍而不是逐像素噪点。 */
function rsPlaster(ctx, a, z, base, peel, seed) {
  const th = 1 - peel * .42;
  const patch = ctx.noise(a * .75 + seed * 2.3, z * .9 + 4 + seed * 1.4);
  if (patch > th) return rsMasonry(ctx, a, z, base, seed + 5);
  const stain = ctx.noise(a * .45 + seed * 5.1, z * .55 + 11 + seed * 2.2);
  return ctx.rampOf(RS_PLASTER)[ctx.clamp(Math.round(base - (stain > .8 ? 1 : 0)), 0, 4)];
}

/* 体积阴影：沿占位网格多点采样，不是单点贴纸 */
function rsShadow(ctx, x0, y0, x1, y1, h) {
  for (let x = x0; x <= x1; x += .7)
    for (let y = y0; y <= y1; y += .7)
      for (let z = .4; z <= h; z += 1.1) ctx.shadowAt(x, y, z, .45, .5, .35);
}

/* ================= 1. masonry-wall 砖石墙（stari-most:100） ================= */
KIT.register({
  id: 'masonry-wall',
  name: '砖石墙',
  category: 'building',
  desc: '错缝砖石墙：隔层错半块、灰缝压暗、逐块随机色，正面亮侧面暗',
  params: {
    width:  { def: 3.2, min: 1,   max: 8,   step: .1,  desc: '墙宽（x 方向）' },
    depth:  { def: .45, min: .2,  max: 2,   step: .05, desc: '墙厚（y 方向）' },
    height: { def: 2.4, min: .6,  max: 6,   step: .1,  desc: '墙高' },
    base:   { def: 3,   min: 1,   max: 4,   step: .25, desc: '受光基准（越大越亮，正面用 base、侧面自动降一档）' },
    seed:   { def: 1,   min: 0,   max: 99,  step: 1,   desc: '砌体纹理种子（换错缝相位）' },
  },
  collision: { type: 'box', w: 3.2, d: .45, h: 2.4 },

  draw(ctx) {
    const p = ctx.params, z0 = ctx.z || 0, step = .045;
    const x0 = ctx.x - p.width / 2, x1 = ctx.x + p.width / 2;
    const y0 = ctx.y - p.depth / 2, y1 = ctx.y + p.depth / 2;

    /* 正面（y1 面）受光 */
    for (let a = x0; a <= x1; a += step)
      for (let z = 0; z <= p.height; z += step)
        ctx.plot(a, y1, z0 + z, rsMasonry(ctx, a, z, p.base, p.seed));

    /* 侧面（x1 面）背光：base 降一档，自动出体积 */
    for (let a = y0; a <= y1; a += step)
      for (let z = 0; z <= p.height; z += step)
        ctx.plot(x1, a, z0 + z, rsMasonry(ctx, a, z, p.base - 1, p.seed + 11));

    /* 顶面：压顶石板，比正面再亮一档 */
    for (let a = x0; a <= x1; a += step)
      for (let b = y0; b <= y1; b += step)
        ctx.plot(a, b, z0 + p.height, rsSlabTop(ctx, a, p.base + 1, p.seed));

    rsShadow(ctx, x0, y0, x1, y1, p.height);
  },
});

/* ================= 2. plaster-wall 抹灰墙（laundry:98） ================= */
KIT.register({
  id: 'plaster-wall',
  name: '抹灰墙',
  category: 'building',
  desc: '抹灰墙面：局部剥落露出错缝石砌，带水渍色差，适合大面积旧墙',
  params: {
    width:  { def: 3.4, min: 1,  max: 8,  step: .1,  desc: '墙宽（x 方向）' },
    depth:  { def: .45, min: .2, max: 2,  step: .05, desc: '墙厚（y 方向）' },
    height: { def: 2.4, min: .6, max: 6,  step: .1,  desc: '墙高' },
    base:   { def: 3,   min: 1,  max: 4,  step: .25, desc: '受光基准（越大越亮，正面用 base、侧面自动降一档）' },
    peel:   { def: .5,  min: 0,  max: 1,  step: .05, desc: '剥落程度（0 = 完好抹灰，1 = 大面积露石）' },
  },
  collision: { type: 'box', w: 3.4, d: .45, h: 2.4 },

  draw(ctx) {
    const p = ctx.params, z0 = ctx.z || 0, step = .045;
    const x0 = ctx.x - p.width / 2, x1 = ctx.x + p.width / 2;
    const y0 = ctx.y - p.depth / 2, y1 = ctx.y + p.depth / 2;

    for (let a = x0; a <= x1; a += step)
      for (let z = 0; z <= p.height; z += step)
        ctx.plot(a, y1, z0 + z, rsPlaster(ctx, a, z, p.base, p.peel, 0));

    for (let a = y0; a <= y1; a += step)
      for (let z = 0; z <= p.height; z += step)
        ctx.plot(x1, a, z0 + z, rsPlaster(ctx, a, z, p.base - 1, p.peel, 9));

    for (let a = x0; a <= x1; a += step)
      for (let b = y0; b <= y1; b += step)
        ctx.plot(a, b, z0 + p.height, rsSlabTop(ctx, a, p.base + 1, 3));

    rsShadow(ctx, x0, y0, x1, y1, p.height);
  },
});

/* ================= 3. stair-house 楼梯间（laundry:138-140） ================= */
KIT.register({
  id: 'stair-house',
  name: '楼梯间',
  category: 'building',
  desc: '屋顶楼梯间：抹灰墙身 + 出挑石板压顶 + 横向百叶门，可作楼梯出口',
  params: {
    w:    { def: 3,   min: 1.2, max: 6,   step: .1,  desc: '房身宽（x 方向）' },
    d:    { def: 2.4, min: 1,   max: 5,   step: .1,  desc: '房身深（y 方向）' },
    h:    { def: 2.2, min: 1,   max: 4.5, step: .1,  desc: '房身高' },
    door: { def: .9,  min: 0,   max: 1.6, step: .05, desc: '百叶门宽（0 = 无门）' },
  },
  collision: { type: 'box', w: 3, d: 2.4, h: 2.42 },

  draw(ctx) {
    const p = ctx.params, z0 = ctx.z || 0, step = .045;
    const x0 = ctx.x - p.w / 2, x1 = ctx.x + p.w / 2;
    const y0 = ctx.y - p.d / 2, y1 = ctx.y + p.d / 2;

    /* 墙身：两面抹灰，正面亮、侧面暗；剥落比单独墙面少 */
    for (let a = x0; a <= x1; a += step)
      for (let z = 0; z <= p.h; z += step)
        ctx.plot(a, y1, z0 + z, rsPlaster(ctx, a, z, 3, .18, 5));

    for (let a = y0; a <= y1; a += step)
      for (let z = 0; z <= p.h; z += step)
        ctx.plot(x1, a, z0 + z, rsPlaster(ctx, a, z, 2, .18, 13));

    /* 石板压顶：四边出挑 .14，box 只吃 [r,g,b] 基色 */
    const e = .14, capH = .22;
    ctx.box(x0 - e, y0 - e, z0 + p.h, x1 + e, y1 + e, z0 + p.h + capH,
      RS_CAP, ctx.seed + 3);

    /* 百叶门：横向板条（z 分档），凸出墙面 .03 才不会被吃 */
    const dw = Math.min(p.door, p.w * .7) / 2;
    if (dw > .05) {
      const dx = ctx.x, dh = Math.min(p.h * .68, p.h - .12);
      const shut = ctx.rampOf(RS_SHUTTER);
      for (let a = dx - dw; a <= dx + dw; a += step)
        for (let z = 0; z <= dh; z += step)
          ctx.plot(a, y1 + .03, z0 + z, shut[Math.floor(z * 6) % 2 ? 3 : 2]);

      /* 门框：左右立梃 + 上楣，同一材质压暗一档。
         fw 至少 .14（≈1px），太小会在 plot 步长里漏成虚线。 */
      const fw = .14;
      for (let a = dx - dw; a <= dx - dw + fw; a += step)
        for (let z = 0; z <= dh; z += step) ctx.plot(a, y1 + .04, z0 + z, shut[0]);
      for (let a = dx + dw - fw; a <= dx + dw; a += step)
        for (let z = 0; z <= dh; z += step) ctx.plot(a, y1 + .04, z0 + z, shut[0]);
      for (let a = dx - dw; a <= dx + dw; a += step)
        for (let z = dh - fw; z <= dh; z += step) ctx.plot(a, y1 + .04, z0 + z, shut[0]);

      /* 门槛石：向门外挑出一小条 */
      const sill = ctx.rampOf(RS_CAP);
      for (let a = dx - dw - .08; a <= dx + dw + .08; a += step)
        for (let b = y1; b <= y1 + .1; b += .02)
          ctx.plot(a, b, z0 + .02, sill[3]);
    }

    rsShadow(ctx, x0, y0, x1, y1, p.h);
  },
});
