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
 * ★ 树海的树是**锥状树构件**（demo/kit/conifers.js）：
 *   远景 = 深橙 cone-spire 尖锥填缝，中近景 = 金黄 cone-mast 巨层塔当主角
 *   （参考图上半部是一棵棵独立的锥形塔，不是团块）。
 *   golden 参数随排的淡度变化：远排偏深橙（1-pale*.85），近排浓金黄。
 *   雾（applySceneHaze）负责"远排发白"的空气透视。
 *
 * 本模块负责两件事：
 *   1. 远景树海：把画面上半部填满层层退远的锥塔
 *   2. 空气透视：近浓远淡，色相收进橙红
 * ------------------------------------------------------------------ */

/* 远景树海：每一"排"是一层树，越远越小越淡
 *
 * ★ 等距投影里"远"不是 y 小，而是 **x+y 小**：
 *   屏幕 sy = OY + ((x+y)/R2*0.5 - z*0.866)*S
 *   → 树基在屏幕上方 ⟺ x+y 小。
 *   所以每一排用一个"屏幕高度"来定义，再反解成 x+y。
 */
const SEA_ROWS = [
  /* [屏幕y(树基), 树数, sizeK, 淡度, 巨塔比例]
   *   sizeK：height/crownR 的排缩放（远排塔小）。
   *   巨塔比例：hash < 比例 → cone-mast，否则 cone-spire。
   *   ★ 树数必须少（塔比旧团块大 3~4 倍，5~9 棵/排）：
   *   排密塔密会读作"列队贴图"，参考图的塔是错落的，
   *   塔间要露出深色的林底缝隙。 */
  [30, 4, .78, .74, .60],
  [58, 4, .80, .62, .62],
  [88, 4, .82, .50, .62],
  [120, 4, .84, .38, .65],
  [154, 4, .86, .26, .70],
  [190, 4, .90, .14, .70],
  [228, 4, .94, .05, .75],
  [268, 4, 1.0, 0, .80],
  [310, 4, 1.0, 0, .80],
  [355, 4, 1.0, 0, .75],
  [402, 4, 1.0, 0, .75],
  [452, 3, 1.0, 0, .70],
  [505, 3, 1.0, 0, .70],
  [560, 3, 1.0, 0, .70],
  [615, 3, 1.0, 0, .70],
];

/* 前景树海的起始屏幕高度：从这一排开始，树画在房子**前面** */
const SEA_SPLIT = 300;

/* 屏幕高度 → 世界 x+y 的和 */
function seaSumFor(screenY, z) {
  return ((screenY - OY) / (0.5 * S) + z * Math.sqrt(3) / 2) * R2;
}

/* ---------------- 避让 ---------------- */

/* 村庄避让区
 *
 * ★ 参考图实测：房子是**清晰可见的主角**，树在房子**边上**而不是盖住房子。
 *
 *   所以这里分两档：
 *   · 路面 + 人行道（d < halfW+2）：绝对空，车要开
 *   · 房子带（d < 12）：空，房子完整可见
 *   · 更外侧：放树，形成"树丛包围村子"
 *
 *   中间那条空带靠**近景树**（画在房子之后的那些排）来补，
 *   见 drawTreeSeaFore —— 它不受本函数限制。
 */
function seaClearsVillage(x, y) {
  const dx = ROAD.bx - ROAD.ax, dy = ROAD.by - ROAD.ay;
  const t = clamp(((x - ROAD.ax) * dx + (y - ROAD.ay) * dy) / (dx * dx + dy * dy), 0, 1);
  const px = ROAD.ax + dx * t, py = ROAD.ay + dy * t;
  const d = Math.hypot(x - px, y - py);
  if (d < ROAD.halfW + 2.0) return false;
  if (d < 12) return false;
  return true;
}

/* 树基是否落在**路面**上（在路面 + 极窄的路缘上也不长） */
function seaOnRoad(x, y) {
  const dx = ROAD.bx - ROAD.ax, dy = ROAD.by - ROAD.ay;
  const t = clamp(((x - ROAD.ax) * dx + (y - ROAD.ay) * dy) / (dx * dx + dy * dy), 0, 1);
  const px = ROAD.ax + dx * t, py = ROAD.ay + dy * t;
  return Math.hypot(x - px, y - py) < ROAD.halfW + .4;
}

/* 近景树专用：只在**路面**上让开，房子可以压。
   画在房子之后 → 近树会盖住房子一角（参考图的关键手法）。 */
