'use strict';
/* ------------------------------------------------------------------
 * 秋日山村 · 木屋建筑
 *
 * 参考：docs/kit/buildings.md §2 house · §5 pitched-roof
 *       docs/kit/structures.md §1.4 木纹墙 · §2 体积阴影
 *
 * 墙 = 木板拼缝（**不是砖石**）。参考图的木屋是横板墙：
 * 竖向板缝 + 横向板缝 + 每块板独立色差 + 墙脚发暗 + 上部日晒变浅。
 *
 * 坐标约定：正面 = y1 面（base 3，亮），侧面 = x1 面（base 2，暗）。
 * 只定义函数，不自动执行；由 village.js 组装。
 *
 * 接口约定（villagers.js 的 vDoorSpots() 依赖）：
 *   h.x0/y0/x1/y1 · h.z1 · h.rise · h.roofColor · h.moss · h.chimney
 *   h.doorU = 门在 x 上的比例 · h.door = false 表示没门
 * ------------------------------------------------------------------ */

/* ---- 局部色阶（全部走 rampOf） ---- */
/* 墙基色用 WOOD_LIT：参考图的木屋墙偏浅米棕，用 WOOD 会太暗沉 */
const WALL_RAMP = rampOf(WOOD_LIT);   // 墙板
const WOOD_RAMP = rampOf(WOOD);       // 木构件
const WOOD_D_RAMP = rampOf(WOOD_DARK); // 墙脚 / 檐口 / 窗台
const TRIM_RAMP = rampOf(WOOD_LIT);   // 窗框
const MOSS_RAMP = rampOf(MOSS);       // 屋顶苔藓
const DOOR_RAMP = rampOf(DOOR);       // 门板
const CHIM_RAMP = rampOf(CHIMNEY);    // 烟囱
const STONE_RAMP = rampOf(STONE);     // 石阶
const GLASS_LOW = rgb(228, 168, 62);  // 窗玻璃下缘（屋里灯的暗部）

/* ---- 木纹墙：返回连续亮度档（调用方量化），不是颜色 ---- */
function woodLevel(a, z, base, seed, z1) {
  const plank = Math.floor(a * 2.6);              // 竖向板条
  const inPlank = a * 2.6 - plank;
  const row = Math.floor(z * 2.3);                // 横向层
  const inRow = z * 2.3 - row;
  let lv = base;
  lv += hash(plank, seed) > .74 ? 1 : hash(plank, seed) < .18 ? -1 : 0;  // 每块板固有色
  lv += (hash(plank * 13 + row * 5, seed + 3) - .5) * .9;                 // 板角第二层抖动
  if (inPlank > .88) lv -= 1;                  // 竖向拼缝
  if (inRow < .14) lv -= 1;                    // 横向拼缝（参考图里很明显）
  lv -= z < .5 ? 1 : 0;                        // 墙脚更脏
  lv += z > z1 * .58 ? .7 : 0;                 // 上部日晒变浅
  return lv;
}

function woodWall(a, z, base, seed, z1) {
  return WALL_RAMP[clamp(Math.round(woodLevel(a, z, base, seed, z1)), 0, 4)];
}

/* ---- 立面：front = y1 面（亮），side = x1 面（暗） ---- */
function drawWall(h, which, base) {
  const a0 = which === 'front' ? h.x0 : h.y0;
  const a1 = which === 'front' ? h.x1 : h.y1;
  for (let a = a0; a <= a1; a += .045) for (let z = 0; z <= h.z1; z += .045) {
    const c = woodWall(a, z, base, which === 'front' ? h.seed : h.seed + 7, h.z1);
    if (which === 'front') plot(a, h.y1, z, c);
    else plot(h.x1, a, z, c);
  }
}

