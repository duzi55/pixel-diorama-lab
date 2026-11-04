'use strict';
/* ------------------------------------------------------------------
 * 构件库 · 人群行为
 *
 * 人群 = 独立个体 + 目标选择 + 局部避让 + 姿态合成。
 * 三个变体共用同一套骨架，**只换 pickTarget**（docs/kit/crowd.md §2.2）：
 *
 *   spectator 围观者 —— 向主角聚拢，但留出 CLEARANCE 半径
 *   wanderer  漫游者 —— 均匀随机方向，走一段停一段
 *   crowd     观众   —— 位置固定，站桩 + 局部动作（转头/鼓掌）
 *
 * 这不是"构件"（不是 draw(ctx) 那种静态绘制），是**每帧运行的行为模块**。
 * 与 demo/village/villagers.js 的 passerby 并列，属于人群系统的三个变体。
 *
 * 唯一全局名：KIT_CROWD。其余一律 KIT_CROWD_ 前缀。
 * ------------------------------------------------------------------ */

/* 配色表法：每个部位一个候选色数组，用 hash 带不同 seed 选取。
   同 seed 恒定 → 每次刷新人群配色一致（可复现）。 */
const KIT_CROWD_SHIRTS = [
  [232, 96, 84], [244, 196, 74], [64, 160, 168], [196, 108, 180],
  [242, 240, 228], [120, 168, 108], [228, 128, 64], [96, 116, 196],
];
const KIT_CROWD_LEGS = [[72, 84, 116], [96, 76, 60], [64, 72, 88], [128, 116, 92], [56, 64, 72]];
const KIT_CROWD_HAIR = [[48, 36, 30], [92, 64, 40], [140, 108, 68], [36, 32, 34], [186, 160, 120], [24, 24, 28]];
const KIT_CROWD_SKIN = [[238, 198, 164], [214, 168, 132], [186, 136, 100], [158, 110, 80]];

/* 姿态：走路 / 站立 / 鼓掌 / 欢呼 */
const KIT_CROWD_POSE = {
  walk: { armR: .55, armL: -.55, stance: .34, lean: .06 },
  stand: { armR: .06, armL: .08, stance: .12, lean: 0 },
  clap: { armR: 1.05, armL: 1.05, stance: .12, lean: 0 },
  cheer: { armR: 2.5, armL: 2.5, stance: .16, lean: -.1 },
};

