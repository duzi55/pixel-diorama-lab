'use strict';
/* ------------------------------------------------------------------
 * 飘落的落叶
 *
 * 树冠在风里晃，落叶从冠上飘下来，落到地面就消失。
 * 阵风来的时候飘得快、飘得远。
 *
 * ★ 数量与尺寸（实测教训）：
 *   600×760 画布上，16 片 1px 落叶 = 每 28500 像素才 1 片，
 *   肉眼完全看不见（用户反馈"树没有落叶"）。
 *   → 120 片，每片画成 2~4 像素的**叶子形状**（带叶尖方向）。
 *
 * 参考：demo/autumn.js 的 motes 机制 + docs/kit/nature.md §8
 * ------------------------------------------------------------------ */

/* 落叶粒子：x/y 是世界坐标，z 是高度，z 掉到 0 就重新从某棵树上生成 */
const fallingLeaves = [];
let leafSources = [];        // 树的落点列表，由 foliage.js 填

/* ★ 落叶的定位：**一点点意思意思**，不是具象的树叶
 *
 *   教训：做过 6×6 带描边的叶形 → 太具象，抢了树冠的戏。
 *   但颜色若和树冠一样（[250,198,38]），又会完全融进去 → "没有落叶"。
 *   → 取中间：1~2 像素的小点，颜色比树冠**暗一档**（约 45 亮度）。
 *   静态时隐约可见，飘落时靠运动被感知。
 */
const LEAF_FALL_COLORS = [
  [206, 142, 34], [216, 156, 40], [196, 128, 30],
  [210, 148, 36], [200, 136, 32],
];

/* 默认落叶总数 —— 少而含蓄 */
const LEAF_FALL_COUNT = 30;

function setupFallingLeaves(sources, count) {
  leafSources = sources;
  fallingLeaves.length = 0;
  const n = count || LEAF_FALL_COUNT;
  for (let i = 0; i < n; i++) fallingLeaves.push(spawnLeaf({}, i, true));
}

function spawnLeaf(m, i, spread) {
  if (!leafSources.length) { m.x = 0; m.y = 0; m.z = 10; m.c = LEAF_FALL_COLORS[0]; return m; }
  const src = leafSources[(hash(i, 71) * leafSources.length) | 0];
  /* ★ 生成半径按树冠尺度放大：r=1.3 只有树冠的零头，
     叶子会全挤在树干顶上一个点。用 0.35~1.0 倍树高散布。 */
  const a = hash(i, 72) * 6.283;
  const r = (0.35 + hash(i, 73) * 0.65) * (src.z * .55);
  m.x = src.x + Math.cos(a) * r;
  m.y = src.y + Math.sin(a) * r;
  /* ★ 初始高度在树冠到地面之间铺开（不是全挤在冠顶）：
     spread=true（初始化）→ 均匀铺满整个下落区间，一上来就看到满天飘；
     spread=false（重生）→ 从冠顶重新落下。 */
  m.z = spread
    ? src.z * (.35 + hash(i, 74) * .65)
    : src.z * (.85 + hash(i, 74) * .15);
  m.vz = .20 + hash(i, 75) * .26;
  m.ph = hash(i, 76) * 6.283;
  m.spin = hash(i, 77) * 6.283;
  m.spinV = .8 + hash(i, 79) * 1.6;      /* 自转速度，让叶子翻面 */
  m.c = LEAF_FALL_COLORS[(hash(i, 78) * LEAF_FALL_COLORS.length) | 0];
  m.scale = .8 + hash(i, 80) * .5;        /* 每片叶子大小略有差异 */
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
    m.x += (.18 + gust * 0.85 + Math.sin(t * 2.1 + m.ph) * 0.13) * dt;
    m.y += Math.cos(t * 1.7 + m.ph) * 0.09 * dt;
    m.spin += dt * (m.spinV || 1.4) * (1 + gust * .8);
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
    /* ★ 1~2 像素，就是"一点点意思"。
     *   不描边、不加亮、不放大 —— 靠飘落的运动被感知。
     *   参考：demo/autumn.js 的 drawMotes()。 */
    pix[i] = c;
    /* 翻面时偶尔带第二个像素，像叶子侧过来了 */
    if (((ix + iy) & 1) === 0) pix[i + 1] = c;
  }
}
