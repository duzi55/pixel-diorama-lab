'use strict';
/* ------------------------------------------------------------------
 * 生成页逻辑
 *
 * 流程：填需求 → 生成 → 预览（iframe 沙箱）→ 确认保存
 * ------------------------------------------------------------------ */

const GEN = {
  component: null,
  generating: false,
};

const el = id => document.getElementById(id);

/* ---------------- 生成 ---------------- */

async function doGenerate() {
  if (GEN.generating) return;
  const prompt = el('prompt').value.trim();
  if (!prompt) {
    studioStatus('先写点需求吧', 'err');
    el('prompt').focus();
    return;
  }

  GEN.generating = true;
  el('btn-gen').disabled = true;
  el('btn-save').disabled = true;
  studioStatus('AI 生成中…（可能要几十秒）', 'busy');

  try {
    const data = await studioPost('/api/generate', {
      prompt,
      category: el('category').value || null,
      note: el('note').value.trim() || null,
    });

    GEN.component = data.component;
    el('code').textContent = data.component.code;
    el('notes').textContent = data.component.notes || '（无）';

    /* 送进预览沙箱 */
    const frame = el('frame');
    frame.src = 'preview.html';
    /* 等 iframe 加载完再 postMessage */
    frame.onload = () => {
      frame.contentWindow.postMessage({
        type: 'code',
        code: data.component.code,
        id: data.component.id,
        params: {},
        collision: data.component.collision,
      }, '*');
    };

    studioStatus('已生成：' + data.component.name, 'ok');
  } catch (e) {
    studioStatus('生成失败：' + e.message, 'err');
  } finally {
    GEN.generating = false;
    el('btn-gen').disabled = false;
  }
}

/* ---------------- 预览回执 ---------------- */

window.addEventListener('message', e => {
  const msg = e.data;
  if (!msg) return;

  if (msg.type === 'preview-ok') {
    el('preview-empty').style.display = 'none';
    el('btn-save').disabled = false;
    studioStatus('预览就绪：' + (msg.name || msg.id), 'ok');
    return;
  }

  if (msg.type === 'preview-error') {
    el('preview-empty').style.display = '';
    el('preview-empty').textContent = '预览失败：' + msg.error;
    studioStatus('预览失败：' + msg.error, 'err');
  }
});

/* ---------------- 保存 ---------------- */

async function doSave() {
  if (!GEN.component) return;
  el('btn-save').disabled = true;
  studioStatus('保存中…', 'busy');

  try {
    const data = await studioPost('/api/save', {
      component: GEN.component,
      overwrite: el('overwrite').checked,
    });
    studioStatus('已保存 → ' + data.files.join(' , '), 'ok');
  } catch (e) {
    studioStatus('保存失败：' + e.message, 'err');
    el('btn-save').disabled = false;
  }
}

/* ---------------- 绑定 ---------------- */

el('btn-gen').addEventListener('click', doGenerate);
el('btn-save').addEventListener('click', doSave);

el('btn-reload').addEventListener('click', () => {
  if (!GEN.component) return;
  const frame = el('frame');
  frame.src = 'preview.html';
  frame.onload = () => {
    frame.contentWindow.postMessage({
      type: 'code',
      code: GEN.component.code,
      id: GEN.component.id,
      params: {},
      collision: GEN.component.collision,
    }, '*');
  };
});

el('spin').addEventListener('change', e => {
  const frame = el('frame');
  if (frame.contentWindow) frame.contentWindow.postMessage({ type: 'spin', on: e.target.checked }, '*');
});

el('showbox').addEventListener('change', e => {
  const frame = el('frame');
  if (frame.contentWindow) frame.contentWindow.postMessage({ type: 'box', on: e.target.checked }, '*');
});

/* Ctrl/Cmd + Enter 快捷生成 */
el('prompt').addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') doGenerate();
});

/* 示例按钮 */
for (const b of document.querySelectorAll('.ex')) {
  b.addEventListener('click', () => {
    el('prompt').value = b.dataset.p;
    el('prompt').focus();
  });
}
