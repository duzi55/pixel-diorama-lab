'use strict';
/* ------------------------------------------------------------------
 * 构件库 · 草木（plant）
 *
 * 严格照抄 docs/kit/plants.md 的配方：
 *   shrub      —— 无干矮球丛
 *   hedge      —— 沿路径密集排布的修剪树篱带
 *   grass-tuft —— 簇生弯草叶
 *   fern       —— 辐射羽状蕨叶（沿抛物线弧下垂）
 *   reed       —— 细高弯苇秆 + 毛茸茸苇穗
 *   ivy        —— 贴墙/贴地蔓延藤蔓
 * ------------------------------------------------------------------ */

/* ---- 灌木：无干矮球丛 ---- */
KIT.register({
  id: 'shrub',
  name: '灌木',
  category: 'plant',
  desc: '无干矮球丛，草丛般的低矮团块',
  params: {
    height: { def: .55, min: .2, max: 1.6, step: .05, desc: '高度' },
    radius: { def: .5, min: .2, max: 1.4, step: .05, desc: '半径' },
  },
  collision: { type: 'cylinder', radius: .5, height: .55 },
  draw(ctx, inst) {
    const h = ctx.params.height, r = ctx.params.radius;
    const cDk = [78, 98, 46], c = [96, 118, 56], cHi = [122, 146, 68];
    for (let k = 0; k < 8; k++) {
      const kk = ctx.seed + k * 17;
      const a = hash(kk, 97) * 6.283, d = Math.cbrt(hash(kk, 98)) * r;
      const z = h * (.45 + hash(kk, 99) * .55);
      const col = z > h * .75 ? cHi : z < h * .58 ? cDk : c;
      ctx.sphere(ctx.x + Math.cos(a) * d, ctx.y + Math.sin(a) * d,
        z, r * (.46 + hash(kk, 101) * .28), col, 'rough');
    }
    ctx.shadow(r * 1.15, 1, .4);
  },
});

/* ---- 树篱：沿一条线密集排布灌木，形成一道绿墙 ---- */
KIT.register({
  id: 'hedge',
  name: '树篱',
  category: 'plant',
  desc: '沿路径密集排布的灌木带，顶部修剪平整',
  params: {
    length: { def: 4.0, min: 1, max: 14, step: .2, desc: '篱笆长度（沿 x 方向）' },
    height: { def: 1.0, min: .4, max: 2.4, step: .05, desc: '篱笆高度' },
    depth: { def: .7, min: .3, max: 2.4, step: .05, desc: '篱笆厚度（沿 y 方向）' },
    rows: { def: 2, min: 1, max: 4, step: 1, desc: '排布行数' },
    colGap: { def: .42, min: .2, max: 1.2, step: .02, desc: '株距' },
    trim: { def: 1, min: 0, max: 1, step: 1, desc: '顶部是否修剪平整' },
  },
  collision: { type: 'box', w: 4.0, d: .7, h: 1.0 },
  draw(ctx, inst) {
    const len = ctx.params.length, h = ctx.params.height;
    const dep = ctx.params.depth, rows = ctx.params.rows | 0;
    const gap = ctx.params.colGap, trim = ctx.params.trim >= 1;
    const leafDk = [62, 96, 44], leaf = [78, 116, 52], leafHi = [112, 148, 66];

    const nCol = Math.max(2, Math.round(len / gap));
    for (let r = 0; r < rows; r++) {
      const ry = ctx.y + (r - (rows - 1) / 2) * (dep / Math.max(1, rows - 1 || 1))
        * (rows > 1 ? 1 : 0);
      for (let c = 0; c < nCol; c++) {
        const kk = ctx.seed + c * 31 + r * 977;
        const t = nCol === 1 ? .5 : c / (nCol - 1);
        const cx = ctx.x - len / 2 + len * t;
        const cy = ry + (hash(kk, 61) - .5) * .1;

        for (let k = 0; k < 6; k++) {
          const k2 = kk + k * 13;
          const a = hash(k2, 71) * 6.283;
          const d = Math.cbrt(hash(k2, 72)) * (gap * .55);
          const px = cx + Math.cos(a) * d;
          const py = cy + Math.sin(a) * d * .7;
          const pz = trim
            ? clamp(h * (.38 + hash(k2, 73) * .5), h * .22, h * .9)
            : h * (.35 + hash(k2, 73) * .65);
          const rad = gap * (.44 + hash(k2, 74) * .22);
          const c2 = pz > h * .72 ? leafHi : pz < h * .45 ? leafDk : leaf;
          ctx.sphere(px, py, pz, rad, c2, 'rough');
        }
      }
    }
    ctx.shadow(len * .5, 1, .5);
  },
});

