'use strict';
/* ------------------------------------------------------------------
 * 远景树海 · 空气透视
 *
 * 参考图的真相（tools/measure-haze.mjs 实测）：
 *   橙色占 86.4%，绿色 0%，蓝色 0% → **整幅画没有天空**，
 *   从顶到底都是层叠的秋色树海，只有右下角一小块淡色是留白。
 *
 *   逐行梯度（从上到下）：
 *     顶部  明度 240  饱和度 .80   ← 最淡最灰
 *     中段  明度 166  饱和度 .58   ← 最淡点
 *     底部  明度 200  饱和度 .93   ← 最浓最艳
 *
 * 所以"远"不是画得小，而是画得**淡、画得灰**。
 *
 * ★ 树是**锥状树构件**（demo/kit/conifers.js）：
 *   中景金黄 cone-mast 巨塔是主体，远排向背景色晕开（fade 参数）。
 *
 * ★ 构图（用户明确要求，第四版结论）：
 *   · 画布背景 = 纯色（SKY = 页面纸色），没有元素的地方直接留白
 *   · 树 = 完整的树（高矮不一、实心），树林靠排数/尺寸自然结束，
 *     **禁止**人为淡出、缩小、包络裁切、碎点晕开层（全部试过，全被否决）
 *   · 树脚下必须有地形（台地覆盖塔群范围）
 *   · 超出画布的树完整绘制（画布只是窗口）
 * ------------------------------------------------------------------ */

/* 远景树海：每一"排"是一层树，越远越小越淡
 *
 * ★ 等距投影里"远"不是 y 小，而是 **x+y 小**：
 *   屏幕 sy = OY + ((x+y)/R2*0.5 - z*0.866)*S
 *   → 树基在屏幕上方 ⟺ x+y 小。
 *   所以每一排用一个"屏幕高度"来定义，再反解成 x+y。
 */
const SEA_ROWS = [
  /* [k 沿路偏移(相对台地中心 sMid), 每排树数, sizeK, 巨塔比例]
   * ★ 布点用**路轴世界坐标**（s,d），与台地（terrain.js hillE）同一坐标系
   *   —— 树脚下必有地形。旧版"屏幕横坐标反解世界点"是错的：
   *   等距投影里画布水平线对应世界对角线，横向世界点会斜穿出台地
   *   （d≈107 ≫ 台地半宽 30）→ 塔悬空在纯色背景上。
   *   k=-89（画面上部）→ k=+9（村子下缘），Δk≈14 ≈ 屏幕 44px。
   *   树 = 完整的树（高矮不一），树林靠排数自然结束。 */
  [-89, 5, .82, .70],
  [-75, 5, .90, .75],
  [-61, 5, .95, .80],
  [-47, 5, 1.0, .80],
  [-33, 4, 1.0, .75],
  [-19, 4, 1.0, .70],
  [-5, 4, 1.0, .70],
  [9, 4, 1.0, .65],
];

/* 近景排的起始 k：k ≥ SEA_FORE_FROM 的排画在房子**前面** */
const SEA_FORE_FROM = -33;

/* ---------------- 避让 ---------------- */

/* 树基是否落在**路面**上（在路面 + 极窄的路缘上也不长） */
function seaOnRoad(x, y) {
  const dx = ROAD.bx - ROAD.ax, dy = ROAD.by - ROAD.ay;
  const t = clamp(((x - ROAD.ax) * dx + (y - ROAD.ay) * dy) / (dx * dx + dy * dy), 0, 1);
  const px = ROAD.ax + dx * t, py = ROAD.ay + dy * t;
  return Math.hypot(x - px, y - py) < ROAD.halfW + .4;
}

/* ★ 近景树必须给**路**让出通道。
   判据在**屏幕空间**：冠心 (x,y,zc) 投影点与路中心线段的像素距离
   > 冠的屏幕半径 + 路面半宽。
   ★ 不能用世界垂直距离：冠立在地面之上，投影后比基点高几十 px，
     世界距离判据必然漏（坑见 docs/kit/depth-and-haze.md）。
   ★ 锥塔冠的屏幕外扩保守取 1.35×crownR：实测 1.1 时塔身下部
     仍会扫到路缘（塔不是圆，下部宽 + 融合波动）。 */
function seaClearsRoadCorridor(x, y, crownR, h) {
  const crownRpx = crownR * 1.35 * S;
  const roadHalfPx = ROAD.halfW * S;   // 路面屏幕半宽（4.8 世界宽 × S/√2×√2 → halfW×S）
  const A = project(ROAD.ax, ROAD.ay, 0), B = project(ROAD.bx, ROAD.by, 0);
  const vx = B.sx - A.sx, vy = B.sy - A.sy, v2 = vx * vx + vy * vy;
  /* ★ 塔是竖长的，单点判定防不住"塔基在路外、塔身横跨路"——
     对塔身下/中/上三个高度都测，任一点扫到路就砍 */
  for (const f of [.15, .45, .75]) {
    const c = project(x, y, h * f);
    const t = clamp(((c.sx - A.sx) * vx + (c.sy - A.sy) * vy) / v2, 0, 1);
    const dxl = c.sx - (A.sx + vx * t), dyl = c.sy - (A.sy + vy * t);
    if (Math.hypot(dxl, dyl) <= crownRpx + roadHalfPx) return false;
  }
  return true;
}

