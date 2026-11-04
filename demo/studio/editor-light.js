'use strict';
/* ------------------------------------------------------------------
 * 编辑器 · 光照面板（editor-light.js）
 *
 * 从 editor.js 拆出（500 行约束）：
 *   ED_initLightingUI  光照/色调/暗角/光源方向 UI 绑定 + 色调预设
 *   ED_collectLights   收集场景点光源（亮着的路灯类构件）
 * ------------------------------------------------------------------ */

/* ---------------- 光照面板 ---------------- */

function ED_initLightingUI() {
  const amb = document.getElementById('lt-ambient');
  const vg = document.getElementById('lt-vignette');
  const lz = document.getElementById('lt-z');
  const lr = document.getElementById('lt-rot');
  const pts = document.getElementById('lt-points');
  if (!amb) return;

  const syncDir = () => {
    /* 方位角（水平面内的光来向）+ 高度角 → 光照向量。
       0° = 光从屏幕左上（经典等距默认），顺时针旋转 */
    const a = Number(lr.value) * Math.PI / 180;
    const hz = Number(lz.value);
    const horiz = Math.sqrt(Math.max(0, 1 - hz * hz));
    LIGHT.dir.x = -Math.cos(a) * horiz;
    LIGHT.dir.y = -Math.sin(a) * horiz;
    LIGHT.dir.z = hz;
    /* 阴影方向与光照水平分量一致（影子投向背光侧） */
    LIGHT.shadow.x = 1.3 * Math.cos(a) - 0.12 * Math.sin(a);
    LIGHT.shadow.y = -1.3 * Math.sin(a) - 0.12 * Math.cos(a);
    document.getElementById('v-lightz').textContent = hz.toFixed(2);
    document.getElementById('v-lightrot').textContent = lr.value + '°';
    ED.dirty = true;
  };

  amb.addEventListener('input', () => {
    LIGHT.ambient = Number(amb.value);
    document.getElementById('v-ambient').textContent = Number(amb.value).toFixed(2);
    ED.dirty = true;
  });
  vg.addEventListener('input', () => {
    LIGHT.vignette = Number(vg.value);
    document.getElementById('v-vignette').textContent = Number(vg.value).toFixed(2);
    ED.dirty = true;
  });
  lz.addEventListener('input', syncDir);
  lr.addEventListener('input', syncDir);
  if (pts) pts.addEventListener('change', () => {
    /* 关掉点光源 = 清空收集（渲染时跳过） */
    ED.pointsEnabled = pts.checked;
    ED_collectLights();
    ED.dirty = true;
  });

  /* 色调预设 */
  const TINTS = {
    default: [1, 1, 1],
    warm: [1.08, 1.0, 0.86],
    dusk: [1.0, 0.82, 0.66],
    night: [0.58, 0.64, 0.92],
  };
  for (const b of document.querySelectorAll('[data-tint]')) {
    b.addEventListener('click', () => {
      for (const x of b.parentElement.children) x.classList.remove('on');
      b.classList.add('on');
      LIGHT.tint = TINTS[b.dataset.tint] || TINTS.default;
      /* 夜幕自动压环境 + 开灯更明显 */
      LIGHT.ambient = b.dataset.tint === 'night' ? 0.72 : 1;
      if (amb) { amb.value = String(LIGHT.ambient); document.getElementById('v-ambient').textContent = LIGHT.ambient.toFixed(2); }
      ED.dirty = true;
      studioStatus('色调已切换：' + b.textContent, 'ok');
    });
  }
}


/* ---------------- 场景点光源收集 ---------------- */

/* 哪些构件算光源：id 含 lamp/lantern 且参数里 lit>0.5（亮着） */
function ED_collectLights() {
  LIGHT.points.length = 0;
  if (ED.pointsEnabled === false) return;
  for (const o of ED.objects) {
    if (!/lamp|lantern|light/i.test(o.kind)) continue;
    const lit = o.params && o.params.lit != null ? o.params.lit : 1;
    if (lit < 0.5) continue;
    /* 光源位置：构件顶部附近；半径/强度按构件语义给默认 */
    const h = (o.collision && (o.collision.height || o.collision.h)) || 3;
    const sc = o.scale || 1;
    LIGHT.points.push({
      x: o.x, y: o.y, z: (o.z || 0) + h * sc * 0.92,
      r: 5.5 * sc,
      color: [255, 214, 130],
      power: 0.55,
    });
  }
}

