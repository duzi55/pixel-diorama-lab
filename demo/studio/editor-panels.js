'use strict';
/* ------------------------------------------------------------------
 * 编辑器 · 右侧面板
 *
 * 三块：
 *   1. 选中对象的属性（位置、朝向、参数、碰撞体）
 *   2. 碰撞体积编辑：手动滑块 + AI 推断
 *   3. 场景存取：保存 / 载入 / 导出 JSON
 * ------------------------------------------------------------------ */

/* ---------------- 属性面板 ---------------- */

function ED_refreshSel() {
  const info = document.getElementById('sel-info');
  const colSec = document.getElementById('col-sec');
  const o = ED.selected;

  if (!o) {
    info.innerHTML = '<div class="empty-note">用「选择」工具点一个物体</div>';
    colSec.style.display = 'none';
    document.getElementById('sel').textContent = '未选中';
    return;
  }

  const comp = KIT.get(o.kind);
  document.getElementById('sel').textContent =
    `${comp ? comp.name : o.kind} @ (${o.x.toFixed(1)}, ${o.y.toFixed(1)})`;
  colSec.style.display = '';

  info.innerHTML = '';
  info.appendChild(ED_kv('ID', o.kind));
  info.appendChild(ED_kv('位置', `${o.x.toFixed(2)}, ${o.y.toFixed(2)}, ${o.z.toFixed(2)}`));
  info.appendChild(ED_kv('朝向', Math.round((o.rot || 0) * 180 / Math.PI) + '°'));

  /* 层级：0 = 自动（按 y 画家算法），±N = 强制提到某层 */
  const zWrap = document.createElement('div');
  zWrap.className = 'slider';
  zWrap.innerHTML = `<label>层级 <b>${o.zOrder || 0}（0 = 自动）</b></label>`;
  const zIn = document.createElement('input');
  zIn.type = 'range'; zIn.min = '-5'; zIn.max = '5'; zIn.step = '1';
  zIn.value = String(o.zOrder || 0);
  zIn.addEventListener('input', e => {
    o.zOrder = Number(e.target.value);
    zWrap.querySelector('b').textContent = `${o.zOrder}（${o.zOrder ? '强制' : '自动'}）`;
    ED.dirty = true;
  });
  zWrap.appendChild(zIn);
  info.appendChild(zWrap);

  const zBtns = document.createElement('div');
  zBtns.className = 'pill-row';
  zBtns.style.marginBottom = '10px';
  for (const [label, v] of [['⬆ 置顶', 5], ['⬇ 置底', -5]]) {
    const b = document.createElement('button');
    b.className = 'pill';
    b.textContent = label;
    b.addEventListener('click', () => {
      o.zOrder = v;
      zIn.value = String(v);
      zWrap.querySelector('b').textContent = `${v}（强制）`;
      ED.dirty = true;
    });
    zBtns.appendChild(b);
  }
  info.appendChild(zBtns);

  /* 缩放滑块（联动碰撞体，让体积跟着变大变小） */
  const sc0 = (o.scale == null || !Number.isFinite(o.scale) || o.scale <= 0) ? 1 : o.scale;
  /* 碰撞体以"构件默认值 × 当前缩放"计算，避免比例复利累积 */
  const compDef = KIT.get(o.kind);
  const defCol = compDef && compDef.collision ? compDef.collision : null;
  const scaleWrap = document.createElement('div');
  scaleWrap.className = 'slider';
  scaleWrap.innerHTML = `<label>缩放 <b>×${sc0.toFixed(2)}</b></label>`;
  const scIn = document.createElement('input');
  scIn.type = 'range'; scIn.min = '0.2'; scIn.max = '4'; scIn.step = '0.05';
  scIn.value = String(sc0);
  scIn.addEventListener('input', e => {
    const v = Number(e.target.value);
    o.scale = v;
    scaleWrap.querySelector('b').textContent = '×' + v.toFixed(2);
    /* 碰撞体 = 默认碰撞体 × 缩放（每次从默认值重算，不会越调越大） */
    if (o.collision && defCol) {
      const r = Math.round(v * 100) / 100;
      if (o.collision.type === 'cylinder') {
        o.collision.radius = Math.round(defCol.radius * r * 100) / 100;
        o.collision.height = Math.round(defCol.height * r * 100) / 100;
      } else {
        o.collision.w = Math.round((defCol.w || defCol.width || 1) * r * 100) / 100;
        o.collision.d = Math.round((defCol.d || defCol.depth || 1) * r * 100) / 100;
        o.collision.h = Math.round((defCol.h || defCol.height || 1) * r * 100) / 100;
      }
    }
    prevScale = v;
    ED.dirty = true;
    ED_refreshCollision();
  });
  scaleWrap.appendChild(scIn);
  info.appendChild(scaleWrap);

  /* 朝向滑块 */
  const rotWrap = document.createElement('div');
  rotWrap.className = 'slider';
  rotWrap.innerHTML = `<label>朝向 <b>${Math.round((o.rot || 0) * 180 / Math.PI)}°</b></label>`;
  const rotIn = document.createElement('input');
  rotIn.type = 'range'; rotIn.min = '0'; rotIn.max = '360'; rotIn.step = '5';
  rotIn.value = String(Math.round(((o.rot || 0) * 180 / Math.PI + 360) % 360));
  rotIn.addEventListener('input', e => {
    o.rot = Number(e.target.value) * Math.PI / 180;
    rotWrap.querySelector('b').textContent = e.target.value + '°';
    ED.dirty = true;
  });
  rotWrap.appendChild(rotIn);
  info.appendChild(rotWrap);

  /* 构件参数 */
  const params = KIT.resolve(o.kind, o.params);
  const keys = Object.keys(params);
  if (keys.length) {
    const h = document.createElement('div');
    h.className = 'sec';
    h.style.margin = '12px 0 8px';
    h.innerHTML = '<h3>参数</h3>';
    info.appendChild(h);
    for (const k of keys) {
      const p = comp.params[k];
      const wrap = document.createElement('div');
      wrap.className = 'slider';
      wrap.innerHTML = `<label>${ED_esc(p.desc || k)} <b>${params[k]}</b></label>`;
      const inp = document.createElement('input');
      inp.type = 'range';
      inp.min = String(p.min); inp.max = String(p.max); inp.step = String(p.step);
      inp.value = String(params[k]);
      inp.addEventListener('input', e => {
        o.params[k] = Number(e.target.value);
        wrap.querySelector('b').textContent = e.target.value;
        ED.dirty = true;
      });
      wrap.appendChild(inp);
      info.appendChild(wrap);
    }
  }

  ED_refreshCollision();
}

