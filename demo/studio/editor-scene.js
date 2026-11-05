'use strict';
/* ------------------------------------------------------------------
 * 编辑器 · 场景存取（editor-scene.js）
 *
 * 从 editor-panels.js 拆出（500 行约束）：
 *   场景 JSON 序列化 · 新建场景 · 保存/载入 · 默认地形预设
 *
 * 场景 JSON 里携带 W/H/S/origin/bg —— 查看器（scenes/view.html）
 * 靠这些字段复现同一尺寸、同一比例、同一背景色。
 * ------------------------------------------------------------------ */

/* ---------------- 场景 UI 绑定 ---------------- */

function ED_bindSceneUI() {
  /* 顶部栏：场景名同步 + 保存 */
  const titleEl = document.getElementById('ed-scene-title');
  const sceneNameEl = document.getElementById('scene-name');
  if (titleEl && sceneNameEl) {
    titleEl.value = sceneNameEl.value || '';
    titleEl.addEventListener('input', () => { sceneNameEl.value = titleEl.value; });
  }
  const topSave = document.getElementById('ed-top-save');
  if (topSave) topSave.addEventListener('click', () => document.getElementById('btn-save-scene').click());

  /* 新建场景 */
  document.getElementById('btn-new-scene').addEventListener('click', ED_newScene);

  /* 背景色：预设一键应用，取色器实时应用（当前场景立刻看到效果） */
  const bgInput = document.getElementById('new-scene-bg');
  if (bgInput) bgInput.addEventListener('input', () => ED_setBg(bgInput.value));
  for (const b of document.querySelectorAll('#bg-presets .pill')) {
    b.addEventListener('click', () => {
      const bg = b.dataset.bg;
      if (bgInput) bgInput.value = bg;
      ED_setBg(bg);
    });
  }

  document.getElementById('btn-save-scene').addEventListener('click', async () => {
    const name = document.getElementById('scene-name').value.trim();
    if (!name) { studioStatus('先给场景起个名', 'err'); return; }
    try {
      const data = await studioPost('/api/scene', { action: 'save', name, scene: ED_sceneJSON() });
      studioStatus('已保存 → ' + data.file + ' · 导航「我的场景」里可直接打开', 'ok');
      const link = document.getElementById('scene-view-link');
      if (link && data.view) { link.href = data.view; link.style.display = ''; }
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
      const sn = document.getElementById('scene-name');
      if (sn) sn.value = name;
      const st = document.getElementById('ed-scene-title');
      if (st) st.value = name;
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
  ED_loadSceneList();
}

function ED_sceneJSON() {
  const nameEl = document.getElementById('scene-name');
  const json = {
    version: 3,
    title: (nameEl && nameEl.value.trim()) || undefined,
    bg: ED.bg,                 /* 查看器页面与画布共用这个底色 */
    W, H,                      /* 画布尺寸：载入时按它重建 */
    S,                         /* 像素/世界单位：查看器复现同一比例 */
    originX: window.PP_ORIGIN_X || 0,
    originY: window.PP_ORIGIN_Y == null ? 18 : window.PP_ORIGIN_Y,
    terrain: TERRAIN.toJSON(),
    objects: ED.objects,
    lights: ED.lights || [],
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


async function ED_loadSceneList() {
  const sel = document.getElementById('scene-list');
  try {
    const res = await fetch('/api/scene');
    const data = await res.json();
    sel.innerHTML = '<option value="">— 载入场景 —</option>';
    /* index 带显示名；旧服务端只给名字数组 */
    const list = data.index && data.index.length
      ? data.index.map(s => ({ name: s.name, label: s.title && s.title !== s.name ? `${s.title} (${s.name})` : s.name }))
      : (data.scenes || []).map(n => ({ name: n, label: n }));
    for (const s of list) {
      const o = document.createElement('option');
      o.value = s.name;
      o.textContent = s.label;
      sel.appendChild(o);
    }
  } catch (e) { /* 列表拿不到不影响主流程 */ }
}

function ED_applyScene(scene) {
  if (!scene) return;
  ED_snapshot('载入场景');
  /* 画布尺寸与背景色先恢复（旧场景没有 W/H/bg 时保持当前） */
  if (scene.W && scene.H && (scene.W !== W || scene.H !== H)) {
    PP_setSize(scene.W, scene.H);
  }
  ED_setBg(scene.bg || '#16161c');
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
  ED.lights = (scene.lights || []).map(L => ({ ...L }));
  ED.selectedLight = null;
  ED.nextLightId = ED.lights.length + 1;
  /* nextId 续上，避免 id 撞车 */
  let max = 0;
  for (const o of ED.objects) {
    const n = parseInt(String(o.id).replace(/\D/g, ''), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  ED.nextId = max + 1;
  ED.selected = null;
  ED_syncGroupSeq();
  ED_refreshObjects();
  ED_refreshSel();
  ED_fit();
  ED.dirty = true;
}

/* ---------------- 新建场景 ---------------- */

function ED_newScene() {
  const name = (document.getElementById('new-scene-name').value || '').trim();
  if (!/^[\w-]+$/.test(name)) {
    studioStatus('场景名只能用字母/数字/下划线/连字符', 'err');
    return;
  }
  const w = Math.max(80, Math.min(2048, Number(document.getElementById('new-scene-w').value) || 520));
  const h = Math.max(60, Math.min(2048, Number(document.getElementById('new-scene-h').value) || 380));
  const bg = document.getElementById('new-scene-bg').value || '#16161c';
  const preset = document.getElementById('new-scene-preset').value;

  ED_snapshot('新建场景');
  if (ED.baseMap) ED_setBaseMap(null);   /* 新建 = 离开底图模式 */

  PP_setSize(w, h);                      /* 画布按新尺寸重建（这是"尺寸没生效"的根） */
  ED_setBg(bg);
  TERRAIN.clear();
  ED.objects = [];
  ED.selected = null;
  ED.nextId = 1;

  if (preset === 'flat') ED_terrainFlat();
  else if (preset === 'village') ED_terrainVillage();

  document.getElementById('scene-name').value = name;
  const titleEl = document.getElementById('ed-scene-title');
  if (titleEl) titleEl.value = name;
  const link = document.getElementById('scene-view-link');
  if (link) link.style.display = 'none';

  ED_refreshObjects();
  ED_refreshSel();
  ED_fit();
  ED.dirty = true;
  studioStatus(`已新建场景「${name}」 ${w}×${h} · 背景 ${bg}`, 'ok');
}

/* ---------------- 默认场景 ---------------- */

/** 山坡村落地形（开屏 demo 与「新建场景」预设共用） */
function ED_terrainVillage() {
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
}

/** 平坦草地岛 */
function ED_terrainFlat() {
  if (typeof TERRAIN_SHAPES !== 'undefined') {
    TERRAIN_SHAPES.apply({
      name: '平坦草岛',
      shapes: [{ type: 'island', cx: 0, cy: 0, rx: 9, ry: 7, mat: 'grass', z: 0, wobble: 0.1 }],
    });
  } else {
    for (let gx = -8; gx <= 8; gx++) for (let gy = -6; gy <= 6; gy++) {
      if (Math.hypot(gx / 8, gy / 6) <= 1) TERRAIN.set(gx, gy, 'grass', 0);
    }
  }
}

/* 开屏默认场景：用地形预设铺出多层次地貌（能直接看到材质过渡） */
function ED_seedDemo() {
  ED_terrainVillage();

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
