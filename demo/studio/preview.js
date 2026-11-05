'use strict';
/* ------------------------------------------------------------------
 * 构件预览沙箱（preview.js）
 *
 * 由生成页 postMessage 驱动：
 *   { type: 'code', code, id, params, collision }
 *   { type: 'params', params }
 *   { type: 'collision', collision }
 *   { type: 'spin', on }
 *   { type: 'box', on }
 *
 * 关键纪律：
 *   1. 直接复用 engine.js 顶层创建的 ctx / image / pix / zb 等缓冲，
 *      严禁在局部重新声明 image 或 pix（否则会遮蔽引擎全局缓冲，导致构件画不出来）。
 *   2. 构件代码用真正的 <script> 标签注入，保证顶层 const 可见。
 * ------------------------------------------------------------------ */

const PV = {
  code: '', id: null, params: {}, collision: null,
  spin: true, showBox: true, rot: 0.4, lastStep: -1,
  scale: 1,
  drawFn: null, error: null,
  groundR: 3.2,          // 地面圆盘半径（按构件大小自适应）
  /* 预览环境：背景色调 / 光源开关 / 光源色系 */
  bgTone: 'dark',        // dark | paper
  lightOn: true,
  lightTone: 'warm',     // warm | cool | neutral
};

/* 背景两套（地面圆盘色阶跟着背景走） */
const PV_BG = {
  dark: { base: rgb(28, 28, 34), ground: [[44, 46, 54], [50, 52, 60], [56, 58, 66], [62, 64, 72]] },
  paper: { base: rgb(252, 245, 218), ground: [[212, 200, 180], [222, 212, 192], [232, 222, 202], [242, 232, 212]] },
};

/* 光源色系 → RGB 乘数 */
const PV_LIGHT_TONES = {
  warm: [1.06, 1.00, .90],
  cool: [0.92, 0.99, 1.10],
  neutral: [1, 1, 1],
};

const PV_GROUND_TONES = [[44, 46, 54], [50, 52, 60], [56, 58, 66], [62, 64, 72]];

/* 画布由 CSS 铺满 iframe（object-fit: contain 保持比例），
   这里只保留 hook 供 resize 时重绘 */
function PV_fit() { PV_render(); }

function PV_drawGround() {
  const BG = PV_BG[PV.bgTone] || PV_BG.dark;
  zb.fill(-1e9);
  pix.fill(BG.base);
  ground.fill(0);
  kinds.fill(KIND_NONE);
  shadowMask.fill(0);

  for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
    const g = unproject(ix + .5, iy + .5);
    const d = Math.hypot(g.x, g.y);
    const edge = 1 + (noise(g.x * 1.3, g.y * 1.3) - .5) * .12;
    if (d / (PV.groundR || 3.2) > edge) continue;   // 半径随构件大小自适应
    const i = iy * W + ix;
    const v = .5 + noise(g.x * .9, g.y * .9) * .3 + (hash(ix, iy) - .5) * .2;
    const idx = clamp(Math.floor(v * 3.999 + (bayerAt(ix, iy) - .5) * .6), 0, 3);
    pix[i] = rgb(...BG.ground[idx]);
    ground[i] = 1;
    zb[i] = (g.x + g.y) / Math.SQRT2 * (Math.sqrt(3) / 2);
  }
  groundZ.set(zb);
}

/* 像素级虚线/实线：画在最上层 */
function PV_line(x0, y0, x1, y1, color, dash) {
  const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= n; i++) {
    if (dash && (i & 1)) continue;
    const x = Math.round(x0 + (x1 - x0) * i / n);
    const y = Math.round(y0 + (y1 - y0) * i / n);
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    pix[y * W + x] = color;
  }
}

