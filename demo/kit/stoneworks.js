'use strict';
/* ------------------------------------------------------------------
 * 构件库 · 石砌构件（stoneworks）
 *
 * 从 buildings.js 拆出：错缝砌体 + 券石环一组材质算法的两个构件。
 *   stone-mill —— 错缝石砌磨坊 + 双坡瓦顶 + 石台与可转动双层石磨盘
 *   arch       —— 错缝石墙 + 极角分缝券石环半椭圆拱门
 *
 * 材质算法出处：docs/kit/buildings.md §1（砌体）、structures.md §3（极角分缝）
 * ------------------------------------------------------------------ */

/* ---- 错缝石砌墙（docs/kit/buildings.md §1） ---- */
function kitMasonryWall(a, z, base, ramp, seed) {
  const row = Math.floor(z * 2.8);
  const xo = a + (row & 1) * 0.34;
  const col = Math.floor(xo * 1.5);
  const fx = xo * 1.5 - col, fz = z * 2.8 - row;
  if (fx < 0.08 || fz < 0.11) return ramp[0];
  const tone = hash(col * 31 + row * 7, seed);
  const foot = z < 0.38 ? -1 : 0;
  /* base 由光照算出（浮点）：索引色阶前必须取整，否则 ramp[1.98] 是 undefined */
  const lv = clamp(Math.round(base) + (tone > 0.72 ? 1 : tone < 0.22 ? -1 : 0) + foot, 1, 4);
  return ramp[lv];
}


