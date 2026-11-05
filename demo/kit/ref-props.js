'use strict';
/* ------------------------------------------------------------------
 * 构件库 · 参考项目道具（ref-props，上篇）
 *
 * 从 pixel-plays 已验证的场景里移植（配方卡见 docs/kit/ref-props.md）：
 *   ball          —— balote:412 / tie-break:536（gloss 球 + 双层影）
 *   bottle        —— balote:140（竖直胶囊，上细下粗）
 *   wicker-basket —— laundry:169（圆周扫掠 + weave 编织纹）
 *   cloth         —— laundry:233（轮廓裁剪 + 波浪 + 斜挂）
 *   racket        —— tie-break:499（柄 + 拍面 + 网线）
 *
 * 颜色分两张皮（铁律 1）：
 *   RP_* 基色数组只喂 ctx.sphere / capsule / box；
 *   ctx.rgb(...) / ctx.rampOf(...) 的打包值只喂 ctx.plot。
 * ------------------------------------------------------------------ */

const RP_BALL_COLORS = [
  [216, 236, 72],   // 网球黄绿
  [176, 58, 44],    // 砖红
  [42, 76, 112],    // 深海蓝
  [232, 200, 62],   // 芥末黄
  [242, 238, 222],  // 米白
  [226, 120, 48],   // 橙
];

const RP_GLASS_SETS = [
  [68, 110, 76],    // 墨绿玻璃
  [150, 92, 44],    // 琥珀
  [70, 96, 140],    // 蓝玻璃
  [196, 206, 200],  // 乳白
];
const RP_CORK = [168, 132, 84];

const RP_WICKER_SETS = [
  [156, 112, 62],   // 藤黄
  [122, 84, 50],    // 深棕
  [142, 140, 128],  // 灰柳
];

const RP_CLOTHS = [
  [246, 244, 234],  // 米白
  [238, 118, 96],   // 珊瑚
  [92, 148, 176],   // 湖蓝
  [246, 204, 92],   // 柠檬黄
  [226, 150, 176],  // 藕粉
  [124, 170, 124],  // 草绿
  [72, 88, 136],    // 靛蓝
];

const RP_RACKET_FACE = [
  [58, 62, 66],     // 深灰拍面
  [46, 58, 80],     // 蓝黑
  [54, 46, 42],     // 棕黑
  [64, 68, 62],     // 墨绿
];
const RP_RACKET_FRAME = [
  [150, 42, 34],    // 红框
  [24, 36, 56],     // 蓝框
  [44, 40, 38],     // 黑框
  [150, 108, 62],   // 木框
];
const RP_GRIP = [52, 46, 40];
const RP_STRING = [230, 226, 210];
const RP_CLOTH_LINE = [96, 74, 50];

/* 按整数索引取色，越界夹回（参数滑块不会给出非法下标） */
function rpPick(list, i) {
  return list[Math.max(0, Math.min(list.length - 1, Math.round(i)))];
}

/* 织物轮廓裁剪：u 横向（-w/2..w/2），v 向下（0..h）
 * 照抄 laundry:226-232，5 种轮廓共用一个数学函数。 */
function rpClothInside(kind, u, v, w, h) {
  const a = Math.abs(u), k = Math.round(kind);
  if (k === 2) return a < w * .32 || v < h * .34 + (a - w * .32) * -.3;  // 衬衫
  if (k === 3) return v < h * .34 || a > .06;                              // 裤子
  if (k === 4) return v < h * .62 ? a < w * .3 : u > -w * .3;             // 袜子
  return true;                                                             // 床单 / 毛巾
}

