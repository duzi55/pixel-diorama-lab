'use strict';
/* ------------------------------------------------------------------
 * 构件工坊 · 统一工作台
 *
 * 三栏：
 *   左  构件列表（数据来自 /api/kit：id/name/category/desc/code）
 *   中  动画预览（iframe = preview.html，持续旋转）+ 参数滑块 + 代码
 *   右  AI 编辑（修改当前构件 / 新建构件 → /api/generate → 预览 → /api/save）
 *
 * 「生成」和「场景」两个 tab 直接复用既有的 index.html / editor.html。
 * ------------------------------------------------------------------ */

const CAT_NAME = {
  tree: '树', plant: '草木', building: '建筑', structure: '结构',
  prop: '道具', vehicle: '载具', figure: '人物', animal: '动物', effect: '特效',
};
const CAT_ORDER = ['tree', 'plant', 'building', 'structure', 'prop', 'vehicle', 'figure', 'animal', 'effect', 'other'];

const $ = s => document.querySelector(s);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const state = {
  items: [],
  byId: new Map(),
  current: null,          // 当前构件 item
  params: {},             // 当前参数值
  paramDefs: {},          // 参数定义（来自 preview-ok）
  aiMode: 'edit',
  aiComponent: null,      // AI 返回的构造结果 { id, name, category, desc, code }
  code: '',               // 当前正在预览/编辑的构件代码（AI 结果或属性补丁都写这里）
  meta: null,             // { name, id, category, desc, collision }
  refImages: [],          // 参考图 dataURL（最多 3 张，随 /api/generate 一起发送）
  ready: false,           // 预览 iframe 是否就绪
  behaviors: [],          // 当前实例已挂的行为（来自 preview 的 behavior-info）
  allowedBehaviors: [],   // 构件允许挂的行为定义
};

const pv = $('#pv');

/* ---------------- 启动 ---------------- */

(async function init() {
  try {
    const res = await fetch('/api/kit');
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || '读取构件列表失败');
    state.items = data.items;
    for (const it of state.items) state.byId.set(it.id, it);
    renderList();
    setAiMode('edit');
    setStatus(`${state.items.length} 个构件`);
    /* 支持 catalog.html 的深链：app.html?select=cone-mast */
    const want = new URLSearchParams(location.search).get('select');
    if (state.items.length) select(state.byId.get(want) || state.items[0]);
  } catch (e) {
    setStatus('无法连接 Studio 服务：' + e.message);
  }
})();

function setStatus(t) { $('#status').textContent = t; }

/* ---------------- 左侧列表 ---------------- */

function renderList() {
  const box = $('#list');
  box.innerHTML = '';
  const groups = {};
  for (const it of state.items) (groups[it.category] || (groups[it.category] = [])).push(it);

  for (const cat of CAT_ORDER) {
    const list = groups[cat];
    if (!list || !list.length) continue;
    box.appendChild(el('div', 'cat-title', `${CAT_NAME[cat] || cat}（${list.length}）`));
    for (const it of list) {
      const row = el('div', 'item');
      row.dataset.id = it.id;
      row.dataset.search = (it.id + ' ' + it.name + ' ' + cat).toLowerCase();
      row.appendChild(el('span', 'dot'));
      row.appendChild(el('span', 'nm', it.name));
      row.appendChild(el('code', '', it.id));
      row.addEventListener('click', () => select(it));
      box.appendChild(row);
    }
  }
}

$('#search').addEventListener('input', () => {
  const q = $('#search').value.trim().toLowerCase();
  for (const row of document.querySelectorAll('.item')) {
    row.classList.toggle('hidden', q !== '' && !row.dataset.search.includes(q));
  }
});

/* ---------------- 选中构件 ---------------- */

