'use strict';
/* ------------------------------------------------------------------
 * 天气层运行时（KIT_WEATHER）
 *
 * 天气 = 少量粒子 + 一层全屏调色。粒子负责"动"，调色负责"气氛变了"。
 * 与 KIT_EFFECT 分开：特效是瞬时/常驻的局部效果，天气是持续的环境层。
 *
 * 契约：
 *   KIT_WEATHER.rain(ctx, opt)       雨丝；opt.bounds 是屏幕像素矩形
 *   KIT_WEATHER.cloud(ctx, opt)      屏幕空间云团，只在留白处出现
 *   KIT_WEATHER.bolt(ctx, x, y, z, opt) 世界坐标闪电折线，返回折线点
 *   KIT_WEATHER.gradeStorm(pix, W, H, t, opt)  全屏调色；t = 暴雨强度 0..1
 *
 * 随机只用 hash(k, seed) —— 同一帧反复重绘结果完全一致。
 * 参考：laundry:450-541 · 文档：docs/kit/effects-weather.md
 * ------------------------------------------------------------------ */

const KIT_WEATHER = (() => {
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + .5) / 16);
  const EMPTY = -1e8;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t * t * (3 - 2 * t);
  const bayer = (ix, iy) => BAYER[(iy & 3) * 4 + (ix & 3)];
  const hash = (x, y) => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const noise = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = ease(x - ix), fy = ease(y - iy);
    return lerp(lerp(hash(ix, iy), hash(ix + 1, iy), fx),
      lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), fx), fy);
  };
  const packRGB = (r, g, b) => (255 << 24
    | clamp(b | 0, 0, 255) << 16
    | clamp(g | 0, 0, 255) << 8
    | clamp(r | 0, 0, 255)) >>> 0;

  function pack(c, v) {
    return Array.isArray(v) ? c.rgb(v[0], v[1], v[2]) : (typeof v === 'number' ? v >>> 0 : 0);
  }

  /* 有 KIT_EFFECT 就借它的适配器；单独加载时退化到引擎全局 */
  function asCtx(ctx) {
    if (ctx && ctx.__kitEffectCtx) return ctx;
    if (typeof KIT_EFFECT !== 'undefined' && KIT_EFFECT && KIT_EFFECT.makeCtx) {
      return KIT_EFFECT.makeCtx(ctx);
    }
    const src = ctx || null;
    const screen = src && typeof src.screen === 'function'
      ? (x, y, z) => src.screen(x, y, z)
      : (x, y, z) => project(x, y, z);
    return {
      __kitEffectCtx: true,
      get W() { return W; },
      get H() { return H; },
      screen,
      dot(ix, iy, color) {
        const x = ix | 0, y = iy | 0;
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        pix[y * W + x] = color;
      },
      isObject(ix, iy) {
        if (ix < 0 || iy < 0 || ix >= W || iy >= H) return false;
        const d = zb[iy * W + ix];
        return d > EMPTY && d !== groundZ[iy * W + ix];
      },
      isGround(ix, iy) {
        if (ix < 0 || iy < 0 || ix >= W || iy >= H) return false;
        return ground[iy * W + ix] === 1 && zb[iy * W + ix] === groundZ[iy * W + ix];
      },
      rgb, rampOf, hash, bayerAt: bayer, clamp, lerp,
    };
  }

  const occupied = (c, ix, iy) => c.isObject(ix, iy) || c.isGround(ix, iy);

  /* ---------------- 雨 ---------------- */

  /**
   * 屏幕空间的斜向雨丝。
   * opt = { bounds:{x0,x1,y0,y1}, density, angle, alpha, t,
   *         speed, seed, color, length }
   * 位置按 t 解析计算（不用粒子池）→ 任意时刻可重放。
   */
  function rain(ctx, opt) {
    const c = asCtx(ctx), o = opt || {};
    const b = o.bounds || { x0: 0, y0: 0, x1: c.W, y1: c.H };
    const x0 = b.x0, y0 = b.y0;
    const bw = Math.max(1, b.x1 - b.x0), bh = Math.max(1, b.y1 - b.y0);
    const density = clamp(o.density == null ? .55 : o.density, 0, 1);
    const alpha = clamp(o.alpha == null ? .9 : o.alpha, 0, 1);
    const angle = o.angle == null ? .18 : o.angle;
    const speed = o.speed == null ? 26 : o.speed;
    const time = o.t || 0;
    const seed = o.seed == null ? 7 : o.seed;
    const color = pack(c, o.color || [112, 134, 188]);
    const len = Math.max(1, Math.round(o.length == null ? 4 : o.length));

    const areaScale = (bw * bh) / Math.max(1, c.W * c.H);
    const count = Math.max(1, Math.min(1000, Math.round(density * 520 * areaScale)));
    const vx = Math.sin(angle) * speed, vy = Math.cos(angle) * speed;
    const vlen = Math.max(1e-6, Math.hypot(vx, vy));
    const dx = vx / vlen, dy = vy / vlen;      /* 单位速度方向（屏幕 y 向下） */

    for (let k = 0; k < count; k++) {
      const px = x0 + (((hash(k, seed) * bw + time * vx) % bw) + bw) % bw;
      const py = y0 + (((hash(k, seed + 1) * bh + time * vy) % bh) + bh) % bh;
      if (bayer(px | 0, py | 0) > alpha) continue;
      for (let j = 0; j < len; j++) {
        c.dot(px - dx * j, py - dy * j, color);
      }
    }
  }

  /* ---------------- 云 ---------------- */

  /**
   * 屏幕空间云团（3~4 个椭圆瓣 + Bayer 阈值透明）。
   * opt = { cx, cy, r, tone, alpha, seed }
   * tone: 0..1 或 [r,g,b]；云只画在留白/天空（不覆盖已绘制的物体与地面）。
   */
  function cloud(ctx, opt) {
    const c = asCtx(ctx), o = opt || {};
    const cx = o.cx == null ? c.W / 2 : o.cx;
    const cy = o.cy == null ? 40 : o.cy;
    const r = Math.max(2, o.r == null ? 14 : o.r);
    const tone = o.tone == null ? 0 : o.tone;
    const base = Array.isArray(tone)
      ? tone
      : [lerp(206, 126, tone), lerp(204, 124, tone), lerp(216, 150, tone)];
    const ramp = c.rampOf(base);
    const alpha = clamp(o.alpha == null ? 1 : o.alpha, 0, 1);
    const seed = o.seed == null ? 1 : o.seed;

    const lobes = [
      [0, 0, 1],
      [-.62 * r, .08 * r + (hash(seed, 1) - .5) * 3, .72],
      [.62 * r, .05 * r + (hash(seed, 2) - .5) * 3, .70],
      [-.16 * r, -.30 * r, .60],
    ];

    for (let L = 0; L < lobes.length; L++) {
      const ox = lobes[L][0], oy = lobes[L][1], k = lobes[L][2];
      const rx = r * k, ry = rx * .55;
      const xa = Math.max(0, Math.floor(cx + ox - rx));
      const xb = Math.min(c.W - 1, Math.ceil(cx + ox + rx));
      const ya = Math.max(0, Math.floor(cy + oy - ry));
      const yb = Math.min(c.H - 1, Math.ceil(cy + oy + ry));
      for (let iy = ya; iy <= yb; iy++) for (let ix = xa; ix <= xb; ix++) {
        const dx = (ix - cx - ox) / rx, dy = (iy - cy - oy) / ry;
        const nn = dx * dx + dy * dy;
        if (nn > 1) continue;
        if (occupied(c, ix, iy)) continue;
        const a = alpha * (1.15 - nn * .4);
        if (bayer(ix, iy) > a * 1.6) continue;
        const l = -.45 * dx - .75 * dy + .5 * Math.sqrt(1 - nn);
        const idx = clamp(Math.floor(l * 3.2 + 1 + (bayer(ix, iy) - .5) * .6), 0, 4);
        c.dot(ix, iy, ramp[idx]);
      }
    }
  }

  /* ---------------- 闪电 ---------------- */

  /**
   * 从世界坐标 (x, y, z) 劈到地面 z=0 的折线。
   * opt = { seed, segments, jitter, reach, overlay, core, glow }
   * 默认只画在留白处（闪电在场景后面）；overlay=true 时盖住场景。
   * 返回折线的屏幕坐标数组，供调用方做二次辉光/音效同步。
   */
  function bolt(ctx, x, y, z, opt) {
    const c = asCtx(ctx), o = opt || {};
    const seed = o.seed == null ? 3 : o.seed;
    const reach = clamp(o.reach == null ? 1 : o.reach, 0, 1);
    const segments = Math.max(2, Math.round(o.segments == null ? 8 : o.segments));
    const jitter = o.jitter == null ? 14 : o.jitter;
    const a = c.screen(x, y, z == null ? 6 : z), b = c.screen(x, y, 0);
    const pts = [[a.sx, a.sy]];
    let px = a.sx;
    for (let k = 1; k <= segments; k++) {
      const t = k / segments;
      px += (hash(k, seed) - .5) * jitter * (1 - t * .35);
      pts.push([px, lerp(a.sy, b.sy, t)]);
    }
    const core = pack(c, o.core || [250, 240, 150]);
    const glow = pack(c, o.glow || [120, 112, 214]);
    const overlay = o.overlay === true;
    const segs = Math.max(1, Math.ceil((pts.length - 1) * reach));
    for (let k = 0; k < segs; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
      for (let j = 0; j <= n; j++) {
        const sx = Math.round(lerp(ax, bx, j / n));
        const sy = Math.round(lerp(ay, by, j / n));
        for (const [ox, col] of [[0, core], [-1, glow], [1, glow]]) {
          const ix = sx + ox;
          if (ix < 0 || ix >= c.W || sy < 0 || sy >= c.H) continue;
          if (!overlay && occupied(c, ix, sy)) continue;
          c.dot(ix, sy, col);
        }
      }
    }
    return pts;
  }

  /* ---------------- 全屏调色 ---------------- */

  /**
   * 暴雨调色：去饱和 + 偏蓝压暗 + 云影 + 轻微闪电提亮。
   * t = 暴雨强度 0..1（0 = 不变）。
   * opt = { time, flash, bg, cloudShadow }
   *   time        云影漂移相位（秒）
   *   flash       0..1 闪电提亮（默认 t*.05）
   *   bg          要跳过的纸色（打包值或 [r,g,b]）；不给就整屏调
   *   cloudShadow 默认 true
   * 输出通道夹在 6..249，保证不会把画面压成纯黑/纯白。
   */
  function gradeStorm(pix, W, H, t, opt) {
    const s = clamp(t == null ? 0 : +t, 0, 1);
    if (s <= 0 || !pix || !W || !H) return;
    const o = opt || {};
    const time = o.time == null ? 0 : o.time;
    const flash = clamp(o.flash == null ? s * .05 : o.flash, 0, 1);
    const rm = 1 - .46 * s, gm = 1 - .36 * s, bm = 1 - .2 * s;
    const ra = 8 * s, ga = 12 * s, ba = 26 * s;
    const bg = o.bg == null ? null
      : (Array.isArray(o.bg) ? packRGB(o.bg[0], o.bg[1], o.bg[2]) : o.bg >>> 0);

    let cells = null, cellsW = 0;
    if (o.cloudShadow !== false) {
      cellsW = (W >> 3) + 1;
      const cellsH = (H >> 3) + 1;
      cells = new Float32Array(cellsW * cellsH);
      for (let cy = 0; cy < cellsH; cy++) for (let cx = 0; cx < cellsW; cx++) {
        cells[cy * cellsW + cx] = noise(cx * .14 - time * .22, cy * .2 + 3);
      }
    }
    const cloudCut = 1 - s * .62;

    for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
      const i = iy * W + ix, c0 = pix[i];
      if (bg != null && c0 === bg) continue;
      let r = (c0 & 255) * rm + ra;
      let g = (c0 >> 8 & 255) * gm + ga;
      let b = (c0 >> 16 & 255) * bm + ba;
      if (cells && cells[(iy >> 3) * cellsW + (ix >> 3)] + bayer(ix, iy) * .22 > cloudCut) {
        r *= .76; g *= .76; b *= .82;
      }
      if (flash > 0) { r = lerp(r, 244, flash); g = lerp(g, 244, flash); b = lerp(b, 255, flash); }
      pix[i] = packRGB(clamp(r, 6, 249), clamp(g, 6, 249), clamp(b, 6, 249));
    }
  }

  return { rain, cloud, bolt, gradeStorm };
})();
