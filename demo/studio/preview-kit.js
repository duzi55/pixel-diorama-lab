'use strict';
/* ------------------------------------------------------------------
 * 预览沙箱 · 精简 KIT 运行时
 *
 * 只包含 register / get / resolve —— 预览一个构件不需要全量构件库。
 * 与 demo/kit/core.js 的 register 契约保持一致，AI 生成的代码可直接跑。
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

/* 预览用的配色（构件可能引用） */
const KIT_WOOD = [116, 88, 60];
const KIT_WOOD_DARK = [92, 68, 46];
const KIT_WOOD_LIT = [140, 110, 78];
const KIT_SHINGLE = [122, 102, 74];
const KIT_TILE = [166, 92, 48];
const KIT_MOSS = [92, 108, 44];
const KIT_STONE = [132, 126, 114];
const KIT_CHIMNEY = [126, 110, 96];
const KIT_DOOR = [96, 64, 42];
