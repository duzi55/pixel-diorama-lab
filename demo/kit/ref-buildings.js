'use strict';
/* ------------------------------------------------------------------
 * 构件库 · 参考项目建筑构件（ref-buildings）
 *
 * 从 pixel-plays 已验证的场景里移植（对照表见 docs/kit/ref-port.md）：
 *   house / square-tower / round-tower / pitched-roof    —— stari-most
 *   parapet / water-tank / chimney                      —— laundry
 *   stairs                                              —— mini-ramp（梯子）
 *
 * 算法出处：docs/kit/buildings.md §2-§7 · docs/kit/structures.md §1/§4.4
 *
 * 颜色分两张皮（铁律 1）：
 *   REF_* 基色数组只喂 ctx.box / capsule / sphere；
 *   ctx.rampOf(...) 的返回值（打包像素）只喂 ctx.plot。
 * ------------------------------------------------------------------ */

/* 参考项目原色 */
const REF_STONE = [206, 196, 176];       // stari-most STONE
const REF_SLATE = [120, 112, 110];       // stari-most SLATE
const REF_TILE = [168, 96, 70];          // stari-most TILE
const REF_DARK = [44, 40, 50];           // stari-most DARK
const REF_PLASTER = [214, 204, 184];     // laundry PLASTER（略压暗）
const REF_POT = [176, 92, 62];           // laundry POT
const REF_LAUNDRY_STONE = [168, 158, 140];

/* 两色按 t 混合成基色数组（瓦色冷暖参数用） */
function refMix(ctx, a, b, t) {
  return [
    Math.round(ctx.lerp(a[0], b[0], t)),
    Math.round(ctx.lerp(a[1], b[1], t)),
    Math.round(ctx.lerp(a[2], b[2], t)),
  ];
}

/* 砌体：错缝砖石 + 灰缝 + 每块砖色差（structures.md §1）
   base 可能来自 ctx.lit() 的浮点档位，索引色阶前必须取整。 */
function refMasonry(ctx, a, z, base, ramp) {
  const fz = z * 1.6, course = Math.floor(fz);
  const fa = a * 1.2 + (course % 2) * .5, block = Math.floor(fa);
  const mortar = fz - course < .14 || fa - block < .1;
  const tone = ctx.hash(block * 7 + course * 131, ctx.seed);
  const lv = Math.round(base + (tone > .75 ? 1 : tone < .2 ? -1 : 0) - (mortar ? 1 : 0));
  return ramp[ctx.clamp(lv, 0, 4)];
}

/* 双坡屋面：横向瓦行 + 随机缺片（buildings.md §5）
   坡面法线 = 沿 y 的坡度分量 + 朝上分量（按 rise/half 归一化），
   近坡/远坡各喂一次方向光。row 按屏幕投影高度分行（每行约 3.6px），
   小屋顶也读得出瓦行。 */
function refRoof(ctx, x0, y0, x1, y1, z, rise, ramp, rows, seed) {
  const yc = (y0 + y1) / 2, half = Math.max(.01, (y1 - y0) / 2), step = .04;
  const perY = (SIN / R2 + rise / half * COS) * S;
  const k = 1 / Math.hypot(rise / half, 1);
  const nSlope = (rise / half) * k, nUp = k;
  const litNear = Math.round(ctx.lit(0, nSlope, nUp)), litFar = Math.round(ctx.lit(0, -nSlope, nUp));
  for (let x = x0; x <= x1; x += step) for (let y = y0; y <= y1; y += step) {
    const q = Math.abs(y - yc) / half;
    const row = Math.floor(Math.abs(y - yc) * perY * rows / 12.24) % 2;
    const wear = ctx.hash(((x * 3) | 0) + seed, (y * 9) | 0) > .85 ? 1 : 0;
    const lv = ctx.clamp((y > yc ? litNear : litFar) - (row ? 1 : 0) - wear, 1, 4);
    ctx.plot(x, y, z + rise * (1 - q), ramp[lv]);
  }
}

