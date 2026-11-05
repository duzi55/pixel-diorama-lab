'use strict';
/* ------------------------------------------------------------------
 * 编辑器 · 视图覆盖层（editor-view.js）
 *
 * 从 editor.js 拆出的画布辅助绘制：
 *   ED_drawCollision      碰撞体虚线线框（选中物体黄色实线高亮）
 *   ED_drawAllCollisions  全部物体的碰撞体
 *   ED_drawGhost          放置模式下的幽灵预览
 *   ED_line               像素直线（可虚线）
 * ------------------------------------------------------------------ */

function ED_drawCollision(o, isSelected) {
  const c = o.collision;
  if (!c) return;
  const col = isSelected ? rgb(255, 214, 70) : rgb(120, 210, 255);
  const ox = o.x, oy = o.y, oz = o.z || 0;
  const rot = o.rot || 0;
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const un = (x, y) => [ox + x * cs + y * sn, oy - x * sn + y * cs];
  const seg = 20;
  const BACK = [[-1, 0], [0, -1]];

  if (c.type === 'cylinder') {
    const r = c.radius || .3, h = c.height || 1;
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * 6.283, a1 = (i + 1) / seg * 6.283;
      const p0 = un(Math.cos(a0) * r, Math.sin(a0) * r), p1 = un(Math.cos(a1) * r, Math.sin(a1) * r);
      const a = project(p0[0], p0[1], oz), b = project(p1[0], p1[1], oz);
      ED_line(a.sx, a.sy, b.sx, b.sy, col, !isSelected);
      const a2 = project(p0[0], p0[1], oz + h), b2 = project(p1[0], p1[1], oz + h);
      ED_line(a2.sx, a2.sy, b2.sx, b2.sy, col, !isSelected);
    }
    for (const [dx, dy] of BACK) {
      const p0 = un(dx * r, dy * r);
      const a = project(p0[0], p0[1], oz), a2 = project(p0[0], p0[1], oz + h);
      ED_line(a.sx, a.sy, a2.sx, a2.sy, col, !isSelected);
    }
  } else {
    const w = (c.w || c.width || 1) / 2, d = (c.d || c.depth || 1) / 2, h = c.h || c.height || 1;
    const corners = [[-w, -d], [w, -d], [w, d], [-w, d]];
    for (let i = 0; i < 4; i++) {
      const a0 = corners[i], b0 = corners[(i + 1) % 4];
      const p0 = un(a0[0], a0[1]), p1 = un(b0[0], b0[1]);
      const a = project(p0[0], p0[1], oz), b = project(p1[0], p1[1], oz);
      ED_line(a.sx, a.sy, b.sx, b.sy, col, !isSelected);
      const a2 = project(p0[0], p0[1], oz + h), b2 = project(p1[0], p1[1], oz + h);
      ED_line(a2.sx, a2.sy, b2.sx, b2.sy, col, !isSelected);
    }
    for (const [dx, dy] of BACK) {
      const p0 = un(dx * w, dy * d);
      const a = project(p0[0], p0[1], oz), a2 = project(p0[0], p0[1], oz + h);
      ED_line(a.sx, a.sy, a2.sx, a2.sy, col, !isSelected);
    }
  }
}

function ED_drawAllCollisions() {
  for (const o of ED.objects) {
    if (o.hidden) continue;
    if (!ED_isSelected(o)) ED_drawCollision(o, false);
  }
  for (const o of ED_selectionList()) {
    if (!o.hidden) ED_drawCollision(o, true);
  }
}

function ED_drawGhost() {
  const comp = KIT.get(ED.placing);
  if (!comp || !ED.ghost) return;
  const o = {
    kind: ED.placing, x: ED.ghost.x, y: ED.ghost.y, z: TERRAIN.heightAt(ED.ghost.x, ED.ghost.y),
    rot: ED.rot || 0, params: KIT.defaults(ED.placing), seed: 1,
  };
  ED_drawObject(o);
}

function ED_line(x0, y0, x1, y1, color, dash) {
  const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= n; i++) {
  if (dash && (i & 1)) continue;
    const x = Math.round(x0 + (x1 - x0) * i / n);
    const y = Math.round(y0 + (y1 - y0) * i / n);
  if (x < 0 || y < 0 || x >= W || y >= H) continue;
    pix[y * W + x] = color;
  }
}

