'use strict';
/* ------------------------------------------------------------------
 * 编辑器 · 视图覆盖层（editor-view.js）
 *
 * 从 editor.js 拆出的画布辅助绘制：
 *   ED_drawCollision      碰撞体虚线线框（选中物体黄色实线高亮）
 *   ED_drawAllCollisions  全部物体的碰撞体
 *   ED_drawGhost          放置模式下的幽灵预览
 *   ED_line               像素直线（可虚线）
 * ------------------------------------------------------------------ */

function ED_drawCollision(o, isSelected) {
  const c = o.collision;
  if (!c) return;
  const col = isSelected ? rgb(255, 214, 70) : rgb(120, 210, 255);
  const ox = o.x, oy = o.y, oz = o.z || 0;
  const rot = o.rot || 0;
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const un = (x, y) => [ox + x * cs + y * sn, oy - x * sn + y * cs];
  const seg = 20;
  const BACK = [[-1, 0], [0, -1]];

  if (c.type === 'cylinder') {
    const r = c.radius || .3, h = c.height || 1;
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * 6.283, a1 = (i + 1) / seg * 6.283;
      const p0 = un(Math.cos(a0) * r, Math.sin(a0) * r), p1 = un(Math.cos(a1) * r, Math.sin(a1) * r);
      const a = project(p0[0], p0[1], oz), b = project(p1[0], p1[1], oz);
      ED_line(a.sx, a.sy, b.sx, b.sy, col, !isSelected);
      const a2 = project(p0[0], p0[1], oz + h), b2 = project(p1[0], p1[1], oz + h);
      ED_line(a2.sx, a2.sy, b2.sx, b2.sy, col, !isSelected);
    }
    for (const [dx, dy] of BACK) {
      const p0 = un(dx * r, dy * r);
      const a = project(p0[0], p0[1], oz), a2 = project(p0[0], p0[1], oz + h);
      ED_line(a.sx, a.sy, a2.sx, a2.sy, col, !isSelected);
    }
  } else {
    const w = (c.w || c.width || 1) / 2, d = (c.d || c.depth || 1) / 2, h = c.h || c.height || 1;
    const corners = [[-w, -d], [w, -d], [w, d], [-w, d]];
    for (let i = 0; i < 4; i++) {
      const a0 = corners[i], b0 = corners[(i + 1) % 4];
      const p0 = un(a0[0], a0[1]), p1 = un(b0[0], b0[1]);
      const a = project(p0[0], p0[1], oz), b = project(p1[0], p1[1], oz);
      ED_line(a.sx, a.sy, b.sx, b.sy, col, !isSelected);
      const a2 = project(p0[0], p0[1], oz + h), b2 = project(p1[0], p1[1], oz + h);
      ED_line(a2.sx, a2.sy, b2.sx, b2.sy, col, !isSelected);
    }
    for (const [dx, dy] of BACK) {
      const p0 = un(dx * w, dy * d);
      const a = project(p0[0], p0[1], oz), a2 = project(p0[0], p0[1], oz + h);
      ED_line(a.sx, a.sy, a2.sx, a2.sy, col, !isSelected);
    }
  }
}

function ED_drawAllCollisions() {
  for (const o of ED.objects) {
    if (o !== ED.selected) ED_drawCollision(o, false);
  }
  if (ED.selected) ED_drawCollision(ED.selected, true);
}

function ED_drawGhost() {
  const comp = KIT.get(ED.placing);
  if (!comp || !ED.ghost) return;
  const o = {
    kind: ED.placing, x: ED.ghost.x, y: ED.ghost.y, z: TERRAIN.heightAt(ED.ghost.x, ED.ghost.y),
    rot: ED.rot || 0, params: KIT.defaults(ED.placing), seed: 1,
  };
  ED_drawObject(o);
}

function ED_line(x0, y0, x1, y1, color, dash) {
  const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= n; i++) {
    if (dash && (i & 1)) continue;
    const x = Math.round(x0 + (x1 - x0) * i / n);
    const y = Math.round(y0 + (y1 - y0) * i / n);
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    pix[y * W + x] = color;
  }
}

function ED_esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