/* ---------------- 树海绘制 ----------------
 *
 * 树海在**地形之后**画（地形会清空 pix），但必须画在村庄物体之下。
 * 深度缓冲天然处理这个：树海的世界坐标 x+y 很小 → 深度小 → 会被
 * 前景的村庄物体（x+y 大，深度大）覆盖。
 *
 * 调用顺序：bakeTerrain() → drawTreeSea() → 村庄物体。
 */

/* 画远景树海：只画屏幕高度在 from..to 之间的排
 *
 * 分两批画的意义：参考图里**树压在房子前面**。
 *   远景树（屏幕靠上）先画 → 房子盖在它上面 → 树在房子后面
 *   近景树（屏幕靠下）后画 → 盖住房子一角 → 树在房子前面
 * 这样同一片树海自然分出前后景。
 */
/* 画树海：只画 k 在 fromK..toK 之间的排
 *
 * 分两批画的意义：参考图里**树压在房子前面**。
 *   远景排（k 小）先画 → 房子盖在它上面 → 树在房子后面
 *   近景排（k 大）后画 → 盖住房子一角 → 树在房子前面
 */
function drawTreeSeaRange(fromK, toK, fore) {
  for (let ri = 0; ri < SEA_ROWS.length; ri++) {
    const row = SEA_ROWS[ri];
    if (row[0] < fromK || row[0] > toK) continue;
    const [kk, count, sizeK, mast] = row;
    for (let k = 0; k < count; k++) {
      const seed = ri * 1000 + k;
      /* ★ 世界坐标布点（路轴 s,d）—— 与台地同一坐标系 → 树脚下必有地形。
         d ∈ [-15, 15]：台地法向半宽 30 内留边；负侧台地较窄（hillE side .76），
         所以负向只到 -15。 */
      const sw = RD.sMid + kk + (hash(seed, 301) - .5) * 10;
      const d = -15 + (k + .5) / count * 30 + (hash(seed, 302) - .5) * 8;
      const x = RD.ax + RD.ex * sw + RD.nx * d;
      const y = RD.ay + RD.ey * sw + RD.ny * d;
      if (seaOnRoad(x, y)) continue;

      /* 村子带（世界距离，直接可靠）：
         · |d| ∈ [4.5, 9)：小尖锥填充（hash 概率 .2）
         · |d| ∈ [9, 11)：跳过（房子主角带）
         · |d| ∈ [11, 15)：全尺寸巨塔贴房外（冠外扩 7.4 → 冠缘 3.6 > 路半宽）
         · 其余跳过 */
      const ad = Math.abs(d);
      let small = false;
      if (ad < 4.5) continue;
      if (ad < 9) { if (hash(seed, 349) < .2) small = true; else continue; }
      else if (ad < 11) continue;

      /* ---- 组装锥树实例（demo/kit/conifers.js） ---- */
      const sJ = .85 + hash(seed, 303) * .3;
      /* 浓金黄主色（每棵 ±.08 微差） */
      const gK = clamp(.92 + (hash(seed, 305) - .5) * .16, 0, 1);
      let kind, p;
      if (small) {
        kind = 'cone-spire';
        p = { height: 4.5 + hash(seed, 306) * 1.5, crownR: 1.2 + hash(seed, 307) * .4,
              rows: 6, golden: .85 };
      } else if (hash(seed, 304) < mast) {
        kind = 'cone-mast';
        p = { height: 22 * sizeK * sJ,
              crownR: 5.2 * sizeK * (.9 + hash(seed, 308) * .2),
              layers: 5 + (hash(seed, 309) * 3 | 0),
              golden: gK,
              trunkV: .13 + hash(seed, 310) * .05 };
      } else {
        kind = 'cone-spire';
        p = { height: 10.5 * sizeK * sJ,
              crownR: 2.4 * sizeK * (.9 + hash(seed, 308) * .2),
              rows: 7 + (hash(seed, 309) * 4 | 0),
              golden: gK };
      }
      /* 近景排（fore）的巨塔给路让通道：塔身三高度屏幕采样 */
      if (fore && !small && !seaClearsRoadCorridor(x, y, p.crownR, p.height)) continue;

      const o = { id: 'sea' + ri + '_' + k, kind, x, y, z: 0, rot: 0, params: p, seed };
      KIT.get(kind).draw(KIT_RENDER.makeCtx(o), o);
    }
  }
}

/* 画面最底部的"前景树冠带"
 *
 * ★ 深橙近景树（golden .1~.35）压住画面底边，树基在画布下方之外。
 *   同样用路轴世界坐标布点（与台地同系 → 树脚下有地形）：
 *   k ≈ +40（台地近端），d 在路两侧 ±(9~20)。
 */
