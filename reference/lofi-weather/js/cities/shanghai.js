'use strict';
/* ---------- Shanghai: the Oriental Pearl over the Huangpu, the Bund across the water ---------- */
const SH = { X: 13, Y: 8.6 };
const SH_RIVER = -5.4, SH_HALF = 2.5;
const SH_WATER = [[30, 70, 96], [38, 84, 110], [52, 102, 126], [78, 132, 150]];
const SH_PEARL = { x: 2.4, y: .6 };
// the river runs along y; its banks wander a little so the water never reads as a straight canal
const shRiverHalf = y => SH_HALF + (noise(y * .3 + 4, 2) - .5) * .45;
const shTone = (tones, v, ix, iy) => rgb(...tones[clamp(Math.floor(v * 4 + (bayerAt(ix, iy) - .5) * .7), 0, 3)]);

function shanghaiGround(x, y, ix, iy, i) {
  const edge = Math.pow(Math.pow(Math.abs(x) / SH.X, 4) + Math.pow(Math.abs(y) / SH.Y, 4), .25);
  const rough = edge + (noise(x * 1.3, y * 1.3) - .5) * .11;
  if (rough > 1.03) return 0;
  if (rough > .94 && hash(ix, iy) < (rough - .94) / .09) return 0;
  const half = shRiverHalf(y);
  // the Huangpu: dark green water, lighter towards the banks
  if (Math.abs(x - SH_RIVER) < half) {
    kinds[i] = KIND_WATER;
    const shore = Math.abs(x - SH_RIVER) / half;
    return shTone(SH_WATER, .12 + shore * shore * .7 + (noise(x * .6, y * .3) - .5) * .35, ix, iy);
  }
  // a pale stone flood wall on both banks
  if (Math.abs(Math.abs(x - SH_RIVER) - half) < .2) return rampOf([198, 194, 184])[3];
  // the Bund: a promenade of old stone buildings on the west bank
  if (x < SH_RIVER) return slabs(x, y, ix, iy, [196, 186, 168], 1);
  // Lujiazui: pale paving along the river, grass and trees further back
  if (x < 3.4 && y > -6.6) return slabs(x, y, ix, iy, [208, 204, 196], 1.05);
  if (noise(x * .8, y * .8) > .58) {
    kinds[i] = KIND_GRASS;
    return rgb(...GRASS[clamp(Math.floor((noise(x * .9, y * .9) * 1.1 + (hash(ix, iy) - .5) * .5) * 4.2), 0, 3)]);
  }
  return slabs(x, y, ix, iy, [204, 200, 192], 1.1);
}

// the Pearl's spheres: a normal shaded ball, with a grid of glass panes that light up after dark.
// The pixels write their emit id directly, so the same ball is silver by day and magenta by night.
function pearlOrb(x, y, z, r, color, id) {
  const ramp = rampOf(color), p = project(x, y, z), rp = Math.max(r * S, .75);
  const y0 = Math.max(0, Math.floor(p.sy - rp)), y1 = Math.min(H - 1, Math.ceil(p.sy + rp));
  const x0 = Math.max(0, Math.floor(p.sx - rp)), x1 = Math.min(W - 1, Math.ceil(p.sx + rp));
  for (let iy = y0; iy <= y1; iy++) for (let ix = x0; ix <= x1; ix++) {
    const dx = (ix + .5 - p.sx) / rp, dy = (iy + .5 - p.sy) / rp, nn = dx * dx + dy * dy;
    if (nn > 1) continue;
    const nz = Math.sqrt(1 - nn), d = p.d + r * nz, i = iy * W + ix;
    if (d <= zb[i]) continue;
    zb[i] = d;
    const l = clamp(-.55 * dx - .6 * dy + .58 * nz, 0, 1);
    pix[i] = ramp[clamp(Math.floor(l * 4.4 + .2 + (bayerAt(ix, iy) - .5) * .7), 0, 4)];
    // the glass: a bright equator band plus a scattered grid, so the lit ball still reads as a sphere
    if (Math.abs(dy) < .12 || hash(ix, iy) < .42) { emit[i] = id; emitZ[i] = d; }
  }
}

