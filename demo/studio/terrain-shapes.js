'use strict';
/* ------------------------------------------------------------------
 * 编辑器 · 地形程序化生成（terrain-shapes.js）
 *
 * 用少量参数描述一整片地形，而不是让 AI 吐逐格列表：
 *   island 椭圆/超椭圆底座（带噪声抖动边缘）
 *   rect   矩形地块
 *   path   沿点列的道路（带宽 + 抖动）
 *   hill   圆形高台（在已有格子上抬升）
 *
 * AI 只需返回 shapes[]，前端程序化展开为格子 —— 输出小、可控、可复现。
 * 参考社区做法：Godot/Unity 的 terrain stamp（形状图章）思路。
 * ------------------------------------------------------------------ */

const TERRAIN_SHAPES = {
  /**
   * 应用一个地形预设。
   * @param {object} preset { base, shapes:[{type,...}] }
   * @returns {{cells:number, name:string}}
   */
  apply(preset) {
    if (!preset || !Array.isArray(preset.shapes)) {
      throw new Error('地形预设缺少 shapes 数组');
    }
    if (preset.clear !== false) TERRAIN.clear();

    for (const s of preset.shapes) {
      try { TERRAIN_SHAPES.one(s); } catch (e) { console.warn('[terrain] 形状失败', s, e); }
    }
    return { cells: TERRAIN.cells.size, name: preset.name || '未命名' };
  },

  one(s) {
    switch (s.type) {
      case 'island': return TERRAIN_SHAPES.island(s);
      case 'rect': return TERRAIN_SHAPES.rect(s);
      case 'path': return TERRAIN_SHAPES.path(s);
      case 'hill': return TERRAIN_SHAPES.hill(s);
      default: throw new Error('未知形状类型: ' + s.type);
    }
  },

  /* 超椭圆岛：exponent=2 椭圆，4 方一点的椭圆，6 更方 */
  island(s) {
    const cx = s.cx | 0, cy = s.cy | 0;
    const rx = Math.max(1, s.rx || 6), ry = Math.max(1, s.ry || s.rx || 6);
    const exp = s.exp == null ? 4 : s.exp;
    const mat = s.mat || 'grass';
    const z = s.z || 0;
    const wob = s.wobble == null ? 0.12 : s.wobble;
    const R = TERRAIN.R;

    for (let gx = Math.max(-R, cx - Math.ceil(rx * 1.4)); gx <= Math.min(R, cx + Math.ceil(rx * 1.4)); gx++) {
      for (let gy = Math.max(-R, cy - Math.ceil(ry * 1.4)); gy <= Math.min(R, cy + Math.ceil(ry * 1.4)); gy++) {
        if (Math.abs(gx) > R || Math.abs(gy) > R) continue;
        const nx = (gx + 0.5 - cx) / rx, ny = (gy + 0.5 - cy) / ry;
        let e = Math.pow(Math.pow(Math.abs(nx), exp) + Math.pow(Math.abs(ny), exp), 1 / exp);
        e += (noise(gx * 0.9 + 11, gy * 0.9 + 7) - 0.5) * wob;
        if (e > 1) continue;
        /* 边缘溶解：越靠外越可能丢格（docs/kit/scene.md §2 的经典做法） */
        if (e > 0.9 && hash(gx * 7, gy * 13) < (e - 0.9) / 0.12) continue;
        TERRAIN.set(gx, gy, mat, z);
      }
    }
  },

  rect(s) {
    const x0 = s.x0 | 0, y0 = s.y0 | 0, x1 = s.x1 | 0, y1 = s.y1 | 0;
    const mat = s.mat || 'stone', z = s.z || 0;
    for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
      TERRAIN.set(gx, gy, mat, z);
    }
  },

  /* 路：沿折线撒圆盘，宽度按格计，边缘抖动 */
  path(s) {
    const pts = s.points || [];
    if (pts.length < 2) return;
    const mat = s.mat || 'stone';
    const w = s.width == null ? 1.2 : s.width;
    const z = s.z == null ? null : s.z;      /* null = 跟随已有格高度 */

    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const len = Math.hypot(bx - ax, by - ay);
      const steps = Math.max(1, Math.ceil(len * 3));
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
        const r = Math.ceil(w);
        for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
          const gx = Math.floor(px + dx), gy = Math.floor(py + dy);
          const d = Math.hypot(gx + 0.5 - px, gy + 0.5 - py);
          const edge = w * (0.85 + noise(gx * 1.1, gy * 1.1) * 0.3);
          if (d > edge) continue;
          const old = TERRAIN.get(gx, gy);
          if (!old) continue;                 /* 路只铺在已有地面上 */
          TERRAIN.set(gx, gy, mat, z == null ? (old.z || 0) : z);
        }
      }
    }
  },

  /* 高台：圆形范围内按 smoothstep 抬升 */
  hill(s) {
    const cx = s.cx || 0, cy = s.cy || 0;
    const r = Math.max(1, s.r || 3);
    const h = s.h == null ? 0.75 : s.h;
    const falloff = s.falloff == null ? 1.4 : s.falloff;   /* 越大越陡 */
    const R = TERRAIN.R;

    for (let gx = Math.max(-R, Math.floor(cx - r)); gx <= Math.min(R, Math.ceil(cx + r)); gx++) {
      for (let gy = Math.max(-R, Math.floor(cy - r)); gy <= Math.min(R, Math.ceil(cy + r)); gy++) {
        const cell = TERRAIN.get(gx, gy);
        if (!cell) continue;
        const d = Math.hypot(gx + 0.5 - cx, gy + 0.5 - cy);
        if (d > r) continue;
        const t = 1 - d / r;
        const e = Math.pow(t, falloff);
        const nz = (cell.z || 0) + h * e;
        cell.z = Math.min(3, Math.round(nz * 4) / 4);
      }
    }
  },
};
