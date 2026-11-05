'use strict';
/* ------------------------------------------------------------------
 * 构件库 · 道具（prop）
 *
 * 严格照抄 docs/kit/props.md 的配方：
 *   well           —— 圆石井（无支架矮井圈）
 *   fence          —— 木栅栏（等距木桩 + 横杆）
 *   stone-lantern  —— 石灯（方柱 + 灯室 + 顶盖）
 *   crate          —— 木箱（带边框方木箱）
 *   tin-lamp-post  —— 铁皮路灯（木杆 + 弯铁臂 + 悬挂锥罩灯 + 夜间光斑）
 *   lamp           —— 铸铁路灯（直杆 + 球形灯罩 + 压扁锥台底座）
 *   sign           —— 路牌（细杆 + 矩形木牌面）
 * ------------------------------------------------------------------ */

/* ---- 圆石井 ---- */
KIT.register({
  id: 'well',
  name: '圆石井',
  category: 'prop',
  desc: '圆环石砌井口，中间是暗井水',
  params: {
    radius: { def: .55, min: .3, max: 1.4, step: .05, desc: '井口半径' },
    height: { def: .5, min: .2, max: 1.2, step: .05, desc: '井壁高' },
  },
  collision: { type: 'cylinder', radius: .55, height: .5 },
  draw(ctx, inst) {
    const r = ctx.params.radius, h = ctx.params.height;
    const stone = [138, 132, 120];
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * 6.283;
      ctx.sphere(ctx.x + Math.cos(a) * r, ctx.y + Math.sin(a) * r, h * .5,
        r * .34, stone, 'rough');
    }
    ctx.sphere(ctx.x, ctx.y, h * .35, r * .62, [38, 40, 44], 'rough');
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * 6.283;
      ctx.sphere(ctx.x + Math.cos(a) * r, ctx.y + Math.sin(a) * r, h,
        r * .3, [162, 156, 142], 'rough');
    }
    ctx.shadow(r * 1.2, 1, .4);
  },
});

/* ---- 木栅栏：沿 x 方向一排桩 ---- */
KIT.register({
  id: 'fence',
  name: '木栅栏',
  category: 'prop',
  desc: '一排等距的木桩加横杆',
  params: {
    length: { def: 4.0, min: 1, max: 12, step: .2, desc: '长度' },
    height: { def: .7, min: .3, max: 1.6, step: .05, desc: '高度' },
    spacing: { def: .8, min: .4, max: 2, step: .1, desc: '桩间距' },
  },
  collision: { type: 'box', w: 4.0, d: .16, h: .7 },
  draw(ctx, inst) {
    const len = ctx.params.length, h = ctx.params.height, sp = ctx.params.spacing;
    const wood = [118, 88, 58];
    const x0 = ctx.x - len / 2;
    const n = Math.max(2, Math.round(len / sp) + 1);
    for (let k = 0; k < n; k++) {
      const px = x0 + len * k / (n - 1);
      ctx.capsule([px, ctx.y, 0], [px, ctx.y, h * (.9 + hash(ctx.seed + k, 41) * .2)],
        .07, .05, () => wood, 'rough');
    }
    ctx.capsule([x0, ctx.y, h * .55], [x0 + len, ctx.y, h * .55], .05, .05, () => wood, 'rough');
    ctx.shadow(len * .5, 1, .5);
  },
});

