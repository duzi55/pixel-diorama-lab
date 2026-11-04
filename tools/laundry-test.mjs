#!/usr/bin/env node
/* ------------------------------------------------------------------
 * 屋顶晾衣：场景 / 交互 / 天气的自动断言
 *
 * 检查项：
 *   1. 场景烘焙出图（非白像素占比）
 *   2. 21 件衣物挂在 3 条绳上
 *   3. 拾取缓冲能命中衣物（itemBuf → pickCloth）
 *   4. 手动拖到藤篮上方 → 入篮计分
 *   5. 空格自动收衣路径
 *   6. 阵风把衣物吹成 loose
 *   7. 天气时间线：风暴 / 下雨 / 雨滴池 / 湿衣
 *   8. 画面在动（两帧像素不同）
 *   9. 48 秒后进入结算
 *
 * 顺带导出 docs/laundry-screenshot.png（暴雨帧）
 * 用法: node tools/laundry-test.mjs
 * ------------------------------------------------------------------ */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/* ---------- PNG ---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; }
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
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- 沙箱 ---------- */
function makeSandbox() {
  const noop = () => {};
  const listeners = {};
  const canvas = {
    width: 0, height: 0, style: {},
    getContext(kind) {
      if (kind !== '2d') return null;
      return {
        createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
        putImageData(img) { sb.__image = img; },
        getImageData(x, y, w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
        clearRect: noop, fillRect: noop, drawImage: noop, save: noop, restore: noop,
      };
    },
    addEventListener: noop, removeEventListener: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 280 }),
    focus: noop, setPointerCapture: noop,
  };
  const document = {
    getElementById(id) {
      if (id === 'c') return canvas;
      return {
        id, textContent: '', value: '0', style: {},
        addEventListener: noop, removeEventListener: noop,
        appendChild: noop, remove: noop, focus: noop, getContext: () => null,
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
    console, document,
    PP_HEADLESS: true, innerWidth: 1200, innerHeight: 900, devicePixelRatio: 1,
    addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
    removeEventListener: noop,
    requestAnimationFrame(fn) { rafQueue.push(fn); return rafQueue.length; },
    cancelAnimationFrame: noop,
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout, setInterval: () => 0, clearInterval: noop,
    __rafQueue: rafQueue, __listeners: listeners, __canvas: canvas,
  };
  sb.window = sb; sb.globalThis = sb; sb.self = sb;
  return sb;
}

const htmlSrc = fs.readFileSync(path.join(ROOT, 'demo/laundry/index.html'), 'utf8');
const scripts = [];
const re = /<script(?:\s+src="([^"]+)")?\s*>([\s\S]*?)<\/script>/gi;
let m;
while ((m = re.exec(htmlSrc))) {
  if (m[1]) scripts.push({ code: fs.readFileSync(path.resolve(path.join(ROOT, 'demo/laundry'), m[1]), 'utf8'), name: m[1] });
  else if (m[2].trim()) scripts.push({ code: m[2], name: '<inline>' });
}

const sb = makeSandbox();
const context = vm.createContext(sb);
for (const s of scripts) vm.runInContext(s.code, context, { filename: s.name });

const L = vm.runInContext('__laundry', context);
const G = L.G;
const W = vm.runInContext('W', context);
const H = vm.runInContext('H', context);
const pix = vm.runInContext('pix', context);
const itemBuf = vm.runInContext('itemBuf', context);

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures++;
}

/* 1. 烘焙出图 */
L.draw();
let lit = 0;
for (let i = 0; i < pix.length; i++) if (pix[i] !== 0xffffffff) lit++;
const coverage = lit / (W * H);
check('场景烘焙出图', coverage > 0.18, `非白像素 ${(coverage * 100).toFixed(1)}%`);

/* 2. 衣物数量 */
check('21 件衣物 / 3 条绳', G.items.length === 21, `实际 ${G.items.length} 件`);

