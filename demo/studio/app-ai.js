'use strict';
/* 构件工坊 · AI 编辑面板：生成/修改、参考图、应用预览与保存 */

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

/* ---------------- 参考图（最多 3 张） ---------------- */

const MAX_IMAGES = 3, MAX_EDGE = 900;   // 长边压到 900px，控制请求体积

$('#ai-file').addEventListener('change', async e => {
  const files = [...(e.target.files || [])];
  e.target.value = '';
  await addImageFiles(files);
});

async function addImageFiles(files) {
  for (const f of files) {
    if (state.refImages.length >= MAX_IMAGES) { setStatus(`最多 ${MAX_IMAGES} 张参考图`); break; }
    if (!/^image\//.test(f.type)) continue;
    try {
      state.refImages.push(await fileToDataUrl(f));
    } catch (err) {
      setStatus('图片读取失败：' + err.message);
    }
  }
  renderThumbs();
}

/* ★ 输入框直接贴图：Ctrl/⌘+V 粘贴剪贴板里的图片 */
$('#ai-prompt').addEventListener('paste', e => {
  const items = [...(e.clipboardData?.items || [])];
  const files = items.filter(it => it.kind === 'file' && it.type.startsWith('image/'))
    .map(it => it.getAsFile()).filter(Boolean);
  if (files.length) {
    e.preventDefault();                 // 不把二进制粘成乱码
    addImageFiles(files);
  }
});

/* ★ 拖拽图片到输入框 / AI 面板任意位置 */
const aiPane = document.querySelector('.ai-pane');
['dragover', 'dragenter'].forEach(ev => aiPane.addEventListener(ev, e => {
  if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
  e.preventDefault();
  aiPane.classList.add('dropping');
}));
['dragleave', 'dragend'].forEach(ev => aiPane.addEventListener(ev, e => {
  if (e.target !== aiPane) return;
  aiPane.classList.remove('dropping');
}));
aiPane.addEventListener('drop', e => {
  if (!e.dataTransfer?.files?.length) return;
  e.preventDefault();
  aiPane.classList.remove('dropping');
  addImageFiles([...e.dataTransfer.files].filter(f => f.type.startsWith('image/')));
});

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * k));
      const h = Math.max(1, Math.round(img.height * k));
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(cv.toDataURL('image/jpeg', .85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法解码')); };
    img.src = url;
  });
}

function renderThumbs() {
  const box = $('#ai-thumbs');
  box.innerHTML = '';
  state.refImages.forEach((url, i) => {
    const t = el('div', 'thumb');
    const im = document.createElement('img');
    im.src = url;
    im.alt = `参考图 ${i + 1}`;
    const del = el('button', '', '×');
    del.title = '移除';
    del.addEventListener('click', () => { state.refImages.splice(i, 1); renderThumbs(); });
    t.appendChild(im); t.appendChild(del);
    box.appendChild(t);
  });
  $('#ai-img-count').textContent = `${state.refImages.length} / ${MAX_IMAGES}`;
}

$('#btn-ai').addEventListener('click', runAi);

/* ---------------- 思考面板 / 进度条 / SSE ---------------- */

const THINK = {
  body: null,
  ensure() { if (!this.body) this.body = $('#ai-think-body'); return this.body; },
  clear() {
    const b = this.ensure();
    b.innerHTML = '<div class="think-empty">AI 生成时，这里实时显示推理过程与进度。</div>';
  },
  line(kind, text) {
    const b = this.ensure();
    const empty = b.querySelector('.think-empty');
    if (empty) empty.remove();
    const p = document.createElement('p');
    p.className = 'think-line t-' + kind;
    const tag = document.createElement('b');
    tag.textContent = kind;
    p.appendChild(tag);
    p.appendChild(document.createTextNode(String(text)));
    b.appendChild(p);
    b.scrollTop = b.scrollHeight;
    while (b.childElementCount > 150) b.removeChild(b.firstChild);
  },
};

function setProgress(pct, color) {
  const bar = $('#ai-progress-bar');
  bar.style.width = Math.min(100, Math.max(0, pct)) + '%';
  bar.style.background = color || 'var(--accent)';
}

/** 读取 SSE：每事件回调 on(event, data) */
async function readSSE(res, on) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const raw = buf.slice(0, i);
      buf = buf.slice(i + 2);
      let ev = 'message', data = '';
      for (const line of raw.split('\n')) {
        if (line.startsWith('event: ')) ev = line.slice(7).trim();
        else if (line.startsWith('data: ')) data += line.slice(6);
      }
      if (!data) continue;
      try { on(ev, JSON.parse(data)); } catch { /* 忽略坏包 */ }
    }
  }
}

