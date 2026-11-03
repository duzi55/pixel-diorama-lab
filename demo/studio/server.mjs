'use strict';
/* ------------------------------------------------------------------
 * Studio 服务端
 *
 * 给 demo/studio/ 提供三件事：
 *   1. 静态文件服务（demo/ 目录）
 *   2. AI 桥：POST /api/generate → 调 claude CLI → 返回构件代码
 *   3. 落盘器：POST /api/save → 写代码 + registry.md + 配方卡
 *
 * 零依赖：只用 node: 内置模块。
 * 启动：node demo/studio/server.mjs [端口]
 * ------------------------------------------------------------------ */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.resolve(__dirname, '..');
const REPO_DIR = path.resolve(DEMO_DIR, '..');
const PORT = Number(process.argv[2] || process.env.STUDIO_PORT || 5320);

/* ---------------- 静态文件 ---------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.md': 'text/markdown; charset=utf-8',
};

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (urlPath === '/') urlPath = '/studio/index.html';

  /* 防目录穿越：解析后必须在 demo/ 内 */
  const filePath = path.resolve(DEMO_DIR, '.' + urlPath);
  if (!filePath.startsWith(DEMO_DIR + path.sep) && filePath !== DEMO_DIR) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('404 ' + urlPath);
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(buf);
  });
}

/* ---------------- JSON body ---------------- */

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => {
      raw += c;
      if (raw.length > 4_000_000) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function sendJSON(res, code, obj) {
  const buf = Buffer.from(JSON.stringify(obj), 'utf8');
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': buf.length,
  });
  res.end(buf);
}

/* ---------------- 路由 ---------------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  if (url.pathname === '/api/health') {
    return sendJSON(res, 200, { ok: true, port: PORT });
  }

  if (url.pathname === '/api/generate' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { generate } = await import('./ai.mjs');
      const result = await generate(body);
      return sendJSON(res, 200, result);
    } catch (e) {
      console.error('[studio] /api/generate 失败:', e);
      return sendJSON(res, 500, { ok: false, error: String(e && e.message || e) });
    }
  }

  if (url.pathname === '/api/save' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { saveComponent } = await import('./persist.mjs');
      const result = saveComponent(body);
      return sendJSON(res, 200, result);
    } catch (e) {
      console.error('[studio] /api/save 失败:', e);
      return sendJSON(res, 500, { ok: false, error: String(e && e.message || e) });
    }
  }

  if (url.pathname === '/api/scene' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { saveScene, loadScene } = await import('./persist.mjs');
      if (body.action === 'load') return sendJSON(res, 200, loadScene(body.name));
      return sendJSON(res, 200, saveScene(body.name, body.scene));
    } catch (e) {
      console.error('[studio] /api/scene 失败:', e);
      return sendJSON(res, 500, { ok: false, error: String(e && e.message || e) });
    }
  }

  if (url.pathname === '/api/scene' && req.method === 'GET') {
    try {
      const { listScenes } = await import('./persist.mjs');
      return sendJSON(res, 200, { ok: true, scenes: listScenes() });
    } catch (e) {
      return sendJSON(res, 500, { ok: false, error: String(e) });
    }
  }

  /* 读文件（编辑器读取已保存的构件代码预览用） */
  if (url.pathname.startsWith('/api/file') && req.method === 'GET') {
    const rel = url.searchParams.get('path') || '';
    const filePath = path.resolve(REPO_DIR, rel);
    if (!filePath.startsWith(REPO_DIR + path.sep)) {
      return sendJSON(res, 403, { ok: false, error: 'forbidden' });
    }
    fs.readFile(filePath, 'utf8', (err, txt) => {
      if (err) return sendJSON(res, 404, { ok: false, error: 'not found' });
      sendJSON(res, 200, { ok: true, content: txt });
    });
    return;
  }

  return serveStatic(req, res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`✓ studio 服务已启动: http://127.0.0.1:${PORT}/studio/`);
  console.log(`  静态根目录: ${DEMO_DIR}`);
});
