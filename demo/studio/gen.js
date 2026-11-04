'use strict';
/* ------------------------------------------------------------------
 * 生成页逻辑（gen.js）
 *
 * 完整闭环：
 *   1. 输入需求 → AI 按 docs/kit/ 规范生成代码（或从左侧点选现有构件）
 *   2. 送入右侧 iframe 沙箱转盘预览
 *   3. 实时拖动参数滑块、手动或 AI 设置碰撞体积（同步更新代码与预览）
 *   4. 点「确认保存入库」→ 原子写入 demo/kit/<模块>.js + registry.md + 配方卡
 * ------------------------------------------------------------------ */

const GEN = {
  component: null,
  liveParams: {},
  generating: false,
  kitItems: [],
  curCat: '',
  refImages: [],     /* dataURL 数组，随生成请求发送 */
};

const el = id => document.getElementById(id);

/* ---------------- 预览沙箱通信 ---------------- */

function sendToPreview(component) {
  if (!component) return;
  GEN.component = component;
  GEN.liveParams = {};
  /* 命名输入框跟随当前构件（用户未手动改过时） */
  const nEl = el('edit-name'), iEl = el('edit-id');
  if (nEl && document.activeElement !== nEl) nEl.value = component.name || '';
  if (iEl && document.activeElement !== iEl) iEl.value = component.id || '';
  el('code').value = component.code || '';
  el('notes').textContent = component.notes || '（来自现有构件库，可直接调参或修改代码后覆盖保存）';
  el('preview-title').textContent = `转盘预览 · ${component.name || component.id} (${component.id})`;

  const frame = el('frame');
  const postCode = () => {
    if (!frame.contentWindow) return;
    frame.contentWindow.postMessage({
      type: 'code',
      code: el('code').value,
      id: component.id,
      params: GEN.liveParams,
      collision: component.collision || null,
    }, '*');
    frame.contentWindow.postMessage({ type: 'spin', on: el('spin').checked }, '*');
    frame.contentWindow.postMessage({ type: 'box', on: el('showbox').checked }, '*');
  };

  if (!frame.getAttribute('src')) {
    frame.onload = () => {
      postCode();
      /* 兜底：沙箱消息偶发丢失时不让"正在载入"卡住 */
      el('preview-empty').style.display = 'none';
    };
    frame.src = 'preview.html';
  } else {
    postCode();
    el('preview-empty').style.display = 'none';
  }
}

/* 把 collision 修改同步回写到 code 里的 collision: {...} 行 */
function syncCollisionIntoCode(col) {
  if (!GEN.component) return;
  GEN.component.collision = col;
  const code = el('code').value;
  const colStr = `collision: ${JSON.stringify(col)},`;
  if (/collision:\s*(\{[^\n]*\}|null)\s*,?/.test(code)) {
    el('code').value = code.replace(/collision:\s*(\{[^\n]*\}|null)\s*,?/, colStr);
  }
  GEN.component.code = el('code').value;
}

/* ---------------- 渲染参数与碰撞体积面板 ---------------- */

function renderParamSliders(paramsDef) {
  const box = el('gen-params');
  box.innerHTML = '';

  /* 预览缩放（不写入构件参数，只影响转盘预览的显示大小） */
  const scWrap = document.createElement('div');
  scWrap.className = 'slider';
  scWrap.innerHTML = `<label><span>预览缩放 <code>scale</code></span><b id="gen-scale-v">1.00</b></label>`;
  const scIn = document.createElement('input');
  scIn.type = 'range'; scIn.min = '0.3'; scIn.max = '2.5'; scIn.step = '0.05';
  scIn.value = '1';
  scIn.addEventListener('input', e => {
    const v = Number(e.target.value);
    document.getElementById('gen-scale-v').textContent = v.toFixed(2);
    const frame = el('frame');
    if (frame.contentWindow) {
      frame.contentWindow.postMessage({ type: 'scale', scale: v }, '*');
    }
  });
  scWrap.appendChild(scIn);
  box.appendChild(scWrap);

  const keys = Object.keys(paramsDef || {});
  if (!keys.length) {
    box.innerHTML = '<div class="empty-note">该构件无可调参数</div>';
    return;
  }

  for (const k of keys) {
    const p = paramsDef[k];
    const curVal = GEN.liveParams[k] != null ? GEN.liveParams[k] : p.def;
    const wrap = document.createElement('div');
    wrap.className = 'slider';
    wrap.innerHTML = `<label><span>${esc(p.desc || k)} <code>${esc(k)}</code></span><b>${curVal}</b></label>`;
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.min = String(p.min);
    inp.max = String(p.max);
    inp.step = String(p.step);
    inp.value = String(curVal);
    inp.addEventListener('input', e => {
      const v = Number(e.target.value);
      GEN.liveParams[k] = v;
      if (GEN.component && GEN.component.params && GEN.component.params[k]) {
        GEN.component.params[k].def = v;
      }
      wrap.querySelector('b').textContent = String(v);
      const frame = el('frame');
      if (frame.contentWindow) {
        frame.contentWindow.postMessage({ type: 'params', params: GEN.liveParams }, '*');
      }
    });
    wrap.appendChild(inp);
    box.appendChild(wrap);
  }
}

