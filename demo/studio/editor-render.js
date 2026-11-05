'use strict';
/* ------------------------------------------------------------------
 * 编辑器 · 渲染（editor-render.js）
 *
 * 从 editor.js 拆出（500 行约束）：
 *   背景色（画布 / 舞台 / 页面统一）· 帧循环 · 场景合成管线
 * ------------------------------------------------------------------ */

/* ---------------- 背景色 ---------------- */

/** '#rrggbb' → engine 打包像素（非法值退回默认深灰） */
function ED_bgPacked() {
  const m = /^#?([0-9a-f]{6})$/i.exec(ED.bg || '');
  if (!m) return rgb(247, 242, 231);
  const n = parseInt(m[1], 16);
  return rgb((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

/** 设置场景背景色：画布清屏、舞台底色、页面底色三者统一 */
function ED_setBg(color) {
  ED.bg = /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#f7f2e7';
  const stage = document.getElementById('stage');
  if (stage) stage.style.background = ED.bg;
  const full = document.querySelector('.ed-full');
  if (full) full.style.background = ED.bg;
  ED.dirty = true;
}

/* ---------------- 渲染 ---------------- */

function ED_loop() {
  let last = -1;
  function frame(now) {
    const step = Math.floor(now / 1000 * 12);
    if (step !== last) {
      const dt = last < 0 ? 1 / 12 : Math.min(.25, (step - last) / 12);
      last = step;
      ED.time = step / 12;
      if (ED.crowdMode) {
        KIT_CROWD.update(ED.time, dt);
        ED.dirty = true;
      }
      if (ED.selected) ED.dirty = true;   /* 选中指示箭头浮动动画 */
      if (ED.dirty) {
        ED_render(ED.time);
        ED.dirty = false;
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function ED_render(t = 0) {
  zb.fill(-1e9);
  pix.fill(ED_bgPacked());
  ground.fill(0);
  kinds.fill(KIND_NONE);
  groundZ.fill(0);
  shadowMask.fill(0);
  pendingShadows.length = 0;

  darkened.fill(0);          /* 每帧清零：AO/投影互斥标记 */
  if (ED.baseMap) {
    /* 底图模式：直接拷贝场景烘焙结果，物体画在其上 */
    pix.set(ED.baseMap.pix);
    zb.set(ED.baseMap.z);
    ground.set(ED.baseMap.ground);
    groundZ.set(ED.baseMap.groundZ);
  } else {
    terrainRender(!!ED.painting && (ED.tool === 'paint' || ED.tool === 'erase' || ED.tool === 'raise' || ED.tool === 'lower'));
  }

  /* 静态物体：层级（zOrder，大 = 上层）优先，同层按 y 画家算法 */
  const objs = [...ED.objects].sort(ED_compareDraw);
  for (const o of objs) {
    if (o.hidden) continue;
    /* 行为推进（sway/chop/flicker…），失败不影响渲染 */
    if (typeof KIT_BEHAVIOR !== 'undefined') {
      try { KIT_BEHAVIOR.tick(o, 1 / 12); } catch { /* 忽略单个构件的行为异常 */ }
    }
    ED_drawObject(o);
  }

  /* 动态人群 AI */
  if (ED.crowdMode && typeof KIT_CROWD !== 'undefined') {
    for (const ag of KIT_CROWD.agents) {
      ag.z = TERRAIN.heightAt(ag.x, ag.y);
    }
    KIT_CROWD.draw(t);
    flushShadows();
  }

  bakeOcclusion();
  staticShadow.set(shadowMask);
  applyShadows(groundZ);
  shadeEdges();

  if (ED.showGrid) terrainDrawGrid();
  if (ED.showBox) ED_drawAllCollisions();
  if (ED.ghost && ED.placing) ED_drawGhost();
  if (ED.marquee) ED_drawMarquee();
  if (typeof ED_drawTerrainSel === 'function') ED_drawTerrainSel();
  ED_drawSelectionBox();

  /* 选中物体的头顶浮动像素箭头 */
  if (ED.selected) {
    const s = ED.selected;
    const h = (s.collision && (s.collision.height || s.collision.h)) || 2.2;
    const p = project(s.x, s.y, (s.z || 0) + h + 0.5);
    drawArrow(p.sx, p.sy, t);
  }

  /* 全局光照：点光源（路灯等）→ 色调/环境/暗角 */
  PP_shadePoints();
  PP_applyGrade();
  if (typeof ED_drawLightIcons === 'function') ED_drawLightIcons();   /* 光源图标（不被色调影响） */

  /* 直接将 engine.js 的全局 image 提交到画布 */
  ctx.putImageData(image, 0, 0);
}

function ED_drawObject(o) {
  const comp = KIT.get(o.kind);
  if (!comp) return;
  try {
    comp.draw(KIT_RENDER.makeCtx(o), o);
  } catch (e) { console.error('[editor] 构件绘制失败', o.kind, e); }
}


/* ---------------- 画布扩展（无限画布的基础） ---------------- */

/** 把画布扩大 dw×dh；用视图偏移抵消内容位移，视觉上"原地长大" */
function ED_expandCanvas(dw, dh) {
  const nw = Math.min(2048, W + (dw || 0));
  const nh = Math.min(2048, H + (dh || 0));
  if (nw === W && nh === H) { studioStatus('画布已达上限 2048', 'err'); return; }
  const k = canvas.clientWidth ? canvas.clientWidth / W : 1;
  ED_snapshot('扩展画布');
  PP_setSize(nw, nh);
  /* 画布中心右移/下移了 (nw-W)/2 像素，视图反向偏移保持内容位置 */
  ED.view.ox -= (nw - W) / 2 * k;
  ED.view.oy -= (nh - H) / 2 * k;
  ED_applyView();
  ED.dirty = true;
  const el = document.getElementById('canvas-size');
  if (el) el.textContent = `${nw} × ${nh}`;
  studioStatus(`画布扩展为 ${nw}×${nh}（可继续往外画）`);
}

/** 扩展画布直到覆盖屏幕坐标 (sx,sy)（可为负/超界） */
function ED_expandToFit(sx, sy) {
  const M = 64;
  let dw = 0, dh = 0;
  if (sx > W) dw = Math.ceil((sx - W + M) / 128) * 128;
  else if (sx < 0) dw = Math.ceil((-sx + M) / 128) * 128;
  if (sy > H) dh = Math.ceil((sy - H + M) / 128) * 128;
  else if (sy < 0) dh = Math.ceil((-sy + M) / 128) * 128;
  if (!dw && !dh) return false;
  ED_expandCanvas(dw, dh);
  return true;
}

/** 笔刷接近边缘时自动扩画布（拖动画布外也能继续画） */
function ED_autoGrow(sx, sy) {
  const M = 28;
  let dw = 0, dh = 0;
  if (sx > W - M) dw = 128;
  else if (sx < M) dw = 128;   /* 向左画也扩，内容自动居中 */
  if (sy > H - M) dh = 128;
  else if (sy < M) dh = 128;
  if (dw || dh) ED_expandCanvas(dw, dh);
}
