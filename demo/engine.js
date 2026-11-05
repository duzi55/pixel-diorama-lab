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

/* 画布尺寸：默认 360×280，可用 PP_W / PP_H 覆盖（竖构图场景需要）。
 * PP_FULLSCREEN=true 时画布铺满浏览器窗口（像素数 = 窗口 / PP_SCALE）。
 * 尺寸变化走 PP_setSize() 重建全部缓冲，并回调 window.PP_ONRESIZE
 * （场景在里面重跑 bake）。 */
let W = window.PP_W || 380, H = window.PP_H || 560;
const S = window.PP_SCALE || 11;
const SIN = 0.5, COS = Math.sqrt(3) / 2, R2 = Math.SQRT2;
let OX = W / 2 + (window.PP_ORIGIN_X || 0);
let OY = H / 2 + (window.PP_ORIGIN_Y == null ? 18 : window.PP_ORIGIN_Y);
const SHADOW_X = 1.3, SHADOW_Y = -0.12;

/* 全局光照配置（兼容 Studio 光照系统，默认等距斜上方平行光） */
const LIGHT = window.LIGHT || {
  dir: { x: -0.55, y: -0.6, z: 0.58 },
  shadow: { x: 1.3, y: -0.12 },
  tint: [1, 1, 1],
  ambient: 1,
  vignette: 0,
  points: [],          /* [{x,y,z,r,color,power}] 点光源（路灯等） */
};

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

/* 地面材质标记：KIND_GRASS 的像素才长草，球场/屋顶上自动没有草 */
const KIND_NONE = 0, KIND_GRASS = 3;

let image, pix, zb, bakedPix, bakedZ, ground, groundZ, shadowMask, staticShadow, kinds;
let darkened;

function PP_setSize(w, h) {
  W = Math.max(80, w | 0); H = Math.max(60, h | 0);
  OX = W / 2 + (window.PP_ORIGIN_X || 0);
  OY = H / 2 + (window.PP_ORIGIN_Y == null ? 18 : window.PP_ORIGIN_Y);
  canvas.width = W;
  canvas.height = H;
  image = ctx.createImageData(W, H);
  pix = new Uint32Array(image.data.buffer);
  zb = new Float32Array(W * H);
  bakedPix = new Uint32Array(W * H);
  bakedZ = new Float32Array(W * H);
  darkened = new Uint8Array(W * H);
  ground = new Uint8Array(W * H);
  groundZ = new Float32Array(W * H);
  shadowMask = new Uint8Array(W * H);
  staticShadow = new Uint8Array(W * H);
  kinds = new Uint8Array(W * H);
  if (window.PP_ONRESIZE) window.PP_ONRESIZE();
}
PP_setSize(W, H);

/* 顶层 let 不挂 window：跨 iframe 抓底图走这些 getter（PP_setSize 后自动跟随） */
window.PP_SCENE = { get W() { return W; }, get H() { return H; }, get pix() { return pix; },
  get bakedPix() { return bakedPix; }, get bakedZ() { return bakedZ; },
  get ground() { return ground; }, get groundZ() { return groundZ; } };

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + .5) / 16);
const COOL = [46, 38, 84], WARM = [255, 232, 180];
const GRADIENT_Y = COS / (S * SIN), EDGE = .28;


/* rim 模式：环带内径比例（外径=1）。越小描边越粗。
 * ★ 参考图（3× 放大实测）：树冠描边是**连续的深褐色闭合轮廓**，
 *   宽约 1.5~2px（冠半径 18px 时）。
 *   内径比 .74 → 环带宽 (1-.74)/2 * 18 ≈ 2.3px，
 *   连续性好（相邻球的描边环带能互相接上）。
 *   .84 只有 1.4px，容易被相邻球切碎成虚线。 */
const RIM_INNER = .74;

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
  /* 颜色必须是 [r,g,b] (0..255) 基色数组 —— 三种错法都在这拦下：
     1. 传打包数字（rgb() 的返回值）
     2. 传嵌套数组（把多档色组当基色传入）
     3. 把 rampOf() 返回的 5 档 Uint32 数组再次传给 sphere/capsule/box */
  if (!Array.isArray(c) || c.length !== 3 || !(c[0] >= 0 && c[0] <= 255 && c[1] >= 0 && c[1] <= 255 && c[2] >= 0 && c[2] <= 255)) {
    throw new Error(`rampOf() 需要 [r,g,b] (0..255) 基色数组，收到：${JSON.stringify(c).slice(0, 60)}`);
  }
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
  if (r < 1) darkened[i] = 1;
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
function unproject(sx, sy, z = 0) {
  const u = (sx - OX) / S, v = ((sy - OY) / S + z * COS) / SIN;
  return { x: (u + v) / R2, y: (v - u) / R2 };
}
/* 屏幕 → 高度 z 水平面（树冠叶簇逐像素反解用），返回 [x, y] */
function unprojectAt(sx, sy, z) { const g = unproject(sx, sy, z); return [g.x, g.y]; }

