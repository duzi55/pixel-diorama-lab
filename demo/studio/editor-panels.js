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
