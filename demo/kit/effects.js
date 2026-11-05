'use strict';
/* ------------------------------------------------------------------
 * 特效层运行时（KIT_EFFECT）
 *
 * 特效不是构件：构件摆在场上的东西，特效是盖在画面上的效果层。
 * 不注册 KIT、不参与画家排序；调用方在场景画完之后按需叠。
 *
 *   KIT_EFFECT.draw(id, ctx, x, y, z, u, params) → boolean
 *     x,y,z 世界坐标（调用方不用投影）；u 生命周期进度 0..1
 *     life=0 的常驻特效用 u 当相位；返回 true = 继续播放
 *
 * def.draw 只碰 ctx：plot/sphere/capsule/box（世界）、screen、dot/dots（覆盖层）、
 * isObject/isGround/tint（读场景）。参考 engine.js:297-336、tie-break:515-554、
 * stari-most:530-550、mini-ramp:467；文档 docs/kit/effects-weather.md。
 * ------------------------------------------------------------------ */
const KIT_EFFECT = (() => {
  const TAU = Math.PI * 2, EMPTY = -1e8;
  const INK = rgb(28, 27, 25), SIGNAL = rgb(255, 214, 10), PAPER = rgb(255, 255, 255);
  const TRACK = rgb(126, 101, 78);
  const CATEGORY = { ui: '界面', impact: '冲击', ground: '地面' };
  const defs = Object.create(null), order = [];
  /* 字符画：. 空 / o 轮廓 / X 填充（参考 engine.js:303、mini-ramp:467） */
  const ARROW = [
    '....ooooo....', '....oXXXo....', '....oXXXo....', '....oXXXo....',
    'oooooXXXooooo', 'oXXXXXXXXXXXo', '.oXXXXXXXXXo.', '..oXXXXXXXo..',
    '...oXXXXXo...', '....oXXXo....', '.....oXo.....', '......o......',
  ];
  const BANG = ['.ooo.', '.oXo.', '.oXo.', '.oXo.', '.ooo.', '.oXo.', '.ooo.'];

  /* ---------------- 参数与登记 ---------------- */
  function normalizeParams(raw) {
    const out = Object.create(null);
    for (const key of Object.keys(raw || {})) {
      const q = raw[key] || {}, dv = q.def == null ? 0 : q.def;
      out[key] = {
        def: dv, min: q.min == null ? dv : q.min, max: q.max == null ? dv : q.max,
        step: q.step == null ? 1 : q.step, desc: q.desc || '', en: q.en || '',
      };
    }
    return out;
  }
  /* 覆盖参数原样接受（颜色是 [r,g,b] 数组，不能按数字夹） */
  function resolveParams(def, over) {
    const p = Object.create(null);
    for (const k of Object.keys(def.params)) p[k] = def.params[k].def;
    if (over) for (const k of Object.keys(over)) {
      if (over[k] !== undefined && over[k] !== null) p[k] = over[k];
    }
    return p;
  }
  const pack = (c, v) => Array.isArray(v) ? c.rgb(v[0], v[1], v[2])
    : (typeof v === 'number' ? v >>> 0 : PAPER);
  /* 常用参数片段 */
  const P_SCALE = { def: 1, min: 1, max: 3, step: 1, desc: '像素放大', en: 'scale' };
  const P_BOB = { def: 1, min: 0, max: 1, step: 1, desc: '上下浮动', en: 'bob' };
  const P_COLOR = (arr, desc) => ({ def: arr, desc, en: 'color' });
  const P_SEED = d => ({ def: d, min: 0, max: 999, step: 1, desc: '随机种子', en: 'seed' });

  /* ---------------- 绘制上下文 ---------------- */
  /* 把引擎全局 / KIT_RENDER ctx 统一成特效 ctx。
     dot/dots 是覆盖层原语：只写 pix，不写 zb —— 和参考项目的 drawDots 一致。 */
  function makeCtx(base) {
    if (base && base.__kitEffectCtx) return base;
    const src = base || null;
    const screen = src && typeof src.screen === 'function'
      ? (x, y, z) => src.screen(x, y, z)
      : (x, y, z) => project(x, y, z);
    const delegate = (name, fallback) => src && typeof src[name] === 'function'
      ? (...a) => src[name](...a) : fallback;
    const ctx = {
      __kitEffectCtx: true,
      get W() { return W; }, get H() { return H; },
      screen,
      plot: delegate('plot', plot), sphere: delegate('sphere', sphere),
      capsule: delegate('capsule', capsule), box: delegate('box', box),
      rgb, rampOf, hash, bayerAt, clamp, lerp,
      dot(ix, iy, color) {
        const x = ix | 0, y = iy | 0;
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        pix[y * W + x] = color;
      },
      dots(points, color) {
        for (let k = 0; k < points.length; k++) ctx.dot(points[k][0], points[k][1], color);
      },
      isObject(ix, iy) {
        if (ix < 0 || iy < 0 || ix >= W || iy >= H) return false;
        const i = iy * W + ix, d = zb[i];
        return d > EMPTY && d !== groundZ[i];
      },
      isGround(ix, iy) {
        if (ix < 0 || iy < 0 || ix >= W || iy >= H) return false;
        const i = iy * W + ix;
        return ground[i] === 1 && zb[i] === groundZ[i];
      },
      tint(ix, iy, r, g, b) {
        if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
        const i = iy * W + ix, c = pix[i];
        pix[i] = rgb((c & 255) * r, (c >> 8 & 255) * g, (c >> 16 & 255) * b);
      },
    };
    return ctx;
  }

  /* ---------------- 像素字形 ---------------- */
  function halo(c, pts) {
    const seen = new Set(), out = [];
    for (let k = 0; k < pts.length; k++) {
      const x = pts[k][0] | 0, y = pts[k][1] | 0;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const key = (y + dy) * 4096 + (x + dx);
        if (seen.has(key)) continue;
        seen.add(key); out.push([x + dx, y + dy]);
      }
    }
    c.dots(out, PAPER);
  }
  function glyph(c, rows, left, top, scale, fill) {
    const ink = [], body = [];
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        const cell = rows[y][x];
        if (cell === '.') continue;
        const px = left + x * scale, py = top + y * scale;
        for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
          (cell === 'o' ? ink : body).push([px + sx, py + sy]);
        }
      }
    }
    halo(c, ink);
    c.dots(ink, INK);
    c.dots(body, fill);
  }

  /* ---------------- 注册表 ---------------- */
  const API = {
    defs, order,
    register(def) {
      if (!def || !def.id) throw new Error('KIT_EFFECT.register: 缺少 id');
      if (typeof def.draw !== 'function') throw new Error(`KIT_EFFECT.register(${def.id}): 缺少 draw`);
      if (defs[def.id]) throw new Error(`KIT_EFFECT: id 重复 "${def.id}"`);
      const category = def.category || 'impact';
      if (!CATEGORY[category]) throw new Error(`KIT_EFFECT.register(${def.id}): 未知分类 "${category}"`);
      defs[def.id] = {
        id: def.id, label: def.label || def.id, category, desc: def.desc || '',
        life: def.life == null ? (category === 'ui' ? 0 : .6) : def.life,
        params: normalizeParams(def.params), draw: def.draw,
      };
      order.push(def.id);
      return defs[def.id];
    },
    get(id) { return defs[id] || null; },
    list(category) { return order.map(id => defs[id]).filter(d => !category || d.category === category); },
    makeCtx,
    draw(id, ctx, x, y, z, u, params) {
      const def = defs[id];
      if (!def) { console.warn(`[kit-effect] 未登记的特效 "${id}"`); return false; }
      const p = resolveParams(def, params), c = makeCtx(ctx);
      const uu = clamp(u == null ? 0 : +u, 0, 1);
      def.draw(c, x || 0, y || 0, z || 0, uu, p);
      return def.life > 0 ? uu < 1 : true;
    },
  };

  /* ---------------- UI ---------------- */
  API.register({
    id: 'arrow', label: '指示箭头', category: 'ui', life: 0,
    desc: '字符画箭头 + 白描边 + 3fps 上下浮动；箭头尖对准目标',
    params: { scale: P_SCALE, bob: P_BOB },
    draw(c, x, y, z, u, p) {
      const q = c.screen(x, y, z), sc = Math.max(1, Math.round(p.scale));
      const bob = p.bob ? Math.floor(u * 6) % 2 * 2 : 0;
      glyph(c, ARROW, Math.round(q.sx - 6 * sc),
        Math.round(q.sy - ARROW.length * sc - bob), sc, SIGNAL);
    },
  });
  API.register({
    id: 'bang', label: '爆炸符号', category: 'ui', life: .45,
    desc: '头顶惊叹号：字符画 + 白描边，短暂出现',
    params: { scale: P_SCALE, bob: P_BOB },
    draw(c, x, y, z, u, p) {
      const q = c.screen(x, y, z), sc = Math.max(1, Math.round(p.scale));
      const bob = p.bob ? Math.floor(u * 8) % 2 * 2 : 0;
      glyph(c, BANG, Math.round(q.sx - 2 * sc),
        Math.round(q.sy - BANG.length * sc - 8 * sc - bob), sc, SIGNAL);
    },
  });
  API.register({
    id: 'target-ring', label: '目标环', category: 'ui', life: 0,
    desc: '地面 2:1 椭圆判定圈；ok=1 黄心黑边，ok=0 黑心白边',
    params: {
      rx: { def: 8, min: 4, max: 22, step: 1, desc: '椭圆半径 X', en: 'rx' },
      ry: { def: 4, min: 2, max: 12, step: 1, desc: '椭圆半径 Y', en: 'ry' },
      ok: { def: 1, min: 0, max: 1, step: 1, desc: '是否在判定区', en: 'ok' },
      pulse: { def: 1, min: 0, max: 1, step: 1, desc: '呼吸脉动', en: 'pulse' } },
    draw(c, x, y, z, u, p) {
      const q = c.screen(x, y, 0);
      const beat = p.pulse ? Math.floor(u * 4) % 2 : 0;
      const rx = p.rx + beat, ry = p.ry + beat * .5;
      const ring = [], outer = [];
      for (let a = 0; a < TAU; a += .12) {
        const ca = Math.cos(a), sa = Math.sin(a);
        ring.push([q.sx + ca * rx, q.sy + sa * ry],
          [q.sx + ca * (rx - 1), q.sy + sa * (ry - 1)]);
        outer.push([q.sx + ca * (rx + 1), q.sy + sa * (ry + 1)]);
      }
      const ok = p.ok >= .5;
      c.dots(outer, ok ? INK : PAPER);
      c.dots(ring, ok ? SIGNAL : INK);
      c.dots([[q.sx, q.sy], [q.sx - 1, q.sy], [q.sx + 1, q.sy],
        [q.sx, q.sy - 1], [q.sx, q.sy + 1]], ok ? SIGNAL : INK);
    },
  });
  API.register({
    id: 'charge-bar', label: '能量条', category: 'ui', life: 0,
    desc: '17×5 边框 + 15 格填充，能量值由 power 控制',
    params: {
      power: { def: .6, min: 0, max: 1, step: .05, desc: '能量 0..1', en: 'power' },
      scale: P_SCALE,
    },
    draw(c, x, y, z, u, p) {
      const q = c.screen(x, y, z), sc = Math.max(1, Math.round(p.scale));
      const left = Math.round(q.sx) - 8 * sc, top = Math.round(q.sy) - 7 * sc;
      const n = Math.round(clamp(p.power, 0, 1) * 15);
      const frame = [], fill = [], empty = [];
      const add = (arr, gx, gy) => {
        for (let sy = 0; sy < sc; sy++) for (let sx = 0; sx < sc; sx++) {
          arr.push([left + gx * sc + sx, top + gy * sc + sy]);
        }
      };
      for (let gx = 0; gx < 17; gx++) for (let gy = 0; gy < 5; gy++) {
        const inner = gx > 0 && gx < 16 && gy > 0 && gy < 4;
        add(inner ? (gx - 1 < n ? fill : empty) : frame, gx, gy);
      }
      halo(c, frame);
      c.dots(frame, INK);
      c.dots(empty, PAPER);
      c.dots(fill, SIGNAL);
    },
  });
  API.register({
    id: 'halo', label: '白描边', category: 'ui', life: 0,
    desc: '扫描目标周围像素，在轮廓外一圈点白色；找不到形体时退化为虚线椭圆',
    params: {
      radius: { def: 1.5, min: .3, max: 6, step: .1, desc: '搜索半径（世界）', en: 'radius' },
      thickness: { def: 1, min: 1, max: 2, step: 1, desc: '描边厚度', en: 'thickness' },
      color: P_COLOR([255, 255, 255], '描边色 [r,g,b]'),
    },
    draw(c, x, y, z, u, p) {
      const q = c.screen(x, y, z), edge = c.screen(x + p.radius, y, z);
      const rp = Math.max(3, Math.abs(edge.sx - q.sx));
      const cx = Math.round(q.sx), cy = Math.round(q.sy), R = Math.ceil(rp) + 2;
      const th = Math.max(1, Math.round(p.thickness));
      const seen = new Set(), pts = [];
      const push = (ix, iy) => {
        const key = iy * 4096 + ix;
        if (seen.has(key)) return;
        seen.add(key); pts.push([ix, iy]);
      };
      for (let iy = cy - R; iy <= cy + R; iy++) for (let ix = cx - R; ix <= cx + R; ix++) {
        if (!c.isObject(ix, iy)) continue;
        for (let k = 1; k <= th; k++) {
          if (!c.isObject(ix - k, iy)) push(ix - k, iy);
          if (!c.isObject(ix + k, iy)) push(ix + k, iy);
          if (!c.isObject(ix, iy - k)) push(ix, iy - k);
          if (!c.isObject(ix, iy + k)) push(ix, iy + k);
        }
      }
      if (!pts.length) {
        const ry = rp * .55;
        for (let a = 0; a < TAU; a += .12) {
          const px = cx + Math.cos(a) * rp, py = cy + Math.sin(a) * ry;
          if (a > 0 && c.bayerAt(Math.round(px), Math.round(py)) > .55) continue;
          pts.push([px, py]);
        }
      }
      c.dots(pts, pack(c, p.color));
    },
  });

  /* ---------------- impact ---------------- */
  API.register({
    id: 'dust', label: '扬尘', category: 'impact', life: .7,
    desc: '落地扬尘：向外扩散 + 抬升 + 按 hash 逐步消散',
    params: {
      count: { def: 10, min: 3, max: 24, step: 1, desc: '尘点数量', en: 'count' },
      radius: { def: 1.2, min: .3, max: 3, step: .1, desc: '扩散半径（世界）', en: 'radius' },
      rise: { def: .9, min: 0, max: 2, step: .1, desc: '抬升高度', en: 'rise' },
      color: P_COLOR([224, 170, 130], '尘色 [r,g,b]'),
      seed: P_SEED(11),
    },
    draw(c, x, y, z, u, p) {
      const n = Math.max(1, Math.round(p.count)), seed = p.seed | 0;
      const color = pack(c, p.color);
      for (let k = 0; k < n; k++) {
        if (hash(k, seed + 5) > 1 - u * .7) continue;
        const a = hash(k, seed) * TAU;
        const rr = p.radius * (.15 + u * (.6 + hash(k, seed + 1) * .5));
        const lift = p.rise * Math.sin(Math.PI * u) * (.4 + hash(k, seed + 2) * .6);
        const q = c.screen(x + Math.cos(a) * rr, y + Math.sin(a) * rr, z + .15 + lift);
        c.dot(q.sx, q.sy, color);
      }
    },
  });
  API.register({
    id: 'spark', label: '火花', category: 'impact', life: .35,
    desc: '十字白点向外炸开；rays=8 时加斜向射线',
    params: {
      size: { def: 5, min: 2, max: 9, step: 1, desc: '最大半径（像素）', en: 'size' },
      rays: { def: 4, min: 4, max: 8, step: 4, desc: '射线数 4/8', en: 'rays' },
      color: P_COLOR([255, 255, 255], '火花色 [r,g,b]'),
    },
    draw(c, x, y, z, u, p) {
      const q = c.screen(x, y, z), r = 1 + u * p.size;
      const pts = [[q.sx, q.sy]];
      for (const rr of [r, r * .55]) {
        pts.push([q.sx - rr, q.sy], [q.sx + rr, q.sy], [q.sx, q.sy - rr], [q.sx, q.sy + rr]);
      }
      if (p.rays >= 8) {
        const d = r * .7;
        pts.push([q.sx - d, q.sy - d], [q.sx + d, q.sy - d],
          [q.sx - d, q.sy + d], [q.sx + d, q.sy + d]);
      }
      c.dots(pts, pack(c, p.color));
      c.dot(q.sx, q.sy, SIGNAL);
    },
  });
  API.register({
    id: 'splash', label: '水花', category: 'impact', life: .6,
    desc: '入水水花：水滴沿抛物线飞溅，落点归零',
    params: {
      count: { def: 8, min: 3, max: 20, step: 1, desc: '水滴数量', en: 'count' },
      spread: { def: .5, min: .2, max: 1.5, step: .1, desc: '水平扩散', en: 'spread' },
      lift: { def: 1.2, min: .3, max: 3, step: .1, desc: '飞溅高度', en: 'lift' },
      color: P_COLOR([232, 244, 250], '水色 [r,g,b]'),
      seed: P_SEED(23),
    },
    draw(c, x, y, z, u, p) {
      const n = Math.max(1, Math.round(p.count)), seed = p.seed | 0;
      const color = pack(c, p.color);
      for (let k = 0; k < n; k++) {
        const a = hash(k, seed) * TAU;
        const reach = p.spread * (.25 + u) * (.4 + hash(k, seed + 1) * .6);
        const hz = p.lift * 4 * u * (1 - u) * (.5 + hash(k, seed + 2) * .5);
        c.plot(x + Math.cos(a) * reach, y + Math.sin(a) * reach, z + .15 + hz, color);
      }
    },
  });

  /* ---------------- ground ---------------- */
  API.register({
    id: 'ring', label: '涟漪', category: 'ground', life: .9,
    desc: '地面虚线圆环：半径随 u 扩大，hash 剔除让环逐渐消散',
    params: {
      radius: { def: 1.5, min: .4, max: 4, step: .1, desc: '最大半径（世界）', en: 'radius' },
      color: P_COLOR([226, 240, 226], '水色 [r,g,b]'),
    },
    draw(c, x, y, z, u, p) {
      const r = Math.max(.05, p.radius * (.25 + .75 * u));
      const n = Math.max(12, Math.ceil(r * 22)), color = pack(c, p.color);
      const stamp = (r * 40) | 0;
      for (let k = 0; k < n; k++) {
        if (k && hash(k, stamp) > 1 - u * .65) continue;
        const a = k / n * TAU;
        c.plot(x + Math.cos(a) * r, y + Math.sin(a) * r, z + .15, color);
      }
    },
  });
  API.register({
    id: 'track-mark', label: '地面痕迹', category: 'ground', life: 0,
    desc: '沿运动反方向压一条十字笔刷土痕；有地面时乘算压暗，否则落土色点',
    params: {
      length: { def: 1.2, min: .3, max: 4, step: .1, desc: '痕迹长度（世界）', en: 'length' },
      angle: { def: 0, min: 0, max: 6.28, step: .1, desc: '运动方向（弧度）', en: 'angle' },
      width: { def: 2, min: 1, max: 4, step: 1, desc: '笔刷半宽', en: 'width' },
      strength: { def: .14, min: .04, max: .4, step: .01, desc: '压暗强度', en: 'strength' },
      density: { def: .7, min: .2, max: 1, step: .05, desc: '落点密度', en: 'density' },
    },
    draw(c, x, y, z, u, p) {
      const len = Math.max(.1, p.length), steps = Math.max(1, Math.round(len / .3));
      const width = Math.max(1, Math.round(p.width));
      const mul = 1 - clamp(p.strength, 0, .9);
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const q = c.screen(x - Math.cos(p.angle) * len * t,
          y - Math.sin(p.angle) * len * t, 0);
        const ix0 = Math.round(q.sx), iy0 = Math.round(q.sy);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -width; dx <= width; dx++) {
          if (Math.abs(dx) === width && dy) continue;
          if (c.bayerAt(ix0 + dx, iy0 + dy) > p.density) continue;
          const ix = ix0 + dx, iy = iy0 + dy;
          if (ix < 0 || iy < 0 || ix >= c.W || iy >= c.H) continue;
          if (c.isGround(ix, iy)) c.tint(ix, iy, mul, mul * .94, mul * .9);
          else c.dot(ix, iy, TRACK);
        }
      }
    },
  });
  return API;
})();