'use strict';
/* ------------------------------------------------------------------
 * 衣物（docs/kit/props.md §5 cloth）
 *
 * 轮廓裁剪 → 参数化网格采样 → 波浪形变 → 旋转 → 湿度降亮度
 * 拾取用 itemBuf：绘制时记录归属，点击时按方环逐圈放宽（§5.7）
 * ------------------------------------------------------------------ */

const CLOTH_KINDS = {
  sheet: { w: 3, h: 2.4, value: 5, speed: 6.5 },
  towel: { w: 1.5, h: 1.6, value: 3, speed: 9 },
  shirt: { w: 1.9, h: 1.75, value: 3, speed: 10 },
  trousers: { w: 1.25, h: 2.1, value: 3, speed: 10 },
  sock: { w: .5, h: .8, value: 1, speed: 18 },
};
const CLOTH_COLORS = [
  [246, 244, 234], [238, 118, 96], [92, 148, 176], [246, 204, 92],
  [226, 150, 176], [124, 170, 124], [72, 88, 136], [244, 240, 226],
];
const LINE_SETS = [
  ['sheet', 'shirt', 'towel', 'sheet', 'sock', 'sock', 'trousers'],
  ['towel', 'sheet', 'trousers', 'shirt', 'sock', 'shirt', 'towel'],
  ['shirt', 'sock', 'sheet', 'towel', 'sock', 'trousers', 'shirt'],
];

const itemBuf = new Uint16Array(W * H);
let ITEMS = [];

/* 轮廓裁剪：u ∈ [-w/2, w/2]，v ∈ [0, h]（props.md §5.2） */
const clothInside = (item, u, v) => {
  const w = item.w, h = item.h, a = Math.abs(u);
  if (item.kind === 'shirt') return a < w * .3 || v < h * .32 + (a - w * .3) * -.3;
  if (item.kind === 'trousers') return v < h * .32 || a > .06;
  if (item.kind === 'sock') return v < h * .62 ? a < w * .3 : u > -w * .3;
  return true;
};

/* 三条绳，每条 7 件；颜色与洗牌用 hash 驱动，刷新后场景可复现 */
function hangWashing() {
  ITEMS = [];
  LINE_YS.forEach((y, line) => {
    const kinds = LINE_SETS[line].slice();
    for (let k = kinds.length - 1; k > 0; k--) {
      const j = Math.floor(hash(k, line * 17 + 3) * (k + 1));
      [kinds[k], kinds[j]] = [kinds[j], kinds[k]];
    }
    const total = kinds.reduce((s, k) => s + CLOTH_KINDS[k].w, 0);
    const gap = Math.min(1.1, (SPAN - total) / Math.max(1, kinds.length - 1));
    let x = -(total + gap * (kinds.length - 1)) / 2;
    for (const kind of kinds) {
      const spec = CLOTH_KINDS[kind], cx = x + spec.w / 2, id = ITEMS.length + 1;
      const ci = Math.floor(hash(id, 31) * CLOTH_COLORS.length);
      const ai = (ci + 2 + Math.floor(hash(id, 32) * 4)) % CLOTH_COLORS.length;
      ITEMS.push({
        id, kind, ...spec, cx, ly: y, x: cx, y, z: lineZ(cx), vx: 0, vy: 0, vz: 0,
        state: 'line', wet: 0, pop: 0, rot: 0, spin: 0, phase: hash(id, 33) * 6.28,
        color: CLOTH_COLORS[ci], accent: CLOTH_COLORS[ai], stripes: hash(id, 34) > .45,
      });
      x += spec.w + gap;
    }
  });
}

/* 衣物渲染：参数化网格 + 波浪 + 旋转 + 湿度 */
function drawCloth(item, t) {
  const pinned = item.state === 'line' || item.state === 'loose';
  const flying = item.state === 'flying' || item.state === 'falling';
  const flat = item.state === 'ground';
  const gusty = 1 + stormLevel() * .9 + G.gustGlow * 1.2;
  const amp = item.state === 'loose' ? .55 : flying || item.state === 'held' ? .4 : .12 * gusty;
  const speed = item.state === 'loose' ? 9 : 3 + stormLevel() * 2;
  const ramp = rampOf(item.color), alt = rampOf(item.accent);
  const cr = Math.cos(item.rot), sr = Math.sin(item.rot), step = .055;
  const dryness = Math.floor(item.wet * 1.8);
  const trailX = item.state === 'held' ? clamp(item.vx * .05, -.7, .7) : 0;

  for (let u = -item.w / 2; u <= item.w / 2; u += step) for (let v = 0; v <= item.h; v += step) {
    if (!clothInside(item, u, v)) continue;
    const wave = u * 3.2 + t * speed + item.phase + v * 1.2;
    const s = Math.sin(wave), c = Math.cos(wave);
    let px, py, pz;
    if (flat) {
      px = item.x + u;
      py = item.y + v - item.h / 2;
      pz = .05 + (s + 1) * .03;
    } else {
      const reach = pinned ? v / item.h + .12 : 1;
      px = item.x + u * cr - v * sr - trailX * v;   // rot 旋转
      py = item.y + s * amp * reach;                // 波浪
      pz = item.z - v * cr - u * sr;                // rot 同时也是 z
      if (pz < .05) pz = .05;
    }
    const level = clamp(3 + Math.round(c * 1.1) - dryness, 0, 4);
    const stripe = item.stripes && Math.floor((item.kind === 'sheet' ? u * 2.4 : v * 5) + 40) % 2;
    const p = project(px, py, pz), ix = p.sx | 0, iy = p.sy | 0;
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
    const i = iy * W + ix;
    if (p.d <= zb[i]) continue;
    zb[i] = p.d;
    pix[i] = (stripe ? alt : ramp)[level];
    itemBuf[i] = item.id;
  }

  /* 两只衣夹；松脱的用信号黄标出（props.md §5.6） */
  if (pinned) {
    const n = item.kind === 'sock' ? 1 : 2;
    for (let k = 0; k < n; k++) {
      const a = n === 1 ? 0 : (k ? .42 : -.42) * item.w;
      plot(item.x + a, item.y + .04, item.z + .06,
        item.state === 'loose' ? rgb(255, 214, 10) : rgb(120, 92, 62));
    }
  }

  /* 投影：贴着屋顶时才投接触影 */
  castShadow(item.x, item.y, Math.max(0, (flat ? 0 : item.z) - item.h / 2), flat ? .35 : item.w * .28, 1, .3);
}

/* 篮内堆叠：每件缩成一个小球，按 id 散开（props.md §7.4） */
function drawPile() {
  const banked = G.items.filter(i => i.state === 'basket');
  banked.forEach((item, k) => {
    const a = hash(k, 51) * 6.28, d = hash(k, 52) * BASKET.r * .55;
    sphere(
      BASKET.x + Math.cos(a) * d, BASKET.y + Math.sin(a) * d,
      BASKET.h + Math.min(1.1, k * .06) + hash(k, 53) * .2,
      item.kind === 'sock' ? .2 : .42, item.color, 'solid'
    );
  });
}

/* 方环逐圈拾取，给袜子留 6px 余量 */
function pickCloth(sx, sy) {
  for (let radius = 0; radius <= 6; radius++) {
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
      const ix = Math.round(sx) + dx, iy = Math.round(sy) + dy;
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
      const id = itemBuf[iy * W + ix];
      if (id) return G.items[id - 1];
    }
  }
  return null;
}
