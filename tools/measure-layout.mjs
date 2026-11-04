#!/usr/bin/env node
/* 测量参考图的纵向构图：
 *   - 每列最高的"非天空"像素 → 树冠轮廓线
 *   - 每列的路面位置（已由 measure-road 得出）
 *   → 得出"树冠比路面高多少"，即树的等效屏幕高度
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

function decodePNG(path) {
  const buf = fs.readFileSync(path);
  let off = 8, w = 0, h = 0, ctype = 0, interlace = 0;
  const idat = []; let palette = null;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ctype = data[9]; interlace = data[12]; }
    else if (type === 'PLTE') palette = Buffer.from(data);
    else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype], stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[pos++];
    const line = raw.subarray(pos, pos + stride); pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      cur[x] = v & 255;
    }
  }
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    let r, g, b, a = 255;
    if (ctype === 0) { r = g = b = out[i]; }
    else if (ctype === 2) { r = out[i * 3]; g = out[i * 3 + 1]; b = out[i * 3 + 2]; }
    else if (ctype === 3) { const p = out[i] * 3; r = palette[p]; g = palette[p + 1]; b = palette[p + 2]; }
    else if (ctype === 4) { r = g = b = out[i * 2]; a = out[i * 2 + 1]; }
    else { r = out[i * 4]; g = out[i * 4 + 1]; b = out[i * 4 + 2]; a = out[i * 4 + 3]; }
    if (a < 255) { const al = a / 255; r = Math.round(r * al + 255 * (1 - al)); g = Math.round(g * al + 255 * (1 - al)); b = Math.round(b * al + 255 * (1 - al)); }
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a;
  }
  return { w, h, rgba };
}

const img = decodePNG(process.argv[2]);
const { w, h, rgba } = img;

/* 天空：淡奶油色，(252,245,218) 附近 */
function isSky(r, g, b) {
  return r > 238 && g > 228 && b > 195 && b < 235;
}

console.log(`参考图 ${w}×${h}`);
console.log(`\n=== 每列最高非天空像素（树冠轮廓）===`);
const tops = [];
for (let x = 0; x < w; x += Math.floor(w / 22)) {
  let top = -1;
  for (let y = 0; y < h; y++) {
    const i = (y * w + x) * 4;
    if (!isSky(rgba[i], rgba[i + 1], rgba[i + 2])) { top = y; break; }
  }
  if (top >= 0) tops.push({ x, top });
}
for (const t of tops)
  console.log(`  x=${String(t.x).padStart(3)} (${(t.x / w * 100).toFixed(0).padStart(3)}%)  树冠顶 y=${String(t.top).padStart(4)} (${(t.top / h * 100).toFixed(0).padStart(3)}% 高)`);

const minTop = Math.min(...tops.map(t => t.top));
const avgTop = tops.reduce((a, t) => a + t.top, 0) / tops.length;
console.log(`\n  最高树冠: y=${minTop} (${(minTop / h * 100).toFixed(1)}% 高)`);
console.log(`  平均树冠顶: y=${avgTop.toFixed(0)} (${(avgTop / h * 100).toFixed(1)}% 高)`);

/* 天空占比 */
let sky = 0;
for (let i = 0; i < w * h; i++) if (isSky(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2])) sky++;
console.log(`\n  天空占比: ${(sky / (w * h) * 100).toFixed(1)}%`);

/* 路面中心线高度（复用 measure-road 的判据） */
function isRoad(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const s = mx === 0 ? 0 : (mx - mn) / mx, v = mx;
  if (s > .30 || v < 95 || v > 165) return false;
  if (r - b > 45) return false;
  return true;
}
const roadYs = [];
for (let x = 0; x < w; x += Math.floor(w / 22)) {
  const ys = [];
  for (let y = 0; y < h; y++) {
    const i = (y * w + x) * 4;
    if (isRoad(rgba[i], rgba[i + 1], rgba[i + 2])) ys.push(y);
  }
  if (ys.length > 6) roadYs.push({ x, yc: (ys[0] + ys[ys.length - 1]) / 2 });
}
if (roadYs.length) {
  const r0 = roadYs[0], r1 = roadYs[roadYs.length - 1];
  console.log(`\n=== 路面 vs 树冠（纵向关系）===`);
  console.log(`  左端: 路面 y=${r0.yc.toFixed(0)}  树冠顶 y=${tops[0]?.top}`);
  console.log(`  右端: 路面 y=${r1.yc.toFixed(0)}  树冠顶 y=${tops[tops.length - 1]?.top}`);
  const roadAvg = roadYs.reduce((a, r) => a + r.yc, 0) / roadYs.length;
  console.log(`  平均路面 y=${roadAvg.toFixed(0)} (${(roadAvg / h * 100).toFixed(0)}%)`);
  console.log(`  平均树冠顶 y=${avgTop.toFixed(0)} (${(avgTop / h * 100).toFixed(0)}%)`);
  console.log(`  → 树冠高出路面 ${(roadAvg - avgTop).toFixed(0)}px = 画面高的 ${((roadAvg - avgTop) / h * 100).toFixed(1)}%`);
}
