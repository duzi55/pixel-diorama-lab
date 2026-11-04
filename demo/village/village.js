'use strict';
/* ------------------------------------------------------------------
 * 秋日山村 · 主场景
 *
 * 组装各模块：地形 / 公路 / 木屋 / 树木 / 村民 / 汽车
 *
 * 渲染顺序（严格照 docs/kit/effects.md §4）：
 *   1. 恢复静态底图      pix.set(bakedPix)
 *   2. 草（读 staticShadow）
 *   3. 动态物体（人、车）
 *   4. 树叶风动回放
 *   5. 统一画阴影        flushShadows → applyShadows
 *   6. 深度描边          shadeEdges
 *   7. 覆盖层（箭头）    drawArrow
 *   8. 提交
 * ------------------------------------------------------------------ */

const FPS = 12;
let lastStep = -1;
let selected = null;          // 当前选中的村民
let hoverId = null;

/* ---------------- 烘焙 ---------------- */

function bake() {
  zb.fill(-1e9);
  pix.fill(SKY);
  ground.fill(0);
  kinds.fill(KIND_NONE);
  shadowMask.fill(0);
  staticShadow.fill(0);

  setupHaze();                   // 开启空气透视（远处变淡变灰）

  bakeTerrain();                 // 地面 + 公路
  scatterLitter();               // 落叶碎屑

  /* 地面深度立刻定格，后面所有物体都在它之上 */
  groundZ.set(zb);

  /* 远景树海：在地形之后、村庄之前。
     深度缓冲天然处理遮挡（树海 x+y 小 → 深度小 → 被前景覆盖）。 */
  drawTreeSea();

  /* 草：必须 kinds 写好之后 */
  /* 枯黄草色，不是绿色 —— 绿色会把金黄落叶糊成黑绿噪点 */
  growGrass(.11, [[150, 112, 44], [178, 138, 54], [204, 164, 66], [224, 186, 88]]);

  /* 静态物体 */
  drawHouses();                  // 木屋
  shadowHouses();                // 房屋体积阴影
  drawShrubs();                  // 灌木
  growFoliage();                 // 树（建 capture 缓存）
  castTreeShadows();             // 树的投影（烘焙一次）

  /* 近景树海：画在房子**前面** —— 参考图里树冠直接压住木屋一角，
     这是等距微缩景观制造纵深的关键手法。 */
  drawTreeSeaFore();

  /* 画面最底部的近景树冠带（参考图最底部是树，不是留白） */
  drawBottomCanopy();

  bakeOcclusion();               // 屏幕空间 AO
  staticShadow.set(shadowMask);  // 存下静态阴影，供草/叶读
  applyShadows(groundZ);         // 把静态阴影染到地面
  applySceneHaze(groundZ);       // 全局雾化（参考图那种整片泛白）

  bakedPix.set(pix);
  bakedZ.set(zb);

  /* 飘落的落叶：从树冠掉下来 */
  setupFallingLeaves(FOL_LEAF_SOURCES, 16);
}

/* ---------------- 每帧 ---------------- */

function update(t, dt) {
  updateVillagers(t, dt);
  updateCar(t, dt);
  updateLeaves(t, dt);
}

function draw(t) {
  pix.set(bakedPix);
  zb.set(bakedZ);
  pendingShadows.length = 0;

  drawTufts(t);                  // 草：影子里自动变暗
  drawVillagers(t);              // 村民
  drawCar(t);                    // 汽车
  drawFoliage(t);                // 树（干每帧重画 + 冠风动回放）
  drawFallingLeaves(t);          // 飘落的叶子

  flushShadows();                // 统一画动态阴影
  applyShadows(groundZ);

  shadeEdges();                  // 深度描边

  drawSelection(t);              // 选中标记（箭头）

  ctx.putImageData(image, 0, 0);
}

/* 选中某个村民时，在头顶画一个上下浮动的箭头 */
function drawSelection(t) {
  if (!selected) return;
  const a = villagerAnchorWorld(selected);
  const p = project(a.x, a.y, a.z);
  drawArrow(p.sx, p.sy, t);
}

/* ---------------- 交互 ---------------- */

/* 拾取：优先用 villagers.js 的 pickVillager（同时测头顶锚点和身体中心） */
function pickAt(sx, sy) {
  return pickVillager(sx, sy);
}

canvas.addEventListener('pointerdown', e => {
  const r = canvas.getBoundingClientRect();
  const sx = (e.clientX - r.left) / r.width * W;
  const sy = (e.clientY - r.top) / r.height * H;
  selected = pickAt(sx, sy);
  if (selected) selected.greet = 1.6;    // 打招呼：挥一下手
});

canvas.addEventListener('pointermove', e => {
  const r = canvas.getBoundingClientRect();
  const sx = (e.clientX - r.left) / r.width * W;
  const sy = (e.clientY - r.top) / r.height * H;
  hoverId = pickAt(sx, sy);
  canvas.style.cursor = hoverId ? 'pointer' : 'default';
});

/* ---------------- 主循环 ---------------- */

function frame(now) {
  const step = Math.floor(now / 1000 * FPS);
  if (step !== lastStep) {
    const t = step / FPS;
    const dt = lastStep < 0 ? 1 / FPS : Math.min(.3, (step - lastStep) / FPS);
    lastStep = step;
    update(t, dt);
    draw(t);
  }
  requestAnimationFrame(frame);
}

addEventListener('resize', fit);
fit();
bake();
makeVillagers();
makeCar();
requestAnimationFrame(frame);
