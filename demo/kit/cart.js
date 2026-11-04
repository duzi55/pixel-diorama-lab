'use strict';
/* ------------------------------------------------------------------
 * 构件库 · 载具与推车（cart）
 *
 * 从 props.js 拆出（500 行约束）：轮式可移动物体。
 *   wheelbarrow —— 苹果手推车
 *   semi-truck  —— 经典卡车
 * ------------------------------------------------------------------ */

/* ---- 苹果手推车 · wheelbarrow ---- */
KIT.register({
  id: 'wheelbarrow',
  name: '苹果手推车',
  category: 'prop',
  desc: '木斗单轮手推车：梯形斗身、木轮、双把手双支腿，斗里堆满红苹果',
  params: {
    apples: { def: 10, min: 0, max: 16, step: 1, desc: '斗里的苹果数量（0 = 空车）' },
    length: { def: 1, min: 0.8, max: 1.35, step: 0.05, desc: '车斗前后长度倍率' },
    wheel: { def: 1, min: 0.7, max: 1.3, step: 0.05, desc: '前轮直径倍率' },
  },
  collision: { type: 'cylinder', radius: 0.9, height: 1.2 },

  draw(ctx, inst) {
    const p = ctx.params;
    const L = p.length;
    const WH = p.wheel;
    const X = ctx.x, Y = ctx.y, Z = ctx.z;

    // 木材三档 + 斗沿高光（同类色通道差 ≤ 25）
    const PLANK = [156, 110, 66];
    const PLANK_MID = [138, 96, 56];
    const PLANK_DK = [116, 78, 44];
    const RIM = [172, 126, 80];
    const WOOD_DK = [104, 76, 50];
    const WOOD_LT = [128, 96, 60];

    // 苹果三档
    const APPLE = [182, 50, 44];
    const APPLE_HI = [204, 72, 56];
    const APPLE_DK = [160, 36, 34];

    const hx0 = 0.36, hy0 = 0.63 * L;   // 斗底半宽 / 半长
    const hx1 = 0.47, hy1 = 0.70 * L;   // 斗顶半宽 / 半长
    const zBot = Z + 0.36, zTop = Z + 0.88;

    // 1) 斗身：五层逐层外扩的板条，堆出上宽下窄的梯形斗
    for (let i = 0; i < 5; i++) {
      const t = (i + 1) / 5;
      const hx = ctx.lerp(hx0, hx1, t);
      const hy = ctx.lerp(hy0, hy1, t);
      const z0 = ctx.lerp(zBot, zTop, i / 5);
      const z1 = ctx.lerp(zBot, zTop, (i + 1) / 5);
      const col = ctx.hash(i * 7 + 3, ctx.seed) > 0.45 ? PLANK : PLANK_MID;
      ctx.box(X - hx, Y - hy, z0, X + hx, Y + hy, z1, col, i + 11);
    }

    // 2) 斗内暗底：比斗沿低一点，苹果的落脚面
    ctx.box(X - hx1 + 0.06, Y - hy1 + 0.06, zTop - 0.03,
            X + hx1 - 0.06, Y + hy1 - 0.06, zTop + 0.02, PLANK_DK, 7);

    // 3) 斗沿：四根外扩压条围出斗口
    const rg0 = zTop + 0.01, rg1 = zTop + 0.075;
    const ox = hx1 + 0.03, oy = hy1 + 0.03;
    ctx.box(X - ox, Y + hy1 - 0.11, rg0, X + ox, Y + oy, rg1, RIM, 21);
    ctx.box(X - ox, Y - oy, rg0, X + ox, Y - hy1 + 0.11, rg1, RIM, 22);
    ctx.box(X - ox, Y - hy1 + 0.11, rg0, X - hx1 + 0.11, Y + hy1 - 0.11, rg1, RIM, 23);
    ctx.box(X + hx1 - 0.11, Y - hy1 + 0.11, rg0, X + ox, Y + hy1 - 0.11, rg1, RIM, 24);

    // 4) 苹果：12 个铺底 + 4 个压顶，i*5%12 置换让少量也散得开
    const n = Math.round(p.apples);
    for (let i = 0; i < n; i++) {
      let ax, ay, az;
      if (i < 12) {
        const idx = (i * 5) % 12;
        const c = idx % 3, r = (idx / 3) | 0;
        ax = (c - 1) * 0.25 + (ctx.hash(i * 5 + 1, ctx.seed) - 0.5) * 0.05;
        ay = (r - 1.5) * 0.32 * L + (ctx.hash(i * 5 + 2, ctx.seed) - 0.5) * 0.05;
        az = zTop + 0.17;
      } else {
        const k = i - 12;
        ax = (k % 2 === 0 ? -0.13 : 0.13);
        ay = (k < 2 ? -0.17 : 0.17) * L;
        az = zTop + 0.33;
      }
      const rr = 0.137 * (0.9 + ctx.hash(i + 70, ctx.seed) * 0.22);
      const tone = ctx.hash(i + 90, ctx.seed);
      ctx.sphere(X + ax, Y + ay, az, rr,
                 tone > 0.68 ? APPLE_HI : (tone > 0.22 ? APPLE : APPLE_DK), 'gloss');
    }

    // 5) 两条后支腿
    for (let side = -1; side <= 1; side += 2) {
      ctx.capsule([X + side * 0.27, Y - 0.46 * L, Z + 0.42],
                  [X + side * 0.32, Y - 0.60 * L, Z + 0.02],
                  0.042, 0.036, () => PLANK_MID, 'solid');
    }

    // 6) 轮叉：从斗底两侧向下夹住前轮
    for (let side = -1; side <= 1; side += 2) {
      ctx.capsule([X + side * 0.17, Y + 0.40 * L, Z + 0.46],
                  [X + side * 0.36, Y + 0.58 * L, Z + 0.30 * WH],
                  0.036, 0.030, () => PLANK_MID, 'solid');
    }

    // 7) 前轮：深木圆盘 + 偏右凸出的亮木轮心，读作同心圆
    const wR = 0.30 * WH;
    const ww = 0.05 * WH;
    const wy = Y + 0.58 * L;
    const wz = Z + wR;
    ctx.capsule([X - ww, wy, wz], [X + ww, wy, wz], wR, wR,
                () => WOOD_DK, 'solid');
    const hub = ww + wR * 0.28 + 0.02;
    ctx.capsule([X + hub - 0.02, wy, wz], [X + hub + 0.02, wy, wz],
                wR * 0.70, wR * 0.70, () => WOOD_LT, 'solid');

    // 8) 双把手 + 深色握把
    for (let side = -1; side <= 1; side += 2) {
      ctx.capsule([X + side * 0.45, Y - 0.58 * L, Z + 0.81],
                  [X + side * 0.49, Y - 1.20 * L, Z + 0.56],
                  0.048, 0.042, () => PLANK, 'rough');
      ctx.capsule([X + side * 0.49, Y - 1.20 * L, Z + 0.56],
                  [X + side * 0.49, Y - 1.33 * L, Z + 0.54],
                  0.056, 0.052, () => PLANK_DK, 'solid');
    }

    ctx.shadow(0.9 * L, 1, 0.5);
  },
});

