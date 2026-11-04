import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const OUT = '/tmp/conifer-look.png';

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
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
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const noop = () => {};
const W = 360, H = 400, S = 11;
const canvas = {
  width: W, height: H, style: {},
  getContext: () => ({
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: noop,
  }),
};
const sb = {
  console,
  document: { getElementById: () => canvas, createElement: () => ({ style: {} }), addEventListener: noop },
  addEventListener: noop, matchMedia: () => ({ matches: false }),
  PP_W: W, PP_H: H, PP_SCALE: S, PP_ORIGIN_X: 0, PP_ORIGIN_Y: 40,
};
sb.window = sb; sb.globalThis = sb;
const context = vm.createContext(sb);

for (const f of ['demo/engine.js', 'demo/kit/core.js', 'demo/kit/render.js', 'demo/kit/conifers.js']) {
  vm.runInContext(fs.readFileSync(path.join(REPO, f), 'utf8'), context);
}

vm.runInContext(`
  zb.fill(-1e9);
  pix.fill(rgb(252, 245, 218));
  groundZ.fill(0); ground.fill(0); kinds.fill(0); shadowMask.fill(0); staticShadow.fill(0);

  // 画一棵参天巨树与两棵不同高矮的尖锥树对照
  const o1 = { id:'t1', kind:'cone-mast', x: 0, y: 0, z: 0, rot: 0,
    params: { height: 25.0, crownR: 6.8, trunkH: 6.2, layers: 8 }, seed: 777 };
  KIT.get('cone-mast').draw(KIT_RENDER.makeCtx(o1), o1);

  const o2 = { id:'t2', kind:'cone-spire', x: -12, y: 2, z: 0, rot: 0,
    params: { height: 18.0, crownR: 4.2, trunkH: 4.0 }, seed: 101 };
  KIT.get('cone-spire').draw(KIT_RENDER.makeCtx(o2), o2);

  const o3 = { id:'t3', kind:'cone-spire', x: 12, y: -2, z: 0, rot: 0,
    params: { height: 14.0, crownR: 3.2, trunkH: 3.0 }, seed: 202 };
  KIT.get('cone-spire').draw(KIT_RENDER.makeCtx(o3), o3);

  shadeEdges();
`, context);

const pix = vm.runInContext('pix', context);
const rgba = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) {
  const c = pix[i];
  rgba[i * 4] = c & 255;
  rgba[i * 4 + 1] = (c >> 8) & 255;
  rgba[i * 4 + 2] = (c >> 16) & 255;
  rgba[i * 4 + 3] = 255;
}
fs.writeFileSync(OUT, encodePNG(W, H, rgba));
console.log('✓ preview saved to', OUT);