function select(item) {
  state.current = item;
  state.params = {};
  state.behaviors = [];
  state.allowedBehaviors = [];
  if (window.BehaviorPanel) BehaviorPanel.render(state);
  /* 参考图属于"这一次生成"，切构件即清空 */
  state.refImages = [];
  renderThumbs();
  state.paramDefs = {};
  state.aiComponent = null;
  $('#ai-code').value = '';
  $('#ai-metaline').textContent = '';

  for (const row of document.querySelectorAll('.item')) {
    row.classList.toggle('on', row.dataset.id === item.id);
  }
  $('#cur-name').textContent = item.name;
  $('#cur-desc').textContent = item.desc || '（无描述）';
  $('#cur-id').textContent = item.id;
  $('#cur-cat').textContent = CAT_NAME[item.category] || item.category;
  state.code = item.code;
  state.meta = parseMeta(item.code, item);
  if (window.histSetComponent) histSetComponent(item.id);
  if (window.chatSetComponent) chatSetComponent(item.id);   // 每个构件各一份 AI 对话
  fillProps(state.meta);
  $('#code').textContent = item.code;
  $('#params').innerHTML = '<div class="param"><label>预览加载中…</label></div>';

  sendCode(item);
  if (state.aiMode === 'new') setAiMode('edit');
}

/* ---------------- 左侧构件列表折叠 ---------------- */

const SIDEBAR_KEY = 'studio-sidebar-collapsed';

function setSidebar(collapsed) {
  const ws = $('#view-kit');
  if (ws) ws.classList.toggle('list-collapsed', collapsed);
  $('#btn-sidebar').classList.toggle('on', !collapsed);
  try { localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0'); } catch { /* 隐私模式 */ }
  /* 舞台宽度变了，重新取景 */
  setTimeout(() => pv.contentWindow.postMessage({ type: 'fit' }, '*'), 220);
}

$('#btn-sidebar').addEventListener('click', () => {
  setSidebar(!$('#view-kit').classList.contains('list-collapsed'));
});
try { setSidebar(localStorage.getItem(SIDEBAR_KEY) === '1'); } catch { /* ignore */ }

/* ---------------- 预览 iframe 消息 ---------------- */

window.addEventListener('message', e => {
  if (e.source !== pv.contentWindow) return;
  const msg = e.data || {};
  if (msg.type === 'preview-ok') {
    state.ready = true;
    state.paramDefs = msg.params || {};
    if (!Object.keys(state.params).length) {
      for (const [k, p] of Object.entries(state.paramDefs)) state.params[k] = p.def;
    }
    buildParams();
    $('#params').classList.remove('hidden');
  } else if (msg.type === 'bbox') {
    /* 沙箱量出构件包围盒 → 自动取景 */
    if (msg.W === PV_BASE_W) fitView(msg.bbox);
  } else if (msg.type === 'behavior-info') {
    /* 沙箱报告当前实例挂了哪些行为、构件允许哪些行为 */
    state.behaviors = msg.behaviors || [];
    state.allowedBehaviors = msg.allowed || [];
    if (window.BehaviorPanel) BehaviorPanel.render(state);
  } else if (msg.type === 'rot-info') {
    /* 自动旋转中：旋转条跟着走（0~720° 两圈） */
    if (pvSpin.checked) {
      const deg = Math.round(msg.deg);
      pvRot.value = String(deg);
      pvRotVal.textContent = deg + '°';
    }
  } else if (msg.type === 'preview-error') {
    $('#params').innerHTML = '';
    const warn = el('div', 'param');
    warn.innerHTML = '<label style="color:#c0392b">预览失败：' + escapeHtml(msg.error) + '</label>';
    $('#params').appendChild(warn);
  }
});

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/* iframe 加载完成后补发当前构件（init 的 fetch 可能比 iframe 快，
   早发的 postMessage 会丢） */
pv.addEventListener('load', () => {
  sendView();
  /* 沙箱默认静止，这里按复选框状态同步一次（否则页面一进来就在转） */
  pv.contentWindow.postMessage({ type: 'spin', on: pvSpin.checked }, '*');
  if (state.current) sendCode(state.current);
});

function sendCode(item) {
  const code = (item && item.code) || state.code;
  state.code = code;
  const id = (item && item.id) || (state.meta && state.meta.id);
  pv.contentWindow.postMessage({ type: 'code', code, id, params: {} }, '*');
  pv.contentWindow.postMessage({ type: 'fit' }, '*');   // 让构件自动取景
  pv.contentWindow.postMessage({ type: 'box', on: $('#pv-box').checked }, '*');
  sendRot3();   // 切换构件后保持 X/Y 倾角
}

/* ---------------- 预览环境控制 ---------------- */
/* 自动旋转 / 手动旋转条 / 背景 / 光源开关与色系 */

const pvSpin = $('#pv-spin');
const pvRot = $('#pv-rot');
const pvRotVal = $('#pv-rot-val');

pvSpin.addEventListener('change', () => {
  pv.contentWindow.postMessage({ type: 'spin', on: pvSpin.checked }, '*');
  pvRot.disabled = pvSpin.checked;
});
pvRot.disabled = pvSpin.checked;

pvRot.addEventListener('input', () => {
  const deg = Number(pvRot.value);
  pvRotVal.textContent = deg + '°';
  if (pvSpin.checked) { pvSpin.checked = false; pvRot.disabled = false; }
  pv.contentWindow.postMessage({ type: 'spin', on: false }, '*');
  pv.contentWindow.postMessage({ type: 'rot', rot: deg * Math.PI / 180 }, '*');
});

/* 三轴旋转：X = 俯仰、Y = 翻滚，与 Z（上面的旋转条）组合 */
const pvRotX = $('#pv-rotx'), pvRotY = $('#pv-roty');
function sendRot3() {
  pv.contentWindow.postMessage({
    type: 'rot3',
    x: Number(pvRotX.value) * Math.PI / 180,
    y: Number(pvRotY.value) * Math.PI / 180,
  }, '*');
}
pvRotX.addEventListener('input', sendRot3);
pvRotY.addEventListener('input', sendRot3);
$('#pv-rot-reset').addEventListener('click', () => {
  pvRotX.value = '0';
  pvRotY.value = '0';
  sendRot3();
});


$('#pv-bg').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  for (const b of document.querySelectorAll('#pv-bg button')) b.classList.toggle('on', b === btn);
  pv.contentWindow.postMessage({ type: 'bg', tone: btn.dataset.tone }, '*');
});

