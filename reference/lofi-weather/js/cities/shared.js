'use strict';
/* ---------- shared pieces for the city scenes ---------- */
// a rounded slab of land that frays into the sky; returns false outside it
function onIsland(x, y, ix, iy, X, Y) {
  const edge = Math.pow(Math.pow(Math.abs(x) / X, 4) + Math.pow(Math.abs(y) / Y, 4), .25) + (noise(x * 1.3, y * 1.3) - .5) * .1;
  if (edge > 1.03) return false;
  return !(edge > .94 && hash(ix, iy) < (edge - .94) / .09);
}
const islandInside = (X, Y) => (x, y) => (Math.abs(x) / X) ** 4 + (Math.abs(y) / Y) ** 4 < .9;
function slabs(x, y, ix, iy, color, size = 1.2) {
  const fx = x / size, fy = y / size, row = Math.floor(fy), col = Math.floor(fx);
  if (fx - col < .06 || fy - row < .06) return rampOf(color)[1];
  return rampOf(color)[clamp(Math.floor(2.6 + hash(col, row) * 1.3 + (bayerAt(ix, iy) - .5) * .4), 2, 4)];
}
const asphalt = (x, y, ix, iy) => level(rampOf([86, 88, 96]), 2.3 + noise(x * 2, y * 2) * .7 + (hash(ix, iy) > .975 ? .8 : 0), ix, iy);
// brick or stone courses on a face
function courses(face, a0, a1, z0, z1, color, base, brick = true) {
  for (let a = a0; a <= a1; a += st()) for (let z = z0; z <= z1; z += st()) {
    const row = Math.floor(z / (brick ? .2 : .42)), fa = a / (brick ? .45 : .8) + (row % 2) * .5, col = Math.floor(fa);
    const joint = z / (brick ? .2 : .42) - row < .16 || fa - col < .08;
    const [x, y] = onFace(face, a, z), p = project(x, y, z);
    plot(x, y, z, joint ? rampOf(color)[clamp(Math.round(base) + 1, 0, 4)] : level(rampOf(color), base + (hash(col, row) - .5) * .8, p.sx | 0, p.sy | 0));
  }
}
// a city block: walls with a material, a grid of windows (each its own light), an optional lit shopfront
function block(x0, y0, x1, y1, h, color, o = {}) {
  box(x0, y0, 0, x1, y1, h, color, o.seed || 300);
  const front = { axis: 'y', at: y1 + .01 }, side = { axis: 'x', at: x1 + .01 };
  if (o.brick !== undefined) { courses(front, x0, x1, 0, h, color, 2.3, o.brick); courses(side, y0, y1, 0, h, color, 1.4, o.brick); }
  const fr = { axis: 'y', at: y1 + .02 }, sd = { axis: 'x', at: x1 + .02 }, ww = o.ww || .26, wh = o.wh || .45, gap = o.gap || .9, floor = o.floor || 1.05;
  const start = o.shop ? 2.2 : .9;
  for (let z = start, row = 0; z + wh < h - .3; z += floor, row++) {
    for (let c = x0 + gap * .7, col = 0; c + ww < x1 - .1; c += gap, col++) pane(fr, c - ww, c + ww, z, z + wh, GLASS, 20 + ((o.id || 0) + row * 5 + col * 3) % 200, false);
    for (let c = y0 + gap * .7; c + ww < y1 - .1; c += gap) pane(sd, c - ww, c + ww, z, z + wh, GLASS, 20 + ((o.id || 0) + row * 7 + Math.round(c * 3)) % 200, false);
  }
  if (o.shop) for (let a = x0 + .2; a <= x1 - .2; a += st()) for (let z = .1; z <= 1.7; z += st()) {
    const mull = ((a - x0) % 1.2) < .06 || z > 1.62;
    plotLit(a, fr.at + .01, z, mull ? rgb(50, 46, 48) : rgb(...mix3(o.shop, [60, 56, 54], .5)), mull ? 0 : PROP_WARM);
  }
  for (let x = x0; x <= x1; x += .55) for (let y = y0; y <= y1; y += .55) for (let z = .3; z <= h; z += .75) castShadow(x, y, z, .5);
}
// a vehicle drawn each frame: body, a band of windows that light up after dark, wheels
function vehicle(x, y, len, wid, h, color, rows = 1) {
  const lit = V.night > .45, x0 = x - len / 2, x1 = x + len / 2;
  box(x0, y - wid / 2, .32, x1, y + wid / 2, h, color, 400);
  for (let r = 0; r < rows; r++) {
    const z0 = .32 + (h - .32) * (r + .55) / (rows + .4), z1 = z0 + (h - .32) * .32 / rows;
    for (let a = x0 + .25; a <= x1 - .25; a += st()) for (let z = z0; z <= z1; z += st()) {
      if (((a - x0) % .62) < .1) continue;
      plot(a, y + wid / 2 + .01, z, lit ? rgb(255, 230, 160) : rgb(54, 62, 76));
    }
  }
  for (const dx of [-len * .32, len * .32]) sphere(x + dx, y + wid / 2 - .1, .28, .28, [30, 30, 34], 'solid');
  castShadow(x, y, h * .5, wid * .7, 1, .2);
}
// traffic loops along a road; vehicles only appear while fully on the land
function traffic(lanes, X) {
  for (const { y, speed, len, offset, draw } of lanes) {
    const span = 2 * X + 10, x = ((L.time * speed + offset) % span + span) % span - X - 5;
    const pos = speed > 0 ? x : -x;
    if (Math.abs(pos) + len / 2 > X - 1.2) continue;
    draw(pos, y);
  }
}
function steamFrom(x, y, count = 8) {
  const c = rgb(236, 236, 240);
  for (let k = 0; k < count; k++) {
    const t = (L.time * .5 + k / count) % 1, q = project(x + Math.sin(t * 5 + k) * .3 + V.windX * t * 1.2, y + V.windY * t * 1.2, t * 3);
    const r = 1 + t * 3;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const ix = (q.sx + dx) | 0, iy = (q.sy + dy) | 0;
      if (ix < 0 || iy < 0 || ix >= W || iy >= H || dx * dx + dy * dy > r * r || bayerAt(ix, iy) > (1 - t) * .6) continue;
      if (q.d < zb[iy * W + ix]) continue;
      pix[iy * W + ix] = c;
    }
  }
}
