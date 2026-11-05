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
import { AI_FN_BY_KIND, createJob, getJob, findByDedupe, runningCount, startJob, snapshot, attachSSE, listJobs } from './jobs.mjs';

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
      if (raw.length > 12_000_000) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

/* 构件源码切块：把每个 KIT.register( ... ) 调用切成独立代码块
 *
 * ★ 不能只数括号：cart.js 的注释写着「// 1) 斗身…」，那个右括号会让
 *   深度提前归零，切出来的块缺一半 —— 预览注入时直接 SyntaxError，
 *   构件"点开是空白"就是这么来的。
 *   所以先做一张"代码位"表：注释与字符串里的字符不参与配对。
 */
function codeMask(src) {
  const n = src.length, mask = new Uint8Array(n);
  let i = 0;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') {                 // 行注释
      i += 2;
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && d === '*') {                 // 块注释
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i = Math.min(n, i + 2);
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {    // 字符串 / 模板串
      const q = c;
      i++;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    mask[i] = 1;
    i++;
  }
  return mask;
}

function splitKitBlocks(src) {
  const n = src.length, mask = codeMask(src), out = [];
  const needle = 'KIT.register(';
  for (let at = 0; at <= n - needle.length; at++) {
    if (!mask[at] || !src.startsWith(needle, at)) continue;
    let depth = 0, end = -1;
    for (let i = at + needle.length - 1; i < n; i++) {
      if (!mask[i]) continue;
      if (src[i] === '(') depth++;
      else if (src[i] === ')') {
        depth--;
        if (depth === 0) { end = i + 1; break; }
      }
    }
    if (end < 0) break;
    while (src[end] === ';') end++;
    out.push(src.slice(at, end));
    at = end - 1;
  }
  return out;
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

  /* 烘焙图集：跑 tools/bake-atlas.mjs，把构件导出成 three.js 可用的精灵图集 */
  if (url.pathname === '/api/bake-atlas' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { spawn } = await import('node:child_process');
      const args = [path.join(REPO_DIR, 'tools', 'bake-atlas.mjs')];
      if (body.dirs) args.push('--dirs', String(body.dirs));
      if (body.scale) args.push('--scale', String(body.scale));
      if (body.only && body.only.length) args.push('--only', body.only.join(','));

      const { code, out } = await new Promise(resolve => {
        const ch = spawn(process.execPath, args, { cwd: REPO_DIR });
        let out = '';
        ch.stdout.on('data', d => { out += d; });
        ch.stderr.on('data', d => { out += d; });
        ch.on('close', code => resolve({ code, out }));
      });

      if (code !== 0) return sendJSON(res, 500, { ok: false, error: out.slice(-2000) });
      return sendJSON(res, 200, {
        ok: true,
        log: out.slice(-2000),
        atlas: { png: '/export/atlas.png', json: '/export/atlas.json', demo: '/export/three-demo.html' },
      });
    } catch (e) {
      console.error('[studio] /api/bake-atlas 失败:', e);
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
  /* AI 任务：创建 / 查询 / SSE 订阅（关闭页面不丢结果） */
  if (url.pathname === '/api/ai/jobs' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const fnName = AI_FN_BY_KIND[body.kind];
      if (!fnName) return sendJSON(res, 400, { ok: false, error: '未知任务类型: ' + body.kind });

      /* 幂等：同 kind 同 dedupeKey 的已有任务直接复用，避免重复计费 */
      if (body.dedupeKey) {
        const hit = findByDedupe(body.kind, body.dedupeKey);
        if (hit) return sendJSON(res, 200, { ok: true, jobId: hit.id, status: hit.status, reused: true });
      }

      if (runningCount() >= 3) {
        return sendJSON(res, 429, { ok: false, error: '同时进行的 AI 任务太多，等一个跑完再试' });
      }

      const job = createJob(body.kind, { dedupeKey: body.dedupeKey });
      startJob(job, fnName, body.payload || {});
      return sendJSON(res, 200, { ok: true, jobId: job.id, status: job.status });
    } catch (e) {
      return sendJSON(res, 500, { ok: false, error: String(e && e.message || e) });
    }
  }

  if (url.pathname === '/api/ai/jobs' && req.method === 'GET') {
    const q = new URL(req.url, 'http://x').searchParams;
    return sendJSON(res, 200, {
      ok: true,
      jobs: listJobs({ kind: q.get('kind'), dedupeKey: q.get('dedupeKey') }),
    });
  }

  if (url.pathname.startsWith('/api/ai/jobs/')) {
    const rest = url.pathname.slice('/api/ai/jobs/'.length);
    const isStream = rest.endsWith('/stream');
    const id = isStream ? rest.slice(0, -'/stream'.length) : rest;
    const job = getJob(id);
    if (!job) return sendJSON(res, 404, { ok: false, error: '任务不存在或已过期（服务可能重启过）' });

    if (!isStream) return sendJSON(res, 200, snapshot(job));

    const since = Number(new URL(req.url, 'http://x').searchParams.get('since')) || 0;
    return attachSSE(req, res, job, since);
  }

  const AI_ROUTES = {
    '/api/generate': 'generate',
    '/api/generate-from-spec': 'generateFromSpec',
    '/api/reconstruct': 'reconstructScene',
  };
  const isGeneratePath = !!AI_ROUTES[url.pathname];
  if (isGeneratePath && req.method === 'POST') {
    const wantsStream = (req.headers.accept || '').includes('text/event-stream');
    try {
      const body = await readBody(req);
      const fnName = AI_ROUTES[url.pathname];

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
      const { listScenes, listSceneIndex } = await import('./persist.mjs');
      return sendJSON(res, 200, { ok: true, scenes: listScenes(), index: listSceneIndex() });
    } catch (e) {
      return sendJSON(res, 500, { ok: false, error: String(e) });
    }
  }

  /* 列出构件库中所有已注册构件及其独立源码块 */
  if (url.pathname === '/api/kit' && req.method === 'GET') {
    try {
      const items = [];
      for (const f of ['trees.js', 'conifers.js', 'plants.js', 'buildings.js', 'stoneworks.js', 'cart.js', 'props.js', 'ref-buildings.js', 'ref-structures.js', 'ref-plants.js', 'ref-surfaces.js', 'ref-props.js', 'ref-props-small.js']) {
        const p = path.join(DEMO_DIR, 'kit', f);
        if (!fs.existsSync(p)) continue;
        const txt = fs.readFileSync(p, 'utf8');
        for (const block of splitKitBlocks(txt)) {
          const id = (block.match(/id:\s*'([^']+)'/) || [])[1];
          const name = (block.match(/name:\s*'([^']+)'/) || [])[1] || id;
          const category = (block.match(/category:\s*'([^']+)'/) || [])[1] || 'prop';
          const desc = (block.match(/desc:\s*'([^']*)'/) || [])[1] || '';
          if (id) items.push({ id, name, category, desc, file: f, code: block });
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
