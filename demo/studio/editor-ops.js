'use strict';
/* ------------------------------------------------------------------
 * 编辑器 · 布局操作（editor-ops.js）
 *
 * 对齐 / 等距分布 / 编组 / 拖动吸附 / 多选包围框
 * ------------------------------------------------------------------ */

/** 统一绘制排序：zOrder 优先，其次显式 order，最后按 y 画家算法 */
function ED_compareDraw(a, b) {
  const za = a.zOrder || 0, zb = b.zOrder || 0;
  if (za !== zb) return za - zb;
  const ao = a.order, bo = b.order;
  if (ao != null && bo != null) return ao - bo;
  if (ao != null) return 1;      /* 有显式顺序的视为更靠上 */
  if (bo != null) return -1;
  return a.y - b.y;
}

/** 把当前显示顺序冻结为显式 order（列表从上到下 order 递减） */
function ED_freezeOrder() {
  const list = [...ED.objects].sort(ED_compareDraw).reverse();
  const n = list.length;
  list.forEach((o, i) => { o.order = n - i; });
}

function ED_afterBulk(msg) {
  ED_refreshObjects();
  ED_refreshSel();
  ED_collectLights();
  ED.dirty = true;
  if (msg) studioStatus(msg, 'ok');
}

/* ---------------- 对齐 / 分布 ---------------- */

