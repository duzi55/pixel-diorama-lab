'use strict';
/* ---------- the bake: the still scene, drawn once per city and season, with its shadows and light pools ---------- */
function bake() {
  currentStyle = { ...GENERIC, ...(CITY_STYLES[look.city] || {}) };
  SC = currentStyle.layout || GENERIC_LAYOUT;
  setCamera(SC.scale || 11, 0, 0, SC.lift);
  const tree = currentStyle.tree, scene = SC !== GENERIC_LAYOUT;
  if (tree) { TREE.x = tree.x; TREE.y = tree.y; }
  if (SC.tree) { TREE.x = SC.tree.x; TREE.y = SC.tree.y; }
  clearScene();
  emit.fill(0);
  flood.fill(0);
  zb.fill(-1e9);
  pix.fill(0);
  for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
    const g = unproject(ix + .5, iy + .5), i = iy * W + ix, c = (SC.ground || groundColor)(g.x, g.y, ix, iy, i);
    if (!c) continue;
    pix[i] = c; ground[i] = 1;
    zb[i] = (g.x + g.y) / R2 * COS;
    puddle[i] = noise(g.x * .5 + 3, g.y * .7 + 7) + (kinds[i] === KIND_GRASS ? -.3 : 0);
  }
  growGrass();
  groundZ.set(zb);
  if (scene) SC.build();
  else {
    islandSides();
    buildHouse();
    buildFurniture();
    const palms = currentStyle.palms ?? look.tropical;
    if (tree && palms) { growPalm(TREE.x - .6, TREE.y + .4, 1, 3); growPalm(TREE.x + 1.6, TREE.y - 1.4, .78, 5); }
    else if (tree) growSeasonTree(TREE.x, TREE.y, tree.scale, (currentStyle.leaves || {})[look.season] || look.season, 0);
    if (currentStyle.build) currentStyle.build();
  }
  // a light whose pixels were later covered by something nearer stops glowing
  for (let i = 0; i < W * H; i++) if (emit[i] && zb[i] !== emitZ[i]) emit[i] = 0;
  bakeOcclusion();
  noShadowPix.set(pix);
  staticShadow.set(shadowMask);
  applyShadows(groundZ);
  shadowPix.set(pix);
  bakedZ.set(zb);
  // which pixels face the sky: on a level surface depth grows by GRADIENT_Y per row down, on walls it falls
  up.fill(0);
  for (let i = 0; i < W * (H - 1); i++) {
    if (zb[i] < -1e8 || zb[i + W] < -1e8) continue;
    const dd = zb[i + W] - zb[i];
    if (dd > GRADIENT_Y * .45 && dd < GRADIENT_Y * 2.5) up[i] = 1;
  }
  // pools of light under the lamp and in front of the café window, stepped like the rest of the shading
  const lamps = SC.lamps.map(l => ({ foot: project(l.x, l.y, l.base), head: project(l.x, l.y, l.z) }));
  const cp = SC.cafe && project(SC.cafe.x, SC.cafe.y, 0);
  for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
    const i = iy * W + ix;
    let pool = 0;
    for (const { foot, head } of lamps) {
      const dx = (ix - foot.sx) / (5 * S), dy = (iy - foot.sy) / (5 * S * SIN);
      const ground = Math.max(0, 1 - Math.hypot(dx, dy)) ** 1.6;
      const halo = Math.max(0, 1 - Math.hypot(ix - head.sx, iy - head.sy) / 30) ** 2;
      pool = Math.max(pool, zb[i] > -1e8 ? ground : 0, halo * .7);
    }
    lampPool[i] = pool;
    if (!cp) { cafePool[i] = 0; continue; }
    const cx = (ix - cp.sx) / (3.2 * S), cy = (iy - cp.sy) / (2.2 * S * SIN);
    cafePool[i] = zb[i] > -1e8 ? Math.max(0, 1 - Math.hypot(cx, cy)) ** 1.4 : 0;
  }
}
