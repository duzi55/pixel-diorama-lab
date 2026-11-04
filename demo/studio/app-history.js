'use strict';
/* ------------------------------------------------------------------
 * 构件工坊 · 修改记录（可回退）
 *
 * 每次「属性应用 / 参数存默认 / AI 结果 / 应用 AI 代码」之前先存一份快照，
 * 列表里可一键还原到任一历史版本。按构件 id 存 localStorage，切构件自动切换。
 * ------------------------------------------------------------------ */

const HIST = {
  componentId: null,
  items: [],          // { t, label, code, meta }
  max: 30,
};

function histKey(id) { return 'studio-hist:' + id; }

/* 切构件：换一份历史 */
function histSetComponent(id) {
  HIST.componentId = id;
  HIST.items = [];
  try {
    const raw = localStorage.getItem(histKey(id));
    if (raw) HIST.items = JSON.parse(raw) || [];
  } catch { HIST.items = []; }
  histRender();
}

function histSave() {
  try {
    localStorage.setItem(histKey(HIST.componentId), JSON.stringify(HIST.items.slice(0, HIST.max)));
  } catch { /* 配额满了就只留内存 */ }
}

/* 在**修改之前**调用：把当前代码存一份快照 */
function histPush(label) {
  if (!state.code) return;
  HIST.items.unshift({
    t: Date.now(),
    label,
    code: state.code,
    meta: state.meta ? JSON.parse(JSON.stringify(state.meta)) : null,
  });
  HIST.items = HIST.items.slice(0, HIST.max);
  histSave();
  histRender();
}

function histRender() {
  const box = document.getElementById('hist');
  const cnt = document.getElementById('hist-count');
  if (!box) return;
  cnt.textContent = String(HIST.items.length);
  box.innerHTML = '';
  if (!HIST.items.length) {
    const e = document.createElement('div');
    e.className = 'hist-empty';
    e.textContent = '还没有修改。属性应用 / 参数存默认 / AI 修改 都会记在这里。';
    box.appendChild(e);
    return;
  }
  HIST.items.forEach((it, i) => {
    const row = document.createElement('div');
    row.className = 'hist-row';
    const t = document.createElement('time');
    const d = new Date(it.t);
    t.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
    const lbl = document.createElement('span');
    lbl.className = 'lbl';
    lbl.textContent = it.label;
    const btn = document.createElement('button');
    btn.textContent = '还原';
    btn.addEventListener('click', () => histRestore(i));
    row.appendChild(t); row.appendChild(lbl); row.appendChild(btn);
    box.appendChild(row);
  });
}

/* 还原到某条快照（还原本身也记一条，方便再跳回来） */
function histRestore(i) {
  const it = HIST.items[i];
  if (!it) return;
  histPush('还原到：' + it.label);
  state.code = it.code;
  if (it.meta) state.meta = JSON.parse(JSON.stringify(it.meta));
  const codeEl = document.getElementById('code');
  if (codeEl) codeEl.textContent = state.code;
  if (window.fillProps && state.meta) fillProps(state.meta);
  const n = document.getElementById('cur-name');
  if (n && state.meta) n.textContent = state.meta.name;
  const idEl = document.getElementById('cur-id');
  if (idEl && state.meta) idEl.textContent = state.meta.id;
  sendCode(null);
  setStatus('已还原到「' + it.label + '」');
}

window.HIST = HIST;
window.histPush = histPush;
window.histSetComponent = histSetComponent;
window.histRestore = histRestore;
