'use strict';
/* ------------------------------------------------------------------
 * 编辑器 · 地形图层控制（terrain-ui.js）
 *
 * 1. 三层材质体系的过渡参数：带宽 / 抖动 / 坡面混合
 * 2. AI 地形生成：输入描述 → SSE 流式进度 → 程序化形状预设应用到网格
 * ------------------------------------------------------------------ */

/* ---------------- 过渡参数 ---------------- */

function initTerrainBlendUI() {
  const bw = document.getElementById('blend-width');
  const bj = document.getElementById('blend-jitter');
  const bs = document.getElementById('blend-slope');
  const vw = document.getElementById('v-blend-width');
  const vj = document.getElementById('v-blend-jitter');
  if (!bw || !bj) return;

  const sync = () => {
    TERRAIN.blend.width = Number(bw.value);
    TERRAIN.blend.jitter = Number(bj.value);
    TERRAIN.blend.slope = !!(bs && bs.checked);
    if (vw) vw.textContent = Number(bw.value).toFixed(2);
    if (vj) vj.textContent = Number(bj.value).toFixed(2);
    ED.dirty = true;
  };

  bw.value = String(TERRAIN.blend.width);
  bj.value = String(TERRAIN.blend.jitter);
  if (bs) bs.checked = !!TERRAIN.blend.slope;
  sync();

  bw.addEventListener('input', sync);
  bj.addEventListener('input', sync);
  if (bs) bs.addEventListener('change', sync);
}

/* ---------------- AI 地形生成 ---------------- */

/* 精简 SSE 读取：onEvent(name, payload) */
async function readSSE(res, onEvent) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let name = 'message', data = '';
      for (const line of raw.split('\n')) {
        if (line.startsWith('event: ')) name = line.slice(7).trim();
        else if (line.startsWith('data: ')) data += line.slice(6);
      }
      if (!data) continue;
      try { onEvent(name, JSON.parse(data)); } catch { /* 忽略坏事件 */ }
    }
  }
}

function initTerrainAI() {
  const btn = document.getElementById('btn-terrain-ai');
  const input = document.getElementById('terrain-prompt');
  const progress = document.getElementById('terrain-progress');
  if (!btn || !input) return;

  const setProgress = (text, kind) => {
    if (!progress) return;
    progress.textContent = text || '';
    progress.className = 'terrain-progress' + (kind ? ' ' + kind : '');
  };

  const run = async () => {
    const prompt = input.value.trim();
    if (!prompt) {
      setProgress('先写一句地形描述，例如「一座带石阶小路的草坡村落」', 'err');
      input.focus();
      return;
    }

    btn.disabled = true;
    setProgress('AI 设计中…（连接模型）', 'busy');
    TP.attach(document.getElementById('terrain-thinking'));
    TP.begin();

    try {
      const res = await fetch('/api/generate-terrain', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'accept': 'text/event-stream' },
        body: JSON.stringify({ prompt }),
      });

      let preset = null, errMsg = null;

      if ((res.headers.get('content-type') || '').includes('text/event-stream')) {
        await readSSE(res, (name, payload) => {
          if (name === 'thinking') {
            TP.append(payload.kind || '推理', payload.text || '');
          } else if (name === 'progress') {
            if (payload.stage === 'connected') setProgress('已连接模型，设计地形中…', 'busy');
            else if (payload.stage === 'thinking') setProgress(
              '设计地形中…' + (payload.outputTokens ? ` 已输出 ${payload.outputTokens} tokens` : ''), 'busy');
            else if (payload.stage === 'done') setProgress('设计完成，正在铺格子…', 'busy');
          } else if (name === 'done') {
            preset = payload.preset;
          } else if (name === 'error') {
            errMsg = payload.error;
          }
        });
      } else {
        const data = await res.json();
        if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
        preset = data.preset;
      }

      if (errMsg) throw new Error(errMsg);
      if (!preset) throw new Error('没有收到地形预设');

      ED_snapshot('AI 生成地形');
      const r = TERRAIN_SHAPES.apply(preset);
      ED.objects = [];
      ED.selected = null;
      ED.nextId = 1;
      ED_refreshObjects();
      ED_refreshSel();
      ED.dirty = true;

      setProgress(`✓ 已生成「${r.name}」：${r.cells} 格 · ${preset.shapes.length} 个形状`, 'ok');
      TP.end(true, '已生成「' + r.name + '」');
      studioStatus(`AI 地形「${r.name}」已铺好（${r.cells} 格）`, 'ok');
    } catch (e) {
      setProgress('生成失败：' + e.message, 'err');
      TP.end(false, e.message);
      studioStatus('AI 地形生成失败：' + e.message, 'err');
    } finally {
      btn.disabled = false;
    }
  };

  btn.addEventListener('click', run);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') run();
  });
}

initTerrainBlendUI();
initTerrainAI();

/* ---------------- 边缘溶解 UI ---------------- */

function initTerrainEdgeUI() {
  const sel = document.getElementById('edge-mode');
  const band = document.getElementById('edge-band');
  const strength = document.getElementById('edge-strength');
  const vBand = document.getElementById('v-edge-band');
  const vStr = document.getElementById('v-edge-strength');
  if (!sel || !band || !strength) return;

  sel.innerHTML = Object.entries(TERRAIN_EDGE_MODES)
    .map(([id, m]) => `<option value="${id}">${m.name}</option>`).join('');

  const sync = () => {
    band.value = String(TERRAIN.edge.band);
    strength.value = String(TERRAIN.edge.strength);
    if (vBand) vBand.textContent = Number(TERRAIN.edge.band).toFixed(2);
    if (vStr) vStr.textContent = Number(TERRAIN.edge.strength).toFixed(2);
  };

  /* 老场景可能没有 mode 字段：按当前参数反推最近预设 */
  if (!TERRAIN.edge.mode) TERRAIN.edge.mode = 'scatter';
  sel.value = TERRAIN.edge.mode;
  sync();

  sel.addEventListener('change', () => {
    terrainEdgeApplyMode(sel.value);
    sync();
    ED.dirty = true;
    studioStatus('边缘溶解：' + (TERRAIN_EDGE_MODES[sel.value] || {}).name);
  });
  band.addEventListener('input', e => {
    TERRAIN.edge.band = Number(e.target.value);
    if (vBand) vBand.textContent = Number(e.target.value).toFixed(2);
    ED.dirty = true;
  });
  strength.addEventListener('input', e => {
    TERRAIN.edge.strength = Number(e.target.value);
    if (vStr) vStr.textContent = Number(e.target.value).toFixed(2);
    ED.dirty = true;
  });
}

initTerrainEdgeUI();
