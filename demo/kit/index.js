'use strict';
/* ------------------------------------------------------------------
 * 构件库 · 入口
 *
 * 加载顺序（必须按此顺序）：
 *   1. palette.js     配色（依赖 engine 的 rgb）
 *   2. core.js        KIT 注册表
 *   3. render.js      KIT_RENDER：场景模型 → 画布
 *   4. ground.js      地面材质
 *   5. trees.js       树构件（tree）
 *   6. plants.js      花草灌木构件（plant）
 *   7. buildings.js   建筑构件（building）
 *   8. props.js       道具构件（prop）
 *   9. figures.js     人物姿态表（非构件）
 *  10. crowd.js       人群行为模块（非构件）
 *  11. index.js       本文件
 * ------------------------------------------------------------------ */

const KIT_SCENE_STORE = {
  current: {
    terrain: { kind: 'meadow', params: {} },
    objects: [],
  },

  load(scene) {
    KIT_SCENE_STORE.current = scene;
    KIT_RENDER.scene = scene;
  },

  save() {
    return JSON.stringify(KIT_SCENE_STORE.current, null, 2);
  },
};
