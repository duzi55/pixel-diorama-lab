'use strict';
/* ------------------------------------------------------------------
 * AI 桥：调 claude CLI 生成构件
 *
 * 用 `claude -p --output-format json --json-schema ...` 拿结构化输出，
 * 避免解析自由文本。禁用所有工具（AI 只该写代码，不该碰文件系统）。
 *
 * 提示词模板是「按项目规范生成」的关键 —— 规范来自 docs/kit/。
 * ------------------------------------------------------------------ */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runClaude } from './cli.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(__dirname, '..', '..');

/* ---------------- 构件规范（注入提示词） ---------------- */

const KIT_SPEC = `
你是一个等距像素微缩景观（isometric pixel diorama）项目的**构件工程师**。
项目零依赖、零构建：原生 HTML/CSS/JS + Canvas 2D，画面全部由代码生成，
不使用外部图片、模型、字体文件。

## 你要产出什么

一个"构件"（component）：一段可复用的 JS 代码，注册进构件库运行时。
它是一个独立骨架结构（树/建筑/草木/道具/人物），可以被编辑器摆到场景里。

## 运行时契约（必须严格遵守）

注册方式：

\`\`\`js
KIT.register({
  id: 'kebab-case-id',      // 稳定英文标识，一经使用不改名
  name: '中文名',
  category: 'tree|building|plant|prop|figure',
  desc: '一句话形态描述',
  params: {
    参数名: { def: 默认值, min: 最小, max: 最大, step: 步进, desc: '说明' },
  },
  collision: { type: 'box|cylinder', ... },   // 可选
  draw(ctx, inst) { /* 绘制 */ },
});
\`\`\`

draw(ctx, inst) 里可用的 ctx 成员：

| 成员 | 说明 |
|------|------|
| ctx.x / ctx.y / ctx.z | 实例在世界坐标的位置 |
| ctx.params | 参数表（已夹到合法区间） |
| ctx.seed | 实例随机种子（整数） |
| ctx.sphere(x,y,z,r,color,mode) | 球体，mode: 'rough'\|'gloss'\|'solid' |
| ctx.capsule(a,b,r0,r1,colorOf,mode) | 胶囊，a/b 是 [x,y,z] |
| ctx.box(x0,y0,z0,x1,y1,z1,color,seed) | 盒子，只画顶/前/右三面 |
| ctx.plot(x,y,z,color) | 单像素写入（做深度测试） |
| ctx.rampOf([r,g,b]) | 基色 → 5 档打包色阶（给 plot / 像素直写用） |
| ctx.rgb(r,g,b) | 打包颜色（ABGR，只给 plot / 像素直写用） |
| ctx.hash(k, seed) | 确定性随机 [0,1) |
| ctx.noise(x,y) | 值噪声 [0,1) |
| ctx.lerp(a,b,t) / ctx.clamp(v,a,b) | 数学助手 |
| ctx.shadow(r, strength, dither) | 给本实例投一片地面阴影 |

## 铁律（违反就是错，保存前会机器校验，违者直接拒收）

1. **坐标必须以实例为原点**：所有绘制坐标都要基于 ctx.x / ctx.y 偏移，
   例如 \`ctx.sphere(ctx.x + 1, ctx.y, z, ...)\`。
   **禁止裸写 [0,0,...] 当作物体位置** —— 编辑器把构件摆在哪，画面就必须在哪。
   保存前的机器校验会在 (4,2) 位置画一次，画到原点去的构件直接拒收。
2. **颜色分两张皮，用错必崩**：
   - \`sphere / capsule / box\` 的颜色参数：**只吃 [r,g,b] 基色数组**。
     \`rampOf(...)\` 的返回值和 \`rgb(...)\` 是打包像素，喂给它们会当场抛异常。
   - capsule 想按高度变色：在 colorOf 里返回**不同的基色数组**，
     如 \`z => z > 2 ? BARK_HI : BARK\`（BARK、BARK_HI 都是 [r,g,b] 数组）。
   - \`plot()\` 与像素直写：用 \`rgb(r,g,b)\` 打包值，或 \`rampOf(基色)[档位]\`。
3. **颜色基调**：基色写成 \`[r,g,b]\` 数组。同类色的通道差控制在 10~25 ——
   跨度太大时 Bayer 抖动会读成棋盘格。
4. **随机**：一律 \`ctx.hash(k, ctx.seed)\`，**禁止 Math.random()**。必须可复现。
5. **遮挡**：所有绘制走 ctx.sphere/capsule/box/plot，它们自动做深度测试。
   画墙面细节（窗、门）时坐标要**向相机方向偏移**（如 y + 0.14），否则会被墙盖住。
6. **体积感**：正面比侧面亮一档，靠光的侧面加暖色 rim。深度缓冲是唯一遮挡依据。
7. **尺度**：世界单位。1 单位 ≈ 一个人的高度（人约 1.8 高）。树高 3~7，房屋宽 3~6。
8. **阴影**：在 draw 末尾调 \`ctx.shadow(r, 1, .5)\` 让物体在地面留下影子。
9. **代码规模**：单个构件 40~120 行。超过 200 行说明该拆。
10. **不要**：不写 module.exports，不写 import，不写 class，不写 async。
   只用全局作用域里的 KIT / ctx / 引擎函数。
9. **不许自造顶层 const**：函数内用 const 没问题，顶层只允许函数与 KIT.register 调用。
   （顶层 const 重名会让整个页面挂掉）

## 输出格式

严格返回 JSON：

\`\`\`json
{
  "id": "kebab-case-id",
  "name": "中文名",
  "category": "tree",
  "desc": "一句话形态",
  "params": {
    "参数名": { "def": 0, "min": 0, "max": 1, "step": 0.1, "desc": "说明" }
  },
  "collision": { "type": "cylinder", "radius": 0.3, "height": 5 },
  "code": "完整的 JS 源码，包含 KIT.register({...}) 调用",
  "notes": "实现要点、坑、以及它与已有构件的差异"
}
\`\`\`

code 字段是**可直接粘贴运行**的完整代码片段。
`;


