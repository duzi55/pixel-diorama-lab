#!/usr/bin/env node
/* 量一幅图里树冠团块和树干的屏幕尺寸
 * 用法: node tools/measure-blobs.mjs <png> [标签]
 *
 * 方法：树冠之间有深色描边缝隙 → 沿行扫描，找"连续金色段"的长度。
 * 树干是深褐色竖条 → 沿列扫描，找"连续暗褐段"的长度。
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

const path = process.argv[2];
const label = process.argv[3] || path;
const img = decodePNG(path);
const { w, h, rgba } = img;
const px = (x, y) => { const i = (y * w + x) * 4; return [rgba[i], rgba[i + 1], rgba[i + 2]]; };

/* 金黄（树冠）判据 */
function isGold(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const s = mx === 0 ? 0 : (mx - mn) / mx;
  let hu = 0;
  if (mx !== mn) {
    if (mx === r) hu = 60 * (((g - b) / (mx - mn)) % 6);
    else if (mx === g) hu = 60 * ((b - r) / (mx - mn) + 2);
    else hu = 60 * ((r - g) / (mx - mn) + 4);
    if (hu < 0) hu += 360;
  }
  return hu >= 18 && hu <= 58 && s > .35;
}
/* 深褐（树干）判据 */
function isBark(r, g, b) {
  const lum = (r + g + b) / 3;
  return lum < 120 && r > b && r - b > 12 && g >= b;
}

console.log(`\n=== ${label}  ${w}×${h} ===\n`);

/* 树冠：沿行找金色连续段 */
console.log('树冠团块（沿行扫连续金黄段）：');
const allLens = [];
for (const row of [Math.round(h * .12), Math.round(h * .25), Math.round(h * .38), Math.round(h * .5)]) {
  const segs = [];
  let start = -1;
  for (let x = 0; x <= w; x++) {
    const c = x < w ? px(x, row) : [0, 0, 0];
    const gold = x < w && isGold(c[0], c[1], c[2]);
    if (gold && start < 0) start = x;
    else if (!gold && start >= 0) {
      const len = x - start;
      if (len > 8) { segs.push(len); allLens.push(len); }
      start = -1;
    }
  }
  const avg = segs.length ? segs.reduce((a, b) => a + b, 0) / segs.length : 0;
  console.log(`  行 ${String(row).padStart(3)} (${String(Math.round(row / h * 100)).padStart(2)}%高): ${segs.length} 段，平均 ${avg.toFixed(0)}px = 画布 ${(avg / w * 100).toFixed(0)}%`);
}
if (allLens.length) {
  const avg = allLens.reduce((a, b) => a + b, 0) / allLens.length;
  console.log(`  → 平均树冠宽 ${avg.toFixed(0)}px = 画布宽 ${(avg / w * 100).toFixed(0)}%`);
}

/* 树干：沿列找褐色连续段 */
console.log('\n树干（沿列扫连续褐段）：');
const barkLens = [];
for (const col of [Math.round(w * .2), Math.round(w * .35), Math.round(w * .55), Math.round(w * .75)]) {
  const segs = [];
  let start = -1;
  for (let y = 0; y <= h; y++) {
    const c = y < h ? px(col, y) : [0, 0, 0];
    const bark = y < h && isBark(c[0], c[1], c[2]);
    if (bark && start < 0) start = y;
    else if (!bark && start >= 0) {
      const len = y - start;
      if (len > 6) segs.push(len);
      start = -1;
    }
  }
  if (segs.length) {
    const avg = segs.reduce((a, b) => a + b, 0) / segs.length;
    barkLens.push(avg);
    console.log(`  列 ${String(col).padStart(3)}: ${segs.length} 段，最长 ${Math.max(...segs)}px`);
  }
}
if (barkLens.length) {
  const avg = barkLens.reduce((a, b) => a + b, 0) / barkLens.length;
  console.log(`  → 平均树干长 ${avg.toFixed(0)}px；宽度另测（沿行找褐色段）`);
}

/* 树干宽度：沿行找褐色段 */
console.log('\n树干宽度（沿行找褐色短段）：');
const widths = [];
for (const row of [Math.round(h * .3), Math.round(h * .45), Math.round(h * .6)]) {
  const segs = [];
  let start = -1;
  for (let x = 0; x <= w; x++) {
    const c = x < w ? px(x, row) : [0, 0, 0];
    const bark = x < w && isBark(c[0], c[1], c[2]);
    if (bark && start < 0) start = x;
    else if (!bark && start >= 0) {
      const len = x - start;
      if (len > 2 && len < 40) { segs.push(len); widths.push(len); }
      start = -1;
    }
  }
  if (segs.length) {
    const avg = segs.reduce((a, b) => a + b, 0) / segs.length;
    console.log(`  行 ${String(row).padStart(3)}: ${segs.length} 段，平均宽 ${avg.toFixed(1)}px = 画布 ${(avg / w * 100).toFixed(1)}%`);
  }
}
if (widths.length) {
  const avg = widths.reduce((a, b) => a + b, 0) / widths.length;
  console.log(`  → 平均树干宽 ${avg.toFixed(1)}px = 画布宽 ${(avg / w * 100).toFixed(1)}%`);
}

/* 留白：背景色占比 */
let bg = 0;
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const c = px(x, y);
  if (c[0] > 235 && c[1] > 222 && c[2] > 180 && c[2] < 235) bg++;
}
console.log(`\n背景留白: ${(bg / (w * h) * 100).toFixed(1)}%`);
