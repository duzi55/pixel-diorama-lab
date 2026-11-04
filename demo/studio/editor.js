'use strict';
/* ------------------------------------------------------------------
 * 编辑器 · 主逻辑（editor.js）
 *
 * 工具：画地形 / 擦除 / 抬高 / 降低 / 放置 / 选择与拖拽
 *
 * 关键纪律：
 *   1. 直接复用 engine.js 顶层的 ctx / image / pix / zb，不另建缓冲。
 *   2. 根据 #stage 容器尺寸自适应整数倍缩放 canvas。
 *   3. 支持直接拖拽选中物体、滚轮调朝向、头顶像素箭头指示、动态人群 AI。
 *
 * 碰撞线框 / 幽灵预览 / 像素直线等视图覆盖层在 editor-view.js。
 * ------------------------------------------------------------------ */

const ED = {
  tool: 'paint',
  mat: 'grass',
  brush: 2,
  height: 0,
  objects: [],           /* { id, kind, x, y, z, rot, params, seed, collision } */
  selected: null,
  draggingObj: false,
  nextId: 1,
  placing: null,         /* 正在放置的构件 kind */
  rot: 0,
  scale: 1,
  showGrid: false,
  showBox: true,
  crowdMode: '',
  baseMap: null,          /* 底图模式：{ url, W, H, pix, z, ground, groundZ } */
  painting: false,
  ghost: null,
  dirty: true,
  time: 0,
};

/* ---------------- 初始化与自适应缩放 ---------------- */

function ED_fit() {
  const stage = document.getElementById('stage');
  /* 全屏画布：两侧留出浮动面板的宽度（各 ~270px），底部留状态条 */
  const cw = (stage && stage.clientWidth) ? stage.clientWidth - 40 : innerWidth - 40;
  const ch = (stage && stage.clientHeight) ? stage.clientHeight - 90 : innerHeight - 90;
  const dpr = window.devicePixelRatio || 1;
  const scale = Math.max(1, Math.floor(Math.min(cw / W, ch / H) * dpr)) / dpr;
  canvas.style.width = Math.round(W * scale) + 'px';
  canvas.style.height = Math.round(H * scale) + 'px';
}

function ED_init() {
  canvas.width = W;
  canvas.height = H;
  ED.canvas = canvas;

  ED_buildMats();
  ED_buildCats();
  ED_buildTools();
  ED_bindCanvas();
  ED_bindPanels();

  ED_initLightingUI();
  ED_seedDemo();
  ED_fit();
  addEventListener('resize', ED_fit);

  /* 浮动面板折叠 */
  for (const [tg, panel] of [['tg-left', 'fp-left'], ['tg-right', 'fp-right']]) {
    const b = document.getElementById(tg);
    if (b) b.addEventListener('click', () => {
      document.getElementById(panel).classList.toggle('fp-collapsed');
      b.textContent = document.getElementById(panel).classList.contains('fp-collapsed') ? '+' : '–';
    });
  }

  ED_loop();
}

/* 材质按钮 */
function ED_buildMats() {
  const box = document.getElementById('mats');
  box.innerHTML = '';
  for (const [id, m] of Object.entries(TERRAIN.mats)) {
    const b = document.createElement('button');
    b.className = 'pill' + (id === ED.mat ? ' on' : '');
    b.textContent = m.name;
    b.addEventListener('click', () => {
      ED.mat = id;
      for (const x of box.children) x.classList.remove('on');
      b.classList.add('on');
    });
    box.appendChild(b);
  }
}

