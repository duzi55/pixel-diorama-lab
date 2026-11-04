'use strict';
/* ------------------------------------------------------------------
 * 秋日山村 · 地面（极简版）
 *
 * 场景构成（用户明确要求，一切从简）：
 *   纯色背景 + 一条公路（亮灰白 + 黄虚线）+ 房子 + 树。其余全部留白。
 *
 * ROAD 是唯一真相源（houses/foliage/villagers/road 都惰性读它）。
 * ------------------------------------------------------------------ */

/* 公路：斜向一条（屏幕斜率约 .39，同参考图），路长 ~15 世界。
 * ★ 路中心在世界原点（x-y 中心 = 0，sum 中心 = 0）—— 场景在任何
 *   画布尺寸下都以 OX/OY（默认画布中心）为正中，四周留白。 */
const ROAD = { ax: -6.75, ay: 0.85, bx: 6.75, by: -0.85, halfW: 1.8 };

/* 颜色：ASPHALT 用 palette.js 全局定义（顶层 const 唯一性铁律） */
const CURB_HI = [206, 202, 190];
const LINE_YELLOW = [236, 192, 62];

/* 点到公路中心线所在直线的距离（世界单位）。
 * ★ t 不 clamp：公路是**无限延伸的直线**，两端自然伸出画布
 *   （用户要求"公路做一部分延伸"，不做圆头封口）。 */
function roadDist(x, y) {
  const dx = ROAD.bx - ROAD.ax, dy = ROAD.by - ROAD.ay;
  const len2 = dx * dx + dy * dy;
  const t = ((x - ROAD.ax) * dx + (y - ROAD.ay) * dy) / len2;
  const px = ROAD.ax + dx * t, py = ROAD.ay + dy * t;
  return { d: Math.hypot(x - px, y - py), t, s: t * Math.hypot(dx, dy) };
}

/* 沥青：亮灰白 + 白噪声打散 + 中线黄虚线 */
function asphaltColor(x, y, ix, iy) {
  const u = .5 + (hash(ix * 3.1, iy * 1.7) - .5) * .45;
  const idx = clamp(Math.floor(u * 3.99), 0, 3);
  /* 中线黄虚线：靠近中心线 + 沿路 s 按段闪断 */
  const r = roadDist(x, y);
  if (r.d < .14 && Math.floor(r.s * .9) % 2 === 0) return rgb(...LINE_YELLOW);
  return rgb(...ASPHALT[idx]);
}

/* 地面：只画公路带（沥青 + 一条窄路缘），其余像素保持纯色背景 */
function drawGround() {
  for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
    const g = unproject(ix + .5, iy + .5);
    const r = roadDist(g.x, g.y);
    if (r.d >= ROAD.halfW + .55) continue;              /* 之外 = 背景留白 */
    const i = iy * W + ix;
    ground[i] = 1;
    kinds[i] = r.d < ROAD.halfW ? KIND_NONE : KIND_GRASS;
    zb[i] = groundZ[i] = (g.x + g.y) / R2 * COS;
    pix[i] = r.d < ROAD.halfW
      ? asphaltColor(g.x, g.y, ix, iy)
      : rgb(...CURB_HI);
  }
}
