'use strict';
/* ------------------------------------------------------------------
 * 屋顶晾衣 · 场景烘焙（只跑一次）
 *
 * 配方卡来源（docs/kit）：
 *   buildings.md §1  plaster-wall  抹灰 + 剥落露石
 *   buildings.md §2  house         外立面 + 开窗 + 百叶
 *   buildings.md §6  parapet       女儿墙
 *   buildings.md §7  stair-house / water-tank / chimney / 天线
 *   props.md  §4     wicker-basket 编织纹 + 篮口包边
 *   plants.md §4     potted-plant  花盆 + 14 球叶簇
 *   trees.md  §1     broadleaf     六簇球冠 + capture 风动
 *   scene.md         地面协议：ground / groundZ / kinds
 * ------------------------------------------------------------------ */

const ROOF_X = 12.5, ROOF_Y = 7, WALL_DEPTH = 6, PARAPET_H = .6;
const POLE_X = 10, LINE_Z = 3.7, LINE_YS = [-4.2, -.8, 2.6], SPAN = 17;
const BASKET = { x: 9.8, y: 5.2, r: .82, h: .95 };
const CARRY_Z = 1.7, DROP_PX = 26;

const WHITE = rgb(255, 255, 255);
const PAVER = [190, 120, 88], PLASTER = [234, 224, 202], STONE = [206, 194, 170];
const SHUTTER = [70, 112, 104], DARK = [44, 40, 50], POT = [176, 92, 62];
const POLE = [96, 84, 74], ROPE = [238, 234, 222], WICKER = [188, 146, 88];
const LEAF_DEEP = [66, 92, 66], LEAF_MID = [110, 140, 82], LEAF_SILVER = [158, 172, 120];
const BARK = [92, 74, 60];
const STONE_DARK = [214, 204, 186];

/* 预先烘焙的低频湿度场：暴雨时超过阈值的地砖变水洼（weather.md §4） */
const puddle = new Float32Array(W * H);

const lineZ = x => LINE_Z - .22 * (1 - (x / POLE_X) ** 2);

/* ---------------- 屋顶铺砖 ---------------- */

function groundColor(x, y, ix, iy) {
  if (Math.abs(x) > ROOF_X || Math.abs(y) > ROOF_Y) return 0;
  const fx = x / 1.5, row = Math.floor(fx), fy = y / 1.5 + (row % 2) * .5, col = Math.floor(fy);
  const joint = fx - row < .08 || fy - col < .08;
  const ramp = rampOf(PAVER);
  if (joint) return ramp[1];
  const tone = hash(row, col), fine = hash(ix, iy);
  if (fine > .975) return ramp[4];
  if (noise(x * .5, y * .5) > .79 && fine > .7) return rgb(104, 110, 66); // 霉雨季节的苔藓
  return ramp[clamp(Math.floor(2.2 + tone * 1.6 + (bayerAt(ix, iy) - .5) * .5), 2, 4)];
}

/* ---------------- 外立面 ---------------- */

/* 抹灰墙 + 剥落处露出的砌体（buildings.md §1） */
function wallColor(a, z, base) {
  const fz = (z + 40) * 1.6, course = Math.floor(fz), fa = a * 1.2 + (course % 2) * .5, block = Math.floor(fa);
  if (noise(a * .4, z * .5 + 4) > .68) {
    const mortar = fz - course < .14 || fa - block < .1;
    return rampOf(STONE)[clamp(base - (mortar ? 1 : 0) + (hash(block, course) > .7 ? 1 : 0), 0, 4)];
  }
  return rampOf(PLASTER)[clamp(base + (hash(a * 9 | 0, z * 9 | 0) > .9 ? -1 : 0), 0, 4)];
}

/* 楼体往下渐隐，化进纸白背景 */
function wallPixel(x, y, z, a, base) {
  const fade = (-z - (WALL_DEPTH - 3)) / 3;
  if (fade > 0 && hash(a * 23 | 0, z * 23 | 0) < fade) return;
  plot(x, y, z, wallColor(a, z, base));
}