function drawBottomCanopy() {
  const cols = 7;
  for (let k = 0; k < cols; k++) {
    const seed = 9000 + k;
    const sw = RD.sMid + 40 + (hash(seed, 332) - .5) * 16;
    const side = k % 2 === 0 ? 1 : -1;
    const d = side * (9 + (k / cols) * 11 + hash(seed, 331) * 2);
    const x = RD.ax + RD.ex * sw + RD.nx * d;
    const y = RD.ay + RD.ey * sw + RD.ny * d;
    const h = 13 + hash(seed, 333) * 4, cr = 4.6 + hash(seed, 334) * 1.2;
    /* 底部巨塔会从下方盖住公路，必须给路让通道 */
    if (!seaClearsRoadCorridor(x, y, cr, h)) continue;
    const o = { id: 'bc' + k, kind: 'cone-mast', x, y, z: 0, rot: 0,
      params: { height: h, crownR: cr, layers: 5 + (hash(seed, 335) * 2 | 0),
                golden: .1 + hash(seed, 336) * .25, trunkV: .12 }, seed };
    KIT.get('cone-mast').draw(KIT_RENDER.makeCtx(o), o);
  }
}

/* 中央标志性巨塔：参考图村子中央有一棵超大金黄塔
 * （比周围树高出一大截，塔冠盖住部分屋顶），
 * 立在苔藓大木屋的左后方。塔基 d≈14.5（房子带外侧）→
 * 深度小于房子，下缘自动被前排屋体遮住。
 */
/* 中央标志性巨塔：参考图村子中央有一棵超大金黄塔
 * （比周围树高出一大截，塔冠在屋后高耸），
 * 立在苔藓大木屋（t .70, lat 7.5）的左后方。
 * ★ 深度账（sum = x+y，等距深度）：巨塔 sum ≈ 44.9 <
 *   苔藓屋 sum ≈ 50.7 → 屋体盖住塔的下缘，塔冠在屋后露出。
 *   放更前排（sum 更大）会反过来把房子盖掉。
 */
function drawLandmarkTower() {
  const dx = ROAD.bx - ROAD.ax, dy = ROAD.by - ROAD.ay, L = Math.hypot(dx, dy);
  const t = .52, lat = 9;
  const x = ROAD.ax + dx * t + dy / L * lat, y = ROAD.ay + dy * t - dx / L * lat;
  const o = { id: 'landmark', kind: 'cone-mast', x, y, z: 0, rot: 0,
    params: { height: 30, crownR: 7.5, layers: 7, golden: 1, trunkV: .10 }, seed: 777 };
  KIT.get('cone-mast').draw(KIT_RENDER.makeCtx(o), o);
}

/* 远景树海（房子之前）—— 只画 SEA_FORE_FROM 以上的排 */
function drawTreeSea() { drawTreeSeaRange(-999, SEA_FORE_FROM - 1, false); drawLandmarkTower(); }

/* 近景树海（房子之后，压住房子一角） */
function drawTreeSeaFore() { drawTreeSeaRange(SEA_FORE_FROM, 9999, true); }

/* ---------------- 空气透视调色 ---------------- */

/* 开启雾：远处的东西往雾色靠
 * near/far 是"距离"阈值，max 是最大雾量 */
function setupHaze() {
  setHaze(HAZE, 14, 52, .55);
}

/* 把整幅画面按纵向做一次雾化：画面上方（远）更淡。
 * 这是参考图那种"整片秋色泛白"观感的来源。
 * 必须在所有物体画完之后、描边之前调用。
 *
 * ★ 实测调参：参考图饱和度是 .80~.87（很高），
 *   雾量超过 .30 就会把画面冲淡成灰白。所以上限压到 .30。 */
function applySceneHaze(refZ) {
  if (!hazeColor) return;
  const hr = hazeColor & 255, hg = hazeColor >> 8 & 255, hb = hazeColor >> 16 & 255;
  for (let iy = 0; iy < H; iy++) {
    /* 画面上方雾更重：0% 高 → 1.0，100% 高 → 0.0 */
    const v = 1 - iy / H;
    /* 雾量曲线：上半部分明显，中段最浓，下半部分几乎没有 */
    const amt = Math.pow(clamp(v * 1.35 - .12, 0, 1), 1.5) * .30;
    if (amt < .004) continue;
    for (let ix = 0; ix < W; ix++) {
      const i = iy * W + ix;
      /* ★ 背景像素（zb=-1e9）不雾化：留白必须保持纯 SKY（=页面纸色），
         否则 canvas 上部被雾染成橙黄渐变 → 读作一个"方框"贴在页面上 */
      if (zb[i] < -1e8) continue;
      const c = pix[i];
      const r = c & 255, g = c >> 8 & 255, b = c >> 16 & 255;
      pix[i] = rgb(lerp(r, hr, amt), lerp(g, hg, amt), lerp(b, hb, amt));
    }
  }
}
