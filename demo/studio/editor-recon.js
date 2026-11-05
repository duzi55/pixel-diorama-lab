'use strict';
/* ------------------------------------------------------------------
 * 图片还原场景（editor-recon.js）
 *
 * 流程：
 *   粘贴/拖入/选择一张等距场景截图
 *     → 压缩到 1024px
 *     → POST /api/reconstruct（带当前构件库清单 + 画布尺寸）
 *     → AI 返回 { terrain, objects, missing }
 *     → 地形原语 + 物体（u/v 反投影成世界坐标）直接摆进编辑器
 *     → missing 逐项「生成并入库」（复用 /api/generate + /api/save）
 *
 * 还原结果就是普通编辑器场景：拖拽/缩放/旋转/碰撞体/保存全部可用。
 * ------------------------------------------------------------------ */

const RECON = {
  image: null,        /* 压缩后的 dataURL */
  running: false,
  result: null,
};

const RECON_MAX_EDGE = 1024;
const RECON_JOB_KEY = 'pd_job_recon';   /* localStorage：图片还原任务的 { requestId, jobId } */

const reconEl = id => document.getElementById(id);

/** 当前构件库精简清单（发给 AI 挑素材；图片还原与一句话建场景共用） */
function reconKitList() {
  return KIT.list().map(c => ({
    id: c.id,
    name: c.name,
    category: c.category,
    desc: c.desc,
    params: Object.fromEntries(
      Object.entries(c.params || {}).map(([k, p]) => [k, { def: p.def, max: p.max }])
    ),
  }));
}

/* ---------------- 图片处理 ---------------- */

function reconCompress(file) {
  return new Promise((resolve, reject) => {
    const rd = new FileReader();
    rd.onerror = () => reject(new Error('读取图片失败'));
    rd.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('不是有效的图片'));
      img.onload = () => {
        const k = Math.min(1, RECON_MAX_EDGE / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k));
        c.height = Math.max(1, Math.round(img.height * k));
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.src = rd.result;
    };
    rd.readAsDataURL(file);
  });
}

async function reconSetImage(file) {
  if (!file || !/^image\//.test(file.type || '')) return;
  try {
    RECON.image = await reconCompress(file);
    const pv = reconEl('recon-preview');
    pv.src = RECON.image;
    pv.hidden = false;
    reconEl('recon-drop-hint').hidden = true;
    reconEl('btn-recon-run').disabled = false;
    reconEl('btn-recon-run').textContent = '开始还原';
    reconEl('recon-result').innerHTML = '';
    reconEl('recon-progress').textContent = '图片已就绪，点「开始还原」';
  } catch (e) {
    studioStatus('图片读取失败：' + e.message, 'err');
  }
}

/* ---------------- 还原 ---------------- */

async function reconRun() {
  if (RECON.running || !RECON.image) return;
  RECON.running = true;

  const btn = reconEl('btn-recon-run');
  const prog = reconEl('recon-progress');
  btn.disabled = true;
  btn.textContent = '识别中…';
  prog.textContent = '正在提交任务…';
  reconEl('recon-result').innerHTML = '';

  /* 先落"提交意图"再发请求：响应丢了也能靠 dedupeKey 找回 */
  const requestId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2));
  const saveRec = jobId => localStorage.setItem(RECON_JOB_KEY, JSON.stringify({
    v: 1, requestId, jobId: jobId || null, at: Date.now(),
  }));
  saveRec(null);

  try {
    const kit = reconKitList();
    const res = await fetch('/api/ai/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'reconstruct',
        dedupeKey: requestId,
        payload: { images: [RECON.image], W, H, kit },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    saveRec(data.jobId);
    prog.textContent = '任务已在后台运行 —— 可以关闭页面，稍后回来接着看';
    studioStatus('AI 任务已提交（关闭页面也不会丢）', 'busy');

    const result = await reconFollowJob(data.jobId);
    reconFinish(result);
    localStorage.removeItem(RECON_JOB_KEY);
  } catch (e) {
    prog.textContent = '';
    studioStatus('还原失败：' + e.message, 'err');
    localStorage.removeItem(RECON_JOB_KEY);
  } finally {
    RECON.running = false;
    btn.disabled = false;
    btn.textContent = '重新识别';
  }
}

