'use strict';
/* ------------------------------------------------------------------
 * 编辑器 · 画布交互（editor-canvas.js）
 *
 * 从 editor.js 拆出（500 行约束）：
 *   pointerdown/move/up · 画笔/选框/光源/多选拖拽
 *   画布外点击自动扩展 · 太阳 gizmo 拾取 · 滚轮旋转/缩放 · 平移
 * ------------------------------------------------------------------ */

function ED_bindCanvas() {
  const stageEl = document.getElementById('stage');
  const toScreen = e => {
    const r = canvas.getBoundingClientRect();
    return {
      sx: (e.clientX - r.left) / r.width * W,
      sy: (e.clientY - r.top) / r.height * H,
    };
  };
  const toWorld = e => {
    const s = toScreen(e);
    return unproject(s.sx, s.sy);
  };

  /* 视图平移：中键拖拽 或 空格+左键拖拽 */
  let panning = false, panStart = null;
  stageEl.addEventListener('pointerdown', e => {
    if (e.button === 1 || ED.spaceHeld || ED.tool === 'pan') {
      panning = true;
      panStart = { x: e.clientX, y: e.clientY, ox: ED.view.ox, oy: ED.view.oy };
      stageEl.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    stageEl.setPointerCapture(e.pointerId);

    /* 点在画布之外：先把画布扩到覆盖该点，再按新坐标处理 */
    let sp = toScreen(e);
    if (sp.sx < 0 || sp.sy < 0 || sp.sx > W || sp.sy > H) {
      if (typeof ED_expandToFit === 'function' && ED_expandToFit(sp.sx, sp.sy)) {
        sp = toScreen(e);
      }
    }

    const w = toWorld(e);
    if (ED_toolLocked(ED.tool)) {
      studioStatus('底图模式下地形工具不可用（场景地面是烘焙产物）—— 构件放置/选择不受限', 'err');
      return;
    }
    /* 地形类工具：一笔开始前记一次快照（拖动期间连续绘制，算一笔） */
    if (ED.tool !== 'select' && ED.tool !== 'place' && ED.tool !== 'pan') {
      ED_snapshot('绘制地形');
    }
    ED.painting = true;

    if (ED.tool === 'place' && ED.placing) {
      ED_placeObject(ED.placing, w.x, w.y);
      return;
    }
    if (ED.tool === 'marquee') {
      ED.marqueeWorld = { x0: w.x, y0: w.y, x1: w.x, y1: w.y };
      ED.terrainSel = null;
      ED.dirty = true;
      return;
    }

    if (ED.tool === 'light') {
      const hit = ED_pickLight(w.x, w.y);
      if (hit) {
        ED.selectedLight = hit;
        ED.selected = null;
        ED.selection = new Set();
        ED.draggingLight = true;
        ED_refreshSel();
        ED_refreshObjects();
      } else {
        ED_snapshot('放置光源');
        ED_placeLight(w.x, w.y);
        ED.draggingLight = true;
      }
      return;
    }

    if (ED.tool === 'select') {
      /* 先判多选包围框把手：拖角 = 等比缩放所有选中 */
      if (typeof ED_pickBoxHandle === 'function') {
        const h = ED_pickBoxHandle(sp.sx, sp.sy);
        if (h != null && ED_beginMultiScale(sp.sx, sp.sy)) return;
      }
      const hit = ED_pickAt(w.x, w.y);
      if (hit) {
        if (e.shiftKey) ED_select(hit, { additive: true });
        else if (!ED_isSelected(hit)) ED_select(hit);
        if (ED_isSelected(hit)) {
          if (e.altKey) ED_duplicateSelection();   /* Alt 拖拽 = 复制后拖 */
          const s0 = toScreen(e);
          ED_beginDrag(s0.sx, s0.sy);
        }
      } else {
        if (!e.shiftKey) ED_clearSelection();
        const s0 = toScreen(e);
        ED.marquee = { x0: s0.sx, y0: s0.sy, x1: s0.sx, y1: s0.sy, additive: e.shiftKey };
      }
      return;
    }
    ED_applyTool(w);
  });

  stageEl.addEventListener('pointermove', e => {
    const w = toWorld(e);
    const g = TERRAIN.toGrid(w.x, w.y);
    document.getElementById('pos').textContent =
      `x=${w.x.toFixed(1)} y=${w.y.toFixed(1)} 格(${g.gx},${g.gy}) 高=${TERRAIN.heightAt(w.x, w.y).toFixed(2)}`;

    if (ED.marqueeWorld) {
      ED.marqueeWorld.x1 = w.x;
      ED.marqueeWorld.y1 = w.y;
      ED.dirty = true;
      return;
    }
    if (ED.multiScale) {
      const s0 = toScreen(e);
      ED_updateMultiScale(s0.sx, s0.sy);
      return;
    }
    if (ED.draggingLight && ED.selectedLight) {
      const L = ED.selectedLight;
      L.x = Math.round(w.x * 4) / 4;
      L.y = Math.round(w.y * 4) / 4;
      ED_collectLights();
      ED.dirty = true;
      ED_refreshSel();
      return;
    }
    if (ED.drag) {
      const s0 = toScreen(e);
      ED_updateDrag(s0.sx, s0.sy);
      return;
    }
    if (ED.marquee) {
      const s0 = toScreen(e);
      ED.marquee.x1 = s0.sx;
      ED.marquee.y1 = s0.sy;
      ED.dirty = true;
      return;
    }

    if (ED.painting && ED.tool !== 'select' && ED.tool !== 'place') {
      if (ED_toolLocked(ED.tool)) return;
      ED_applyTool(w);
    }
    if (ED.tool === 'place' && ED.placing) {
      ED.ghost = { x: Math.round(w.x * 4) / 4, y: Math.round(w.y * 4) / 4 };
      ED.dirty = true;
    }
  });

  stageEl.addEventListener('pointermove', e => {
    if (panning) {
      ED.view.ox = panStart.ox + (e.clientX - panStart.x);
      ED.view.oy = panStart.oy + (e.clientY - panStart.y);
      ED_applyView();
      return;
    }
  });

  const stopDrag = () => {
    if (ED.marqueeWorld) {
      const m = ED.marqueeWorld;
      ED.marqueeWorld = null;
      if (Math.abs(m.x1 - m.x0) > 0.3 && Math.abs(m.y1 - m.y0) > 0.3) {
        ED.terrainSel = m;
        const n = ED_selectionCellCount();
        studioStatus(`地形选区：${n} 格 —— 在地形 tab 里填充材质`);
      } else {
        ED.terrainSel = null;
      }
      ED_refreshSel();
      ED.dirty = true;
    }
    /* 笔刷自动过渡：抬笔时按最终形状算一次边缘（绘制中途邻居不全，不能边画边判） */
    if (ED.painting && ED.tool === 'paint' && ED.autoBlend &&
        ED.blendMat && ED.blendMat !== ED.mat && typeof terrainBlendEdges === 'function') {
      terrainBlendEdges(ED.mat, ED.blendMat, 1.2);
      ED.dirty = true;
    }
    if (ED.marquee) {
      const m = ED.marquee;
      const list = ED_marqueeObjects(m.x0, m.y0, m.x1, m.y1);
      if (list.length) ED_selectMany(list, m.additive);
      ED.marquee = null;
      ED.dirty = true;
    }
    ED_endDrag();
    ED.multiScale = null;
    ED.draggingLight = false;
    ED.sunDragging = false;
    ED.painting = false;
    ED.draggingObj = false;
    panning = false;
  };
  stageEl.addEventListener('pointerup', stopDrag);
  stageEl.addEventListener('pointerleave', () => {
    stopDrag();
    if (ED.ghost) { ED.ghost = null; ED.dirty = true; }
  });

  ED_bindKeys();

  stageEl.addEventListener('dblclick', () => {
    ED.view = { scale: 1, ox: 0, oy: 0 };
    ED_applyView();
    studioStatus('视图已复位');
  });

  stageEl.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      ED_viewZoom(e);
      return;
    }
    if (e.shiftKey) {
      /* Shift+滚轮 = 缩放 */
      const ds = (e.deltaY > 0 ? -1 : 1) * 0.1;
      if (ED.tool === 'place' && ED.placing) {
        ED.scale = clamp(Math.round(((ED.scale || 1) + ds) * 20) / 20, 0.2, 4);
        ED.dirty = true;
        studioStatus('放置缩放 ×' + ED.scale.toFixed(2));
      } else if (ED.selected) {
        ED.selected.scale = clamp(Math.round(((ED.selected.scale || 1) + ds) * 20) / 20, 0.2, 4);
        ED_refreshSel();
        ED.dirty = true;
        studioStatus('选中物体缩放 ×' + ED.selected.scale.toFixed(2));
      }
      return;
    }
    const delta = (e.deltaY > 0 ? 1 : -1) * Math.PI / 12;
    if (ED.tool === 'place' && ED.placing) {
      ED.rot = ((ED.rot || 0) + delta + Math.PI * 4) % (Math.PI * 2);
      ED.dirty = true;
      studioStatus('放置朝向 ' + Math.round(ED.rot * 180 / Math.PI) + '°');
    } else if (ED.selected) {
      ED.selected.rot = ((ED.selected.rot || 0) + delta + Math.PI * 4) % (Math.PI * 2);
      ED_refreshSel();
      ED.dirty = true;
      studioStatus('选中物体朝向 ' + Math.round(ED.selected.rot * 180 / Math.PI) + '°');
    }
  }, { passive: false });


}
