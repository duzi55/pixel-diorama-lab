'use strict';
/* ------------------------------------------------------------------
 * 秋日山村 · 地形与公路
 *
 * 地面上只有两样东西：
 *   1. 顺着公路铺开的落叶台地 —— 外轮廓是"以公路为长轴的超椭圆"，
 *      边缘用噪声抖动 + 逐像素溶解，不是一刀切
 *   2. 公路本身 —— 沥青 + 黄色虚线 + 路缘石 + 人行道，
 *      沿中心线一直延伸到画布外，绝不断头
 *
 * 契约：CONTRACT.md §1（地面范围）§2（街道）§8（只定义函数，不自动执行）
 *
 * ⚠ 本文件拥有场景级常量 RX / RY / ROAD（契约 §1 §2 的原始名字）。
 *   别的模块**引用**它们，不要重复声明 —— 顶层 const 重名会 SyntaxError。
 * ------------------------------------------------------------------ */
/* ==================== 契约常量 ==================== */

const RX = 26;                            /* §1 x 方向半径 */
const RY = 30;                            /* §1 y 方向半径 */
const ROAD = {                            /* §2 公路中心线 */
  ax: -13, ay: -18,                       /* 远端 */
  bx: 17, by: 19,                         /* 近端 */
  halfW: 1.5,                             /* 沥青半宽 */
};

/* ==================== 可调参数 ==================== */

const EXT = 64;                           /* 公路两端向外延伸的世界长度 */
const CURB_W = .40;                       /* 路缘石宽（≈3.5px） */
const WALK_W = .62;                       /* 人行道宽（≈5.5px） */
const SHOULDER = .55;                     /* 人行道外的留白路肩宽 */
const DASH_PERIOD = 4.0;                  /* 虚线周期 */
const DASH_LEN = 2.0;                     /* 虚线实段长 */
const LINE_HW = .22;                      /* 虚线半宽 */
const LITTER_COUNT = 2000;                /* 落叶碎屑目标数量 */

/* 台地边界：以公路为主轴的超椭圆。长轴沿路、半轴垂直于路 ——
   这样路永远从台地中间穿过，台地连成一体（不会被路切成两块孤岛）。 */
const HILL_HALF_LEN = 52;                     /* 沿路半长 */
const HILL_HALF_HW = 13;                      /* 垂直于路的半宽 */
const HILL_POW = 2.6;                         /* 超椭圆指数（越小越接近椭圆） */

/* 路面配件的**局部**色。palette.js 的 CURB(178,172,158) / WALK(190,184,170)
   两者色差只有 12，等距投影下会糊成一条灰边。这里重新定局部色，
   刻意拉开人行道与路缘石的明度差，让三层边界各自可读。 */const CURB_LO = [148, 143, 130];          /* 路缘石暗侧 */
const CURB_HI = [212, 206, 190];          /* 路缘石亮侧（比路面明显亮） */
const WALK_LO = [150, 145, 133];          /* 人行道暗（比路缘石暗一档） */
const WALK_HI = [180, 174, 161];          /* 人行道亮 */
const WALK_SEAM = [124, 120, 110];        /* 人行道的板缝（最暗） */

/* ==================== 公路几何 ==================== */

/* 中心线沿同一直线向两端拉长 EXT，公路因此能一直伸出画布 */
const RD = (() => {
  const dx = ROAD.bx - ROAD.ax, dy = ROAD.by - ROAD.ay;
  const len = Math.hypot(dx, dy);
  const ex = dx / len, ey = dy / len;          /* 沿路单位向量 */
  const ax = ROAD.ax - ex * EXT, ay = ROAD.ay - ey * EXT;
  const full = len + EXT * 2;
  return {
    ex, ey, nx: ey, ny: -ex,                   /* 法线（屏幕向右为正） */
    ax, ay, bx: ax + ex * full, by: ay + ey * full,
    len: full,
    sMid: EXT + len / 2,                        /* 台地中心在路上的弧长位置 */
  };
})();

/* 画布四角在世界坐标里的弧长范围（撒落叶时只在这段里取样） */
/* 点到公路中心线的距离（点到线段），t 为沿线参数 */
function distToRoad(x, y) {
  const dx = RD.bx - RD.ax, dy = RD.by - RD.ay;
  const len2 = dx * dx + dy * dy;
  let t = ((x - RD.ax) * dx + (y - RD.ay) * dy) / len2;
  t = clamp(t, 0, 1);
  const px = RD.ax + dx * t, py = RD.ay + dy * t;
  return { d: Math.hypot(x - px, y - py), t, s: t * RD.len };
}

/* ==================== 地面材质 ==================== */

