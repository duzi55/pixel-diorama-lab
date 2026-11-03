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
