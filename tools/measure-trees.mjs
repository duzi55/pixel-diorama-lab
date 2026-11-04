#!/usr/bin/env node
/* 量参考图的三件事：树冠尺寸、房子尺寸、树的分布簇
 * 用法: node tools/measure-trees.mjs <ref.png>
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
const px = (x, y) => { const i = (y * w + x) * 4; return [rgba[i], rgba[i + 1], rgba[i + 2]]; };

/* 树冠的深色描边：亮度低于相邻金色区域很多 */
function isEdge(r, g, b) { return (r + g + b) / 3 < 110; }
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

/* 1. 树冠连通块 → 每个块的宽高 */
console.log(`参考图 ${w}×${h}\n`);
console.log('=== 树冠团块尺寸（连通域）===');

const seen = new Uint8Array(w * h);
const blobs = [];
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (seen[i]) continue;
    const c = px(x, y);
    if (!isGold(c[0], c[1], c[2])) continue;
    /* 洪水填充 */
    const stack = [i];
    seen[i] = 1;
    let minx = x, maxx = x, miny = y, maxy = y, n = 0;
    while (stack.length) {
      const j = stack.pop();
      const jy = (j / w) | 0, jx = j % w;
      n++;
      if (jx < minx) minx = jx; if (jx > maxx) maxx = jx;
      if (jy < miny) miny = jy; if (jy > maxy) maxy = jy;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = jx + dx, ny = jy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx;
        if (seen[k]) continue;
        const cc = px(nx, ny);
        if (!isGold(cc[0], cc[1], cc[2])) continue;
        seen[k] = 1; stack.push(k);
      }
    }
    if (n > 120) blobs.push({ minx, maxx, miny, maxy, n, bw: maxx - minx + 1, bh: maxy - miny + 1 });
  }
}
blobs.sort((a, b) => b.n - a.n);
console.log(`  找到 ${blobs.length} 个树冠块（面积>120px）`);
console.log('  最大的 12 个（宽×高 / 中心Y）：');
for (const b of blobs.slice(0, 12)) {
  console.log(`    ${String(b.bw).padStart(3)}×${String(b.bh).padStart(3)}  中心y=${String(((b.miny + b.maxy) / 2) | 0).padStart(4)}  面积=${b.n}`);
}
const big = blobs.slice(0, 20);
if (big.length) {
  const avgW = big.reduce((a, b) => a + b.bw, 0) / big.length;
  const avgH = big.reduce((a, b) => a + b.bh, 0) / big.length;
  console.log(`\n  前 20 大块平均：宽 ${avgW.toFixed(0)}px × 高 ${avgH.toFixed(0)}px`);
  console.log(`  宽高比 ${(avgW / avgH).toFixed(2)}`);
}

/* 2. 房子：深褐色木屋墙面（低明度 + 偏红） */
console.log('\n=== 房子（深棕木墙）区域 ===');
{
  let minx = 1e9, maxx = -1, miny = 1e9, maxy = -1, n = 0;
  const rowsMap = new Map();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = px(x, y);
    const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]);
    const s = mx === 0 ? 0 : (mx - mn) / mx;
    /* 木屋墙：中等明度、暖棕（r > b）、饱和度中等 */
    if (s > .18 && s < .55 && c[0] > 55 && c[0] < 150 && c[0] - c[2] > 22 && c[2] < 90) {
      n++;
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
      rowsMap.set(y, (rowsMap.get(y) || 0) + 1);
    }
  }
  console.log(`  木墙像素 ${n}，包围盒 x ${minx}..${maxx} (${maxx - minx}px)  y ${miny}..${maxy} (${maxy - miny}px)`);
  console.log(`  占画面宽 ${((maxx - minx) / w * 100).toFixed(0)}%，占画面高 ${((maxy - miny) / h * 100).toFixed(0)}%`);
  /* 按行统计，看房子集中在哪 */
  let best = 0, bestY = 0;
  for (const [y, c] of rowsMap) if (c > best) { best = c; bestY = y; }
  console.log(`  木墙最密的一行：y=${bestY} (${(bestY / h * 100).toFixed(0)}% 高)，该行 ${best}px`);
}

/* 3. 树的分布：每一行有多少"非天空"像素，看疏密节奏 */
console.log('\n=== 逐行"有内容"比例（疏密节奏）===');
for (let y0 = 0; y0 < h; y0 += h / 20) {
  const y1 = Math.min(h, Math.round(y0 + h / 20));
  let filled = 0, total = 0;
  for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) {
    const c = px(x, y);
    total++;
    /* 非天空：不是淡奶油色 */
    if (!(c[0] > 235 && c[1] > 222 && c[2] > 180 && c[2] < 235)) filled++;
  }
  console.log(`  ${String(Math.round(y0 / h * 100)).padStart(3)}%  ${(filled / total * 100).toFixed(0)}%`);
}
