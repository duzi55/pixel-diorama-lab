#!/usr/bin/env node
/* ------------------------------------------------------------------
 * 像素大奖赛：赛道 / 赛车 / 观众欢呼的自动断言
 *
 * 检查项：
 *   1. 赛道烘焙出图
 *   2. 3 辆车 + 40 名观众
 *   3. 车始终在赛道内（到中心线距离 ≤ 半宽）
 *   4. 车在持续行驶
 *   5. 欢呼联动：车靠近看台 → 看台 cheer 上升；车在前侧 → cheer 回落
 *   6. 欢呼动作让画面变化
 *   7. 内场不是空白（草地铺满）
 *
 * 顺带导出 docs/racetrack-screenshot.png（看台欢呼帧）
 * 用法: node tools/racetrack-test.mjs
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
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 340 }),
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
    addEventListener: noop, removeEventListener: noop,
    requestAnimationFrame(fn) { rafQueue.push(fn); return rafQueue.length; },
    cancelAnimationFrame: noop,
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout, setInterval: () => 0, clearInterval: noop,
    __rafQueue: rafQueue, __canvas: canvas,
  };
  sb.window = sb; sb.globalThis = sb; sb.self = sb;
  return sb;
}

const htmlSrc = fs.readFileSync(path.join(ROOT, 'demo/racetrack/index.html'), 'utf8');
const scripts = [];
const re = /<script(?:\s+src="([^"]+)")?\s*>([\s\S]*?)<\/script>/gi;
let m;
while ((m = re.exec(htmlSrc))) {
  if (m[1]) scripts.push({ code: fs.readFileSync(path.resolve(path.join(ROOT, 'demo/racetrack'), m[1]), 'utf8'), name: m[1] });
  else if (m[2].trim()) scripts.push({ code: m[2], name: '<inline>' });
}

const sb = makeSandbox();
const context = vm.createContext(sb);
for (const s of scripts) vm.runInContext(s.code, context, { filename: s.name });

const R = vm.runInContext('__racetrack', context);
const W = vm.runInContext('W', context);
const H = vm.runInContext('H', context);
const pix = vm.runInContext('pix', context);
const updateSpectators = vm.runInContext('updateSpectators', context);
const trackNearest = vm.runInContext('trackNearest', context);
const racerPose = vm.runInContext('racerPose', context);
const TRACK_HALF = vm.runInContext('TRACK_HALF', context);
const PAPER = vm.runInContext('PAPER_RGB', context);

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures++;
}

/* 1. 烘焙出图 + 内容不触碰画布边缘（无方框裁切，四边 ≥12px） */
R.draw();
let lit = 0, minX = W, maxX = -1, minY = H, maxY = -1;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (pix[y * W + x] === PAPER) continue;
  lit++;
  if (x < minX) minX = x; if (x > maxX) maxX = x;
  if (y < minY) minY = y; if (y > maxY) maxY = y;
}
const coverage = lit / (W * H);
check('赛道烘焙出图', coverage > 0.2, `非纸色像素 ${(coverage * 100).toFixed(1)}%`);
const margins = { left: minX, right: W - 1 - maxX, top: minY, bottom: H - 1 - maxY };
const marginOK = margins.left >= 12 && margins.right >= 12 && margins.top >= 12 && margins.bottom >= 12;
check('内容不触碰画布边缘（无方框裁切）', marginOK,
  `边距 左${margins.left} 右${margins.right} 上${margins.top} 下${margins.bottom}`);

/* 2. 数量 */
check('3 辆车 / 50 名观众', R.RACERS.length === 3 && R.SPECTATORS.length === 50,
  `cars=${R.RACERS.length} fans=${R.SPECTATORS.length}`);

/* 3. 车在赛道内 */
const offTrack = R.RACERS.filter(r => {
  const p = racerPose(r);
  return trackNearest(p.x, p.y).dist > TRACK_HALF + .02;
});
check('车始终在赛道内', offTrack.length === 0, `越界 ${offTrack.length} 辆`);

/* 4. 车在行驶 */
const before = R.RACERS.map(r => r.u);
R.update(1 / 30);
const moved = R.RACERS.every((r, i) => r.u > before[i]);
check('三辆车持续行驶', moved, `Δu=${R.RACERS.map((r, i) => (r.u - before[i]).toFixed(4)).join(',')}`);

/* 5. 欢呼联动 */
const stands = R.SPECTATORS.filter(s => s.onStand);
const avgStand = () => stands.reduce((a, s) => a + s.cheer, 0) / stands.length;
const parkFar = () => {
  R.RACERS[0].u = .55;                    // 前侧直道，远离看台
  R.RACERS[1].u = .58;
  R.RACERS[2].u = .52;
};
const parkNear = () => {
  R.RACERS[0].u = .122;                   // 后侧主直道，看台正前方
  R.RACERS[1].u = .55;
  R.RACERS[2].u = .58;
};

parkFar();
for (let k = 0; k < 90; k++) updateSpectators(1 / 30);
const far = avgStand();
parkNear();
for (let k = 0; k < 90; k++) updateSpectators(1 / 30);
const near = avgStand();
check('车靠近看台 → 观众欢呼', near > .6, `cheer=${near.toFixed(2)}`);
check('车远离看台 → 观众安静', far < .2, `cheer=${far.toFixed(2)}`);
check('欢呼强度有区分', near - far > .4, `Δ=${(near - far).toFixed(2)}`);

/* 6. 画面在动（欢呼动作 + 车辆） */
R.draw();
const snapA = Buffer.from(pix.buffer, pix.byteOffset, pix.byteLength).toString('base64');
R.update(1 / 30);
R.update(1 / 30);
R.draw();
const snapB = Buffer.from(pix.buffer, pix.byteOffset, pix.byteLength).toString('base64');
check('画面在动', snapA !== snapB);

/* 7. 内场不是空白：内场中心应被草地覆盖（非纯白） */
const center = vm.runInContext('project(0, 0, 0)', context);
const ci = (center.sy | 0) * W + (center.sx | 0);
check('内场草地铺满', pix[ci] !== PAPER, `pixel=${pix[ci].toString(16)}`);

/* 导出看台欢呼截图 */
parkNear();
for (let k = 0; k < 90; k++) updateSpectators(1 / 30);
R.draw();
const rgba = Buffer.alloc(W * H * 4);
Buffer.from(pix.buffer, pix.byteOffset, pix.byteLength).copy(rgba, 0, 0, W * H * 4);
const out = path.join(ROOT, 'docs/racetrack-screenshot.png');
fs.writeFileSync(out, encodePNG(W, H, rgba));
console.log(`\n  截图 → ${path.relative(ROOT, out)}`);

console.log(failures ? `\n✗ ${failures} 项失败` : '\n✓ 全部通过');
process.exit(failures ? 1 : 0);
