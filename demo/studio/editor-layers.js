'use strict';
/* ------------------------------------------------------------------
 * 编辑器 · 图层面板（editor-layers.js）
 *
 * 对象列表 = 图层列表：
 *   眼睛  显示/隐藏（hidden 不渲染、不参与命中）
 *   锁    锁定（locked 不可选、不可拖）
 *   ↑↓    层级微调（zOrder ±1）
 *   点击  选中（Shift 加选）
 *
 * 排序与绘制一致：zOrder 大 / y 大 = 更靠前 = 列表更靠上。
 * ------------------------------------------------------------------ */

function ED_refreshObjects() {
  const box = document.getElementById('obj-list');
  if (!box) return;
  const count = document.getElementById('obj-count');
  if (count) count.textContent = ED.objects.length ? `(${ED.objects.length})` : '';
  box.innerHTML = '';

  if (!ED.objects.length) {
    box.innerHTML = '<div class="empty-note">还没有物体。选一个构件再点画布。</div>';
    return;
  }

  const list = [...ED.objects].sort((a, b) =>
    ((b.zOrder || 0) - (a.zOrder || 0)) || (b.y - a.y));

  for (const o of list) {
    const comp = KIT.get(o.kind);
    const row = document.createElement('div');
    row.dataset.id = o.id;
    row.className = 'layer-row'
      + (ED_isSelected(o) ? ' on' : '')
      + (o.hidden ? ' hidden' : '')
      + (o.locked ? ' locked' : '');

    const eye = document.createElement('button');
    eye.className = 'lyr-btn lyr-eye';
    eye.textContent = o.hidden ? '◌' : '◉';
    eye.title = o.hidden ? '显示' : '隐藏';
    eye.addEventListener('click', e => {
      e.stopPropagation();
      o.hidden = !o.hidden;
      ED.dirty = true;
      ED_refreshObjects();
    });

    const lock = document.createElement('button');
    lock.className = 'lyr-btn lyr-lock';
    lock.textContent = o.locked ? '▣' : '▢';
    lock.title = o.locked ? '解锁' : '锁定';
    lock.addEventListener('click', e => {
      e.stopPropagation();
      o.locked = !o.locked;
      if (o.locked && ED_isSelected(o)) {
        ED.selection.delete(o);
        if (ED.selected === o) ED.selected = ED_selectionList()[0] || null;
        ED_refreshSel();
      }
      ED_refreshObjects();
    });

    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = comp ? comp.name : o.kind;
    nm.title = `${o.kind} · zOrder ${o.zOrder || 0}`;

    const pos = document.createElement('span');
    pos.className = 'pos';
    pos.textContent = `${o.x.toFixed(1)},${o.y.toFixed(1)}`;

    row.appendChild(eye);
    row.appendChild(lock);
    row.appendChild(nm);
    row.appendChild(pos);

    const up = document.createElement('button');
    up.className = 'lyr-btn lyr-up';
    up.textContent = '↑';
    up.title = '上移一层';
    up.addEventListener('click', e => { e.stopPropagation(); ED_layerMove(o, +1); });

    const down = document.createElement('button');
    down.className = 'lyr-btn lyr-down';
    down.textContent = '↓';
    down.title = '下移一层';
    down.addEventListener('click', e => { e.stopPropagation(); ED_layerMove(o, -1); });

    row.appendChild(up);
    row.appendChild(down);

    row.addEventListener('click', e => ED_select(o, { additive: e.shiftKey }));
    box.appendChild(row);
  }
}

/** 层级微调：zOrder ±1（范围 -9..9，0 = 自动） */
function ED_layerMove(o, dir) {
  o.zOrder = clamp((o.zOrder || 0) + dir, -9, 9);
  ED.dirty = true;
  ED_refreshObjects();
  const comp = KIT.get(o.kind);
  studioStatus(`「${comp ? comp.name : o.kind}」层级 ${o.zOrder}`);
}