function renderCollisionEditor(col) {
  const box = el('gen-col');
  box.innerHTML = '';
  el('btn-gen-col-ai').disabled = !GEN.component;
  el('btn-gen-col-box').disabled = !GEN.component;
  el('btn-gen-col-cyl').disabled = !GEN.component;

  if (!col) {
    box.innerHTML = '<div class="empty-note">当前无碰撞体积，可点下方按钮手动设置或让 AI 推断</div>';
    return;
  }

  /* 统一字段名：兼容 width/depth/height 与 w/d/h */
  if (col.type === 'box') {
    if (col.w == null) col.w = col.width || 1;
    if (col.d == null) col.d = col.depth || 1;
    if (col.h == null) col.h = col.height || 1;
  } else if (col.type === 'cylinder') {
    if (col.radius == null) col.radius = .4;
    if (col.height == null) col.height = 1;
  }

  const head = document.createElement('div');
  head.className = 'list-row';
  head.innerHTML = `<span class="nm">当前类型</span><span class="pos">${esc(col.type)}</span>`;
  box.appendChild(head);

  const addSlider = (label, key, min, max, step) => {
    const wrap = document.createElement('div');
    wrap.className = 'slider';
    wrap.innerHTML = `<label>${label} <b>${col[key]}</b></label>`;
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.min = String(min);
    inp.max = String(max);
    inp.step = String(step);
    inp.value = String(col[key]);
    inp.addEventListener('input', e => {
      col[key] = Number(e.target.value);
      wrap.querySelector('b').textContent = String(col[key]);
      syncCollisionIntoCode(col);
      const frame = el('frame');
      if (frame.contentWindow) {
        frame.contentWindow.postMessage({ type: 'collision', collision: col }, '*');
      }
    });
    wrap.appendChild(inp);
    box.appendChild(wrap);
  };

  if (col.type === 'box') {
    addSlider('宽 w (x)', 'w', .1, 10, .05);
    addSlider('深 d (y)', 'd', .1, 10, .05);
    addSlider('高 h (z)', 'h', .1, 10, .05);
  } else {
    addSlider('半径 radius', 'radius', .05, 5, .05);
    addSlider('高度 height', 'height', .1, 10, .05);
  }
}


/* ---------------- 自定义命名 ---------------- */

