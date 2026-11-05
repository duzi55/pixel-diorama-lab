'use strict';
/* ------------------------------------------------------------------
 * 编辑器 · 属性面板（editor-props.js）
 *
 * 选中物体后显示：位置 / 朝向 / 缩放 / 层级 / 构件参数 / 行为逻辑 / 操作。
 * 多选时显示批量操作。
 * ------------------------------------------------------------------ */

function ED_refreshSel() {
  const info = document.getElementById('sel-info');
  const colSec = document.getElementById('col-sec');
  if (!info) return;
  const list = ED_selectionList();

  if (!list.length) {
    info.innerHTML = '<div class="empty-note">用「选择」工具点物体；空白处拖拽可框选，Shift 加选</div>';
    if (colSec) colSec.style.display = 'none';
    const sel = document.getElementById('sel');
    if (sel) sel.textContent = '未选中';
    return;
  }

  /* ---- 多选：批量操作 ---- */
  if (list.length > 1) {
    if (colSec) colSec.style.display = 'none';
    const sel = document.getElementById('sel');
    if (sel) sel.textContent = `选中 ${list.length} 个`;
    info.innerHTML = `<div class="hint" style="margin-bottom:8px">已选中 <b>${list.length}</b> 个物体</div>`;

    const mkRow = (title, items) => {
      const sub = document.createElement('div');
      sub.className = 'prop-sub';
      sub.textContent = title;
      info.appendChild(sub);
      const row = document.createElement('div');
      row.className = 'pill-row';
      for (const [label, fn] of items) {
        const b = document.createElement('button');
        b.className = 'pill';
        b.textContent = label;
        b.addEventListener('click', fn);
        row.appendChild(b);
      }
      info.appendChild(row);
    };

    mkRow('对齐', [
      ['左', () => ED_align('left')],
      ['↔中', () => ED_align('cx')],
      ['右', () => ED_align('right')],
      ['上', () => ED_align('top')],
      ['↕中', () => ED_align('cy')],
      ['下', () => ED_align('bottom')],
    ]);
    mkRow('等距分布', [
      ['沿 X', () => ED_distribute('x')],
      ['沿 Y', () => ED_distribute('y')],
    ]);
    mkRow('编组', [
      ['编组 ⌘G', ED_groupSelection],
      ['解组 ⇧⌘G', ED_ungroupSelection],
    ]);
    mkRow('操作', [
      ['复制 ⌘D', ED_duplicateSelection],
      ['删除 Del', ED_deleteSelection],
    ]);
    return;
  }

  /* ---- 单选 ---- */
  const o = ED.selected;
  const comp = KIT.get(o.kind);
  if (colSec) colSec.style.display = '';
  const sel = document.getElementById('sel');
  if (sel) sel.textContent = `${comp ? comp.name : o.kind} @ (${o.x.toFixed(1)}, ${o.y.toFixed(1)})`;

  info.innerHTML = '';
  info.appendChild(ED_kv('ID', o.kind));

  /* 位置 */
  const posRow = document.createElement('div');
  posRow.className = 'prop-row';
  for (const axis of ['x', 'y']) {
    const lab = document.createElement('label');
    lab.textContent = axis.toUpperCase();
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.step = '0.25';
    inp.value = String(Math.round(o[axis] * 100) / 100);
    inp.addEventListener('change', () => {
      const v = Number(inp.value);
      if (!Number.isFinite(v)) return;
      ED_snapshot('修改位置');
      o[axis] = v;
      o.z = ED.baseMap ? 0 : TERRAIN.heightAt(o.x, o.y);
      ED.dirty = true;
      ED_refreshObjects();
    });
    lab.appendChild(inp);
    posRow.appendChild(lab);
  }
  info.appendChild(posRow);

  /* 朝向 */
  const deg = Math.round((((o.rot || 0) * 180 / Math.PI) + 360) % 360);
  const rotWrap = document.createElement('div');
  rotWrap.className = 'slider';
  rotWrap.innerHTML = `<label>朝向 <b>${deg}°</b></label>`;
  const rotIn = document.createElement('input');
  rotIn.type = 'range'; rotIn.min = '0'; rotIn.max = '359'; rotIn.step = '5'; rotIn.value = String(deg);
  rotIn.addEventListener('input', e => {
    ED_snapshotThrottled('修改朝向');
    o.rot = Number(e.target.value) * Math.PI / 180;
    rotWrap.querySelector('b').textContent = e.target.value + '°';
    ED.dirty = true;
  });
  rotWrap.appendChild(rotIn);
  info.appendChild(rotWrap);

  /* 缩放（碰撞体按默认值 × 缩放重算） */
  const sc0 = (o.scale == null || !Number.isFinite(o.scale) || o.scale <= 0) ? 1 : o.scale;
  const defCol = comp && comp.collision ? comp.collision : null;
  const scaleWrap = document.createElement('div');
  scaleWrap.className = 'slider';
  scaleWrap.innerHTML = `<label>缩放 <b>×${sc0.toFixed(2)}</b></label>`;
  const scIn = document.createElement('input');
  scIn.type = 'range'; scIn.min = '0.2'; scIn.max = '4'; scIn.step = '0.05'; scIn.value = String(sc0);
  scIn.addEventListener('input', e => {
    ED_snapshotThrottled('修改缩放');
    const v = Number(e.target.value);
    o.scale = v;
    scaleWrap.querySelector('b').textContent = '×' + v.toFixed(2);
    if (o.collision && defCol) {
      const r = Math.round(v * 100) / 100;
      if (o.collision.type === 'cylinder') {
        o.collision.radius = Math.round(defCol.radius * r * 100) / 100;
        o.collision.height = Math.round(defCol.height * r * 100) / 100;
      } else {
        o.collision.w = Math.round((defCol.w || defCol.width || 1) * r * 100) / 100;
        o.collision.d = Math.round((defCol.d || defCol.depth || 1) * r * 100) / 100;
        o.collision.h = Math.round((defCol.h || defCol.height || 1) * r * 100) / 100;
      }
    }
    ED.dirty = true;
  });
  scaleWrap.appendChild(scIn);
  info.appendChild(scaleWrap);

  /* 层级 */
  const zWrap = document.createElement('div');
  zWrap.className = 'slider';
  zWrap.innerHTML = `<label>层级 <b>${o.zOrder || 0}（0 = 自动）</b></label>`;
  const zIn = document.createElement('input');
  zIn.type = 'range'; zIn.min = '-9'; zIn.max = '9'; zIn.step = '1'; zIn.value = String(o.zOrder || 0);
  zIn.addEventListener('input', e => {
    ED_snapshotThrottled('修改层级');
    o.zOrder = Number(e.target.value);
    zWrap.querySelector('b').textContent = `${o.zOrder}（${o.zOrder ? '强制' : '自动'}）`;
    ED.dirty = true;
    ED_refreshObjects();
  });
  zWrap.appendChild(zIn);
  info.appendChild(zWrap);

  const zBtns = document.createElement('div');
  zBtns.className = 'pill-row';
  for (const [label, v] of [['⬆ 置顶', 9], ['⬇ 置底', -9], ['↺ 自动', 0]]) {
    const b = document.createElement('button');
    b.className = 'pill';
    b.textContent = label;
    b.addEventListener('click', () => {
      o.zOrder = v;
      zIn.value = String(v);
      zWrap.querySelector('b').textContent = `${v}（${v ? '强制' : '自动'}）`;
      ED.dirty = true;
      ED_refreshObjects();
    });
    zBtns.appendChild(b);
  }
  info.appendChild(zBtns);

  /* 构件参数（全量） */
  const params = comp && comp.params ? comp.params : null;
  if (params && Object.keys(params).length) {
    const h = document.createElement('div');
    h.className = 'prop-sub';
    h.textContent = '构件参数';
    info.appendChild(h);
    for (const [k, def] of Object.entries(params)) {
      const cur = o.params && o.params[k] != null ? o.params[k] : def.def;
      const w = document.createElement('div');
      w.className = 'slider';
      w.innerHTML = `<label>${ED_esc(def.desc || k)} <code>${ED_esc(k)}</code> <b>${cur}</b></label>`;
      const inp = document.createElement('input');
      inp.type = 'range';
      inp.min = String(def.min); inp.max = String(def.max); inp.step = String(def.step); inp.value = String(cur);
      inp.addEventListener('input', e => {
        ED_snapshotThrottled('修改参数 ' + k);
        const v = Number(e.target.value);
        o.params = o.params || {};
        o.params[k] = v;
        w.querySelector('b').textContent = String(v);
        ED.dirty = true;
      });
      w.appendChild(inp);
      info.appendChild(w);
    }
  }

  /* 行为逻辑 */
  const beh = comp && comp.behavior ? comp.behavior : null;
  if (beh && typeof KIT_BEHAVIOR !== 'undefined') {
    const h = document.createElement('div');
    h.className = 'prop-sub';
    h.textContent = '行为逻辑';
    info.appendChild(h);

    const cur = o.behaviors || (beh.default && beh.default.length ? beh.default : []);
    if (!cur.length) {
      const note = document.createElement('div');
      note.className = 'hint';
      note.textContent = '未挂行为';
      info.appendChild(note);
    }
    for (const b of cur) {
      const d = KIT_BEHAVIOR.get(b.id);
      const row = document.createElement('div');
      row.className = 'beh-row';
      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = d ? d.label : b.id;
      nm.title = d ? (d.desc || '') : b.id;
      row.appendChild(nm);
      const rm = document.createElement('button');
      rm.className = 'mini';
      rm.textContent = '×';
      rm.title = '移除';
      rm.addEventListener('click', () => {
        o.behaviors = cur.filter(x => x !== b);
        ED_BEHAVIOR_APPLY(o);
        ED_refreshSel();
      });
      row.appendChild(rm);
      info.appendChild(row);
    }

    const allow = (beh.allow || []).filter(id => !cur.some(b => b.id === id));
    if (allow.length) {
      const add = document.createElement('select');
      add.innerHTML = '<option value="">＋ 添加行为…</option>'
        + allow.map(id => {
          const d = KIT_BEHAVIOR.get(id);
          return `<option value="${ED_esc(id)}">${ED_esc(d ? d.label : id)}</option>`;
        }).join('');
      add.addEventListener('change', () => {
        if (!add.value) return;
        o.behaviors = [...cur, { id: add.value, params: {} }];
        ED_BEHAVIOR_APPLY(o);
        ED_refreshSel();
      });
      info.appendChild(add);
    }
  }

  /* 操作 */
  const ops = document.createElement('div');
  ops.className = 'pill-row';
  for (const [label, fn] of [['复制', ED_duplicateSelection], ['删除', ED_deleteSelection], ['解组', ED_ungroupSelection]]) {
    const b = document.createElement('button');
    b.className = 'pill';
    b.textContent = label;
    b.addEventListener('click', fn);
    ops.appendChild(b);
  }
  info.appendChild(ops);
}

/** 行为变更后重新挂载（清 anim 缓存） */
function ED_BEHAVIOR_APPLY(o) {
  if (typeof KIT_BEHAVIOR === 'undefined') return;
  o.anim = null;
  try { KIT_BEHAVIOR.attach(o); } catch { /* 行为定义异常不阻塞编辑 */ }
  ED.dirty = true;
}
