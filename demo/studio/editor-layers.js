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

  const list = [...ED.objects].sort(ED_compareDraw).reverse();

  /* 分组折叠：有 group 的物体收进可折叠区块 */
  if (!ED.collapsedGroups) ED.collapsedGroups = new Set();
  const groups = new Map();
  const loose = [];
  for (const o of list) {
    if (!o.group) { loose.push(o); continue; }
    if (!groups.has(o.group)) groups.set(o.group, []);
    groups.get(o.group).push(o);
  }

  const mkRow = o => ED_layerRow(o);

  for (const o of loose) box.appendChild(mkRow(o));

  for (const [gid, items] of groups) {
    const head = document.createElement('div');
    head.className = 'layer-group';
    const collapsed = ED.collapsedGroups.has(gid);
    head.innerHTML = `<span class="chev">${collapsed ? '▸' : '▾'}</span> 组 ${gid} <span class="pos">(${items.length})</span>`;
    head.addEventListener('click', () => {
      if (collapsed) ED.collapsedGroups.delete(gid);
      else ED.collapsedGroups.add(gid);
      ED_refreshObjects();
    });
    box.appendChild(head);
    if (!collapsed) for (const o of items) box.appendChild(mkRow(o));
  }
}

/** 单行图层 */
function ED_layerRow(o) {
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
    nm.textContent = o.label || (comp ? comp.name : o.kind);
    nm.title = `${o.kind} · zOrder ${o.zOrder || 0}（双击重命名）`;
    /* 双击重命名 */
    nm.addEventListener('dblclick', e => {
      e.stopPropagation();
      const v = prompt('图层名称', o.label || (comp ? comp.name : o.kind));
      if (v == null) return;
      if (v.trim()) o.label = v.trim();
      else delete o.label;
      ED_refreshObjects();
    });

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

    /* 拖拽排序：拖到目标行上，层级对齐到目标 */
    row.draggable = true;
    row.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', o.id);
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => row.classList.remove('dragging'));
    row.addEventListener('dragover', e => { e.preventDefault(); row.classList.add('drop-on'); });
    row.addEventListener('dragleave', () => row.classList.remove('drop-on'));
    row.addEventListener('drop', e => {
      e.preventDefault();
      row.classList.remove('drop-on');
      const srcId = e.dataTransfer.getData('text/plain');
      const src = ED.objects.find(x => x.id === srcId);
      if (src && src !== o) ED_layerDrop(src, o);
    });

    row.addEventListener('click', e => ED_select(o, { additive: e.shiftKey }));
    return row;
}

/** 层级微调：zOrder ±1（范围 -9..9，0 = 自动） */
function ED_layerMove(o, dir) {
  ED_snapshot('调整层级');
  o.zOrder = clamp((o.zOrder || 0) + dir, -9, 9);
  ED.dirty = true;
  ED_refreshObjects();
  const comp = KIT.get(o.kind);
  studioStatus(`「${comp ? comp.name : o.kind}」层级 ${o.zOrder}`);
}


/** 拖拽排序：把 src 插到 target 的位置，冻结全部 order */
function ED_layerDrop(src, target) {
  ED_snapshot('拖拽排序');
  const list = [...ED.objects].sort(ED_compareDraw).reverse();   /* 显示顺序 */
  const si = list.indexOf(src), ti = list.indexOf(target);
  if (si < 0 || ti < 0 || si === ti) return;

  list.splice(si, 1);
  list.splice(ti, 0, src);
  const n = list.length;
  list.forEach((o, i) => { o.order = n - i; });   /* 列表从上到下：order 递减 */

  ED.dirty = true;
  ED_refreshObjects();
  const comp = KIT.get(src.kind);
  studioStatus(`「${comp ? comp.name : src.kind}」移到第 ${ti + 1} 层`);
}
