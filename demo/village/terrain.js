'use strict';
/* ------------------------------------------------------------------
 * 秋日山村 · 地形与公路
 *
 * 场景构成（Diorama 微缩模型构图）：
 *   1. 斜穿的一条平整沥青公路（亮灰白路面 + 黄色虚线 + 路缘石 + 人行石道）
 *   2. 承载村庄与大树的秋日落叶地台（自然有机起伏，边缘散落过渡至纯色背景）
 *   3. 周围完全留白，背景色保持干净纯粹的纸色 (#fcf5da)
 * ------------------------------------------------------------------ */

/* 公路中心线（全局真相源，houses/foliage/villagers/road 均基于此）
 * 经过 30° 等距投影，屏幕呈现左下往右上的 0.39 斜率。 */
const ROAD = {
  ax: -24.0, ay: 14.5,
  bx:  24.0, by: -4.5,
  halfW: 2.3,            // 沥青行车道半宽
};

/* 路面结构尺寸 */
const CURB_W = 0.45;     // 路缘石宽
const WALK_W = 0.70;     // 人行道宽
const DASH_LEN = 1.8;    // 黄虚线长度
const DASH_GAP = 1.8;    // 黄虚线间隔

/* 地台尺寸：覆盖村落与大树生长区 */
const HILL_LEN = 30.0;   // 沿路半长
const HILL_WIDTH_N = 22.0; // 路北侧半宽（房屋与巨树区，宽阔）
const HILL_WIDTH_S = 15.0; // 路南侧半宽（前排房屋与路边树）

/* 几何预计算 */
const RD = (() => {
  const dx = ROAD.bx - ROAD.ax, dy = ROAD.by - ROAD.ay;
  const len = Math.hypot(dx, dy);
  const ex = dx / len, ey = dy / len;
  return {
    dx, dy, len,
    ex, ey,
    nx: ey, ny: -ex,     // 法线（正向为路北侧/屏幕右上）
    midX: (ROAD.ax + ROAD.bx) / 2,
    midY: (ROAD.ay + ROAD.by) / 2,
  };
})();

/* 点到公路中心线段的垂直距离与投影参数 */
function distToRoad(x, y) {
  const dx = x - ROAD.ax, dy = y - ROAD.ay;
  const t = (dx * RD.dx + dy * RD.dy) / (RD.len * RD.len);
  const px = ROAD.ax + RD.dx * t, py = ROAD.ay + RD.dy * t;
  const signedDist = (x - px) * RD.nx + (y - py) * RD.ny;
  return {
    d: Math.abs(signedDist),
    signedD: signedDist,
    t,
    s: t * RD.len,
  };
}

/* 地台有机边界距离场 (e <= 1.0 为地台内部，> 1.0 向纯色背景溶解) */
function hillE(x, y) {
  const dx = x - RD.midX, dy = y - RD.midY;
  const sProj = (dx * RD.ex + dy * RD.ey);
  const dProj = (dx * RD.nx + dy * RD.ny);
  const hw = dProj >= 0 ? HILL_WIDTH_N : HILL_WIDTH_S;
  
  // 椭圆距离场
  const u = sProj / HILL_LEN;
  const v = dProj / hw;
  const baseE = Math.hypot(u, v);
  
  // 自然低频边缘抖动，让地台像山丘落叶自然散开，而非规则几何圆
  const warp = (noise(x * 0.18 + 5.2, y * 0.18) - 0.5) * 0.28
             + (noise(x * 0.45, y * 0.45 + 1.7) - 0.5) * 0.15;
  return baseE + warp;
}

/* 沥青路面颜色计算（平整亮灰白 + 中线黄虚线） */
function asphaltColor(x, y, ix, iy, r) {
  // 中线黄色虚线
  if (r.d < 0.16) {
    const cycle = DASH_LEN + DASH_GAP;
    const pos = (r.s % cycle + cycle) % cycle;
    if (pos < DASH_LEN) return ROAD_LINE;
  }
  // 沥青细微质感
  const n = noise(x * 1.5, y * 1.5) * 0.6 + hash(ix * 3.3, iy * 2.1) * 0.4;
  const idx = clamp(Math.floor(n * 4.0), 0, 3);
  return rgb(...ASPHALT[idx]);
}

