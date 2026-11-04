'use strict';
/* ------------------------------------------------------------------
 * 构件库 · 渲染器
 *
 * 把 KIT 登记的构件画到等距画布上。场景模型（地形 + 物体列表）
 * 交给它，它负责：
 *   1. 画地面（groundColor 协议）
 *   2. 按 y 排序画物体（画家算法）
 *   3. 物体阴影
 *   4. 每帧动态要素（人物等）
 *
 * 渲染上下文 ctx 暴露给构件 draw()：
 *   ctx.sphere/capsule/box/plot   引擎原语（自动随 ctx.rot 旋转）
 *   ctx.params                    实例参数
 *   ctx.x / ctx.y / ctx.z         实例位置
 *   ctx.seed                      实例种子
 *   ctx.rampOf / ctx.rgb          颜色工具
 *   ctx.hash / ctx.noise          确定性随机
 *   ctx.shadow(r, strength)       给当前实例投一片阴影
 * ------------------------------------------------------------------ */

const KIT_RENDER = {
  /* 场景模型：编辑器填充 */
  scene: {
    terrain: null,        /* { kind, params } */
    objects: [],          /* [{ id, kind, x, y, z, params, seed, rot }] */
    actors: [],           /* 每帧动态：[{ kind, x, y, yaw, pose }] */
  },

  /* 地面材质表 —— 索引对应 KIND_* */
  groundMats: {},

  /* 背景色（留白区）。编辑器会覆盖成自己的深色。 */
  bgColor: rgb(250, 246, 232),

  /* ---------------- 地面 ---------------- */

  /** 地面协议：返回 0 表示不画（留白） */
  groundColor(x, y, ix, iy, i) {
    const t = KIT_RENDER.scene.terrain;
    if (!t) return 0;
    const fn = KIT_RENDER.groundMats[t.kind];
    if (!fn) return 0;
    return fn(x, y, ix, iy, i);
  },

  /** 烘焙整张画面：地面 → 静态物体 */
  bake() {
    darkened.fill(0);
    zb.fill(-1e9);
    pix.fill(KIT_RENDER.bgColor);
    ground.fill(0);
    kinds.fill(KIND_NONE);
    shadowMask.fill(0);

    for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
      const g = unproject(ix + .5, iy + .5), i = iy * W + ix;
      const c = KIT_RENDER.groundColor(g.x, g.y, ix, iy, i);
      if (!c) continue;
      pix[i] = c;
      ground[i] = 1;
      zb[i] = (g.x + g.y) / R2 * COS;
    }
    /* 地面深度立刻定格 —— 后面所有物体才有正确遮挡关系 */
    groundZ.set(zb);

    /* 静态物体：按 y 从大到小排序（y 大 = 靠近观众 = 后画） */
    const objs = [...KIT_RENDER.scene.objects].sort((a, b) => b.y - a.y);
    for (const o of objs) KIT_RENDER.drawObject(o);

    bakeOcclusion();
    staticShadow.set(shadowMask);
    applyShadows(groundZ);

    bakedPix.set(pix);
    bakedZ.set(zb);
  },

  /* ---------------- 构件绘制 ---------------- */

  /** 构造给构件 draw() 的上下文
   *
   * 旋转：ctx.rot 是弧度，绕构件自身原点 (ox, oy) 旋转。
   * 缩放：ctx.scale 乘在所有局部坐标与半径上（1 = 原始大小，0.5 一半，2 两倍）。
   * 两者都在包装层完成 —— 构件代码完全不用关心自己被摆成什么朝向、多大。
   */
  makeCtx(o) {
    const params = KIT.resolve(o.kind, o.params);
    const seed = o.seed == null ? 1 : o.seed;
    const ox = o.x, oy = o.y;
    const rot = o.rot || 0;
    const sc = (o.scale == null || !Number.isFinite(o.scale) || o.scale <= 0) ? 1 : o.scale;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    /* 构件坐标是「世界坐标」（ctx.x + 偏移 的形式），
       所以缩放必须绕实例原点 (ox,oy) 做 —— ox + (x-ox)*sc。
       写成 ox + x*sc 会把位置加两次，scale≠1 时整个图形飞离碰撞体。
       sc=1 时严格恒等。 */
    const un = (x, y) => {
      const dx = (x - ox) * sc, dy = (y - oy) * sc;
      if (rot) {
        return [ox + dx * cs + dy * sn, oy - dx * sn + dy * cs];
      }
      return [ox + dx, oy + dy];
    };
    const wrapPoint = p => { const q = un(p[0], p[1]); return [q[0], q[1], (o.z || 0) + p[2] * sc]; };

    return {
      x: ox, y: oy, z: o.z || 0,
      params, seed,
      rot, scale: sc,
      sphere(x, y, z, r, c, mode) {
        const q = un(x, y);
        sphere(q[0], q[1], (o.z || 0) + z * sc, r * sc, c, mode);
      },
      capsule(a, b, r0, r1, colorOf, mode) {
        const qa = wrapPoint(a), qb = wrapPoint(b);
        capsule(qa, qb, r0 * sc, r1 * sc, colorOf, mode);
      },
      box(x0, y0, z0, x1, y1, z1, c, seed2 = 0) {
        const zz0 = (o.z || 0) + z0 * sc, zz1 = (o.z || 0) + z1 * sc;
        if (!rot) {
          const [ax, ay] = un(x0, y0), [bx, by] = un(x1, y1);
          box(Math.min(ax, bx), Math.min(ay, by), zz0,
              Math.max(ax, bx), Math.max(ay, by), zz1, c, seed2);
          return;
        }
        /* 旋转盒子：对顶面与四个侧面采样，经 un() 旋转后写入 zb 与 pix */
        const ramp = rampOf(c);
        const paint = (lx, ly, lz, base, grain) => {
          const q = un(lx, ly);
          const p = project(q[0], q[1], lz), ix = p.sx | 0, iy = p.sy | 0;
          if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
          const i = iy * W + ix;
          if (p.d <= zb[i]) return;
          zb[i] = p.d;
          pix[i] = ramp[clamp(Math.floor(base + (grain - .5) * 1.3 + (bayerAt(ix, iy) - .5) * .5), 0, 4)];
        };
        const step = .045, longX = x1 - x0 >= y1 - y0;
        for (let a = x0; a <= x1; a += step) for (let b = y0; b <= y1; b += step)
          paint(a, b, zz1, 3.4, longX ? noise(a * .8 + seed2, b * 9) : noise(a * 9, b * .8 + seed2));
        for (let a = x0; a <= x1; a += step) for (let b = z0; b <= z1; b += step) {
          const g = noise(a * .8 + seed2, b * 9);
          paint(a, y1, b, 2.3, g);
          paint(a, y0, b, 1.5, g);
        }
        for (let a = y0; a <= y1; a += step) for (let b = z0; b <= z1; b += step) {
          const g = noise(a * .8 + seed2, b * 9);
          paint(x1, a, b, 1.2, g);
          paint(x0, a, b, 2.0, g);
        }
      },
      plot(x, y, z, color) {
        const q = un(x, y);
        plot(q[0], q[1], (o.z || 0) + z * sc, color);
      },
      rampOf, rgb, hash, noise, lerp, clamp,
      shadow: (r, strength, dither) => {
        castShadow(ox, oy, (o.z || 0) + .01, r * sc, strength == null ? 1 : strength, dither);
      },
      shadowAt: (x, y, z, r, strength, dither) => {
        const q = un(x, y);
        castShadow(q[0], q[1], (o.z || 0) + z * sc, r * sc, strength, dither);
      },
    };
  },

  /** 画一个物体（静态构件） */
  drawObject(o) {
    const c = KIT.get(o.kind);
    if (!c) return;
    const ctx = KIT_RENDER.makeCtx(o);
    try {
      c.draw(ctx, o);
    } catch (e) {
      console.error(`[kit] 构件 ${o.kind} 绘制失败:`, e);
    }
  },

  /* ---------------- 每帧 ---------------- */

  draw(t) {
    pix.set(bakedPix);
    zb.set(bakedZ);
    pendingShadows.length = 0;

    drawTufts(t);

    /* 动态角色 */
    for (const a of KIT_RENDER.scene.actors) {
      const c = KIT.get(a.kind);
      if (!c) continue;
      const ctx = KIT_RENDER.makeCtx(a);
      try { c.draw(ctx, a); } catch (e) { console.error(`[kit] 构件 ${a.kind} 失败:`, e); }
    }

    flushShadows();
    applyShadows(groundZ);
    shadeEdges();
  },
};
