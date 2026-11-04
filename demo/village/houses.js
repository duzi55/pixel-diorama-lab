'use strict';
/* ------------------------------------------------------------------
 * 秋日山村 · 木屋建筑
 *
 * 参考：docs/kit/buildings.md §2 house · §5 pitched-roof · §5b wood-house
 *       docs/kit/structures.md §1.4 木纹墙 · §2 体积阴影
 *
 * 墙 = 木板拼缝（不是砖石）。正面 = y1 面（亮），侧面 = x1 面（暗）。
 * 只定义函数，不自动执行；由 village.js 组装。
 *
 * 接口（villagers.js 的 vDoorSpots() 依赖）：
 *   h.x0/y0/x1/y1 · h.z1 · h.rise · h.roofColor · h.moss · h.chimney
 *   h.doorU = 门在 x 上的比例 · h.door = false 表示没门
 * ------------------------------------------------------------------ */
const WALL_RAMP = rampOf(WOOD_LIT);     // 墙板（用浅一档，参考图的木屋墙偏浅米棕）
const WOOD_D_RAMP = rampOf(WOOD_DARK); // 墙脚 / 檐口 / 窗台
const TRIM_RAMP = rampOf(WOOD_LIT);    // 窗框
const MOSS_RAMP = rampOf(MOSS);        // 屋顶苔藓
const DOOR_RAMP = rampOf(DOOR);        // 门板
const CHIM_RAMP = rampOf(CHIMNEY);     // 烟囱
const STONE_RAMP = rampOf(STONE);      // 石阶
const GLASS_LOW = rgb(228, 168, 62);   // 窗玻璃下缘（屋里灯的暗部）

/* ★ 细节缩放因子
 *
 * 房子的包围盒放大后（参考图实测：房子宽 = 画面宽 20%，
 * 而原来的实现只有 14%），所有内部细节必须同比放大，
 * 否则窗会小得像贴纸、门会像缝。
 *
 * K 由"参考房子的宽度"除以"基型宽度"得出。
 * 基型：宽 4.2 世界单位、墙高 3.0。
 */
const HOUSE_K = 2.1;

/* ---- 木纹墙：返回连续亮度档（调用方量化），不是颜色 ----
 * 板条密度按 HOUSE_K 反向调整：房子大了，板条不能同样密，
 * 否则每块板只有 1 像素宽，读作噪点而不是木板。 */
function woodLevel(a, z, base, seed, z1) {
  const pk = 1 / HOUSE_K;
  const plank = Math.floor(a * 2.6 * pk), inPlank = a * 2.6 * pk - plank;   // 竖向板条
  const row = Math.floor(z * 2.3 * pk), inRow = z * 2.3 * pk - row;         // 横向层
  let lv = base;
  lv += hash(plank, seed) > .74 ? 1 : hash(plank, seed) < .18 ? -1 : 0;  // 每块板固有色
  lv += (hash(plank * 13 + row * 5, seed + 3) - .5) * .9;                 // 板角第二层抖动
  if (inPlank > .88) lv -= 1;                   // 竖向拼缝
  if (inRow < .14) lv -= 1;                     // 横向拼缝
  lv -= z < .5 * HOUSE_K ? 1 : 0;               // 墙脚更脏
  lv += z > z1 * .58 ? .7 : 0;                  // 上部日晒变浅
  return lv;
}
function woodWall(a, z, base, seed, z1) {
  return WALL_RAMP[clamp(Math.round(woodLevel(a, z, base, seed, z1)), 0, 4)];
}
/* ---- 立面：front = y1 面（亮），side = x1 面（暗） ---- */
function drawWall(h, which, base) {
  const a0 = which === 'front' ? h.x0 : h.y0, a1 = which === 'front' ? h.x1 : h.y1;
  for (let a = a0; a <= a1; a += .045) for (let z = 0; z <= h.z1; z += .045) {
    const c = woodWall(a, z, base, which === 'front' ? h.seed : h.seed + 7, h.z1);
    if (which === 'front') plot(a, h.y1, z, c); else plot(h.x1, a, z, c);
  }
}
/* ---- 檐下阴影：出檐在墙上投的暗带（没有它墙顶像"接"上去的） ---- */
function drawEaveShadow(h) {
  for (let a = h.x0; a <= h.x1; a += .045)
    for (let z = h.z1 - .55; z <= h.z1; z += .045)
      plot(a, h.y1 + .01, z, z > h.z1 - .2 ? WALL_RAMP[0] : WALL_RAMP[1]);
  for (let a = h.y0; a <= h.y1; a += .045)
    for (let z = h.z1 - .45; z <= h.z1; z += .045)
      plot(h.x1 + .01, a, z, z > h.z1 - .2 ? WOOD_D_RAMP[1] : WOOD_D_RAMP[2]);
}
/* 瓦片行：按屋面在屏幕上的投影高度分行（每行 ≥ ROW_PX 高才读得出瓦片）。
   沿 y 走 dy 时 z 降 dy*rise/half，屏幕 sy 变化 dy*(SIN/R2 + rise/half*COS)*S。 */
