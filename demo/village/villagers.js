'use strict';
/* ------------------------------------------------------------------
 * 秋日山村 · 村民
 *
 * 参考图里人很小：几个沿公路人行道走动的路人 + 房子门口张望的村民。
 * 全部走 figure() + dynamicAdd（自带动态阴影），**每帧重画**（人会动）。
 *
 * 导出：makeVillagers() / updateVillagers(t,dt) / drawVillagers(t)
 *       pickVillager(sx,sy) / villagerAnchor(v) / villagerAnchorWorld(v)
 *       villagerAnchors()
 *
 * 全局名加 V_ / v 前缀 —— 顶层 const 重名会让整页脚本 SyntaxError。
 * ------------------------------------------------------------------ */

/* 公路几何：唯一真相源是 terrain.js 的 ROAD（运行时惰性读，避开加载顺序） */
const V_ROAD_DEF = { ax: -13, ay: -18, bx: 17, by: 19, halfW: 3.1 };
function vRoadCfg() { return (typeof ROAD !== 'undefined' && ROAD) ? ROAD : V_ROAD_DEF; }

/* 人行道带：路缘外 0.42～1.25（terrain.js 的 CURB_W=.34 + WALK_W=.95） */
const V_WALK_MIN = .42, V_WALK_MAX = 1.25;
const V_COUNT = 7;            // 村民总数 6~8
const V_GAP = .8;             // 互斥间距

/* 配色：秋天山村，暖色系为主，避开鲜艳纯色 */
const V_SHIRTS = [
  [172, 78, 60], [196, 144, 68], [58, 74, 110], [104, 112, 66],
  [214, 200, 168], [146, 92, 58], [184, 118, 74],
];
const V_LEGS = [[76, 62, 52], [58, 66, 92], [126, 106, 76], [66, 62, 60], [92, 74, 54]];
const V_HAIR = [[46, 36, 30], [92, 58, 34], [138, 130, 122], [176, 142, 88], [62, 46, 36]];
const V_SKIN = [[232, 190, 156], [214, 168, 132], [196, 146, 110], [168, 120, 90]];
const V_STRIPE = [238, 230, 208];   // 浅米色衬衫条纹

const villagers = [];           // makeVillagers() 填充；主场景按这个名字取
window.VILLAGERS = villagers;    // 大写别名，方便调试
/* ---------------- 公路几何工具（t ∈ 0..1 沿中心线，lat 带符号横向） ---------------- */

function vRoadFrame() {
  const R = vRoadCfg();
  const dx = R.bx - R.ax, dy = R.by - R.ay, l = Math.hypot(dx, dy);
  return { R, len: l, ux: dx / l, uy: dy / l, nx: -dy / l, ny: dx / l };
}
function vRoadAt(f, t, lat) {                   // 中心线上 t 处横移 lat
  const R = f.R;
  return { x: R.ax + f.ux * f.len * t + f.nx * lat, y: R.ay + f.uy * f.len * t + f.ny * lat };
}
function vRoadT(f, x, y) {                     // 点在中心线上的投影参数
  return ((x - f.R.ax) * f.ux + (y - f.R.ay) * f.uy) / f.len;
}
function vRoadLat(f, x, y) {                   // 带符号的横向距离
  return (x - f.R.ax) * f.nx + (y - f.R.ay) * f.ny;
}
/* 人行道带内的横向距离（带符号，固定在一侧） */
function vWalkLat(f, side, lat) {
  return side * clamp(Math.abs(lat), f.R.halfW + V_WALK_MIN, f.R.halfW + V_WALK_MAX);
}
/* 把点夹回人行道带内（v.side 固定一侧，不会跑到路对面去） */
function vClampWalk(v) {
  const f = vRoadFrame();
  const t = clamp(vRoadT(f, v.x, v.y), .02, .98);
  const side = v.side || (vRoadLat(f, v.x, v.y) >= 0 ? 1 : -1);
  const lat = vWalkLat(f, side, vRoadLat(f, v.x, v.y));
  const p = vRoadAt(f, t, lat);
  v.x = p.x; v.y = p.y; v.lat = lat; v.t = t;
}
/* ---------------- 房子门口 ---------------- */

