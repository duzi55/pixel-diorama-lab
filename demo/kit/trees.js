'use strict';
/* ------------------------------------------------------------------
 * 构件库 · 树木（tree）
 *
 * 严格照抄 docs/kit/trees.md 的配方：
 *   broadleaf —— 三段分叉干 + 多簇球堆冠（支持 bloomRate/bloomColor 花树参数组）
 *   pine      —— 直干 + 多层同心锥冠
 *   birch     —— 细直白干缀横向黑斑 + 横生短枝 + 疏朗叶冠
 *   willow    —— 矮壮分叉干 + 扁圆冠 + 沿抛物线二次下垂的柳枝串
 * ------------------------------------------------------------------ */

/* ---- 阔叶树：分叉干 + 球堆冠（含 blossom 花树参数组） ---- */
KIT.register({
  id: 'broadleaf',
  name: '阔叶树',
  category: 'tree',
  desc: '三段分叉树干 + 多簇球堆树冠（含花树参数组）',
  params: {
    height: { def: 5.0, min: 2, max: 9, step: .1, desc: '树高' },
    crownR: { def: 1.5, min: .6, max: 3, step: .1, desc: '冠幅半径' },
    trunkR: { def: .28, min: .1, max: .6, step: .02, desc: '树干粗细' },
    lean: { def: 0, min: -.5, max: .5, step: .05, desc: '倾斜' },
    bloomRate: { def: 0, min: 0, max: .2, step: .01, desc: '花点密度（0=普通阔叶树）' },
    bloomColor: { def: 0, min: 0, max: 2, step: 1, desc: '花色：0 粉白 / 1 纯白 / 2 浅黄' },
  },
  collision: { type: 'cylinder', radius: .35, height: 5.0 },
  draw(ctx, inst) {
    const h = ctx.params.height, cr = ctx.params.crownR, tr = ctx.params.trunkR;
    const lean = ctx.params.lean;
    const bark = [96, 68, 46];
    const leaf = [88, 132, 58];
    const BLOOM = [[248, 214, 224], [252, 250, 248], [250, 236, 168]];
    const bloom = BLOOM[ctx.params.bloomColor | 0] || BLOOM[0];
    const bloomRate = ctx.params.bloomRate || 0;

    const top = [ctx.x + lean * h * .5, ctx.y, h];
    ctx.capsule([ctx.x, ctx.y, 0], top, tr, tr * .55, () => bark, 'rough');

    const mid = [ctx.x + lean * h * .22, ctx.y, h * .45];
    ctx.capsule(mid, [ctx.x - h * .12, ctx.y - h * .05, h * .72], tr * .6, tr * .3, () => bark, 'rough');
    ctx.capsule(mid, [ctx.x + h * .13, ctx.y + h * .06, h * .7], tr * .6, tr * .3, () => bark, 'rough');

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
      const isBloom = bloomRate > 0 && hash(kk, 12) < bloomRate;
      const c = isBloom ? bloom
        : tone > .74 ? [126, 168, 74] : tone > .42 ? leaf : [62, 100, 46];
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
      for (let k = 0; k < 10; k++) {
        const kk = ctx.seed + i * 40 + k;
        const a = k / 10 * 6.283 + hash(kk, 51) * .22;
        const rr = R * (.86 + hash(kk, 52) * .2);
        ctx.sphere(ctx.x + Math.cos(a) * rr, ctx.y + Math.sin(a) * rr, z, R * .26, needle, 'rough');
      }
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

/* ---- 白桦 · birch ---- */
KIT.register({
  id: 'birch',
  name: '白桦',
  category: 'tree',
  desc: '细直白干缀横向黑斑，横枝平挑疏朗叶簇',
  params: {
    height:   { def: 5.4,  min: 3.2,  max: 7,    step: 0.1,  desc: '树高（世界单位，人约 1.8）' },
    trunkR:   { def: 0.16, min: 0.08, max: 0.24, step: 0.01, desc: '树干半径，白桦要保持细直' },
    branches: { def: 8,    min: 3,    max: 14,   step: 1,    desc: '横向短枝数量' },
    crown:    { def: 1,    min: 0.5,  max: 1.6,  step: 0.05, desc: '枝长与叶簇大小系数' },
    spots:    { def: 1,    min: 0,    max: 2,    step: 0.1,  desc: '树干黑斑密度' },
  },
  collision: { type: 'cylinder', radius: 0.3, height: 5.4 },
  behavior: {
    default: [{ id: 'sway', params: { amp: 1.2 } }],
    allow: ['sway', 'chop', 'shake'],
  },

  draw(ctx, inst) {
    const p = ctx.params;
    const H = p.height;
    const R = p.trunkR;
    const BARK_LO = [210, 206, 194], BARK_MID = [230, 226, 214], BARK_HI = [246, 242, 230];
    const TWIG = [194, 186, 168];
    const LEAF_DK = [92, 132, 54], LEAF = [118, 156, 70], LEAF_HI = [152, 184, 92];
    const ink = ctx.rgb(54, 48, 42);

    /* 树干：分段绘制，色阶按 z 从暗档爬到亮档 */
    const SEG = 7;
    for (let i = 0; i < SEG; i++) {
      const t0 = i / SEG, t1 = (i + 1) / SEG;
      const ra = ctx.lerp(R, R * 0.45, t0);
      const rb = ctx.lerp(R, R * 0.45, t1);
      const tone = ctx.clamp(Math.round(1 + t0 * 3.4), 1, 4);
      ctx.capsule(
        [ctx.x, ctx.y, t0 * H],
        [ctx.x, ctx.y, t1 * H + 0.05],
        ra, rb,
        () => (tone >= 4 ? BARK_HI : tone >= 3 ? BARK_MID : BARK_LO),
        'rough'
      );
    }

    /* 黑斑：绕干全周撒点，背面点由深度测试自动剔除 */
    const nSpot = Math.round(22 * p.spots);
    for (let i = 0; i < nSpot; i++) {
      const t = 0.05 + ctx.hash(i * 17 + 1, ctx.seed) * 0.82;
      const rr = ctx.lerp(R, R * 0.45, t) * 1.25;
      const a = ctx.hash(i * 17 + 2, ctx.seed) * Math.PI * 2;
      const z = t * H;
      ctx.plot(ctx.x + Math.sin(a) * rr, ctx.y + Math.cos(a) * rr, z, ink);
      if (ctx.hash(i * 17 + 3, ctx.seed) > 0.35) {
        const a2 = a + (ctx.hash(i * 17 + 4, ctx.seed) > 0.5 ? 0.65 : -0.65);
        ctx.plot(ctx.x + Math.sin(a2) * rr, ctx.y + Math.cos(a2) * rr, z, ink);
      }
    }

    /* 横向短枝：水平伸出，枝上挑起层叠叶簇 */
    const nB = Math.round(p.branches);
    for (let i = 0; i < nB; i++) {
      const t = 0.32 + (i / Math.max(1, nB - 1)) * 0.56
              + (ctx.hash(i * 23 + 1, ctx.seed) - 0.5) * 0.04;
      const z = t * H;
      const ra = ctx.lerp(R, R * 0.45, t);
      const side = i % 2 === 0 ? -1 : 1;
      const a = side * (0.4 + ctx.hash(i * 23 + 2, ctx.seed) * 1.1);
      const mid = 1 - Math.abs(t - 0.62) * 1.5;
      const len = (0.48 + 0.68 * Math.max(0, mid)) * p.crown
                * (0.85 + ctx.hash(i * 23 + 3, ctx.seed) * 0.3);
      const sx = ctx.x + Math.sin(a) * ra * 0.7;
      const sy = ctx.y + Math.cos(a) * ra * 0.7;
      const ex = ctx.x + Math.sin(a) * (ra + len);
      const ey = ctx.y + Math.cos(a) * (ra + len);
      const ez = z + len * 0.08;
      ctx.capsule([sx, sy, z], [ex, ey, ez], 0.055, 0.028, () => TWIG, 'rough');

      const cr = (0.34 + ctx.hash(i * 23 + 4, ctx.seed) * 0.18) * p.crown;
      ctx.sphere(ex, ey, ez + cr * 0.45, cr, LEAF, 'rough');
      ctx.sphere(ex + Math.cos(a) * cr * 0.35, ey - Math.sin(a) * cr * 0.35,
                 ez + cr * 0.25, cr * 0.78, LEAF_DK, 'rough');
      ctx.sphere(ex - Math.sin(a) * cr * 0.22, ey - Math.cos(a) * cr * 0.22,
                 ez + cr * 0.95, cr * 0.72, LEAF_HI, 'rough');
    }

    /* 顶梢疏朗树冠团 */
    const topR = (0.44 + ctx.hash(91, ctx.seed) * 0.14) * p.crown;
    ctx.sphere(ctx.x + 0.06, ctx.y - 0.05, H * 0.92, topR, LEAF, 'rough');
    ctx.sphere(ctx.x - 0.06, ctx.y + 0.05, H * 1.01, topR * 0.78, LEAF_HI, 'rough');

    ctx.shadow(0.95 * p.crown, 1, 0.5);
  },
});

/* ---- 垂柳 · willow ---- */
KIT.register({
  id: 'willow',
  name: '垂柳',
  category: 'tree',
  desc: '矮壮树干托起扁圆冠，冠缘垂下一圈二次下坠的细柳条，末梢渐细',
  params: {
    height:  { def: 4.4, min: 3.0, max: 6.5, step: 0.1, desc: '树高（世界单位，含冠）' },
    spread:  { def: 1.8, min: 1.0, max: 2.8, step: 0.1, desc: '冠幅半径，同时决定垂枝起点的径向距离' },
    strands: { def: 16,  min: 6,   max: 28,  step: 1,   desc: '垂枝条数（沿极角均布）' },
    droop:   { def: 1.0, min: 0.4, max: 1.6, step: 0.05, desc: '垂枝下垂长度系数，>1 更接近地面' }
  },
  collision: { type: 'cylinder', radius: 0.42, height: 4.4 },
  behavior: {
    default: [{ id: 'sway', params: { amp: 1.2 } }],
    allow: ['sway', 'chop', 'shake'],
  },

  draw(ctx, inst) {
    const P = ctx.params;
    const H = P.height, spread = P.spread, droop = P.droop;
    const N = Math.max(6, Math.round(P.strands));
    const ox = ctx.x, oy = ctx.y, oz = ctx.z;
    const TAU = Math.PI * 2;
    const rnd = function (k) { return ctx.hash(k, ctx.seed); };

    const TRUNK = [92, 66, 46];
    const LEAF_DK = [84, 108, 58], LEAF = [96, 122, 64], LEAF_LIT = [120, 146, 78];
    const TWIG_DK = [100, 126, 64], TWIG = [112, 140, 74], TWIG_LIT = [132, 158, 88];

    const midZ = oz + H * 0.27;
    const topX = ox + spread * 0.06, topY = oy - 0.03, topZ = oz + H * 0.56;
    ctx.capsule([ox, oy, oz], [ox + 0.05, oy, midZ],
      H * 0.056, H * 0.042, () => TRUNK, 'rough');
    ctx.capsule([ox + 0.05, oy, midZ], [topX, topY, topZ],
      H * 0.042, H * 0.028, () => TRUNK, 'rough');

    const cz = oz + H * 0.70;
    const cr = spread * 0.56;
    ctx.sphere(topX, topY, cz, cr, LEAF, 'rough');
    ctx.sphere(topX - spread * 0.44, topY + 0.06, cz - H * 0.05, cr * 0.72, LEAF_DK, 'rough');
    ctx.sphere(topX + spread * 0.46, topY + 0.02, cz - H * 0.03, cr * 0.70, LEAF, 'rough');
    ctx.sphere(topX - 0.05, topY - spread * 0.36, cz + H * 0.02, cr * 0.66, LEAF_LIT, 'rough');
    ctx.sphere(topX + 0.04, topY - 0.02, cz + cr * 0.78, cr * 0.46, LEAF_LIT, 'rough');

    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU + (rnd(i * 7 + 1) - 0.5) * 0.40;
      const ca = Math.cos(a), sa = Math.sin(a);
      const r0 = spread * (0.48 + rnd(i * 13 + 5) * 0.24);
      const z0 = Math.min(oz + H * 0.94,
        cz + cr * (0.30 + rnd(i * 17 + 2) * 0.60) - H * 0.08);
      const lenMax = Math.max(0.30, z0 - oz - 0.12);
      const len = Math.min(lenMax, H * (0.40 + rnd(i * 23 + 7) * 0.24) * droop);
      const out = spread * (0.08 + rnd(i * 29 + 3) * 0.18);
      const rTop = 0.060 + rnd(i * 31 + 11) * 0.026;
      const lite = rnd(i * 37 + 9) < 0.45 ? TWIG_LIT : TWIG;
      const dark = TWIG_DK;
      const colorOf = function (u) { return u < 0.55 ? lite : dark; };
      const seg = Math.max(3, Math.min(8, Math.round(len / 0.32)));

      let px = topX + ca * r0, py = topY + sa * r0, pz = z0, pr = rTop;
      for (let s = 1; s <= seg; s++) {
        const t = s / seg;
        const nx = topX + ca * (r0 + out * t);
        const ny = topY + sa * (r0 + out * t);
        const nz = z0 - len * t * t;
        const nr = Math.max(0.014, rTop * Math.pow(1 - t, 1.35));
        ctx.capsule([px, py, pz], [nx, ny, nz], pr, nr, colorOf, 'rough');
        px = nx; py = ny; pz = nz; pr = nr;
      }
    }

    for (let j = 0; j < 4; j++) {
      const aa = rnd(j * 41 + 5) * TAU;
      ctx.sphere(topX + Math.cos(aa) * spread * 0.30,
                 topY + Math.sin(aa) * spread * 0.26,
                 cz + cr * (0.55 + rnd(j * 43 + 13) * 0.25),
                 0.16 + rnd(j * 47 + 19) * 0.10, LEAF_LIT, 'rough');
    }

    ctx.shadow(spread * 0.95, 1, 0.5);
  }
});

/* ---- 樱花树 · sakura ---- */
KIT.register({
  id: 'sakura',
  name: '樱花树',
  category: 'tree',
  desc: '矮壮紫褐主干向四周横展伞形枝，粉白花团压满枝头，花瓣持续旋转飘落',
  params: {
    height:    { def: 3.6, min: 2.4, max: 5.6, step: 0.1, desc: '树高' },
    spread:    { def: 1.0, min: 0.6, max: 1.6, step: 0.05, desc: '冠幅展开半径' },
    bloom:     { def: 1.0, min: 0.4, max: 1.8, step: 0.1, desc: '花团饱满度' },
    petals:    { def: 18,  min: 0,   max: 40,  step: 1, desc: '飘落花瓣数量（0 = 静态）' },
    fallSpeed: { def: 0.55, min: 0.2, max: 1.2, step: 0.05, desc: '花瓣下落速度' },
    blush:     { def: 0.5, min: 0,   max: 1,   step: 0.05, desc: '花色深浅：0 近白，1 深粉' }
  },
  collision: { type: 'cylinder', radius: 0.3, height: 3.4 },
  behavior: {
    default: [{ id: 'sway', params: { amp: 1.2 } }],
    allow: ['sway', 'chop', 'shake'],
  },
  draw(ctx, inst) {
    const p = ctx.params;
    const H = p.height, S = p.spread;
    const cx = ctx.x, cy = ctx.y, cz = ctx.z;
    const bh = H * 0.36;
    const topZ = cz + bh;
    const bl = ctx.clamp(p.blush, 0, 1);

    // 枝干：紫褐三档（每通道差 15~20，抖动不会出彩点）
    const BARK = [78, 60, 64], BARK_HI = [98, 78, 82], BARK_LO = [60, 45, 50];
    // 花色：随 blush 在白粉与深粉之间线性插值，保持色相不跑
    const BLOOM_HI  = [Math.round(246 - 6 * bl),  Math.round(226 - 30 * bl), Math.round(232 - 20 * bl)];
    const BLOOM_MID = [Math.round(234 - 8 * bl),  Math.round(204 - 32 * bl), Math.round(216 - 22 * bl)];
    const BLOOM_LO  = [Math.round(212 - 14 * bl), Math.round(176 - 34 * bl), Math.round(192 - 20 * bl)];

    // —— 主干：矮壮、顶端微微侧倾 ——
    const tx = cx + (ctx.hash(1, ctx.seed) - 0.5) * 0.2;
    const ty = cy + (ctx.hash(2, ctx.seed) - 0.5) * 0.14;
    const tr = 0.15 + H * 0.026;
    ctx.sphere(cx, cy, cz + 0.06, tr * 1.3, BARK_LO, 'rough');
    ctx.capsule([cx, cy, cz], [tx, ty, topZ], tr, tr * 0.62,
      z => (z > cz + bh * 0.55 ? BARK_HI : BARK), 'rough');

    // —— 四根近水平横展主枝：樱花标志性的伞形骨架 ——
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + ctx.hash(i + 3, ctx.seed) * 0.6;
      const len = S * (1.15 + ctx.hash(i + 13, ctx.seed) * 0.5);
      const ex = tx + Math.cos(ang) * len;
      const ey = ty + Math.sin(ang) * len;
      const ez = topZ + H * (0.10 + ctx.hash(i + 23, ctx.seed) * 0.14);

      ctx.capsule([tx, ty, topZ + 0.02], [ex, ey, ez], tr * 0.5, 0.035,
        z => (z > topZ + H * 0.1 ? BARK_HI : BARK), 'rough');

      const nc = 3 + Math.round(ctx.hash(i + 33, ctx.seed) * 2);
      for (let k = 0; k < nc; k++) {
        const t = 0.4 + (k / Math.max(1, nc - 1)) * 0.6;
        const px = ctx.lerp(tx, ex, t);
        const py = ctx.lerp(ty, ey, t);
        const pz = ctx.lerp(topZ, ez, t);
        const rr = (0.28 + ctx.hash(i * 7 + k + 41, ctx.seed) * 0.14)
                 * (0.85 + S * 0.28) * (0.8 + p.bloom * 0.28);
        // 扁团：主球抬高压冠，侧球错位补出蓬松边缘
        ctx.sphere(px, py, pz + rr * 0.55, rr, k > nc - 2 ? BLOOM_HI : BLOOM_MID, 'rough');
        ctx.sphere(px + rr * 0.5, py + rr * 0.32, pz + rr * 0.2, rr * 0.72, BLOOM_MID, 'rough');
        if (k > 0) ctx.sphere(px - rr * 0.42, py - rr * 0.28, pz + rr * 0.1, rr * 0.6, BLOOM_LO, 'rough');
      }
    }
    // 冠顶补簇，压住伞心不露空
    const capR = S * 0.5 * (0.85 + p.bloom * 0.2);
    ctx.sphere(tx, ty, topZ + H * 0.28, capR, BLOOM_HI, 'rough');
    ctx.sphere(tx + S * 0.28, ty - S * 0.2, topZ + H * 0.22, capR * 0.8, BLOOM_MID, 'rough');

    // —— 飘落花瓣：无状态纯函数动画，位置只由 (时间, seed, 序号) 决定 ——
    const now = ((typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now()) * 0.001;
    const PETAL = ctx.rgb(Math.round(248 - 6 * bl), Math.round(226 - 28 * bl), Math.round(236 - 18 * bl));
    const PALE = ctx.rgb(255, 243, 246);
    const np = Math.round(p.petals);
    for (let i = 0; i < np; i++) {
      const h1 = ctx.hash(i * 6 + 101, ctx.seed);
      const h2 = ctx.hash(i * 6 + 102, ctx.seed);
      const h3 = ctx.hash(i * 6 + 103, ctx.seed);
      const h4 = ctx.hash(i * 6 + 104, ctx.seed);
      const h5 = ctx.hash(i * 6 + 105, ctx.seed);
      const h6 = ctx.hash(i * 6 + 106, ctx.seed);

      // 起点落在冠底外缘，不从树心钻出来
      const ang = h2 * 6.2832;
      const rad = S * (0.42 + h1 * 0.9);
      const sx = cx + Math.cos(ang) * rad;
      const sy = cy + Math.sin(ang) * rad;
      const sz = cz + bh * 0.96 + H * (0.02 + h3 * 0.22);

      // 循环相位：各花瓣速度/起点不同，永不整齐划一
      const cyc = (now * p.fallSpeed * (0.55 + h4 * 0.9) * 0.38 + h5 + i * 0.173) % 1;
      const z = ctx.lerp(sz, cz + 0.05, cyc);
      const x = sx + Math.sin(cyc * 10.5 + h1 * 6.2832) * (0.16 + h3 * 0.2) * S + cyc * 0.3 * S;
      const y = sy + Math.cos(cyc * 7.7 + h2 * 6.2832) * 0.12 * S + cyc * 0.08 * S;

      const col = cyc > 0.88 ? PALE : PETAL;
      ctx.plot(x, y, z, col);
      // 第二像素模拟花瓣翻转：横躺或竖立
      if (Math.sin(cyc * 13 + h6 * 6.2832) > 0) ctx.plot(x + 0.07, y, z, PALE);
      else ctx.plot(x, y + 0.07, z + 0.02, PALE);
    }

    // —— 树下落瓣堆积 ——
    const ng = Math.round(3 + p.bloom * 5);
    const GROUND = ctx.rampOf([238, 198, 212])[2];
    for (let i = 0; i < ng; i++) {
      const a = ctx.hash(i + 301, ctx.seed) * 6.2832;
      const r = S * (0.35 + ctx.hash(i + 311, ctx.seed) * 1.25);
      ctx.plot(cx + Math.cos(a) * r, cy + Math.sin(a) * r, cz + 0.02, GROUND);
    }

    ctx.shadow(S * 1.45, 1, 0.5);
  }
});