function PV_drawCollision() {
  const c = PV.collision;
  if (!c) return;
  const cy = rgb(120, 210, 255);
  const cs = Math.cos(PV.rot), sn = Math.sin(PV.rot);
  const un = (x, y) => [x * cs + y * sn, -x * sn + y * cs];
  const BACK = [[-1, 0], [0, -1]];

  if (c.type === 'cylinder') {
    const r = c.radius || .3, h = c.height || 1, seg = 24;
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * 6.283, a1 = (i + 1) / seg * 6.283;
      const u0 = un(Math.cos(a0) * r, Math.sin(a0) * r);
      const u1 = un(Math.cos(a1) * r, Math.sin(a1) * r);
      const p0 = project(u0[0], u0[1], 0), p1 = project(u1[0], u1[1], 0);
      PV_line(p0.sx, p0.sy, p1.sx, p1.sy, cy, true);
      const q0 = project(u0[0], u0[1], h), q1 = project(u1[0], u1[1], h);
      PV_line(q0.sx, q0.sy, q1.sx, q1.sy, cy, true);
    }
    for (const [dx, dy] of BACK) {
      const p0 = project(dx * r, dy * r, 0), q0 = project(dx * r, dy * r, h);
      PV_line(p0.sx, p0.sy, q0.sx, q0.sy, cy, true);
    }
  } else {
    const w = (c.w || c.width || 1) / 2, d = (c.d || c.depth || 1) / 2, h = c.h || c.height || 1;
    const corners = [[-w, -d], [w, -d], [w, d], [-w, d]];
    for (let i = 0; i < 4; i++) {
      const a = un(corners[i][0], corners[i][1]);
      const b = un(corners[(i + 1) % 4][0], corners[(i + 1) % 4][1]);
      const p0 = project(a[0], a[1], 0), p1 = project(b[0], b[1], 0);
      PV_line(p0.sx, p0.sy, p1.sx, p1.sy, cy, true);
      const q0 = project(a[0], a[1], h), q1 = project(b[0], b[1], h);
      PV_line(q0.sx, q0.sy, q1.sx, q1.sy, cy, true);
      PV_line(p0.sx, p0.sy, q0.sx, q0.sy, cy, true);
    }
  }
}

function PV_makeCtx(p) {
  const rot = PV.rot || 0;
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const un = (x, y) => [x * cs + y * sn, -x * sn + y * cs];
  const wrapP = p2 => { const q = un(p2[0], p2[1]); return [q[0], q[1], p2[2]]; };

  const sc = (PV.scale == null || !Number.isFinite(PV.scale) || PV.scale <= 0) ? 1 : PV.scale;
  const ox = 0, oy = 0;
  const unScaled = (x, y) => {
    const dx = x * sc, dy = y * sc;
    if (rot) {
      const rx = dx * cs + dy * sn, ry = -dx * sn + dy * cs;
      return [ox + rx, oy + ry];
    }
    return [ox + dx, oy + dy];
  };
  const wrapPScaled = p2 => { const q = unScaled(p2[0], p2[1]); return [q[0], q[1], p2[2] * sc]; };

  return {
    x: 0, y: 0, z: 0, params: p, seed: 7, rot, scale: sc,
    /* ★ 只保留带缩放的版本：重复定义会被后者覆盖，
       导致 PV.scale（预览缩放）完全失效 —— 曾经的 bug */
    sphere: (x, y, z, r, c, mode) => { const q = unScaled(x, y); sphere(q[0], q[1], z * sc, r * sc, c, mode); },
    capsule: (a, b, r0, r1, f, mode) => capsule(wrapPScaled(a), wrapPScaled(b), r0 * sc, r1 * sc, f, mode),
    plot: (x, y, z, c) => { const q = unScaled(x, y); plot(q[0], q[1], z * sc, c); },
    box: (x0, y0, z0, x1, y1, z1, c, sd = 0) => {
      /* ★ 缩放必须作用到 box：否则 sphere/plot 放大了、墙体还是原尺寸，
         建筑看起来"镂空/半透明"（组件参数 scale 只是预览缩放） */
      if (!rot) { box(x0 * sc, y0 * sc, z0 * sc, x1 * sc, y1 * sc, z1 * sc, c, sd); return; }
      const ramp = rampOf(c);
      const paint = (lx, ly, lz, base, grain) => {
        const q = unScaled(lx, ly);
        const pr = project(q[0], q[1], lz * sc), ix = pr.sx | 0, iy = pr.sy | 0;
        if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
        const i = iy * W + ix;
        if (pr.d <= zb[i]) return;
        zb[i] = pr.d;
        pix[i] = ramp[clamp(Math.floor(base + (grain - .5) * 1.3 + (bayerAt(ix, iy) - .5) * .5), 0, 4)];
      };
      const step = .045, longX = x1 - x0 >= y1 - y0;
      for (let a = x0; a <= x1; a += step) for (let b = y0; b <= y1; b += step)
        paint(a, b, z1, 3.4, longX ? noise(a * .8 + sd, b * 9) : noise(a * 9, b * .8 + sd));
      for (let a = x0; a <= x1; a += step) for (let b = z0; b <= z1; b += step) {
        const g = noise(a * .8 + sd, b * 9);
        paint(a, y1, b, 2.3, g); paint(a, y0, b, 1.5, g);
      }
      for (let a = y0; a <= y1; a += step) for (let b = z0; b <= z1; b += step) {
        const g = noise(a * .8 + sd, b * 9);
        paint(x1, a, b, 1.2, g); paint(x0, a, b, 2.0, g);
      }
    },
    rampOf, rgb, hash, noise, lerp, clamp,
    shadow: (r, s, d) => castShadow(0, 0, .01, r * sc, s == null ? 1 : s, d),
    shadowAt: (x, y, z, r, s, d) => { const q = unScaled(x, y); castShadow(q[0], q[1], z * sc, r * sc, s, d); },
  };
}