/* ================= 1. ball 球（balote:412 / tie-break:536） ================= */
KIT.register({
  id: 'ball',
  name: '球',
  category: 'prop',
  desc: '球面光照的小球，贴地摆放，可以带一圈网球缝线',
  params: {
    r:     { def: .45, min: .15, max: 1.2, step: .01, desc: '球半径' },
    color: { def: 0, min: 0, max: 5, step: 1, desc: '配色索引：0 网球黄绿 / 1 红 / 2 蓝 / 3 芥末黄 / 4 白 / 5 橙' },
    seam:  { def: 1, min: 0, max: 1, step: 1, desc: '是否画网球缝线（1 有 / 0 无）' },
  },
  collision: { type: 'cylinder', radius: .45, height: .9 },
  behavior: { default: [], allow: ['bob', 'spin'] },

  draw(ctx) {
    const P = ctx.params, X = ctx.x, Y = ctx.y, Z = ctx.z || 0;
    const R = P.r;
    ctx.sphere(X, Y, Z + R, R, rpPick(RP_BALL_COLORS, P.color), 'gloss');

    /* 缝线 = 球面上的大圆。半径放大 1.5%：贴面画会被球体自身深度挡掉，
       放大后只多出 0.1px，肉眼仍是贴在球面上的线。 */
    if (P.seam >= .5 && R > .16) {
      const rr = R * 1.015, ink = ctx.rgb(246, 244, 228);
      for (let a = 0; a < 6.2832; a += .09) {
        const c = Math.cos(a), s = Math.sin(a);
        ctx.plot(X + c * rr * .85, Y + s * rr, Z + R + c * rr * .53, ink);
      }
    }

    /* 双层影：投影用球底高度，贴地时再加一层深接触影（props.md §1.2） */
    ctx.shadowAt(X, Y, Z, R * 1.15, 1, .5);
    if (Z < .1) ctx.shadowAt(X, Y, Z, R * .72, 2, 0);
  },
});

/* ================= 2. bottle 瓶（balote:140） ================= */
KIT.register({
  id: 'bottle',
  name: '瓶',
  category: 'prop',
  desc: '上细下粗的细颈瓶，瓶身、瓶肩、瓶颈和瓶口由四段胶囊接成',
  params: {
    r0:     { def: .3, min: .08, max: .5, step: .01, desc: '瓶身半径（下粗）' },
    r1:     { def: .1, min: .03, max: .3, step: .01, desc: '瓶颈半径（上细）' },
    height: { def: 1.35, min: .3, max: 2, step: .05, desc: '瓶高' },
    color:  { def: 0, min: 0, max: 3, step: 1, desc: '玻璃色：0 墨绿 / 1 琥珀 / 2 蓝 / 3 乳白' },
    cork:   { def: 1, min: 0, max: 1, step: 1, desc: '是否带软木塞' },
  },
  collision: { type: 'cylinder', radius: .3, height: 1.35 },

  draw(ctx) {
    const P = ctx.params, X = ctx.x, Y = ctx.y, Z = ctx.z || 0;
    const R0 = P.r0, R1 = P.r1, H = P.height;
    const glass = rpPick(RP_GLASS_SETS, P.color);
    const bodyTop = Z + H * .62, shoulderTop = Z + H * .76, neckTop = Z + H * .93;

    ctx.capsule([X, Y, Z + R0], [X, Y, bodyTop], R0, R0, () => glass, 'gloss');
    ctx.capsule([X, Y, bodyTop - .02], [X, Y, shoulderTop], R0, R1, () => glass, 'gloss');
    ctx.capsule([X, Y, shoulderTop], [X, Y, neckTop], R1, R1, () => glass, 'gloss');
    /* 瓶口比瓶颈略粗一圈 —— 这一圈就是"瓶"读得出来的关键 */
    ctx.capsule([X, Y, neckTop], [X, Y, Z + H], R1 * 1.3, R1 * 1.1, () => glass, 'gloss');

    if (P.cork >= .5) {
      ctx.capsule([X, Y, Z + H - .01], [X, Y, Z + H + R1 * .75], R1 * .95, R1 * .8,
        () => RP_CORK, 'rough');
    }

    ctx.shadowAt(X, Y, Z, R0 * 1.55, 1, .5);
    ctx.shadowAt(X, Y, Z, R0 * .8, 2, 0);
  },
});

