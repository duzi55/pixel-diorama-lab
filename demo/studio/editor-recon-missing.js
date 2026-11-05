'use strict';
/* ------------------------------------------------------------------
 * 图片还原 · 缺失素材（editor-recon-missing.js）
 *
 * 从 editor-recon.js 拆出（500 行约束）：
 *   候选匹配（分类 + 中英文 2-gram）· 选择替代 / 生成新素材 / 放到场景
 * ------------------------------------------------------------------ */

/* ---------------- 缺失素材 ---------------- */

let MISSING_PICK = new Map();   /* missing 索引 → 用户选中的 kind */

/** 中英文 2-gram / 词：用于候选匹配 */
function reconBigrams(text) {
  const t = String(text || '').toLowerCase();
  const out = new Set();
  for (const seg of t.match(/[一-龥]+|[a-z0-9]{3,}/g) || []) {
    if (/^[一-龥]+$/.test(seg)) {
      for (let i = 0; i < seg.length - 1; i++) out.add(seg.slice(i, i + 2));
    } else out.add(seg);
  }
  return out;
}

/** 给一个 missing 项排候选：同分类 +8，关键词每命中 +2 */
function reconCandidates(m, limit) {
  const q = reconBigrams(m.name + ' ' + m.brief + ' ' + (m.reason || ''));
  return KIT.list()
    .map(c => {
      const hay = (c.id + ' ' + c.name + ' ' + (c.desc || '')).toLowerCase();
      let score = c.category === m.category ? 8 : 0;
      for (const g of q) if (hay.includes(g)) score += 2;
      return { comp: c, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit || 6)
    .map(x => x.comp);
}


function reconRenderMissing(list) {
  const box = reconEl('recon-result');
  MISSING_PICK = new Map();
  if (!list.length) {
    box.innerHTML = '<div class="hint">画面元素都在现有素材库里，没有缺的。</div>';
    return;
  }
  box.innerHTML = `<div class="hint" style="margin-bottom:4px">
    素材库缺 ${list.length} 项 —— 选一个现有素材放上去，或生成新素材：</div>`;

  list.forEach((m, i) => {
    const row = document.createElement('div');
    row.className = 'recon-missing';

    const head = document.createElement('div');
    head.className = 'recon-missing-head';
    head.innerHTML = `<b>${esc(m.name)}</b>
      <span class="why">${esc(m.category)} · ${esc(m.reason || m.brief || '')}</span>`;
    row.appendChild(head);

    /* 候选：同分类优先 + 关键词重合（纯前端，无依赖） */
    const cands = document.createElement('div');
    cands.className = 'recon-cands';
    for (const c of reconCandidates(m)) {
      const b = document.createElement('button');
      b.className = 'cand';
      b.textContent = c.name;
      b.title = `${c.id} · ${c.desc || ''}`;
      b.addEventListener('click', () => {
        for (const x of cands.children) x.classList.remove('on');
        b.classList.add('on');
        MISSING_PICK.set(i, c.id);
      });
      cands.appendChild(b);
    }
    row.appendChild(cands);

    const actions = document.createElement('div');
    actions.className = 'recon-actions';

    const place = document.createElement('button');
    place.className = 'primary';
    place.textContent = '放到场景';
    place.addEventListener('click', () => {
      const kind = MISSING_PICK.get(i);
      if (!kind) { studioStatus('先选一个候选素材', 'err'); return; }
      reconPlace(m, kind);
      place.textContent = '已放置 ✓';
      place.disabled = true;
    });
    actions.appendChild(place);

    const gen = document.createElement('button');
    gen.textContent = '生成新素材';
    gen.addEventListener('click', () => reconGenerate(m, gen));
    actions.appendChild(gen);

    row.appendChild(actions);
    box.appendChild(row);
  });
}

/** 用候选素材替换缺失项：位置沿用 AI 给的 u/v（缺省放中心偏下） */
function reconPlace(m, kind) {
  const comp = KIT.get(kind);
  if (!comp) { studioStatus('构件不存在: ' + kind, 'err'); return; }
  const u = m.u == null ? .5 : m.u;
  const v = m.v == null ? .58 : m.v;
  const g = unproject(u * W, v * H);
  const x = Math.round(g.x * 4) / 4, y = Math.round(g.y * 4) / 4;

  const obj = {
    id: 'o' + (ED.nextId++),
    kind,
    x, y,
    z: TERRAIN.heightAt(x, y),
    rot: m.rot || 0,
    scale: m.scale || 1,
    params: KIT.defaults(kind),
    seed: Math.floor(hash(ED.nextId * 17, 91) * 100000) + 1,
    collision: comp.collision ? { ...comp.collision } : null,
  };
  ED.objects.push(obj);
  ED_collectLights();
  ED_refreshObjects();
  ED_select(obj);
  ED.dirty = true;
  studioStatus(`已用「${comp.name}」替代「${m.name}」`);
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