function seaClearsRoadOnly(x, y) {
  return !seaOnRoad(x, y);
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

/* 村子带（房子所在处）：沿路参数 t 在 [0, 0.9] 且离路 < 10 → 不放近景树。
   这样近景树只出现在村子两侧和更远处，房子始终露得出来。 */
function seaClearsVillageBand(x, y) {
  const dx = ROAD.bx - ROAD.ax, dy = ROAD.by - ROAD.ay;
  const len2 = dx * dx + dy * dy;
  const t = ((x - ROAD.ax) * dx + (y - ROAD.ay) * dy) / len2;
  if (t < -.05 || t > .95) return true;              /* 村子范围外 */
  const px = ROAD.ax + dx * t, py = ROAD.ay + dy * t;
  return Math.hypot(x - px, y - py) >= 10;
}

/* 村子带在**屏幕**上的范围：房子大约落在 y 300~470。
   这一段的树海全部让开（无论远近），房子才能当主角。 */
const VILLAGE_SCREEN_Y0 = 300, VILLAGE_SCREEN_Y1 = 470;

function seaInVillageScreen(sx, sy) {
  return sy > VILLAGE_SCREEN_Y0 && sy < VILLAGE_SCREEN_Y1;
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
function drawTreeSeaRange(from, to, fore) {
  for (let ri = 0; ri < SEA_ROWS.length; ri++) {
    const row = SEA_ROWS[ri];
    if (row[0] < from || row[0] > to) continue;
    const [rowY, count, sizeK, pale, mast] = row;
    for (let k = 0; k < count; k++) {
      const seed = ri * 1000 + k;
      /* ★ 直接按**屏幕横坐标**布点：定住 (x-y) 横向位置就定了，
         深度用 (x+y) 控制 → 屏幕纵向位置。
         横向抖动 ±55px：塔要**错落**，均匀分布会读作列队贴图。 */
      const sx = -30 + (k + .5) / count * 360 + (hash(seed, 301) - .5) * 110;
      const dxy = (sx - OX) * R2 / S;          /* x - y */
      const sum = seaSumFor(rowY + (hash(seed, 302) - .5) * 22, 0);  /* x + y */
      const x = (sum + dxy) / 2, y = (sum - dxy) / 2;
      /* 远景树：完整避开村庄带（房子要露出来）
         近景树：只避开路面（可以压住房子一角 —— 参考图的关键手法） */
      if (fore ? !seaClearsRoadOnly(x, y) : !seaClearsVillage(x, y)) continue;
      if (seaOnRoad(x, y)) continue;

      /* ★ 村子在屏幕 y 300~470 的三分逻辑（保留自旧版）：
         · d ∈ [4.5, 9)：小尖锥填充树（稀一点，hash 概率 .5）
         · d ∈ [11, 15)：全尺寸巨塔（贴房子外侧，塔冠可压屋角）
         · 其余：跳过 —— 村子是林间空地，不是被塔围死的
         区间按锥塔冠幅重标定：small 冠外扩 ≈1.8、全尺寸 ≈7.4 世界单位，
         11 - 7.4 = 3.6 > 路半宽 2.4 → 不堵车行道。 */
      let small = false;
      const treeSy = project(x, y, 0).sy;
      if (seaInVillageScreen(sx, treeSy)) {
        const dx = ROAD.bx - ROAD.ax, dy = ROAD.by - ROAD.ay;
        const t = clamp(((x - ROAD.ax) * dx + (y - ROAD.ay) * dy) / (dx * dx + dy * dy), 0, 1);
        const px = ROAD.ax + dx * t, py = ROAD.ay + dy * t;
        const d = Math.hypot(x - px, y - py);
        if (d >= 4.5 && d < 9 && hash(seed, 349) < .2) small = true;
        else if (d < 4.5 || (d >= 9 && d < 11) || d >= 15) continue;
      }

      /* ---- 组装锥树实例（demo/kit/conifers.js） ---- */
      const sJ = .85 + hash(seed, 303) * .3;
      /* golden 随排淡度：远排深橙（雾再把它们漂白），近排浓金黄 */
      const gK = clamp(1 - pale * .72 + (hash(seed, 305) - .5) * .16, 0, 1);
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
      /* 近景排（fore）的巨塔给路让通道：冠心 (x, y, h*.55) 屏幕投影 */
      if (fore && !small && !seaClearsRoadCorridor(x, y, p.crownR, p.height)) continue;

      const o = { id: 'sea' + ri + '_' + k, kind, x, y, z: 0, rot: 0, params: p, seed };
      KIT.get(kind).draw(KIT_RENDER.makeCtx(o), o);
    }
  }
}

/* 画面最底部的"前景树冠带"
 *
 * ★ 参考图实测：画面最底部是**深橙红的近景树**（比主树海深两档），
 *   压住画面底边。树基在画布之外，只有冠/塔身伸进画面。
 *   用深橙 cone-mast（golden .1~.35），沿屏幕横坐标排开。
 */
function drawBottomCanopy() {
  const cols = 15;
  for (let k = 0; k < cols; k++) {
    const seed = 9000 + k;
    const sx = -20 + (k + .5) / cols * 340 + (hash(seed, 331) - .5) * 22;
    /* 树基在画面底部之下（画布外），塔身伸进画面 */
    const sy = 545 + (hash(seed, 332) - .5) * 36;
    const dxy = (sx - OX) * R2 / S;
    const sum = seaSumFor(sy, 0);
    const x = (sum + dxy) / 2, y = (sum - dxy) / 2;
    const h = 13 + hash(seed, 333) * 4, cr = 4.6 + hash(seed, 334) * 1.2;
    /* 底部巨塔会从下方盖住公路，必须给路让通道 */
    if (!seaClearsRoadCorridor(x, y, cr, h)) continue;
    const o = { id: 'bc' + k, kind: 'cone-mast', x, y, z: 0, rot: 0,
      params: { height: h, crownR: cr, layers: 5 + (hash(seed, 335) * 2 | 0),
                golden: .1 + hash(seed, 336) * .25, trunkV: .12 }, seed };
    KIT.get('cone-mast').draw(KIT_RENDER.makeCtx(o), o);
    /* 塔间补一个暗橙冠球，堵住露背景的缝 */
    if (k < cols - 1) {
      const sx2 = -20 + (k + 1) / cols * 340 + (hash(seed, 337) - .5) * 22;
      const sum2 = seaSumFor(sy + 14, 0);
      const x2 = (sum2 + (sx2 - OX) * R2 / S) / 2, y2 = (sum2 - (sx2 - OX) * R2 / S) / 2;
      if (seaClearsRoadCorridor(x2, y2, 3, h)) sphere(x2, y2, h * .5, 3.4, [188, 118, 32], 'flat');
    }
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

/* 林底色板：上半屏没有地形也没有塔的地方刷成"无尽远方的林"
 * —— 参考图从无背景露出，塔缝里永远是深浅不一的远处林色。
 * 在 drawTreeSea 开头调用：只刷 zb 仍为背景的像素，
 * 深度设 -1e7（比一切物体远，不挡任何东西）。
 * 色：顶部淡金（接近雾色，衔接空气透视）→ 底部浓金橙。 */
function paintForestFloor() {
  /* 排线暗化带：塔根附近的林底加深（树根阴影），塔底不悬空 */
  const rows = SEA_ROWS.map(r => r[0]).filter(y => y < SEA_SPLIT);
  for (let iy = 0; iy < SEA_SPLIT + 40; iy++) {
    const v = clamp(iy / SEA_SPLIT, 0, 1);
    let dark = 0;
    for (const ry of rows) {
      const d = Math.abs(iy - ry);
      if (d < 9) dark = Math.max(dark, (1 - d / 9) * .14);
    }
    const c = rgb(Math.round(lerp(246, 226, v) * (1 - dark)),
                  Math.round(lerp(208, 162, v) * (1 - dark)),
                  Math.round(lerp(80, 50, v) * (1 - dark)));
    for (let ix = 0; ix < W; ix++) {
      const i = iy * W + ix;
      if (zb[i] < -1e8) { pix[i] = c; zb[i] = -1e7; }
    }
  }
}

/* 远景树海（房子之前）—— 只画 SEA_SPLIT 以上的排 */
function drawTreeSea() { paintForestFloor(); drawTreeSeaRange(0, SEA_SPLIT, false); drawLandmarkTower(); }

/* 近景树海（房子之后，压住房子一角） */
function drawTreeSeaFore() { drawTreeSeaRange(SEA_SPLIT, 9999, true); }

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
      const c = pix[i];
      const r = c & 255, g = c >> 8 & 255, b = c >> 16 & 255;
      pix[i] = rgb(lerp(r, hr, amt), lerp(g, hg, amt), lerp(b, hb, amt));
    }
  }
}
