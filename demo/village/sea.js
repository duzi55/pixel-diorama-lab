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
 * 本模块负责两件事：
 *   1. 远景树海：把画面上半部填满层层退远的树
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
  /* [屏幕y(树基), 树数, 缩放, 淡度, 针叶倾向] —— 屏幕y 越小越远 */
  /* ★ 树冠尺寸（tools/measure-blobs.mjs 实测参考图）：
  *   参考图树冠团块占画面宽 9%~14%，且**远近几乎一样大** ——
  *   远景靠**褪色**（空气透视）区分，不靠缩小。
  *   我的 s 从 .44 到 1.68（差 3.8 倍），远景冠只有 3% 画布宽 → 全是碎粒。
  *   → s 收窄到 .95~1.55（1.6 倍），远景树也有 12% 冠宽。
  * ★ 冠高(屏幕) = 6.2*s*0.866*9 = 48*s，排距必须 < 48*s，
  *   所以排距也要跟着收紧（24~40px）。
  * ★ 针叶只在**左上角远景**有几棵（参考图实测），其余全是阔叶。 */
  [30, 40, .95, .74, .30],
  [52, 40, .98, .64, .18],
  [76, 40, 1.01, .53, .08],
  [102, 40, 1.04, .42, .04],
  [130, 40, 1.07, .31, .02],
  [160, 40, 1.10, .21, .00],
  [192, 40, 1.13, .12, .00],
  [226, 39, 1.16, .05, .00],
  [262, 38, 1.19, .00, .00],
  [300, 36, 1.22, .00, .00],
  [340, 33, 1.26, .00, .00],
  [382, 30, 1.30, .00, .00],
  [426, 27, 1.34, .00, .00],
  [472, 24, 1.39, .00, .00],
  [520, 21, 1.44, .00, .00],
  [570, 18, 1.49, .00, .00],
  [625, 16, 1.55, .00, .00],
];

/* 前景树海的起始屏幕高度：从这一排开始，树画在房子**前面** */
const SEA_SPLIT = 300;

/* 屏幕高度 → 世界 x+y 的和 */
function seaSumFor(screenY, z) {
  return ((screenY - OY) / (0.5 * S) + z * Math.sqrt(3) / 2) * R2;
}

/* 远景树的颜色：越远越接近雾色 */
function seaLeafColor(row, k) {
  /* row 越靠前（越远）→ 越淡 */
  const pale = row[3];
  /* 参考图实测：树冠主体是**金黄**（高饱和），不是褐。
     远处偏黄橙（空气透视），近处是浓金黄。 */
  const t = row[4] > .35 ? 1 : 0;          /* 针叶偏橙，阔叶偏金黄 */
  /* ★ 参考图实测的树冠基色：浓金黄 (250,196,40)，
     不是橙色。橙色是雾和远景才有的。 */
  const base = t ? [242, 158, 44] : [250, 198, 38];
  const c = [
    lerp(base[0], 250, pale),
    lerp(base[1], 202, pale),
    lerp(base[2], 44, pale),
  ];
  /* 每棵树有一点色差，避免整排一个色。
     ★ 必须取整并 clamp 到 0..255：jitter 可能把分量推过 255，
       sphere() → rampOf() 会对基色做范围校验，浮点越界直接抛错。 */
  const j = (hash(k, 311) - .5) * 20;
  return [
    clamp(Math.round(c[0] + j), 0, 255),
    clamp(Math.round(c[1] + j * .55), 0, 255),
    clamp(Math.round(c[2] + j * .25), 0, 255),
  ];
}

/* ---------------- 远景树海 ----------------
 * 树海在**地形之后**画（地形会清空 pix），但必须画在村庄物体之下。
 * 深度缓冲天然处理这个：树海的世界坐标 x+y 很小 → 深度小 → 会被
 * 前景的村庄物体（x+y 大，深度大）覆盖。
 *
 * 所以调用顺序：bakeTerrain() → drawTreeSea() → 村庄物体。
 */

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
   近景树画在所有东西之后，会把路和车完全挡住。
   判据：树冠的投影范围不能压到路面。
   树冠半径 ≈ 2.35*s（世界单位），投影到屏幕后横向跨度 ≈ 2*2.35*s*S/R2。
   这里用保守的"树基离路距离 > 冠幅"来判定。 */
