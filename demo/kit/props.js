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
    const w = .17;
    for (let a = ctx.x - w * 1.5; a <= ctx.x + w * 1.5; a += .05)
      for (let b = ctx.y - w * 1.5; b <= ctx.y + w * 1.5; b += .05)
        ctx.plot(a, b, .08, rampOf(stone)[2]);
    for (let a = ctx.x - w; a <= ctx.x + w; a += .05)
      for (let b = ctx.y - w; b <= ctx.y + w; b += .05)
        for (let z = .1; z <= h * .72; z += .05)
          ctx.plot(a, b, z, rampOf(stone)[2]);
    for (let a = ctx.x - w * 1.3; a <= ctx.x + w * 1.3; a += .05)
      for (let b = ctx.y - w * 1.3; b <= ctx.y + w * 1.3; b += .05)
        for (let z = h * .72; z <= h * .92; z += .05)
          ctx.plot(a, b, z, ctx.params.lit >= 1 ? rgb(255, 222, 130) : rampOf(stone)[3]);
    for (let a = ctx.x - w * 1.8; a <= ctx.x + w * 1.8; a += .05)
      for (let b = ctx.y - w * 1.8; b <= ctx.y + w * 1.8; b += .05)
        ctx.plot(a, b, h, rampOf(stone)[3]);
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
  draw(ctx, inst) {
    const s = ctx.params.size, h = ctx.params.height;
    const wood = [134, 100, 66];
    const x0 = ctx.x - s / 2, x1 = ctx.x + s / 2;
    const y0 = ctx.y - s / 2, y1 = ctx.y + s / 2;
    for (let a = x0; a <= x1; a += .04) for (let z = 0; z <= h; z += .04)
      ctx.plot(a, y1, z, rampOf(wood)[3 + (Math.floor(a * 5) % 2 ? 0 : -1)]);
    for (let a = y0; a <= y1; a += .04) for (let z = 0; z <= h; z += .04)
      ctx.plot(x1, a, z, rampOf(wood)[2 + (Math.floor(a * 5) % 2 ? 0 : -1)]);
    for (let a = x0; a <= x1; a += .04) for (let b = y0; b <= y1; b += .04)
      ctx.plot(a, b, h, rampOf(wood)[4]);
    for (let a = x0; a <= x1; a += .04) {
      ctx.plot(a, y1 + .01, h * .12, rampOf(KIT_WOOD_DARK)[2]);
      ctx.plot(a, y1 + .01, h * .86, rampOf(KIT_WOOD_DARK)[2]);
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
    ctx.sphere(X, Y, headZ, HR, lit ? GLASS_LIT : GLASS_OFF, lit ? 'gloss' : 'solid');

    if (lit) {
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

    const x0 = -W * 0.5, x1 = W * 0.5;
    const z0 = cz - BH * 0.5, z1 = cz + BH * 0.5;
    const stepX = 0.055, stepZ = 0.05;

    for (let sx = x0; sx <= x1 + 1e-6; sx += stepX) {
      for (let sz = z0; sz <= z1 + 1e-6; sz += stepZ) {
        const t = (sz - z0) / BH;
        const shade = t > 0.82 ? BOARD_TOP : BOARD;
        ctx.plot(X + sx, cy, cz + (sz - cz), ctx.rgb(shade[0], shade[1], shade[2]));
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