/* ---- 草丛：几根向上弯的细草叶 ---- */
KIT.register({
  id: 'grass-tuft',
  name: '草丛',
  category: 'plant',
  desc: '几根向上弯的细草叶',
  params: {
    height: { def: .55, min: .15, max: 1.2, step: .05, desc: '草高' },
    blades: { def: 6, min: 2, max: 11, step: 1, desc: '叶片数' },
  },
  collision: null,
  draw(ctx, inst) {
    const h = ctx.params.height, n = ctx.params.blades | 0;
    const cLo = [84, 114, 48], cHi = [122, 154, 66];
    for (let k = 0; k < n; k++) {
      const kk = ctx.seed + k * 23;
      const a = (k / n) * 6.283 + (hash(kk, 31) - .5) * .5;
      const r0 = .06 + hash(kk, 34) * .12;
      const bx = ctx.x + Math.cos(a) * r0, by = ctx.y + Math.sin(a) * r0;
      const spread = (.18 + hash(kk, 32) * .28) * h;
      const topH = h * (.72 + hash(kk, 33) * .38);
      ctx.capsule(
        [bx, by, 0],
        [bx + Math.cos(a) * spread, by + Math.sin(a) * spread, topH],
        .065, .025, z => (z > topH * .5 ? cHi : cLo), 'rough');
    }
    ctx.shadow(h * .45, 1, .4);
  },
});

/* ---- 蕨类 · fern ---- */
KIT.register({
  id: 'fern',
  name: '蕨类',
  category: 'plant',
  desc: '从基部向外辐射的羽状叶丛，叶轴沿抛物线弧下垂、末端收细',
  params: {
    fronds: { def: 7, min: 4, max: 9, step: 1, desc: '叶片数' },
    length: { def: 1.7, min: 0.9, max: 2.6, step: 0.1, desc: '叶长（世界单位）' },
    curl: { def: 0.5, min: 0, max: 1.2, step: 0.05, desc: '叶尖下垂程度' },
  },
  collision: { type: 'cylinder', radius: 0.6, height: 1.1 },

  draw(ctx) {
    const P = ctx.params;
    const seed = ctx.seed;
    const n = Math.round(P.fronds);
    const len = P.length;
    const curl = P.curl;
    const BLADE = [
      [76, 128, 54], [88, 140, 58], [98, 150, 64], [110, 160, 72], [122, 170, 82],
    ];
    const segs = 6;

    for (let i = 0; i < n; i++) {
      const ha = ctx.hash(i * 4.7 + 0.5, seed);
      const hb = ctx.hash(i * 2.9 + 1.7, seed);
      const ang = (i / n) * 6.28318 + (ha - 0.5) * 0.6;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const sx = -sa, sy = ca;

      const L = len * (0.8 + hb * 0.3);
      const lift = L * (0.5 + ha * 0.2);

      let px = ctx.x, py = ctx.y, pz = 0.05, pr = 0.07;

      for (let k = 1; k <= segs; k += 1) {
        const t = k / segs;
        const rad = L * t * 0.9;
        const x = ctx.x + ca * rad;
        const y = ctx.y + sa * rad;
        const z0 = 0.05 + t * lift;
        const z = Math.max(0.06, z0 - t * t * curl);
        const rr = Math.max(0.01, 0.075 * Math.pow(1 - t, 0.75) * (0.8 + L * 0.25));

        const ci = ctx.clamp(
          Math.round(1.4 + t * 1.6 + (hb - 0.5) * 0.9 + (ha - 0.5) * 0.6),
          0, 4
        );
        const ci2 = ctx.clamp(ci + 1, 0, 4);

        ctx.capsule(
          [px, py, pz], [x, y, z], pr, rr,
          function (u) { return u > 0.6 ? BLADE[ci2] : BLADE[ci]; },
          'rough'
        );

        if (k > 1) {
          const mx = (px + x) * 0.5, my = (py + y) * 0.5, mz = (pz + z) * 0.5 - 0.01;
          const reach = (0.11 + 0.06 * L) * (1 - t);
          const ll = Math.max(0.012, rr * 0.82);
          ctx.sphere(mx + sx * reach, my + sy * reach, mz - reach * 0.3, ll, BLADE[ci2], 'rough');
          ctx.sphere(mx - sx * reach, my - sy * reach, mz - reach * 0.3, ll, BLADE[ci], 'rough');
        }

        px = x; py = y; pz = z; pr = rr;
      }
    }

    ctx.shadow(Math.min(1.6, len * 0.8), 1, 0.5);
  },
});