/* ---- 经典卡车 · semi-truck ---- */
KIT.register({
  id: 'semi-truck',
  name: '经典卡车',
  category: 'prop',
  desc: '红蓝经典涂装的平头半挂卡车：红色驾驶室 + 银色格栅与双排气管 + 蓝色条纹集装箱',
  params: {
    trailer:   { def: 4.2, min: 3.0, max: 5.6, step: 0.2,  desc: '挂车箱长' },
    boxHeight: { def: 1.85, min: 1.4, max: 2.3, step: 0.05, desc: '挂车箱高' },
    stripes:   { def: 3,   min: 0,   max: 6,   step: 1,    desc: '挂车侧面银色横条数量' },
  },
  collision: { type: 'box', width: 2.1, depth: 6.9, height: 2.9 },

  draw(ctx, inst) {
    const P = ctx.params, S = ctx.seed, X = ctx.x, Y = ctx.y;
    const L = P.trailer, H = P.boxHeight;
    const total = L + 2.5;
    const yB = Y - total / 2;      // 车尾
    const yF = Y + total / 2;      // 车头最前（朝 +y，即相机方向）
    const yCab = yF - 1.85;        // 驾驶室后壁
    const yTrl = yB + L;           // 挂车前壁（与驾驶室恒留 0.65 间隙）

    // 基色一律 [r,g,b] 数组，只给 sphere/capsule/box 用
    const RED     = [170, 48, 44];
    const BLUE    = [44, 74, 148];
    const BLUE_D  = [32, 56, 118];
    const STEEL   = [178, 184, 192];
    const STEEL_D = [148, 154, 164];
    const GLASS   = [50, 72, 102];
    const DARK    = [50, 54, 60];
    const TIRE    = [36, 36, 40];
    const HUB     = [188, 194, 202];
    const LAMP    = [246, 228, 176];

    // ── 底盘纵梁：贯穿车头与挂车 ──
    ctx.box(X - 0.82, yB + 0.20, 0.42, X + 0.82, yF - 0.20, 0.66, DARK, S + 1);

    // ── 四轴八轮：前轴 / 牵引车后轴 / 挂车双联轴 ──
    const axles = [yF - 0.72, yCab - 0.18, yB + 0.95, yB + 1.72];
    for (let i = 0; i < axles.length; i++) {
      const ay = axles[i];
      for (let s = -1; s <= 1; s += 2) {
        ctx.sphere(X + s * 0.70, ay, 0.50, 0.50, TIRE, 'rough');
        // 轮毂球心必须比轮胎球心更靠外，否则会被轮胎整颗吞掉
        ctx.sphere(X + s * 0.96, ay, 0.50, 0.27, HUB, 'gloss');
      }
    }

    // ── 驾驶室主体 + 车顶银色压条 ──
    ctx.box(X - 0.92, yCab, 0.56, X + 0.92, yF, 2.34, RED, S + 2);
    ctx.box(X - 0.90, yCab + 0.08, 2.34, X + 0.90, yF - 0.06, 2.44, STEEL, S + 3);

    // ── 前挡风：左右两片，中间留红色分框 ──
    ctx.box(X - 0.76, yF - 0.03, 1.52, X - 0.06, yF + 0.05, 2.16, GLASS, S + 4);
    ctx.box(X + 0.06, yF - 0.03, 1.52, X + 0.76, yF + 0.05, 2.16, GLASS, S + 5);

    // ── 银色格栅 + 四道横条 ──
    ctx.box(X - 0.66, yF - 0.02, 0.80, X + 0.66, yF + 0.06, 1.42, STEEL, S + 6);
    for (let i = 0; i < 4; i++) {
      const gz = 0.90 + i * 0.13;
      ctx.box(X - 0.62, yF + 0.06, gz, X + 0.62, yF + 0.09, gz + 0.05, STEEL_D, S + 7 + i);
    }

    // ── 前大灯 ──
    ctx.sphere(X - 0.74, yF + 0.07, 0.98, 0.13, LAMP, 'gloss');
    ctx.sphere(X + 0.74, yF + 0.07, 0.98, 0.13, LAMP, 'gloss');

    // ── 前保险杠（略宽出车身） ──
    ctx.box(X - 0.98, yF + 0.02, 0.40, X + 0.98, yF + 0.17, 0.66, STEEL_D, S + 12);

    // ── 右侧车门侧窗（贴 +x 面，外移 0.05 防被墙吞） ──
    ctx.box(X + 0.92, yCab + 0.92, 1.60, X + 0.97, yF - 0.20, 2.12, GLASS, S + 13);

    // ── 双排气管：立在驾驶室后，高过车顶 ──
    const sy = yCab - 0.10;
    for (let s = -1; s <= 1; s += 2) {
      ctx.capsule([X + s * 0.94, sy, 0.68], [X + s * 0.94, sy, 2.88], 0.11, 0.09, () => STEEL, 'gloss');
    }

    // ── 右侧镀铬油箱 ──
    ctx.capsule([X + 0.97, yCab + 0.28, 0.84], [X + 0.97, yCab + 0.90, 0.84], 0.24, 0.24, () => STEEL, 'gloss');

    // ── 鞍座连接块：填住车头与挂车之间的缝 ──
    ctx.box(X - 0.55, yTrl, 0.50, X + 0.55, yCab, 0.74, DARK, S + 40);

    // ── 挂车箱体 + 顶包边 + 深蓝底边 ──
    ctx.box(X - 0.96, yB, 0.72, X + 0.96, yTrl, 0.72 + H, BLUE, S + 20);
    ctx.box(X - 0.99, yB - 0.03, 0.72 + H, X + 0.99, yTrl + 0.03, 0.82 + H, STEEL_D, S + 21);
    ctx.box(X - 0.97, yB + 0.02, 0.62, X + 0.97, yTrl - 0.02, 0.74, BLUE_D, S + 22);

    // ── 挂车侧面银色横条（贴 +x 面外移 0.05） ──
    const ns = Math.max(0, Math.round(P.stripes));
    for (let i = 0; i < ns; i++) {
      const sz = 0.88 + (H - 0.50) * (i + 0.5) / ns;
      ctx.box(X + 0.96, yB + 0.14, sz, X + 1.01, yTrl - 0.14, sz + 0.10, STEEL, S + 30 + i);
    }

    // ── 落地阴影 ──
    ctx.shadow(2.0, 1, 0.5);
  },
});