/* 山墙三角：必须画在出檐外缘（buildings.md §5 坑）；xFace 是 +x 端面 */
function refGable(ctx, xFace, y0, y1, z, rise, ramp) {
  const yc = (y0 + y1) / 2, half = Math.max(.01, (y1 - y0) / 2), step = .045;
  const litX = Math.round(ctx.lit(1, 0, 0));
  for (let y = y0; y <= y1; y += step) {
    const q = Math.abs(y - yc) / half;
    for (let h = 0; h <= rise * (1 - q); h += step)
      ctx.plot(xFace, y, z + h, refMasonry(ctx, y, z + h, litX, ramp));
  }
}

/* 体积阴影：三维采样打点，不是单点贴纸（structures.md §2） */
function refShadow(ctx, x0, y0, x1, y1, z0, z1) {
  for (let x = x0; x <= x1; x += .7) for (let y = y0; y <= y1; y += .7)
    for (let z = z0 + .3; z <= z1; z += 1) ctx.shadowAt(x, y, z, .45, .9, .35);
}

/* ================= 1. house 石屋（stari-most:192） ================= */
KIT.register({
  id: 'house',
  name: '石屋',
  category: 'building',
  desc: '双坡瓦顶砌体小屋：正面亮、侧面暗，规则窗洞，屋顶出挑',
  params: {
    width:    { def: 3.2, min: 2,   max: 6,   step: .1,  desc: '屋身宽（x 方向）' },
    depth:    { def: 2.6, min: 1.6, max: 5,   step: .1,  desc: '屋身深（y 方向）' },
    height:   { def: 3.0, min: 2,   max: 5,   step: .1,  desc: '檐口墙高' },
    rise:     { def: 1.3, min: .6,  max: 2.5, step: .05, desc: '屋脊升起高度' },
    windows:  { def: 2,   min: 1,   max: 5,   step: 1,   desc: '正面窗户数' },
    roofWarm: { def: 0,   min: 0,   max: 1,   step: .05, desc: '瓦色冷暖：0 青灰、1 暖红' },
  },
  collision: { type: 'box', w: 3.6, d: 3.0, h: 4.3 },

  draw(ctx) {
    const p = ctx.params, z0 = ctx.z || 0, step = .045;
    const x0 = ctx.x - p.width / 2, x1 = ctx.x + p.width / 2;
    const y0 = ctx.y - p.depth / 2, y1 = ctx.y + p.depth / 2;
    const stone = ctx.rampOf(REF_STONE);
    const dark = ctx.rampOf(REF_DARK);
    const roof = ctx.rampOf(refMix(ctx, REF_SLATE, REF_TILE, p.roofWarm));

    /* 两面可见墙：正面按 +y 法线、侧面按 +x 法线取光照档位 */
    const litY = Math.round(ctx.lit(0, 1, 0)), litX = Math.round(ctx.lit(1, 0, 0));
    for (let a = x0; a <= x1; a += step) for (let z = 0; z <= p.height; z += step)
      ctx.plot(a, y1, z0 + z, refMasonry(ctx, a, z, litY, stone));
    for (let a = y0; a <= y1; a += step) for (let z = 0; z <= p.height; z += step)
      ctx.plot(x1, a, z0 + z, refMasonry(ctx, a, z, litX, stone));

    /* 规则排窗：凸出墙面 .14，否则被墙吃掉 */
    const nw = p.windows | 0;
    for (let k = 0; k < nw; k++) {
      const cx = ctx.lerp(x0, x1, (k + .5) / nw);
      const wz = p.height * .55;
      for (let a = cx - .24; a <= cx + .24; a += step)
        for (let z = wz; z <= wz + .8; z += step)
          ctx.plot(a, y1 + .14, z0 + z, dark[Math.abs(a - cx) < .03 ? 3 : 1]);
    }

    /* 出挑 .2 的坡顶 + 出檐外缘的山墙 */
    refRoof(ctx, x0 - .2, y0 - .2, x1 + .2, y1 + .2, z0 + p.height, p.rise, roof, 3.4, ctx.seed);
    refGable(ctx, x1 + .22, y0 - .2, y1 + .2, z0 + p.height, p.rise, stone);
    refShadow(ctx, x0, y0, x1, y1, z0, z0 + p.height);
  },
});

