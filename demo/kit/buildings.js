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
  /* base 可能是光照算出的浮点：索引色阶前必须取整，否则 ramp[1.98] 是 undefined */
  const level = clamp(Math.round(base) + (tone > .78 ? 1 : tone < .16 ? -1 : 0) + seam + foot + sun, 0, 4);
  return rampOf(KIT_WOOD)[level];
}

/* ---- 屋顶瓦：横向瓦行 + 近坡亮远坡暗（亮度跟方向光走，两坡各按自身法线取档） ---- */
function kitShingle(ctx, x, y, q, seed) {
  const row = Math.floor(q * 3.4) % 2;
  const wear = hash(x * 3 | 0, y * 9 | 0) > .86 ? -1 : 0;
  const base = Math.round(ctx.lit(0, y > 0 ? 1 : -1, 0)) + row + wear;
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
    moss: { def: 0, min: 0, max: 1, step: .05, desc: '屋顶苔藓（0 = 干净的瓦）' },
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

    /* 面亮度由光源决定，不写死：各面按自身世界法线取档。
       必须先取整，否则浮点档位会索引到 undefined。 */
    const litY = Math.round(ctx.lit(0, 1, 0)), litX = Math.round(ctx.lit(1, 0, 0));
    const litTop = Math.round(ctx.lit(0, 0, 1));
    for (let a = x0; a <= x1; a += step) for (let z = 0; z <= h; z += step)
      ctx.plot(a, y1, z, kitWoodWall(a, z, litY, seed));
    for (let a = y0; a <= y1; a += step) for (let z = 0; z <= h; z += step)
      ctx.plot(x1, a, z, kitWoodWall(a, z, litX, seed + 7));

    const nw = ctx.params.windows | 0;
    for (let i = 0; i < nw; i++) {
      const u = nw === 1 ? .5 : (.3 + i * .42 / Math.max(1, nw - 1));
      const cx = lerp(x0, x1, u);
      const wz = h * .52, ww = .22, wh = .42;
      for (let a = cx - ww; a <= cx + ww; a += step) for (let z = wz; z <= wz + wh; z += step) {
        const frame = Math.abs(a - cx) < .035 || Math.abs(z - (wz + wh / 2)) < .035;
        /* 窗内 rgb(255,214,96) 是 emissive：自发光，不随方向光；窗框跟墙走 */
        ctx.plot(a, y1 + .14, z, frame ? rampOf(KIT_WOOD_LIT)[litY] : rgb(255, 214, 96));
      }
      for (let a = cx - ww - .07; a <= cx + ww + .07; a += step)
        ctx.plot(a, y1 + .12, wz - .04, rampOf(KIT_WOOD_DARK)[clamp(litY - 1, 0, 4)]);
    }

    const dx = lerp(x0, x1, .5), dw = .28, dh = .78;
    for (let a = dx - dw; a <= dx + dw; a += step) for (let z = 0; z <= dh; z += step)
      ctx.plot(a, y1 + .14, z, rampOf(KIT_DOOR)[clamp(litY - 1 + (Math.floor(a * 6) % 2 ? 0 : -1), 0, 4)]);
    for (let z = 0; z <= dh + .06; z += step) {
      ctx.plot(dx - dw - .05, y1 + .14, z, rampOf(KIT_WOOD_DARK)[litY]);
      ctx.plot(dx + dw + .05, y1 + .14, z, rampOf(KIT_WOOD_DARK)[litY]);
    }
    for (let s = 0; s < 3; s++) {
      const z = .06 + s * .05, spread = .34 + s * .12;
      for (let a = dx - spread; a <= dx + spread; a += step)
        ctx.plot(a, y1 + .3 + s * .16, z,
          rampOf(KIT_STONE)[clamp(litTop - 1 + (hash(a * 8 | 0, s) > .5 ? 1 : 0), 0, 4)]);
    }

    if (balD > .01) {
      const bz = h * .55, bx0 = x0 + .35, bx1 = x1 - .35, by = y1 + balD;
      for (let a = bx0; a <= bx1; a += step)
        for (let b = y1; b <= by; b += step)
          ctx.plot(a, b, bz, kitWoodWall(a, bz, litTop - .4, seed + 3));
      for (let a = bx0; a <= bx1; a += step)
        for (let z = bz - .16; z < bz; z += .04)
          ctx.plot(a, by, z, rampOf(KIT_WOOD_DARK)[clamp(litY - 1, 0, 4)]);
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
        c = kitShingle(ctx, x, y, q, seed);
      }
      ctx.plot(x, y, z, c);
    }
    for (let y = ry0; y <= ry1; y += .04) {
      const q = Math.abs(y - yc) / half;
      for (let hg = 0; hg <= rise * (1 - q); hg += .04)
        ctx.plot(x1, y, h + hg, kitWoodWall(y, h + hg, litX, seed + 7));
    }
    for (let x = rx0; x <= rx1; x += .04) for (let y = ry0; y <= ry1; y += .04) {
      const q = Math.abs(y - yc) / half;
      if (q > .93) ctx.plot(x, y, h + rise * (1 - q), rampOf(KIT_WOOD_DARK)[clamp(litY - 1, 0, 4)]);
    }

    if (ctx.params.chimney >= 1) {
      const cx = ctx.x + .6, cy = ctx.y, ch = h + rise + .5, cw = .22;
      for (let a = cx - cw; a <= cx + cw; a += step) for (let z = 0; z <= ch; z += step)
        ctx.plot(a, cy + cw, z, rampOf(KIT_CHIMNEY)[clamp(litY + (Math.floor(z * 2.2) % 2 ? 0 : -1), 0, 4)]);
      for (let a = cx - cw; a <= cx + cw; a += step) for (let z = 0; z <= ch; z += step)
        ctx.plot(cx + cw, a, z, rampOf(KIT_CHIMNEY)[litX]);
    }

    ctx.shadow(w * .6, 1, .4);
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

