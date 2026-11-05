'use strict';
/* ------------------------------------------------------------------
 * 预览区的太阳控件（方向光）
 *
 * 按住 ☀ 拖动：指针相对预览中心的方向 = 方位角，离中心越近 = 高度角越高。
 * 通过 postMessage 交给沙箱（PV_applyLight 用它算 LIGHT.dir 与阴影）。
 * 与场景编辑器的太阳 gizmo 同一套语义，只是这里是 DOM 控件。
 * ------------------------------------------------------------------ */

(function () {
  const wrap = document.getElementById('pv-wrap');
  const sun = document.getElementById('pv-sun');
  const pv = document.getElementById('pv');
  if (!wrap || !sun || !pv) return;

  let dragging = false;
  let last = { az: Math.atan2(0.5, 0.22), el: 0.84 };

  function apply(e) {
    const r = wrap.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const az = Math.atan2(dy, dx);
    const dist = Math.hypot(dx, dy);
    const maxR = Math.min(r.width, r.height) * 0.55;
    const el = Math.max(0.12, Math.min(1, 1 - dist / maxR));
    last = { az, el };
    pv.contentWindow.postMessage({ type: 'sun', az, el }, '*');
    /* 控件本身转一下，指示当前方位 */
    sun.style.transform = `rotate(${az}rad)`;
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

  /* 切换构件后把当前光照补发一次（沙箱重载会丢） */
  pv.addEventListener('load', () => {
    pv.contentWindow.postMessage({ type: 'sun', az: last.az, el: last.el }, '*');
  });
})();
