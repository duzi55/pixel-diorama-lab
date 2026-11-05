/* ------------------------------------------------------------------
 * 构件工坊 · 右侧「逻辑」面板（可视化行为编辑器）
 *
 * 数据来源：app.js 的 state.behaviors / state.allowedBehaviors，
 * 由预览沙箱的 behavior-info 消息填充。面板只做三件事：
 *   1. 列出实例已挂的行为，每个行为渲染参数滑块；
 *   2. 增删行为、拖动滑块后，把 {type:'behaviors', list} 发回预览沙箱；
 *   3. 底部列出构件声明过但尚未挂载的行为，点一下即可添加。
 *
 * 对外只暴露 window.BehaviorPanel = { render(state) }。
 * 契约见 docs/modules/behavior.md §2。
 * ------------------------------------------------------------------ */
(function () {
  'use strict';

  /* 分类 → 中文徽章 */
  const CAT = {
    ambient: '环境',
    active: '主动',
    reaction: '反应',
    state: '状态',
  };

  const APPLY_DELAY = 120;   // 防抖（毫秒）

  const S = {
    state: null,             // app.js 传来的同一份 state 引用
    timer: 0,
  };

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* 预览沙箱：行为每次变更都整份重发，沙箱侧重挂并重绘 */
  function previewWin() {
    const f = document.getElementById('pv');
    return f ? f.contentWindow : null;
  }

  function postBehaviors() {
    const win = previewWin();
    const st = S.state;
    if (!win || !st) return;
    const list = (st.behaviors || []).map(b => ({ id: b.id, params: Object.assign({}, b.params) }));
    win.postMessage({ type: 'behaviors', list }, '*');
  }

  function scheduleApply() {
    clearTimeout(S.timer);
    S.timer = setTimeout(postBehaviors, APPLY_DELAY);
  }

  function findDef(id) {
    const list = (S.state && S.state.allowedBehaviors) || [];
    return list.find(d => d.id === id) || null;
  }

  /* 数值显示：去掉浮点尾巴，最多 3 位小数 */
  function fmt(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    return String(+n.toFixed(3));
  }

  /* ---------------- 单个行为卡片 ---------------- */

  function behaviorCard(bh) {
    const def = findDef(bh.id) || {};
    const card = el('div', 'bh-card');

    const head = el('div', 'bh-head');
    head.appendChild(el('span', 'bh-name', def.label || bh.id));
    head.appendChild(el('code', 'bh-id', bh.id));
    const cat = CAT[def.category];
    if (cat) {
      const badge = el('span', 'bh-cat ' + (def.category || ''), cat);
      badge.title = def.category || '';
      head.appendChild(badge);
    }
    const rm = el('button', 'bh-remove', '移除');
    rm.type = 'button';
    rm.title = '从当前构件上移除这个行为';
    rm.addEventListener('click', () => {
      const list = S.state.behaviors || [];
      const i = list.indexOf(bh);
      if (i >= 0) list.splice(i, 1);
      render(S.state);
      scheduleApply();
    });
    head.appendChild(rm);
    card.appendChild(head);

    if (def.desc) card.appendChild(el('div', 'bh-desc', def.desc));

    /* 参数滑块：标签「中文 desc · 参数名」 */
    const defs = def.params || {};
    const keys = Object.keys(defs);
    if (keys.length) {
      const box = el('div', 'bh-params');
      for (const key of keys) {
        const p = defs[key] || {};
        const row = el('div', 'bh-param');
        const lab = el('label', '', (p.desc ? p.desc + ' · ' : '') + key);
        lab.title = key + (p.desc ? ' · ' + p.desc : '');
        const input = document.createElement('input');
        input.type = 'range';
        input.min = p.min != null ? p.min : 0;
        input.max = p.max != null ? p.max : 1;
        input.step = p.step != null ? p.step : 1;
        const cur = bh.params && bh.params[key] != null ? bh.params[key] : p.def;
        input.value = cur;
        const out = el('output', '', fmt(input.value));
        input.addEventListener('input', () => {
          bh.params = bh.params || {};
          bh.params[key] = Number(input.value);
          out.textContent = fmt(input.value);
          scheduleApply();
        });
        row.appendChild(lab);
        row.appendChild(input);
        row.appendChild(out);
        box.appendChild(row);
      }
      card.appendChild(box);
    }
    return card;
  }

  /* ---------------- 底部：可添加的行为 ---------------- */

  function addSection() {
    const st = S.state;
    const mounted = new Set((st.behaviors || []).map(b => b.id));
    const pool = (st.allowedBehaviors || []).filter(d => !mounted.has(d.id));

    const wrap = el('div', 'bh-add');
    wrap.appendChild(el('div', 'bh-add-head', '可添加的行为'));

    if (!pool.length) {
      const msg = (st.allowedBehaviors || []).length
        ? '这个构件允许的行为都已挂上。'
        : '这个构件没有声明可挂载的行为。';
      wrap.appendChild(el('div', 'bh-add-empty', msg));
      return wrap;
    }

    const chips = el('div', 'bh-chips');
    for (const d of pool) {
      const btn = el('button', 'bh-chip');
      btn.type = 'button';
      btn.title = d.desc || d.id;
      btn.appendChild(el('span', 'plus', '＋'));
      btn.appendChild(el('span', '', d.label || d.id));
      const idTag = el('code', 'bh-id', d.id);
      btn.appendChild(idTag);
      btn.addEventListener('click', () => {
        const params = {};
        for (const [k, p] of Object.entries(d.params || {})) params[k] = p.def;
        st.behaviors = st.behaviors || [];
        st.behaviors.push({ id: d.id, params });
        render(st);
        scheduleApply();
      });
      chips.appendChild(btn);
    }
    wrap.appendChild(chips);
    return wrap;
  }

  /* ---------------- 渲染入口 ---------------- */

  function render(state) {
    S.state = state;
    const root = document.getElementById('behavior-body');
    if (!root) return;
    root.innerHTML = '';

    const wrap = el('div', 'bh-panel');

    /* 还没选中构件 */
    if (!state || !state.current) {
      const empty = el('div', 'bh-empty');
      empty.appendChild(el('div', 'bh-empty-title', '行为'));
      empty.appendChild(el('p', '', '先从左侧选择一个构件。'));
      wrap.appendChild(empty);
      root.appendChild(wrap);
      return;
    }

    const list = state.behaviors || [];

    if (!list.length) {
      const empty = el('div', 'bh-empty');
      empty.appendChild(el('div', 'bh-empty-title', '行为'));
      empty.appendChild(el('p', '', '这个构件还没有行为。从下面挑一个。'));
      wrap.appendChild(empty);
    } else {
      const sec = el('div', 'bh-sec-head');
      sec.appendChild(el('span', '', '已挂载的行为'));
      sec.appendChild(el('span', 'bh-sec-count', String(list.length)));
      wrap.appendChild(sec);
      for (const bh of list) {
        if (!bh || !bh.id) continue;
        bh.params = bh.params || {};
        wrap.appendChild(behaviorCard(bh));
      }
    }

    wrap.appendChild(addSection());
    root.appendChild(wrap);
  }

  window.BehaviorPanel = { render };
})();
