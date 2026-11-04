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
    /* ★ 按浏览器全屏窗口跑：画布 = 窗口尺寸（1:1 像素）。
       地面/公路会延伸出"基准画面"再有机消散，只有全屏画布下
       边距断言才有意义。 */
    PP_HEADLESS: false, innerWidth: 1400, innerHeight: 820, devicePixelRatio: 1,
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
/* 极简场景：9 棵锥树 + 4 房 + 车/村民，非背景非地面像素即树/房/物件 */
check('树已烘焙进底图', treePix > 500, `${treePix} 个树/物件像素`);

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

/* 6. 公路可见：数**路面灰白像素**（ASPHALT 亮灰系 + 黄虚线）。
 * 亮灰判定：低饱和 + 中高明度（背景米色也是低饱和但明度更高，
 * 且精确等值跳过；树冠金黄是高饱和）。 */
{
  const W = evalIn('W'), H = evalIn('H');
  const pix = evalIn('pix');
  const bg = evalIn('rgb(252, 245, 218)');
  let roadPx = 0;
  for (let i = 0; i < W * H; i++) {
    const c = pix[i];
    if (c === bg) continue;
    const r = c & 255, g = c >> 8 & 255, b = c >> 16 & 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx === 0 ? 0 : (mx - mn) / mx;
    if (sat < .22 && mx > 140 && mx < 235) roadPx++;
  }
  check('公路在画面内可见（亮灰路面）', roadPx > 800, `${roadPx} 个路面像素`);
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

/* 8. 纯色背景留白（用户要求的核心构图）：
 * 场景（房/树/路）居中，四周是大面积纯色背景（SKY 精确等值，
 * 无雾化无渐变）。留白应占画布多数。 */
{
  const W = evalIn('W'), H = evalIn('H');
  const pix = evalIn('pix');
  const bg = evalIn('rgb(252, 245, 218)');
  let blank = 0, total = W * H;
  for (let i = 0; i < total; i++) if (pix[i] === bg) blank++;
  const pct = blank / total * 100;
  /* 阈值 25%：场景加密后留白自然下降；这条断言守的是
     "背景必须是纯色留白、不能铺满"（用户核心要求），不是精确占比 */
  check('纯色背景留白充分', pct > 25, `留白 ${pct.toFixed(0)}%`);
}

/* 8.5 车辆淡入淡出：路端不"凭空消失/出现"
 * 车开到画面外侧 → fade→0；回到画面中央 → fade→1。 */
{
  const probe = t => evalIn(`(() => {
    Road.car.t = ${t}; Road.updateCar(${t}, 0);
    update(0, 0);
    return +Road.car.fade.toFixed(2);
  })()`);
  const mid = probe(.5), farR = probe(1.55), farL = probe(-.8);
  check('车辆在画面中央完全可见、路端淡出', mid > .95 && farR < .15 && farL < .15,
    `中央 ${mid} · 右端 ${farR} · 左端 ${farL}`);
}

/* 8.6 树冠风动：只看画面上部（y<220，只有树冠和天空）的帧间变化 */
{
  const W = evalIn('W'), H = evalIn('H');
  evalIn('lastStep = -1; update(0, 0); draw(0)');
  const a = Array.from(evalIn('pix'));
  evalIn('update(2.0, 2.0); draw(2.0)');
  const b = Array.from(evalIn('pix'));
  let changed = 0;
  for (let i = 0; i < a.length; i++) {
    if (((i / W) | 0) >= Math.min(220, H)) break;
    if (a[i] !== b[i]) changed++;
  }
  const sprites = evalIn('treeSprites.length');
  check('树冠随风摆动', sprites > 0 && changed > 150, `${sprites} 个树冠精灵 · 上部帧差 ${changed}px`);
}

/* 9. 内容不触碰画布边缘（防"方框裁切"回归）
 * 用户反复看到的"方框" = 地形/树木在画布边界被直线切断。
 * 断言：非背景像素的包围盒四边都留出 ≥12px 纯色纸背景。 */
{
  const W = evalIn('W'), H = evalIn('H');
  const pix = evalIn('pix');
  const bg = evalIn('rgb(252, 245, 218)');
  let minX = W, maxX = -1, minY = H, maxY = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (pix[y * W + x] === bg) continue;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const margins = { left: minX, right: W - 1 - maxX, top: minY, bottom: H - 1 - maxY };
  const ok = margins.left >= 12 && margins.right >= 12 && margins.top >= 12 && margins.bottom >= 12;
  check('内容不触碰画布边缘（无方框裁切）', ok,
    `边距 左${margins.left} 右${margins.right} 上${margins.top} 下${margins.bottom}`);
}

/* 10. 全屏模式冒烟：模拟横屏浏览器窗口（PP_HEADLESS=false + PP_FULLSCREEN），
 *    S 自适应 → PP_setSize → bake/draw 数帧不崩，场景在画布上可见。
 *    这是"画布全屏不裁切"的回归闸（曾有窗口尺寸下布点全灭 → 白屏的崩溃）。 */
{
  try {
    evalIn(`
      PP_HEADLESS = false; PP_FULLSCREEN = true;
      PP_SCALE = Math.max(2.5, Math.min(9, Math.sqrt(1200 / 100), Math.sqrt(900 / 52)));
      PP_ORIGIN_Y = -Math.round(11.3 * PP_SCALE);
      PP_setSize(Math.ceil(1200 / PP_SCALE), Math.ceil(900 / PP_SCALE));
      lastStep = -1; bake();
    `);
    // bake 数帧（draw 走每帧路径）
    for (let f = 0; f < 3; f++) evalIn(`update(${f / 12}, 1 / 12); draw(${f / 12});`);
    const info = evalIn(`(() => {
      let tree = 0, groundPix = 0;
      const bg = rgb(252, 245, 218);
      for (let i = 0; i < pix.length; i++) {
        if (pix[i] === bg) continue;
        if (ground[i]) groundPix++; else tree++;
      }
      return { w: W, h: H, tree, groundPix };
    })()`);
    const ok = info.tree > 200 && info.groundPix > 500;
    check('全屏模式 bake/draw 不崩且场景可见', ok,
      `${info.w}×${info.h}  树 ${info.tree}px  地面 ${info.groundPix}px`);
  } catch (e) {
    check('全屏模式 bake/draw 不崩且场景可见', false, String(e).slice(0, 90));
  }
}

console.log(`\n=== 结果: ${pass} 通过 / ${fail} 失败 ===\n`);
process.exit(fail ? 1 : 0);
