'use strict';
/* ------------------------------------------------------------------
 * 最小等距像素渲染器
 * 参考 pixel-plays 的 engine.js，只保留最小闭环：
 * 等距投影 / 深度缓冲 / 球体+胶囊+盒子 / 5 级色阶 / Bayer 抖动 /
 * 投影阴影 / 深度边缘
 *
 * 引擎级设施（跨场景复用）：
 *   capture 像素缓存  —— 树/花草"生成一次、每帧平移"的风动基础
 *   staticShadow 联动 —— 影子里的草/水/叶自动变暗
 *   bakeOcclusion()   —— 屏幕空间 AO，物体脚下落地感
 * ------------------------------------------------------------------ */

/* 画布尺寸：默认 360×280，可用 PP_W / PP_H 覆盖（竖构图场景需要） */
const W = window.PP_W || 360, H = window.PP_H || 280;
const S = window.PP_SCALE || 14;
const SIN = 0.5, COS = Math.sqrt(3) / 2, R2 = Math.SQRT2;
const OX = W / 2 + (window.PP_ORIGIN_X || 0);
const OY = H / 2 + (window.PP_ORIGIN_Y == null ? 18 : window.PP_ORIGIN_Y);
const SHADOW_X = 1.3, SHADOW_Y = -0.12;

const canvas = document.getElementById('c');
canvas.width = W;
canvas.height = H;
const ctx = canvas.getContext('2d');
const image = ctx.createImageData(W, H);
const pix = new Uint32Array(image.data.buffer);

const zb = new Float32Array(W * H);
const bakedPix = new Uint32Array(W * H);
const bakedZ = new Float32Array(W * H);
const ground = new Uint8Array(W * H);
const groundZ = new Float32Array(W * H);
const shadowMask = new Uint8Array(W * H);
/* 静态阴影掩码：bake 完成后留存，动态元素（草/叶/水）读它决定明暗 */
const staticShadow = new Uint8Array(W * H);

/* 地面材质标记：KIND_GRASS 的像素才长草，球场/屋顶上自动没有草 */
const KIND_NONE = 0, KIND_GRASS = 3;
const kinds = new Uint8Array(W * H);

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + .5) / 16);
const COOL = [46, 38, 84], WARM = [255, 232, 180];
const GRADIENT_Y = COS / (S * SIN), EDGE = .28;

/* 默认草色（场景可传自己的色组给 growGrass） */
const ENGINE_GRASS = [[34, 62, 50], [52, 88, 52], [82, 118, 54], [124, 146, 62], [168, 172, 76]];

const rgb = (r, g, b) => (255 << 24 | Math.min(255, b | 0) << 16 | Math.min(255, g | 0) << 8 | Math.min(255, r | 0)) >>> 0;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => t * t * (3 - 2 * t);
const bayerAt = (ix, iy) => BAYER[(iy & 3) * 4 + (ix & 3)];

function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = ease(x - ix), fy = ease(y - iy);
  return lerp(
    lerp(hash(ix, iy), hash(ix + 1, iy), fx),
    lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), fx),
    fy
  );
}

/* 5 级色阶：暗部偏紫，亮部偏暖黄 */
const ramps = new WeakMap();
function rampOf(c) {
  let ramp = ramps.get(c);
  if (ramp) return ramp;
  const mix = (m, tint, k) => rgb(
    lerp(c[0] * m, tint[0], k),
    lerp(c[1] * m, tint[1], k),
    lerp(c[2] * m, tint[2], k)
  );
  ramp = [mix(.4, COOL, .34), mix(.62, COOL, .18), mix(.84, COOL, .05), mix(1, WARM, 0), mix(1.1, WARM, .22)];
  ramps.set(c, ramp);
  return ramp;
}

function tint(i, r, g, b) {
  const c = pix[i];
  pix[i] = rgb((c & 255) * r, (c >> 8 & 255) * g, (c >> 16 & 255) * b);
}

