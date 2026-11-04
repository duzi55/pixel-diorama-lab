#!/usr/bin/env node
/* ------------------------------------------------------------------
 * 批量补齐 docs/kit/ 里标记 📐 的待实现变体
 *
 * 流程与 Studio 生成页一致，只是批量化：
 *   1. 从 docs/kit/<篇目>.md 抽出每个变体的规格节
 *   2. 调 Studio 服务端 /api/generate-from-spec（照规格实现，不自由创作）
 *   3. 落盘三件套：demo/kit/<模块>.js + registry.md + 配方卡
 *
 * 用法：
 *   node demo/studio/server.mjs 5320 &          # 先起服务
 *   node tools/fill-variants.mjs birch willow    # 只补指定的
 *   node tools/fill-variants.mjs                 # 补全部待实现的
 * ------------------------------------------------------------------ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const BASE = process.env.STUDIO_URL || 'http://127.0.0.1:5320';

/* ------------------------------------------------------------------
 * 待补齐清单
 * specDoc/specHead：从哪篇文档的哪个小节抽规格
 * category：落进哪个分类（决定代码模块与文档篇目）
 * ------------------------------------------------------------------ */
const TARGETS = [
  /* ---- 树 ---- */
  { id: 'birch', name: '白桦', category: 'tree',
    specDoc: 'docs/kit/trees.md', specHead: '`birch` 白桦' },
  { id: 'willow', name: '垂柳', category: 'tree',
    specDoc: 'docs/kit/trees.md', specHead: '`willow` 垂柳' },

  /* ---- 建筑 ---- */
  { id: 'shed', name: '棚屋', category: 'building',
    specDoc: 'docs/kit/buildings.md', specHead: '`shed` 棚屋' },
  { id: 'arch', name: '拱门', category: 'building',
    specDoc: 'docs/kit/buildings.md', specHead: '`arch` 拱门' },
  { id: 'well-house', name: '水井', category: 'building',
    specDoc: 'docs/kit/buildings.md', specHead: '`well` 水井',
    rename: 'well-house' },

  /* ---- 草木 ---- */
  { id: 'fern', name: '蕨类', category: 'plant',
    specDoc: 'docs/kit/plants.md', specHead: '`fern` 蕨类' },
  { id: 'reed', name: '芦苇', category: 'plant',
    specDoc: 'docs/kit/plants.md', specHead: '`reed` 芦苇' },
  { id: 'ivy', name: '藤蔓', category: 'plant',
    specDoc: 'docs/kit/plants.md', specHead: '`ivy` 藤蔓' },

  /* ---- 道具 ---- */
  { id: 'lamp', name: '路灯', category: 'prop',
    specDoc: 'docs/kit/props.md', specHead: '`lamp` 路灯' },
  { id: 'sign', name: '路牌', category: 'prop',
    specDoc: 'docs/kit/props.md', specHead: '`sign` 路牌' },
];

/* ------------------------------------------------------------------
 * 抽规格：从 markdown 里取 "### `xxx` 名称" 到下一个 "### " 或 "---" 之间的内容
 * ------------------------------------------------------------------ */
function extractSpec(docPath, head) {
  const txt = fs.readFileSync(path.join(REPO, docPath), 'utf8');
  const lines = txt.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('### ') && lines[i].includes(head)) { start = i; break; }
  }
  if (start < 0) throw new Error(`在 ${docPath} 里找不到规格节 "${head}"`);

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('### ') || lines[i].startsWith('## ')) { end = i; break; }
  }
  return lines.slice(start, end).join('\n').trim();
}

/* ------------------------------------------------------------------
 * 调服务端
 * ------------------------------------------------------------------ */
async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/* ------------------------------------------------------------------
 * 主流程
 * ------------------------------------------------------------------ */
const only = process.argv.slice(2);
const list = only.length ? TARGETS.filter(t => only.includes(t.id)) : TARGETS;

if (!list.length) {
  console.error('没有匹配的待补齐变体。可用：' + TARGETS.map(t => t.id).join(', '));
  process.exit(1);
}

console.log(`准备补齐 ${list.length} 个变体：${list.map(t => t.id).join(', ')}\n`);

const results = [];
for (const t of list) {
  process.stdout.write(`▶ ${t.id} (${t.name}) … `);
  try {
    const spec = extractSpec(t.specDoc, t.specHead);

    /* 生成 */
    const gen = await post(`${BASE}/api/generate-from-spec`, {
      id: t.rename || t.id,
      name: t.name,
      category: t.category,
      spec,
    });
    const comp = gen.component;

    /* 重命名（规格节名与 ID 不一致时） */
    if (t.rename) {
      comp.id = t.rename;
      comp.code = comp.code.replace(
        new RegExp(`id:\\s*'${t.id}'`, 'g'),
        `id: '${t.rename}'`,
      );
    }

    /* 落盘。本工具的用途就是补齐/重做清单里的变体，
       遇到已存在的坏条目（如占位符、崩溃构件）应直接覆盖。 */
    const saved = await post(`${BASE}/api/save`, { component: comp, overwrite: true });
    console.log(`✓ ${comp.id} → ${saved.files.join(', ')}`);
    results.push({ ok: true, id: comp.id, files: saved.files });
  } catch (e) {
    console.log(`✗ ${e.message}`);
    results.push({ ok: false, id: t.id, error: e.message });
  }
}

const ok = results.filter(r => r.ok).length;
console.log(`\n完成 ${ok}/${results.length}`);
if (ok < results.length) process.exit(1);
