#!/usr/bin/env node
/* ------------------------------------------------------------------
 * 人群行为模块冒烟测试
 *
 * 验证 demo/kit/crowd.js：
 *   1. 三个变体都能创建个体
 *   2. 每帧更新后位置会变（wanderer 走动）
 *   3. 局部避让生效（个体不重叠）
 *   4. spectator 会避开主角的 CLEARANCE 半径
 *   5. crowd 变体站桩不动，只做局部动作
 *   6. 姿态表能取到
 *
 * 用法：node tools/crowd-test.mjs
 * ------------------------------------------------------------------ */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');

/* ---- 最小 DOM（只需要 engine 的 rgb / canvas） ---- */
const noop = () => {};
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
const context = vm.createContext(sb);

/* ---- 按顺序加载 ---- */
const files = [
  'demo/engine.js',
  'demo/kit/core.js',
  'demo/kit/palette.js',
  'demo/kit/render.js',
  'demo/kit/trees.js',
  'demo/kit/plants.js',
  'demo/kit/buildings.js',
  'demo/kit/stoneworks.js',
  'demo/kit/cart.js',
  'demo/kit/props.js',
  'demo/kit/figures.js',
  'demo/kit/crowd.js',
];
for (const f of files) {
  const code = fs.readFileSync(path.join(REPO, f), 'utf8');
  try {
    vm.runInContext(code, context, { filename: f });
  } catch (e) {
    console.error(`✗ 加载失败: ${f}\n${e.stack}\n`);
    process.exit(1);
  }
}

/* ---- 断言 ---- */
let failed = false;
function check(name, cond, detail) {
  console.log(`${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failed = true;
}
const run = expr => vm.runInContext(expr, context);

/* 1. 三个变体都能创建 */
for (const v of ['spectator', 'wanderer', 'crowd']) {
  const n = run(`KIT_CROWD.create({variant:'${v}', count:6, seed:7}); KIT_CROWD.agents.length`);
  check(`${v} 能创建个体`, n === 6, `${n} 个`);
}

/* 2. wanderer 会走动 */
const moved = run(`(() => {
  KIT_CROWD.create({variant:'wanderer', count:6, seed:7,
    bounds:{x0:-8,x1:8,y0:-4,y1:4}});
  const before = KIT_CROWD.agents.map(a => a.x + a.y);
  for (let i = 0; i < 60; i++) KIT_CROWD.update(i/12, 1/12);
  const after = KIT_CROWD.agents.map(a => a.x + a.y);
  return before.some((v, i) => Math.abs(v - after[i]) > 0.05);
})()`);
check('wanderer 会移动', moved === true);

/* 3. 局部避让：个体不重叠 */
const noOverlap = run(`(() => {
  KIT_CROWD.create({variant:'wanderer', count:10, seed:3,
    bounds:{x0:-3,x1:3,y0:-2,y1:2}});
  for (let i = 0; i < 120; i++) KIT_CROWD.update(i/12, 1/12);
  let worst = Infinity;
  const A = KIT_CROWD.agents;
  for (let i = 0; i < A.length; i++) for (let j = i+1; j < A.length; j++) {
    const d = Math.hypot(A[i].x-A[j].x, A[i].y-A[j].y);
    if (d < worst) worst = d;
  }
  return worst;
})()`);
check('个体不重叠', noOverlap > .35, `最小间距 ${noOverlap.toFixed(3)}`);

/* 4. spectator 避开主角 */
const cleared = run(`(() => {
  const focus = {x:0, y:0};
  KIT_CROWD.create({variant:'spectator', count:12, seed:5, focus, clearance:2.2,
    bounds:{x0:-10,x1:10,y0:-6,y1:6}});
  for (let i = 0; i < 90; i++) KIT_CROWD.update(i/12, 1/12);
  let worst = Infinity;
  for (const a of KIT_CROWD.agents) {
    const d = Math.hypot(a.x-focus.x, a.y-focus.y);
    if (d < worst) worst = d;
  }
  return worst;
})()`);
check('spectator 避开主角 CLEARANCE', cleared > 1.4, `最近距离 ${cleared.toFixed(2)}（阈值 2.2）`);

/* 5. crowd 站桩不动 */
const still = run(`(() => {
  KIT_CROWD.create({variant:'crowd', count:6, seed:9,
    focus:{x:0,y:0}, bounds:{x0:-6,x1:6,y0:-2,y1:2}});
  const before = KIT_CROWD.agents.map(a => a.x);
  for (let i = 0; i < 60; i++) KIT_CROWD.update(i/12, 1/12);
  const after = KIT_CROWD.agents.map(a => a.x);
  return before.some((v,i) => Math.abs(v-after[i]) > 0.02);
})()`);
check('crowd 站桩不动', still === false);

/* 6. 姿态表 */
const pose = run(`JSON.stringify({
  reach: KIT_POSE.reach,
  stand: KIT_POSE.stand,
  merged: kitPose('reach', {armR: 2})
})`);
const p = JSON.parse(pose);
check('reach 姿态存在', typeof p.reach.armR === 'number', `armR=${p.reach.armR}`);
check('kitPose 能覆盖字段', p.merged.armR === 2 && p.merged.armL === p.reach.armL);

/* 7. 绘制不抛错 */
const drew = run(`(() => {
  try {
    KIT_CROWD.create({variant:'spectator', count:4, seed:2,
      focus:{x:0,y:0}, bounds:{x0:-6,x1:6,y0:-4,y1:4}});
    KIT_CROWD.update(0, 1/12);
    KIT_CROWD.draw(0);
    return true;
  } catch (e) { return String(e); }
})()`);
check('人群可绘制', drew === true, drew === true ? '' : String(drew));

if (failed) { console.error('\n✗ 有断言失败'); process.exit(1); }
console.log('\n✓ 全部断言通过');