/* ================= 3. wicker-basket 藤篮（laundry:169） ================= */
KIT.register({
  id: 'wicker-basket',
  name: '藤篮',
  category: 'prop',
  desc: '圆周扫掠的编织圆篮，横竖两组条纹交错出藤编纹，篮口有包边',
  params: {
    r:      { def: .6, min: .2, max: 1.4, step: .05, desc: '篮口半径' },
    h:      { def: .75, min: .25, max: 1.6, step: .05, desc: '篮深' },
    color:  { def: 0, min: 0, max: 2, step: 1, desc: '藤色：0 藤黄 / 1 深棕 / 2 灰柳' },
    handle: { def: 0, min: 0, max: 1, step: 1, desc: '是否加一根跨篮提手' },
  },
  collision: { type: 'cylinder', radius: .6, height: .75 },

  draw(ctx) {
    const P = ctx.params, X = ctx.x, Y = ctx.y, Z = ctx.z || 0;
    const R = P.r, H = P.h;
    const base = rpPick(RP_WICKER_SETS, P.color);
    const ramp = ctx.rampOf(base);
    const dark = ctx.rampOf([92, 62, 34]);

    /* 篮底：靠近侧先铺一层暗色，篮壁从 z=0 起扫掠 */
    for (let a = 0; a < 6.2832; a += .05) {
      for (let q = 0; q <= R; q += .05) {
        ctx.plot(X + Math.cos(a) * q, Y + Math.sin(a) * q, Z + .015, dark[1]);
      }
    }

    /* 编织纹：z 方向 6 档 × 周向 7 档，两组条纹交错（props.md §4.1） */
    for (let t = 0; t < 6.2832; t += .02) {
      const nx = Math.cos(t), ny = Math.sin(t), band = Math.floor(t * 7);
      for (let z = 0; z <= H; z += .045) {
        const weave = (Math.floor(z / H * 6) + band) % 2;
        let lv = Math.round(2.6 - .5 * nx + .85 * ny) + weave - 1;
        if (z > H - .08) lv += 1;              // 篮口包边提亮
        ctx.plot(X + nx * R, Y + ny * R, Z + z, ramp[ctx.clamp(lv, 0, 4)]);
      }
    }

    /* 篮口包边：外圈 + 内圈两道，篮子才有厚度 */
    for (let t = 0; t < 6.2832; t += .015) {
      const nx = Math.cos(t), ny = Math.sin(t);
      const lv = ctx.clamp(Math.round(2.7 - .5 * nx + .85 * ny) + 1, 0, 4);
      ctx.plot(X + nx * R, Y + ny * R, Z + H + .015, ramp[lv]);
      ctx.plot(X + nx * (R - .045), Y + ny * (R - .045), Z + H + .03, dark[2]);
    }

    /* 提手：横向半圆弧，由 10 段胶囊拼成（capsule 只能画直线段） */
    if (P.handle >= .5) {
      const hr = R * .82, rise = R * .75;
      for (let i = 0; i < 10; i++) {
        const a0 = Math.PI * i / 10, a1 = Math.PI * (i + 1) / 10;
        ctx.capsule(
          [X - Math.cos(a0) * hr, Y, Z + H + Math.sin(a0) * rise],
          [X - Math.cos(a1) * hr, Y, Z + H + Math.sin(a1) * rise],
          .06, .06, () => base, 'rough');
      }
    }

    ctx.shadowAt(X, Y, Z, R * 1.2, 1, .5);
  },
});