/* ================= 2. square-tower 方塔（stari-most:149） ================= */
KIT.register({
  id: 'square-tower',
  name: '方塔',
  category: 'building',
  desc: '高耸砌体方塔：三个错落的窄窗，出檐坡顶收头',
  params: {
    width:    { def: 2.2, min: 1.6, max: 4,   step: .1,  desc: '塔身宽（x 方向）' },
    depth:    { def: 2.2, min: 1.6, max: 4,   step: .1,  desc: '塔身深（y 方向）' },
    height:   { def: 9.4, min: 5,   max: 14,  step: .2,  desc: '塔身高' },
    rise:     { def: 1.4, min: .6,  max: 2.5, step: .05, desc: '塔顶升起高度' },
    windows:  { def: 3,   min: 1,   max: 5,   step: 1,   desc: '窄窗数量' },
    roofWarm: { def: 0,   min: 0,   max: 1,   step: .05, desc: '顶瓦冷暖：0 青灰、1 暖红' },
  },
  collision: { type: 'box', w: 2.2, d: 2.2, h: 10.8 },

  draw(ctx) {
    const p = ctx.params, z0 = ctx.z || 0, step = .045;
    const x0 = ctx.x - p.width / 2, x1 = ctx.x + p.width / 2;
    const y0 = ctx.y - p.depth / 2, y1 = ctx.y + p.depth / 2;
    const stone = ctx.rampOf(REF_STONE);
    const dark = ctx.rampOf(REF_DARK);
    const roof = ctx.rampOf(refMix(ctx, REF_SLATE, REF_TILE, p.roofWarm));

    const litY = Math.round(ctx.lit(0, 1, 0)), litX = Math.round(ctx.lit(1, 0, 0));
    const litTop = Math.round(ctx.lit(0, 0, 1));
    for (let a = x0; a <= x1; a += step) for (let z = 0; z <= p.height; z += step)
      ctx.plot(a, y1, z0 + z, refMasonry(ctx, a, z, litY, stone));
    for (let a = y0; a <= y1; a += step) for (let z = 0; z <= p.height; z += step)
      ctx.plot(x1, a, z0 + z, refMasonry(ctx, a, z, litX, stone));

    /* 三个窗在两个高度上交错 → 更像塔 */
    const spots = [[.35, .3], [.65, .55], [.35, .78], [.7, .2], [.25, .62]];
    const nw = p.windows | 0;
    for (let k = 0; k < nw; k++) {
      const cx = ctx.lerp(x0, x1, spots[k % 5][0]);
      const cz = p.height * spots[k % 5][1];
      for (let a = cx - .22; a <= cx + .22; a += step)
        for (let z = cz - .4; z <= cz + .4; z += step)
          ctx.plot(a, y1 + .14, z0 + z, dark[1]);
      for (let a = cx - .26; a <= cx + .26; a += step)
        ctx.plot(a, y1 + .15, z0 + cz - .44, stone[litTop]);   // 窗台（朝上的面）
    }

    refRoof(ctx, x0 - .15, y0 - .15, x1 + .15, y1 + .15, z0 + p.height, p.rise, roof, 3.4, ctx.seed);
    refGable(ctx, x1 + .17, y0 - .15, y1 + .15, z0 + p.height, p.rise, stone);
    refShadow(ctx, x0, y0, x1, y1, z0, z0 + p.height);
  },
});