/* ---- 石灯：柱身 + 灯室 ---- */
KIT.register({
  id: 'stone-lantern',
  name: '石灯',
  category: 'prop',
  desc: '方形柱身承一方小灯室，夜里亮着',
  params: {
    height: { def: 1.1, min: .5, max: 2.2, step: .05, desc: '总高' },
    lit: { def: 1, min: 0, max: 1, step: 1, desc: '点亮' },
  },
  collision: { type: 'box', w: .4, d: .4, h: 1.1 },
  draw(ctx, inst) {
    const h = ctx.params.height;
    const stone = [146, 140, 126];
    const stoneRamp = rampOf(stone);
    const w = .17;
    /* 面亮度跟随方向光：顶面 +z / 右面 +x / 正面 +y 各取一档。
       体素式方块是逐点铺满的，内部点本来就被外表面挡住，只按外露面取档。 */
    const lvTop = Math.round(ctx.lit(0, 0, 1));
    const lvY = Math.round(ctx.lit(0, 1, 0));
    const lvX = Math.round(ctx.lit(1, 0, 0));
    const shaftTop = h * .72;
    const chamberTop = shaftTop + Math.floor((h * .92 - shaftTop) / .05 + 1e-9) * .05;
    const faceLv = (a, z, xr, zTop) => z >= zTop - 1e-4 ? lvTop
      : a >= ctx.x + xr - 1e-6 ? lvX : lvY;

    /* 基座：单层厚板只露顶面，比顶盖暗一档 */
    const baseRamp = stoneRamp[Math.max(0, lvTop - 1)];
    for (let a = ctx.x - w * 1.5; a <= ctx.x + w * 1.5; a += .05)
      for (let b = ctx.y - w * 1.5; b <= ctx.y + w * 1.5; b += .05)
        ctx.plot(a, b, .08, baseRamp);
    for (let a = ctx.x - w; a <= ctx.x + w; a += .05)
      for (let b = ctx.y - w; b <= ctx.y + w; b += .05)
        for (let z = .1; z <= shaftTop; z += .05)
          ctx.plot(a, b, z, stoneRamp[faceLv(a, z, w, shaftTop)]);
    for (let a = ctx.x - w * 1.3; a <= ctx.x + w * 1.3; a += .05)
      for (let b = ctx.y - w * 1.3; b <= ctx.y + w * 1.3; b += .05)
        for (let z = shaftTop; z <= h * .92; z += .05)
          ctx.plot(a, b, z, ctx.params.lit >= 1
            ? ctx.rgb(255, 222, 130)              /* emissive：点亮的灯室不随光 */
            : stoneRamp[faceLv(a, z, w * 1.3, chamberTop)]);
    /* 顶盖：出檐的顶面，受光档 */
    for (let a = ctx.x - w * 1.8; a <= ctx.x + w * 1.8; a += .05)
      for (let b = ctx.y - w * 1.8; b <= ctx.y + w * 1.8; b += .05)
        ctx.plot(a, b, h, stoneRamp[lvTop]);
    ctx.shadow(.35, 1, .4);
  },
});

/* ---- 木箱 ---- */
KIT.register({
  id: 'crate',
  name: '木箱',
  category: 'prop',
  desc: '带边框的方木箱',
  params: {
    size: { def: .6, min: .25, max: 1.6, step: .05, desc: '边长' },
    height: { def: .55, min: .2, max: 1.4, step: .05, desc: '高' },
  },
  collision: { type: 'box', w: .6, d: .6, h: .55 },
  behavior: { default: [], allow: ['shake', 'burn'] },
  draw(ctx, inst) {
    const s = ctx.params.size, h = ctx.params.height;
    const wood = [134, 100, 66];
    const woodRamp = rampOf(wood);
    const trimRamp = rampOf(KIT_WOOD_DARK);
    const x0 = ctx.x - s / 2, x1 = ctx.x + s / 2;
    const y0 = ctx.y - s / 2, y1 = ctx.y + s / 2;
    /* 三面各自按法线受光；奇偶木纹是在受光档上叠的色差，不另设光源 */
    const lvTop = Math.round(ctx.lit(0, 0, 1));
    const lvY = Math.round(ctx.lit(0, 1, 0));
    const lvX = Math.round(ctx.lit(1, 0, 0));
    for (let a = x0; a <= x1; a += .04) for (let z = 0; z <= h; z += .04)
      ctx.plot(a, y1, z, woodRamp[ctx.clamp(lvY + (Math.floor(a * 5) % 2 ? 0 : -1), 0, 4)]);
    for (let a = y0; a <= y1; a += .04) for (let z = 0; z <= h; z += .04)
      ctx.plot(x1, a, z, woodRamp[ctx.clamp(lvX + (Math.floor(a * 5) % 2 ? 0 : -1), 0, 4)]);
    for (let a = x0; a <= x1; a += .04) for (let b = y0; b <= y1; b += .04)
      ctx.plot(a, b, h, woodRamp[lvTop]);
    const trimLv = ctx.clamp(lvY - 1, 0, 4);
    for (let a = x0; a <= x1; a += .04) {
      ctx.plot(a, y1 + .01, h * .12, trimRamp[trimLv]);
      ctx.plot(a, y1 + .01, h * .86, trimRamp[trimLv]);
    }
    ctx.shadow(s * .8, 1, .4);
  },
});