/** 轮询 job 直到结束；onProgress 缺省时写模态框 */
async function reconFollowJob(jobId, onProgress) {
  const prog = reconEl('recon-progress');
  for (;;) {
    const r = await fetch('/api/ai/jobs/' + encodeURIComponent(jobId));
    const s = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(s.error || '任务查询失败');
    if (s.progress && s.progress.message) {
      if (onProgress) onProgress(s.progress.message);
      else if (prog) prog.textContent = s.progress.message;
    }
    if (s.status === 'done') return s.result;
    if (s.status === 'error') throw new Error(s.error || '任务失败');
    await new Promise(res => setTimeout(res, 700));
  }
}

/** 结果 → 画布 + missing 列表 */
function reconFinish(result) {
  if (!result || !Array.isArray(result.objects)) throw new Error('任务结果为空');
  RECON.result = result;
  reconApply(result);
  const prog = reconEl('recon-progress');
  if (prog) {
    prog.textContent = `已还原 ${result.objects.length} 个物体` +
      (result.terrain && result.terrain.length ? `、${result.terrain.length} 段地形` : '');
  }
  reconRenderMissing(result.missing || []);
  if (typeof ED_hideEmpty === 'function') ED_hideEmpty();
  /* 记录由调用方清理（图片还原与一句话建场景各用自己的 key） */
}

/** 页面加载时恢复未完成的图片还原任务 */
async function reconResume() {
  let rec = null;
  try { rec = JSON.parse(localStorage.getItem(RECON_JOB_KEY) || 'null'); } catch { rec = null; }
  if (!rec || (!rec.jobId && !rec.requestId)) return;
  if (Date.now() - (rec.at || 0) > 2 * 3600_000) { localStorage.removeItem(RECON_JOB_KEY); return; }

  const prog = reconEl('recon-progress');
  try {
    /* 只有 jobId 丢了（响应没回来）时用 dedupeKey 找回 */
    let s = null;
    if (rec.jobId) {
      const r = await fetch('/api/ai/jobs/' + encodeURIComponent(rec.jobId));
      if (r.status === 404) { localStorage.removeItem(RECON_JOB_KEY); return; }   /* 服务重启/TTL：明确清掉 */
      s = await r.json();
    } else if (rec.requestId) {
      const r = await fetch('/api/ai/jobs?dedupeKey=' + encodeURIComponent(rec.requestId));
      if (r.status === 404) { localStorage.removeItem(RECON_JOB_KEY); return; }
      const list = await r.json();
      s = list && list.jobs && list.jobs[0];
    }

    if (!s || !s.ok) { localStorage.removeItem(RECON_JOB_KEY); return; }

    if (s.status === 'error') {
      studioStatus('上次的 AI 任务失败：' + s.error, 'err');
      localStorage.removeItem(RECON_JOB_KEY);
      return;
    }

    reconEl('recon-modal').hidden = false;
    if (s.status === 'running') {
      RECON.running = true;
      prog.textContent = '恢复上次任务…（后台仍在运行）';
      studioStatus('上次的 AI 任务仍在后台运行', 'busy');
      const result = await reconFollowJob(s.jobId, msg => { prog.textContent = msg; });
      RECON.running = false;
      reconFinish(result);
      localStorage.removeItem(RECON_JOB_KEY);
    } else if (s.status === 'done' && s.result) {
      reconFinish(s.result);
      localStorage.removeItem(RECON_JOB_KEY);
      studioStatus('上次的 AI 任务已完成，结果已应用', 'ok');
    }
  } catch {
    /* 网络抖动：保留记录，下次打开再试（不要丢掉还在跑的任务） */
  }
}