const ROW_PX = 3.6;
function shingleRow(y, yc, half, rise) {
  const perY = (SIN / R2 + rise / half * COS) * S;
  return Math.floor(Math.abs(y - yc) * perY / ROW_PX) % 2;
}
/* ---- 坡屋顶：双坡 + 瓦片行 + 苔藓（坑见 docs/kit/buildings.md §5） ---- */
function drawRoof(h) {
  const rx0 = h.x0 - .2, ry0 = h.y0 - .2, rx1 = h.x1 + .2, ry1 = h.y1 + .2;
  const yc = (ry0 + ry1) / 2, half = (ry1 - ry0) / 2;
  const ramp = rampOf(h.roofColor);
  for (let x = rx0; x <= rx1; x += .045) for (let y = ry0; y <= ry1; y += .045) {
    const q = Math.abs(y - yc) / half;                       // 0 = 屋脊，1 = 檐
    const z = h.z1 + h.rise * (1 - q);
    const row = shingleRow(y, yc, half, h.rise);
    /* 近坡亮 3 / 远坡暗 1（不交换）。瓦片行用"暗行降一档"：
       近坡 3 加亮行会到档 4，而档 3/4 色差太小 → 瓦片行读不出来。 */
    let base = (y > yc ? 3 : 1) + (row ? 1 : -1);
    if (hash(x * 3 | 0, y * 9 | 0) > .88) base -= 1;         // 随机缺片
    let c = ramp[clamp(base, 0, 4)];
    if (h.moss > 0) {
      const n = noise(x * .55 + h.seed * 3.1, y * .55 + h.seed) * .55
              + noise(x * 1.9 + h.seed, y * 1.9) * .45;
      const thr = h.moss * (.06 + .46 * (1 - q));            // 靠屋脊多、往檐口渐稀
      if (n < thr) {
        const rim = (thr - n) < .1;                           // 边缘压暗 → 轮廓不规则
        c = MOSS_RAMP[clamp(rim ? 1 : 2 + (hash(x * 7 | 0, y * 7 | 0) > .6 ? 1 : 0), 0, 4)];
      }
    }
    plot(x, y, z, c);
  }
  for (let x = rx0; x <= rx1; x += .045)                   // 屋脊压瓦
    plot(x, yc, h.z1 + h.rise, WOOD_D_RAMP[2]);
  for (let x = rx0; x <= rx1; x += .045) for (const y of [ry0, ry1])  // 檐口
    plot(x, y, h.z1 + .02, WOOD_D_RAMP[2]);
}
/* ---- 山墙：出檐外缘上的三角面（坑见 docs/kit/buildings.md §5） ---- */
function drawGable(h) {
  const gy0 = h.y0 - .2, gy1 = h.y1 + .2;
  const yc = (gy0 + gy1) / 2, half = (gy1 - gy0) / 2;
  for (let y = gy0; y <= gy1; y += .045) {
    const top = h.z1 + h.rise * (1 - Math.abs(y - yc) / half);
    for (let z = h.z1; z <= top; z += .045)
      plot(h.x1 + .22, y, z, woodWall(y, z, 2, h.seed + 7, h.z1));
    plot(h.x1 + .22, y, top, WOOD_D_RAMP[2]);               // 斜边勾边
  }
}
/* ---- 窗：凸出墙面 .14，框亮一档（坑见 docs/kit/buildings.md §2） ----
 * 所有尺寸乘 HOUSE_K：房子放大后，窗必须同比放大，否则像贴纸。 */