/* ---- 落叶小屋 · forest-cabin ---- */
KIT.register({
  id: 'forest-cabin',
  name: '落叶小屋',
  category: 'building',
  desc: '林中木屋：石基木板墙 + 陡坡屋顶覆满金黄落叶，檐口垂下叶串',
  params: {
    width:  { def: 3.2, min: 2.4, max: 4.4, step: 0.1,  desc: '屋身宽度' },
    depth:  { def: 2.6, min: 1.8, max: 3.6, step: 0.1,  desc: '屋身进深' },
    height: { def: 1.9, min: 1.4, max: 2.6, step: 0.1,  desc: '檐口高度' },
    pitch:  { def: 1.0, min: 0.5, max: 1.6, step: 0.05, desc: '屋顶陡度（脊高倍数）' },
    leaves: { def: 0.8, min: 0,   max: 1,   step: 0.05, desc: '屋顶落叶覆盖密度' },
    warm:   { def: 0.45, min: 0,  max: 1,   step: 0.05, desc: '叶色偏橙程度' },
    lamp:   { def: 1,   min: 0,   max: 1,   step: 1,    desc: '窗内是否亮灯' }
  },
  collision: { type: 'box', width: 3.4, depth: 2.8, height: 3.2 },

  draw(ctx, inst) {
    const P = ctx.params, S = ctx.seed;
    const X = ctx.x, Y = ctx.y, Z = ctx.z;
    const W = P.width * 0.5, D = P.depth * 0.5, H = P.height;
    const OV = 0.3;                            // 檐口出挑
    const RIDGE = H + D * 0.92 * P.pitch;      // 屋脊高度
    const t = P.warm;
    const mix = (a, b) => Math.round(ctx.lerp(a, b, t));

    // —— 基色（只喂 box） ——
    const WOOD  = [124, 94, 66];
    const STONE = [110, 108, 102];
    const CHIM  = [134, 130, 122];

    // —— 面光照档位（跟方向光；取整后才能索引色阶） ——
    const litXp = Math.round(ctx.lit(1, 0, 0));    // +x 山墙
    const litXn = Math.round(ctx.lit(-1, 0, 0));   // -x 山墙
    const litNear = Math.round(ctx.lit(0, 1, 0));  // 近坡屋面
    const litFar = Math.round(ctx.lit(0, -1, 0));  // 远坡屋面

    // —— 打包像素色（只喂 plot） ——
    const seamC  = ctx.rgb(96, 72, 50);
    /* 山墙/屋面是面材质：亮度吃光照档位，色相仍是原来的两档色差 */
    const wallA  = ctx.rampOf([128, 98, 70]);
    const wallB  = ctx.rampOf([112, 84, 60]);
    const doorC  = ctx.rgb(84, 60, 42);
    const frameC = ctx.rgb(64, 46, 32);
    const roofC  = ctx.rampOf([90, 74, 60]);
    const roofD  = ctx.rampOf([74, 60, 48]);
    const leafA  = ctx.rgb(mix(238, 226), mix(200, 156), mix(104, 70));
    const leafB  = ctx.rgb(mix(220, 208), mix(176, 134), mix(78, 54));
    const leafC  = ctx.rgb(mix(198, 186), mix(150, 112), mix(58, 40));
    /* emissive：窗内是自发光，不随方向光（关灯时是深色玻璃，也保持原样） */
    const winIn  = P.lamp > 0.5 ? ctx.rgb(255, 232, 168) : ctx.rgb(126, 140, 146);
    const winHi  = P.lamp > 0.5 ? ctx.rgb(248, 202, 116) : ctx.rgb(104, 118, 126);

    // 1. 石基 + 墙身
    ctx.box(X - W - 0.08, Y - D - 0.08, Z, X + W + 0.08, Y + D + 0.08, Z + 0.28, STONE, S);
    ctx.box(X - W, Y - D, Z + 0.28, X + W, Y + D, Z + H, WOOD, S + 11);

    // 2. 木板横缝（四面都铺，深度测试自动选可见面）
    for (let z = Z + 0.44; z < Z + H - 0.06; z += 0.26) {
      for (let x = -W + 0.06; x < W - 0.02; x += 0.09) {
        ctx.plot(X + x, Y + D + 0.03, z, seamC);
        ctx.plot(X + x, Y - D - 0.03, z, seamC);
      }
      for (let y = -D + 0.06; y < D - 0.02; y += 0.09) {
        ctx.plot(X + W + 0.03, Y + y, z, seamC);
        ctx.plot(X - W - 0.03, Y + y, z, seamC);
      }
    }

    // 3. 墙面面板助手：axis 'y' 贴前后墙，'x' 贴左右墙
    function face(axis, sgn, u0, v0, hw, hh, body, hi) {
      for (let u = -hw; u <= hw + 1e-6; u += 0.06) {
        for (let v = -hh; v <= hh + 1e-6; v += 0.06) {
          const edge = Math.abs(u) > hw - 0.055 || Math.abs(v) > hh - 0.05;
          const c = edge ? frameC : (v > hh * 0.2 ? hi : body);
          if (axis === 'y') ctx.plot(u0 + u, Y + sgn * (D + 0.05), v0 + v, c);
          else              ctx.plot(X + sgn * (W + 0.05), u0 + u, v0 + v, c);
        }
      }
    }

    // 门（前墙偏左）+ 把手
    face('y', 1, X - W * 0.42, Z + 0.28 + 0.52, 0.26, 0.52, doorC, doorC);
    ctx.plot(X - W * 0.42 + 0.2, Y + D + 0.07, Z + 0.28 + 0.5, ctx.rgb(214, 178, 96));
    // 四面各一扇窗
    face('y',  1, X + W * 0.45, Z + 1.34, 0.22, 0.17, winIn, winHi);
    face('y', -1, X + W * 0.45, Z + 1.34, 0.22, 0.17, winIn, winHi);
    face('x',  1, Y + D * 0.12, Z + 1.34, 0.22, 0.17, winIn, winHi);
    face('x', -1, Y + D * 0.12, Z + 1.34, 0.22, 0.17, winIn, winHi);

    // 4. 山墙三角（±x 端面，用 plot 铺平面；两面各按自身法线取档）
    for (let y = -D; y <= D + 1e-6; y += 0.09) {
      const top = Z + H + (RIDGE - H) * (1 - Math.abs(y) / D);
      for (let z = Z + H; z <= top; z += 0.09) {
        const hi = ctx.hash(Math.round((y + 4) * 43) + Math.round((z - Z) * 71), S) > 0.5;
        ctx.plot(X + W + 0.01, Y + y, z, (hi ? wallA : wallB)[litXp]);
        ctx.plot(X - W - 0.01, Y + y, z, (hi ? wallA : wallB)[litXn]);
      }
    }

    // 5. 双坡屋面 + 落叶覆盖
    const halfX = W + 0.06;
    const nU = 24, nV = 15;
    for (let sg = 1; sg >= -1; sg -= 2) {
      const base = sg > 0 ? 0 : 701;
      const litRoof = sg > 0 ? litNear : litFar;   // 两坡各按 ±y 法线
      for (let iu = 0; iu <= nU; iu++) {
        const u = -1 + 2 * iu / nU;
        const px = X + u * halfX;
        for (let iv = 0; iv <= nV; iv++) {
          const v = iv / nV;
          const py = Y + sg * (D + OV) * (1 - v);
          const pz = Z + H + (RIDGE - H) * v;
          // 屋面底色（暗木瓦）：亮度跟光照，两档色差仍是材质
          ctx.plot(px, py, pz, (ctx.hash(iu * 31 + iv * 17 + base, S) > 0.4 ? roofC : roofD)[litRoof]);

          // 落叶：低频噪声成团 + 檐口/屋脊加密
          const cov = ctx.noise((u + 1) * 2.6 + (sg > 0 ? 0 : 11), v * 2.2 + 3.7);
          const boost = 0.22 * (1 - v) + 0.12 * v * v * v;
          if (cov + boost > 0.95 - P.leaves * 0.7) {
            const g = ctx.hash(iu * 73 + iv * 149 + base, S + 3);
            if (g > 0.12) {
              const lc = g > 0.78 ? leafA : g > 0.42 ? leafB : leafC;
              ctx.plot(px, py, pz + 0.05, lc);   // 抬高一点，压过屋面底色
            }
          }
        }
      }
    }

    // 6. 檐口垂下的叶串（两坡各一排）
    for (let sg = 1; sg >= -1; sg -= 2) {
      for (let iu = 0; iu <= nU * 2; iu++) {
        const u = -1 + iu / nU;
        const g = ctx.hash(iu * 97 + 23 + (sg > 0 ? 0 : 313), S + 21);
        if (g < P.leaves * 0.85) {
          const px = X + u * halfX;
          const py = Y + sg * (D + OV + 0.02);
          const pz = Z + H - 0.03 - g * 0.18;
          ctx.plot(px, py, pz, g > 0.45 ? leafB : leafC);
          ctx.plot(px, py, pz - 0.08, leafC);
        }
      }
    }

    // 7. 石烟囱（从屋面穿出）+ 顶部落叶
    const chX = X - W * 0.46, chY = Y + D * 0.08;
    const roofAt = Z + H + (RIDGE - H) * (1 - Math.abs(chY - Y) / (D + OV));
    ctx.box(chX - 0.21, chY - 0.21, roofAt - 0.4, chX + 0.21, chY + 0.21, roofAt + 0.52, CHIM, S + 7);
    for (let i = 0; i < 7; i++) {
      const g = ctx.hash(i * 37 + 9, S + 33);
      ctx.plot(chX - 0.18 + g * 0.36, chY - 0.18 + ctx.hash(i * 53 + 3, S) * 0.36,
               roofAt + 0.54, g > 0.5 ? leafA : leafB);
    }

    // 8. 地面阴影
    ctx.shadow(W + 0.5, 1, 0.5);
  }
});

