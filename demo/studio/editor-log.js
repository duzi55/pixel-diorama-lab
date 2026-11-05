'use strict';
/* ------------------------------------------------------------------
 * 编辑器 · 错误日志（editor-log.js）
 *
 * 之前报错只在顶栏闪一下就没了。现在：
 *   - 捕获 window.error / unhandledrejection / studioStatus('err')
 *   - 状态栏出现「⚠ N」按钮，点开是最近 50 条
 * ------------------------------------------------------------------ */

const ED_LOG = [];

function ED_logError(msg) {
  ED_LOG.push({ at: new Date().toLocaleTimeString(), msg: String(msg) });
  if (ED_LOG.length > 50) ED_LOG.shift();
  const btn = document.getElementById('ed-log-btn');
  if (btn) {
    btn.hidden = false;
    btn.textContent = '⚠ ' + ED_LOG.length;
  }
  const panel = document.getElementById('ed-log-panel');
  if (panel && !panel.hidden) ED_renderLog();
}

function ED_renderLog() {
  const body = document.getElementById('ed-log-body');
  if (!body) return;
  body.innerHTML = ED_LOG.length
    ? ED_LOG.slice().reverse().map(e =>
        `<div class="log-row"><span class="t">${e.at}</span><span class="m">${ED_esc(e.msg)}</span></div>`
      ).join('')
    : '<div class="empty-note">没有错误记录</div>';
}

function ED_showLog() {
  const panel = document.getElementById('ed-log-panel');
  if (!panel) return;
  panel.hidden = !panel.hidden;
  if (!panel.hidden) ED_renderLog();
}

function ED_initErrorLog() {
  window.addEventListener('error', e => {
    ED_logError(`${e.message} · ${(e.filename || '').split('/').pop()}:${e.lineno}`);
  });
  window.addEventListener('unhandledrejection', e => {
    const r = e.reason;
    ED_logError('Promise: ' + (r && r.message ? r.message : String(r)));
  });

  /* studioStatus 的 err 也记一份 */
  if (typeof window.studioStatus === 'function') {
    const orig = window.studioStatus;
    window.studioStatus = function (msg, kind) {
      if (kind === 'err') ED_logError(msg);
      return orig(msg, kind);
    };
  }

  const btn = document.getElementById('ed-log-btn');
  if (btn) btn.addEventListener('click', ED_showLog);
  const close = document.getElementById('ed-log-close');
  if (close) close.addEventListener('click', () => {
    const panel = document.getElementById('ed-log-panel');
    if (panel) panel.hidden = true;
  });
}

ED_initErrorLog();
