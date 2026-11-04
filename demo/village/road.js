'use strict';
/* ------------------------------------------------------------------
 * 秋日山村 · 公路几何 + 黄色小甲壳虫
 *
 * 职责（CONTRACT §2 街道 / §5 人物与车）：
 *   1. 公路几何：中心线 / 切向 / 法向 / 距离 / 投影 / 横向偏移 / 路坐标系
 *   2. 小汽车：沿公路行驶，每帧移动 + 转向 + 警灯闪烁 + 动态阴影
 *   3. 路面：沥青 + 路缘石 + 黄色虚线（terrain.js 已画路面时**不要**再调）
 *
 * 【坑 1 · 不定义顶层 const ROAD】
 *   terrain.js 拥有 ROAD（契约 §2）。const 是全局词法声明，同名重复声明会让
 *   整个页面脚本抛 SyntaxError，所有模块一起挂掉。所以本文件：
 *     · 全部实现包在 IIFE 里，一个全局名都不占
 *     · 运行时用 `typeof ROAD` 探测 terrain.js 的几何（运行时才解析，
 *       不构成编译期重复声明）
 *     · 唯一新增的全局是 `Road` 对象（挂 window.Road）
 *
 * 【坑 2 · 路坐标系 s / lat】
 *   s = 沿路弧长（从远端 a 点起算，无限延伸），lat = 横向偏移。
 *   路面绘制用这套坐标，公路才能延伸到画面外而不是圆头封口。
 *   （roadDist() 会把 t 夹到 [0,1]，那是"点到线段"的语义，画路面不能用。）
 * ------------------------------------------------------------------ */

