'use strict';
/* ------------------------------------------------------------------
 * 构件库 · 锥状树（秋日山村背景林）
 *
 * 参考图实测（3× 放大目视核对）背景是两类锥状树：
 *   cone-mast  —— 巨层塔树：宽塔（高:底宽 ≈ 1.6:1），实心锥体，
 *                 塔面有细的水平层缝弧线，边缘微波，平涂金黄底暗顶亮，
 *                 粗壮深褐树干。参考图上半部的主角树。
 *   cone-spire —— 尖锥树：窄高连续锥（≈ 2.5:1），同实心画法，
 *                 背景缝隙里的填充树。
 *
 * ★ 关键画法（第一版踩过的坑，详见 docs/kit/trees.md 配方卡）：
 *   塔体必须用**密层大球融合**成实心锥（层 z 间距 < 球屏幕半径的 1/4），
 *   每层只画"中心大球 + 圆周 6 小球"。稀疏大球会读作"一坨坨橄榄球堆"。
 *   层缝不是画暗色带，而是**贴塔面的小暗点环线**（前半环可见、
 *   后半环被塔体自遮挡 → 自然形成下弯弧线）。
 *   主色必须 'flat' 平涂 —— 'rough' 的 5 级色阶会把金黄读成脏橙。
 *
 * 配色不增殖 ID：golden 参数组（1 = 浓金黄 ↔ 0 = 深橙）。
 * ------------------------------------------------------------------ */

/* 秋日锥树的五档色：dark(塔底) · base(塔面) · lit(塔顶) · seam(层缝线)
 * fade：向背景色晕开的过渡量（0 浓 / 1 ≈ 化进纸色）——
 * 远排树用高 fade，颜色淡出成米金剪影，与留白背景无缝过渡（水墨晕染感）。
 * 背景色 = village/palette.js 的 SKY rgb(252,236,186)，此处写字面量保持构件无依赖。 */
const CONE_FADE_SKY = [252, 245, 218];   // = village/palette.js SKY = 页面 --paper
function coneTones(golden, fade) {
  const base = [
    Math.round(lerp(230, 250, golden)),
    Math.round(lerp(142, 198, golden)),
    Math.round(lerp(36, 38, golden)),
  ];
  if (fade > 0) {
    const f = Math.min(1, fade);
    for (let i = 0; i < 3; i++) base[i] = Math.round(lerp(base[i], CONE_FADE_SKY[i], f));
  }
  return {
    dark: [Math.round(base[0] * .80), Math.round(base[1] * .78), Math.round(base[2] * .76)],
    base,
    lit: [Math.min(255, Math.round(base[0] * 1.01 + 3)),
          Math.min(255, Math.round(base[1] * 1.01 + 5)),
          Math.round(base[2] * 1.01 + 4)],
    seam: [Math.round(base[0] * .62), Math.round(base[1] * .60), Math.round(base[2] * .58)],
  };
}

/* 塔体纵向色：dark →(0~.08)→ base →(.80~1)→ lit 连续插值。
   参考图的塔几乎整体均匀金黄，只有塔尖一点微亮、塔底一条窄暗。
   过渡区宽了会在塔面读出横向色带界线。 */
function coneToneAt(T, t, out) {
  let a, b, k;
  if (t < .08) { a = T.dark; b = T.base; k = t / .08; }
  else if (t < .80) { a = T.base; b = T.base; k = 0; }
  else { a = T.base; b = T.lit; k = (t - .80) / .20; }
  const s = k * k * (3 - 2 * k);                       // smoothstep
  out[0] = Math.round(lerp(a[0], b[0], s));
  out[1] = Math.round(lerp(a[1], b[1], s));
  out[2] = Math.round(lerp(a[2], b[2], s));
  return out;
}

/* ---- 实心融合塔体：供两种锥树共用 ----
 * N = 密层数（融合精度），layers = 可见层缝数。
 * 返回塔体上 t∈[0,1] 处的半径包络由 radial(t) 给出。 */