/* ---- 石磨坊 · stone-mill ---- */
KIT.register({
  id: 'stone-mill',
  name: '石磨坊',
  category: 'building',
  desc: '石砌磨坊小屋，屋旁石台上立着可绕轴转动的石磨盘与十字木推杆',
  params: {
    width:      { def: 3.4,  min: 2.4, max: 4.4, step: 0.1,  desc: '磨坊正面宽度' },
    depth:      { def: 3.0,  min: 2.2, max: 4.2, step: 0.1,  desc: '磨坊进深' },
    height:     { def: 2.6,  min: 1.8, max: 3.6, step: 0.1,  desc: '檐口墙高' },
    roofPitch:  { def: 0.45, min: 0.3, max: 0.9, step: 0.05, desc: '屋顶陡峭度，越大屋脊越高' },
    millRadius: { def: 0.9,  min: 0.6, max: 1.3, step: 0.05, desc: '石磨盘半径' },
    grindAngle: { def: 35,   min: 0,   max: 360, step: 5,    desc: '推杆方位角（度），逐帧递增即成转动动画' },
    tone:       { def: 0.5,  min: 0,   max: 1,   step: 0.05, desc: '石材冷暖：0 青灰，1 暖砂岩' },
  },
  collision: { type: 'box', w: 5.4, d: 3.2, h: 3.8 },

  draw(ctx, inst) {
    const p = ctx.params;
    const W = p.width, D = p.depth, H = p.height;
    const x0 = ctx.x - W * 0.5, x1 = ctx.x + W * 0.5;
    const y0 = ctx.y - D * 0.5, y1 = ctx.y + D * 0.5;
    const z0 = ctx.z || 0;
    const t = p.tone;
    const step = 0.045;

    const STONE_BASE = [
      Math.round(ctx.lerp(128, 166, t)),
      Math.round(ctx.lerp(132, 148, t)),
      Math.round(ctx.lerp(138, 118, t)),
    ];
    const ROOF_BASE = [94, 82, 72];
    const WOOD_BASE = [122, 88, 56];
    const WOOD_DK = [92, 66, 42];
    const SLAB_BASE = [168, 162, 148];
    const SLAB_DK = [128, 122, 112];

    const stoneRamp = ctx.rampOf(STONE_BASE);
    const roofRamp = ctx.rampOf(ROOF_BASE);
    const woodRamp = ctx.rampOf(WOOD_BASE);
    const slabRamp = ctx.rampOf(SLAB_BASE);

    /* 面亮度由方向光决定（不写死）：顶面 +z / 正面 +y / 右面 +x / 背面 -y */
    const lvTop = Math.round(ctx.lit(0, 0, 1));
    const lvY = Math.round(ctx.lit(0, 1, 0));
    const lvX = Math.round(ctx.lit(1, 0, 0));
    const lvBack = Math.round(ctx.lit(0, -1, 0));

    /* 1. 错缝石砌墙面：正面 / 右面各自按法线取档 */
    for (let a = x0; a <= x1; a += step) for (let z = 0; z <= H; z += step)
      ctx.plot(a, y1, z0 + z, kitMasonryWall(a, z, lvY, stoneRamp, ctx.seed));
    for (let a = y0; a <= y1; a += step) for (let z = 0; z <= H; z += step)
      ctx.plot(x1, a, z0 + z, kitMasonryWall(a, z, lvX, stoneRamp, ctx.seed + 19));

    /* 2. 拱顶木门 + 暖光小窗（门在正面上，比墙面暗一档；窗是自发光） */
    const dx = ctx.x - W * 0.14, dw = 0.28, dh = 0.86;
    for (let a = dx - dw; a <= dx + dw; a += step) for (let z = 0; z <= dh; z += step) {
      const u = (a - dx) / dw;
      if (z > dh - 0.16 && u * u + Math.pow((z - (dh - 0.16)) / 0.16, 2) > 1) continue;
      ctx.plot(a, y1 + 0.12, z0 + z,
        woodRamp[ctx.clamp(lvY - 1 + (Math.floor(a * 7) & 1 ? 0 : -1), 0, 4)]);
    }
    const wx = ctx.x + W * 0.22, wz = H * 0.54, ww = 0.2, wh = 0.36;
    for (let a = wx - ww; a <= wx + ww; a += step) for (let z = wz; z <= wz + wh; z += step) {
      const frame = Math.abs(a - wx) < 0.035 || Math.abs(z - (wz + wh * 0.5)) < 0.035;
      ctx.plot(a, y1 + 0.12, z0 + z,
        frame ? woodRamp[ctx.clamp(lvY - 1, 0, 4)] : ctx.rgb(255, 214, 96));  /* emissive：亮窗 */
    }

    /* 3. 双坡板岩瓦顶 + 石山墙 + 深色檐口 */
    const rise = H * p.roofPitch;
    const rx0 = x0 - 0.18, rx1 = x1 + 0.18, ry0 = y0 - 0.18, ry1 = y1 + 0.18;
    const yc = (ry0 + ry1) * 0.5, half = (ry1 - ry0) * 0.5;
    for (let x = rx0; x <= rx1; x += 0.04) for (let y = ry0; y <= ry1; y += 0.04) {
      const q = Math.abs(y - yc) / half;
      const z = z0 + H + rise * (1 - q);
      const row = Math.floor(q * half * 3.6) % 2;
      const wear = ctx.hash(x * 4 | 0, y * 9 | 0) > 0.84 ? -1 : 0;
      /* 近坡 / 远坡各自按 +y / -y 法线取档，瓦行与磨损照旧 */
      const lv = ctx.clamp((y > yc ? lvY : lvBack) + row + wear, 0, 4);
      ctx.plot(x, y, z, roofRamp[lv]);
      if (q > 0.93) ctx.plot(x, y, z - 0.03, roofRamp[0]);
    }
    for (let y = ry0; y <= ry1; y += 0.04) {
      const q = Math.abs(y - yc) / half;
      for (let hg = 0; hg <= rise * (1 - q); hg += 0.04)
        ctx.plot(x1, y, z0 + H + hg, kitMasonryWall(y, H + hg, lvX, stoneRamp, ctx.seed + 19));
    }

    /* 4. 屋旁圆形石砌磨台 + 双层石磨盘 + 十字木推杆 */
    const R = p.millRadius;
    const mx = x1 + R + 0.35, my = y1 - D * 0.28;
    const baseH = 0.38;
    const rBase = R * 1.18;
    for (let gx = -rBase; gx <= rBase; gx += 0.05) {
      for (let gy = -rBase; gy <= rBase; gy += 0.05) {
        const d2 = gx * gx + gy * gy;
        if (d2 > rBase * rBase) continue;
        const d = Math.sqrt(d2);
        ctx.plot(mx + gx, my + gy, z0 + baseH,
          stoneRamp[d > rBase * 0.86 ? ctx.clamp(lvTop - 1, 0, 4) : lvTop]);
        if (d > rBase * 0.88 && (gx > 0 || gy > 0)) {
          for (let zz = 0; zz < baseH; zz += 0.06)
            ctx.plot(mx + gx, my + gy, z0 + zz, stoneRamp[gx > gy ? lvX : lvY]);
        }
      }
    }

    /* 下磨盘与上磨盘（放射刻槽） */
    const rLow = R * 0.92, rTop = R * 0.78;
    for (let gx = -rLow; gx <= rLow; gx += 0.045) {
      for (let gy = -rLow; gy <= rLow; gy += 0.045) {
        const d = Math.hypot(gx, gy);
        if (d <= rLow) {
          ctx.plot(mx + gx, my + gy, z0 + baseH + 0.16,
            slabRamp[d > rLow * 0.85 ? ctx.clamp(lvTop - 1, 0, 4) : lvTop]);
        }
        if (d <= rTop) {
          const ang = Math.atan2(gy, gx);
          const groove = Math.sin(ang * 12) > 0.75 ? -1 : 0;
          /* 上磨盘比下磨盘高一层，仍是顶面，保持"更高一档"的相对关系 */
          ctx.plot(mx + gx, my + gy, z0 + baseH + 0.34,
            slabRamp[ctx.clamp(lvTop + 1 + groove, 2, 4)]);
        }
      }
    }
    ctx.capsule([mx, my, z0 + baseH + 0.3], [mx, my, z0 + baseH + 0.72], 0.09, 0.08, () => WOOD_DK, 'rough');

    /* 十字木推杆：随 grindAngle 旋转 */
    const rad = (p.grindAngle * Math.PI) / 180;
    for (let k = 0; k < 2; k++) {
      const a = rad + k * Math.PI * 0.5;
      const ca = Math.cos(a), sa = Math.sin(a);
      const armLen = R * 1.05;
      ctx.capsule(
        [mx - ca * armLen, my - sa * armLen, z0 + baseH + 0.52],
        [mx + ca * armLen, my + sa * armLen, z0 + baseH + 0.52],
        0.065, 0.065, () => WOOD_BASE, 'rough'
      );
    }

    ctx.shadow(Math.max(W, D) * 0.62, 1, 0.45);
    ctx.shadowAt(mx, my, z0 + 0.05, rBase * 1.05, 1, 0.45);
  },
});