function seaClearsRoadCorridor(x, y, s) {
  /* ★ 在**屏幕空间**判定，不能用世界垂直距离：
   *   冠立在地面之上（冠心高 6.2*s*0.8 世界单位 → 投影后比基点高
   *   6.2*s*0.8*0.866*S ≈ 39*s px），冠的屏幕半径还有 cr*1.53*S ≈ 39*s px。
   *   世界垂直距离 9.7 单位只对应 48px 屏幕距离，而冠的屏幕半径就有
   *   ~60px —— 世界距离判据必然漏。屏幕空间一锤定音。 */
  const cr = 2.85 * s;
  const zc = 6.2 * s * .8;
  const c = project(x, y, zc);
  const crownR = cr * 1.53 * S;                       // 冠的屏幕半径
  const roadHalfPx = ROAD.halfW * S * .5;             // 路面的屏幕半宽（近似）
  /* 路中心线的屏幕直线（terrain.js 的 ROAD 两端点投影） */
  const A = project(ROAD.ax, ROAD.ay, 0), B = project(ROAD.bx, ROAD.by, 0);
  const vx = B.sx - A.sx, vy = B.sy - A.sy;
  const t = clamp(((c.sx - A.sx) * vx + (c.sy - A.sy) * vy) / (vx * vx + vy * vy), 0, 1);
  const dxl = c.sx - (A.sx + vx * t), dyl = c.sy - (A.sy + vy * t);
  return Math.hypot(dxl, dyl) > crownR + roadHalfPx;
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
    const [, count, scale, pale, pine] = row;
    /* ★ 本排的轮廓线，画完本排所有树冠后立刻描。
       否则轮廓的下半截会被同排后面的树盖掉 → 轮廓只剩半截。
       参考图的每棵树冠轮廓都是完整闭合的。 */
    const rowOutlines = [];
    for (let k = 0; k < count; k++) {
      const seed = ri * 1000 + k;
      /* ★ 直接按**屏幕横坐标**布点。
       * 等距投影 sx = OX + (x-y)/R2*S → 只要定住 (x-y)，
       * 树的水平位置就确定了，不会跑到画布外。
       * 深度用 (x+y) 控制 → 屏幕纵向位置。
       */
      const sx = -30 + (k + .5) / count * 360 + (hash(seed, 301) - .5) * 30;
      const dxy = (sx - OX) * R2 / S;          /* x - y */
      const sum = seaSumFor(row[0] + (hash(seed, 302) - .5) * 22, 0);  /* x + y */
      const x = (sum + dxy) / 2, y = (sum - dxy) / 2;
      /* 远景树：完整避开村庄带（房子要露出来）
         近景树：只避开路面（可以压住房子一角 —— 参考图的关键手法） */
      if (fore ? !seaClearsRoadOnly(x, y) : !seaClearsVillage(x, y)) continue;
      /* ★ 路面避让带在屏幕上是一条斜白带（很突兀）。
         允许树长到**路缘**（halfW + 0.4），只在路面上不长 ——
         参考图里树丛是紧贴路缘的，路边没有空白。 */
      if (seaOnRoad(x, y)) continue;
      /* ★ 近景树（画在村庄之后）必须给路让出通道，
         否则会把路和行驶中的车完全挡住。 */
      if (fore && !seaClearsRoadCorridor(x, y, scale)) continue;
      /* 近景树还要避开"房子所在的带"，否则近处的树会把村子整个埋掉。
         判定用"沿路参数"：房子在 t 0.04~0.84、lat ±6~8.6。
         树在 lat 方向离路 < 6 且 t 在村子范围内 → 跳过。 */
      if (fore && !seaClearsVillageBand(x, y)) continue;
      /* ★ 村子在屏幕 y 300~470 —— 这一段要让开，否则树会把房子完全埋掉。
         但不能整条留白（参考图那里是树与房子交错的）。
         ★ 用**树的实际投影位置**判断，不是排的基准值。
         做法：村子带内的树分三类——
           · 离路 9~14：正常大小的树，贴在房子外侧
           · 离路 5~9：小一号冠幅的填充树，填掉空白但不遮房子
           · 离路 < 5：路肩 → 不长（车和路要露出来）
         这就是参考图"树与房子交错"的具体做法。 */
      let small = false;
      const treeSy = project(x, y, 0).sy;
      if (seaInVillageScreen(sx, treeSy)) {
        const dx = ROAD.bx - ROAD.ax, dy = ROAD.by - ROAD.ay;
        const t = clamp(((x - ROAD.ax) * dx + (y - ROAD.ay) * dy) / (dx * dx + dy * dy), 0, 1);
        const px = ROAD.ax + dx * t, py = ROAD.ay + dy * t;
        const d = Math.hypot(x - px, y - py);
        /* ★ 保留区间按冠幅实测重新标定：
         *   全尺寸树冠外扩 = 2.85 × s × 1.53 ≈ 7 世界单位（s 抖到 1.6 时）。
         *   d ∈ [9,14) 的树冠会伸到 d ≈ 2.4 —— 正好压住车道。
         *   → 小树 d ∈ [5,9)；全尺寸树 d ∈ [11.5,14)；其余跳过。 */
        if (d >= 5 && d < 9 && hash(seed, 349) < .7) small = true;
        else if (d < 5 || (d >= 9 && d < 11.5) || d >= 14) continue;
      }
      /* 树基可以落在台地外 —— 参考图是竖幅远景，地面延伸出画布很常见，
         画面外的东西只要冠部可见就行。
         不加台地限制：否则会把树全滤掉（台地半宽只有 13 个世界单位）。
         树干短且被树冠遮住，不会露出悬空的杆。 */
      const s = scale * (.85 + hash(seed, 303) * .35);
      const c = seaLeafColor(row, seed);

      if (pine > .3 && hash(seed, 304) < pine) {
        /* 针叶：窄锥形塔
         *
         * ★ 参考图实测：针叶树是**细而高**的窄锥（不是宽圣诞树），
         *   轮廓由很多细枝条组成，底部略宽、顶尖。
         *   做法：每层沿圆周排 9 点，半径二次收缩，层数多而每层薄。
         */
        const h = 9.5 * s, r = 1.9 * s;
        for (let i = 0; i < 11; i++) {
          const u = i / 11;
          const rr = r * (1 - u * .92) * (1 + .1 * Math.sin(u * 9));
          const z = h * (.10 + u * .90);
          /* 每层越往上越亮（参考图：底暗顶亮） */
          const lv = clamp(1 + Math.floor(u * 3.4), 0, 4);
          const cc = [
            lerp(c[0], NEEDLE[lv][0], .55),
            lerp(c[1], NEEDLE[lv][1], .55),
            lerp(c[2], NEEDLE[lv][2], .55),
          ];
          /* 内层：填体积，堵住漏光 */
          sphere(x, y, z, rr * .62, cc, 'rough');
          /* 外圈枝条：定轮廓 */
          for (let m = 0; m < 9; m++) {
            const a = m / 9 * 6.283 + hash(seed + i, 305) * .5 + i * .3;
            sphere(x + Math.cos(a) * rr * .72, y + Math.sin(a) * rr * .72, z,
              rr * .38, cc, 'rough');
          }
        }
        /* 顶尖 */
        sphere(x, y, h * 1.02, r * .16, NEEDLE[4], 'rough');
      } else {
        /* 阔叶：核心 + 10 簇
         *
         * ★ 参考图 3× 放大实测的四个关键特征：
         *   1. 树冠是**扁平的团块**（像剪纸/云朵），不是球
         *   2. 内部是**平涂的金黄**，几乎没有明暗渐变
         *      → 用 'flat' 模式（固定基色），不要球体光照
         *   3. 边缘有**细的深色描边**
         *   4. 冠内有稀疏的**深色小点**（透出的树枝）
         *
         *   等距投影下树冠竖向要压扁，否则读作"葡萄串"。
         */
        const FLAT = .70;
        /* 村子带的填充树用小一号冠幅 */
        /* ★ 冠幅：参考图实测树冠团块占画面宽 9%~14%。
           冠的屏幕宽 ≈ 2*cr*s/R2*S = 2*cr*s/√2*9。
           要 12%（36px，s=1.0）→ cr = 36*√2/(2*9*1.0) = 2.83。
           原来的 2.35 只到 10%，且远景树更小 → 树冠碎、露背景。 */
        const h = 6.2 * s, cr = (small ? 1.5 : 2.85) * s;
        const zc = h * .80;
        const gold = seaLeafColor(row, seed);
        /* ① 平涂主体：核心 + 12 簇（簇更大 → 树冠连成一片） */
        sphere(x, y, zc, cr * .58, gold, 'flat');
        for (let i = 0; i < 12; i++) {
          const a = i / 12 * 6.283 + hash(seed, 306) * 1.2;
          const d = Math.cbrt(hash(seed + i, 307)) * cr * 1.0;
          const z = zc + (hash(seed + i, 308) - .5) * cr * .62 * FLAT;
          sphere(x + Math.cos(a) * d, y + Math.sin(a) * d, z,
            cr * (.30 + hash(seed + i, 309) * .18), gold, 'flat');
        }
        /* ② 描边：★ 用**参数化闭合曲线**画连续的深色轮廓。
         *
         *   不用球体 rim 的原因：球在屏幕上是圆，圆周像素不连续，
         *   rim 环带会碎成虚线。参考图的树冠轮廓是连续的云朵线。
         *   → 直接算轮廓点：半径按低频噪声起伏，竖向压扁。
         *   轮廓存进 rowOutlines，等本排画完统一描（见外层注释）。
         */
        const edge = [Math.round(c[0] * .24), Math.round(c[1] * .17), Math.round(c[2] * .13)];
        const outline = [];
        const ON = 40;
        for (let i = 0; i < ON; i++) {
          const a = i / ON * 6.283;
          /* 半径起伏：三个不同频率的正弦叠加 → 云朵状的参差边缘 */
          const wob = 1
            + .13 * Math.sin(a * 3 + seed * .7)
            + .08 * Math.sin(a * 7 + seed * 1.3)
            + .05 * Math.sin(a * 13 + seed * 2.1);
          const rr = cr * 1.02 * wob;
          outline.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr, zc + Math.sin(a * 2 + seed) * cr * .10]);
        }
        rowOutlines.push({
          pts: outline,
          color: rgb(edge[0], edge[1], edge[2]),
          /* 冠心深度：这棵树的深度基准。轮廓用它参与深度竞争，
             这样同层树互不遮挡，后排的树能盖住前排的轮廓。 */
          depth: project(x, y, zc).d,
        });
        /* ③ 冠内深色小点：透出的树枝（参考图特征） */
        for (let i = 0; i < 5; i++) {
          const a = hash(seed + i, 341) * 6.283;
          const d = Math.cbrt(hash(seed + i, 342)) * cr * .7;
          const z = zc + (hash(seed + i, 343) - .5) * cr * .5 * FLAT;
          sphere(x + Math.cos(a) * d, y + Math.sin(a) * d, z,
            cr * .06, [c[0] * .34, c[1] * .26, c[2] * .18], 'flat');
        }
        /* ④ 树干：深褐色竖条，从冠中穿出（参考图里很明显） */
        const barkC = [lerp(BARK[0], 236, pale * .7), lerp(BARK[1], 196, pale * .7), lerp(BARK[2], 118, pale * .7)];
        for (let i = 0; i < 3; i++) {
          const a = hash(seed + i, 321) * 6.283;
          sphere(x + Math.cos(a) * .16 * s, y + Math.sin(a) * .16 * s, zc * (.34 + i * .07),
            .16 * s, barkC, 'rough');
        }
      }
    }
    /* ★ 本排画完，统一描轮廓。
       这样每棵树的轮廓都是完整的（不会被同排后面的树切掉下半截），
       而下一排的树又会盖住本排轮廓的上半部分 → 形成层叠关系。 */
    for (const o of rowOutlines) strokePath(o.pts, o.color, o.depth);
  }
}

