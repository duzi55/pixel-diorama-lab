'use strict';
/* ------------------------------------------------------------------
 * 场景查看器（scenes/view.html?name=<场景名>）
 *
 * 读取 demo/scenes/<name>.json（Studio 编辑器保存的场景），按保存时的
 * 尺寸 / 背景色 / 光照重建画面：
 *
 *   JSON ──▶ window.PP_W/H/PP_SCALE/PP_ORIGIN ──▶ 动态加载 engine + 构件 + 地形
 *        ──▶ terrainRender() + 构件画家排序 ──▶ 一次性绘到画布
 *
 * 页面底色与画布底色都用场景的 bg，保证"整个页面背景一致"。
 * ------------------------------------------------------------------ */

const VIEW = { name: '', scene: null, baseMap: null };

const SCRIPTS = [
  '../engine.js',
  '../engine-light.js',
  '../kit/core.js',
  '../kit/palette.js',
  '../kit/render.js',
  '../kit/behavior.js',
  '../kit/trees.js',
  '../kit/conifers.js',
  '../kit/plants.js',
  '../kit/buildings.js',
  '../kit/stoneworks.js',
  '../kit/cart.js',
  '../kit/props.js',
  '../kit/figures.js',
  '../studio/terrain.js',
  '../studio/terrain-common.js',
  '../studio/terrain-render.js',
  '../studio/terrain-march.js',
];

/* 可选构件/行为文件：不存在时不拖垮整个查看器 */
const OPTIONAL_SCRIPTS = [
  '../kit/behavior-extra.js',
  '../kit/ref-buildings.js',
  '../kit/ref-structures.js',
  '../kit/ref-plants.js',
  '../kit/ref-surfaces.js',
  '../kit/ref-props.js',
  '../kit/ref-props-small.js',
  '../kit/ref-shanghai.js',
];

function viewerFail(msg) {
  const box = document.getElementById('err');
  box.style.display = 'flex';
  box.innerHTML = `无法打开场景<br><br>${msg}<br><br>
    <span style="opacity:.6">打开方式：<code>/scenes/view.html?name=场景名</code></span>`;
  document.title = '场景查看器 · 出错';
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('脚本加载失败: ' + src));
    document.body.appendChild(s);
  });
}

/** 底图（从已有场景导入后保存的）→ 像素缓冲 */
async function decodeBaseMap(bm) {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = bm.png; });
  const c = document.createElement('canvas');
  c.width = bm.W; c.height = bm.H;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, bm.W, bm.H);
  return { pix: new Uint32Array(data.data.buffer), W: bm.W, H: bm.H };
}

