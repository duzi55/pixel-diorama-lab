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

/* ---------------- 场景存取 ---------------- */

function ED_sceneJSON() {
  return {
    version: 1,
    terrain: TERRAIN.toJSON(),
    objects: ED.objects,
  };
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

  document.getElementById('btn-save-scene').addEventListener('click', async () => {
    const name = document.getElementById('scene-name').value.trim();
    if (!name) { studioStatus('先给场景起个名', 'err'); return; }
    try {
      const data = await studioPost('/api/scene', { action: 'save', name, scene: ED_sceneJSON() });
      studioStatus('已保存 → ' + data.file, 'ok');
      ED_loadSceneList();
    } catch (e) {
      studioStatus('保存失败：' + e.message, 'err');
    }
  });

  document.getElementById('btn-load-scene').addEventListener('click', async () => {
    const name = document.getElementById('scene-list').value;
    if (!name) { studioStatus('先选一个场景', 'err'); return; }
    try {
      const data = await studioPost('/api/scene', { action: 'load', name });
      ED_applyScene(data.scene);
      studioStatus('已载入 ' + name, 'ok');
    } catch (e) {
      studioStatus('载入失败：' + e.message, 'err');
    }
  });

  document.getElementById('btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(ED_sceneJSON(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (document.getElementById('scene-name').value.trim() || 'scene') + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    studioStatus('已导出 JSON', 'ok');
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    if (!confirm('清空地形和所有物体？')) return;
    TERRAIN.clear();
    ED.objects = [];
    ED.selected = null;
    ED_refreshObjects();
    ED_refreshSel();
    ED.dirty = true;
    studioStatus('已清空');
  });

  ED_loadSceneList();
}

async function ED_loadSceneList() {
  const sel = document.getElementById('scene-list');
  try {
    const res = await fetch('/api/scene');
    const data = await res.json();
    sel.innerHTML = '<option value="">— 载入场景 —</option>';
    for (const s of data.scenes || []) {
      const o = document.createElement('option');
      o.value = s; o.textContent = s;
      sel.appendChild(o);
    }
  } catch (e) { /* 列表拿不到不影响主流程 */ }
}

function ED_applyScene(scene) {
  if (!scene) return;
  TERRAIN.fromJSON(scene.terrain);
  ED.objects = (scene.objects || []).map(o => ({ ...o }));
  /* nextId 续上，避免 id 撞车 */
  let max = 0;
  for (const o of ED.objects) {
    const n = parseInt(String(o.id).replace(/\D/g, ''), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  ED.nextId = max + 1;
  ED.selected = null;
  ED_refreshObjects();
  ED_refreshSel();
  ED.dirty = true;
}

/* ---------------- 默认场景 ---------------- */

/* 开屏给一块地形，省得对着空白发呆 */
function ED_seedDemo() {
  for (let gx = -8; gx <= 8; gx++) for (let gy = -6; gy <= 6; gy++) {
    const d = Math.hypot(gx / 8, gy / 6);
    if (d > 1) continue;
    const z = Math.round(Math.max(0, 1.2 - d * 1.2) * 4) / 4;
    TERRAIN.set(gx, gy, 'grass', z);
  }
  /* 一条石板路 */
  for (let gy = -6; gy <= 6; gy++) {
    for (let gx = -1; gx <= 1; gx++) {
      if (TERRAIN.get(gx, gy)) TERRAIN.set(gx, gy, 'stone', TERRAIN.get(gx, gy).z);
    }
  }
  /* 几棵树 */
  ED.objects.push({
    id: 'o1', kind: 'broadleaf', x: -5, y: -3, z: TERRAIN.heightAt(-5, -3),
    rot: 0, params: KIT.defaults('broadleaf'), seed: 101,
    collision: { type: 'cylinder', radius: .35, height: 5 },
  });
  ED.objects.push({
    id: 'o2', kind: 'broadleaf', x: 5.5, y: -2, z: TERRAIN.heightAt(5.5, -2),
    rot: .6, params: KIT.defaults('broadleaf'), seed: 202,
    collision: { type: 'cylinder', radius: .35, height: 5 },
  });
  ED.objects.push({
    id: 'o3', kind: 'wood-house', x: 3, y: 3.5, z: TERRAIN.heightAt(3, 3.5),
    rot: 0, params: KIT.defaults('wood-house'), seed: 303,
    collision: { type: 'box', w: 4.4, d: 3.4, h: 2.8 },
  });
  ED.objects.push({
    id: 'o4', kind: 'well-house', x: -3.5, y: 2.5, z: TERRAIN.heightAt(-3.5, 2.5),
    rot: 0, params: KIT.defaults('well-house'), seed: 404,
    collision: { type: 'cylinder', radius: 1.25, height: 2.0 },
  });
  ED.objects.push({
    id: 'o5', kind: 'tin-lamp-post', x: -1.4, y: -0.5, z: TERRAIN.heightAt(-1.4, -0.5),
    rot: 0, params: KIT.defaults('tin-lamp-post'), seed: 505,
    collision: { type: 'cylinder', radius: .28, height: 4.2 },
  });
  ED.nextId = 6;
  ED_refreshObjects();
}