function ED_kv(k, v) {
  const d = document.createElement('div');
  d.className = 'list-row';
  d.innerHTML = `<span class="nm">${ED_esc(k)}</span><span class="pos">${ED_esc(v)}</span>`;
  return d;
}

/* ---------------- 碰撞体面板 ---------------- */

function ED_refreshCollision() {
  const box = document.getElementById('col-info');
  const o = ED.selected;
  box.innerHTML = '';
  if (!o) return;

  /* 碰撞体类型切换栏：随时可在 Box / Cylinder / 无 之间切换 */
  const switchRow = document.createElement('div');
  switchRow.className = 'pill-row';
  switchRow.style.marginBottom = '10px';
  const curType = o.collision ? o.collision.type : 'none';
  for (const [t, label] of [['box', 'Box 盒'], ['cylinder', 'Cylinder 柱'], ['none', '无碰撞体']]) {
    const b = document.createElement('button');
    b.className = 'pill' + (curType === t ? ' on' : '');
    b.textContent = label;
    b.addEventListener('click', () => {
      if (t === 'none') o.collision = null;
      else if (t === 'box') o.collision = { type: 'box', w: 1.6, d: 1.6, h: 2.0 };
      else o.collision = { type: 'cylinder', radius: 0.45, height: 2.0 };
      ED_refreshCollision();
      ED.dirty = true;
    });
    switchRow.appendChild(b);
  }
  box.appendChild(switchRow);

  if (!o.collision) {
    const tip = document.createElement('div');
    tip.className = 'empty-note';
    tip.textContent = '当前物体无碰撞体积，可点上方类型手动设置或点下方「AI 推断」';
    box.appendChild(tip);
    return;
  }

  const c = o.collision;
  if (c.type === 'box') {
    if (c.w == null) c.w = c.width || 1;
    if (c.d == null) c.d = c.depth || 1;
    if (c.h == null) c.h = c.height || 1;
  } else {
    if (c.radius == null) c.radius = .4;
    if (c.height == null) c.height = 1;
  }

  const addSlider = (label, key, min, max, step, suffix) => {
    const wrap = document.createElement('div');
    wrap.className = 'slider';
    wrap.innerHTML = `<label>${label} <b>${c[key]}${suffix}</b></label>`;
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.min = String(min); inp.max = String(max); inp.step = String(step);
    inp.value = String(c[key]);
    inp.addEventListener('input', e => {
      c[key] = Number(e.target.value);
      wrap.querySelector('b').textContent = e.target.value + suffix;
      ED.dirty = true;
    });
    wrap.appendChild(inp);
    box.appendChild(wrap);
  };

  if (c.type === 'box') {
    addSlider('宽 w (x)', 'w', .1, 12, .1, '');
    addSlider('深 d (y)', 'd', .1, 12, .1, '');
    addSlider('高 h (z)', 'h', .1, 12, .1, '');
  } else {
    addSlider('半径 radius', 'radius', .05, 6, .05, '');
    addSlider('高 height', 'height', .1, 12, .1, '');
  }
}

