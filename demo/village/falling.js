'use strict';
/* ------------------------------------------------------------------
 * 飘落的落叶
 *
 * 树冠在风里晃，落叶从冠上飘下来，落到地面就消失。
 * 阵风来的时候飘得快、飘得远。
 *
 * 参考：demo/autumn.js 的 motes 机制 + docs/kit/nature.md §8
 * ------------------------------------------------------------------ */

/* 落叶粒子：x/y 是世界坐标，z 是高度，z 掉到 0 就重新从某棵树上生成 */
const fallingLeaves = [];
let leafSources = [];        // 树的落点列表，由 foliage.js 填

const LEAF_FALL_COLORS = [
  [216, 152, 46], [236, 182, 62], [190, 118, 34],
  [164, 90, 28], [246, 208, 104], [206, 130, 38],
];

function setupFallingLeaves(sources, count = 16) {
  leafSources = sources;
  fallingLeaves.length = 0;
  for (let i = 0; i < count; i++) fallingLeaves.push(spawnLeaf({}, i, true));
}

function spawnLeaf(m, i, spread) {
  if (!leafSources.length) { m.x = 0; m.y = 0; m.z = 10; return m; }
  const src = leafSources[(hash(i, 71) * leafSources.length) | 0];
  const a = hash(i, 72) * 6.283, r = hash(i, 73) * 1.3;
  m.x = src.x + Math.cos(a) * r;
  m.y = src.y + Math.sin(a) * r;
  m.z = spread ? src.z * (.55 + hash(i, 74) * .4) : src.z;
  m.vz = .22 + hash(i, 75) * .28;
  m.ph = hash(i, 76) * 6.283;
  m.spin = hash(i, 77) * 6.283;
  m.c = LEAF_FALL_COLORS[(hash(i, 78) * LEAF_FALL_COLORS.length) | 0];
  m.dead = false;
  return m;
}

/* 阵风包络：和 trees/autumn 用的是同一套 */
function gustAt(t) {
  const v = Math.sin(t * .41 + .7) * .5
          + Math.sin(t * .67 + 2.3) * .3
          + Math.sin(t * .23 + 4.1) * .2;
  return Math.max(0, v - .28) / .72;
}

function updateLeaves(t, dt) {
  const gust = gustAt(t);
  for (const m of fallingLeaves) {
    m.z -= m.vz * dt * (1 + gust * .9);
    m.x += (.18 + gust * .85 + Math.sin(t * 2.1 + m.ph) * .13) * dt;
    m.y += Math.cos(t * 1.7 + m.ph) * .09 * dt;
    m.spin += dt * (1.4 + gust * 2);
    if (m.z < .03) spawnLeaf(m, (Math.random() * 997) | 0, false);
  }
}

function drawFallingLeaves(t) {
  for (const m of fallingLeaves) {
    const p = project(m.x, m.y, m.z);
    const ix = p.sx | 0, iy = p.sy | 0;
    if (ix < 0 || iy < 0 || ix >= W - 2 || iy >= H - 1) continue;
    const c = rgb(...m.c);
    const i = iy * W + ix;
    /* 落叶是覆盖层：不写 zb，永远在最上层 */
    pix[i] = c;
    /* 摆动时偶尔画第二像素，像叶子翻了个面 */
    const wob = Math.sin(m.spin) > .55;
    if (wob) {
      if (ix + 1 < W) pix[i + 1] = c;
    } else if (((ix + iy) & 1) === 0) {
      pix[i - W] = c;
    }
  }
}
