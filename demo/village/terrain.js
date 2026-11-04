'use strict';
/* ------------------------------------------------------------------
 * 秋日山村 · 地形与公路
 *
 * 构图（对照参考图实测）：
 *   · 公路：屏幕斜率 0.39（左下 → 右下），横穿画面下方三分之一，
 *     **无限延伸**（不封口、不裁剪，两端自然伸出画布）
 *   · 地台：公路两侧的秋日落叶坡地，边缘噪声溶解、自然散入纯色背景
 *   · 其余全部保留纯色背景（SKY = 页面纸色 #fcf5da）
 * ------------------------------------------------------------------ */

/* 公路中心线（世界坐标唯一真相源，所有模块都读它）
 * 方向比 dy/dx = -.1213 → 等距投影后屏幕斜率 .39（tools/solve-road.mjs 的反解） */
const ROAD = {
  ax: -3.25, ay: 25.06,
  bx: 47.25, by: 18.94,
  halfW: 1.7,
};

/* 路面结构 */
const CURB_W = .45;      /* 路缘石宽 */
const WALK_W = .48;      /* 人行道宽 */
const DASH_LEN = 1.7;    /* 黄虚线实段 */
const DASH_GAP = 1.7;

/* 地台（落叶坡地）：覆盖村庄与树林 */
const HILL_LEN = 20;     /* 沿路半长（岛的沿路半径） */
const HILL_W_N = 18;     /* 路北侧半宽（村庄与树林区） */
const HILL_W_S = 12;     /* 路南侧半宽（前景窄带） */

const RD = (() => {
  const dx = ROAD.bx - ROAD.ax, dy = ROAD.by - ROAD.ay;
  const len = Math.hypot(dx, dy);
  const ex = dx / len, ey = dy / len;
  return {
    dx, dy, len, ex, ey,
    nx: ey, ny: -ex,
    midX: (ROAD.ax + ROAD.bx) / 2,
    midY: (ROAD.ay + ROAD.by) / 2,
  };
})();

function distToRoad(x, y) {
  const t = ((x - ROAD.ax) * RD.dx + (y - ROAD.ay) * RD.dy) / (RD.len * RD.len);
  const px = ROAD.ax + RD.dx * t, py = ROAD.ay + RD.dy * t;
  const sx = (x - px) * RD.nx + (y - py) * RD.ny;
  return { d: Math.abs(sx), lat: sx, t, s: t * RD.len };
}

/* 地台边界（<1 内，>1 向背景溶解）
 *
 * 形状 = 主岛（椭圆）+ **沿公路的窄走廊**（取 min）。
 * 走廊让公路始终铺在地面上、两端自然伸出画布 ——
 * 否则公路会"浮"在纯色纸面上，像贴上去的一条灰带。
 * 两种形状的边缘都经过噪声扭曲 → 有机、不出现直角。
 */
function hillE(x, y) {
  const dx = x - RD.midX, dy = y - RD.midY;
  const sRel = dx * RD.ex + dy * RD.ey;          // 距岛心的沿路距离
  const lat = dx * RD.nx + dy * RD.ny;
  const hw = lat >= 0 ? HILL_W_N : HILL_W_S;
  const eIsland = Math.hypot(sRel / HILL_LEN, lat / hw);
  /* 公路走廊：横向半宽随位置起伏；**沿路在岛端前收窄到 0** ——
     走廊若无限延伸，画布左右缘会把它切成垂直直线（用户看到的"方框"）。
     收窄后公路与地面一起在岛端有机消散，像墨画里石径淡出纸面。 */
  const corrHW = 7.2 * (1 + .22 * Math.sin(sRel * .09 + 1.3) + .12 * Math.sin(sRel * .21));
  const endFade = Math.pow(clamp((Math.abs(sRel) - 12) / 6, 0, 1), 1.5) * 14;
  const eCorr = Math.abs(lat) / corrHW + endFade;
  const e = Math.min(eIsland, eCorr);
  /* 有机边缘：低频起伏 + 沿路方向的软收边 */
  const warp = (noise(x * .16 + 5.2, y * .16) - .5) * .22
             + (noise(x * .42, y * .42 + 1.7) - .5) * .10;
  return e + warp;
}