/* ---------------- 按规格实现 ---------------- */

/**
 * 按 `docs/kit/` 里的现成规格实现一个变体。
 *
 * 与 generate() 的区别：这不是自由创作，而是**照抄配方卡**——
 * 规格里已经写清了骨架差异、参数表、算法要点、源码锚点。
 * AI 的任务是把它翻译成符合运行时契约的代码，不是重新设计。
 *
 * @param {object} req { id, name, category, spec }
 */
export async function generateFromSpec(req, onProgress) {
  const prompt = KIT_SPEC + `

## 重要：这是「照规格实现」，不是自由创作

下面给出的是 docs/kit/ 里已经写好的**配方卡规格**。
规格里的骨架差异、参数表、算法要点、源码锚点都是**既定的**，
你的任务是把它翻译成符合上面运行时契约的代码。

- 不要改变参数名与参数区间 —— 规格里写死了
- 不要新增规格里没有的骨架特征
- 规格提到的算法（如"沿弧线下垂"、"极角分缝"）要真的实现，不要用近似糊弄
- 规格提到的坑要规避
- 规格没写的地方（颜色、seed 处理）按上面的铁律来
- **id 必须原样用 \`${req.id}\`，name 必须原样用「${req.name}」** —— 不要自己起名

## 配方卡规格

### \`${req.id}\` — ${req.name}

分类：${req.category}

${req.spec}

请按上面这份规格实现构件。返回结构化 JSON。`;

  const raw = await runClaude(prompt, SCHEMA, onProgress, req.images);
  const comp = normalize(raw);

  /* **强制用请求里的 id/name** —— AI 可能自造 id（如返回 "x"）。
     id 是注册表的唯一键，必须由调用方决定。 */
  if (req.id) {
    comp.id = req.id;
    comp.code = comp.code.replace(/id:\s*'[^']*'/g, `id: '${req.id}'`);
  }
  if (req.name) comp.name = req.name;
  if (req.category) comp.category = req.category;

  return { ok: true, component: comp };
}

