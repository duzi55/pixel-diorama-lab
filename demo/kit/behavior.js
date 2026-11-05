'use strict';
/* ------------------------------------------------------------------
 * 构件行为运行时（behavior runtime）
 *
 * 构件 = 外形（draw）+ 行为（behavior）。外形决定长什么样，
 * 行为决定怎么动、怎么被点、被砍、被风吹。两者可被 AI 单独改写。
 *
 * 契约见 docs/modules/behavior.md。
 *
 * 唯一全局名：KIT_BEHAVIOR。其余一律 KIT_BH_ 前缀。
 * ------------------------------------------------------------------ */

const KIT_BH_CATEGORY = {
  ambient: '环境',     // 不需要交互，一直在发生（风摆、旋转、闪烁）
  active: '主动',      // 自己有目标地动（游荡、巡逻）
  reaction: '反应',    // 被点击/被砍/受惊才触发
  state: '状态',       // 长期状态变化（生长、枯萎）
};

/* 分类兜底：构件没写 behavior 字段时，按分类给一套默认行为与可挂行为。
   这样"每个构件都有交互逻辑"成立，同时具体构件仍可显式覆盖。 */
const KIT_BH_CATEGORY_DEFAULT = {
  tree: ['sway'],
  plant: ['sway'],
  building: [],
  structure: [],
  prop: [],
  vehicle: [],
  figure: ['greet'],
  animal: ['wander'],
  effect: ['flicker'],
};
const KIT_BH_CATEGORY_ALLOW = {
  tree: ['sway', 'chop', 'burn', 'shake'],
  plant: ['sway', 'shake', 'burn'],
  building: ['flicker', 'burn', 'shake'],
  structure: ['sway', 'shake'],
  prop: ['flicker', 'shake', 'burn'],
  vehicle: ['spin', 'bob', 'shake'],
  figure: ['greet', 'wander', 'flee'],
  animal: ['wander', 'flee', 'greet'],
  effect: ['flicker', 'bob'],
};

