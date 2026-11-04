#!/usr/bin/env node
/* 测量参考图的核心规律：空气透视
 *
 * 参考图没有天空，整幅是层叠的秋色树海。
 * 规律：越靠上（越远）越淡、越靠下（越近）越浓。
 * 量化方式：按行统计平均饱和度与明度，画出这个梯度。
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

function hue(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx === mn) return -1;
  let hu;
  if (mx === r) hu = 60 * (((g - b) / (mx - mn)) % 6);
  else if (mx === g) hu = 60 * ((b - r) / (mx - mn) + 2);
  else hu = 60 * ((r - g) / (mx - mn) + 4);
  return hu < 0 ? hu + 360 : hu;
}

console.log(`参考图 ${w}×${h}\n`);
console.log('=== 逐行：平均 RGB（从上到下）===');
console.log('行%   平均R  平均G  平均B   饱和度  明度');

const BAND = 20;
for (let y0 = 0; y0 < h; y0 += BAND) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < Math.min(h, y0 + BAND); y++)
    for (let x = 0; x < w; x += 3) {
      const i = (y * w + x) * 4;
      r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; n++;
    }
  r /= n; g /= n; b /= n;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const s = mx === 0 ? 0 : (mx - mn) / mx;
  console.log(`${String(Math.round(y0 / h * 100)).padStart(3)}%  ${r.toFixed(0).padStart(5)}  ${g.toFixed(0).padStart(5)}  ${b.toFixed(0).padStart(5)}   ${s.toFixed(3)}   ${mx.toFixed(0).padStart(3)}`);
}

/* 色相分布：整幅图有几种主色？ */
const hues = new Array(12).fill(0);
for (let i = 0; i < w * h; i++) {
  const hu = hue(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
  if (hu < 0) continue;
  hues[Math.floor(hu / 30) % 12]++;
}
console.log('\n=== 色相分布（每 30° 一档）===');
const names = ['0-30 红', '30-60 橙', '60-90 黄绿', '90-120 绿', '120-150 青绿', '150-180 青',
  '180-210 蓝青', '210-240 蓝', '240-270 紫蓝', '270-300 紫', '300-330 品红', '330-360 红'];
hues.forEach((v, i) => {
  const pct = v / (w * h) * 100;
  console.log(`  ${names[i].padEnd(10)} ${pct.toFixed(1)}%  ${'█'.repeat(Math.round(pct / 2))}`);
});
