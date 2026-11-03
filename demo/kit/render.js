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
 *   ctx.sphere/capsule/box/plot   引擎原语
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
   * 旋转：ctx.rot 是弧度，绕构件自身原点旋转。
   * 实现方式是包一层原语 —— 把传入的坐标先转到构件局部系再转回，
   * 这样构件代码完全不用关心自己被摆成什么朝向。
   */
  makeCtx(o) {
    const params = KIT.resolve(o.kind, o.params);
    const seed = o.seed == null ? 1 : o.seed;
    const ox = o.x, oy = o.y;
    const rot = o.rot || 0;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    /* 把世界坐标转回"未旋转"的位置：绕 (ox,oy) 反向旋转 rot */
    const un = (x, y) => {
      if (!rot) return [x, y];
      const dx = x - ox, dy = y - oy;
      return [ox + dx * cs + dy * sn, oy - dx * sn + dy * cs];
    };
    const wrapPoint = p => { const q = un(p[0], p[1]); return [q[0], q[1], p[2]]; };

    return {
      x: ox, y: oy, z: o.z || 0,
      params, seed,
      rot,
      sphere(x, y, z, r, c, mode) {
        const q = un(x, y);
        sphere(q[0], q[1], z, r, c, mode);
      },
      capsule(a, b, r0, r1, colorOf, mode) {
        capsule(wrapPoint(a), wrapPoint(b), r0, r1, colorOf, mode);
      },
      box(x0, y0, z0, x1, y1, z1, c, seed2) {
        /* 盒子的 8 个角逐个转 —— 只画三面的语义由 box 自己处理 */
        const corners = [[x0,y0],[x1,y0],[x0,y1],[x1,y1]].map(([a,b]) => un(a,b));
        box(corners[0][0], corners[2][1], z0, corners[1][0], corners[3][1], z1, c, seed2);
      },
      plot(x, y, z, color) {
        const q = un(x, y);
        plot(q[0], q[1], z, color);
      },
      rampOf, rgb, hash, noise, lerp, clamp,
      shadow: (r, strength, dither) => {
        castShadow(ox, oy, (o.z || 0) + .01, r, strength == null ? 1 : strength, dither);
      },
      shadowAt: (x, y, z, r, strength, dither) => {
        const q = un(x, y);
        castShadow(q[0], q[1], z, r, strength, dither);
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
