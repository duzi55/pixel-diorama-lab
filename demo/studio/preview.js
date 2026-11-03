'use strict';
/* ------------------------------------------------------------------
 * 构件预览沙箱
 *
 * 由生成页 postMessage 驱动：
 *   { type: 'code', code, id, params, collision }
 *   { type: 'spin', on }   { type: 'box', on }
 *
 * 渲染：构件放在中心，脚下有圆盘地台，影子可见。
 * 碰撞体线框叠画（青色）。
 *
 * 构件代码用真正的 <script> 标签注入 —— eval 会让顶层 const 落在
 * eval 的作用域里，KIT.register 反而找不到。
 * ------------------------------------------------------------------ */

const PV = {
  code: '', id: null, params: {}, collision: null,
  spin: true, showBox: true, rot: 0, lastStep: -1,
  drawFn: null, error: null,
};

const PV_GROUND_TONES = [[44, 46, 54], [50, 52, 60], [56, 58, 66], [62, 64, 72]];

function PV_init() {
  const canvas = document.getElementById('c');
  const ctx2d = canvas.getContext('2d');
  const image = ctx2d.createImageData(W, H);
  const pix = new Uint32Array(image.data.buffer);

  /* 引擎的全局缓冲在引擎里已经建好；这里只借用它的画布与状态 */
  PV.canvas = canvas; PV.ctx2d = ctx2d; PV.image = image;

  /* 画一块圆盘地台当影子落点 */
  function drawGround() {
    zb.fill(-1e9);
    pix.fill(rgb(22, 22, 27));
    ground.fill(0);
    kinds.fill(KIND_NONE);
    shadowMask.fill(0);

    for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
      const g = unproject(ix + .5, iy + .5);
      const d = Math.hypot(g.x, g.y);
      const edge = 1 + (noise(g.x * 1.3, g.y * 1.3) - .5) * .12;
      if (d / 5.4 > edge) continue;
      const i = iy * W + ix;
      const v = .5 + noise(g.x * .9, g.y * .9) * .3 + (hash(ix, iy) - .5) * .2;
      const idx = clamp(Math.floor(v * 3.999 + (bayerAt(ix, iy) - .5) * .6), 0, 3);
      pix[i] = rgb(...PV_GROUND_TONES[idx]);
      ground[i] = 1;
      zb[i] = (g.x + g.y) / Math.SQRT2 * (Math.sqrt(3) / 2);
    }
    groundZ.set(zb);
  }

  /* 像素级直线：画在最上层，不参与深度测试 */
  function line(x0, y0, x1, y1, color) {
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + (x1 - x0) * i / n);
      const y = Math.round(y0 + (y1 - y0) * i / n);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      pix[y * W + x] = color;
    }
  }

  function drawCollision() {
    const c = PV.collision;
    if (!c) return;
    const cy = rgb(120, 210, 255);
    if (c.type === 'cylinder') {
      const r = c.radius || .3, h = c.height || 1, seg = 24;
      for (let i = 0; i < seg; i++) {
        const a0 = i / seg * 6.283, a1 = (i + 1) / seg * 6.283;
        const p0 = project(Math.cos(a0) * r, Math.sin(a0) * r, 0);
        const p1 = project(Math.cos(a1) * r, Math.sin(a1) * r, 0);
        line(p0.sx, p0.sy, p1.sx, p1.sy, cy);
        const q0 = project(Math.cos(a0) * r, Math.sin(a0) * r, h);
        const q1 = project(Math.cos(a1) * r, Math.sin(a1) * r, h);
        line(q0.sx, q0.sy, q1.sx, q1.sy, cy);
        line(p0.sx, p0.sy, q0.sx, q0.sy, cy);
      }
    } else {
      const w = (c.w || 1) / 2, d = (c.d || 1) / 2, h = c.h || 1;
      const corners = [[-w, -d], [w, -d], [w, d], [-w, d]];
      for (let i = 0; i < 4; i++) {
        const a = corners[i], b = corners[(i + 1) % 4];
        const p0 = project(a[0], a[1], 0), p1 = project(b[0], b[1], 0);
        line(p0.sx, p0.sy, p1.sx, p1.sy, cy);
        const q0 = project(a[0], a[1], h), q1 = project(b[0], b[1], h);
        line(q0.sx, q0.sy, q1.sx, q1.sy, cy);
        line(p0.sx, p0.sy, q0.sx, q0.sy, cy);
      }
    }
  }

  function render() {
    drawGround();
    if (PV.drawFn) {
      try {
        const p = KIT.resolve(PV.id, PV.params);
        const ctx = {
          x: 0, y: 0, z: 0, params: p, seed: 7, rot: PV.rot,
          sphere, capsule, box, plot,
          rampOf, rgb, hash, noise, lerp, clamp,
          shadow: (r, s, d) => castShadow(0, 0, .01, r, s == null ? 1 : s, d),
          shadowAt: (x, y, z, r, s, d) => castShadow(x, y, z, r, s, d),
        };
        /* 旋转：把上下文坐标绕原点转，构件代码本身不用管朝向 */
        const cs = Math.cos(PV.rot), sn = Math.sin(PV.rot);
        const un = (x, y) => [x * cs + y * sn, -x * sn + y * cs];
        const wrapP = p2 => { const q = un(p2[0], p2[1]); return [q[0], q[1], p2[2]]; };
        const wrapped = {
          ...ctx,
          sphere: (x, y, z, r, c, mode) => { const q = un(x, y); sphere(q[0], q[1], z, r, c, mode); },
          capsule: (a, b, r0, r1, f, mode) => capsule(wrapP(a), wrapP(b), r0, r1, f, mode),
          plot: (x, y, z, c) => { const q = un(x, y); plot(q[0], q[1], z, c); },
          box: (x0, y0, z0, x1, y1, z1, c, sd) => {
            const a = un(x0, y0), b = un(x1, y1);
            box(Math.min(a[0], b[0]), Math.min(a[1], b[1]), z0,
                Math.max(a[0], b[0]), Math.max(a[1], b[1]), z1, c, sd);
          },
        };
        PV.drawFn(wrapped, {});
      } catch (e) {
        console.error('[preview]', e);
        PV.error = String(e && e.message || e);
      }
    }
    applyShadows(groundZ);
    shadeEdges();
    if (PV.showBox && PV.collision) drawCollision();
    ctx2d.putImageData(image, 0, 0);
  }

  function frame(now) {
    const step = Math.floor(now / 1000 * 12);
    if (step !== PV.lastStep) {
      PV.lastStep = step;
      if (PV.spin) PV.rot = (PV.rot + .07) % (Math.PI * 2);
      render();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* ---------------- 注入构件代码 ---------------- */

/* 用真正的 script 标签注入：eval 里顶层 const 不可见，KIT.register 会失败 */
let PV_scriptTag = null;
function PV_inject(code) {
  if (PV_scriptTag) PV_scriptTag.remove();
  KIT.components = Object.create(null);
  KIT.order = [];
  PV_scriptTag = document.createElement('script');
  PV_scriptTag.textContent = code;
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
    const c = KIT.get(PV.id);
    if (!c) {
      parent.postMessage({
        type: 'preview-error',
        error: `代码执行了，但没注册出 id "${PV.id}"。请检查 KIT.register 的 id 与返回值一致。`,
      }, '*');
      return;
    }
    PV.drawFn = c.draw;
    PV.collision = c.collision || PV.collision;
    parent.postMessage({ type: 'preview-ok', id: PV.id, name: c.name }, '*');
    return;
  }

  if (msg.type === 'spin') { PV.spin = !!msg.on; return; }
  if (msg.type === 'box') { PV.showBox = !!msg.on; return; }
});

PV_init();
