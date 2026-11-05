'use strict';
/* ------------------------------------------------------------------
 * Studio · 构件沙箱实画校验（validate.mjs）
 *
 * 落盘前把构件代码放进与真实引擎一致的 VM 沙箱里实画两遍：
 *   1. 语法检查与 KIT.register 调用检查
 *   2. 在 (0,0) 与 (4,2) 各画一次：
 *      - 崩溃（如 rampOf/rgb 传错类型）→ 拒收
 *      - 像素过少（< 8）→ 拒收
 *      - 两次画面完全相同（忽略 ctx.x/ctx.y）→ 拒收
 * ------------------------------------------------------------------ */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(__dirname, '..', '..');

const TEST_BG = 0xff14140a >>> 0;

let _sandboxSrc = null;
function sandboxSources() {
  if (_sandboxSrc) return _sandboxSrc;
  const read = f => fs.readFileSync(path.join(REPO_DIR, f), 'utf8');
  _sandboxSrc = {
    engine: read('demo/engine.js'),
    core: read('demo/kit/core.js'),
    palette: read('demo/kit/palette.js'),
    render: read('demo/kit/render.js'),
  };
  return _sandboxSrc;
}

function makeDrawSandbox() {
  const noop = () => {};
  const canvas = {
    width: 0, height: 0, style: {},
    getContext(kind) {
      if (kind !== '2d') return null;
      return {
        createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: noop,
        getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
        clearRect: noop, fillRect: noop, drawImage: noop, save: noop, restore: noop,
      };
    },
    addEventListener: noop, removeEventListener: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 260 }),
  };
  const document = {
    getElementById(id) {
      if (id === 'c') return canvas;
      return {
        id, textContent: '', value: '', style: {}, innerHTML: '',
        addEventListener: noop, removeEventListener: noop,
        appendChild: noop, remove: noop, focus: noop,
        classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
        querySelector: () => ({ textContent: '' }),
        getContext: () => null,
      };
    },
    createElement: () => ({
      tagName: 'div', style: {}, textContent: '', innerHTML: '', children: [],
      appendChild: noop, addEventListener: noop,
      classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      querySelector: () => ({ textContent: '' }),
      getContext: () => null,
    }),
    addEventListener: noop,
    body: { appendChild: noop, style: {} },
    documentElement: { style: {} },
  };
  const sb = {
    console, document,
    innerWidth: 1200, innerHeight: 900, devicePixelRatio: 1,
    addEventListener: noop, removeEventListener: noop,
    requestAnimationFrame: () => 0, cancelAnimationFrame: noop,
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout,
    setInterval: () => 0, clearInterval: noop,
    performance: { now: () => Date.now() },
  };
  sb.window = sb; sb.globalThis = sb; sb.self = sb;
  return sb;
}

export function validateComponent(c, helperSrc) {
  const code = String(c.code || '');
  if (!code.trim()) throw new Error(`构件 "${c.id}" 的代码是空的`);

  try {
    new Function('KIT', code);
  } catch (e) {
    throw new Error(`构件 "${c.id}" 的代码有语法错误：${e.message}`);
  }
  if (!/KIT\.register\s*\(/.test(code)) {
    throw new Error(`构件 "${c.id}" 的代码里没有 KIT.register() 调用`);
  }

  const src = sandboxSources();
  const sb = makeDrawSandbox();
  sb.PP_W = 320; sb.PP_H = 260; sb.PP_SCALE = 9;
  sb.PP_ORIGIN_X = 0; sb.PP_ORIGIN_Y = 30;
  const cx = vm.createContext(sb);

  try {
    vm.runInContext(src.engine, cx, { filename: 'engine.js' });
    vm.runInContext(src.core, cx, { filename: 'kit/core.js' });
    vm.runInContext(src.palette, cx, { filename: 'kit/palette.js' });
    vm.runInContext(src.render, cx, { filename: 'kit/render.js' });
    /* 同文件里的辅助函数（coneCanopy / kitWoodWall 等）先加载：
       构件代码块本身不含它们，不先定义会误报 "xxx is not defined" */
    if (helperSrc && helperSrc.trim()) {
      vm.runInContext(helperSrc, cx, { filename: `helpers-${c.id}.js` });
    }
    vm.runInContext(code, cx, { filename: `component-${c.id}.js` });
  } catch (e) {
    throw new Error(`构件 "${c.id}" 加载失败：${e.message}`);
  }

  const registered = vm.runInContext(`KIT.get(${JSON.stringify(c.id)})`, cx);
  if (!registered) {
    throw new Error(`代码执行了，但没注册出 id "${c.id}"（KIT.register 的 id 与声明不一致）`);
  }

  const drawScript = (x, y) => `(() => {
    try {
      zb.fill(-1e9);
      pix.fill(${TEST_BG});
      ground.fill(0);
      kinds.fill(KIND_NONE);
      groundZ.fill(0);
      shadowMask.fill(0);
      const o = { id: 't', kind: ${JSON.stringify(c.id)}, x: ${x}, y: ${y}, z: 0,
                  rot: 0, params: KIT.defaults(${JSON.stringify(c.id)}), seed: 42 };
      const comp = KIT.get(${JSON.stringify(c.id)});
      comp.draw(KIT_RENDER.makeCtx(o), o);
      let n = 0;
      for (let i = 0; i < pix.length; i++) if (pix[i] !== ${TEST_BG}) n++;
      return { ok: true, n, shot: Array.from(pix) };
    } catch (e) {
      return { ok: false, err: String((e && e.stack) || e).split('\\n').slice(0, 3).join(' | ') };
    }
  })()`;

  const r0 = vm.runInContext(drawScript(0, 0), cx, { filename: 'draw@(0,0)' });
  if (!r0.ok) {
    throw new Error(`构件 "${c.id}" 绘制崩溃：${r0.err}`
      + `\n  常见原因：把 rampOf(...)[i] 或 rgb(...)（打包像素）喂给了 sphere/capsule/box`
      + ` —— 它们只吃 [r,g,b] (0..255) 基色数组；打包值只能给 plot()。`);
  }
  if (r0.n < 8) {
    throw new Error(`构件 "${c.id}" 画出来几乎是空的（${r0.n} 个像素）`);
  }

  const r1 = vm.runInContext(drawScript(4, 2), cx, { filename: 'draw@(4,2)' });
  if (!r1.ok) {
    throw new Error(`构件 "${c.id}" 在位置 (4,2) 绘制崩溃：${r1.err}`);
  }

  let same = true;
  for (let i = 0; i < r0.shot.length; i++) {
    if (r0.shot[i] !== r1.shot[i]) { same = false; break; }
  }
  if (same) {
    throw new Error(`构件 "${c.id}" 忽略了实例位置 ctx.x/ctx.y —— 在 (0,0) 和 (4,2) 画的画面完全一样。`
      + ` 所有坐标必须基于 ctx.x / ctx.y 偏移，禁止裸写 [0,0,...] 当作物体位置。`);
  }
}