/* ---- 棚屋 · shed ---- */
KIT.register({
  id: 'shed',
  name: '棚屋',
  category: 'building',
  desc: '四根木柱撑起的单坡顶木棚：屋顶由一叠水平薄板叠成阶梯斜面，板板有厚度，斜看也不透光',
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
    const OX = ctx.x, OY = ctx.y, z0 = ctx.z || 0;
    const W = p.width, D = p.depth;
    const hw = W / 2, hd = D / 2;
    const hF = p.frontH;
    const hB = Math.max(p.backH, hF + 0.25);
    const t = p.thickness, oh = p.overhang;
    const slope = (hB - hF) / D;

    const BARK = [116, 84, 54], BARK_HI = [138, 104, 70], BARK_LO = [92, 66, 42];

    // 高度场：y = OY-hd 处为前檐 hF，y = OY+hd 处为后脊 hB，挑出段顺着坡继续延伸
    const zAt = (wy) => z0 + Math.max(0.06, hF + (wy - OY + hd) * slope);

    // 四根立柱：顶端插进屋顶板底 0.02，不再穿出屋面
    const px = [-hw, hw, -hw, hw];
    const py = [-hd, -hd, hd, hd];
    for (let i = 0; i < 4; i++) {
      const cx = OX + px[i], cy = OY + py[i];
      const top = Math.max(z0 + 0.2, zAt(cy) - t + 0.02);
      ctx.capsule([cx, cy, z0], [cx, cy, top], p.postR * 1.15, p.postR * 0.88,
        z => (z - z0) > (top - z0) * 0.78 ? BARK_HI
           : (z - z0) > (top - z0) * 0.22 ? BARK : BARK_LO,
        'rough');
    }

    // 屋顶：一叠水平薄板箱体叠出斜面。
    // 斜的单层面片在等距下会被压成一条带（就是"透明"的来源）；
    // 水平顶面法线朝上，永远不会与视线平行，每段 box 还自带厚度与竖直前立面。
    const xa = OX - hw - oh, xb = OX + hw + oh;
    const ya = OY - hd - oh, yb = OY + hd + oh;
    const seg = Math.max(8, Math.min(60, Math.round(D / 0.08)));
    for (let i = 0; i < seg; i++) {
      const y0 = ya + (yb - ya) * (i / seg);
      const y1 = ya + (yb - ya) * ((i + 1) / seg);
      const f = (i + 0.5) / seg;                  // 0 = 前檐，1 = 后脊
      const zt = zAt((y0 + y1) / 2);
      const zb = Math.max(z0 + 0.04, zt - t);
      const g = Math.round(84 + 36 * f);          // 近脊受光更亮
      ctx.box(xa, y0, zb, xb, y1, zt, [g, g + 5, g + 9], ctx.seed + i);
    }

    ctx.shadow(Math.max(W, D) * 0.58, 1, 0.5);
  },
});
