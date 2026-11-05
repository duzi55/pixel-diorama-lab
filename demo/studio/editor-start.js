'use strict';
/* ------------------------------------------------------------------
 * 编辑器空态与「一句话建场景」（editor-start.js）
 *
 * 进入编辑器不再默认塞一个村落，而是给一个起点：
 *   输入一句话 → AI 设计地形 + 挑现有构件 + 列 missing
 *   或者：从图片还原 / 载入已保存 / 空白开始
 *
 * 生成走 /api/ai/jobs（kind: compose），任务化，关页面不丢。
 * ------------------------------------------------------------------ */

const START = { running: false };
const COMPOSE_JOB_KEY = 'pd_job_compose';

const startEl = id => document.getElementById(id);

function ED_showEmpty() {
  const box = startEl('ed-empty');
  if (!box) return;
  box.hidden = false;
  const dock = startEl('ed-dock');
  if (dock) dock.hidden = true;
  if (document.body.classList) document.body.classList.add('ed-empty-mode');
  startLoadList();

  /* 有 24 小时内的自动保存 → 显示恢复按钮 */
  const resume = startEl('ed-start-resume');
  if (resume) {
    const draft = (typeof ED_readAutosave === 'function') ? ED_readAutosave() : null;
    if (draft) {
      resume.hidden = false;
      resume.textContent = `恢复 ${new Date(draft.at).toLocaleTimeString()} 的自动保存`;
      resume.onclick = () => {
        ED_applyScene(draft.scene);
        ED_hideEmpty();
        studioStatus('已恢复自动保存', 'ok');
      };
    } else {
      resume.hidden = true;
    }
  }

  const input = startEl('ed-start-input');
  if (input) setTimeout(() => input.focus(), 80);
}

function ED_hideEmpty() {
  const box = startEl('ed-empty');
  if (box) box.hidden = true;
  const dock = startEl('ed-dock');
  if (dock) dock.hidden = false;
  if (document.body.classList) document.body.classList.remove('ed-empty-mode');
}

function startSetHint(msg, kind) {
  const hint = startEl('ed-start-hint');
  if (!hint) return;
  hint.textContent = msg;
  hint.className = 'ed-empty-hint' + (kind ? ' ' + kind : '');
}

/* ---------------- 一句话建场景 ---------------- */

function startSaveRec(rec) {
  try { localStorage.setItem(COMPOSE_JOB_KEY, JSON.stringify(rec)); } catch { /* 隐私模式 */ }
}

async function startCompose() {
  if (START.running) return;
  const input = startEl('ed-start-input');
  const prompt = (input.value || '').trim();
  if (!prompt) {
    startSetHint('先描述一下你想要的场景', 'err');
    input.focus();
    return;
  }

  START.running = true;
  const btn = startEl('ed-start-go');
  btn.disabled = true;
  btn.textContent = '生成中…';
  startSetHint('正在提交…', 'busy');

  const requestId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2));
  startSaveRec({ v: 1, requestId, jobId: null, at: Date.now() });

  try {
    const res = await fetch('/api/ai/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'compose',
        dedupeKey: requestId,
        payload: { prompt, W, H, kit: reconKitList() },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    startSaveRec({ v: 1, requestId, jobId: data.jobId, at: Date.now() });
    startSetHint('任务在后台运行 —— 可以去做别的，回来结果还在', 'busy');
    studioStatus('AI 正在设计场景（可关闭页面）', 'busy');

    const result = await reconFollowJob(data.jobId, msg => startSetHint(msg, 'busy'));
    reconFinish(result);
    localStorage.removeItem(COMPOSE_JOB_KEY);
    ED_hideEmpty();
    startSetHint('按 Enter 生成 · 约 30~90 秒 · 任务在后台跑，关掉页面也不会丢');
    studioStatus('场景已生成，可以继续编辑或保存', 'ok');
  } catch (e) {
    startSetHint('生成失败：' + e.message, 'err');
    studioStatus('场景生成失败：' + e.message, 'err');
    localStorage.removeItem(COMPOSE_JOB_KEY);
  } finally {
    START.running = false;
    btn.disabled = false;
    btn.textContent = '生成';
  }
}

