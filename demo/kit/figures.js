'use strict';
/* ------------------------------------------------------------------
 * 构件库 · 人物姿态
 *
 * figure() 的姿态参数表（docs/kit/figures.md §24 的实用姿态配方）。
 * 姿态**不是构件** —— 它是喂给 figure() 的一组参数，
 * 没有自己的 draw()，也不进 KIT 注册表。
 *
 * 姿态契约（见 demo/engine.js figure()）：
 *   armR / armL  手臂角度（弧度，正 = 向前抬起）
 *   stance        站距（前后脚间距）
 *   lean          上身前倾
 *   crouch        下蹲
 *   scale         整体缩放
 *   z             基准高度
 *
 * 本文件还包含人物骨架 figure() / dynamicAdd（kit/crowd.js 的依赖）。
 *
 * 唯一全局名：KIT_POSE / figure / dynamicAdd 等（均为稳定公共名）。
 * ------------------------------------------------------------------ */

const KIT_POSE = {
  /* ---- 实用姿态 ---- */

  /** 站立：微张双臂，重心居中 */
  stand: { armR: .06, armL: .08, stance: .12, lean: 0, crouch: 0 },

  /** 行走：手臂前后摆，步态由外部量化后传入 */
  walk: { armR: .5, armL: -.5, stance: .34, lean: .06, crouch: 0 },

  /** 够取：双臂前伸够东西 —— 注册表里的 `reach` 姿态 */
  reach: { armR: 1.45, armL: 1.45, stance: .22, lean: .22, crouch: 0 },

  /** 举物过顶：双臂高举 */
  lift: { armR: 2.5, armL: 2.5, stance: .16, lean: -.08, crouch: 0 },

  /** 鼓掌：双手在胸前相击 */
  clap: { armR: 1.05, armL: 1.05, stance: .12, lean: 0, crouch: 0 },

  /** 欢呼：双臂高举 + 上身后仰 */
  cheer: { armR: 2.7, armL: 2.7, stance: .18, lean: -.14, crouch: 0 },

  /** 坐下：腿前伸，上身略后仰 */
  sit: { armR: .3, armL: .3, stance: .5, lean: -.12, crouch: .55 },

  /** 蹲下取物：屈膝前倾，手够向地面 */
  crouchPick: { armR: .9, armL: .9, stance: .28, lean: .5, crouch: .7 },

  /** 张望：站桩，头转向一侧（手臂保持放松） */
  look: { armR: .1, armL: .12, stance: .1, lean: 0, crouch: 0 },

  /** 玩手机：低头看手（手臂前伸） */
  phone: { armR: .75, armL: .55, stance: .1, lean: .18, crouch: 0 },

  /* ---- 参考项目（tie-break）的竞技姿态 ---- */

  /** 蓄力：双臂前伸微抬，身体前压 */
  aim: { armR: 1.9, armL: 1.6, stance: .3, lean: .18, crouch: .08 },

  /** 挥击：右臂横挥到体前，左臂后收 */
  swing: { armR: 2.2, armL: -.5, stance: .36, lean: .12, crouch: .05 },

  /** 备球：双手在身前托球，膝微屈 */
  ready: { armR: .95, armL: .95, stance: .26, lean: .1, crouch: .12 },
};

/* 参考项目姿态名的别名（registry.md 用 idle 表示站立待机） */
KIT_POSE.idle = KIT_POSE.stand;

/**
 * 取姿态 + 叠加覆盖。
 * @param {string} name 姿态名
 * @param {object} over 覆盖字段（如 {armR: 1.2}）
 */
function kitPose(name, over) {
  const base = KIT_POSE[name] || KIT_POSE.stand;
  return over ? Object.assign({}, base, over) : Object.assign({}, base);
}