$('#pv-box').addEventListener('change', () => {
  pv.contentWindow.postMessage({ type: 'box', on: $('#pv-box').checked }, '*');
});
$('#pv-light').addEventListener('change', () => {
  pv.contentWindow.postMessage({ type: 'light', on: $('#pv-light').checked }, '*');
});
$('#pv-tone').addEventListener('change', () => {
  pv.contentWindow.postMessage({ type: 'light', tone: $('#pv-tone').value }, '*');
});

/* 悬停暂停旋转（方便观察静态形态） */
/* 悬停临时停转；移出时**按复选框状态**恢复 —— 无条件恢复会让
   "取消勾选自动旋转"失效（鼠标一移开又转起来） */
pv.addEventListener('mouseenter', () => pv.contentWindow.postMessage({ type: 'spin', on: false }, '*'));
pv.addEventListener('mouseleave', () => pv.contentWindow.postMessage({ type: 'spin', on: pvSpin.checked }, '*'));

/* ---------------- 预览舞台：取景 / 拖拽平移 / 滚轮缩放 ----------------
 *
 * 交互模型（与图片查看器一致）：
 *   · 画布在 iframe 内绝对居中，固定 520×560（世界缩放 S 不变，模型 scale 恒为 1）
 *   · 视图 = { z, px, py }：z 是画布 CSS 缩放，px/py 是平移像素
 *   · 「适应」= 沙箱量出构件包围盒 → 等比缩放到 ~86% 并把包围盒中心移到视口中心
 *   · 拖拽改 px/py，滚轮以指针为中心缩放
 *   ★ 不缩放模型本身：逐像素绘制的构件坐标被拉开会碎成筛网状（"透明"根因）
 * ------------------------------------------------------------------ */