/** 页面加载时恢复未完成的一句话建场景任务 */
async function startResume() {
  let rec = null;
  try { rec = JSON.parse(localStorage.getItem(COMPOSE_JOB_KEY) || 'null'); } catch { rec = null; }
  if (!rec || (!rec.jobId && !rec.requestId)) return;
  if (Date.now() - (rec.at || 0) > 2 * 3600_000) { localStorage.removeItem(COMPOSE_JOB_KEY); return; }

  try {
    let s = null;
    if (rec.jobId) {
      const r = await fetch('/api/ai/jobs/' + encodeURIComponent(rec.jobId));
      if (r.status === 404) { localStorage.removeItem(COMPOSE_JOB_KEY); return; }
      s = await r.json();
    } else if (rec.requestId) {
      const r = await fetch('/api/ai/jobs?dedupeKey=' + encodeURIComponent(rec.requestId));
      if (r.status === 404) { localStorage.removeItem(COMPOSE_JOB_KEY); return; }
      const list = await r.json();
      s = list && list.jobs && list.jobs[0];
    }
    if (!s || !s.ok) { localStorage.removeItem(COMPOSE_JOB_KEY); return; }

    if (s.status === 'error') {
      startSetHint('上次生成失败：' + s.error, 'err');
      localStorage.removeItem(COMPOSE_JOB_KEY);
      return;
    }
    if (s.status === 'running') {
      START.running = true;
      startSetHint('恢复上次任务…（后台仍在运行）', 'busy');
      const result = await reconFollowJob(s.jobId, msg => startSetHint(msg, 'busy'));
      START.running = false;
      reconFinish(result);
      localStorage.removeItem(COMPOSE_JOB_KEY);
    } else if (s.status === 'done' && s.result) {
      reconFinish(s.result);
      localStorage.removeItem(COMPOSE_JOB_KEY);
      studioStatus('上次的场景已生成，结果已恢复', 'ok');
    }
  } catch {
    /* 网络抖动：保留记录 */
  }
}

/* ---------------- 载入已保存 ---------------- */

async function startLoadList() {
  const sel = startEl('ed-start-scenes');
  if (!sel) return;
  try {
    const data = await fetch('/api/scene').then(r => r.json());
    const list = (data.index && data.index.length)
      ? data.index
      : (data.scenes || []).map(n => ({ name: n }));
    sel.innerHTML = '<option value="">载入已保存…</option>';
    for (const s of list) {
      const o = document.createElement('option');
      o.value = s.name;
      o.textContent = s.title && s.title !== s.name ? `${s.title} (${s.name})` : s.name;
      sel.appendChild(o);
    }
  } catch { /* 列表拿不到不影响 */ }
}

/* ---------------- 初始化 ---------------- */

function startInit() {
  const input = startEl('ed-start-input');
  if (!input) return;

  startEl('ed-start-go').addEventListener('click', startCompose);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); startCompose(); }
  });

  startEl('ed-start-image').addEventListener('click', () => {
    const modal = document.getElementById('recon-modal');
    if (modal) modal.hidden = false;
  });

  startEl('ed-start-scenes').addEventListener('change', async e => {
    const name = e.target.value;
    if (!name) return;
    try {
      const data = await studioPost('/api/scene', { action: 'load', name });
      ED_applyScene(data.scene);
      ED_hideEmpty();
      studioStatus('已载入 ' + name, 'ok');
    } catch (err) {
      studioStatus('载入失败：' + err.message, 'err');
    }
    e.target.value = '';
  });

  startEl('ed-start-blank').addEventListener('click', () => {
    TERRAIN.clear();
    ED.objects = [];
    ED.selected = null;
    ED.nextId = 1;
    ED_refreshObjects();
    ED_refreshSel();
    ED_fit();
    ED.dirty = true;
    ED_hideEmpty();
    studioStatus('空白场景 —— 直接画地形，或从左侧放置构件');
  });

  /* 底部指令条：有场景后继续用一句话重建 */
  const dockInput = startEl('ed-dock-input');
  const dockGo = startEl('ed-dock-go');
  const dockSubmit = () => {
    const v = (dockInput.value || '').trim();
    if (!v) return;
    if (ED.objects.length && !confirm('这会重建整个场景，当前内容会被替换。继续？')) return;
    dockInput.value = '';
    ED_showEmpty();
    startEl('ed-start-input').value = v;
    startCompose();
  };
  if (dockGo) dockGo.addEventListener('click', dockSubmit);
  if (dockInput) {
    dockInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); dockSubmit(); }
    });
  }

  ED_showEmpty();
  startResume();
}

startInit();