/* 30° 正交等距投影 */
function project(x, y, z) {
  const u = (x - y) / R2, v = (x + y) / R2;
  return {
    sx: OX + u * S,
    sy: OY + (v * SIN - z * COS) * S,
    d: v * COS + z * SIN,
  };
}
function unproject(sx, sy) {
  const u = (sx - OX) / S, v = (sy - OY) / (S * SIN);
  return { x: (u + v) / R2, y: (v - u) / R2 };
}

/* capture 像素缓存：设了 capture，sphere 只记录像素不落笔 */
let capture = null;
const leaves = [];

/* 球体：屏幕空间圆 + 球面法线光照 + 有序抖动 */
function sphere(x, y, z, r, c, mode) {
  const ramp = rampOf(c);
  const p = project(x, y, z), rp = Math.max(r * S, .75);
  const y0 = Math.max(0, Math.floor(p.sy - rp)), y1 = Math.min(H - 1, Math.ceil(p.sy + rp));
  const x0 = Math.max(0, Math.floor(p.sx - rp)), x1 = Math.min(W - 1, Math.ceil(p.sx + rp));
  for (let iy = y0; iy <= y1; iy++) for (let ix = x0; ix <= x1; ix++) {
    const dx = (ix + .5 - p.sx) / rp, dy = (iy + .5 - p.sy) / rp, nn = dx * dx + dy * dy;
    if (nn > 1) continue;
    const nz = Math.sqrt(1 - nn), d = p.d + r * nz, i = iy * W + ix;
    /* 深度检查对 capture 同样生效：被场景物体挡住的像素不进入缓存，
       否则回放时树叶会盖在树干前面 */
    if (d <= zb[i]) continue;
    let l = clamp(-.55 * dx - .6 * dy + .58 * nz, 0, 1);
    if (mode === 'rough') l += (hash(ix, iy) - .5) * .55;
    if (dy > .35) l = Math.max(l, .12 + dy * .24);   // 地面反弹的暖光
    if (capture) {
      capture.push(ix, iy, d, ramp[clamp(Math.floor(l * 4.4 + .2 + (bayerAt(ix, iy) - .5) * .7), 0, 4)]);
      continue;
    }
    zb[i] = d;
    if (mode === 'gloss' && l > .9) { pix[i] = rgb(255, 250, 232); continue; }
    // 剪影用 solid：不加抖动，保持边缘干净
    if (mode === 'solid') { pix[i] = ramp[clamp(Math.floor(l * 4.4 + .2), 1, 4)]; continue; }
    pix[i] = ramp[clamp(Math.floor(l * 4.4 + .2 + (bayerAt(ix, iy) - .5) * .7), 0, 4)];
  }
}

/* 胶囊：沿线段采样一串球，用来画树干、四肢 */
function capsule(a, b, r0, r1, colorOf, mode) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const n = Math.max(1, Math.ceil(len / (Math.min(r0, r1) * .45)));
  for (let k = 0; k <= n; k++) {
    const t = k / n, z = lerp(a[2], b[2], t);
    sphere(
      lerp(a[0], b[0], t), lerp(a[1], b[1], t), z,
      lerp(r0, r1, t), colorOf(z), mode
    );
  }
}

/* 单像素写入：用来画门窗、水波这类自定义细节 */
function plot(x, y, z, color) {
  const p = project(x, y, z), ix = p.sx | 0, iy = p.sy | 0;
  if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
  const i = iy * W + ix;
  if (p.d <= zb[i]) return;
  zb[i] = p.d;
  pix[i] = color;
}

/* 盒子：只画顶/前/右三个可见面，亮度写死 */
function box(x0, y0, z0, x1, y1, z1, c, seed = 0) {
  const ramp = rampOf(c);
  const paint = (x, y, z, base, grain) => {
    const p = project(x, y, z), ix = p.sx | 0, iy = p.sy | 0;
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
    const i = iy * W + ix;
    if (p.d <= zb[i]) return;
    zb[i] = p.d;
    pix[i] = ramp[clamp(Math.floor(base + (grain - .5) * 1.3 + (bayerAt(ix, iy) - .5) * .5), 0, 4)];
  };
  const step = .045, longX = x1 - x0 >= y1 - y0;
  for (let a = x0; a <= x1; a += step) for (let b = y0; b <= y1; b += step)
    paint(a, b, z1, 3.4, longX ? noise(a * .8 + seed, b * 9) : noise(a * 9, b * .8 + seed));
  for (let a = x0; a <= x1; a += step) for (let b = z0; b <= z1; b += step)
    paint(a, y1, b, 2.3, noise(a * .8 + seed, b * 9));
  for (let a = y0; a <= y1; a += step) for (let b = z0; b <= z1; b += step)
    paint(x1, a, b, 1.2, noise(a * .8 + seed, b * 9));
}