// three raking legs, three columns, three spheres and a mast: the silhouette everyone knows
function orientalPearl(x, y) {
  const STEEL = [198, 204, 214], BASE = [208, 206, 198], GLOW = [92, 186, 206];
  const legs = [Math.PI / 2, Math.PI * 7 / 6, Math.PI * 11 / 6];
  // a broad podium, so the three raking legs land on something solid
  box(x - 3.4, y - 3.4, 0, x + 3.4, y + 3.4, .28, BASE, 610);
  box(x - 3.0, y - 3.0, .28, x + 3.0, y + 3.0, .44, [190, 188, 180], 611);
  for (const a of legs) {
    const lx = x + Math.cos(a) * 2.95, ly = y + Math.sin(a) * 2.95;
    capsule([lx, ly, .35], [x + Math.cos(a) * .62, y + Math.sin(a) * .62, 3.55], .36, .24, () => STEEL, 'solid');
    for (let t = 0; t <= 1; t += .04)
      plotLit(lerp(lx, x + Math.cos(a) * .5, t) + .14, lerp(ly, y + Math.sin(a) * .5, t) + .14, lerp(.35, 3.7, t) + .03, GLOW, SIGN_CYAN);
    sphere(lx, ly, .3, .38, BASE, 'rough');
    castShadow(lx, ly, .5, .5);
  }
  // three columns run the full height; a lit seam makes them read at night
  for (const a of legs) {
    const px = x + Math.cos(a) * .62, py = y + Math.sin(a) * .62;
    capsule([px, py, .3], [px, py, 12.8], .22, .13, () => STEEL, 'solid');
    for (let z = .4; z <= 12.7; z += .08) {
      plotLit(px + .17, py + .17, z, GLOW, SIGN_CYAN);
      plotLit(px + .05, py + .21, z, GLOW, SIGN_CYAN);
    }
  }
  pearlOrb(x, y, 3.5, 1.15, [188, 96, 148], SIGN_PINK);
  pearlOrb(x, y, 8.2, .82, [84, 146, 182], SIGN_CYAN);
  pearlOrb(x, y, 11.3, .6, [184, 140, 70], SIGN_YELLOW);
  // the space cabin and the antenna, with a red aircraft light at the tip
  cylinder(x, y, 11.75, 12.5, .38, STEEL);
  capsule([x, y, 12.5], [x, y, 15.1], .09, .03, () => STEEL, 'solid');
  for (let a = 0; a < 6.283; a += .4) for (let q = 0; q <= .16; q += .03)
    plotLit(x + Math.cos(a) * q, y + Math.sin(a) * q, 15.12, rgb(230, 66, 54), SIGN_RED);
  for (let z = .1; z < 14.5; z += .8) castShadow(x, y, z, 1.3, 1, .2);
}

// Jin Mao: a stepped pagoda of shrinking blocks
function jinMao(cx, cy) {
  const C = [188, 186, 180], tiers = [[2.0, 1.35, 4.2], [1.6, 1.1, 5.6], [1.2, .85, 6.8], [.8, .55, 7.6]];
  tiers.forEach(([w, d, h], k) => block(cx - w, cy - d, cx + w, cy + d, h, C,
    { id: 30 + k * 17, ww: .07, wh: .28, gap: .48, floor: .58, seed: 620 + k }));
  capsule([cx, cy, 7.6], [cx, cy, 9.4], .34, .03, () => [170, 172, 178], 'solid');
}

// SWFC: a square tower with the trapezoid opening near the top
function worldFinance(cx, cy) {
  const C = [176, 196, 210];
  block(cx - 1.45, cy - 1.0, cx + 1.45, cy + 1.0, 8.4, C,
    { id: 74, ww: .09, wh: .28, gap: .62, floor: .72, seed: 640 });
  for (let a = cx - 1; a <= cx + 1; a += st()) for (let z = 7.2; z <= 8.2; z += st()) {
    const t = (z - 7.2) / 1.0, half = 1.02 * (1 - t * .55);
    if (Math.abs(a - cx) < half) plot(a, cy + 1.07, z, rgb(46, 54, 68));
  }
  for (let a = cx - 1.45; a <= cx + 1.45; a += .4) castShadow(a, cy, 8.3, .3, 1, .2);
}

