'use strict';
/* ------------------------------------------------------------------
 * 构件库 · 参考项目植被（ref-plants）
 *
 * 从 pixel-plays 移植的 4 个植被变体，配方卡见 docs/kit/ref-plants.md：
 *   palm         —— mini-ramp 的二次曲线弯干 + 羽状垂叶 + 环纹树皮
 *   flower       —— grass-tuft 的花点思路，独立成一小丛花茎
 *   potted-plant —— laundry 的三行物件范式：盆 + 叶球 + 影
 *   moss         —— laundry 地面苔藓的双条件选区，独立成贴地斑块
 *
 * 颜色分两张皮：
 *   sphere/capsule/box 只吃 [r,g,b] 数组；
 *   plot 只吃 rgb()/rampOf() 打包后的整数。
 * ------------------------------------------------------------------ */

/* ---- 棕榈：二次曲线弯干 + 10 片下垂羽叶 ---- */
KIT.register({
  id: 'palm',
  name: '棕榈',
  category: 'tree',
  desc: '二次曲线弯曲的单干，顶部一圈下垂的羽状叶，树皮带横向环纹',
  params: {
    scale:  { def: 1,   min: .7,  max: 1.3, step: .05, desc: '整树缩放（干径/叶长/椰果）' },
    height: { def: 5.6, min: 3,   max: 8,   step: .2,  desc: '树干高度（世界单位）' },
    fronds: { def: 10,  min: 6,   max: 14,  step: 1,   desc: '叶片数（绕顶一圈）' },
    lean:   { def: 1.1, min: 0,   max: 1.8, step: .1,  desc: '弯曲幅度（顶端水平偏移）' },
  },
  collision: { type: 'cylinder', radius: .5, height: 5.6 },
  behavior: {
    default: [{ id: 'sway', params: { amp: 1.4 } }],
    allow: ['sway', 'chop', 'shake'],
  },
  draw(ctx) {
    const p = ctx.params;
    const sc = p.scale;
    const h = p.height;
    const nF = Math.max(3, Math.round(p.fronds));
    const lean = p.lean;

    const BARK = [128, 104, 80], RING = [96, 76, 60], COCO = [110, 76, 44];
    const DEEP = [38, 88, 58], MID = [70, 128, 62], LIGHT = [132, 168, 72];

    /* ① 参数化弯曲干：根部直立、顶端偏移最大（t² 不是 t） */
    const turn = ctx.hash(1, ctx.seed) * 6.2832;
    const lx = Math.cos(turn) * lean * sc;
    const ly = Math.sin(turn) * lean * sc;
    const trunkAt = t => [ctx.x + lx * t * t, ctx.y + ly * t * t, h * t];

    /* ② 七段胶囊；colorOf 吃世界高度 z，按 3.4 的周期交替环纹两色 */
    const SEG = 7;
    for (let k = 0; k < SEG; k++) {
      const q0 = trunkAt(k / SEG), q1 = trunkAt((k + 1) / SEG);
      ctx.capsule(q0, q1,
        ctx.lerp(.3, .17, k / SEG) * sc,
        ctx.lerp(.3, .17, (k + 1) / SEG) * sc,
        z => (Math.floor(z * 3.4) % 2 ? BARK : RING), 'rough');
      /* 每段各自投影一次，影子沿弯曲的干连成一条线 */
      ctx.shadowAt(q0[0], q0[1], q0[2], .24 * sc);
    }

    /* ③ 顶部三颗椰果，补住叶心，否则树顶是秃的 */
    const top = trunkAt(1);
    for (const [dx, dy] of [[.16, 0], [-.1, .14], [-.04, -.16]]) {
      ctx.sphere(top[0] + dx * sc, top[1] + dy * sc, top[2] - .12,
        .13 * sc, COCO, 'solid');
    }

    /* ④ 叶片 = 11 段 × 3 排小球。中排高、两侧低 .22，形成卷曲感。
       drop 是抛物线：先随 rise 抬起，再被 2.4*t² 压下去 → 下垂 */
    for (let f = 0; f < nF; f++) {
      const ang = f / nF * 6.2832 + ctx.hash(f * 7 + 3, ctx.seed) * .5;
      const len = (2.7 + ctx.hash(f * 11 + 9, ctx.seed) * .9) * sc;
      const fx = Math.cos(ang), fy = Math.sin(ang);
      const rise = .9 + ctx.hash(f * 13 + 5, ctx.seed) * .8;

      for (let n = 1; n <= 11; n++) {
        const u = n / 11;
        const along = len * u;
        const z = top[2] + sc * (rise * u - 2.4 * u * u);
        const width = .42 * sc * (1 - u * .55);   // 叶尖收窄

        for (const side of [-1, 0, 1]) {
          const kk = f * 40 + n * 3 + side + 1;
          const tone = ctx.hash(kk * 1.7 + 1, ctx.seed) + (side ? 0 : .35) - u * .2;
          const col = tone > .85 ? LIGHT : tone > .35 ? MID : DEEP;
          ctx.sphere(
            top[0] + fx * along - fy * width * side,
            top[1] + fy * along + fx * width * side,
            z - (side ? .22 * sc : 0),
            (side ? .15 : .12) * sc, col, 'rough');
        }
      }
    }
  },
});