/* ---------------- 每个构件一份对话（本地保存） ---------------- */
/* 切构件时各看各的：需求、思考、结果都跟着构件走，存 localStorage */

const CHAT = { id: null, cache: new Map(), max: 8, inflight: new Map() };

function chatTurns(id) {
  if (!CHAT.cache.has(id)) {
    let arr = [];
    try {
      const raw = localStorage.getItem('studio-chat:' + id);
      if (raw) arr = JSON.parse(raw) || [];
    } catch { arr = []; }
    CHAT.cache.set(id, arr);
  }
  return CHAT.cache.get(id);
}

function chatSave(id) {
  try {
    localStorage.setItem('studio-chat:' + id, JSON.stringify(chatTurns(id).slice(0, CHAT.max)));
  } catch { /* 配额满了只留内存 */ }
}

/* 切构件：载入该构件的对话并渲染最近一轮。
   无正在生成的任务时强制从 localStorage 重读（多标签页/外部写入也能同步） */
function chatSetComponent(id) {
  CHAT.id = id;
  if (!CHAT.inflight.has(id)) CHAT.cache.delete(id);
  chatRender();
}

/* 开始新一轮（返回 turn 对象，后续回调都用它，避免切构件后写错会话） */
function chatStart(prompt) {
  const id = CHAT.id;
  const turn = { cid: id, t: Date.now(), prompt, thinking: [], result: null, error: null };
  CHAT.inflight.set(id, turn);
  chatTurns(id).unshift(turn);
  chatTurns(id).length = Math.min(chatTurns(id).length, CHAT.max);
  chatSave(id);
  THINK.clear();
  THINK.line('需求', prompt);
  return turn;
}

function chatLine(kind, text, turn) {
  if (!turn) return;
  const s = String(text);
  turn.thinking.push({ kind, text: s.length > 1200 ? s.slice(0, 1200) + '…' : s });
  if (turn.thinking.length > 200) turn.thinking.splice(0, turn.thinking.length - 200);
  /* 只有当前正在看的构件才追加到面板 */
  if (CHAT.id === turn.cid && chatTurns(turn.cid)[0] === turn) THINK.line(kind, s);
}

function chatFinish(turn, patch) {
  if (!turn) return;
  Object.assign(turn, patch || {});
  chatSave(turn.cid);
  if (CHAT.inflight.get(turn.cid) === turn) CHAT.inflight.delete(turn.cid);
}

/* 渲染某构件最近一轮对话：思考 + 该构件自己的 AI 结果 */
function chatRender() {
  THINK.clear();
  const turns = chatTurns(CHAT.id);
  const turn = turns[0];
  $('#ai-code').value = '';
  $('#ai-metaline').textContent = '';
  if (!turn) return;

  THINK.line('需求', turn.prompt);
  for (const l of turn.thinking.slice(-100)) THINK.line(l.kind, l.text);
  if (turn.error) THINK.line('错误', turn.error);
  if (turn.result && turn.result.code) {
    $('#ai-code').value = turn.result.code;
    $('#ai-metaline').textContent = `${turn.result.name || ''} · ${turn.result.id || ''}`;
    $('#ai-status').textContent = '已载入该构件上一次 AI 结果（可应用预览 / 保存）';
    THINK.line('历史', `这是 ${new Date(turn.t).toLocaleString()} 的一轮对话`);
  }
}

window.chatSetComponent = chatSetComponent;

$('#ai-think-clear').addEventListener('click', () => THINK.clear());

/* ---------------- 生成 / 修改 ---------------- */