/* 2b. 前墙 5 扇窗：窗洞中心应是深色（DARK 色阶） */
const winLum = [-10, -5, 0, 5, 10].map(x => {
  const p = vm.runInContext(`project(${x}, ${7.14}, -1.9)`, context);
  const i = (p.sy | 0) * W + (p.sx | 0);
  const c = pix[i];
  return (c & 255) + (c >> 8 & 255) + (c >> 16 & 255);
});
check('前墙 5 扇窗都可见', winLum.every(v => v < 320), `亮度 ${winLum.join(',')}`);

/* 3. 拾取 */
L.draw();
let hitX = -1, hitY = -1, hitId = 0;
for (let y = 0; y < H && !hitId; y++) for (let x = 0; x < W; x++) if (itemBuf[y * W + x]) { hitX = x; hitY = y; hitId = itemBuf[y * W + x]; break; }
const picked = L.pickCloth(hitX, hitY);
check('拾取缓冲命中衣物', !!picked && picked.id === hitId, `id=${hitId}`);

/* 4. 手动拖拽入篮 */
const first = G.items.find(i => i.state === 'line');
const bx = vm.runInContext(`project(BASKET.x, BASKET.y, BASKET.h)`, context);
L.grab(first, false);
G.pointer = { x: bx.sx, y: bx.sy };
for (let k = 0; k < 90 && first.state === 'held'; k++) L.update(1 / 30);
const overB = L.overBasket(first);
L.letGo();
const scoreAfter = G.score;
check('拖到藤篮上方可入篮', first.state === 'basket' && scoreAfter > 0, `over=${overB} score=${scoreAfter}`);

/* 5. 自动收衣 */
const second = G.items.find(i => i.state === 'line');
L.grab(second, true);
for (let k = 0; k < 300 && second.state === 'held'; k++) L.update(1 / 30);
check('空格自动收衣', second.state === 'basket', `state=${second.state}`);

/* 6. 阵风 */
G.gustIn = 0;
L.update(1 / 30);
check('阵风吹松衣物', G.items.some(i => i.state === 'loose'), `loose=${G.items.filter(i => i.state === 'loose').length}`);

/* 7. 天气时间线 */
G.t = 25;
const storm = vm.runInContext('stormLevel()', context);
const rain0 = vm.runInContext('rainLevel()', context);
G.t = 32;
for (let k = 0; k < 30; k++) L.update(1 / 30);
const rain = vm.runInContext('rainLevel()', context);
const drops = vm.runInContext('drops.length', context);
const wet = G.items.some(i => i.wet > 0) && G.wetness > 0;
check('风暴 / 下雨曲线', storm > .5 && rain0 === 0 && rain > .3, `storm@25=${storm.toFixed(2)} rain@32=${rain.toFixed(2)}`);
check('雨滴池与湿衣', drops > 50 && wet, `drops=${drops} wetness=${G.wetness.toFixed(2)}`);

/* 8. 画面在动 */
L.draw();
const snapA = Buffer.from(pix.buffer, pix.byteOffset, pix.byteLength).toString('base64');
for (let k = 0; k < 4; k++) L.update(1 / 30);
L.draw();
const snapB = Buffer.from(pix.buffer, pix.byteOffset, pix.byteLength).toString('base64');
check('画面在动', snapA !== snapB);

/* 9. 结算 */
G.t = 50;
L.update(1 / 30);
check('48 秒进入结算', G.phase === 'over', `phase=${G.phase}`);

/* 导出暴雨截图 */
G.t = 34;
L.draw();
const rgba = Buffer.alloc(W * H * 4);
Buffer.from(pix.buffer, pix.byteOffset, pix.byteLength).copy(rgba, 0, 0, W * H * 4);
const out = path.join(ROOT, 'docs/laundry-screenshot.png');
fs.writeFileSync(out, encodePNG(W, H, rgba));
console.log(`\n  截图 → ${path.relative(ROOT, out)}`);

console.log(failures ? `\n✗ ${failures} 项失败` : '\n✓ 全部通过');
process.exit(failures ? 1 : 0);
