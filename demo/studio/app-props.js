'use strict';
/* 构件工坊 · 属性面板：可视化编辑代码里的字段（名称/分类/描述/碰撞体/参数默认值） */

/* ---------------- 属性面板（可视化编辑代码里的字段） ---------------- */

/* 从代码里解析元信息（名称/分类/描述/碰撞体）；解析失败的字段回退到 /api/kit 的值 */
function parseMeta(code, item) {
  const g = (re, def) => { const m = code.match(re); return m ? m[1] : def; };
  const colM = code.match(/collision:\s*\{([^}]*)\}/);
  let collision = { type: 'none' };
  if (colM) {
    const body = colM[1];
    const num = k => { const m = body.match(new RegExp(k + '\\s*:\\s*(-?[\\d.]+)')); return m ? parseFloat(m[1]) : undefined; };
    const type = (body.match(/type:\s*'([^']+)'/) || [])[1] || 'box';
    if (type === 'cylinder') collision = { type, radius: num('radius') ?? .35, height: num('height') ?? 2 };
    else collision = { type: 'box', w: num('w') ?? 1, d: num('d') ?? 1, h: num('h') ?? 1 };
  }
  return {
    name: g(/name:\s*'([^']*)'/, item.name),
    id: g(/id:\s*'([^']*)'/, item.id),
    category: g(/category:\s*'([^']*)'/, item.category),
    desc: g(/desc:\s*'([^']*)'/, item.desc || ''),
    collision,
  };
}

function fillProps(meta) {
  $('#p-name').value = meta.name;
  $('#p-id').value = meta.id;
  $('#p-cat').value = meta.category;
  $('#p-desc').value = meta.desc;
  const c = meta.collision || { type: 'none' };
  $('#p-col-type').value = c.type;
  $('#p-col-w').value = c.w ?? 1;
  $('#p-col-d').value = c.d ?? 1;
  $('#p-col-r').value = c.radius ?? .35;
  $('#p-col-h').value = c.height ?? c.h ?? 1;
  syncColInputs();
}

function syncColInputs() {
  const type = $('#p-col-type').value;
  const box = type === 'box', cyl = type === 'cylinder';
  $('#p-col-w-wrap').classList.toggle('hidden', !box);
  $('#p-col-d-wrap').classList.toggle('hidden', !box);
  $('#p-col-r-wrap').classList.toggle('hidden', !cyl);
  $('#p-col-h-wrap').classList.toggle('hidden', !(box || cyl));
  $('#p-col-h-wrap').querySelector('input').previousSibling; // noop
}
$('#p-col-type').addEventListener('change', syncColInputs);

/* 代码打补丁：改字符串字段 / 碰撞体 / 参数默认值 */
function patchStr(code, key, val) {
  const esc = String(val).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const re = new RegExp(`(\\b${key}\\s*:\\s*)'[^']*'`);
  if (re.test(code)) return code.replace(re, `$1'${esc}'`);
  return code;
}

function patchCollision(code, col) {
  const body = col.type === 'cylinder'
    ? `collision: { type: 'cylinder', radius: ${+col.radius}, height: ${+col.height} },`
    : `collision: { type: 'box', w: ${+col.w}, d: ${+col.d}, h: ${+col.h} },`;
  if (col.type === 'none') return code.replace(/\n\s*collision:\s*\{[^}]*\},?/, '');
  if (/collision:\s*\{[^}]*\}/.test(code)) return code.replace(/collision:\s*\{[^}]*\},?/, body);
  /* 没有 collision 字段：插到 draw( 之前 */
  return code.replace(/(\n\s*draw\s*\()/, `\n  ${body}$1`);
}

function patchParamDefaults(code, params) {
  let out = code;
  for (const [k, v] of Object.entries(params)) {
    const re = new RegExp(`(${k}\\s*:\\s*\\{[^}]*?\\bdef:\\s*)(-?[\\d.]+)`);
    out = out.replace(re, (m, p1) => p1 + String(+v));
  }
  return out;
}

function applyProps() {
  if (!state.meta) return;
  if (window.histPush) histPush('属性修改');
  const type = $('#p-col-type').value;
  const meta = {
    name: $('#p-name').value.trim() || state.meta.name,
    id: ($('#p-id').value.trim() || state.meta.id).replace(/[^a-z0-9-]/gi, '-').toLowerCase(),
    category: $('#p-cat').value,
    desc: $('#p-desc').value.trim(),
    collision: type === 'none' ? { type: 'none' }
      : type === 'cylinder'
        ? { type, radius: +$('#p-col-r').value || .3, height: +$('#p-col-h').value || 1 }
        : { type, w: +$('#p-col-w').value || 1, d: +$('#p-col-d').value || 1, h: +$('#p-col-h').value || 1 },
  };
  let code = state.code;
  code = patchStr(code, 'name', meta.name);
  code = patchStr(code, 'id', meta.id);
  code = patchStr(code, 'category', meta.category);
  code = patchStr(code, 'desc', meta.desc);
  code = patchCollision(code, meta.collision);

  state.code = code;
  state.meta = meta;
  $('#code').textContent = code;
  $('#cur-name').textContent = meta.name;
  $('#cur-desc').textContent = meta.desc || '（无描述）';
  $('#cur-id').textContent = meta.id;
  $('#cur-cat').textContent = CAT_NAME[meta.category] || meta.category;
  fillProps(meta);
  sendCode(null);
  setStatus('属性已写入代码，可「保存到构件库」落盘');
}

$('#btn-props-apply').addEventListener('click', applyProps);

/* 参数：把当前滑块值写回代码里的 def 默认值 */
$('#btn-save-defaults').addEventListener('click', () => {
  if (!Object.keys(state.params).length) return;
  if (window.histPush) histPush('参数默认值');
  state.code = patchParamDefaults(state.code, state.params);
  $('#code').textContent = state.code;
  $('#code').scrollTop = 0;
  setStatus('参数默认值已写入代码（预览不变），可保存落盘');
});