/* ---- 铁皮路灯 · tin-lamp-post ---- */
KIT.register({
  id: 'tin-lamp-post',
  name: '铁皮路灯',
  category: 'prop',
  desc: '木杆挑出弯铁臂，臂端挂一盏铁皮锥罩暖光灯，夜里透出暖黄光晕并在地上洒出光斑',
  params: {
    height:    { def: 4.2,  min: 2.6, max: 6.0, step: 0.1,  desc: '木杆高度（含灯的总高约 height + 0.1）' },
    arm:       { def: 0.95, min: 0.5, max: 1.6, step: 0.05, desc: '铁臂从杆身伸出的水平距离' },
    lampSize:  { def: 0.44, min: 0.3, max: 0.72, step: 0.02, desc: '灯罩口径，同时带动灯泡与笼骨尺寸' },
    glow:      { def: 0.7,  min: 0.0, max: 1.0, step: 0.05, desc: '空中光晕密度与地面光斑半径' },
    lit:       { def: 1,    min: 0,   max: 1,   step: 1,    desc: '0 = 熄灯（灯泡变暗铁球） / 1 = 点灯' },
    weathered: { def: 0.45, min: 0.0, max: 1.0, step: 0.05, desc: '铁件锈斑比例' },
  },
  collision: { type: 'cylinder', radius: 0.28, height: 4.2 },
  behavior: {
    default: [{ id: 'flicker', params: {} }],
    allow: ['flicker', 'sway'],
  },

  draw(ctx) {
    const P = ctx.params, S = ctx.seed;
    const X = ctx.x, Y = ctx.y;
    const H = P.height, ARM = P.arm, LS = P.lampSize;
    const WOOD5 = [
      [72, 52, 34], [84, 60, 38], [96, 68, 44], [108, 76, 50], [120, 86, 58],
    ];
    const IRON5 = [
      [58, 62, 72], [74, 78, 90], [92, 98, 106], [112, 116, 124], [132, 136, 142],
    ];
    const RUST5 = [
      [96, 58, 36], [112, 68, 42], [128, 78, 48], [144, 88, 54], [158, 98, 60],
    ];
    const WARM_MID = [214, 168, 80], WARM_HI = [252, 202, 106], CORE = [255, 246, 214];
    const SEAT = [98, 96, 92];
    const warmRamp = ctx.rampOf([255, 190, 92]);
    const pick = (k, n) => ctx.clamp(Math.floor(ctx.hash(k, S) * n), 0, n - 1);
    const poleR = (z) => 0.15 + (0.10 - 0.15) * ctx.clamp(z / H, 0, 1);
    const ironOf = (t) => {
      const w = ctx.hash(Math.round(t * 11) + 3, S);
      return w > 0.86 - P.weathered * 0.18 ? RUST5[2 + pick(9, 2)] : IRON5[2 + pick(4, 2)];
    };

    ctx.box(X - 0.28, Y - 0.28, 0, X + 0.28, Y + 0.28, 0.15, SEAT, S + 3);
    ctx.capsule([X, Y, 0.14], [X, Y, H], 0.15, 0.10, (t) => {
      const n = ctx.noise(t * 9 + ctx.hash(2, S) * 5, 2.5);
      return WOOD5[ctx.clamp(Math.floor(t * 3.2 + n * 1.7), 0, 4)];
    }, 'rough');
    for (let i = 0; i < 2; i++) {
      const bz = H * (0.38 + i * 0.34);
      const br = poleR(bz) + 0.015;
      ctx.capsule([X, Y, bz], [X, Y, bz + 0.06], br, br, ironOf, 'rough');
    }
    ctx.sphere(X, Y, H + 0.05, 0.09, IRON5[3], 'rough');

    const top = H - 0.10;
    const p0 = [X - 0.02, Y, top - 0.62];
    const p1 = [X + ARM * 0.46, Y, top];
    const p2 = [X + ARM, Y, top - 0.04];
    ctx.capsule(p0, p1, 0.075, 0.065, ironOf, 'rough');
    ctx.capsule(p1, p2, 0.065, 0.055, ironOf, 'rough');
    ctx.capsule([X, Y, top - 1.35], [X + ARM * 0.50, Y, top - 0.10], 0.032, 0.026, ironOf, 'rough');

    const lx = X + ARM, lz = top - 0.04;
    const h = LS * 0.22;
    const w0 = LS * 0.30, w1 = LS * 0.42, w2 = LS * 0.52;
    ctx.box(lx - w0, Y - w0, lz, lx + w0, Y + w0, lz + h * 0.8, IRON5[4], S + 11);
    ctx.box(lx - w1, Y - w1, lz - h, lx + w1, Y + w1, lz, IRON5[3], S + 12);
    ctx.box(lx - w2, Y - w2, lz - h * 2, lx + w2, Y + w2, lz - h, IRON5[2], S + 13);

    const gy = lz - h * 2 - LS * 0.30;
    const gr = LS * 0.40;
    if (P.lit > 0.5) {
      /* emissive：灯泡与灯芯，保持固定暖色不受方向光影响 */
      ctx.sphere(lx, Y, gy, gr * 1.10, WARM_MID, 'gloss');
      ctx.sphere(lx, Y, gy, gr, WARM_HI, 'gloss');
      ctx.sphere(lx - gr * 0.20, Y - gr * 0.16, gy + gr * 0.20, gr * 0.5, CORE, 'gloss');
    } else {
      ctx.sphere(lx, Y, gy, gr, IRON5[1], 'rough');
    }

    const cageBot = gy - gr * 0.80;
    for (let k = 0; k < 4; k++) {
      const a = Math.PI * 0.25 + k * Math.PI * 0.5;
      const cx = lx + Math.cos(a) * LS * 0.34;
      const cy = Y + Math.sin(a) * LS * 0.34;
      ctx.capsule([cx, cy, lz - h * 2], [cx * 0.94 + lx * 0.06, cy * 0.94, cageBot],
                  0.024, 0.022, ironOf, 'rough');
    }
    ctx.sphere(lx, Y, cageBot - 0.03, 0.05, IRON5[3], 'rough');

    ctx.shadow(0.45 + ARM * 0.4, 1, 0.5);

    if (P.lit > 0.5 && P.glow > 0.02) {
      /* emissive：空中光晕 + 地面光斑，是光源本身，不参与方向光 */
      const n = 16 + Math.round(P.glow * 20);
      for (let i = 0; i < n; i++) {
        const a = ctx.hash(i * 3 + 1, S) * 6.2832;
        const e = (ctx.hash(i * 3 + 2, S) - 0.5) * 2.4;
        const rr = LS * (0.7 + ctx.hash(i * 3 + 3, S) * 1.6) * (0.55 + P.glow * 0.8);
        const b = 1 - rr / (LS * (1.9 + P.glow * 1.6));
        if (b <= 0.08) continue;
        ctx.plot(lx + Math.cos(a) * Math.cos(e) * rr, Y + Math.sin(a) * Math.cos(e) * rr,
                 gy + Math.sin(e) * rr, warmRamp[ctx.clamp(Math.round(b * 4.2), 0, 4)]);
      }
      const R = 0.8 + P.glow * 1.2;
      for (let ri = 1; ri <= 7; ri++) {
        const rr = R * (ri / 7);
        const cnt = 6 + ri * 5;
        const b = 1 - (ri / 7) * 0.88;
        for (let k = 0; k < cnt; k++) {
          if (ctx.hash(ri * 31 + k, S + 5) > 0.25 + (1 - b) * 0.55) continue;
          const ang = (k / cnt) * 6.2832 + ctx.hash(ri * 13, S) * 6.2832;
          const j = 0.86 + ctx.hash(ri * 23 + k, S) * 0.26;
          ctx.plot(lx + Math.cos(ang) * rr * j, Y + Math.sin(ang) * rr * j, 0.03,
                   warmRamp[ctx.clamp(Math.round(b * 5.2) - 1, 0, 4)]);
        }
      }
    }
  },
});

