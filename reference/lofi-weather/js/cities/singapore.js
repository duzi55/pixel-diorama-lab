'use strict';
/* ---------- Singapore: three towers carrying a sky deck, the bay, Supertrees, a row of shophouses ---------- */
const SG = { X: 12.4, Y: 8.2 };
function singaporeGround(x, y, ix, iy, i) {
  if (!onIsland(x, y, ix, iy, SG.X, SG.Y)) return 0;
  if (y > 3 + (noise(x * .5, 3) - .5) * .3 && x < 4) { kinds[i] = KIND_WATER; return tone4([[30, 82, 104], [40, 100, 122], [56, 122, 142], [96, 160, 170]], .3 + noise(x * .5, y) * .5, ix, iy); }
  if (x >= 4 && y > -1) { kinds[i] = KIND_GRASS; return rgb(...GRASS[clamp(Math.floor((noise(x * .9, y * .9) * 1.1 + (hash(ix, iy) - .5) * .5) * 4.2), 0, 3)]); }
  return slabs(x, y, ix, iy, [196, 192, 184], 1);
}
function marinaBay(x0, y0, y1) {
  const GLASS_T = [168, 190, 204];
  for (let k = 0; k < 3; k++) {
    const a = x0 + k * 2.6;
    block(a, y0, a + 1.6, y1, 8.6, GLASS_T, { id: 200 + k * 11, ww: .08, wh: .3, gap: .3, floor: .5, seed: 540 + k });
  }
  // the sky deck: a long hull across all three towers, overhanging at one end
  box(x0 - .4, y0 - .3, 8.6, x0 + 8.4, y1 + .3, 9.2, [214, 220, 222], 545);
  for (let a = x0; a <= x0 + 8; a += .6) growPalm(a, (y0 + y1) / 2, .14, 30 + a * 3 | 0);
  for (let x = x0 - .4; x <= x0 + 8.4; x += .6) castShadow(x, (y0 + y1) / 2, 8.9, .8, 1, .2);
}
function singaporeBuild() {
  marinaBay(-10.6, -6.4, -4.2);
  for (const [x0, x1, c, k] of [[-1.6, .6, [176, 214, 196], 0], [.8, 3, [236, 196, 200], 1], [3.2, 5.4, [246, 226, 168], 2]]) {
    block(x0, -5.6, x1, -2.2, 2.8, c, { shop: [230, 210, 170], id: 230 + k * 5, ww: .25, wh: .6, gap: .9, floor: 1.2, seed: 560 + k });
    for (let x = x0 - .1; x <= x1 + .1; x += st()) for (let s = -1.8; s <= 1.8; s += st()) {
      const z = 2.8 + .9 * (1 - Math.abs(s) / 1.8), p = project(x, -3.9 + s, z);
      plot(x, -3.9 + s, z, level(rampOf([186, 96, 66]), s > 0 ? 3.1 : 1.7, p.sx | 0, p.sy | 0));
    }
  }
  supertree(8.2, -2.4);
  supertree(10.4, 1.2);
  growPalm(6.4, 3.6, .7, 41);
  for (const x of [-6, 1.8]) streetLamp({ x, y: 2.2, z: 3.2 }, 0);
}
const SINGAPORE_LAYOUT = {
  scale: 9.2, lift: 34, ground: singaporeGround, build: singaporeBuild,
  lamps: [{ x: -6, y: 2.2, z: 3.2, base: 0 }, { x: 1.8, y: 2.2, z: 3.2, base: 0 }],
  cafe: null, chimney: null, snowman: null, kid: { x: -3, y: 1.4 }, sitter: null, cup: null,
  pigeons: [[6, 5, 0], [6.6, 5.4, 1.7]], tree: null, inside: islandInside(SG.X, SG.Y),
  paths: [{ pts: [[-11, 1.6], [3.6, 1.6]], lanes: 1.6, share: .6 }, { pts: [[5, -.6], [5, 6.6], [11, 6.6]], lanes: .8, share: .4 }],
};

registerCity('singapore', { name: 'Singapore', country: 'Singapore', at: [1.2897, 103.8501], native: '新加坡', layout: SINGAPORE_LAYOUT, tree: null });
