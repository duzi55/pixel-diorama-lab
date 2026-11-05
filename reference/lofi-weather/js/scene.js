'use strict';
/* ---------- the place: one small square that every city's weather plays over ---------- */
const ISLAND = 9, SOIL = 2.4;
const HOUSE = { x0: -8.4, x1: -2.6, y0: -8.4, y1: -3.6, h: 4.4 };
const BED = { x0: 2.2, x1: 8.4, y0: -8.4, y1: -2.2 };
const TREE = { x: 5.3, y: -5.3 };
const LAMP_AT = { x: -1.3, y: -2.5, z: 3.75 };
const CHIMNEY = { x: -3.8, y: -6.8, top: 7.2 };
const SNOWMAN = { x: .6, y: 7.9 };
const WALK_LOOP = [[-6.8, .2], [2.6, .2], [2.6, 6.4], [-6.8, 6.4]];
// where life happens on the generic square; a city scene brings its own layout with the same fields
const GENERIC_LAYOUT = {
  lift: 18, lamps: [{ x: -1.3, y: -2.5, z: 3.75, base: 0 }], cafe: { x: -5, y: -2.4 }, chimney: CHIMNEY,
  snowman: SNOWMAN, kid: { x: .8, y: 3.6 }, sitter: { x: -5.95, y: -2.2 }, cup: { x: -5.15, y: -2.25 },
  pigeons: [[3.9, -.5, 0], [4.7, -.2, 1.7], [3.3, .3, 3.1]], inside: (x, y) => Math.abs(x) < ISLAND && Math.abs(y) < ISLAND,
  paths: [{ pts: WALK_LOOP, closed: true, lanes: 1.8, share: 1 }],
};
let SC = GENERIC_LAYOUT;
const PAVE = [200, 188, 168], CURB = [176, 168, 156], EARTH = [132, 100, 72], PLASTER = [228, 208, 178], PLINTH = [150, 138, 124];
const TILE = [176, 88, 62], FRAME = rgb(78, 64, 56), GLASS = rgb(58, 62, 74), DOOR = rgb(92, 64, 48), IRON = [58, 58, 64];
const WOOD = [150, 108, 72], AWNING = [[196, 74, 62], [240, 228, 206]], PLANT = [92, 128, 72], POT = [178, 98, 66];
const CAFE_WINDOW = 1, LAMP_GLASS = 2; // emit ids; upper windows count up from 10
const SEASON_LEAVES = {
  spring: [[92, 130, 74], [150, 178, 96], [244, 196, 206]],
  summer: [[58, 84, 62], [100, 126, 78], [146, 162, 112]],
  autumn: [[150, 70, 40], [206, 120, 48], [236, 182, 72]],
  winter: [[118, 90, 64], [140, 104, 70], [160, 120, 80]],
  sakura: [[214, 136, 160], [238, 174, 196], [252, 214, 226]],
};
const PALM_BARK = [128, 104, 80], PALM_RING = [96, 76, 60], PALM = [[38, 88, 58], [70, 128, 62], [132, 168, 72]];

const noShadowPix = new Uint32Array(W * H), shadowPix = new Uint32Array(W * H);
const flood = new Uint8Array(W * H), up = new Uint8Array(W * H), emit = new Uint8Array(W * H), puddle = new Float32Array(W * H), lampPool = new Float32Array(W * H), cafePool = new Float32Array(W * H);
const st = () => .45 / S;
const level = (ramp, v, ix, iy) => ramp[clamp(Math.floor(v + (bayerAt(ix, iy) - .5) * .7), 0, 4)];
let look = { season: 'autumn', tropical: false, city: 'generic' }; // what the bake was made for