/* ================= 4. cloth 织物（laundry:233） ================= */
KIT.register({
  id: 'cloth',
  name: '织物',
  category: 'prop',
  desc: '挂在绳上的布：轮廓按种类裁剪，下摆带波浪，可整片斜挂',
  params: {
    w:      { def: 1.6, min: .4, max: 3, step: .1, desc: '布宽' },
    h:      { def: 1.6, min: .3, max: 3, step: .1, desc: '垂下的长度' },
    kind:   { def: 0, min: 0, max: 4, step: 1, desc: '种类：0 床单 / 1 毛巾 / 2 衬衫 / 3 裤子 / 4 袜子' },
    color:  { def: 1, min: 0, max: 6, step: 1, desc: '布色索引（7 色）' },
    stripe: { def: 0, min: 0, max: 1, step: 1, desc: '是否加条纹（1 有 / 0 无）' },
    tilt:   { def: 12, min: 0, max: 80, step: 2, desc: '斜挂角度（度，下摆向 +x 偏）' },
    top:    { def: 1.75, min: .3, max: 3, step: .05, desc: '挂绳离地高度' },
  },
  collision: { type: 'box', w: 1.6, d: .25, h: 1.75 },
  behavior: { default: [], allow: ['sway', 'shake'] },

  draw(ctx) {
    const P = ctx.params, X = ctx.x, Y = ctx.y, Z = ctx.z || 0;
    const W = P.w, H = P.h, kind = Math.round(P.kind);
    const T = P.tilt * Math.PI / 180, cosT = Math.cos(T), sinT = Math.sin(T);
    const ci = Math.round(P.color);
    const ramp = ctx.rampOf(rpPick(RP_CLOTHS, ci));
    const alt = ctx.rampOf(rpPick(RP_CLOTHS, ci + 3));
    const topZ = Z + P.top;
    const phase = ctx.hash(1, ctx.seed) * 6.2832;
    const step = .055;

    /* 挂绳：略微下垂的细线，两端比中间高（抛物线垂弧，props.md §5.5） */
    const rope = ctx.rgb(RP_CLOTH_LINE[0], RP_CLOTH_LINE[1], RP_CLOTH_LINE[2]);
    for (let u = -W * .55; u <= W * .55; u += .04) {
      const sag = .035 * (1 - (u / (W * .55 + 1e-6)) ** 2);
      ctx.plot(X + u, Y, topZ - sag, rope);
    }

    for (let u = -W / 2; u <= W / 2 + 1e-6; u += step) {
      for (let v = 0; v <= H + 1e-6; v += step) {
        if (!rpClothInside(kind, u, v, W, H)) continue;
        const wave = u * 3.2 + v * 1.2 + phase;
        const s = Math.sin(wave), c = Math.cos(wave);
        /* 顶端固定、越往下摆幅越大（reach） */
        const reach = v / Math.max(.001, H) + .12;
        const px = X + u + v * sinT;
        const py = Y + s * .08 * reach;
        const pz = Math.max(Z + .03, topZ - v * cosT);
        const lv = ctx.clamp(3 + Math.round(c * 1.1), 0, 4);
        const striped = P.stripe >= .5 && Math.floor((kind === 0 ? u * 2.4 : v * 5) + 40) % 2;
        ctx.plot(px, py, pz, (striped ? alt : ramp)[lv]);
      }
    }

    /* 两只衣夹：给"挂在绳上"一个落点（laundry:267） */
    const peg = ctx.rgb(120, 92, 62);
    for (const k of [-.42, .42]) {
      ctx.plot(X + k * W, Y + .04, topZ + .06, peg);
      ctx.plot(X + k * W, Y + .04, topZ + .14, peg);
    }

    ctx.shadowAt(X + sinT * H * .5, Y, Z, Math.max(.25, W * .34), .8, .5);
  },
});

