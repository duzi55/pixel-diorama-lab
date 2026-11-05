'use strict';
/* ---------- New York: an avenue under an Art Deco tower, brownstones with fire escapes, yellow cabs ---------- */
const NY = { X: 12, Y: 7.2 };
const NY_ROW = [[-6.2, -3.4, 4.6, [126, 80, 62], 1], [-3.2, .2, 5.2, [150, 92, 70], 1], [.4, 3.6, 4.2, [112, 74, 60], 1], [3.8, 7.2, 5.6, [176, 160, 136], 0], [7.4, 11, 4.4, [130, 84, 64], 1]];
function newyorkGround(x, y, ix, iy, i) {
  if (!onIsland(x, y, ix, iy, NY.X, NY.Y)) return 0;
  if (y > -1.4 && y < 2.2) {
    if (Math.abs(y - .4) < .05 || Math.abs(y - .55) < .05) return rgb(236, 196, 64);
    if (x > 4.4 && x < 6 && ((y + 2) * 2.4) % 1 < .5) return rgb(232, 230, 222);
    if (Math.hypot(x + 2, y - .2) < .4) return rampOf([70, 70, 76])[Math.hypot(x + 2, y - .2) > .33 ? 1 : 2];
    return asphalt(x, y, ix, iy);
  }
  return slabs(x, y, ix, iy, [178, 174, 166], 1.1);
}
function fireEscapeOn(x0, x1, y1, h) {
  const at = y1 + .02;
  for (let z = 2.2; z < h - .5; z += 1.05) {
    box(x0 + .4, at, z - .05, x1 - .4, at + .6, z, IRON, 410);
    for (let a = x0 + .4; a <= x1 - .4; a += .03) plot(a, at + .58, z + .5, rampOf(IRON)[2]);
    for (let a = x0 + .4; a <= x1 - .4; a += .3) for (let zz = z; zz <= z + .5; zz += .04) plot(a, at + .58, zz, rampOf(IRON)[2]);
    for (let t = 0; t <= 1; t += .03) plot(lerp(x0 + .6, x1 - .8, t), at + .3, z + t * 1.05, rampOf(IRON)[1]);
  }
}
function empireTower(x0, x1, y0, y1) {
  const STONE = [200, 194, 180], tiers = [[0, 0, 6.2], [.5, .5, 8.8], [1.1, 1.1, 10.6], [1.6, 1.6, 11.6]];
  let base = 0;
  for (const [ix0, iy0, top] of tiers) {
    block(x0 + ix0, y0 + iy0, x1 - ix0, y1 - iy0, top, STONE, { id: 7 * top | 0, ww: .1, wh: .5, gap: .42, floor: .8, seed: 420 });
    base = top;
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  capsule([cx, cy, base], [cx, cy, base + 2.4], .28, .03, () => [180, 184, 190], 'solid');
  plotLit(cx, cy + .2, base + 1.2, rgb(255, 120, 110), PROP_WARM);
}
function newyorkBuild() {
  empireTower(-11, -6.6, -6.8, -2.2);
  NY_ROW.forEach(([x0, x1, h, c, brick], k) => {
    block(x0, -6.6, x1, -2, h, c, { brick: brick ? true : false, shop: k % 2 ? [220, 190, 140] : [200, 220, 230], id: 40 + k * 17, seed: 430 + k });
    if (brick) fireEscapeOn(x0, x1, -2, h);
  });
  waterTower(-1.6, -4.8, 5.2);
  waterTower(9.4, -5, 4.4);
  hydrant(2, 2.9);
  // a traffic light on the corner
  capsule([6.4, 2.5, 0], [6.4, 2.5, 3.2], .08, .07, () => [50, 70, 60], 'solid');
  box(6.25, 2.55, 2.4, 6.55, 2.75, 3.3, [50, 70, 60], 440);
  for (const [z, c] of [[3.1, [220, 60, 50]], [2.85, [236, 190, 60]], [2.6, [80, 200, 110]]]) sphere(6.4, 2.78, z, .09, c, 'solid');
  for (const x of [-5, 3]) streetLamp({ x, y: 2.6, z: 3.6 }, 0);
}
const NY_TRAFFIC = [
  { y: -.4, speed: 3.4, len: 3.6, offset: 0, draw: (x, y) => vehicle(x, y, 3.6, 1.5, 1.4, [236, 186, 40]) },
  { y: -.4, speed: 3.4, len: 3.6, offset: 13, draw: (x, y) => vehicle(x, y, 3.6, 1.5, 1.4, [236, 186, 40]) },
  { y: 1.3, speed: -2.8, len: 3.6, offset: 6, draw: (x, y) => vehicle(x, y, 3.6, 1.5, 1.4, [236, 186, 40]) },
  { y: 1.3, speed: -2.8, len: 4.4, offset: 20, draw: (x, y) => vehicle(x, y, 4.4, 1.6, 1.9, [40, 46, 60]) },
];
const NEWYORK_LAYOUT = {
  scale: 10, lift: 40, ground: newyorkGround, build: newyorkBuild,
  extra: () => { traffic(NY_TRAFFIC, NY.X); steamFrom(-2, .2); },
  lamps: [{ x: -5, y: 2.6, z: 3.6, base: 0 }, { x: 3, y: 2.6, z: 3.6, base: 0 }],
  cafe: null, chimney: null, snowman: { x: 9.6, y: 4.2 }, kid: { x: -3, y: 3.6 }, sitter: null, cup: null,
  pigeons: [[-8, 3.4, 0], [-7.4, 3.8, 1.7]], tree: null, inside: islandInside(NY.X, NY.Y),
  paths: [{ pts: [[-11, 3.4], [11, 3.4]], lanes: 1.4, share: .65 }, { pts: [[-6, -1.7], [11, -1.7]], lanes: .4, share: .35 }],
};

registerCity('newyork', { name: 'New York', country: 'United States', at: [40.7143, -74.006], native: 'NYC', layout: NEWYORK_LAYOUT });