/* 沥青：亮灰白 + 中线黄虚线 */
function asphaltColor(x, y, ix, iy, r) {
  if (r.d < .15) {
    const cycle = DASH_LEN + DASH_GAP;
    const pos = ((r.s % cycle) + cycle) % cycle;
    if (pos < DASH_LEN) return ROAD_LINE;
  }
  const n = noise(x * 1.6, y * 1.6) * .65 + hash(ix * 3.3, iy * 2.1) * .35;
  return rgb(...ASPHALT[clamp(Math.floor(n * 4), 0, 3)]);
}
function curbColor(ix, iy, r) {
  const ph = ((r.s / 1.5) % 1 + 1) % 1;
  return rgb(...(ph < .07 ? STONE_DARK : CURB_STONE));
}
function walkColor(x, y, ix, iy, r) {
  const ph = ((r.s / 1.8) % 1 + 1) % 1;
  if (ph < .08) return rgb(...STONE_DARK);
  return rgb(...(hash(ix * 1.7, iy * 1.7) > .5 ? WALK_PATH : STONE));
}

/* 落叶地面：明亮金黄（参考图地面 = 厚厚一层金叶，不是泥） */
function litterColor(x, y, ix, iy, e) {
  const n = noise(x * .5, y * .5) * .60 + noise(x * 1.7, y * 1.7) * .26
          + hash(ix, iy) * .14;
  return rgb(...LITTER[clamp(Math.floor(n * 5), 0, 4)]);
}

function drawGround() {
  const curbEdge = ROAD.halfW + CURB_W;
  const walkEdge = curbEdge + WALK_W;

  for (let iy = 0; iy < H; iy++) {
    for (let ix = 0; ix < W; ix++) {
      const g = unproject(ix + .5, iy + .5);
      const r = distToRoad(g.x, g.y);
      const e = hillE(g.x, g.y);

      /* 先判地台边界：公路随地面一起在岛端消散（不会切到画布边） */
      if (e > 1.10) continue;
      /* 边缘溶解：低频团块啃边 */
      if (e > .86) {
        const fade = (e - .86) / .24;
        const clump = noise(ix * .16, iy * .16);
        if (hash(ix, iy) * (.4 + clump * 1.3) < fade) continue;
      }
      let c, onRoad = false;
      if (r.d < walkEdge && e <= 1.02) {
        if (r.d < ROAD.halfW) { c = asphaltColor(g.x, g.y, ix, iy, r); onRoad = true; }
        else if (r.d < curbEdge) { c = curbColor(ix, iy, r); onRoad = true; }
        else { c = walkColor(g.x, g.y, ix, iy, r); onRoad = true; }
      } else {
        c = litterColor(g.x, g.y, ix, iy, e);
      }
      if (!c) continue;

      const i = iy * W + ix;
      pix[i] = c;
      ground[i] = 1;
      kinds[i] = (onRoad && r.d < ROAD.halfW) ? KIND_NONE : KIND_GRASS;
      zb[i] = groundZ[i] = (g.x + g.y) / R2 * COS;
    }
  }
}

/* 地面撒少量落叶碎片（只撒很淡的亮色点缀，不能读成噪点） */
function scatterLitter() {
  for (let n = 0; n < 260; n++) {
    const rx = (hash(n, 11) - .5) * 64;
    const ry = (hash(n, 12) - .5) * 52;
    const r = distToRoad(rx, ry);
    if (r.d < ROAD.halfW + CURB_W + WALK_W) continue;
    if (hillE(rx, ry) > .92) continue;
    const p = project(rx, ry, 0);
    const ix = Math.round(p.sx), iy = Math.round(p.sy);
    if (ix < 1 || iy < 1 || ix >= W - 2 || iy >= H - 2) continue;
    const i = iy * W + ix;
    if (!ground[i] || zb[i] !== groundZ[i]) continue;
    pix[i] = rgb(...LEAF_BITS[n % LEAF_BITS.length]);
  }
}