function ED_esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ---------------- 键盘快捷键（从 editor.js 拆出） ---------------- */

function ED_bindKeys() {  addEventListener('keydown', e => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

    /* 工具快捷键：V 选择 / B 放置 / T 地形 / H 平移 */
    const k = e.key.toLowerCase();
    if (!e.metaKey && !e.ctrlKey) {
      if (k === 'v') { ED_setTool('select'); studioStatus('选择工具：点选、Shift 加选、空白拖拽框选'); return; }
      if (k === 'b') { ED_setTool('place'); studioStatus('放置工具：先在左侧选构件，再点画布'); return; }
      if (k === 't') { ED_setTool('paint'); studioStatus('地形工具：选择材质后绘制'); return; }
      if (k === 'h') { ED_setTool('pan'); studioStatus('平移：拖动画布'); return; }
      if (k === 'l') { ED_setTool('light'); studioStatus('光源工具：点画布放置，拖动移动，右侧调高度'); return; }
      if (k === 'i') { ED_setTool('pick'); studioStatus('吸管：点地形取材质和高度'); return; }
      if (k === 'g') { ED_setTool('fill'); studioStatus('填充桶：点一片地形换成当前材质'); return; }
    }

    /* 撤销 / 重做 */
    if ((e.metaKey || e.ctrlKey) && k === 'z') {
      e.preventDefault();
      if (e.shiftKey) ED_redo();
      else ED_undo();
      return;
    }

    /* 编组 / 解组 */
    if ((e.metaKey || e.ctrlKey) && k === 'g') {
      e.preventDefault();
      if (e.shiftKey) ED_ungroupSelection();
      else ED_groupSelection();
      return;
    }

    /* 剪切 / 粘贴 / 反选 */
    if ((e.metaKey || e.ctrlKey) && k === 'x') {
      e.preventDefault();
      ED_cutSelection();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && k === 'v') {
      e.preventDefault();
      ED_pasteClipboard();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && k === 'i') {
      e.preventDefault();
      ED_invertSelection();
      return;
    }

    /* 复制所选 */
    if ((e.metaKey || e.ctrlKey) && k === 'd') {
      e.preventDefault();
      ED_duplicateSelection();
      return;
    }

    /* 全选 */
    if ((e.metaKey || e.ctrlKey) && k === 'a') {
      e.preventDefault();
      ED_selectMany([...ED.objects].filter(o => !o.hidden && !o.locked), false);
      return;
    }

    if (e.key === 'Escape') {
      ED.placing = null;
      ED.ghost = null;
      ED_setTool('select');
      ED_select(null);
      if (ED.refreshComponents) ED.refreshComponents();
      studioStatus('已取消');
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (ED.selectedLight) { ED_deleteLight(); e.preventDefault(); }
      else if (ED_selectionList().length) { ED_deleteSelection(); e.preventDefault(); }
    }
  if (ED_selectionList().length && e.key.startsWith('Arrow')) {
      const step = e.shiftKey ? .5 : .15;
      for (const s of ED_selectionList()) {
        if (e.key === 'ArrowLeft') s.x -= step;
        if (e.key === 'ArrowRight') s.x += step;
        if (e.key === 'ArrowUp') s.y -= step;
        if (e.key === 'ArrowDown') s.y += step;
        s.z = ED.baseMap ? 0 : TERRAIN.heightAt(s.x, s.y);
      }
      ED.dirty = true;
      ED_refreshSel();
      ED_refreshObjects();
      e.preventDefault();
    }
  });
}

/* ---------------- 视图变换（从 editor.js 拆出） ----------------
 * Ctrl/⌘+滚轮缩放（以鼠标为中心）、中键或空格+拖拽平移、双击复位。
 * 视图缩放是显示层的（canvas.style 尺寸 × transform），不改变渲染分辨率。
 */

function ED_fit() {
  ED_applyView();
}