/* ---- 坡屋顶：双坡 + 瓦片行 + 苔藓 ---- */
function drawRoof(h) {
  const rx0 = h.x0 - .2, ry0 = h.y0 - .2, rx1 = h.x1 + .2, ry1 = h.y1 + .2;
  const yc = (ry0 + ry1) / 2, half = (ry1 - ry0) / 2;
  const ramp = rampOf(h.roofColor);
  for (let x = rx0; x <= rx1; x += .045) for (let y = ry0; y <= ry1; y += .045) {
    const q = Math.abs(y - yc) / half;
    const z = h.z1 + h.rise * (1 - q);
    const row = Math.floor(q * half * 3.4) % 2;               // 瓦片行
    let base = (y > yc ? 3 : 1) + row;                       // 近坡亮 3 / 远坡暗 1（别交换）
    if (hash(x * 3 | 0, y * 9 | 0) > .85) base -= 1;         // 随机缺片
    let c = ramp[clamp(base, 0, 4)];
    if (h.moss > 0) {
      const n = noise(x * .7 + h.seed * 3.1, y * .7 + h.seed) * .62
              + noise(x * 2.2 + h.seed, y * 2.2) * .38;
      const up = y < yc ? .58 : .16;                          // 苔藓偏向远坡（屏幕上靠上）
      const thr = h.moss * up;
      if (n < thr) {
        const rim = (thr - n) < .13;                          // 苔藓边缘压暗 → 轮廓不规则
        c = MOSS_RAMP[clamp(rim ? 1 : 2 + (hash(x * 7 | 0, y * 7 | 0) > .62 ? 1 : 0), 0, 4)];
      }
    }
    plot(x, y, z, c);
  }
  /* 屋脊：压瓦的一条深色勾边，勾出屋形 */
  for (let x = rx0; x <= rx1; x += .045)
    plot(x, yc, h.z1 + h.rise, WOOD_D_RAMP[2]);
  /* 檐口：出挑那一条要深色，才看得出厚度 */
  for (let x = rx0; x <= rx1; x += .045) for (const y of [ry0, ry1])
    plot(x, y, h.z1 + .02, WOOD_D_RAMP[2]);
}

/* ---- 山墙：出檐外缘上的三角面 ----
 * 坑：山墙必须画在**出檐外缘**（x1+.2）。
 *   - 画在 x1：会被出檐的屋面完全盖住（屋面沿 x 一直铺到 x1+.2）。
 *   - 画在 x1+.2：和屋面最右一列深度相同 → z-fighting。
 *   - 画在 x1+.22：比屋面外缘更近 0.02 → 深度测试稳定赢，三角完整可见。
 * 高度取 rise*(1-q)，与屋面在出檐处的高度对齐 → 山墙正好是屋脊到檐口的斜边。 */
function drawGable(h) {
  const gy0 = h.y0 - .2, gy1 = h.y1 + .2;
  const yc = (gy0 + gy1) / 2, half = (gy1 - gy0) / 2;
  for (let y = gy0; y <= gy1; y += .045) {
    const top = h.z1 + h.rise * (1 - Math.abs(y - yc) / half);
    for (let z = h.z1; z <= top; z += .045)
      plot(h.x1 + .22, y, z, woodWall(y, z, 2, h.seed + 7, h.z1));
    /* 山墙斜边：一条深色勾边 */
    plot(h.x1 + .22, y, top, WOOD_D_RAMP[2]);
  }
}

/* ---- 窗：凸出墙面 .14，框亮一档 ----
 * 坑：窗要够大才读得出"亮着灯"——.26 半宽在 9px 尺度下只有 4px 宽。 */
function drawWindow(h, which, a, z0, w, hh) {
  for (let u = a - w; u <= a + w; u += .04) for (let z = z0; z <= z0 + hh; z += .04) {
    const edge = Math.abs(u - a) > w - .08 || z < z0 + .09 || z > z0 + hh - .09;
    const mull = Math.abs(u - a) < .055 || Math.abs(z - (z0 + hh / 2)) < .055;
    let c;
    if (edge || mull) c = TRIM_RAMP[4];
    else c = z < z0 + hh * .3 ? GLASS_LOW : WINDOW_LIT;
    const out = edge || mull ? .16 : .14;
    if (which === 'front') plot(u, h.y1 + out, z, c);
    else plot(h.x1 + out, u, z, c);
  }
  /* 窗台 */
  for (let u = a - w - .1; u <= a + w + .1; u += .04) {
    if (which === 'front') plot(u, h.y1 + .12, z0 - .07, WOOD_D_RAMP[2]);
    else plot(h.x1 + .12, u, z0 - .07, WOOD_D_RAMP[2]);
  }
  /* 暖光溢到墙上：窗四周一圈淡黄 */
  for (let u = a - w - .16; u <= a + w + .16; u += .04)
    for (let z = z0 - .12; z <= z0 + hh + .12; z += .04) {
      if (Math.abs(u - a) <= w + .06 && z >= z0 && z <= z0 + hh) continue;
      if (which === 'front') plot(u, h.y1 + .02, z, WALL_RAMP[3]);
      else plot(h.x1 + .02, u, z, WALL_RAMP[3]);
    }
}

