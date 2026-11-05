'use strict';
/* ------------------------------------------------------------------
 * 构件库 · 东方明珠（上海）
 *
 * 形态与配色复刻自 reference/lofi-weather 的上海场景
 * （js/cities/shanghai.js 的 orientalPearl / pearlOrb）：
 *   三根斜撑 + 三根立柱 + 粉/青/金三球 + 太空舱 + 天线，
 *   立柱外侧一条青色灯带，夜里整座塔能读出来。
 *
 * 与 lofi-weather 版的差异：那边用 emit 缓冲做夜景发光，
 * 这边是构件库的固定光照，球体用高饱和基色 + 5 档色阶表达发光感。
 * 场景版见 docs/analysis-lofi-weather.md §7。
 * ------------------------------------------------------------------ */

const OP_STEEL = [198, 204, 214];
const OP_BASE = [206, 204, 196];
const OP_GLOW = [92, 186, 206];
const OP_PINK = [222, 116, 168];
const OP_CYAN = [96, 176, 208];
const OP_GOLD = [214, 164, 86];
const OP_RED = [226, 64, 52];
const OP_LEGS = [Math.PI / 2, Math.PI * 7 / 6, Math.PI * 11 / 6];

KIT.register({
  id: 'oriental-pearl',
  name: '东方明珠',
  category: 'building',
  desc: '三球三柱的电视塔：三根斜撑、粉/青/金三色球、青色塔身灯带与天线',
  params: {
    height:    { def: 15,  min: 10, max: 22, step: .5,  desc: '塔总高（世界单位）' },
    ballScale: { def: 1,   min: .6, max: 1.5, step: .05, desc: '三个球的大小倍率' },
    spread:    { def: 1,   min: .7, max: 1.4, step: .05, desc: '斜撑与底座张开倍率' },
  },
  collision: { type: 'cylinder', r: 3.4, h: 15 },

  draw(ctx) {
    const p = ctx.params;
    const k = p.height / 15, bs = p.ballScale, sp = p.spread;
    const x = ctx.x, y = ctx.y, z0 = ctx.z || 0;
    const glow = ctx.rampOf(OP_GLOW)[4];

    /* 两级底座，让三根斜撑落在实地上 */
    ctx.box(x - 3.4 * sp, y - 3.4 * sp, z0, x + 3.4 * sp, y + 3.4 * sp, z0 + .28 * k, OP_BASE, 610);
    ctx.box(x - 3 * sp, y - 3 * sp, z0 + .28 * k, x + 3 * sp, y + 3 * sp, z0 + .44 * k, [190, 188, 180], 611);

    /* 三根斜撑：粗钢柱 + 外侧灯带（灯带必须偏离柱心，否则被柱体深度吃掉） */
    for (const a of OP_LEGS) {
      const lx = x + Math.cos(a) * 2.95 * sp, ly = y + Math.sin(a) * 2.95 * sp;
      const tx = x + Math.cos(a) * .62 * sp, ty = y + Math.sin(a) * .62 * sp;
      ctx.capsule([lx, ly, z0 + .35 * k], [tx, ty, z0 + 3.55 * k], .36 * k, .24 * k, () => OP_STEEL, 'solid');
      for (let t = 0; t <= 1; t += .05) {
        const qx = lx + (tx - lx) * t, qy = ly + (ty - ly) * t, qz = z0 + (.35 + 3.2 * t) * k;
        ctx.plot(qx + .17 * k, qy + .17 * k, qz, glow);
      }
      ctx.sphere(lx, ly, z0 + .3 * k, .38 * k, OP_BASE, 'rough');
      ctx.shadowAt(lx, ly, z0 + .3 * k, .5 * k);
    }

    /* 三根立柱贯穿塔身，外侧一条灯带 */
    for (const a of OP_LEGS) {
      const px = x + Math.cos(a) * .62 * sp, py = y + Math.sin(a) * .62 * sp;
      ctx.capsule([px, py, z0 + .3 * k], [px, py, z0 + 12.8 * k], .22 * k, .13 * k, () => OP_STEEL, 'solid');
      for (let z = .4; z <= 12.7; z += .12) ctx.plot(px + .17 * k, py + .17 * k, z0 + z * k, glow);
    }

    /* 三个球：下粉、中青、上金 */
    ctx.sphere(x, y, z0 + 3.5 * k, 1.15 * k * bs, OP_PINK);
    ctx.sphere(x, y, z0 + 8.2 * k, .82 * k * bs, OP_CYAN);
    ctx.sphere(x, y, z0 + 11.3 * k, .6 * k * bs, OP_GOLD);

    /* 太空舱、天线、红色航空灯 */
    ctx.capsule([x, y, z0 + 11.6 * k], [x, y, z0 + 12.45 * k], .38 * k, .3 * k, () => OP_STEEL, 'solid');
    ctx.capsule([x, y, z0 + 12.5 * k], [x, y, z0 + 15.1 * k], .09 * k, .03 * k, () => OP_STEEL, 'solid');
    ctx.sphere(x, y, z0 + 15.16 * k, .11 * k, OP_RED, 'solid');

    ctx.shadow(3.4 * sp, 1, .3);
  },
});
