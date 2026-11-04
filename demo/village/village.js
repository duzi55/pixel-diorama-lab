'use strict';
/* ------------------------------------------------------------------
 * 秋日山村 · 场景主循环与组装
 *
 * 场景构成（Diorama 微缩模型构图）：
 *   - 纯色背景留白 (#fcf5da)，画布与网页无缝融合
 *   - 中央落叶山丘地台 + 穿村延伸公路
 *   - 5 栋错落精致木屋（鲜嫩绿苔藓、暖光窗、木板墙壁、烟囱）
 *   - 标志性黄金参天巨树与耸立塔林（全部完整绘制，不被硬框切断）
 *   - 黄色卡通甲壳虫汽车顺畅开行
 *   - 村民行人散步张望，点击打招呼挥手交互
 *   - 金黄落叶随风轻盈飘落
 * ------------------------------------------------------------------ */

const FPS = 12;
let lastStep = -1;
let selected = null;
let hoverId = null;

/* ---------------- 静态场景烘焙 ---------------- */

function bake() {
  zb.fill(-1e9);
  pix.fill(SKY);
  ground.fill(0);
  kinds.fill(KIND_NONE);
  shadowMask.fill(0);
  staticShadow.fill(0);

  // 1. 地貌与公路（落叶地台自然散开过渡到留白）
  drawGround();
  scatterLitter();
  groundZ.set(zb);        // 定格地面深度

  // 2. 房屋建筑
  drawHouses();
  shadowHouses();

  // 3. 树木群（黄金参天巨树 + 挺拔塔林，完整立体生成）
  growFoliage();
  castTreeShadows();

  // 4. 环境光影：屏幕空间 AO 与静态阴影
  bakeOcclusion();
  staticShadow.set(shadowMask);
  applyShadows(groundZ);  // 阴影渲染（公路车行道免影）

  bakedPix.set(pix);
  bakedZ.set(zb);

  // 5. 初始化微风落叶源
  setupFallingLeaves(FOL_LEAF_SOURCES, 16);
}

/* ---------------- 每帧动态更新 ---------------- */

function update(t, dt) {
  updateVillagers(t, dt);
  updateCar(t, dt);
  updateLeaves(t, dt);
}

function draw(t) {
  pix.set(bakedPix);
  zb.set(bakedZ);
  pendingShadows.length = 0;

  // 动态图元绘制
  drawVillagers(t);        // 村民行走与动作
  drawCar(t);              // 黄色甲壳虫小汽车行驶与警灯闪烁
  drawFallingLeaves(t);    // 飘落的秋叶

  flushShadows();
  applyShadows(groundZ);

  shadeEdges();            // 深度边缘线，强化剪纸立体质感
  drawSelection(t);        // 选中村民时的头顶浮动提示

  ctx.putImageData(image, 0, 0);
}

/* 选中村民时的头顶打招呼浮动箭头 */
function drawSelection(t) {
  if (!selected) return;
  const a = villagerAnchorWorld(selected);
  const p = project(a.x, a.y, a.z);
  drawArrow(p.sx, p.sy, t);
}

/* ---------------- 鼠标与交互 ---------------- */

function pickAt(sx, sy) {
  return pickVillager(sx, sy);
}

canvas.addEventListener('pointerdown', e => {
  const r = canvas.getBoundingClientRect();
  const sx = (e.clientX - r.left) / r.width * W;
  const sy = (e.clientY - r.top) / r.height * H;
  selected = pickAt(sx, sy);
  if (selected) {
    selected.greet = 1.6;  // 欢快挥手打招呼
  }
});

canvas.addEventListener('pointermove', e => {
  const r = canvas.getBoundingClientRect();
  const sx = (e.clientX - r.left) / r.width * W;
  const sy = (e.clientY - r.top) / r.height * H;
  hoverId = pickAt(sx, sy);
  canvas.style.cursor = hoverId ? 'pointer' : 'default';
});

/* ---------------- 主动画循环 ---------------- */

function frame(now) {
  const step = Math.floor(now / 1000 * FPS);
  if (step !== lastStep) {
    const t = step / FPS;
    const dt = lastStep < 0 ? 1 / FPS : Math.min(0.3, (step - lastStep) / FPS);
    lastStep = step;
    update(t, dt);
    draw(t);
  }
  requestAnimationFrame(frame);
}

// 响应窗口调整：自适应缩放居中，无拉伸
addEventListener('resize', fit);

// 初始化启动
fit();
bake();
makeVillagers();
makeCar();
requestAnimationFrame(frame);