/* ---- 芦苇 · reed ---- */
KIT.register({
  id: 'reed',
  name: '芦苇',
  category: 'plant',
  desc: '细高弯杆顶着毛茸茸的穗，风一吹整株大幅摇摆',
  params: {
    height: { def: 1.8, min: 1.2, max: 2.5, step: 0.1, desc: '高度（世界单位，比草高一个数量级）' },
    plume: { def: 0.36, min: 0.15, max: 0.55, step: 0.01, desc: '穗长' },
    bend: { def: 0.45, min: 0, max: 1, step: 0.05, desc: '弯曲度（静态风幅）' },
  },
  collision: { type: 'cylinder', radius: 0.22, height: 1.8 },
  draw(ctx) {
    const h = ctx.params.height;
    const plume = ctx.params.plume;
    const bend = ctx.params.bend;

    const STALK = [
      [86, 102, 70], [100, 116, 78], [112, 128, 84], [124, 138, 90], [134, 148, 98],
    ];
    const SEED = [
      [168, 144, 96], [184, 158, 106], [198, 172, 116], [214, 188, 128], [228, 204, 142],
    ];

    /* 一丛 4 根高低错落的苇秆，共享主风向但各有微扰 */
    const mainAng = ctx.hash(1, ctx.seed) * Math.PI * 2;
    for (let s = 0; s < 4; s++) {
      const sk = ctx.seed + s * 41;
      const offA = (s / 4) * Math.PI * 2 + ctx.hash(2, sk) * 0.4;
      const offR = s === 0 ? 0 : (0.08 + ctx.hash(3, sk) * 0.1);
      const bx = ctx.x + Math.cos(offA) * offR;
      const by = ctx.y + Math.sin(offA) * offR;

      const ang = mainAng + (ctx.hash(4, sk) - 0.5) * 0.35;
      const hh = h * (0.84 + ctx.hash(5, sk) * 0.24);
      const dx = Math.cos(ang), dy = Math.sin(ang);

      const sway = bend * hh * 0.45;
      const tip = [bx + dx * sway, by + dy * sway, hh];
      const ctrl = [bx + dx * sway * 0.18, by + dy * sway * 0.18, hh * 0.58];

      const at = (t) => {
        const u = 1 - t;
        return [
          u * u * bx + 2 * u * t * ctrl[0] + t * t * tip[0],
          u * u * by + 2 * u * t * ctrl[1] + t * t * tip[1],
          2 * u * t * ctrl[2] + t * t * tip[2],
        ];
      };

      const SEG = 4;
      for (let i = 0; i < SEG; i++) {
        const t0 = i / SEG, t1 = (i + 1) / SEG;
        const col = STALK[ctx.clamp(Math.round(((i + 0.5) / SEG) * 4), 0, 4)];
        ctx.capsule(at(t0), at(t1), ctx.lerp(0.04, 0.024, t0), ctx.lerp(0.04, 0.024, t1), () => col, 'rough');
      }

      const tx = tip[0] - ctrl[0], ty = tip[1] - ctrl[1], tz = tip[2] - ctrl[2];
      const tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
      const nx = tx / tl, ny = ty / tl, nz = tz / tl;

      const beads = 6;
      for (let i = 0; i < beads; i++) {
        const t = (i + 1) / beads;
        const drop = t * t * plume * 0.5;
        const px = tip[0] + nx * plume * t + dx * t * plume * 0.16;
        const py = tip[1] + ny * plume * t + dy * t * plume * 0.16;
        const pz = tip[2] + nz * plume * t - drop;
        const r = 0.055 + Math.sin(t * Math.PI) * 0.035;
        const lv = 2 + Math.round(ctx.hash(10 + i, sk));
        ctx.sphere(px, py, pz, r, SEED[ctx.clamp(lv, 0, 4)], 'rough');
      }
    }

    ctx.shadow(0.24 + h * 0.08, 1, 0.5);
  },
});

