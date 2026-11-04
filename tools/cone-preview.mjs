#!/usr/bin/env node
/* ------------------------------------------------------------------
 * 锥状树构件 · 实画预览
 *
 * 用法：node tools/cone-preview.mjs [out.png]
 * 沙箱实画一组 cone-mast / cone-spire（模拟参考图上半部构图：
 * 后排尖锥 → 中排巨塔 → 前排巨塔），导出 PNG 目检形态。
 * ------------------------------------------------------------------ */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const OUT = process.argv[2] || '/tmp/cone-preview.png';

/* ---- PNG 编码（同 render.mjs） ---- */
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
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---- 沙箱（同 kit-test.mjs） ---- */
const noop = () => {};
function makeSandbox() {
  const canvas = {
    width: 0, height: 0, style: {},
    getContext(kind) {
      if (kind !== '2d') return null;
      return {
        createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: noop, getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
        clearRect: noop, fillRect: noop, drawImage: noop, save: noop, restore: noop,
      };
    },
    addEventListener: noop, removeEventListener: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 520 }),
  };
  const document = {
    getElementById: (id) => id === 'c' ? canvas : {
      id, textContent: '', value: '', style: {}, innerHTML: '',
      addEventListener: noop, removeEventListener: noop, appendChild: noop, remove: noop,
      classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      querySelector: () => ({ textContent: '' }), getContext: () => null,
    },
    createElement: () => ({
      tagName: 'div', style: {}, textContent: '', innerHTML: '', children: [],
      appendChild: noop, addEventListener: noop,
      classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      querySelector: () => ({ textContent: '' }), getContext: () => null,
    }),
    addEventListener: noop, body: { appendChild: noop, style: {} }, documentElement: { style: {} },
  };
  const sb = {
    console, document,
    innerWidth: 1400, innerHeight: 900, devicePixelRatio: 1,
    addEventListener: noop, removeEventListener: noop,
    requestAnimationFrame: () => 0, cancelAnimationFrame: noop,
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout,
    performance: { now: () => Date.now() },
    /* village 同款竖幅画布 */
    PP_W: 300, PP_H: 520, PP_SCALE: 9, PP_ORIGIN_X: 0, PP_ORIGIN_Y: 10,
  };
  sb.window = sb; sb.globalThis = sb; sb.self = sb;
  return sb;
}

const sb = makeSandbox();
const context = vm.createContext(sb);
for (const f of ['demo/engine.js', 'demo/kit/core.js', 'demo/kit/render.js', 'demo/kit/conifers.js']) {
  vm.runInContext(fs.readFileSync(path.join(REPO, f), 'utf8'), context, { filename: f });
}
const run = expr => vm.runInContext(expr, context);

/* ---- 画布初始化 + 淡蓝灰背景（看得出轮廓即可） ---- */
run(`
  zb.fill(-1e9);
  pix.fill(${(255 << 24 | 214 << 16 | 228 << 8 | 236) >>> 0});
  groundZ.fill(0); ground.fill(0); kinds.fill(0); shadowMask.fill(0); staticShadow.fill(0);
`);

/* ---- 排树（世界坐标：sum=x+y 定纵深，dxy=x-y 定横向） ----
 *            树                sum  dxy   kind        参数
 * 后排尖锥   远（被塔遮挡）     38   -20   cone-spire  h10 cr2.4 golden.35
 *            深橙参数组验证     38    0    cone-spire  h10 cr2.4 golden0
 *            远右               38   18    cone-spire  h11 cr2.6 golden.5
 * 中排巨塔   左                 48  -13    cone-mast   h18 cr5.6 golden1
 *            右（被前排半盖）   48   15    cone-mast   h18 cr5.6 golden.85
 * 前排巨塔   主角               60    4    cone-mast   h21 cr6.2 golden1
 */
const TREES = [
  { sum: 38, dxy: -20, kind: 'cone-spire', p: { height: 10, crownR: 2.4, rows: 9, golden: .35 } },
  { sum: 38, dxy: 0,   kind: 'cone-spire', p: { height: 10, crownR: 2.4, rows: 9, golden: 0 } },
  { sum: 38, dxy: 18,  kind: 'cone-spire', p: { height: 11, crownR: 2.6, rows: 10, golden: .5 } },
  { sum: 48, dxy: -13, kind: 'cone-mast',  p: { height: 18, crownR: 5.2, layers: 5, golden: 1, trunkV: .16 } },
  { sum: 48, dxy: 15,  kind: 'cone-mast',  p: { height: 18, crownR: 5.2, layers: 5, golden: .85, trunkV: .16 } },
  { sum: 60, dxy: 4,   kind: 'cone-mast',  p: { height: 21, crownR: 5.0, layers: 6, golden: 1, trunkV: .14 } },
];
let idx = 0;
for (const t of TREES) {
  const x = (t.sum + t.dxy) / 2, y = (t.sum - t.dxy) / 2;
  const o = { id: 't' + idx++, kind: t.kind, x, y, z: 0, rot: 0, params: t.p, seed: 42 + idx * 7 };
  run(`KIT.get(${JSON.stringify(t.kind)}).draw(KIT_RENDER.makeCtx(${JSON.stringify(o)}), ${JSON.stringify(o)})`);
}
run('shadeEdges()');   // village 每帧都跑深度描边，预览同观感

/* ---- 导出（ABGR → RGBA） ---- */
const [W, H] = run('[W, H]');
const pix = run('pix');
const rgba = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) {
  const c = pix[i];
  rgba[i * 4] = c & 255;
  rgba[i * 4 + 1] = c >> 8 & 255;
  rgba[i * 4 + 2] = c >> 16 & 255;
  rgba[i * 4 + 3] = 255;
}
fs.writeFileSync(OUT, encodePNG(W, H, rgba));
console.log(`✓ ${OUT}  ${W}×${H}`);
