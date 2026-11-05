'use strict';
/* ------------------------------------------------------------------
 * 构件库 · 参考项目道具（ref-props，下篇）
 *
 * 从 pixel-plays 已验证的场景里移植（配方卡见 docs/kit/ref-props.md）：
 *   cone        —— mini-ramp:201（锥形 + 按高度分色）
 *   bench       —— balote:134 / tie-break:160（座板 + 靠背 + 铁脚）
 *   awning      —— laundry:147（横杆）＋ 条纹布篷的参数化扫掠
 *   ball-basket  —— tie-break:168（筐 + 散落小球）
 *
 * 颜色分两张皮（铁律 1）：
 *   RPS_* 基色数组只喂 ctx.sphere / capsule / box；
 *   ctx.rgb(...) / ctx.rampOf(...) 的打包值只喂 ctx.plot。
 * ------------------------------------------------------------------ */

const RPS_CONE = [226, 96, 44];
const RPS_CONE_DARK = [150, 66, 34];
const RPS_CONE_BAND = [240, 236, 224];

const RPS_BENCH_SETS = [
  [[156, 112, 66], [132, 92, 54]],    // 暖木
  [[132, 92, 54], [104, 70, 42]],     // 深胡桃
  [[146, 138, 120], [120, 114, 100]], // 灰木
];
const RPS_BENCH_IRON = [60, 56, 54];

const RPS_AWNING_SETS = [
  [[188, 60, 44], [240, 234, 218]],   // 红白
  [[40, 72, 110], [232, 236, 226]],   // 蓝白
  [[62, 118, 92], [236, 232, 210]],   // 绿米
  [[214, 140, 42], [240, 232, 210]],  // 橙米
];
const RPS_AWNING_IRON = [78, 82, 86];
const RPS_AWNING_RAIL = [92, 76, 58];

const RPS_WIRE = [116, 122, 116];
const RPS_BASKET_FLOOR = [70, 64, 52];
const RPS_BALLS = [
  [216, 236, 72], [242, 238, 222], [226, 120, 48],
  [176, 58, 44], [42, 76, 112],
];

/* 按整数索引取色，越界夹回 */
function rpsPick(list, i) {
  return list[Math.max(0, Math.min(list.length - 1, Math.round(i)))];
}

/* ================= 6. cone 交通锥（mini-ramp:201） ================= */
KIT.register({
  id: 'cone',
  name: '交通锥',
  category: 'prop',
  desc: '橙红锥体 + 一圈白色反光带，底下压一块方形配重座',
  params: {
    r0:   { def: .42, min: .15, max: 1, step: .01, desc: '锥底半径' },
    r1:   { def: .05, min: .02, max: .2, step: .01, desc: '锥尖半径' },
    h:    { def: 1, min: .3, max: 2, step: .05, desc: '锥高（含底座）' },
    band: { def: 1, min: 0, max: 1, step: 1, desc: '是否画白色反光带' },
  },
  collision: { type: 'cylinder', radius: .42, height: 1 },

  draw(ctx) {
    const P = ctx.params, X = ctx.x, Y = ctx.y, Z = ctx.z || 0;
    const R0 = P.r0, R1 = P.r1, H = P.h;
    const orange = ctx.rampOf(RPS_CONE), white = ctx.rampOf(RPS_CONE_BAND);

    /* 方形配重座：比锥底略大一圈，影子才落得住 */
    ctx.box(X - R0 * 1.08, Y - R0 * 1.08, Z, X + R0 * 1.08, Y + R0 * 1.08, Z + .06,
      RPS_CONE_DARK, ctx.seed + 1);

    /* 锥面 = 一叠同轴圆环。逐环铺满一圈，侧面自然连成实心锥体 */
    const z0 = Math.max(.05, .06);
    for (let z = z0; z <= H + 1e-6; z += .035) {
      const f = ctx.clamp(z / Math.max(.001, H), 0, 1);
      const rz = ctx.lerp(R0, R1, f);
      const band = P.band >= .5 && z > H * .42 && z < H * .64;
      const rmp = band ? white : orange;
      for (let t = 0; t < 6.2832; t += .02) {
        const nx = Math.cos(t), ny = Math.sin(t);
        /* 与藤篮同一个柱面光照公式；白带整体提一档 */
        const lv = ctx.clamp(Math.round(2.8 - .5 * nx + .85 * ny + (band ? 1 : 0)), 1, 4);
        ctx.plot(X + nx * rz, Y + ny * rz, Z + z, rmp[lv]);
      }
    }

    ctx.shadowAt(X, Y, Z, R0 * 1.25, 1, .5);
  },
});