function buildWalls() {
  const step = .05;
  for (let x = -ROOF_X; x <= ROOF_X; x += step)
    for (let z = 0; z >= -WALL_DEPTH; z -= step) wallPixel(x, ROOF_Y, z, x, 3);
  for (let y = -ROOF_Y; y <= ROOF_Y; y += step)
    for (let z = 0; z >= -WALL_DEPTH; z -= step) wallPixel(ROOF_X, y, z, y, 2);

  /* 窗洞 + 两侧百叶：a 是沿墙的坐标，z 是高度 */
  const windows = (place, count, span) => {
    for (let k = 0; k < count; k++) {
      const c = (k + .5) / count * span * 2 - span;
      for (let a = -.45; a <= .45; a += step) for (let z = -2.8; z <= -1; z += step)
        place(c + a, z, rampOf(DARK)[Math.abs(a) < .03 || Math.abs(z + 1.9) < .03 ? 3 : 1]);
      for (const side of [-1, 1]) for (let a = .45; a <= .95; a += step) for (let z = -2.8; z <= -1; z += step)
        place(c + side * a, z, rampOf(SHUTTER)[Math.floor((z + 3) * 7) % 2 ? 3 : 2]);
    }
  };
  windows((a, z, c) => plot(a, ROOF_Y + .14, z, c), 5, ROOF_X);
  windows((a, z, c) => plot(ROOF_X + .14, a, z, c), 3, ROOF_Y);
}

/* ---------------- 屋面构件 ---------------- */

function buildRoof() {
  const h = PARAPET_H, t = .3;
  /* 女儿墙：四边矮墙围合（buildings.md §6） */
  box(-ROOF_X, ROOF_Y - t, 0, ROOF_X, ROOF_Y, h, PLASTER, 1);
  box(ROOF_X - t, -ROOF_Y, 0, ROOF_X, ROOF_Y, h, PLASTER, 2);
  box(-ROOF_X, -ROOF_Y, 0, ROOF_X, -ROOF_Y + t, h, PLASTER, 3);
  box(-ROOF_X, -ROOF_Y, 0, -ROOF_X + t, ROOF_Y, h, PLASTER, 4);

  const step = .05;

  /* 楼梯间 + 百叶门 + 屋顶水塔（buildings.md §7） */
  box(-12.2, -6.7, 0, -8.4, -3.2, 3.6, PLASTER, 5);
  box(-12.5, -7, 3.6, -8.1, -2.9, 3.85, STONE, 6);
  for (let a = -10.9; a <= -9.7; a += step) for (let z = 0; z <= 2.5; z += step)
    plot(a, -3.06, z, rampOf(SHUTTER)[Math.floor(a * 3) % 2 ? 2 : 1]);
  capsule([-10.8, -5, 4.5], [-9.4, -5, 4.5], .55, .55, () => STONE_DARK, 'rough');
  castShadow(-10, -5, 4.2, .9);

  /* 烟囱：三层方柱 + 陶土帽（buildings.md §7） */
  box(3, -6.5, 0, 4.2, -5.3, 2.8, STONE, 7);
  box(2.85, -6.65, 2.8, 4.35, -5.15, 3, PLASTER, 8);
  box(3.3, -6.2, 3, 3.9, -5.6, 3.35, POT, 9);

  /* 天线：竖杆 + 三横杆（structures.md §4.5） */
  for (let z = 0; z <= 5; z += step) plot(6.8, -6.3, z, rampOf(DARK)[2]);
  for (const [z, w] of [[4.8, .7], [4.4, 1], [4, 1.3]])
    for (let a = -w; a <= w; a += step) plot(6.8 + a, -6.3 - a * .3, z, rampOf(DARK)[2]);

  /* 花盆与盆栽（plants.md §4），靠女儿墙摆一排 */
  for (const [x, y, r] of [[-3, 6.1, .5], [-1.6, 6.15, .42], [5.6, 6.1, .46], [11.5, -2.2, .5], [11.55, -.9, .4]]) {
    box(x - r * .8, y - r * .8, 0, x + r * .8, y + r * .8, r * 1.4, POT, x | 0);
    for (let k = 0; k < 14; k++) {
      const a = hash(k, x * 3) * 6.28, d = hash(k, y * 5) * r;
      sphere(x + Math.cos(a) * d, y + Math.sin(a) * d, r * 1.7 + hash(k, 9) * r, .22, LEAF_MID, 'rough');
    }
    castShadow(x, y, r, r);
  }

  /* 角落的小柠檬树：broadleaf 配 capture 风动 */
  box(-11.7, 4.6, 0, -10.5, 5.8, .9, POT, 12);
  growLemonTree(-11.1, 5.2, .58, 180);
  castShadow(-11.1, 5.2, .3, .75);

  /* 晾衣杆 ×6 + 三条垂弧绳（props.md §5.5） */
  for (const y of LINE_YS) {
    for (const x of [-POLE_X, POLE_X]) {
      box(x - .09, y - .09, 0, x + .09, y + .09, LINE_Z + .25, POLE, 13);
      for (let z = .3; z < LINE_Z; z += .4) castShadow(x, y, z, .12, 1, 0);
    }
    for (let x = -POLE_X; x <= POLE_X; x += .04) plot(x, y, lineZ(x), rampOf(ROPE)[3]);
    for (let x = -POLE_X; x <= POLE_X; x += .4) castShadow(x, y, lineZ(x), .05, 1, 0);
  }

  /* 藤篮（props.md §4） */
  for (let t = 0; t < 6.283; t += .02) for (let z = 0; z <= BASKET.h; z += step) {
    const nx = Math.cos(t), ny = Math.sin(t), weave = (Math.floor(z * 8) + Math.floor(t * 7)) % 2;
    plot(BASKET.x + nx * BASKET.r, BASKET.y + ny * BASKET.r, z,
      rampOf(WICKER)[clamp(Math.round(2.6 - .5 * nx + .85 * ny) + weave - 1 + (z > BASKET.h - .1 ? 1 : 0), 0, 4)]);
  }
  for (let a = 0; a < 6.283; a += .05) for (let q = 0; q < BASKET.r - .1; q += step)
    plot(BASKET.x + Math.cos(a) * q, BASKET.y + Math.sin(a) * q, BASKET.h - .04, rampOf(POLE)[1]);
  for (let a = 0; a < 6.283; a += .05)
    plot(BASKET.x + Math.cos(a) * BASKET.r, BASKET.y + Math.sin(a) * BASKET.r, BASKET.h - .02, rampOf(WICKER)[4]);
  castShadow(BASKET.x, BASKET.y, .5, BASKET.r);

  /* 体积阴影：楼梯间、烟囱、后侧女儿墙 */
  for (let x = -12.2; x <= -8.4; x += .5) for (let y = -6.7; y <= -3.2; y += .5) for (let z = .4; z < 3.6; z += .6) castShadow(x, y, z, .5);
  for (let z = .4; z < 3; z += .5) castShadow(3.6, -5.9, z, .6);
  for (let x = -ROOF_X; x <= ROOF_X; x += .4) for (const z of [.1, .35, .55]) castShadow(x, -ROOF_Y + .15, z, .22);
}