/* 投影阴影：把 (x,y,z) 沿光方向压到地面，写椭圆 mask */
function castShadow(x, y, z, r, strength = 1, dither = .4) {
  const p = project(x + SHADOW_X * z, y + SHADOW_Y * z, 0);
  const rx = r * S * 1.05, ry = rx * SIN + 1;
  const y0 = Math.max(0, Math.floor(p.sy - ry)), y1 = Math.min(H - 1, Math.ceil(p.sy + ry));
  const x0 = Math.max(0, Math.floor(p.sx - rx)), x1 = Math.min(W - 1, Math.ceil(p.sx + rx));
  for (let iy = y0; iy <= y1; iy++) for (let ix = x0; ix <= x1; ix++) {
    const dx = (ix + .5 - p.sx) / rx, dy = (iy + .5 - p.sy) / ry;
    if (dx * dx + dy * dy + (bayerAt(ix, iy) - .5) * dither > 1) continue;
    const i = iy * W + ix;
    if (shadowMask[i] < strength) shadowMask[i] = strength;
  }
}

/* 只染“仍然是地面”的像素，物体不会被阴影糊住 */
function applyShadows(refZ) {
  for (let i = 0; i < pix.length; i++) {
    const s = shadowMask[i];
    if (!s) continue;
    shadowMask[i] = 0;
    if (!ground[i] || zb[i] !== refZ[i]) continue;
    if (s === 1) tint(i, .54, .52, .72);
    else tint(i, .36, .34, .56);
  }
}

/* 屏幕空间 AO：向 8 方向 × 2 半径探测非地面像素，命中越多压得越暗 */
function bakeOcclusion() {
  const offsets = [];
  for (const r of [2, 4]) for (let k = 0; k < 8; k++) {
    offsets.push([Math.round(Math.cos(k * Math.PI / 4) * r), Math.round(Math.sin(k * Math.PI / 4) * r * .7)]);
  }
  for (let iy = 4; iy < H - 4; iy++) for (let ix = 4; ix < W - 4; ix++) {
    const i = iy * W + ix;
    if (!ground[i] || zb[i] !== groundZ[i]) continue;
    let hits = 0;
    for (const [ox, oy] of offsets) {
      const j = (iy + oy) * W + ix + ox;
      if (zb[j] !== groundZ[j]) hits++;
    }
    if (!hits) continue;
    if (hits >= 8) tint(i, .56, .54, .72);
    else if (hits / 8 > bayerAt(ix, iy)) tint(i, .74, .72, .84);
  }
}

/* 深度缓冲描边：物体边缘压暗，朝向光源的一侧加暖色 rim */
function shadeEdges() {
  for (let iy = 1; iy < H - 1; iy++) for (let ix = 1; ix < W - 1; ix++) {
    const i = iy * W + ix, d = zb[i];
    if (d < -1e8 || d === groundZ[i]) continue;
    const a = i - W, b = i + W, c = i - 1, e = i + 1;
    if (zb[a] === groundZ[a] || zb[b] === groundZ[b] || zb[c] === groundZ[c] || zb[e] === groundZ[e]) {
      tint(i, .68, .66, .76);
    } else if (d - zb[a] - GRADIENT_Y > EDGE || d - zb[c] > EDGE) {
      const p = pix[i];
      pix[i] = rgb(
        lerp(p & 255, WARM[0], .3),
        lerp(p >> 8 & 255, WARM[1], .3),
        lerp(p >> 16 & 255, WARM[2], .22)
      );
    } else if (zb[e] - d > EDGE || zb[b] - GRADIENT_Y - d > EDGE) {
      tint(i, .74, .72, .82);
    }
  }
}