/* 把点换算到"以路为轴"的局部坐标：s = 沿路弧长，d = 垂直于路的偏移 */
function roadCoords(x, y) {
  const dx = RD.bx - RD.ax, dy = RD.by - RD.ay;
  const t = ((x - RD.ax) * dx + (y - RD.ay) * dy) / (dx * dx + dy * dy);
  const px = RD.ax + dx * t, py = RD.ay + dy * t;
  return { s: t * RD.len, d: (x - px) * RD.nx + (y - py) * RD.ny };
}

function hillE(x, y) {
  const c = roadCoords(x, y);
  const k = c.s - RD.sMid;
  /* 两侧不等宽：法线正向一侧宽，另一侧窄（参考图的山村偏在一侧） */
  const side = c.d >= 0 ? 1.0 : .76;
  /* 沿路缓慢起伏（低频正弦，避免宽窄突变成台阶） */
  const hw = HILL_HALF_HW * side
    * (1 + .20 * Math.sin(k * .062 + .6) + .09 * Math.sin(k * .038 - 1.3));
  const ds = k / HILL_HALF_LEN;
  const dd = c.d / hw;
  const e = Math.pow(Math.pow(Math.abs(ds), HILL_POW) + Math.pow(Math.abs(dd), HILL_POW), 1 / HILL_POW);
  return e + (noise(x * 1.05, y * 1.05) - .5) * .17;
}

/* 沥青：4 档 + 噪声 + 单像素杂点。
   注意：**不要**再叠 Bayer 抖动 —— 4 档色跨度大，规则网格会被眼睛读成
   棋盘/摩尔纹。ASPHALT 4 档本身跨度小，用 hash 的白噪声打散就够了。 */
function asphaltColor(x, y, ix, iy, d, s) {
  if (d < LINE_HW) {                          /* 中间黄色虚线 */
    const ph = s - Math.floor(s / DASH_PERIOD) * DASH_PERIOD;
    if (ph < DASH_LEN) return ROAD_LINE;
  }
  const u = clamp(.5 + (noise(x * 1.4, y * 1.4) - .5) * 1.05
    + (noise(x * 4.6, y * 4.6) - .5) * .5 + (hash(ix, iy) - .5) * .42, 0, 1);
  let idx = clamp(Math.floor(u * 3.999), 0, 3);
  const sp = hash(ix * 1.7 + 3, iy * 2.3 + 7);   /* 单像素噪点 */
  if (sp > .955) idx = clamp(idx + 1, 0, 3);
  else if (sp < .035) idx = clamp(idx - 1, 0, 3);
  return rgb(...ASPHALT[idx]);
}

/* 路缘石：比路面亮一档的窄石条。沿路方向每 ~1.6 世界单位一道接缝，
   和人行道的板缝对齐，整条路边看起来是一格一格的铺装。 */
function curbColor(x, y, ix, iy) {
  const r = distToRoad(x, y);
  const ph = (r.s / 1.6) % 1;
  if (ph < .13) return rgb(...CURB_LO);
  const u = noise(x * 2.4, y * 2.4) + (hash(ix, iy) - .5) * .5;
  return rgb(...(u > .48 ? CURB_HI : CURB_LO));
}

/* 人行道：浅灰石板。沿路方向每 ~1.6 世界单位一道板缝，
   缝用最暗一档，面用亮/暗两档交替 —— 读成一格格铺装，
   而不是一整条灰边。人行道较宽（.8 世界单位 ≈ 7px），
   才有空间放得下"路缘石 + 板缝 + 板面"三层。 */
function walkColor(x, y, ix, iy) {
  const r = distToRoad(x, y);
  const ph = (r.s / 1.6) % 1;
  if (ph < .13) return rgb(...WALK_SEAM);              /* 板缝 */
  const u = noise(x * 1.7, y * 1.7) * .55 + hash(ix, iy) * .45;
  return rgb(...(u > .58 ? WALK_HI : WALK_LO));
}

/* 落叶地面：LITTER 5 档，低频成块 + 高频颗粒。
   参考图是"金黄落叶铺满山丘"—— 整体亮、颗粒细。
   低频幅度必须小，否则读成大片脏污的云斑；亮度靠基色抬到 .68 拿到。
   e = 台地归一化半径：越靠近边缘越提亮，让边缘融进奶油色天空，
   而不是留下一圈暗色脏边。 */
function litterColor(x, y, ix, iy, e) {
  const lift = e > .85 ? (e - .85) / .17 * .22 : 0;   /* 边缘提亮 */
  const u = clamp(.68 + lift + (noise(x * .95, y * .95) - .5) * .55
    + (noise(x * 2.6, y * 2.6) - .5) * .34 + (hash(ix, iy) - .5) * .22, 0, 1);
  const idx = clamp(Math.floor(u * 4.999 + (bayerAt(ix, iy) - .5) * .5), 0, 4);
  return rgb(...LITTER[idx]);
}