(function () {
  /* 兜底几何：terrain.js 未定义 ROAD 时用这个 */
  const ROAD_DEFAULT = { ax: -13, ay: -18, bx: 17, by: 19, halfW: 3.1 };

  /* palette.js 里没有的两个色 */
  const CAR_LAMP = [255, 246, 212];
  /* 坑 3 · palette.js 的 BEACON 是 rgb() 打包的 number，rampOf() 只吃数组
     （WeakMap 键 + c[0..2]）。球体必须走 rampOf，所以另开一个数组版。 */
  const BEACON_ARR = [228, 62, 46];
  const BEACON_DIM = [128, 30, 22];

  /* ---------------- 公路几何 ---------------- */

  function cfg() {
    return (typeof ROAD !== 'undefined' && ROAD) ? ROAD : ROAD_DEFAULT;
  }
  function roadLength() {
    const R = cfg();
    return Math.hypot(R.bx - R.ax, R.by - R.ay);
  }
  /* 中心线上参数 t 处的点（t 可越界 → 线性外延，公路能开进画面外） */
  function roadPoint(t) {
    const R = cfg();
    return { x: lerp(R.ax, R.bx, t), y: lerp(R.ay, R.by, t) };
  }
  /* 单位切向量（公路走向） */
  function roadTangent(t) {
    const R = cfg();
    const dx = R.bx - R.ax, dy = R.by - R.ay, l = Math.hypot(dx, dy);
    return { x: dx / l, y: dy / l };
  }
  /* 单位法向量（垂直于走向，指向车行的左手边） */
  function roadNormal(t) {
    const g = roadTangent(t);
    return { x: -g.y, y: g.x };
  }
  /* 点在公路上的投影参数 t（夹到 [0,1]） */
  function roadProject(x, y) {
    const R = cfg();
    const dx = R.bx - R.ax, dy = R.by - R.ay;
    return clamp(((x - R.ax) * dx + (y - R.ay) * dy) / (dx * dx + dy * dy), 0, 1);
  }
  /* 点到公路中心线的距离（t 夹到 [0,1]，端点外算到端点） */
  function roadDist(x, y) {
    const R = cfg();
    const dx = R.bx - R.ax, dy = R.by - R.ay;
    let t = ((x - R.ax) * dx + (y - R.ay) * dy) / (dx * dx + dy * dy);
    t = clamp(t, 0, 1);
    return Math.hypot(x - (R.ax + dx * t), y - (R.ay + dy * t));
  }
  /* 中心线上 t 处沿法线横移 lat（靠哪一侧行驶） */
  function roadOffset(t, lat) {
    const p = roadPoint(t), n = roadNormal(t);
    return { x: p.x + n.x * lat, y: p.y + n.y * lat };
  }
  /* 路坐标系：s = 沿路弧长（无限延伸），lat = 横向偏移。路面绘制用这套。 */
  function roadAxis(x, y) {
    const R = cfg();
    const dx = R.bx - R.ax, dy = R.by - R.ay, l = Math.hypot(dx, dy);
    const ux = dx / l, uy = dy / l, px = x - R.ax, py = y - R.ay;
    return { s: px * ux + py * uy, lat: px * -uy + py * ux };
  }

  /* ---------------- 小汽车 ---------------- */

  const CAR = {
    t: .50,          // 在公路上的位置参数
    speed: .07,      // t / 秒（整条可见路段约 35 秒）
    lateralRatio: .46, // 横向偏移 = halfW × ratio（负 = 右侧，右侧通行）
    x: 0, y: 0, yaw: 0,
  };
  /* 出入口都放在画面外，车不会凭空出现/消失 */
  const CAR_MIN_T = -.95, CAR_MAX_T = 1.80;

  function makeCar(t) {
    CAR.t = t == null ? .50 : t;
    step(CAR.t, 0);
    return CAR;
  }

  /* 沿公路推进 dt 秒，同步位置与朝向。
     横向偏移按 halfW 的比例算：terrain.js 的 ROAD.halfW 可能被调，
     固定绝对值会让车压到虚线上或跑出沥青。 */
  function step(time, dt) {
    const c = CAR;
    c.t += c.speed * dt;
    if (c.t > CAR_MAX_T) c.t = CAR_MIN_T;   // 近端出去，远端进来
    const p = roadOffset(c.t, -cfg().halfW * c.lateralRatio);
    c.x = p.x; c.y = p.y;
    const g = roadTangent(c.t);
    c.yaw = Math.atan2(g.y, g.x);
    return c;
  }
  const updateCar = step;

  /* 车身局部 → 世界。a = 前后（正 = 车头），b = 左右，h = 高度 */
  function localFrame(c) {
    const fx = Math.cos(c.yaw), fy = Math.sin(c.yaw), sx = -fy, sy = fx;
    return {
      fx, fy, sx, sy,
      P: (a, b, h) => [c.x + fx * a + sx * b, c.y + fy * a + sy * b, h],
    };
  }

  /* 车顶球上的窗区判定。na = 前后法线分量，nb = 左右，nh = 朝上。
     甲壳虫的窗：挡风在车头侧（a+）、侧窗在两侧、后窗在车尾侧（a-）。
     坑 4 · 球体可见半球只覆盖朝观察者的一半，"后窗"往往被自身挡住，
     所以主要靠挡风 + 侧窗表达"这是一辆有玻璃的甲壳虫"。 */
  function isWindow(na, nb, nh) {
    if (nh < -.15) return false;                             // 舱体下半：不透明
    if (nh > .52) return false;                              // 车顶板：留黄
    if (na > .50 && Math.abs(nb) < .62) return true;         // 挡风玻璃
    if (Math.abs(nb) > .66 && na > -.45 && na < .62) return true; // 侧窗
    if (na < -.58 && Math.abs(nb) < .55) return true;        // 后窗
    return false;
  }

  /* 直接写像素画车窗。
     坑 5 · 引擎的 sphere() 是"屏幕圆 + 伪造深度"，球面像素深度
     d = 球心深度 + r·nz；plot() 用点深度会被球体自身挡住，所以不行。
     这里在屏幕圆内反解球面法线 → 换算到车身局部坐标 → 判窗区，
     并用 zb 检查"这块像素的最前表面确实是车顶球"。 */
  function drawGlass(P, f, a0, z0, r) {
    const c = P(a0, 0, z0);
    const pr = project(c[0], c[1], c[2]);
    const rp = Math.max(r * S, .75);
    const y0 = Math.max(0, Math.floor(pr.sy - rp)), y1 = Math.min(H - 1, Math.ceil(pr.sy + rp));
    const x0 = Math.max(0, Math.floor(pr.sx - rp)), x1 = Math.min(W - 1, Math.ceil(pr.sx + rp));
    const ramp = rampOf(CAR_GLASS);
    for (let iy = y0; iy <= y1; iy++) for (let ix = x0; ix <= x1; ix++) {
      const dxu = (ix + .5 - pr.sx) / rp, dyu = (iy + .5 - pr.sy) / rp;
      const nn = dxu * dxu + dyu * dyu;
      if (nn > 1) continue;
      const nz = Math.sqrt(1 - nn);
      const i = iy * W + ix;
      /* zb 更大 = 更靠前。zb 明显大于车顶球该像素深度 → 被车头等遮住，不画窗 */
      if (zb[i] > pr.d + r * nz + 1e-3) continue;
      /* 屏幕法线 → 世界法线（正交基：右 / 下 / 朝观察者） */
      const nx = (dxu + dyu * SIN + nz * COS) / R2;
      const ny = (-dxu + dyu * SIN + nz * COS) / R2;
      const nh = nz * SIN - dyu * COS;
      const na = nx * f.fx + ny * f.fy;
      const nb = nx * f.sx + ny * f.sy;
      if (!isWindow(na, nb, nh)) continue;
      pix[i] = ramp[clamp(Math.round(1.3 + nh * 1.8), 0, 4)];
    }
  }

  function drawCar(time) {
    const c = CAR;
    const f = localFrame(c);
    const P = f.P;
    /* 车身整体缩放：跟着路宽走，路窄车小、路宽车大，比例始终一致。
       基准 halfW = 2.4（契约 §2 写的 3.1 时车会略大，仍在沥青内）。 */
    const k = clamp(cfg().halfW / 2.4, .7, 1.25);
    const ball = (a, b, h, r, col, mode) => {
      const p = P(a * k, b * k, h * k);
      sphere(p[0], p[1], p[2], r * k, col, mode);
    };

    /* 下车身：沿车头方向一根胶囊 —— 甲壳虫圆润的长条底座。
       车头（a+）在屏幕上是"右下"，车尾（a-）是"左上"。
       坑 6 · 材质：车身用 'solid' —— rampOf 的 0 档是褐色（80,64,40），
       'gloss' 下球体下半部会落进这档，黄色车身就变成"发褐的脏黄"。
       'solid' 把亮度下限夹到 1 档，车身保持明快（docs/kit/props.md §1.1）。
       车顶用 'gloss' 保留一个高光点，让圆顶读作"有反光的漆面"。 */
    capsule(P(-.80 * k, 0, .50 * k), P(.78 * k, 0, .50 * k),
      .52 * k, .52 * k, () => CAR_BODY, 'solid');
    ball(.82, 0, .50, .40, CAR_BODY, 'solid');   // 引擎盖前凸
    ball(-.86, 0, .50, .44, CAR_BODY, 'solid');  // 车尾圆尾（与胶囊同高，避免下缘突出）
    /* 4 个轮子：外缘比车身宽，能看出"轮子露在外面" */
    for (const a of [.52, -.52]) for (const b of [.52, -.52])
      ball(a, b, .28, .28, CAR_DARK, 'rough');

    /* 车篷球：罩在车身后半（甲壳虫的驾驶舱偏后），压住车身顶部。
       车厢中心 a=-.28 → 挡风在车头侧（a 更大），车顶留黄。 */
    const CAB_A = -.28, CAB_H = 1.04, CAB_R = .50;
    ball(CAB_A, 0, CAB_H, CAB_R, CAR_TOP, 'gloss');

    /* 车窗（车篷之后画，zb 深度检查负责避开被车头遮住的像素） */
    drawGlass(P, f, CAB_A * k, CAB_H * k, CAB_R * k);

    /* 前后保险杠 */
    capsule(P(1.30 * k, -.42 * k, .32 * k), P(1.30 * k, .42 * k, .32 * k),
      .075 * k, .075 * k, () => CAR_DARK, 'solid');
    capsule(P(-1.26 * k, -.40 * k, .32 * k), P(-1.26 * k, .40 * k, .32 * k),
      .075 * k, .075 * k, () => CAR_DARK, 'solid');

    /* 车头一对圆大灯 */
    for (const b of [.26, -.26]) {
      const l = P(1.10 * k, b * k, .56 * k);
      sphere(l[0], l[1], l[2], .17 * k, CAR_LAMP, 'gloss');
    }

    /* 车顶警灯：2Hz 闪烁（亮 / 灭各 .25 秒） */
    const on = Math.floor(time * 4) % 2 === 0;
    const bp = P(CAB_A * k, 0, (CAB_H + CAB_R + .10) * k);
    sphere(bp[0], bp[1], bp[2], .14 * k, on ? BEACON_ARR : BEACON_DIM, 'gloss');

    /* 动态阴影：车体投影（沿光向偏）+ 贴地接触影 */
    castShadow(c.x, c.y, .78 * k, .74 * k, 1, .25);
    castShadow(c.x, c.y, 0, .42 * k, 2, 0);
  }

  /* ---------------- 路面绘制：已拆到 road-paint.js ---------------- */
  /* terrain.js 已实现完整路面（groundColor() 逐像素处理沥青 + 路缘石 +
     人行道 + 黄色虚线，由 bakeTerrain() 一次烘焙），主场景不要重复画。
     road.js 自己那套兜底实现放在 road-paint.js：road.js 要能独立成场景
     （契约 §8「只定义函数，不自动执行」）。 */

  /* ---------------- 导出 ---------------- */

  window.Road = {
    cfg, roadLength, roadPoint, roadTangent, roadNormal,
    roadProject, roadDist, roadOffset, roadAxis,
    car: CAR, makeCar, updateCar, drawCar,
  };
  /* 便捷别名：主场景与验收脚本可直接按函数名调用 */
  window.makeCar = makeCar;
  window.updateCar = updateCar;
  window.drawCar = drawCar;
})();