/* ================= 3. round-tower 圆锥塔（stari-most:159） ================= */
KIT.register({
  id: 'round-tower',
  name: '圆锥塔',
  category: 'building',
  desc: '圆柱砌体塔身 + 收口锥顶 + 横向环纹与窄窗',
  params: {
    radius:   { def: 1.9, min: 1,  max: 3,   step: .05, desc: '塔身半径' },
    height:   { def: 9.4, min: 5,  max: 12,  step: .2,  desc: '塔身高' },
    roofRise: { def: 2.1, min: 1,  max: 4,   step: .05, desc: '锥顶高' },
    windows:  { def: 2,   min: 0,  max: 4,   step: 1,   desc: '窄窗数量' },
    roofWarm: { def: 0,   min: 0,  max: 1,   step: .05, desc: '锥顶冷暖：0 青灰、1 暖红' },
  },
  collision: { type: 'cylinder', radius: 2.1, height: 11.5 },

  draw(ctx) {
    const p = ctx.params, z0 = ctx.z || 0, step = .045;
    const cx = ctx.x, cy = ctx.y, r = p.radius;
    const stone = ctx.rampOf(REF_STONE);
    const dark = ctx.rampOf(REF_DARK);
    const roof = ctx.rampOf(refMix(ctx, REF_SLATE, REF_TILE, p.roofWarm));

    /* 圆柱整圈都画，靠深度缓冲自动遮挡（不要只画前半圈）。
       径向法线直接喂方向光，整圈明暗随光源走。 */
    for (let t = 0; t < 6.283; t += .016) {
      const nx = Math.cos(t), ny = Math.sin(t);
      const base = ctx.clamp(Math.round(ctx.lit(nx, ny, 0)), 1, 4);
      for (let z = 0; z <= p.height; z += step)
        ctx.plot(cx + nx * r, cy + ny * r, z0 + z, refMasonry(ctx, t * r, z, base, stone));
    }

    /* 锥顶：半径线性收缩 + 横向环纹；法线 = 径向分量 + 朝上分量 */
    for (let t = 0; t < 6.283; t += .02) {
      const nx = Math.cos(t), ny = Math.sin(t);
      for (let q = 0; q <= 1; q += .012) {
        const rr = (r + .2) * (1 - q);
        const lv = ctx.clamp(Math.round(ctx.lit(nx * .7, ny * .7, .7) + (Math.floor(q * 12) % 2) * .4), 1, 4);
        ctx.plot(cx + nx * rr, cy + ny * rr, z0 + p.height + q * p.roofRise, roof[lv]);
      }
    }

    /* 窄窗：凸出塔面 .14；背面的窗会被深度测试自然挡住 */
    const spots = [[1.2, .45], [.5, .72], [2.6, .3], [3.6, .62]];
    const nw = p.windows | 0;
    for (let k = 0; k < nw; k++) {
      const [t, wz] = spots[k % 4];
      for (let a = t - .1; a <= t + .1; a += .01)
        for (let z = p.height * wz - .4; z <= p.height * wz + .4; z += step)
          ctx.plot(cx + Math.cos(a) * (r + .14), cy + Math.sin(a) * (r + .14), z0 + z,
            dark[Math.abs(a - t) > .085 ? 3 : 1]);
    }

    for (let z = .5; z <= p.height; z += 1.4) {
      ctx.shadowAt(cx + r * .5, cy + r * .15, z0 + z, r * .6, .9, .35);
      ctx.shadowAt(cx - r * .2, cy + r * .4, z0 + z, r * .45, .9, .35);
    }
  },
});

