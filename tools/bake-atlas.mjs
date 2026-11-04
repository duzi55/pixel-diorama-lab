#!/usr/bin/env node
/* ------------------------------------------------------------------
 * 构件烘焙器：把「绘制指令」变成「可独立消费的资产」
 *
 * 每个构件按 N 个朝向离屏渲染 → 裁紧包围盒 → 打包成图集：
 *   demo/export/atlas.png    精灵图集（带 alpha）
 *   demo/export/atlas.json   帧矩形 / 锚点 / 参数 / 碰撞体
 *
 * 用法：
 *   node tools/bake-atlas.mjs                  # 全部构件 × 8 朝向
 *   node tools/bake-atlas.mjs --dirs 16        # 16 朝向（22.5° 一档）
 *   node tools/bake-atlas.mjs --scale 16       # 更高分辨率
 *   node tools/bake-atlas.mjs --only broadleaf,wood-house
 *
 * 设计要点：
 *   - 复用与编辑器完全一致的渲染路径（engine + KIT_RENDER.makeCtx），
 *     保证导出的像素和你在 Studio 里看到的一模一样
 *   - 透明背景：用哨兵色填充，导出时转 alpha=0
 *   - 锚点 = 构件原点（0,0,0）在帧内的像素位置 —— three.js 摆位靠它
 *   - 烘焙只含物体本身，不含投影（影子交给 3D 端自己投）
 * ------------------------------------------------------------------ */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');

/* ---------------- 参数 ---------------- */

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

const DIRS = Math.max(1, Number(arg('dirs', 8)) | 0);
const SCALE = Math.max(4, Number(arg('scale', 12)) | 0);   /* 每世界单位的像素数 */
const OUT_DIR = path.resolve(REPO, String(arg('out', 'demo/export')));
const ONLY = String(arg('only', '')).split(',').map(s => s.trim()).filter(Boolean);
const CANVAS = 560;                                        /* 单帧离屏画布边长 */
const SENTINEL = (255 << 24 | 3 << 16 | 2 << 8 | 1) >>> 0; /* rgb(1,2,3)：极少撞色 */
const PAD = 2;                                             /* 帧内边距（像素） */

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
const crc32 = b => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, d) => {
  const l = Buffer.alloc(4); l.writeUInt32BE(d.length);
  const body = Buffer.concat([Buffer.from(t, 'latin1'), d]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(body));
  return Buffer.concat([l, body, c]);
};

/** RGBA Buffer → PNG */
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

/* ---------------- 沙箱 ---------------- */

function makeSandbox() {
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
    getBoundingClientRect: () => ({ left: 0, top: 0, width: CANVAS, height: CANVAS }),
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
  sb.PP_W = CANVAS; sb.PP_H = CANVAS; sb.PP_SCALE = SCALE;
  sb.PP_ORIGIN_X = 0; sb.PP_ORIGIN_Y = 60;
  return sb;
}

/* ---------------- 载入引擎与构件库 ---------------- */

const KIT_FILES = [
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
  'demo/kit/conifers.js',
];

const sb = makeSandbox();
const ctx = vm.createContext(sb);
for (const f of KIT_FILES) {
  const p = path.join(REPO, f);
  if (!fs.existsSync(p)) continue;
  try {
    vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
  } catch (e) {
    console.error(`✗ 加载失败 ${f}: ${e.message}`);
    process.exit(1);
  }
}

const run = expr => vm.runInContext(expr, ctx);
const comps = run('KIT.list()');
const targets = ONLY.length ? comps.filter(c => ONLY.includes(c.id)) : comps;

if (!targets.length) {
  console.error('没有匹配的构件。可用：' + comps.map(c => c.id).join(', '));
  process.exit(1);
}

console.log(`烘焙 ${targets.length} 个构件 × ${DIRS} 朝向 @ ${SCALE}px/单位`);
console.log(`画布 ${CANVAS}×${CANVAS} · 输出 ${path.relative(REPO, OUT_DIR)}/atlas.png + atlas.json\n`);

/* ---------------- 单帧渲染 ---------------- */

const frames = [];
let warnClipped = 0;