/** '#rrggbb' → engine 打包像素 */
function bgPacked(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return rgb(22, 22, 27);
  const n = parseInt(m[1], 16);
  return rgb((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

function applyLighting(scene) {
  const lt = scene.lighting;
  if (!lt || typeof LIGHT === 'undefined') return;
  if (lt.dir) Object.assign(LIGHT.dir, lt.dir);
  if (lt.shadow) Object.assign(LIGHT.shadow, lt.shadow);
  if (Array.isArray(lt.tint)) LIGHT.tint = [...lt.tint];
  if (lt.ambient != null) LIGHT.ambient = lt.ambient;
  if (lt.vignette != null) LIGHT.vignette = lt.vignette;
}

function renderScene() {
  const scene = VIEW.scene;
  zb.fill(-1e9);
  pix.fill(bgPacked(scene.bg));
  ground.fill(0);
  kinds.fill(KIND_NONE);
  groundZ.fill(0);
  shadowMask.fill(0);
  pendingShadows.length = 0;
  darkened.fill(0);

  if (VIEW.baseMap) {
    /* 底图模式：整张烘焙图直接铺底，物体画在上面 */
    pix.set(VIEW.baseMap.pix);
  } else {
    terrainRender(false);
  }

  const objs = [...(scene.objects || [])].sort((a, b) =>
    ((a.zOrder || 0) - (b.zOrder || 0)) || (b.y - a.y));
  for (const o of objs) {
    const comp = KIT.get(o.kind);
    if (!comp) { console.warn('[viewer] 未知构件', o.kind); continue; }
    if (o.anim && o.anim.hidden) continue;
    /* 外形被行为接管（砍倒 → 树桩）：不画原构件，只让行为自己画 */
    if (!(o.anim && o.anim.kind === '__stump__')) {
      try { comp.draw(KIT_RENDER.makeCtx(o), o); }
      catch (e) { console.warn('[viewer] 构件绘制失败', o.kind, e); }
    }
    if (typeof KIT_BEHAVIOR !== 'undefined') {
      try { KIT_BEHAVIOR.draw(KIT_RENDER.makeCtx(o), o, KIT_BH_WORLD); }
      catch (e) { console.warn('[viewer] 行为绘制失败', o.kind, e); }
    }
  }

  if (!VIEW.baseMap) {
    bakeOcclusion();
    staticShadow.set(shadowMask);
    applyShadows(groundZ);
  }
  shadeEdges();

  PP_shadePoints();
  PP_applyGrade();
  ctx.putImageData(image, 0, 0);
}

function fitView() {
  const W2 = VIEW.scene.W || W, H2 = VIEW.scene.H || H;
  const k = Math.max(1, Math.floor(Math.min(
    (innerWidth - 60) / W2,
    (innerHeight - 60) / H2,
  )));
  canvas.style.width = (W2 * k) + 'px';
  canvas.style.height = (H2 * k) + 'px';
}

async function boot() {
  const name = new URLSearchParams(location.search).get('name');
  if (!name) return viewerFail('地址缺少 <code>?name=</code> 参数');
  VIEW.name = name;

  let scene;
  try {
    const res = await fetch('./' + encodeURIComponent(name) + '.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    scene = await res.json();
  } catch (e) {
    return viewerFail(`场景「${name}」加载失败：${e.message}`);
  }
  VIEW.scene = scene;

  /* 画布参数必须在 engine.js 加载前就位（engine 顶部读取它们） */
  window.PP_W = Math.max(80, scene.W || 520);
  window.PP_H = Math.max(60, scene.H || 380);
  window.PP_SCALE = scene.S || 11;
  window.PP_ORIGIN_X = scene.originX || 0;
  window.PP_ORIGIN_Y = scene.originY == null ? 18 : scene.originY;
  const bg = /^#[0-9a-f]{6}$/i.test(scene.bg || '') ? scene.bg : '#16161c';
  document.documentElement.style.background = bg;
  document.body.style.background = bg;
  document.title = (scene.title || scene.name || name) + ' · 场景';

  for (const src of SCRIPTS) {
    try { await loadScript(src); }
    catch (e) { return viewerFail(e.message); }
  }
  for (const src of OPTIONAL_SCRIPTS) {
    try { await loadScript(src); }
    catch { console.warn('[viewer] 可选脚本未加载', src); }
  }

  if (scene.baseMap && scene.baseMap.png) {
    try { VIEW.baseMap = await decodeBaseMap(scene.baseMap); }
    catch (e) { console.warn('[viewer] 底图解码失败', e); }
  }

  applyLighting(scene);
  if (scene.terrain) TERRAIN.fromJSON(scene.terrain);

  /* 行为：给每个实例挂上构件声明的默认行为（场景可用 behaviors 覆盖） */
  if (typeof KIT_BEHAVIOR !== 'undefined') {
    for (const o of scene.objects || []) {
      if (Array.isArray(o.behaviors)) o.behaviorSpec = o.behaviors;
      try { KIT_BEHAVIOR.attach(o); } catch (e) { console.warn('[viewer] 行为挂载失败', o.kind, e); }
    }
  }

  renderScene();
  fitView();
  addEventListener('resize', fitView);
  canvas.addEventListener('pointerdown', onPick);
  if (typeof KIT_BEHAVIOR !== 'undefined') startLoop();
  else { /* 无行为模块：保持静态渲染 */ }
}

/* ---------------- 行为循环（12fps，与项目其他场景一致） ---------------- */

const VIEW_LOOP = { last: 0, acc: 0, t: 0, running: false };

function startLoop() {
  if (VIEW_LOOP.running) return;
  VIEW_LOOP.running = true;
  const step = 1 / 12;
  const frame = now => {
    if (!VIEW_LOOP.last) VIEW_LOOP.last = now;
    VIEW_LOOP.acc += (now - VIEW_LOOP.last) / 1000;
    VIEW_LOOP.last = now;
    if (VIEW_LOOP.acc >= step) {
      const dt = Math.min(.25, VIEW_LOOP.acc);
      VIEW_LOOP.acc = 0;
      VIEW_LOOP.t += dt;
      const w = KIT_BH_WORLD;
      w.t = VIEW_LOOP.t; w.dt = dt;
      w.wind.strength = .35 + .25 * Math.sin(w.t * .62 + .4) + .15 * Math.sin(w.t * 1.55);
      w.wind.gust = Math.sin(w.t * .62 + .4) * .55 + Math.sin(w.t * 1.55) * .3;
      for (const o of VIEW.scene.objects || []) {
        try { KIT_BEHAVIOR.tick(o, dt, w); } catch (e) { /* 单个行为出错不拖垮整场 */ }
      }
      renderScene();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/* 点击拾取：按底部中心的屏幕距离找最近实例 */
function onPick(e) {
  if (typeof KIT_BEHAVIOR === 'undefined') return;
  const r = canvas.getBoundingClientRect();
  const sx = (e.clientX - r.left) / r.width * W;
  const sy = (e.clientY - r.top) / r.height * H;
  let best = null, bd = 30;
  for (const o of VIEW.scene.objects || []) {
    const p = project(o.x, o.y, 0);
    const d = Math.hypot(p.sx - sx, p.sy - sy);
    if (d < bd) { bd = d; best = o; }
  }
  if (best) {
    KIT_BEHAVIOR.event(best, { type: 'click', x: best.x, y: best.y }, KIT_BH_WORLD);
    renderScene();
  }
}

boot().catch(e => viewerFail(String(e && e.message || e)));
