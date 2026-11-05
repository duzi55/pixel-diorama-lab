'use strict';
/* ------------------------------------------------------------------
 * 构件行为库 · 扩展包（behavior-extra）
 *
 * 第二批行为：burn / bob / open / patrol / grow / shake。
 * 本文件只注册行为，不定义运行时；契约见 docs/modules/behavior.md。
 *
 * 加载顺序（浏览器 classic script，全局词法作用域）：
 *   engine.js → kit/core.js → kit/behavior.js → 本文件
 * 依赖全局：KIT_BEHAVIOR / hash() / ease() / lerp() / clamp()
 *
 * 约束（与内置行为一致）：
 *   tick 只写 inst.anim（dx/dy/rot/scale/z/hidden）或 inst.x/inst.y
 *   时间只用 world.t / world.dt，风只用 world.wind，随机只用 hash()
 * ------------------------------------------------------------------ */

const KIT_BHX_TAU = Math.PI * 2;

/** 每个实例稳定的初相（0..2π）：同一场景的实例不会整齐划一地动 */
function KIT_BHX_phase(inst, salt) {
  return hash((inst.seed == null ? 1 : inst.seed) + salt, 977) * KIT_BHX_TAU;
}

/** 取风向量；world 可能没有 wind（自测/极简场景） */
function KIT_BHX_wind(world) {
  const w = (world && world.wind) || null;
  return {
    x: w && Number.isFinite(w.x) ? w.x : 0,
    y: w && Number.isFinite(w.y) ? w.y : 0,
  };
}

/* ==================================================================
 * 着火：火苗闪烁 → 冒烟 → 烧完隐藏
 * ================================================================== */

KIT_BEHAVIOR.register({
  id: 'burn',
  label: '着火',
  category: 'reaction',
  desc: '点击点燃：火苗覆盖 + 短促明灭 + 上升烟柱，烧完后实例隐藏',
  params: {
    time:   { def: 6,   min: 1,   max: 20, step: .5,  desc: '从点燃到烧完的秒数', en: 'burn time' },
    auto:   { def: 0,   min: 0,   max: 1,  step: 1,   desc: '1 = 挂载即点燃，0 = 点击点燃', en: 'auto ignite' },
    smoke:  { def: 1,   min: 0,   max: 2,  step: .1,  desc: '烟雾浓度（影响火苗与烟点数量）', en: 'smoke density' },
    spread: { def: .8,  min: .2,  max: 3,  step: .1,  desc: '火焰散布半径（世界单位）', en: 'flame spread' },
    rise:   { def: 3.2, min: .5,  max: 9,  step: .2,  desc: '烟柱上升高度（世界单位）', en: 'smoke rise' },
  },
  init(inst, bh) {
    inst.state.burn = { on: bh.params.auto >= .5, t0: null, done: false };
  },
  event(inst, bh, ev, world) {
    if (!ev || ev.type !== 'click') return false;
    const st = inst.state.burn;
    if (!st || st.done) return false;
    if (!st.on) {
      st.on = true;
      st.t0 = world.t;
    }
    return true;
  },
  tick(inst, bh, dt, world) {
    const st = inst.state.burn;
    if (!st || !st.on) return;
    /* done 是持久状态：resetAnim 每帧会把 hidden 清零，必须每帧重申 */
    if (st.done) { inst.anim.hidden = true; return; }
    const p = bh.params;
    /* 懒启动：attach 时拿到的 world 可能和 tick 的不是同一个 */
    if (st.t0 == null) st.t0 = world.t;

    const u = (world.t - st.t0) / Math.max(.01, p.time);
    if (u >= 1) {
      st.done = true;
      inst.anim.hidden = true;
      if (world.emit) world.emit('burned', inst, { kind: inst.kind });
      return;
    }

    const seed = inst.seed == null ? 1 : inst.seed;
    /* 没有 tint 通道：用高频短促隐藏 + draw 里的火苗覆盖表达「颜色闪烁」 */
    if (hash(Math.floor(world.t * 24), seed + 501) > .9) inst.anim.hidden = true;
    /* 火焰顶起的轻微起伏，别让燃烧物像贴纸一样钉在地上 */
    inst.anim.z += Math.sin(world.t * 26 + seed) * .015;
    inst.anim.scale = 1 + Math.sin(world.t * 19 + seed) * .012;
  },
  draw(ctx, inst, bh, world) {
    const st = inst.state.burn;
    if (!st || !st.on || st.done) return;
    const p = bh.params;
    const seed = inst.seed == null ? 1 : inst.seed;
    const age = world.t - (st.t0 == null ? world.t : st.t0);
    const t = world.t;

    /* 火苗：底部一团跳动的暖色点，颜色按时间片随机切换（闪烁） */
    const frame = Math.floor(t * 14);
    const nFire = Math.round(12 + 8 * p.smoke);
    for (let i = 0; i < nFire; i++) {
      const k = frame * 31 + i * 7;
      const a = hash(k, seed + 601) * KIT_BHX_TAU;
      const r = p.spread * (.1 + hash(k, seed + 602) * .9);
      const z = .04 + hash(k, seed + 603) * p.spread * 1.15;
      const h = hash(k, seed + 604);
      const c = h > .72 ? [255, 238, 150] : h > .36 ? [255, 176, 62] : [226, 92, 34];
      ctx.plot(ctx.x + Math.cos(a) * r, ctx.y + Math.sin(a) * r, z, ctx.rgb(c[0], c[1], c[2]));
    }

    /* 烟点：循环上升，越高越淡，受全局风横向吹偏 */
    const wind = KIT_BHX_wind(world);
    const nSmoke = Math.round(18 * p.smoke);   /* smoke=0 时不冒烟 */
    for (let i = 0; i < nSmoke; i++) {
      const h1 = hash(i * 13 + 1, seed + 701);
      const cyc = (age * (.18 + h1 * .12) + hash(i * 5 + 2, seed + 702)) % 1;
      const a = hash(i * 17 + 3, seed + 703) * KIT_BHX_TAU;
      const rr = p.spread * (.15 + hash(i * 19 + 5, seed + 704) * .75) * (1 - cyc * .35);
      const drift = cyc * cyc;
      const x = ctx.x + Math.cos(a) * rr
        + wind.x * drift * 1.6 + Math.sin(t * 1.3 + i) * .07 * cyc;
      const y = ctx.y + Math.sin(a) * rr + wind.y * drift * 1.6;
      const g = Math.round(96 + cyc * 104);
      ctx.plot(x, y, .3 + cyc * p.rise, ctx.rgb(g, g, Math.round(g * .98)));
    }
  },
});

