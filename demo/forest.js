'use strict';
/* ------------------------------------------------------------------
 * 翠绿小树林生成器
 * 参考图：一片阔叶树林，树冠圆润、互相重叠，树干细而深，地面草地
 *
 * 生成规则见 docs/forest-rules.md
 * ------------------------------------------------------------------ */

const RX = 18, RY = 15;
const SOIL_H = 1.2;

const GRASS = [[58, 96, 56], [80, 120, 60], [104, 142, 68], [132, 160, 78]];
const DIRT = [120, 92, 66];

/* 从暗到亮的 5 档绿；rampOf 会在每档内部再生成明暗 */
const PALETTES = {
  fresh: [[40, 88, 48], [60, 112, 54], [86, 138, 62], [116, 162, 74], [148, 186, 90]],
  deep: [[28, 66, 38], [42, 88, 44], [58, 108, 50], [80, 128, 58], [108, 150, 72]],
  autumn: [[78, 54, 32], [112, 76, 40], [146, 104, 46], [176, 136, 56], [198, 168, 74]],
};

const params = { count: 76, crown: 1, seed: 7, palette: 'fresh' };

const rnd = (a, b) => hash(a * .731 + params.seed * 1.37, b * 1.913);
const islandE = (x, y) => Math.pow(
  Math.pow(Math.abs(x) / RX, 4) + Math.pow(Math.abs(y) / RY, 4), .25
);

/* ---------------- 地面 ---------------- */

function groundColor(x, y, ix, iy) {
  const e = islandE(x, y);
  if (e > 1) return 0;
  const fine = hash(ix, iy);

  if (e > .955) {
    if (e > .988 && fine < .5) return 0;
    const t = noise(x * 2.1, y * 2.1);
    const ramp = rampOf(DIRT);
    return ramp[clamp(Math.floor(1.6 + t * 2 + (bayerAt(ix, iy) - .5) * .6), 0, 4)];
  }

  const t = noise(x * 1.1, y * 1.1) * 1.0 + (fine - .5) * .55 - .04;
  return rgb(...GRASS[clamp(Math.floor(t * 3.6), 0, 3)]);
}

function bakeSoil() {
  const drop = SOIL_H * COS * S;
  for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
    const g = unproject(ix + .5, iy + .5 + drop);
    const e = islandE(g.x, g.y);
    if (e > 1) continue;
    if (e > .97 && hash(ix, iy) < .35) continue;
    const t = noise(g.x * 3.2, iy * .18);
    const ramp = rampOf([110, 84, 60]);
    pix[iy * W + ix] = ramp[clamp(Math.floor(.8 + t * 1.8 + (bayerAt(ix, iy) - .5) * .5), 0, 4)];
  }
}

function scatterGrass() {
  for (let n = 0; n < 2600; n++) {
    const x = (hash(n, 21) - .5) * 2 * RX;
    const y = (hash(n, 22) - .5) * 2 * RY;
    if (islandE(x, y) > .9) continue;
    const p = project(x, y, 0);
    const ix = p.sx | 0, iy = p.sy | 0;
    if (ix < 1 || iy < 4 || ix >= W - 1 || iy >= H - 1) continue;
    const i = iy * W + ix;
    if (!ground[i] || zb[i] !== groundZ[i]) continue;
    const h = 1 + (hash(n, 23) * 3 | 0);
    const c = hash(n, 24) > .8 ? GRASS[3] : hash(n, 24) > .4 ? GRASS[2] : GRASS[1];
    for (let k = 1; k <= h; k++) {
      const j = (iy - k) * W + ix;
      if (!ground[j] || zb[j] !== groundZ[j]) break;
      pix[j] = rgb(...c);
    }
  }
}

/* ---------------- 树 ---------------- */

function placeTrees() {
  const list = [];
  const minD = 1.15;
  const maxTries = params.count * 140;

  for (let n = 0; list.length < params.count && n < maxTries; n++) {
    const a = rnd(n, 1) * 6.283;
    const r = Math.sqrt(rnd(n, 2)) * .86;
    const x = Math.cos(a) * RX * r;
    const y = Math.sin(a) * RY * r;
    if (islandE(x, y) > .84) continue;

    let ok = true;
    for (const t of list) {
      if (Math.hypot(t.x - x, t.y - y) < minD) { ok = false; break; }
    }
    if (!ok) continue;

    // 前排（y 大）略大，制造纵深
    const depth = (y + RY) / (2 * RY);
    const size = (.86 + depth * .3) * (.9 + rnd(n, 3) * .28);

    list.push({
      x, y, size, depth,
      h: (2.2 + rnd(n, 4) * .9) * size,
      crown: (1.3 + rnd(n, 5) * .45) * size * params.crown,
      leanX: (rnd(n, 6) - .5) * .35,
      leanY: (rnd(n, 7) - .5) * .35,
      seed: n + params.seed * 1000,
    });
  }
  return list.sort((a, b) => a.y - b.y);
}