function coneBody(ctx, h, z0, cr, N, tones, radial, seed) {
  const tone = [0, 0, 0];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const z = z0 + t * (h - z0);
    const R = radial(t);
    if (R < .12) continue;
    coneToneAt(tones, t, tone);
    const kk = seed * 17 + i * 131;
    /* 底层中心球缩小：满尺寸中心球的下缘会裸露成大圆弧（洋葱底），
       底缘改由横向排开的"底裙球"决定 → 平直 */
    ctx.sphere(ctx.x, ctx.y, z, R * (t < .15 ? .48 : .62), tone, 'flat');
    /* 底层中心球抬高：满尺寸中心球的球底下缘会裸露成圆弧（洋葱底）。
       参考图里塔底本来就被前排树冠遮住 —— 构件只保证"被遮时观感对"，
       不追求孤立展示时的完美底缘。 */
    const zLift = i === 0 ? R * .14 : 0;
    ctx.sphere(ctx.x, ctx.y, z + zLift, R * (i === 0 ? .52 : .62), tone, 'flat');
    /* 小盘不画圆周球：顶层 R 很小时圆周球会突出塔尖（分叉尾巴） */
    if (R < cr * .16) continue;
    for (let k = 0; k < 6; k++) {
      /* ★ 角度加层间大偏移 i*.55：偏移小（.3）时相邻层的球都围着
         固定方位排 → 融合后读出 6 条纵向条纹（"液化"感） */
      const a = k / 6 * 6.283 + hash(kk + k, 61) * .3 + i * .55;
      ctx.sphere(ctx.x + Math.cos(a) * R * .55, ctx.y + Math.sin(a) * R * .55,
        z + hash(kk + k, 62) * R * .08, R * .30, tone, 'flat');
    }
  }
}

/* ---- 层缝弧线：贴塔面的细密半环 ----
 * 参考图的层缝是 1~2px 的细下弯弧线，不是粗虚线：
 *   · 点要小（r ≈ .2 世界单位 → 屏幕直径 ~4px）
 *   · 点要密（M=22 → 相邻点相融成连续线）
 *   · 位置 R*.72 / z-R*.05：贴着塔面前表面，不被融合球吞掉也不凸成疙瘩 */
function coneSeams(ctx, h, z0, cr, layers, seam, radial, seed) {
  for (let k = 1; k < layers; k++) {
    const t = k / layers;
    if (t > .82) continue;                               // 塔尖一段不留缝
    const z = z0 + t * (h - z0);
    const R = radial(t);
    if (R < .3) continue;
    const kk = seed * 23 + k * 197;
    /* 点数随锥径缩放：窄锥少点（否则读作梯子横杠），宽塔多点连成线。
       ★ 弧段用 .10~1.72 rad：等距投影下这是「朝观众且屏幕对称」的
       前表面段（(cos a − sin a) 覆盖 ±.5R）。延伸到 3π/4 以外的点
       会跑到轮廓外，在塔缘读作凸出的暗包。 */
    const M = Math.max(8, Math.round(30 * R / cr));
    for (let m = 0; m <= M; m++) {
      const a = .10 + (m / M) * 1.62;
      ctx.sphere(ctx.x + Math.cos(a) * R * .72, ctx.y + Math.sin(a) * R * .72,
        z - R * .05, Math.max(.12, R * .045), seam, 'flat');
    }
  }
}