/* ---- 路灯 · lamp ---- */
KIT.register({
  id: 'lamp',
  name: '路灯',
  category: 'prop',
  desc: '直杆顶一颗球形灯罩的铸铁路灯，可点亮',
  params: {
    height: { def: 3.6, min: 2.5, max: 5, step: 0.1, desc: '杆高（世界单位，1 ≈ 人高）' },
    headR: { def: 0.32, min: 0.2, max: 0.5, step: 0.01, desc: '灯罩半径' },
    lit: { def: 1, min: 0, max: 1, step: 1, desc: '是否点亮（1 亮 / 0 灭）' },
    base: { def: 0.34, min: 0, max: 0.6, step: 0.02, desc: '底座半径，0 为无底座' },
  },
  collision: { type: 'cylinder', radius: 0.24, height: 4 },
  behavior: {
    default: [{ id: 'flicker', params: {} }],
    allow: ['flicker', 'sway'],
  },
  draw(ctx, inst) {
    const X = ctx.x, Y = ctx.y;
    const H = ctx.params.height, HR = ctx.params.headR, BASE = ctx.params.base;
    const lit = ctx.params.lit >= 0.5;

    const IRON_D = [54, 56, 64], IRON = [76, 80, 90], IRON_L = [96, 102, 114];
    const GLASS_OFF = [198, 206, 214], GLASS_LIT = [250, 224, 168];
    const GLOW_HI = [255, 244, 200], GLOW_LO = [238, 176, 96];

    if (BASE > 0.005) {
      const cz = BASE * 0.32;
      ctx.sphere(X, Y, cz, BASE, IRON_D, 'solid');
      ctx.sphere(X, Y, cz + BASE * 0.52, BASE * 0.62, IRON, 'solid');
    }

    const rodBottom = BASE > 0.005 ? BASE * 0.6 : 0.02;
    ctx.capsule(
      [X, Y, rodBottom], [X, Y, H], 0.06, 0.05,
      (z) => (z > H * 0.55 ? IRON_L : IRON), 'rough'
    );

    const headZ = H + HR * 0.62;
    /* emissive：灯罩点亮时自发光，熄灭时才是受光的玻璃球 */
    ctx.sphere(X, Y, headZ, HR, lit ? GLASS_LIT : GLASS_OFF, lit ? 'gloss' : 'solid');

    if (lit) {
      /* emissive：灯罩外的光点 */
      const N = 24;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2 + ctx.hash(i * 5 + 1, ctx.seed) * 0.35;
        const t = ctx.hash(i * 11 + 3, ctx.seed);
        const near = i % 2 === 0;
        const rr = HR * (near ? 1.1 + t * 0.35 : 1.55 + t * 0.55);
        const px = X + Math.cos(a) * rr, py = Y + Math.sin(a) * rr;
        const pz = headZ - HR * (near ? 0.55 + t * 0.6 : 1.1 + t * 0.9);
        const c = near ? GLOW_HI : GLOW_LO;
        ctx.plot(px, py, pz, ctx.rgb(c[0], c[1], c[2]));
      }
    }

    ctx.shadow(Math.max(0.45, HR * 1.7), 1, 0.5);
  },
});

