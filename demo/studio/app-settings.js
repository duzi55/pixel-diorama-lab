'use strict';
/* ------------------------------------------------------------------
 * AI 设置面板（app-settings.js）
 *
 * 模型 / 思考强度 / 单次预算 / API Key / Base URL。
 * 读 GET /api/config，保存 POST /api/config。
 * API Key 留空 = 不修改（保留已存的值）；服务端存 studio.secret.json，
 * 已在 .gitignore 里，不进仓库。
 * ------------------------------------------------------------------ */

(function () {
  const dlg = document.getElementById('ai-settings');
  const btn = document.getElementById('btn-ai-settings');
  if (!dlg || !btn) return;

  const $ = s => document.querySelector(s);
  const model = $('#set-model');
  const effort = $('#set-effort');
  const budget = $('#set-budget');
  const key = $('#set-key');
  const baseurl = $('#set-baseurl');
  const hint = $('#set-key-hint');
  const status = $('#set-status');

  let cfg = null;

  async function load() {
    status.textContent = '';
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || '读取失败');
      cfg = data.config;
      model.value = cfg.model === '（CLI 默认模型）' ? '' : (cfg.model || '');
      effort.value = cfg.effort === '默认' ? '' : (cfg.effort || '');
      budget.value = cfg.maxBudgetUsd || 6;
      baseurl.value = cfg.baseUrl || '';
      key.value = '';
      hint.textContent = cfg.hasApiKey
        ? `已保存密钥 ${cfg.apiKeyHint}（留空则不修改）`
        : '未保存密钥，当前使用 CLI 登录态';
    } catch (e) {
      status.textContent = '读取失败：' + e.message;
    }
  }

  btn.addEventListener('click', async () => {
    await load();
    dlg.showModal();
  });

  dlg.addEventListener('close', () => { /* 关闭即结束 */ });

  $('#set-save').addEventListener('click', async e => {
    e.preventDefault();
    status.textContent = '保存中…';
    const patch = {
      model: model.value.trim(),
      effort: effort.value,
      maxBudgetUsd: Number(budget.value) || 6,
      baseUrl: baseurl.value.trim(),
    };
    /* 留空 = 不修改密钥；只有填了才提交 */
    if (key.value.trim()) patch.apiKey = key.value.trim();

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || '保存失败');
      status.textContent = '已保存，下次生成生效';
      setTimeout(() => dlg.close(), 700);
    } catch (err) {
      status.textContent = '保存失败：' + err.message;
    }
  });
})();
