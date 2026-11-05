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
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateComponent } from './validate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(__dirname, '..', '..');
const KIT_DIR = path.join(REPO_DIR, 'demo', 'kit');
const DOCS_KIT = path.join(REPO_DIR, 'docs', 'kit');
const SCENE_DIR = path.join(REPO_DIR, 'demo', 'scenes');

/* 落盘后的冒烟：
   - 默认只跑构件库实画（~2s，能抓语法/重复 id/画不出来）
   - STUDIO_SCENE_SMOKE=1 时追加山村 + 编辑器场景测试（~12s）
   失败回滚，不能把已保存的场景弄坏。 */
const SMOKE_TESTS = [['构件库实画', 'tools/kit-test.mjs']];
const DEEP_SMOKE = [
  ['山村场景', 'tools/village-test.mjs'],
  ['场景编辑器', 'tools/editor-test.mjs'],
];

function runSmoke() {
  /* 默认不跑：保存要快。validateComponent 已经拦了语法/崩溃/位置。
     STUDIO_SMOKE=1 时跑构件库实画；再加 STUDIO_SCENE_SMOKE=1 跑场景测试。 */
  if (process.env.STUDIO_SMOKE !== '1') return [];
  const tests = process.env.STUDIO_SCENE_SMOKE === '1'
    ? [...SMOKE_TESTS, ...DEEP_SMOKE]
    : SMOKE_TESTS;
  const failures = [];
  for (const [label, script] of tests) {
    const file = path.join(REPO_DIR, script);
    if (!fs.existsSync(file)) continue;
    try {
      execFileSync(process.execPath, [file], {
        cwd: REPO_DIR, timeout: 120_000, stdio: 'pipe', encoding: 'utf8',
      });
    } catch (e) {
      const out = `${e.stdout || ''}\n${e.stderr || ''}`;
      const hit = out.split('\n')
        .filter(l => /✗|失败|ERROR|Error:|断言/.test(l) && !/^===/.test(l))
        .slice(0, 3).join(' / ');
      failures.push(`${label}：${hit || e.message.split('\n')[0]}`);
    }
  }
  return failures;
}

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

  const map0 = CATEGORY_MAP[c.category] || CATEGORY_MAP.prop;
  /* 已存在的构件**原地更新**：文件由它当前所在模块决定，不按分类重放。
     否则保存一个属性会把它从 cart.js 挪到 props.js，其它引用它的地方全乱。 */
  const oldLoc = findComponentFile(c.id);
  const map = oldLoc ? { ...map0, file: oldLoc.file } : map0;
  const codePath = oldLoc ? oldLoc.path : path.join(KIT_DIR, map.file);
  const docPath = path.join(DOCS_KIT, map.doc);
  const regPath = path.join(DOCS_KIT, 'registry.md');

  if (oldLoc && !body.overwrite) {
    throw new Error(`构件 "${c.id}" 已在 ${oldLoc.file} 里注册过，请勾选「覆盖同名构件」`);
  }

  const code0 = fs.readFileSync(codePath, 'utf8');
  /* 沙箱校验时带上同文件的辅助函数（去掉所有 register 块，只留 helper） */
  validateComponent(c, stripRegisterBlocks(code0));
  const block = formatBlock(c);
  /* 原位替换：保持构件在文件/列表里的顺序，只换这一块 */
  const code = oldLoc ? replaceRegisterBlock(code0, c.id, block) : insertBlock(code0, block);

  try {
    new Function(code);
  } catch (e) {
    throw new Error(`合并后的构件文件语法不通过（未写入）：${e.message}`);
  }

  /* 2. 注册表 */
  const reg0 = fs.readFileSync(regPath, 'utf8');
  const reg = upsertRegistry(reg0, c, map);

  /* 3. 配方卡 */
  const docExisted = fs.existsSync(docPath);
  const doc0 = docExisted ? fs.readFileSync(docPath, 'utf8') : `# ${map.label}\n`;
  const doc = upsertRecipeCard(doc0, c, map);

  /* 全部算好，一次落盘 */
  fs.writeFileSync(codePath, code, 'utf8');
  fs.writeFileSync(regPath, reg, 'utf8');
  fs.writeFileSync(docPath, doc, 'utf8');

  /* 冒烟：默认只跑构件库实画（快，能抓语法/重复 id/画不出来）；
     场景级冒烟用 STUDIO_SCENE_SMOKE=1 打开。失败回滚所有改动文件。 */
  const smoke = runSmoke();
  if (smoke.length) {
    fs.writeFileSync(codePath, code0, 'utf8');
    fs.writeFileSync(regPath, reg0, 'utf8');
    if (docExisted) fs.writeFileSync(docPath, doc0, 'utf8');
    else fs.rmSync(docPath, { force: true });
    throw new Error(`保存校验失败，已回滚（构件未保存）：\n${smoke.join('\n')}`);
  }

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

