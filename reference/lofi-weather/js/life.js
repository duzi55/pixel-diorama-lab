'use strict';
/* ---------- life on the square ---------- */
const COAT = { shirt: [64, 84, 112], stripe: [64, 84, 112], legs: [52, 52, 62], hair: [70, 52, 40], skin: [214, 164, 128], shoe: [48, 40, 36] };
const TEE = { shirt: [236, 224, 196], stripe: [216, 120, 96], legs: [92, 112, 140], hair: [70, 52, 40], skin: [214, 164, 128] };
const PARKA = { shirt: [176, 66, 56], stripe: [176, 66, 56], legs: [48, 48, 58], hair: [70, 52, 40], skin: [214, 164, 128], shoe: [48, 40, 36], hat: [52, 56, 72] };
const READER = { shirt: [116, 132, 92], stripe: [116, 132, 92], legs: [70, 62, 56], hair: [160, 150, 140], skin: [222, 176, 140], shoe: [60, 50, 44] };
const UMBRELLA = [[52, 60, 92], [196, 74, 62]];
const loopLength = WALK_LOOP.reduce((d, p, k) => d + Math.hypot(p[0] - WALK_LOOP[(k + 1) % 4][0], p[1] - WALK_LOOP[(k + 1) % 4][1]), 0);
function onLoop(dist) {
  let d = ((dist % loopLength) + loopLength) % loopLength;
  for (let k = 0; k < 4; k++) {
    const a = WALK_LOOP[k], b = WALK_LOOP[(k + 1) % 4], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d <= len) return { x: lerp(a[0], b[0], d / len), y: lerp(a[1], b[1], d / len), yaw: Math.atan2(b[1] - a[1], b[0] - a[0]) };
    d -= len;
  }
  return { x: WALK_LOOP[0][0], y: WALK_LOOP[0][1], yaw: 0 };
}
const L = { walk: 0, time: 0, windClock: 0, windT: 0, windFrame: -1, flash: 0, boltIn: 4, bolt: null };
const drops = [], flakes = [], splashes = [], puffs = [], flying = [];
let puffIn = 0;
function drawWalker() {
  const rainy = V.rain + V.drizzle > .25, hurry = V.rain > .6 || V.snow > .7;
  const p = onLoop(L.walk), t = L.walk * (hurry ? 3.2 : 4.2);
  const look = V.temp < 3 ? PARKA : V.temp > 24 ? TEE : COAT;
  const pose = { scale: .95, stance: .16 + Math.sin(t) * .24, armR: rainy ? 2.4 : .15 + Math.sin(t) * .25, armL: .15 - Math.sin(t) * .25, lean: hurry ? .16 : 0 };
  const hand = figure(p.x, p.y, p.yaw, pose, look, dynamicAdd);
  if (!rainy) return;
  // an umbrella over the head, tilted into the wind
  const cx = hand[0] - V.windX * .25, cy = hand[1] - V.windY * .25, cz = hand[2] + .75;
  capsule(hand, [cx, cy, cz], .03, .03, () => IRON, 'solid');
  for (let r = .1; r <= .95; r += .14) for (let a = 0; a < 6.283; a += .5 / (r * 3 + 1)) {
    const color = UMBRELLA[Math.floor(a / 6.283 * 8) % 2];
    sphere(cx + Math.cos(a) * r, cy + Math.sin(a) * r, cz - .38 * r * r, .13, color, 'solid');
  }
  castShadow(cx, cy, cz, .9, 1, .2);
}
function drawReader() {
  // someone takes a coffee outside only when it is dry, light and mild
  if (V.rain + V.drizzle + V.snow > .15 || V.night > .7 || V.temp < 8) return;
  const hand = figure(-5.95, -2.2, 0, { scale: .9, crouch: 1, stance: .05, armR: 1.35, armL: 1.2 }, READER, dynamicAdd);
  sphere(-5.05, -2.25, 1.08, .09, [240, 236, 226], 'solid');
  return hand;
}
function drawSnowman() {
  if (V.cover < .5 || look.tropical || !SC.snowman) return;
  const snow = [236, 240, 248], { x, y } = SC.snowman, k = clamp((V.cover - .5) * 4, 0, 1);
  sphere(x, y, .5 * k, .6 * k, snow, 'solid');
  sphere(x, y, 1.3 * k, .42 * k, snow, 'solid');
  sphere(x, y, 1.92 * k, .3 * k, snow, 'solid');
  if (k < .9) return;
  capsule([x + .2, y + .2, 1.92], [x + .52, y + .5, 1.88], .06, .02, () => [232, 128, 52], 'solid');
  for (const o of [-.12, .12]) sphere(x + .18 + o, y + .24 - o, 2.02, .045, [30, 30, 36], 'solid');
  capsule([x - .4, y, 1.4], [x - .95, y - .2, 1.85], .04, .03, () => BARK, 'solid');
  capsule([x + .4, y, 1.4], [x + .9, y + .1, 1.9], .04, .03, () => BARK, 'solid');
}
function updateLife(dt) {
  const hurry = V.rain > .6 || V.snow > .7;
  L.walk += dt * (hurry ? 1.9 : 1.05);
  L.time += dt;
  L.windClock += dt * (.35 + V.wind / 4.5);
  const frame = Math.floor(L.time * WIND_FPS);
  if (frame !== L.windFrame) { L.windFrame = frame; L.windT = STILL ? 0 : L.windClock; }
  // rain: drops fall through the scene, slanted by the wind, and burst where they land
  const drift = V.wind * .55;
  const wantDrops = Math.floor(V.rain * 620 + V.drizzle * 260);
  while (drops.length < wantDrops) drops.push(newDrop(true));
  if (drops.length > wantDrops) drops.length = wantDrops;
  for (let k = 0; k < drops.length; k++) {
    const d = drops[k];
    d.z -= d.speed * dt; d.x += V.windX * drift * dt; d.y += V.windY * drift * dt;
    if (d.z <= 0) {
      if (SC.inside(d.x, d.y)) splashes.push({ x: d.x, y: d.y, life: .14 });
      drops[k] = newDrop(false);
    }
  }
  for (const s of splashes) s.life -= dt;
  while (splashes.length && splashes[0].life <= 0) splashes.shift();
  // snow: slow flakes that wander and drift sideways
  const wantFlakes = Math.floor(V.snow * 700);
  while (flakes.length < wantFlakes) flakes.push(newFlake(true));
  if (flakes.length > wantFlakes) flakes.length = wantFlakes;
  for (let k = 0; k < flakes.length; k++) {
    const f = flakes[k];
    f.z -= f.speed * dt;
    f.x += (V.windX * drift * .7 + Math.sin(L.time * 1.3 + f.seed * 6) * .35) * dt;
    f.y += (V.windY * drift * .7 + Math.cos(L.time * 1.1 + f.seed * 4) * .35) * dt;
    if (f.z <= 0) flakes[k] = newFlake(false);
  }
  // chimney smoke when it is cold, bent over by the wind
  if (SC.chimney && V.smoke > .05 && (puffIn -= dt) <= 0) {
    puffIn = .32 / V.smoke;
    puffs.push({ x: SC.chimney.x, y: SC.chimney.y, z: SC.chimney.top + .1, age: 0, seed: Math.random() });
  }
  for (const p of puffs) {
    p.age += dt;
    p.z += (.75 - Math.min(V.wind, 12) * .04) * dt;
    p.x += V.windX * (.25 + V.wind * .22) * dt;
    p.y += V.windY * (.25 + V.wind * .22) * dt;
  }
  while (puffs.length && puffs[0].age > 4.5) puffs.shift();
  // a strong wind lifts leaves off the tree and carries them across the square
  const wantLeaves = look.tropical || !(currentStyle.tree || SC.tree) ? 0 : Math.floor(clamp((V.wind - 5) * 4, 0, 36) * (look.season === 'winter' ? .2 : 1));
  while (flying.length < wantLeaves) flying.push(newLeaf());
  if (flying.length > wantLeaves) flying.length = wantLeaves;
  for (let k = 0; k < flying.length; k++) {
    const f = flying[k], speed = V.wind * .5;
    f.x += V.windX * speed * dt; f.y += V.windY * speed * dt;
    f.z = Math.max(.05, f.z + Math.sin(L.time * 3 + f.seed * 9) * dt * 1.2 - dt * .25);
    if (Math.abs(f.x) > ISLAND + 3 || Math.abs(f.y) > ISLAND + 3) flying[k] = newLeaf();
  }
  // storms: lightning at uneven intervals
  L.flash = Math.max(0, L.flash - dt * 3);
  if (L.bolt && L.flash < .35) L.bolt = null;
  if (V.storm > .5 && (L.boltIn -= dt) <= 0) { L.boltIn = 3 + Math.random() * 6; strike(); }
}
function newDrop(anywhere) {
  const drizzle = V.drizzle > V.rain;
  return { x: (Math.random() - .5) * 26, y: (Math.random() - .5) * 26, z: anywhere ? Math.random() * 15 : 13 + Math.random() * 3, speed: drizzle ? 15 : 24 + Math.random() * 6, short: drizzle, seed: Math.random() };
}
function newFlake(anywhere) {
  return { x: (Math.random() - .5) * 26, y: (Math.random() - .5) * 26, z: anywhere ? Math.random() * 15 : 13 + Math.random() * 3, speed: 1.6 + Math.random() * 1.2, seed: Math.random(), big: Math.random() < .25 };
}
function newLeaf() {
  return { x: TREE.x + (Math.random() - .5) * 3 - V.windX * 4, y: TREE.y + (Math.random() - .5) * 3 - V.windY * 4, z: 1 + Math.random() * 3, seed: Math.random() };
}
function strike() {
  L.flash = 1;
  const x0 = Math.random() < .5 ? 30 + Math.random() * 70 : 250 + Math.random() * 80;
  const points = [[x0, 0]];
  let x = x0, y = 0;
  while (y < 120) { x += (Math.random() - .5) * 20; y += 8 + Math.random() * 12; points.push([x, y]); }
  L.bolt = points;
  sound('thunder');
}