/* ---- 巨层塔树：实心宽塔 + 表面层缝弧线 ---- */
KIT.register({
  id: 'cone-mast',
  name: '巨层塔树',
  category: 'tree',
  desc: '宽塔锥树：实心融合锥体 + 塔面层缝弧线 + 平涂金黄底暗顶亮 + 粗深褐干',
  params: {
    height: { def: 16, min: 6, max: 26, step: .5, desc: '树高（世界单位）' },
    crownR: { def: 5.5, min: 2, max: 9, step: .2, desc: '底层冠半径' },
    layers: { def: 6, min: 4, max: 9, step: 1, desc: '层缝数（塔面分层感）' },
    golden: { def: 1, min: 0, max: 1, step: .05, desc: '叶色：1 浓金黄 / 0 深橙' },
    trunkV: { def: .16, min: .05, max: .4, step: .01, desc: '树干可见高度（占树高比）' },
    fade: { def: 0, min: 0, max: .85, step: .05, desc: '向背景色晕开（远景过渡）' },
  },
  collision: { type: 'cylinder', radius: .6, height: 16 },
  draw(ctx, inst) {
    const h = ctx.params.height, cr = ctx.params.crownR;
    const layers = Math.max(3, ctx.params.layers | 0);
    const T = coneTones(ctx.params.golden, ctx.params.fade);
    const bark = [96, 60, 36];
    const barkLit = [118, 76, 44];

    /* 树干：粗壮直立，干粗随冠幅缩放（参考图：干径 ≈ 底盘半径 1/8） */
    const tr = Math.max(.3, cr * .12);
    const tk = ctx.params.trunkV;
    ctx.capsule([ctx.x, ctx.y, 0], [ctx.x, ctx.y, h * tk], tr, tr * .8, () => bark, 'rough');
    ctx.capsule([ctx.x + tr * .3, ctx.y + tr * .3, 0],
      [ctx.x + tr * .3, ctx.y + tr * .3, h * tk], tr * .3, tr * .2, () => barkLit, 'rough');

    /* 塔体：**纯线性包络**。试过 4% 微波（与层缝对齐）——融合球把它
       放大成"洋葱串"轮廓；参考图的塔缘是平直的，层感全靠缝线。 */
    const z0 = h * .12;
    const radial = t => cr * (1 - t * .96);
    coneBody(ctx, h, z0, cr, Math.max(12, layers * 3), T, radial, ctx.seed);
    coneSeams(ctx, h, z0, cr, layers, T.seam, radial, ctx.seed);
    /* 塔尖小顶芽 */
    ctx.sphere(ctx.x, ctx.y, h + cr * .05, Math.max(.12, cr * .06), T.lit, 'flat');
    ctx.shadow(cr * 1.1, 1, .5);
  },
});

/* ---- 尖锥树：窄高实心锥 + 少量层缝 ---- */
KIT.register({
  id: 'cone-spire',
  name: '尖锥树',
  category: 'tree',
  desc: '窄高尖锥：实心融合锥面微波轮廓，底暗顶亮，背景填充树',
  params: {
    height: { def: 9, min: 3, max: 20, step: .5, desc: '树高（世界单位）' },
    crownR: { def: 2.2, min: .8, max: 6, step: .1, desc: '锥底半径' },
    rows: { def: 9, min: 5, max: 14, step: 1, desc: '层缝数（锥面分层感）' },
    golden: { def: .75, min: 0, max: 1, step: .05, desc: '叶色：1 浓金黄 / 0 深橙' },
    fade: { def: 0, min: 0, max: .85, step: .05, desc: '向背景色晕开（远景过渡）' },
  },
  collision: { type: 'cylinder', radius: .4, height: 9 },
  draw(ctx, inst) {
    const h = ctx.params.height, cr = ctx.params.crownR;
    const rows = Math.max(4, ctx.params.rows | 0);
    const T = coneTones(ctx.params.golden, ctx.params.fade);
    const bark = [88, 56, 34];

    ctx.capsule([ctx.x, ctx.y, 0], [ctx.x, ctx.y, h * .14], Math.max(.16, cr * .1),
      Math.max(.1, cr * .06), () => bark, 'rough');

    /* 锥体：线性包络 + 微波（sin 扰动） */
    const z0 = h * .1;
    const radial = t => cr * (1 - t * .92) * (1 + .05 * Math.sin(t * 11 + ctx.seed));
    coneBody(ctx, h, z0, cr, Math.max(14, rows * 3), T, radial, ctx.seed);
    coneSeams(ctx, h, z0, cr, rows, T.seam, radial, ctx.seed);
    ctx.shadow(cr * 1.05, 1, .5);
  },
});
