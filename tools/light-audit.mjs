#!/usr/bin/env node
/* ------------------------------------------------------------------
 * 光照跟随审计
 *
 * 构件不该"自带光源"：面亮度必须由场景的 LIGHT.dir 决定。
 * 这个脚本对每个构件用两种光照方向各画一次，统计像素差异：
 *   - 差异大：明暗面确实跟着光源转
 *   - 差异≈0：要么全是自发光（灯罩/窗），要么把亮度写死了
 *
 *   node tools/light-audit.mjs            # 全量，列出差异最小的
 *   node tools/light-audit.mjs --all      # 全量明细
 * ------------------------------------------------------------------ */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const noop = () => {};

const canvas = {
  width: 0, height: 0, style: {},
  getContext: k => k === '2d' ? {
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
  addEventListener: noop, removeEventListener: noop, body: { appendChild: noop },
};
const sb = {
  window: { PP_W: 520, PP_H: 560, PP_SCALE: 14, PP_ORIGIN_Y: 34 },
  document, console, Math, Date, Object, Array, JSON, Number, String, Boolean,
  Uint8Array, Uint32Array, Float32Array, Uint8ClampedArray, Map, Set,
  isFinite, isNaN, parseInt, parseFloat,
  addEventListener: noop, removeEventListener: noop,
  requestAnimationFrame: () => 0, performance: { now: () => 0 }, location: { hash: '' },
};
sb.globalThis = sb;
const cx = vm.createContext(sb);

const FILES = [
  'demo/engine.js', 'demo/kit/core.js', 'demo/kit/palette.js', 'demo/kit/render.js',
  'demo/kit/trees.js', 'demo/kit/conifers.js', 'demo/kit/plants.js',
  'demo/kit/buildings.js', 'demo/kit/stoneworks.js', 'demo/kit/cart.js', 'demo/kit/props.js',
  'demo/kit/ref-buildings.js', 'demo/kit/ref-structures.js', 'demo/kit/ref-plants.js',
  'demo/kit/ref-surfaces.js', 'demo/kit/ref-props.js', 'demo/kit/ref-props-small.js',
  'demo/kit/ref-shanghai.js',
];
for (const f of FILES) {
  const p = path.join(REPO, f);
  if (!fs.existsSync(p)) continue;
  vm.runInContext(fs.readFileSync(p, 'utf8'), cx, { filename: f });
}
const run = expr => vm.runInContext(expr, cx);

const DRAW = (id, dir) => run(`(() => {
  LIGHT.dir.x = ${dir[0]}; LIGHT.dir.y = ${dir[1]}; LIGHT.dir.z = ${dir[2]};
  zb.fill(-1e9); pix.fill(0xff000000); ground.fill(0); kinds.fill(0); groundZ.fill(0); shadowMask.fill(0);
  const o = { kind: ${JSON.stringify(id)}, x: 0, y: 0, z: 0, rot: 0, params: {}, seed: 1 };
  KIT.get(o.kind).draw(KIT_RENDER.makeCtx(o), o);
  return pix.slice();
})()`);

const A = [-0.22, -0.5, 0.84];   // 左上前（默认）
const B = [0.55, 0.35, 0.4];     // 右下后（侧逆光）

const ids = run('KIT.order.slice()');
const rows = [];
for (const id of ids) {
  let a, b;
  try { a = DRAW(id, A); b = DRAW(id, B); } catch (e) {
    rows.push({ id, diff: -1, err: String(e.message || e) });
    continue;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
  rows.push({ id, diff });
}

rows.sort((x, y) => x.diff - y.diff);
const showAll = process.argv.includes('--all');
const low = rows.filter(r => r.diff < 40);

console.log(`\n=== 光照跟随审计（${rows.length} 个构件）===`);
console.log('两种光照方向：左上前 vs 右下后\n');

if (showAll) {
  for (const r of rows) console.log(`  ${String(r.diff).padStart(6)}  ${r.id}`);
} else {
  console.log('差异最小的 15 个（可能是自发光构件，或亮度写死了）：');
  for (const r of rows.filter(r => r.diff >= 0).slice(0, 15)) {
    console.log(`  ${String(r.diff).padStart(6)}  ${r.id}`);
  }
}

const broken = rows.filter(r => r.diff < 0);
if (broken.length) {
  console.log('\n绘制崩溃：');
  for (const r of broken) console.log('  ✗', r.id, r.err);
}
console.log(`\n差异 < 40 的构件：${low.length} 个（自发光/纯球体属正常）`);