function PV_render() {
  PV_drawGround();
  if (PV.drawFn) {
    try {
      const p = KIT.resolve(PV.id, PV.params);
      PV.drawFn(PV_makeCtx(p), {});
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (PV.error !== msg) {
        PV.error = msg;
        parent.postMessage({
          type: 'preview-error',
          error: `构件绘制崩溃：${msg}`,
        }, '*');
      }
      console.error('[preview]', e);
    }
  }
  bakeOcclusion();
  staticShadow.set(shadowMask);
  applyShadows(groundZ);
  shadeEdges();
  if (PV.showBox && PV.collision) PV_drawCollision();
  PV_applyLight();
  ctx.putImageData(image, 0, 0);
}

/* 光源开关 + 色系：开关只改光的方向（关 → 顶光，明暗更平）；
   色系是整幅画面的 RGB 乘数（暖白/冷白/中性） */
function PV_applyLight() {
  const dir = PV.lightOn
    ? { x: -.55, y: -.6, z: .58 }
    : { x: 0, y: 0, z: 1 };
  if (typeof LIGHT !== 'undefined' && LIGHT.dir) {
    LIGHT.dir.x = dir.x; LIGHT.dir.y = dir.y; LIGHT.dir.z = dir.z;
  }
  const t = PV_LIGHT_TONES[PV.lightTone] || PV_LIGHT_TONES.neutral;
  const gain = PV.lightOn ? 1 : 1.08;              // 关灯时整体提亮一点，弥补失去的方向光
  if (t[0] === 1 && t[1] === 1 && t[2] === 1 && gain === 1) return;
  for (let i = 0; i < pix.length; i++) {
    const c = pix[i];
    const r = (c & 255) * t[0] * gain;
    const g = ((c >> 8) & 255) * t[1] * gain;
    const b = ((c >> 16) & 255) * t[2] * gain;
    pix[i] = rgb(r, g, b);
  }
}

/* ---------------- 注入构件代码 ---------------- */

let PV_scriptTag = null;
function PV_inject(code) {
  if (PV_scriptTag) PV_scriptTag.remove();
  KIT.components = Object.create(null);
  KIT.order = [];
  PV_scriptTag = document.createElement('script');
  /* 包在 IIFE 里注入：顶层 const 不污染全局，
     连续预览不同构件时不会 "Identifier already declared" */
  PV_scriptTag.textContent = '(function(){\n' + code + '\n})();';
  try {
    document.body.appendChild(PV_scriptTag);
    return null;
  } catch (e) {
    return String(e && e.message || e);
  }
}