/* ================= 7. bench 长椅（balote:134 / tie-break:160） ================= */
KIT.register({
  id: 'bench',
  name: '长椅',
  category: 'prop',
  desc: '几块交替木色的座板 + 靠背 + 两条铁脚，公园里最常见的长椅',
  params: {
    len:   { def: 2.6, min: 1, max: 6, step: .1, desc: '椅子长度' },
    h:     { def: .85, min: .35, max: 1.4, step: .05, desc: '座面高度' },
    slats: { def: 3, min: 1, max: 7, step: 1, desc: '座板条数' },
    back:  { def: 1, min: 0, max: 1, step: 1, desc: '是否带靠背' },
    color: { def: 0, min: 0, max: 2, step: 1, desc: '木色：0 暖木 / 1 深胡桃 / 2 灰木' },
  },
  collision: { type: 'box', w: 2.6, d: .7, h: 1.45 },

  draw(ctx) {
    const P = ctx.params, X = ctx.x, Y = ctx.y, Z = ctx.z || 0;
    const LEN = P.len, H = P.h;
    const set = rpsPick(RPS_BENCH_SETS, P.color);
    const D = ctx.clamp(LEN * .22, .45, .85);      // 座深随长度走，短椅不显笨
    const seatTop = Z + H, seatT = .09;
    const x0 = X - LEN / 2, x1 = X + LEN / 2;
    const y0 = Y - D / 2, y1 = Y + D / 2;

    /* 铁脚：靠两端，压在座面下方 */
    for (const sx of [-1, 1]) {
      const lx = sx < 0 ? x0 + .12 : x1 - .26;
      ctx.box(lx, Y - .16, Z, lx + .14, Y + .16, seatTop - seatT,
        RPS_BENCH_IRON, ctx.seed + (sx < 0 ? 2 : 3));
      ctx.shadowAt(lx + .07, Y, Z, .24, 1, .5);
    }

    /* 靠背：在远侧（-y），两根立柱 + 一块整板 */
    if (P.back >= .5) {
      for (const sx of [-1, 1]) {
        const lx = sx < 0 ? x0 + .12 : x1 - .24;
        ctx.box(lx, y0 - .13, seatTop - .05, lx + .12, y0 + .02, seatTop + .62,
          RPS_BENCH_IRON, ctx.seed + (sx < 0 ? 4 : 5));
      }
      ctx.box(x0, y0 - .1, seatTop + .02, x1, y0 + .01, seatTop + .56,
        set[1], ctx.seed + 6);
    }

    /* 座板：沿长度通铺，板与板之间留 .022 缝；奇偶交替色 */
    const n = Math.max(1, Math.round(P.slats));
    const gap = .022;
    for (let i = 0; i < n; i++) {
      const sy0 = y0 + D * i / n;
      const sy1 = y0 + D * (i + 1) / n - gap;
      ctx.box(x0, sy0, seatTop - seatT, x1, sy1, seatTop,
        i % 2 ? set[1] : set[0], ctx.seed + 10 + i);
    }

    /* 一条长长的落地影，比单个圆影更像"椅子" */
    for (let a = x0 + .3; a <= x1; a += .65) ctx.shadowAt(a, Y + .05, Z, .3, .85, .4);
  },
});

