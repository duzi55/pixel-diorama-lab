#!/usr/bin/env node
/* ------------------------------------------------------------------
 * 构件接线检查
 *
 * 新增一个构件模块文件后，要同时接进 6 个入口，漏一个就会出现
 * "工坊里有、陈列页没有"或"场景里加载不到"：
 *
 *   demo/kit/gallery.html     陈列页
 *   demo/kit/catalog.html     素材总目录
 *   demo/studio/preview.html  Studio 预览沙箱
 *   demo/studio/editor.html   场景编辑器
 *   demo/scenes/viewer.js     场景查看器
 *   demo/studio/server.mjs    /api/kit 列表
 *
 *   node tools/check-kit-wiring.mjs
 * ------------------------------------------------------------------ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KIT = path.join(REPO, 'demo', 'kit');

/* 不需要接进所有入口的基础设施文件（不是 KIT 构件模块）
   effects.js / weather.js 是效果层（KIT_EFFECT / KIT_WEATHER），
   按需由场景加载，不进构件目录与 Studio 列表 */
const INFRA = new Set([
  'core.js', 'palette.js', 'render.js', 'behavior.js', 'behavior-extra.js',
  'figures.js', 'crowd.js', 'index.js', 'ground.js', 'effects.js', 'weather.js',
]);

const modules = fs.readdirSync(KIT)
  .filter(f => f.endsWith('.js') && !INFRA.has(f))
  .sort();

/* 每个入口声明自己"怎么引用"构件模块 */
const ENTRIES = [
  { name: 'gallery.html', file: 'demo/kit/gallery.html', pattern: /script src="([^"]+\.js)"/g, prefix: '' },
  { name: 'catalog.html', file: 'demo/kit/catalog.html', pattern: /script src="([^"]+\.js)"/g, prefix: '' },
  { name: 'preview.html', file: 'demo/studio/preview.html', pattern: /script src="\.\.\/kit\/([^"]+\.js)"/g, prefix: '../kit/' },
  { name: 'editor.html', file: 'demo/studio/editor.html', pattern: /script src="\.\.\/kit\/([^"]+\.js)"/g, prefix: '../kit/' },
  { name: 'viewer.js', file: 'demo/scenes/viewer.js', pattern: /'\.\.\/kit\/([^']+\.js)'/g, prefix: '../kit/' },
  { name: 'server.mjs', file: 'demo/studio/server.mjs', pattern: /'((?:trees|conifers|plants|buildings|stoneworks|cart|props|ref-[a-z-]+|effects|weather)\.js)'/g, prefix: '' },
];

let problems = 0;
console.log(`\n=== 构件接线检查（${modules.length} 个构件模块）===\n`);

for (const e of ENTRIES) {
  const p = path.join(REPO, e.file);
  if (!fs.existsSync(p)) { console.log(`  ? ${e.name} 不存在，跳过`); continue; }
  const src = fs.readFileSync(p, 'utf8');
  const listed = new Set();
  let m;
  while ((m = e.pattern.exec(src))) {
    const f = m[1].split('/').pop();
    listed.add(f);
  }
  const missing = modules.filter(f => !listed.has(f));
  if (missing.length) {
    problems++;
    console.log(`  ✗ ${e.name.padEnd(14)} 缺 ${missing.join(', ')}`);
  } else {
    console.log(`  ✓ ${e.name.padEnd(14)} ${modules.length} 个齐全`);
  }
}

/* server.mjs 的 /api/kit 只列部分模块是正常的（基础模块不列） */
console.log(`\n=== 结果: ${problems} 个入口缺接线 ===`);
process.exit(problems ? 1 : 0);
