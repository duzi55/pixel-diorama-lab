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

  /* 当前 AI 配置（生成页顶部展示） */
  if (url.pathname === '/api/config' && req.method === 'GET') {
    const { describeConfig } = await import('./config.mjs');
    return sendJSON(res, 200, { ok: true, config: describeConfig() });
  }

  /* 修改 AI 配置（页面上的模型切换） */
  if (url.pathname === '/api/config' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { setConfig, describeConfig } = await import('./config.mjs');
      setConfig(body || {});
      return sendJSON(res, 200, { ok: true, config: describeConfig() });
    } catch (e) {
      return sendJSON(res, 500, { ok: false, error: String(e && e.message || e) });
    }
  }

  /* 地形预设生成（SSE 流式，与构件生成同一套进度机制） */
  if (url.pathname === '/api/generate-terrain' && req.method === 'POST') {
    const wantsStream = (req.headers.accept || '').includes('text/event-stream');
    try {
      const body = await readBody(req);
      const { generateTerrain } = await import('./terrain-ai.mjs');

      if (!wantsStream) {
        return sendJSON(res, 200, await generateTerrain(body));
      }

      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        'connection': 'keep-alive',
      });
      const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      send('open', { model: (await import('./config.mjs')).describeConfig().model });

      try {
        const result = await generateTerrain(body, ev => {
          if (ev.type === 'system' && ev.subtype === 'init') {
            send('progress', { stage: 'connected', message: `已连接模型（会话 ${String(ev.session_id || '').slice(0, 8)}…）` });
          } else if (ev.type === 'assistant' && ev.message) {
            const u = ev.message.usage || {};
            const content = Array.isArray(ev.message.content) ? ev.message.content : [];
            for (const blk of content) {
              if (blk.type === 'thinking' && blk.thinking) {
                send('thinking', { kind: '推理', text: blk.thinking });
              } else if (blk.type === 'text' && blk.text) {
                send('thinking', { kind: '输出', text: blk.text });
              } else if (blk.type === 'tool_use') {
                send('thinking', { kind: '工具', text: `调用 ${blk.name}…` });
              }
            }
            send('progress', { stage: 'thinking', message: '设计地形中…', outputTokens: u.output_tokens || null });
          } else if (ev.type === 'result') {
            const u = ev.usage || {};
            send('progress', { stage: 'done', message: '设计完成', outputTokens: u.output_tokens || null, durationMs: ev.duration_ms || null });
          }
        });
        send('done', result);
      } catch (e) {
        send('error', { error: String(e && e.message || e) });
      }
      res.end();
      return;
    } catch (e) {
      return sendJSON(res, 500, { ok: false, error: String(e && e.message || e) });
    }
  }

  /* 生成（SSE 流式：进度事件实时推送，最后一条 event: done 带结果或错误）
     请求体经查询参数太长，改为：POST /api/generate-stream 先拿 taskId，
     再 GET /api/progress/<taskId> 收 SSE。简化实现：body 先读入，
     用 GET 式 SSE 不方便带 body —— 这里用单连接：POST 且 Accept: text/event-stream。 */
  const isGeneratePath = url.pathname === '/api/generate' || url.pathname === '/api/generate-from-spec';
  if (isGeneratePath && req.method === 'POST') {
    const wantsStream = (req.headers.accept || '').includes('text/event-stream');
    try {
      const body = await readBody(req);
      const fnName = url.pathname === '/api/generate' ? 'generate' : 'generateFromSpec';

      if (!wantsStream) {
        const { [fnName]: fn } = await import('./ai.mjs');
        const result = await fn(body);
        return sendJSON(res, 200, result);
      }

      /* SSE 流式 */
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        'connection': 'keep-alive',
      });
      const send = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      send('open', { model: (await import('./config.mjs')).describeConfig().model });

      const { [fnName]: fn } = await import('./ai.mjs');
      try {
        const result = await fn(body, ev => {
          /* 把 CLI stream-json 事件转成前端可读的进度 */
          if (ev.type === 'system' && ev.subtype === 'init') {
            send('progress', { stage: 'connected', message: `已连接模型（会话 ${String(ev.session_id || '').slice(0, 8)}…）` });
          } else if (ev.type === 'assistant' && ev.message) {
            const u = ev.message.usage || {};
            /* 内容块里可能有 thinking / text —— 全部转发给推理面板 */
            const content = Array.isArray(ev.message.content) ? ev.message.content : [];
            for (const blk of content) {
              if (blk.type === 'thinking' && blk.thinking) {
                send('thinking', { kind: '推理', text: blk.thinking });
              } else if (blk.type === 'text' && blk.text) {
                send('thinking', { kind: '输出', text: blk.text });
              } else if (blk.type === 'tool_use') {
                send('thinking', { kind: '工具', text: `调用 ${blk.name}…` });
              }
            }
            send('progress', {
              stage: 'thinking',
              message: '模型推理中…',
              outputTokens: u.output_tokens || null,
              totalTokens: (u.input_tokens || 0) + (u.output_tokens || 0) || null,
            });
          } else if (ev.type === 'result') {
            const u = (ev.usage) || {};
            send('progress', {
              stage: 'done',
              message: '生成完成',
              outputTokens: u.output_tokens || null,
              durationMs: ev.duration_ms || null,
            });
          }
        });
        send('done', result);
      } catch (e) {
        send('error', { error: String(e && e.message || e) });
      }
      res.end();
      return;
    } catch (e) {
      console.error('[studio] 生成失败:', e);
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

  if (url.pathname === '/api/collision' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { inferCollision } = await import('./ai.mjs');
      const result = await inferCollision(body);
      return sendJSON(res, 200, result);
    } catch (e) {
      console.error('[studio] /api/collision 失败:', e);
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

  /* 列出构件库中所有已注册构件及其独立源码块 */
  if (url.pathname === '/api/kit' && req.method === 'GET') {
    try {
      const items = [];
      for (const f of ['trees.js', 'plants.js', 'buildings.js', 'stoneworks.js', 'cart.js', 'props.js']) {
        const p = path.join(DEMO_DIR, 'kit', f);
        if (!fs.existsSync(p)) continue;
        const txt = fs.readFileSync(p, 'utf8');
        let pos = 0;
        while (true) {
          const callAt = txt.indexOf('KIT.register(', pos);
          if (callAt < 0) break;
          const open = txt.indexOf('(', callAt);
          let depth = 0, end = -1;
          for (let i = open; i < txt.length; i++) {
            if (txt[i] === '(') depth++;
            else if (txt[i] === ')') {
              depth--;
              if (depth === 0) { end = i + 1; break; }
            }
          }
          if (end < 0) break;
          while (txt[end] === ';') end++;
          const block = txt.slice(callAt, end);
          const id = (block.match(/id:\s*'([^']+)'/) || [])[1];
          const name = (block.match(/name:\s*'([^']+)'/) || [])[1] || id;
          const category = (block.match(/category:\s*'([^']+)'/) || [])[1] || 'prop';
          const desc = (block.match(/desc:\s*'([^']*)'/) || [])[1] || '';
          if (id) items.push({ id, name, category, desc, file: f, code: block });
          pos = end;
        }
      }
      return sendJSON(res, 200, { ok: true, items });
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