/* HOUSES 可能还没写好 → 防御性读取；只取离公路近、画面内的那几栋 */
function vDoorSpots() {
  let houses = null;
  try { if (typeof HOUSES !== 'undefined' && HOUSES) houses = HOUSES; } catch (e) { houses = null; }
  if (!houses || !houses.length) return [];
  const spots = [], f = vRoadFrame();
  for (const h of houses) {
    if (!h || h.x0 == null || h.x1 == null || h.y0 == null || h.y1 == null) continue;
    if (h.door === false) continue;
    /* 门画在 y1 面（houses.js:89），位置由 doorU 沿 x 分布 */
    const mx = lerp(h.x0, h.x1, h.doorU == null ? .5 : h.doorU), my = h.y1;
    const t = vRoadT(f, mx, my), lat = vRoadLat(f, mx, my);
    const toward = lat >= 0 ? -1 : 1;            // 指向路中线的方向
    const p = vRoadAt(f, t, lat + toward * .55); // 从门朝公路退一点
    const pr = project(p.x, p.y, 0);
    if (pr.sx < 6 || pr.sx > W - 6 || pr.sy < 6 || pr.sy > H - 6) continue;
    spots.push({ x: p.x, y: p.y, look: Math.atan2(-toward * f.ny, -toward * f.nx), dist: Math.abs(lat) });
  }
  spots.sort((a, b) => a.dist - b.dist);         // 离路近的优先
  return spots;
}

function vPick(list, k, seed) {
  return list[Math.min(list.length - 1, Math.floor(hash(k, seed) * list.length))];
}
function vMake(k, x, y) {
  const shirt = vPick(V_SHIRTS, k, 81), yaw = Math.PI / 2;   // 大致面向观众
  return {
    x, y, yaw, look: yaw, targetX: x, targetY: y,
    walking: false,
    gait: hash(k, 86) * 6,                        // 步态相位（累积）
    speed: .38 + hash(k, 87) * .34,
    wait: hash(k, 88) * 2.5,
    scale: .76 + hash(k, 89) * .09,               // 人很小：.75～.85
    phase: hash(k, 90) * 6.283,                   // 呼吸/转头相位（各人不同）
    side: 0, lat: 0, t: 0, walker: false, lookAt: yaw,
    seed: k, pickCount: 0,
    palette: {
      shirt,
      stripe: hash(k, 82) > .62 ? V_STRIPE : shirt,   // 约 38% 穿条纹衬衫
      legs: vPick(V_LEGS, k, 83), hair: vPick(V_HAIR, k, 84), skin: vPick(V_SKIN, k, 85),
    },
  };
}

function makeVillagers() {
  villagers.length = 0;
  const doors = vDoorSpots();
  const nDoor = Math.min(doors.length, 3);       // 门口最多 3 个
  const nWalk = V_COUNT - nDoor, f = vRoadFrame();
  /* 沿路两侧人行道：交替左右，参数 t 铺开 */
  for (let k = 0; k < nWalk; k++) {
    const side = (k & 1) ? 1 : -1;
    const t = clamp(.16 + k * .21 + (hash(k, 71) - .5) * .06, .06, .94);
    const lat = side * (f.R.halfW + V_WALK_MIN + .18
      + hash(k, 72) * (V_WALK_MAX - V_WALK_MIN - .4));
    const p = vRoadAt(f, t, lat);
    const v = vMake(k, p.x, p.y);
    v.side = side; v.lat = lat; v.t = t; v.walker = true;
    vPickWalkTarget(v);                           // 一上来就走起来
    villagers.push(v);
  }
  /* 房子门口：站着不动，张望 */
  for (let k = 0; k < nDoor; k++) {
    const d = doors[k], v = vMake(nWalk + k, d.x, d.y);
    v.walker = false;
    v.lookAt = d.look; v.yaw = d.look; v.look = d.look;
    villagers.push(v);
  }
  return villagers;
}

/* 目标：同一条人行道上换一段，不跨到路对面 */
function vPickWalkTarget(v) {
  v.pickCount++;
  const r = salt => hash(v.seed * 97 + v.pickCount * 13 + salt, 131);
  const f = vRoadFrame();
  const t = clamp(vRoadT(f, v.x, v.y) + (r(0) - .5) * .45, .04, .96);
  const lat = vWalkLat(f, v.side, v.lat) + (r(1) - .5) * .3;
  const p = vRoadAt(f, t, lat);
  v.targetX = p.x; v.targetY = p.y;
  v.lat = lat; v.t = t;
  v.walking = true;
}

/* ---------------- 每帧更新 ---------------- */

