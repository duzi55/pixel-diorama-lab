#!/usr/bin/env node
/* ------------------------------------------------------------------
 * 构件库全量实画测试
 *
 * 在沙箱里把每个已注册构件真的画一遍（两个位置），断言：
 *   1. draw() 不崩（颜色类型用错会在这里炸出来）
 *   2. 画面跟着实例位置走（忽略 ctx.x/ctx.y 的构件会在这里炸出来）
 *   3. 像素量合理
 *   4. 极端参数（min/max）也不崩
 *
 * 这是"构件库能用"的第一道闸。新增构件后跑一次：
 *   node tools/kit-test.mjs            # 全量
 *   node tools/kit-test.mjs birch      # 只测指定的
 * ------------------------------------------------------------------ */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const BG = (255 << 24 | 20 << 16 | 20 << 8 | 14) >>> 0;   /* rgb(14,20,20) ABGR */

/* ---- 最小 DOM ---- */
const noop = () => {};
function makeSandbox() {
  const canvas = {
    width: 0, height: 0, style: {},
    getContext(kind) {
      if (kind !== '2d') return null;
      return {
        createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: noop,
        getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
        clearRect: noop, fillRect: noop, drawImage: noop, save: noop, restore: noop,
      };
    },
    addEventListener: noop, removeEventListener: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 280 }),
  };
  const document = {
    getElementById(id) {
      if (id === 'c') return canvas;
      return {
        id, textContent: '', value: '', style: {}, innerHTML: '',
        addEventListener: noop, removeEventListener: noop,
        appendChild: noop, remove: noop, focus: noop,
        classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
        querySelector: () => ({ textContent: '' }),
        getContext: () => null,
      };
    },
    createElement: () => ({
      tagName: 'div', style: {}, textContent: '', innerHTML: '', children: [],
      appendChild: noop, addEventListener: noop,
      classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      querySelector: () => ({ textContent: '' }),
      getContext: () => null,
    }),
    addEventListener: noop,
    body: { appendChild: noop, style: {} },
    documentElement: { style: {} },
  };
  const sb = {
    console, document,
    innerWidth: 1400, innerHeight: 900, devicePixelRatio: 1,
    addEventListener: noop, removeEventListener: noop,
    requestAnimationFrame: () => 0, cancelAnimationFrame: noop,
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout,
    setInterval: () => 0, clearInterval: noop,
    performance: { now: () => Date.now() },
  };
  sb.window = sb; sb.globalThis = sb; sb.self = sb;
  return sb;
}

/* ---- 加载构件库 ---- */
const sb = makeSandbox();
const context = vm.createContext(sb);
const files = [
  'demo/engine.js',
  'demo/engine-light.js',
  'demo/kit/core.js',
  'demo/kit/palette.js',
  'demo/kit/render.js',
  'demo/kit/trees.js',
  'demo/kit/conifers.js',
  'demo/kit/plants.js',
  'demo/kit/buildings.js',
  'demo/kit/stoneworks.js',
  'demo/kit/cart.js',
  'demo/kit/props.js',
];
for (const f of files) {
  const p = path.join(REPO, f);
  if (!fs.existsSync(p)) { console.error(`✗ 缺少文件 ${f}`); process.exit(1); }
  try {
    vm.runInContext(fs.readFileSync(p, 'utf8'), context, { filename: f });
  } catch (e) {
    console.error(`✗ 加载失败: ${f}\n${e.stack}\n`);
    process.exit(1);
  }
}

const run = expr => vm.runInContext(expr, context);

/* ---- 实画测试 ---- */
const drawScript = (kind, paramsJS, x, y) => `(() => {
  try {
    zb.fill(-1e9);
    pix.fill(${BG});
    ground.fill(0);
    kinds.fill(KIND_NONE);
    groundZ.fill(0);
    shadowMask.fill(0);
    const o = { id: 't', kind: ${JSON.stringify(kind)}, x: ${x}, y: ${y}, z: 0,
                rot: 0, params: ${paramsJS}, seed: 42 };
    KIT.get(${JSON.stringify(kind)}).draw(KIT_RENDER.makeCtx(o), o);
    let n = 0;
    for (let i = 0; i < pix.length; i++) if (pix[i] !== ${BG}) n++;
    return { ok: true, n, shot: Array.from(pix) };
  } catch (e) {
    return { ok: false, err: String((e && e.message) || e) };
  }
})()`;

function testComponent(c) {
  const problems = [];

  /* 参数表合法 */
  for (const [k, p] of Object.entries(c.params)) {
    if (p.step <= 0) problems.push(`参数 ${k} 的 step 非法（${p.step}）`);
    if (p.min > p.max) problems.push(`参数 ${k} 的 min > max`);
    if (p.def < p.min || p.def > p.max) {
      problems.push(`参数 ${k} 的 def=${p.def} 越界 [${p.min}, ${p.max}]`);
    }
  }

  /* 默认参数实画 @ (0,0) */
  const defaults = run(`JSON.stringify(KIT.defaults(${JSON.stringify(c.id)}))`);
  const r0 = run(drawScript(c.id, defaults, 0, 0));
  if (!r0.ok) {
    problems.push(`绘制崩溃：${r0.err}`
      + `（常见原因：把 rampOf(...)[i] 或 rgb(...) 打包值喂给了 sphere/capsule/box —— 它们只吃 [r,g,b] 数组）`);
    return problems;
  }
  if (r0.n < 8) {
    problems.push(`画出来几乎是空的（${r0.n} 个像素）`);
    return problems;
  }

  /* 实画 @ (4,2)：画面必须跟着实例走 */
  const r1 = run(drawScript(c.id, defaults, 4, 2));
  if (!r1.ok) {
    problems.push(`在 (4,2) 绘制崩溃：${r1.err}`);
    return problems;
  }
  let same = true;
  for (let i = 0; i < r0.shot.length; i++) {
    if (r0.shot[i] !== r1.shot[i]) { same = false; break; }
  }
  if (same) {
    problems.push('忽略了实例位置 ctx.x/ctx.y —— 在 (0,0) 和 (4,2) 画的画面完全一样（禁止裸写 [0,0] 当位置）');
  }

  /* 极端参数不崩 */
  for (const edge of ['min', 'max']) {
    const t = run(drawScript(c.id,
      `(() => { const o = {}; for (const k of Object.keys(KIT.get(${JSON.stringify(c.id)}).params)) o[k] = KIT.get(${JSON.stringify(c.id)}).params[k].${edge}; return o; })()`,
      0, 0));
    if (!t.ok) problems.push(`${edge} 参数下崩溃：${t.err}`);
  }

  return problems;
}

/* ---- 主流程 ---- */
const comps = run('KIT.list()');
const only = process.argv.slice(2);
const list = only.length ? comps.filter(c => only.includes(c.id)) : comps;
if (only.length) {
  const missing = only.filter(id => !comps.find(c => c.id === id));
  if (missing.length) { console.error('找不到构件: ' + missing.join(', ')); process.exit(1); }
}

console.log(`构件库共 ${comps.length} 个，本次测 ${list.length} 个\n`);
let failed = 0;
for (const c of list) {
  const problems = testComponent(c);
  const ok = problems.length === 0;
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${c.id.padEnd(16)} ${c.name}  (${c.category}, ${Object.keys(c.params).length} 参数)`);
  for (const p of problems) console.log(`    ⚠ ${p}`);
}

console.log(`\n${list.length - failed}/${list.length} 通过`);
if (failed) process.exit(1);
console.log('✓ 全部构件通过');