function ED_align(mode) {
  const list = ED_selectionList().filter(o => !o.locked);
  if (list.length < 2) { studioStatus('至少选中 2 个物体才能对齐', 'err'); return; }
  ED_snapshot('对齐');
  const xs = list.map(o => o.x), ys = list.map(o => o.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  for (const o of list) {
    if (mode === 'left') o.x = minX;
    else if (mode === 'right') o.x = maxX;
    else if (mode === 'top') o.y = minY;
    else if (mode === 'bottom') o.y = maxY;
    else if (mode === 'cx') o.x = (minX + maxX) / 2;
    else if (mode === 'cy') o.y = (minY + maxY) / 2;
    o.x = Math.round(o.x * 4) / 4;
    o.y = Math.round(o.y * 4) / 4;
    o.z = ED.baseMap ? 0 : TERRAIN.heightAt(o.x, o.y);
  }
  ED_afterBulk(`已对齐 ${list.length} 个物体`);
}

function ED_distribute(axis) {
  const list = ED_selectionList().filter(o => !o.locked);
  if (list.length < 3) { studioStatus('至少选中 3 个物体才能等距分布', 'err'); return; }
  ED_snapshot('等距分布');
  const key = axis === 'x' ? 'x' : 'y';
  const sorted = [...list].sort((a, b) => a[key] - b[key]);
  const min = sorted[0][key], max = sorted[sorted.length - 1][key];
  const step = (max - min) / (sorted.length - 1);
  sorted.forEach((o, i) => {
    if (i === 0 || i === sorted.length - 1) return;
    o[key] = Math.round((min + step * i) * 4) / 4;
    o.z = ED.baseMap ? 0 : TERRAIN.heightAt(o.x, o.y);
  });
  ED_afterBulk(`已沿 ${axis.toUpperCase()} 等距分布`);
}

/* ---------------- 编组 ---------------- */

let ED_GROUP_SEQ = 1;

function ED_syncGroupSeq() {
  let max = 0;
  for (const o of ED.objects) {
    if (!o.group) continue;
    const n = parseInt(String(o.group).replace(/\D/g, ''), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  ED_GROUP_SEQ = max + 1;
}

function ED_groupSelection() {
  const list = ED_selectionList().filter(o => !o.locked);
  if (list.length < 2) { studioStatus('至少选中 2 个物体才能编组', 'err'); return; }
  ED_snapshot('编组');
  const gid = 'g' + (ED_GROUP_SEQ++);
  for (const o of list) o.group = gid;
  ED_afterBulk(`已编组 ${list.length} 个物体`);
}

function ED_ungroupSelection() {
  const list = ED_selectionList();
  const grouped = list.filter(o => o.group);
  if (!grouped.length) { studioStatus('所选物体没有编组'); return; }
  ED_snapshot('解组');
  const gids = new Set(grouped.map(o => o.group));
  for (const o of ED.objects) if (gids.has(o.group)) delete o.group;
  ED_afterBulk('已解组');
}

/* ---------------- 吸附 ---------------- */

const ED_SNAP_DIST = 0.4;

/** 拖动吸附：靠近其他物体的 x/y 时对齐 */
function ED_snapPos(o, x, y) {
  let sx = x, sy = y, hitX = false, hitY = false;
  for (const other of ED.objects) {
    if (other === o || other.hidden) continue;
    if (!hitX && Math.abs(other.x - x) < ED_SNAP_DIST) { sx = other.x; hitX = true; }
    if (!hitY && Math.abs(other.y - y) < ED_SNAP_DIST) { sy = other.y; hitY = true; }
    if (hitX && hitY) break;
  }
  return { x: sx, y: sy };
}

/* ---------------- 多选包围框 ---------------- */

function ED_drawSelectionBox() {
  const list = ED_selectionList().filter(o => !o.hidden);
  if (list.length < 2) return;

  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (const o of list) {
    const c = o.collision || { radius: .5 };
    const r = c.type === 'cylinder' ? (c.radius || .4) : Math.max(c.w || c.d || 1) / 2;
    for (const [wx, wy] of [[o.x - r, o.y - r], [o.x + r, o.y - r], [o.x - r, o.y + r], [o.x + r, o.y + r]]) {
      const p = project(wx, wy, o.z || 0);
      if (p.sx < x0) x0 = p.sx;
      if (p.sx > x1) x1 = p.sx;
      if (p.sy < y0) y0 = p.sy;
      if (p.sy > y1) y1 = p.sy;
    }
  }
  if (x1 < 0) return;

  /* 深蓝虚线 + 四角 L 标记，与金色单体选中框区分 */
  const col = rgb(40, 96, 160);
  const px0 = Math.round(x0) - 2, px1 = Math.round(x1) + 2;
  const py0 = Math.round(y0) - 2, py1 = Math.round(y1) + 2;
  for (let x = px0; x <= px1; x += 2) {
    ED_plotScreen(x, py0, col);
    ED_plotScreen(x, py1, col);
  }
  for (let y = py0; y <= py1; y += 2) {
    ED_plotScreen(px0, y, col);
    ED_plotScreen(px1, y, col);
  }
  const arm = 6;
  const corner = (cx, cy, dx, dy) => {
    for (let i = 0; i <= arm; i++) {
      ED_plotScreen(cx + dx * i, cy, col);
      ED_plotScreen(cx, cy + dy * i, col);
    }
  };
  corner(px0, py0, 1, 1);
  corner(px1, py0, -1, 1);
  corner(px0, py1, 1, -1);
  corner(px1, py1, -1, -1);
}

/* ---------------- 地形选区（选框工具） ---------------- */

function ED_selectionCells() {
  const s = ED.terrainSel;
  if (!s) return [];
  const gx0 = Math.floor(Math.min(s.x0, s.x1));
  const gx1 = Math.ceil(Math.max(s.x0, s.x1));
  const gy0 = Math.floor(Math.min(s.y0, s.y1));
  const gy1 = Math.ceil(Math.max(s.y0, s.y1));
  const out = [];
  for (let gx = gx0; gx <= gx1; gx++) {
    for (let gy = gy0; gy <= gy1; gy++) out.push({ gx, gy });
  }
  return out;
}

function ED_selectionCellCount() {
  return ED_selectionCells().length;
}

/** 画地形选区（世界矩形四边 → 屏幕虚线） */
function ED_drawTerrainSel() {
  const s = ED.terrainSel || ED.marqueeWorld;
  if (!s) return;
  const pts = [[s.x0, s.y0], [s.x1, s.y0], [s.x1, s.y1], [s.x0, s.y1]]
    .map(([x, y]) => project(x, y, 0));
  const col = rgb(60, 120, 200);
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4];
    const n = Math.max(2, Math.ceil(Math.hypot(b.sx - a.sx, b.sy - a.sy)));
    for (let k = 0; k <= n; k++) {
      if (k & 1) continue;
      ED_plotScreen(
        Math.round(a.sx + (b.sx - a.sx) * k / n),
        Math.round(a.sy + (b.sy - a.sy) * k / n),
        col
      );
    }
  }
}

/**
 * 填充地形选区。
 * @param {string} mat 材质 id；'__erase__' 删除；null 表示只调高度
 * @param {number} dz 高度增量（可选）
 */
function ED_fillSelection(mat, dz) {
  const cells = ED_selectionCells();
  if (!cells.length) { studioStatus('先用「选框」工具框一块地形', 'err'); return; }
  ED_snapshot('填充选区');

  let changed = 0;
  for (const c of cells) {
    const cur = TERRAIN.get(c.gx, c.gy);
    if (mat === '__erase__') {
      if (cur) { TERRAIN.erase(c.gx, c.gy); changed++; }
    } else if (mat) {
      const z = cur ? cur.z : (ED.height || 0);
      TERRAIN.set(c.gx, c.gy, mat, z);
      changed++;
    } else if (dz) {
      if (cur) { TERRAIN.set(c.gx, c.gy, cur.mat, Math.max(0, cur.z + dz)); changed++; }
    }
  }

  /* 站在上面的物体高度跟随 */
  for (const o of ED.objects) o.z = ED.baseMap ? 0 : TERRAIN.heightAt(o.x, o.y);
  ED_refreshSel();
  ED.dirty = true;
  studioStatus(`已填充 ${changed} 格`);
}