/* ---------- city scenes: the same square, dressed for the place ---------- */
const PROP_WARM = 3, NEON = 4, VENDING = 5, KIND_WATER = 4;
const emitZ = new Float32Array(W * H);
const GENERIC = { wall: 'plaster', wallColor: PLASTER, roof: 'gable', roofColor: TILE, awning: AWNING, bed: 'grass', tree: { x: 5.3, y: -5.3, scale: .95 } };
// every hand-drawn city lives in its own file in js/cities/ and registers itself with one call at the end.
// A searched place within 60 km of a registered city gets that city's scene; anywhere else gets the generic square.
const CITY_STYLES = {}, QUICK = [], NATIVE = {};
function registerCity(id, { name, country, at, native, layout, ...style }) {
  CITY_STYLES[id] = { ...style, at, layout };
  QUICK.push({ name, country, latitude: at[0], longitude: at[1] });
  if (native) NATIVE[id] = native;
}
let currentStyle = GENERIC;
const sceneStyle = () => currentStyle;
function km(place, [lat, lon]) {
  const r = Math.PI / 180, a = Math.sin((lat - place.latitude) * r / 2) ** 2 + Math.cos(lat * r) * Math.cos(place.latitude * r) * Math.sin((lon - place.longitude) * r / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}
// a searched place gets a city's scene when it lies within reach of that city
function cityFor(place) {
  let best = 'generic', bestKm = 60;
  if (place) for (const [id, s] of Object.entries(CITY_STYLES)) {
    const d = km(place, s.at);
    if (d < bestKm) { best = id; bestKm = d; }
  }
  return best;
}
function bedColor(bed, x, y, ix, iy, i) {
  if (bed === 'sand') return level(rampOf([226, 200, 154]), 2.7 + Math.sin((x + y * .4) * 3.2 + noise(x, y) * 2) * .5, ix, iy);
  if (bed === 'gravel') {
    const raked = ((y * 3.2 + Math.sin(x * .6) * .4) % 1 + 1) % 1 < .3;
    return level(rampOf([210, 208, 200]), 2.8 + (raked ? -.7 : 0) + (hash(ix, iy) - .5) * .6, ix, iy);
  }
  if (bed === 'lava') {
    if (noise(x * .9, y * .9) > .56) { kinds[i] = KIND_GRASS; return level(rampOf([104, 128, 72]), 2.4 + noise(x * 3, y * 3), ix, iy); }
    return level(rampOf([78, 70, 68]), 2 + hash(ix, iy) * 1.4, ix, iy);
  }
  if (bed === 'water') {
    kinds[i] = KIND_WATER;
    return level(rampOf([66, 118, 156]), 2.3 + noise(x * .8 + y * .3, y * 1.6) * 1.2, ix, iy);
  }
  return 0;
}
function plotLit(x, y, z, c, id) {
  const p = project(x, y, z), ix = p.sx | 0, iy = p.sy | 0;
  if (ix < 0 || iy < 0 || ix >= W || iy >= H || p.d <= zb[iy * W + ix]) return;
  plot(x, y, z, c);
  emit[iy * W + ix] = id;
  emitZ[iy * W + ix] = p.d;
}
function onFace(face, a, z) { return face.axis === 'x' ? [face.at, a, z] : [a, face.at, z]; }
// walls carry the city's material: brick courses, rubble stone, corrugated iron or plain plaster
function wallTone(a, z, base, ix, iy) {
  const s = sceneStyle(), ramp = rampOf(s.wallColor);
  if (s.wall === 'brick') {
    const row = Math.floor(z / .22), fa = a / .5 + (row % 2) * .5, col = Math.floor(fa);
    if (z / .22 - row < .17 || fa - col < .09) return rampOf(s.mortar || [196, 188, 176])[clamp(Math.round(base), 0, 4)];
    return level(ramp, base + (hash(col, row) - .5) * .9, ix, iy);
  }
  if (s.wall === 'stone') {
    const row = Math.floor(z / .36), fa = a / (.55 + hash(row, 3) * .35) + hash(row, 1), col = Math.floor(fa);
    const mortar = z / .36 - row < .11 || fa - col < .07;
    return level(ramp, base - (mortar ? 1.2 : 0) + (hash(col, row) - .5) * 1.2, ix, iy);
  }
  if (s.wall === 'corrugated') {
    const rib = ((a * 5) % 1 + 1) % 1;
    return level(ramp, base + (rib < .3 ? .6 : rib < .45 ? -.7 : 0), ix, iy);
  }
  return level(ramp, base + (hash(a * 9 | 0, z * 9 | 0) > .93 ? -.6 : 0), ix, iy);
}
function faceWall(face, a0, a1, z0, zTop, base) {
  for (let a = a0; a <= a1; a += st()) {
    const top = typeof zTop === 'function' ? zTop(a) : zTop;
    for (let z = z0; z <= top; z += st()) {
      const [x, y] = onFace(face, a, z), p = project(x, y, z);
      plot(x, y, z, wallTone(a, z, base, p.sx | 0, p.sy | 0));
    }
  }
}
// round things: shaded so the +y side reads like a box's front face and the +x side like its side face
function cylinder(x, y, z0, z1, r, color, bands = 0) {
  const ramp = rampOf(color);
  for (let a = 0; a < 6.283; a += st() / r) for (let z = z0; z <= z1; z += st()) {
    const X = x + Math.cos(a) * r, Y = y + Math.sin(a) * r, p = project(X, Y, z);
    const band = bands && ((z - z0) / bands) % 1 < .14;
    plot(X, Y, z, level(ramp, 2 + .7 * Math.sin(a) - .5 * Math.cos(a) - (band ? .8 : 0), p.sx | 0, p.sy | 0));
  }
}
function disc(x, y, z, r, color, lvl = 3.3) {
  const ramp = rampOf(color);
  for (let a = 0; a < 6.283; a += st() / Math.max(r, .1)) for (let q = 0; q <= r; q += st()) {
    const X = x + Math.cos(a) * q, Y = y + Math.sin(a) * q, p = project(X, Y, z);
    plot(X, Y, z, level(ramp, lvl - (q > r - .06 ? .8 : 0), p.sx | 0, p.sy | 0));
  }
}
function shadowColumn(x, y, z1, r) { for (let z = .3; z < z1; z += .4) castShadow(x, y, z, r, 1, .2); }

function minaret(x, y, k = 1) {
  const WHITE = [232, 224, 206], LEAD = [104, 110, 124];
  box(x - .75 * k, y - .75 * k, 0, x + .75 * k, y + .75 * k, 1.3 * k, WHITE, 61);
  cylinder(x, y, 1.3 * k, 6.5 * k, .46 * k, WHITE, 1.1 * k);
  disc(x, y, 6.5 * k, .8 * k, WHITE);
  for (let a = 0; a < 6.283; a += .45) capsule([x + Math.cos(a) * .76 * k, y + Math.sin(a) * .76 * k, 6.5 * k], [x + Math.cos(a) * .76 * k, y + Math.sin(a) * .76 * k, 6.85 * k], .03, .03, () => WHITE, 'solid');
  for (let a = 0; a < 6.283; a += .02) plot(x + Math.cos(a) * .77 * k, y + Math.sin(a) * .77 * k, 6.87 * k, rampOf(WHITE)[3]);
  cylinder(x, y, 6.5 * k, 8.3 * k, .36 * k, WHITE);
  capsule([x, y, 8.3 * k], [x, y, 10.5 * k], .44 * k, .02, () => LEAD, 'solid');
  sphere(x, y, 10.6 * k, .08, [226, 196, 96], 'solid');
  shadowColumn(x, y, 10 * k, .5 * k);
}
function phoneBox(x, y) {
  const RED = [196, 40, 36];
  box(x - .5, y - .5, 0, x + .5, y + .5, 2.35, RED, 71);
  box(x - .57, y - .57, 2.35, x + .57, y + .57, 2.58, RED, 72);
  capsule([x, y, 2.58], [x, y, 2.66], .4, .28, () => RED, 'solid');
  for (const face of [{ axis: 'y', at: y + .52 }, { axis: 'x', at: x + .52 }]) {
    const mid = face.axis === 'y' ? x : y;
    pane(face, mid - .36, mid + .36, .7, 2.0, GLASS, PROP_WARM);
    for (let a = mid - .36; a <= mid + .36; a += st()) for (let z = 2.1; z <= 2.28; z += st()) plotLit(...onFace({ ...face, at: face.at + .01 }, a, z), rgb(240, 236, 226), PROP_WARM);
  }
  shadowColumn(x, y, 2.6, .55);
}
function postBox(x, y) {
  const RED = [196, 40, 36];
  cylinder(x, y, 0, 1.1, .3, RED);
  capsule([x, y, 1.1], [x, y, 1.22], .34, .24, () => RED, 'solid');
  for (let a = -.13; a <= .13; a += st()) for (const z of [.9, .93, .96]) plot(x + a, y + .31, z, rgb(34, 28, 28));
  shadowColumn(x, y, 1.2, .35);
}
function sunVoyager(x, y) {
  const STEEL = [200, 208, 218];
  box(x - 2.7, y - .9, 0, x + 2.7, y + .9, .32, [92, 90, 96], 91);
  const keel = t => [x + t * 2.3, y, .55 + 1.2 * Math.abs(t) ** 3];
  for (let k = 0; k < 20; k++) capsule(keel(-1 + k / 10), keel(-1 + (k + 1) / 10), .07, .07, () => STEEL, 'solid');
  for (let k = -4; k <= 4; k++) {
    const t = k / 5, base = keel(t), h = .7 + (1 - Math.abs(t)) * .35;
    for (const side of [-1, 1]) capsule(base, [base[0] + t * .25, y + side * .55, base[2] + h], .05, .035, () => STEEL, 'solid');
  }
  for (const side of [-1, 1]) capsule(keel(side), [x + side * 2.95, y, 2.7], .05, .02, () => STEEL, 'solid');
  for (let t = -1; t <= 1; t += .1) castShadow(...keel(t), .35, 1, .2);
}
function hydrant(x, y) {
  const RED = [190, 48, 40];
  cylinder(x, y, 0, .7, .17, RED);
  capsule([x, y, .7], [x, y, .82], .2, .1, () => RED, 'solid');
  for (const [dx, dy] of [[.2, 0], [0, .2]]) sphere(x + dx, y + dy, .48, .08, RED, 'solid');
  castShadow(x, y, .4, .22);
}
function waterTower(x, y, z0) {
  const WOODT = [138, 102, 74], IRONT = [70, 70, 76];
  for (const [ox, oy] of [[-.6, -.6], [.6, -.6], [-.6, .6], [.6, .6]]) capsule([x + ox, y + oy, z0], [x + ox * .9, y + oy * .9, z0 + 1.3], .06, .06, () => IRONT, 'solid');
  disc(x, y, z0 + 1.3, 1, IRONT, 2);
  cylinder(x, y, z0 + 1.3, z0 + 3, .95, WOODT, .42);
  capsule([x, y, z0 + 3], [x, y, z0 + 3.9], 1.02, .04, () => [92, 86, 84], 'solid');
  sphere(x, y, z0 + 3.95, .08, IRONT, 'solid');
}
function torii(x, y) {
  const RED = [208, 62, 44], BLACK = [36, 34, 38];
  for (const dy of [-1.3, 1.3]) {
    capsule([x, y + dy, .3], [x, y + dy, 3.1], .16, .13, () => RED, 'solid');
    box(x - .2, y + dy - .2, 0, x + .2, y + dy + .2, .32, BLACK, 81);
    shadowColumn(x, y + dy, 3, .2);
  }
  box(x - .12, y - 1.75, 2.4, x + .12, y + 1.75, 2.62, RED, 82);
  box(x - .1, y - .14, 2.62, x + .1, y + .14, 3.02, RED, 83);
  box(x - .22, y - 2.05, 3.02, x + .22, y + 2.05, 3.24, RED, 84);
  for (let s = -2.4; s <= 2.4; s += st()) for (let w = -.3; w <= .3; w += st()) for (let k = 0; k < 3; k++) {
    plot(x + w, y + s, 3.24 + k * .06 + (Math.abs(s) / 2.4) ** 4 * .35, rampOf(BLACK)[w > 0 ? 3 : 1]);
  }
  for (let s = -2.2; s <= 2.2; s += .4) castShadow(x, y + s, 3.2, .35, 1, .2);
}
function vending(x, y, body) {
  box(x - .48, y - .38, 0, x + .48, y + .38, 1.95, body, 85);
  const at = y + .4, cans = [[226, 74, 60], [70, 132, 196], [240, 196, 70], [96, 170, 110], [232, 232, 236]];
  for (let row = 0; row < 3; row++) for (let n = 0; n < 5; n++) {
    const c = rgb(...cans[(row * 2 + n) % 5]), cx = x - .34 + n * .17, cz = 1.15 + row * .24;
    for (let a = -.05; a <= .05; a += st()) for (let z = 0; z <= .15; z += st()) plotLit(cx + a, at, cz + z, c, VENDING);
  }
  for (let a = x - .4; a <= x + .4; a += st()) for (let z = 1.05; z <= 1.9; z += st()) {
    const p = project(a, at - .01, z);
    if (p.sx >= 0 && p.sy >= 0 && p.sx < W && p.sy < H && emit[(p.sy | 0) * W + (p.sx | 0)] !== VENDING) plotLit(a, at - .01, z, rgb(232, 236, 240), VENDING);
  }
  for (let a = x - .25; a <= x + .25; a += st()) for (let z = .25; z <= .45; z += st()) plot(a, at, z, rgb(36, 36, 40));
  shadowColumn(x, y, 1.9, .5);
}
function windTower(x, y, z0) {
  const SANDW = [226, 202, 162];
  box(x - .6, y - .6, z0, x + .6, y + .6, z0 + 2.3, SANDW, 101);
  box(x - .72, y - .72, z0 + 2.3, x + .72, y + .72, z0 + 2.48, SANDW, 102);
  for (const face of [{ axis: 'y', at: y + .62 }, { axis: 'x', at: x + .62 }]) for (const c of [-.32, 0, .32]) {
    const mid = (face.axis === 'y' ? x : y) + c;
    for (let a = mid - .07; a <= mid + .07; a += st()) for (let z = z0 + 1.2; z <= z0 + 2.1; z += st()) plot(...onFace(face, a, z), rgb(84, 66, 54));
  }
  for (let z = z0 + .3; z < z0 + 2.4; z += .4) castShadow(x, y, z, .7, 1, .2);
}
function supertree(x, y) {
  const STEEL = [146, 92, 150], GREEN = [80, 124, 70];
  capsule([x, y, 0], [x, y, 4.4], .5, .34, () => STEEL, 'rough');
  for (let k = 0; k < 90; k++) {
    const z = .3 + hash(k, 4) * 4, a = hash(k, 5) * 6.283, r = lerp(.5, .34, z / 4.4);
    sphere(x + Math.cos(a) * r, y + Math.sin(a) * r, z, .15 + hash(k, 6) * .08, hash(k, 7) > .82 ? [200, 96, 146] : GREEN, 'rough');
  }
  for (let n = 0; n < 16; n++) {
    const a = n / 16 * 6.283;
    capsule([x + Math.cos(a) * .3, y + Math.sin(a) * .3, 4.2], [x + Math.cos(a) * 2.2, y + Math.sin(a) * 2.2, 6.4], .07, .05, () => STEEL, 'solid');
  }
  for (const [z, r] of [[5.25, 1.2], [6.4, 2.2]]) for (let a = 0; a < 6.283; a += .02) {
    const X = x + Math.cos(a) * r, Y = y + Math.sin(a) * r;
    plot(X, Y, z, rampOf(STEEL)[2]);
    if (z > 6 && Math.floor(a * 12) % 2 === 0) plotLit(X, Y, z + .06, rgb(200, 130, 220), NEON);
  }
  for (let a = 0; a < 6.283; a += .5) castShadow(x + Math.cos(a) * 1.5, y + Math.sin(a) * 1.5, 6, .45, 1, .3);
  shadowColumn(x, y, 4.4, .45);
}
// one shell of the opera house: two tiled faces meeting at a crisp ridge that rises to a pointed tip,
// with a bronze glass wall closing the mouth under the tip. The faces are shaded apart so the shells
// read as separate forms instead of one white mass.
function shell(bx, by, dir, len, h, w, over) {
  const [dx, dy] = dir, px = -dy, py = dx, white = rampOf([246, 242, 232]);
  const ridge = u => {
    const a = len * u + over * u ** 3;
    return [bx + dx * a, by + dy * a, .6 + h * Math.sin(u * Math.PI / 2) ** .85];
  };
  const foot = (u, side) => {
    // the lower edge sweeps up towards the tip, so each shell is a crescent sail, not a wall
    const a = len * u * .82, s = side * w * Math.pow(u, .55);
    return [bx + dx * a + px * s, by + dy * a + py * s, .6 + h * .62 * u ** 1.7];
  };
  const point = (u, t, side) => {
    const r = ridge(u), g = foot(u, side), bulge = Math.sin(t * Math.PI) * .22 * w * Math.pow(u, .55);
    return [lerp(r[0], g[0], t) + px * side * bulge, lerp(r[1], g[1], t) + py * side * bulge, lerp(r[2], g[2], t) + Math.sin(t * Math.PI) * .12 * h];
  };
  const step = st() * .5;
  for (const side of [-1, 1]) {
    const nx = px * side, ny = py * side; // which way this face looks, for its shade
    for (let u = 0; u <= 1; u += step / (len + h * .6)) {
      const r = ridge(u), g = foot(u, side), n = Math.max(2, Math.ceil(Math.hypot(r[0] - g[0], r[1] - g[1], r[2] - g[2]) / step));
      for (let k = 0; k <= n; k++) {
        const t = k / n, [X, Y, Z] = point(u, t, side);
        const rib = ((u * 8) % 1) < .09 && t > .06;
        // bright at the tip and along the ridge, falling into shadow at the back where the previous shell overlaps
        const shade = t < .05 ? 4.3 : 1.3 + .9 * ny - .7 * nx + .9 * (1 - t) + 1.3 * u - (rib ? .7 : 0);
        plot(X, Y, Z, white[clamp(Math.floor(shade), 0, 4)]); // flat bands: dither turned the white shells to noise
      }
    }
  }
  // bronze glass fills the space under each sail, set back a little, so the white shells stand out against it
  for (const side of [-1, 1]) for (let u = 0; u <= 1; u += step / len) {
    const g = foot(u, side), gx = g[0] - px * side * .12, gy = g[1] - py * side * .12;
    for (let z = .6; z < g[2]; z += step) {
      const mullion = ((u * 10) % 1) < .12;
      plotLit(gx, gy, z, mullion ? rgb(70, 56, 46) : rgb(150, 104, 62), mullion ? 0 : PROP_WARM);
    }
  }
  for (let u = 0; u <= 1; u += .1) { const r = ridge(u); castShadow(r[0], r[1], r[2] * .7, w * .8 * Math.pow(u, .55) + .3, 1, .2); }
}
function opera(x, y, k = 1) {
  // a broad stepped podium of pink granite
  box(x - 2.8 * k, y - 2.6 * k, 0, x + 2.8 * k, y + 2.6 * k, .35, [196, 166, 142], 111);
  box(x - 2.5 * k, y - 2.3 * k, .35, x + 2.5 * k, y + 2.3 * k, .6, [214, 186, 158], 112);
  const d = [Math.SQRT1_2, -Math.SQRT1_2], back = [-d[0], -d[1]], side = [Math.SQRT1_2, Math.SQRT1_2];
  // the big hall: three shells rising towards the harbour end; the small hall beside it faces the other way
  for (const [n, len, h, w] of [[0, 1.7, 2.2, .95], [1, 1.9, 3, 1.1], [2, 2, 3.7, 1.2]]) {
    shell(x + (d[0] * (n * 1.25 - 2.2) + side[0] * .55) * k, y + (d[1] * (n * 1.25 - 2.2) + side[1] * .55) * k, d, len * k, h * k, w * k, .5 * k);
  }
  for (const [n, len, h, w] of [[0, 1.3, 1.7, .7], [1, 1.5, 2.3, .8]]) {
    shell(x + (back[0] * (n - 1.3) - side[0] * 1.35) * k, y + (back[1] * (n - 1.3) - side[1] * 1.35) * k, back, len * k, h * k, w * k, .35 * k);
  }
}

function groundColor(x, y, ix, iy, i) {
  if (Math.abs(x) > ISLAND || Math.abs(y) > ISLAND) return 0;
  if (x > BED.x0 && x < BED.x1 && y > BED.y0 && y < BED.y1) {
    const edge = Math.min(x - BED.x0, BED.x1 - x, y - BED.y0, BED.y1 - y);
    if (edge < .22) return level(rampOf(CURB), 3.2, ix, iy);
    const bed = sceneStyle().bed;
    if (bed !== 'grass') return bedColor(bed, x, y, ix, iy, i);
    kinds[i] = KIND_GRASS;
    const tone = look.season === 'winter' && !look.tropical ? [112, 116, 70] : GRASS[2];
    if (look.season === 'autumn' && hash(ix * 3, iy * 7) > .93 - noise(x * .6, y * .6) * .1) return rgb(...SEASON_LEAVES.autumn[hash(ix, iy) * 3 | 0]);
    return level(rampOf(tone), 2.2 + noise(x * .7, y * .9) * 1.6, ix, iy);
  }
  // paving slabs in staggered rows, each its own tone
  const fx = x / 1.5, row = Math.floor(fx), fy = y / 1.5 + (row % 2) * .5, col = Math.floor(fy);
  const ramp = rampOf(PAVE);
  if (fx - row < .07 || fy - col < .07) return ramp[1];
  if (look.season === 'autumn' && !look.tropical && sceneStyle().tree && Math.hypot(x - TREE.x, y - TREE.y) < 6.5 && hash(ix * 5, iy * 3) > .965) return rgb(...SEASON_LEAVES.autumn[hash(iy, ix) * 3 | 0]);
  const fine = hash(ix, iy);
  if (fine > .98) return ramp[4];
  return ramp[clamp(Math.floor(2.4 + hash(row, col) * 1.4 + (bayerAt(ix, iy) - .5) * .5), 2, 4)];
}
// the square is a slab of ground that crumbles away into the sky below
function islandSides() {
  const step = st();
  const side = (a, z, base) => {
    const fade = (-z - (SOIL - 1.2)) / 1.2;
    if (fade > 0 && hash(a * 23 | 0, z * 23 | 0) < fade) return null;
    if (z > -.32) return rampOf(CURB)[clamp(base + (z > -.05 ? 1 : 0), 0, 4)];
    const pebble = hash(a * 6 | 0, z * 6 | 0) > .9;
    return rampOf(pebble ? CURB : EARTH)[clamp(base - (Math.floor(-z * 3) % 3 === 0 ? 1 : 0), 0, 4)];
  };
  for (let a = -ISLAND; a <= ISLAND; a += step) for (let z = 0; z >= -SOIL; z -= step) {
    const c1 = side(a, z, 2); if (c1) plot(a, ISLAND, z, c1);
    const c2 = side(a + 50, z, 1); if (c2) plot(ISLAND, a, z, c2);
  }
}
function roof(x0, x1, ym, half, zBase, rise, color) {
  const ramp = rampOf(color);
  for (let x = x0; x <= x1; x += st()) for (let s = -half; s <= half; s += st()) {
    const z = zBase + rise * (1 - Math.abs(s) / half), p = project(x, ym + s, z);
    const course = (Math.abs(s) * 2.4) % 1 < .16, joint = ((x + (Math.floor(Math.abs(s) * 2.4) % 2) * .3) * 1.7) % 1 < .1;
    plot(x, ym + s, z, level(ramp, (s > 0 ? 3.2 : 1.8) - (course ? .9 : 0) - (joint ? .5 : 0) + (noise(x * 2, s * 4) - .5) * .5, p.sx | 0, p.sy | 0));
  }
}
// a window or door on a face; glass pixels remember which light they belong to
function pane(face, a0, a1, z0, z1, glass, id, bars = true) {
  for (let a = a0; a <= a1; a += st()) for (let z = z0; z <= z1; z += st()) {
    const border = a - a0 < .08 || a1 - a < .08 || z - z0 < .08 || z1 - z < .08;
    const mullion = bars && (Math.abs(a - (a0 + a1) / 2) < .035 || Math.abs(z - (z0 + z1) / 2) < .035);
    const x = face.axis === 'x' ? face.at : a, y = face.axis === 'x' ? a : face.at;
    const p = project(x, y, z), ix = p.sx | 0, iy = p.sy | 0;
    if (ix < 0 || iy < 0 || ix >= W || iy >= H || p.d <= zb[iy * W + ix]) continue;
    plot(x, y, z, border || mullion ? FRAME : glass);
    emit[iy * W + ix] = border || mullion ? 0 : id;
    emitZ[iy * W + ix] = p.d;
  }
}
function buildHouse() {
  const { x0, x1, y0, y1, h } = HOUSE, style = sceneStyle(), ym = (y0 + y1) / 2, half = (y1 - y0) / 2;
  const gable = style.roof === 'gable', rise = 2.3 * half / (half + .45);
  box(x0 - .08, y0 - .08, 0, x1 + .08, y1 + .08, .45, PLINTH, 3);
  box(x0, y0, .45, x1, y1, h, style.wallColor, 11);
  faceWall({ axis: 'y', at: y1 + .01 }, x0, x1, .45, h, 2.3);
  faceWall({ axis: 'x', at: x1 + .01 }, y0, y1, .45, h, 1.4);
  if (gable) {
    roof(x0 - .35, x1 + .35, ym, half + .45, h - .1, 2.3, style.roofColor);
    faceWall({ axis: 'x', at: x1 + .01 }, y0, y1, h, a => h + rise * (1 - Math.abs(a - ym) / half), 1.5);
  } else {
    // a flat roof behind a low parapet
    for (const [a0, b0, a1, b1] of [[x0, y0, x1, y0 + .2], [x0, y1 - .2, x1, y1], [x0, y0, x0 + .2, y1], [x1 - .2, y0, x1, y1]]) box(a0, b0, h, a1, b1, h + .35, style.wallColor, 12);
  }
  CHIMNEY.top = gable ? 7.2 : h + 1.5;
  if (style.chimney !== false) {
    box(CHIMNEY.x - .45, CHIMNEY.y - .45, h, CHIMNEY.x + .45, CHIMNEY.y + .45, CHIMNEY.top - .2, PLINTH, 14);
    box(CHIMNEY.x - .55, CHIMNEY.y - .55, CHIMNEY.top - .2, CHIMNEY.x + .55, CHIMNEY.y + .55, CHIMNEY.top, PLINTH, 15);
    castShadow(CHIMNEY.x, CHIMNEY.y, CHIMNEY.top, .6);
  }
  if (style.roofProp) style.roofProp(h);
  const front = { axis: 'y', at: y1 + .02 }, side = { axis: 'x', at: x1 + .02 };
  // ground floor: the café door and its wide window; upstairs: flats with their own lights
  pane(front, -8.0, -7.1, .45, 2.4, DOOR, 0, false);
  pane(front, -6.6, -3.4, .8, 2.35, GLASS, CAFE_WINDOW);
  pane(front, -7.7, -6.8, 2.95, 3.95, GLASS, 10);
  pane(front, -5.4, -4.5, 2.95, 3.95, GLASS, 11);
  pane(front, -4.0, -3.1, 2.95, 3.95, GLASS, 12);
  pane(side, -5.4, -4.5, .9, 2.3, GLASS, 13);
  pane(side, -7.3, -6.4, 2.95, 3.95, GLASS, 14);
  pane(side, -5.4, -4.5, 2.95, 3.95, GLASS, 15);
  if (gable) pane(side, -6.25, -5.75, 4.7, 5.3, GLASS, 16, false);
  // striped awning over the café window, with a scalloped valance
  const awning = style.awning;
  for (let a = -6.85; a <= -3.15; a += st()) for (let s = 0; s <= 1.15; s += st()) {
    const p = project(a, y1 + s, 2.75 - s * .5), stripe = Math.floor((a + 7) * 2.6) % 2;
    plot(a, y1 + s, 2.75 - s * .5, level(rampOf(awning[stripe]), 3.1 - s * .4, p.sx | 0, p.sy | 0));
  }
  for (let a = -6.85; a <= -3.15; a += st()) {
    const stripe = Math.floor((a + 7) * 2.6) % 2, drop = .22 + .08 * Math.cos((a + 7) * 2.6 * 6.283);
    for (let z = 0; z <= drop; z += st()) plot(a, y1 + 1.15, 2.2 - z, rampOf(awning[stripe])[2]);
  }
  for (let a = -6.8; a <= -3.2; a += .4) castShadow(a, y1 + .6, 2.4, .45, 1, .2);
  // a sign over the door
  box(-8.15, y1 + .02, 2.55, -6.95, y1 + .12, 2.95, WOOD, 21);
  for (let x = x0; x <= x1; x += .45) for (let y = y0; y <= y1; y += .45) for (let z = .4; z <= h + (gable ? 1.6 : .3); z += .6) castShadow(x, y, z, .4, 1, .3);
}
function buildFurniture() {
  // the café table and two chairs under the awning
  const tx = -5, ty = -2.2;
  capsule([tx, ty, 0], [tx, ty, .95], .06, .06, () => IRON, 'solid');
  for (let a = 0; a < 6.283; a += .05) for (let r = 0; r < .55; r += st()) plot(tx + Math.cos(a) * r, ty + Math.sin(a) * r, 1, rampOf([226, 222, 212])[r > .48 ? 2 : 3]);
  castShadow(tx, ty, .9, .55);
  for (const dx of [-.95, .95]) {
    box(tx + dx - .26, ty - .26, .5, tx + dx + .26, ty + .26, .58, WOOD, 30);
    for (const [ox, oy] of [[-.2, -.2], [.2, -.2], [-.2, .2], [.2, .2]]) capsule([tx + dx + ox, ty + oy, 0], [tx + dx + ox, ty + oy, .5], .035, .035, () => IRON, 'solid');
    const back = dx < 0 ? -.26 : .26;
    box(tx + dx + back - .04, ty - .26, .58, tx + dx + back + .04, ty + .26, 1.2, WOOD, 31);
    castShadow(tx + dx, ty, .6, .35);
  }
  streetLamp(LAMP_AT, 0);
  // a bench facing the square, by the tree bed
  for (let k = 0; k < 3; k++) box(3.4, -1.75 + k * .16, .42, 5.6, -1.64 + k * .16, .5, WOOD, 40 + k);
  box(3.4, -1.84, .55, 5.6, -1.74, 1.05, WOOD, 44);
  for (const x of [3.6, 5.4]) box(x - .05, -1.8, 0, x + .05, -1.3, .42, IRON, 45);
  for (let x = 3.4; x <= 5.6; x += .4) castShadow(x, -1.55, .5, .35, 1, .2);
  // planters along the front edge
  for (const [x, y, r] of [[-7.6, 7.8, .55], [7.8, 7.6, .55], [7.8, 1.2, .45]]) {
    box(x - r, y - r, 0, x + r, y + r, r * 1.3, POT, x * 7 | 0);
    for (let k = 0; k < 18; k++) {
      const a = hash(k, x * 3) * 6.28, d = hash(k, y * 5) * r * .9;
      sphere(x + Math.cos(a) * d, y + Math.sin(a) * d, r * 1.6 + hash(k, 9) * r * .9, .2, PLANT, 'rough');
    }
    castShadow(x, y, r, r);
  }
}
function growSeasonTree(x, y, scale, season, seed) {
  const bark = () => BARK;
  const bare = season === 'winter';
  capsule([x, y, 0], [x + .3 * scale, y + .1 * scale, 2.2 * scale], .36 * scale, .22 * scale, bark, 'rough');
  const limbs = [[-.8, -.4, 3.3], [1.2, .4, 3.4], [.1, 1, 3.6], [.4, -1, 3.8], [-.2, .2, 4.6]];
  for (const [lx, ly, lz] of limbs) {
    const end = [x + lx * scale, y + ly * scale, lz * scale];
    capsule([x + .3 * scale, y + .1 * scale, 2.2 * scale], end, .18 * scale, .1 * scale, bark, 'rough');
    if (bare) for (let k = 0; k < 4; k++) {
      const a = hash(k, lx * 9) * 6.28;
      capsule(end, [end[0] + Math.cos(a) * .9 * scale, end[1] + Math.sin(a) * .9 * scale, end[2] + (.3 + hash(k, ly * 7) * .7) * scale], .07 * scale, .04 * scale, bark, 'rough');
    }
  }
  const palette = SEASON_LEAVES[season], count = bare ? 26 : 430;
  for (let n = 0; n < count; n++) {
    const k = n + seed, [cx, cy, cz, spread] = CROWN[n % CROWN.length];
    const a = hash(k, 7) * 6.283, tilt = hash(k, 8) * 2 - 1, d = Math.cbrt(hash(k, 9)) * spread, flat = Math.sqrt(1 - tilt * tilt);
    const rx = cx + Math.cos(a) * flat * d, ry = cy + Math.sin(a) * flat * d, rz = cz + tilt * d * .8;
    const tone = hash(k, 10) + (rz - 4.2) * .22 + (d / spread - .5) * .3;
    const leaf = palette[tone > .72 ? 2 : tone > .3 ? 1 : 0];
    capture = [];
    sphere(x + rx * scale, y + ry * scale, rz * scale, (bare ? .14 : .2 + hash(k, 11) * .22) * scale, leaf, 'rough');
    leaves.push({ x: x + rx * scale, y: y + ry * scale, z: rz * scale, k, r: .42 * scale, pixels: capture });
    capture = null;
  }
}
function growPalm(x, y, scale, seed) {
  const height = 5.6 * scale, turn = hash(seed, 1) * 6.283;
  const leanX = Math.cos(turn) * 1.1 * scale, leanY = Math.sin(turn) * 1.1 * scale;
  const trunkAt = t => [x + leanX * t * t, y + leanY * t * t, height * t];
  for (let k = 0; k < 7; k++) {
    capsule(trunkAt(k / 7), trunkAt((k + 1) / 7), lerp(.3, .17, k / 7) * scale, lerp(.3, .17, (k + 1) / 7) * scale, z => (Math.floor(z * 3.4) % 2 ? PALM_BARK : PALM_RING), 'rough');
    const q = trunkAt(k / 7);
    castShadow(q[0], q[1], q[2], .24 * scale);
  }
  const top = trunkAt(1);
  for (let f = 0; f < 10; f++) {
    const angle = f / 10 * 6.283 + hash(seed, f) * .5, length = (2.7 + hash(seed, f + 20) * .9) * scale;
    const fx = Math.cos(angle), fy = Math.sin(angle), rise = .9 + hash(seed, f + 40) * .8;
    for (let n = 1; n <= 11; n++) {
      const u = n / 11, along = length * u, drop = top[2] + scale * (rise * u - 2.4 * u * u), width = .42 * scale * (1 - u * .55);
      for (const sd of [-1, 0, 1]) {
        const k = seed * 1000 + f * 40 + n * 3 + sd + 1, tone = hash(k, 3) + (sd ? 0 : .35) - u * .2;
        const lx = top[0] + fx * along - fy * width * sd, ly = top[1] + fy * along + fx * width * sd;
        capture = [];
        sphere(lx, ly, drop - (sd ? .22 * scale : 0), (sd ? .15 : .12) * scale, PALM[tone > .85 ? 2 : tone > .35 ? 1 : 0], 'rough');
        leaves.push({ x: lx, y: ly, z: drop, k, r: .26 * scale, pixels: capture });
        capture = null;
      }
    }
  }
}
function streetLamp(at, base) {
  capsule([at.x, at.y, base], [at.x, at.y, at.z - .2], .09, .07, () => IRON, 'solid');
  capsule([at.x, at.y, base], [at.x, at.y, base + .35], .17, .13, () => IRON, 'solid');
  for (let z = base + .4; z < at.z; z += .3) castShadow(at.x, at.y, z, .1, 1, 0);
  for (let a = 0; a < 6.283; a += .04) for (let z = -.3; z <= .3; z += st()) {
    const r = .22 - Math.abs(z) * .2;
    plotLit(at.x + Math.cos(a) * r, at.y + Math.sin(a) * r, at.z + z, GLASS, LAMP_GLASS);
  }
  sphere(at.x, at.y, at.z + .38, .2, IRON, 'solid');
  sphere(at.x, at.y, at.z + .58, .08, IRON, 'solid');
}
