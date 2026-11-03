'use strict';
/* ------------------------------------------------------------------
 * 构件库 · 建筑与道具
 *
 * 建筑照抄 docs/kit/buildings.md 的做法：正/侧两面亮度不同自动出体积，
 * 屋顶有山墙与檐口。道具见 docs/kit/props.md。
 * ------------------------------------------------------------------ */

/* ---- 木板墙：竖向拼缝 + 每块板的色差 + 墙脚暗 + 上部浅 ---- */
function kitWoodWall(a, z, base, seed) {
  const plank = Math.floor(a * 2.6);
  const inPlank = a * 2.6 - plank;
  const seam = inPlank > .88 ? -1 : 0;
  const tone = hash(plank, seed);
  const foot = z < .55 ? -1 : 0;
  const sun = z > 1.9 ? 1 : 0;
  const level = clamp(base + (tone > .78 ? 1 : tone < .16 ? -1 : 0) + seam + foot + sun, 0, 4);
  return rampOf(KIT_WOOD)[level];
}

/* ---- 屋顶瓦：横向瓦行 + 近坡亮远坡暗 ---- */
function kitShingle(x, y, q, seed) {
  const row = Math.floor(q * 3.4) % 2;
  const wear = hash(x * 3 | 0, y * 9 | 0) > .86 ? -1 : 0;
  const base = (y > 0 ? 3 : 1) + row + wear;
  return rampOf(KIT_SHINGLE)[clamp(base, 0, 4)];
}

