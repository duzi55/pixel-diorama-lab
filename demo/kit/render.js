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
    /* 行为动画：tick 写入 inst.anim，绘制时叠加到所有原语上。
       rot 绕实例原点（yaw）、rotX/rotY 是俯仰/翻滚、dx/dy 世界位移、
       z 抬升、scale 整体缩放。 */
    const anim = o.anim || null;
    const aScale = anim && Number.isFinite(anim.scale) && anim.scale > 0 ? anim.scale : 1;
    const aX = anim ? (anim.dx || 0) : 0;
    const aY = anim ? (anim.dy || 0) : 0;
    const aZ = anim ? (anim.z || 0) : 0;
    const rotZ = (o.rot || 0) + (anim ? (anim.rot || 0) : 0);
    const rotX = (o.rotX || 0) + (anim ? (anim.rotX || 0) : 0);
    const rotY = (o.rotY || 0) + (anim ? (anim.rotY || 0) : 0);
    const sc = ((o.scale == null || !Number.isFinite(o.scale) || o.scale <= 0) ? 1 : o.scale) * aScale;
    const pz = o.z || 0;
    /* 旋转轴心：默认底面中心；o.pivotZ 可把轴心抬到物体中部（像 Blender 绕物体中心转） */
    const pivotZ = pz + (Number.isFinite(o.pivotZ) ? o.pivotZ : 0);
    const has3D = rotX !== 0 || rotY !== 0;
    const spinnable = !!rotZ || has3D;

    const cX = Math.cos(rotX), sX = Math.sin(rotX);
    const cY = Math.cos(rotY), sY = Math.sin(rotY);
    const cZ = Math.cos(rotZ), sZ = Math.sin(rotZ);

    /* 局部 (x,y,z) → 世界 (x,y,z)。缩放绕实例原点；三轴旋转绕实例底面中心
       (ox, oy, pz)，顺序 Rz·Ry·Rx。Rz 沿用旧的顺时针方向（历史朝向不变）。 */
    const T = (x, y, z) => {
      const dx = (x - ox) * sc, dy = (y - oy) * sc, dz = (z - pivotZ) * sc;
      const y1 = dy * cX - dz * sX;          // Rx（俯仰）
      const z1 = dy * sX + dz * cX;
      const x2 = dx * cY + z1 * sY;          // Ry（翻滚）
      const z2 = -dx * sY + z1 * cY;
      const x3 = x2 * cZ + y1 * sZ;          // Rz（yaw，旧方向）
      const y3 = -x2 * sZ + y1 * cZ;
      return [ox + x3 + aX, oy + y3 + aY, pivotZ + z2 + aZ];
    };
    /* 无旋转快速路径：与原实现逐字节一致，零三角函数开销 */
    const flat = (x, y, z) => [ox + (x - ox) * sc + aX, oy + (y - oy) * sc + aY, pz + z * sc + aZ];
    const P = spinnable ? T : flat;

    /* R 的三列：把世界向量转回局部（L = Rᵀ·W，Rᵀ 的行就是 R 的列） */
    const col0 = [cZ * cY, -sZ * cY, -sY];
    const col1 = [cZ * sY * sX + sZ * cX, -sZ * sY * sX + cZ * cX, cY * sX];
    const col2 = [cZ * sY * cX - sZ * sX, -sZ * sY * cX - cZ * sX, cY * cX];

    const wrapPoint = p => P(p[0], p[1], p[2]);

    return {
      x: ox, y: oy, z: pz,
      params, seed,
      rot: rotZ, rotX, rotY, scale: sc,
      anim: anim || null,
      sphere(x, y, z, r, c, mode) {
        const q = P(x, y, z);
        sphere(q[0], q[1], q[2], r * sc, c, mode);
      },
      capsule(a, b, r0, r1, colorOf, mode) {
        const qa = wrapPoint(a), qb = wrapPoint(b);
        capsule(qa, qb, r0 * sc, r1 * sc, colorOf, mode);
      },
      box(x0, y0, z0, x1, y1, z1, c, seed2 = 0) {
        if (!spinnable) {
          const zz0 = pz + z0 * sc + aZ, zz1 = pz + z1 * sc + aZ;
          box(ox + (x0 - ox) * sc + aX, oy + (y0 - oy) * sc + aY, zz0,
              ox + (x1 - ox) * sc + aX, oy + (y1 - oy) * sc + aY, zz1, c, seed2);
          return;
        }
        /* 旋转盒子：对顶面与四个侧面采样，经 un() 旋转后写入 zb 与 pix */
        const ramp = rampOf(c);
        const paint = (lx, ly, lz, base, grain) => {
          const q = P(lx, ly, lz);
          const p = project(q[0], q[1], q[2]), ix = p.sx | 0, iy = p.sy | 0;
          if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
          const i = iy * W + ix;
          if (p.d <= zb[i]) return;
          zb[i] = p.d;
          pix[i] = ramp[clamp(Math.floor(base + (grain - .5) * 1.3 + (bayerAt(ix, iy) - .5) * .5), 0, 4)];
        };
        const step = .045, longX = x1 - x0 >= y1 - y0;
        for (let a = x0; a <= x1; a += step) for (let b = y0; b <= y1; b += step)
          paint(a, b, z1, 3.4, longX ? noise(a * .8 + seed2, b * 9) : noise(a * 9, b * .8 + seed2));
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
        const q = P(x, y, z);
        plot(q[0], q[1], q[2], color);
      },
      /* 局部坐标 → 屏幕像素（含三轴旋转/缩放/行为动画）。
         逐像素绘制的构件（树冠叶簇）用它算包围盒，否则包围盒按未旋转
         位置取、像素却画在旋转后的位置，叶簇会被裁成碎片。 */
      screen(x, y, z) { const q = P(x, y, z); return project(q[0], q[1], q[2]); },
      /* 屏幕像素 → 局部坐标（screen 的逆），返回 [x, y] 可喂回 plot。
         三轴旋转下：屏幕像素确定一条世界射线，求它与"局部 z 平面"的交点。 */
      unproject(ix, iy, z) {
        if (!has3D) {
          /* 平面旋转：直接反解到该局部的 z 平面（旧行为） */
          const P0 = unprojectAt(ix + .5 - aX, iy + .5 - aY, pz + z * sc + aZ);
          const dx = P0[0] - ox, dy = P0[1] - oy;
          return [ox + (dx * cZ - dy * sZ) / sc, oy + (dx * sZ + dy * cZ) / sc];
        }
        /* 三轴旋转：屏幕像素确定一条世界射线，求它与"局部 z 平面"的交点 */
        const P0 = unprojectAt(ix + .5 - aX, iy + .5 - aY, pivotZ + aZ);
        const kd = R2 / 2 * COS / SIN;
        const A = col2[0] * (P0[0] - ox) + col2[1] * (P0[1] - oy);
        const B = col2[0] * kd + col2[1] * kd + col2[2];
        const t = Math.abs(B) < 1e-6 ? 0 : (z * sc - A) / B;
        const wx = P0[0] + t * kd - ox, wy = P0[1] + t * kd - oy, wz = t;
        const lx = col0[0] * wx + col0[1] * wy + col0[2] * wz;
        const ly = col1[0] * wx + col1[1] * wy + col1[2] * wz;
        return [ox + lx / sc, oy + ly / sc];
      },
      rampOf, rgb, hash, noise, lerp, clamp,
      shadow: (r, strength, dither) => {
        castShadow(ox, oy, pz + .01, r * sc, strength == null ? 1 : strength, dither);
      },
      shadowAt: (x, y, z, r, strength, dither) => {
        const q = P(x, y, z);
        castShadow(q[0], q[1], q[2], r * sc, strength, dither);
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
