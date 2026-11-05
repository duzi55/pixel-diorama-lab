'use strict';
/* ------------------------------------------------------------------
 * 场景还原（图片 → 场景）—— 从 ai.mjs 拆出（500 行约束）
 *
 * 输入一张等距场景截图 + 当前构件库清单，输出可直接渲染的场景 JSON：
 *   { terrain: [...], objects: [{ kind, u, v, scale, rot, params }], missing: [...] }
 *
 * 坐标用画面相对坐标 u/v，由编辑器反投影成世界坐标。
 * ------------------------------------------------------------------ */

import { runClaude } from './cli.mjs';

function clampNum(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

/* ---------------- 场景还原（图片 → 场景） ---------------- */

const RECON_SPEC = `
你是一个等距像素微缩景观（isometric pixel diorama）项目的**场景还原工程师**。

## 任务

用户给一张等距像素场景截图。你要把它还原成这个项目能直接渲染的场景 JSON：

1. 识别画面里的地形（草地/泥土/沙地/石板/水）与物体（树、建筑、道具…）
2. 给每个物体从「现有构件库」里挑一个最合适的构件 —— **kind 必须来自清单**
3. 清单覆盖不了的主体（风车、桥、特有建筑等）**不要硬凑**，放进 missing
4. 输出场景 JSON

## 坐标约定

用画面相对坐标表示物体位置：

- \`u\`: 0 = 画面左边缘，1 = 右边缘
- \`v\`: 0 = 画面上边缘，1 = 下边缘

前端会用等距反投影把 (u, v) 换算成世界坐标，z 由地形高度决定。
**不要自己算世界坐标**，只给 u/v。物体互相遮挡时，靠后的物体 v 更小。

## 地形原语（按数组顺序叠加）

\`\`\`json
{ "type": "island", "cx": 0, "cy": 0, "rx": 9, "ry": 7, "mat": "grass", "z": 0, "wobble": 0.14 }
{ "type": "rect",   "x": -4, "y": 2, "w": 6, "d": 4, "mat": "stone", "z": 0 }
{ "type": "path",   "mat": "stone", "width": 1.0, "points": [[-7,4],[-1,1],[3,-1],[7,-5]] }
{ "type": "hill",   "cx": 1, "cy": -2, "r": 2.6, "h": 0.75, "falloff": 1.5 }
\`\`\`

- mat: \`grass|soil|sand|stone|water\`
- 世界单位：1 ≈ 一个人的高度；常见场景岛 rx 8~14
- 只画得出画面内容对应的地形，不要凭空扩大

## 物体

\`\`\`json
{ "kind": "broadleaf", "u": 0.32, "v": 0.41, "scale": 1, "rot": 0, "params": { "height": 5 }, "reason": "左侧大树" }
\`\`\`

- \`kind\` 必须来自清单，**不能自造**
- \`params\` 只写需要偏离默认值的项（键必须在该构件参数表里）
- \`scale\` 0.5~2.0：按图中相对大小估
- \`rot\` 0/90/180/270：朝向，拿不准写 0
- 同一个构件可重复出现（多棵树 → 多条记录）

## missing（缺什么）

只列**主体性**的东西：建筑、大型道具、特有植物。
小装饰（石头、花）不要列。每项：

\`\`\`json
{ "name": "风车", "category": "building", "brief": "一座带四片叶片的木制风车，高约 6 单位", "reason": "清单里没有风车" }
\`\`\`

brief 要能直接作为"生成一个构件"的需求描述。

## 输出

严格返回 JSON：\`{ notes, terrain: [...], objects: [...], missing: [...] }\`
`;

const RECON_SCHEMA = {
  type: 'object',
  properties: {
    notes: { type: 'string' },
    terrain: { type: 'array', items: { type: 'object' } },
    objects: { type: 'array', items: { type: 'object' } },
    missing: { type: 'array', items: { type: 'object' } },
  },
  required: ['objects', 'missing'],
};

/**
 * 图片 → 场景。
 * @param {object} req { images: string[], W, H, kit: [{id,name,category,desc,params}] }
 */
export async function reconstructScene(req, onProgress) {
  if (!Array.isArray(req.images) || !req.images.length) {
    throw new Error('还原场景必须提供一张图片');
  }
  const kit = Array.isArray(req.kit) ? req.kit : [];
  const kitLines = kit.map(c => {
    const ps = c.params
      ? Object.entries(c.params).map(([k, p]) => `${k}(${p.def}${p.max != null ? '~' + p.max : ''})`).join(', ')
      : '';
    return `- ${c.id}（${c.name}）[${c.category}] ${c.desc || ''}${ps ? ' · 参数: ' + ps : ''}`;
  }).join('\n');

  const prompt = `${RECON_SPEC}

## 场景画布

- 画布 ${req.W || 520}×${req.H || 380} 像素，等距投影
- 屏幕 x 轴 = 世界 (x−y)，屏幕 y 轴 = 世界 (x+y)/2 − 高度

## 现有构件库（${kit.length} 个）

${kitLines || '（空）'}

请分析图片并输出场景 JSON。`;

  const raw = await runClaude(prompt, RECON_SCHEMA, onProgress, req.images);
  return { ok: true, ...normalizeRecon(raw, kit) };
}

/** 校验 AI 输出：kind 白名单、u/v 夹紧、params 白名单 + 区间 */
function normalizeRecon(raw, kit) {
  const byId = new Map(kit.map(c => [c.id, c]));
  const objects = [];
  const missing = [];

  for (const o of raw.objects || []) {
    const kind = String(o.kind || '');
    const comp = byId.get(kind);
    if (!comp) {
      missing.push({
        name: kind || '未识别物体',
        category: 'prop',
        brief: `画面中有一个「${kind || '未知物体'}」，构件库里没有对应素材`,
        reason: 'AI 选的 kind 不在构件库中',
      });
      continue;
    }
    const params = {};
    for (const [k, v] of Object.entries(o.params || {})) {
      const def = comp.params && comp.params[k];
      if (!def) continue;                       /* 未知参数直接丢弃 */
      const n = Number(v);
      if (Number.isFinite(n)) params[k] = Math.min(def.max, Math.max(def.min, n));
    }
    objects.push({
      kind,
      u: clampNum(o.u, 0, 1),
      v: clampNum(o.v, 0, 1),
      scale: clampNum(o.scale == null ? 1 : o.scale, .3, 2.5),
      rot: Math.round(clampNum(o.rot || 0, 0, 359)),
      params,
      reason: String(o.reason || ''),
    });
  }

  const terrain = (raw.terrain || [])
    .filter(t => t && ['island', 'rect', 'path', 'hill'].includes(t.type))
    .map(t => ({ ...t }));

  const cats = ['tree', 'building', 'plant', 'prop', 'figure'];
  const miss = [
    ...missing,
    ...(raw.missing || []).map(m => ({
      name: String(m.name || '未命名素材'),
      category: cats.includes(m.category) ? m.category : 'prop',
      brief: String(m.brief || m.name || ''),
      reason: String(m.reason || ''),
    })),
  ];

  return { notes: String(raw.notes || ''), terrain, objects, missing: miss };
}