/* ---- 门：比窗小，凸出墙面 .14 ---- */
function drawDoor(h, which, a, w, hh) {
  for (let u = a - w; u <= a + w; u += .04) for (let z = 0; z <= hh; z += .04) {
    const edge = Math.abs(u - a) > w - .07 || z > hh - .1;
    const c = edge ? TRIM_RAMP[2] : DOOR_RAMP[Math.floor(u * 6) % 2 ? 2 : 1];
    if (which === 'front') plot(u, h.y1 + (edge ? .16 : .14), z, c);
    else plot(h.x1 + (edge ? .16 : .14), u, z, c);
  }
  /* 门框两侧 */
  for (let z = 0; z <= hh + .07; z += .04) {
    if (which === 'front') {
      plot(a - w - .06, h.y1 + .14, z, WOOD_D_RAMP[3]);
      plot(a + w + .06, h.y1 + .14, z, WOOD_D_RAMP[3]);
    } else {
      plot(h.x1 + .14, a - w - .06, z, WOOD_D_RAMP[3]);
      plot(h.x1 + .14, a + w + .06, z, WOOD_D_RAMP[3]);
    }
  }
}

/* ---- 门前石阶：两级，越往外越矮 ---- */
function drawSteps(h, which, a) {
  const s = h.seed;
  if (which === 'front') {
    box(a - .44, h.y1, 0, a + .44, h.y1 + .32, .4, STONE, s);
    box(a - .44, h.y1 + .32, 0, a + .44, h.y1 + .62, .18, STONE, s + 1);
  } else {
    box(h.x1, a - .44, 0, h.x1 + .32, a + .44, .4, STONE, s);
    box(h.x1 + .32, a - .44, 0, h.x1 + .62, a + .44, .18, STONE, s + 1);
  }
}

/* ---- 烟囱：从屋面穿出，顶上有出挑压顶 ----
 * 坑：烟囱底部要埋进屋面（否则悬空），顶部必须高出屋脊才看得见。 */
function drawChimney(h) {
  const cx = h.x1 - (h.x1 - h.x0) * .32, cy = (h.y0 + h.y1) / 2 - .1;
  const cw = .24;
  const top = h.z1 + h.rise + .78;              // 高出屋脊
  const bot = h.z1 + h.rise * .35;              // 埋进屋面
  for (let a = cx - cw; a <= cx + cw; a += .04) for (let z = bot; z <= top; z += .04)
    plot(a, cy + cw, z, CHIM_RAMP[3 + (Math.floor(z * 2.2) % 2 ? -1 : 0)]);
  for (let a = cy - cw; a <= cy + cw; a += .04) for (let z = bot; z <= top; z += .04)
    plot(cx + cw, a, z, CHIM_RAMP[2]);
  /* 压顶：出挑一圈 */
  for (let a = cx - cw - .08; a <= cx + cw + .08; a += .04)
    for (let b = cy - cw - .08; b <= cy + cw + .08; b += .04)
      plot(a, b, top, STONE_RAMP[3]);
}