for (const comp of targets) {
  const defaults = run(`JSON.stringify(KIT.defaults(${JSON.stringify(comp.id)}))`);

  for (let d = 0; d < DIRS; d++) {
    const rot = (d / DIRS) * Math.PI * 2;

    const info = run(`(() => {
      const SENT = ${SENTINEL};
      zb.fill(-1e9);
      groundZ.fill(-1e9);          /* 与背景同值 → 描边把背景当"地面" */
      pix.fill(SENT);
      ground.fill(0);
      kinds.fill(KIND_NONE);
      shadowMask.fill(0);
      if (typeof darkened !== 'undefined') darkened.fill(0);

      const o = {
        id: 'bake', kind: ${JSON.stringify(comp.id)},
        x: 0, y: 0, z: 0, rot: ${rot}, scale: 1,
        params: ${defaults}, seed: 7,
      };
      KIT.get(${JSON.stringify(comp.id)}).draw(KIT_RENDER.makeCtx(o), o);
      shadeEdges();                /* 深度描边：精灵自带轮廓 */

      /* 裁紧包围盒 */
      let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
        if (pix[iy * W + ix] === SENT) continue;
        if (ix < x0) x0 = ix; if (ix > x1) x1 = ix;
        if (iy < y0) y0 = iy; if (iy > y1) y1 = iy;
      }
      if (x1 < 0) return { empty: true };
      const clipped = (x0 <= 1 || y0 <= 1 || x1 >= W - 2 || y1 >= H - 2);
      const ax = Math.round(OX), ay = Math.round(OY);   /* 构件原点在帧内的位置 */

      /* 导出 RGBA（哨兵 → alpha 0） */
      const fw = x1 - x0 + 1 + ${PAD} * 2;
      const fh = y1 - y0 + 1 + ${PAD} * 2;
      const data = [];
      for (let iy = 0; iy < fh; iy++) for (let ix = 0; ix < fw; ix++) {
        const sx = x0 - ${PAD} + ix, sy = y0 - ${PAD} + iy;
        let c = SENT;
        if (sx >= 0 && sy >= 0 && sx < W && sy < H) c = pix[sy * W + sx];
        if (c === SENT) { data.push(0, 0, 0, 0); continue; }
        data.push(c & 255, (c >> 8) & 255, (c >> 16) & 255, 255);
      }
      return {
        empty: false, clipped,
        w: fw, h: fh,
        anchorX: ax - (x0 - ${PAD}),
        anchorY: ay - (y0 - ${PAD}),
        data,
      };
    })()`);

    if (info.empty) {
      console.warn(`  ⚠ ${comp.id}@${d * (360 / DIRS)}° 没有画出任何像素，跳过`);
      continue;
    }
    if (info.clipped) warnClipped++;
    frames.push({
      key: `${comp.id}@${d}`,
      component: comp.id,
      dir: d,
      w: info.w, h: info.h,
      anchorX: info.anchorX, anchorY: info.anchorY,
      data: info.data,
    });
  }
  process.stdout.write(`  ✓ ${comp.id.padEnd(16)} ${DIRS} 朝向\n`);
}

if (warnClipped) console.warn(`\n⚠ 有 ${warnClipped} 帧贴边（构件超出 ${CANVAS}px 画布），可能被裁切`);

/* ---------------- 图集打包（shelf packing） ---------------- */

const ATLAS_W = 1024;
const sorted = [...frames].sort((a, b) => b.h - a.h);
let cursorX = 0, cursorY = 0, rowH = 0;
for (const f of sorted) {
  if (cursorX + f.w + PAD > ATLAS_W) { cursorX = 0; cursorY += rowH + PAD; rowH = 0; }
  f.x = cursorX; f.y = cursorY;
  cursorX += f.w + PAD;
  rowH = Math.max(rowH, f.h);
}
const ATLAS_H = Math.max(1, Math.ceil((cursorY + rowH) / 4) * 4);

const atlas = Buffer.alloc(ATLAS_W * ATLAS_H * 4);   /* 全透明底 */
for (const f of sorted) {
  for (let iy = 0; iy < f.h; iy++) for (let ix = 0; ix < f.w; ix++) {
    const s = (iy * f.w + ix) * 4;
    if (f.data[s + 3] === 0) continue;
    const d = ((f.y + iy) * ATLAS_W + (f.x + ix)) * 4;
    atlas[d] = f.data[s]; atlas[d + 1] = f.data[s + 1];
    atlas[d + 2] = f.data[s + 2]; atlas[d + 3] = 255;
  }
}

/* ---------------- 写文件 ---------------- */

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'atlas.png'), encodePNG(ATLAS_W, ATLAS_H, atlas));

const components = {};
for (const comp of targets) {
  const mine = sorted.filter(f => f.component === comp.id);
  if (!mine.length) continue;
  components[comp.id] = {
    name: comp.name,
    category: comp.category,
    desc: comp.desc,
    params: comp.params,
    defaults: JSON.parse(run(`JSON.stringify(KIT.defaults(${JSON.stringify(comp.id)}))`)),
    collision: comp.collision || null,
    dirs: mine.length,
    frames: mine.sort((a, b) => a.dir - b.dir).map(f => ({
      key: f.key, dir: f.dir,
      x: f.x, y: f.y, w: f.w, h: f.h,
      anchorX: f.anchorX, anchorY: f.anchorY,
      u0: +(f.x / ATLAS_W).toFixed(6), v0: +(f.y / ATLAS_H).toFixed(6),
      u1: +((f.x + f.w) / ATLAS_W).toFixed(6), v1: +((f.y + f.h) / ATLAS_H).toFixed(6),
    })),
  };
}

const manifest = {
  format: 'pixel-diorama-atlas',
  version: 1,
  generated: new Date().toISOString(),
  image: 'atlas.png',
  size: { w: ATLAS_W, h: ATLAS_H },
  scale: SCALE,                 /* 烘焙时的像素/世界单位；等比缩放请用整数倍 */
  dirs: DIRS,
  /* 世界投影约定（与 demo/engine.js 完全一致）：
     sx = ox + (x - y)/√2 * S
     sy = oy + ((x + y)/√2 * 0.5 - z * 0.866) * S  */
  projection: { sin: 0.5, cos: 0.8660254, r2: 1.4142136 },
  components,
};

fs.writeFileSync(path.join(OUT_DIR, 'atlas.json'), JSON.stringify(manifest, null, 2));

console.log(`\n✓ 图集 ${ATLAS_W}×${ATLAS_H} · ${frames.length} 帧 · ${Object.keys(components).length} 个构件`);
console.log(`  ${path.relative(REPO, path.join(OUT_DIR, 'atlas.png'))}`);
console.log(`  ${path.relative(REPO, path.join(OUT_DIR, 'atlas.json'))}`);