/* ---- 小花：一小丛花茎 + 花瓣点 ---- */
KIT.register({
  id: 'flower',
  name: '小花',
  category: 'plant',
  desc: '一小丛细花茎，每根顶端一圈花瓣 + 花心，花色按调色板索引',
  params: {
    rate:   { def: .5,  min: .15, max: 1,   step: .05, desc: '开花密度（越大花茎越多）' },
    color:  { def: 2,   min: 0,   max: 4,   step: 1,   desc: '花色：0 暖白 / 1 嫩黄 / 2 桃粉 / 3 淡紫 / 4 天蓝' },
    height: { def: 1,   min: .5,  max: 1.8, step: .05, desc: '花茎高度' },
    spread: { def: .8,  min: .2,  max: 1.2, step: .05, desc: '花丛半径' },
  },
  collision: { type: 'cylinder', radius: .5, height: 1 },
  behavior: {
    default: [{ id: 'sway', params: { amp: 1.2 } }],
    allow: ['sway', 'chop', 'shake'],
  },
  draw(ctx) {
    const p = ctx.params;
    const rate = p.rate, height = p.height, spread = p.spread;
    const idx = ctx.clamp(p.color | 0, 0, 4);

    /* 花色调色板：索引 → 基色。绝不把整组颜色当参数传进来。 */
    const PETAL = [
      [250, 238, 218], [246, 212, 96], [240, 148, 164], [178, 150, 220], [138, 178, 226],
    ][idx];
    const PISTIL = idx === 1 ? [206, 140, 52] : [236, 190, 74];
    const STEM = [82, 122, 56], LEAF = [96, 138, 62];

    const n = Math.max(2, Math.round(3 + rate * 13));

    for (let i = 0; i < n; i++) {
      const kk = i * 19 + 5;
      const a = (i / n) * 6.2832 + (ctx.hash(kk, ctx.seed) - .5) * .9;
      const d = Math.sqrt(ctx.hash(kk + 1, ctx.seed)) * spread;
      const bx = ctx.x + Math.cos(a) * d;
      const by = ctx.y + Math.sin(a) * d;
      const hh = height * (.7 + ctx.hash(kk + 2, ctx.seed) * .45);
      const leanA = a + (ctx.hash(kk + 3, ctx.seed) - .5) * .8;
      const tx = bx + Math.cos(leanA) * spread * .12;
      const ty = by + Math.sin(leanA) * spread * .12;

      /* 茎：一段细胶囊，根粗梢细 */
      ctx.capsule([bx, by, 0], [tx, ty, hh], .028, .018, () => STEM, 'rough');

      /* 茎下部的窄叶，给花丛一点底座 */
      if (ctx.hash(kk + 4, ctx.seed) > .35) {
        const la = a + 1.2;
        ctx.capsule([bx, by, .02],
          [bx + Math.cos(la) * .16, by + Math.sin(la) * .16, hh * .28],
          .05, .012, () => LEAF, 'rough');
      }

      /* 花冠：5 颗花瓣球绕圈 + 1 颗花心。
         flat 模式直接用基色 —— 球面色阶在浅色纸背景上会读出灰紫暗部，
         一两像素的花瓣经不起那层明暗，纯色点才读得成"花"。 */
      const sz = .07 + ctx.hash(kk + 5, ctx.seed) * .028;
      const roll = ctx.hash(kk + 6, ctx.seed) * 1.2;
      for (let q = 0; q < 5; q++) {
        const pa = q / 5 * 6.2832 + roll;
        ctx.sphere(
          tx + Math.cos(pa) * sz * 1.7,
          ty + Math.sin(pa) * sz * 1.7,
          hh + Math.sin(pa) * .02,
          sz * .85, PETAL, 'flat');
      }
      ctx.sphere(tx, ty, hh + .03, sz * .7, PISTIL, 'flat');
    }

    ctx.shadow(spread * 1.25, .7, .5);
  },
});