/* ================= 8. awning 遮阳篷（laundry:147 + 条纹布扫掠） ================= */
KIT.register({
  id: 'awning',
  name: '遮阳篷',
  category: 'structure',
  desc: '从墙上斜挑出来的条纹布篷，外沿有波浪垂边，可用两根细铁杆支地',
  params: {
    w:      { def: 2.6, min: 1, max: 6, step: .1, desc: '篷面宽度（x 方向）' },
    d:      { def: 1.5, min: .5, max: 3, step: .1, desc: '伸出深度（y 方向）' },
    height: { def: 2.2, min: .8, max: 3.5, step: .1, desc: '靠墙端离地高度' },
    stripe: { def: .3, min: .1, max: .8, step: .05, desc: '条纹宽度' },
    slope:  { def: .45, min: .05, max: 1.2, step: .05, desc: '前后高差（越大越陡）' },
    color:  { def: 0, min: 0, max: 3, step: 1, desc: '配色：0 红白 / 1 蓝白 / 2 绿米 / 3 橙米' },
    posts:  { def: 1, min: 0, max: 1, step: 1, desc: '是否加两根前支柱' },
  },
  collision: { type: 'box', w: 2.6, d: 1.5, h: 2.2 },
  behavior: { default: [], allow: ['sway'] },

  draw(ctx) {
    const P = ctx.params, X = ctx.x, Y = ctx.y, Z = ctx.z || 0;
    const W = P.w, D = P.d, H = P.height;
    const set = rpsPick(RPS_AWNING_SETS, P.color);
    const main = ctx.rampOf(set[0]), alt = ctx.rampOf(set[1]);
    const zh = Z + H;
    /* 前后高差不能把外沿压到地下（极端参数时按高度收一收） */
    const slope = Math.min(P.slope, H * .8);
    const yWall = Y - D / 2, yFront = Y + D / 2;
    const zEdge = zh - slope;

    /* 篷面：沿 u（宽）× v（伸出）扫掠；v 越大越低，中间再加一点布的自重下垂 */
    for (let u = -W / 2; u <= W / 2 + 1e-6; u += .04) {
      const rmp = Math.floor((u + W / 2) / P.stripe) % 2 ? alt : main;
      for (let v = 0; v <= D + 1e-6; v += .04) {
        const t = v / Math.max(.001, D);
        const sag = Math.sin(t * Math.PI) * .05;
        const lv = ctx.clamp(3 + Math.round(Math.cos(u * 2.1) * .35 - t * .9), 1, 4);
        ctx.plot(X + u, yWall + v, zh - t * slope - sag, rmp[lv]);
      }
    }

    /* 外沿垂边：条纹延续下来，下缘做波浪剪裁 */
    for (let u = -W / 2; u <= W / 2 + 1e-6; u += .035) {
      const rmp = Math.floor((u + W / 2) / P.stripe) % 2 ? alt : main;
      const hem = .12 + .06 * (.5 + .5 * Math.sin(u * 5.5));
      for (let zz = 0; zz <= hem; zz += .03) {
        const lv = ctx.clamp(3 - Math.round(zz / Math.max(.001, hem)), 1, 4);
        ctx.plot(X + u, yFront + .02, zEdge - zz, rmp[lv]);
      }
    }

    /* 靠墙的挂杆 */
    ctx.box(X - W / 2, yWall - .06, zh - .06, X + W / 2, yWall + .01, zh,
      RPS_AWNING_RAIL, ctx.seed + 1);

    /* 前支柱：细方铁杆，从地面撑到外沿两角 */
    if (P.posts >= .5) {
      for (const sx of [-1, 1]) {
        const px = X + sx * W * .46;
        ctx.box(px - .045, yFront - .045, Z, px + .045, yFront + .045, zEdge,
          RPS_AWNING_IRON, ctx.seed + (sx < 0 ? 2 : 3));
        ctx.shadowAt(px, yFront, Z, .16, 1, .5);
      }
    }

    /* 篷下的软影：横向分几列采样，别让影子把地面画成棋盘 */
    for (let u = -W / 2; u <= W / 2; u += .55) {
      for (let v = 0; v <= D; v += .5) {
        ctx.shadowAt(X + u, yWall + v, Z, .3, .5, .5);
      }
    }
  },
});