/* ================= 4. pitched-roof 坡屋顶（stari-most:181） ================= */
KIT.register({
  id: 'pitched-roof',
  name: '坡屋顶',
  category: 'building',
  desc: '双坡瓦屋面：瓦行、随机缺片、右侧砌体山墙，可单独摆在墙头上',
  params: {
    width:    { def: 3.2, min: 2,   max: 7,   step: .1,  desc: '屋面宽（x 方向）' },
    depth:    { def: 2.4, min: 1.6, max: 5,   step: .1,  desc: '屋面深（y 方向）' },
    rise:     { def: 1.3, min: .6,  max: 2.5, step: .05, desc: '屋脊升起高度' },
    rows:     { def: 3.4, min: 2,   max: 6,   step: .1,  desc: '瓦行密度（越大越密）' },
    roofWarm: { def: 0,   min: 0,   max: 1,   step: .05, desc: '瓦色冷暖：0 青灰、1 暖红' },
    gable:    { def: 1,   min: 0,   max: 1,   step: 1,   desc: '是否带右侧山墙' },
  },
  collision: { type: 'box', w: 3.2, d: 2.4, h: 1.5 },

  draw(ctx) {
    const p = ctx.params, z0 = ctx.z || 0;
    const x0 = ctx.x - p.width / 2, x1 = ctx.x + p.width / 2;
    const y0 = ctx.y - p.depth / 2, y1 = ctx.y + p.depth / 2;
    const stone = ctx.rampOf(REF_STONE);
    const roof = ctx.rampOf(refMix(ctx, REF_SLATE, REF_TILE, p.roofWarm));

    refRoof(ctx, x0, y0, x1, y1, z0, p.rise, roof, p.rows, ctx.seed);
    if (p.gable >= .5) refGable(ctx, x1 + .02, y0, y1, z0, p.rise, stone);
    ctx.shadow(p.width * .5, 1, .4);
  },
});

/* ================= 5. parapet 女儿墙（laundry:132） ================= */
KIT.register({
  id: 'parapet',
  name: '女儿墙',
  category: 'building',
  desc: '围合平台四边的矮墙，四边不同木纹种子，可加压顶石',
  params: {
    width:     { def: 4.0, min: 1,   max: 8,   step: .1,  desc: '平台宽（x 方向）' },
    depth:     { def: 3.0, min: 1,   max: 6,   step: .1,  desc: '平台深（y 方向）' },
    height:    { def: .6,  min: .3,  max: 1.2, step: .05, desc: '矮墙高' },
    thickness: { def: .3,  min: .15, max: .5,  step: .01, desc: '墙厚' },
    coping:    { def: 1,   min: 0,   max: 1,   step: 1,   desc: '是否加压顶石' },
  },
  collision: { type: 'box', w: 4.0, d: 3.0, h: .7 },

  draw(ctx) {
    const p = ctx.params, z0 = ctx.z || 0;
    const x0 = ctx.x - p.width / 2, x1 = ctx.x + p.width / 2;
    const y0 = ctx.y - p.depth / 2, y1 = ctx.y + p.depth / 2;
    const h = p.height, t = Math.min(p.thickness, Math.min(p.width, p.depth) / 2 - .02);

    /* 四边各给一个种子，否则四面的噪声纹理完全一样 */
    ctx.box(x0, y1 - t, z0, x1, y1, z0 + h, REF_PLASTER, ctx.seed + 1);
    ctx.box(x1 - t, y0, z0, x1, y1, z0 + h, REF_PLASTER, ctx.seed + 2);
    ctx.box(x0, y0, z0, x1, y0 + t, z0 + h, REF_PLASTER, ctx.seed + 3);
    ctx.box(x0, y0, z0, x0 + t, y1, z0 + h, REF_PLASTER, ctx.seed + 4);

    if (p.coping >= .5) {
      const e = .03, ch = .09;
      ctx.box(x0 - e, y1 - t - e, z0 + h, x1 + e, y1 + e, z0 + h + ch, REF_LAUNDRY_STONE, ctx.seed + 5);
      ctx.box(x1 - t - e, y0 - e, z0 + h, x1 + e, y1 + e, z0 + h + ch, REF_LAUNDRY_STONE, ctx.seed + 6);
      ctx.box(x0 - e, y0 - e, z0 + h, x1 + e, y0 + t + e, z0 + h + ch, REF_LAUNDRY_STONE, ctx.seed + 7);
      ctx.box(x0 - e, y0 - e, z0 + h, x0 + t + e, y1 + e, z0 + h + ch, REF_LAUNDRY_STONE, ctx.seed + 8);
    }

    ctx.shadow(Math.max(p.width, p.depth) * .55, 1, .4);
  },
});

