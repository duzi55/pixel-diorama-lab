#!/usr/bin/env node
/* 文档完整性校验：链接、锚点、源码行号、文件规模 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let errors = 0, warnings = 0;
const err = m => { console.log(`  ✗ ${m}`); errors++; };
const warn = m => { console.log(`  ! ${m}`); warnings++; };

/* ---- 收集所有 md ---- */
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}
/* 收集所有文件（不限扩展名） */
function walkFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, out);
    else out.push(p);
  }
  return out;
}
const mds = walk(path.join(ROOT, 'docs')).concat(walk(ROOT).filter(p => path.dirname(p) === ROOT));

/* ---- GitHub 风格 slug ---- */
function slug(heading) {
  return heading
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^\w一-龥\- ]/g, '')
    .trim()
    .replace(/ /g, '-');
}

console.log('=== 1. md 内部链接 + 锚点 ===');
let linkCount = 0;
for (const md of mds) {
  const src = fs.readFileSync(md, 'utf8');
  const rel = path.relative(ROOT, md);
  const re = /\[[^\]]*\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(src))) {
    const target = m[1];
    if (/^(https?:|mailto:)/.test(target)) continue;
    linkCount++;
    const [filePart, anchor] = target.split('#');
    /* 模板占位符（doc#anchor、xxx#yyy）不是真链接 */
    if (/^(doc|xxx|yyy|todo|placeholder)$/i.test(filePart || '')) continue;
    if (!filePart && !anchor) continue;
    let targetPath;
    if (filePart === '') targetPath = md;
    else targetPath = path.resolve(path.dirname(md), filePart);
    if (!fs.existsSync(targetPath)) {
      err(`${rel} → 链接目标不存在: ${target}`);
      continue;
    }
    if (anchor && targetPath.endsWith('.md')) {
      const heads = fs.readFileSync(targetPath, 'utf8')
        .split('\n')
        .filter(l => /^#{1,6}\s/.test(l))
        .map(l => slug(l.replace(/^#{1,6}\s+/, '')));
      if (!heads.includes(anchor.toLowerCase())) {
        err(`${rel} → 锚点不存在: ${target}`);
      }
    }
  }
}
console.log(`  检查 ${linkCount} 个链接`);

console.log('\n=== 2. 源码行号引用 ===');
let refCount = 0, refBad = 0;
for (const md of mds) {
  const src = fs.readFileSync(md, 'utf8');
  const rel = path.relative(ROOT, md);
  /* 匹配 `xxx.js:123` 或 `file:123-456` */
  const re = /`?([A-Za-z0-9_\-./]+\.(?:js|mjs|html)):(\d+)(?:-(\d+))?`?/g;
  let m;
  while ((m = re.exec(src))) {
    const [, file, a, b] = m;
    /* 只校验 reference/ 和 demo/ 下的真实文件 */
    const candidates = [
      path.join(ROOT, 'reference/pixel-plays', file),
      path.join(ROOT, file),
      path.join(ROOT, 'demo', file),
      path.join(ROOT, 'demo/village', file),
    ];
    const found = candidates.find(c => fs.existsSync(c));
    if (!found) continue;             // 不是本地文件，跳过
    refCount++;
    const lines = fs.readFileSync(found, 'utf8').split('\n');
    const end = b ? Math.min(+b, lines.length) : +a;
    if (+a < 1 || end > lines.length) {
      err(`${rel} → ${file}:${a}${b ? '-' + b : ''} 超出文件行数 (${lines.length})`);
      refBad++;
    }
  }
}
console.log(`  检查 ${refCount} 处行号引用，${refBad} 处越界`);

console.log('\n=== 3. 文件规模（≤500 行）===');
const codeFiles = [];
for (const dir of ['demo', 'tools']) {
  const out = [];
  walkFiles(path.join(ROOT, dir), out);
  codeFiles.push(...out.filter(f => /\.(js|mjs)$/.test(f)));
}
for (const f of codeFiles) {
  const n = fs.readFileSync(f, 'utf8').split('\n').length;
  const rel = path.relative(ROOT, f);
  if (n > 500) err(`${rel} ${n} 行，超过 500`);
}
console.log(`  检查 ${codeFiles.length} 个代码文件`);

console.log('\n=== 4. 注册表变体有锚点链接 ===');
const reg = fs.readFileSync(path.join(ROOT, 'docs/kit/registry.md'), 'utf8');
const rows = reg.split('\n').filter(l => /^\| \[`/.test(l));
let noAnchor = 0;
for (const r of rows) {
  const m = r.match(/\[`([^`]+)`\]\(([^)]+)\)/);
  if (!m) { err(`注册表行缺锚点: ${r.slice(0, 60)}`); noAnchor++; continue; }
  /* 目标形如 file.md#anchor */
  const hash = m[2].indexOf('#');
  const filePart = hash < 0 ? m[2] : m[2].slice(0, hash);
  const anchor = hash < 0 ? '' : m[2].slice(hash + 1);
  const p = path.join(ROOT, 'docs/kit', filePart);
  if (!fs.existsSync(p)) { err(`注册表指向不存在的文件: ${filePart}`); noAnchor++; continue; }
  const heads = fs.readFileSync(p, 'utf8').split('\n')
    .filter(l => /^#{1,6}\s/.test(l))
    .map(l => slug(l.replace(/^#{1,6}\s+/, '')));
  if (!heads.includes(anchor.toLowerCase())) {
    err(`注册表锚点无效: ${filePart}#${anchor}`);
    noAnchor++;
  }
}
console.log(`  检查 ${rows.length} 行注册表，${noAnchor} 处无效`);

console.log('\n=== 5. AGENTS.md / README.md 引用 ===');
for (const f of ['AGENTS.md', 'README.md']) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const re = /\[[^\]]*\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(src))) {
    const t = m[1];
    if (/^(https?:|mailto:)/.test(t)) continue;
    /* 模板占位符不是真链接 */
    if (/^doc#|^xxx#|^todo#/i.test(t)) continue;
    const p = path.resolve(ROOT, path.dirname(f), t.split('#')[0]);
    if (!fs.existsSync(p)) err(`${f} → ${t} 不存在`);
  }
}
console.log('  完成');

console.log(`\n=== 结果: ${errors} 个错误, ${warnings} 个警告 ===\n`);
process.exit(errors ? 1 : 0);