/* ---------------- 碰撞体推断 ---------------- */

const COLLISION_SPEC = `
你是一个等距像素微缩景观项目的**碰撞体工程师**。
项目零依赖、零构建，画面由代码生成。

## 任务

给定一个构件（树/建筑/道具等）及其参数，推断它的**碰撞体积**。
碰撞体用于路径规划与点击拾取，必须**贴合实际外形**，既不虚胖也不穿帮。

## 碰撞体格式

两种之一：

\`\`\`json
{ "type": "box", "w": 4.4, "d": 3.4, "h": 2.8 }
{ "type": "cylinder", "radius": 0.35, "height": 5.0 }
\`\`\`

- box：w = x 方向宽，d = y 方向深，h = 高度。用于方正的建筑、箱体。
- cylinder：radius = 半径，height = 高度。用于圆形的树干、圆柱形物体。

## 规则

1. **世界单位**：1 单位 ≈ 一个人的高度（人约 1.8 高）。
   树高 3~7，房屋宽 3~6，小道具 0.3~1.5。
2. **贴合外形**：
   - 树 → cylinder，radius 取树干粗细（0.2~0.5），height 取树高
   - 房屋 → box，w/d 取实际占地，h 取墙高（不含屋顶）
   - 细长杆子（路灯、栅栏）→ cylinder，radius 很小，height 取全高
   - 圆物体（井、桶）→ cylinder
3. **不要包含装饰**：屋顶的挑檐、树冠、伸出的横杆不计入体积。
4. **h 的含义**：box 的 h 是墙高，cylinder 的 height 是物体总高。
5. 必须结合给出的 params 实际数值推断 —— 别用固定模板。
`;

/**
 * 推断碰撞体。
 * @param {object} req { kind, name, desc, params, current }
 */
export async function inferCollision(req, onProgress) {
  const prompt = `${COLLISION_SPEC}

## 构件信息

- ID: \`${req.kind}\`
- 名称: ${req.name || req.kind}
- 形态: ${req.desc || '（无描述）'}
- 当前参数: ${JSON.stringify(req.params || {})}
${req.current ? `- 现有碰撞体: ${JSON.stringify(req.current)}` : ''}

请推断这个构件的碰撞体积。返回结构化 JSON。`;

  const schema = {
    type: 'object',
    properties: {
      collision: { type: 'object' },
      reason: { type: 'string' },
    },
    required: ['collision', 'reason'],
  };

  const raw = await runClaude(prompt, schema, onProgress);
  const c = raw.collision || {};

  /* 校验并夹到合理范围 */
  let collision = null;
  if (c.type === 'box') {
    const w = clampNum(c.w, .05, 30), d = clampNum(c.d, .05, 30), h = clampNum(c.h, .05, 30);
    collision = { type: 'box', w, d, h };
  } else if (c.type === 'cylinder') {
    const r = clampNum(c.radius, .02, 15), h = clampNum(c.height, .05, 30);
    collision = { type: 'cylinder', radius: r, height: h };
  }

  return { ok: true, collision, reason: raw.reason || '' };
}

function clampNum(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

/* ---------------- CLI 调用 ---------------- */

/* 结构化输出 schema：强制 CLI 返回合法 JSON */
const SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    category: { type: 'string' },
    desc: { type: 'string' },
    params: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          def: { type: 'number' },
          min: { type: 'number' },
          max: { type: 'number' },
          step: { type: 'number' },
          desc: { type: 'string' },
        },
        required: ['def', 'min', 'max', 'step', 'desc'],
      },
    },
    collision: { type: 'object' },
    code: { type: 'string' },
    notes: { type: 'string' },
    duplicate: { type: 'boolean' },
    existingId: { type: 'string' },
  },
  required: ['id', 'name', 'category', 'desc', 'params', 'code', 'notes'],
};

/**
 * 调 claude CLI 生成构件。
 * @param {object} req { prompt, category, note }
 * @returns {Promise<object>} 构件定义
 */
