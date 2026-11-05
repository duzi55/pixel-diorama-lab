'use strict';
/* ---------- drawing ---------- */
const mix3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const css = c => 'rgb(' + c.map(v => Math.round(clamp(v, 0, 255))).join(',') + ')';
// the sky colours come from the same few numbers that grade the square, so the page and the picture always agree
function skyColors() {
  let top = mix3([126, 176, 222], [168, 176, 188], V.cloud), low = mix3([212, 230, 240], [204, 208, 212], V.cloud);
  top = mix3(top, [98, 104, 120], V.storm * .8 + V.rain * .25); low = mix3(low, [144, 148, 158], V.storm * .7 + V.rain * .25);
  top = mix3(top, [120, 132, 196], V.golden * .55); low = mix3(low, [250, 196, 150], V.golden * .8);
  top = mix3(top, [12, 16, 38], V.night); low = mix3(low, [40, 44, 80], V.night);
  const fog = fogColor();
  top = mix3(top, fog, V.fog * .75); low = mix3(low, fog, V.fog * .9);
  return { top, low };
}
const fogColor = () => mix3([216, 218, 220], [56, 60, 84], V.night);
let lastSky = '';
// WCAG contrast: every text zone picks the ink that reads best on the sky behind it, and when neither ink
// reaches the target the sky itself is pushed lighter or darker until it does
const lin = v => ((v /= 255) <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
const lum = c => .2126 * lin(c[0]) + .7152 * lin(c[1]) + .0722 * lin(c[2]);
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
const DARK_INK = [16, 16, 18], LIGHT_INK = [246, 242, 232];
function inkFor(bg, need = 7, only = null) {
  let back = bg, ink = DARK_INK;
  for (let k = 0; k < 20; k++) {
    const dark = contrast(DARK_INK, back), light = contrast(LIGHT_INK, back);
    ink = only || (dark >= light ? DARK_INK : LIGHT_INK);
    if (contrast(ink, back) >= need) break;
    back = mix3(back, ink === DARK_INK ? [255, 255, 255] : [0, 0, 0], .07);
  }
  // muted text keeps at least 4.5:1, hairlines at least 3:1
  let mutedK = .45;
  while (mutedK > 0 && contrast(mix3(ink, back, mutedK), back) < 4.5) mutedK -= .03;
  let ruleK = .6;
  while (ruleK > 0 && contrast(mix3(ink, back, ruleK), back) < 3) ruleK -= .03;
  return { back, ink, muted: mix3(ink, back, Math.max(0, mutedK)), rule: mix3(ink, back, Math.max(0, ruleK)) };
}
// the city name is large text: 3:1 is enough, so it can stay a tone of the sky instead of plain ink
function bigFor(back) {
  if (V.night > .5) return [255, 255, 255];
  const dark = contrast(DARK_INK, back) >= contrast(LIGHT_INK, back), toward = dark ? [10, 18, 40] : [255, 238, 214];
  let k = .3;
  while (k < 1 && contrast(mix3(back, toward, k), back) < 3.4) k += .04;
  return mix3(back, toward, k);
}
function paintPage(sky) {
  const flash = L.flash * .5, f = c => mix3(c, [236, 238, 255], flash);
  // one flat colour for the whole poster: a gradient read as washed out behind the scene
  // white ink everywhere; // by day the colour leans to a clear blue, and is deepened only until white reaches 3.3:1
  const base = mix3(mix3(sky.top, sky.low, .2), [86, 150, 220], .4 * (1 - V.night) * (1 - V.storm * .6));
  const top = inkFor(f(base), 3.3, LIGHT_INK), low = top;
  // the head of the poster lifts towards a pale turquoise, then settles into the base colour
  const value = 'linear-gradient(' + css(mix3(top.back, [176, 236, 232], .3)) + ', ' + css(top.back) + ' 55%, ' + css(mix3(top.back, [120, 200, 230], .22)) + ')'; // and brightens again to a clear cyan-blue at the foot
  if (value === lastSky) return;
  lastSky = value;
  const st = nodes.poster.style;
  st.background = value;
  skyStops = [[0, css(mix3(top.back, [176, 236, 232], .3))], [.55, css(top.back)], [1, css(mix3(top.back, [120, 200, 230], .22))]];
  st.setProperty('--ink-t', css(top.ink)); st.setProperty('--muted-t', css(top.muted)); st.setProperty('--rule-t', css(top.rule));
  st.setProperty('--ink-b', css(low.ink)); st.setProperty('--muted-b', css(low.muted)); st.setProperty('--rule-b', css(low.rule));
  st.setProperty('--big', '#fff');
}
const CELLS_W = (W >> 3) + 1, CELLS_H = (H >> 3) + 1, cloudCells = new Float32Array(CELLS_W * CELLS_H);
function gradeAll(sun) {
  const night = V.night, golden = V.golden, cloud = V.cloud, storm = V.storm;
  const sunny = (1 - night) * (1 - cloud * .85) * (1 - V.fog);
  const desat = cloud * .3 + storm * .2 + V.fog * .2, dim = 1 - cloud * .1 - storm * .22 - V.rain * .08;
  const lamps = smooth(.45, .8, Math.max(night, storm * .7 + cloud * .25 + V.fog * .4)), cafeOpen = sun.m > 420 && sun.m < 1380 ? 1 : .15;
  const fog = fogColor(), sky = skyColors(), wet = V.wet, cover = V.cover;
  const puddleAt = 1 - wet * .45, snowRamp = rampOf([236, 240, 248]), hour = Math.floor(sun.m / 60);
  const showClouds = sunny > .05 && cloud > .12 && cloud < .9;
  if (showClouds) for (let cy = 0; cy < CELLS_H; cy++) for (let cx = 0; cx < CELLS_W; cx++) {
    cloudCells[cy * CELLS_W + cx] = noise(cx * .12 - L.windT * .05 * V.windX * 3, cy * .2 + 3 + L.windT * .03);
  }
  const lit = [255, 206, 132];
  for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
    const i = iy * W + ix, d = zb[i];
    if (d < -1e8) { pix[i] = 0; continue; }
    const c = pix[i];
    let r = c & 255, g = c >> 8 & 255, b = c >> 16 & 255;
    const still = d === bakedZ[i], bay = bayerAt(ix, iy);
    // snow settles on whatever faces the sky
    if (still && up[i] && cover > 0 && kinds[i] !== KIND_WATER && noise(ix * .13, iy * .26) * .75 + bay * .35 < cover * 1.05) {
      const lum = (r + g + b) / 765, s = snowRamp[clamp(Math.floor(lum * 3.2 + 1.6 + (bay - .5) * .6), 1, 4)];
      r = s & 255; g = s >> 8 & 255; b = s >> 16 & 255;
    } else if (wet > 0 && d === groundZ[i] && kinds[i] !== KIND_WATER) {
      // rain darkens the paving and pools in the low spots, which mirror the sky
      const damp = 1 - wet * .26;
      r *= damp; g *= damp; b *= damp * 1.02;
      if (puddle[i] > puddleAt) {
        const ref = mix3(sky.low, sky.top, clamp((puddle[i] - puddleAt) * 4, 0, 1));
        r = lerp(r, ref[0] * .82, .75); g = lerp(g, ref[1] * .82, .75); b = lerp(b, ref[2] * .86, .75);
      }
    } else if (wet > 0 && still && up[i]) { r *= 1 - wet * .14; g *= 1 - wet * .14; b *= 1 - wet * .1; }
    // a window or the lamp glass glows on its own instead of being graded
    const e = still ? emit[i] : 0;
    if (e) {
      const sign = e >= SIGN_PINK && e <= SIGN_RED;
      const on = e === LAMP_GLASS || e === PROP_WARM || e === NEON ? lamps > .5 : e === VENDING ? lamps > .25 : sign ? lamps > .4 : e === CAFE_WINDOW ? lamps * cafeOpen > .3 : night > .5 && hash(e, hour) < .62;
      if (on && e === VENDING) { pix[i] = rgb(r * .7 + 90, g * .7 + 90, b * .7 + 96); continue; }
      if (on && sign) { pix[i] = rgb(r * 1.15 + 34, g * 1.15 + 34, b * 1.15 + 34); continue; }
      if (on && e === NEON) { pix[i] = rgb(214, 136, 236); continue; }
      if (on) {
        const k = e === LAMP_GLASS ? .3 : (iy % 3 === 0 ? .1 : 0) + hash(e, 3) * .2;
        pix[i] = rgb(lerp(lit[0], 255, k), lerp(lit[1], 240, k), lerp(lit[2], 210, k));
        continue;
      }
      if (night < .5) { const k = (1 - night) * .3; r = lerp(r, sky.top[0], k); g = lerp(g, sky.top[1], k); b = lerp(b, sky.top[2], k); }
    }
    // overcast drains colour, golden hour warms it, night pulls it down to blue
    if (desat > 0) { const l = (r + g + b) / 3; r = lerp(r, l, desat); g = lerp(g, l, desat); b = lerp(b, l * 1.04, desat); }
    r *= dim; g *= dim; b *= dim;
    if (showClouds && cloudCells[(iy >> 3) * CELLS_W + (ix >> 3)] + bay * .2 > 1.05 - cloud * .7) { r *= .8; g *= .8; b *= .86; }
    if (golden > 0) { r = lerp(r, r * 1.08 + 14, golden); g = lerp(g, g * .92 + 4, golden); b = lerp(b, b * .74, golden); }
    if (night > 0) { r = lerp(r, r * .24 + 6, night); g = lerp(g, g * .28 + 9, night); b = lerp(b, b * .46 + 24, night); }
    // lamplight, stepped into bands so it stays pixel art
    if (lamps > 0) {
      const pool = Math.max(lampPool[i], cafePool[i] * cafeOpen * .85, still && flood[i] ? .38 : 0);
      if (pool > 0) {
        const band = Math.floor(pool * 4 + bay * .9) / 4 * lamps;
        r += band * 150; g += band * 104; b += band * 46;
      }
    }
    if (V.fog > 0) {
      const f = V.fog * clamp(.3 + (7 - d) / 18 + (noise(ix * .03 + L.windT * .08, iy * .06) - .5) * .35, 0, .92);
      r = lerp(r, fog[0], f); g = lerp(g, fog[1], f); b = lerp(b, fog[2], f);
    }
    pix[i] = rgb(r, g, b);
  }
}
const CLOUDS = [];
for (let k = 0; k < 34; k++) {
  const blobs = [];
  for (let n = 0; n < 4; n++) blobs.push([(n - 1.5) * (6 + hash(k, n) * 5), (hash(n, k) - .5) * 5 - (n === 1 || n === 2 ? 4 : 0), 6 + hash(k, n + 9) * 6]);
  CLOUDS.push({ x: hash(k, 61) * (W + 120), y: 8 + hash(k, 62) ** 1.4 * 150, scale: .7 + hash(k, 63) * .8, speed: .6 + hash(k, 64) * .8, rank: hash(k, 65), blobs });
}
const skyCanvas = document.getElementById('sky'), skyCtx = skyCanvas.getContext('2d');
skyCanvas.width = W; skyCanvas.height = H;
const skyImage = skyCtx.createImageData(W, H), skyPix = new Uint32Array(skyImage.data.buffer);
function drawSky(sun) {
  const night = V.night, cloud = V.cloud;
  // stars
  if (night > .3) {
    const star = rgb(236, 236, 255), dim = rgb(150, 156, 200);
    for (let iy = 0; iy < 210; iy++) for (let ix = 0; ix < W; ix++) {
      const h = hash(ix * 1.3, iy * 2.1);
      if (h < .9965 || hash(ix, iy) > (night - .3) * 1.4 * (1 - cloud) * (1 - V.fog) * clamp(1 - (V.rain + V.drizzle + V.snow) * 3, 0, 1)) continue;
      const i = iy * W + ix;
      skyPix[i] = hash(ix + Math.floor(L.time * 2), iy) > .85 ? dim : star;
    }
  }
  // sun or moon on an arc across the sky
  const { m, rise, set } = sun;
  const dayK = clamp((m - rise) / (set - rise), 0, 1), nightLen = 1440 - (set - rise);
  const nightK = clamp(((m - set + 1440) % 1440) / nightLen, 0, 1);
  const sunVis = (1 - night) * (1 - cloud * .9) * (1 - V.fog * .9), moonVis = night * (1 - cloud * .85) * (1 - V.fog * .9);
  const disc = (k, vis, r, color, glow) => {
    if (vis < .08) return;
    const cx = 34 + k * (W - 68), cy = 112 - Math.sin(k * Math.PI) * 88;
    for (let iy = Math.max(0, cy - r * 2.4 | 0); iy < Math.min(H, cy + r * 2.4); iy++) for (let ix = Math.max(0, cx - r * 2.4 | 0); ix < Math.min(W, cx + r * 2.4); ix++) {
      const i = iy * W + ix;
      const dd = Math.hypot(ix + .5 - cx, iy + .5 - cy) / r, bay = bayerAt(ix, iy);
      if (dd < 1 && bay < vis * 1.4) skyPix[i] = color(ix - cx, iy - cy, r);
      else if (dd < 2.2 && bay < vis * (2.2 - dd) * .32) skyPix[i] = glow;
    }
  };
  const sunColor = V.golden > .4 ? rgb(255, 196, 120) : rgb(255, 244, 200);
  disc(dayK, sunVis * (m > rise - 20 && m < set + 20 ? 1 : 0), 7, () => sunColor, V.golden > .4 ? rgb(250, 176, 120) : rgb(255, 240, 210));
  disc(nightK, moonVis, 5, (dx, dy, r) => (Math.hypot(dx + r * .5, dy - r * .3) < r * .62 ? rgb(196, 200, 222) : rgb(240, 238, 222)), rgb(70, 76, 120));
  // clouds: how many show depends on cover, their colour on the light
  if (cloud < .08) return;
  let base = mix3([252, 252, 252], [196, 200, 208], clamp((cloud - .4) * 1.6, 0, 1));
  base = mix3(base, [112, 116, 132], V.storm * .9 + V.rain * .35);
  base = mix3(base, [255, 214, 188], V.golden * .6);
  base = mix3(base, [52, 56, 88], night * .92);
  base = mix3(base, fogColor(), V.fog * .6);
  const shade = mix3(base, [base[0] * .62, base[1] * .64, base[2] * .78], 1);
  const tones = [0, 1, 2, 3].map(k => rgb(...mix3(shade, base, k / 3)));
  const drift = L.time * (2 + V.wind * 1.2) * Math.sign(V.windX - V.windY || 1);
  for (const c of CLOUDS) {
    const cx = ((c.x + drift * c.speed) % (W + 120) + W + 120) % (W + 120) - 60;
    // a whole cloud fades as it nears the canvas side, so it never meets the edge as a hard cut
    const show = clamp((cloud * 1.15 - c.rank) * 6, 0, 1) * clamp((Math.min(cx, W - cx) - 34) / 60, 0, 1) * (1 - V.fog * .7);
    if (show <= 0) continue;
    for (const [ox, oy, rr] of c.blobs) {
      const bx = cx + ox * c.scale, by = c.y + oy * c.scale, rx = rr * c.scale * 1.6, ry = rr * c.scale;
      for (let iy = Math.max(0, by - ry | 0); iy <= by + ry && iy < H; iy++) for (let ix = Math.max(0, bx - rx | 0); ix <= bx + rx && ix < W; ix++) {
        const dx = (ix - bx) / rx, dy = (iy - by) / ry, nn = dx * dx + dy * dy;
        if (nn > 1) continue;
        const i = iy * W + ix;
        if (bayerAt(ix, iy) > show * clamp(iy / 14, 0, 1) * 1.6 * (1.2 - nn * .5)) continue;
        const l = -.3 * dx - .8 * dy + .4 * Math.sqrt(1 - nn);
        skyPix[i] = tones[clamp(Math.floor(l * 2.4 + 1.6 + (bayerAt(ix, iy) - .5) * .6), 0, 3)];
      }
    }
  }
}
function drawWeather() {
  const nightK = V.night;
  // smoke puffs, dithered thinner as they age
  const smoke = mix3([226, 224, 222], [84, 86, 110], nightK);
  for (const p of puffs) {
    const q = project(p.x, p.y, p.z), r = (.2 + p.age * .22) * S, alpha = (1 - p.age / 4.5) * .75 * V.smoke;
    for (let iy = Math.max(0, q.sy - r | 0); iy <= q.sy + r && iy < H; iy++) for (let ix = Math.max(0, q.sx - r | 0); ix <= q.sx + r && ix < W; ix++) {
      const dx = (ix - q.sx) / r, dy = (iy - q.sy) / r, nn = dx * dx + dy * dy;
      if (nn > 1) continue;
      const i = iy * W + ix;
      if (q.d < zb[i] || bayerAt(ix, iy) > alpha * (1.1 - nn * .6)) continue;
      const l = .88 + (-.3 * dx - .4 * dy) * .14;
      pix[i] = rgb(smoke[0] * l, smoke[1] * l, smoke[2] * l);
    }
  }
  // leaves on the wind
  const leafColors = SEASON_LEAVES[look.season === 'winter' ? 'winter' : look.season].map(c => rgb(...mix3(c, [c[0] * .3, c[1] * .3, c[2] * .5], nightK * .8)));
  for (const f of flying) {
    const q = project(f.x, f.y, f.z), ix = q.sx | 0, iy = q.sy | 0;
    if (ix < 0 || iy < 0 || ix >= W - 1 || iy >= H) continue;
    const i = iy * W + ix;
    if (q.d < zb[i]) continue;
    pix[i] = leafColors[f.seed * 3 | 0];
    if (Math.sin(L.time * 9 + f.seed * 20) > 0) pix[i + 1] = pix[i];
  }
  // rain streaks
  const rainColor = rgb(...mix3(mix3([206, 220, 246], [176, 190, 228], V.storm), [118, 130, 176], nightK * .7));
  const lean = V.wind * .55 / 26;
  // precipitation thins out towards the canvas sides, so it never stops at a hard edge
  const edgeOk = (sx, sy, seed) => clamp(Math.min(sx, W - sx) / 50, 0, 1) * clamp(sy / 30, 0, 1) > seed;
  for (const d of drops) {
    const head = project(d.x, d.y, d.z);
    if (!edgeOk(head.sx, head.sy, d.seed)) continue;
    const len = d.short ? 2 : 5;
    for (let k = 0; k < len; k++) {
      const p = project(d.x - V.windX * lean * k * .3, d.y - V.windY * lean * k * .3, d.z + k * .3), ix = p.sx | 0, iy = p.sy | 0;
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
      const i = iy * W + ix;
      if (p.d > zb[i]) pix[i] = rainColor;
    }
  }
  const pale = rgb(...mix3([214, 224, 240], [120, 130, 170], nightK * .6));
  for (const s of splashes) {
    const p = project(s.x, s.y, 0), ix = p.sx | 0, iy = p.sy | 0;
    if (ix < 1 || iy < 1 || ix >= W - 1 || iy >= H) continue;
    const i = iy * W + ix;
    if (zb[i] !== groundZ[i]) continue;
    pix[i - 1] = pale; pix[i + 1] = pale;
    if (s.life > .08) pix[i - W] = pale;
  }
  // snowflakes
  const flake = rgb(...mix3([250, 252, 255], [180, 186, 214], nightK * .5));
  for (const f of flakes) {
    const p = project(f.x, f.y, f.z), ix = p.sx | 0, iy = p.sy | 0;
    if (ix < 0 || iy < 0 || ix >= W - 1 || iy >= H - 1 || !edgeOk(p.sx, p.sy, f.seed)) continue;
    const i = iy * W + ix;
    if (p.d <= zb[i]) continue;
    pix[i] = flake;
    if (f.big) { pix[i + 1] = flake; pix[i + W] = flake; pix[i + W + 1] = flake; }
  }
  // lightning
  if (L.bolt) {
    const core = rgb(250, 244, 200), side = rgb(150, 150, 230);
    for (let k = 0; k < L.bolt.length - 1; k++) {
      const [ax, ay] = L.bolt[k], [bx, by] = L.bolt[k + 1], n = Math.ceil(Math.hypot(bx - ax, by - ay));
      for (let j = 0; j <= n; j++) {
        const sx = lerp(ax, bx, j / n) | 0, sy = lerp(ay, by, j / n) | 0;
        for (const [ox, c] of [[0, core], [-1, side], [1, side]]) {
          const ix = sx + ox;
          if (ix < 0 || ix >= W || sy < 0 || sy >= H) continue;
          const i = sy * W + ix;
          skyPix[i] = c;
        }
      }
    }
  }
  if (L.flash > 0) {
    const f = L.flash * .45;
    for (const buf of [pix, skyPix]) for (let i = 0; i < buf.length; i++) {
      const c = buf[i];
      if (!c) continue;
      buf[i] = rgb(lerp(c & 255, 240, f), lerp(c >> 8 & 255, 240, f), lerp(c >> 16 & 255, 255, f));
    }
  }
}
function draw() {
  const sun = updateSun();
  // baked shadows fade in and out with the sun, dithered so the change reads as pixels, not a fade
  const sunny = (1 - V.night) * (1 - V.cloud * .85) * (1 - V.fog);
  for (let i = 0; i < pix.length; i++) pix[i] = sunny > bayerAt(i % W, i / W | 0) ? shadowPix[i] : noShadowPix[i];
  zb.set(bakedZ);
  pendingShadows.length = 0;
  drawTufts(L.windT);
  if (SC.water) SC.water();
  drawSnowman();
  drawPeople();
  if (SC.extra) SC.extra();
  drawLeaves(L.windT);
  if (sunny > .35) { flushShadows(); applyShadows(groundZ); } else shadowMask.fill(0);
  shadeEdges();
  gradeAll(sun);
  skyPix.fill(0);
  drawSky(sun);
  aurora();
  drawWeather();
  paintPage(skyColors());
  ctx.putImageData(image, 0, 0);
  skyCtx.putImageData(skyImage, 0, 0);
}