/* ---- capture 缓存：风动的基础设施 ---- */

/* 记录一个球的像素，供每帧平移回放 */
function captureSphere(x, y, z, r, c, mode, meta) {
  const buf = [];
  capture = buf;
  sphere(x, y, z, r, c, mode);
  capture = null;
  const leaf = { x, y, z, k: leaves.length, r: r * 2.2, pixels: buf };
  if (meta) Object.assign(leaf, meta);
  leaves.push(leaf);
  return leaf;
}

/* 每帧把缓存的像素按风的偏移重新贴回画面 */
function drawLeaves(t) {
  for (const leaf of leaves) {
    const reach = clamp((leaf.z - 2.5) / 3, .3, 1);
    const swayX = (Math.sin(t * .9 + leaf.x * .5 + leaf.z * .7) + .55 * Math.sin(t * 2.3 + leaf.k * 1.7)) * reach;
    const dx = Math.round(swayX * .9), dy = Math.round(Math.sin(t * 1.3 + leaf.y + leaf.k) * reach * .45);
    const px = leaf.pixels;
    for (let n = 0; n < px.length; n += 4) {
      const ix = px[n] + dx, iy = px[n + 1] + dy;
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
      const i = iy * W + ix;
      if (px[n + 2] <= zb[i]) continue;
      zb[i] = px[n + 2];
      pix[i] = px[n + 3];
    }
    if (leaf.k % 2 === 0) castShadow(leaf.x + swayX * .12, leaf.y, leaf.z, leaf.r);
  }
}

/* ---- 动态阴影队列：人物/车这类每帧移动的物体 ---- */

const pendingShadows = [];
function flushShadows() {
  for (let i = 0; i < pendingShadows.length; i += 4) {
    const a = pendingShadows[i], ra = pendingShadows[i + 1], c = pendingShadows[i + 2];
    const n = Math.max(1, Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]) / .25));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      castShadow(lerp(a[0], c[0], t), lerp(a[1], c[1], t), lerp(a[2], c[2], t), ra * .9, 1, 0);
    }
    if (a[2] < .25) castShadow(a[0], a[1], 0, .2, 2, 0);
  }
}

/* ---- 人物骨架：figure() ----
 * 局部坐标 (a=前, b=侧, c=高)，yaw 决定朝向。
 * 不直接画，而是把每根骨头交给 addBone 回调 —— 静态/动态都能复用。
 */

const ENGINE_SHOE = [226, 222, 212];