/* 应用视图变换：缩放 + 平移（视图缩放是显示层的，不影响渲染分辨率） */
function ED_applyView() {
  const stage = document.getElementById('stage');
  const cw = (stage && stage.clientWidth) ? stage.clientWidth - 40 : innerWidth - 40;
  const ch = (stage && stage.clientHeight) ? stage.clientHeight - 40 : innerHeight - 40;
  const v = ED.view;
  /* 基础适配倍数（整数，保像素锐利），再乘用户视图缩放 */
  const dpr = window.devicePixelRatio || 1;
  const base = Math.max(1, Math.floor(Math.min(cw / W, ch / H) * dpr)) / dpr;
  const k = base * v.scale;
  canvas.style.width = Math.round(W * k) + 'px';
  canvas.style.height = Math.round(H * k) + 'px';
  canvas.style.transform = v.ox || v.oy ? `translate(${v.ox}px, ${v.oy}px)` : '';
  const pct = document.getElementById('zoom-pct');
  if (pct) pct.textContent = Math.round(k * 100) + '%';
}

/* 视图缩放（Ctrl/⌘ + 滚轮），以鼠标位置为中心 */
function ED_viewZoom(e) {
  const v = ED.view;
  const old = v.scale;
  const next = clamp(Math.round((old * (e.deltaY > 0 ? 0.9 : 1.111)) * 100) / 100, 0.3, 8);
  if (next === old) return;
  /* 保持鼠标下的内容不动：先算鼠标相对画布中心的世界偏移，再按比例调整平移 */
  const stage = document.getElementById('stage');
  const r = stage.getBoundingClientRect();
  const mx = e.clientX - r.left - stage.clientWidth / 2;
  const my = e.clientY - r.top - stage.clientHeight / 2;
  const k = next / old - 1;
  v.ox -= mx * k;
  v.oy -= my * k;
  v.scale = next;
  ED_applyView();
  studioStatus('视图缩放 ×' + next.toFixed(2) + '（Ctrl+滚轮 · 双击复位）');
}


/* ED_fit 别名：init 与 resize 事件统一入口 */
void ED_applyView;

function ED_applyTool(w) {
  const g = TERRAIN.toGrid(w.x, w.y);
  switch (ED.tool) {
    case 'paint':
      TERRAIN.paint(g.gx, g.gy, ED.mat, ED.brush, ED.height, 'paint');
      if (typeof ED_autoGrow === 'function') {
        const pp = project(g.gx + .5, g.gy + .5, 0);
        ED_autoGrow(pp.sx, pp.sy);
      }
      break;
    case 'erase':
      TERRAIN.paint(g.gx, g.gy, ED.mat, ED.brush, 0, 'erase');
      break;
    case 'pick': {
      /* 吸管：取格子材质与高度 */
      const c = TERRAIN.get(g.gx, g.gy);
      if (!c) { studioStatus('这里没有地形', 'err'); break; }
      ED.mat = c.mat;
      ED.height = c.z || 0;
      ED_refreshMatButtons();
      studioStatus(`吸取：${(TERRAIN.mats[c.mat] || {}).name || c.mat} · 高 ${(c.z || 0).toFixed(2)}`);
      break;
    }
    case 'fill': {
      /* 填充桶：同材质连通区域替换成当前材质 */
      const start = TERRAIN.get(g.gx, g.gy);
      if (!start) { studioStatus('这里没有地形可填充', 'err'); break; }
      /* 先记下目标材质的值：TERRAIN.set 会就地改 start.mat，边填边比较会失效 */
      const targetMat = start.mat;
      if (targetMat === ED.mat) break;
      ED_snapshot('填充地形');
      const seen = new Set();
      const stack = [[g.gx, g.gy]];
      let n = 0;
      while (stack.length && n < 6000) {
        const [x, y] = stack.pop();
        const k = x + ',' + y;
        if (seen.has(k)) continue;
        seen.add(k);
        const c = TERRAIN.get(x, y);
        if (!c || c.mat !== targetMat) continue;
        TERRAIN.set(x, y, ED.mat, c.z || 0);
        n++;
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
      for (const o of ED.objects) o.z = ED.baseMap ? 0 : TERRAIN.heightAt(o.x, o.y);
      studioStatus(`填充 ${n} 格`);
      ED.dirty = true;
      break;
    }
    case 'raise':
      TERRAIN.sculpt(g.gx, g.gy, ED.brush, .25, 'raise');
      break;
    case 'lower':
      TERRAIN.sculpt(g.gx, g.gy, ED.brush, .25, 'lower');
      break;
  }
  /* 地形高度改变后，同步更新站在上面的物体高度 */
  for (const o of ED.objects) o.z = TERRAIN.heightAt(o.x, o.y);
  ED.dirty = true;
}