/* ---------------- 小柠檬树 ---------------- */

const CROWN = [[.1, 0, 3.7, 1.6], [-1.4, -.7, 3.3, 1.2], [1.6, .7, 3.4, 1.25], [-.6, 1.1, 3.9, 1.1], [.9, -1.1, 4, 1.1], [.2, .1, 4.9, 1.05]];

function growLemonTree(x, y, scale, count) {
  const bark = () => BARK;
  capsule([x, y, 0], [x + .3 * scale, y + .1 * scale, 2.2 * scale], .36 * scale, .22 * scale, bark, 'rough');
  capsule([x + .3 * scale, y + .1 * scale, 2.2 * scale], [x - .8 * scale, y - .4 * scale, 3.3 * scale], .2 * scale, .13 * scale, bark, 'rough');
  capsule([x + .3 * scale, y + .1 * scale, 2.2 * scale], [x + 1.2 * scale, y + .4 * scale, 3.4 * scale], .2 * scale, .13 * scale, bark, 'rough');
  for (let n = 0; n < count; n++) {
    const k = n + 300, [cx, cy, cz, spread] = CROWN[n % CROWN.length];
    const a = hash(k, 7) * 6.283, tilt = hash(k, 8) * 2 - 1, d = Math.cbrt(hash(k, 9)) * spread;
    const flat = Math.sqrt(1 - tilt * tilt);
    const rx = cx + Math.cos(a) * flat * d, ry = cy + Math.sin(a) * flat * d, rz = cz + tilt * d * .8;
    const tone = hash(k, 10) + (rz - 4.2) * .22 + (d / spread - .5) * .3;
    const leaf = tone > .72 ? LEAF_SILVER : tone > .3 ? LEAF_MID : LEAF_DEEP;
    captureSphere(x + rx * scale, y + ry * scale, rz * scale, (.2 + hash(k, 11) * .22) * scale, leaf, 'rough');
  }
}

/* ---------------- 烘焙 ---------------- */

function bakeScene() {
  zb.fill(-1e9);
  pix.fill(WHITE);
  for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
    const g = unproject(ix + .5, iy + .5), c = groundColor(g.x, g.y, ix, iy), i = iy * W + ix;
    if (!c) continue;
    pix[i] = c;
    ground[i] = 1;
    zb[i] = (g.x + g.y) / R2 * COS;
    puddle[i] = noise(g.x * .55 + 3, g.y * .8 + 7);
  }
  groundZ.set(zb);
  buildWalls();
  buildRoof();
  applyShadows(groundZ);   // 先落投影
  bakeOcclusion();         // 再补接触遮蔽（已压暗的像素自动跳过）
  bakedPix.set(pix);
  bakedZ.set(zb);
}
