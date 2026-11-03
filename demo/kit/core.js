'use strict';
/* ------------------------------------------------------------------
 * 构件库运行时（kit runtime）
 *
 * 这里是「构件」的**运行时契约**。AI 生成的构件、编辑器装配的物体、
 * 渲染器三者都通过这份契约对接。
 *
 * 契约要点（写构件前必读）：
 *   1. 构件用 KIT.register(def) 登记，def 有固定字段（见下）。
 *   2. draw(ctx, inst) 由渲染器调用。ctx 提供引擎原语 + 实例参数。
 *   3. 颜色一律走 rampOf() 生成 5 级色阶，基色写成 [r,g,b] 数组。
 *   4. 随机一律 hash(k, seed)，不用 Math.random()，保证可复现。
 *   5. 构件不直接写 zb（引擎会做），但必须用 plot/sphere/capsule/box。
 *
 * 唯一全局名：KIT。其余一律 KIT_ 前缀。
 * ------------------------------------------------------------------ */

/* 构件分类 —— 与 docs/kit/registry.md 的分节一一对应 */
const KIT_CATEGORY = {
  tree: '树',
  building: '建筑',
  plant: '草木',
  prop: '道具',
  figure: '人物',
};

const KIT = {
  /* id → 构件定义 */
  components: Object.create(null),
  /* 登记顺序（保证列表稳定） */
  order: [],

  /* ---------------- 登记 ---------------- */

  /**
   * 登记一个构件。
   * @param {object} def 构件定义，见下
   *
   * def = {
   *   id:       'stone-bridge',      // 必填，稳定英文标识
   *   name:     '石拱桥',            // 必填，中文显示名
   *   category: 'building',          // 必填，KIT_CATEGORY 的键
   *   desc:     '一段带栏杆的石拱',   // 一句话形态
   *   params: {                      // 可选，参数表
   *     span: { def: 6, min: 2, max: 14, step: .5, desc: '跨度' },
   *   },
   *   draw: (ctx, inst) => {},        // 必填，绘制入口
   *   collision: {...}                // 可选，碰撞体建议
   * }
   */
  register(def) {
    if (!def || !def.id) throw new Error('KIT.register: 缺少 id');
    if (typeof def.draw !== 'function') throw new Error(`KIT.register(${def.id}): 缺少 draw 函数`);
    if (KIT.components[def.id]) throw new Error(`KIT.register: id 重复 "${def.id}"`);

    const cat = def.category || 'prop';
    if (!KIT_CATEGORY[cat]) throw new Error(`KIT.register(${def.id}): 未知分类 "${cat}"`);

    /* 参数表补默认值：缺 def 的用 0，缺 min/max 的按 def 推 */
    const params = Object.create(null);
    const raw = def.params || {};
    for (const key of Object.keys(raw)) {
      const p = raw[key] || {};
      const dv = p.def == null ? 0 : p.def;
      params[key] = {
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
      category: cat,
      desc: def.desc || '',
      params,
      draw: def.draw,
      collision: def.collision || null,
      /* 来源标记：由 studio 保存时写入，用于文档溯源 */
      source: def.source || null,
    };
    KIT.order.push(def.id);
    return KIT.components[def.id];
  },

  /* ---------------- 查询 ---------------- */

  get(id) { return KIT.components[id] || null; },

  has(id) { return !!KIT.components[id]; },

  /** 列表，按分类和登记顺序 */
  list(category) {
    const out = [];
    for (const id of KIT.order) {
      const c = KIT.components[id];
      if (category && c.category !== category) continue;
      out.push(c);
    }
    return out;
  },

  /** 构件的默认参数实例 */
  defaults(id) {
    const c = KIT.get(id);
    if (!c) return {};
    const p = {};
    for (const k of Object.keys(c.params)) p[k] = c.params[k].def;
    return p;
  },

  /**
   * 把用户给的参数并入默认值，并夹到合法区间。
   * 越界的值被夹住而不是丢弃 —— 编辑器拖滑块时不该丢参数。
   */
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

/* 供构件内部使用的参数取值助手：p.xxx 缺省时给 def */
function kitParam(params, key, fallback) {
  const v = params[key];
  return v == null ? fallback : v;
}