/* ==================== 地面主函数 ==================== */

function groundColor(x, y, ix, iy) {
  const i = iy * W + ix;
  const r = distToRoad(x, y);
  const d = r.d, s = r.s;

  /* ---- 公路：沥青 → 路缘石 → 人行道（人工造物，硬边） ---- */
  const hw = ROAD.halfW, curbOut = hw + CURB_W, walkOut = curbOut + WALK_W;
  if (d < walkOut) {
    kinds[i] = KIND_NONE;                       /* 路上不长草 */
    if (d < hw) return asphaltColor(x, y, ix, iy, d, s);
    if (d < curbOut) return curbColor(x, y, ix, iy);
    return walkColor(x, y, ix, iy);
  }

  /* ---- 落叶台地（自然地貌，边缘抖动溶解） ---- */
  const e = hillE(x, y);
  if (e > 1.02) return 0;
  /* 溶解带：从 .94 到 1.02，越靠外越可能丢像素 —— 边缘是毛的、渐隐的。
     溶解只发生在很窄的一条带上（.94 起），并且用低频 clump 调制，
     让它"啃掉一块"而不是散成一堆孤立白点。 */
  if (e > .94) {
    const th = (e - .94) / .08;
    const clump = noise(ix * .22, iy * .22);
    if (hash(ix, iy) * (.30 + clump * 1.3) < th * .85) return 0;
  }
  /* 路肩留白：贴着路的窄条不铺地面（路和台地之间有段空地），
     空地宽度随位置变化（低频噪声），否则台地内缘是一条死板的直线。
     啃边用**低频**噪声为主：窄带里逐像素 hash 会变成椒盐脏点，
     频率必须低到能一次啃掉几个像素宽。 */
  if (d < walkOut + SHOULDER) {
    const gap = SHOULDER * (.6 + noise(x * .38, y * .38) * 1.0);
    if (d < walkOut + gap) {
      const bite = (walkOut + gap - d) / gap;
      const chunk = noise(ix * .16, iy * .16);
      if (hash(ix, iy) * (.45 + chunk * 1.35) < bite) return 0;
    }
  }
  kinds[i] = KIND_GRASS;
  return litterColor(x, y, ix, iy, e);
}

/* ==================== 烘焙 ==================== */
function bakeTerrain() {
  zb.fill(-1e9);
  pix.fill(SKY);
  ground.fill(0);
  kinds.fill(KIND_NONE);
  shadowMask.fill(0);

  for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
    const g = unproject(ix + .5, iy + .5), i = iy * W + ix;
    const c = groundColor(g.x, g.y, ix, iy);
    if (!c) continue;
    pix[i] = c;
    ground[i] = 1;
    zb[i] = (g.x + g.y) / R2 * COS;
  }
  groundZ.set(zb);      /* ← 必须立刻定格，后面物体才有正确深度 */
  return ground.reduce((a, b) => a + b, 0);
}

/* ==================== 落叶碎屑 ==================== */

function scatterLitter() {
  let placed = 0;
  /* 取样上限留足余量：一半以上取样点会落在留白或公路上被丢掉 */
  for (let n = 0; n < 24000 && placed < LITTER_COUNT; n++) {
    /* 沿路取样：s = 沿路弧长，d = 垂直于路的偏移 */
    const s = RD.sMid + (hash(n, 71) - .5) * 2 * HILL_HALF_LEN * 1.25;
    const d = (hash(n, 72) - .5) * 2 * HILL_HALF_HW * 1.25;
    const x = RD.ax + RD.ex * s + RD.nx * d;
    const y = RD.ay + RD.ey * s + RD.ny * d;

    const p = project(x, y, 0);
    const ix = p.sx | 0, iy = p.sy | 0;
    if (ix < 1 || iy < 1 || ix >= W - 2 || iy >= H - 2) continue;
    const i = iy * W + ix;
    if (!ground[i] || zb[i] !== groundZ[i]) continue;
    if (kinds[i] !== KIND_GRASS) continue;        /* 不撒到公路 / 人行道上 */

    const c = rgb(...LEAF_BITS[(hash(n, 73) * LEAF_BITS.length) | 0]);
    pix[i] = c;
    placed++;
    const shape = hash(n, 74);
    if (shape < .38) {                            /* 横向 2 像素 */
      const j = i + 1;
      if (kinds[j] === KIND_GRASS && zb[j] === groundZ[j]) pix[j] = c;
    } else if (shape < .54) {                     /* 纵向 2 像素 */
      const j = i - W;
      if (kinds[j] === KIND_GRASS && zb[j] === groundZ[j]) pix[j] = c;
    }
  }
  return placed;
}
