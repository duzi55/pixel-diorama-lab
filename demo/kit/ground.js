'use strict';
/* ------------------------------------------------------------------
 * 构件库 · 地面材质
 *
 * 按 docs/kit/scene.md 的地面贴图协议实现：
 *   groundColor(x, y, ix, iy, i) → 返回 0 表示留白
 *
 * 每种材质写 kinds[i]，草只在 KIND_GRASS 上生长。
 * 大面积地面用「近邻 4 色」而非 5 级宽色阶，避免 Bayer 抖动读成棋盘格
 * （docs/kit/scene.md §4.2 解法 A）。
 * ------------------------------------------------------------------ */

/* 近邻 4 色地面色组：通道差 10~15，抖动读作颗粒而非棋盘 */
const KIT_SOIL = [[176, 148, 104], [186, 158, 114], [196, 168, 124], [206, 178, 134]];
const KIT_MEADOW = [[104, 132, 62], [114, 142, 68], [124, 152, 74], [134, 162, 80]];
const KIT_SAND = [[200, 172, 130], [211, 185, 141], [220, 196, 151], [229, 207, 163]];
const KIT_STONE = [[150, 146, 138], [160, 156, 148], [170, 166, 158], [180, 176, 168]];
const KIT_WATER = [[58, 96, 122], [66, 108, 136], [76, 120, 150], [88, 134, 166]];

const KIT_GRASS_TONES = KIT_MEADOW;

/* 地面材质表：kind → 函数 */
KIT_RENDER.groundMats = {

  /* ---- 草地：超椭圆岛 + 噪声边缘溶解 ---- */
  meadow(x, y, ix, iy, i) {
    const e = kitEdge(x, y, 18, 12);
    if (e > 1.04) return 0;
    if (e > .93 && hash(ix, iy) < (e - .93) / .11) return 0;   /* 溶解带 */
    kinds[i] = KIND_GRASS;
    /* 苔藓斑块：低频选区 + 高频打散 */
    if (noise(x * .5, y * .5) > .72 && hash(ix, iy) > .55) return rgb(116, 122, 70);
    const v = .45 + noise(x * .8, y * .8) * .3 + (hash(ix, iy) - .5) * .25;
    return rgb(...KIT_MEADOW[clamp(Math.floor(v * 3.999 + (bayerAt(ix, iy) - .5) * .6), 0, 3)]);
  },

  /* ---- 泥土：干裂土路基底 ---- */
  soil(x, y, ix, iy, i) {
    const e = kitEdge(x, y, 16, 11);
    if (e > 1.04) return 0;
    if (e > .93 && hash(ix, iy) < (e - .93) / .11) return 0;
    kinds[i] = KIND_NONE;
    const v = .42 + noise(x * 1.1, y * 1.1) * .34 + (hash(ix, iy) - .5) * .3;
    return rgb(...KIT_SOIL[clamp(Math.floor(v * 3.999 + (bayerAt(ix, iy) - .5) * .6), 0, 3)]);
  },

  /* ---- 沙地 ---- */
  sand(x, y, ix, iy, i) {
    const e = kitEdge(x, y, 17, 10);
    if (e > 1.04) return 0;
    if (e > .93 && hash(ix, iy) < (e - .93) / .11) return 0;
    kinds[i] = KIND_NONE;
    const v = .5 + noise(x * .9, y * .9) * .28 + (hash(ix, iy) - .5) * .3;
    return rgb(...KIT_SAND[clamp(Math.floor(v * 3.999 + (bayerAt(ix, iy) - .5) * .6), 0, 3)]);
  },

  /* ---- 石板广场：矩形硬边（人工造物） ---- */
  plaza(x, y, ix, iy, i) {
    if (Math.abs(x) > 13 || Math.abs(y) > 9) return 0;
    kinds[i] = KIND_NONE;
    /* 石板分缝：格子 + 每块自己的色差 */
    const gx = Math.floor(x * .8), gy = Math.floor(y * .8);
    const seam = (Math.abs(x * .8 - gx - .5) > .44 || Math.abs(y * .8 - gy - .5) > .44);
    if (seam) return rgb(128, 124, 118);
    const tone = hash(gx * 7, gy * 13);
    const v = .5 + tone * .3 + (hash(ix, iy) - .5) * .22;
    return rgb(...KIT_STONE[clamp(Math.floor(v * 3.999 + (bayerAt(ix, iy) - .5) * .6), 0, 3)]);
  },

  /* ---- 水面：有波光 ---- */
  water(x, y, ix, iy, i) {
    const e = kitEdge(x, y, 15, 9);
    if (e > 1.02) return 0;
    kinds[i] = KIND_NONE;
    /* 波纹：两条不同频率的正弦叠加 */
    const w = Math.sin(x * 1.4 + y * .6) * .5 + Math.sin(x * .5 - y * 1.9) * .5;
    const v = .42 + w * .22 + (hash(ix, iy) - .5) * .2;
    return rgb(...KIT_WATER[clamp(Math.floor(v * 3.999 + (bayerAt(ix, iy) - .5) * .6), 0, 3)]);
  },
};

/* 超椭圆归一化半径 + 噪声起伏（docs/kit/scene.md §2） */
function kitEdge(x, y, rx, ry) {
  const e = Math.pow(Math.pow(Math.abs(x) / rx, 4) + Math.pow(Math.abs(y) / ry, 4), .25);
  return e + (noise(x * 1.3, y * 1.3) - .5) * .13;
}