const KIT_BEHAVIOR = {
  defs: Object.create(null),
  order: [],

  register(def) {
    if (!def || !def.id) throw new Error('KIT_BEHAVIOR.register: 缺少 id');
    if (KIT_BEHAVIOR.defs[def.id]) throw new Error(`KIT_BEHAVIOR: id 重复 "${def.id}"`);

    const params = Object.create(null);
    for (const key of Object.keys(def.params || {})) {
      const p = def.params[key] || {};
      const dv = p.def == null ? 0 : p.def;
      params[key] = {
        def: dv,
        min: p.min == null ? dv : p.min,
        max: p.max == null ? dv : p.max,
        step: p.step == null ? 1 : p.step,
        desc: p.desc || '',
        en: p.en || '',
      };
    }

    KIT_BEHAVIOR.defs[def.id] = {
      id: def.id,
      label: def.label || def.id,
      category: def.category || 'ambient',
      desc: def.desc || '',
      params,
      init: def.init || null,
      tick: def.tick || null,
      event: def.event || null,
      draw: def.draw || null,
    };
    KIT_BEHAVIOR.order.push(def.id);
    return KIT_BEHAVIOR.defs[def.id];
  },

  get(id) { return KIT_BEHAVIOR.defs[id] || null; },

  list(category) {
    return KIT_BEHAVIOR.order
      .map(id => KIT_BEHAVIOR.defs[id])
      .filter(d => !category || d.category === category);
  },

  /** 行为参数补默认值并夹区间 */
  resolve(id, over) {
    const d = KIT_BEHAVIOR.get(id);
    const base = {};
    if (!d) return base;
    for (const k of Object.keys(d.params)) base[k] = d.params[k].def;
    if (!over) return base;
    for (const k of Object.keys(d.params)) {
      if (over[k] == null) continue;
      const v = Number(over[k]);
      if (!Number.isFinite(v)) continue;
      base[k] = Math.min(d.params[k].max, Math.max(d.params[k].min, v));
    }
    return base;
  },

  /** 构件允许的行为列表（编辑器/AI 用）；没声明时回落到分类兜底 */
  allowed(kindOrComp) {
    const c = typeof kindOrComp === 'string' ? KIT.get(kindOrComp) : kindOrComp;
    if (!c) return [];
    const spec = c.behavior || null;
    const ids = spec
      ? (spec.allow || (spec.default || []).map(b => b.id))
      : (KIT_BH_CATEGORY_ALLOW[c.category] || []);
    return ids.map(id => KIT_BEHAVIOR.get(id)).filter(Boolean);
  },

  /**
   * 给实例挂行为。场景里显式给了 behaviors 就用场景的，否则用构件默认。
   * 重复调用无副作用（已挂载则跳过）。
   */
  attach(inst) {
    if (!inst) return inst;
    if (inst.behaviors) return inst;
    const comp = KIT.get(inst.kind);
    const spec = (comp && comp.behavior) || null;

    let list = [];
    if (Array.isArray(inst.behaviorSpec)) {
      /* 场景显式指定（空数组 = 关掉全部行为） */
      list = inst.behaviorSpec;
    } else if (spec) {
      list = spec.default || [];
    } else if (comp) {
      /* 没声明 behavior：按分类兜底（树摇、人物招手…） */
      list = (KIT_BH_CATEGORY_DEFAULT[comp.category] || []).map(id => ({ id }));
    }

    /* 只允许构件声明过的行为；没声明时用分类白名单，避免场景/AI 乱挂 */
    const allowIds = spec && spec.allow
      ? spec.allow
      : (comp ? (KIT_BH_CATEGORY_ALLOW[comp.category] || []) : []);
    const allow = allowIds.length ? new Set(allowIds) : null;
    inst.behaviors = list
      .filter(b => b && b.id && KIT_BEHAVIOR.get(b.id))
      .filter(b => !allow || allow.has(b.id))
      .map(b => ({ id: b.id, params: KIT_BEHAVIOR.resolve(b.id, b.params) }));

    inst.state = inst.state || {};
    inst.anim = inst.anim || {};
    KIT_BH_resetAnim(inst);

    for (const b of inst.behaviors) {
      const d = KIT_BEHAVIOR.get(b.id);
      if (d && d.init) d.init(inst, b, KIT_BH_WORLD);
    }
    return inst;
  },

  /** 每帧推进：先清零瞬时 anim，再让各行为叠加 */
  tick(inst, dt, world) {
    if (!inst) return;
    KIT_BEHAVIOR.attach(inst);
    const w = world || KIT_BH_WORLD;
    KIT_BH_resetAnim(inst);
    for (const b of inst.behaviors) {
      const d = KIT_BEHAVIOR.get(b.id);
      if (d && d.tick) d.tick(inst, b, dt, w);
    }
    if (inst.anim.hidden) inst.anim.hidden = true;   // 行为可设置隐藏
  },

  /** 派发事件（点击、砍、风、雨…） */
  event(inst, ev, world) {
    if (!inst) return false;
    KIT_BEHAVIOR.attach(inst);
    let handled = false;
    for (const b of inst.behaviors) {
      const d = KIT_BEHAVIOR.get(b.id);
      if (d && d.event && d.event(inst, b, ev, world || KIT_BH_WORLD)) handled = true;
    }
    return handled;
  },

  /** 行为自己的附加绘制（树桩、烟雾、碎片），在构件 draw 之后调用 */
  draw(ctx, inst, world) {
    if (!inst || !inst.behaviors) return;
    for (const b of inst.behaviors) {
      const d = KIT_BEHAVIOR.get(b.id);
      if (d && d.draw) d.draw(ctx, inst, b, world || KIT_BH_WORLD);
    }
  },
};

/* 全局世界状态：场景每帧更新 */
const KIT_BH_WORLD = {
  t: 0,
  dt: 0,
  wind: { x: 1, y: 0, strength: 0, gust: 0 },
  handlers: [],
  /** 行为之间通信（冒烟、掉落物生成） */
  emit(type, inst, data) {
    for (const fn of this.handlers) fn(type, inst, data);
  },
};

function KIT_BH_resetAnim(inst) {
  const a = inst.anim || (inst.anim = {});
  a.dx = 0; a.dy = 0;
  a.rot = 0;
  a.scale = 1;
  a.z = 0;
  a.hidden = false;
  /* ★ kind 不清：树变树桩是持久状态 */
}

/* ==================================================================
 * 内置行为
 * ================================================================== */

/* 随风摆动：树冠、芦苇、晾衣绳都用它 */
KIT_BEHAVIOR.register({
  id: 'sway',
  label: '随风摆动',
  category: 'ambient',
  desc: '随全局风势左右摆，摆幅按实例高度加权（根部不动）',
  params: {
    amp:   { def: 2.0, min: 0, max: 8, step: .25, desc: '摆幅', en: 'amplitude' },
    freq:  { def: 1.0, min: .2, max: 3, step: .1, desc: '频率', en: 'frequency' },
    lag:   { def: .5, min: 0, max: 1, step: .05, desc: '迟滞（越大越柔和）', en: 'lag' },
  },
  init(inst) {
    inst.state.sway = {
      phase: hash(inst.seed || 1, 811) * 6.283,
      prev: 0,
    };
  },
  tick(inst, bh, dt, world) {
    const s = inst.state.sway || (inst.state.sway = { phase: 0, prev: 0 });
    const w = world.wind || { strength: 0, gust: 0 };
    const p = bh.params;
    const sway = Math.sin(world.t * p.freq * 1.15 + s.phase) * (.65 + w.strength * .55)
      + (w.gust || 0) * .6;
    const target = sway * p.amp / Math.max(4, S);
    s.prev += (target - s.prev) * Math.min(1, dt * (8 - p.lag * 5));
    inst.anim.dx = s.prev;
    inst.anim.dy = Math.sin(world.t * p.freq * .7 + s.phase * 1.7) * p.amp * .012;
    inst.anim.rot = s.prev * .06;
  },
});

