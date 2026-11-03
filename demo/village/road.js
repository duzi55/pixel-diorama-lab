'use strict';
/* ------------------------------------------------------------------
 * 秋日山村 · 公路几何 + 黄色小甲壳虫
 *
 * 职责（CONTRACT §2 街道 / §5 人物与车）：
 *   1. 公路几何：中心线 / 切向 / 法向 / 距离 / 投影 / 横向偏移 / 路坐标系
 *   2. 小汽车：沿公路行驶，每帧移动 + 转向 + 警灯闪烁 + 动态阴影
 *   3. 路面：沥青 + 路缘石 + 黄色虚线（terrain.js 已画路面时只调标记函数）
 *
 * 【为什么本文件不定义顶层 const ROAD】
 *   terrain.js 也会定义 ROAD。const 是全局词法声明，同名重复声明会让整个
 *   页面脚本抛 SyntaxError，所有模块一起挂掉。所以本文件：
 *     · 全部实现包在 IIFE 里，一个全局名都不占
 *     · 运行时用 `typeof ROAD` 探测 terrain.js 给的几何（运行时才解析，
 *       不构成编译期重复声明）
 *     · 唯一新增的全局是 `Road` 对象（挂 window.Road）
 *
 * 【路坐标系 s / lat】
 *   s   = 沿路弧长（从远端 a 点起算，无限延伸，可负可超出）
 *   lat = 相对中心线的横向偏移
 *   路面/虚线/路缘都用这套坐标，公路才能真正延伸到画面外而不是圆头封口。
 *   （roadDist() 会把 t 夹到 [0,1]，那是"点到线段"的语义，画路面不能用。）
 * ------------------------------------------------------------------ */

