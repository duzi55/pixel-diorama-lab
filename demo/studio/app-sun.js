'use strict';
/* ------------------------------------------------------------------
 * 预览区的太阳控件（方向光）
 *
 * 按住 ☀ 拖动，太阳**跟着指针走**（直接反馈）：
 *   - 位置相对预览中心的方向 = 方位角
 *   - 离中心越近 = 光源越高（顶光）
 * 通过 postMessage 交给沙箱（PV_applyLight 算 LIGHT.dir 与阴影）。
 * ------------------------------------------------------------------ */

(function () {
  const wrap = document.getElementById('pv-wrap');
  const sun = document.getElementById('pv-sun');
  const pv = document.getElementById('pv');
  if (!wrap || !sun || !pv) return;

  let dragging = false;
  /* 当前光源方向（默认与引擎一致：光从左上前方来） */
  const state = { az: Math.atan2(0.5, 0.22), el: 0.84 };

  /** 把 state → 太阳在预览里的像素位置（离中心越远 = 光越低） */
  function placeSun() {
    const r = wrap.getBoundingClientRect();
    const maxR = Math.min(r.width, r.height) * 0.42;
    const dist = (1 - state.el) * maxR;
    const x = r.width / 2 + Math.cos(state.az) * dist;
    const y = r.height / 2 + Math.sin(state.az) * dist;
    sun.style.left = Math.round(x - 17) + 'px';
    sun.style.top = Math.round(y - 17) + 'px';
  }

  function send() {
    pv.contentWindow.postMessage({ type: 'sun', az: state.az, el: state.el }, '*');
  }

  /** 指针位置 → 方位/高度（并立即把太阳挪过去） */
  function apply(e) {
    const r = wrap.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    state.az = Math.atan2(dy, dx);
    const maxR = Math.min(r.width, r.height) * 0.42;
    state.el = Math.max(0.12, Math.min(1, 1 - Math.hypot(dx, dy) / maxR));
    placeSun();
    send();
  }

  sun.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    sun.classList.add('dragging');
    sun.setPointerCapture(e.pointerId);
    apply(e);
  });
  sun.addEventListener('pointermove', e => {
    if (!dragging) return;
    e.stopPropagation();
    apply(e);
  });
  const up = () => { dragging = false; sun.classList.remove('dragging'); };
  sun.addEventListener('pointerup', up);
  sun.addEventListener('pointercancel', up);

  /* 切换构件后补发当前光照（沙箱重载会丢），并重新摆好太阳 */
  pv.addEventListener('load', () => {
    placeSun();
    send();
  });
  addEventListener('resize', placeSun);
  placeSun();
})();