const KIT_CROWD = {
  /* 个体列表 */
  agents: [],

  /**
   * 创建人群。
   * @param {object} opt {
   *   variant: 'spectator'|'wanderer'|'crowd',
   *   count: 个体数,
   *   bounds: {x0,x1,y0,y1} 可行走区域,
   *   focus: {x,y} 主角位置（spectator 用）,
   *   clearance: spectator 的 CLEARANCE 半径,
   *   seed: 随机种子,
   *   scale: 人物整体缩放,
   * }
   */
  create(opt) {
    const o = Object.assign({
      variant: 'wanderer',
      count: 8,
      bounds: { x0: -8, x1: 8, y0: -4, y1: 4 },
      focus: { x: 0, y: 0 },
      clearance: 2.2,
      seed: 1,
      scale: 1,
    }, opt || {});

    KIT_CROWD.agents.length = 0;
    const B = o.bounds;
    const n = Math.max(1, o.count);

    for (let k = 0; k < n; k++) {
      const pick = (list, seed) => list[Math.floor(hash(k + 3, seed) * list.length)];
      const shirt = pick(KIT_CROWD_SHIRTS, 41);
      /* spectator 沿主角前方铺开；crowd 沿一条直线站桩；wanderer 散布 */
      let x, y;
      if (o.variant === 'spectator') {
        const a = (k / n - .5) * 2;
        x = o.focus.x + a * o.clearance * 1.4;
        y = o.focus.y + (hash(k, 42) - .5) * 1.6;
      } else if (o.variant === 'crowd') {
        x = (k / Math.max(1, n - 1) - .5) * (B.x1 - B.x0) * .8 + (B.x0 + B.x1) / 2;
        y = (hash(k, 42) - .5) * .6 + (B.y0 + B.y1) / 2;
      } else {
        x = B.x0 + hash(k, 42) * (B.x1 - B.x0);
        y = B.y0 + hash(k, 43) * (B.y1 - B.y0);
      }

      const ag = {
        x, y,
        tx: x, ty: y,
        speed: .45 + hash(k, 44) * .4,
        wait: hash(k, 45) * 3,
        gait: hash(k, 46) * 6,
        yaw: Math.PI / 2, look: Math.PI / 2,
        walking: false,
        phone: false,
        /* crowd 变体：站桩，做局部动作 */
        cheering: false,
        clapPhase: hash(k, 47) * 6.283,
        seed: o.seed + k * 37,
        palette: {
          shirt,
          /* 25% 概率白条纹，否则与 shirt 同色 —— 全员条纹会杂乱 */
          stripe: hash(k, 48) > .75 ? [244, 240, 228] : shirt,
          legs: pick(KIT_CROWD_LEGS, 49),
          hair: pick(KIT_CROWD_HAIR, 50),
          skin: pick(KIT_CROWD_SKIN, 51),
        },
      };
      /* 初始目标 */
      KIT_CROWD_pickTarget(ag, o);
      KIT_CROWD.agents.push(ag);
    }
    KIT_CROWD.opt = o;
    return KIT_CROWD.agents;
  },

  /** 每帧更新 */
  update(t, dt) {
    const o = KIT_CROWD.opt || {};
    const B = o.bounds || { x0: -8, x1: 8, y0: -4, y1: 4 };

    for (const ag of KIT_CROWD.agents) {
      if (o.variant === 'crowd') {
        /* 站桩：只做局部动作（转头 / 鼓掌） */
        ag.walking = false;
        ag.gait += dt;
        const look = Math.atan2(o.focus.y - ag.y, o.focus.x - ag.x);
        ag.look = look + Math.sin(t * .45 + ag.clapPhase) * .32;
        ag.yaw = ag.look;
        ag.cheering = Math.sin(t * 1.7 + ag.clapPhase) > .3;
        continue;
      }

      /* 到达 → 站一段 → 再选目标 */
      const dx = ag.tx - ag.x, dy = ag.ty - ag.y;
      const dist = Math.hypot(dx, dy);
      if (dist < .15) {
        ag.walking = false;
        ag.wait = 1.5 + hash(ag.seed, 61) * 6;
        ag.phone = hash(ag.seed, 62) < .55;
        ag.look = ag.y > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else if ((ag.wait -= dt) <= 0) {
        KIT_CROWD_pickTarget(ag, o);
      }

      if (ag.walking) {
        const step = ag.speed * dt;
        ag.x += dx / dist * step;
        ag.y += dy / dist * step;
        ag.gait += step * 4.2;
        /* 朝向归一化：一行都不能省，否则转身绕整圈 */
        const want = Math.atan2(dy, dx);
        let diff = want - ag.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        ag.yaw += diff * Math.min(1, dt * 9);
        ag.look = ag.yaw;
      }
    }

    /* 局部避让 */
    KIT_CROWD_separate(dt, o);

    /* 边界夹紧 */
    for (const ag of KIT_CROWD.agents) {
      ag.x = clamp(ag.x, B.x0 + .2, B.x1 - .2);
      ag.y = clamp(ag.y, B.y0 + .2, B.y1 - .2);
    }
  },

  /** 画人群（需要引擎的 figure/dynamicAdd） */
  draw(t) {
    const o = KIT_CROWD.opt || {};
    for (const ag of KIT_CROWD.agents) {
      let pose = KIT_CROWD_POSE.stand;
      if (o.variant === 'crowd') {
        pose = ag.cheering ? KIT_CROWD_POSE.cheer : KIT_CROWD_POSE.stand;
      } else if (ag.walking) {
        pose = KIT_CROWD_POSE.walk;
      } else if (ag.phone) {
        pose = KIT_CROWD_POSE.stand;
      }
      /* 步态量化：不要平滑插值，否则不像手绘 */
      const swing = ag.walking ? Math.round(Math.sin(ag.gait) * 2) / 2 : 0;
      const p = {
        armR: pose.armR + swing * .35,
        armL: pose.armL - swing * .35,
        stance: pose.stance,
        lean: pose.lean,
        scale: o.scale || 1,
        z: 0,
      };
      figure(ag.x, ag.y, ag.look, p, ag.palette, dynamicAdd);
    }
  },

  /** 清空 */
  clear() { KIT_CROWD.agents.length = 0; },
};

/* ---------------- 目标选择（三个变体只差这里） ---------------- */

function KIT_CROWD_pickTarget(ag, o) {
  const B = o.bounds || { x0: -8, x1: 8, y0: -4, y1: 4 };

  if (o.variant === 'spectator') {
    /* 向主角聚拢，但留出 CLEARANCE 半径 */
    const a = hash(ag.seed, 63) * Math.PI * 2;
    const r = o.clearance + .1 + hash(ag.seed, 64) * 3.4;
    ag.tx = o.focus.x + Math.cos(a) * r;
    ag.ty = o.focus.y + Math.sin(a) * r * .6;
    /* 夹回可行走区 */
    ag.tx = clamp(ag.tx, B.x0 + .3, B.x1 - .3);
    ag.ty = clamp(ag.ty, B.y0 + .3, B.y1 - .3);
  } else if (o.variant === 'wanderer') {
    /* 均匀随机方向 */
    const a = hash(ag.seed, 65) * Math.PI * 2;
    const r = 1.5 + hash(ag.seed, 66) * 4.5;
    ag.tx = clamp(ag.x + Math.cos(a) * r, B.x0 + .3, B.x1 - .3);
    ag.ty = clamp(ag.y + Math.sin(a) * r, B.y0 + .3, B.y1 - .3);
  } else {
    /* crowd：站桩，目标就是原地 */
    ag.tx = ag.x; ag.ty = ag.y;
  }
  ag.walking = true;
  ag.phone = false;
}

/* ---------------- 局部避让 ---------------- */

function KIT_CROWD_separate(dt, o) {
  const A = KIT_CROWD.agents;
  const GAP = .72;
  for (let i = 0; i < A.length; i++) {
    const a = A[i];
    for (let j = i + 1; j < A.length; j++) {
      const b = A[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || .01;
      if (d >= GAP) continue;
      /* 软排斥：各推一半，力度与超出量成正比 */
      const push = (GAP - d) * Math.min(1, dt * 5) / 2;
      a.x -= dx / d * push; a.y -= dy / d * push;
      b.x += dx / d * push; b.y += dy / d * push;
    }
  }

  /* spectator 额外避开主角 */
  if (o.variant === 'spectator' && o.focus) {
    for (const a of A) {
      const dx = a.x - o.focus.x, dy = a.y - o.focus.y;
      const d = Math.hypot(dx, dy) || .01;
      if (d < o.clearance) {
        const push = (o.clearance - d) * Math.min(1, dt * 6);
        a.x += dx / d * push;
        a.y += dy / d * push;
      }
    }
  }
}
