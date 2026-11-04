#!/usr/bin/env node
/* 解公路坐标：给定屏幕端点，反解世界坐标 (ax,ay)-(bx,by)
 *
 * 等距投影（30°）：
 *   sx = OX + (x-y)/R2 * S
 *   sy = OY + ((x+y)/R2 * 0.5) * S
 *
 * 已知屏幕斜率 m 和路在画布内的落位 → 解出世界端点。
 */
const S = 9, OX = 150, OY = 260, R2 = Math.SQRT2;
const CW = 300, CH = 520;
const proj = (x, y, z = 0) => ({
  sx: OX + (x - y) / R2 * S,
  sy: OY + ((x + y) / R2 * 0.5) * S,
});

/* 参考图实测值 */
const REF_M = 0.3918;            // 屏幕斜率
const REF_LEFT_Y = 0.70 * CH;    // 左端屏幕 y
const REF_RIGHT_Y = 0.93 * CH;   // 右端屏幕 y

/* 屏幕斜率 m = 0.5*(dx+dy)/(dx-dy)  →  dy/dx = k */
const k = (2 * REF_M - 1) / (2 * REF_M + 1);
console.log(`参考图实测屏幕斜率 m = ${REF_M}`);
console.log(`换算世界方向 dy/dx = k = ${k.toFixed(5)}\n`);

/* 起点：sx=0, sy=REF_LEFT_Y → 解 x,y */
const dxy0 = (0 - OX) * R2 / S;              // x - y
const sum0 = (REF_LEFT_Y - OY) * R2 / (0.5 * S);  // x + y
const ax = (sum0 + dxy0) / 2, ay = (sum0 - dxy0) / 2;

/* 终点：sx=CW, sy=REF_RIGHT_Y */
const dxy1 = (CW - OX) * R2 / S;
const sum1 = (REF_RIGHT_Y - OY) * R2 / (0.5 * S);
const bx = (sum1 + dxy1) / 2, by = (sum1 - dxy1) / 2;

console.log(`解出：ROAD.ax = ${ax.toFixed(2)}  ay = ${ay.toFixed(2)}`);
console.log(`      ROAD.bx = ${bx.toFixed(2)}  by = ${by.toFixed(2)}`);
console.log(`      校验 dy/dx = ${((by - ay) / (bx - ax)).toFixed(5)}  (目标 ${k.toFixed(5)})\n`);

const a = proj(ax, ay), b = proj(bx, by);
console.log(`投影验证：`);
console.log(`  起点 (${a.sx.toFixed(1)}, ${a.sy.toFixed(1)})  终点 (${b.sx.toFixed(1)}, ${b.sy.toFixed(1)})`);
console.log(`  实际屏幕斜率 = ${((b.sy - a.sy) / (b.sx - a.sx)).toFixed(4)}`);
console.log(`  画布内采样：`);
for (const sx of [0, 75, 150, 225, 300]) {
  const f = (sx - a.sx) / (b.sx - a.sx);
  const sy = a.sy + f * (b.sy - a.sy);
  console.log(`    x=${String(sx).padStart(3)} → y=${sy.toFixed(0).padStart(3)} (${(sy / CH * 100).toFixed(0)}% 高)`);
}

/* 路宽：参考图实测路面占画面宽 7.8% */
console.log(`\n路宽：参考图沥青带占画面宽 7.8%`);
for (const hw of [2.0, 2.4, 2.8, 3.2]) {
  /* 世界 halfW → 屏幕带宽：路面沿路方向，垂直方向宽度 ≈ 2*hw*sin(30°)*S? */
  /* 直接量：垂直于屏幕路线的带宽 */
  const ang = Math.atan2(b.sy - a.sy, b.sx - a.sx);
  const nx = -Math.sin(ang), ny = Math.cos(ang);
  const p1 = proj(ax + nx * hw, ay + ny * hw);
  const p2 = proj(bx + nx * hw, by + ny * hw);
  const wpx = Math.hypot(p1.sx - p2.sx, p1.sy - p2.sy);
  console.log(`  halfW=${hw} → 屏带宽 ${wpx.toFixed(1)}px = 画面宽的 ${(wpx / CW * 100).toFixed(1)}%`);
}
