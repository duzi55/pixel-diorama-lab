'use strict';
/* ------------------------------------------------------------------
 * 构件库 · 树木
 *
 * 照抄 docs/kit/trees.md 的配方，不重新推导。
 * 每个构件 = 一个独立 ID，参数差异走 params。
 * ------------------------------------------------------------------ */

/* ---- 阔叶树：分叉干 + 球堆冠 ---- */
KIT.register({
  id: 'broadleaf',
  name: '阔叶树',
  category: 'tree',
  desc: '三段分叉树干 + 多簇球堆树冠',
  params: {
    height: { def: 5.0, min: 2, max: 9, step: .1, desc: '树高' },
    crownR: { def: 1.5, min: .6, max: 3, step: .1, desc: '冠幅半径' },
    trunkR: { def: .28, min: .1, max: .6, step: .02, desc: '树干粗细' },
    lean: { def: 0, min: -.5, max: .5, step: .05, desc: '倾斜' },
  },
  collision: { type: 'cylinder', radius: .35, height: 5.0 },
  draw(ctx, inst) {
    const h = ctx.params.height, cr = ctx.params.crownR, tr = ctx.params.trunkR;
    const lean = ctx.params.lean;
    const bark = [96, 68, 46];
    const leaf = [88, 132, 58];

    /* 主干：微微倾斜 */
    const top = [ctx.x + lean * h * .5, ctx.y, h];
    ctx.capsule([ctx.x, ctx.y, 0], top, tr, tr * .55, () => bark, 'rough');

    /* 两根分枝 */
    const mid = [ctx.x + lean * h * .22, ctx.y, h * .45];
    ctx.capsule(mid, [ctx.x - h * .12, ctx.y - h * .05, h * .72], tr * .6, tr * .3, () => bark, 'rough');
    ctx.capsule(mid, [ctx.x + h * .13, ctx.y + h * .06, h * .7], tr * .6, tr * .3, () => bark, 'rough');

    /* 树冠：内层大球连体块 + 表层小球做轮廓 */
    const cz = h * .82;
    ctx.sphere(ctx.x, ctx.y, cz, cr * .72, leaf, 'rough');
    ctx.sphere(ctx.x - cr * .34, ctx.y + cr * .1, cz - cr * .22, cr * .5, leaf, 'rough');
    ctx.sphere(ctx.x + cr * .38, ctx.y - cr * .16, cz - cr * .18, cr * .48, leaf, 'rough');

    const n = 46;
    for (let k = 0; k < n; k++) {
      const kk = ctx.seed + k * 13;
      const a = hash(kk, 7) * 6.283;
      const tilt = hash(kk, 8) * 2 - 1;
      const flat = Math.sqrt(1 - tilt * tilt);
      const d = Math.cbrt(hash(kk, 9)) * cr;
      const px = ctx.x + Math.cos(a) * flat * d;
      const py = ctx.y + Math.sin(a) * flat * d;
      const pz = cz + tilt * d * .75;
      const tone = hash(kk, 10) + (pz - cz) / cr * .3;
      const c = tone > .74 ? [126, 168, 74] : tone > .42 ? leaf : [62, 100, 46];
      ctx.sphere(px, py, pz, cr * (.24 + hash(kk, 11) * .2), c, 'rough');
    }
    ctx.shadow(cr * 1.15, 1, .5);
  },
});

