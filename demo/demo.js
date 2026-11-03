'use strict';
/* ------------------------------------------------------------------
 * 最小场景：一块草地小岛 + 木屋 + 树 + 三个球
 * 蓝色球可拖动，黄色球自动绕圈，用来观察阴影和深度遮挡
 * ------------------------------------------------------------------ */

const RX = 12, RY = 10;
const GRASS = [[52, 88, 52], [72, 108, 54], [92, 128, 58], [116, 148, 66]];
const DIRT = [132, 100, 72];

const islandE = (x, y) => Math.pow(
  Math.pow(Math.abs(x) / RX, 4) + Math.pow(Math.abs(y) / RY, 4), .25
);

function groundColor(x, y, ix, iy) {
  const e = islandE(x, y);
  if (e > 1) return 0;
  const fine = hash(ix, iy);

  if (e > .95) {
    // 岛边缘的泥土带，再外面打碎成噪点，避免一刀切的轮廓
    if (e > .985 && fine < .5) return 0;
    const t = noise(x * 2.1, y * 2.1);
    const ramp = rampOf(DIRT);
    return ramp[clamp(Math.floor(1.8 + t * 2 + (bayerAt(ix, iy) - .5) * .6), 0, 4)];
  }

  const t = noise(x * 1.2, y * 1.2) * 1.0 + (fine - .5) * .55 - .05;
  return rgb(...GRASS[clamp(Math.floor(t * 3.6), 0, 3)]);
}

/* 在地面上撒一些 1~3px 的草叶，纯像素写法 */
function scatterGrass() {
  for (let n = 0; n < 1600; n++) {
    const x = (hash(n, 1) - .5) * 2 * RX;
    const y = (hash(n, 2) - .5) * 2 * RY;
    if (islandE(x, y) > .87) continue;
    const p = project(x, y, 0);
    const ix = p.sx | 0, iy = p.sy | 0;
    if (ix < 1 || iy < 4 || ix >= W - 1 || iy >= H - 1) continue;
    const i = iy * W + ix;
    if (!ground[i] || zb[i] !== groundZ[i]) continue;
    const h = 1 + (hash(n, 3) * 3 | 0);
    const c = hash(n, 4) > .82 ? GRASS[3] : hash(n, 4) > .4 ? GRASS[2] : GRASS[1];
    for (let k = 1; k <= h; k++) {
      const j = (iy - k) * W + ix;
      if (!ground[j] || zb[j] !== groundZ[j]) break;
      pix[j] = rgb(...c);
    }
  }
}

/* 土层侧面：把岛屿椭圆向下挤出 1.4 个单位。
   先画侧面，顶面随后会覆盖上半部分，只留下外圈侧壁。 */
const SOIL_H = 1.2;

function bakeSoil() {
  const drop = SOIL_H * COS * S;
  for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
    const g = unproject(ix + .5, iy + .5 + drop);
    const e = islandE(g.x, g.y);
    if (e > 1) continue;
    if (e > .97 && hash(ix, iy) < .35) continue; // 底部打碎，避免一条直线
    const t = noise(g.x * 3.2, iy * .18);
    const ramp = rampOf([112, 86, 62]);
    pix[iy * W + ix] = ramp[clamp(Math.floor(.8 + t * 1.8 + (bayerAt(ix, iy) - .5) * .5), 0, 4)];
  }
}

function tree(x, y) {
  const bark = () => [96, 74, 58];
  capsule([x, y, 0], [x + .15, y + .05, 2.35], .38, .24, bark, 'rough');
  for (let n = 0; n < 110; n++) {
    const a = hash(n, 7) * 6.283;
    const tilt = hash(n, 8) * 2 - 1;
    const d = Math.cbrt(hash(n, 9)) * 1.6;
    const flat = Math.sqrt(1 - tilt * tilt);
    const rx = x + Math.cos(a) * flat * d;
    const ry = y + Math.sin(a) * flat * d;
    const rz = 2.55 + tilt * d * .8;
    const tone = hash(n, 10) + (rz - 2.8) * .2;
    const c = tone > .68 ? [154, 178, 108] : tone > .3 ? [112, 150, 88] : [78, 120, 74];
    sphere(rx, ry, rz, .28 + hash(n, 11) * .22, c, 'rough');
  }
}