async function runAi() {
  const instruction = $('#ai-prompt').value.trim();
  if (!instruction) { $('#ai-status').textContent = '先写一句需求'; return; }
  if (state.aiMode === 'edit' && !state.current) return;

  const btn = $('#btn-ai');
  btn.disabled = true;
  $('#ai-status').textContent = 'AI 生成中…（可能需要 1~3 分钟）';
  const turn = chatStart(instruction);
  setProgress(4);
  chatLine('进度', '已提交需求，正在连接模型…', turn);

  let prompt;
  let category = '';
  if (state.aiMode === 'edit') {
    const cur = state.current;
    category = cur.category;
    const code = state.code || cur.code;
    prompt = `请**修改**现有构件「${cur.name}」（id: ${cur.id}，分类 ${cur.category}）。\n`
           + `修改要求：${instruction}\n\n`
           + `现有代码：\n\`\`\`js\n${code}\n\`\`\`\n\n`
           + `请返回修改后的**完整**构件（id 保持 "${cur.id}" 不变，仍按 KIT.register 规范）。`;
  } else {
    prompt = instruction;
  }

  let result = null, error = null;
  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify({
        prompt,
        category: category || undefined,
        images: state.refImages.length ? state.refImages : undefined,
      }),
    });

    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/event-stream')) {
      /* 兜底：非流式响应 */
      const data = await res.json();
      result = data;
    } else {
      let lastPct = 4;
      await readSSE(res, (ev, d) => {
        if (ev === 'open') {
          chatLine('进度', `已连接模型${d.model ? '（' + d.model + '）' : ''}`, turn);
          lastPct = Math.max(lastPct, 12); setProgress(lastPct);
        } else if (ev === 'progress') {
          const msg = d.message || d.stage || '';
          const tokens = d.totalTokens ? ` · ${d.totalTokens} tokens` : '';
          $('#ai-status').textContent = msg + tokens;
          chatLine('进度', msg + tokens, turn);
          lastPct = Math.min(88, lastPct + Math.max(2, (88 - lastPct) * .25));
          setProgress(lastPct);
        } else if (ev === 'thinking') {
          chatLine(d.kind || '推理', d.text || '', turn);
        } else if (ev === 'done') {
          result = d;
          setProgress(100);
        } else if (ev === 'error') {
          error = new Error(d.error || '生成失败');
          setProgress(100, 'var(--err)');
          chatLine('错误', d.error || '生成失败', turn);
        }
      });
    }
    if (error) throw error;
    if (!result || !result.ok) throw new Error((result && result.error) || '生成失败');
  } catch (e) {
    $('#ai-status').textContent = '失败：' + e.message;
    chatFinish(turn, { error: e.message });
    chatLine('错误', e.message, turn);
    setProgress(100, 'var(--err)');
    btn.disabled = false;
    setTimeout(() => setProgress(0), 1500);
    return;
  }

  const c = result.component;
  chatFinish(turn, { result: { code: c.code, name: c.name, id: c.id, category: c.category, desc: c.desc } });
  if (window.histPush) histPush('AI ' + (state.aiMode === 'edit' ? '修改' : '新建') + '：' + instruction.slice(0, 24));
  state.aiComponent = c;
  state.code = c.code || '';
  state.meta = parseMeta(state.code, {
    name: c.name, id: c.id, category: c.category, desc: c.desc || '',
  });
  fillProps(state.meta);
  $('#code').textContent = state.code;
  $('#ai-code').value = c.code || '';
  $('#ai-metaline').textContent = `${c.name} · ${c.id} · ${CAT_NAME[c.category] || c.category}`;
  $('#ai-status').textContent = '生成完成，可「应用预览」或直接「保存到构件库」';
  chatLine('完成', `${c.name}（${c.id}）已生成`, turn);
  if (state.aiMode === 'new') {
    $('#cur-name').textContent = c.name;
    $('#cur-desc').textContent = c.desc || '（AI 新构件，未保存）';
    $('#cur-id').textContent = c.id;
    $('#cur-cat').textContent = CAT_NAME[c.category] || c.category;
    $('#code').textContent = c.code;
  }
  btn.disabled = false;
  setTimeout(() => setProgress(0), 1200);
}

$('#btn-apply').addEventListener('click', () => {
  const code = $('#ai-code').value.trim();
  if (!code) return;
  if (window.histPush) histPush('应用 AI 代码');
  state.code = code;
  state.meta = parseMeta(code, state.meta || state.current || {});
  fillProps(state.meta);
  $('#code').textContent = code;
  $('#cur-name').textContent = state.meta.name;
  $('#cur-id').textContent = state.meta.id;
  $('#cur-cat').textContent = CAT_NAME[state.meta.category] || state.meta.category;
  state.params = {};
  sendCode(null);
  $('#ai-status').textContent = '已推送到预览';
});

$('#btn-save').addEventListener('click', async () => {
  const code = state.code || ($('#ai-code').value || '').trim();
  if (!code || !state.meta) { $('#ai-status').textContent = '没有可保存的代码'; return; }
  const btn = $('#btn-save');
  btn.disabled = true;
  $('#ai-status').textContent = '保存中…';
  try {
    const c = {
      id: state.meta.id, name: state.meta.name, category: state.meta.category,
      desc: state.meta.desc, code, collision: state.meta.collision,
    };
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