/* ---- 针叶树：直干 + 多层锥冠 ---- */
KIT.register({
  id: 'pine',
  name: '针叶树',
  category: 'tree',
  desc: '笔直树干 + 多层同心锥形树冠',
  params: {
    height: { def: 6.2, min: 3, max: 11, step: .1, desc: '树高' },
    crownR: { def: 1.4, min: .6, max: 3, step: .1, desc: '冠幅半径' },
    rows: { def: 8, min: 4, max: 14, step: 1, desc: '冠层数' },
  },
  collision: { type: 'cylinder', radius: .3, height: 6.2 },
  draw(ctx, inst) {
    const h = ctx.params.height, cr = ctx.params.crownR, rows = ctx.params.rows | 0;
    const bark = [82, 58, 40];
    const needle = [46, 84, 56];
    ctx.capsule([ctx.x, ctx.y, 0], [ctx.x, ctx.y, h * .2], .17, .09, () => bark, 'rough');

    for (let i = 0; i < rows; i++) {
      const u = i / (rows - 1);
      const z = h * .18 + u * (h * .82);
      const R = cr * (1 - u * .84);
      const base = clamp(Math.floor(u * 3.6) + 1, 0, 4);
      /* 外圈定轮廓 */
      for (let k = 0; k < 10; k++) {
        const kk = ctx.seed + i * 40 + k;
        const a = k / 10 * 6.283 + hash(kk, 51) * .22;
        const rr = R * (.86 + hash(kk, 52) * .2);
        ctx.sphere(ctx.x + Math.cos(a) * rr, ctx.y + Math.sin(a) * rr, z, R * .26,
          needle, 'rough');
      }
      /* 内圈 + 中心堵体积 */
      for (let k = 0; k < 6; k++) {
        const kk = ctx.seed + i * 70 + k;
        const a = hash(kk, 55) * 6.283, rr = Math.sqrt(hash(kk, 56)) * R * .62;
        ctx.sphere(ctx.x + Math.cos(a) * rr, ctx.y + Math.sin(a) * rr,
          z + (hash(kk, 57) - .5) * .2, R * .34, needle, 'rough');
      }
      ctx.sphere(ctx.x, ctx.y, z, R * .3, needle, 'rough');
    }
    ctx.sphere(ctx.x, ctx.y, h + .12, .2, [104, 148, 82], 'rough');
    ctx.shadow(cr * 1.2, 1, .5);
  },
});

/* ---- 灌木：无干矮球丛（canopy + height 参数组，不建独立 ID） ---- */
KIT.register({
  id: 'shrub',
  name: '灌木',
  category: 'plant',
  desc: '无干矮球丛，草丛般的低矮团块',
  params: {
    height: { def: .55, min: .2, max: 1.6, step: .05, desc: '高度' },
    radius: { def: .5, min: .2, max: 1.4, step: .05, desc: '半径' },
  },
  collision: { type: 'cylinder', radius: .5, height: .55 },
  draw(ctx, inst) {
    const h = ctx.params.height, r = ctx.params.radius;
    const c = [96, 112, 56];
    for (let k = 0; k < 7; k++) {
      const kk = ctx.seed + k * 17;
      const a = hash(kk, 97) * 6.283, d = Math.cbrt(hash(kk, 98)) * r;
      ctx.sphere(ctx.x + Math.cos(a) * d, ctx.y + Math.sin(a) * d,
        h * (.5 + hash(kk, 99) * .55), r * (.45 + hash(kk, 101) * .28), c, 'rough');
    }
    ctx.shadow(r * 1.15, 1, .4);
  },
});

/* ---- 草丛：几根细草叶 ---- */
KIT.register({
  id: 'grass-tuft',
  name: '草丛',
  category: 'plant',
  desc: '几根向上弯的细草叶',
  params: {
    height: { def: .4, min: .15, max: 1.0, step: .05, desc: '草高' },
    blades: { def: 5, min: 2, max: 9, step: 1, desc: '叶片数' },
  },
  collision: null,
  draw(ctx, inst) {
    const h = ctx.params.height, n = ctx.params.blades | 0;
    const c = [110, 140, 60];
    for (let k = 0; k < n; k++) {
      const kk = ctx.seed + k * 23;
      const a = hash(kk, 31) * 6.283;
      const bend = (hash(kk, 32) - .5) * h * .8;
      ctx.capsule(
        [ctx.x, ctx.y, 0],
        [ctx.x + Math.cos(a) * bend, ctx.y + Math.sin(a) * bend, h * (.7 + hash(kk, 33) * .4)],
        .05, .015, () => c, 'rough');
    }
  },
});
