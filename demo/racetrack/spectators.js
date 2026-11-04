'use strict';
/* ------------------------------------------------------------------
 * 观众（docs/kit/crowd.md §5 姿态合成 + docs/kit/figures.md 骨架）
 *
 * 与参考项目的「按主角距离欢呼」同一套思路，把主角换成最近的一辆赛车：
 *   距离 → cheer(0..1) → 手臂角度 / 起跳 / 身体后仰
 *
 * 站位固定（crowd 变体），不做避让：看台是排座，围栏外是散站。
 * 配色直接复用 kit/crowd.js 的候选色表，hash 选色保证可复现。
 * ------------------------------------------------------------------ */

const SPECTATORS = [];
const FAN_SCALE_STAND = .85, FAN_SCALE_GROUND = .9;

/* 只画骨头、不登记阴影：40 个人 × 每帧的阴影采样会吃掉大半预算 */
const crowdAdd = (a, b, r0, r1, f) => capsule(a, b, r0, r1, f, 'solid');

function makeFan(x, y, z, seed, onStand) {
  const pick = (list, s) => list[Math.floor(hash(seed + 3, s) * list.length)];
  const shirt = pick(KIT_CROWD_SHIRTS, 41);
  return {
    x, y, z, onStand, seed,
    cheer: 0,
    yaw: y < 0 ? Math.PI / 2 : -Math.PI / 2,
    phase: hash(seed, 82) * 6.28,
    scale: onStand ? FAN_SCALE_STAND : FAN_SCALE_GROUND,
    palette: {
      shirt,
      stripe: hash(seed, 48) > .75 ? [244, 240, 228] : shirt,
      legs: pick(KIT_CROWD_LEGS, 49),
      hair: pick(KIT_CROWD_HAIR, 50),
      skin: pick(KIT_CROWD_SKIN, 51),
    },
  };
}

function makeSpectators() {
  SPECTATORS.length = 0;

  /* 主看台：4 排 × 10 人，站在台阶面上，面朝主直道（+y） */
  const n = 10;
  for (let row = 0; row < STAND.rows; row++) {
    const z = STAND.rise * (row + 1);
    const y = STAND.front - row * STAND.gap - STAND.depth * .5;
    for (let i = 0; i < n; i++) {
      const x = STAND.x0 + .9 + i * (STAND.x1 - STAND.x0 - 1.8) / (n - 1)
        + (hash(row * 10 + i, 81) - .5) * .4;
      SPECTATORS.push(makeFan(x, y, z, row * 10 + i, true));
    }
  }

  /* 前侧直道外侧：草坡上散站 10 人 */
  for (let k = 0; k < 10; k++) {
    const x = -9 + k * 2 + (hash(k, 83) - .5) * 1.1;
    const y = CURVE_R + TRACK_HALF + WALL_OFF + 1.6 + (hash(k, 84) - .5) * 1.1;
    SPECTATORS.push(makeFan(x, y, 0, 40 + k, false));
  }
}

function updateSpectators(dt) {
  for (const s of SPECTATORS) {
    /* 最近赛车：距离决定欢呼强度 */
    let best = 1e9, bx = 0, by = 0;
    for (const r of RACERS) {
      const p = racerPose(r);
      const d = Math.hypot(p.x - s.x, p.y - s.y);
      if (d < best) { best = d; bx = p.x; by = p.y; }
    }
    /* 主场看台离赛道更近、更热情：阈值略宽；草坡散客稍收敛 */
    const near = s.onStand ? 6 : 5, span = s.onStand ? 10 : 9;
    const want = clamp(1 - (best - near) / span, 0, 1);
    s.cheer += (want - s.cheer) * Math.min(1, dt * 5);

    /* 视线追车：角度差归一化到 [-π, π]，永远走最短弧 */
    let diff = Math.atan2(by - s.y, bx - s.x) - s.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    s.yaw += diff * Math.min(1, dt * 4);
  }
}

function drawSpectator(s, time) {
  const c = s.cheer;
  const beat = Math.floor(time * 7 + s.phase * 3) % 2;
  const arm = .08 + c * (2.6 + beat * .32);
  const pose = {
    z: s.z + c * beat * .12,
    scale: s.scale,
    armR: arm + (1 - c) * Math.sin(time * 1.1 + s.phase) * .05,
    armL: arm - (1 - c) * Math.cos(time * 1.3 + s.phase) * .05,
    stance: .1 + c * .08,
    lean: -c * .16,
  };
  figure(s.x, s.y, s.yaw, pose, s.palette, crowdAdd);

  /* 围栏外的观众才投接触影；看台上的影子落在台阶上，引擎只染 ground，跳过 */
  if (!s.onStand) castShadow(s.x, s.y, .05, .3, 1, .25);
}