function drawTree(t) {
  const bark = () => [78, 62, 52];
  const bx = t.x + t.leanX, by = t.y + t.leanY;

  // 主干 + 两根分叉，参考图里树干细、颜色深
  capsule([t.x, t.y, 0], [bx, by, t.h * .55], .17 * t.size, .1 * t.size, bark, 'rough');
  capsule([bx, by, t.h * .55], [bx + t.leanX * .9, by + t.leanY * .9, t.h * .8], .09 * t.size, .05 * t.size, bark, 'rough');
  capsule([bx, by, t.h * .55], [bx - .3 * t.size, by + .18 * t.size, t.h * .74], .06 * t.size, .04 * t.size, bark, 'rough');

  const cz = t.h * .78;
  const pal = PALETTES[params.palette];

  // 内层：少量大球，先把树冠填成连续体块
  for (let k = 0; k < 8; k++) {
    const s = t.seed + 500 + k;
    const a = rnd(s, 11) * 6.283;
    const d = Math.cbrt(rnd(s, 12)) * t.crown * .55;
    const rx = t.x + Math.cos(a) * d;
    const ry = t.y + Math.sin(a) * d;
    const rz = cz - t.crown * .12 + (rnd(s, 13) - .5) * t.crown * .3;
    sphere(rx, ry, rz, t.crown * (.5 + rnd(s, 14) * .18), pal[1], 'rough');
  }

  // 表层：小球做轮廓、亮部和叶簇
  const n = clamp(Math.round(26 * t.crown * t.crown), 26, 64);
  for (let k = 0; k < n; k++) {
    const s = t.seed + k;
    const a = rnd(s, 21) * 6.283;
    const tilt = rnd(s, 22) * 2 - 1;
    const d = Math.cbrt(rnd(s, 23)) * t.crown;
    const flat = Math.sqrt(1 - tilt * tilt);

    const rx = t.x + Math.cos(a) * flat * d * 1.1;
    const ry = t.y + Math.sin(a) * flat * d * 1.1;
    const rz = cz + tilt * d * .52;

    const tone = .08 + rnd(s, 24) * .4 + (tilt * .5 + .5) * .48;
    const idx = clamp(Math.floor(tone * 4.999), 0, 4);
    const radius = (.3 + rnd(s, 25) * .2) * t.size;

    sphere(rx, ry, rz, radius, pal[idx], 'rough');
  }
}

/* ---------------- 烘焙 ---------------- */

function bakeForest() {
  zb.fill(-1e9);
  pix.fill(rgb(255, 255, 255));
  ground.fill(0);
  shadowMask.fill(0);
  bakeSoil();

  for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
    const g = unproject(ix + .5, iy + .5);
    const c = groundColor(g.x, g.y, ix, iy);
    if (!c) continue;
    const i = iy * W + ix;
    pix[i] = c;
    ground[i] = 1;
    zb[i] = (g.x + g.y) / R2 * COS;
  }
  groundZ.set(zb);
  scatterGrass();

  const trees = placeTrees();
  for (const t of trees) drawTree(t);

  for (const t of trees) {
    castShadow(t.x + t.leanX * .5, t.y + t.leanY * .5, t.h * .5, t.crown * 1.15, 1, .55);
    castShadow(t.x, t.y, 0, .2 * t.size, 2, 0);
  }
  applyShadows(groundZ);

  bakedPix.set(pix);
  bakedZ.set(zb);
  ctx.putImageData(image, 0, 0);
  return trees.length;
}

/* ---------------- 控制面板 ---------------- */

function rebuild() {
  const n = bakeForest();
  document.getElementById('trees').textContent = n;
}

function bindPanel() {
  const count = document.getElementById('count');
  const crown = document.getElementById('crown');
  const palette = document.getElementById('palette');
  const trees = document.getElementById('trees');

  const sync = () => {
    params.count = +count.value;
    params.crown = +crown.value;
    params.palette = palette.value;
    document.getElementById('countV').textContent = count.value;
    document.getElementById('crownV').textContent = (+crown.value).toFixed(2);
  };

  const schedule = () => {
    sync();
    if (schedule.pending) return;
    schedule.pending = true;
    requestAnimationFrame(() => {
      schedule.pending = false;
      rebuild();
    });
  };

  count.addEventListener('input', schedule);
  crown.addEventListener('input', schedule);
  palette.addEventListener('change', schedule);
  document.getElementById('regen').addEventListener('click', () => {
    params.seed = (Math.random() * 100000) | 0;
    sync();
    rebuild();
  });

  count.value = params.count;
  crown.value = params.crown;
  palette.value = params.palette;
  document.getElementById('countV').textContent = params.count;
  document.getElementById('crownV').textContent = params.crown.toFixed(2);
  trees.textContent = '…';
}

fit();
bindPanel();
rebuild();
addEventListener('resize', fit);