/** AI 结果 → 编辑器场景（u/v 反投影到世界坐标，z 取地形高度） */
function reconApply(res) {
  if (ED.baseMap) ED_setBaseMap(null);      /* 还原 = 离开底图模式 */

  if (reconEl('recon-terrain').checked && res.terrain && res.terrain.length &&
      typeof TERRAIN_SHAPES !== 'undefined') {
    TERRAIN.clear();
    TERRAIN_SHAPES.apply({ name: '图片还原', shapes: res.terrain });
  }

  ED.objects = [];
  ED.selected = null;
  ED.nextId = 1;

  for (const o of res.objects) {
    const comp = KIT.get(o.kind);
    if (!comp) continue;                    /* 服务端已过滤，双保险 */
    const g = unproject(o.u * W, o.v * H);
    const x = Math.round(g.x * 4) / 4, y = Math.round(g.y * 4) / 4;
    ED.objects.push({
      id: 'o' + (ED.nextId++),
      kind: o.kind,
      x, y,
      z: TERRAIN.heightAt(x, y),
      rot: o.rot || 0,
      scale: o.scale || 1,
      params: { ...KIT.defaults(o.kind), ...(o.params || {}) },
      seed: Math.floor(hash(ED.nextId * 17, 91) * 100000) + 1,
      collision: comp.collision ? { ...comp.collision } : null,
    });
  }

  ED_collectLights();
  ED_refreshObjects();
  ED_refreshSel();
  ED_fit();
  ED.dirty = true;
  if (typeof ED_hideEmpty === 'function') ED_hideEmpty();   /* 有内容就离开空态 */
}

/* ---------------- 缺失素材 ---------------- */

let MISSING_PICK = new Map();   /* missing 索引 → 用户选中的 kind */

/** 中英文 2-gram / 词：用于候选匹配 */
function reconBigrams(text) {
  const t = String(text || '').toLowerCase();
  const out = new Set();
  for (const seg of t.match(/[一-龥]+|[a-z0-9]{3,}/g) || []) {
    if (/^[一-龥]+$/.test(seg)) {
      for (let i = 0; i < seg.length - 1; i++) out.add(seg.slice(i, i + 2));
    } else out.add(seg);
  }
  return out;
}

/** 给一个 missing 项排候选：同分类 +8，关键词每命中 +2 */
function reconCandidates(m, limit) {
  const q = reconBigrams(m.name + ' ' + m.brief + ' ' + (m.reason || ''));
  return KIT.list()
    .map(c => {
      const hay = (c.id + ' ' + c.name + ' ' + (c.desc || '')).toLowerCase();
      let score = c.category === m.category ? 8 : 0;
      for (const g of q) if (hay.includes(g)) score += 2;
      return { comp: c, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit || 6)
    .map(x => x.comp);
}


function reconRenderMissing(list) {
  const box = reconEl('recon-result');
  MISSING_PICK = new Map();
  if (!list.length) {
    box.innerHTML = '<div class="hint">画面元素都在现有素材库里，没有缺的。</div>';
    return;
  }
  box.innerHTML = `<div class="hint" style="margin-bottom:4px">
    素材库缺 ${list.length} 项 —— 选一个现有素材放上去，或生成新素材：</div>`;

  list.forEach((m, i) => {
    const row = document.createElement('div');
    row.className = 'recon-missing';

    const head = document.createElement('div');
    head.className = 'recon-missing-head';
    head.innerHTML = `<b>${esc(m.name)}</b>
      <span class="why">${esc(m.category)} · ${esc(m.reason || m.brief || '')}</span>`;
    row.appendChild(head);

    /* 候选：同分类优先 + 关键词重合（纯前端，无依赖） */
    const cands = document.createElement('div');
    cands.className = 'recon-cands';
    for (const c of reconCandidates(m)) {
      const b = document.createElement('button');
      b.className = 'cand';
      b.textContent = c.name;
      b.title = `${c.id} · ${c.desc || ''}`;
      b.addEventListener('click', () => {
        for (const x of cands.children) x.classList.remove('on');
        b.classList.add('on');
        MISSING_PICK.set(i, c.id);
      });
      cands.appendChild(b);
    }
    row.appendChild(cands);

    const actions = document.createElement('div');
    actions.className = 'recon-actions';

    const place = document.createElement('button');
    place.className = 'primary';
    place.textContent = '放到场景';
    place.addEventListener('click', () => {
      const kind = MISSING_PICK.get(i);
      if (!kind) { studioStatus('先选一个候选素材', 'err'); return; }
      reconPlace(m, kind);
      place.textContent = '已放置 ✓';
      place.disabled = true;
    });
    actions.appendChild(place);

    const gen = document.createElement('button');
    gen.textContent = '生成新素材';
    gen.addEventListener('click', () => reconGenerate(m, gen));
    actions.appendChild(gen);

    row.appendChild(actions);
    box.appendChild(row);
  });
}

/** 用候选素材替换缺失项：位置沿用 AI 给的 u/v（缺省放中心偏下） */
function reconPlace(m, kind) {
  const comp = KIT.get(kind);
  if (!comp) { studioStatus('构件不存在: ' + kind, 'err'); return; }
  const u = m.u == null ? .5 : m.u;
  const v = m.v == null ? .58 : m.v;
  const g = unproject(u * W, v * H);
  const x = Math.round(g.x * 4) / 4, y = Math.round(g.y * 4) / 4;

  const obj = {
    id: 'o' + (ED.nextId++),
    kind,
    x, y,
    z: TERRAIN.heightAt(x, y),
    rot: m.rot || 0,
    scale: m.scale || 1,
    params: KIT.defaults(kind),
    seed: Math.floor(hash(ED.nextId * 17, 91) * 100000) + 1,
    collision: comp.collision ? { ...comp.collision } : null,
  };
  ED.objects.push(obj);
  ED_collectLights();
  ED_refreshObjects();
  ED_select(obj);
  ED.dirty = true;
  studioStatus(`已用「${comp.name}」替代「${m.name}」`);
}

async function reconGenerate(item, btn) {
  btn.disabled = true;
  btn.textContent = '生成中…';
  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: item.brief,
        category: item.category,
        note: '场景还原时缺失的素材。用途：' + (item.reason || '还原参考图中的物体'),
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!data.component) throw new Error('生成结果为空');

    const save = await fetch('/api/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ component: data.component, overwrite: false }),
    });
    const saved = await save.json();
    if (!save.ok) throw new Error(saved.error || '入库失败');

    /* 当前页面立即注册（保存前三道闸已校验过） */
    try {
      new Function('KIT', data.component.code)(KIT);
      if (typeof ED_buildCats === 'function') ED_buildCats();
    } catch (e) {
      console.warn('[recon] 动态注册失败，刷新页面后可用', e);
    }

    btn.textContent = '已入库 ✓';
    studioStatus(`已生成并入库「${data.component.name}」→ ${(saved.files || []).join(' , ')}`, 'ok');

    const again = document.createElement('button');
    again.textContent = '重新识别';
    again.style.marginLeft = '8px';
    again.addEventListener('click', reconRun);
    btn.after(again);
  } catch (e) {
    btn.disabled = false;
    btn.textContent = '重试';
    studioStatus('生成失败：' + e.message, 'err');
  }
}

