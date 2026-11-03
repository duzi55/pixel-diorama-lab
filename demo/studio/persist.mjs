'use strict';
/* ------------------------------------------------------------------
 * 落盘器：把确认后的构件写进项目
 *
 * 三件套（AGENTS.md 硬性纪律：没登记的变体等于不存在）：
 *   1. demo/kit/<模块>.js    构件代码
 *   2. docs/kit/registry.md  注册表加一行
 *   3. docs/kit/<篇目>.md    配方卡
 *
 * 还负责场景 JSON 的存读。
 * ------------------------------------------------------------------ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(__dirname, '..', '..');
const KIT_DIR = path.join(REPO_DIR, 'demo', 'kit');
const DOCS_KIT = path.join(REPO_DIR, 'docs', 'kit');
const SCENE_DIR = path.join(REPO_DIR, 'demo', 'scenes');

/* 分类 → (代码模块文件, 文档篇目) */
const CATEGORY_MAP = {
  tree: { file: 'trees.js', doc: 'trees.md', label: '树' },
  building: { file: 'props.js', doc: 'buildings.md', label: '建筑' },
  plant: { file: 'trees.js', doc: 'plants.md', label: '草木' },
  prop: { file: 'props.js', doc: 'props.md', label: '道具' },
  figure: { file: 'props.js', doc: 'figures.md', label: '人物' },
};

/* ---------------- 构件落盘 ---------------- */

/**
 * 写一个构件。
 * @param {object} body { component, overwrite }
 */
export function saveComponent(body) {
  const c = body.component;
  if (!c || !c.id) throw new Error('缺少构件定义');

  const map = CATEGORY_MAP[c.category] || CATEGORY_MAP.prop;
  const codePath = path.join(KIT_DIR, map.file);
  const docPath = path.join(DOCS_KIT, map.doc);

  /* ---- 1. 代码 ---- */
  let code = fs.readFileSync(codePath, 'utf8');
  const already = code.includes(`id: '${c.id}'`);
  if (already && !body.overwrite) {
    throw new Error(`构件 "${c.id}" 已存在于 ${map.file}，请勾选覆盖或换一个 id`);
  }

  if (already) {
    /* 覆盖：删掉旧的 register 块，插入新的 */
    code = removeRegisterBlock(code, c.id);
  }
  const block = formatBlock(c);
  code = insertBlock(code, block);
  fs.writeFileSync(codePath, code, 'utf8');

  /* ---- 2. 注册表 ---- */
  const regPath = path.join(DOCS_KIT, 'registry.md');
  let reg = fs.readFileSync(regPath, 'utf8');
  reg = upsertRegistry(reg, c, map);
  fs.writeFileSync(regPath, reg, 'utf8');

  /* ---- 3. 配方卡 ---- */
  let doc = fs.existsSync(docPath) ? fs.readFileSync(docPath, 'utf8') : `# ${map.label}\n`;
  doc = upsertRecipeCard(doc, c, map);
  fs.writeFileSync(docPath, doc, 'utf8');

  return {
    ok: true,
    id: c.id,
    files: [
      path.relative(REPO_DIR, codePath),
      path.relative(REPO_DIR, regPath),
      path.relative(REPO_DIR, docPath),
    ],
  };
}

/* 把构件格式化成带注释的代码块 */
function formatBlock(c) {
  const lines = [];
  lines.push(`/* ---- ${c.name} · ${c.id} ---- */`);
  lines.push(`KIT.register({`);
  lines.push(`  id: '${c.id}',`);
  lines.push(`  name: '${c.name}',`);
  lines.push(`  category: '${c.category}',`);
  lines.push(`  desc: '${escapeSingle(c.desc || '')}',`);
  if (Object.keys(c.params || {}).length) {
    lines.push(`  params: {`);
    for (const [k, p] of Object.entries(c.params)) {
      lines.push(`    ${k}: { def: ${p.def}, min: ${p.min}, max: ${p.max}, step: ${p.step}, desc: '${escapeSingle(p.desc || '')}' },`);
    }
    lines.push(`  },`);
  }
  if (c.collision) {
    lines.push(`  collision: ${JSON.stringify(c.collision)},`);
  }
  lines.push(`  draw(ctx, inst) {`);
  lines.push(indent(c.code, 4));
  lines.push(`  },`);
  lines.push(`});`);
  lines.push('');
  return lines.join('\n');
}

/* 生成物的 draw 体内可能已含缩进，这里规整一下 */
function indent(code, n) {
  const pad = ' '.repeat(n);
  return code
    .split('\n')
    .filter((l, i, arr) => l.trim() || i < arr.length - 1)
    .map(l => (l.trim() ? pad + l.trim() : ''))
    .join('\n');
}

function escapeSingle(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');
}

/* 插入代码块：追加到文件末尾 */
function insertBlock(code, block) {
  return code.replace(/\s*$/, '\n\n' + block);
}