function figure(px, py, yaw, pose, palette, addBone) {
  const fx = Math.cos(yaw), fy = Math.sin(yaw), sx = -fy, sy = fx;
  const base = pose.z || 0, k = pose.scale || 1;
  const P = (a, b, c) => [px + (fx * a + sx * b) * k, py + (fy * a + sy * b) * k, c * k + base];
  const add = (a, b, r0, r1, f) => addBone(a, b, r0 * k, r1 * k, f);
  const t = palette;
  const shirt = z => (Math.floor(z * 3.2) % 2 ? t.shirt : t.stripe);  // 约 3px 一档
  const legs = () => t.legs, skin = () => t.skin;
  const crouch = pose.crouch || 0, lean = pose.lean || 0;
  const hipZ = 1.28 - crouch * .4;
  const hipA = -crouch * .15;
  const shA = hipA + Math.sin(lean) * .95, shZ = hipZ + Math.cos(lean) * .95;
  const neck = P(shA, 0, shZ + .08), head = P(shA + Math.sin(lean) * .32, 0, shZ + .36);
  const stance = pose.stance == null ? .2 : pose.stance;
  const footB = P(-stance * 1.2, .2, .12), footF = P(stance * 2, -.2, .12);
  const kneeB = P(-stance * .4 + crouch * .12, .22, .68 - crouch * .1);
  const kneeF = P(stance * 1.2 + crouch * .34, -.22, .72 - crouch * .08);
  const hipB = P(hipA, .15, hipZ), hipF = P(hipA, -.15, hipZ);
  add(hipB, kneeB, .17, .13, legs); add(kneeB, footB, .13, .1, legs);
  add(hipF, kneeF, .17, .13, legs); add(kneeF, footF, .13, .1, legs);
  add(footB, P(-stance * 1.2 + .16, .2, .08), .1, .09, () => ENGINE_SHOE);
  add(footF, P(stance * 2 + .16, -.2, .08), .1, .09, () => ENGINE_SHOE);
  add(P(hipA, 0, hipZ), neck, .3, .32, shirt);
  add(neck, head, .11, .12, skin);
  sphere2(add, head, .24, t.skin);
  sphere2(add, [head[0] - fx * .06, head[1] - fy * .06, head[2] + .08], .205, t.hair);
  const shR = P(shA, .36, shZ - .03), shL = P(shA, -.36, shZ - .03);
  const armR = pose.armR == null ? 0 : pose.armR, armL = pose.armL == null ? .08 : pose.armL;
  const elbowR = P(shA + Math.sin(armR) * .46, .4, shZ - .03 - Math.cos(armR) * .46);
  const handR = P(shA + Math.sin(armR + .18) * .95, .42, shZ - .03 - Math.cos(armR + .18) * .95);
  const elbowL = P(shA + Math.sin(armL) * .46, -.42, shZ - .03 - Math.cos(armL) * .46);
  const handL = P(shA + Math.sin(armL + .2) * .9, -.43, shZ - .03 - Math.cos(armL + .2) * .9);
  add(shR, elbowR, .12, .1, shirt); add(elbowR, handR, .09, .08, skin);
  add(shL, elbowL, .12, .1, shirt); add(elbowL, handL, .09, .08, skin);
  return handR;
}

function sphere2(add, c, r, color) { add(c, c, r, r, () => color); }

/* 画骨头 + 登记阴影，一步到位 */
const dynamicAdd = (a, b, r0, r1, f) => {
  capsule(a, b, r0, r1, f, 'solid');
  pendingShadows.push(a, r0, b, r1);
};

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

/* ---- 像素级 UI：提示箭头 ---- */

function drawDots(points, color) {
  for (const [sx, sy] of points) {
    const ix = sx | 0, iy = sy | 0;
    if (ix >= 0 && iy >= 0 && ix < W && iy < H) pix[iy * W + ix] = color;
  }
}

const ARROW = [
  '....ooooo....',
  '....oXXXo....',
  '....oXXXo....',
  '....oXXXo....',
  'oooooXXXooooo',
  'oXXXXXXXXXXXo',
  '.oXXXXXXXXXo.',
  '..oXXXXXXXo..',
  '...oXXXXXo...',
  '....oXXXo....',
  '.....oXo.....',
  '......o......',
];
const INK = rgb(28, 27, 25), SIGNAL = rgb(255, 214, 10), PAPER = rgb(255, 255, 255);

function haloDots(points) {
  const halo = [];
  for (const [x, y] of points) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) halo.push([x + dx, y + dy]);
  drawDots(halo, PAPER);
}

function drawArrow(sx, sy, time) {
  const bob = Math.floor(time * 3) % 2 * 2;
  const left = Math.round(sx) - 6, top = Math.round(sy) - ARROW.length - bob;
  const ink = [], fill = [];
  ARROW.forEach((row, y) => [...row].forEach((cell, x) => {
    if (cell === 'o') ink.push([left + x, top + y]);
    if (cell === 'X') fill.push([left + x, top + y]);
  }));
  haloDots(ink);
  drawDots(ink, INK);
  drawDots(fill, SIGNAL);
}

function fit() {
  const dpr = window.devicePixelRatio || 1;
  const scale = Math.max(1, Math.floor(Math.min(innerWidth / W, (innerHeight - 80) / H) * dpr)) / dpr;
  canvas.style.width = W * scale + 'px';
  canvas.style.height = H * scale + 'px';
}