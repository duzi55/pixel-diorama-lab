#!/usr/bin/env node
/* ------------------------------------------------------------------
 * 编辑器渲染冒烟测试
 *
 * 在 Node 里跑 editor.html 的脚本，验证：
 *   1. 所有脚本能无错加载
 *   2. 地形能渲染出像素（不是全空）
 *   3. 构件能画出来
 *   4. 碰撞体能画出来
 *   5. 场景能序列化 / 反序列化
 *
 * 用法：node tools/editor-test.mjs [out.png]
 * ------------------------------------------------------------------ */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');

/* ---- PNG 编码（与 render.mjs 一致） ---- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---- 最小 DOM ---- */
const listeners = {};
const elements = {};

function makeCtx() {
  const noop = () => {};
  const rafQueue = [];
  const canvas = {
    width: 0, height: 0, style: {},
    getContext(kind) {
      if (kind !== '2d') return null;
      return {
        createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: img => {
          if (!img || !img.data) throw new TypeError('putImageData: parameter 1 is not of type ImageData');
          sb.__image = img;
        },
        getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
        clearRect: noop, fillRect: noop, drawImage: noop, save: noop, restore: noop,
      };
    },
    addEventListener: noop, removeEventListener: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 280 }),
    setPointerCapture: noop,
    focus: noop,
  };

  const document = {
    getElementById(id) {
      if (id === 'c') return canvas;
      if (!elements[id]) {
        const el = {
          id, textContent: '', value: '', style: {}, innerHTML: '',
          children: [],
          addEventListener: noop, removeEventListener: noop,
          appendChild(c) { this.children.push(c); return c; },
          remove: noop, focus: noop, click: noop,
          getContext: () => null,
          classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
          querySelector: () => ({ textContent: '' }),
        };
        elements[id] = el;
      }
      return elements[id];
    },
    createElement(tag) {
      return {
        tagName: tag, style: {}, textContent: '', innerHTML: '', value: '',
        children: [], dataset: {},
        appendChild(c) { this.children.push(c); return c; },
        addEventListener: noop, removeEventListener: noop,
        classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
        querySelector: () => ({ textContent: '' }),
        getContext: () => null,
      };
    },
    addEventListener: noop,
    body: { appendChild: noop, style: {} },
    documentElement: { style: {} },
  };

  const sb = {
    console, document,
    innerWidth: 1400, innerHeight: 900, devicePixelRatio: 1,
    addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
    removeEventListener: noop,
    requestAnimationFrame(fn) { rafQueue.push(fn); return rafQueue.length; },
    cancelAnimationFrame: noop,
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout,
    setInterval: () => 0, clearInterval: noop,
    performance: { now: () => Date.now() },
    fetch: async () => ({ ok: true, json: async () => ({ ok: true, scenes: [] }) }),
    confirm: () => true,
    URL: { createObjectURL: () => 'blob:', revokeObjectURL: noop },
    Blob: class { constructor() {} },
    __rafQueue: rafQueue,
    __listeners: listeners,
    __canvas: canvas,
  };
  sb.window = sb; sb.globalThis = sb; sb.self = sb;
  return sb;
}

/* ---- 载入 editor.html 的脚本 ---- */
const html = fs.readFileSync(path.join(REPO, 'demo', 'studio', 'editor.html'), 'utf8');
const re = /<script(?:\s+src="([^"]+)")?\s*>([\s\S]*?)<\/script>/gi;
const scripts = [];
let m;
while ((m = re.exec(html))) {
  if (m[1]) {
    const p = path.resolve(REPO, 'demo', 'studio', m[1]);
    scripts.push({ code: fs.readFileSync(p, 'utf8'), name: m[1] });
  } else if (m[2].trim()) {
    scripts.push({ code: m[2], name: '<inline>' });
  }
}

const sandbox = makeCtx();
const context = vm.createContext(sandbox);

for (const s of scripts) {
  try {
    vm.runInContext(s.code, context, { filename: s.name });
  } catch (e) {
    console.error(`\n✗ 脚本加载失败: ${s.name}\n${e.stack}\n`);
    process.exit(1);
  }
}

/* ---- 跑几帧 ---- */
for (let i = 0; i < 3; i++) {
  const q = sandbox.__rafQueue.splice(0, sandbox.__rafQueue.length);
  for (const fn of q) fn(i * (1000 / 12));
}

/* ---- 断言 ---- */
const pix = vm.runInContext('pix', context);
const W = vm.runInContext('W', context);
const H = vm.runInContext('H', context);

let nonBg = 0;
const bg = vm.runInContext('rgb(22,22,27)', context);
for (let i = 0; i < W * H; i++) if (pix[i] !== bg) nonBg++;

const terrainCells = vm.runInContext('TERRAIN.cells.size', context);
const objCount = vm.runInContext('ED.objects.length', context);
const compCount = vm.runInContext('KIT.order.length', context);

console.log(`画布 ${W}×${H}`);
console.log(`非背景像素: ${nonBg} (${(nonBg / (W * H) * 100).toFixed(1)}%)`);
console.log(`地形格数: ${terrainCells}`);
console.log(`物体数: ${objCount}`);
console.log(`已注册构件: ${compCount}`);

let failed = false;
function check(name, cond, detail) {
  console.log(`${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failed = true;
}

check('地形有格子', terrainCells > 0, `${terrainCells} 格`);
check('渲染出像素', nonBg > 500, `${nonBg} 像素`);
check('有物体', objCount > 0, `${objCount} 个`);
check('构件已注册', compCount > 0, `${compCount} 个`);

/* 场景序列化往返 */
const roundTrip = vm.runInContext(`(() => {
  const json = ED_sceneJSON();
  const before = json.objects.length;
  const beforeCells = json.terrain.cells.length;
  ED_applyScene(json);
  return ED.objects.length === before && TERRAIN.cells.size === beforeCells;
})()`, context);
check('场景序列化往返一致', roundTrip === true);

/* 碰撞体存在 */
const hasCol = vm.runInContext('ED.objects.filter(o => o.collision).length', context);
check('物体带碰撞体', hasCol > 0, `${hasCol}/${objCount}`);

/* 导出 PNG */
const outPath = process.argv[2] || path.join(REPO, 'docs', 'editor-screenshot.png');
const rgba = Buffer.alloc(W * H * 4);
const bytes = Buffer.from(pix.buffer, pix.byteOffset, pix.byteLength);
bytes.copy(rgba, 0, 0, W * H * 4);
fs.writeFileSync(outPath, encodePNG(W, H, rgba));
console.log(`\n✓ 已导出 ${path.relative(REPO, outPath)}`);

if (failed) { console.error('\n✗ 有断言失败'); process.exit(1); }
console.log('\n✓ 全部断言通过');