function bake() {
  zb.fill(-1e9);
  pix.fill(rgb(255, 255, 255));
  bakeSoil();

  // 1. 地面：逐像素反投影，用噪声决定草/泥土
  for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
    const g = unproject(ix + .5, iy + .5);
    const c = groundColor(g.x, g.y, ix, iy);
    if (!c) continue;
    const i = iy * W + ix;
    pix[i] = c;
    ground[i] = 1;
    zb[i] = (g.x + g.y) / R2 * COS;
  }
  groundZ.set(zb);
  scatterGrass();

  // 2. 木屋：墙 + 大一圈的屋顶 + 烟囱
  box(-6.6, -2.6, 0, -3.6, .4, 1.5, [168, 124, 82], 3);
  box(-6.95, -2.95, 1.5, -3.25, .75, 1.85, [96, 88, 92], 7);
  box(-6.4, -2.2, 1.85, -6.05, -1.85, 2.25, [112, 92, 84], 9);
  for (let z = 0; z < 1.05; z += .02)
    for (let x = -5.6; x < -4.8; x += .02) plot(x, .42, z, rgb(58, 42, 34));
  for (let z = .72; z < 1.22; z += .02)
    for (let x = -4.4; x < -3.88; x += .02) plot(x, .42, z, rgb(140, 170, 176));

  // 3. 树和石头
  tree(5, -3.8);
  sphere(-1.8, -5.2, .28, .55, [138, 136, 128], 'rough');
  sphere(-1.15, -5.55, .2, .3, [154, 152, 144], 'rough');

  // 4. 静态阴影（只染地面），然后整体存成底图
  castShadow(-5.1, -1.1, 1.2, 1.5, 1, .5);
  castShadow(5, -3.8, 1.8, 1.2, 1, .5);
  applyShadows(groundZ);

  bakedPix.set(pix);
  bakedZ.set(zb);
}

/* ---------------- 动态物体 ---------------- */
const balls = [
  { x: 3.4, y: 2.4, z: .6, r: .6, color: [176, 58, 44], home: [3.4, 2.4] },
  { x: .6, y: 3.2, z: .6, r: .6, color: [42, 76, 112], home: [.6, 3.2] },
  { x: 4, y: -1.5, z: .42, r: .42, color: [232, 200, 62], home: [4, -1.5] },
];
const auto = balls[2];
let held = null;
let T = 0;

function update(dt) {
  T += dt;
  const ang = T * .7;
  auto.x = 4 + Math.cos(ang) * 2.2;
  auto.y = -1.5 + Math.sin(ang) * 1.6;
  auto.z = auto.r + .22 + Math.sin(T * 2.2) * .18;

  for (const b of balls) {
    if (b === auto) continue;
    b.z = lerp(b.z, b === held ? .95 : b.r, Math.min(1, dt * 10));
  }
}

function draw() {
  pix.set(bakedPix);
  zb.set(bakedZ);

  for (const b of balls) sphere(b.x, b.y, b.z, b.r, b.color, 'gloss');
  for (const b of balls) {
    castShadow(b.x, b.y, b.z - b.r, b.r * .96, 1, 0);
    if (b.z < b.r + .06) castShadow(b.x, b.y, 0, b.r * .72, 2, 0);
  }

  applyShadows(bakedZ);
  shadeEdges();
  ctx.putImageData(image, 0, 0);
}

/* ---------------- 交互 ---------------- */
function toCanvas(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * W / r.width,
    y: (e.clientY - r.top) * H / r.height,
  };
}

canvas.addEventListener('pointerdown', e => {
  const p = toCanvas(e);
  let best = null, bd = 16;
  for (const b of balls) {
    const s = project(b.x, b.y, b.z);
    const d = Math.hypot(s.sx - p.x, s.sy - p.y);
    if (d < bd) { bd = d; best = b; }
  }
  if (!best) return;
  held = best;
  canvas.setPointerCapture(e.pointerId);
  e.preventDefault();
});

canvas.addEventListener('pointermove', e => {
  if (!held) return;
  const p = toCanvas(e);
  const g = unproject(p.x, p.y);
  const e0 = islandE(g.x, g.y);
  if (e0 > .82) { g.x *= .82 / e0; g.y *= .82 / e0; }
  held.x = g.x;
  held.y = g.y;
});

const release = () => { held = null; };
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

document.getElementById('reset').addEventListener('click', () => {
  held = null;
  for (const b of balls) {
    b.x = b.home[0];
    b.y = b.home[1];
    b.z = b.r;
  }
});

/* ---------------- 启动 ---------------- */
addEventListener('resize', fit);
fit();
bake();

let last = performance.now();
function frame(now) {
  update(Math.min(.04, (now - last) / 1000));
  last = now;
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
