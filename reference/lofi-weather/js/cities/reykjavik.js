'use strict';
/* ---------- Reykjavík: the stepped concrete church, painted tin houses, the harbour and the steel boat ---------- */
const RK = { X: 12.4, Y: 8.2 };
const SEA = [[20, 44, 56], [28, 58, 70], [38, 74, 86], [64, 104, 112]];
const RK_HOUSES = [
  [-1.6, .6, 2.4, [190, 64, 52], [52, 58, 66]], [.8, 3.2, 3, [232, 192, 74], [60, 104, 118]], [3.4, 5.4, 2.3, [70, 112, 150], [176, 64, 52]],
  [5.6, 8, 2.9, [236, 234, 228], [176, 64, 52]], [8.2, 10.4, 2.5, [92, 142, 112], [52, 58, 66]],
];
function reykjavikGround(x, y, ix, iy, i) {
  const edge = Math.pow(Math.pow(Math.abs(x) / RK.X, 4) + Math.pow(Math.abs(y) / RK.Y, 4), .25);
  const rough = edge + (noise(x * 1.3, y * 1.3) - .5) * .12;
  if (rough > 1.03) return 0;
  if (rough > .93 && hash(ix, iy) < (rough - .93) / .1) return 0;
  // the harbour basin, closed on the right by a rubble breakwater
  const shore = 3.3 + (noise(x * .6, 4) - .5) * .5;
  if (y > shore && x > -5 && x < 6.2 + noise(y, 2) * .8) {
    kinds[i] = KIND_WATER;
    if (y - shore < .12) return rgb(196, 214, 216);
    return tone4(SEA, .2 + noise(x * .5, y * 1.2) * .6, ix, iy);
  }
  if (y > shore && x > -5) return level(rampOf([120, 116, 112]), 1.8 + hash(Math.floor(x * 2), Math.floor(y * 2)) * 2, ix, iy);
  if (y > 1.8 && x > -5.5) {
    const fx = x / 1.4, col = Math.floor(fx);
    if (fx - col < .05) return rampOf([150, 150, 148])[1];
    return level(rampOf([150, 150, 148]), 2.6 + hash(col, 2) * 1.2, ix, iy);
  }
  if (y > -.5 && y <= 1.8) return level(rampOf([78, 80, 86]), 2.3 + noise(x * 2, y * 2) * .7, ix, iy);
  // moss over black lava rock
  if (noise(x * .8, y * .8) > .36) { kinds[i] = KIND_GRASS; return level(rampOf([118, 146, 80]), 2.3 + noise(x * 3, y * 3) * 1.2, ix, iy); }
  return level(rampOf([104, 96, 92]), 2 + hash(ix, iy) * 1.6, ix, iy);
}
function rkHouse([x0, x1, h, wall, roofColor], k) {
  const y0 = -2.6, y1 = -.6, ym = (y0 + y1) / 2, half = (y1 - y0) / 2, rise = 1.5;
  box(x0, y0, 0, x1, y1, h, wall, 200 + k);
  // corrugated tin: vertical ribs on both visible walls and the gable
  const ribbed = (face, a0, a1, top, base) => {
    for (let a = a0; a <= a1; a += st()) {
      const t = typeof top === 'function' ? top(a) : top;
      for (let z = 0; z <= t; z += st()) {
        const rib = ((a * 5) % 1 + 1) % 1, [x, y] = onFace(face, a, z), p = project(x, y, z);
        plot(x, y, z, level(rampOf(wall), base + (rib < .3 ? .55 : rib < .45 ? -.6 : 0), p.sx | 0, p.sy | 0));
      }
    }
  };
  ribbed({ axis: 'y', at: y1 + .01 }, x0, x1, h, 2.3);
  ribbed({ axis: 'x', at: x1 + .01 }, y0, y1, a => h + rise * (1 - Math.abs(a - ym) / half), 1.4);
  for (let x = x0 - .15; x <= x1 + .15; x += st()) for (let s = -half - .2; s <= half + .2; s += st()) {
    const z = h + rise * (1 - Math.abs(s) / half), p = project(x, ym + s, z);
    plot(x, ym + s, z, level(rampOf(roofColor), (s > 0 ? 3.1 : 1.7) - ((x * 4) % 1 < .15 ? .6 : 0), p.sx | 0, p.sy | 0));
  }
  const front = { axis: 'y', at: y1 + .02 };
  pane(front, x0 + .3, x0 + .8, .1, 1.5, DOOR, 0, false);
  for (let c = x0 + 1.3; c < x1 - .2; c += .9) pane(front, c - .25, c + .25, .8, 1.5, GLASS, 210 + k * 4 + (c | 0) % 4);
  pane({ axis: 'x', at: x1 + .02 }, ym - .3, ym + .3, h + .2, h + .8, GLASS, 230 + k, false);
  for (let x = x0; x <= x1; x += .5) for (let y = y0; y <= y1; y += .5) for (let z = .3; z <= h + 1; z += .7) castShadow(x, y, z, .5);
}
// the church: a tall central tower with stepped basalt-column wings falling away on both sides
function hallgrimskirkja(c, y0, y1) {
  const CONCRETE = [210, 208, 202];
  const fluted = (x0, x1, top) => {
    box(x0, y0, 0, x1, y1, top, CONCRETE, 240);
    for (let a = x0; a <= x1; a += st()) if (((a - x0) % .3) < .06) for (let z = 0; z <= top; z += st()) plot(a, y1 + .01, z, rampOf(CONCRETE)[1]);
  };
  for (let k = 6; k >= 1; k--) {
    const w = .6 + k * .5, top = 8.2 - k * 1.1;
    fluted(c - w, c - w + .5, top);
    fluted(c + w - .5, c + w, top);
  }
  box(c - 1.6, y0 - 2.6, 0, c + 1.6, y0, 4.2, CONCRETE, 241);
  fluted(c - .6, c + .6, 9);
  for (const z of [7.4, 8.2]) pane({ axis: 'y', at: y1 + .02 }, c - .25, c + .25, z, z + .5, GLASS, 0, false);
  capsule([c, (y0 + y1) / 2, 9], [c, (y0 + y1) / 2, 10.8], .62, .03, () => CONCRETE, 'solid');
  sphere(c, y1 + .02, 6.6, .22, [236, 232, 220], 'solid');
  for (let x = c - 3.8; x <= c + 3.8; x += .5) for (let z = .3; z <= 8; z += .7) castShadow(x, (y0 + y1) / 2, z, .6);
}
function reykjavikBuild() {
  hallgrimskirkja(-7, -6.4, -4.4);
  RK_HOUSES.forEach(rkHouse);
  sunVoyager(-1.6, 2.6);
  box(1.8, -1.8, 3, 2.2, -1.4, 4.6, [120, 116, 112], 250);
  // basalt boulders on the moss
  for (const [x, y, r] of [[-10.4, -.8, .5], [-3.6, -6.8, .6], [-11, 1.6, .45], [6.4, -5.6, .55], [9.6, -4.2, .4]]) {
    sphere(x, y, r * .3, r, [66, 62, 62], 'rough');
    castShadow(x, y, r * .5, r);
  }
  for (const x of [-4.2, 4.6]) streetLamp({ x, y: -.2, z: 3.3 }, 0);
  // bollards along the quay edge
  for (let x = -4.5; x <= 11; x += 1.6) cylinder(x, 3.25, 0, .4, .12, [60, 60, 66]);
}
// northern lights: green curtains with violet hems, folding slowly, only on clear nights far to the north
function aurora() {
  const lat = WX.place ? Math.abs(WX.place.latitude) : 0;
  const strength = clamp((lat - 56) / 6, 0, 1) * smooth(.55, .9, V.night) * (1 - V.cloud) * (1 - V.fog) * clamp(1 - (V.rain + V.snow) * 3, 0, 1);
  if (strength < .05) return;
  const t = L.time * .25;
  for (let ix = 0; ix < W; ix++) {
    const top = 18 + noise(ix * .02 + t, 3) * 34, length = 34 + noise(ix * .05 - t, 8) * 46, bright = noise(ix * .06 + t * 2, 5);
    const fade = clamp(Math.min(ix, W - 1 - ix) / 40, 0, 1);
    for (let iy = top | 0; iy < top + length && iy < H; iy++) {
      const k = (iy - top) / length, a = strength * fade * bright * (k < .15 ? k / .15 : 1 - (k - .15) / .85);
      if (bayerAt(ix, iy) > a * 1.3) continue;
      skyPix[iy * W + ix] = rgb(...mix3([120, 255, 180], [168, 110, 230], clamp(1 - k * 3, 0, 1) * .6));
    }
  }
}
const REYKJAVIK_LAYOUT = {
  scale: 11, lift: 39, ground: reykjavikGround, build: reykjavikBuild,
  lamps: [{ x: -4.2, y: -.2, z: 3.3, base: 0 }, { x: 4.6, y: -.2, z: 3.3, base: 0 }],
  cafe: null, chimney: { x: 2, y: -1.6, top: 4.6 }, snowman: { x: -9.4, y: 3.4 }, kid: { x: -6.4, y: .9 }, sitter: null, cup: null,
  pigeons: [[6.4, 2.4, 0], [7.2, 2.7, 1.7], [9.2, 2.3, 3.1]], tree: null,
  inside: (x, y) => (Math.abs(x) / RK.X) ** 4 + (Math.abs(y) / RK.Y) ** 4 < .9,
  paths: [
    { pts: [[-11, .7], [11, .7]], lanes: 1.6, share: .72 },
    { pts: [[2, 2.5], [10.8, 2.5]], lanes: .5, share: .28 },
  ],
};

registerCity('reykjavik', { name: 'Reykjavík', country: 'Iceland', at: [64.1355, -21.8954], native: 'Ísland', layout: REYKJAVIK_LAYOUT, tree: null });
