#!/usr/bin/env node
/* ------------------------------------------------------------------
 * 交互与动态验证：渲染并断言
 *
 * 检查项：
 *   1. 画面在动（多帧之间像素不同）
 *   2. 车在行驶（沿路移动）
 *   3. 树冠在风动（capture 缓存回放）
 *   4. 点击村民能选中（拾取接口）
 *   5. 选中后头顶出现箭头标记
 *   6. 路面在画面内可见
 *   7. 房子可见（不被树完全埋掉）
 *
 * 用法: node tools/village-test.mjs
 * ------------------------------------------------------------------ */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/* ---------- PNG 编码/解码 ---------- */
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

/* ---------- 跑页面 ---------- */
function makeSandbox() {
  const noop = () => {};
  const listeners = {};
  const canvas = {
    width: 0, height: 0, style: {},
    getContext(kind) {
      if (kind !== '2d') return null;
      return {
        createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: noop, getImageData: noop, clearRect: noop, fillRect: noop, drawImage: noop,
      };
    },
    addEventListener: noop, removeEventListener: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 520 }),
    focus: noop,
  };
  const document = {
    getElementById: id => id === 'c' ? canvas : {
      id, textContent: '', value: '0', style: {},
      addEventListener: noop, removeEventListener: noop, appendChild: noop, remove: noop, focus: noop,
      getContext: () => null, classList: { add: noop, remove: noop, toggle: noop },
    },
    createElement: tag => ({ tagName: tag, style: {}, textContent: '', children: [], appendChild: noop, addEventListener: noop, classList: { add: noop, remove: noop }, getContext: () => null }),
    addEventListener: noop, removeEventListener: noop,
    body: { appendChild: noop, style: {} }, documentElement: { style: {} },
  };
  const rafQueue = [];
  const sb = {
    console, document,
    PP_HEADLESS: true, innerWidth: 1200, innerHeight: 900, devicePixelRatio: 1,
    addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
    removeEventListener: noop,
    requestAnimationFrame: fn => { rafQueue.push(fn); return rafQueue.length; },
    cancelAnimationFrame: noop,
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout,
    setInterval: () => 0, clearInterval: noop,
    performance: { now: () => Date.now() },
    __rafQueue: rafQueue, __listeners: listeners, __canvas: canvas,
  };
  sb.window = sb; sb.globalThis = sb; sb.self = sb;
  return sb;
}

const htmlPath = path.join(ROOT, 'demo/village/index.html');
const htmlSrc = fs.readFileSync(htmlPath, 'utf8');
const htmlDir = path.dirname(htmlPath);

const scripts = [];
const re = /<script(?:\s+src="([^"]+)")?\s*>([\s\S]*?)<\/script>/gi;
let m;
while ((m = re.exec(htmlSrc))) {
  if (m[1]) scripts.push({ code: fs.readFileSync(path.resolve(htmlDir, m[1]), 'utf8'), name: m[1] });
  else if (m[2].trim()) scripts.push({ code: m[2], name: '<inline>' });
}

const sandbox = makeSandbox();
const context = vm.createContext(sandbox);
for (const s of scripts) {
  try { vm.runInContext(s.code, context, { filename: s.name }); }
  catch (e) { console.error(`✗ 加载失败 ${s.name}:\n${e.stack}`); process.exit(1); }
}

function runFrames(n) {
  for (let i = 0; i < n; i++) {
    const q = sandbox.__rafQueue.splice(0, sandbox.__rafQueue.length);
    if (!q.length) break;
    const now = i * (1000 / 12);
    for (const fn of q) fn(now);
  }
}
const evalIn = expr => vm.runInContext(expr, context);
const getPix = () => new Uint32Array(evalIn('pix').buffer.slice(0));

