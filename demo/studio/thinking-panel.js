'use strict';
/* ------------------------------------------------------------------
 * 推理过程面板（thinking-panel.js）
 *
 * 全局对象 TP：
 *   TP.attach(el)        绑定容器
 *   TP.begin()           开始新一轮（清空内容、显示面板）
 *   TP.append(kind,text) 追加一段 thinking / 输出 / 工具事件
 *   TP.end(ok)           结束（定格，折叠为摘要）
 *
 * UI 约定：推理文本灰显斜体、以流式节奏自动滚到底部；
 * 结束后折叠成一行摘要，点开可回看全过程。
 * ------------------------------------------------------------------ */

const TP = {
  box: null,
  body: null,
  lines: 0,
  active: false,
  _pending: '',
  _flushTimer: null,

  attach(el) {
    TP.box = el;
    if (!el) return;
    el.innerHTML = `
      <div class="tp-head">
        <span class="tp-title">推理过程</span>
        <span class="tp-summary" id="tp-summary"></span>
        <span class="tp-toggle" id="tp-toggle">▾</span>
      </div>
      <div class="tp-body" id="tp-body"></div>`;
    TP.body = el.querySelector('#tp-body');
    el.querySelector('#tp-toggle').addEventListener('click', () => {
      const open = el.classList.toggle('tp-open');
      el.querySelector('#tp-toggle').textContent = open ? '▴' : '▾';
    });
  },

  begin() {
    if (!TP.box) return;
    TP.lines = 0;
    TP.active = true;
    TP.box.style.display = '';
    TP.box.classList.remove('tp-open');
    TP.box.querySelector('#tp-toggle').textContent = '▾';
    TP.box.querySelector('#tp-summary').textContent = '思考中…';
    TP.body.innerHTML = '';
  },

  append(kind, text) {
    if (!TP.active || !TP.body || !text) return;
    TP._pending += text;
    /* 节流：150ms 批量刷一次，避免高频 DOM 抖动 */
    if (TP._flushTimer) return;
    TP._flushTimer = setTimeout(() => {
      TP._flushTimer = null;
      if (!TP._pending) return;
      const div = document.createElement('div');
      div.className = 'tp-line tp-' + (kind === '输出' ? 'out' : kind === '工具' ? 'tool' : 'think');
      const tag = document.createElement('span');
      tag.className = 'tp-tag';
      tag.textContent = kind;
      div.appendChild(tag);
      div.appendChild(document.createTextNode(TP._pending));
      TP._pending = '';
      TP.body.appendChild(div);
      TP.lines++;
      /* 只保留最近 200 行，防止超长生成撑爆 DOM */
      while (TP.body.children.length > 200) TP.body.removeChild(TP.body.firstChild);
      TP.body.scrollTop = TP.body.scrollHeight;
      const t = TP._pending;
      TP.box.querySelector('#tp-summary').textContent =
        `已输出 ${TP.lines} 段${t ? '（接收中…）' : ''}`;
    }, 150);
  },

  end(ok, note) {
    if (!TP.box) return;
    TP.active = false;
    TP.box.querySelector('#tp-summary').textContent =
      (ok ? '✓ ' : '✗ ') + (note || `${TP.lines} 段 · 点击展开回看`);
  },
};