function updateVillagers(t, dt) {
  const f = vRoadFrame();
  for (const v of villagers) {
    if (v.walker) {
      if (v.walking) {
        const dx = v.targetX - v.x, dy = v.targetY - v.y, d = Math.hypot(dx, dy);
        if (d < .16) {                             // 到了 → 站一会儿
          v.walking = false;
          v.wait = 1.2 + hash(v.seed * 31 + v.pickCount, 101) * 5.5;
          v.lookAt = Math.atan2(-v.side * f.ny, -v.side * f.nx);   // 站在路边看向路中间
        } else {
          v.x += dx / d * v.speed * dt;
          v.y += dy / d * v.speed * dt;
          v.look = Math.atan2(dy, dx);
          v.gait += dt * 7 * v.speed;
        }
      } else if ((v.wait -= dt) <= 0) {
        vPickWalkTarget(v);
      }
    } else {
      /* 站着的人：慢慢转头看四周（相位错开，不整齐划一） */
      if ((v.wait -= dt) <= 0) {
        v.pickCount++;
        v.lookAt += (hash(v.seed * 13 + v.pickCount, 112) - .5) * 1.4;
        v.wait = 2.4 + hash(v.seed + v.pickCount, 113) * 3.6;
      }
      v.look = v.lookAt + Math.sin(t * .45 + v.phase) * .32;
    }
    /* 朝向归一化：不归一化会绕整圈 */
    let turn = v.look - v.yaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    v.yaw += turn * Math.min(1, dt * 6);
  }
  /* 局部避让：软排斥，走路的人之间不重叠 */
  for (let i = 0; i < villagers.length; i++) {
    const a = villagers[i];
    for (let j = i + 1; j < villagers.length; j++) {
      const b = villagers[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || .01;
      if (d >= V_GAP) continue;
      const push = (V_GAP - d) * Math.min(1, dt * 5) / 2;
      if (a.walker) { a.x -= dx / d * push; a.y -= dy / d * push; }
      if (b.walker) { b.x += dx / d * push; b.y += dy / d * push; }
    }
    if (a.walker) vClampWalk(a);                  // 始终留在人行道上，不挡路
  }
}

/* 人物是动的 → 不烘焙，每帧重画。dynamicAdd 已把骨头登记进 pendingShadows，
 * 阴影由主场景统一收口（别在这里动 pendingShadows，会误删别人的登记）：
 *   pendingShadows.length = 0; drawVillagers(t); flushShadows(); applyShadows(groundZ);
 */
function drawVillagers(t) {
  for (const v of villagers) {
    /* 步态量化：离散步态，和风动同一套手绘语言 */
    const swing = v.walking ? Math.sin(Math.floor(v.gait * 1.3) * Math.PI / 2 + .8) : 0;
    const breathe = Math.sin(t * 1.6 + v.phase) * .012;   // 幅度必须小（≤.02）
    figure(v.x, v.y, v.yaw, {
      z: v.walking ? Math.abs(swing) * .02 : 0,
      scale: v.scale,
      stance: v.walking ? swing * .13 : .06,
      armR: v.walking ? swing * .5 : .1,
      armL: v.walking ? -swing * .5 : -.1,
      lean: breathe,
    }, v.palette, dynamicAdd);
  }
}

/* ---------------- 交互接口 ---------------- */

/* figure() 骨架：头心 z ≈ 2.59，头半径 .24 → 头顶 ≈ 2.83（未缩放） */
const V_HEAD_TOP = 2.83;

function villagerAnchorWorld(v) {
  return { x: v.x, y: v.y, z: V_HEAD_TOP * v.scale + .6 };   // 头顶上方 0.6 世界单位
}
function villagerAnchor(v) {
  const a = villagerAnchorWorld(v), p = project(a.x, a.y, a.z);
  return { sx: p.sx, sy: p.sy };
}
function villagerAnchors() {
  return villagers.map(v => ({ v, sx: villagerAnchor(v).sx, sy: villagerAnchor(v).sy }));
}
/* 点击拾取：取最近的（头顶标记 或 身体中心）距离 < 12px 的村民 */
function pickVillager(sx, sy, radius = 12) {
  let best = null, bestD = radius * radius;
  for (const v of villagers) {
    const head = villagerAnchor(v), body = project(v.x, v.y, .9 * v.scale);
    const dh = (head.sx - sx) * (head.sx - sx) + (head.sy - sy) * (head.sy - sy);
    const db = (body.sx - sx) * (body.sx - sx) + (body.sy - sy) * (body.sy - sy);
    const d = Math.min(dh, db);
    if (d <= bestD) { bestD = d; best = v; }
  }
  return best;
}