/* 分类筛选 + 构件列表 */
function ED_buildCats() {
  const box = document.getElementById('cats');
  const cats = [...new Set(KIT.list().map(c => c.category))];
  let cur = '';
  const list = document.getElementById('comp-list');

  const renderList = () => {
    list.innerHTML = '';
    const comps = KIT.list().filter(c => !cur || c.category === cur);
    if (!comps.length) {
      list.innerHTML = '<div class="empty-note">这个分类还没有构件</div>';
      return;
    }
    for (const c of comps) {
      const it = document.createElement('div');
      it.className = 'item' + (ED.placing === c.id ? ' on' : '');
      it.innerHTML = `<span>${ED_esc(c.name)}</span><span class="cat">${ED_esc(c.id)}</span>`;
      it.title = c.desc || c.id;
      it.addEventListener('click', () => {
        ED.placing = c.id;
        ED_setTool('place');
        renderList();
        studioStatus(`放置「${c.name}」—— 点画布放置，滚轮旋转，Esc 取消`);
      });
      list.appendChild(it);
    }
  };

  const renderCats = () => {
    box.innerHTML = '';
    const all = document.createElement('button');
    all.className = 'pill' + (cur === '' ? ' on' : '');
    all.textContent = '全部';
    all.addEventListener('click', () => { cur = ''; renderCats(); renderList(); });
    box.appendChild(all);
    for (const c of cats) {
      const b = document.createElement('button');
      b.className = 'pill' + (cur === c ? ' on' : '');
      b.textContent = KIT_CATEGORY[c] || c;
      b.addEventListener('click', () => { cur = c; renderCats(); renderList(); });
      box.appendChild(b);
    }
  };

  renderCats();
  renderList();
  ED.refreshComponents = renderList;
}

function ED_setTool(t) {
  if (ED_toolLocked(t)) {
    studioStatus('底图模式下该工具不可用', 'err');
    return;
  }
  ED.tool = t;
  for (const b of document.getElementById('tools').children)
    b.classList.toggle('on', b.dataset.tool === t);
}

function ED_buildTools() {
  for (const b of document.getElementById('tools').children) {
    b.addEventListener('click', () => {
      ED_setTool(b.dataset.tool);
      if (b.dataset.tool !== 'place') {
        ED.placing = null;
        if (ED.refreshComponents) ED.refreshComponents();
      }
    });
  }
  const brush = document.getElementById('brush');
  brush.addEventListener('input', e => {
    ED.brush = Number(e.target.value);
    document.getElementById('v-brush').textContent = ED.brush.toFixed(1);
  });
  const h = document.getElementById('height');
  h.addEventListener('input', e => {
    ED.height = Number(e.target.value);
    document.getElementById('v-height').textContent = ED.height.toFixed(2);
  });
  document.getElementById('showgrid').addEventListener('change', e => { ED.showGrid = e.target.checked; ED.dirty = true; });
  document.getElementById('showbox').addEventListener('change', e => { ED.showBox = e.target.checked; ED.dirty = true; });

  const crowdSel = document.getElementById('crowd-mode');
  if (crowdSel) {
    crowdSel.addEventListener('change', e => {
      ED.crowdMode = e.target.value;
      if (ED.crowdMode) {
        KIT_CROWD.create({
          variant: ED.crowdMode,
          count: 6,
          seed: 19,
          focus: { x: 0, y: 0 },
          clearance: 2.2,
          bounds: { x0: -6, x1: 6, y0: -5, y1: 5 },
          scale: 0.85,
        });
        studioStatus(`已开启人群 AI：${ED.crowdMode}`, 'ok');
      } else {
        KIT_CROWD.clear();
        studioStatus('已关闭人群 AI');
      }
      ED.dirty = true;
    });
  }

  const presetVillage = document.getElementById('preset-village');
  if (presetVillage) {
    presetVillage.addEventListener('click', () => {
      TERRAIN.clear();
      ED.objects = [];
      ED_seedDemo();
      ED_select(null);
      ED.dirty = true;
      studioStatus('已载入「山坡村落」预设', 'ok');
    });
  }

  const presetFlat = document.getElementById('preset-flat');
  if (presetFlat) {
    presetFlat.addEventListener('click', () => {
      TERRAIN.clear();
      for (let gx = -8; gx <= 8; gx++) for (let gy = -6; gy <= 6; gy++) {
        if (Math.hypot(gx / 8, gy / 6) <= 1) TERRAIN.set(gx, gy, 'grass', 0);
      }
      ED.dirty = true;
      studioStatus('已铺设「平坦草岛」地形', 'ok');
    });
  }
}

/* ---------------- 画布交互 ---------------- */

