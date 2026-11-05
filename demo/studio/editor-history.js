'use strict';
/* ------------------------------------------------------------------
 * 编辑器 · 撤销 / 重做（editor-history.js）
 *
 * 快照式：记录"对象层"（位置/参数/层级/编组）+ 地形（cells/blend）。
 * 地形用字符串缓存共享：同一份地形只占一份内存，多步历史都指向它；
 * 笔刷拖动算一笔（pointerdown 时快照），撤销回到落笔前。
 *
 * 用法：操作前调 ED_snapshot('描述')；⌘Z / ⇧⌘Z 撤销重做。
 * 连续滑块用 ED_snapshotThrottled 去抖，避免一次拖动塞几十条。
 * ------------------------------------------------------------------ */

const HIST = { undo: [], redo: [], max: 60, lock: false, lastAt: 0 };

/* 地形快照缓存：同一份地形只保留一个字符串引用，多步历史共享 */
let ED_TERRAIN_CACHE = null;

function ED_terrainSnapshot() {
  const json = JSON.stringify(TERRAIN.toJSON());
  if (json !== ED_TERRAIN_CACHE) ED_TERRAIN_CACHE = json;
  return ED_TERRAIN_CACHE;
}

function ED_cloneObjects() {
  return JSON.parse(JSON.stringify(ED.objects));
}

function ED_snapshot(label) {
  if (HIST.lock) return;
  HIST.undo.push({
    label: label || '',
    objects: ED_cloneObjects(),
    terrain: ED_terrainSnapshot(),        /* 共享字符串，不重复占内存 */
    selected: ED_selectionList().map(o => o.id),
  });
  if (HIST.undo.length > HIST.max) HIST.undo.shift();
  HIST.redo.length = 0;
}

/** 滑块连续输入用：500ms 内只记一次 */
function ED_snapshotThrottled(label) {
  const now = Date.now();
  if (now - HIST.lastAt < 500) return;
  HIST.lastAt = now;
  ED_snapshot(label);
}

function ED_restoreSnapshot(snap) {
  HIST.lock = true;
  if (snap.terrain) {
    TERRAIN.fromJSON(JSON.parse(snap.terrain));
    ED_TERRAIN_CACHE = snap.terrain;
  }
  ED.objects = JSON.parse(JSON.stringify(snap.objects));
  ED.selection = new Set();
  ED.selected = null;
  const ids = new Set(snap.selected || []);
  for (const o of ED.objects) if (ids.has(o.id)) ED.selection.add(o);
  const list = ED_selectionList();
  ED.selected = list.length ? list[list.length - 1] : null;

  /* nextId 续上，避免复制后 id 撞车 */
  let max = 0;
  for (const o of ED.objects) {
    const n = parseInt(String(o.id).replace(/\D/g, ''), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  ED.nextId = max + 1;

  ED_collectLights();
  ED_refreshObjects();
  ED_refreshSel();
  ED.dirty = true;
  HIST.lock = false;
}

function ED_undo() {
  if (!HIST.undo.length) { studioStatus('没有可撤销的操作'); return; }
  HIST.redo.push({
    label: '',
    objects: ED_cloneObjects(),
    terrain: ED_terrainSnapshot(),
    selected: ED_selectionList().map(o => o.id),
  });
  const snap = HIST.undo.pop();
  ED_restoreSnapshot(snap);
  studioStatus('↶ 已撤销' + (snap.label ? '：' + snap.label : ''));
}

function ED_redo() {
  if (!HIST.redo.length) { studioStatus('没有可重做的操作'); return; }
  HIST.undo.push({
    label: '',
    objects: ED_cloneObjects(),
    terrain: ED_terrainSnapshot(),
    selected: ED_selectionList().map(o => o.id),
  });
  const snap = HIST.redo.pop();
  ED_restoreSnapshot(snap);
  studioStatus('↷ 已重做');
}

function ED_clearHistory() {
  HIST.undo.length = 0;
  HIST.redo.length = 0;
  ED_TERRAIN_CACHE = null;
}
