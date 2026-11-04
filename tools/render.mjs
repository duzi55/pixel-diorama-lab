#!/usr/bin/env node
/* ------------------------------------------------------------------
 * Headless 渲染器：在 Node 里跑 demo 的 HTML，把画面导出成 PNG
 *
 * 用法：
 *   node tools/render.mjs demo/village/index.html out.png [帧数]
 *
 * 它做的事：
 *   1. 解析 HTML，按顺序加载 <script src>（和浏览器一致）
 *   2. 用假的 DOM / Canvas 2D 上下文替代浏览器
 *   3. 跑 bake()，再按 12fps 步进跑 N 帧
 *   4. 把最终像素编码成 PNG 写到磁盘
 *
 * 目的：改完场景能立刻看到画面，不必开浏览器、不必截图。
 * ------------------------------------------------------------------ */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ---------------- PNG 编码 ---------------- */

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
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;   // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------- 假的 DOM ---------------- */

function makeContext() {
  const listeners = {};
  const noop = () => {};

  const canvas = {
    width: 0, height: 0,
    style: {},
    getContext(kind) {
      if (kind !== '2d') return null;
      return {
        createImageData(w, h) {
          return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
        },
        putImageData(img) { sb.__image = img; },
        getImageData(x, y, w, h) {
          return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
        },
        clearRect: noop, fillRect: noop, drawImage: noop, save: noop, restore: noop,
      };
    },
    addEventListener: noop, removeEventListener: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 280 }),
    focus: noop,
  };

  const document = {
    getElementById(id) {
      if (id === 'c') return canvas;
      // HUD / 控件一律返回可写的假元素
      return {
        id, textContent: '', value: '0', style: {},
        addEventListener: noop, removeEventListener: noop,
        appendChild: noop, remove: noop, focus: noop,
        getContext: () => null,
        classList: { add: noop, remove: noop, toggle: noop },
      };
    },
    createElement(tag) {
      return {
        tagName: tag, style: {}, textContent: '', children: [],
        appendChild: noop, addEventListener: noop, classList: { add: noop, remove: noop },
        getContext: () => null,
      };
    },
    addEventListener: noop, removeEventListener: noop,
    body: { appendChild: noop, style: {} },
    documentElement: { style: {} },
  };

  const rafQueue = [];
  const sb = {
    console,
    document,
    innerWidth: 1200, innerHeight: 900, devicePixelRatio: 1,
    /* 测试用：SKIP=模块名，逗号分隔（roadtest 等排除法实验用） */
    __SKIP: process.env.SKIP || '',
    addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
    removeEventListener: noop,
    requestAnimationFrame(fn) { rafQueue.push(fn); return rafQueue.length; },
    cancelAnimationFrame: noop,
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout,
    setInterval: () => 0, clearInterval: noop,
    performance: { now: () => Date.now() },
    __rafQueue: rafQueue,
    __listeners: listeners,
    __canvas: canvas,
  };
  sb.window = sb;
  sb.globalThis = sb;
  sb.self = sb;
  return sb;
}

/* ---------------- 主流程 ---------------- */

const htmlPath = process.argv[2];
const outPath = process.argv[3] || 'out.png';
const steps = Number(process.argv[4] || 1);
const scale = Number(process.env.RENDER_SCALE || 1);

if (!htmlPath) {
  console.error('用法: node tools/render.mjs <html> <out.png> [帧数]');
  process.exit(1);
}

const htmlAbs = path.resolve(htmlPath);
const htmlDir = path.dirname(htmlAbs);
const htmlSrc = fs.readFileSync(htmlAbs, 'utf8');

/* 取出所有 <script src="..."> 和 <script>内联代码</script>，按文档顺序 */
const scripts = [];
const re = /<script(?:\s+src="([^"]+)")?\s*>([\s\S]*?)<\/script>/gi;
let m;
while ((m = re.exec(htmlSrc))) {
  if (m[1]) {
    const p = path.resolve(htmlDir, m[1]);
    scripts.push({ code: fs.readFileSync(p, 'utf8'), name: m[1] });
  } else if (m[2].trim()) {
    scripts.push({ code: m[2], name: '<inline>' });
  }
}

const sandbox = makeContext();
const context = vm.createContext(sandbox);

for (const s of scripts) {
  try {
    vm.runInContext(s.code, context, { filename: s.name });
  } catch (e) {
    console.error(`\n✗ 脚本加载失败: ${s.name}\n${e.stack}\n`);
    process.exit(1);
  }
}

/* 跑帧：先 bake，再步进 RAF 队列 */
function runFrames(n) {
  for (let i = 0; i < n; i++) {
    const q = sandbox.__rafQueue.splice(0, sandbox.__rafQueue.length);
    if (!q.length) break;
    const now = i * (1000 / 12);
    for (const fn of q) fn(now);
  }
}

try {
  runFrames(steps);
} catch (e) {
  console.error(`\n✗ 渲染出错:\n${e.stack}\n`);
  process.exit(1);
}

/* 取像素 */
const pix = vm.runInContext('pix', context);
const W = vm.runInContext('W', context);
const H = vm.runInContext('H', context);

const rgba = Buffer.alloc(W * H * 4);
const bytes = Buffer.from(pix.buffer, pix.byteOffset, pix.byteLength);
bytes.copy(rgba, 0, 0, W * H * 4);

/* 统计：多少比例的像素是背景色（用来检查"留白"是否被填掉了） */
let bg = 0;
const bgColor = vm.runInContext('typeof BG !== "undefined" ? BG : null', context);
if (bgColor) {
  for (let i = 0; i < W * H; i++) if (pix[i] === bgColor) bg++;
}

fs.writeFileSync(path.resolve(outPath), encodePNG(W, H, rgba));
console.log(`✓ ${outPath}  ${W}×${H}  ${steps} 帧`);
if (bgColor) console.log(`  背景留白占比: ${(bg / (W * H) * 100).toFixed(1)}%`);