/* ================= 9. ball-basket 球筐（tie-break:168） ================= */
KIT.register({
  id: 'ball-basket',
  name: '球筐',
  category: 'prop',
  desc: '铁丝网圆筐，筐底铺暗色内衬，里面堆着几只网球',
  params: {
    r:     { def: .55, min: .2, max: 1.2, step: .05, desc: '筐口半径' },
    h:     { def: .65, min: .25, max: 1.4, step: .05, desc: '筐高' },
    balls: { def: 5, min: 0, max: 12, step: 1, desc: '筐内球数' },
    color: { def: 0, min: 0, max: 1, step: 1, desc: '0 全是网球黄绿 / 1 杂色球' },
  },
  collision: { type: 'cylinder', radius: .55, height: .9 },

  draw(ctx) {
    const P = ctx.params, X = ctx.x, Y = ctx.y, Z = ctx.z || 0;
    const R = P.r, H = P.h;
    const wire = ctx.rampOf(RPS_WIRE);
    const floor = ctx.rampOf(RPS_BASKET_FLOOR);

    /* 筐底：暗色圆盘，给"里面"一个底 */
    for (let a = 0; a < 6.2832; a += .05) {
      for (let q = 0; q <= R; q += .05) {
        ctx.plot(X + Math.cos(a) * q, Y + Math.sin(a) * q, Z + .02, floor[1]);
      }
    }

    /* 侧网：菱形网眼 = 两组斜线求交（wire-fence 同一套公式） */
    const mesh = 1.6, wireW = .13;
    for (let t = 0; t < 6.2832; t += .018) {
      const nx = Math.cos(t), ny = Math.sin(t);
      const s = t * R;
      const lv = ctx.clamp(Math.round(2.7 - .5 * nx + .85 * ny), 1, 4);
      for (let z = 0; z <= H + 1e-6; z += .035) {
        const f = (s + z) * mesh, g = (s - z) * mesh;
        if (f - Math.floor(f) > wireW && g - Math.floor(g) > wireW) continue;
        ctx.plot(X + nx * R, Y + ny * R, Z + z, wire[lv]);
      }
    }

    /* 筐口：内外两道细圈，篮子才有厚度 */
    for (let t = 0; t < 6.2832; t += .012) {
      const nx = Math.cos(t), ny = Math.sin(t);
      ctx.plot(X + nx * R, Y + ny * R, Z + H + .015, wire[4]);
      ctx.plot(X + nx * (R - .035), Y + ny * (R - .035), Z + H + .03, wire[3]);
    }

    /* 筐里的球：位置全部来自 hash，刷新场景也是同一堆 */
    const n = Math.max(0, Math.round(P.balls));
    const br = Math.min(.28, Math.max(.12, R * .34));
    for (let k = 0; k < n; k++) {
      const a = ctx.hash(k * 3 + 1, ctx.seed) * 6.2832;
      const dist = Math.sqrt(ctx.hash(k * 3 + 2, ctx.seed)) * R * .55;
      const bz = Z + H * .55 + ctx.hash(k * 3 + 3, ctx.seed) * br * .9;
      const col = P.color >= .5 ? rpsPick(RPS_BALLS, k) : RPS_BALLS[0];
      ctx.sphere(X + Math.cos(a) * dist, Y + Math.sin(a) * dist, bz, br, col, 'gloss');
    }

    ctx.shadowAt(X, Y, Z, R * 1.2, 1, .5);
  },
});
