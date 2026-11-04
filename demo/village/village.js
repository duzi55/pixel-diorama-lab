'use strict';
/* ------------------------------------------------------------------
 * 秋日山村 · 主场景（极简版）
 *
 * 场景 = 纯色背景 + 一条公路 + 几个房子 + 几棵树 + 车/村民/落叶。
 * 渲染顺序：地面 → 房子 → 树 → 影子 → 烘焙定格；
 * 每帧：村民 / 车 / 落叶 / 选中标记。
 * ------------------------------------------------------------------ */

const FPS = 12;
let lastStep = -1;
let selected = null;
let hoverId = null;

/* ---------------- 烘焙 ---------------- */

function bake() {
  zb.fill(-1e9); pix.fill(SKY);
  ground.fill(0); kinds.fill(KIND_NONE);
  shadowMask.fill(0); staticShadow.fill(0);

  drawGround();                    /* 公路带（其余像素 = 纯色背景留白） */
  groundZ.set(zb);                 /* 地面深度定格 */

  drawHouses();                    /* 房子 */
  shadowHouses();                  /* 房脚/体积阴影 */

  growFoliage();                   /* 树（锥树构件，含影子） */

  staticShadow.set(shadowMask);
  applyShadows(groundZ);           /* 影子落地（路面免影） */

  bakedPix.set(pix);
  bakedZ.set(zb);

  setupFallingLeaves(FOL_LEAF_SOURCES, 12);
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

  drawVillagers(t);                /* 村民 */
  drawCar(t);                      /* 汽车 */
  drawFallingLeaves(t);            /* 落叶 */

  flushShadows();
  applyShadows(groundZ);

  shadeEdges();                    /* 深度描边 */
  drawSelection(t);                /* 选中标记 */

  ctx.putImageData(image, 0, 0);
}

/* 选中某个村民时，头顶浮动箭头 */
function drawSelection(t) {
  if (!selected) return;
  const a = villagerAnchorWorld(selected);
  const p = project(a.x, a.y, a.z);
  drawArrow(p.sx, p.sy, t);
}

/* ---------------- 交互 ---------------- */

function pickAt(sx, sy) {
  return pickVillager(sx, sy);
}

canvas.addEventListener('pointerdown', e => {
  const r = canvas.getBoundingClientRect();
  const sx = (e.clientX - r.left) / r.width * W;
  const sy = (e.clientY - r.top) / r.height * H;
  selected = pickAt(sx, sy);
  if (selected) selected.greet = 1.6;
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

/* 全屏模式：窗口变化 → 重设画布（像素密度不变）→ 重烘焙 */
window.PP_ONRESIZE = function () { lastStep = -1; bake(); };
addEventListener('resize', () => {
  if (window.PP_FULLSCREEN) {
    window.PP_W = Math.ceil(innerWidth / PP_SCALE);
    window.PP_H = Math.ceil(innerHeight / PP_SCALE);
    window.PP_ORIGIN_Y = -Math.round(innerHeight / PP_SCALE * .30);
    PP_setSize(window.PP_W, window.PP_H);
  }
  fit();
});

fit();
bake();
makeVillagers();
makeCar();
requestAnimationFrame(frame);