/* ==================================================================
 * 上下浮动：sin 波改 anim.z
 * ================================================================== */

KIT_BEHAVIOR.register({
  id: 'bob',
  label: '上下浮动',
  category: 'ambient',
  desc: '像浮在水面一样上下起伏，附带极轻的左右摇晃',
  params: {
    amp:  { def: .12, min: 0,   max: 1.5, step: .01, desc: '上下幅度（世界单位）', en: 'amplitude' },
    freq: { def: .5,  min: .05, max: 3,   step: .05, desc: '每秒浮动次数', en: 'frequency' },
    tilt: { def: .03, min: 0,   max: .4,  step: .01, desc: '左右轻摇幅度（弧度）', en: 'tilt' },
  },
  init(inst) {
    inst.state.bob = { phase: KIT_BHX_phase(inst, 11) };
  },
  tick(inst, bh, dt, world) {
    const s = inst.state.bob || (inst.state.bob = { phase: 0 });
    const p = bh.params;
    inst.anim.z += Math.sin(world.t * p.freq * KIT_BHX_TAU + s.phase) * p.amp;
    inst.anim.rot += Math.sin(world.t * p.freq * KIT_BHX_TAU * .5 + s.phase * 1.3) * p.tilt;
  },
});

/* ==================================================================
 * 开合：点击切换开/关（门 / 盖子）
 * ================================================================== */

KIT_BEHAVIOR.register({
  id: 'open',
  label: '开合',
  category: 'reaction',
  desc: '点击切换开/关：style=0 绕原点转开，style=1 收缩藏起',
  params: {
    angle:  { def: 1.15, min: .2, max: 2.6, step: .05, desc: '开启角度（弧度，style=0）', en: 'open angle' },
    time:   { def: .35,  min: .05, max: 3,  step: .05, desc: '开/合耗时（秒）', en: 'duration' },
    style:  { def: 0,    min: 0,   max: 1,  step: 1,   desc: '0 = 旋转开（门） / 1 = 缩放开（盖子）', en: 'style' },
    shrink: { def: .55,  min: .1,  max: 1,  step: .05, desc: '缩放开时保留的尺寸比例（style=1）', en: 'shrink' },
  },
  init(inst) { inst.state.open = { open: false, k: 0 }; },
  event(inst, bh, ev) {
    if (!ev || ev.type !== 'click') return false;
    const st = inst.state.open;
    if (!st) return false;
    st.open = !st.open;
    return true;
  },
  tick(inst, bh, dt, world) {
    const st = inst.state.open;
    if (!st) return;
    const p = bh.params;
    const target = st.open ? 1 : 0;
    const dp = dt / Math.max(.05, p.time);
    st.k += clamp(target - st.k, -dp, dp);
    const e = ease(st.k);
    if (p.style >= .5) inst.anim.scale = 1 - (1 - p.shrink) * e;
    else inst.anim.rot += p.angle * e;
  },
});

/* ==================================================================
 * 巡逻：在 A/B 两端点之间来回走
 * ================================================================== */

