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
  spin: false, showBox: true, rot: 0.4, rotX: 0, rotY: 0, lastStep: -1,
  scale: 1,
  drawFn: null, error: null,
  groundR: 3.2,          // 地面圆盘半径（按构件大小自适应）
  /* 预览环境：背景色调 / 光源开关 / 光源色系 */
  bgTone: 'dark',        // dark | paper
  lightOn: true,
  lightTone: 'warm',     // warm | cool | neutral
  /* 方向光：方位角（屏幕方向）+ 高度角（0~1），由预览区的太阳控件驱动 */
  sunAz: Math.atan2(0.5, 0.22),
  sunEl: 0.84,
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


function PV_makeCtx(p) {
  /* 行为动画：KIT_BEHAVIOR.tick 写进 PV.inst.anim，这里叠加到所有原语 */
  const anim = (PV.inst && PV.inst.anim) || null;
  const aX = anim ? (anim.dx || 0) : 0;
  const aY = anim ? (anim.dy || 0) : 0;
  const aZ = anim ? (anim.z || 0) : 0;
  const aScale = anim && Number.isFinite(anim.scale) && anim.scale > 0 ? anim.scale : 1;

  /* 三轴旋转：rotZ = 绕竖轴（yaw），rotX/rotY = 俯仰/翻滚（Blender 视角） */
  const rotZ = (PV.rot || 0) + (anim ? (anim.rot || 0) : 0);
  const rotX = (PV.rotX || 0) + (anim ? (anim.rotX || 0) : 0);
  const rotY = (PV.rotY || 0) + (anim ? (anim.rotY || 0) : 0);
  const sc = ((PV.scale == null || !Number.isFinite(PV.scale) || PV.scale <= 0) ? 1 : PV.scale) * aScale;
  /* 旋转轴心：默认物体中部（像 Blender 绕物体中心转），由量测估算 */
  const pivotZ = PV.pivotZ || 0;
  const has3D = rotX !== 0 || rotY !== 0;
  const spinnable = !!rotZ || has3D;

  const cX = Math.cos(rotX), sX = Math.sin(rotX);
  const cY = Math.cos(rotY), sY = Math.sin(rotY);
  const cZ = Math.cos(rotZ), sZ = Math.sin(rotZ);

  /* 局部 → 世界：缩放绕原点；三轴旋转绕原点（预览实例就在原点） */
  const T = (x, y, z) => {
    const dx = x * sc, dy = y * sc, dz = (z - pivotZ) * sc;
    const y1 = dy * cX - dz * sX;          // Rx
    const z1 = dy * sX + dz * cX;
    const x2 = dx * cY + z1 * sY;          // Ry
    const z2 = -dx * sY + z1 * cY;
    const x3 = x2 * cZ - y1 * sZ;          // Rz（yaw，标准右手）
    const y3 = x2 * sZ + y1 * cZ;
    return [x3 + aX, y3 + aY, pivotZ + z2 + aZ];
  };
  const flat = (x, y, z) => [x * sc + aX, y * sc + aY, z * sc + aZ];
  const P = spinnable ? T : flat;
  const col0 = [cZ * cY, sZ * cY, -sY];
  const col1 = [cZ * sY * sX - sZ * cX, sZ * sY * sX + cZ * cX, cY * sX];
  const col2 = [cZ * sY * cX + sZ * sX, sZ * sY * cX - cZ * sX, cY * cX];
  const wrapPScaled = p2 => P(p2[0], p2[1], p2[2]);

  return {
    x: 0, y: 0, z: 0, params: p, seed: 7, rot: rotZ, rotX, rotY, scale: sc, anim: anim || null,
    /* ★ 只保留带缩放的版本：重复定义会被后者覆盖，
       导致 PV.scale（预览缩放）完全失效 —— 曾经的 bug */
    sphere: (x, y, z, r, c, mode) => { const q = P(x, y, z); sphere(q[0], q[1], q[2], r * sc, c, mode); },
    capsule: (a, b, r0, r1, f, mode) => capsule(wrapPScaled(a), wrapPScaled(b), r0 * sc, r1 * sc, f, mode),
    plot: (x, y, z, c) => { const q = P(x, y, z); plot(q[0], q[1], q[2], c); },
    /* 局部坐标 → 屏幕像素（含三轴旋转/缩放）。逐像素绘制（树冠叶簇）用它定位包围盒，
       否则包围盒按未旋转位置取、像素却画在旋转后位置，叶簇会被裁成碎片。 */
    screen: (x, y, z) => { const q = P(x, y, z); return project(q[0], q[1], q[2]); },
    /* 屏幕像素 → 局部坐标（screen 的逆）。三轴旋转下求射线与局部 z 平面的交点。 */
    unproject: (ix, iy, z) => {
      if (!has3D) {
        const P0 = unprojectAt(ix + .5 - aX, iy + .5 - aY, z * sc + aZ);
        return [(P0[0] * cZ - P0[1] * sZ) / sc, (P0[0] * sZ + P0[1] * cZ) / sc];
      }
      const P0 = unprojectAt(ix + .5 - aX, iy + .5 - aY, pivotZ + aZ);
      const kd = R2 / 2 * COS / SIN;
      const A = col2[0] * P0[0] + col2[1] * P0[1];
      const B = col2[0] * kd + col2[1] * kd + col2[2];
      const t = Math.abs(B) < 1e-6 ? 0 : (z * sc - A) / B;
      const wx = P0[0] + t * kd, wy = P0[1] + t * kd, wz = t;
      return [(col0[0] * wx + col0[1] * wy + col0[2] * wz) / sc,
              (col1[0] * wx + col1[1] * wy + col1[2] * wz) / sc];
    },
    box: (x0, y0, z0, x1, y1, z1, c, sd = 0) => {
      /* ★ 缩放必须作用到 box：否则 sphere/plot 放大了、墙体还是原尺寸，
         建筑看起来"镂空/半透明"（组件参数 scale 只是预览缩放） */
      if (!spinnable) {
        box(x0 * sc + aX, y0 * sc + aY, z0 * sc + aZ,
            x1 * sc + aX, y1 * sc + aY, z1 * sc + aZ, c, sd);
        return;
      }
      const ramp = rampOf(c);
      const paint = (lx, ly, lz, base, grain) => {
        const q = P(lx, ly, lz);
        const pr = project(q[0], q[1], q[2]), ix = pr.sx | 0, iy = pr.sy | 0;
        if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
        const i = iy * W + ix;
        if (pr.d <= zb[i]) return;
        zb[i] = pr.d;
        pix[i] = ramp[clamp(Math.floor(base + (grain - .5) * 1.3 + (bayerAt(ix, iy) - .5) * .5), 0, 4)];
      };
      const step = .045, longX = x1 - x0 >= y1 - y0;
      for (let a = x0; a <= x1; a += step) for (let b = y0; b <= y1; b += step)
        paint(a, b, z1, litLevel(0, 0, 1), longX ? noise(a * .8 + sd, b * 9) : noise(a * 9, b * .8 + sd));
      for (let a = x0; a <= x1; a += step) for (let b = z0; b <= z1; b += step) {
        const g = noise(a * .8 + sd, b * 9);
        paint(a, y1, b, litLevel(0, 1, 0), g); paint(a, y0, b, litLevel(0, -1, 0), g);
      }
      for (let a = y0; a <= y1; a += step) for (let b = z0; b <= z1; b += step) {
        const g = noise(a * .8 + sd, b * 9);
        paint(x1, a, b, litLevel(1, 0, 0), g); paint(x0, a, b, litLevel(-1, 0, 0), g);
      }
    },
    lit: (nx, ny, nz) => litLevel(nx, ny, nz),
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
      if (PV.inst) { PV.inst.kind = PV.id; PV.inst.params = p; }
      const inst = PV.inst || { id: 'pv', kind: PV.id, x: 0, y: 0, z: 0, rot: 0, params: p, seed: 7 };
      const cx = PV_makeCtx(p);
      /* hidden：行为要求整件不画；__stump__：外形被行为接管（砍倒后只画树桩） */
      const takenOver = inst.anim && inst.anim.kind === '__stump__';
      if (!inst.anim || (!inst.anim.hidden && !takenOver)) PV.drawFn(cx, inst);
      if (typeof KIT_BEHAVIOR !== 'undefined') KIT_BEHAVIOR.draw(cx, inst, KIT_BH_WORLD);
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
  const el = PV.sunEl;
  const horiz = Math.sqrt(Math.max(0, 1 - el * el));
  const dir = PV.lightOn
    ? { x: -Math.cos(PV.sunAz) * horiz, y: -Math.sin(PV.sunAz) * horiz, z: el }
    : { x: 0, y: 0, z: 1 };
  if (typeof LIGHT !== 'undefined' && LIGHT.dir) {
    LIGHT.dir.x = dir.x; LIGHT.dir.y = dir.y; LIGHT.dir.z = dir.z;
    /* 阴影投向背光侧：与方向光的水平投影一致 */
    LIGHT.shadow.x = 1.5 * dir.x / Math.max(.2, dir.z);
    LIGHT.shadow.y = 1.5 * dir.y / Math.max(.2, dir.z);
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
    /* 新实例：行为状态全部重置（切构件不该带着上一棵树的砍伐进度） */
    PV.inst = {
      id: 'pv', kind: PV.id, x: 0, y: 0, z: 0, rot: 0,
      params: {}, seed: 7,
      behaviorSpec: Array.isArray(msg.behaviors) ? msg.behaviors : undefined,
    };
    if (typeof KIT_BEHAVIOR !== 'undefined') {
      KIT_BEHAVIOR.attach(PV.inst);
      parent.postMessage({
        type: 'behavior-info',
        behaviors: (PV.inst.behaviors || []).map(b => ({ id: b.id, params: b.params })),
        allowed: KIT_BEHAVIOR.allowed(c).map(d => ({
          id: d.id, label: d.label, category: d.category, desc: d.desc, params: d.params,
        })),
      }, '*');
    }

    try {
      PV.lastStep = -1;
      const p = KIT.resolve(PV.id, PV.params);
      PV_drawGround();
      PV.inst.params = p;
      PV.drawFn(PV_makeCtx(p), PV.inst);
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
  if (msg.type === 'sun') {
    const az = Number(msg.az), el = Number(msg.el);
    if (Number.isFinite(az)) PV.sunAz = az;
    if (Number.isFinite(el)) PV.sunEl = Math.max(.12, Math.min(1, el));
    PV_render();
    return;
  }
  if (msg.type === 'rot3') {
    /* 三轴旋转：x = 俯仰（绕 X 轴）、y = 翻滚（绕 Y 轴） */
    const x = Number(msg.x), y = Number(msg.y);
    if (Number.isFinite(x)) PV.rotX = x;
    if (Number.isFinite(y)) PV.rotY = y;
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
  if (msg.type === 'click') {
    if (PV.inst && typeof KIT_BEHAVIOR !== 'undefined') {
      /* 点击点反解到实例局部坐标，flee/wander 用它决定方向 */
      const g = unprojectAt(msg.sx == null ? W / 2 : msg.sx,
                            msg.sy == null ? H / 2 : msg.sy, 1);
      KIT_BEHAVIOR.event(PV.inst, { type: 'click', x: g[0], y: g[1] }, KIT_BH_WORLD);
      PV_render();
    }
    return;
  }
  if (msg.type === 'behaviors') {
    if (PV.inst) {
      PV.inst.behaviorSpec = Array.isArray(msg.list) ? msg.list : [];
      PV.inst.behaviors = null;
      PV.inst.state = {};
      if (typeof KIT_BEHAVIOR !== 'undefined') KIT_BEHAVIOR.attach(PV.inst);
      PV_render();
    }
    return;
  }
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
    /* 旋转轴心抬到物体中部：三轴旋转时看起来像在转物体，而不是推倒它 */
    PV.pivotZ = Math.max(.2, ((maxY - minY + 1) / (S * 1.15)) * .5);
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
    const dt = PV.lastStep < 0 ? 1 / 12 : Math.min(.25, (step - PV.lastStep) / 12);
    PV.lastStep = step;
    /* 自动旋转：累计到 720°（4π）再回绕。角度本身没有上限，
       回绕只是为了让"转两圈"这件事在界面上可预期。 */
    if (PV.spin) {
      PV.rot += .06;
      if (PV.rot >= Math.PI * 4) PV.rot -= Math.PI * 4;
      /* 每半秒回报一次角度，父页面的旋转条跟着走 */
      if (step % 6 === 0) parent.postMessage({ type: 'rot-info', deg: PV.rot * 180 / Math.PI }, '*');
    }
    /* 行为：全局风势 + 实例状态机 */
    if (PV.inst && typeof KIT_BEHAVIOR !== 'undefined') {
      KIT_BH_WORLD.t += dt;
      KIT_BH_WORLD.dt = dt;
      const t = KIT_BH_WORLD.t;
      KIT_BH_WORLD.wind.strength =
        .35 + .25 * Math.sin(t * .62 + .4) + .15 * Math.sin(t * 1.55);
      KIT_BH_WORLD.wind.gust = Math.sin(t * .62 + .4) * .55 + Math.sin(t * 1.55) * .3;
      KIT_BEHAVIOR.tick(PV.inst, dt, KIT_BH_WORLD);
    }
    PV_render();
  }
  requestAnimationFrame(PV_frame);
}
requestAnimationFrame(PV_frame);
