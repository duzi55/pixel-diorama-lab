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
  tool: 'select',
  mat: 'grass',
  autoBlend: false,      /* 笔刷画到边缘格时自动换过渡材质 */
  blendMat: 'soil',
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
  ED_bindBrushBlend();
  const growBtn = document.getElementById('btn-expand');
  if (growBtn) growBtn.addEventListener('click', () => ED_expandCanvas(128, 128));
  const zoomEl = document.getElementById('zoom-pct');
  if (zoomEl) zoomEl.addEventListener('click', () => {
    ED.view = { scale: 1, ox: 0, oy: 0 };
    ED_applyView();
    studioStatus('视图复位');
  });
  const sizeEl = document.getElementById('canvas-size');
  if (sizeEl) sizeEl.textContent = `${W} × ${H}`;
  ED_bindPanels();
  ED_bindPanelTabs();
  ED_initAutosave();

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
      ED_fit();   // 面板宽度变了，画布重新适配
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
    b.dataset.mat = id;
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

/** 吸取材质后刷新按钮选中态 */
function ED_refreshMatButtons() {
  const box = document.getElementById('mats');
  if (!box) return;
  for (const b of box.children) {
    if (b.dataset && b.dataset.mat) b.classList.toggle('on', b.dataset.mat === ED.mat);
  }
}

function ED_bindBrushBlend() {
  const chk = document.getElementById('auto-blend');
  const sel = document.getElementById('blend-mat');
  if (!chk || !sel) return;
  const mats = Object.entries(TERRAIN.mats || {});
  sel.innerHTML = mats.map(([id, m]) => `<option value="${id}">${ED_esc(m.name || id)}</option>`).join('');
  sel.value = ED.blendMat;
  chk.checked = ED.autoBlend;
  chk.addEventListener('change', () => { ED.autoBlend = chk.checked; });
  sel.addEventListener('change', () => { ED.blendMat = sel.value; });
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
      ED_snapshot('预设：山坡村落');
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
      ED_snapshot('预设：平坦草岛');
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