/* 构件源码切块（注释/字符串感知）—— 与 server.mjs 的 /api/kit 同款扫描器。
   ★ 不能只数括号：cart.js 的注释「// 1) 斗身…」里的 ) 会让深度提前归零，
   删块时会误删到别的构件。 */
function codeMask(src) {
  const n = src.length, mask = new Uint8Array(n);
  let i = 0;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { i += 2; while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i = Math.min(n, i + 2); continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      while (i < n) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === q) { i++; break; } i++; }
      continue;
    }
    mask[i] = 1; i++;
  }
  return mask;
}

/** 在源码里找 id 对应的 KIT.register(...) 块范围；找不到返回 null */
function findRegisterRange(code, id) {
  const mask = codeMask(code);
  const needle = 'KIT.register(';
  for (let at = 0; at <= code.length - needle.length; at++) {
    if (!mask[at] || !code.startsWith(needle, at)) continue;
    let depth = 0, end = -1;
    for (let i = at + needle.length - 1; i < code.length; i++) {
      if (!mask[i]) continue;
      if (code[i] === '(') depth++;
      else if (code[i] === ')') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    if (end < 0) return null;
    if (code.slice(at, end).includes(`id: '${id}'`)) return { start: at, end };
    at = end - 1;
  }
  return null;
}

/** 全库找这个 id 在哪个构件文件里（保存改过分类 / 从别处生成时，旧块可能在别的文件） */
function findComponentFile(id) {
  if (!fs.existsSync(KIT_DIR)) return null;
  for (const f of fs.readdirSync(KIT_DIR)) {
    if (!f.endsWith('.js')) continue;
    const p = path.join(KIT_DIR, f);
    const txt = fs.readFileSync(p, 'utf8');
    if (!txt.includes(`id: '${id}'`)) continue;
    const r = findRegisterRange(txt, id);
    if (r) return { file: f, path: p, code: txt, start: r.start, end: r.end };
  }
  return null;
}

/** 去掉源码里所有 KIT.register(...) 块，只留辅助函数 */
function stripRegisterBlocks(code) {
  const mask = codeMask(code);
  const needle = 'KIT.register(';
  const ranges = [];
  for (let at = 0; at <= code.length - needle.length; at++) {
    if (!mask[at] || !code.startsWith(needle, at)) continue;
    let depth = 0, end = -1;
    for (let i = at + needle.length - 1; i < code.length; i++) {
      if (!mask[i]) continue;
      if (code[i] === '(') depth++;
      else if (code[i] === ')') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    if (end < 0) break;
    ranges.push([at, end]);
    at = end - 1;
  }
  let out = '', pos = 0;
  for (const [a, b] of ranges) { out += code.slice(pos, a); pos = b; }
  return out + code.slice(pos);
}

function insertBlock(code, block) {
  return code.replace(/\s*$/, '\n\n' + block);
}

/** 原位替换（保持构件在列表里的位置；找不到就追加） */
function replaceRegisterBlock(code, id, block) {
  const r = findRegisterRange(code, id);
  if (!r) return insertBlock(code, block);
  let start = r.start;
  /* 连带块前的注释行一起替换 */
  const before = code.slice(0, start);
  const m = before.match(/\/\* ----[^\n]*\*\/\s*$/);
  if (m) start -= m[0].length;
  let end = r.end;
  while (code[end] === ';') end++;
  /* 块后的空行原样保留：只吃掉紧邻的换行，然后补回一个空行 */
  let e2 = end;
  while (code[e2] === '\n') e2++;
  return code.slice(0, start) + block.trimEnd() + '\n\n' + code.slice(e2);
}

function removeRegisterBlock(code, id) {
  const r = findRegisterRange(code, id);
  if (!r) return code;
  let start = r.start;
  const before = code.slice(0, start);
  const m = before.match(/\/\* ----[^\n]*\*\/\s*$/);
  if (m) start -= m[0].length;
  let end = r.end;
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

const SCENE_INDEX = path.join(SCENE_DIR, 'index.json');

/** 场景索引（导航与载入列表用）：[{ name, title, bg, W, H, updated }] */
function readSceneIndex() {
  try {
    const data = JSON.parse(fs.readFileSync(SCENE_INDEX, 'utf8'));
    return Array.isArray(data.scenes) ? data.scenes : [];
  } catch { return []; }
}

function writeSceneIndex(list) {
  fs.mkdirSync(SCENE_DIR, { recursive: true });
  fs.writeFileSync(SCENE_INDEX, JSON.stringify({ scenes: list }, null, 2), 'utf8');
}

export function saveScene(name, scene) {
  if (!name || !/^[\w-]+$/.test(name)) throw new Error('场景名非法（只允许字母数字下划线连字符）');
  fs.mkdirSync(SCENE_DIR, { recursive: true });
  const file = path.join(SCENE_DIR, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(scene, null, 2), 'utf8');

  /* 同步索引：顺手清掉磁盘上已不存在的条目（手动删 JSON 的情况） */
  const idx = readSceneIndex().filter(e => e && e.name && fs.existsSync(path.join(SCENE_DIR, `${e.name}.json`)));
  const entry = {
    name,
    title: scene.title || name,
    bg: scene.bg || null,
    W: scene.W || null,
    H: scene.H || null,
    updated: new Date().toISOString(),
  };
  const at = idx.findIndex(e => e.name === name);
  if (at >= 0) idx[at] = entry; else idx.push(entry);
  writeSceneIndex(idx);

  return {
    ok: true, name,
    file: path.relative(REPO_DIR, file),
    view: `../scenes/view.html?name=${encodeURIComponent(name)}`,
  };
}

export function loadScene(name) {
  if (!name || !/^[\w-]+$/.test(name)) throw new Error('场景名非法');
  const file = path.join(SCENE_DIR, `${name}.json`);
  if (!fs.existsSync(file)) throw new Error(`场景不存在: ${name}`);
  return { ok: true, name, scene: JSON.parse(fs.readFileSync(file, 'utf8')) };
}

/** 只要名字（旧接口，编辑器载入下拉用） */
export function listScenes() {
  try {
    return fs.readdirSync(SCENE_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace(/\.json$/, ''))
      .filter(n => n !== 'index');
  } catch { return []; }
}

/** 带元数据的索引（导航用）；索引里没有的历史场景按 JSON 回填 */
export function listSceneIndex() {
  const idx = readSceneIndex().filter(e => e && e.name && fs.existsSync(path.join(SCENE_DIR, `${e.name}.json`)));
  const known = new Set(idx.map(e => e.name));
  for (const name of listScenes()) {
    if (known.has(name)) continue;
    try {
      const scene = JSON.parse(fs.readFileSync(path.join(SCENE_DIR, `${name}.json`), 'utf8'));
      idx.push({
        name,
        title: scene.title || name,
        bg: scene.bg || null,
        W: scene.W || null,
        H: scene.H || null,
        updated: null,
      });
    } catch { /* 坏文件跳过，不影响列表 */ }
  }
  return idx;
}