/* ================= 5. racket 球拍（tie-break:499） ================= */
KIT.register({
  id: 'racket',
  name: '球拍',
  category: 'prop',
  desc: '平放在地上的球拍：椭圆拍面 + 网格拍线 + 一段柄和握把',
  params: {
    len:     { def: 1.25, min: .5, max: 2.2, step: .05, desc: '拍柄长度' },
    faceR:   { def: .55, min: .18, max: .95, step: .01, desc: '拍面半径' },
    strings: { def: 1, min: 0, max: 1, step: 1, desc: '是否画拍线网' },
    color:   { def: 0, min: 0, max: 3, step: 1, desc: '配色：0 红框 / 1 蓝框 / 2 黑框 / 3 木框' },
  },
  collision: { type: 'box', w: 2.35, d: 1.1, h: .2 },

  draw(ctx) {
    const P = ctx.params, X = ctx.x, Y = ctx.y, Z = ctx.z || 0;
    const R = P.faceR, L = P.len;
    const cxF = X - L * .35;                 // 拍面中心
    const zf = Z + .055;                     // 平放时略高于地面
    const frameBase = rpPick(RP_RACKET_FRAME, P.color);
    const faceRamp = ctx.rampOf(rpPick(RP_RACKET_FACE, P.color));
    const frameRamp = ctx.rampOf(frameBase);
    const stringInk = ctx.rgb(RP_STRING[0], RP_STRING[1], RP_STRING[2]);

    /* 1. 拍面：填满椭圆，外圈 R*.09 是拍框；内部深色衬底让拍线跳出来 */
    const rimW = Math.max(.035, R * .09);
    const step = Math.max(.03, R / 14);
    for (let u = -R; u <= R + 1e-6; u += step) {
      for (let v = -R; v <= R + 1e-6; v += step) {
        const d2 = u * u + v * v;
        if (d2 > R * R) continue;
        const edge = R - Math.sqrt(d2);
        let c;
        if (edge < rimW) {
          const lv = ctx.clamp(3 + Math.round((-u * .45 + v * .7) / Math.max(.001, R) * 1.2), 1, 4);
          c = frameRamp[lv];
        } else {
          c = faceRamp[ctx.clamp(2 + Math.round(v / Math.max(.001, R)), 1, 3)];
        }
        ctx.plot(cxF + u, Y + v, zf, c);
      }
    }

    /* 2. 拍线：两个方向各若干条，抬 z .002 避免与拍面同深度被拒 */
    if (P.strings >= .5) {
      const gap = Math.max(.09, R * .23);
      for (let u = -R + gap * .5; u < R; u += gap) {
        if (Math.abs(u) > R - rimW) continue;
        const half = Math.sqrt(R * R - u * u);
        for (let v = -half + .02; v <= half - .02; v += .035) {
          ctx.plot(cxF + u, Y + v, zf + .002, stringInk);
        }
      }
      for (let v = -R + gap * .5; v < R; v += gap) {
        if (Math.abs(v) > R - rimW) continue;
        const half = Math.sqrt(R * R - v * v);
        for (let u = -half + .02; u <= half - .02; u += .035) {
          ctx.plot(cxF + u, Y + v, zf + .002, stringInk);
        }
      }
    }

    /* 3. 拍喉 + 柄 + 握把：柄从拍面边缘伸到 +x */
    const shaftR = .05 + R * .06;
    const neckY = Y;
    const shaft0 = [cxF + R * .82, neckY, zf + .01];
    const shaft1 = [X + L * .65, neckY, zf + .02];
    for (const sy of [-1, 1]) {
      ctx.capsule([cxF + R * .6, neckY + sy * R * .38, zf + .01],
        shaft0, .04, .04, () => frameBase, 'rough');
    }
    ctx.capsule(shaft0, shaft1, shaftR, shaftR, () => frameBase, 'rough');

    const grip0 = [X + L * .12, neckY, zf + .022];
    const grip1 = [X + L * .66, neckY, zf + .02];
    ctx.capsule(grip0, grip1, shaftR * 1.12, shaftR * 1.05, () => RP_GRIP, 'rough');

    ctx.shadowAt(cxF + L * .12, Y, Z, (L + R) * .42, .85, .5);
  },
});
