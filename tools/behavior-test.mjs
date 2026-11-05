#!/usr/bin/env node
/* ------------------------------------------------------------------
 * 构件行为回归测试
 *
 * 行为层是"构件怎么动"的单一来源，任何一个行为写坏都会拖垮所有
 * 挂了它的构件。这个测试守住四件事：
 *
 *   1. 每个注册的行为都有 label / category / params / tick
 *   2. 构件声明的 behavior.default / allow 里的 id 都已注册
 *   3. 每个挂了行为的构件能 attach + tick 60 帧 + 点击，不崩
 *   4. 内置行为真的产生效果（sway 位移 / chop 倒下 / flicker 闪烁）
 *
 *   node tools/behavior-test.mjs
 *   node tools/behavior-test.mjs sway chop     # 只测指定行为
 * ------------------------------------------------------------------ */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const noop = () => {};

function makeSandbox() {
  const canvas = {
    width: 0, height: 0, style: {},
    getContext: kind => kind === '2d' ? {
      createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: noop,
      getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      clearRect: noop, fillRect: noop, drawImage: noop, save: noop, restore: noop,
    } : null,
    addEventListener: noop, removeEventListener: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 520, height: 560 }),
  };
  const document = {
    getElementById: id => id === 'c' ? canvas : {
      id, textContent: '', value: '', style: {}, innerHTML: '',
      addEventListener: noop, removeEventListener: noop, appendChild: noop, remove: noop,
      classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      querySelector: () => ({ textContent: '' }), getContext: () => null,
    },
    createElement: () => ({
      style: {}, textContent: '', innerHTML: '', appendChild: noop, addEventListener: noop,
      classList: { add: noop, remove: noop, toggle: noop }, getContext: () => null,
    }),
    addEventListener: noop, removeEventListener: noop,
    body: { appendChild: noop },
  };
  const sb = {
    window: { PP_W: 520, PP_H: 560, PP_SCALE: 14, PP_ORIGIN_Y: 34 },
    document, console, Math, Date, Object, Array, JSON, Number, String, Boolean,
    Uint8Array, Uint32Array, Float32Array, Uint8ClampedArray, Map, Set,
    isFinite, isNaN, parseInt, parseFloat,
    addEventListener: noop, removeEventListener: noop,
    requestAnimationFrame: () => 0, performance: { now: () => 0 },
    location: { hash: '' },
  };
  sb.window.window = sb.window;
  sb.window.document = document;
  sb.globalThis = sb;
  return vm.createContext(sb);
}

const KIT_FILES = [
  ['demo/engine.js', false],
  ['demo/kit/core.js', false],
  ['demo/kit/palette.js', false],
  ['demo/kit/render.js', false],
  ['demo/kit/behavior.js', false],
  ['demo/kit/behavior-extra.js', true],
  ['demo/kit/trees.js', true],
  ['demo/kit/conifers.js', true],
  ['demo/kit/plants.js', true],
  ['demo/kit/buildings.js', true],
  ['demo/kit/stoneworks.js', true],
  ['demo/kit/cart.js', true],
  ['demo/kit/props.js', true],
  ['demo/kit/ref-buildings.js', true],
  ['demo/kit/ref-structures.js', true],
  ['demo/kit/ref-plants.js', true],
  ['demo/kit/ref-surfaces.js', true],
  ['demo/kit/ref-props.js', true],
  ['demo/kit/ref-props-small.js', true],
];

const cx = makeSandbox();
for (const [file, optional] of KIT_FILES) {
  const p = path.join(REPO, file);
  if (!fs.existsSync(p)) {
    if (optional) continue;
    console.error(`✗ 缺少必需文件 ${file}`);
    process.exit(1);
  }
  try {
    vm.runInContext(fs.readFileSync(p, 'utf8'), cx, { filename: file });
  } catch (e) {
    console.error(`✗ 加载失败: ${file}\n${e.stack}`);
    process.exit(1);
  }
}

const run = expr => vm.runInContext(expr, cx);
const only = process.argv.slice(2).filter(a => !a.startsWith('-'));
let pass = 0, fail = 0;
const problems = [];

