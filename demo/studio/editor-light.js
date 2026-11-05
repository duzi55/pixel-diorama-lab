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
  const pts = document.getElementById('lt-points');
  if (!amb) return;

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

  /* 用户摆放的光源 */
  for (const L of (ED.lights || [])) {
    LIGHT.points.push({
      x: L.x, y: L.y, z: L.z,
      r: L.r || 6,
      power: L.power == null ? 0.6 : L.power,
      color: L.color || [255, 214, 130],
    });
  }

  /* 构件自带的光源（路灯/灯笼） */
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



/* ---------------- 可摆放光源 ---------------- */

function ED_placeLight(x, y) {
  const L = {
    id: 'L' + (ED.nextLightId++),
    x: Math.round(x * 4) / 4,
    y: Math.round(y * 4) / 4,
    z: (ED.baseMap ? 0 : TERRAIN.heightAt(x, y)) + 4,
    r: 7,
    power: 0.85,
    color: [255, 214, 130],
  };
  if (!ED.lights) ED.lights = [];
  ED.lights.push(L);
  ED.selectedLight = L;
  ED.selected = null;
  ED.selection = new Set();
  ED_collectLights();
  ED_refreshSel();
  ED_refreshObjects();
  ED.dirty = true;
  studioStatus('已放置光源 —— 拖动移动，右侧调高度/半径/强度');
  return L;
}

function ED_pickLight(x, y) {
  let best = null, bestD = 2.5;
  for (const L of (ED.lights || [])) {
    const d = Math.hypot(L.x - x, L.y - y);
    if (d < bestD) { bestD = d; best = L; }
  }
  return best;
}

function ED_deleteLight() {
  if (!ED.selectedLight) return;
  ED_snapshot('删除光源');
  ED.lights = (ED.lights || []).filter(L => L !== ED.selectedLight);
  ED.selectedLight = null;
  ED_collectLights();
  ED_refreshSel();
  ED.dirty = true;
  studioStatus('已删除光源');
}

/** 在光源位置画十字标记（选中时加圆环） */
function ED_drawLightIcons() {
  for (const L of (ED.lights || [])) {
    const p = project(L.x, L.y, L.z);
    const on = L === ED.selectedLight;
    const col = on ? rgb(255, 224, 140) : rgb(255, 196, 96);
    const cx = Math.round(p.sx), cy = Math.round(p.sy);
    for (let d = -3; d <= 3; d++) {
      ED_plotScreen(cx + d, cy, col);
      ED_plotScreen(cx, cy + d, col);
    }
    if (on) {
      for (let a = 0; a < 20; a++) {
        const ang = a / 20 * Math.PI * 2;
        ED_plotScreen(Math.round(cx + Math.cos(ang) * 8), Math.round(cy + Math.sin(ang) * 8), col);
      }
    }
  }
}

/** 光源属性面板（editor-props 的 ED_refreshSel 调用） */
function ED_renderLightPanel(info) {
  const L = ED.selectedLight;
  info.innerHTML = '';
  info.appendChild(ED_kv('类型', '点光源'));
  info.appendChild(ED_kv('位置', `${L.x.toFixed(2)}, ${L.y.toFixed(2)}`));

  const mkSlider = (label, key, min, max, step, fmt) => {
    const w = document.createElement('div');
    w.className = 'slider';
    const show = () => (fmt ? fmt(L[key]) : String(L[key]));
    w.innerHTML = `<label>${label} <b>${show()}</b></label>`;
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.min = String(min); inp.max = String(max); inp.step = String(step);
    inp.value = String(L[key]);
    inp.addEventListener('input', e => {
      L[key] = Number(e.target.value);
      w.querySelector('b').textContent = show();
      ED_collectLights();
      ED.dirty = true;
    });
    w.appendChild(inp);
    info.appendChild(w);
  };

  mkSlider('高度 z', 'z', 0.5, 14, 0.25, v => v.toFixed(2));
  mkSlider('照明半径', 'r', 1, 20, 0.5, v => v.toFixed(1));
  mkSlider('强度', 'power', 0.05, 1.5, 0.05, v => v.toFixed(2));

  const tint = document.createElement('div');
  tint.className = 'prop-sub';
  tint.textContent = '色温';
  info.appendChild(tint);
  const row = document.createElement('div');
  row.className = 'pill-row';
  for (const [label, col] of [
    ['暖光', [255, 214, 130]],
    ['冷光', [150, 190, 255]],
    ['白光', [240, 238, 230]],
  ]) {
    const b = document.createElement('button');
    b.className = 'pill' + (L.color && L.color[0] === col[0] && L.color[2] === col[2] ? ' on' : '');
    b.textContent = label;
    b.addEventListener('click', () => {
      L.color = [...col];
      ED_collectLights();
      ED.dirty = true;
      ED_refreshSel();
    });
    row.appendChild(b);
  }
  info.appendChild(row);

  const del = document.createElement('button');
  del.className = 'ghost';
  del.style.marginTop = '8px';
  del.textContent = '删除光源';
  del.addEventListener('click', ED_deleteLight);
  info.appendChild(del);
}