/* 路缘石颜色 */
function curbColor(ix, iy, r) {
  const ph = ((r.s / 1.5) % 1 + 1) % 1;
  const edge = ph < 0.08 ? STONE_DARK : CURB_STONE;
  return rgb(...edge);
}

/* 人行道石板路颜色 */
function walkColor(x, y, ix, iy, r) {
  const ph = ((r.s / 1.8) % 1 + 1) % 1;
  if (ph < 0.09) return rgb(...STONE_DARK); // 板缝
  const n = hash(ix * 1.7, iy * 1.7);
  return rgb(...(n > 0.5 ? WALK_PATH : STONE));
}

/* 落叶地台颜色（金黄落叶堆积，边缘散落溶解渐变为留白） */
function litterGroundColor(x, y, ix, iy, e) {
  // 地台边缘平滑溶解（类似水墨图自然散出）
  if (e > 0.88) {
    const fade = (e - 0.88) / 0.24; // 0 -> 1
    const clump = noise(ix * 0.15, iy * 0.15);
    // 越到外缘越容易漏空（显示纯色纸底 SKY）
    if (hash(ix, iy) * (0.35 + clump * 1.2) < fade) {
      return 0; // 0 表示留白纯色
    }
  }
  // 落叶表面色阶
  const n = noise(x * 0.65, y * 0.65) * 0.55 + noise(x * 2.2, y * 2.2) * 0.3 + hash(ix, iy) * 0.15;
  const idx = clamp(Math.floor(n * 5.0), 0, 4);
  return rgb(...LITTER[idx]);
}

/* 核心地形烘焙函数 */
function drawGround() {
  const curbEdge = ROAD.halfW + CURB_W;
  const walkEdge = curbEdge + WALK_W;

  for (let iy = 0; iy < H; iy++) {
    for (let ix = 0; ix < W; ix++) {
      const g = unproject(ix + 0.5, iy + 0.5);
      const r = distToRoad(g.x, g.y);
      const e = hillE(g.x, g.y);

      let c = 0;
      let onRoad = false;

      // 1. 公路带绘制（在路长 ±32 内绘制路面）
      if (Math.abs(r.s - RD.len / 2) < RD.len * 0.72) {
        if (r.d < ROAD.halfW) {
          c = asphaltColor(g.x, g.y, ix, iy, r);
          onRoad = true;
        } else if (r.d < curbEdge) {
          c = curbColor(ix, iy, r);
          onRoad = true;
        } else if (r.d < walkEdge) {
          // 只在村庄核心段（房子前）有人行道，其余为自然路肩
          if (Math.abs(r.s - RD.len / 2) < 18.0) {
            c = walkColor(g.x, g.y, ix, iy, r);
            onRoad = true;
          }
        }
      }

      // 2. 如果不是路面，则检查是否落在落叶地台内
      if (!c) {
        if (e <= 1.15) {
          c = litterGroundColor(g.x, g.y, ix, iy, e);
        }
      }

      // 如果有地面颜色，写入缓冲区
      if (c !== 0) {
        const i = iy * W + ix;
        pix[i] = c;
        ground[i] = 1;
        kinds[i] = onRoad && (r.d < ROAD.halfW) ? KIND_NONE : KIND_GRASS;
        zb[i] = groundZ[i] = (g.x + g.y) / R2 * COS;
      }
    }
  }
}

/* 在落叶地台上随机撒少量精致落叶碎片，增加细节 */
function scatterLitter() {
  for (let n = 0; n < 350; n++) {
    const rx = (hash(n, 11) - 0.5) * 44;
    const ry = (hash(n, 12) - 0.5) * 36;
    const r = distToRoad(rx, ry);
    if (r.d < ROAD.halfW + CURB_W) continue; // 不散在公路行车道上
    if (hillE(rx, ry) > 0.95) continue;      // 不散到地台外

    const p = project(rx, ry, 0);
    const ix = Math.round(p.sx), iy = Math.round(p.sy);
    if (ix < 1 || iy < 1 || ix >= W - 2 || iy >= H - 2) continue;
    const i = iy * W + ix;
    if (!ground[i] || zb[i] !== groundZ[i]) continue;

    const bitColor = rgb(...LEAF_BITS[n % LEAF_BITS.length]);
    pix[i] = bitColor;
    if (hash(n, 13) > 0.5) pix[i + 1] = bitColor; // 偶有双像素小叶子
  }
}
