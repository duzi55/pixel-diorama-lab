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

/* ★ 落叶色必须和**树冠色拉开对比**（实测教训）：
 *   树冠基色是 [250,198,38]（亮金黄）。
 *   原来的落叶色 [226,150,40] 只比它暗 70 亮度 → 画在树海上完全融进去。
 *   参考图里地面/落叶与树冠的亮度差是 **224** —— 必须有这么大才读得出来。
 *   → 落叶用**亮橙**（比树冠更红更亮）+ **深褐描边**，两头都拉开。 */
const LEAF_FALL_COLORS = [
  [248, 146, 44], [255, 168, 56], [232, 118, 34],
  [255, 190, 74], [220, 100, 28], [242, 134, 40],
];

/* 落叶描边：深褐，勾出叶形轮廓 —— 在亮树冠上分离的关键 */
const LEAF_FALL_EDGE = [122, 52, 14];

/* 默认落叶总数 */
const LEAF_FALL_COUNT = 90;

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
  const ec = rgb(...LEAF_FALL_EDGE);
  for (const m of fallingLeaves) {
    const p = project(m.x, m.y, m.z);
    const ix = Math.round(p.sx), iy = Math.round(p.sy);
    /* 叶子 6×6，留出描边空间 */
    if (ix < 4 || iy < 4 || ix >= W - 8 || iy >= H - 8) continue;
    const c = rgb(...m.c);
    const i = iy * W + ix;
    /* ★ 6×6 的叶形 + 深褐描边（不是方块，也不是小点）
     *
     *      ..# # # .      ← 叶尖
     *      .# # # # #     ← 叶片上缘
     *      # # # # # #    ← 叶片最宽
     *      .# # # # #     ← 叶片下缘
     *      ..# # # .      ← 收窄
     *      ...# # .       ← 叶柄
     *
     *   描边用深褐 [122,52,14]，主体用亮橙 —— 在亮树冠/暗树冠上都分离。
     *   自转时宽窄变化（正面 / 侧面），读作"叶子在翻面"。
     */
    const face = Math.sin(m.spin) > 0;
    if (face) {
      /* 正面：5 行叶形 */
      const rows = [
        [2, 3],       /* 叶尖：2 像素宽 */
        [1, 5],       /* 上缘：4 像素 */
        [0, 6],       /* 最宽：6 像素 */
        [1, 5],
        [2, 3],
      ];
      for (let r = 0; r < rows.length; r++) {
        const [a, b] = rows[r];
        for (let x = a; x < b; x++) {
          const idx = i + r * W + x;
          /* 描边：每行两端 */
          pix[idx] = (x === a || x === b - 1) ? ec : c;
        }
      }
      /* 上下缘描边 */
      for (let x = 2; x < 4; x++) pix[i - W + x] = ec;
      for (let x = 2; x < 4; x++) pix[i + W * 5 + x] = ec;
    } else {
      /* 侧面：2 列 × 5 行的窄叶 */
      for (let r = 0; r < 5; r++) {
        pix[i + r * W] = ec;
        pix[i + r * W + 1] = c;
        pix[i + r * W + 2] = ec;
      }
    }
  }
}
