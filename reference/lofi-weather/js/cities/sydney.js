'use strict';
/* ---------- Sydney: the steel arch across the harbour, the opera's shells on the point ---------- */
const SY = { X: 12.4, Y: 8.4 };
function sydneyGround(x, y, ix, iy, i) {
  if (!onIsland(x, y, ix, iy, SY.X, SY.Y)) return 0;
  const land = (x < -7.5 && y < 6) || (y < -3.6 && x < 4) || Math.hypot(x - 5.2, y - 3.2) < 4.9 + noise(x, y) * .4;
  if (!land) { kinds[i] = KIND_WATER; return tone4([[30, 82, 112], [38, 100, 134], [52, 120, 152], [90, 156, 180]], .3 + noise(x * .5, y * .8) * .5, ix, iy); }
  if (Math.hypot(x - 5.2, y - 3.2) < 4.9) return slabs(x, y, ix, iy, [214, 196, 168], .9);
  if (noise(x * .7, y * .7) > .5) { kinds[i] = KIND_GRASS; return rgb(...GRASS[clamp(Math.floor((noise(x, y) + (hash(ix, iy) - .5) * .5) * 4.2), 0, 3)]); }
  return slabs(x, y, ix, iy, [190, 176, 156], 1.1);
}
function harbourBridge() {
  const STEEL = [96, 104, 114], y0 = -5.4, y1 = -4.2, xa = -9.6, xb = 2.8, cx = (xa + xb) / 2, span = (xb - xa) / 2, deck = 2.6;
  for (const x of [xa - 1, xb + .2]) block(x, y0 - .3, x + .8, y1 + .3, 4.4, [204, 186, 150], { brick: false, id: 0, ww: .01, wh: .01, gap: 9, seed: 580 });
  box(xa - 1, y0, deck - .25, xb + 1, y1, deck, [70, 74, 80], 581);
  for (const y of [y0 + .1, y1 - .1]) {
    for (let t = -1; t <= 1; t += .004) {
      const x = cx + t * span, top = deck + 4.4 * (1 - t * t), low = deck + .6 + 2.6 * (1 - t * t);
      plot(x, y, top, rampOf(STEEL)[3]);
      plot(x, y, top - .06, rampOf(STEEL)[2]);
      plot(x, y, low, rampOf(STEEL)[2]);
      if ((Math.abs(t * 14) % 1) < .04) for (let z = Math.min(deck, low); z <= top; z += .04) plot(x, y, z, rampOf(STEEL)[1]);
      if ((Math.abs(t * 7) % 1) < .02) for (let z = deck; z <= low; z += .04) plot(x, y, z, rampOf(STEEL)[1]);
    }
  }
  for (let x = xa; x <= xb; x += .5) castShadow(x, (y0 + y1) / 2, deck, .6, 1, .2);
}
function sydneyBuild() {
  harbourBridge();
  for (const [x0, x1, y0, h, k] of [[-12, -9.8, -2.6, 4.2, 0], [-11.6, -9.6, .4, 3.2, 1], [-1, 2.6, -7.6, 5.6, 2]]) block(x0, y0, x1, y0 + 2.2, h, [214, 186, 146], { id: 250 + k * 6, seed: 590 + k });
  // the opera is the picture of the city: drawn large and floodlit at night
  const before = new Float32Array(zb);
  opera(5.2, 3.2, 1.4);
  for (let i = 0; i < W * H; i++) if (zb[i] !== before[i]) flood[i] = 1;
  for (const x of [-9, 2.4]) streetLamp({ x, y: x < 0 ? 3.6 : 1.2, z: 3.2 }, 0);
}
// a green-and-cream harbour ferry shuttles across the water in front of the bridge, pausing at each end;
// it is double-ended like the real ones, so it never has to turn round
function sydneyFerry() {
  const period = 40, t = (L.time % period) / period, leg = t < .5 ? t * 2 : (1 - t) * 2;
  const x = lerp(-4.4, 8.4, smooth(.08, .92, leg)), y = -2.45, dir = t < .5 ? 1 : -1, moving = leg > .08 && leg < .92;
  const len = 1.55, half = .4, deck = .32, HULL = [34, 92, 62], CREAM = [238, 214, 152];
  const width = a => half * Math.sqrt(Math.max(0, 1 - (Math.abs(a) / len) ** 4));
  // the wake fans out behind, broken into flecks of foam
  if (moving) for (let k = 0; k < 34; k++) for (const side of [-1, 1]) {
    if (hash(k * 2 + side, Math.floor(L.time * 6)) < .45) continue;
    plot(x - dir * (len + .1 + k * .1), y + side * (.18 + k * .016), .02, rgb(222, 238, 240));
  }
  for (let a = -len; a <= len; a += st()) {
    const w = width(a);
    if (w < .02) continue;
    for (let z = 0; z <= deck; z += st()) for (const side of [-1, 1]) plot(x + a, y + side * w, z, rampOf(HULL)[side > 0 ? 2 : 1]);
    for (let b = -w; b <= w; b += st()) plot(x + a, y + b, deck, rampOf([178, 160, 132])[3]);
    plot(x + a, y + w, deck - .05, rgb(236, 230, 214)); // a pale rubbing strake along the hull
  }
  box(x - 1.05, y - .27, deck, x + 1.05, y + .27, .74, CREAM, 600);
  for (let a = x - .95; a <= x + .95; a += st()) if (((a - x + .95) % .22) > .07) {
    for (let z = .48; z <= .62; z += st()) plotLit(a, y + .28, z, rgb(54, 62, 70), PROP_WARM);
  }
  box(x - .42, y - .2, .74, x + .42, y + .2, 1.02, [246, 242, 232], 601);
  for (let a = x - .36; a <= x + .36; a += st()) plot(a, y + .21, .92, rgb(54, 62, 70));
  box(x - .1, y - .08, 1.02, x + .1, y + .08, 1.24, HULL, 602);
}
const SYDNEY_LAYOUT = {
  scale: 10, lift: 34, ground: sydneyGround, build: sydneyBuild,
  extra: sydneyFerry,
  lamps: [{ x: -9, y: 3.6, z: 3.2, base: 0 }, { x: 2.4, y: 1.2, z: 3.2, base: 0 }],
  cafe: null, chimney: null, snowman: null, kid: { x: 3, y: 2.4 }, sitter: null, cup: null,
  pigeons: [[1.6, 5.4, 0], [2.2, 5.8, 1.7]], tree: null, inside: islandInside(SY.X, SY.Y),
  paths: [{ pts: [[1, .6], [1.4, 6.6], [8.6, 7.4], [9.4, .4]], closed: true, lanes: .6, share: .55 }, { pts: [[-11, 2], [-8.2, 2], [-8.2, -4]], lanes: .6, share: .45 }],
};

registerCity('sydney', { name: 'Sydney', country: 'Australia', at: [-33.8679, 151.2073], native: 'Warrane', layout: SYDNEY_LAYOUT, tree: null });
