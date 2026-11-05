'use strict';
/* ---------- Tokyo: a back-street with shopfronts and signs, wires overhead, a train on the viaduct behind ---------- */
const TK = { X: 11.8, Y: 7.6, BACK: -2, DEPTH: -6.6 };
const SIGN_PINK = 6, SIGN_CYAN = 7, SIGN_YELLOW = 8, SIGN_RED = 9; // sign glow ids: they keep their own colour when lit
const SIGN_COLORS = { [SIGN_PINK]: [250, 92, 158], [SIGN_CYAN]: [74, 214, 226], [SIGN_YELLOW]: [255, 206, 74], [SIGN_RED]: [226, 58, 50] };
const TK_ROW = [
  [-11, -7.7, 4.2, [196, 186, 170], SIGN_PINK], [-7.5, -4.7, 5.6, [150, 160, 168], SIGN_CYAN], [-4.5, -1.3, 3.4, [214, 200, 176], SIGN_YELLOW],
  [-1.1, 2.5, 4.8, [176, 128, 104], SIGN_PINK], [2.7, 5.9, 3.8, [200, 206, 210], SIGN_RED], [6.1, 10.4, 5.2, [120, 124, 138], SIGN_CYAN],
];
function tokyoGround(x, y, ix, iy, i) {
  const edge = Math.pow(Math.pow(Math.abs(x) / TK.X, 4) + Math.pow(Math.abs(y) / TK.Y, 4), .25);
  const rough = edge + (noise(x * 1.3, y * 1.3) - .5) * .1;
  if (rough > 1.03) return 0;
  if (rough > .94 && hash(ix, iy) < (rough - .94) / .09) return 0;
  if (y > -1.9 && y < 1.7) {
    // asphalt with painted edge lines and a manhole
    if (Math.abs(y + 1.55) < .05 || Math.abs(y - 1.35) < .05) return rgb(222, 220, 210);
    if (Math.hypot(x - 1.6, y - .2) < .42) return rampOf([70, 70, 76])[Math.hypot(x - 1.6, y - .2) > .36 ? 1 : 2];
    return level(rampOf([88, 90, 98]), 2.3 + noise(x * 2, y * 2) * .8 + (hash(ix, iy) > .97 ? .8 : 0), ix, iy);
  }
  if (x > 6.6 && y >= 1.7) return level(rampOf([206, 204, 196]), 2.8 + (((y * 3.2) % 1) < .3 ? -.7 : 0) + (hash(ix, iy) - .5) * .6, ix, iy);
  // pavement slabs
  const fx = x / 1.2, fy = y / 1.2, row = Math.floor(fy), col = Math.floor(fx);
  if (fx - col < .06 || fy - row < .06) return rampOf([172, 170, 164])[1];
  return rampOf([172, 170, 164])[clamp(Math.floor(2.6 + hash(col, row) * 1.3 + (bayerAt(ix, iy) - .5) * .4), 2, 4)];
}
// a sign board with blocky glyphs; its pixels glow in their own colour at night
function signFace(face, a0, a1, z0, z1, id) {
  const base = SIGN_COLORS[id], glyph = mix3(base, [255, 255, 255], .55);
  for (let a = a0; a <= a1; a += st()) for (let z = z0; z <= z1; z += st()) {
    const border = a - a0 < .06 || a1 - a < .06 || z - z0 < .06 || z1 - z < .06;
    const gx = Math.floor((a - a0) / .22), gz = Math.floor((z - z0) / .26), mark = !border && hash(gx * 3 + id, gz * 7) > .45 && (z - z0) % .26 > .06 && (a - a0) % .22 > .05;
    plotLit(...onFace(face, a, z), rgb(...(border ? mix3(base, [0, 0, 0], .35) : mark ? glyph : base)), id);
  }
}
function tkLantern(x, y, z) {
  for (let a = 0; a < 6.283; a += .12) for (let h = -.22; h <= .22; h += st()) {
    const r = .17 * Math.sqrt(1 - (h / .26) ** 2);
    plotLit(x + Math.cos(a) * r, y + Math.sin(a) * r, z + h, rgb(...(Math.abs(h) > .19 ? [40, 34, 36] : [226, 58, 50])), SIGN_RED);
  }
}
function tkBuilding([x0, x1, h, color, sign], k) {
  const y0 = TK.DEPTH, y1 = TK.BACK;
  box(x0, y0, 0, x1, y1, h, color, 120 + k);
  const front = { axis: 'y', at: y1 + .02 }, side = { axis: 'x', at: x1 + .02 };
  // shopfront: lit glass, a cloth noren over the door, a board sign above
  for (let a = x0 + .25; a <= x1 - .25; a += st()) for (let z = .1; z <= 1.9; z += st()) {
    const mull = Math.abs(((a - x0) % 1.1)) < .05 || z > 1.82;
    plotLit(a, front.at, z, mull ? rgb(60, 56, 58) : rgb(...mix3(color, [70, 64, 60], .6)), mull ? 0 : PROP_WARM);
  }
  const mid = (x0 + x1) / 2, noren = [[38, 50, 92], [150, 40, 44], [236, 230, 214]][k % 3];
  for (let a = mid - .55; a <= mid + .55; a += st()) for (let z = 1.25; z <= 1.85; z += st()) {
    if (Math.floor((a - mid + .55) / .275) % 1 === 0 && ((a - mid + .55) % .275) < .03 && z < 1.6) continue;
    plot(a, front.at + .03, z, rampOf(noren)[3]);
  }
  signFace({ axis: 'y', at: y1 + .04 }, x0 + .3, x1 - .3, 2.05, 2.55, sign);
  // upper floors: a grid of windows, each its own light
  for (let z = 3, row = 0; z + .7 < h; z += 1.1, row++) for (let c = x0 + .5, col = 0; c + .5 < x1; c += 1, col++) {
    pane(front, c - .3, c + .3, z, z + .7, GLASS, 90 + ((k * 7 + row * 3 + col) % 40), false);
  }
  for (let z = 3, row = 0; z + .7 < h; z += 1.1, row++) pane(side, -4.6, -3.9, z, z + .7, GLASS, 130 + k * 3 + row, false);
  // a vertical sign hung out over the street from the corner
  const sx = x1 - .35, top = h - .4, bottom = Math.max(2.9, h * .45);
  box(sx - .06, y1, bottom, sx + .06, y1 + .75, top, [60, 56, 58], 140 + k);
  signFace({ axis: 'x', at: sx + .08 }, y1 + .05, y1 + .7, bottom + .05, top - .05, k % 2 ? SIGN_YELLOW : sign);
  // rooftop clutter: a water tank or an air-conditioning box
  if (k % 2) box(x0 + .5, y0 + .6, h, x0 + 1.3, y0 + 1.4, h + .6, [176, 176, 180], 150 + k);
  else box(x1 - 1.4, y0 + 1, h, x1 - .6, y0 + 1.6, h + .45, [210, 210, 206], 150 + k);
  tkLantern(x0 + .45, y1 + .35, 2.25);
  for (let x = x0; x <= x1; x += .5) for (let y = y0; y <= y1; y += .5) for (let z = .3; z <= h; z += .7) castShadow(x, y, z, .5);
}
function tkViaduct() {
  const y0 = -7.7, y1 = -6.9, z = 6.5;
  box(-12, y0, z, 12, y1, z + .35, [150, 148, 146], 160);
  for (let x = -10; x <= 10; x += 5) box(x - .3, y0 + .1, 0, x + .3, y1 - .1, z, [140, 138, 136], 161);
  for (let x = -12; x <= 12; x += .04) for (const y of [y0 + .05, y1 - .05]) plot(x, y, z + .7, rampOf(IRON)[2]);
  for (let x = -12; x <= 12; x += .8) castShadow(x, (y0 + y1) / 2, z, .5, 1, .2);
}
function tkPoles() {
  const poles = [[-9.2, 1.95], [-2.6, 1.95], [4.2, 1.95]];
  for (const [x, y] of poles) {
    capsule([x, y, 0], [x, y, 6.2], .12, .09, () => [120, 116, 110], 'solid');
    box(x - .05, y - .7, 5.6, x + .05, y + .7, 5.7, [90, 86, 82], 162);
    cylinder(x + .2, y + .3, 4.6, 5.2, .18, [150, 150, 150]);
    shadowColumn(x, y, 6, .15);
  }
  // wires sag between the poles and across the street to the buildings
  const wire = (a, b, sag) => {
    for (let t = 0; t <= 1; t += .004) plot(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t) - Math.sin(t * Math.PI) * sag, rampOf([40, 38, 42])[2]);
  };
  for (let k = 0; k < poles.length - 1; k++) for (const [off, sag] of [[-.6, .5], [.6, .45], [0, .7]]) {
    wire([poles[k][0], poles[k][1] + off, 5.65], [poles[k + 1][0], poles[k + 1][1] + off, 5.65], sag);
  }
  wire([-12, 1.35, 5.65], [-9.2, 1.35, 5.65], .3);
  for (const [x] of poles) for (const dx of [-1.2, .8]) wire([x, 1.25, 5.65], [x + dx, TK.BACK, 3.9], .25);
}
function tokyoBuild() {
  tkViaduct();
  TK_ROW.forEach(tkBuilding);
  tkPoles();
  vending(-6.6, 2.7, [206, 46, 50]);
  vending(-5.6, 2.7, [232, 232, 236]);
  vending(-4.6, 2.7, [60, 120, 190]);
  torii(8.6, 4.7);
  box(9.6, 3.6, 0, 10.6, 5.8, .5, [120, 92, 70], 170);
  // sakura all year: it is the picture of the city people carry in their heads
  for (const [x, y, k, seed] of TK_SAKURA) growSeasonTree(x, y, k, 'sakura', seed);
  for (const x of [-1, 0]) box(x * 1.5 + 1, 2.4, 0, x * 1.5 + 1.15, 3.4, .55, IRON, 171); // bike racks
}
// a train crosses the viaduct every few seconds, windows lit after dark
function tokyoTrain() {
  const t = L.time % 11, x0 = -19 + t * 8.5, cars = 3, len = 3.6;
  if (x0 - cars * len > 13 || x0 < -13) return;
  const lit = V.night > .45, body = [214, 216, 212], band = [62, 150, 92];
  for (let c = 0; c < cars; c++) {
    const a = x0 - c * (len + .25), b = a - len;
    if (a < -12.5 || b > 12.5) continue;
    box(Math.max(b, -12), -7.65, 6.9, Math.min(a, 12), -6.95, 7.95, body, 180 + c);
    for (let x = Math.max(b, -12) + .2; x < Math.min(a, 12) - .2; x += st()) {
      for (let z = 7.2; z <= 7.32; z += st()) plot(x, -6.93, z, rampOf(band)[3]);
      for (let z = 7.42; z <= 7.75; z += st()) if (((x - b) % .7) > .12) plot(x, -6.93, z, lit ? rgb(255, 236, 170) : rgb(70, 80, 96));
    }
  }
}
const TK_SAKURA = [[10, 2.8, .74, 600], [-9.8, 5, .72, 640], [2.4, 5.6, .64, 680], [-3.6, 6.2, .58, 720]];
// petals leave the crowns, flutter down and drift with the wind; rain knocks more of them loose
const PETALS = Array.from({ length: 120 }, (_, k) => ({ tree: k % TK_SAKURA.length, seed: hash(k, 41), phase: hash(k, 42) * 7, life: 4 + hash(k, 43) * 3 }));
function tokyoPetals() {
  if (V.snow > .4) return;
  const colors = [rgb(250, 200, 216), rgb(238, 166, 192), rgb(255, 228, 236)];
  const count = Math.round(PETALS.length * clamp(.55 + V.wind / 12 + V.rain * .3, 0, 1));
  for (let n = 0; n < count; n++) {
    const p = PETALS[n], [tx, ty, k] = TK_SAKURA[p.tree], t = ((L.time + p.phase) % p.life) / p.life;
    const spread = 1.6 * k / .5, sx = tx + (p.seed - .5) * spread * 2, sy = ty + (hash(n, 44) - .5) * spread * 2;
    const drift = t * (1.5 + V.wind * .6);
    const x = sx + V.windX * drift + Math.sin(L.time * 2.4 + n) * .25, y = sy + V.windY * drift + Math.cos(L.time * 1.9 + n) * .25;
    const z = (4.2 * k / .5) * (1 - t) + .05;
    const q = project(x, y, z), ix = q.sx | 0, iy = q.sy | 0;
    if (ix < 1 || iy < 0 || ix >= W - 1 || iy >= H || q.d < zb[iy * W + ix]) continue;
    const c = colors[n % 3];
    pix[iy * W + ix] = c; zb[iy * W + ix] = q.d;
    if (Math.sin(L.time * 6 + n * 3) > 0) { pix[iy * W + ix + 1] = c; zb[iy * W + ix + 1] = q.d; }
  }
}
const TOKYO_LAYOUT = {
  scale: 12.5, lift: 46, ground: tokyoGround, build: tokyoBuild, extra: () => { tokyoTrain(); tokyoPetals(); },
  lamps: TK_ROW.map(([x0, x1], k) => ({ x: x0 + .45, y: TK.BACK + .35, z: 2.25, base: 0 })),
  cafe: null, chimney: null, snowman: { x: 6.4, y: 5.6 }, kid: { x: -1.4, y: 3.6 }, sitter: null, cup: null,
  pigeons: [[2.2, 3.6, 0], [2.8, 4, 1.7]], tree: { x: 10.2, y: 2.6 },
  inside: (x, y) => (Math.abs(x) / TK.X) ** 4 + (Math.abs(y) / TK.Y) ** 4 < .9,
  paths: [
    { pts: [[-11, 0], [11, 0]], lanes: 2.6, share: .75 },
    { pts: [[-10.5, 3.6], [6, 3.6]], lanes: .9, share: .25 },
  ],
};

registerCity('tokyo', { name: 'Tokyo', country: 'Japan', at: [35.6895, 139.6917], native: '東京', layout: TOKYO_LAYOUT, tree: { x: 3.7, y: -7.2, scale: .62 }, leaves: { spring: 'sakura' } });
