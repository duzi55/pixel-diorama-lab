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
  pv.contentWindow.postMessage({ type: 'code', code: item.code, id: item.id, params: {} }, '*');
  pv.contentWindow.postMessage({ type: 'scale', scale: 2.1 }, '*');
}

/* 悬停暂停旋转（方便观察静态形态） */
pv.addEventListener('mouseenter', () => pv.contentWindow.postMessage({ type: 'spin', on: false }, '*'));
pv.addEventListener('mouseleave', () => pv.contentWindow.postMessage({ type: 'spin', on: true }, '*'));

/* ---------------- 参数滑块 ---------------- */

function buildParams() {
  const box = $('#params');
  box.innerHTML = '';
  const keys = Object.keys(state.paramDefs);
  if (!keys.length) { box.innerHTML = '<div class="param"><label>（无参数）</label></div>'; return; }
  for (const key of keys) {
    const p = state.paramDefs[key];
    const row = el('div', 'param');
    const lab = el('label', '', key);
    lab.title = p.desc || key;
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

/* ---------------- AI 编辑 ---------------- */

$('#ai-mode').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (btn) setAiMode(btn.dataset.mode);
});

function setAiMode(mode) {
  state.aiMode = mode;
  for (const b of document.querySelectorAll('#ai-mode button')) {
    b.classList.toggle('on', b.dataset.mode === mode);
  }
  $('#ai-tip').textContent = mode === 'edit'
    ? '说明你想怎么改这个构件，AI 会按项目规范重写代码（id 保持不变）。'
    : '描述一个全新的构件，AI 会按 docs/kit 规范生成并注册。';
  $('#btn-ai').textContent = mode === 'edit' ? '让 AI 修改' : '让 AI 生成';
}

$('#btn-ai').addEventListener('click', runAi);

async function runAi() {
  const instruction = $('#ai-prompt').value.trim();
  if (!instruction) { $('#ai-status').textContent = '先写一句需求'; return; }
  if (state.aiMode === 'edit' && !state.current) return;

  const btn = $('#btn-ai');
  btn.disabled = true;
  $('#ai-status').textContent = 'AI 生成中…（可能需要 1~3 分钟）';

  let prompt;
  let category = '';
  if (state.aiMode === 'edit') {
    const cur = state.current;
    category = cur.category;
    const code = state.aiComponent ? $('#ai-code').value : cur.code;
    prompt = `请**修改**现有构件「${cur.name}」（id: ${cur.id}，分类 ${cur.category}）。\n`
           + `修改要求：${instruction}\n\n`
           + `现有代码：\n\`\`\`js\n${code}\n\`\`\`\n\n`
           + `请返回修改后的**完整**构件（id 保持 "${cur.id}" 不变，仍按 KIT.register 规范）。`;
  } else {
    prompt = instruction;
  }

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt, category: category || undefined }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || '生成失败');
    const c = data.component;
    state.aiComponent = c;
    $('#ai-code').value = c.code || '';
    $('#ai-metaline').textContent = `${c.name} · ${c.id} · ${CAT_NAME[c.category] || c.category}`;
    $('#ai-status').textContent = '生成完成，可先「应用预览」再保存';
    if (state.aiMode === 'new') {
      $('#cur-name').textContent = c.name;
      $('#cur-desc').textContent = c.desc || '（AI 新构件，未保存）';
      $('#cur-id').textContent = c.id;
      $('#cur-cat').textContent = CAT_NAME[c.category] || c.category;
      $('#code').textContent = c.code;
    }
  } catch (e) {
    $('#ai-status').textContent = '失败：' + e.message;
  } finally {
    btn.disabled = false;
  }
}

$('#btn-apply').addEventListener('click', () => {
  const code = $('#ai-code').value.trim();
  if (!code) return;
  const id = state.aiComponent ? state.aiComponent.id : (state.current && state.current.id);
  state.params = {};
  pv.contentWindow.postMessage({ type: 'code', code, id, params: {} }, '*');
  $('#ai-status').textContent = '已推送到预览';
});

$('#btn-save').addEventListener('click', async () => {
  const code = $('#ai-code').value.trim();
  if (!code || !state.aiComponent) { $('#ai-status').textContent = '还没有可保存的 AI 结果'; return; }
  const btn = $('#btn-save');
  btn.disabled = true;
  $('#ai-status').textContent = '保存中…';
  try {
    const c = Object.assign({}, state.aiComponent, { code });
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ component: c, overwrite: true }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || '保存失败');
    $('#ai-status').textContent = `已保存（${data.files.length} 个文件）`;
    await refreshKit();
    select(state.byId.get(c.id) || state.current);
  } catch (e) {
    $('#ai-status').textContent = '保存失败：' + e.message;
  } finally {
    btn.disabled = false;
  }
});

async function refreshKit() {
  const res = await fetch('/api/kit');
  const data = await res.json();
  if (!data.ok) return;
  state.items = data.items;
  state.byId = new Map(state.items.map(i => [i.id, i]));
  renderList();
  setStatus(`${state.items.length} 个构件`);
}

/* ---------------- Tab 切换（hash 同步：#gen / #scene） ---------------- */

function switchView(view) {
  for (const b of document.querySelectorAll('#tabs button')) {
    b.classList.toggle('on', b.dataset.view === view);
  }
  $('#view-kit').classList.toggle('on', view === 'kit');
  $('#view-gen').classList.toggle('on', view === 'gen');
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
  if (['kit', 'gen', 'scene'].includes(v)) switchView(v);
});

const initialView = location.hash.replace('#', '');
if (['gen', 'scene'].includes(initialView)) switchView(initialView);