/* ---- 路牌 · sign ---- */
KIT.register({
  id: 'sign',
  name: '路牌',
  category: 'prop',
  desc: '细杆撑起的矩形木牌，正面朝向相机',
  params: {
    height: { def: 1.8, min: 1.2, max: 2.5, step: 0.1, desc: '杆高' },
    boardW: { def: 1.1, min: 0.6, max: 1.8, step: 0.1, desc: '牌面宽' },
    boardH: { def: 0.5, min: 0.3, max: 0.8, step: 0.05, desc: '牌面高' },
    text: { def: 1, min: 0, max: 1, step: 1, desc: '牌面是否有文字（1 = 有横线示意）' },
  },
  collision: { type: 'cylinder', radius: 0.18, height: 2.2 },
  draw(ctx, inst) {
    const P = ctx.params;
    const H = P.height, W = P.boardW, BH = P.boardH;
    const X = ctx.x, Y = ctx.y;

    const POLE_LO = [92, 74, 56], POLE_HI = [122, 100, 78];
    ctx.capsule([X, Y, 0], [X, Y, H + BH * 0.5], 0.075, 0.055,
      z => z > H * 0.6 ? POLE_HI : POLE_LO, 'rough');

    const cz = H + BH * 0.5 - BH * 0.18, cy = Y + 0.09;
    const BOARD = [70, 58, 44], BOARD_TOP = [86, 72, 54];
    const TRIM = [148, 126, 92], TEXT = [222, 210, 182], EDGE = [104, 88, 66];
    /* 牌面是朝 +y 的平面：整面按正面法线取档；顶部一档亮是木牌的固有分色 */
    const boardRamp = ctx.rampOf(BOARD), boardTopRamp = ctx.rampOf(BOARD_TOP);
    const lvY = Math.round(ctx.lit(0, 1, 0));

    const x0 = -W * 0.5, x1 = W * 0.5;
    const z0 = cz - BH * 0.5, z1 = cz + BH * 0.5;
    const stepX = 0.055, stepZ = 0.05;

    for (let sx = x0; sx <= x1 + 1e-6; sx += stepX) {
      for (let sz = z0; sz <= z1 + 1e-6; sz += stepZ) {
        const t = (sz - z0) / BH;
        const shade = t > 0.82 ? boardTopRamp : boardRamp;
        ctx.plot(X + sx, cy, cz + (sz - cz), shade[lvY]);
      }
    }
    for (let sx = x0; sx <= x1 + 1e-6; sx += stepX) {
      ctx.plot(X + sx, cy, z0, ctx.rgb(TRIM[0], TRIM[1], TRIM[2]));
      ctx.plot(X + sx, cy, z1, ctx.rgb(TRIM[0], TRIM[1], TRIM[2]));
    }
    for (let sz = z0; sz <= z1 + 1e-6; sz += stepZ) {
      ctx.plot(X + x0, cy, sz, ctx.rgb(TRIM[0], TRIM[1], TRIM[2]));
      ctx.plot(X + x1, cy, sz, ctx.rgb(TRIM[0], TRIM[1], TRIM[2]));
    }

    if (P.text >= 0.5) {
      const lines = BH > 0.52 ? 3 : 2;
      const margin = W * 0.16, usable = W - margin * 2;
      for (let i = 0; i < lines; i++) {
        const lz = z0 + BH * (0.26 + i * (0.48 / Math.max(1, lines - 1)));
        const lw = usable * (0.55 + ctx.hash(i * 7 + 1, ctx.seed) * 0.4);
        for (let sx = -lw * 0.5; sx <= lw * 0.5 + 1e-6; sx += stepX * 0.7) {
          ctx.plot(X + sx, cy + 0.001, lz, ctx.rgb(TEXT[0], TEXT[1], TEXT[2]));
        }
      }
    }

    for (let sx = x0; sx <= x1 + 1e-6; sx += stepX)
      ctx.plot(X + sx, cy - 0.01, z1 + 0.03, ctx.rgb(EDGE[0], EDGE[1], EDGE[2]));
    for (let sz = z0; sz <= z1 + 1e-6; sz += stepZ)
      ctx.plot(X + x1 + 0.02, cy - 0.01, sz, ctx.rgb(EDGE[0], EDGE[1], EDGE[2]));

    ctx.sphere(X, Y, 0.06, 0.15, [104, 98, 88], 'rough');
    ctx.shadow(0.42, 1, 0.5);
  },
});