(function () {
  /* 兜底几何：terrain.js 未定义 ROAD 时用这个 */
  const ROAD_DEFAULT = { ax: -13, ay: -18, bx: 17, by: 19, halfW: 3.1 };

  /* palette.js 里没有的两个色 */
  const CAR_LAMP = [255, 246, 212];
  /* 坑：palette.js 的 BEACON 是 rgb() 打包的 number，rampOf() 只吃数组
     （WeakMap 键 + c[0..2]）。球体必须走 rampOf，所以另开一个数组版。 */
  const BEACON_ARR = [228, 62, 46];
  const BEACON_DIM = [128, 30, 22];

  /* 车身尺寸（世界单位，人高 1.9）。车宽约占路宽 1/3，才读得出"车在道上"。 */
  const BODY_R = .82, ROOF_R = .66;

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
    lateral: -1.05,  // 相对中心线的横移：负 = 右侧（右侧通行）
    x: 0, y: 0, yaw: 0,
  };
  /* 出入口都放在画面外，车不会凭空出现/消失 */
  const CAR_MIN_T = -.95, CAR_MAX_T = 1.80;

  function makeCar(t) {
    CAR.t = t == null ? .50 : t;
    step(CAR.t, 0);
    return CAR;
  }

  /* 沿公路推进 dt 秒，同步位置与朝向 */
  function step(time, dt) {
    const c = CAR;
    c.t += c.speed * dt;
    if (c.t > CAR_MAX_T) c.t = CAR_MIN_T;   // 近端出去，远端进来
    const p = roadOffset(c.t, c.lateral);
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
     注意：球体可见半球只覆盖朝观察者的一半，"后窗"往往被自身挡住，
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
     坑：引擎的 sphere() 是"屏幕圆 + 伪造深度"，球面像素深度
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
      /* zb 更大 = 更靠前。若 zb 明显大于车顶球该像素的深度，
         说明这块被引擎盖/车头等更近的部件盖住，不该画窗。 */
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
    const ball = (a, b, h, r, col, mode) => {
      const p = P(a, b, h);
      sphere(p[0], p[1], p[2], r, col, mode);
    };

    /* 下车身：沿车头方向一根胶囊 —— 甲壳虫的圆润长条底座 */
    capsule(P(-.88, 0, .50), P(.88, 0, .50), .50, .50, () => CAR_BODY, 'gloss');
    /* 引擎盖前凸 */
    ball(.92, 0, .54, .42, CAR_BODY, 'gloss');

    /* 4 个轮子：外缘比车身宽，能看到"轮子在外面" */
    for (const a of [.62, -.62]) for (const b of [.54, -.54])
      ball(a, b, .28, .28, CAR_DARK, 'rough');

    /* 车篷球：画在最后，才能稳稳压住车身顶部（挡风/侧窗都靠它） */
    const CAB_A = -.10, CAB_H = 1.16, CAB_R = .54;
    ball(CAB_A, 0, CAB_H, CAB_R, CAR_TOP, 'gloss');

    /* 车窗（车篷之后画，zb 深度检查负责避开被车头遮住的像素） */
    drawGlass(P, f, CAB_A, CAB_H, CAB_R);

    /* 前后保险杠 */
    capsule(P(1.38, -.42, .34), P(1.38, .42, .34), .075, .075, () => CAR_DARK, 'solid');
    capsule(P(-1.40, -.40, .34), P(-1.40, .40, .34), .075, .075, () => CAR_DARK, 'solid');

    /* 车头一对圆大灯 */
    for (const b of [.28, -.28]) {
      const l = P(1.22, b, .60);
      sphere(l[0], l[1], l[2], .17, CAR_LAMP, 'gloss');
    }

    /* 车顶警灯：2Hz 闪烁 */
    const on = Math.floor(time * 4) % 2 === 0;
    const bp = P(CAB_A, 0, CAB_H + CAB_R + .10);
    sphere(bp[0], bp[1], bp[2], .14, on ? BEACON_ARR : BEACON_DIM, 'gloss');

    /* 动态阴影：车体投影（沿光向偏）+ 贴地接触影 */
    castShadow(c.x, c.y, .78, .74, 1, .25);
    castShadow(c.x, c.y, 0, .42, 2, 0);
  }

  /* ---------------- 路面（terrain.js 未实现时才调用） ---------------- */

  /* 沥青 + 路缘石 + 人行道：写 ground / zb，可作烘焙底图的一部分。
     注意两处配色约定：
     1. ASPHALT 是 palette.js 里已调好的 4 档成品灰（数组数组），
        **不再走 rampOf** —— rampOf 会把每档再压暗 40%，路面会变成纯黑。
        但它是 [r,g,b] 三元组，要用 rgb() 打包后才能写进 pix。
     2. CURB / WALK 是单个 [r,g,b] 基色，走 rampOf 生成 5 档色阶。 */
  function drawRoadSurface() {
    const R = cfg();
    const asph = ASPHALT.map(col => rgb(col[0], col[1], col[2]));
    const curb = rampOf(CURB), walk = rampOf(WALK);
    for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
      const g = unproject(ix + .5, iy + .5);
      const d = Math.abs(roadAxis(g.x, g.y).lat);
      let c = 0;
      if (d <= R.halfW) {
        const n = noise(g.x * 2.3, g.y * 2.3);
        c = asph[clamp(Math.floor(n * 3.4 + (bayerAt(ix, iy) - .5) * .9), 0, 3)];
      } else if (d <= R.halfW + .26) {
        c = curb[3];
      } else if (d <= R.halfW + 1.10) {
        c = walk[hash(ix, iy) > .74 ? 3 : 2];
      }
      if (!c) continue;
      const i = iy * W + ix;
      pix[i] = c;
      ground[i] = 1;
      zb[i] = (g.x + g.y) / R2 * COS;
    }
  }

  /* 路面中央黄色虚线：沿路每 2.4 单位画一段 1.2 长。
     直写 pix 但**不动 zb** —— 虚线是路面贴花，zb 仍归地面，
     这样 applyShadows / bakeOcclusion 还会正确给它上影和 AO。 */
  function drawRoadMarkings() {
    const R = cfg(), period = 2.4, dash = 1.2;
    /* 虚线沿路方向：在路坐标系里取一段 (s, lat≈0)，再投影回像素 */
    for (let s0 = -40; s0 < 80; s0 += period) {
      for (let d = 0; d < dash; d += .12) {
        const t = (s0 + d) / roadLength();
        const p = roadPoint(t);
        const pr = project(p.x, p.y, .02);
        const ix = pr.sx | 0, iy = pr.sy | 0;
        if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
        pix[iy * W + ix] = ROAD_LINE;
      }
    }
  }

  /* 路缘石：路面两侧的窄亮条（同样直写 pix，不动 zb） */
  function drawRoadEdge() {
    const R = cfg(), curb = rampOf(CURB)[3];
    for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
      const g = unproject(ix + .5, iy + .5);
      const d = Math.abs(roadAxis(g.x, g.y).lat);
      if (d > R.halfW + .26 || d <= R.halfW - .04) continue;
      pix[iy * W + ix] = curb;
    }
  }

  /* ---------------- 导出 ---------------- */

  window.Road = {
    cfg, roadLength, roadPoint, roadTangent, roadNormal,
    roadProject, roadDist, roadOffset, roadAxis,
    car: CAR, makeCar, updateCar, drawCar,
    drawRoadSurface, drawRoadMarkings, drawRoadEdge,
  };
  /* 便捷别名：主场景与验收脚本可直接按函数名调用 */
  window.makeCar = makeCar;
  window.updateCar = updateCar;
  window.drawCar = drawCar;
})();