/* capture 像素缓存：设了 capture，sphere 只记录像素不落笔 */
let capture = null;
const leaves = [];

/* 球体：屏幕空间圆 + 球面法线光照 + 有序抖动 */
function sphere(x, y, z, r, c, mode) {
  const ramp = rampOf(c);
  const p = project(x, y, z), rp = Math.max(r * S, .75);
  const y0 = Math.max(0, Math.floor(p.sy - rp)), y1 = Math.min(H - 1, Math.ceil(p.sy + rp));
  const x0 = Math.max(0, Math.floor(p.sx - rp)), x1 = Math.min(W - 1, Math.ceil(p.sx + rp));
  /* 空气透视：这个球整体往雾色偏（球心算一次，不用逐像素） */
  const hz = hazeAmount(x, y, z);
  for (let iy = y0; iy <= y1; iy++) for (let ix = x0; ix <= x1; ix++) {
    const dx = (ix + .5 - p.sx) / rp, dy = (iy + .5 - p.sy) / rp, nn = dx * dx + dy * dy;
    if (nn > 1) continue;
    const nz = Math.sqrt(1 - nn), d = p.d + r * nz, i = iy * W + ix;
    /* 深度检查对 capture 同样生效：被场景物体挡住的像素不进入缓存，
       否则回放时树叶会盖在树干前面 */
    if (d <= zb[i]) continue;
    let l = clamp(-LIGHT.dir.x * dx - LIGHT.dir.y * dy + LIGHT.dir.z * nz, 0, 1);
    if (mode === 'rough') l += (hash(ix, iy) - .5) * .55;
    if (dy > .35) l = Math.max(l, .12 + dy * .24);   // 地面反弹的暖光
    if (capture) {
      const cc = ramp[clamp(Math.floor(l * 4.4 + .2 + (bayerAt(ix, iy) - .5) * .7), 0, 4)];
      capture.push(ix, iy, d, hz ? mixHaze(cc, hz) : cc);
      continue;
    }
    zb[i] = d;
    if (mode === 'gloss' && l > .9) { pix[i] = mixHaze(rgb(255, 250, 232), hz); continue; }
    // flat：直接写基色，不走色阶。用于勾边/描线这类要"固定颜色"的场合
    // （走 rampOf 会被再压暗一次，深色勾边会吃掉半个图形）
    if (mode === 'flat') { pix[i] = mixHaze(rgb(c[0], c[1], c[2]), hz); continue; }
    // rim：只画"环带"—— 落在球内但落在内切球外的像素。
    // 用来给已画好的形体加描边：内层是原色，环带是描边色。
    // 为什么要专门做这个：更大的球深度贡献总是更大（sqrt(R²-d²)），
    // 所以"先画大深球再画小金球"是盖不住的 —— 金球永远输掉深度测试。
    if (mode === 'rim') {
      const inner = rp * RIM_INNER;
      if (dx * dx + dy * dy < inner * inner) continue;
      pix[i] = mixHaze(rgb(c[0], c[1], c[2]), hz);
      continue;
    }
    // 剪影用 solid：不加抖动，保持边缘干净
    if (mode === 'solid') {
      const cc = ramp[clamp(Math.floor(l * 4.4 + .2), 1, 4)];
      pix[i] = hz ? mixHaze(cc, hz) : cc;
      continue;
    }
    pix[i] = ramp[clamp(Math.floor(l * 4.4 + .2 + (bayerAt(ix, iy) - .5) * .7), 0, 4)];
    if (hz) pix[i] = mixHaze(pix[i], hz);
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

/* 单像素写入：用来画门窗、水波这类自定义细节。
   plotCapture 非空时同时记录 (ix, iy, d, color) —— 逐像素画的树冠
   靠它做"烘焙一次、每帧平移回放"的风动（sphere 的 capture 只覆盖球体）。 */
let plotCapture = null;
function plot(x, y, z, color) {
  const p = project(x, y, z), ix = p.sx | 0, iy = p.sy | 0;
  if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
  const i = iy * W + ix;
  if (p.d <= zb[i]) return;
  zb[i] = p.d;
  pix[i] = color;
  if (plotCapture) plotCapture.push(ix, iy, p.d, color);
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
  const p = project(x + LIGHT.shadow.x * z, y + LIGHT.shadow.y * z, 0);
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
    if (darkened[i]) continue;          /* 已被 AO 压暗，不再叠投影 */
    /* ★ 路面（KIND_NONE）免影：车行道是画面的"亮带"，
       参考图里路面干净、只有路缘外的地面吃影 ——
       塔林/房屋的影子若染上路，公路会被淹没读不出来 */
    if (kinds[i] === KIND_NONE) continue;
    /* 四档：1 常规 / 2 深（接触影）/ 3 轻（晴天植物影）/ 4 极轻（远景柔影） */
    if (s === 4) tint(i, .90, .88, .93);
    else if (s === 3) tint(i, .82, .80, .88);
    else if (s === 1) tint(i, .62, .60, .78);
    else tint(i, .36, .34, .56);
  }
}

/* ---- 空气透视 ----
 * 远处的物体不是"缩小"，而是"变淡变灰"。
 * 参考图实测：越靠画面上方（越远）明度越高、饱和度越低。
 *
 * 做法：按物体基点的深度算雾浓度，把颜色往雾色混。
 * 雾浓度 0 = 清晰，1 = 完全融进雾里。
 */

let hazeColor = null;          // null = 不启用空气透视
let hazeNear = 0, hazeFar = 1, hazeMax = 0;

/* 按世界坐标设定雾：near 之外的东西开始起雾，far 之后完全化掉 */
function setHaze(color, near, far, maxAmount) {
  hazeColor = color;
  hazeNear = near;
  hazeFar = far;
  hazeMax = maxAmount == null ? 1 : maxAmount;
}

/* 求某点的雾浓度（0..1） */
function hazeAmount(x, y, z) {
  if (!hazeColor) return 0;
  /* 用到相机的距离近似"远近"：z 越大（越高）越远 */
  const d = Math.hypot(x, y) * .5 + (z || 0);
  const t = clamp((d - hazeNear) / (hazeFar - hazeNear), 0, 1);
  return t * hazeMax;
}

/* 把一个颜色往雾色混 */
function mixHaze(color, amount) {
  if (!hazeColor || amount <= 0) return color;
  const r = color & 255, g = color >> 8 & 255, b = color >> 16 & 255;
  const hr = hazeColor & 255, hg = hazeColor >> 8 & 255, hb = hazeColor >> 16 & 255;
  return rgb(lerp(r, hr, amount), lerp(g, hg, amount), lerp(b, hb, amount));
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
    if (darkened[i]) continue;          /* 已被投影压暗，不再叠 AO */
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

/* ---- 轮廓线：沿参数化闭合曲线画一圈深色 ----
 * ★ 为什么不用球体的 rim 描边：
 *   球在屏幕上是圆，圆周像素本身不连续 → rim 环带碎成虚线。
 *   参考图（3× 放大）的树冠轮廓是**连续的云朵线**。
 *   → 直接按参数方程算轮廓点，逐点连线，天然连续。
 *
 * ★ 深度怎么处理（关键）：
 *   轮廓必须盖住**自己**的主体（否则下半截被自己的冠球挡住），
 *   但又必须被**别的树**盖住（否则整片树海变成网格花纹）。
 *   → 强制写像素，但把深度记成**冠心深度**（不是轮廓点自己的深度）。
 *   冠心深度 = 整棵树的深度 → 同层树互不遮挡，后面的树能盖住前面的轮廓。
 *
 * pts:    [[x,y,z], ...] 轮廓点的世界坐标（闭合，不重复首点）
 * depth:  该树的深度基准（一般是冠心深度）
 */
function strokePath(pts, color, depth, close = true) {
  const n = pts.length;
  const last = close ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const dist = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const steps = Math.max(1, Math.ceil(dist / .12));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const wx = lerp(a[0], b[0], t), wy = lerp(a[1], b[1], t), wz = lerp(a[2], b[2], t);
      const p = project(wx, wy, wz);
      const ix = p.sx | 0, iy = p.sy | 0;
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
      const idx = iy * W + ix;
      /* 深度用冠心深度：同层不互相遮挡，后面的树能盖住前面的轮廓 */
      const d = depth == null ? p.d : depth;
      if (d <= zb[idx]) continue;         // 被更近的东西挡住 → 不画
      zb[idx] = d;
      pix[idx] = color;
    }
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
  /* 全屏模式：画布缓冲已经是窗口尺寸（1 画布像素 = 1 CSS 像素），1:1 显示 */
  if (window.PP_FULLSCREEN) {
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    return;
  }
  const fitScale = Math.min(window.innerWidth / W, window.innerHeight / H);
  const scale = fitScale >= 1 ? Math.min(3, Math.floor(fitScale)) : fitScale;
  canvas.style.width = Math.round(W * scale) + 'px';
  canvas.style.height = Math.round(H * scale) + 'px';
}
