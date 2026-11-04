'use strict';
/* ------------------------------------------------------------------
 * 模型切换（model-switch.js）
 *
 * 生成页顶部：显示当前 AI 配置 + 模型下拉，切换即写回 studio.config.json
 *（POST /api/config），下次生成生效，无需重启服务。
 * ------------------------------------------------------------------ */

const MODEL_PRESETS = [
  { value: '', label: 'CLI 默认模型' },
  { value: 'sonnet', label: 'Sonnet（均衡）' },
  { value: 'opus', label: 'Opus（最强）' },
  { value: 'haiku', label: 'Haiku（最快）' },
  { value: '__custom__', label: '自定义…' },
];

async function initModelSwitch() {
  const box = document.getElementById('ai-config');
  if (!box) return;

  let cfg = null;
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    if (data.ok) cfg = data.config;
  } catch { /* 服务没起时静默 */ }

  if (!cfg) {
    box.textContent = 'AI 配置读取失败（使用 CLI 默认）';
    return;
  }

  box.innerHTML = '';

  const label = document.createElement('span');
  label.textContent = '模型';
  box.appendChild(label);

  const sel = document.createElement('select');
  sel.className = 'model-select';
  const known = MODEL_PRESETS.some(p => p.value === cfg.model);
  for (const p of MODEL_PRESETS) {
    const o = document.createElement('option');
    o.value = p.value;
    o.textContent = p.label;
    if (p.value === (known ? cfg.model : '__custom__')) o.selected = true;
    sel.appendChild(o);
  }
  box.appendChild(sel);

  /* 自定义输入框（选中"自定义…"时出现） */
  const custom = document.createElement('input');
  custom.type = 'text';
  custom.className = 'model-custom';
  custom.placeholder = '模型名或全名';
  custom.value = known ? '' : cfg.model;
  custom.style.display = known ? 'none' : '';
  box.appendChild(custom);

  const meta = document.createElement('span');
  meta.className = 'model-meta';
  meta.textContent = `思考 ${cfg.effort} · 预算 $${cfg.maxBudgetUsd}/次 · 超时 ${Math.round(cfg.timeoutMs / 1000)}s`;
  box.appendChild(meta);

  const apply = async model => {
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || '写入失败');
      meta.textContent = `思考 ${data.config.effort} · 预算 $${data.config.maxBudgetUsd}/次 · 超时 ${Math.round(data.config.timeoutMs / 1000)}s`;
      studioStatus(`模型已切换为：${data.config.model}（下次生成生效）`, 'ok');
    } catch (e) {
      studioStatus('切换模型失败：' + e.message, 'err');
    }
  };

  sel.addEventListener('change', () => {
    if (sel.value === '__custom__') {
      custom.style.display = '';
      custom.focus();
      return;
    }
    custom.style.display = 'none';
    apply(sel.value);
  });

  custom.addEventListener('keydown', e => {
    if (e.key === 'Enter' && custom.value.trim()) apply(custom.value.trim());
  });
}

initModelSwitch();
