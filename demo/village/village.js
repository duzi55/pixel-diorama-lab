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

/* 无树冠的底图快照：每帧从它出发，再把树冠按风势回放上去 */
let basePix = new Uint32Array(1), baseZ = new Float32Array(1);
function ensureBase() {
  if (basePix.length !== W * H) {
    basePix = new Uint32Array(W * H);
    baseZ = new Float32Array(W * H);
  }
}

function bake() {
  zb.fill(-1e9);
  pix.fill(SKY);
  ground.fill(0);
  kinds.fill(KIND_NONE);
  shadowMask.fill(0);
  staticShadow.fill(0);
  ensureBase();

  // 1. 地貌与公路（落叶岛，边缘有机消散）
  drawGround();
  scatterLitter();
  groundZ.set(zb);        // 定格地面深度

  // 2. 房屋建筑
  drawHouses();
  shadowHouses();

  // 3. 树干（静态）
  drawTreeTrunks();
  castTreeShadows();

  // 4. 环境光影
  bakeOcclusion();
  staticShadow.set(shadowMask);
  applyShadows(groundZ);

  // 5. 快照（不含树冠）→ 树冠像素录制（风动基础）
  basePix.set(pix);
  baseZ.set(zb);
  drawTreeCanopies();

  bakedPix.set(pix);
  bakedZ.set(zb);

  // 6. 落叶源
  /* ★ 不要传具体数字 —— 用 falling.js 的 LEAF_FALL_COUNT（120）。
     之前这里硬编码 16，在 600×760 画布上等于没有（用户反馈"树没有落叶"）。 */
  setupFallingLeaves(FOL_LEAF_SOURCES);
}

/* ---------------- 每帧动态更新 ---------------- */

function update(t, dt) {
  updateVillagers(t, dt);
  updateCar(t, dt);
  /* 车辆淡入淡出：与**道路消散点对齐**（岛内 ±12 世界之外开始溶解），
     车永远不会开在"没有路"的地面上 */
  const dx = Road.car.x - RD.midX, dy = Road.car.y - RD.midY;
  const sRel = Math.abs(dx * RD.ex + dy * RD.ey);
  Road.car.fade = clamp((18 - sRel) / 6, 0, 1);
  updateLeaves(t, dt);
}

function draw(t) {
  /* 从"无树冠底图"出发 → 树冠按风势回放 → 再画动态元素。
     树冠逐像素录过一次，每帧只做整数像素平移，开销很小。 */
  pix.set(basePix);
  zb.set(baseZ);
  pendingShadows.length = 0;

  drawTreeWind(t);         // 树冠风动
  drawVillagers(t);        // 村民
  drawCar(t);              // 黄色甲壳虫
  drawFallingLeaves(t);    // 落叶

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

// 响应窗口调整：全屏模式重建缓冲并重烘焙（1:1，不拉伸）
window.PP_ONRESIZE = function () { lastStep = -1; };
addEventListener('resize', () => {
  if (window.PP_FULLSCREEN) {
    PP_setSize(Math.ceil(innerWidth), Math.ceil(innerHeight));
    bake();
  }
  fit();
});

// 初始化启动
fit();
bake();
makeVillagers();
makeCar();
requestAnimationFrame(frame);
