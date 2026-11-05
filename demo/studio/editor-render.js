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
  if (!m) return rgb(22, 22, 27);
  const n = parseInt(m[1], 16);
  return rgb((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

/** 设置场景背景色：画布清屏、舞台底色、页面底色三者统一 */
function ED_setBg(color) {
  ED.bg = /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#16161c';
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
  const objs = [...ED.objects].sort((a, b) =>
    ((a.zOrder || 0) - (b.zOrder || 0)) || (b.y - a.y));
  for (const o of objs) ED_drawObject(o);

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