/* ---- 藤蔓 · ivy ---- */
KIT.register({
  id: 'ivy',
  name: '藤蔓',
  category: 'plant',
  desc: '贴墙或贴地蔓延的藤，沿曲线等距密布深绿小叶',
  params: {
    length:   { def: 2.6,  min: 1,    max: 6,   step: 0.1,  desc: '蔓延长度（世界单位）' },
    leafSize: { def: 0.16, min: 0.06, max: 0.4, step: 0.01, desc: '最大叶半径（越靠梢越小）' },
    surface:  { def: 0,    min: 0,    max: 1,   step: 1,    desc: '附着面：0=贴墙，1=贴地' },
  },
  collision: { type: 'cylinder', radius: 0.28, height: 2.4 },

  draw(ctx, inst) {
    const P = ctx.params;
    const wall = !(P.surface === 1 || P.surface === 'ground');
    const len = P.length;
    const leaf = P.leafSize;
    const step = 0.15;

    const DEEP_DK = [36, 68, 38], DEEP = [44, 80, 44], MID = [58, 100, 52];
    const STEM = [40, 56, 34];

    const n = Math.max(4, Math.round(len / step));
    const phase = ctx.hash(1, ctx.seed) * 6.2832;
    const amp   = 0.18 + ctx.hash(2, ctx.seed) * 0.3;
    const drift = (ctx.hash(3, ctx.seed) - 0.5) * 0.9;
    const yBase = ctx.y + 0.03;

    let px = ctx.x, py = ctx.y, pz = ctx.z;

    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const wobble = (i > 0 && i < n) ? (ctx.hash(i * 5 + 11, ctx.seed) - 0.5) * step * 0.35 : 0;
      const d = t * len + wobble;
      const sway = Math.sin(t * 5.2 + phase) * amp * (0.25 + t)
                 + Math.sin(t * 11.7 + phase * 1.7) * amp * 0.25
                 + drift * t;

      const x = wall ? ctx.x + sway : ctx.x + d;
      const y = wall ? yBase : ctx.y + sway;
      const z = wall ? ctx.z + d : ctx.z + 0.02;

      if (i > 0) {
        ctx.sphere((x + px) * 0.5, (y + py) * 0.5, (z + pz) * 0.5, 0.03, STEM, 'rough');
      }
      ctx.sphere(x, y, z, 0.03, STEM, 'rough');

      const side = (i % 2 === 0) ? 1 : -1;
      const ls = leaf * (0.72 + 0.28 * Math.min(1, t * 2.4));
      const spread = ls * (0.55 + ctx.hash(i * 7 + 3, ctx.seed) * 0.5);
      const tone = ctx.hash(i * 13 + 7, ctx.seed);
      const col = tone < 0.4 ? DEEP_DK : (tone < 0.78 ? DEEP : MID);

      if (wall) {
        ctx.sphere(x + side * spread, y + 0.03, z - ls * 0.1, ls, col, 'rough');
        ctx.sphere(x + side * (spread + ls * 0.5), y + 0.025, z - ls * 0.1, ls * 0.6, col, 'rough');
      } else {
        const lift = 0.04 + ls * 0.28;
        ctx.sphere(x, y + side * spread, z + lift, ls * 0.85, col, 'rough');
        ctx.sphere(x, y + side * (spread + ls * 0.55), z + lift * 0.85, ls * 0.5, col, 'rough');
      }

      px = x; py = y; pz = z;
    }

    ctx.shadow(wall ? 0.45 : Math.min(1.8, len * 0.32), 1, 0.5);
  },
});
