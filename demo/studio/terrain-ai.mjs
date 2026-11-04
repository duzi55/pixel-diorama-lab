'use strict';
/* ------------------------------------------------------------------
 * 地形预设 AI 生成（terrain-ai.mjs）
 *
 * 从 ai.mjs 拆出：输出「程序化形状描述」而非逐格列表，
 * 由 terrain-shapes.js 在前端展开成格子。
 * ------------------------------------------------------------------ */

import { runClaude } from './cli.mjs';

/* ---------------- 地形预设生成 ---------------- */

const TERRAIN_SPEC = `
你是等距像素微缩景观项目的**地形设计师**。
项目零依赖，地形由格子构成（格 = 世界坐标 1×1 的正方形，投影后是等距菱形瓦片）。

## 输出格式：程序化形状描述（不要输出逐格列表）

返回 JSON：
\`\`\`json
{
  "name": "场景名",
  "desc": "一句话说明",
  "shapes": [
    { "type": "island", "cx": 0, "cy": 0, "rx": 8, "ry": 6, "mat": "grass", "z": 0, "exp": 4, "wobble": 0.12 },
    { "type": "path", "mat": "stone", "width": 1.2, "points": [[-6, 4], [0, 0], [6, -4]] },
    { "type": "hill", "cx": 3, "cy": -2, "r": 3, "h": 1.0, "falloff": 1.4 },
    { "type": "rect", "x0": -2, "y0": 2, "x1": 2, "y1": 4, "mat": "stone", "z": 0 }
  ],
  "notes": "设计说明"
}
\`\`\`

## 形状类型

| type | 参数 | 说明 |
|------|------|------|
| island | cx, cy, rx, ry, mat, z, exp(2~8), wobble(0~0.3) | 超椭圆岛，边缘自动溶解抖动 |
| rect | x0, y0, x1, y1, mat, z | 矩形地块（广场、院子） |
| path | points[[x,y]…], width(0.6~2.5), mat | 沿折线铺路，只铺在已有地面上 |
| hill | cx, cy, r, h(0.25~2.5), falloff(0.8~2.5) | 圆形高台，把已有格抬升 |

## 材质 id

grass 草地 · soil 泥土 · sand 沙地 · stone 石板 · water 水面

## 规则

1. **坐标范围**：gx/gy 建议在 -10 ~ 10（世界约 20×20），不要超出 -18~18
2. **顺序有意义**：先铺 island/rect 打底，再 path 切路，最后 hill 抬地形
3. **道路必须连通**：points 首尾要落在底座范围内，且折线连续
4. **高差 ≤ 3**：hill 叠加后单格高度不能超过 3
5. **别铺满**：留白是风格的一部分，岛外就是天空
6. **至少 3 个、最多 10 个 shapes**，能表达地貌即可，不要堆砌
`;

export async function generateTerrain(req, onProgress) {
  const prompt = TERRAIN_SPEC + `

## 用户想要的地形

**${req.prompt}**
${req.note ? `\n补充：${req.note}` : ''}

请设计地形。返回结构化 JSON。`;

  const schema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      desc: { type: 'string' },
      shapes: {
        type: 'array',
        items: { type: 'object' },
      },
      notes: { type: 'string' },
    },
    required: ['name', 'desc', 'shapes', 'notes'],
  };

  const raw = await runClaude(prompt, schema, onProgress);
  return { ok: true, preset: raw };
}

