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
| ctx.sphere(x,y,z,r,color,mode) | 球体，mode: 'rough'|'gloss'|'solid' |
| ctx.capsule(a,b,r0,r1,colorOf,mode) | 胶囊，a/b 是 [x,y,z] |
| ctx.box(x0,y0,z0,x1,y1,z1,color,seed) | 盒子，只画顶/前/右三面 |
| ctx.plot(x,y,z,color) | 单像素写入（做深度测试） |
| ctx.rampOf([r,g,b]) | 生成 5 级色阶数组 |
| ctx.rgb(r,g,b) | 打包颜色（ABGR） |
| ctx.hash(k, seed) | 确定性随机 [0,1) |
| ctx.noise(x,y) | 值噪声 [0,1) |
| ctx.lerp(a,b,t) / ctx.clamp(v,a,b) | 数学助手 |
| ctx.shadow(r, strength, dither) | 给本实例投一片地面阴影 |

## 铁律（违反就是错）

1. **颜色**：基色写成 \`[r,g,b]\` 数组，用 \`ctx.rampOf()\` 取色阶。禁止手写 5 档颜色。
   同类色的通道差控制在 10~25 —— 跨度太大时 Bayer 抖动会读成棋盘格。
2. **随机**：一律 \`ctx.hash(k, ctx.seed)\`，**禁止 Math.random()**。必须可复现。
3. **遮挡**：所有绘制走 ctx.sphere/capsule/box/plot，它们自动做深度测试。
   画墙面细节（窗、门）时坐标要**向相机方向偏移**（如 y + 0.14），否则会被墙盖住。
4. **体积感**：正面比侧面亮一档，靠光的侧面加暖色 rim。深度缓冲是唯一遮挡依据。
5. **尺度**：世界单位。1 单位 ≈ 一个人的高度（人约 1.8 高）。树高 3~7，房屋宽 3~6。
6. **阴影**：在 draw 末尾调 \`ctx.shadow(r, 1, .5)\` 让物体在地面留下影子。
7. **代码规模**：单个构件 40~120 行。超过 200 行说明该拆。
8. **不要**：不写 module.exports，不写 import，不写 class，不写 async。
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
  },
  required: ['id', 'name', 'category', 'desc', 'params', 'code', 'notes'],
};

/**
 * 调 claude CLI 生成构件。
 * @param {object} req { prompt, category, note }
 * @returns {Promise<object>} 构件定义
 */
export async function generate(req) {
  const prompt = buildPrompt(req);
  const raw = await runClaude(prompt, SCHEMA);
  return { ok: true, component: normalize(raw) };
}

/* 组装提示词：规范 + 用户需求 + 现有构件清单（避免重造轮子） */
function buildPrompt(req) {
  const existing = listExisting();
  const cat = req.category ? `\n\n## 分类要求\n这个构件的分类必须是 \`${req.category}\`。` : '';
  const note = req.note ? `\n\n## 补充说明\n${req.note}` : '';
  const avoid = existing.length
    ? `\n\n## 现有构件（不要重复造轮子）\n${existing.join('\n')}\n\n如果需求能用已有构件的参数组合实现，**说明原因**并给出该方案。`
    : '';

  return `${KIT_SPEC}${cat}${avoid}${note}

## 你的任务

用户想要：**${req.prompt}**

请设计并实现这个构件。返回结构化 JSON。`;
}

/* 列出现有构件：扫描 demo/kit/ 里的 KIT.register 调用 */
function listExisting() {
  const dir = path.join(REPO_DIR, 'demo', 'kit');
  const out = [];
  let files = [];
  try { files = fs.readdirSync(dir); } catch { return out; }
  for (const f of files) {
    if (!f.endsWith('.js')) continue;
    const txt = fs.readFileSync(path.join(dir, f), 'utf8');
    const re = /KIT\.register\(\s*\{[\s\S]*?id:\s*'([^']+)'[\s\S]*?name:\s*'([^']+)'/g;
    let m;
    while ((m = re.exec(txt))) out.push(`- ${m[1]}（${m[2]}）· demo/kit/${f}`);
  }
  return out;
}

/* 跑 claude CLI，拿结构化输出 */
function runClaude(prompt, schema) {
  return new Promise((resolve, reject) => {
    const args = [
      '-p', prompt,
      '--output-format', 'json',
      '--json-schema', JSON.stringify(schema),
      '--tools', '',            /* 禁用工具：AI 只写代码 */
      '--permission-mode', 'dontAsk',
      '--no-session-persistence',
      '--max-budget-usd', '2',
    ];

    const child = spawn('claude', args, {
      cwd: REPO_DIR,
      env: { ...process.env },
    });

    let out = '', err = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('error', e => reject(new Error('无法启动 claude CLI: ' + e.message)));
    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(`claude CLI 退出码 ${code}: ${err.slice(0, 800)}`));
        return;
      }
      /* CLI 输出是 JSON 行，最后一行是 result 对象 */
      const line = out.trim().split('\n').filter(Boolean).pop();
      let parsed;
      try { parsed = JSON.parse(line); }
      catch (e) {
        reject(new Error('CLI 输出不是合法 JSON: ' + line.slice(0, 400)));
        return;
      }
      if (parsed.structured_output) return resolve(parsed.structured_output);
      if (parsed.result) {
        try { return resolve(JSON.parse(parsed.result)); }
        catch { /* 落到下面的兜底 */ }
      }
      reject(new Error('CLI 未返回结构化输出'));
    });
  });
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
