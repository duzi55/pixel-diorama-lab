'use strict';
/* ------------------------------------------------------------------
 * 构件库 · 秋日金黄层叠锥塔树（参考图神韵还原）
 * ------------------------------------------------------------------ */

const GOLD_HI   = [255, 228, 86];   // 阳光高光金黄
const GOLD_MID  = [248, 196, 42];   // 纯正饱满金黄主体
const GOLD_WARM = [228, 164, 34];   // 暖金背侧
const GOLD_SHD  = [164, 102, 28];   // 盘底整洁出檐暗影

/* 绘制单层 100% 连续平整、边缘微波的金黄伞盘（极简连续扫描） */
function drawTreeTier(ctx, cx, cy, z, R, isTop, seed) {
  const thick = Math.max(0.48, R * 0.25);

  // 1. 伞盘底面与出檐阴影（暗金底盘）
  const rShd = R * 0.90;
  for (let r = 0.5; r <= rShd; r += 0.55) {
    const steps = Math.max(8, Math.round(r * 8.0));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * 6.283;
      const wave = 1.0 + 0.07 * Math.sin(a * 7 + seed);
      const pr = r * wave;
      ctx.sphere(cx + Math.cos(a) * pr, cy + Math.sin(a) * pr, z - thick * 0.45, thick * 0.45, GOLD_SHD, 'flat');
    }
  }

  // 2. 伞盘饱满连续金黄主体（同心环密铺，完全消除小斑点孔洞）
  for (let r = 0.3; r <= R; r += 0.52) {
    const steps = Math.max(8, Math.round(r * 8.5));
    const isEdge = (r >= R - 0.6);
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * 6.283;
      const wave = isEdge ? (1.0 + 0.08 * Math.sin(a * 7 + seed) + 0.04 * Math.cos(a * 13)) : 1.0;
      const pr = r * wave;
      const col = (Math.cos(a) + Math.sin(a) > -0.25) ? GOLD_HI : GOLD_MID;
      ctx.sphere(cx + Math.cos(a) * pr, cy + Math.sin(a) * pr, z, thick * 0.52, col, 'flat');
    }
  }
}

/* 巨层塔树（The Great Autumn Tree & 标志性金杉巨木） */
KIT.register({
  id: 'cone-mast',
  name: '巨层塔树',
  category: 'tree',
  desc: '高耸挺拔、出檐分明的黄金参天大树：贯通主干 + 多层舒展金黄盘冠 + 顶端尖锐挺拔',
  params: {
    height: { def: 23.0, min: 10.0, max: 32.0, step: 0.5, desc: '整树高度' },
    crownR: { def: 5.6,  min: 2.8,  max: 9.0,  step: 0.2, desc: '底层最大展开半径' },
    trunkH: { def: 5.2,  min: 2.0,  max: 9.0,  step: 0.2, desc: '树干裸露高度' },
    layers: { def: 8,    min: 5,    max: 10,   step: 1,   desc: '层叠枝盘数' },
  },
  collision: { type: 'cylinder', radius: 0.9, height: 23.0 },
  draw(ctx, inst) {
    const h = ctx.params.height;
    const cr = ctx.params.crownR;
    const tkH = Math.min(ctx.params.trunkH, h * 0.35);
    const layers = Math.max(5, ctx.params.layers | 0);
    const seed = ctx.seed;

    const tr = Math.max(0.40, cr * 0.13);
    const bark = [92, 58, 36];
    const barkLit = [136, 92, 56];

    // 1. 直贯主干（深褐色挺拔树干）
    const trunkTop = h * 0.88;
    ctx.capsule([ctx.x, ctx.y, 0], [ctx.x, ctx.y, trunkTop], tr * 1.2, tr * 0.4, () => bark, 'rough');
    ctx.capsule([ctx.x + tr * 0.35, ctx.y + tr * 0.35, 0],
                [ctx.x + tr * 0.2, ctx.y + tr * 0.2, trunkTop],
                tr * 0.35, tr * 0.14, () => barkLit, 'rough');
    // 树根爪
    for (let i = 0; i < 4; i++) {
      const a = i * 1.57 + hash(seed + i, 7) * 0.4;
      const rx = Math.cos(a) * tr * 1.8, ry = Math.sin(a) * tr * 1.8;
      ctx.capsule([ctx.x, ctx.y, 0], [ctx.x + rx, ctx.y + ry, 0], tr * 0.65, tr * 0.2, () => bark, 'rough');
    }

    // 2. 层叠金色枝盘
    const zBase = tkH;
    const spanH = h - zBase;

    for (let li = 0; li < layers; li++) {
      const u = li / (layers - 1);
      const z = zBase + u * spanH;
      // 优美的挺拔金塔收缩曲线
      const R = cr * Math.pow(1.0 - u * 0.94, 0.82);
      if (R < 0.25) continue;

      drawTreeTier(ctx, ctx.x, ctx.y, z, R, li === layers - 1, seed * 13 + li * 79);
    }

    // 3. 树顶挺拔尖梢（饱满连续收尖，无浮空孤岛）
    ctx.capsule([ctx.x, ctx.y, h - 0.6], [ctx.x, ctx.y, h + 0.6], 0.42, 0.16, () => GOLD_HI, 'flat');

    // 4. 地面柔和阴影
    ctx.shadow(cr * 1.25, 1, 0.45);
  },
});

/* 尖锥树（修长挺拔的森林背景金杉） */
KIT.register({
  id: 'cone-spire',
  name: '尖锥树',
  category: 'tree',
  desc: '修长秀丽的金黄尖锥塔：笔直深干 + 密集优美的层叠枝盘',
  params: {
    height: { def: 16.0, min: 8.0, max: 24.0, step: 0.5, desc: '整树高度' },
    crownR: { def: 3.6,  min: 1.5, max: 6.0,  step: 0.1, desc: '锥底展开半径' },
    trunkH: { def: 3.6,  min: 1.2, max: 6.0,  step: 0.2, desc: '树干裸露高度' },
  },
  collision: { type: 'cylinder', radius: 0.6, height: 16.0 },
  draw(ctx, inst) {
    const h = ctx.params.height;
    const cr = ctx.params.crownR;
    const tkH = Math.min(ctx.params.trunkH, h * 0.3);
    const seed = ctx.seed;

    const tr = Math.max(0.28, cr * 0.12);
    const bark = [88, 56, 34];
    const barkLit = [128, 86, 52];

    const trunkTop = h * 0.85;
    ctx.capsule([ctx.x, ctx.y, 0], [ctx.x, ctx.y, trunkTop], tr * 1.15, tr * 0.35, () => bark, 'rough');
    ctx.capsule([ctx.x + tr * 0.3, ctx.y + tr * 0.3, 0],
                [ctx.x + tr * 0.15, ctx.y + tr * 0.15, trunkTop],
                tr * 0.3, tr * 0.1, () => barkLit, 'rough');

    const zBase = tkH;
    const spanH = h - zBase;
    const layers = Math.max(6, Math.round(spanH * 0.68));

    for (let li = 0; li < layers; li++) {
      const u = li / (layers - 1);
      const z = zBase + u * spanH;
      const R = cr * Math.pow(1.0 - u * 0.95, 0.82);
      if (R < 0.2) continue;

      drawTreeTier(ctx, ctx.x, ctx.y, z, R, li === layers - 1, seed * 17 + li * 91);
    }

    ctx.capsule([ctx.x, ctx.y, h - 0.5], [ctx.x, ctx.y, h + 0.5], 0.32, 0.14, () => GOLD_HI, 'flat');

    ctx.shadow(cr * 1.15, 1, 0.4);
  },
});