KIT_BEHAVIOR.register({
  id: 'patrol',
  label: '来回巡逻',
  category: 'active',
  desc: '沿 A/B 两个端点匀速来回走，端点处停留；端点坐标相对出生点',
  params: {
    ax:    { def: 0,   min: -20, max: 20, step: .1,  desc: '端点 A 的 X 偏移（相对出生点）', en: 'A offset x' },
    ay:    { def: 0,   min: -20, max: 20, step: .1,  desc: '端点 A 的 Y 偏移', en: 'A offset y' },
    bx:    { def: 2,   min: -20, max: 20, step: .1,  desc: '端点 B 的 X 偏移', en: 'B offset x' },
    by:    { def: 0,   min: -20, max: 20, step: .1,  desc: '端点 B 的 Y 偏移', en: 'B offset y' },
    speed: { def: .7,  min: .05, max: 4, step: .05, desc: '移动速度（世界单位/秒）', en: 'speed' },
    pause: { def: .4,  min: 0,   max: 5, step: .1,  desc: '到端点后停留秒数', en: 'pause' },
    bob:   { def: .03, min: 0,   max: .3, step: .01, desc: '走路时的上下起伏', en: 'walk bob' },
  },
  init(inst, bh) {
    const p = bh.params;
    inst.state.patrol = {
      hx: inst.x, hy: inst.y,
      u: 0, dir: 1, wait: 0,
      len: Math.hypot(p.bx - p.ax, p.by - p.ay),
      phase: KIT_BHX_phase(inst, 31),
    };
  },
  tick(inst, bh, dt, world) {
    const s = inst.state.patrol;
    if (!s) return;
    const p = bh.params;

    if (s.len > 1e-4) {
      if (s.wait > 0) {
        s.wait = Math.max(0, s.wait - dt);
      } else {
        s.u += s.dir * (p.speed * dt) / s.len;
        if (s.u >= 1) { s.u = 1; s.dir = -1; s.wait = p.pause; }
        else if (s.u <= 0) { s.u = 0; s.dir = 1; s.wait = p.pause; }
      }
      inst.x = s.hx + lerp(p.ax, p.bx, s.u);
      inst.y = s.hy + lerp(p.ay, p.by, s.u);
    }

    if (p.bob > 0) {
      inst.anim.z += Math.abs(Math.sin(world.t * 7 + s.phase)) * p.bob;
    }
  },
});

/* ==================================================================
 * 生长：从 from 倍长到 1 倍
 * ================================================================== */

KIT_BEHAVIOR.register({
  id: 'grow',
  label: '生长',
  category: 'state',
  desc: '挂载后从起始缩放平滑长到成体尺寸，之后保持不变',
  params: {
    time:  { def: 3,   min: .2, max: 20, step: .1,  desc: '长到满尺寸用时（秒）', en: 'grow time' },
    from:  { def: .2,  min: .02, max: 1, step: .02, desc: '起始缩放（相对成体）', en: 'start scale' },
    delay: { def: 0,   min: 0,  max: 10, step: .1,  desc: '开始时静止等待（秒）', en: 'delay' },
  },
  init(inst) { inst.state.grow = { t0: null }; },
  tick(inst, bh, dt, world) {
    const s = inst.state.grow || (inst.state.grow = { t0: null });
    if (s.t0 == null) s.t0 = world.t;   // 懒启动：第一次 tick 才算起点
    const p = bh.params;
    const u = clamp((world.t - s.t0 - p.delay) / Math.max(.01, p.time), 0, 1);
    inst.anim.scale = lerp(p.from, 1, ease(u));
  },
});

/* ==================================================================
 * 受击震动：点击触发短促抖动（不倒下）
 * ================================================================== */

KIT_BEHAVIOR.register({
  id: 'shake',
  label: '受击抖动',
  category: 'reaction',
  desc: '被点击时短促抖动几下，幅度随时间衰减，不会倒下',
  params: {
    amp:  { def: .1,  min: 0, max: .6, step: .01, desc: '抖动幅度（世界单位）', en: 'amplitude' },
    time: { def: .45, min: .1, max: 2, step: .05, desc: '抖动持续（秒）', en: 'duration' },
    freq: { def: 16,  min: 2, max: 40, step: 1,   desc: '抖动频率（次/秒）', en: 'frequency' },
  },
  init(inst) { inst.state.shake = { t0: -1e9 }; },
  event(inst, bh, ev, world) {
    if (!ev || ev.type !== 'click') return false;
    const st = inst.state.shake;
    if (!st) return false;
    st.t0 = world.t;
    return true;
  },
  tick(inst, bh, dt, world) {
    const st = inst.state.shake;
    if (!st) return;
    const p = bh.params;
    const e = world.t - st.t0;
    if (e < 0 || e > p.time) return;
    const k = 1 - e / p.time;
    const w = Math.sin(e * p.freq * KIT_BHX_TAU);
    const w2 = Math.sin(e * p.freq * KIT_BHX_TAU * .61);
    inst.anim.dx += w * p.amp * k;
    inst.anim.dy += w2 * p.amp * .5 * k;
    inst.anim.rot += w * p.amp * .35 * k;
  },
});