function drawWindow(h, which, a, z0, w, hh) {
  const K = HOUSE_K;
  w *= K; hh *= K;
  for (let u = a - w; u <= a + w; u += .04) for (let z = z0; z <= z0 + hh; z += .04) {
    const edge = Math.abs(u - a) > w - .08 * K || z < z0 + .09 * K || z > z0 + hh - .09 * K;
    const mull = Math.abs(u - a) < .055 * K || Math.abs(z - (z0 + hh / 2)) < .055 * K;
    let c;
    if (edge || mull) c = TRIM_RAMP[4];
    else c = z < z0 + hh * .3 ? GLASS_LOW : WINDOW_LIT;
    const out = (edge || mull ? .16 : .14) * K;
    if (which === 'front') plot(u, h.y1 + out, z, c); else plot(h.x1 + out, u, z, c);
  }
  for (let u = a - w - .1 * K; u <= a + w + .1 * K; u += .04) {    // 窗台
    if (which === 'front') plot(u, h.y1 + .12 * K, z0 - .07 * K, WOOD_D_RAMP[2]);
    else plot(h.x1 + .12 * K, u, z0 - .07 * K, WOOD_D_RAMP[2]);
  }
  for (let u = a - w - .16 * K; u <= a + w + .16 * K; u += .04)     // 暖光溢到墙上
    for (let z = z0 - .12 * K; z <= z0 + hh + .12 * K; z += .04) {
      if (Math.abs(u - a) <= w + .06 * K && z >= z0 && z <= z0 + hh) continue;
      if (which === 'front') plot(u, h.y1 + .02 * K, z, WALL_RAMP[3]);
      else plot(h.x1 + .02 * K, u, z, WALL_RAMP[3]);
    }
}
/* ---- 门：比窗小，凸出墙面 .14 ---- */
function drawDoor(h, which, a, w, hh) {
  const K = HOUSE_K;
  w *= K; hh *= K;
  for (let u = a - w; u <= a + w; u += .04) for (let z = 0; z <= hh; z += .04) {
    const edge = Math.abs(u - a) > w - .07 * K || z > hh - .1 * K;
    const c = edge ? TRIM_RAMP[2] : DOOR_RAMP[Math.floor(u * 6) % 2 ? 2 : 1];
    if (which === 'front') plot(u, h.y1 + (edge ? .16 : .14) * K, z, c);
    else plot(h.x1 + (edge ? .16 : .14) * K, u, z, c);
  }
  for (let z = 0; z <= hh + .07 * K; z += .04) {                // 门框两侧
    if (which === 'front') {
      plot(a - w - .06 * K, h.y1 + .14 * K, z, WOOD_D_RAMP[3]);
      plot(a + w + .06 * K, h.y1 + .14 * K, z, WOOD_D_RAMP[3]);
    } else {
      plot(h.x1 + .14 * K, a - w - .06 * K, z, WOOD_D_RAMP[3]);
      plot(h.x1 + .14 * K, a + w + .06 * K, z, WOOD_D_RAMP[3]);
    }
  }
}
/* ---- 门前石阶：三级，越往外越矮（往 y+ 方向伸出） ---- */
function drawSteps(h, which, a) {
  const s = h.seed, K = HOUSE_K;
  if (which === 'front') {
    for (let k = 0; k < 3; k++) {
      const dep = (.34 + k * .16) * K, zz = (.38 - k * .12) * K;
      box(a - .46 * K, h.y1, 0, a + .46 * K, h.y1 + dep, zz, STONE, s + k);
    }
  } else {
    for (let k = 0; k < 3; k++) {
      const dep = (.34 + k * .16) * K, zz = (.38 - k * .12) * K;
      box(h.x1, a - .46 * K, 0, h.x1 + dep, a + .46 * K, zz, STONE, s + k);
    }
  }
}
/* ---- 烟囱：从屋面穿出，顶上有出挑压顶 ---- */
function drawChimney(h) {
  const K = HOUSE_K;
  const cx = h.x1 - (h.x1 - h.x0) * .32, cy = (h.y0 + h.y1) / 2 - .1 * K;
  const cw = .24 * K, top = h.z1 + h.rise + .78 * K, bot = h.z1 + h.rise * .35;
  for (let a = cx - cw; a <= cx + cw; a += .04) for (let z = bot; z <= top; z += .04)
    plot(a, cy + cw, z, CHIM_RAMP[3 + (Math.floor(z * 2.2) % 2 ? -1 : 0)]);
  for (let a = cy - cw; a <= cy + cw; a += .04) for (let z = bot; z <= top; z += .04)
    plot(cx + cw, a, z, CHIM_RAMP[2]);
  for (let a = cx - cw - .08 * K; a <= cx + cw + .08 * K; a += .04)   // 出挑压顶
    for (let b = cy - cw - .08 * K; b <= cy + cw + .08 * K; b += .04)
      plot(a, b, top, STONE_RAMP[3]);
}
/* ---- 一栋木屋 ---- */
function drawHouse(h) {
  const wins = h.windows || [{ u: .5 }], side = h.doorSide || 'front';
  drawWall(h, 'front', 3);      // 正面亮
  drawWall(h, 'side', 2);       // 侧面暗
  drawEaveShadow(h);            // 檐下暗带（在屋面之前画，屋面会盖住顶部）
  drawRoof(h);
  drawGable(h);                 // 山墙在出檐外缘，最后画 → 不会被屋面盖住
  for (const w of wins) {
    const a = lerp(h.x0, h.x1, w.u);
    const z0 = w.z == null ? h.z1 * .42 : h.z1 * w.z;
    drawWindow(h, 'front', a, z0, w.w || .38, w.h || .62);
  }
  if (h.sideWindow) drawWindow(h, 'side', lerp(h.y0, h.y1, .5), h.z1 * .42, .34, .58);
  if (h.door !== false) {
    const a = side === 'front' ? lerp(h.x0, h.x1, h.doorU == null ? .5 : h.doorU)
      : lerp(h.y0, h.y1, h.doorU == null ? .5 : h.doorU);
    drawDoor(h, side, a, .32, h.z1 * .5);
    drawSteps(h, side, a);
  }
  if (h.chimney) drawChimney(h);
}
/* ---------------- 房子的配置表 ---------------- */
/* 沿公路摆位：t = 沿路参数（0 远 / 画左，1 近 / 画右），
 * lat = 离中心线的法向距离（正 = 路北侧 = 屏幕右上，负 = 南侧 = 屏幕左下）。
 * 路几何直接读 terrain.js 的 ROAD，不重复定义。
 * 摆位约束：离路 > 人行道外沿（≈3.5）、台地超椭圆 hill < 0.97、AABB 两两不重叠。 */