window.addEventListener('message', e => {
  const msg = e.data;
  if (!msg) return;

  if (msg.type === 'code') {
    PV.code = msg.code || '';
    PV.id = msg.id;
    PV.params = msg.params || {};
    PV.collision = msg.collision || null;
    PV.error = null;

    const err = PV_inject(PV.code);
    if (err) {
      parent.postMessage({ type: 'preview-error', error: err }, '*');
      return;
    }
    const c = KIT.get(PV.id) || (KIT.order.length ? KIT.get(KIT.order[0]) : null);
    if (!c) {
      parent.postMessage({
        type: 'preview-error',
        error: `代码执行了，但没注册出构件 id "${PV.id}"。`,
      }, '*');
      return;
    }
    PV.id = c.id;
    PV.drawFn = c.draw;
    if (!PV.collision && c.collision) PV.collision = { ...c.collision };

    try {
      PV.lastStep = -1;
      const p = KIT.resolve(PV.id, PV.params);
      PV_drawGround();
      PV.drawFn(PV_makeCtx(p), {});
      bakeOcclusion();
      staticShadow.set(shadowMask);
      applyShadows(groundZ);
      shadeEdges();
      if (PV.showBox && PV.collision) PV_drawCollision();
      PV_applyLight();
      ctx.putImageData(image, 0, 0);
    } catch (err2) {
      PV.drawFn = null;
      parent.postMessage({
        type: 'preview-error',
        error: `构件绘制崩溃：${String((err2 && err2.message) || err2)}`,
      }, '*');
      return;
    }

    parent.postMessage({
      type: 'preview-ok',
      id: c.id,
      name: c.name,
      category: c.category,
      desc: c.desc,
      params: c.params,
      collision: PV.collision,
    }, '*');
    return;
  }

  if (msg.type === 'params') {
    PV.params = msg.params || {};
    PV_render();
    return;
  }
  if (msg.type === 'collision') {
    PV.collision = msg.collision || null;
    PV_render();
    return;
  }
  if (msg.type === 'scale') {
    const v = Number(msg.scale);
    PV.scale = Number.isFinite(v) && v > 0 ? v : 1;
    PV_render();
    return;
  }
  if (msg.type === 'spin') { PV.spin = !!msg.on; return; }
  if (msg.type === 'rot') {
    const v = Number(msg.rot);
    PV.rot = Number.isFinite(v) ? v : 0;
    PV_render();
    return;
  }
  if (msg.type === 'fit') { PV_measure(); return; }
  if (msg.type === 'view') { PV_applyView(msg); return; }
  if (msg.type === 'bg') {
    PV.bgTone = msg.tone === 'paper' ? 'paper' : 'dark';
    PV_render();
    return;
  }
  if (msg.type === 'light') {
    if (typeof msg.on === 'boolean') PV.lightOn = msg.on;
    if (msg.tone) PV.lightTone = msg.tone;
    PV_render();
    return;
  }
  if (msg.type === 'box') { PV.showBox = !!msg.on; PV_render(); return; }
});

/* 构件包围盒测量：先画地面取快照，再以原尺寸画构件做像素 diff，
   得到构件自身 bbox（地面圆盘不计入），上报给父页做自动取景。
   ★ 模型始终以 scale=1 绘制；缩放/平移由父页通过 view 消息控制画布 transform，
     这样逐像素绘制（plot）的构件不会被"拉开成筛网"。 */
function PV_measure() {
  if (!PV.drawFn) return;
  let p;
  try { p = KIT.resolve(PV.id, PV.params); } catch { return; }

  PV.scale = 1;
  PV_drawGround();
  const groundPix = pix.slice();
  try { PV.drawFn(PV_makeCtx(p), {}); } catch { return; }

  let minX = W, maxX = -1, minY = H, maxY = -1;
  for (let i = 0; i < pix.length; i++) {
    if (pix[i] === groundPix[i]) continue;
    const x = i % W, y = (i / W) | 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  /* 地面盘半径按构件 footprint 自适应：太大在放大预览时会抢画面，太小又没有落地感 */
  if (maxX >= 0) {
    const span = Math.max(maxX - minX + 1, maxY - minY + 1);
    PV.groundR = Math.max(1.2, Math.min(9, (span / S) * .50));
  }
  PV_render();

  parent.postMessage({
    type: 'bbox',
    bbox: maxX >= 0 ? { minX, maxX, minY, maxY } : null,
    W, H,
  }, '*');
}

/* 视图：画布 CSS 尺寸 = W×z / H×z，再 translate 平移（父页算好的值） */
function PV_applyView(v) {
  const z = Math.max(.2, Math.min(8, v.z || 1));
  canvas.style.width = Math.round(W * z) + 'px';
  canvas.style.height = Math.round(H * z) + 'px';
  canvas.style.transform =
    `translate(calc(-50% + ${Math.round(v.px || 0)}px), calc(-50% + ${Math.round(v.py || 0)}px))`;
}

addEventListener('resize', PV_fit);
PV_fit();

function PV_frame(now) {
  const step = Math.floor(now / 1000 * 12);
  if (step !== PV.lastStep) {
    PV.lastStep = step;
    if (PV.spin) PV.rot = (PV.rot + .06) % (Math.PI * 2);
    PV_render();
  }
  requestAnimationFrame(PV_frame);
}
requestAnimationFrame(PV_frame);
