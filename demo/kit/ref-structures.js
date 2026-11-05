'use strict';
/* ------------------------------------------------------------------
 * 构件库 · 参考项目线性/曲面结构（ref-structures）
 *
 * 从 pixel-plays 已验证的场景里移植（对照表见 docs/kit/ref-port.md）：
 *   wood-fence —— balote:127（交替色板条）
 *   wire-fence —— tie-break:108（斜向网格求交 = 菱形网眼）
 *   net        —— tie-break:142（正交网格求并 + 白色包边）
 *   ramp       —— mini-ramp:69（U 型曲面参数化扫掠）
 *
 * 算法出处：docs/kit/structures.md §4-§5
 *
 * 颜色分两张皮（铁律 1）：
 *   RFS_* 基色数组只喂 ctx.box / capsule / sphere；
 *   ctx.rgb(...) / ctx.rampOf(...) 的打包值只喂 ctx.plot。
 * ------------------------------------------------------------------ */

const RFS_WOOD = [122, 84, 50];
const RFS_WOOD_LIGHT = [146, 104, 62];
const RFS_STEEL = [92, 96, 94];
const RFS_POST = [44, 58, 54];
const RFS_RAMP_MASON = [150, 108, 74];
const RFS_RAMP_PLY = [198, 160, 112];
const RFS_RAMP_FRAME = [122, 88, 58];
const RFS_RAMP_STEEL = [176, 182, 186];

/* ================= 1. wood-fence 木板围栏（balote:127） ================= */
KIT.register({
  id: 'wood-fence',
  name: '木板围栏',
  category: 'structure',
  desc: '一排深浅交替的木板条，板缝透光，像球场边的挡板',
  params: {
    length:    { def: 4.0,  min: 1,   max: 10,  step: .2,  desc: '围栏长度（x 方向）' },
    height:    { def: .85,  min: .3,  max: 1.6, step: .05, desc: '板条高度' },
    boardW:    { def: .55,  min: .25, max: 1.2, step: .05, desc: '单块板条宽度' },
    thickness: { def: .14,  min: .06, max: .3,  step: .01, desc: '板条厚度（y 方向）' },
  },
  collision: { type: 'box', w: 4.0, d: .3, h: .85 },

  draw(ctx) {
    const p = ctx.params, z0 = ctx.z || 0, y = ctx.y, th = p.thickness;
    const x0 = ctx.x - p.length / 2, x1 = ctx.x + p.length / 2;
    let k = 0;
    for (let x = x0; x < x1 - 1e-6; x += p.boardW, k++) {
      const xe = Math.min(x + p.boardW - .03, x1);
      const col = (k & 1) ? RFS_WOOD : RFS_WOOD_LIGHT;
      ctx.box(x, y - th / 2, z0, xe, y + th / 2, z0 + p.height, col, ctx.seed + k * 3);
    }
    for (let x = x0 + .3; x <= x1; x += .6) ctx.shadowAt(x, y, z0, .22, .9, .35);
  },
});

/* ================= 2. wire-fence 铁丝围栏（tie-break:108） ================= */
KIT.register({
  id: 'wire-fence',
  name: '铁丝围栏',
  category: 'structure',
  desc: '菱形网眼铁丝网 + 等距钢立柱 + 顶杆，一组斜向网格求交',
  params: {
    length:    { def: 4.0,  min: 1,   max: 12, step: .2,  desc: '围栏长度（x 方向）' },
    height:    { def: 1.2,  min: .4,  max: 2.5, step: .05, desc: '围网高度' },
    mesh:      { def: 1.5,  min: .5,  max: 3,  step: .05, desc: '网眼密度（越大越密）' },
    wireW:     { def: .11,  min: .04, max: .3, step: .01, desc: '网线粗细（占格子比例）' },
    postEvery: { def: 2.5,  min: .6,  max: 6,  step: .1,  desc: '立柱间距' },
  },
  collision: { type: 'box', w: 4.0, d: .2, h: 1.2 },

  draw(ctx) {
    const p = ctx.params, z0 = ctx.z || 0, y = ctx.y;
    const x0 = ctx.x - p.length / 2;
    const wire = ctx.rgb(116, 122, 116);

    /* 斜向网格求交（&&）：只在两条斜线同时落到格点上时画点 → 菱形 */
    for (let a = 0; a <= p.length; a += .035) {
      for (let z = 0; z <= p.height; z += .035) {
        const f = (a + z) * p.mesh, g = (a - z) * p.mesh;
        if (f - Math.floor(f) > p.wireW && g - Math.floor(g) > p.wireW) continue;
        ctx.plot(x0 + a, y, z0 + z, wire);
      }
    }

    /* 立柱等距分布，两端必须有柱 */
    const n = Math.max(1, Math.round(p.length / p.postEvery));
    for (let i = 0; i <= n; i++) {
      const a = p.length * i / n;
      ctx.box(x0 + a - .07, y - .07, z0, x0 + a + .07, y + .07, z0 + p.height,
        RFS_STEEL, (a * 3) | 0);
    }
    ctx.capsule([x0, y, z0 + p.height], [x0 + p.length, y, z0 + p.height],
      .05, .05, () => RFS_STEEL, 'solid');

    for (let a = 0; a <= p.length; a += .7) ctx.shadowAt(x0 + a, y, z0, .16, .9, .35);
  },
});