function ED_bindCanvas() {
  const toWorld = e => {
    const r = canvas.getBoundingClientRect();
    const sx = (e.clientX - r.left) / r.width * W;
    const sy = (e.clientY - r.top) / r.height * H;
    return unproject(sx, sy);
  };

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    const w = toWorld(e);
    if (ED_toolLocked(ED.tool)) {
      studioStatus('底图模式下地形工具不可用（场景地面是烘焙产物）—— 构件放置/选择不受限', 'err');
      return;
    }
    ED.painting = true;

    if (ED.tool === 'place' && ED.placing) {
      ED_placeObject(ED.placing, w.x, w.y);
      return;
    }
    if (ED.tool === 'select') {
      ED_selectAt(w.x, w.y);
      if (ED.selected) ED.draggingObj = true;
      return;
    }
    ED_applyTool(w);
  });

  canvas.addEventListener('pointermove', e => {
    const w = toWorld(e);
    const g = TERRAIN.toGrid(w.x, w.y);
    document.getElementById('pos').textContent =
      `x=${w.x.toFixed(1)} y=${w.y.toFixed(1)} 格(${g.gx},${g.gy}) 高=${TERRAIN.heightAt(w.x, w.y).toFixed(2)}`;

    if (ED.draggingObj && ED.selected && ED.tool === 'select') {
      ED.selected.x = Math.round(w.x * 4) / 4;
      ED.selected.y = Math.round(w.y * 4) / 4;
      ED.selected.z = ED.baseMap ? 0 : TERRAIN.heightAt(ED.selected.x, ED.selected.y);
      ED_refreshSel();
      ED_refreshObjects();
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

  const stopDrag = () => { ED.painting = false; ED.draggingObj = false; };
  canvas.addEventListener('pointerup', stopDrag);
  canvas.addEventListener('pointerleave', () => {
    stopDrag();
    if (ED.ghost) { ED.ghost = null; ED.dirty = true; }
  });

  ED_bindKeys();

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
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

function ED_applyTool(w) {
  const g = TERRAIN.toGrid(w.x, w.y);
  switch (ED.tool) {
    case 'paint':
      TERRAIN.paint(g.gx, g.gy, ED.mat, ED.brush, ED.height, 'paint');
      break;
    case 'erase':
      TERRAIN.paint(g.gx, g.gy, ED.mat, ED.brush, 0, 'erase');
      break;
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

/* ---------------- 物体装配 ---------------- */

function ED_placeObject(kind, x, y) {
  const comp = KIT.get(kind);
  if (!comp) return;
  const rx = Math.round(x * 4) / 4, ry = Math.round(y * 4) / 4;
  const obj = {
    id: 'o' + (ED.nextId++),
    kind,
    x: rx,
    y: ry,
    z: ED.baseMap ? 0 : TERRAIN.heightAt(rx, ry),
    rot: ED.rot || 0,
    scale: ED.scale || 1,
    params: KIT.defaults(kind),
    seed: Math.floor(hash(ED.nextId * 17, 91) * 100000) + 1,
    collision: comp.collision ? { ...comp.collision } : null,
  };
  ED.objects.push(obj);
  ED_collectLights();
  ED_select(obj);
  ED_refreshObjects();
  ED.dirty = true;
  studioStatus(`已放置「${comp.name}」`);
}

function ED_selectAt(x, y) {
  let best = null, bestD = 2.2;
  const sorted = [...ED.objects].sort((a, b) => b.y - a.y);
  for (const o of sorted) {
    const d = Math.hypot(o.x - x, o.y - y);
    if (d < bestD) { bestD = d; best = o; }
  }
  ED_select(best);
}

function ED_select(o) {
  ED.selected = o;
  ED_refreshSel();
  ED_refreshObjects();
  ED_collectLights();
  ED.dirty = true;
}

function ED_deleteSelected() {
  if (!ED.selected) return;
  ED.objects = ED.objects.filter(o => o !== ED.selected);
  ED_collectLights();
  ED_select(null);
  ED_refreshObjects();
  ED.dirty = true;
  studioStatus('已删除选中物体');
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
  pix.fill(rgb(22, 22, 27));
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

/* ---------------- 启动 ---------------- */

ED_init();
