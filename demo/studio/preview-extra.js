'use strict';
/* ------------------------------------------------------------------
 * 预览沙箱 · 碰撞体线框（从 preview.js 拆出，控制单文件 ≤500 行）
 *
 * 用像素虚线画 box / cylinder 的棱线。跟随 PV.rot（yaw），
 * 三轴倾斜时只显示平面投影（辅助线，不参与 3D 旋转）。
 * ------------------------------------------------------------------ */

function PV_drawCollision() {
  const c = PV.collision;
  if (!c) return;
  const cy = rgb(120, 210, 255);
  const cs = Math.cos(PV.rot), sn = Math.sin(PV.rot);
  const un = (x, y) => [x * cs + y * sn, -x * sn + y * cs];
  const BACK = [[-1, 0], [0, -1]];

  if (c.type === 'cylinder') {
    const r = c.radius || .3, h = c.height || 1, seg = 24;
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * 6.283, a1 = (i + 1) / seg * 6.283;
      const u0 = un(Math.cos(a0) * r, Math.sin(a0) * r);
      const u1 = un(Math.cos(a1) * r, Math.sin(a1) * r);
      const p0 = project(u0[0], u0[1], 0), p1 = project(u1[0], u1[1], 0);
      PV_line(p0.sx, p0.sy, p1.sx, p1.sy, cy, true);
      const q0 = project(u0[0], u0[1], h), q1 = project(u1[0], u1[1], h);
      PV_line(q0.sx, q0.sy, q1.sx, q1.sy, cy, true);
    }
    for (const [dx, dy] of BACK) {
      const p0 = project(dx * r, dy * r, 0), q0 = project(dx * r, dy * r, h);
      PV_line(p0.sx, p0.sy, q0.sx, q0.sy, cy, true);
    }
  } else {
    const w = (c.w || c.width || 1) / 2, d = (c.d || c.depth || 1) / 2, h = c.h || c.height || 1;
    const corners = [[-w, -d], [w, -d], [w, d], [-w, d]];
    for (let i = 0; i < 4; i++) {
      const a = un(corners[i][0], corners[i][1]);
      const b = un(corners[(i + 1) % 4][0], corners[(i + 1) % 4][1]);
      const p0 = project(a[0], a[1], 0), p1 = project(b[0], b[1], 0);
      PV_line(p0.sx, p0.sy, p1.sx, p1.sy, cy, true);
      const q0 = project(a[0], a[1], h), q1 = project(b[0], b[1], h);
      PV_line(q0.sx, q0.sy, q1.sx, q1.sy, cy, true);
      PV_line(p0.sx, p0.sy, q0.sx, q0.sy, cy, true);
    }
  }
}
