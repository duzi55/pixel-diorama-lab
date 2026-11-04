'use strict';
/* ------------------------------------------------------------------
 * 预览沙箱 · 精简 KIT 运行时与通用材质辅助函数
 *
 * 与 demo/kit/core.js 的 register 契约一致，同时内置建筑常用材质函数，
 * 确保 AI 生成的构件或构件库中已有的任意构件都能在沙箱内独立运行。
 * ------------------------------------------------------------------ */

const KIT_CATEGORY = {
  tree: '树', building: '建筑', plant: '草木', prop: '道具', figure: '人物',
};

const KIT = {
  components: Object.create(null),
  order: [],

  register(def) {
    if (!def || !def.id) throw new Error('KIT.register: 缺少 id');
    if (typeof def.draw !== 'function') throw new Error(`KIT.register(${def.id}): 缺少 draw 函数`);
    if (KIT.components[def.id]) return KIT.components[def.id];

    const params = Object.create(null);
    for (const k of Object.keys(def.params || {})) {
      const p = def.params[k] || {};
      const dv = p.def == null ? 0 : p.def;
      params[k] = {
        def: dv,
        min: p.min == null ? dv : p.min,
        max: p.max == null ? dv : p.max,
        step: p.step == null ? 1 : p.step,
        desc: p.desc || '',
      };
    }

    KIT.components[def.id] = {
      id: def.id,
      name: def.name || def.id,
      category: def.category || 'prop',
      desc: def.desc || '',
      params,
      draw: def.draw,
      collision: def.collision || null,
    };
    KIT.order.push(def.id);
    return KIT.components[def.id];
  },

  get(id) { return KIT.components[id] || null; },

  list() { return KIT.order.map(i => KIT.components[i]); },

  defaults(id) {
    const c = KIT.get(id);
    const p = {};
    if (!c) return p;
    for (const k of Object.keys(c.params)) p[k] = c.params[k].def;
    return p;
  },

  resolve(id, over) {
    const c = KIT.get(id);
    const base = KIT.defaults(id);
    if (!c || !over) return base;
    for (const k of Object.keys(c.params)) {
      if (over[k] == null) continue;
      const v = Number(over[k]);
      if (!Number.isFinite(v)) continue;
      base[k] = Math.min(c.params[k].max, Math.max(c.params[k].min, v));
    }
    return base;
  },
};

/* 构件配色基色 */
const KIT_WOOD = [116, 88, 60];
const KIT_WOOD_DARK = [92, 68, 46];
const KIT_WOOD_LIT = [140, 110, 78];
const KIT_SHINGLE = [122, 102, 74];
const KIT_TILE = [166, 92, 48];
const KIT_MOSS = [92, 108, 44];
const KIT_STONE = [132, 126, 114];
const KIT_CHIMNEY = [126, 110, 96];
const KIT_DOOR = [96, 64, 42];
const KIT_SKY = rgb(250, 246, 232);

/* 通用建筑材质函数 */
function kitWoodWall(a, z, base, seed) {
  const plank = Math.floor(a * 2.6);
  const inPlank = a * 2.6 - plank;
  const seam = inPlank > .88 ? -1 : 0;
  const tone = hash(plank, seed);
  const foot = z < .55 ? -1 : 0;
  const sun = z > 1.9 ? 1 : 0;
  const level = clamp(base + (tone > .78 ? 1 : tone < .16 ? -1 : 0) + seam + foot + sun, 0, 4);
  return rampOf(KIT_WOOD)[level];
}

function kitMasonryWall(a, z, base, ramp, seed) {
  const row = Math.floor(z * 2.8);
  const xo = a + (row & 1) * 0.34;
  const col = Math.floor(xo * 1.5);
  const fx = xo * 1.5 - col, fz = z * 2.8 - row;
  if (fx < 0.08 || fz < 0.11) return ramp[0];
  const tone = hash(col * 31 + row * 7, seed);
  const foot = z < 0.38 ? -1 : 0;
  const lv = clamp(base + (tone > 0.72 ? 1 : tone < 0.22 ? -1 : 0) + foot, 1, 4);
  return ramp[lv];
}

function kitShingle(x, y, q, seed) {
  const row = Math.floor(q * 3.4) % 2;
  const wear = hash(x * 3 | 0, y * 9 | 0) > .86 ? -1 : 0;
  const base = (y > 0 ? 3 : 1) + row + wear;
  return rampOf(KIT_SHINGLE)[clamp(base, 0, 4)];
}

function shedRoofDeck(ctx, xa, xb, ya, yb, zAt, ramp) {
  const sx = 0.06, sy = 0.055;
  for (let y = ya; y <= yb + 1e-6; y += sy) {
    const z = zAt(y);
    const front = (y - ya) < 0.14 ? 1 : 0;
    for (let x = xa; x <= xb + 1e-6; x += sx) {
      const band = Math.floor((x - xa) / 0.26) & 1;
      const rust = ctx.hash((x * 31 + y * 17) | 0, ctx.seed) > 0.965 ? 1 : 0;
      ctx.plot(x, y, z, ramp[(band ? 3 : 2) - front - rust]);
    }
  }
}

function shedRoofRim(ctx, xa, xb, ya, yb, zAt, drop, ramp) {
  const s = 0.05;
  const zA = zAt(ya), zB = zAt(yb);
  for (let x = xa; x <= xb + 1e-6; x += s) {
    for (let z = zA - drop; z <= zA + 1e-6; z += s) ctx.plot(x, ya, z, ramp[0]);
    for (let z = zB - drop; z <= zB + 1e-6; z += s) ctx.plot(x, yb, z, ramp[0]);
  }
  for (let y = ya; y <= yb + 1e-6; y += s) {
    const zT = zAt(y);
    for (let z = zT - drop; z <= zT + 1e-6; z += s) {
      ctx.plot(xa, y, z, ramp[1]);
      ctx.plot(xb, y, z, ramp[1]);
    }
  }
}
