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
  selected: null,        /* 主选中（兼容旧代码） */
  selection: new Set(),  /* 多选集合 */
  marquee: null,         /* 框选矩形 {x0,y0,x1,y1,additive} */
  drag: null,            /* 多选拖拽 {startX,startY,items} */
  draggingObj: false,
  nextId: 1,
  placing: null,         /* 正在放置的构件 kind */
  rot: 0,
  scale: 1,
  showGrid: false,
  showBox: true,
  crowdMode: '',
  bg: '#f7f2e7',          /* 画布背景色：保存进场景，查看器页面共用 */
  baseMap: null,          /* 底图模式：{ url, W, H, pix, z, ground, groundZ } */
  view: { scale: 1, ox: 0, oy: 0 },   /* 画布视图：Ctrl+滚轮缩放、中键/空格拖拽平移 */
  painting: false,
  ghost: null,
  dirty: true,
  time: 0,
};

/* ---------------- 初始化与自适应缩放 ---------------- */

function ED_init() {
  /* 被 app.html 用 iframe 嵌入时隐藏自己的 tab，避免双层导航 */
  try {
    if (window.top && window.self !== window.top) document.body.classList.add('is-embedded');
  } catch { /* 跨域读取 top 会抛，说明确实是嵌入态但无妨 */ }

  canvas.width = W;
  canvas.height = H;
  ED.canvas = canvas;

  ED_buildMats();
  ED_buildCats();
  ED_buildTools();
  ED_bindCanvas();
  ED_bindPanels();

  ED_initLightingUI();
  /* 不再默认塞场景：空态由 editor-start.js 接管 */
  ED_setBg(ED.bg);
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
  canvas.addEventListener('pointerdown', e => {
    if (e.button === 1 || ED.spaceHeld || ED.tool === 'pan') {
      panning = true;
      panStart = { x: e.clientX, y: e.clientY, ox: ED.view.ox, oy: ED.view.oy };
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
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
      const hit = ED_pickAt(w.x, w.y);
      if (hit) {
        if (e.shiftKey) ED_select(hit, { additive: true });
        else if (!ED_isSelected(hit)) ED_select(hit);
        if (ED_isSelected(hit)) {
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

  canvas.addEventListener('pointermove', e => {
    const w = toWorld(e);
    const g = TERRAIN.toGrid(w.x, w.y);
    document.getElementById('pos').textContent =
      `x=${w.x.toFixed(1)} y=${w.y.toFixed(1)} 格(${g.gx},${g.gy}) 高=${TERRAIN.heightAt(w.x, w.y).toFixed(2)}`;

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

  canvas.addEventListener('pointermove', e => {
    if (panning) {
      ED.view.ox = panStart.ox + (e.clientX - panStart.x);
      ED.view.oy = panStart.oy + (e.clientY - panStart.y);
      ED_applyView();
      return;
    }
  });

  const stopDrag = () => {
    if (ED.marquee) {
      const m = ED.marquee;
      const list = ED_marqueeObjects(m.x0, m.y0, m.x1, m.y1);
      if (list.length) ED_selectMany(list, m.additive);
      ED.marquee = null;
      ED.dirty = true;
    }
    ED_endDrag();
    ED.painting = false;
    ED.draggingObj = false;
    panning = false;
  };
  canvas.addEventListener('pointerup', stopDrag);
  canvas.addEventListener('pointerleave', () => {
    stopDrag();
    if (ED.ghost) { ED.ghost = null; ED.dirty = true; }
  });

  ED_bindKeys();

  canvas.addEventListener('dblclick', () => {
    ED.view = { scale: 1, ox: 0, oy: 0 };
    ED_applyView();
    studioStatus('视图已复位');
  });

  canvas.addEventListener('wheel', e => {
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

/* ---------------- 物体装配 ---------------- */

function ED_placeObject(kind, x, y) {
  const comp = KIT.get(kind);
  if (!comp) return;
  ED_snapshot('放置「' + comp.name + '」');
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
  /* 新物体放在最上层：order 取当前最大值 + 1 */
  if (ED.objects.some(o => o.order != null)) {
    ED_freezeOrder();
    obj.order = Math.max(...ED.objects.map(o => o.order || 0)) + 1;
  }
  ED.objects.push(obj);
  ED_collectLights();
  ED_select(obj);
  ED_refreshObjects();
  ED.dirty = true;
  studioStatus(`已放置「${comp.name}」`);
}

/* ---------------- 启动 ---------------- */

ED_init();
