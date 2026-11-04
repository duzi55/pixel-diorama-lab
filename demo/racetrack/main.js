'use strict';
/* ------------------------------------------------------------------
 * 像素大奖赛 · 主循环
 *
 * 每帧：车与观众按深度排序 → 依次绘制 → 动态阴影 → 描边 → 提交。
 * 车永远在跑；观众根据“最近的一辆车”的距离开关欢呼动作。
 * ------------------------------------------------------------------ */

const nodes = { laps: document.getElementById('laps') };
const FPS = 30;
let raceTime = 0, lastStep = -1, lastLap = 1;

function update(dt) {
  raceTime += dt;
  updateRacers(dt);
  updateSpectators(dt);

  const lap = Math.max(...RACERS.map(lapOf));
  if (lap !== lastLap) {
    lastLap = lap;
    if (nodes.laps) nodes.laps.textContent = String(lap);
  }
}

function draw() {
  pix.set(bakedPix);
  zb.set(bakedZ);
  pendingShadows.length = 0;

  /* 等距深度排序：远（d 小）先画，近的后画 */
  const dyn = [];
  for (const s of SPECTATORS) dyn.push({ d: project(s.x, s.y, s.z).d, s });
  for (const r of RACERS) {
    const p = racerPose(r);
    dyn.push({ d: project(p.x, p.y, .5).d, r });
  }
  dyn.sort((a, b) => a.d - b.d);
  for (const it of dyn) {
    if (it.s) drawSpectator(it.s, raceTime);
    else drawRacer(it.r, raceTime);
  }

  drawLeaves(raceTime);        // 内场树冠的风动
  flushShadows();
  applyShadows(groundZ);       // 只染赛道 / 草地
  shadeEdges();
  ctx.putImageData(image, 0, 0);
}

function frame(now) {
  const step = Math.floor(now / 1000 * FPS);
  if (step !== lastStep) {
    const dt = lastStep < 0 ? 1 / FPS : Math.min(.1, (step - lastStep) / FPS);
    lastStep = step;
    update(dt);
    draw();
  }
  requestAnimationFrame(frame);
}

addEventListener('resize', fit);
fit();
bakeTrack();
makeSpectators();
requestAnimationFrame(frame);

/* 调试钩子：控制台可 __racetrack.update(1/30) 单步 */
window.__racetrack = {
  RACERS, SPECTATORS, update, draw, racerPose,
  get time() { return raceTime; },
};