/* ---- 木屋：木板墙 + 坡屋顶 + 亮窗 + 门 ---- */
KIT.register({
  id: 'wood-house',
  name: '木屋',
  category: 'building',
  desc: '风化木板墙 + 坡屋顶 + 亮着灯的窗',
  params: {
    width: { def: 4.4, min: 1.5, max: 10, step: .1, desc: '宽（x 方向）' },
    depth: { def: 3.4, min: 1.2, max: 8, step: .1, desc: '深（y 方向）' },
    height: { def: 2.8, min: 1.2, max: 6, step: .1, desc: '墙高' },
    rise: { def: 1.2, min: 0, max: 3, step: .05, desc: '屋顶升起' },
    moss: { def: .3, min: 0, max: 1, step: .05, desc: '屋顶苔藓' },
    chimney: { def: 0, min: 0, max: 1, step: 1, desc: '有烟囱' },
    windows: { def: 2, min: 0, max: 4, step: 1, desc: '窗户数' },
  },
  collision: { type: 'box', w: 4.4, d: 3.4, h: 2.8 },
  draw(ctx, inst) {
    const w = ctx.params.width, d = ctx.params.depth;
    const h = ctx.params.height, rise = ctx.params.rise;
    const step = .045;
    const x0 = ctx.x - w / 2, x1 = ctx.x + w / 2;
    const y0 = ctx.y - d / 2, y1 = ctx.y + d / 2;
    const seed = ctx.seed;

    /* 正/侧两面：正面亮、侧面暗 → 自动出体积 */
    for (let a = x0; a <= x1; a += step) for (let z = 0; z <= h; z += step)
      ctx.plot(a, y1, z, kitWoodWall(a, z, 3, seed));
    for (let a = y0; a <= y1; a += step) for (let z = 0; z <= h; z += step)
      ctx.plot(x1, a, z, kitWoodWall(a, z, 2, seed + 7));

    /* 窗：凸出墙面 .14 才不会被墙盖住 */
    const nw = ctx.params.windows | 0;
    for (let i = 0; i < nw; i++) {
      const u = nw === 1 ? .5 : (.3 + i * .42 / Math.max(1, nw - 1));
      const cx = lerp(x0, x1, u);
      const wz = h * .52, ww = .22, wh = .42;
      for (let a = cx - ww; a <= cx + ww; a += step) for (let z = wz; z <= wz + wh; z += step) {
        const frame = Math.abs(a - cx) < .035 || Math.abs(z - (wz + wh / 2)) < .035;
        ctx.plot(a, y1 + .14, z, frame ? rampOf(KIT_WOOD_LIT)[3] : rgb(255, 214, 96));
      }
      for (let a = cx - ww - .07; a <= cx + ww + .07; a += step)
        ctx.plot(a, y1 + .12, wz - .04, rampOf(KIT_WOOD_DARK)[2]);
    }

    /* 门 */
    const dx = lerp(x0, x1, .5), dw = .28, dh = .78;
    for (let a = dx - dw; a <= dx + dw; a += step) for (let z = 0; z <= dh; z += step)
      ctx.plot(a, y1 + .14, z, rampOf(KIT_DOOR)[2 + (Math.floor(a * 6) % 2 ? 0 : -1)]);
    for (let z = 0; z <= dh + .06; z += step) {
      ctx.plot(dx - dw - .05, y1 + .14, z, rampOf(KIT_WOOD_DARK)[3]);
      ctx.plot(dx + dw + .05, y1 + .14, z, rampOf(KIT_WOOD_DARK)[3]);
    }
    /* 石阶 */
    for (let s = 0; s < 3; s++) {
      const z = .06 + s * .05, spread = .34 + s * .12;
      for (let a = dx - spread; a <= dx + spread; a += step)
        ctx.plot(a, y1 + .3 + s * .16, z, rampOf(KIT_STONE)[2 + (hash(a * 8 | 0, s) > .5 ? 1 : 0)]);
    }

    /* 屋顶 */
    const rx0 = x0 - .2, rx1 = x1 + .2, ry0 = y0 - .2, ry1 = y1 + .2;
    const yc = (ry0 + ry1) / 2, half = (ry1 - ry0) / 2;
    for (let x = rx0; x <= rx1; x += .04) for (let y = ry0; y <= ry1; y += .04) {
      const q = Math.abs(y - yc) / half;
      const z = h + rise * (1 - q);
      let c;
      if (ctx.params.moss > 0 && noise(x * .55 + seed, y * .55) > 1 - ctx.params.moss * .55) {
        const m = noise(x * 1.8, y * 1.8);
        c = rampOf(KIT_MOSS)[clamp(2 + Math.floor(m * 2.2), 0, 4)];
      } else {
        c = kitShingle(x, y, q, seed);
      }
      ctx.plot(x, y, z, c);
    }
    /* 山墙 */
    for (let y = ry0; y <= ry1; y += .04) {
      const q = Math.abs(y - yc) / half;
      for (let hg = 0; hg <= rise * (1 - q); hg += .04)
        ctx.plot(x1, y, h + hg, kitWoodWall(y, h + hg, 2, seed + 7));
    }
    /* 檐口：出挑那条要深色，才看得出厚度 */
    for (let x = rx0; x <= rx1; x += .04) for (let y = ry0; y <= ry1; y += .04) {
      const q = Math.abs(y - yc) / half;
      if (q > .93) ctx.plot(x, y, h + rise * (1 - q), rampOf(KIT_WOOD_DARK)[2]);
    }

    /* 烟囱 */
    if (ctx.params.chimney >= 1) {
      const cx = ctx.x + .6, cy = ctx.y, ch = h + rise + .5, cw = .22;
      for (let a = cx - cw; a <= cx + cw; a += step) for (let z = 0; z <= ch; z += step)
        ctx.plot(a, cy + cw, z, rampOf(KIT_CHIMNEY)[2 + (Math.floor(z * 2.2) % 2 ? 0 : -1)]);
      for (let a = cx - cw; a <= cx + cw; a += step) for (let z = 0; z <= ch; z += step)
        ctx.plot(cx + cw, a, z, rampOf(KIT_CHIMNEY)[1]);
    }

    ctx.shadow(w * .6, 1, .4);
  },
});

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
    /* 井壁：一圈球 */
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * 6.283;
      ctx.sphere(ctx.x + Math.cos(a) * r, ctx.y + Math.sin(a) * r, h * .5,
        r * .34, stone, 'rough');
    }
    /* 井口深色 */
    ctx.sphere(ctx.x, ctx.y, h * .35, r * .62, rgb(38, 40, 44), 'rough');
    /* 顶沿 */
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
    /* 横杆 */
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
    /* 基座 */
    for (let a = ctx.x - w * 1.5; a <= ctx.x + w * 1.5; a += .05)
      for (let b = ctx.y - w * 1.5; b <= ctx.y + w * 1.5; b += .05)
        ctx.plot(a, b, .08, rampOf(stone)[2]);
    /* 柱 */
    for (let a = ctx.x - w; a <= ctx.x + w; a += .05)
      for (let b = ctx.y - w; b <= ctx.y + w; b += .05)
        for (let z = .1; z <= h * .72; z += .05)
          ctx.plot(a, b, z, rampOf(stone)[2]);
    /* 灯室 */
    for (let a = ctx.x - w * 1.3; a <= ctx.x + w * 1.3; a += .05)
      for (let b = ctx.y - w * 1.3; b <= ctx.y + w * 1.3; b += .05)
        for (let z = h * .72; z <= h * .92; z += .05)
          ctx.plot(a, b, z, ctx.params.lit >= 1 ? rgb(255, 222, 130) : rampOf(stone)[3]);
    /* 顶盖 */
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
    /* 边框 */
    for (let a = x0; a <= x1; a += .04) {
      ctx.plot(a, y1 + .01, h * .12, rampOf(KIT_WOOD_DARK)[2]);
      ctx.plot(a, y1 + .01, h * .86, rampOf(KIT_WOOD_DARK)[2]);
    }
    ctx.shadow(s * .8, 1, .4);
  },
});
