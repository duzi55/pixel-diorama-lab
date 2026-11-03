'use strict';
/* ------------------------------------------------------------------
 * 构件库 · 入口
 *
 * 加载顺序（必须按此顺序）：
 *   1. palette.js   配色（依赖 engine 的 rgb）
 *   2. core.js      KIT 注册表
 *   3. ground.js    地面材质（依赖 core 的 KIT_RENDER）
 *   4. trees.js     树与草木构件
 *   5. props.js     建筑与道具构件
 *   6. index.js     本文件：装配导出
 *
 * 用途：
 *   - 编辑器：读 KIT.list() 得到可用构件，装配进场景
 *   - 生成页：预览 AI 新构件
 *   - 渲染：KIT_RENDER.bake() / KIT_RENDER.draw()
 * ------------------------------------------------------------------ */

/* 供编辑器与生成页共用的场景存取 */
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