/* ================= 3. net 球网（tie-break:142） ================= */
KIT.register({
  id: 'net',
  name: '球网',
  category: 'structure',
  desc: '方格球网 + 白色顶部包边 + 中央绑带，两侧深色网柱',
  params: {
    width: { def: 3.2, min: 1,   max: 6,  step: .1,  desc: '网宽（x 方向）' },
    height:{ def: 1.0, min: .5,  max: 2,  step: .05, desc: '网高' },
    meshU: { def: 2.8, min: .8,  max: 5,  step: .05, desc: '横向网眼密度' },
    meshV: { def: 3.4, min: .8,  max: 6,  step: .05, desc: '纵向网眼密度' },
    strap: { def: 1,   min: 0,   max: 1,  step: 1,   desc: '是否带中央白色绑带' },
    postR: { def: .07, min: .04, max: .15, step: .01, desc: '网柱半径' },
  },
  collision: { type: 'box', w: 3.2, d: .25, h: 1.1 },

  draw(ctx) {
    const p = ctx.params, z0 = ctx.z || 0, y = ctx.y;
    const x0 = ctx.x - p.width / 2;
    const netC = ctx.rgb(58, 60, 62), tape = ctx.rgb(248, 244, 232);

    /* 正交网格求并（||）→ 方格；顶部 .13 是白色包边 */
    for (let a = 0; a <= p.width; a += .03) {
      for (let z = .02; z <= p.height; z += .03) {
        const top = z > p.height - .13;
        const f = a * p.meshU, g = z * p.meshV;
        if (top) ctx.plot(x0 + a, y, z0 + z, tape);
        else if (f - Math.floor(f) < .2 || g - Math.floor(g) < .24)
          ctx.plot(x0 + a, y, z0 + z, netC);
      }
    }

    /* 中央绑带：往 +y 推 .02，否则和网格同深度会被拒掉 */
    if (p.strap >= .5) {
      for (let a = -.05; a <= .05; a += .02)
        for (let z = .02; z <= p.height; z += .03)
          ctx.plot(ctx.x + a, y + .02, z0 + z, tape);
    }

    for (const px of [x0, x0 + p.width]) {
      ctx.box(px - p.postR, y - p.postR, z0, px + p.postR, y + p.postR,
        z0 + p.height + .1, RFS_POST, (px * 10) | 0);
    }

    for (let a = 0; a <= p.width; a += .7) ctx.shadowAt(x0 + a, y, z0, .14, .9, .35);
  },
});

