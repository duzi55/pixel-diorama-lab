'use strict';
/* ------------------------------------------------------------------
 * 方程式赛车（props.md §8b beetle-car 的“沿赛道坐标系”思路）
 *
 * 车体尺度按真实比例：车长 3.05 世界、车宽 1.76、车顶 1.0；
 * 观众人高约 1.6 → 赛车明显比人大。
 *
 * 位置用赛道弧长参数 u（0..1 一圈）驱动，而非简单椭圆角：
 * 直道与半圆弯的速度是连续的，切向永远贴合赛道。
 * ------------------------------------------------------------------ */

const RACER_DARK = [40, 44, 52], RACER_LAMP = [248, 244, 226];

const RACERS = [
  { id: 0, name: 'RED', body: [214, 72, 62], trim: [246, 240, 228], lane: -1.75, speed: .058, u: .02, total: 0 },
  { id: 1, name: 'BLUE', body: [62, 108, 190], trim: [246, 240, 228], lane: 0, speed: .052, u: .36, total: 0 },
  { id: 2, name: 'YELLOW', body: [226, 180, 52], trim: [40, 44, 52], lane: 1.75, speed: .055, u: .69, total: 0 },
];

const lapOf = r => Math.floor(r.total) + 1;

/* 沿中心线的位置 + 切向；lane 沿外法向偏移（±1.75 = 内外两条车道） */
function racerPose(r) {
  const t = trackAt(r.u);
  const len = Math.hypot(t.tx, t.ty) || 1;
  const nx = t.ty / len, ny = -t.tx / len;
  return { x: t.x + nx * r.lane, y: t.y + ny * r.lane, yaw: Math.atan2(t.ty, t.tx) };
}

function updateRacers(dt) {
  for (const r of RACERS) {
    r.u += r.speed * dt;
    r.total += r.speed * dt;
  }
}

function drawRacer(r, time) {
  const p = racerPose(r), k = 1.0;
  const fx = Math.cos(p.yaw), fy = Math.sin(p.yaw), sx = -fy, sy = fx;
  const P = (a, b, h) => [p.x + (fx * a + sx * b) * k, p.y + (fy * a + sy * b) * k, h * k];
  const ball = (a, b, h, rad, col, mode) => {
    const q = P(a, b, h);
    sphere(q[0], q[1], q[2], rad * k, col, mode);
  };
  const rod = (a0, b0, h0, a1, b1, h1, rad, col) =>
    capsule(P(a0, b0, h0), P(a1, b1, h1), rad * k, rad * k, () => col, 'solid');

  /* 单体壳：中段 + 尖车头 + 收窄车尾 */
  capsule(P(-.95, 0, .40), P(.95, 0, .40), .26 * k, .22 * k, () => r.body, 'solid');
  capsule(P(.95, 0, .40), P(1.55, 0, .33), .20 * k, .09 * k, () => r.body, 'solid');
  capsule(P(-.95, 0, .40), P(-1.45, 0, .44), .24 * k, .18 * k, () => r.body, 'solid');

  /* 两侧散热箱 */
  for (const b of [.42, -.42]) capsule(P(-.38, b, .34), P(.42, b, .34), .16 * k, .12 * k, () => r.body, 'solid');

  /* 开放式座舱 + 车手头盔 */
  ball(-.05, 0, .60, .25, RACER_DARK, 'solid');
  ball(-.05, 0, .80, .15, r.trim, 'gloss');

  /* 前翼 + 尾翼 + 尾翼支板 */
  rod(1.55, -.7, .20, 1.55, .7, .20, .055, r.trim);
  rod(-1.5, -.55, .82, -1.5, .55, .82, .06, r.trim);
  for (const b of [-.5, .5]) rod(-1.5, b, .55, -1.5, b, .84, .03, RACER_DARK);

  /* 四个外露车轮（比车身宽） */
  for (const a of [1.0, -1.0]) for (const b of [.6, -.6]) ball(a, b, .28, .28, RACER_DARK, 'rough');

  /* 车灯：两盏小圆灯在车鼻两侧 */
  for (const b of [-.18, .18]) ball(1.45, b, .36, .07, RACER_LAMP, 'gloss');

  /* 两层动态阴影 */
  castShadow(p.x, p.y, .55 * k, .95 * k, 1, .2);
  castShadow(p.x, p.y, 0, .55 * k, 2, 0);
}