export async function generate(req, onProgress) {
  void 0;
  const prompt = buildPrompt(req);
  const raw = await runClaude(prompt, SCHEMA, onProgress, req.images);

  /* 重复逃生门：AI 认定需求与现有构件同骨架时，拒收并告知用户 */
  if (raw.duplicate && raw.existingId) {
    throw new Error(
      `这个需求已有现成构件「${raw.existingId}」—— ${raw.notes || '请在编辑器直接使用它，或把需求描述改得更具体（说明与现有构件的骨架差异）'}`
    );
  }

  return { ok: true, component: normalize(raw) };
}

/* 组装提示词：规范 + 用户需求 + 现有构件清单（避免重造轮子） */
function buildPrompt(req) {
  const existing = listExisting();
  const cat = req.category ? `\n\n## 分类要求\n这个构件的分类必须是 \`${req.category}\`。` : '';
  const note = req.note ? `\n\n## 补充说明\n${req.note}` : '';
  const avoid = existing.length
    ? `\n\n## 现有构件（先查这里，不要重复造轮子）\n${existing.join('\n')}

对照这份清单逐条检查用户需求：
- 若需求的**骨架**（结构、部件组成）与某现有构件相同，只是配色/尺寸/朝向不同
  —— **不要重新生成**，返回 \`duplicate: true\` 和 \`existingId\`，在 notes 里说明该调哪些参数。
- 只有骨架确实不同（有现有构件做不出来的部件/结构）才新建。`
    : '';

  return `${KIT_SPEC}${cat}${avoid}${note}

## 你的任务

用户想要：**${req.prompt}**

请设计并实现这个构件。返回结构化 JSON。`;
}

/* 列出现有构件：扫描 demo/kit/ 里的 KIT.register 调用（带 desc，供 AI 判断骨架差异） */
function listExisting() {
  const dir = path.join(REPO_DIR, 'demo', 'kit');
  const out = [];
  let files = [];
  try { files = fs.readdirSync(dir); } catch { return out; }
  for (const f of files) {
    if (!f.endsWith('.js')) continue;
    const txt = fs.readFileSync(path.join(dir, f), 'utf8');
    const re = /KIT\.register\(\s*\{[\s\S]*?id:\s*'([^']+)'[\s\S]*?name:\s*'([^']+)'[\s\S]*?desc:\s*'([^']*)'/g;
    let m;
    while ((m = re.exec(txt))) out.push(`- ${m[1]}（${m[2]}）：${m[3] || '（无描述）'} · demo/kit/${f}`);
  }
  return out;
}

/* 规范化：补默认值、夹范围、校验 */
function normalize(c) {
  if (!c || typeof c !== 'object') throw new Error('生成结果不是对象');
  if (!c.id || !/^[a-z][a-z0-9-]*$/.test(c.id)) {
    throw new Error(`构件 id 非法: ${c.id}（要 kebab-case）`);
  }
  if (!c.code || typeof c.code !== 'string') throw new Error('生成结果缺少 code');

  const cats = ['tree', 'building', 'plant', 'prop', 'figure'];
  if (!cats.includes(c.category)) c.category = 'prop';

  const params = {};
  for (const [k, p] of Object.entries(c.params || {})) {
    const def = Number(p.def) || 0;
    const min = p.min == null ? def : Number(p.min);
    const max = p.max == null ? def : Number(p.max);
    params[k] = {
      def: Math.min(Math.max(def, min), max),
      min, max,
      step: p.step == null ? (max > min ? (max - min) / 20 : 1) : Number(p.step),
      desc: p.desc || '',
    };
  }

  return {
    id: c.id,
    name: c.name || c.id,
    category: c.category,
    desc: c.desc || '',
    params,
    collision: c.collision || null,
    code: c.code,
    notes: c.notes || '',
  };
}

/* 场景还原在 ai-recon.mjs（500 行约束），re-export 供 /api/reconstruct 路由查找 */
export { reconstructScene } from './ai-recon.mjs';
