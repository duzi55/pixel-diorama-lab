'use strict';
/* ------------------------------------------------------------------
 * 编辑器 · 选择 / 框选 / 拖拽（editor-select.js）
 *
 * 选择模型：
 *   ED.selection  Set<object>   多选集合
 *   ED.selected   主选中（最后点的那个，兼容旧代码）
 *
 * 交互：
 *   点击            单选
 *   Shift + 点击    加选 / 取消
 *   空白拖拽         框选（Shift 时并入选区）
 *   拖任意选中物体   整体移动（多选一起动）
 * ------------------------------------------------------------------ */

function ED_selectionList() {
  return ED.selection ? [...ED.selection] : [];
}

function ED_isSelected(o) {
  return !!(ED.selection && ED.selection.has(o));
}

function ED_clearSelection() {
  ED.selection = new Set();
  ED.selected = null;
  ED_refreshSel();
  ED_refreshObjects();
  ED.dirty = true;
}

/** 单选 / 加选。opts.additive = true 时切换该项 */
function ED_select(o, opts = {}) {
  if (!ED.selection) ED.selection = new Set();
  if (!o) {
    if (!opts.additive) ED_clearSelection();
    return;
  }
  if (opts.additive) {
    if (ED.selection.has(o)) ED.selection.delete(o);
    else ED.selection.add(o);
  } else {
    ED.selection.clear();
    ED.selection.add(o);
  }
  ED.selected = ED.selection.size ? o : null;
  ED_refreshSel();
  ED_refreshObjects();
  ED_collectLights();
  ED.dirty = true;
}

function ED_selectMany(list, additive) {
  if (!ED.selection) ED.selection = new Set();
  if (!additive) ED.selection.clear();
  for (const o of list) ED.selection.add(o);
  ED.selected = list.length ? list[list.length - 1] : null;
  ED_refreshSel();
  ED_refreshObjects();
  ED_collectLights();
  ED.dirty = true;
}

/* ---------------- 命中检测 ---------------- */

/** 世界坐标处的物体（从上层往下找，跳过隐藏/锁定） */
function ED_pickAt(x, y) {
  let best = null, bestD = Infinity;
  const sorted = [...ED.objects]
    .filter(o => !o.hidden && !o.locked)
    .sort((a, b) => ((b.zOrder || 0) - (a.zOrder || 0)) || (b.y - a.y));

  for (const o of sorted) {
    const c = o.collision;
    let r = .8;
    if (c) {
      r = c.type === 'cylinder'
        ? (c.radius || .4)
        : Math.max(c.w || c.width || 1, c.d || c.depth || 1) / 2;
    }
    const reach = Math.max(r, .8) + .4;
    const d = Math.hypot(o.x - x, o.y - y);
    if (d <= reach && d < bestD) { bestD = d; best = o; }
  }
  return best;
}

/* ---------------- 框选 ---------------- */

/** 世界坐标矩形内的物体（屏幕投影点落在框内） */
function ED_marqueeObjects(x0, y0, x1, y1) {
  const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
  const out = [];
  for (const o of ED.objects) {
    if (o.hidden || o.locked) continue;
    const p = project(o.x, o.y, o.z || 0);
    if (p.sx >= minX && p.sx <= maxX && p.sy >= minY && p.sy <= maxY) out.push(o);
  }
  return out;
}

/** 在画布上画框选矩形（屏幕像素，虚线） */
function ED_drawMarquee() {
  const m = ED.marquee;
  if (!m) return;
  const col = rgb(176, 111, 42);
  const x0 = Math.round(Math.min(m.x0, m.x1)), x1 = Math.round(Math.max(m.x0, m.x1));
  const y0 = Math.round(Math.min(m.y0, m.y1)), y1 = Math.round(Math.max(m.y0, m.y1));
  for (let x = x0; x <= x1; x += 2) {
    ED_plotScreen(x, y0, col);
    ED_plotScreen(x, y1, col);
  }
  for (let y = y0; y <= y1; y += 2) {
    ED_plotScreen(x0, y, col);
    ED_plotScreen(x1, y, col);
  }
}

function ED_plotScreen(x, y, color) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  pix[y * W + x] = color;
}

/* ---------------- 多选拖拽 ---------------- */

function ED_beginDrag(sx, sy) {
  const list = ED_selectionList();
  if (!list.length) return false;
  ED.drag = {
    startX: sx, startY: sy,
    items: list.map(o => ({ o, x: o.x, y: o.y, z: o.z })),
  };
  return true;
}

function ED_updateDrag(sx, sy) {
  if (!ED.drag) return;
  const a = unproject(ED.drag.startX, ED.drag.startY);
  const b = unproject(sx, sy);
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const it of ED.drag.items) {
    it.o.x = Math.round((it.x + dx) * 4) / 4;
    it.o.y = Math.round((it.y + dy) * 4) / 4;
    it.o.z = ED.baseMap ? 0 : TERRAIN.heightAt(it.o.x, it.o.y);
  }
  ED.dirty = true;
  ED_refreshSel();
}

function ED_endDrag() {
  if (!ED.drag) return;
  ED.drag = null;
  ED_refreshObjects();
  ED_refreshSel();
  ED.dirty = true;
}

/* ---------------- 删除 / 复制 ---------------- */

function ED_deleteSelection() {
  const list = ED_selectionList();
  if (!list.length) return;
  const set = new Set(list);
  ED.objects = ED.objects.filter(o => !set.has(o));
  ED.selection = new Set();
  ED.selected = null;
  ED_collectLights();
  ED_refreshObjects();
  ED_refreshSel();
  ED.dirty = true;
  studioStatus(`已删除 ${list.length} 个物体`);
}

/** 兼容旧调用 */
function ED_deleteSelected() {
  ED_deleteSelection();
}

function ED_duplicateSelection() {
  const list = ED_selectionList();
  if (!list.length) return;
  const copies = list.map(o => {
    const n = {
      ...o,
      id: 'o' + (ED.nextId++),
      x: Math.round((o.x + .5) * 4) / 4,
      y: Math.round((o.y + .5) * 4) / 4,
      seed: Math.floor(hash(ED.nextId * 17, 91) * 100000) + 1,
    };
    n.params = { ...(o.params || {}) };
    n.collision = o.collision ? { ...o.collision } : null;
    delete n.anim;
    return n;
  });
  ED.objects.push(...copies);
  ED_selectMany(copies, false);
  studioStatus(`已复制 ${copies.length} 个物体`);
}