/* AI 推断碰撞体 */
async function ED_aiCollision() {
  const o = ED.selected;
  if (!o) return;
  const btn = document.getElementById('btn-col-ai');
  btn.disabled = true;
  studioStatus('AI 推断碰撞体…', 'busy');

  try {
    const comp = KIT.get(o.kind);
    const data = await studioPost('/api/collision', {
      kind: o.kind,
      name: comp ? comp.name : o.kind,
      desc: comp ? comp.desc : '',
      params: KIT.resolve(o.kind, o.params),
      current: o.collision,
    });
    if (data.collision) {
      o.collision = data.collision;
      ED_refreshCollision();
      ED.dirty = true;
      studioStatus('AI 给出碰撞体：' + data.reason, 'ok');
    } else {
      studioStatus('AI 没能给出建议', 'err');
    }
  } catch (e) {
    studioStatus('推断失败：' + e.message, 'err');
  } finally {
    btn.disabled = false;
  }
}

/* ---------------- 物体列表 ---------------- */

function ED_refreshObjects() {
  const box = document.getElementById('obj-list');
  box.innerHTML = '';
  document.getElementById('obj-count').textContent = ED.objects.length ? `(${ED.objects.length})` : '';

  if (!ED.objects.length) {
    box.innerHTML = '<div class="empty-note">还没有物体。选一个构件再点画布。</div>';
    return;
  }

  for (const o of ED.objects) {
    const comp = KIT.get(o.kind);
    const row = document.createElement('div');
    row.className = 'list-row' + (o === ED.selected ? ' on' : '');
    row.innerHTML =
      `<span class="nm">${ED_esc(comp ? comp.name : o.kind)}</span>` +
      `<span class="pos">${o.x.toFixed(1)},${o.y.toFixed(1)}</span>`;
    row.addEventListener('click', () => ED_select(o));

    const del = document.createElement('button');
    del.className = 'mini';
    del.textContent = '×';
    del.addEventListener('click', e => {
      e.stopPropagation();
      ED.objects = ED.objects.filter(x => x !== o);
      if (ED.selected === o) ED.selected = null;
      ED_refreshObjects();
      ED_refreshSel();
      ED.dirty = true;
    });
    row.appendChild(del);
    box.appendChild(row);
  }
}

function ED_bindPanels() {
  document.getElementById('btn-col-ai').addEventListener('click', ED_aiCollision);
  document.getElementById('btn-col-reset').addEventListener('click', () => {
    const o = ED.selected;
    if (!o) return;
    const comp = KIT.get(o.kind);
    o.collision = comp && comp.collision ? { ...comp.collision } : null;
    ED_refreshCollision();
    ED.dirty = true;
  });

  ED_bindSceneUI();
}
