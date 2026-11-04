'use strict';
/* ------------------------------------------------------------------
 * 构件库 · 建筑（building）
 *
 * 严格照抄 docs/kit/buildings.md 的配方：
 *   wood-house —— 风化木板墙 + 坡屋顶 + 亮灯窗（含 balcony 阳台参数组）
 *   stone-mill —— 错缝石砌磨坊 + 双坡瓦顶 + 石台与可转动双层石磨盘
 *   arch       —— 错缝石墙 + 极角分缝券石环半椭圆拱门
 *   shed       —— 四柱单坡顶敞棚
 *   well-house —— 圆环石砌井台 + 双木柱横梁支架 + 麻绳吊桶
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

/* ---- 木屋：木板墙 + 坡屋顶 + 亮窗 + 门（含 balcony 阳台参数组） ---- */
KIT.register({
  id: 'wood-house',
  name: '木屋',
  category: 'building',
  desc: '风化木板墙 + 坡屋顶 + 亮着灯的窗（含阳台参数组）',
  params: {
    width: { def: 4.4, min: 1.5, max: 10, step: .1, desc: '宽（x 方向）' },
    depth: { def: 3.4, min: 1.2, max: 8, step: .1, desc: '深（y 方向）' },
    height: { def: 2.8, min: 1.2, max: 6, step: .1, desc: '墙高' },
    rise: { def: 1.2, min: 0, max: 3, step: .05, desc: '屋顶升起' },
    moss: { def: .3, min: 0, max: 1, step: .05, desc: '屋顶苔藓' },
    chimney: { def: 0, min: 0, max: 1, step: 1, desc: '有烟囱' },
    windows: { def: 2, min: 0, max: 4, step: 1, desc: '窗户数' },
    balconyDepth: { def: 0, min: 0, max: 2, step: .1, desc: '阳台挑出深度（0=无阳台）' },
    balconyRail: { def: .5, min: 0, max: 1.2, step: .05, desc: '阳台栏杆高（0=无栏杆）' },
  },
  collision: { type: 'box', w: 4.4, d: 3.4, h: 2.8 },
  draw(ctx, inst) {
    const w = ctx.params.width, d = ctx.params.depth;
    const h = ctx.params.height, rise = ctx.params.rise;
    const step = .045;
    const x0 = ctx.x - w / 2, x1 = ctx.x + w / 2;
    const y0 = ctx.y - d / 2, y1 = ctx.y + d / 2;
    const seed = ctx.seed;
    const balD = ctx.params.balconyDepth || 0;
    const balRail = ctx.params.balconyRail || 0;

    for (let a = x0; a <= x1; a += step) for (let z = 0; z <= h; z += step)
      ctx.plot(a, y1, z, kitWoodWall(a, z, 3, seed));
    for (let a = y0; a <= y1; a += step) for (let z = 0; z <= h; z += step)
      ctx.plot(x1, a, z, kitWoodWall(a, z, 2, seed + 7));

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

    const dx = lerp(x0, x1, .5), dw = .28, dh = .78;
    for (let a = dx - dw; a <= dx + dw; a += step) for (let z = 0; z <= dh; z += step)
      ctx.plot(a, y1 + .14, z, rampOf(KIT_DOOR)[2 + (Math.floor(a * 6) % 2 ? 0 : -1)]);
    for (let z = 0; z <= dh + .06; z += step) {
      ctx.plot(dx - dw - .05, y1 + .14, z, rampOf(KIT_WOOD_DARK)[3]);
      ctx.plot(dx + dw + .05, y1 + .14, z, rampOf(KIT_WOOD_DARK)[3]);
    }
    for (let s = 0; s < 3; s++) {
      const z = .06 + s * .05, spread = .34 + s * .12;
      for (let a = dx - spread; a <= dx + spread; a += step)
        ctx.plot(a, y1 + .3 + s * .16, z, rampOf(KIT_STONE)[2 + (hash(a * 8 | 0, s) > .5 ? 1 : 0)]);
    }

    if (balD > .01) {
      const bz = h * .55, bx0 = x0 + .35, bx1 = x1 - .35, by = y1 + balD;
      for (let a = bx0; a <= bx1; a += step)
        for (let b = y1; b <= by; b += step)
          ctx.plot(a, b, bz, kitWoodWall(a, bz, 2, seed + 3));
      for (let a = bx0; a <= bx1; a += step)
        for (let z = bz - .16; z < bz; z += .04)
          ctx.plot(a, by, z, rampOf(KIT_WOOD_DARK)[2]);
      for (let a = bx0 + .3; a <= bx1 - .3; a += .7) {
        ctx.capsule([a, y1 + .05, bz - .62], [a, by - .12, bz - .04],
          .055, .05, () => KIT_WOOD_DARK, 'rough');
      }
      if (balRail > .01) {
        const rTop = bz + balRail, nPost = Math.max(2, Math.round((bx1 - bx0) / .55));
        for (let i = 0; i <= nPost; i++) {
          const a = lerp(bx0, bx1, i / nPost);
          ctx.capsule([a, by, bz], [a, by, rTop], .045, .038, () => KIT_WOOD, 'rough');
        }
        ctx.capsule([bx0, by, rTop], [bx1, by, rTop], .05, .05, () => KIT_WOOD_LIT, 'rough');
        ctx.capsule([bx0, by, bz + balRail * .55], [bx1, by, bz + balRail * .55],
          .035, .035, () => KIT_WOOD, 'rough');
      }
    }

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
    for (let y = ry0; y <= ry1; y += .04) {
      const q = Math.abs(y - yc) / half;
      for (let hg = 0; hg <= rise * (1 - q); hg += .04)
        ctx.plot(x1, y, h + hg, kitWoodWall(y, h + hg, 2, seed + 7));
    }
    for (let x = rx0; x <= rx1; x += .04) for (let y = ry0; y <= ry1; y += .04) {
      const q = Math.abs(y - yc) / half;
      if (q > .93) ctx.plot(x, y, h + rise * (1 - q), rampOf(KIT_WOOD_DARK)[2]);
    }

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

/* ---- 棚屋 · shed ---- */
function shedRoofDeck(ctx, xa, xb, ya, yb, zAt, ramp) {
  const sx = 0.06, sy = 0.055;
  for (let y = ya; y <= yb + 1e-6; y += sy) {
    const z = zAt(y);
    const front = (y - ya) < 0.14 ? 1 : 0;
    for (let x = xa; x <= xb + 1e-6; x += sx) {
      const band = Math.floor((x - xa) / 0.26) & 1;
      const rust = ctx.hash((x * 31 + y * 17) | 0, ctx.seed) > 0.965 ? 1 : 0;
      ctx.plot(x, y, z, ramp[(band ? 3 : 2) - front - rust]);
    }
  }
}

function shedRoofRim(ctx, xa, xb, ya, yb, zAt, drop, ramp) {
  const s = 0.05;
  const zA = zAt(ya), zB = zAt(yb);
  for (let x = xa; x <= xb + 1e-6; x += s) {
    for (let z = zA - drop; z <= zA + 1e-6; z += s) ctx.plot(x, ya, z, ramp[0]);
    for (let z = zB - drop; z <= zB + 1e-6; z += s) ctx.plot(x, yb, z, ramp[0]);
  }
  for (let y = ya; y <= yb + 1e-6; y += s) {
    const zT = zAt(y);
    for (let z = zT - drop; z <= zT + 1e-6; z += s) {
      ctx.plot(xa, y, z, ramp[1]);
      ctx.plot(xb, y, z, ramp[1]);
    }
  }
}

KIT.register({
  id: 'shed',
  name: '棚屋',
  category: 'building',
  desc: '四根木柱撑起的单坡顶敞棚，不封墙',
  params: {
    width:     { def: 2.6,  min: 1.4, max: 4.5,  step: 0.1,  desc: '棚屋宽度（x 跨度）' },
    depth:     { def: 2.0,  min: 1.2, max: 4.0,  step: 0.1,  desc: '棚屋进深（y 跨度，坡向沿此轴）' },
    frontH:    { def: 1.5,  min: 0.8, max: 3.0,  step: 0.1,  desc: '前檐柱高（低边）' },
    backH:     { def: 2.3,  min: 1.0, max: 4.0,  step: 0.1,  desc: '后檐柱高（高边）' },
    postR:     { def: 0.11, min: 0.06, max: 0.24, step: 0.01, desc: '立柱半径' },
    thickness: { def: 0.13, min: 0.07, max: 0.3,  step: 0.01, desc: '屋面板厚度' },
    overhang:  { def: 0.2,  min: 0,   max: 0.5,  step: 0.02, desc: '屋檐四周挑出' },
  },
  collision: { type: 'box', w: 2.6, d: 2.0, h: 2.3 },
  draw(ctx, inst) {
    const p = ctx.params;
    const z0 = ctx.z || 0;
    const W = p.width, D = p.depth;
    const hw = W / 2, hd = D / 2;
    const hF = p.frontH;
    const hB = Math.max(p.backH, hF + 0.2);
    const t = p.thickness, oh = p.overhang;
    const OX = ctx.x, OY = ctx.y;
    const slope = (hB - hF) / D;

    const BARK = [118, 86, 56], BARK_HI = [136, 102, 68], BARK_LO = [96, 70, 46];
    const ramp = ctx.rampOf([98, 106, 112]);

    const zAt = (wy) => {
      const ly = wy - OY;
      return z0 + Math.max(0.08, hF + (ly + hd) * slope);
    };

    const xa = OX - hw - oh, xb = OX + hw + oh;
    const ya = OY - hd - oh, yb = OY + hd + oh;

    const px = [-hw, hw, -hw, hw];
    const py = [-hd, -hd, hd, hd];
    for (let i = 0; i < 4; i++) {
      const cx = OX + px[i], cy = OY + py[i];
      const top = Math.max(z0 + 0.15, zAt(cy) - t + 0.03);
      ctx.capsule([cx, cy, z0], [cx, cy, top], p.postR * 1.15, p.postR * 0.88,
        z => (z - z0) > (top - z0) * 0.78 ? BARK_HI
           : (z - z0) > (top - z0) * 0.22 ? BARK : BARK_LO,
        'rough');
    }

    shedRoofDeck(ctx, xa, xb, ya, yb, zAt, ramp);
    shedRoofRim(ctx, xa, xb, ya, yb, zAt, t, ramp);

    ctx.shadow(Math.max(W, D) * 0.58, 1, 0.5);
  },
});

/* ---- 水井 · well-house ---- */
KIT.register({
  id: 'well-house',
  name: '水井',
  category: 'building',
  desc: '圆环石砌井台，两根木柱撑起横梁，麻绳吊着木桶',
  params: {
    radius: { def: 1.1, min: 0.7, max: 1.8, step: 0.05, desc: '井口外半径' },
    height: { def: 0.6, min: 0.35, max: 1.1, step: 0.05, desc: '石砌井台高度' },
    frameHeight: { def: 1.4, min: 0.9, max: 2.2, step: 0.05, desc: '井台以上的支架高度' },
  },
  collision: { type: 'cylinder', radius: 1.25, height: 0.6 },

  draw(ctx) {
    const bx = ctx.x, by = ctx.y, bz = ctx.z || 0;
    const R = ctx.params.radius, wallH = ctx.params.height, frameH = ctx.params.frameHeight;
    const TAU = Math.PI * 2;

    const STONE = [122, 118, 110], STONE_HI = [141, 137, 127], STONE_DK = [103, 99, 93], STONE_TOP = [150, 146, 135];
    const WOOD = [112, 82, 52], WOOD_DK = [94, 68, 43], WOOD_HI = [131, 99, 64];
    const ROPE = [178, 154, 106], BUCKET = [126, 90, 55], BUCKET_DK = [106, 74, 44];

    const wr = Math.max(0.18, R - 0.34);
    for (let gx = -wr; gx <= wr; gx += 0.09) {
      for (let gy = -wr; gy <= wr; gy += 0.09) {
        if (gx * gx + gy * gy > wr * wr) continue;
        const n = ctx.hash((Math.round(gx * 40) + 64) * 97 + Math.round(gy * 40) + 64, ctx.seed);
        ctx.plot(bx + gx, by + gy, bz + 0.07,
          ctx.rgb(26 + Math.round(n * 6), 48 + Math.round(n * 5), 54 + Math.round(n * 4)));
      }
    }

    const SEG = 16;
    const courses = Math.max(2, Math.round(wallH / 0.24));
    const courseH = wallH / courses;
    const stoneR = Math.min(0.16, courseH * 0.62);
    const ringR = R - stoneR;

    for (let c = 0; c < courses; c++) {
      const zc = bz + courseH * (c + 0.5);
      const spin = (c % 2) * (Math.PI / SEG);
      for (let i = 0; i < SEG; i++) {
        const a0 = spin + (i + 0.04) * TAU / SEG, a1 = spin + (i + 0.96) * TAU / SEG;
        const jr = ringR + (ctx.hash(i * 11 + c * 29, ctx.seed) - 0.5) * 0.04;
        const zz = zc + (ctx.hash(i * 7 + c * 41, ctx.seed) - 0.5) * courseH * 0.12;
        const cr = stoneR * (0.88 + ctx.hash(i * 5 + c * 17 + 3, ctx.seed) * 0.16);
        const t = ctx.hash(i * 19 + c * 61, ctx.seed);
        const col = t < 0.28 ? STONE_DK : (t > 0.74 ? STONE_HI : STONE);
        ctx.capsule(
          [bx + Math.cos(a0) * jr, by + Math.sin(a0) * jr, zz],
          [bx + Math.cos(a1) * jr, by + Math.sin(a1) * jr, zz],
          cr, cr, () => col, 'rough'
        );
      }
    }

    const copR = stoneR * 1.12;
    for (let i = 0; i < SEG; i++) {
      const a0 = (i + 0.02) * TAU / SEG, a1 = (i + 0.98) * TAU / SEG;
      const t = ctx.hash(i * 23 + 7, ctx.seed);
      const col = t > 0.62 ? STONE_TOP : STONE_HI;
      ctx.capsule(
        [bx + Math.cos(a0) * (R - copR), by + Math.sin(a0) * (R - copR), bz + wallH + copR * 0.3],
        [bx + Math.cos(a1) * (R - copR), by + Math.sin(a1) * (R - copR), bz + wallH + copR * 0.3],
        copR, copR, () => col, 'rough'
      );
    }

    const postX = R + 0.12, topZ = bz + wallH + frameH;
    for (const sx of [-1, 1]) {
      ctx.capsule(
        [bx + sx * postX, by, bz], [bx + sx * postX, by, topZ],
        0.085, 0.072, z => z < bz + 0.3 ? WOOD_DK : WOOD, 'rough'
      );
    }
    ctx.box(
      bx - postX - 0.15, by - 0.075, topZ - 0.13,
      bx + postX + 0.15, by + 0.075, topZ,
      WOOD_HI, ctx.seed + 5
    );

    const bucketBot = bz + wallH + 0.24, bucketH = 0.3;
    ctx.capsule([bx, by, topZ - 0.13], [bx, by, bucketBot + bucketH], 0.022, 0.022, () => ROPE, 'solid');
    ctx.box(bx - 0.16, by - 0.16, bucketBot, bx + 0.16, by + 0.16, bucketBot + bucketH, BUCKET, ctx.seed + 11);
    ctx.box(bx - 0.18, by - 0.18, bucketBot + 0.05, bx + 0.18, by + 0.18, bucketBot + 0.11, BUCKET_DK, ctx.seed + 13);

    ctx.shadow(R + 0.5, 1, 0.5);
  },
});