// Shanghai Tower: a tall cylinder with a twisting silver seam
function shanghaiTower(cx, cy) {
  const C = [170, 188, 202];
  cylinder(cx, cy, 0, 8.8, 1.0, C);
  for (let k = 0; k < 70; k++) {
    const z = k / 70 * 8.8, a = k * .32;
    plot(cx + Math.cos(a) * 1.07, cy + Math.sin(a) * 1.07, z, rampOf(C)[4]);
  }
  capsule([cx, cy, 8.8], [cx, cy, 9.9], .76, .1, () => C, 'solid');
  for (let a = 0; a < 6.283; a += .5) castShadow(cx + Math.cos(a) * .7, cy + Math.sin(a) * .7, 8.8, .5, 1, .2);
}

// the Bund: stone facades, a dome or a flagpole on each roof
function bundBuilding(x0, x1, y0, y1, h, c, k) {
  block(x0, y0, x1, y1, h, c, { id: 96 + k * 14, ww: .18, wh: .5, gap: .8, floor: 1.1, seed: 660 + k });
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  // the customs house: a clock tower on the middle block
  if (k === 2) {
    box(mx - .5, my - .5, h, mx + .5, my + .5, h + 1.7, c, 680);
    for (let a = mx - .3; a <= mx + .3; a += st()) for (let z = h + .7; z <= h + 1.3; z += st()) {
      const rr = Math.hypot(a - mx, z - (h + 1));
      if (rr < .3) plotLit(a, my + .52, z, rr > .22 ? rgb(242, 234, 210) : rgb(226, 218, 192), PROP_WARM);
    }
    capsule([mx, my, h + 1.7], [mx, my, h + 2.4], .28, .02, () => [110, 106, 102], 'solid');
    return;
  }
  if (k % 3 === 1) {
    sphere(mx, my, h + .05, .42, [162, 152, 138], 'rough');
    sphere(mx, my, h + .46, .07, [196, 174, 120], 'solid');
  } else if (k % 3 === 2) {
    capsule([mx, my, h], [mx, my, h + 1.3], .05, .03, () => [92, 92, 98], 'solid');
  }
}

const SH_BUND = [
  [-12.6, -9.0, -6.6, -3.9, 2.6, [214, 202, 182]],
  [-12.4, -9.2, -3.6, -1.1, 3.2, [226, 216, 198]],
  [-12.6, -8.9, -.8, 1.6, 2.8, [206, 194, 174]],
  [-12.4, -9.1, 1.9, 4.3, 3.4, [218, 208, 190]],
  [-12.6, -9.0, 4.6, 6.6, 2.5, [200, 190, 172]],
];

function shanghaiBuild() {
  SH_BUND.forEach((b, k) => bundBuilding(...b, k));
  // Lujiazui skyline: the Pearl in front, three towers behind
  jinMao(3.4, -3.8);
  worldFinance(9.8, -2.2);
  orientalPearl(SH_PEARL.x, SH_PEARL.y);
  // the riverside promenade
  for (const l of SHANGHAI_LAYOUT.lamps) streetLamp(l, 0);
  for (const [x, y, k, seed] of [[3.9, 5.2, .72, 900], [.8, 6.2, .5, 940], [11.6, 4.6, .55, 980]]) {
    growSeasonTree(x, y, k, (currentStyle.leaves || {})[look.season] || look.season, seed);
  }
  // bollards along the flood wall
  for (let y = -7; y <= 7; y += 1.5) {
    cylinder(SH_RIVER + shRiverHalf(y) + .45, y, 0, .32, .08, [74, 74, 82]);
    cylinder(SH_RIVER - shRiverHalf(y) - .45, y, 0, .32, .08, [74, 74, 82]);
  }
}

