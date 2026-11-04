'use strict';
/* ------------------------------------------------------------------
 * Studio · AI 配置（config.mjs）
 *
 * 读取顺序（后者覆盖前者）：
 *   1. 内置默认值
 *   2. demo/studio/studio.config.json（可手工编辑，随仓库走）
 *   3. 环境变量 STUDIO_MODEL / STUDIO_EFFORT / STUDIO_MAX_BUDGET / STUDIO_TIMEOUT
 *
 * 配置项：
 *   model        模型名或别名（'' = 跟随 CLI 登录账号的默认模型）
 *   effort       思考强度 low|medium|high|xhigh|max（'' = CLI 默认）
 *   maxBudgetUsd 单次生成的花费上限（--max-budget-usd）
 *   timeoutMs    单次生成超时（毫秒），超时杀进程
 * ------------------------------------------------------------------ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CFG_PATH = path.join(__dirname, 'studio.config.json');

const DEFAULTS = {
  model: '',
  effort: '',
  maxBudgetUsd: 2,
  timeoutMs: 300_000,
};

let _cache = null;

export function getConfig() {
  if (_cache) return _cache;

  let file = {};
  try { file = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8')); } catch { /* 无配置文件用默认 */ }

  const merged = { ...DEFAULTS, ...file };

  /* 环境变量覆盖（只覆盖非空项） */
  if (process.env.STUDIO_MODEL) merged.model = process.env.STUDIO_MODEL;
  if (process.env.STUDIO_EFFORT) merged.effort = process.env.STUDIO_EFFORT;
  if (process.env.STUDIO_MAX_BUDGET) merged.maxBudgetUsd = Number(process.env.STUDIO_MAX_BUDGET) || merged.maxBudgetUsd;
  if (process.env.STUDIO_TIMEOUT) merged.timeoutMs = Number(process.env.STUDIO_TIMEOUT) || merged.timeoutMs;

  _cache = merged;
  return merged;
}

/** 生成页展示用的摘要（隐藏空项） */
export function describeConfig() {
  const c = getConfig();
  return {
    model: c.model || '（CLI 默认模型）',
    effort: c.effort || '默认',
    maxBudgetUsd: c.maxBudgetUsd,
    timeoutMs: c.timeoutMs,
  };
}