/* ---- 盆栽：陶盆 + 丛叶 ---- */
KIT.register({
  id: 'potted-plant',
  name: '盆栽',
  category: 'plant',
  desc: '圆锥台陶盆 + 翻边盆沿 + 深色土面，叶球堆成圆润的丛叶',
  params: {
    r:      { def: .45, min: .25, max: .8,  step: .01, desc: '盆半径' },
    leafN:  { def: 14,  min: 6,   max: 26,  step: 1,   desc: '叶球数量' },
    height: { def: 1,   min: .6,  max: 1.8, step: .05, desc: '叶簇高度系数' },
  },
  collision: { type: 'cylinder', radius: .55, height: 1.2 },
  draw(ctx) {
    const p = ctx.params;
    const r = p.r;
    const leafN = Math.max(4, Math.round(p.leafN));
    const hf = p.height;

    const POT = [176, 96, 62], POT_HI = [198, 118, 78], SOIL = [74, 54, 40];
    const LEAF_DK = [58, 104, 50], LEAF = [80, 130, 58], LEAF_HI = [108, 156, 74];

    /* 盆身：竖直胶囊，半径下小上大 → 圆锥台陶盆。
       用三层 box 叠收腰时，旋转预览会在层间露出横带。 */
    ctx.capsule([ctx.x, ctx.y, 0], [ctx.x, ctx.y, r * 1.22],
      r * .7, r * .86, z => (z > r * .78 ? POT_HI : POT), 'rough');
    /* 盆沿：一小段更宽的胶囊，顶面比土面低一点 */
    ctx.capsule([ctx.x, ctx.y, r * 1.18], [ctx.x, ctx.y, r * 1.4],
      r * .9, r * .88, () => POT_HI, 'rough');
    /* 土面：略高出盆沿，露出的深褐色方块就是盆土 */
    ctx.box(ctx.x - r * .62, ctx.y - r * .62, r * 1.3,
      ctx.x + r * .62, ctx.y + r * .62, r * 1.44, SOIL, ctx.seed + 9);

    /* 丛叶：sqrt 分布让叶球在盆口均匀铺开，高度随 height 参数抬升 */
    for (let k = 0; k < leafN; k++) {
      const a = ctx.hash(k * 3 + 1, ctx.seed) * 6.2832;
      const d = Math.sqrt(ctx.hash(k * 5 + 2, ctx.seed)) * r * .85;
      const z = r * (1.35 + hf * .5) + ctx.hash(k * 7 + 3, ctx.seed) * r * .55;
      const rr = r * (.4 + ctx.hash(k * 11 + 4, ctx.seed) * .2);
      const tone = ctx.hash(k * 13 + 5, ctx.seed) + z / r * .1;
      const col = tone > .74 ? LEAF_HI : tone > .4 ? LEAF : LEAF_DK;
      ctx.sphere(ctx.x + Math.cos(a) * d, ctx.y + Math.sin(a) * d, z,
        rr, col, 'rough');
    }

    ctx.shadow(r * 1.15, 1, .5);
  },
});

