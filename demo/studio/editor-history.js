'use strict';
/* ------------------------------------------------------------------
 * 编辑器 · 撤销 / 重做（editor-history.js）
 *
 * 快照式：只记录"对象层"（位置/参数/层级/编组），地形不进历史
 * （地形笔刷是连续的，逐笔快照太重；需要时可单独做地形历史）。
 *
 * 用法：操作前调 ED_snapshot('描述')；⌘Z / ⇧⌘Z 撤销重做。
 * 连续滑块用 ED_snapshotThrottled 去抖，避免一次拖动塞几十条。
 * ------------------------------------------------------------------ */

const HIST = { undo: [], redo: [], max: 60, lock: false, lastAt: 0 };

function ED_cloneObjects() {
  return JSON.parse(JSON.stringify(ED.objects));
}

function ED_snapshot(label) {
  if (HIST.lock) return;
  HIST.undo.push({
    label: label || '',
    objects: ED_cloneObjects(),
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
    selected: ED_selectionList().map(o => o.id),
  });
  const snap = HIST.redo.pop();
  ED_restoreSnapshot(snap);
  studioStatus('↷ 已重做');
}

function ED_clearHistory() {
  HIST.undo.length = 0;
  HIST.redo.length = 0;
}
