'use strict';
/* ------------------------------------------------------------------
 * 落盘器：把确认后的构件写进项目（persist.mjs）
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
import { validateComponent } from './validate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(__dirname, '..', '..');
const KIT_DIR = path.join(REPO_DIR, 'demo', 'kit');
const DOCS_KIT = path.join(REPO_DIR, 'docs', 'kit');
const SCENE_DIR = path.join(REPO_DIR, 'demo', 'scenes');

/* 分类 → (代码模块文件, 文档篇目) —— 与 docs/kit/ 篇目一一对应 */
const CATEGORY_MAP = {
  tree:     { file: 'trees.js',     doc: 'trees.md',     label: '树' },
  plant:    { file: 'plants.js',    doc: 'plants.md',    label: '草木' },
  building: { file: 'buildings.js', doc: 'buildings.md', label: '建筑' },
  prop:     { file: 'props.js',     doc: 'props.md',     label: '道具' },
  figure:   { file: 'props.js',     doc: 'figures.md',   label: '人物' },
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
  const regPath = path.join(DOCS_KIT, 'registry.md');

  /* 先过沙箱实画校验 */
  validateComponent(c);

  const code0 = fs.readFileSync(codePath, 'utf8');
  const already = code0.includes(`id: '${c.id}'`);
  if (already && !body.overwrite) {
    throw new Error(`构件 "${c.id}" 已存在于 ${map.file}，请勾选覆盖或换一个 id`);
  }

  /* 1. 代码 */
  let code = already ? removeRegisterBlock(code0, c.id) : code0;
  code = insertBlock(code, formatBlock(c));

  try {
    new Function(code);
  } catch (e) {
    throw new Error(`合并后的 ${path.basename(codePath)} 语法不通过（未写入）：${e.message}`);
  }

  /* 2. 注册表 */
  const reg = upsertRegistry(fs.readFileSync(regPath, 'utf8'), c, map);

  /* 3. 配方卡 */
  const doc0 = fs.existsSync(docPath) ? fs.readFileSync(docPath, 'utf8') : `# ${map.label}\n`;
  const doc = upsertRecipeCard(doc0, c, map);

  /* 全部算好，一次落盘 */
  fs.writeFileSync(codePath, code, 'utf8');
  fs.writeFileSync(regPath, reg, 'utf8');
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

function formatBlock(c) {
  const code = String(c.code || '');
  if (/^\s*KIT\.register\s*\(/m.test(code)) {
    return `/* ---- ${c.name} · ${c.id} ---- */\n${code.trim()}\n`;
  }

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
  lines.push(indent(code, 4));
  lines.push(`  },`);
  lines.push(`});`);
  lines.push('');
  return lines.join('\n');
}

function indent(code, n) {
  const pad = ' '.repeat(n);
  const raw = String(code).split('\n');
  const indents = raw.filter(l => l.trim()).map(l => l.match(/^\s*/)[0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return raw
    .map(l => (l.trim() ? pad + l.slice(min) : ''))
    .join('\n');
}

function escapeSingle(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');
}

function insertBlock(code, block) {
  return code.replace(/\s*$/, '\n\n' + block);
}

function removeRegisterBlock(code, id) {
  const marker = `id: '${id}'`;
  const at = code.indexOf(marker);
  if (at < 0) return code;

  const callAt = code.lastIndexOf('KIT.register(', at);
  if (callAt < 0) return code;

  let start = code.lastIndexOf('/* ----', callAt);
  if (start < 0) start = callAt;

  const open = code.indexOf('(', callAt);
  let depth = 0, end = -1;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '(') depth++;
    else if (code[i] === ')') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end < 0) return code;
  while (code[end] === ';' || code[end] === '\n') end++;
  return (code.slice(0, start) + code.slice(end)).replace(/\n{3,}/g, '\n\n');
}

/* ---------------- 注册表 ---------------- */

function gitAnchor(id, name) {
  const raw = `${id} — ${name}`;
  return raw
    .toLowerCase()
    .replace(/[^\w\s一-鿿-]/g, '')
    .trim()
    .replace(/ /g, '-');
}

const REGISTRY_SECTION = {
  tree: '## 1. 树（tree）',
  building: '## 2. 建筑（building）',
  plant: '## 3. 草木（plant）',
  prop: '## 4. 道具（prop）',
  figure: '## 5. 人物姿态（pose）',
};

function upsertRegistry(reg, c, map) {
  const paramNames = Object.keys(c.params || {});
  const paramsCell = paramNames.length ? paramNames.map(p => `\`${p}\``).join('/') : '—';
  const row = `| [\`${c.id}\`](${map.doc}#${gitAnchor(c.id, c.name)}) | ${c.name} | ${c.desc || '—'} | \`demo\` \`kit/${map.file}\` | ${paramsCell} | ✅ |`;

  const lines = reg.split('\n');
  const prefix = `| [\`${c.id}\`]`;
  let at = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(prefix)) { at = i; break; }
  }
  if (at >= 0) {
    lines[at] = row;
    return lines.join('\n');
  }

  const section = REGISTRY_SECTION[c.category];
  if (!section) return reg;
  const sAt = reg.indexOf(section);
  if (sAt < 0) return reg;
  const nextAt = reg.indexOf('\n## ', sAt + section.length);
  const end = nextAt < 0 ? reg.length : nextAt;
  const sectionText = reg.slice(sAt, end);
  const sectionLines = sectionText.split('\n');
  let lastRow = -1;
  for (let i = 0; i < sectionLines.length; i++) {
    if (sectionLines[i].startsWith('|')) lastRow = i;
  }
  if (lastRow < 0) return reg;
  sectionLines.splice(lastRow + 1, 0, row);
  return reg.slice(0, sAt) + sectionLines.join('\n') + reg.slice(end);
}

/* ---------------- 配方卡 ---------------- */

function demoteHeadings(text) {
  return String(text)
    .split('\n')
    .map(line => {
      const m = line.match(/^(#{1,5})\s+(.*)$/);
      if (!m) return line;
      const level = Math.min(6, m[1].length + 2);
      return '#'.repeat(level) + ' ' + m[2];
    })
    .join('\n')
    .trim();
}

function upsertRecipeCard(doc, c, map) {
  const params = Object.entries(c.params || {});
  const paramRows = params.length
    ? params.map(([k, p]) => `| \`${k}\` | ${p.def} | ${p.min} ~ ${p.max} | ${p.step} | ${p.desc || '—'} |`).join('\n')
    : '| — | — | — | — | 无可调参数 |';

  const collision = c.collision
    ? `\`${JSON.stringify(c.collision)}\``
    : '无（可从地面穿过）';

  const notes = demoteHeadings(c.notes || '');

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

### 实现说明

${notes || '（待补充）'}

### 实现

\`\`\`js
${c.code.trim()}
\`\`\`
`;

  const hRe = new RegExp(`^## ${c.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} — .*$`, 'm');
  if (hRe.test(doc)) {
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