/* ================= 6. water-tank 屋顶水箱（laundry:141） ================= */
KIT.register({
  id: 'water-tank',
  name: '屋顶水箱',
  category: 'building',
  desc: '卧倒的圆柱水箱：分段罐体 + 金属箍 + 顶部检修口，可架在石墩上',
  params: {
    length: { def: 1.8, min: .8, max: 3.2, step: .05, desc: '水箱长度（x 方向）' },
    radius: { def: .55, min: .3, max: 1,   step: .05, desc: '罐体半径' },
    lift:   { def: 1.0, min: 0,  max: 2.6, step: .05, desc: '罐底离地高度（0 = 落地）' },
    bands:  { def: 3,   min: 0,  max: 6,   step: 1,   desc: '分段/金属箍数量' },
  },
  collision: { type: 'box', w: 1.9, d: 1.3, h: 2.1 },

  draw(ctx) {
    const p = ctx.params, z0 = ctx.z || 0;
    const r = p.radius, len = p.length, lift = p.lift;
    const cz = z0 + lift + r;
    const TANK = [226, 218, 202], TANK_DK = [182, 174, 160], TANK_HI = [238, 232, 220];

    /* 石墩：罐底以下 */
    if (lift > .02) {
      for (const s of [-1, 1]) {
        const bx = ctx.x + s * len * .32;
        ctx.box(bx - .12, ctx.y - .28, z0, bx + .12, ctx.y + .28,
          z0 + Math.min(lift + r * .35, lift + r), TANK_DK, ctx.seed + (s > 0 ? 1 : 2));
      }
    }

    /* 罐体分 N 段画，段间色差读成焊接/拼装缝 */
    const segs = Math.max(1, (p.bands | 0) + 1);
    for (let k = 0; k < segs; k++) {
      const a0 = ctx.x - len / 2 + len * k / segs;
      const a1 = ctx.x - len / 2 + len * (k + 1) / segs;
      const col = (k % 2) ? TANK_DK : TANK;
      ctx.capsule([a0, ctx.y, cz], [a1, ctx.y, cz], r, r, () => col, 'rough');
    }

    /* 端盖亮环 */
    for (const s of [-1, 1]) {
      ctx.capsule([ctx.x + s * len * .5, ctx.y, cz], [ctx.x + s * len * .5, ctx.y, cz],
        r * 1.03, r * 1.03, () => TANK_HI, 'rough');
    }

    /* 金属箍：yz 平面上的细环，靠深度测试只露朝相机的一段 */
    const hoop = ctx.rgb(88, 86, 82);
    for (let k = 1; k < segs; k++) {
      const hx = ctx.x - len / 2 + len * k / segs;
      for (let t = 0; t < 6.283; t += .12)
        ctx.plot(hx, ctx.y + Math.cos(t) * r * 1.03, cz + Math.sin(t) * r * 1.03, hoop);
    }

    /* 顶部检修口 */
    ctx.box(ctx.x - .14, ctx.y - .14, cz + r - .03,
      ctx.x + .14, ctx.y + .14, cz + r + .1, TANK_DK, ctx.seed + 9);

    ctx.shadow(len * .55, 1, .4);
  },
});

