'use strict';
/* ------------------------------------------------------------------
 * 生成进度条（progress.js）
 *
 * PROGRESS：不确定进度的「阶段 + 渐近」条
 *   show/set/approach/done/fail/hide
 * 从 gen.js 拆出（gen.js 超 500 行约束）。
 * ------------------------------------------------------------------ */

/* ---------------- 生成进度条 ---------------- */

const PROGRESS = {
  show() {
    el('progress-wrap').style.display = '';
    PROGRESS.set(4, '准备中…', '');
  },
  set(pct, msg, tokens) {
    el('progress-bar').style.width = Math.min(100, Math.max(0, pct)) + '%';
    el('progress-msg').textContent = msg;
    el('progress-tokens').textContent = tokens || '';
  },
  /* 不确定进度的渐近逼近：永远不到 85%（留给完成时跳 100%） */
  approach(pct) {
    const cur = parseFloat(el('progress-bar').style.width) || 4;
    PROGRESS.set(Math.min(pct, Math.max(cur, cur + (pct - cur) * 0.35)), el('progress-msg').textContent, el('progress-tokens').textContent);
  },
  done() { PROGRESS.set(100, '生成完成', ''); setTimeout(PROGRESS.hide, 900); },
  fail() { el('progress-bar').style.background = 'var(--err)'; setTimeout(PROGRESS.hide, 2200); },
  hide() {
    el('progress-wrap').style.display = 'none';
    el('progress-bar').style.background = '';
    el('progress-bar').style.width = '0%';
  },
};

/* ---------------- SSE 流式读取（共用） ---------------- */

/**
 * 解析 fetch 返回的 SSE 流，每个事件回调 onEvent(event, payload)。
 * resolve 值 = { result, error } —— done/error 事件的 data。
 */
async function readSSE(res, onEvent) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const acc = { result: null, error: null };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let event = 'message', data = '';
      for (const line of raw.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7).trim();
        else if (line.startsWith('data: ')) data += line.slice(6);
      }
      if (!data) continue;
      let payload;
      try { payload = JSON.parse(data); } catch { continue; }

      if (event === 'done') acc.result = payload;
      else if (event === 'error') acc.error = payload.error;
      if (onEvent) onEvent(event, payload);
    }
  }
  return acc;
}