/* ---- 一栋木屋 ---- */
function drawHouse(h) {
  const wins = h.windows || [{ u: .5 }];
  const side = h.doorSide || 'front';

  drawWall(h, 'front', 3);      // 正面亮
  drawWall(h, 'side', 2);       // 侧面暗
  drawRoof(h);
  drawGable(h);

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
/* 沿公路摆位：t = 沿路参数（0 远 1 近），lat = 离中心线的横向距离（正 = 路右侧） */
const HROAD = { ax: -19, ay: -22, bx: 21, by: 23 };
function hPlace(t, lat, w, dp) {
  const dx = HROAD.bx - HROAD.ax, dy = HROAD.by - HROAD.ay, L = Math.hypot(dx, dy);
  const cx = HROAD.ax + dx * t + dy / L * lat;
  const cy = HROAD.ay + dy * t - dx / L * lat;
  return { x0: cx - w / 2, y0: cy - dp / 2, x1: cx + w / 2, y1: cy + dp / 2 };
}

const HOUSE_SPEC = [
  /* 远处左上 · 小木屋 */
  { t: .115, lat: -8.2, w: 3.0, dp: 2.6, z1: 2.5, rise: 1.05, roof: TILE, moss: .14, chimney: false,
    seed: 11, windows: [{ u: .38 }, { u: .74 }], doorU: .16 },
  /* 远处右上 · 苔藓屋顶 */
  { t: .045, lat: 8.4, w: 3.2, dp: 2.7, z1: 2.6, rise: 1.1, roof: SHINGLE, moss: .5, chimney: false,
    seed: 23, windows: [{ u: .32 }, { u: .7 }], doorU: .5 },
  /* 右上更近一点 · 第二栋 */
  { t: .215, lat: 10.2, w: 3.0, dp: 2.5, z1: 2.5, rise: 1.05, roof: SHINGLE, moss: .3, chimney: true,
    seed: 31, windows: [{ u: .34 }, { u: .72 }], doorU: .16 },
  /* 中部偏右 · 大木屋（屋顶满是苔藓，正对观众） */
  { t: .585, lat: 9.7, w: 4.4, dp: 3.5, z1: 3.1, rise: 1.45, roof: SHINGLE, moss: .88, chimney: true,
    seed: 37, windows: [{ u: .28 }, { u: .68 }], doorU: .47 },
  /* 左侧中部 · 大木屋（带烟囱） */
  { t: .60, lat: -9.7, w: 4.2, dp: 3.4, z1: 3.0, rise: 1.35, roof: TILE, moss: .2, chimney: true,
    seed: 51, windows: [{ u: .3 }, { u: .72 }], doorU: .5 },
  /* 近处左侧 · 斜对观众 */
  { t: .95, lat: -7.6, w: 3.5, dp: 3.0, z1: 2.8, rise: 1.2, roof: SHINGLE, moss: .55, chimney: true,
    seed: 97, windows: [{ u: .32 }, { u: .7 }], doorU: .5 },
  /* 近处右下 · 部分出画 */
  { t: .95, lat: 7.6, w: 3.6, dp: 3.0, z1: 2.9, rise: 1.25, roof: TILE, moss: .45, chimney: true,
    seed: 83, windows: [{ u: .34 }, { u: .7 }], doorU: .5 },
];

const HOUSES = HOUSE_SPEC.map(s => Object.assign(hPlace(s.t, s.lat, s.w, s.dp), {
  z1: s.z1, rise: s.rise, roofColor: s.roof, moss: s.moss, chimney: s.chimney,
  seed: s.seed, windows: s.windows, doorU: s.doorU, doorSide: s.doorSide, sideWindow: s.sideWindow,
}));

/* 按 y 从大到小排序后画（y 大 = 靠近观众 = 后画） */
function drawHouses() {
  const sorted = [...HOUSES].sort((a, b) => b.y1 - a.y1);
  for (const h of sorted) drawHouse(h);
}

/* 体积阴影：在物体体积内三维采样打点，每点投一个地面椭圆 */
function shadowHouses() {
  for (const h of HOUSES) {
    for (let x = h.x0 - .2; x <= h.x1 + .2; x += .5)
      for (let y = h.y0 - .2; y <= h.y1 + .2; y += .5)
        for (let z = .3; z <= h.z1 + h.rise; z += .7) castShadow(x, y, z, .55);
  }
}