const SH_STREAKS = Array.from({ length: 190 }, (_, k) => ({
  x: (hash(k, 31) - .5) * 3.2, y0: hash(k, 32) * 17, speed: .7 + hash(k, 33),
  len: 2 + (hash(k, 34) * 3 | 0), bright: hash(k, 35) > .72,
}));
// the Huangpu runs towards the viewer; light streaks drift downstream
function shanghaiWater() {
  const lit = rgb(146, 200, 222), soft = rgb(96, 150, 178), dim = rgb(46, 88, 116);
  for (const s of SH_STREAKS) {
    const y = ((s.y0 + L.time * s.speed * (1 + V.rain * .8)) % 17) - 8.5;
    for (let k = 0; k < s.len; k++) {
      const p = project(SH_RIVER + s.x + Math.sin(y * .5 + s.y0) * .25, y + k * .11, 0);
      const ix = p.sx | 0, iy = p.sy | 0;
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
      const i = iy * W + ix;
      if (kinds[i] !== KIND_WATER || zb[i] !== groundZ[i]) continue;
      pix[i] = staticShadow[i] ? dim : s.bright ? lit : soft;
    }
  }
  // at night the Pearl lays a magenta sheen on the water below it
  if (V.night < .25) return;
  for (let y = -4; y <= 4; y += .16) for (let k = 0; k < 26; k++) {
    const x = SH_RIVER + .3 + k * .1, p = project(x, y + Math.sin(y * 3 + k) * .12, 0);
    const ix = p.sx | 0, iy = p.sy | 0;
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
    const i = iy * W + ix;
    if (kinds[i] !== KIND_WATER || zb[i] !== groundZ[i] || bayerAt(ix, iy) > .62) continue;
    const c = pix[i];
    pix[i] = rgb(lerp(c & 255, 240, .55 * V.night), lerp(c >> 8 & 255, 112, .55 * V.night), lerp(c >> 16 & 255, 176, .55 * V.night));
  }
}

// a sightseeing boat shuttles up and down the river, its windows lit after dark
function shanghaiBoat() {
  const span = 22, y = ((L.time * 1.8) % span) - span / 2;
  if (Math.abs(y) > 8.2) return;
  const x = SH_RIVER + .3, lit = V.night > .45;
  box(x - 1.25, y - 1.9, .02, x + 1.25, y + 1.9, .58, [238, 238, 232], 700);
  box(x - 1, y - 1.4, .58, x + 1, y + 1.4, 1.35, [214, 220, 224], 701);
  const glass = lit ? rgb(255, 228, 154) : rgb(60, 74, 90);
  for (let a = y - 1.2; a <= y + 1.2; a += st()) {
    if (((a - y + 1.2) % .48) < .1) continue;
    for (let z = .72; z <= 1.2; z += st()) {
      plot(x + 1.03, a, z, glass);
      plot(x - 1.03, a, z, glass);
    }
  }
  for (let a = y - .8; a <= y + .8; a += st()) plot(x + a * .2, y - 1.42, 1.5, glass);
  // wake: broken flecks behind the stern
  for (let k = 0; k < 24; k++) {
    if (hash(k, Math.floor(L.time * 6)) < .45) continue;
    plot(x + (hash(k, 3) - .5) * 1.6, y - 2 + k * .08, .03, rgb(206, 226, 230));
  }
  castShadow(x, y, .5, 1.4, 1, .2);
}

const SHANGHAI_LAYOUT = {
  scale: 11.4, lift: 72, ground: shanghaiGround, build: shanghaiBuild,
  water: shanghaiWater, extra: shanghaiBoat,
  lamps: [{ x: -2.6, y: -4.4, z: 3.2, base: 0 }, { x: -2.6, y: 1.2, z: 3.2, base: 0 }, { x: -2.6, y: 6.4, z: 3.2, base: 0 }],
  cafe: null, chimney: null, snowman: null, kid: { x: -1.2, y: 3.8 }, sitter: null, cup: null,
  pigeons: [[3.6, 3.4, 0], [4, 3.8, 1.7]], tree: { x: 2.9, y: 4.6 },
  inside: islandInside(SH.X, SH.Y),
  paths: [
    { pts: [[-2.7, -7], [-2.7, 7]], lanes: 1.2, share: .58 },
    { pts: [[-8.8, -6], [-8.8, 6]], lanes: .9, share: .42 },
  ],
};

registerCity('shanghai', {
  name: 'Shanghai', country: 'China', at: [31.2397, 121.4998], native: '上海',
  layout: SHANGHAI_LAYOUT, tree: { x: 2.9, y: 4.6, scale: .72 },
});
