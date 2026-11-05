'use strict';
/* ---------- Mostar: the old bridge over the Neretva, the towers at either end, the town on the banks ---------- */
const MO = { ARCH_A: 5.8, ARCH_C: 1, ARCH_BASE: 1.8, DECK_END: 6.7, DECK_LOW: 5.5, DECK_TOP: 9, DECK_REACH: 8.6, HALF_W: .95, PARAPET: .4, X: 13, Y: 8.6 };
MO.ARCH_R = MO.ARCH_A + MO.ARCH_C;
const MO_STONE = [216, 206, 184], MO_SLATE = [120, 116, 118], MO_TILE = [168, 96, 70], MO_DARK = [44, 40, 50];
const NERETVA = [[34, 102, 108], [44, 122, 120], [62, 146, 134], [94, 172, 150]];
const PEBBLES = [[186, 178, 158], [202, 194, 174], [216, 210, 190], [230, 224, 204]];
const moArchZ = x => MO.ARCH_BASE + Math.sqrt(Math.max(0, MO.ARCH_R ** 2 - (Math.abs(x) + MO.ARCH_C) ** 2));
const moDeckZ = x => {
  const a = Math.abs(x);
  return a >= MO.DECK_END ? MO.DECK_LOW : MO.DECK_TOP - (MO.DECK_TOP - MO.DECK_LOW) * (a / MO.DECK_END) ** 1.6;
};
const riverHalf = y => 4.5 + (noise(y * .25 + 9, 3) - .5);
const tone4 = (tones, v, ix, iy) => rgb(...tones[clamp(Math.floor(v * 4 + (bayerAt(ix, iy) - .5) * .7), 0, 3)]);
function mostarGround(x, y, ix, iy, i) {
  // the land is a rounded slab that frays into the sky at its edge
  const edge = Math.pow(Math.pow(Math.abs(x) / MO.X, 4) + Math.pow(Math.abs(y) / MO.Y, 4), .25);
  const rough = edge + (noise(x * 1.3, y * 1.3) - .5) * .13;
  if (rough > 1.04) return 0;
  if (rough > .93 && hash(ix, iy) < (rough - .93) / .11) return 0;
  const half = riverHalf(y), fine = hash(ix, iy), a = Math.abs(x);
  if (a < half) {
    kinds[i] = KIND_WATER;
    const shore = a / half;
    return tone4(NERETVA, .1 + shore * shore * .7 + (noise(x * .6, y * .3) - .5) * .35, ix, iy);
  }
  if (a < half + 1 + noise(x * 2, y * 2) * .8) {
    if (fine > .96) return rgb(240, 236, 220);
    if (hash(ix - 1, iy - 1) > .96) return rgb(150, 142, 126);
    return tone4(PEBBLES, .25 + noise(x * 3, y * 3) * .6, ix, iy);
  }
  // cobbled lanes of the old town run up to each end of the bridge
  if (Math.abs(y) < 2 + noise(x * .7, 3) * .7) {
    const fx = x * 2.4, row = Math.floor(y * 2.4), fy = fx + (row % 2) * .5, col = Math.floor(fy);
    if (y * 2.4 - row < .2 || fy - col < .16) return rampOf(MO_STONE)[1];
    return rampOf(MO_STONE)[clamp(2 + Math.floor(hash(col, row) * 2.4 + (bayerAt(ix, iy) - .5) * .4), 1, 4)];
  }
  kinds[i] = KIND_GRASS;
  const t = noise(x * .9, y * .9) * 1.15 + (fine - .5) * .55 - .08;
  return rgb(...GRASS[clamp(Math.floor(t * 4.2), 0, 3)]);
}
function masonry(a, z, base, c = MO_STONE) {
  const fz = z * 1.9, course = Math.floor(fz), fa = a * 1.4 + (course % 2) * .5, block = Math.floor(fa);
  const mortar = fz - course < .14 || fa - block < .1, tone = hash(block, course);
  return rampOf(c)[clamp(base + (tone > .75 ? 1 : tone < .2 ? -1 : 0) - (mortar ? 1 : 0), 0, 4)];
}
function moBridge() {
  const step = .035, { ARCH_A, ARCH_C, ARCH_R, ARCH_BASE, DECK_REACH, HALF_W, PARAPET } = MO;
  const crownAngle = Math.acos(ARCH_C / ARCH_R);
  for (let t = 0; t <= crownAngle; t += .002) {
    const a = ARCH_R * Math.cos(t) - ARCH_C, z = ARCH_BASE + ARCH_R * Math.sin(t);
    for (let y = -HALF_W; y <= HALF_W; y += step) {
      plot(-a, y, z, masonry(y + t * 4, t * 8, 2));
      plot(a, y, z, masonry(y + t * 4, t * 8, 1));
    }
  }
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -ARCH_A : ARCH_A - 1;
    box(x0, -HALF_W - .25, 0, x0 + 1, HALF_W + .25, ARCH_BASE, MO_STONE, 40 + side);
  }
  for (let x = -DECK_REACH; x <= DECK_REACH; x += step) {
    const top = moDeckZ(x), a = Math.abs(x), low = a < ARCH_A ? moArchZ(x) : 0;
    for (let z = low; z <= top; z += step) {
      const radial = Math.hypot(a + ARCH_C, z - ARCH_BASE);
      if (z > top - .2 && z < top - .08) plot(x, HALF_W, z, rampOf(MO_STONE)[4]);
      else if (z > ARCH_BASE && radial < ARCH_R + .5) {
        const joint = (Math.atan2(z - ARCH_BASE, a + ARCH_C) * 26) % 1;
        plot(x, HALF_W, z, rampOf(MO_STONE)[joint < .16 ? 2 : 4]);
      } else plot(x, HALF_W, z, masonry(x, z, 3));
    }
    for (let y = -HALF_W; y <= HALF_W; y += step) plot(x, y, top, rampOf(MO_STONE)[Math.floor(x * 3) % 2 === 0 ? 3 : 4]);
    for (const side of [-1, 1]) {
      for (let z = top; z <= top + PARAPET; z += step) {
        plot(x, side * HALF_W, z, masonry(x, z, 3));
        plot(x, side * (HALF_W - .18), z, masonry(x, z, 2));
      }
      for (let w = HALF_W - .18; w <= HALF_W; w += step) plot(x, side * w, top + PARAPET, rampOf(MO_STONE)[4]);
    }
  }
  for (let x = -MO.DECK_END; x <= MO.DECK_END; x += .3) {
    const low = Math.abs(x) < ARCH_A ? moArchZ(x) : 0;
    for (let z = low; z <= moDeckZ(x); z += .45) for (let y = -.7; y <= .7; y += .7) castShadow(x, y, z, .45);
  }
}
function moWindows(face, a0, a1, zs, id) {
  const count = Math.max(1, Math.floor((a1 - a0) / 1.1));
  for (let k = 0; k < count; k++) {
    const c = lerp(a0, a1, (k + .5) / count);
    for (const z0 of zs) for (let a = c - .2; a <= c + .2; a += st()) for (let z = z0; z <= z0 + .62; z += st()) {
      const frame = Math.abs(a - c) < .03 || Math.abs(z - z0 - .31) < .03;
      plotLit(...onFace(face, a, z), frame ? rgb(96, 86, 80) : GLASS, frame ? 0 : id + k);
    }
  }
}
function moRoof(x0, y0, x1, y1, z, rise, c) {
  const yc = (y0 + y1) / 2, half = (y1 - y0) / 2;
  for (let x = x0; x <= x1; x += st()) for (let y = y0; y <= y1; y += st()) {
    const q = Math.abs(y - yc) / half, row = Math.floor(q * half * 3.6) % 2;
    plot(x, y, z + rise * (1 - q), rampOf(c)[clamp((y > yc ? 3 : 1) + row - (hash(x * 3 | 0, y * 9 | 0) > .85 ? 1 : 0), 0, 4)]);
  }
  for (let y = y0; y <= y1; y += st()) {
    const q = Math.abs(y - yc) / half;
    for (let h = 0; h <= rise * (1 - q); h += st()) plot(x1, y, z + h, masonry(y, z + h, 2));
  }
}
function moHouse(x0, y0, x1, y1, z1, c, id, chimney) {
  for (let a = x0; a <= x1; a += st()) for (let z = 0; z <= z1; z += st()) plot(a, y1, z, masonry(a, z, 3));
  for (let a = y0; a <= y1; a += st()) for (let z = 0; z <= z1; z += st()) plot(x1, a, z, masonry(a, z, 2));
  box(x0, y0, 0, x1 - .02, y1 - .02, z1, MO_STONE, id);
  moWindows({ axis: 'y', at: y1 + .02 }, x0, x1, [z1 * .5], id);
  moWindows({ axis: 'x', at: x1 + .02 }, y0, y1, [z1 * .5], id + 5);
  moRoof(x0 - .2, y0 - .2, x1 + .2, y1 + .2, z1, 1.3, c);
  if (chimney) {
    box(chimney.x - .22, chimney.y - .22, z1 + .4, chimney.x + .22, chimney.y + .22, chimney.top, MO_STONE, id + 9);
    castShadow(chimney.x, chimney.y, chimney.top, .3);
  }
  for (let x = x0; x <= x1; x += .5) for (let y = y0; y <= y1; y += .5) for (let z = .3; z <= z1 + 1; z += .7) castShadow(x, y, z, .5);
}
function moSquareTower(x0, y0, x1, y1, z1) {
  for (let a = x0; a <= x1; a += st()) for (let z = 0; z <= z1; z += st()) plot(a, y1, z, masonry(a, z, 3));
  for (let a = y0; a <= y1; a += st()) for (let z = 0; z <= z1; z += st()) plot(x1, a, z, masonry(a, z, 2));
  box(x0, y0, 0, x1 - .02, y1 - .02, z1, MO_STONE, 50);
  for (const [wx, wz, k] of [[.5, .42, 0], [.5, .72, 1]]) {
    const cx = lerp(y0, y1, wx);
    for (let a = cx - .18; a <= cx + .18; a += st()) for (let z = z1 * wz - .35; z <= z1 * wz + .35; z += st()) plotLit(x1 + .02, a, z, GLASS, 60 + k);
  }
  moRoof(x0 - .15, y0 - .15, x1 + .15, y1 + .15, z1, 1.3, MO_SLATE);
  for (let x = x0; x <= x1; x += .5) for (let y = y0; y <= y1; y += .5) for (let z = .3; z <= z1; z += .7) castShadow(x, y, z, .55);
}
function moRoundTower(cx, cy, r, z1) {
  for (let t = 0; t < 6.283; t += .014) {
    const nx = Math.cos(t), ny = Math.sin(t), l = -.5 * nx + .85 * ny;
    for (let z = 0; z <= z1; z += st()) plot(cx + nx * r, cy + ny * r, z, masonry(t * r, z, clamp(Math.round(2.4 + l * 1.3), 1, 4)));
  }
  for (let t = 0; t < 6.283; t += .018) {
    const nx = Math.cos(t), ny = Math.sin(t), l = -.5 * nx + .85 * ny;
    for (let q = 0; q <= 1; q += .012) {
      const rr = (r + .18) * (1 - q);
      plot(cx + nx * rr, cy + ny * rr, z1 + q * 1.9, rampOf(MO_SLATE)[clamp(Math.round(2.4 + l * 1.4 + (Math.floor(q * 12) % 2) * .4), 1, 4)]);
    }
  }
  for (const [t, wz, k] of [[1.2, .45, 0], [.5, .72, 1]]) {
    for (let a = t - .1; a <= t + .1; a += .01) for (let z = z1 * wz - .35; z <= z1 * wz + .35; z += st()) plotLit(cx + Math.cos(a) * (r + .1), cy + Math.sin(a) * (r + .1), z, GLASS, 62 + k);
  }
  for (let a = 0; a < 6.283; a += .6) for (let z = .3; z <= z1; z += .7) castShadow(cx + Math.cos(a) * r * .6, cy + Math.sin(a) * r * .6, z, .6);
}
function moMosque(x, y) {
  box(x - 1, y - .9, 0, x + 1, y + .9, 2.1, [226, 218, 200], 70);
  sphere(x, y, 2.1, .95, [104, 110, 124], 'solid');
  sphere(x, y, 3.08, .08, [226, 196, 96], 'solid');
  for (let x2 = x - 1; x2 <= x + 1; x2 += .5) for (let z = .3; z < 2.6; z += .6) castShadow(x2, y, z, .9);
}
const MO_STREAKS = Array.from({ length: 220 }, (_, k) => ({ x: (hash(k, 31) - .5) * 8.4, y0: hash(k, 32) * 18, speed: .8 + hash(k, 33), len: 2 + (hash(k, 34) * 3 | 0), bright: hash(k, 35) > .72 }));
// the Neretva runs towards the viewer; light streaks drift downstream
function mostarWater() {
  const lit = rgb(150, 208, 180), soft = rgb(104, 180, 158), dim = rgb(58, 112, 120);
  for (const s of MO_STREAKS) {
    const y = ((s.y0 + L.time * s.speed * (1 + V.rain * .8)) % 18) - 9;
    for (let k = 0; k < s.len; k++) {
      const p = project(s.x + Math.sin(y * .4 + s.y0) * .3, y + k * .11, 0), ix = p.sx | 0, iy = p.sy | 0;
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
      const i = iy * W + ix;
      if (kinds[i] !== KIND_WATER || zb[i] !== groundZ[i]) continue;
      pix[i] = staticShadow[i] ? dim : s.bright ? lit : soft;
    }
  }
}
// the diver: in warm, dry daylight someone climbs the parapet at the crown, waits, and drops into the river
const DIVE = { cycle: 15, stand: 7, fall: 1.75 };
function diverOn() { return V.night < .3 && V.rain + V.drizzle + V.snow < .1 && V.cloud < .7 && V.temp >= 18; }
function mostarDiver() {
  if (!diverOn()) return;
  const t = L.time % DIVE.cycle, z0 = MO.DECK_TOP + MO.PARAPET, y0 = MO.HALF_W - .1;
  const pal = palette([[214, 160, 122], [184, 132, 100]], null, [40, 30, 26]);
  pal.p = pal.c; pal.P = pal.C; pal.b = pal.s; pal.R = rgb(196, 52, 44);
  if (t < DIVE.stand) { blit(SPRITES.diver, 0, y0, pal, false, 0, null, .3, z0); return; }
  const f = t - DIVE.stand;
  if (f < DIVE.fall) {
    const z = z0 + 2 * f - 4.25 * f * f;
    if (z > 0) blit(SPRITES.diver, 0, y0 + f * 1.4, pal, false, 0, null, .3, Math.max(0, z));
    return;
  }
  // the splash: two rings spreading on the water and a few drops thrown up
  const s = f - DIVE.fall, at = y0 + DIVE.fall * 1.4;
  if (s > 1.6) return;
  for (const [r, c] of [[.3 + s * 1.6, rgb(220, 240, 230)], [.1 + s * .9, rgb(180, 220, 206)]]) {
    for (let a = 0; a < 6.283; a += .2) {
      const p = project(Math.cos(a) * r, at + Math.sin(a) * r, 0), ix = p.sx | 0, iy = p.sy | 0;
      if (ix >= 0 && iy >= 0 && ix < W && iy < H && kinds[iy * W + ix] === KIND_WATER) pix[iy * W + ix] = c;
    }
  }
  if (s < .6) for (let k = 0; k < 8; k++) {
    const a = k / 8 * 6.283, h = Math.sin(s / .6 * Math.PI) * (.6 + hash(k, 5) * .5);
    const p = project(Math.cos(a) * .5, at + Math.sin(a) * .5, h), ix = p.sx | 0, iy = p.sy | 0;
    if (ix >= 0 && iy >= 0 && ix < W && iy < H) { pix[iy * W + ix] = rgb(236, 248, 244); zb[iy * W + ix] = 1e6; }
  }
}
function mostarBuild() {
  for (let k = 0; k < 30; k++) {
    const y = -8 + 16 * hash(k, 21), side = k % 2 ? 1 : -1, r = .3 + hash(k, 22) * .55;
    if (Math.abs(y) < 1.6) continue;
    const x = side * (riverHalf(y) + (hash(k, 23) - .3) * 1);
    sphere(x, y, r * .28, r, MO_STONE, 'rough');
    castShadow(x, y, r * .6, r * .9);
  }
  const before = new Float32Array(zb);
  moBridge();
  for (let i = 0; i < W * H; i++) if (zb[i] !== before[i]) flood[i] = 1;
  moSquareTower(-10.6, -1.6, -8.8, 1.6, 8.2);
  moRoundTower(9.7, 0, 1.5, 7.5);
  moHouse(-11.4, -6.2, -9.2, -3.6, 2.6, MO_SLATE, 20, { x: -10.6, y: -4.4, top: 4.6 });
  moHouse(-11.2, 3.4, -9, 5.8, 2.9, MO_TILE, 30);
  moHouse(8.6, -6.4, 10.8, -3.8, 2.8, MO_TILE, 40);
  moHouse(9, 3.6, 11.2, 5.8, 2.5, MO_SLATE, 80);
  moMosque(-8.2, -7.3);
  minaret(-6.8, -7.9, .68);
  const season = (currentStyle.leaves || {})[look.season] || look.season;
  growSeasonTree(-10.4, 7.2, .5, season, 500);
  growSeasonTree(8.1, -7.6, .55, season, 900);
  growSeasonTree(12, -1.9, .45, season, 1300);
  for (const side of [-1, 1]) streetLamp({ x: side * 7.7, y: .7, z: MO.DECK_LOW + 2.2 }, MO.DECK_LOW);
}
const MOSTAR_LAYOUT = {
  lift: 28, ground: mostarGround, build: mostarBuild, water: mostarWater, extra: mostarDiver,
  lamps: [{ x: -7.7, y: .7, z: MO.DECK_LOW + 2.2, base: MO.DECK_LOW }, { x: 7.7, y: .7, z: MO.DECK_LOW + 2.2, base: MO.DECK_LOW }],
  cafe: null, chimney: { x: -10.6, y: -4.4, top: 4.6 }, snowman: { x: 7.6, y: 6.6 }, kid: { x: -7.6, y: 3 }, sitter: null, cup: null,
  pigeons: [[-7.4, -2.6, 0], [-6.9, -2.9, 1.7], [7.2, 2.6, 3.1]], tree: { x: 8.1, y: -7.6 },
  inside: (x, y) => (Math.abs(x) / MO.X) ** 4 + (Math.abs(y) / MO.Y) ** 4 < .9,
  paths: [
    { pts: [[-8.3, 0], [8.3, 0]], lanes: .9, z: x => moDeckZ(x), share: .62 },
    { pts: [[-7.1, -7.4], [-7.1, -1.9]], lanes: .5, share: .1 },
    { pts: [[-7.1, 1.9], [-7.1, 7]], lanes: .5, share: .1 },
    { pts: [[7.1, -7.2], [7.1, -1.9]], lanes: .5, share: .09 },
    { pts: [[7.1, 1.9], [7.1, 7.2]], lanes: .5, share: .09 },
  ],
};

registerCity('mostar', { name: 'Mostar', country: 'Bosnia and Herzegovina', at: [43.3438, 17.8078], native: 'Мостар', layout: MOSTAR_LAYOUT, tree: { x: 4.1, y: -4.1, scale: .66 } });