const PV_BASE_W = 520, PV_BASE_H = 560;
const ZOOM_MIN = .25, ZOOM_MAX = 10;
const view = { z: 1, px: 0, py: 0 };

const pvWrap = document.getElementById('pv-wrap');
const pvShield = document.getElementById('pv-shield');

function sendView() {
  view.z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, view.z));
  pv.contentWindow.postMessage({ type: 'view', z: view.z, px: view.px, py: view.py }, '*');
  $('#pv-zoom-val').textContent = Math.round(view.z * 100) + '%';
}

/* 舞台自适应：画布铺满预览区 */
function fitStage() {
  const w = Math.max(120, pvWrap.clientWidth - 8);
  const h = Math.max(120, pvWrap.clientHeight - 8);
  view.z = Math.min(w / PV_BASE_W, h / PV_BASE_H);
  view.px = 0;
  view.py = 0;
  sendView();
}

/* 按构件包围盒取景：等比缩放到 ~86%，包围盒中心对准视口中心 */
function fitView(bbox) {
  if (!bbox) { fitStage(); return; }
  const tw = bbox.maxX - bbox.minX + 1, th = bbox.maxY - bbox.minY + 1;
  if (tw < 2 || th < 2) { fitStage(); return; }
  const w = Math.max(120, pvWrap.clientWidth - 16);
  const h = Math.max(120, pvWrap.clientHeight - 16);
  const z = Math.max(ZOOM_MIN, Math.min(4, Math.min(w * .86 / tw, h * .86 / th)));   // 自动取景封顶 4×
  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;
  view.z = z;
  view.px = -(cx - PV_BASE_W / 2) * z;
  view.py = -(cy - PV_BASE_H / 2) * z;
  sendView();
}

/* 以视口内某点为中心缩放（默认视口中心） */
function zoomAt(f, clientX, clientY) {
  const r = pvWrap.getBoundingClientRect();
  const mx = (clientX == null ? r.left + r.width / 2 : clientX) - r.left - r.width / 2;
  const my = (clientY == null ? r.top + r.height / 2 : clientY) - r.top - r.height / 2;
  const nz = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, view.z * f));
  const k = nz / view.z;
  view.px = mx - (mx - view.px) * k;
  view.py = my - (my - view.py) * k;
  view.z = nz;
  sendView();
}

$('#pv-zoom-in').addEventListener('click', () => zoomAt(1.25));
$('#pv-zoom-out').addEventListener('click', () => zoomAt(1 / 1.25));
$('#pv-zoom-fit').addEventListener('click', () => pv.contentWindow.postMessage({ type: 'fit' }, '*'));
addEventListener('resize', () => pv.contentWindow.postMessage({ type: 'fit' }, '*'));

pvShield.addEventListener('wheel', e => {
  e.preventDefault();
  zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY);
}, { passive: false });

let pvDrag = null;
pvShield.addEventListener('pointerdown', e => {
  pvDrag = { x: e.clientX, y: e.clientY, px: view.px, py: view.py, moved: false };
  pvWrap.classList.add('dragging');
  pvShield.setPointerCapture(e.pointerId);
});
pvShield.addEventListener('pointermove', e => {
  if (!pvDrag) return;
  if (Math.hypot(e.clientX - pvDrag.x, e.clientY - pvDrag.y) > 4) pvDrag.moved = true;
  view.px = pvDrag.px + (e.clientX - pvDrag.x);
  view.py = pvDrag.py + (e.clientY - pvDrag.y);
  sendView();
});
['pointerup', 'pointercancel'].forEach(ev => pvShield.addEventListener(ev, e => {
  const wasDrag = pvDrag && pvDrag.moved;
  pvDrag = null;
  pvWrap.classList.remove('dragging');
  /* 没拖动 = 点击：转发给沙箱，触发构件的交互行为（砍树、招手…） */
  if (ev === 'pointerup' && !wasDrag) {
    const p = pvPointToCanvas(e.clientX, e.clientY);
    pv.contentWindow.postMessage({ type: 'click', sx: p.sx, sy: p.sy }, '*');
  }
}));