function hPlace(t, lat, w, dp) {
  const dx = ROAD.bx - ROAD.ax, dy = ROAD.by - ROAD.ay, L = Math.hypot(dx, dy);
  const ux = dx / L, uy = dy / L;
  const cx = ROAD.ax + dx * t + uy * lat, cy = ROAD.ay + dy * t - ux * lat;
  return { x0: cx - w / 2, y0: cy - dp / 2, x1: cx + w / 2, y1: cy + dp / 2 };
}

const HOUSE_SPEC = [
  /* 5 栋木屋沿公路北侧紧凑排布 */
  { t: .20, lat: 6.2,  w: 4.8, dp: 4.0, z1: 3.8, rise: 2.0, roof: TILE,    moss: .30, chimney: true,
    seed: 19, windows: [{ u: .32 }, { u: .72 }], doorU: .22, sideWindow: true },
  { t: .36, lat: 8.5,  w: 5.0, dp: 4.2, z1: 3.9, rise: 2.0, roof: SHINGLE, moss: .65, chimney: false,
    seed: 45, windows: [{ u: .35 }, { u: .70 }], doorU: .50 },
  { t: .54, lat: 5.8,  w: 5.8, dp: 4.8, z1: 4.3, rise: 2.3, roof: SHINGLE, moss: .95, chimney: true,
    seed: 37, windows: [{ u: .28 }, { u: .72 }], doorU: .52 },
  { t: .70, lat: 7.2,  w: 5.0, dp: 4.2, z1: 3.9, rise: 2.1, roof: TILE,    moss: .45, chimney: true,
    seed: 83, windows: [{ u: .35 }, { u: .70 }], doorU: .48 },
  /* 路南：前景小屋 */
  { t: .76, lat: -5.6, w: 4.6, dp: 3.8, z1: 3.6, rise: 1.9, roof: TILE,    moss: .20, chimney: false,
    seed: 62, windows: [{ u: .32 }, { u: .68 }], doorU: .30 },
];

const HOUSES = HOUSE_SPEC.map(sp => Object.assign(hPlace(sp.t, sp.lat, sp.w, sp.dp), {
  z1: sp.z1, rise: sp.rise, roofColor: sp.roof, moss: sp.moss, chimney: sp.chimney,
  seed: sp.seed, windows: sp.windows, doorU: sp.doorU, doorSide: sp.doorSide, sideWindow: sp.sideWindow,
}));;

/* 按 y 从大到小排序后画（y 大 = 靠近观众 = 后画） */
function drawHouses() {
  const sorted = [...HOUSES].sort((a, b) => b.y1 - a.y1);
  for (const h of sorted) drawHouse(h);
}

/* 体积阴影：在物体体积内三维采样打点，每点投一个地面椭圆 */
function shadowHouses() {
  for (const h of HOUSES) {
    /* 体积影：采样点少而小，只在房子左下投一小片 ——
       采样密 + 半径大会铺满路面，把公路糊成暗带 */
    for (let x = h.x0 + .6; x <= h.x1 - .3; x += 1.4)
      for (let y = h.y0 + .6; y <= h.y1 - .3; y += 1.4)
        castShadow(x, y, h.z1 * .35, .5, 4, .7);
    /* 房脚接触影：贴地一圈 */
    for (let x = h.x0 - .4; x <= h.x1 + .4; x += .7)
      for (let y = h.y0 - .4; y <= h.y1 + .4; y += .7)
        if (x < h.x0 - .1 || x > h.x1 + .1 || y < h.y0 - .1 || y > h.y1 + .1)
          castShadow(x, y, .15, .5, 3, .6);
  }
}
