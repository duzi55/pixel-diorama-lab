'use strict';
/* ---------- London: the clock tower, a terrace of brick and stucco, a red double-decker ---------- */
const LD = { X: 12, Y: 7.4 };
const LD_ROW = [[-7.6, -4.8, 3.8, [150, 78, 58], true], [-4.6, -1.8, 3.8, [232, 224, 206], null], [-1.6, 1.2, 3.8, [142, 74, 56], true], [1.4, 4.2, 3.8, [232, 224, 206], null], [4.4, 7.2, 3.8, [156, 84, 62], true], [7.4, 10.4, 3.8, [226, 218, 198], null]];
function londonGround(x, y, ix, iy, i) {
  if (!onIsland(x, y, ix, iy, LD.X, LD.Y)) return 0;
  if (y > -1.2 && y < 2) {
    if (y > 1.75 || y < -.95) if (Math.abs(y - 1.85) < .04 || Math.abs(y - 1.75) < .04 || Math.abs(y + 1.05) < .04 || Math.abs(y + .95) < .04) return rgb(236, 196, 64);
    if (x > -1 && x < .8 && ((y + 2) * 2.4) % 1 < .5) return rgb(236, 234, 226);
    return asphalt(x, y, ix, iy);
  }
  if (y > 4.2) { kinds[i] = KIND_GRASS; return rgb(...GRASS[clamp(Math.floor((noise(x * .9, y * .9) + (hash(ix, iy) - .5) * .5) * 4.2), 0, 3)]); }
  return slabs(x, y, ix, iy, [176, 172, 164], 1);
}
function clockFace(face, a, z, r) {
  for (let q = 0; q <= r; q += st() * .7) for (let t = 0; t < 6.283; t += st() / Math.max(q, .05)) {
    const hand = (Math.abs(Math.sin(t - 1.1)) < .12 && q < r * .7) || (Math.abs(Math.sin(t - 2.6)) < .12 && q < r * .9), rim = q > r - .08;
    const [x, y] = onFace(face, a + Math.cos(t) * q, z + Math.sin(t) * q);
    if (rim || hand) plot(x, y, z + Math.sin(t) * q, rgb(40, 36, 34));
    else plotLit(x, y, z + Math.sin(t) * q, rgb(236, 228, 200), PROP_WARM);
  }
}
function clockTower(x0, y0, x1, y1) {
  const STONE = [206, 182, 132], SLATE = [70, 76, 86];
  box(x0, y0, 0, x1, y1, 8.6, STONE, 450);
  for (let a = x0; a <= x1; a += st()) if (((a - x0) % .3) < .05) for (let z = 0; z <= 8.6; z += st()) plot(a, y1 + .01, z, rampOf(STONE)[1]);
  for (let a = y0; a <= y1; a += st()) if (((a - y0) % .3) < .05) for (let z = 0; z <= 8.6; z += st()) plot(x1 + .01, a, z, rampOf(STONE)[1]);
  box(x0 - .2, y0 - .2, 8.6, x1 + .2, y1 + .2, 10.4, STONE, 451);
  clockFace({ axis: 'y', at: y1 + .22 }, (x0 + x1) / 2, 9.5, .72);
  clockFace({ axis: 'x', at: x1 + .22 }, (y0 + y1) / 2, 9.5, .72);
  box(x0, y0, 10.4, x1, y1, 11.2, STONE, 452);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  capsule([cx, cy, 11.2], [cx, cy, 13.6], (x1 - x0) * .62, .04, () => SLATE, 'solid');
  sphere(cx, cy, 13.7, .1, [226, 196, 96], 'solid');
  for (let z = .4; z <= 12; z += .7) castShadow(cx, cy, z, .9);
}
function terrace([x0, x1, h, c, brick], k) {
  block(x0, -6.4, x1, -1.8, h, c, { brick: brick ? true : undefined, id: 60 + k * 13, ww: .24, wh: .6, gap: .9, floor: 1.2, seed: 460 + k });
  const fr = { axis: 'y', at: -1.76 };
  pane(fr, x0 + .3, x0 + .8, 0, 1.5, rgb(30, 30, 34), 0, false);
  for (let a = x0; a <= x1; a += .2) capsule([a, -1.2, 0], [a, -1.2, .6], .02, .02, () => [30, 30, 34], 'solid');
  // roof and chimney pots
  for (let x = x0; x <= x1; x += st()) for (let s = -2.3; s <= 2.3; s += st()) {
    const z = h + 1.1 * (1 - Math.abs(s) / 2.3), p = project(x, -4.1 + s, z);
    plot(x, -4.1 + s, z, level(rampOf([84, 88, 98]), s > 0 ? 3 : 1.7, p.sx | 0, p.sy | 0));
  }
  box(x1 - .6, -4.4, h + .6, x1 - .1, -3.8, h + 1.7, [150, 78, 58], 470 + k);
  for (const dx of [-.4, -.25]) cylinder(x1 + dx, -4.1, h + 1.7, h + 1.95, .07, [190, 110, 80]);
}
function londonBuild() {
  clockTower(-11, -6.2, -9.2, -4.4);
  LD_ROW.forEach(terrace);
  phoneBox(3.4, 2.7);
  postBox(4.8, 2.6);
  for (const x of [-6, 6.4]) streetLamp({ x, y: 2.5, z: 3.4 }, 0);
  growSeasonTree(-4, 5.6, .6, (currentStyle.leaves || {})[look.season] || look.season, 820);
  growSeasonTree(5.4, 5.8, .55, (currentStyle.leaves || {})[look.season] || look.season, 860);
}
const LD_TRAFFIC = [
  { y: 0, speed: 2.6, len: 5, offset: 0, draw: (x, y) => vehicle(x, y, 5, 1.6, 3, [200, 36, 36], 2) },
  { y: 1.2, speed: -3.2, len: 3.4, offset: 9, draw: (x, y) => vehicle(x, y, 3.4, 1.5, 1.6, [30, 30, 34]) },
];
const LONDON_LAYOUT = {
  scale: 10, lift: 40, ground: londonGround, build: londonBuild, extra: () => traffic(LD_TRAFFIC, LD.X),
  lamps: [{ x: -6, y: 2.5, z: 3.4, base: 0 }, { x: 6.4, y: 2.5, z: 3.4, base: 0 }],
  cafe: null, chimney: { x: -4.75, y: -4.1, top: 5.5 }, snowman: { x: 1, y: 5.6 }, kid: { x: -2, y: 3 }, sitter: null, cup: null,
  pigeons: [[-1, 5, 0], [-.4, 5.4, 1.7], [.4, 4.8, 3.1]], tree: { x: -4, y: 5.6 }, inside: islandInside(LD.X, LD.Y),
  paths: [{ pts: [[-11, 2.9], [11, 2.9]], lanes: 1.2, share: .6 }, { pts: [[-8, -1.5], [11, -1.5]], lanes: .4, share: .2 }, { pts: [[-9, 5.4], [9, 5.4]], lanes: 1.2, share: .2 }],
};

registerCity('london', { name: 'London', country: 'United Kingdom', at: [51.5085, -.1257], native: 'Londinium', layout: LONDON_LAYOUT });
