'use strict';
/* ------------------------------------------------------------------
 * 草丛（village 场景用，从原 engine.js 拆出）
 *
 * growGrass() / drawTufts()：docs/kit/plants.md §1（staticShadow 联动）
 *
 * 人物骨架 figure() / dynamicAdd 已收编进 demo/kit/figures.js
 *（kit/crowd.js 与编辑器共用），本文件只保留草。
 * ------------------------------------------------------------------ */

/* 默认草色（场景可传自己的色组给 growGrass） */
const ENGINE_GRASS = [[34, 62, 50], [52, 88, 52], [82, 118, 54], [124, 146, 62], [168, 172, 76]];

/* ---- 草丛：staticShadow 联动，影子里自动变暗 ---- */

const tufts = [];
/* 影内色 = 基准色压暗并偏紫，和 applyShadows 的地面阴影同一套语言 */
let tuftLit = [], tuftDark = [];

function growGrass(density = .17, colors = null) {
  const base = colors || ENGINE_GRASS;
  tufts.length = 0;                       // 重复调用不叠加
  tuftLit = base.map(c => rgb(...c));
  tuftDark = base.map(c => rgb(c[0] * .54, c[1] * .52, c[2] * .72));
  for (let iy = 3; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
    const i = iy * W + ix;
    if (kinds[i] !== KIND_GRASS || hash(ix * 3, iy * 5) > density) continue;
    tufts.push({
      ix, iy, i, height: 1 + (hash(ix, iy * 2) * 3 | 0),
      base: Math.round(noise(ix * .09, iy * .18) * 2.2),
      phase: ix * .11 + iy * .19 + hash(ix, iy) * .9,
      bloom: hash(ix * 7, iy) < .022 ? rgb(...(hash(ix, iy) > .5 ? [250, 246, 226] : [240, 200, 84])) : 0,
    });
  }
}

function drawTufts(t) {
  for (const tuft of tufts) {
    const gust = Math.sin(t * .8 + tuft.phase) + .5 * Math.sin(t * 2.1 + tuft.phase * 2.3);
    const colors = staticShadow[tuft.i] ? tuftDark : tuftLit;
    for (let k = 1; k <= tuft.height; k++) {
      const jx = tuft.ix + Math.round(gust * .95 * k / 3), jy = tuft.iy - k;
      if (jx < 0 || jx >= W) continue;
      const j = jy * W + jx;
      if ((kinds[j] !== KIND_GRASS && kinds[j] !== KIND_NONE) || zb[j] !== groundZ[j]) continue;
      pix[j] = tuft.bloom && k === tuft.height ? tuft.bloom
        : colors[clamp(tuft.base + k + (gust > 1 ? 1 : 0), 1, 4)];
    }
  }
}
