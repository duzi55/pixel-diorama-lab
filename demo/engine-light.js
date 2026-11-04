'use strict';
/* ------------------------------------------------------------------
 * 引擎 · 光照与色调（engine-light.js）
 *
 * 从 engine.js 拆出（500 行约束）。在 engine.js 之后加载。
 *
 *   LIGHT           全局光照状态（方向/阴影方向/色调/环境/暗角/点光源）
 *   PP_shadePoints  点光源照明（提交前调用）
 *   PP_applyGrade   色调 + 环境亮度 + 暗角（提交前调用）
 * ------------------------------------------------------------------ */



/* ---- 点光源系统 ----
 * LIGHT.points = [{x, y, z, r, color:[r,g,b], power}]
 *   r = 照明半径（世界单位），power = 强度 0~1
 * PP_shadePoints() 在提交前对"受光面"（zb 可见像素）按距离衰减加暖光。
 * 面向光源判定：比较该像素深度与"光源到该点直线"的深度——
 * 简化版：只照亮 zb 在光源高度以下的像素（地面/朝上的面）。
 */
function PP_shadePoints() {
  const pts = LIGHT.points;
  if (!pts || !pts.length) return;

  for (const L of pts) {
    const p0 = project(L.x, L.y, L.z);
    const R2px = L.r * S * 2.2;                 /* 屏幕影响半径（宽松，衰减裁掉外围） */
    const y0 = Math.max(0, Math.floor(p0.sy - R2px)), y1 = Math.min(H - 1, Math.ceil(p0.sy + R2px));
    const x0 = Math.max(0, Math.floor(p0.sx - R2px)), x1 = Math.min(W - 1, Math.ceil(p0.sx + R2px));

    for (let iy = y0; iy <= y1; iy++) for (let ix = x0; ix <= x1; ix++) {
      const i = iy * W + ix;
      if (zb[i] < -1e8) continue;               /* 天空不照明 */

      /* 该像素的世界坐标：先按 z=0 反投影，再按深度差换算出高度 */
      const g0 = unproject(ix + .5, iy + .5);
      const dFlat = (g0.x + g0.y) / R2 * COS;
      const dz = zb[i] - dFlat;                 /* 深度差 → 高度近似 */
      const zPx = Math.max(0, dz / SIN);
      const g = unprojectZ(ix + .5, iy + .5, zPx);

      /* 世界距离 → 强度 */
      const dw = Math.hypot(g.x - L.x, g.y - L.y, zPx - L.z);
      if (dw > L.r) continue;
      const fall = Math.pow(1 - dw / L.r, 1.7) * L.power;
      if (fall <= 0.01) continue;

      const c = L.color || [255, 214, 130];
      const px = pix[i];
      /* 加色混合（screen 模式的简化）：越暗的地方加得越多，不会过曝成白 */
      const r = px & 255, gg = (px >> 8) & 255, b = (px >> 16) & 255;
      const add = (base, lum) => base + (255 - base) * fall * (lum / 255) * 0.9;
      pix[i] = rgb(
        add(r, c[0]), add(gg, c[1]), add(b, c[2])
      );
    }
  }
}

/* 反投影到指定高度平面（与 terrain-common 的 terrainUnprojectZ 同式） */
function unprojectZ(sx, sy, z) {
  const u = (sx - OX) / S;
  const v = ((sy - OY) / S + z * COS) / SIN;
  return { x: (u + v) / Math.SQRT2, y: (v - u) / Math.SQRT2 };
}

/* 全局色调 + 环境亮度 + 暗角：在 pix 上就地处理（提交前调用一次） */
function PP_applyGrade() {
  const t = LIGHT.tint, amb = LIGHT.ambient;
  const needsTint = t[0] !== 1 || t[1] !== 1 || t[2] !== 1;
  const needsAmb = Math.abs(amb - 1) > 0.001;
  const vg = LIGHT.vignette;
  if (!needsTint && !needsAmb && vg <= 0) return;

  const cx = W / 2, cy = H / 2, maxR = Math.hypot(cx, cy);
  for (let iy = 0; iy < H; iy++) {
    for (let ix = 0; ix < W; ix++) {
      const i = iy * W + ix, c = pix[i];
      let r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255;
      if (needsTint) { r *= t[0]; g *= t[1]; b *= t[2]; }
      if (needsAmb) { r *= amb; g *= amb; b *= amb; }
      if (vg > 0) {
        const d = Math.hypot(ix - cx, iy - cy) / maxR;
        const k = 1 - vg * Math.pow(Math.max(0, d - 0.55) / 0.45, 1.6);
        r *= k; g *= k; b *= k;
      }
      pix[i] = rgb(r, g, b);
    }
  }
}