/* 被砍：点几下 → 倒下 → 留树桩 */
KIT_BEHAVIOR.register({
  id: 'chop',
  label: '砍伐',
  category: 'reaction',
  desc: '点击累计刀数，砍倒后原地留下树桩；再点树干可继续砍',
  params: {
    hits:  { def: 4, min: 1, max: 10, step: 1, desc: '砍倒所需点击次数', en: 'hits' },
    stump: { def: 1, min: 0, max: 1, step: 1, desc: '砍倒后留树桩', en: 'stump' },
    regrow:{ def: 0, min: 0, max: 1, step: 1, desc: '砍倒后重新长出来', en: 'regrow' },
  },
  init(inst, bh) {
    inst.state.chop = { hits: 0, shake: 0, down: false, downAt: 0 };
  },
  event(inst, bh, ev) {
    if (!ev || ev.type !== 'click') return false;
    const st = inst.state.chop;
    if (!st || st.down) return false;
    st.hits++;
    st.shake = .35;
    if (st.hits >= bh.params.hits) {
      st.down = true;
      st.downAt = KIT_BH_WORLD.t;
      inst.anim.kind = bh.params.stump ? '__stump__' : 'none';
      KIT_BH_WORLD.emit('fell', inst, { kind: inst.kind });
    }
    return true;
  },
  tick(inst, bh, dt, world) {
    const st = inst.state.chop;
    if (!st) return;
    if (st.down) {
      /* regrow：过一段时间原地复活 */
      if (bh.params.regrow && world.t - st.downAt > 12) {
        st.down = false; st.hits = 0; st.downAt = 0;
        inst.anim.kind = null;
      }
      return;
    }
    if (st.shake > 0) {
      st.shake = Math.max(0, st.shake - dt);
      inst.anim.rot += Math.sin(st.shake * 60) * st.shake * .06;
    }
  },
  draw(ctx, inst, bh) {
    const st = inst.state.chop;
    if (!st || !st.down || !bh.params.stump) return;
    /* 树桩：矮圆台 + 年轮（全部用世界坐标，异常走 ctx.plot 的原语） */
    const x = inst.x, y = inst.y;
    ctx.capsule([x, y, 0], [x, y, .34], .34, .30, () => [96, 66, 42], 'rough');
    ctx.plot(x, y, .35, rgb(...[168, 128, 82]));
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * 6.283;
      ctx.plot(x + Math.cos(a) * .12, y + Math.sin(a) * .12, .36, rgb(...[128, 92, 58]));
    }
  },
});

/* 点击招手：人物构件用 */
KIT_BEHAVIOR.register({
  id: 'greet',
  label: '点击招手',
  category: 'reaction',
  desc: '被点击时高兴地跳一下并冒出一个感叹号',
  params: {
    height: { def: .22, min: .05, max: .8, step: .05, desc: '跳起高度', en: 'hop height' },
    time:   { def: 1.1, min: .3, max: 3, step: .1, desc: '持续秒数', en: 'duration' },
  },
  init(inst) { inst.state.greet = { t: -99 }; },
  event(inst, bh, ev, world) {
    if (!ev || ev.type !== 'click') return false;
    inst.state.greet.t = world.t;
    return true;
  },
  tick(inst, bh, dt, world) {
    const g = inst.state.greet;
    if (!g || world.t - g.t > bh.params.time) return;
    const u = (world.t - g.t) / bh.params.time;
    inst.anim.z += Math.abs(Math.sin(u * Math.PI * 2)) * bh.params.height * (1 - u);
    inst.anim.rot += Math.sin(u * 18) * .05;
  },
});