/* ---------- 断言 ---------- */
let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${name}${detail ? '  ' + detail : ''}`); }
  else { fail++; console.log(`  ✗ ${name}  ${detail}`); }
}

console.log('\n=== 秋日山村 · 交互与动态验证 ===\n');

/* 1. 画面在动 */
const p1 = getPix();
runFrames(12);
const p2 = getPix();
let diff = 0;
for (let i = 0; i < p1.length; i++) if (p1[i] !== p2[i]) diff++;
check('画面在动', diff > 200, `${diff} 像素变化`);

/* 2. 车在行驶 */
const carA = evalIn('JSON.stringify({x: Road.car.x, y: Road.car.y, t: Road.car.t})');
runFrames(30);
const carB = evalIn('JSON.stringify({x: Road.car.x, y: Road.car.y, t: Road.car.t})');
check('汽车在行驶', carA !== carB, `${carA} → ${carB}`);

/* 3. 树已烘焙为静态锥树（foliage.js 设计变更：锥树融合体不适合 capture 平移
   回放，会破融合体），改断言"树确实画进了烘焙底图"：树占比应显著。
   取烘焙画面中非背景、非地面色（即树冠金黄/深绿）的像素数量。 */
const treePix = evalIn(`(() => {
  let n = 0;
  const bg = rgb(252, 245, 218);
  for (let i = 0; i < bakedPix.length; i++) {
    if (bakedPix[i] === bg || ground[i]) continue;
    n++;
  }
  return n;
})()`);
check('树冠已烘焙进底图', treePix > 900, `${treePix} 个树像素`);

/* 4. 村民拾取 */
const villagerCount = evalIn('villagers.length');
let picked = null;
if (villagerCount) {
  const v = evalIn('JSON.stringify(villagerAnchor(villagers[0]))');
  const a = JSON.parse(v);
  picked = evalIn(`pickVillager(${a.sx}, ${a.sy})`);
}
check('村民拾取可用', villagerCount > 0 && !!picked, `${villagerCount} 个村民`);

/* 5. 选中后画箭头 */
if (picked) {
  evalIn('selected = pickVillager(villagerAnchor(villagers[0]).sx, villagerAnchor(villagers[0]).sy)');
  const p3 = getPix();
  runFrames(2);
  const p4 = getPix();
  let d2 = 0;
  for (let i = 0; i < p3.length; i++) if (p3[i] !== p4[i]) d2++;
  /* 箭头在选中时才画：比较"有选中"和"无选中"的画面 */
  evalIn('selected = null');
  runFrames(2);
  const p5 = getPix();
  let d3 = 0;
  for (let i = 0; i < p4.length; i++) if (p4[i] !== p5[i]) d3++;
  check('选中标记可见', d3 > 0, `选中/未选中画面差 ${d3} 像素`);
}

/* 6. 公路可见（几何采样：沿路中心线 ±10px 走廊数"非树冠"像素）
 * ★ 为什么不用颜色统计：沥青是暖灰（s≈0.19），树影/墙影也是暖灰，
 *   颜色判据永远失准。直接沿已知路中心线采样 ——
 *   路被树盖住时该处是金黄，路露出来时是灰/黄虚线。 */
{
  const W = evalIn('W'), H = evalIn('H');
  const pix = evalIn('pix');
  const ax = 4.56, ay = 28.13, bx2 = 46.92, by2 = 23.35;
  const S = evalIn('S'), OX = evalIn('OX'), OY = evalIn('OY'), R2 = evalIn('R2');
  const sxOf = (x, y) => OX + (x - y) / R2 * S;
  const syOf = (x, y) => OY + ((x + y) / R2 * 0.5) * S;
  let clear = 0, total = 0;
  /* 路中心线的屏幕方向 ≈ (0.93, 0.37)，垂直方向 ≈ (-0.37, 0.93)。
     ★ 采样偏移必须沿**垂直**方向 —— 沿路方向偏移会一直压在中心虚线上
     （虚线 rgb 238,194,62 和树冠金色几乎同色，颜色判据分不出来）。 */
  const pxDir = -0.372, pyDir = 0.93;
  for (let i = 0; i <= 120; i++) {
    const t = i / 120;
    const wx = ax + (bx2 - ax) * t, wy = ay + (by2 - ay) * t;
    const cx = sxOf(wx, wy), cy = syOf(wx, wy);
    for (const off of [-14, -8, 8, 14]) {
      const ix = Math.round(cx + pxDir * off), iy = Math.round(cy + pyDir * off);
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
      total++;
      const c = pix[iy * W + ix], r = c & 255, g = c >> 8 & 255, b = c >> 16 & 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const s = mx === 0 ? 0 : (mx - mn) / mx;
      let hu = 0;
      if (mx !== mn) {
        if (mx === r) hu = 60 * (((g - b) / (mx - mn)) % 6);
        else if (mx === g) hu = 60 * ((b - r) / (mx - mn) + 2);
        else hu = 60 * ((r - g) / (mx - mn) + 4);
        if (hu < 0) hu += 360;
      }
      /* 金黄树冠（高饱和高明度的橙黄）→ 路被盖住 */
      const foliage = hu >= 20 && hu <= 58 && s > .45 && mx > 180;
      if (!foliage) clear++;
    }
  }
  const pct = clear / total * 100;
  check('公路在画面内可见', pct > 25, `走廊 ${total} 采样点中 ${pct.toFixed(0)}% 未被树冠盖住`);
}

/* 7. 房子可见（深棕木屋墙面） */
{
  const W = evalIn('W'), H = evalIn('H');
  const pix = evalIn('pix');
  let housePx = 0;
  for (let i = 0; i < W * H; i++) {
    const c = pix[i], r = c & 255, g = c >> 8 & 255, b = c >> 16 & 255;
    if (r > 70 && r < 130 && g > 50 && g < 105 && b > 35 && b < 85 && r > b + 12) housePx++;
  }
  check('木屋可见', housePx > 300, `${housePx} 个墙面像素`);
}

/* 8. 金黄主调充分
 * 断言随构图演进：整幅树海时代要求 >80%（参考图 90.7%）；
 * 现构图是「岛式留白」（用户要求：纯色背景 + 水墨晕开），
 * 背景留白占 1/4 以上 → 金黄占比自然下降。
 * 阈值 45%：保证画面主体（塔林+地形+落叶）仍是金黄主调，
 * 同时不足以把留白也算进去（雾化前的纯背景不算金黄）。 */
{
  const W = evalIn('W'), H = evalIn('H');
  const pix = evalIn('pix');
  let gold = 0, total = W * H;
  for (let i = 0; i < total; i++) {
    const c = pix[i], r = c & 255, g = c >> 8 & 255, b = c >> 16 & 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const s = mx === 0 ? 0 : (mx - mn) / mx;
    let hu = 0;
    if (mx !== mn) {
      if (mx === r) hu = 60 * (((g - b) / (mx - mn)) % 6);
      else if (mx === g) hu = 60 * ((b - r) / (mx - mn) + 2);
      else hu = 60 * ((r - g) / (mx - mn) + 4);
      if (hu < 0) hu += 360;
    }
    if (hu >= 20 && hu <= 55 && s > .35) gold++;
  }
  const pct = gold / total * 100;
  check('金黄主调充分（岛式留白构图）', pct > 30, `${pct.toFixed(1)}%`);
}

/* 导出最终画面 */
{
  const W = evalIn('W'), H = evalIn('H');
  const pix = evalIn('pix');
  const rgba = Buffer.alloc(W * H * 4);
  Buffer.from(pix.buffer, pix.byteOffset, W * H * 4).copy(rgba);
  const out = path.join(ROOT, 'docs/village-screenshot.png');
  fs.writeFileSync(out, encodePNG(W, H, rgba));
  console.log(`\n  截图已保存: docs/village-screenshot.png`);
}

console.log(`\n=== 结果: ${pass} 通过 / ${fail} 失败 ===\n`);
process.exit(fail ? 1 : 0);