/* 画面最底部的"前景树冠带"
 *
 * ★ 参考图实测：画面最底部是**近处的树冠**（不是地面、不是留白）。
 *   这些树离镜头很近，树基在画布之外，只有冠部伸进画面。
 *
 *   所以这里不按"屏幕高度排"来布点，而是直接在画面底部铺一条树冠带：
 *   沿屏幕横坐标排若干列，每列一个冠心，冠子足够大 → 铺满底部。
 */
function drawBottomCanopy() {
  const cols = 26;
  for (let k = 0; k < cols; k++) {
    const seed = 9000 + k;
    const sx = -24 + (k + .5) / cols * 348 + (hash(seed, 331) - .5) * 18;
    /* 冠心在画面底部往上一点 */
    const sy = 566 + (hash(seed, 332) - .5) * 40;
    const dxy = (sx - OX) * R2 / S;
    const sum = seaSumFor(sy, 0);
    const x = (sum + dxy) / 2, y = (sum - dxy) / 2;
    /* ★ 底部巨冠（s≈2.3）的冠幅很大，会从下方盖住公路。
        必须给路让通道：离路 > halfW + 冠幅。 */
    if (!seaClearsRoadCorridor(x, y, 2.3)) continue;
    const s = 2.1 + hash(seed, 333) * .5;
    const cr = 1.05 * s, zc = 4.6 * s;
    /* ★ 参考图画面最底部是**深橙红**的近景树（比主树海深两档），
       压住画面底边。主树海是金黄，底部树冠用深橙做前景框。 */
    const c = [206 + (hash(seed, 334) - .5) * 16, 128 + (hash(seed, 334) - .5) * 12, 32];

    /* 冠：核心 + 10 簇 + 26 表层，与主树海同一套画法 */
    sphere(x, y, zc, cr * .62, c, 'solid');
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * 6.283 + hash(seed, 306) * 1.2;
      const d = Math.cbrt(hash(seed + i, 307)) * cr * 1.05;
      const z = zc + (hash(seed + i, 308) - .5) * cr * .9;
      sphere(x + Math.cos(a) * d, y + Math.sin(a) * d, z,
        cr * (.34 + hash(seed + i, 309) * .20), c, 'solid');
    }
    for (let i = 0; i < 26; i++) {
      const a = hash(seed + i, 335) * 6.283;
      const tilt = hash(seed + i, 336) * 2 - 1;
      const d = Math.cbrt(hash(seed + i, 337)) * cr * 1.18;
      const flat = Math.sqrt(1 - tilt * tilt);
      const z = zc + tilt * d * .43;
      sphere(x + Math.cos(a) * flat * d, y + Math.sin(a) * flat * d, z,
        cr * (.13 + hash(seed + i, 338) * .11), c, 'solid');
    }
    /* 勾边 */
    const edge = [c[0] * .52, c[1] * .40, c[2] * .28];
    sphere(x, y, zc, cr * .64, edge, 'rim');
  }
}

/* 远景树海（房子之前）—— 只画 SEA_SPLIT 以上的排 */
function drawTreeSea() { drawTreeSeaRange(0, SEA_SPLIT, false); }

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