/* ---------- people: hand-drawn pixel sprites, a small crowd, or nobody at all ---------- */
const PEOPLE_MODES = ['sprites', 'crowd', 'none', 'rig'];
let people = 'crowd';
const SPRITES = {
  walkA: [
    '....kkk....', '...khhhk...', '..khhhhhk..', '..khhssSk..', '..khssssk..', '...kssSk...',
    '..kkcccckk.', '.kccccccCk.', '.kccccccCk.', '.ksccccCsk.', '.ksccccCsk.', '..kcccccCk.',
    '..kcccccCk.', '..kpppPPk..', '..kppkPPk..', '..kppkPPk..', '..kppkPPk..', '..kbbkbbk..',
  ],
  walkB: [
    '....kkk....', '...khhhk...', '..khhhhhk..', '..khhssSk..', '..khssssk..', '...kssSk...',
    '..kkcccckk.', '.kccccccCk.', '.kccccccCk.', '.ksccccCsk.', '.ksccccCsk.', '..kcccccCk.',
    '..kcccccCk.', '..kpppPPk..', '.kppk.kPPk.', '.kppk..kPk.', 'kppk...kPPk', 'kbbk...kbbk',
  ],
  umbrella: [
    '.....kkkkk.....', '...kkuuuuukk...', '..kuuuUuuUuuk..', '.kuuuuUuuuUuuk.', 'kUUkUUkUUkUUkUk',
    '.......k.......', '.......k.......', '.......k.......', '.......k.......', '.......k.......',
    '.......k.......', '.......k.......', '.......k.......', '.......k.......',
  ],
  sit: [
    '...kkk.....', '..khhhk....', '.khhhhhk...', '.kSsshhk...', '.kssshhk...', '..kSssk....',
    '.kkccccck..', 'kwkccccCCk.', 'kwsccccCCk.', '.kkkcccCCk.', '...kccccCk.', '.kppppppPk.',
    '.kppppppPk.', '.kpk.......', '.kpk.......', '.kbbk......',
  ],
  kid: [
    '..kkkk..', '.kyyyyk.', 'kyyyyyyk', 'kyykssyk', 'kyysssyk', '.kyyyyk.',
    'kyyyyyYk', 'kyyyyyYk', 'ksyyyYsk', '.kyyyYk.', '.kBk.kBk', '.kBk.kBk',
  ],
  pigeonA: ['.kk....', 'kgrk...', '.kgggkk', '.kgGGGk', '..k.k..'],
  pigeonB: ['.......', '.......', 'kkgggkk', 'krgGGGk', '..k.k..'],
  miniA: ['.kkk.', '.khk.', '.ksk.', 'kccck', 'kccck', 'kccck', '.kpk.', '.kpk.', '.kpk.', '.kbk.'],
  miniB: ['.kkk.', '.khk.', '.ksk.', 'kccck', 'kccck', 'kccck', '.kpk.', 'kp.pk', 'kp.pk', 'kb.bk'],
  miniUmb: ['..kkk..', '.kuuuk.', 'kuUuUuk', '...k...', '...k...'],
  diver: [
    '.k.....k.', 'ksk...ksk', 'ksk.k.ksk', '.kskhksk.', '..khhhk..', '..khssk..', '..kssSk..', '..kssSk..', '.kssssSk.',
    '.kssssSk.', '..kssSk..', '..kRRRk..', '..kRRRk..', '..kssSk..', '..kskSk..', '..kskSk..', '..kskSk..', '..kbkbk..',
  ],
};
const BASE_PAL = {
  k: [40, 34, 42], h: [72, 50, 38], s: [228, 180, 144], S: [196, 142, 112], p: [56, 56, 70], P: [42, 42, 54], b: [30, 28, 32],
  w: [244, 240, 230], y: [240, 198, 62], Y: [200, 150, 40], B: [196, 60, 52], g: [168, 168, 178], G: [116, 116, 128], r: [104, 152, 132],
};
const COATS = [[[64, 84, 120], [46, 60, 90]], [[196, 140, 60], [150, 100, 44]], [[178, 70, 60], [130, 48, 44]], [[86, 120, 84], [60, 88, 60]], [[120, 120, 128], [88, 88, 96]], [[228, 220, 200], [184, 174, 156]]];
const UMBRELLAS = [[[200, 64, 56], [150, 44, 40]], [[44, 60, 104], [30, 42, 76]], [[236, 196, 70], [190, 150, 40]], [[30, 30, 34], [20, 20, 24]]];
function palette(coat, umbrella, hair) {
  const pal = {};
  for (const [ch, c] of Object.entries(BASE_PAL)) pal[ch] = rgb(...c);
  pal.c = rgb(...coat[0]); pal.C = rgb(...coat[1]);
  if (umbrella) { pal.u = rgb(...umbrella[0]); pal.U = rgb(...umbrella[1]); }
  if (hair) pal.h = rgb(...hair);
  return pal;
}
// stamp a sprite with its feet on a world point; it hides behind anything nearer than that point
function blit(rows, x, y, pal, flip, lift = 0, at = null, bias = 0, z = 0) {
  const p = project(x, y, z), h = rows.length, w = rows[0].length;
  const left = at ? at.left : Math.round(p.sx - w / 2), top = at ? at.top : Math.round(p.sy) - h + 1 - lift;
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const col = pal[rows[r][flip ? w - 1 - c : c]];
    if (!col) continue;
    const ix = left + c, iy = top + r;
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
    const i = iy * W + ix;
    if (p.d + bias < zb[i] - .05) continue;
    pix[i] = col;
    zb[i] = p.d;
  }
  return { left, top, w, h, d: p.d };
}
function contact(x, y, r) {
  const p = project(x, y, 0), rx = r * S, ry = rx * .45;
  for (let iy = Math.max(0, p.sy - ry | 0); iy <= p.sy + ry && iy < H; iy++) for (let ix = Math.max(0, p.sx - rx | 0); ix <= p.sx + rx && ix < W; ix++) {
    const dx = (ix + .5 - p.sx) / rx, dy = (iy + .5 - p.sy) / ry, i = iy * W + ix;
    if (dx * dx + dy * dy <= 1 && zb[i] === groundZ[i]) tint(i, .7, .68, .8);
  }
}
const facingRight = yaw => Math.cos(yaw) - Math.sin(yaw) > 0; // screen x grows with x - y
const coatFor = () => (V.temp < 3 ? COATS[2] : V.temp > 24 ? COATS[5] : COATS[0]);
// walk along a scene path: round and round a closed loop, back and forth along an open one
function pathPoint(path, d) {
  if (!path.segs) {
    path.segs = [];
    path.total = 0;
    const n = path.closed ? path.pts.length : path.pts.length - 1;
    for (let k = 0; k < n; k++) {
      const a = path.pts[k], b = path.pts[(k + 1) % path.pts.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      path.segs.push([a, b, len]);
      path.total += len;
    }
  }
  const span = path.closed ? path.total : path.total * 2;
  let t = ((d % span) + span) % span, back = false;
  if (!path.closed && t > path.total) { t = span - t; back = true; }
  for (const [a, b, len] of path.segs) {
    if (t <= len) return { x: lerp(a[0], b[0], t / len), y: lerp(a[1], b[1], t / len), yaw: Math.atan2(b[1] - a[1], b[0] - a[0]) + (back ? Math.PI : 0) };
    t -= len;
  }
  const [a] = path.segs[0];
  return { x: a[0], y: a[1], yaw: 0 };
}
function drawPeople() {
  if (people === 'rig') { drawReader(); drawWalker(); return; }
  const rainy = V.rain + V.drizzle > .25, dry = V.rain + V.drizzle + V.snow < .15;
  if (people === 'crowd') return drawCrowd(rainy);
  if (people === 'none' || people === 'sprites') drawPigeons(dry);
  if (people === 'none') return drawCup(dry);
  // the walker: a coat for the weather, an umbrella when it rains, a quicker step when it pours
  const path = SC.paths[0], p = pathPoint(path, L.walk), z = path.z ? path.z(p.x, p.y) : 0;
  const right = facingRight(p.yaw), frame = Math.floor(L.walk * (V.rain > .6 ? 3.2 : 2.4)) % 2;
  if (!z) contact(p.x, p.y, .35);
  const fig = blit(frame ? SPRITES.walkB : SPRITES.walkA, p.x, p.y, palette(coatFor(), UMBRELLAS[0]), !right, 0, null, 0, z);
  if (rainy) blit(SPRITES.umbrella, p.x, p.y, palette(coatFor(), UMBRELLAS[0]), false, 0, { left: fig.left + (right ? 8 : 2) - 7, top: fig.top - 4 }, 0, z);
  // a reader with coffee under the awning when it is dry, light and mild
  if (SC.sitter && dry && V.night < .7 && V.temp >= 8) {
    contact(SC.sitter.x, SC.sitter.y, .3);
    const s = blit(SPRITES.sit, SC.sitter.x, SC.sitter.y, palette(COATS[3], null, [150, 140, 130]), true, 0, null, 1.2); // sits in the chair, in front of its back
    steam(s.left + s.w - 2, s.top + 6);
  }
  // a kid in a raincoat jumping in the puddles, or standing proudly by the snowman
  if (rainy) {
    const hop = Math.abs(Math.sin(L.time * 4.2)), lift = Math.round(hop * 5);
    contact(SC.kid.x, SC.kid.y, .25);
    const k = blit(SPRITES.kid, SC.kid.x, SC.kid.y, palette(COATS[0]), Math.sin(L.time * .6) > 0, lift);
    if (lift === 0) splash(k.left + 4, k.top + k.h);
  } else if (V.cover > .6 && !look.tropical && SC.snowman) {
    contact(SC.snowman.x - .9, SC.snowman.y + .4, .25);
    blit(SPRITES.kid, SC.snowman.x - .9, SC.snowman.y + .4, palette(COATS[0]), false);
  }
}
function steam(x, y) {
  const c = rgb(236, 236, 240);
  for (let k = 0; k < 3; k++) {
    const t = (L.time * 1.2 + k / 3) % 1, iy = Math.round(y - 1 - t * 7), ix = Math.round(x + Math.sin(t * 6 + k) * 1.2);
    if (ix >= 0 && iy >= 0 && ix < W && iy < H && hash(k, Math.floor(L.time * 6)) > .25) { pix[iy * W + ix] = c; zb[iy * W + ix] = 1e6; }
  }
}
function splash(x, y) {
  const c = rgb(214, 226, 244);
  for (const [dx, dy] of [[-4, -1], [-3, -2], [3, -2], [4, -1], [-2, 0], [2, 0]]) {
    const ix = x + dx, iy = y + dy;
    if (ix >= 0 && iy >= 0 && ix < W && iy < H) { pix[iy * W + ix] = c; zb[iy * W + ix] = 1e6; }
  }
}
function drawPigeons(dry) {
  if (!dry || V.night > .6) return;
  const pal = palette(COATS[0]);
  for (const [x, y, ph] of SC.pigeons) {
    const peck = Math.sin(L.time * 2.3 + ph * 2) > .55;
    blit(peck ? SPRITES.pigeonB : SPRITES.pigeonA, x, y, pal, ph > 2);
  }
}
function drawCup(dry) {
  if (!SC.cup || !dry || V.night > .75) return;
  const p = project(SC.cup.x, SC.cup.y, 1), ix = Math.round(p.sx), iy = Math.round(p.sy), c = rgb(244, 240, 230);
  for (const [dx, dy] of [[0, 0], [1, 0], [0, -1], [1, -1], [2, -1]]) if (ix + dx >= 0 && iy + dy >= 0) pix[(iy + dy) * W + ix + dx] = c;
  steam(ix, iy - 2);
}
// a crowd: tiny figures walking the scene's paths in both directions, each with its own coat and pace;
// fewer of them come out in rain, snow and at night
const CROWD = Array.from({ length: 16 }, (_, k) => ({ offset: hash(k, 1) * 40, lane: hash(k, 2) - .5, pace: .7 + hash(k, 3) * .7, dir: k % 3 ? 1 : -1, pick: hash(k, 9), coat: COATS[k % COATS.length], umbrella: UMBRELLAS[k % UMBRELLAS.length], hair: hash(k, 4) > .5 ? [72, 50, 38] : [180, 150, 110] }));
function pathFor(pick) {
  let acc = 0;
  for (const path of SC.paths) { acc += path.share; if (pick < acc) return path; }
  return SC.paths[0];
}
function drawCrowd(rainy) {
  const busy = clamp(1 - V.rain * .45 - V.storm * .35 - V.snow * .4 - V.night * .45, .2, 1);
  const order = CROWD.slice(0, Math.round(CROWD.length * busy)).map(f => {
    const path = pathFor(f.pick), d = f.offset + L.walk * f.pace * f.dir, p = pathPoint(path, d), yaw = p.yaw + (f.dir < 0 ? Math.PI : 0);
    const x = p.x - Math.sin(p.yaw) * f.lane * path.lanes, y = p.y + Math.cos(p.yaw) * f.lane * path.lanes;
    return { f, x, y, z: path.z ? path.z(x, y) : 0, yaw, d };
  }).sort((a, b) => (a.x + a.y) - (b.x + b.y));
  for (const { f, x, y, z, yaw, d } of order) {
    const pal = palette(f.coat, f.umbrella, f.hair), fig = blit(Math.floor(Math.abs(d) * 3) % 2 ? SPRITES.miniB : SPRITES.miniA, x, y, pal, !facingRight(yaw), 0, null, 0, z);
    if (rainy) blit(SPRITES.miniUmb, x, y, pal, false, 0, { left: fig.left - 1, top: fig.top - 3 }, 0, z);
  }
}
