'use strict';
/* ---------- Dubai: the needle tower over a sand-coloured old quarter, palms, an abra on the creek ---------- */
const DB = { X: 12.4, Y: 8.4 };
function dubaiGround(x, y, ix, iy, i) {
  if (!onIsland(x, y, ix, iy, DB.X, DB.Y)) return 0;
  if (y > 4.4 + (noise(x * .5, 3) - .5) * .4) { kinds[i] = KIND_WATER; return tone4([[40, 110, 128], [52, 132, 146], [72, 156, 164], [110, 184, 186]], .3 + noise(x * .5, y) * .5, ix, iy); }
  if (y > 3.6) return slabs(x, y, ix, iy, [214, 196, 160], .8);
  // a star-tiled plaza
  const fx = ((x / 1.6) % 1 + 1) % 1 - .5, fy = ((y / 1.6) % 1 + 1) % 1 - .5;
  if (Math.abs(Math.abs(fx) + Math.abs(fy) - .42) < .04) return rgb(176, 140, 96);
  return level(rampOf([228, 204, 160]), 2.8 + noise(x * 3, y * 3) * .6, ix, iy);
}
function burj(cx, cy) {
  const GLASS_T = [176, 196, 210];
  let z = 0;
  for (let k = 0; k < 11; k++) {
    const half = 1.5 - k * .13, top = z + 1.35 - k * .03;
    block(cx - half, cy - half, cx + half, cy + half, top, GLASS_T, { id: 120 + k * 5, ww: .06, wh: .3, gap: .26, floor: .45, seed: 480 + k });
    z = top;
  }
  capsule([cx, cy, z], [cx, cy, z + 3.4], .2, .02, () => [196, 206, 214], 'solid');
  plotLit(cx, cy + .1, z + 3.2, rgb(255, 120, 110), PROP_WARM);
}
function dubaiBuild() {
  burj(-6.2, -5.2);
  for (const [x0, x1, y0, y1, h, k] of [[-2.4, 1.4, -6.4, -2.6, 2.6, 0], [1.8, 5.4, -6.6, -3, 3, 1], [6, 10, -5.8, -2.4, 2.4, 2]]) {
    block(x0, y0, x1, y1, h, [228, 206, 168], { id: 160 + k * 9, ww: .2, wh: .5, gap: 1.1, seed: 500 + k });
    for (let a = x0; a <= x1; a += st()) plot(a, y1 + .02, h - .1, rampOf([196, 170, 130])[1]);
    windTower(x0 + .8, y0 + .9, h);
  }
  for (const [x, y, k, seed] of [[-1, 1.8, .9, 11], [3.6, 1.6, .85, 13], [8.4, 1.4, .95, 17], [-9.6, 2.2, .8, 19]]) growPalm(x, y, k, seed);
  for (const x of [-4.4, 6]) streetLamp({ x, y: 3.3, z: 3.2 }, 0);
}
function abra() {
  const t = (L.time * 1.4) % 30, x = t - 15;
  if (Math.abs(x) > 9) return;
  box(x - 1.6, 5.7, .02, x + 1.6, 6.7, .5, [150, 104, 64], 520);
  box(x - 1.2, 5.85, .5, x + 1.2, 6.55, .58, [214, 196, 160], 521);
  for (const dx of [-1, 1]) capsule([x + dx, 6.2, .5], [x + dx, 6.2, 1.3], .04, .04, () => [120, 84, 52], 'solid');
  box(x - 1.3, 5.8, 1.3, x + 1.3, 6.6, 1.38, [236, 224, 196], 522);
}
const DUBAI_LAYOUT = {
  scale: 8.6, lift: 30, ground: dubaiGround, build: dubaiBuild, extra: abra,
  lamps: [{ x: -4.4, y: 3.3, z: 3.2, base: 0 }, { x: 6, y: 3.3, z: 3.2, base: 0 }],
  cafe: null, chimney: null, snowman: null, kid: { x: 1.6, y: 3.2 }, sitter: null, cup: null,
  pigeons: [], tree: null, inside: islandInside(DB.X, DB.Y),
  paths: [{ pts: [[-11, 2.8], [11, 2.8]], lanes: 2, share: .7 }, { pts: [[-11, -1.4], [11, -1.4]], lanes: 1, share: .3 }],
};

registerCity('dubai', { name: 'Dubai', country: 'United Arab Emirates', at: [25.0772, 55.3093], native: 'دبي', layout: DUBAI_LAYOUT });
