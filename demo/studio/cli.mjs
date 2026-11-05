'use strict';
/* ------------------------------------------------------------------
 * Claude CLI 调用层（cli.mjs）
 *
 * 从 ai.mjs 拆出：spawn claude -p 子进程，stream-json 边跑边解析，
 * 通过 onEvent 回调把进度事件转发给 SSE。
 * ------------------------------------------------------------------ */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
function await_fs() { return require_('node:fs'); }
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from './config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(__dirname, '..', '..');

/* 跑 claude CLI，拿结构化输出（流式：onEvent 回调把每条 CLI 事件转发给进度条） */
export function runClaude(prompt, schema, onEvent, images) {
  const cfg = getConfig();
  return new Promise((resolve, reject) => {
    /* 参考图先落盘：它决定 --tools 是否放开 Read */
    const imagePaths = [];
    if (Array.isArray(images) && images.length) {
      const fs = await_fs();
      const dir = path.join(REPO_DIR, 'demo', 'studio', '.ref-images');
      fs.mkdirSync(dir, { recursive: true });
      images.forEach((dataUrl, k) => {
        const m = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/.exec(dataUrl);
        if (!m) return;
        const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
        const p = path.join(dir, `ref-${Date.now()}-${k}.${ext}`);
        fs.writeFileSync(p, Buffer.from(m[2], 'base64'));
        imagePaths.push(p);
      });
    }

    const args = [
      '-p', prompt,
      '--output-format', 'stream-json',
      '--verbose',                /* stream-json 需要 verbose，否则 CLI 拒绝 */
      '--json-schema', JSON.stringify(schema),
      /* 无图：禁用全部工具（AI 只写代码）；
         有图：只启用 Read（只能看图，不能碰别的）——
         ★ 不能用 `--tools ''` + `--allowedTools Read`：前者会连 Read 一起禁掉 */
      '--tools', imagePaths.length ? 'Read' : '',
      '--permission-mode', 'dontAsk',
      '--no-session-persistence',
      '--max-budget-usd', String(cfg.maxBudgetUsd),
    ];
    if (cfg.model) args.push('--model', cfg.model);
    if (cfg.effort) args.push('--effort', cfg.effort);

    const imageNote = imagePaths.length
      ? '\n\n## 参考图\n用户附了参考图（用 Read 工具查看）：\n'
        + imagePaths.map(p => `- ${p}`).join('\n')
        + '\n请先读图，从图中提取形态/配色/构图特征，再按要求输出。'
      : '';
    const fullPrompt = prompt + imageNote;

    const child = spawn('claude', args.slice(0, args.indexOf('-p') + 1).concat([fullPrompt], args.slice(args.indexOf('-p') + 1)), { cwd: REPO_DIR, env: { ...process.env } });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`生成超时（${Math.round(cfg.timeoutMs / 1000)}s）。可在 demo/studio/studio.config.json 调大 timeoutMs`));
    }, cfg.timeoutMs);

    let out = '', err = '';
    let result = null;

    child.stdout.on('data', d => {
      out += d;
      /* stream-json：每行一个 JSON 事件，边到边解析 */
      let nl;
      while ((nl = out.indexOf('\n')) >= 0) {
        const line = out.slice(0, nl).trim();
        out = out.slice(nl + 1);
        if (!line) continue;
        let ev;
        try { ev = JSON.parse(line); } catch { continue; }
        if (typeof onEvent === 'function') { try { onEvent(ev); } catch { /* 进度回调不许炸主流程 */ } }
        /* 记住最终 result（type: "result" 的事件带 structured_output） */
        if (ev.type === 'result') result = ev;
      }
    });
    child.stderr.on('data', d => { err += d; });
    child.on('error', e => { clearTimeout(timer); reject(new Error('无法启动 claude CLI: ' + e.message)); });
    child.on('close', code => {
      clearTimeout(timer);
      if (result) {
        if (result.structured_output) return resolve(result.structured_output);
        if (result.result) {
          try { return resolve(JSON.parse(result.result)); } catch { /* 兜底 */ }
        }
        if (result.is_error) return reject(new Error(result.result || 'CLI 返回错误结果'));
      }
      if (code !== 0) {
        reject(new Error(`claude CLI 退出码 ${code}: ${err.slice(0, 800)}`));
        return;
      }
      reject(new Error('CLI 未返回结构化输出'));
    });
  });
}