/* ---- 拱门 · arch ---- */
KIT.register({
  id: 'arch',
  name: '拱门',
  category: 'building',
  desc: '方石墙开半椭圆门洞，券石环按极角分缝沿弧排列',
  params: {
    width: { def: 2.0, min: 1.0, max: 3.6, step: 0.1, desc: '门洞宽' },
    rise: { def: 1.0, min: 0.4, max: 2.6, step: 0.1, desc: '拱高（起拱线以上）' },
  },
  collision: { type: 'box', w: 4.3, d: 0.92, h: 3.75 },

  draw(ctx, inst) {
    const hw = ctx.params.width * 0.5;
    const rise = ctx.params.rise;
    const BASE = 2.0, PIER = 1.15;
    const W = ctx.params.width + PIER * 2;
    const H = BASE + rise + 0.75;
    const T = 0.92, YF = T * 0.5, RING = 0.30, STEP = 0.04;
    const ox = ctx.x, oy = ctx.y, oz = ctx.z;

    const lum = (c) => (c & 255) + ((c >> 8) & 255) + ((c >> 16) & 255);
    const rock = ctx.rampOf([142, 133, 119]);
    const rrev = lum(rock[0]) > lum(rock[4]);
    const tone = (i) => rock[rrev ? 4 - i : i];
    const vrmp = ctx.rampOf([150, 139, 125]);
    const vrev = lum(vrmp[0]) > lum(vrmp[4]);
    const vtone = (i) => vrmp[vrev ? 4 - i : i];

    /* 面亮度由方向光决定：顶面 +z / 正面 +y / 右端面 +x */
    const lvTop = Math.round(ctx.lit(0, 0, 1));
    const lvY = Math.round(ctx.lit(0, 1, 0));
    const lvX = Math.round(ctx.lit(1, 0, 0));

    const inHole = (x, z) => {
      const ax = x < 0 ? -x : x;
      if (ax > hw) return false;
      if (z <= BASE) return true;
      const dz = z - BASE;
      if (dz > rise) return false;
      return (ax * ax) / (hw * hw) + (dz * dz) / (rise * rise) <= 1;
    };

    for (let z = 0.02; z < BASE + rise; z += STEP) {
      for (let x = -hw; x < hw; x += STEP) {
        if (!inHole(x, z)) continue;
        const d = x + hw;
        if (d > T * 0.85) break;
        /* 门洞内壁是凹进去的暗面，保持固定深档（不受直达光） */
        ctx.plot(ox + x, oy + YF - 0.2, oz + z, d < 0.07 ? tone(0) : tone(1));
      }
    }
    for (let z = 0.02; z < H; z += STEP) {
      for (let y = -T * 0.5; y < T * 0.5; y += STEP) {
        ctx.plot(ox + W * 0.5, oy + y, oz + z, tone(lvX));
      }
    }
    for (let y = -T * 0.5; y < T * 0.5; y += STEP) {
      for (let x = -W * 0.5; x < W * 0.5; x += STEP) {
        ctx.plot(ox + x, oy + y, oz + H,
          tone(ctx.clamp(lvTop - (ctx.noise(x * 4, y * 4) > 0.72 ? 1 : 0), 0, 4)));
      }
    }

    const EX = hw + RING, EZ = rise + RING;
    for (let z = 0.02; z < H; z += STEP) {
      const row = Math.floor(z / 0.36);
      for (let x = -W * 0.5 + 0.02; x < W * 0.5; x += STEP) {
        if (inHole(x, z)) continue;
        const py = oy + YF + 0.06;

        if (z > BASE) {
          const dz = z - BASE;
          const q = Math.sqrt((x * x) / (EX * EX) + (dz * dz) / (EZ * EZ));
          if (q <= 1) {
            const g = (Math.atan2(dz, x) / Math.PI) * 26;
            const f = g - Math.floor(g);
            const seg = Math.abs(Math.floor(g));
            let c;
            if (f < 0.07 || f > 0.93) c = vtone(0);            // 券石缝：材质深线，不随光
            else if (q > 0.93) c = vtone(ctx.clamp(lvY + 1, 0, 4));  // 外圈受光边
            else {
              const q0 = Math.sqrt((x * x) / (hw * hw) + (dz * dz) / (rise * rise));
              if (q0 < 1.06) c = vtone(1);                     // 门洞内圈：遮挡暗边
              else c = vtone(ctx.hash(seg * 13 + 5, ctx.seed) < 0.5 ? lvY : ctx.clamp(lvY - 1, 0, 4));
            }
            ctx.plot(ox + x, py, oz + z, c);
            continue;
          }
        }

        const xo = x + (row % 2) * 0.33;
        let fx = xo % 0.66; if (fx < 0) fx += 0.66;
        const fz = z % 0.36;
        const bid = Math.abs(Math.floor(xo / 0.66)) * 31 + row * 7;
        let c;
        if (fx < 0.045 || fz < 0.045) c = tone(0);            // 石缝：材质深线
        else if (z < 0.22) c = tone(1);                       // 墙脚积暗
        else c = tone(ctx.hash(bid, ctx.seed) < 0.3
          ? ctx.clamp(lvY - 1, 0, 4) : lvY);                  // 砌块色差 / 正面受光档
        ctx.plot(ox + x, py, oz + z, c);
      }
    }

    ctx.shadow(Math.max(W, H) * 0.42, 1, 0.5);
  },
});

