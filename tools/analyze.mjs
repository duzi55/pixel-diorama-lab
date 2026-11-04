#!/usr/bin/env node
/* ------------------------------------------------------------------
 * 图像分析工具：量参考图，也量自己的渲染图
 *
 * 用法：
 *   node tools/analyze.mjs <png> stats            分类统计 + 公路直线拟合
 *   node tools/analyze.mjs <png> crop <x> <y> <w> <h> <out.png> [放大倍数]
 *
 * 为什么需要它：
 *   "公路该走什么方向"这种问题，靠目测和推导都会错。
 *   参考图的公路斜率、宽度、天空占比，量出来就是定论。
 * ------------------------------------------------------------------ */

import fs from 'node:fs';
import zlib from 'node:zlib';

/* ---------------- PNG 解码 ---------------- */

function decodePNG(path) {
  const buf = fs.readFileSync(path);
  let off = 8, w = 0, h = 0, depth = 0, ctype = 0, interlace = 0;
  const idat = [];
  let palette = null;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; ctype = data[9]; interlace = data[12];
    } else if (type === 'PLTE') palette = Buffer.from(data);
    else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (interlace) throw new Error('暂不支持隔行 PNG');
  if (depth !== 8) throw new Error('暂不支持位深 ' + depth);

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
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
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
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a;
  }
  return { w, h, rgba };
}

/* ---------------- PNG 编码 ---------------- */

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

/* ---------------- 颜色分类 ---------------- */

/* 分类依据：饱和度 s 与明度 v */
function classify(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const v = mx / 255;
  const s = mx === 0 ? 0 : (mx - mn) / mx;
  /* 色相（仅在有饱和度时有意义） */
  let hu = 0;
  if (mx !== mn) {
    if (mx === r) hu = 60 * (((g - b) / (mx - mn)) % 6);
    else if (mx === g) hu = 60 * ((b - r) / (mx - mn) + 2);
    else hu = 60 * ((r - g) / (mx - mn) + 4);
    if (hu < 0) hu += 360;
  }
  if (s < .16 && v > .72) return 'sky';        // 奶油色天空
  if (s < .13 && v >= .22 && v <= .64) return 'road';  // 灰色路面
  if (s < .18 && v > .64) return 'pale';       // 浅灰（路缘、人行道、墙）
  if (hu >= 20 && hu <= 55 && s > .35) return 'gold';  // 金黄树冠
  if (hu > 55 && hu < 160 && s > .25) return 'green'; // 绿/苔藓
  if (hu < 20 || hu >= 345) return 'warm';     // 暖褐（木材、地面）
  return 'other';
}

/* ---------------- stats ---------------- */