/* ---------------- 人物骨架 figure() ----------------
 *
 * 从 engine.js → village/figures.js 收编进 kit：
 * 人群模块（kit/crowd.js）依赖它，骨架属于人物层的公共设施。
 *
 * 局部坐标 (a=前, b=侧, c=高)，yaw 决定朝向。
 * 不直接画，而是把每根骨头交给 addBone 回调 —— 静态/动态都能复用。
 */

const ENGINE_SHOE = [226, 222, 212];

function figure(px, py, yaw, pose, palette, addBone) {
  const fx = Math.cos(yaw), fy = Math.sin(yaw), sx = -fy, sy = fx;
  const base = pose.z || 0, k = pose.scale || 1;
  const P = (a, b, c) => [px + (fx * a + sx * b) * k, py + (fy * a + sy * b) * k, c * k + base];
  const add = (a, b, r0, r1, f) => addBone(a, b, r0 * k, r1 * k, f);
  const t = palette;
  const shirt = z => (Math.floor(z * 3.2) % 2 ? t.shirt : t.stripe);  // 约 3px 一档
  const legs = () => t.legs, skin = () => t.skin;
  const crouch = pose.crouch || 0, lean = pose.lean || 0;
  const hipZ = 1.28 - crouch * .4;
  const hipA = -crouch * .15;
  const shA = hipA + Math.sin(lean) * .95, shZ = hipZ + Math.cos(lean) * .95;
  const neck = P(shA, 0, shZ + .08), head = P(shA + Math.sin(lean) * .32, 0, shZ + .36);
  const stance = pose.stance == null ? .2 : pose.stance;
  const footB = P(-stance * 1.2, .2, .12), footF = P(stance * 2, -.2, .12);
  const kneeB = P(-stance * .4 + crouch * .12, .22, .68 - crouch * .1);
  const kneeF = P(stance * 1.2 + crouch * .34, -.22, .72 - crouch * .08);
  const hipB = P(hipA, .15, hipZ), hipF = P(hipA, -.15, hipZ);
  add(hipB, kneeB, .17, .13, legs); add(kneeB, footB, .13, .1, legs);
  add(hipF, kneeF, .17, .13, legs); add(kneeF, footF, .13, .1, legs);
  add(footB, P(-stance * 1.2 + .16, .2, .08), .1, .09, () => ENGINE_SHOE);
  add(footF, P(stance * 2 + .16, -.2, .08), .1, .09, () => ENGINE_SHOE);
  add(P(hipA, 0, hipZ), neck, .3, .32, shirt);
  add(neck, head, .11, .12, skin);
  figureSphere2(add, head, .24, t.skin);
  figureSphere2(add, [head[0] - fx * .06, head[1] - fy * .06, head[2] + .08], .205, t.hair);
  const shR = P(shA, .36, shZ - .03), shL = P(shA, -.36, shZ - .03);
  const armR = pose.armR == null ? 0 : pose.armR, armL = pose.armL == null ? .08 : pose.armL;
  const elbowR = P(shA + Math.sin(armR) * .46, .4, shZ - .03 - Math.cos(armR) * .46);
  const handR = P(shA + Math.sin(armR + .18) * .95, .42, shZ - .03 - Math.cos(armR + .18) * .95);
  const elbowL = P(shA + Math.sin(armL) * .46, -.42, shZ - .03 - Math.cos(armL) * .46);
  const handL = P(shA + Math.sin(armL + .2) * .9, -.43, shZ - .03 - Math.cos(armL + .2) * .9);
  add(shR, elbowR, .12, .1, shirt); add(elbowR, handR, .09, .08, skin);
  add(shL, elbowL, .12, .1, shirt); add(elbowL, handL, .09, .08, skin);
  return handR;
}

function figureSphere2(add, c, r, color) { add(c, c, r, r, () => color); }

/* 画骨头 + 登记阴影，一步到位 */
const dynamicAdd = (a, b, r0, r1, f) => {
  capsule(a, b, r0, r1, f, 'solid');
  pendingShadows.push(a, r0, b, r1);
};
