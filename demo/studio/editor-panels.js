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

/* ---------------- 场景存取 ---------------- */

function ED_sceneJSON() {
  const json = {
    version: 2,
    terrain: TERRAIN.toJSON(),
    objects: ED.objects,
    lighting: {
      dir: { ...LIGHT.dir },
      shadow: { ...LIGHT.shadow },
      tint: [...LIGHT.tint],
      ambient: LIGHT.ambient,
      vignette: LIGHT.vignette,
    },
  };
  /* 底图模式：把底图以 PNG 存进 JSON，载入时还原 */
  if (ED.baseMap && typeof SCENE_IMPORT !== 'undefined') {
    try {
      const png = SCENE_IMPORT.toDataURL();
      if (png) json.baseMap = { png, W: ED.baseMap.W, H: ED.baseMap.H, url: ED.baseMap.url };
    } catch (e) { /* 无 canvas 的环境（测试/异常）跳过底图存档 */ }
  }
  return json;
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

  /* 烘焙 three.js 图集（跑 tools/bake-atlas.mjs） */
  document.getElementById('btn-bake-atlas').addEventListener('click', async () => {
    const btn = document.getElementById('btn-bake-atlas');
    btn.disabled = true;
    studioStatus('正在烘焙图集（27 构件 × 8 朝向，约 10~30 秒）…', 'busy');
    try {
      const data = await studioPost('/api/bake-atlas', { dirs: 8, scale: 12 });
      const link = document.getElementById('atlas-link');
      if (link) link.style.display = '';
      studioStatus('✓ 图集已生成 → demo/export/atlas.png + atlas.json', 'ok');
      console.log('[bake-atlas]\n' + data.log);
    } catch (e) {
      studioStatus('烘焙失败：' + e.message, 'err');
    } finally {
      btn.disabled = false;
    }
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
  /* 光照设置还原 */
  if (scene.lighting && typeof LIGHT !== 'undefined') {
    Object.assign(LIGHT.dir, scene.lighting.dir || {});
    Object.assign(LIGHT.shadow, scene.lighting.shadow || {});
    LIGHT.tint = [...(scene.lighting.tint || [1, 1, 1])];
    LIGHT.ambient = scene.lighting.ambient != null ? scene.lighting.ambient : 1;
    LIGHT.vignette = scene.lighting.vignette || 0;
  }
  /* 底图还原（异步，完成后 ED.dirty 自动置位） */
  if (scene.baseMap && scene.baseMap.png && typeof SCENE_IMPORT !== 'undefined') {
    SCENE_IMPORT.fromDataURL(scene.baseMap.png, scene.baseMap.W, scene.baseMap.H)
      .then(() => studioStatus(`底图已还原（${scene.baseMap.url}）`, 'ok'))
      .catch(e => studioStatus('底图还原失败：' + (e && e.message || e), 'err'));
  } else if (ED.baseMap) {
    ED_setBaseMap(null);
  }
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

/* 开屏默认场景：用地形预设铺出多层次地貌（能直接看到材质过渡） */
function ED_seedDemo() {
  if (typeof TERRAIN_SHAPES !== 'undefined') {
    TERRAIN_SHAPES.apply({
      name: '默认村落',
      shapes: [
        { type: 'island', cx: 0, cy: 0, rx: 9, ry: 7, mat: 'grass', z: 0, wobble: 0.14 },
        { type: 'island', cx: -4.5, cy: -3.5, rx: 2.6, ry: 2.2, mat: 'soil', z: 0, wobble: 0.2 },
        { type: 'path', mat: 'stone', width: 1.0, points: [[-7, 4], [-1, 1], [3, -1], [7, -5]] },
        { type: 'island', cx: 5, cy: 3, rx: 2.2, ry: 1.8, mat: 'sand', z: 0, wobble: 0.22 },
        { type: 'island', cx: 5, cy: 3, rx: 1.2, ry: 0.95, mat: 'water', z: 0, wobble: 0.15 },
        { type: 'hill', cx: 1, cy: -2, r: 2.6, h: 0.75, falloff: 1.5 },
      ],
    });
  } else {
    for (let gx = -8; gx <= 8; gx++) for (let gy = -6; gy <= 6; gy++) {
      if (Math.hypot(gx / 8, gy / 6) <= 1) TERRAIN.set(gx, gy, 'grass', 0);
    }
  }

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
