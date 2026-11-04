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

const CAT_NAME = { tree: '树', building: '建筑', plant: '草木', prop: '道具', figure: '人物' };
const CAT_ORDER = ['tree', 'building', 'plant', 'prop', 'figure', 'other'];

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
    if (state.items.length) select(state.items[0]);
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
  fillProps(state.meta);
  $('#code').textContent = item.code;
  $('#params').innerHTML = '<div class="param"><label>预览加载中…</label></div>';

  sendCode(item);
  if (state.aiMode === 'new') setAiMode('edit');
}

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
  if (state.current) sendCode(state.current);
});

function sendCode(item) {
  const code = (item && item.code) || state.code;
  state.code = code;
  const id = (item && item.id) || (state.meta && state.meta.id);
  pv.contentWindow.postMessage({ type: 'code', code, id, params: {} }, '*');
  pv.contentWindow.postMessage({ type: 'scale', scale: 2.1 }, '*');
  pv.contentWindow.postMessage({ type: 'box', on: $('#pv-box').checked }, '*');
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

/* ---------------- 画布缩放（预览视图，不改网页） ---------------- */

const ZOOM_STEPS = [.5, .75, 1, 1.5, 2, 3, 4];
state.zoom = 1;

function applyZoom(k) {
  const z = Math.max(ZOOM_STEPS[0], Math.min(ZOOM_STEPS[ZOOM_STEPS.length - 1], k));
  state.zoom = z;
  const pvEl = $('#pv');
  pvEl.style.width = Math.round(420 * z) + 'px';
  pvEl.style.height = Math.round(340 * z) + 'px';
  $('#pv-zoom-val').textContent = Math.round(z * 100) + '%';
  pv.contentWindow.postMessage({ type: 'zoom', k: z }, '*');
  /* 缩放后把视口对准画布中心（模型大致在中心），而不是停在左上角 */
  const wrap = document.querySelector('.preview-wrap');
  requestAnimationFrame(() => {
    wrap.scrollLeft = Math.max(0, (wrap.scrollWidth - wrap.clientWidth) / 2);
    wrap.scrollTop = Math.max(0, (wrap.scrollHeight - wrap.clientHeight) / 2);
  });
}

function zoomStep(dir) {
  const i = ZOOM_STEPS.findIndex(v => Math.abs(v - state.zoom) < .01);
  const next = ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, (i < 0 ? 2 : i) + dir))];
  applyZoom(next);
}

$('#pv-zoom-in').addEventListener('click', () => zoomStep(1));
$('#pv-zoom-out').addEventListener('click', () => zoomStep(-1));
$('#pv-zoom-fit').addEventListener('click', () => applyZoom(1));

/* 滚轮缩放（在预览框内直接滚，不改网页缩放） */
document.querySelector('.preview-wrap').addEventListener('wheel', e => {
  e.preventDefault();
  zoomStep(e.deltaY < 0 ? 1 : -1);
}, { passive: false });

/* iframe 重载后补发当前缩放 */
pv.addEventListener('load', () => {
  pv.contentWindow.postMessage({ type: 'zoom', k: state.zoom }, '*');
});

/* ---------------- 参数滑块 ---------------- */

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