/* 删除已有的 register 块（覆盖场景） */
function removeRegisterBlock(code, id) {
  const marker = `id: '${id}'`;
  const at = code.indexOf(marker);
  if (at < 0) return code;

  /* 往前找块首注释行 */
  let start = code.lastIndexOf('/* ----', at);
  if (start < 0) start = code.lastIndexOf('KIT.register({', at);
  /* 往后找块尾 */
  let depth = 0, end = -1, seen = false;
  for (let i = code.indexOf('{', at); i < code.length; i++) {
    if (code[i] === '{') { depth++; seen = true; }
    else if (code[i] === '}') {
      depth--;
      if (seen && depth === 0) { end = i + 1; break; }
    }
  }
  if (end < 0) return code;
  /* 吃掉后面的换行 */
  while (code[end] === '\n') end++;
  return (code.slice(0, start) + code.slice(end)).replace(/\n{3,}/g, '\n\n');
}

/* ---------------- 注册表 ---------------- */

/* 注册表分节标题 → 分类 */
const REGISTRY_SECTION = {
  tree: '## 1. 树（tree）',
  building: '## 2. 建筑（building）',
  plant: '## 3. 草木（plant）',
  prop: '## 4. 道具（prop）',
  figure: '## 5. 人物姿态（pose）',
};

/* 注册表每行格式：| [`id`](doc#anchor) | 名称 | 特征 | 来源 | 参数组 | 状态 | */
function upsertRegistry(reg, c, map) {
  const paramNames = Object.keys(c.params || {});
  const paramsCell = paramNames.length ? paramNames.map(p => `\`${p}\``).join('/') : '—';
  const row = `| [\`${c.id}\`](${map.doc}#${c.id.replace(/[a-z0-9]+/g, m => m)}) | ${c.name} | ${c.desc || '—'} | \`demo\` \`kit/${map.file}\` | ${paramsCell} | ✅ |`;

  /* 找同 id 的行替换掉 */
  const rowRe = new RegExp(`^\\| \[\`${c.id}\`\\].*$`, 'm');
  if (rowRe.test(reg)) return reg.replace(rowRe, row);

  /* 插到对应分节的表格末尾 */
  const section = REGISTRY_SECTION[c.category];
  if (!section) return reg;
  const sAt = reg.indexOf(section);
  if (sAt < 0) return reg;
  /* 找该分节里下一个 "## " */
  const nextAt = reg.indexOf('\n## ', sAt + section.length);
  const end = nextAt < 0 ? reg.length : nextAt;
  const sectionText = reg.slice(sAt, end);
  /* 表格最后一行 */
  const lines = sectionText.split('\n');
  let lastRow = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('|')) lastRow = i;
  }
  if (lastRow < 0) return reg;
  lines.splice(lastRow + 1, 0, row);
  return reg.slice(0, sAt) + lines.join('\n') + reg.slice(end);
}

/* ---------------- 配方卡 ---------------- */

function upsertRecipeCard(doc, c, map) {
  const params = Object.entries(c.params || {});
  const paramRows = params.length
    ? params.map(([k, p]) => `| \`${k}\` | ${p.def} | ${p.min} ~ ${p.max} | ${p.step} | ${p.desc || '—'} |`).join('\n')
    : '| — | — | — | — | 无可调参数 |';

  const collision = c.collision
    ? `\`${JSON.stringify(c.collision)}\``
    : '无（可从地面穿过）';

  const card = `## ${c.id} — ${c.name}

| 项 | 内容 |
|---|---|
| **ID** | \`${c.id}\` |
| **来源** | \`demo/kit/${map.file}\` · \`KIT.register\` · studio 生成 |
| **形态** | ${c.desc || '—'} |
| **分类** | ${map.label} |

### 参数

| 参数 | 默认 | 区间 | 步进 | 说明 |
|------|------|------|------|------|
${paramRows}

### 碰撞体

${collision}

### 移植清单

- 代码：\`demo/kit/${map.file}\`
- 注册表：\`docs/kit/registry.md\` · ${map.label}节
- 依赖引擎：\`demo/engine.js\` 的 \`sphere/capsule/box/plot/rampOf/hash/noise\`

### 坑

${c.notes || '（待补充）'}

### 实现

\`\`\`js
${c.code.trim()}
\`\`\`
`;

  /* 已有同 id 的卡就替换 */
  const h = `## ${c.id} — ${c.name}`;
  const hRe = new RegExp(`^## ${c.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} — .*$`, 'm');
  if (hRe.test(doc)) {
    /* 替换到下一个 "## " 之前 */
    const at = doc.search(hRe);
    const next = doc.indexOf('\n## ', at + 1);
    const end = next < 0 ? doc.length : next + 1;
    return doc.slice(0, at) + card + doc.slice(end);
  }
  return doc.replace(/\s*$/, '\n\n' + card);
}

/* ---------------- 场景存读 ---------------- */

export function saveScene(name, scene) {
  if (!name || !/^[\w-]+$/.test(name)) throw new Error('场景名非法（只允许字母数字下划线连字符）');
  fs.mkdirSync(SCENE_DIR, { recursive: true });
  const file = path.join(SCENE_DIR, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(scene, null, 2), 'utf8');
  return { ok: true, name, file: path.relative(REPO_DIR, file) };
}

export function loadScene(name) {
  if (!name || !/^[\w-]+$/.test(name)) throw new Error('场景名非法');
  const file = path.join(SCENE_DIR, `${name}.json`);
  if (!fs.existsSync(file)) throw new Error(`场景不存在: ${name}`);
  return { ok: true, name, scene: JSON.parse(fs.readFileSync(file, 'utf8')) };
}

export function listScenes() {
  try {
    return fs.readdirSync(SCENE_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace(/\.json$/, ''));
  } catch { return []; }
}