/* ---------------- 初始化 ---------------- */

function reconInit() {
  const open = reconEl('btn-recon-open');
  if (!open) return;

  open.addEventListener('click', () => { reconEl('recon-modal').hidden = false; });
  reconEl('recon-close').addEventListener('click', () => { reconEl('recon-modal').hidden = true; });
  reconEl('recon-modal').addEventListener('click', e => {
    if (e.target.id === 'recon-modal') reconEl('recon-modal').hidden = true;
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !reconEl('recon-modal').hidden) reconEl('recon-modal').hidden = true;
  });

  const drop = reconEl('recon-drop');
  drop.addEventListener('click', () => reconEl('recon-file').click());
  reconEl('recon-file').addEventListener('change', () => {
    reconSetImage(reconEl('recon-file').files[0]);
    reconEl('recon-file').value = '';
  });
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('over');
    const f = [...(e.dataTransfer.files || [])][0];
    if (f) reconSetImage(f);
  });

  /* 粘贴：只在模态框打开时接管（不干扰编辑器其它输入） */
  document.addEventListener('paste', e => {
    if (reconEl('recon-modal').hidden) return;
    const dt = e.clipboardData;
    if (!dt) return;
    const hit = [...(dt.items || [])].find(i => i.kind === 'file' && /^image\//.test(i.type || ''));
    const file = hit ? hit.getAsFile() : [...(dt.files || [])].find(f => /^image\//.test(f.type || ''));
    if (!file) return;
    e.preventDefault();
    reconSetImage(file);
  });

  reconEl('btn-recon-run').addEventListener('click', reconRun);
  reconEl('recon-reset').addEventListener('click', () => {
    RECON.image = null;
    const pv = reconEl('recon-preview');
    pv.hidden = true;
    pv.removeAttribute('src');
    reconEl('recon-drop-hint').hidden = false;
    const btn = reconEl('btn-recon-run');
    btn.disabled = true;
    btn.textContent = '开始还原';
    reconEl('recon-result').innerHTML = '';
    reconEl('recon-progress').textContent = '';
  });
}

reconInit();
reconResume();