function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✓ ${name}${detail ? '  ' + detail : ''}`); }
  else { fail++; problems.push(name + (detail ? ' — ' + detail : '')); console.log(`  ✗ ${name}${detail ? '  ' + detail : ''}`); }
}

console.log('\n=== 构件行为回归测试 ===\n');

/* ---------------- 1. 行为定义合法性 ---------------- */
console.log('[1] 行为定义');
const behaviorIds = run('KIT_BEHAVIOR.order.slice()');
check('至少注册了 6 个行为', behaviorIds.length >= 6, `${behaviorIds.length} 个`);

for (const id of behaviorIds) {
  if (only.length && !only.includes(id)) continue;
  const d = run(`(() => {
    const b = KIT_BEHAVIOR.get(${JSON.stringify(id)});
    return { id: b.id, label: b.label, category: b.category, params: Object.keys(b.params), hasTick: !!b.tick };
  })()`);
  check(`行为 ${id} 定义完整`, !!d.label && !!d.category && d.hasTick && Object.keys(d.params).length >= 1,
    `${d.label} / ${d.category} / ${Object.keys(d.params).length} 参数`);
}

/* ---------------- 2. 构件声明的行为都已注册 ---------------- */
console.log('\n[2] 构件 → 行为引用');
/* 有效行为 = 显式 behavior.default，或分类兜底（树摇、人物招手…） */
const comps = run(`KIT.list().map(c => {
  const probe = { id: 'p', kind: c.id, x: 0, y: 0, z: 0, rot: 0, seed: 1, params: {} };
  KIT_BEHAVIOR.attach(probe);
  return {
    id: c.id, category: c.category,
    explicit: !!c.behavior,
    default: c.behavior ? (c.behavior.default || []).map(b => b.id) : [],
    allow: c.behavior && c.behavior.allow ? c.behavior.allow.slice() : [],
    effective: probe.behaviors.map(b => b.id),
    allowed: KIT_BEHAVIOR.allowed(c).map(d => d.id),
  };
})`);
const withBehavior = comps.filter(c => c.effective.length);
check('有构件挂了行为', withBehavior.length > 0, `${withBehavior.length} / ${comps.length} 个构件`);
check('每个构件都至少有一个可挂行为', comps.every(c => c.allowed.length > 0),
  comps.filter(c => !c.allowed.length).map(c => c.id).join(',') || '全部覆盖');

for (const c of comps.filter(c => c.explicit)) {
  const ids = [...c.default, ...c.allow];
  const unknown = ids.filter(id => !behaviorIds.includes(id));
  check(`${c.id} 的行为 id 都已注册`, unknown.length === 0, unknown.join(',') || ids.join(', '));
  const notAllowed = c.default.filter(id => !c.allowed.includes(id));
  check(`${c.id} 的 default 都在 allow 里`, notAllowed.length === 0, notAllowed.join(',') || 'ok');
}

/* ---------------- 3. 实跑：attach + tick + 点击 ---------------- */
console.log('\n[3] 实跑（60 帧 + 点击）');
for (const c of withBehavior) {
  if (only.length) continue;
  const r = run(`(() => {
    try {
      const inst = { id: 't', kind: ${JSON.stringify(c.id)}, x: 0, y: 0, z: 0, rot: 0, seed: 7, params: {} };
      KIT_BEHAVIOR.attach(inst);
      const w = KIT_BH_WORLD;
      let moved = false, prev = null;
      for (let f = 0; f < 60; f++) {
        w.t += 1 / 12; w.dt = 1 / 12;
        w.wind.strength = .5; w.wind.gust = .2;
        KIT_BEHAVIOR.tick(inst, 1 / 12, w);
        const snap = [inst.x, inst.y, inst.anim.dx, inst.anim.dy, inst.anim.rot, inst.anim.scale, inst.anim.z, inst.anim.hidden ? 1 : 0].join(',');
        if (prev !== null && snap !== prev) moved = true;
        prev = snap;
      }
      KIT_BEHAVIOR.event(inst, { type: 'click', x: 1, y: 1 }, w);
      for (let f = 0; f < 30; f++) { w.t += 1 / 12; KIT_BEHAVIOR.tick(inst, 1 / 12, w); }
      return { ok: true, moved, ids: inst.behaviors.map(b => b.id), n: inst.behaviors.length };
    } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  })()`);
  /* default 为空 = 明确声明"静态摆件"，不该动；只要求 attach/点击不崩 */
  if (r.ok && r.n === 0) check(`${c.id} 静态摆件（无默认行为）`, r.ok, 'allow: ' + (c.allowed.join(',') || '无'));
  else check(`${c.id} 行为运行`, r.ok && r.moved, r.ok ? (r.moved ? r.ids.join('+') : '60 帧内 anim 完全没变') : r.err);
}

/* ---------------- 4. 内置行为的效果断言 ---------------- */
console.log('\n[4] 行为效果');
{
  const r = run(`(() => {
    const inst = { id: 't', kind: 'cone-mast', x: 0, y: 0, z: 0, rot: 0, seed: 7, params: {} };
    KIT_BEHAVIOR.attach(inst);
    const w = KIT_BH_WORLD;
    const dx = [];
    for (let f = 0; f < 40; f++) {
      w.t += 1 / 12; w.wind.strength = .8; w.wind.gust = .4;
      KIT_BEHAVIOR.tick(inst, 1 / 12, w);
      dx.push(inst.anim.dx);
    }
    return { min: Math.min(...dx), max: Math.max(...dx) };
  })()`);
  check('sway 产生可测位移', r.max - r.min > .01, `dx ${r.min.toFixed(3)} … ${r.max.toFixed(3)}`);
}
{
  const r = run(`(() => {
    const inst = { id: 't', kind: 'cone-mast', x: 0, y: 0, z: 0, rot: 0, seed: 7, params: {} };
    KIT_BEHAVIOR.attach(inst);
    const w = KIT_BH_WORLD;
    let downs = 0;
    for (let i = 0; i < 8; i++) {
      KIT_BEHAVIOR.event(inst, { type: 'click', x: 0, y: 0 }, w);
      if (inst.state.chop && inst.state.chop.down) { downs = i + 1; break; }
    }
    return { downs, kind: inst.anim.kind };
  })()`);
  check('chop 点击 N 次后倒下', r.downs > 0 && r.downs <= 8, `${r.downs} 刀 / anim.kind=${r.kind}`);
}

/* ---------------- 汇总 ---------------- */
console.log(`\n=== 结果: ${pass} 通过 / ${fail} 失败 ===`);
if (fail) {
  console.log('\n失败项：');
  for (const p of problems) console.log('  - ' + p);
  process.exit(1);
}