/* ================= 7. chimney 烟囱（laundry:144） ================= */
KIT.register({
  id: 'chimney',
  name: '烟囱',
  category: 'building',
  desc: '三层收分烟囱：石砌身 + 灰泥压顶 + 陶土帽，每层向外挑出',
  params: {
    width:  { def: 1.1, min: .5, max: 2,   step: .05, desc: '烟囱宽（x 方向）' },
    depth:  { def: 1.1, min: .5, max: 2,   step: .05, desc: '烟囱深（y 方向）' },
    height: { def: 2.8, min: .8, max: 5,   step: .1,  desc: '石砌身高度' },
    cap:    { def: .15, min: 0,  max: .4,  step: .01, desc: '压顶每侧挑出' },
    pot:    { def: 1,   min: 0,  max: 1,   step: 1,   desc: '是否带陶土烟囱帽' },
  },
  collision: { type: 'box', w: 1.1, d: 1.1, h: 3.4 },

  draw(ctx) {
    const p = ctx.params, z0 = ctx.z || 0, step = .06;
    const x0 = ctx.x - p.width / 2, x1 = ctx.x + p.width / 2;
    const y0 = ctx.y - p.depth / 2, y1 = ctx.y + p.depth / 2;
    const stone = ctx.rampOf(REF_STONE);

    ctx.box(x0, y0, z0, x1, y1, z0 + p.height, REF_STONE, ctx.seed + 7);

    /* 石缝：贴在墙面外 .012，不会被墙体深度吃掉 */
    for (let z = .34; z < p.height; z += .34) {
      for (let a = x0; a <= x1; a += step) ctx.plot(a, y1 + .012, z0 + z, stone[1]);
      for (let a = y0; a <= y1; a += step) ctx.plot(x1 + .012, a, z0 + z, stone[1]);
    }

    /* 灰泥压顶：略出挑 */
    const e = p.cap;
    ctx.box(x0 - e, y0 - e, z0 + p.height, x1 + e, y1 + e,
      z0 + p.height + .2, REF_PLASTER, ctx.seed + 8);

    /* 陶土帽：收进到一半宽 */
    if (p.pot >= .5) {
      const px = p.width * .26, py = p.depth * .26;
      const top = z0 + p.height + .55;
      ctx.box(ctx.x - px, ctx.y - py, z0 + p.height + .2,
        ctx.x + px, ctx.y + py, top, REF_POT, ctx.seed + 9);
      ctx.box(ctx.x - px * .45, ctx.y - py * .45, top,
        ctx.x + px * .45, ctx.y + py * .45, top + .02, [60, 48, 44], ctx.seed + 10);
    }

    refShadow(ctx, x0, y0, x1, y1, z0, z0 + p.height + .55);
  },
});

/* ================= 8. stairs 楼梯梯（mini-ramp:183） ================= */
KIT.register({
  id: 'stairs',
  name: '梯子',
  category: 'structure',
  desc: '两根侧杆 + 等距横档的金属梯，可调倾角斜靠墙面',
  params: {
    height:  { def: 2.6, min: 1,   max: 5,   step: .1,  desc: '梯子长度' },
    width:   { def: 1.0, min: .5,  max: 2,   step: .05, desc: '两杆间距' },
    lean:    { def: 12,  min: 0,   max: 40,  step: 1,   desc: '倾角（度，0 = 垂直）' },
    rungGap: { def: .55, min: .25, max: 1,   step: .05, desc: '横档间距' },
    railR:   { def: .06, min: .03, max: .12, step: .01, desc: '侧杆半径' },
  },
  collision: { type: 'box', w: 1.0, d: .8, h: 2.6 },

  draw(ctx) {
    const p = ctx.params, z0 = ctx.z || 0;
    const a = p.lean * Math.PI / 180;
    const h = p.height, topY = Math.sin(a) * h, topZ = Math.cos(a) * h;
    const xa = ctx.x - p.width / 2, xb = ctx.x + p.width / 2;
    const STEEL = [86, 88, 90], RUNG = [112, 116, 118];

    for (const x of [xa, xb])
      ctx.capsule([x, ctx.y, z0], [x, ctx.y + topY, z0 + topZ],
        p.railR * 1.2, p.railR * .9, () => STEEL, 'rough');

    /* 横档：沿梯身等距，参数 s 是沿杆距离 */
    for (let s = .6; s < h; s += p.rungGap) {
      const t = s / h, yy = ctx.y + topY * t, zz = z0 + topZ * t;
      ctx.capsule([xa, yy, zz], [xb, yy, zz], .045, .045, () => RUNG, 'solid');
    }

    for (let s = .3; s <= h; s += .6) {
      const t = s / h;
      ctx.shadowAt(ctx.x, ctx.y + topY * t, z0, .16, .85, .35);
    }
  },
});