/* 父页坐标 → 沙箱画布像素坐标（与 PV_applyView 的 transform 互逆） */
function pvPointToCanvas(clientX, clientY) {
  const r = pvWrap.getBoundingClientRect();
  const mx = clientX - r.left, my = clientY - r.top;
  const left = r.width / 2 + view.px - PV_BASE_W * view.z / 2;
  const top = r.height / 2 + view.py - PV_BASE_H * view.z / 2;
  return { sx: (mx - left) / view.z, sy: (my - top) / view.z };
}

/* 代码块收起/展开 */
$('#btn-code-toggle').addEventListener('click', () => {
  const blk = $('#code-block');
  blk.classList.toggle('collapsed');
  $('#btn-code-toggle').textContent = blk.classList.contains('collapsed') ? '展开' : '收起';
});

/* 右侧标签页 */
$('#rtabs').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  for (const b of document.querySelectorAll('#rtabs button')) b.classList.toggle('on', b === btn);
  for (const p of document.querySelectorAll('.rpanel')) {
    p.classList.toggle('on', p.dataset.panel === btn.dataset.tab);
  }
});

/* ---------------- 参数滑块 ---------------- *//* ---------------- 参数滑块 ---------------- */

function buildParams() {
  const box = $('#params');
  box.innerHTML = '';
  const keys = Object.keys(state.paramDefs);
  if (!keys.length) { box.innerHTML = '<div class="param"><label>（无参数）</label></div>'; return; }
  for (const key of keys) {
    const p = state.paramDefs[key];
    const row = el('div', 'param');
    /* 中英对照：height · 树高 */
    const cn = (p.desc || '').replace(/[（(].*?[)）]/g, '').trim();
    const lab = el('label', '', cn && cn !== key ? `${key} · ${cn}` : key);
    lab.title = `${key}${p.desc ? ' · ' + p.desc : ''}`;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = p.min; input.max = p.max; input.step = p.step;
    input.value = state.params[key];
    const out = el('output', '', fmt(p.def, p.step));
    input.addEventListener('input', () => {
      state.params[key] = parseFloat(input.value);
      out.textContent = fmt(input.value, p.step);
      pv.contentWindow.postMessage({ type: 'params', params: state.params }, '*');
    });
    row.appendChild(lab); row.appendChild(input); row.appendChild(out);
    box.appendChild(row);
  }
}

function fmt(v, step) { return (+v).toFixed(step >= 1 ? 0 : 2); }

$('#btn-reset').addEventListener('click', () => {
  if (!state.paramDefs) return;
  for (const [k, p] of Object.entries(state.paramDefs)) state.params[k] = p.def;
  buildParams();
  pv.contentWindow.postMessage({ type: 'params', params: state.params }, '*');
});

$('#btn-copy').addEventListener('click', async () => {
  const code = state.aiComponent ? $('#ai-code').value : $('#code').textContent;
  try { await navigator.clipboard.writeText(code); setStatus('代码已复制'); }
  catch { setStatus('复制失败（浏览器权限）'); }
});

/* ---------------- Tab 切换（hash 同步：#gen / #scene） ---------------- */

function switchView(view) {
  for (const b of document.querySelectorAll('#tabs button')) {
    b.classList.toggle('on', b.dataset.view === view);
  }
  $('#view-kit').classList.toggle('on', view === 'kit');
  $('#view-scene').classList.toggle('on', view === 'scene');
  if (location.hash !== (view === 'kit' ? '' : '#' + view)) {
    location.hash = view === 'kit' ? '' : view;
  }
}

$('#tabs').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (btn) switchView(btn.dataset.view);
});

addEventListener('hashchange', () => {
  const v = location.hash.replace('#', '') || 'kit';
  if (['kit', 'scene'].includes(v)) switchView(v);
});

const initialView = location.hash.replace('#', '');
if (initialView === 'scene') switchView(initialView);