/* ================= 4. ramp U 型坡道（mini-ramp:69） ================= */
KIT.register({
  id: 'ramp',
  name: 'U 型坡道',
  category: 'structure',
  desc: '两侧半圆曲面的滑板坡道：平底、弧面与木框侧板参数化扫掠',
  params: {
    radius: { def: 2.6, min: 1.2, max: 5,  step: .1,  desc: '弧面半径（也是台面高）' },
    flat:   { def: 2.0, min: .8,  max: 5,  step: .1,  desc: '中间平底半长' },
    halfW:  { def: 2.2, min: 1,   max: 4,  step: .1,  desc: '坡道半宽（屏幕纵深方向）' },
    deck:   { def: 1.0, min: .4,  max: 3,  step: .1,  desc: '两端平台长度' },
    rail:   { def: 1,   min: 0,   max: 1,  step: 1,   desc: '是否带平台护栏' },
  },
  collision: { type: 'cylinder', radius: 5.5, height: 3.8 },

  draw(ctx) {
    const p = ctx.params;
    const FLAT = p.flat, RADIUS = p.radius, HW = p.halfW, DECK = p.deck;
    const LIP_A = FLAT + RADIUS, DECK_A = LIP_A + DECK, LIP_S = FLAT + RADIUS * Math.PI / 2;
    const OX = ctx.x, OY = ctx.y, OZ = ctx.z || 0;

    /* 参考实现的局部坐标：a 沿屏幕水平、w 朝相机 */
    const world = (a, w) => [OX + (a + w) / R2, OY + (w - a) / R2];
    const wp = (a, w, z) => { const q = world(a, w); return [q[0], q[1], OZ + z]; };

    const point = (s) => {
      const n = Math.abs(s), sign = s < 0 ? -1 : 1;
      if (n <= FLAT) return { a: s, z: 0, th: 0 };
      if (n >= LIP_S) return { a: sign * LIP_A + (s - sign * LIP_S), z: RADIUS, th: 0 };
      const t = (n - FLAT) / RADIUS;
      return { a: sign * (FLAT + RADIUS * Math.sin(t)), z: RADIUS * (1 - Math.cos(t)), th: sign * t };
    };
    const surf = (a) => {
      const n = Math.abs(a);
      if (n <= FLAT) return 0;
      if (n >= LIP_A) return RADIUS;
      const d = n - FLAT;
      return RADIUS - Math.sqrt(Math.max(0, RADIUS * RADIUS - d * d));
    };

    const mason = ctx.rampOf(RFS_RAMP_MASON);
    const ply = ctx.rampOf(RFS_RAMP_PLY);
    const frame = ctx.rampOf(RFS_RAMP_FRAME);

    /* 1. 曲面扫掠：沿弧长 s 取点，再沿宽度 w 铺；朝向决定明暗 */
    const s0 = -(LIP_S + DECK);
    for (let s = s0; s <= -s0; s += .045) {
      const q = point(s), onDeck = Math.abs(s) > LIP_S;
      const facing = Math.sin(q.th);
      const shade = 3 + (facing > 0 ? .85 * facing : 1.5 * facing);
      for (let w = -HW; w <= HW; w += .08) {
        const seamS = Math.abs(s / 2.44 - Math.round(s / 2.44)) < .016;
        const seamW = Math.abs(w / 2.3 - Math.round(w / 2.3)) < .022;
        let level = shade + (ctx.noise(s * 1.6, w * 1.6) - .5) * .5;
        if (seamS || seamW) level -= 1;
        if (Math.abs(s) < LIP_S && Math.abs(w - .3) < 1.3) level -= .35;   // 常走的线磨得更深
        if (onDeck) level += .4;
        level += (ctx.hash((s * 40) | 0, (w * 40) | 0) - .5) * .6;
        const [wx, wy] = world(q.a, w);
        ctx.plot(wx, wy, OZ + q.z, (onDeck ? ply : mason)[ctx.clamp(Math.floor(level), 0, 4)]);
      }
    }

    /* 2. 近侧断面：板材 + 立柱 + 上下封边 */
    for (let a = -DECK_A; a <= DECK_A; a += .06) {
      const top = surf(a);
      for (let z = 0; z <= top; z += .06) {
        const stud = Math.abs(a / 1.7 - Math.round(a / 1.7)) < .03;
        const rail = top - z < .16 || z < .14;
        let level = stud || rail ? 2.4 : 1.9 + (ctx.noise(a * 2, z * 3) - .5) * .6;
        level += (ctx.hash((a * 40) | 0, (z * 40) | 0) - .5) * .5;
        const [wx, wy] = world(a, HW);
        ctx.plot(wx, wy, OZ + z, (stud || rail ? frame : ply)[ctx.clamp(Math.floor(level), 0, 4)]);
      }
    }

    /* 3. 弧口钢轨 + 平台护栏 */
    for (const side of [-1, 1]) {
      ctx.capsule(wp(side * LIP_A, -HW, RADIUS + .03), wp(side * LIP_A, HW, RADIUS + .03),
        .1, .1, () => RFS_RAMP_STEEL, 'gloss');
      if (p.rail >= .5 && DECK > .5) {
        const zTop = RADIUS + 1.0;
        const aMid = side * (LIP_A + DECK * .55);
        ctx.capsule(wp(aMid, HW, RADIUS), wp(aMid, HW, zTop), .055, .05,
          () => [70, 74, 78], 'solid');
        ctx.capsule(wp(side * LIP_A, HW, zTop), wp(side * DECK_A, HW, zTop), .05, .05,
          () => [70, 74, 78], 'solid');
      }
    }

    /* 4. 落地影：沿近侧边缘采样 */
    for (let a = -DECK_A; a <= DECK_A; a += .7) {
      const [wx, wy] = world(a, HW);
      ctx.shadowAt(wx, wy, OZ, .3, .85, .35);
    }
  },
});
