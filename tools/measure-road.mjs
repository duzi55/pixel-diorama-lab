#!/usr/bin/env node
/* 精确测量参考图里公路的屏幕几何：逐列扫描灰蓝色像素带 */
import fs from 'node:fs';
import zlib from 'node:zlib';

function decodePNG(path) {
  const buf = fs.readFileSync(path);
  let off = 8, w = 0, h = 0, depth = 0, ctype = 0, interlace = 0;
  const idat = []; let palette = null;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; interlace = data[12]; }
    else if (type === 'PLTE') palette = Buffer.from(data);
    else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  const bpp = channels, stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[pos++];
    const line = raw.subarray(pos, pos + stride); pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (ft === 1) v += a; else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
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
    /* 有 alpha 时，未合成到白底会得到错误的 RGB —— 先合成 */
    if (a < 255) {
      const al = a / 255;
      r = Math.round(r * al + 255 * (1 - al));
      g = Math.round(g * al + 255 * (1 - al));
      b = Math.round(b * al + 255 * (1 - al));
    }
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a;
  }
  return { w, h, rgba };
}

const img = decodePNG(process.argv[2]);
const { w, h, rgba } = img;

/* 参考图的路面：暖灰（被秋日阳光染过），实测 (141,124,105) */
function isRoad(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const s = mx === 0 ? 0 : (mx - mn) / mx;
  const v = mx;
  if (s > .30) return false;                 // 颜色太艳 → 不是沥青
  if (v < 95 || v > 165) return false;       // 明度范围（路面是中间调）
  if (r - b > 45) return false;              // 太红 → 是落叶/木，不是沥青
  return true;
}

/* 先看看哪些像素被判为路面 */
let total = 0;
for (let i = 0; i < w * h; i++) if (isRoad(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2])) total++;
console.log(`判为路面的像素: ${total} (${(total / (w * h) * 100).toFixed(1)}%)`);

/* 逐列找最长连续段 */
const cols = [];
for (let x = 0; x < w; x++) {
  const ys = [];
  for (let y = 0; y < h; y++) {
    const i = (y * w + x) * 4;
    if (isRoad(rgba[i], rgba[i + 1], rgba[i + 2])) ys.push(y);
  }
  if (!ys.length) continue;
  /* 最长连续段 */
  let bs = ys[0], be = ys[0], s0 = ys[0], prev = ys[0];
  for (let k = 1; k < ys.length; k++) {
    if (ys[k] > prev + 4) { if (prev - s0 > be - bs) { bs = s0; be = prev; } s0 = ys[k]; }
    prev = ys[k];
  }
  if (prev - s0 > be - bs) { bs = s0; be = prev; }
  if (be - bs < 8) continue;
  cols.push({ x, y0: bs, y1: be, yc: (bs + be) / 2, wid: be - bs });
}

console.log(`有效列: ${cols.length} / ${w}`);
if (cols.length > 30) {
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const c of cols) { sx += c.x; sy += c.yc; sxx += c.x * c.x; sxy += c.x * c.yc; }
  const n = cols.length, m = (n * sxy - sx * sy) / (n * sxx - sx * sx), b = (sy - m * sx) / n;
  console.log(`\n=== 公路屏幕斜率 ===`);
  console.log(`  m = ${m.toFixed(4)}   b = ${b.toFixed(1)}`);
  console.log(`  公路中心线: y = ${m.toFixed(4)} * x + ${b.toFixed(1)}`);
  const f = cols[0], l = cols[cols.length - 1];
  console.log(`  左端 x=${f.x} y=${f.yc.toFixed(0)} 宽 ${f.wid}px`);
  console.log(`  右端 x=${l.x} y=${l.yc.toFixed(0)} 宽 ${l.wid}px`);
  const avgW = cols.reduce((a, c) => a + c.wid, 0) / cols.length;
  console.log(`  平均带宽 ${avgW.toFixed(1)}px / 画面宽 ${w} = ${(avgW / w * 100).toFixed(1)}%`);

  console.log(`\n  沿路采样:`);
  for (let p = 0; p <= 10; p++) {
    const x = Math.round(w * p / 10);
    const near = cols.filter(c => Math.abs(c.x - x) < w * .05);
    if (!near.length) { console.log(`    ${p * 10}%  x=${x}  (无数据)`); continue; }
    const avgY = near.reduce((a, c) => a + c.yc, 0) / near.length;
    const avgWd = near.reduce((a, c) => a + c.wid, 0) / near.length;
    console.log(`    ${String(p * 10).padStart(3)}%  x=${String(x).padStart(4)}  y=${avgY.toFixed(0).padStart(4)} (${(avgY / h * 100).toFixed(0)}%高)  宽=${avgWd.toFixed(0)}`);
  }

  /* 换算到等距投影 */
  console.log(`\n=== 换算到 30° 等距投影 ===`);
  console.log(`  屏幕斜率 m = ${m.toFixed(4)}`);
  const k = (2 * m - 1) / (2 * m + 1);
  console.log(`  ⇒ dy/dx = ${k.toFixed(4)}`);
  console.log(`  （即世界坐标里公路方向 (dx, dy) 满足 dy = ${k.toFixed(3)} · dx）`);
  console.log(`  常见取值参考：m=0.20 → k=${((2 * .2 - 1) / (2 * .2 + 1)).toFixed(3)}`);
  console.log(`                m=0.30 → k=${((2 * .3 - 1) / (2 * .3 + 1)).toFixed(3)}`);
  console.log(`                m=0.50 → k=${((2 * .5 - 1) / (2 * .5 + 1)).toFixed(3)}`);
  console.log(`                m=1.00 → k=${((2 * 1 - 1) / (2 * 1 + 1)).toFixed(3)}`);
}
