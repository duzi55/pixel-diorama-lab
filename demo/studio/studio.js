'use strict';
/* ------------------------------------------------------------------
 * Studio 共用工具
 * ------------------------------------------------------------------ */

/** 状态栏 */
function studioStatus(msg, kind) {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = msg;
  el.className = 'bar-note' + (kind ? ' ' + kind : '');
}

/** POST JSON，返回解析后的 JSON；失败抛 Error */
async function studioPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error(`服务返回的不是 JSON（HTTP ${res.status}）`);
  }
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

/** 转义 HTML，用于把 AI 输出安全地放进 DOM */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* 构件分类中文标签（gen.js 与下方列表共用） */
const CAT_LABELS = {
  tree: '树', plant: '草木', building: '建筑', prop: '道具', figure: '人物',
};

/* ================= 现有构件库列表（生成页用，从 gen.js 拆出） ================= */

/* ---------------- 现有构件库列表 ---------------- */

async function loadKitLibrary(selectId) {
  try {
    const res = await fetch('/api/kit');
    const data = await res.json();
    if (!data.ok) return;
    GEN.kitItems = data.items || [];
    el('kit-count').textContent = `(${GEN.kitItems.length})`;
    renderKitCats();
    renderKitList(selectId);
    if (!GEN.component && GEN.kitItems.length) {
      const def = GEN.kitItems.find(x => x.id === 'stone-mill') || GEN.kitItems[0];
      sendToPreview({ ...def });
    }
  } catch (e) {
    console.error('[gen] 加载构件库失败', e);
  }
}

function renderKitCats() {
  const box = el('kit-cats');
  if (!box) return;
  box.innerHTML = '';
  const cats = ['', 'tree', 'plant', 'building', 'prop'];
  for (const c of cats) {
    const b = document.createElement('button');
    b.className = 'pill' + (GEN.curCat === c ? ' on' : '');
    b.textContent = c ? (CAT_LABELS[c] || c) : '全部';
    b.addEventListener('click', () => {
      GEN.curCat = c;
      renderKitCats();
      renderKitList(GEN.component ? GEN.component.id : null);
    });
    box.appendChild(b);
  }
}

function renderKitList(activeId) {
  const box = el('kit-list');
  if (!box) return;
  box.innerHTML = '';
  const items = GEN.kitItems.filter(x => !GEN.curCat || x.category === GEN.curCat);
  for (const it of items) {
    const row = document.createElement('div');
    row.className = 'item' + (activeId === it.id ? ' on' : '');
    row.innerHTML = `<span>${esc(it.name)}</span><span class="cat">${esc(it.id)}</span>`;
    row.title = it.desc || it.id;
    row.addEventListener('click', () => {
      for (const ch of box.children) ch.classList.remove('on');
      row.classList.add('on');
      sendToPreview({ ...it });
    });
    box.appendChild(row);
  }
}

