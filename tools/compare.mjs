#!/usr/bin/env node
/* 并排对比：参考图 | 我的渲染图
 * 用法: node tools/compare.mjs <ref.png> <mine.png> <out.png>
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

const [refPath, minePath, outPath] = process.argv.slice(2);
const ref = decodePNG(refPath), mine = decodePNG(minePath);

/* 两张图等高并排 */
const H = 520;
const rw = Math.round(ref.w * H / ref.h), mw = Math.round(mine.w * H / mine.h);
const GAP = 12;
const W = rw + GAP + mw;
const out = new Uint8Array(W * H * 4);

for (let y = 0; y < H; y++) {
  for (let x = 0; x < rw; x++) {
    const sx = Math.min(ref.w - 1, Math.floor(x * ref.w / rw));
    const sy = Math.min(ref.h - 1, Math.floor(y * ref.h / H));
    const si = (sy * ref.w + sx) * 4, di = (y * W + x) * 4;
    out[di] = ref.rgba[si]; out[di + 1] = ref.rgba[si + 1];
    out[di + 2] = ref.rgba[si + 2]; out[di + 3] = 255;
  }
  for (let x = 0; x < GAP; x++) {
    const di = (y * W + rw + x) * 4;
    out[di] = 60; out[di + 1] = 50; out[di + 2] = 40; out[di + 3] = 255;
  }
  for (let x = 0; x < mw; x++) {
    const sx = Math.min(mine.w - 1, Math.floor(x * mine.w / mw));
    const sy = Math.min(mine.h - 1, Math.floor(y * mine.h / H));
    const si = (sy * mine.w + sx) * 4, di = (y * W + rw + GAP + x) * 4;
    out[di] = mine.rgba[si]; out[di + 1] = mine.rgba[si + 1];
    out[di + 2] = mine.rgba[si + 2]; out[di + 3] = 255;
  }
}

fs.writeFileSync(outPath, encodePNG(W, H, out));
console.log(`✓ ${outPath}  ${W}×${H}  (左:参考图 ${ref.w}×${ref.h}  右:我的 ${mine.w}×${mine.h})`);
