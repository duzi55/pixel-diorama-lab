'use strict';
/* ------------------------------------------------------------------
 * 秋日山村 · 路面绘制（road.js 的兜底实现）
 *
 * ⚠ terrain.js 已经实现了完整路面：它的 groundColor() 逐像素处理
 *   沥青 + 路缘石 + 人行道 + 黄色虚线，由 bakeTerrain() 一次烘焙。
 *   所以主场景**不要**再调这三个函数 —— 会和 terrain.js 画两遍。
 *
 *   这个文件存在的原因是：road.js 必须能独立成场景（契约 §8
 *   「每个文件只定义函数，不自动执行」）。单独成场景时，引入本文件即可。
 *
 * 依赖 road.js 提供的 Road.roadAxis() 与 Road.cfg()。
 * ------------------------------------------------------------------ */

(function () {
  /* 坑 1 · 两处配色约定：
     1. ASPHALT 是 palette.js 里已调好的 4 档成品灰（数组数组），
        **不再走 rampOf** —— rampOf 会把每档再压暗 40%，路面会变成纯黑。
        但它是 [r,g,b] 三元组，要用 rgb() 打包后才能写进 pix。
     2. CURB / WALK 是单个 [r,g,b] 基色，走 rampOf 生成 5 档色阶。 */

  /* 沥青 + 路缘石 + 人行道：写 ground / zb，可作烘焙底图的一部分 */
  function drawRoadSurface() {
    const R = Road.cfg();
    const asph = ASPHALT.map(col => rgb(col[0], col[1], col[2]));
    const curb = rampOf(CURB), walk = rampOf(WALK);
    for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
      const g = unproject(ix + .5, iy + .5);
      const d = Math.abs(Road.roadAxis(g.x, g.y).lat);
      let c = 0;
      if (d <= R.halfW) {
        const n = noise(g.x * 2.3, g.y * 2.3);
        c = asph[clamp(Math.floor(n * 3.4 + (bayerAt(ix, iy) - .5) * .9), 0, 3)];
      } else if (d <= R.halfW + .26) {
        c = curb[3];
      } else if (d <= R.halfW + 1.10) {
        c = walk[hash(ix, iy) > .74 ? 3 : 2];
      }
      if (!c) continue;
      const i = iy * W + ix;
      pix[i] = c;
      ground[i] = 1;
      zb[i] = (g.x + g.y) / R2 * COS;
    }
  }

  /* 路面中央黄色虚线：沿路每 2.4 单位画一段 1.2 长，线宽 0.44 世界单位。
     坑 2 · 虚线必须**窄**：按 halfW 的比例画会把整条路涂成黄色。
     terrain.js 用的 LINE_HW = .22（半宽），这里取同样的值。
     直写 pix 但**不动 zb** —— 虚线是路面贴花，zb 仍归地面，
     这样 applyShadows / bakeOcclusion 还会正确给它上影和 AO。
     遮挡判定用 zb[i] > groundZ[i]：该像素已有物体在前就跳过。
     这样无论主场景先画路还是先画车，虚线都不会盖住车/树/房子。 */
  function drawRoadMarkings() {
    const LINE_HW = .22, period = 2.4, dash = 1.2;
    for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
      const i = iy * W + ix;
      if (zb[i] > groundZ[i]) continue;
      const g = unproject(ix + .5, iy + .5);
      const ax = Road.roadAxis(g.x, g.y);
      if (Math.abs(ax.lat) > LINE_HW) continue;
      if (((ax.s % period) + period) % period > dash) continue;
      pix[i] = ROAD_LINE;
    }
  }

  /* 路缘石：路面两侧的窄亮条（同样直写 pix，不动 zb） */
  function drawRoadEdge() {
    const R = Road.cfg(), curb = rampOf(CURB)[3];
    for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
      const i = iy * W + ix;
      if (zb[i] > groundZ[i]) continue;
      const g = unproject(ix + .5, iy + .5);
      const d = Math.abs(Road.roadAxis(g.x, g.y).lat);
      if (d > R.halfW + .26 || d <= R.halfW - .04) continue;
      pix[i] = curb;
    }
  }

  Road.drawRoadSurface = drawRoadSurface;
  Road.drawRoadMarkings = drawRoadMarkings;
  Road.drawRoadEdge = drawRoadEdge;
})();
