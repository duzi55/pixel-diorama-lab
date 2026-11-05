'use strict';
/* ------------------------------------------------------------------
 * AI 任务表（jobs.mjs）
 *
 * 从 server.mjs 拆出（500 行约束）。解决的核心问题：
 *   用户关页面 / 刷新 → 连接断了，但 AI 还在跑、还在计费，
 *   结果写进死连接就丢了。任务化之后：后台照跑，凭 jobId 回来取。
 *
 *   POST /api/ai/jobs        { kind, payload, dedupeKey? } → { jobId }
 *   GET  /api/ai/jobs/:id    → { status, progress, result, error }
 *   GET  /api/ai/jobs/:id/stream?since=N → SSE（回放 + 实时）
 *
 * 内存表：服务重启即丢（前端会提示重跑），TTL 30 分钟。
 * ------------------------------------------------------------------ */

const AI_JOBS = new Map();
const AI_JOB_TTL = 30 * 60 * 1000;
const AI_JOB_MAX = 20;
const AI_JOB_MAX_RUNNING = 3;
const AI_EVENT_MAX = 200;
const AI_EVENT_BYTES_MAX = 512 * 1024;

export const AI_FN_BY_KIND = {
  reconstruct: 'reconstructScene',
  compose: 'composeScene',
  generate: 'generate',
  'generate-from-spec': 'generateFromSpec',
};

export function createJob(kind, opts = {}) {
  const id = 'job_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  const job = {
    id, kind,
    dedupeKey: opts.dedupeKey || null,
    status: 'running',            /* running | done | error */
    progress: null,
    events: [],
    bytes: 0,
    seq: 0,
    result: null, error: null,
    subscribers: new Set(),      /* { send, end } */
    createdAt: Date.now(), finishedAt: null,
  };
  AI_JOBS.set(id, job);

  for (const [k, j] of AI_JOBS) {
    if (j.finishedAt && Date.now() - j.finishedAt > AI_JOB_TTL) AI_JOBS.delete(k);
  }
  while (AI_JOBS.size > AI_JOB_MAX) {
    const old = [...AI_JOBS.values()].find(j => j.status !== 'running');
    if (!old) break;
    AI_JOBS.delete(old.id);
  }
  return job;
}

export function getJob(id) { return AI_JOBS.get(id) || null; }

export function findByDedupe(kind, key) {
  if (!key) return null;
  return [...AI_JOBS.values()].find(j => j.kind === kind && j.dedupeKey === key) || null;
}

export function listJobs({ kind, dedupeKey } = {}) {
  return [...AI_JOBS.values()]
    .filter(j => (!kind || j.kind === kind) && (!dedupeKey || j.dedupeKey === dedupeKey))
    .map(snapshot);
}

export function runningCount() {
  return [...AI_JOBS.values()].filter(j => j.status === 'running').length;
}

export function emit(job, event, data) {
  if (event === 'progress') job.progress = data;
  const rec = { seq: ++job.seq, event, data };
  job.events.push(rec);
  job.bytes += JSON.stringify(data).length;
  while (job.bytes > AI_EVENT_BYTES_MAX && job.events.length > 1) {
    job.bytes -= JSON.stringify(job.events.shift().data).length;
  }
  if (job.events.length > AI_EVENT_MAX) {
    const dropped = job.events.shift();
    job.bytes -= JSON.stringify(dropped.data).length;
  }
  for (const s of job.subscribers) {
    try { s.send(rec); } catch { /* 断开的订阅者忽略 */ }
  }
}

function endSubscribers(job) {
  for (const s of job.subscribers) {
    try { s.end(); } catch { /* 已断开 */ }
  }
  job.subscribers.clear();
}

export function finishJob(job, result) {
  if (job.status !== 'running') return;
  job.status = 'done';
  job.result = result;
  job.finishedAt = Date.now();
  emit(job, 'done', result);
  endSubscribers(job);
}

export function failJob(job, error) {
  if (job.status !== 'running') return;
  job.status = 'error';
  job.error = String(error);
  job.finishedAt = Date.now();
  emit(job, 'job-error', { error: job.error });
  endSubscribers(job);
}

/** CLI stream-json 事件 → 前端进度对象（null 表示忽略） */
export function cliEventToProgress(ev) {
  if (ev.type === 'system' && ev.subtype === 'init') {
    return { stage: 'connected', message: `已连接模型（会话 ${String(ev.session_id || '').slice(0, 8)}…）` };
  }
  if (ev.type === 'assistant' && ev.message) {
    const u = ev.message.usage || {};
    return {
      stage: 'thinking',
      message: '模型推理中…',
      outputTokens: u.output_tokens || null,
      totalTokens: (u.input_tokens || 0) + (u.output_tokens || 0) || null,
    };
  }
  if (ev.type === 'result') {
    const u = ev.usage || {};
    return { stage: 'done', message: '生成完成', outputTokens: u.output_tokens || null, durationMs: ev.duration_ms || null };
  }
  return null;
}

/** 后台跑一个 AI 任务（不依赖任何 HTTP 连接） */
export function startJob(job, fnName, payload) {
  (async () => {
    try {
      const { [fnName]: fn } = await import('./ai.mjs');
      const result = await fn(payload, ev => {
        if (ev.type === 'assistant' && ev.message && Array.isArray(ev.message.content)) {
          for (const blk of ev.message.content) {
            if (blk.type === 'thinking' && blk.thinking) emit(job, 'thinking', { kind: '推理', text: blk.thinking });
            else if (blk.type === 'text' && blk.text) emit(job, 'thinking', { kind: '输出', text: blk.text });
          }
        }
        const p = cliEventToProgress(ev);
        if (p) emit(job, 'progress', p);
      });
      finishJob(job, result);
    } catch (e) {
      failJob(job, e && e.message || e);
    }
  })();
  return job;
}

/** 前端轮询用的轻量快照（不含事件历史） */
export function snapshot(job) {
  return {
    ok: true, jobId: job.id, kind: job.kind, status: job.status,
    progress: job.progress, result: job.result, error: job.error,
    createdAt: job.createdAt, finishedAt: job.finishedAt,
  };
}

/** SSE：回放历史后订阅实时；终态会 res.end() */
export function attachSSE(req, res, job, since = 0) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store, no-transform',
    'connection': 'keep-alive',
    'x-accel-buffering': 'no',
  });
  let last = Math.max(0, Number(since) || 0);
  const send = rec => {
    if (rec.seq <= last) return;
    last = rec.seq;
    try { res.write(`id: ${rec.seq}\nevent: ${rec.event}\ndata: ${JSON.stringify(rec.data)}\n\n`); } catch { /* 断开 */ }
  };

  for (const rec of job.events) send(rec);
  if (job.status !== 'running') { try { res.end(); } catch { /* 已断 */ } return; }

  const sub = { send, end: () => { try { res.end(); } catch { /* 已断 */ } } };
  job.subscribers.add(sub);
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* 断开 */ } }, 15000);
  if (ping.unref) ping.unref();
  const off = () => { clearInterval(ping); job.subscribers.delete(sub); };
  req.on('close', off);
  res.on('close', off);
}