function initNaming() {
  const nEl = el('edit-name'), iEl = el('edit-id');
  if (!nEl || !iEl) return;

  const apply = () => {
    if (!GEN.component) return;
    const newName = nEl.value.trim();
    const newId = iEl.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    if (newName) GEN.component.name = newName;
    if (newId && /^[a-z][a-z0-9-]*$/.test(newId)) GEN.component.id = newId;
    el('preview-title').textContent = `转盘预览 · ${GEN.component.name} (${GEN.component.id})`;
    /* 代码里的 id/name 同步（保存时三件套用它） */
    if (GEN.component.code) {
      GEN.component.code = GEN.component.code
        .replace(/(id:\s*')[^']*(')/, `$1${GEN.component.id}$2`)
        .replace(/(name:\s*')[^']*(')/, `$1${GEN.component.name.replace(/'/g, "\\'")}$2`);
      el('code').value = GEN.component.code;
    }
  };

  nEl.addEventListener('change', apply);
  iEl.addEventListener('change', apply);
}

initNaming();

/* ---------------- AI 生成（SSE 流式进度） ---------------- */

async function doGenerate() {
  if (GEN.generating) return;
  const prompt = el('prompt').value.trim();
  if (!prompt) {
    studioStatus('请先输入构件需求描述', 'err');
    el('prompt').focus();
    return;
  }

  GEN.generating = true;
  el('btn-gen').disabled = true;
  el('btn-save').disabled = true;
  PROGRESS.show();
  TP.attach(el('thinking-panel'));
  TP.begin();
  studioStatus('AI 正在按 docs/kit/ 规范编写构件代码…', 'busy');

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept': 'text/event-stream' },
      body: JSON.stringify({
        prompt,
        category: el('category').value || null,
        note: el('note').value.trim() || null,
        images: GEN.refImages.length ? GEN.refImages : undefined,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/event-stream')) {
      /* 服务端没走流式（旧版本/兜底），整包 JSON */
      const data = await res.json();
      sendToPreview(data.component);
      PROGRESS.done();
      studioStatus('已生成：' + data.component.name + '（可在右侧调节参数与碰撞体积后保存）', 'ok');
      return;
    }

    const onGenEvent = (event, payload) => {
      if (event === 'thinking') {
        TP.append(payload.kind || '推理', payload.text || '');
        return;
      }
      if (event !== 'progress') return;
      if (payload.stage === 'connected') {
        PROGRESS.set(18, payload.message, payload.totalTokens ? `${payload.totalTokens} tokens` : '');
        PROGRESS._thinkingPct = 25;
      } else if (payload.stage === 'thinking') {
        PROGRESS._thinkingPct = Math.min(82, (PROGRESS._thinkingPct || 25) + 3.5);
        PROGRESS.set(
          PROGRESS._thinkingPct,
          payload.message || '模型推理中…',
          payload.outputTokens ? `已输出 ${payload.outputTokens} tokens` : ''
        );
      } else if (payload.stage === 'done') {
        PROGRESS.set(94, '生成完成，正在校验…',
          payload.outputTokens ? `共 ${payload.outputTokens} tokens · ${(payload.durationMs / 1000).toFixed(1)}s` : '');
      }
    };

    const { result: genResult, error: genError } = await readSSE(res, onGenEvent);
    if (genError) throw new Error(genError);
    if (!genResult || !genResult.component) throw new Error('生成结束但没有收到构件数据');

    sendToPreview(genResult.component);
    PROGRESS.done();
    TP.end(true, '已生成「' + genResult.component.name + '」');
    studioStatus('已生成：' + genResult.component.name + '（可在右侧调节参数与碰撞体积后保存）', 'ok');
  } catch (e) {
    PROGRESS.fail();
    TP.end(false, e.message);
    studioStatus('生成提示：' + e.message, 'err');
  } finally {
    GEN.generating = false;
    el('btn-gen').disabled = false;
  }
}

/* ---------------- AI 推断碰撞体 ---------------- */

async function doInferCollision() {
  if (!GEN.component) return;
  const btn = el('btn-gen-col-ai');
  btn.disabled = true;
  studioStatus('AI 正在根据当前参数推断碰撞体积…', 'busy');

  try {
    const params = {};
    for (const [k, p] of Object.entries(GEN.component.params || {})) {
      params[k] = GEN.liveParams[k] != null ? GEN.liveParams[k] : p.def;
    }
    const data = await studioPost('/api/collision', {
      kind: GEN.component.id,
      name: GEN.component.name,
      desc: GEN.component.desc,
      params,
      current: GEN.component.collision,
    });
    if (data.collision) {
      syncCollisionIntoCode(data.collision);
      renderCollisionEditor(data.collision);
      const frame = el('frame');
      if (frame.contentWindow) {
        frame.contentWindow.postMessage({ type: 'collision', collision: data.collision }, '*');
      }
      studioStatus('AI 碰撞体积推断完成：' + data.reason, 'ok');
    }
  } catch (e) {
    studioStatus('AI 推断失败：' + e.message, 'err');
  } finally {
    btn.disabled = false;
  }
}

/* ---------------- 预览回执 ---------------- */

window.addEventListener('message', e => {
  const msg = e.data;
  if (!msg) return;

  if (msg.type === 'preview-ok') {
    el('preview-empty').style.display = 'none';
    el('btn-save').disabled = false;
    if (GEN.component) {
      GEN.component.id = msg.id || GEN.component.id;
      GEN.component.name = msg.name || GEN.component.name;
      GEN.component.category = msg.category || GEN.component.category;
      GEN.component.desc = msg.desc || GEN.component.desc;
      GEN.component.params = msg.params || GEN.component.params || {};
      GEN.component.collision = msg.collision || GEN.component.collision || null;
      renderParamSliders(GEN.component.params);
      renderCollisionEditor(GEN.component.collision);
    }
    studioStatus('预览就绪：' + (msg.name || msg.id), 'ok');
    return;
  }

  if (msg.type === 'preview-error') {
    el('preview-empty').style.display = '';
    el('preview-empty').textContent = '预览失败：' + msg.error;
    el('btn-save').disabled = true;
    studioStatus('预览失败：' + msg.error, 'err');
  }
});

/* ---------------- 保存 ---------------- */

async function doSave() {
  if (!GEN.component) return;
  if (!/^[a-z][a-z0-9-]*$/.test(GEN.component.id)) {
    studioStatus('id 非法：只能小写字母数字连字符，且以字母开头', 'err');
    return;
  }
  GEN.component.code = el('code').value;
  el('btn-save').disabled = true;
  studioStatus('正在校验并写入三件套（代码 + 注册表 + 配方卡）…', 'busy');

  try {
    const data = await studioPost('/api/save', {
      component: GEN.component,
      overwrite: el('overwrite').checked,
    });
    studioStatus('✓ 已保存入库 → ' + data.files.join(' , '), 'ok');
    await loadKitLibrary(GEN.component.id);
  } catch (e) {
    studioStatus('保存失败：' + e.message, 'err');
  } finally {
    el('btn-save').disabled = false;
  }
}

/* ---------------- 绑定 ---------------- */

el('btn-gen').addEventListener('click', doGenerate);
el('btn-save').addEventListener('click', doSave);
el('btn-gen-col-ai').addEventListener('click', doInferCollision);

el('btn-gen-col-box').addEventListener('click', () => {
  if (!GEN.component) return;
  const col = { type: 'box', w: 2.0, d: 2.0, h: 2.0 };
  syncCollisionIntoCode(col);
  renderCollisionEditor(col);
  const frame = el('frame');
  if (frame.contentWindow) frame.contentWindow.postMessage({ type: 'collision', collision: col }, '*');
});

el('btn-gen-col-cyl').addEventListener('click', () => {
  if (!GEN.component) return;
  const col = { type: 'cylinder', radius: 0.5, height: 2.0 };
  syncCollisionIntoCode(col);
  renderCollisionEditor(col);
  const frame = el('frame');
  if (frame.contentWindow) frame.contentWindow.postMessage({ type: 'collision', collision: col }, '*');
});

el('btn-reload').addEventListener('click', () => {
  if (!GEN.component) return;
  GEN.component.code = el('code').value;
  sendToPreview(GEN.component);
});

el('spin').addEventListener('change', e => {
  const frame = el('frame');
  if (frame.contentWindow) frame.contentWindow.postMessage({ type: 'spin', on: e.target.checked }, '*');
});

el('showbox').addEventListener('change', e => {
  const frame = el('frame');
  if (frame.contentWindow) frame.contentWindow.postMessage({ type: 'box', on: e.target.checked }, '*');
});

el('prompt').addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') doGenerate();
});

for (const b of document.querySelectorAll('.ex')) {
  b.addEventListener('click', () => {
    el('prompt').value = b.dataset.p;
    el('prompt').focus();
  });
}

/* ---------------- 启动 ---------------- */

initRefImages();
loadKitLibrary();