/* ---- 苔藓斑：贴地的不规则苔藓片 ---- */
KIT.register({
  id: 'moss',
  name: '苔藓斑',
  category: 'plant',
  desc: '贴地蔓延的不规则苔藓片：低频噪声定轮廓，高频 hash 打散毛边，亮像素做绒面',
  params: {
    size:    { def: 1.4, min: .6,  max: 4,  step: .1,  desc: '斑块半径' },
    density: { def: .85, min: .2,  max: 1,  step: .05, desc: '毛边密度（内部实心，边缘按此概率打散）' },
    color:   { def: 0,   min: 0,   max: 2,  step: 1,   desc: '苔色：0 青苔 / 1 黄苔 / 2 灰苔' },
  },
  collision: { type: 'cylinder', radius: 1.2, height: .12 },
  draw(ctx) {
    const p = ctx.params;
    const size = p.size;
    const density = p.density;
    const idx = ctx.clamp(p.color | 0, 0, 2);

    /* plot 只吃打包色：基色数组 → 5 档 ramp，每像素挑一档 */
    const BASE = [
      [104, 126, 62], [136, 148, 72], [98, 116, 78],
    ][idx];
    const ramp = ctx.rampOf(BASE);

    /* 屏幕包围盒：世界圆投影成宽 2*size*S、高 size*S 的椭圆。
       逐屏幕像素反解世界坐标 —— 不用逐格点 plot，否则格点之间的
       缝隙会在毛边上漏出背景色。 */
    const c0 = ctx.screen(ctx.x, ctx.y, 0);
    const cx1 = ctx.screen(ctx.x + size, ctx.y, 0);
    const cy1 = ctx.screen(ctx.x, ctx.y + size, 0);
    const rx = Math.max(Math.abs(cx1.sx - c0.sx), Math.abs(cy1.sx - c0.sx)) + 2;
    const ry = Math.max(Math.abs(cx1.sy - c0.sy), Math.abs(cy1.sy - c0.sy)) + 2;

    const ix0 = Math.max(0, Math.floor(c0.sx - rx));
    const ix1 = Math.min(W - 1, Math.ceil(c0.sx + rx));
    const iy0 = Math.max(0, Math.floor(c0.sy - ry));
    const iy1 = Math.min(H - 1, Math.ceil(c0.sy + ry));

    for (let iy = iy0; iy <= iy1; iy++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const w = ctx.unproject(ix, iy, 0);
        const dx = w[0] - ctx.x, dy = w[1] - ctx.y;
        const d = Math.hypot(dx, dy) / size;
        if (d > 1.12) continue;

        /* 条件一：低频噪声定出有机轮廓（频率要够高，否则读成正圆） */
        const shape = ctx.noise(w[0] * 1.4 + ctx.seed * 7.3, w[1] * 1.4 + ctx.seed * 3.7);
        const edge = .62 + shape * .4;
        if (d > edge) continue;

        /* 条件二：只有外圈毛边带按 density 抽稀；内部实心。
           内部逐像素抽稀会在 1px 尺度上露出背景，读成碎片。 */
        const fine = ctx.hash(ix * 7.3 + 11, iy * 13.7 + ctx.seed * 17);
        if (d > edge - .16 && fine > density) continue;

        /* 斑驳：中频噪声 + 高频 hash，五档色阶都要用上 */
        const mottle = ctx.noise(w[0] * 3.7 + 5.1, w[1] * 3.7 + 9.4);
        const lv = ctx.clamp(Math.round(mottle * 3 + fine * 1.4 - .4), 0, 4);
        ctx.plot(w[0], w[1], .02, ramp[lv]);

        /* 绒面：稀疏的亮像素抬高一层（小球在 1px 尺度上会画出
           一圈深色球面暗部，读成破洞） */
        if (fine > .93 && d < edge - .12) {
          ctx.plot(w[0], w[1], .04, ramp[4]);
        }
      }
    }
  },
});