/* 灯光闪烁 */
KIT_BEHAVIOR.register({
  id: 'flicker',
  label: '灯光闪烁',
  category: 'ambient',
  desc: '不规则地明灭，像钨丝灯接触不良',
  params: {
    rate:  { def: .35, min: .02, max: 1, step: .02, desc: '闪烁频率', en: 'rate' },
    depth: { def: 1, min: 0, max: 1, step: .1, desc: '熄灭时长占比', en: 'off ratio' },
  },
  tick(inst, bh, dt, world) {
    const k = Math.floor(world.t * bh.params.rate * 10);
    const r = hash(k, (inst.seed || 1) + 401);
    if (r < bh.params.depth * .35) inst.anim.hidden = true;
  },
});

/* 游荡：小范围随机走动（动物、闲逛的人） */
KIT_BEHAVIOR.register({
  id: 'wander',
  label: '游荡',
  category: 'active',
  desc: '在出生点附近随机走动，走一段停一段',
  params: {
    radius: { def: 2.4, min: .5, max: 8, step: .2, desc: '活动半径', en: 'radius' },
    speed:  { def: .5, min: .1, max: 2, step: .05, desc: '移动速度', en: 'speed' },
    pause:  { def: 2.2, min: .3, max: 8, step: .2, desc: '停留秒数', en: 'pause' },
  },
  init(inst, bh) {
    inst.state.wander = {
      hx: inst.x, hy: inst.y,
      tx: inst.x, ty: inst.y,
      wait: hash(inst.seed || 1, 911) * bh.params.pause,
      yaw: hash(inst.seed || 1, 912) * 6.283,
    };
  },
  tick(inst, bh, dt, world) {
    const s = inst.state.wander;
    if (!s) return;
    const dx = s.tx - inst.x, dy = s.ty - inst.y;
    const d = Math.hypot(dx, dy);
    if (d < .12) {
      if ((s.wait -= dt) <= 0) {
        const a = hash(Math.floor(world.t * 7) + (inst.seed || 1), 913) * 6.283;
        const r = .4 + hash(Math.floor(world.t * 7), 914) * bh.params.radius;
        s.tx = s.hx + Math.cos(a) * r;
        s.ty = s.hy + Math.sin(a) * r;
        s.wait = bh.params.pause * (.5 + hash(Math.floor(world.t * 3), 915));
      }
      return;
    }
    const step = Math.min(d, bh.params.speed * dt);
    inst.x += dx / d * step;
    inst.y += dy / d * step;
    s.yaw = Math.atan2(dy, dx);
    inst.anim.rot += 0;    // 朝向由渲染器的 inst.rot 控制，第一版不动
    inst.anim.z += Math.abs(Math.sin(world.t * 7 + (inst.seed || 1))) * .03;
  },
});

/* 受惊逃跑：远离点击点 */
KIT_BEHAVIOR.register({
  id: 'flee',
  label: '受惊逃跑',
  category: 'reaction',
  desc: '被点击后朝远离点击点的方向跑一段，停下后慢慢回位',
  params: {
    dist:  { def: 3, min: 1, max: 10, step: .5, desc: '逃跑距离', en: 'distance' },
    speed: { def: 2.2, min: .5, max: 5, step: .1, desc: '逃跑速度', en: 'speed' },
  },
  init(inst) { inst.state.flee = { tx: null, ty: null }; },
  event(inst, bh, ev, world) {
    if (!ev || ev.type !== 'click') return false;
    const s = inst.state.flee;
    const px = ev.x == null ? inst.x : ev.x;
    const py = ev.y == null ? inst.y : ev.y;
    let dx = inst.x - px, dy = inst.y - py;
    const d = Math.hypot(dx, dy) || 1;
    s.tx = inst.x + dx / d * bh.params.dist;
    s.ty = inst.y + dy / d * bh.params.dist;
    return true;
  },
  tick(inst, bh, dt) {
    const s = inst.state.flee;
    if (!s || s.tx == null) return;
    const dx = s.tx - inst.x, dy = s.ty - inst.y;
    const d = Math.hypot(dx, dy);
    if (d < .12) { s.tx = s.ty = null; return; }
    const step = Math.min(d, bh.params.speed * dt);
    inst.x += dx / d * step;
    inst.y += dy / d * step;
    inst.anim.z += Math.abs(Math.sin(KIT_BH_WORLD.t * 14)) * .05;
  },
});

/* 绕轴旋转：风车、水车 */
KIT_BEHAVIOR.register({
  id: 'spin',
  label: '绕轴旋转',
  category: 'ambient',
  desc: '绕自身原点匀速旋转，速度可调',
  params: {
    speed: { def: 1.2, min: -6, max: 6, step: .1, desc: '角速度（弧度/秒）', en: 'angular speed' },
  },
  tick(inst, bh, dt) {
    const s = inst.state.spin || (inst.state.spin = { a: 0 });
    s.a += bh.params.speed * dt;
    inst.anim.rot += s.a;
  },
});
