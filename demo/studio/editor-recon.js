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

const reconEl = id => document.getElementById(id);

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

/* ---------------- SSE 读取 ---------------- */

async function reconReadSSE(res, onEvent) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', result = null, error = null;

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      let event = 'message', data = '';
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) continue;
      let payload;
      try { payload = JSON.parse(data); } catch { continue; }
      if (event === 'done') result = payload;
      else if (event === 'error') error = payload.error || '未知错误';
      else if (onEvent) onEvent(event, payload);
    }
  }
  return { result, error };
}

/* ---------------- 还原 ---------------- */

async function reconRun() {
  if (RECON.running || !RECON.image) return;
  RECON.running = true;

  const btn = reconEl('btn-recon-run');
  const prog = reconEl('recon-progress');
  btn.disabled = true;
  btn.textContent = '识别中…';
  prog.textContent = '正在分析图片…';
  reconEl('recon-result').innerHTML = '';

  try {
    /* 把当前构件库的 id/name/desc/参数带给 AI，让它只挑已有的 */
    const kit = KIT.list().map(c => ({
      id: c.id,
      name: c.name,
      category: c.category,
      desc: c.desc,
      params: Object.fromEntries(
        Object.entries(c.params || {}).map(([k, p]) => [k, { def: p.def, max: p.max }])
      ),
    }));

    const res = await fetch('/api/reconstruct', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify({ images: [RECON.image], W, H, kit }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || `HTTP ${res.status}`);
    }

    let result;
    if ((res.headers.get('content-type') || '').includes('text/event-stream')) {
      const r = await reconReadSSE(res, (ev, p) => {
        if (ev === 'progress') prog.textContent = p.message || '推理中…';
      });
      if (r.error) throw new Error(r.error);
      result = r.result;
    } else {
      result = await res.json();
    }
    if (!result || !Array.isArray(result.objects)) throw new Error('没有收到场景数据');

    RECON.result = result;
    reconApply(result);
    prog.textContent = `已还原 ${result.objects.length} 个物体` +
      (result.terrain && result.terrain.length ? `、${result.terrain.length} 段地形` : '');
    reconRenderMissing(result.missing || []);
  } catch (e) {
    prog.textContent = '';
    studioStatus('还原失败：' + e.message, 'err');
  } finally {
    RECON.running = false;
    btn.disabled = false;
    btn.textContent = '重新识别';
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
}

/* ---------------- 缺失素材 ---------------- */

function reconRenderMissing(list) {
  const box = reconEl('recon-result');
  if (!list.length) {
    box.innerHTML = '<div class="hint">画面元素都在现有素材库里，没有缺的。</div>';
    return;
  }
  box.innerHTML = `<div class="hint" style="margin-bottom:4px">素材库缺 ${list.length} 项，可逐项生成并入库：</div>`;
  for (const m of list) {
    const row = document.createElement('div');
    row.className = 'recon-item';
    row.innerHTML = `<div class="nm"><b>${esc(m.name)}</b><br>
      <span class="why">${esc(m.category)} · ${esc(m.reason || m.brief || '')}</span></div>`;
    const btn = document.createElement('button');
    btn.textContent = '生成并入库';
    btn.addEventListener('click', () => reconGenerate(m, btn));
    row.appendChild(btn);
    box.appendChild(row);
  }
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