function stats(img) {
  const { w, h, rgba } = img;
  const counts = { sky: 0, road: 0, pale: 0, gold: 0, green: 0, warm: 0, other: 0 };
  for (let i = 0; i < w * h; i++) {
    const c = classify(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    counts[c]++;
  }
  const total = w * h;
  console.log(`\n=== ${w}×${h} 分类占比 ===`);
  for (const k of Object.keys(counts))
    console.log(`  ${k.padEnd(6)} ${(counts[k] / total * 100).toFixed(1)}%`);

  /* 公路：逐列找灰像素带，拟合中心线 */
  const cols = [];
  for (let x = 0; x < w; x++) {
    const ys = [];
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      if (classify(rgba[i], rgba[i + 1], rgba[i + 2]) === 'road') ys.push(y);
    }
    if (ys.length < 4) continue;
    /* 取最长的连续段（公路本身），避免把屋顶也算进来 */
    let bestS = 0, bestE = 0, s0 = ys[0], prev = ys[0];
    for (let k = 1; k < ys.length; k++) {
      if (ys[k] > prev + 3) {
        if (prev - s0 > bestE - bestS) { bestS = s0; bestE = prev; }
        s0 = ys[k];
      }
      prev = ys[k];
    }
    if (prev - s0 > bestE - bestS) { bestS = s0; bestE = prev; }
    if (bestE - bestS < 5) continue;
    cols.push({ x, y0: bestS, y1: bestE, yc: (bestS + bestE) / 2, wid: bestE - bestS });
  }
  if (cols.length > 20) {
    /* 最小二乘拟合 y = m*x + c */
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const c of cols) { sx += c.x; sy += c.yc; sxx += c.x * c.x; sxy += c.x * c.yc; }
    const n = cols.length, m = (n * sxy - sx * sy) / (n * sxx - sx * sx), b = (sy - m * sx) / n;
    const widths = cols.map(c => c.wid);
    const avgW = widths.reduce((a, c) => a + c, 0) / widths.length;
    const first = cols[0], last = cols[cols.length - 1];
    console.log(`\n=== 公路（灰像素拟合）===`);
    console.log(`  有效列 ${n} / ${w}`);
    console.log(`  斜率 m = ${m.toFixed(4)}   截距 b = ${b.toFixed(1)}`);
    console.log(`  左端: x=${first.x} y=${first.yc.toFixed(0)} 带宽 ${first.wid}px`);
    console.log(`  右端: x=${last.x} y=${last.yc.toFixed(0)} 带宽 ${last.wid}px`);
    console.log(`  平均带宽 ${avgW.toFixed(1)}px  = 画面宽的 ${(avgW / w * 100).toFixed(1)}%`);
    console.log(`  → 等距投影里：2(dx-dy)/(dx+dy) = ${m.toFixed(3)}  ⇒  dy/dx = ${((1 - m / 2) / (1 + m / 2)).toFixed(3)}`);
    /* 打印每 10% 宽度的采样 */
    console.log(`\n  采样（x 比例 / 中心 y / 带宽）:`);
    for (let f = 0; f <= 10; f++) {
      const x = Math.round(w * f / 10);
      const near = cols.filter(c => Math.abs(c.x - x) < w * .04);
      if (!near.length) continue;
      const avgY = near.reduce((a, c) => a + c.yc, 0) / near.length;
      const avgWd = near.reduce((a, c) => a + c.wid, 0) / near.length;
      console.log(`    ${(f * 10).toString().padStart(3)}%  x=${String(x).padStart(4)}  y=${avgY.toFixed(0).padStart(4)}  宽=${avgWd.toFixed(0)}`);
    }
  } else {
    console.log('\n=== 公路：未找到足够的连续灰像素带 ===');
  }
}

/* ---------------- crop ---------------- */

function crop(img, cx, cy, cw, ch, outPath, scale) {
  const { rgba } = img;
  const ow = cw * scale, oh = ch * scale;
  const out = new Uint8Array(ow * oh * 4);
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const sx = Math.min(img.w - 1, cx + Math.floor(x / scale));
      const sy = Math.min(img.h - 1, cy + Math.floor(y / scale));
      const si = (sy * img.w + sx) * 4, di = (y * ow + x) * 4;
      out[di] = rgba[si]; out[di + 1] = rgba[si + 1];
      out[di + 2] = rgba[si + 2]; out[di + 3] = rgba[si + 3];
    }
  }
  fs.writeFileSync(outPath, encodePNG(ow, oh, out));
  console.log(`✓ ${outPath}  ${ow}×${oh}（源区域 ${cx},${cy} ${cw}×${ch}，放大 ${scale}×）`);
}

/* ---------------- 主流程 ---------------- */

const [file, cmd, ...rest] = process.argv.slice(2);
if (!file) { console.error('用法: node tools/analyze.mjs <png> stats | crop ...'); process.exit(1); }
const img = decodePNG(file);

if (cmd === 'stats' || !cmd) stats(img);
else if (cmd === 'crop') {
  const [cx, cy, cw, ch, out, sc] = rest;
  crop(img, +cx, +cy, +cw, +ch, out || '/tmp/crop.png', +(sc || 2));
}