/* ---- 甲壳虫出租车 · beetle-taxi ---- */
KIT.register({
  id: 'beetle-taxi',
  name: '甲壳虫出租车',
  category: 'prop',
  desc: '圆润的明黄色经典甲壳虫出租车：深色环形车窗、黑色圆轮胎、镀铬腰线，车顶顶一颗蓝色小警灯',
  params: {
    beacon:    { def: 1, min: 0,    max: 1.6,  step: 0.1,  desc: '车顶蓝色警灯的大小倍率，0 为不装' },
    dome:      { def: 1, min: 0.7,  max: 1.4,  step: 0.05, desc: '车顶圆弧的高矮' },
    wheelbase: { def: 1, min: 0.75, max: 1.25, step: 0.05, desc: '前后轴距缩放' },
    trim:      { def: 1, min: 0,    max: 1,    step: 1,    desc: '是否画镀铬腰线与前后保险杠' },
  },
  collision: { type: 'box', w: 3.0, d: 1.8, h: 1.6 },
  draw(ctx, inst) {
    const P = ctx.params;
    const x = ctx.x, y = ctx.y, z = ctx.z;

    // 明黄车漆三档 + 深色玻璃两档，同族每个通道差都压在 25 以内，抖动不出棋盘格
    const PAINT    = [226, 178, 52];
    const PAINT_HI = [244, 200, 76];
    const PAINT_LO = [202, 156, 44];
    const GLASS    = [56, 68, 84];
    const GLASS_HI = [78, 90, 106];
    const TIRE     = [40, 40, 44];
    const HUB      = [176, 178, 184];
    const CHROME   = [214, 210, 194];
    const LAMP     = [250, 240, 200];
    const BEACON   = [72, 132, 214];

    const wb = P.wheelbase;
    // colorOf 收的是 z 坐标，按高度分三档做出顶光
    const paintAt = zz => (zz > z + 0.88 ? PAINT_HI : zz > z + 0.50 ? PAINT : PAINT_LO);
    const glassAt = zz => (zz > z + 1.24 ? GLASS_HI : GLASS);

    // 1 车身壳：四条沿 x 的胶囊并排，拼出 1.8 宽、上下分光的圆壳
    for (let i = 0; i < 4; i++) {
      const yy = y - 0.45 + i * 0.30;
      ctx.capsule([x - 1.04, yy, z + 0.68], [x + 1.04, yy, z + 0.68], 0.45, 0.45, paintAt, 'gloss');
    }

    // 2 四角翼子板：球把方角补成圆弧，同时把车头车尾鼓起来
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        ctx.sphere(x + sx * 0.90 * wb, y + sy * 0.46, z + 0.60, 0.43,
                   sy > 0 ? PAINT : PAINT_LO, 'gloss');
      }
    }

    // 3 车窗环带：窄而高，从车壳顶上冒出来，侧面自然露出一整圈深色玻璃
    for (let i = 0; i < 3; i++) {
      const yy = y - 0.28 + i * 0.28;
      ctx.capsule([x - 0.72, yy, z + 1.14], [x + 0.66, yy, z + 1.14], 0.26, 0.26, glassAt, 'gloss');
    }

    // 4 B 柱：一根窄黄柱压在玻璃外侧，把前后侧窗断开
    ctx.box(x - 0.05, y - 0.58, z + 1.06, x + 0.05, y + 0.58, z + 1.40, PAINT, ctx.seed + 1);

    // 5 车顶盖：更窄的黄色拱顶压住玻璃中段，两侧各留一条侧窗
    const rr = 0.15 * P.dome;
    const cZ = z + 1.32 + (P.dome - 1) * 0.10;
    for (let i = 0; i < 3; i++) {
      const yy = y - 0.15 + i * 0.15;
      ctx.capsule([x - 0.56, yy, cZ], [x + 0.50, yy, cZ], rr, rr,
                  zz => (zz > cZ ? PAINT_HI : PAINT), 'gloss');
    }

    // 6 车顶蓝色警灯（镀铬底座 + 蓝球），位置跟着车顶最高点走
    if (P.beacon > 0.05) {
      const br = 0.10 * P.beacon;
      const topZ = cZ + rr;
      ctx.capsule([x + 0.16, y - 0.09, topZ - 0.02], [x + 0.16, y + 0.09, topZ - 0.02],
                  0.055, 0.055, () => CHROME, 'solid');
      ctx.sphere(x + 0.16, y, topZ + br * 0.5, br, BEACON, 'gloss');
    }

    // 7 四个轮子：黑球做胎（外沿压在车宽边界上），外侧贴一枚银轮毂盖
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const wx = x + sx * 0.90 * wb;
        ctx.sphere(wx, y + sy * 0.54, z + 0.35, 0.35, TIRE, 'rough');
        ctx.sphere(wx, y + sy * 0.79, z + 0.35, 0.12, HUB, 'gloss');
      }
    }

    // 8 圆形大灯：甲壳虫标志性的鼓包灯，压在翼子板前缘（emissive：车灯）
    for (const sy of [-1, 1]) {
      ctx.sphere(x + 1.22, y + sy * 0.44, z + 0.86, 0.15, LAMP, 'gloss');
    }

    // 9 镀铬腰线 + 前后保险杠
    if (P.trim > 0.5) {
      for (const sy of [-1, 1]) {
        ctx.capsule([x - 0.92, y + sy * 0.88, z + 0.66], [x + 0.92, y + sy * 0.88, z + 0.66],
                    0.055, 0.055, () => CHROME, 'solid');
      }
      ctx.box(x + 1.34, y - 0.40, z + 0.30, x + 1.48, y + 0.40, z + 0.46, CHROME, ctx.seed + 2);
      ctx.box(x - 1.48, y - 0.40, z + 0.30, x - 1.34, y + 0.40, z + 0.46, CHROME, ctx.seed + 3);
    }

    // 10 落地阴影
    ctx.shadow(1.65, 1, 0.5);
  },
});
