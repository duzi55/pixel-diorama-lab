# 道具与物品

> 注册表：[registry.md §4](registry.md)
> 覆盖：球 · 瓶 · 木箱 · 藤篮 · 织物（衣物）· 球拍 · 锥筒 · 长椅 · 道具摆放规范
> 参考实现：`engine.js` + `balote` · `laundry` · `tie-break` · `mini-ramp`

参考项目的道具几乎全是**图元组合**，没有一张精灵图。这一篇总结组合的套路。

> **本篇定位**：按"道具种类"组织的配方卡。建筑类变体在 [buildings.md](buildings.md)，
> 植物类在 [trees.md](trees.md) / [plants.md](plants.md)。

---

## 1. `ball` 球

```js
// 参考：balote:412-416
for (const b of allBalls()) {
  sphere(b.x, b.y, b.z, b.r, b.team < 0 ? JACK_COLOR : TEAM[b.team].ball, 'gloss');
  castShadow(b.x, b.y, b.z - b.r, b.r * .96, 1, 0);      // 投影
  if (b.z < b.r + .1) castShadow(b.x, b.y, 0, b.r * .72, 2, 0);  // 接触影
}
```

### 1.1 三种材质模式的选择

| mode | 用途 | 特征 | 参考 |
|------|------|------|------|
| `'gloss'` | 球、瓶子、金属 | `l > .9` 时写死高光 `rgb(255,250,232)` | `engine.js:81` |
| `'rough'` | 树叶、石头、树皮 | 叠加 hash 噪声，表面粗糙 | `engine.js:74` |
| `'solid'` | 人物、剪影物体 | 跳过抖动，平色带 | `engine.js:83` |

**球必须用 `gloss`**：写死的高光点让球读作球。不用 `gloss` 的话，球的边缘会糊在地面上。

### 1.2 阴影的两层

| 阴影 | 参数 | 条件 |
|------|------|------|
| 投影 | `castShadow(x, y, z-r, r*.96, 1, 0)` | 总是 |
| 接触影 | `castShadow(x, y, 0, r*.72, 2, 0)` | `z < r + .1`（贴地时） |

投影的高度用 `z - r`（球底），不是球心。半径乘 `.96` 让影子比球略小。

### 1.3 参考项目的球

| 球 | 半径 | 颜色 | 参考 |
|----|------|------|------|
| 滚球 | .3 | 队伍色 | `balote:62` |
| 小黄球（jack） | .16 | `[232,200,62]` | `balote:62` |
| 网球 | .22 | `[216,236,72]` | `tie-break:75` |

---

## 2. `bottle` 瓶 / 罐

```js
// 参考：balote:140-141
const bottle = [68, 110, 76];
capsule([3.35, -5.1, .6], [3.35, -5.1, 1], .16, .1, () => bottle, 'gloss');
```

**竖直胶囊 + 半径收窄 = 瓶子**。`r0 > r1` 表示上细下粗。

| 变体 | 参数 | 参考 |
|------|------|------|
| 瓶子 | 竖直，`.16 → .1` | `balote:141` |
| 保温杯 | 竖直，`.13 → .1` | `tie-break:167` |
| 水塔（卧倒） | 水平，`.55 → .55` | `laundry:141` |
| 交通锥 | 竖直，`.34 → .06` | `mini-ramp:202` |

### 2.1 交通锥（带色带）

```js
// 参考：mini-ramp:201-203
const cone = world(-12, 4.4, 0);
capsule(cone, [cone[0], cone[1], .9], .34, .06,
  z => (z > .35 && z < .6 ? [240, 236, 224] : [226, 96, 44]), 'solid');
castShadow(cone[0], cone[1], .3, .3);
```

**`colorOf` 回调按高度返回不同颜色**，就能做出色带。
`z > .35 && z < .6` 是白色反光带。

这个"按 z 分段配色"的技巧同样适用于：树干年轮、球衣条纹、旗帜。

---

## 3. `crate` 木箱 / 板条箱

```js
// 参考：balote:139
box(2.9, -5.5, 0, 3.8, -4.7, .5, [146, 108, 66], 6);
// 参考：mini-ramp:204-206
const crate = world(11.8, 5.2, 0);
box(crate[0] - .5, crate[1] - .5, 0, crate[0] + .5, crate[1] + .5, .7, [146, 108, 66], 6);
castShadow(crate[0], crate[1], .35, .6);
```

`box()` 的第 8 个参数 `seed` 用来错开木纹。**同一个 seed 会产生完全相同的木纹**，
所以摆放多个相同箱子时要给不同 seed。

### 3.1 板条围板（balote 的球场边）

```js
// 参考：balote:127-132
for (let x = -COURT_X - BOARD; x < COURT_X + BOARD; x += 3) {
  const w = (x / 3 | 0) % 2 ? wood : woodLight;       // 交替色 = 一块块板条
  box(x, -COURT_Y - BOARD, 0, Math.min(x + 3, COURT_X + BOARD), -COURT_Y, BOARD, w, x | 0);
  box(x, COURT_Y, 0, Math.min(x + 3, COURT_X + BOARD), COURT_Y + BOARD, BOARD, w, x + 40 | 0);
}
```

**用 3 单位宽的 `box()` 交替两种木色**，就读作一排板条。
比画单个大 box 好看得多——这是"用重复表达材质"的经典手法。

---

## 4. `wicker-basket` 藤篮 / 编织容器

```js
// 参考：laundry:170-175
for (let t = 0; t < 6.283; t += .02) for (let z = 0; z <= BASKET.h; z += step) {
  const nx = Math.cos(t), ny = Math.sin(t);
  const weave = (Math.floor(z * 8) + Math.floor(t * 7)) % 2;    // ← 编织纹
  plot(BASKET.x + nx*BASKET.r, BASKET.y + ny*BASKET.r, z,
    rampOf(WICKER)[clamp(Math.round(2.6 - .5*nx + .85*ny) + weave - 1 + (z > BASKET.h - .1 ? 1 : 0), 0, 4)]);
}
for (let a = 0; a < 6.283; a += .05) for (let q = 0; q <= BASKET.r; q += step)
  plot(BASKET.x + Math.cos(a)*q, BASKET.y + Math.sin(a)*q, BASKET.h - .04, rampOf(DARK)[1]);
castShadow(BASKET.x, BASKET.y, .5, BASKET.r);
```

### 4.1 编织纹

```js
const weave = (Math.floor(z * 8) + Math.floor(t * 7)) % 2;
```

**高度分 8 档 × 周向分 7 档，两组条纹交错** → 网格状编织纹。
比单一的横向条纹更像藤编。

### 4.2 圆柱体的亮度

```js
Math.round(2.6 - .5*nx + .85*ny)
```

与 `roundTower` 同一个公式（`stari-most:162`）：`l = -.5*nx + .85*ny` 是法线点乘光向。

### 4.3 边缘加固

第二段循环在 `z = BASKET.h - .04` 处画一圈深色边——**篮口的包边**，让篮子有厚度。

---

## 5. `cloth` 织物（衣物）——最复杂的一类道具

laundry 的衣物是参考项目里最精细的道具：**带形变、有状态机、能被拖拽、能被风吹走**。

### 5.1 衣物规格表

```js
// 参考：laundry:54-60
const KINDS = {
  sheet:    { w: 3,   h: 2.4,  value: 5, speed: 6.5 },
  towel:    { w: 1.5, h: 1.6,  value: 3, speed: 9 },
  shirt:    { w: 1.9, h: 1.75, value: 3, speed: 10 },
  trousers: { w: 1.25, h: 2.1,  value: 3, speed: 10 },
  sock:     { w: .5,  h: .8,   value: 1, speed: 18 },
};
```

| 字段 | 含义 |
|------|------|
| `w`, `h` | 世界尺寸（宽度/高度） |
| `value` | 得分 |
| `speed` | 拖动速度（大件慢，小件快） |

### 5.2 轮廓裁剪

```js
// 参考：laundry:226-232
const inside = (item, u, v) => {
  const w = item.w, h = item.h, a = Math.abs(u);
  if (item.kind === 'shirt') return a < w * .3 || v < h * .32 + (a - w * .3) * -.3;
  if (item.kind === 'trousers') return v < h * .32 || a > .06;
  if (item.kind === 'sock') return v < h * .62 ? a < w * .3 : u > -w * .3;
  return true;
};
```

`u` = 横向偏移（-w/2 .. w/2），`v` = 纵向（0 .. h）。

| 种类 | 轮廓 |
|------|------|
| `sheet`（床单） | 整块矩形 |
| `shirt`（衬衫） | 衣身 `v < h*.32`，袖子 `a < w*.3` |
| `trousers`（裤子） | 上部腰身 `v < h*.32`，下部两条腿 `a > .06` |
| `sock`（袜子） | 上部筒 `a < w*.3`，下部脚尖偏向一侧 |

**这是"用数学函数裁剪像素"的范式**，比逐点画轮廓省事且可参数化。

### 5.3 形变与绘制

```js
// 参考：laundry:233-281
function drawCloth(item, t) {
  const pinned = item.state === 'line' || item.state === 'loose';
  const flying = item.state === 'flying' || item.state === 'falling';
  const flat = item.state === 'ground';
  const gusty = 1 + stormLevel() * .9 + G.gustGlow * 1.2;
  const amp = item.state === 'loose' ? .55 : flying || item.state === 'held' ? .4 : .12 * gusty;
  const speed = item.state === 'loose' ? 9 : 3 + stormLevel() * 2;
  const ramp = rampOf(item.color), alt = rampOf(item.accent);
  const cr = Math.cos(item.rot), sr = Math.sin(item.rot), step = .055;
  const dryness = Math.floor(item.wet * 1.8);
  const trailX = item.state === 'held' ? clamp(item.vx * .05, -.7, .7) : 0;
  for (let u = -item.w/2; u <= item.w/2; u += step) for (let v = 0; v <= item.h; v += step) {
    if (!inside(item, u, v)) continue;
    const wave = u * 3.2 + t * speed + item.phase + v * 1.2;
    const s = Math.sin(wave), c = Math.cos(wave);
    let px, py, pz;
    if (flat) {
      px = item.x + u; py = item.y + v - item.h/2; pz = .05 + (s+1)*.03;   // 落地：平摊
    } else {
      const reach = pinned ? v / item.h + .12 : 1;
      px = item.x + u*cr - v*sr - trailX*v;    // ← rot 旋转
      py = item.y + s * amp * reach;           // ← 波浪
      pz = item.z - v*cr - u*sr;               // ← rot 旋转
      if (pz < .05) pz = .05;
    }
    const level = clamp(3 + Math.round(c * 1.1) - dryness, 0, 4);
    const stripe = item.stripes && Math.floor((item.kind === 'sheet' ? u*2.4 : v*5) + 40) % 2;
    const p = project(px, py, pz), ix = p.sx|0, iy = p.sy|0;
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
    const i = iy * W + ix;
    if (p.d <= zb[i]) continue;
    zb[i] = p.d;
    pix[i] = (stripe ? alt : ramp)[level];
    itemBuf[i] = item.id;      // ← 记录归属，供点击拾取
  }
  // ... 别针/夹子、阴影
}
```

### 5.4 三个关键手法

**① 波浪形变**

```js
const wave = u * 3.2 + t * speed + item.phase + v * 1.2;
py = item.y + Math.sin(wave) * amp * reach;
```

- `u * 3.2` = 空间频率（横向有几个波）
- `t * speed` = 时间频率
- `item.phase` = 每个衣物的相位差（避免同步）
- `v * 1.2` = 纵向也有相位差（布料自然下垂）
- `reach` = 固定端不动、末端摆幅最大

**② 旋转**

```js
px = item.x + u*cr - v*sr;
pz = item.z - v*cr - u*sr;
```

二维旋转作用在 (u,v) 平面上。注意 `pz` 也要算，这样绕世界 y 轴的旋转才会正确。

**③ 湿度的视觉表现**

```js
const dryness = Math.floor(item.wet * 1.8);
const level = clamp(3 + Math.round(c * 1.1) - dryness, 0, 4);
```

湿了 → 亮度索引整体下调 → 变暗。**不用换颜色**，只降亮度，这样保持了色阶体系。

### 5.5 挂衣绳的垂弧

```js
// 参考：laundry:82
const lineZ = x => LINE_Z - .22 * (1 - (x / POLE_X) ** 2);
```

**抛物线垂弧**：两端固定在 `LINE_Z`，中间下垂 `.22`。
绳子的画法是逐点 `plot()`：

```js
// 参考：laundry:166
for (let x = -POLE_X; x <= POLE_X; x += .04) plot(x, y, lineZ(x), rampOf(ROPE)[3]);
```

### 5.6 衣夹

```js
// 参考：laundry:267-273
if (pinned) {
  const n = item.kind === 'sock' ? 1 : 2;
  for (let k = 0; k < n; k++) {
    const a = n === 1 ? 0 : (k ? .42 : -.42) * item.w;
    plot(item.x + a, item.y + .04, item.z + .06, item.state === 'loose' ? rgb(255,214,10) : rgb(120,92,62));
  }
}
```

**松动的衣物用黄色夹子标记**（`rgb(255,214,10)`）——这是 gameplay 的视觉提示，同时纯装饰也成立。

### 5.7 拾取缓冲（点击拾取的通用做法）

```js
// 参考：laundry:72, 575-587
const itemBuf = new Uint16Array(W * H);
// 绘制时：itemBuf[i] = item.id;
// 拾取时：
function pickAt(sx, sy) {
  for (let radius = 0; radius <= 6; radius++) {
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
      const ix = Math.round(sx) + dx, iy = Math.round(sy) + dy;
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
      const id = itemBuf[iy * W + ix];
      if (id) return G.items[id - 1];
    }
  }
  return null;
}
```

**按半径逐圈搜索**（方环），从精确命中逐渐放宽到 6 像素。
小物件（袜子）在手机上才点得中。

---

## 6. `racket` 球拍

见 [figures.md §5](figures.md)。要点：
- 拍柄 = 手 → 手 + 方向 × .32，半径 .05
- 拍面 = 手 + 方向 × .66，半径 .22
- 拍面中心再加一个 `.13` 的高光球

---

## 7. 道具摆放规范（从参考项目总结）

### 7.1 位置与比例

| 规则 | 说明 |
|------|------|
| 道具贴地时 `z0 = 0` | `box()` / `capsule()` 的底面在 z=0 |
| 球贴地时 `z = r` | 球心高度 = 半径 |
| 道具尺寸按人物比例定 | 人物高 1.9，桌子高 ~.7，箱子高 .5～.7 |

### 7.2 每个静态道具都要有阴影

```js
// 参考：balote:146-147
castShadow(3.35, -5.1, .3, .5);      // 底部投影
castShadow(3.35, -5.1, .8, .14);      // 顶部投影（半径更小）
```

**体积大的物体要投多层影子**（底大顶小），模拟体积感。

### 7.3 静态道具在 bake 时画，动态道具每帧画

| 类型 | 时机 | 参考 |
|------|------|------|
| 场景里的长椅、板条箱、盆栽 | `bake()` | `balote:135-141` |
| 玩家手上的球 | `draw()` | `balote:409` |
| 篮子里堆的衣物 | `draw()` | `laundry:283-288` |

### 7.4 堆叠的物品

```js
// 参考：laundry:283-288
function drawPile() {
  const banked = G.items.filter(i => i.state === 'basket');
  banked.forEach((item, k) => {
    const a = hash(k, 51) * 6.28, d = hash(k, 52) * BASKET.r * .55;
    sphere(BASKET.x + Math.cos(a)*d, BASKET.y + Math.sin(a)*d,
           BASKET.h + Math.min(1.1, k*.06) + hash(k, 53)*.2,
           item.kind === 'sock' ? .2 : .42, item.color, 'solid');
  });
}
```

**用 `hash(k, seed)` 而不是 `Math.random()`** —— 每次刷新位置一样，看起来是"堆好的"而不是"乱的"。
堆叠高度 `Math.min(1.1, k*.06)` 有上限，堆太高会超出篮子。

### 7.5 散落物品的确定性摆放

```js
// 参考：balote:221-226（石头）
for (let k = 0; k < 44; k++) {
  const y = -9.6 + 19.2 * hash(k, 21), side = k % 2 ? 1 : -1, r = .35 + hash(k, 22) * .7;
  rocks.push([side * (riverHalf(y) + (hash(k, 23) - .3) * 1.2), y, r]);
}
```

`hash(k, seed)` 三个不同的 seed 分别控制：位置、尺寸、抖动。**同一个 k 永远得到同一组参数**。

---

## 8. 道具速查表

| 道具 | 构成 | 参考 |
|------|------|------|
| 球 | `sphere(..., 'gloss')` + 两层阴影 | `balote:412` |
| 瓶子 | 竖直 `capsule(r0>r1)` | `balote:141` |
| 木箱 | `box()` + 不同 seed | `balote:139` |
| 板条围板 | 多个 3 单位 `box()` 交替色 | `balote:127` |
| 藤篮 | 圆周扫掠 + `weave` 编织纹 + 包边 | `laundry:170` |
| 衣物 | `inside()` 裁剪 + 波浪 + 旋转 | `laundry:233` |
| 球拍 | 拍柄 capsule + 拍面 sphere | `tie-break:499` |
| 交通锥 | 锥形 capsule + 按 z 分色 | `mini-ramp:202` |
| 长椅 | 3 个 `box()`（座/靠背/腿） | `balote:135-137` |
| 盆栽 | 花盆 box + 14 个球 | `laundry:150` |
| 遮阳伞/天线 | 竖杆 plot + 横杆 plot | `laundry:147` |
| 网袋球 | 9 个小球散落 | `tie-break:170` |
| 野餐布 | 格子布 | `demo/autumn.js:57` |
| 甲壳虫车 | 胶囊车身 + 半球车篷 + 4 轮 + 警灯 | `demo/village/road.js` |

---

## 8b. `beetle-car` 小甲壳虫（秋日山村）

| 项 | 内容 |
|----|------|
| **来源** | `demo` `village/road.js` |
| **状态** | ✅ 已验证（`tools/village-test.mjs` 断言"汽车在行驶"） |

### 形态

圆润的黄色甲壳虫：胶囊车身 + 半球形车篷 + 四个深色轮子 +
车头一对圆大灯 + **车顶红色警灯（2Hz 闪烁）**。

### 参数组 `k/speed/lateralRatio/t`

| 参数 | 默认 | 区间 | 作用 |
|------|------|------|------|
| `k` | `halfW / 2.4` | — | 车身缩放，**按路宽自动等比** |
| `speed` | .07 | .03～.15 | 沿路的行驶速度（t/秒）|
| `lateralRatio` | .45 | 0～.8 | 横向偏移（按 `halfW` 比例）|
| `t` | 0～1 | — | 沿路位置参数 |

### 关键算法

**① 局部坐标系**

```js
const fx = Math.cos(yaw), fy = Math.sin(yaw), sx = -fy, sy = fx;
const P = (a, b, c) => [cx + (fx*a + sx*b), cy + (fy*a + sy*b), c];
// a = 前后（正 = 车头），b = 左右，c = 高度
```

`yaw = Math.atan2(tangent.y, tangent.x)`，即**永远沿路的切向**。

**② 车窗不能�� `plot()` 画**

引擎的 `sphere()` 是"屏幕圆 + 伪造深度"（`d = 球心深度 + r·nz`），
不是真实球面深度。所以车窗要在屏幕圆内**反解法线后直写 `pix[]`**。

**③ 车身必须用 `solid` 不能用 `gloss`**

`rampOf()` 的 0 档是**褐色** (80,64,40)。`gloss` 下球体下半部落进这档，
黄车身变成"发褐的脏黄"。`solid` 把下限夹到 1 档。

**④ 警灯闪烁**

```js
const flash = Math.floor(time * 4) % 2 === 0;   // 2Hz
```

### 移植清单

1. 需要 `Road` 几何（切向/法向/投影），见 `demo/village/road.js`
2. 车身用 `capsule` + `sphere`，阴影用 `castShadow` 两层（投影 + 接触影）
3. 横向偏移按 `halfW` **比例**算，别写死绝对值（路宽会变）

### 坑

1. **`plot()` 画不了车窗** —— 见 §②
2. **`gloss` 会让黄车发褐** —— 见 §③
3. **`BEACON` 是打包 number**，`rampOf()` 只吃数组 → 直接传会抛
   `Invalid value used as weak map key`。球体用的颜色要另开 `[r,g,b]` 数组版
4. **`ASPHALT` 是数组数组**（4 档成品灰），不能走 `rampOf`
5. 虚线要窄（`LINE_HW=.22`）—— 按 `halfW` 比例画会把整条路涂成黄色
6. 顶部 `const ROAD` 会和 `terrain.js` 撞名 → SyntaxError 全页挂掉。
   road.js 的实现全包在 IIFE 里 + 运行时 `typeof ROAD` 探测

---

## 9. 移植清单

| 优先级 | 项 | 说明 |
|--------|----|------|
| 高 | 球的两层阴影 | demo 的 `demo/demo.js` 已有球，但阴影只有一层（需核对） |
| 高 | 板条围板 / 交替色块 | 极低成本，画面立刻有"手工搭建"感 |
| 中 | 藤篮（编织纹） | demo/autumn.js 有篮子但是简化版 |
| 中 | 堆积物品的确定性摆放 | `hash` 而非 `random` |
| 中 | `itemBuf` 拾取缓冲 | 若 demo 要做可交互物件 |
| 低 | 织物形变系统 | 复杂度高，需要状态机 |
| 低 | 球拍附着 | 见 figures.md |

**移植注意**

1. `gloss` 高光写死在 `rgb(255,250,232)`，是**暖白**，不是纯白——纯白会显得刺眼。
2. `castShadow` 的 `dither` 参数：静态阴影用默认 `.4`（边缘柔），动态阴影用 `0`（边缘锐）。
3. 道具的 `box()` seed 必须唯一，否则两个箱子的木纹一模一样，一眼假。
4. 散落物品用 `hash` 不用 `random`：确定性是"看起来精心摆放"和"看起来随机乱放"的分界线。

## 10. 待实现道具的设计要点

以下是注册表里标 `📐` 的道具。每个该怎么接进来。

### `lamp` 路灯

**骨架**：直杆 + 顶部灯头（球形灯罩）+ 底座。

| 参数 | 说明 |
|------|------|
| `height` | 杆高（2.5～5） |
| `headR` | 灯罩半径（.2～.5） |
| `lit` | 是否点亮 |
| `base` | 底座半径（0 = 无底座） |

实现：杆用 `capsule`（半径 .06 → .05），灯罩用 `sphere`，
点亮时灯罩用暖白 + 下方一圈 `castShadow` 之外的柔光点。
底座用 `sphere` 压扁做锥台。
**与 `tin-lamp-post` 的区别**：没有悬臂，灯直接在杆顶 ——
骨架不同，值得独立 ID。

### `sign` 路牌

**骨架**：细杆 + 顶端的矩形牌面。

| 参数 | 说明 |
|------|------|
| `height` | 杆高（1.2～2.5） |
| `boardW` | 牌面宽（.6～1.8） |
| `boardH` | 牌面高（.3～.8） |
| `text` | 牌面是否有文字（1 = 有横线示意） |

实现：杆 `capsule`；牌面用 `plot` 逐点画矩形（正面朝 y+ 方向，
要凸出杆一点否则被深度盖住）；牌面颜色用高对比双色（深底浅字）。

## tin-lamp-post — 铁皮路灯

| 项 | 内容 |
|---|---|
| **ID** | `tin-lamp-post` |
| **来源** | `demo/kit/props.js` · `KIT.register` · studio 生成 |
| **形态** | 木杆挑出弯铁臂，臂端挂一盏铁皮锥罩暖光灯，夜里透出暖黄光晕并在地上洒出光斑 |
| **分类** | 道具 |

### 参数

| 参数 | 默认 | 区间 | 步进 | 说明 |
|------|------|------|------|------|
| `height` | 4.2 | 2.6 ~ 6 | 0.1 | 木杆高度（含灯的总高约 height + 0.1） |
| `arm` | 0.95 | 0.5 ~ 1.6 | 0.05 | 铁臂从杆身伸出的水平距离 |
| `lampSize` | 0.44 | 0.3 ~ 0.72 | 0.02 | 灯罩口径，同时带动灯泡与笼骨尺寸 |
| `glow` | 0.7 | 0 ~ 1 | 0.05 | 空中光晕密度与地面光斑半径 |
| `lit` | 1 | 0 ~ 1 | 1 | 0 = 熄灯（灯泡变暗铁球） / 1 = 点灯 |
| `weathered` | 0.45 | 0 ~ 1 | 0.05 | 铁件锈斑比例 |

### 碰撞体

`{"type":"cylinder","radius":0.28,"height":4.2}`

### 移植清单

- 代码：`demo/kit/props.js`
- 注册表：`docs/kit/registry.md` · 道具节
- 依赖引擎：`demo/engine.js` 的 `sphere/capsule/box/plot/rampOf/hash/noise`

### 实现说明

#### 为什么不能复用已有构件
现有 prop 里最接近的是 `stone-lantern`（石灯），但那是**落地石质矮灯**：无杆、无悬臂、石料砌体。本需求是「木杆 + 弯铁臂 + 悬挂灯」的三段骨架，结构完全不同，参数组合做不出来，必须新建 ID。`fence`/`crate`/`wood-house` 也都不含悬臂挑挂结构。

#### 实现要点
1. **锥形铁皮罩**：没有圆锥图元，用三层宽度递增的 `box` 叠成阶梯锥（LS×0.30 / 0.42 / 0.52），上层盖住下层顶面，等距投影下读作一个倒扣的铁皮斗笠。像素画里这比真圆锥更锐利。
2. **灯泡必须露在罩外**：罩体是实心 box，若把发光球塞进罩内会被完全遮死。所以罩只做上半部，灯泡挂在罩底以下，靠四根 `capsule` 笼骨把它包成灯笼。
3. **「发光」用三层同心球**：外圈 `warm[2]` 大半径做柔化边 → 主体 `warm[4]` 最亮 → 左上偏移一个 `core[4]` 小白球当高光核。三层叠起来就有过曝的观感。
4. **光晕分两层**：空中用球面参数化的散点（`plot`），地面用 7 圈极坐标环撒点，亮度按半径衰减、密度按亮度反向抖动，避免规则感。地面光斑中心落在灯正下方 `(ARM, 0)`，会自然盖住杆脚，强化「照亮」的读法。
5. **铁臂几何**：三段折线近似弯臂（从杆身 H-0.72 斜升到 H-0.10，再平伸到灯位），加一根从 H-1.45 斜拉到臂中的细撑杆做成三角受力，这是路灯最容易出戏的细节。
6. **锈斑**：`capsule` 的 `colorOf(t)` 里用 `round(t*11)` 做分段哈希，让锈点是沿杆轴向成片的，而不是满屏噪点。

#### 坑
- **灯罩 z 必须对齐**：`lz = top - 0.04` 就是铁臂末端 `p2` 的 z，改一处忘了另一处会看到灯罩和臂断开。
- **地面光斑的 z 要抬高到 0.03**：和 `ctx.shadow` 的影子同层会被抢深度，看起来像影子盖住了灯光。同时把 `ctx.shadow` 放在光斑之前调用，双保险。
- **光斑不必手动剔除背面点**：`plot` 有深度测试，被灯罩/灯泡挡住的空中光晕点会自动消失。
- **`lit = 0` 时别直接不画灯泡**：会留出一个空洞，所以换成 `iron[1]` 的暗铁球。
- **`glow` 调到 0 附近时**光斑环仍在跑循环，用 `P.glow > 0.02` 整块跳过，省掉每帧约 180 次 `plot`。
- **`lampSize` 放大到 0.72 时**笼骨会略微穿出罩沿，这是有意为之的「笼比罩宽」读法；若想收窄，把 `LS * 0.34` 改成 `LS * 0.30`。

#### 与场景配合
默认 `height 4.2` 让灯挂在离地约 3.5，正好高于一个 1.8 高的人。夜间场景里可把 `glow` 拉到 1.0 并配一个低亮度的全局环境色，本构件的 `warm` 色阶（255,190,92 基色）会与冷调夜空形成足够的色温对比。

#### 规模
`draw` 约 95 行，含 params 与注册约 120 行，在 40~120 区间内；无顶层 const、无 Math.random、无模块语法。

### 实现

```js
KIT.register({
  id: 'tin-lamp-post',
  name: '铁皮路灯',
  category: 'prop',
  desc: '木杆挑出弯铁臂，臂端挂一盏铁皮锥罩暖光灯，夜里透出暖黄光晕并在地上洒出光斑',
  params: {
    height:    { def: 4.2,  min: 2.6, max: 6.0, step: 0.1,  desc: '木杆高度（含灯的总高约 height + 0.1）' },
    arm:       { def: 0.95, min: 0.5, max: 1.6, step: 0.05, desc: '铁臂从杆身伸出的水平距离' },
    lampSize:  { def: 0.44, min: 0.30, max: 0.72, step: 0.02, desc: '灯罩口径，同时带动灯泡与笼骨尺寸' },
    glow:      { def: 0.7,  min: 0,   max: 1,   step: 0.05, desc: '空中光晕密度与地面光斑半径' },
    lit:       { def: 1,    min: 0,   max: 1,   step: 1,    desc: '0 = 熄灯（灯泡变暗铁球） / 1 = 点灯' },
    weathered: { def: 0.45, min: 0,   max: 1,   step: 0.05, desc: '铁件锈斑比例' },
  },
  collision: { type: 'cylinder', radius: 0.28, height: 4.2 },

  draw(ctx) {
    const P = ctx.params, S = ctx.seed;
    const H = P.height, ARM = P.arm, LS = P.lampSize;
    const wood = ctx.rampOf([106, 74, 46]);
    const iron = ctx.rampOf([92, 98, 106]);
    const rust = ctx.rampOf([142, 88, 54]);
    const warm = ctx.rampOf([255, 190, 92]);
    const core = ctx.rampOf([255, 244, 208]);
    const pick = (k, n) => ctx.clamp(Math.floor(ctx.hash(k, S) * n), 0, n - 1);
    const poleR = (z) => 0.15 + (0.10 - 0.15) * ctx.clamp(z / H, 0, 1);
    const ironOf = (t) => {
      const w = ctx.hash(Math.round(t * 11) + 3, S);
      return w > 0.86 - P.weathered * 0.18 ? rust[2 + pick(9, 2)] : iron[2 + pick(4, 2)];
    };

    // ---- 石座 / 木杆 / 铁箍 / 杆顶帽 ----
    ctx.box(-0.28, -0.28, 0, 0.28, 0.28, 0.15, ctx.rgb(98, 96, 92), S + 3);
    ctx.capsule([0, 0, 0.14], [0, 0, H], 0.15, 0.10, (t) => {
      const n = ctx.noise(t * 9 + ctx.hash(2, S) * 5, 2.5);
      return wood[ctx.clamp(Math.floor(t * 3.2 + n * 1.7), 0, 4)];
    }, 'rough');
    for (let i = 0; i < 2; i++) {
      const bz = H * (0.38 + i * 0.34);
      const br = poleR(bz) + 0.015;
      ctx.capsule([0, 0, bz], [0, 0, bz + 0.06], br, br, ironOf, 'rough');
    }
    ctx.sphere(0, 0, H + 0.05, 0.09, iron[3], 'rough');

    // ---- 弯铁臂 + 斜撑 ----
    const top = H - 0.10;
    const p0 = [-0.02, 0, top - 0.62];
    const p1 = [ARM * 0.46, 0, top];
    const p2 = [ARM, 0, top - 0.04];
    ctx.capsule(p0, p1, 0.075, 0.065, ironOf, 'rough');
    ctx.capsule(p1, p2, 0.065, 0.055, ironOf, 'rough');
    ctx.capsule([0, 0, top - 1.35], [ARM * 0.50, 0, top - 0.10], 0.032, 0.026, ironOf, 'rough');

    // ---- 灯罩：三层递增阶梯，叠出锥形铁皮罩 ----
    const lx = ARM, lz = top - 0.04;
    const h = LS * 0.22;
    const w0 = LS * 0.30, w1 = LS * 0.42, w2 = LS * 0.52;
    ctx.box(lx - w0, -w0, lz, lx + w0, w0, lz + h * 0.8, iron[4], S + 11);
    ctx.box(lx - w1, -w1, lz - h, lx + w1, w1, lz, iron[3], S + 12);
    ctx.box(lx - w2, -w2, lz - h * 2, lx + w2, w2, lz - h, iron[2], S + 13);

    // ---- 灯泡：三层同心球做出「发光」错觉 ----
    const gy = lz - h * 2 - LS * 0.30;
    const gr = LS * 0.40;
    if (P.lit > 0.5) {
      ctx.sphere(lx, 0, gy, gr * 1.10, warm[2], 'gloss');
      ctx.sphere(lx, 0, gy, gr, warm[4], 'gloss');
      ctx.sphere(lx - gr * 0.20, -gr * 0.16, gy + gr * 0.20, gr * 0.5, core[4], 'gloss');
    } else {
      ctx.sphere(lx, 0, gy, gr, iron[1], 'rough');
    }

    // ---- 四根笼骨 + 底坠 ----
    const cageBot = gy - gr * 0.80;
    for (let k = 0; k < 4; k++) {
      const a = Math.PI * 0.25 + k * Math.PI * 0.5;
      const cx = lx + Math.cos(a) * LS * 0.34;
      const cy = Math.sin(a) * LS * 0.34;
      ctx.capsule([cx, cy, lz - h * 2], [cx * 0.94 + lx * 0.06, cy * 0.94, cageBot],
                  0.024, 0.022, ironOf, 'rough');
    }
    ctx.sphere(lx, 0, cageBot - 0.03, 0.05, iron[3], 'rough');

    ctx.shadow(0.45 + ARM * 0.4, 1, 0.5);

    // ---- 夜间光晕：空中球面散点 + 地面椭圆光斑 ----
    if (P.lit > 0.5 && P.glow > 0.02) {
      const n = 16 + Math.round(P.glow * 20);
      for (let i = 0; i < n; i++) {
        const a = ctx.hash(i * 3 + 1, S) * 6.2832;
        const e = (ctx.hash(i * 3 + 2, S) - 0.5) * 2.4;
        const rr = LS * (0.7 + ctx.hash(i * 3 + 3, S) * 1.6) * (0.55 + P.glow * 0.8);
        const b = 1 - rr / (LS * (1.9 + P.glow * 1.6));
        if (b <= 0.08) continue;
        ctx.plot(lx + Math.cos(a) * Math.cos(e) * rr, Math.sin(a) * Math.cos(e) * rr,
                 gy + Math.sin(e) * rr, warm[ctx.clamp(Math.round(b * 4.2), 0, 4)]);
      }
      const R = 0.8 + P.glow * 1.2;
      for (let ri = 1; ri <= 7; ri++) {
        const rr = R * (ri / 7);
        const cnt = 6 + ri * 5;
        const b = 1 - (ri / 7) * 0.88;
        for (let k = 0; k < cnt; k++) {
          if (ctx.hash(ri * 31 + k, S + 5) > 0.25 + (1 - b) * 0.55) continue;
          const ang = (k / cnt) * 6.2832 + ctx.hash(ri * 13, S) * 6.2832;
          const j = 0.86 + ctx.hash(ri * 23 + k, S) * 0.26;
          ctx.plot(lx + Math.cos(ang) * rr * j, Math.sin(ang) * rr * j, 0.03,
                   warm[ctx.clamp(Math.round(b * 5.2) - 1, 0, 4)]);
        }
      }
    }
  },
});
```

## lamp — 路灯

| 项 | 内容 |
|---|---|
| **ID** | `lamp` |
| **来源** | `demo/kit/props.js` · `KIT.register` · studio 生成 |
| **形态** | 直杆顶一颗球形灯罩的铸铁路灯，可点亮 |
| **分类** | 道具 |

### 参数

| 参数 | 默认 | 区间 | 步进 | 说明 |
|------|------|------|------|------|
| `height` | 3.6 | 2.5 ~ 5 | 0.1 | 杆高（世界单位，1 ≈ 人高） |
| `headR` | 0.32 | 0.2 ~ 0.5 | 0.01 | 灯罩半径 |
| `lit` | 1 | 0 ~ 1 | 1 | 是否点亮（1 亮 / 0 灭） |
| `base` | 0.34 | 0 ~ 0.6 | 0.02 | 底座半径，0 为无底座 |

### 碰撞体

`{"type":"cylinder","radius":0.24,"height":4}`

### 移植清单

- 代码：`demo/kit/props.js`
- 注册表：`docs/kit/registry.md` · 道具节
- 依赖引擎：`demo/engine.js` 的 `sphere/capsule/box/plot/rampOf/hash/noise`

### 实现说明

骨架严格按配方卡三段式：底座（球压扁的锥台）→ 直杆 capsule（.06→.05）→ 顶部球形灯罩，无悬臂——这是它与 tin-lamp-post 的骨架差异。

实现要点：
1) 底座用「球心压到半径 1/3 高度」的球，只露上半球，再做一层 0.62 倍的小球叠出阶梯锥台；BASE≤0.005 时整段跳过，杆改为从 z=0.02 起。
2) 杆底插入底座内部（BASE*0.6），避免任何参数组合下出现浮空缝隙。
3) 灯罩球心 = H + headR*0.62，使球底低于杆顶约 0.38*headR，保证 headR 取最小值 0.2、height 取最大值 5 时仍然重叠。
4) 点亮时的柔光用两层错位圆环 plot 点：内环靠灯罩（亮暖白）、外环更低更大（橙黄），点走引擎深度缓冲，被杆与灯罩自然遮挡，产生前后层次；半径用 ctx.hash 抖动，非规则圆环。castShadow 只负责地面投影，光点不参与阴影系统。
5) 颜色全部在 draw 内定义（遵守「顶层不放 const」）；铁三档通道差 18~22，防止 Bayer 抖动读成棋盘。

坑：
- sphere/capsule 只吃 [r,g,b] 基色数组，plot 只吃 ctx.rgb 打包值，两套颜色变量分开命名避免混用。
- colorOf 的 z 按局部高度处理（与配方卡示例一致），杆上段提亮一档即可，不做世界坐标运算。
- lit 用 >=0.5 判定，防编辑器把 0/1 存成浮点。

与已有构件差异：tin-lamp-post 有横向悬臂 + 吊挂灯头；lamp 无悬臂、灯罩直接坐在杆顶，骨架不同故独立 ID。

### 实现

```js
KIT.register({
  id: 'lamp',
  name: '路灯',
  category: 'prop',
  desc: '直杆顶一颗球形灯罩的铸铁路灯，可点亮',
  params: {
    height: { def: 3.6, min: 2.5, max: 5, step: 0.1, desc: '杆高（世界单位，1 ≈ 人高）' },
    headR: { def: 0.32, min: 0.2, max: 0.5, step: 0.01, desc: '灯罩半径' },
    lit: { def: 1, min: 0, max: 1, step: 1, desc: '是否点亮（1 亮 / 0 灭）' },
    base: { def: 0.34, min: 0, max: 0.6, step: 0.02, desc: '底座半径，0 为无底座' },
  },
  collision: { type: 'cylinder', radius: 0.24, height: 4 },
  draw(ctx, inst) {
    const X = ctx.x;
    const Y = ctx.y;
    const H = ctx.params.height;
    const HR = ctx.params.headR;
    const BASE = ctx.params.base;
    const lit = ctx.params.lit >= 0.5;

    const IRON_D = [54, 56, 64];
    const IRON = [76, 80, 90];
    const IRON_L = [96, 102, 114];
    const GLASS_OFF = [198, 206, 214];
    const GLASS_LIT = [250, 224, 168];
    const GLOW_HI = [255, 244, 200];
    const GLOW_LO = [238, 176, 96];

    // 1. 底座：球心压到半径 1/3 处，只露上半 → 压扁的锥台
    if (BASE > 0.005) {
      const cz = BASE * 0.32;
      ctx.sphere(X, Y, cz, BASE, IRON_D, 'solid');
      ctx.sphere(X, Y, cz + BASE * 0.52, BASE * 0.62, IRON, 'solid');
    }

    // 2. 直杆：底粗顶细（.06 → .05），上段提亮一档
    const rodBottom = BASE > 0.005 ? BASE * 0.6 : 0.02;
    ctx.capsule(
      [X, Y, rodBottom],
      [X, Y, H],
      0.06,
      0.05,
      (z) => (z > H * 0.55 ? IRON_L : IRON),
      'rough'
    );

    // 3. 灯罩：球心略高于杆顶，球底与杆顶重叠，不悬空
    const headZ = H + HR * 0.62;
    ctx.sphere(X, Y, headZ, HR, lit ? GLASS_LIT : GLASS_OFF, lit ? 'gloss' : 'solid');

    // 4. 点亮：灯罩下方一圈柔光点（plot 走深度测试，前后自然遮挡）
    if (lit) {
      const N = 24;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2 + ctx.hash(i * 5 + 1, ctx.seed) * 0.35;
        const t = ctx.hash(i * 11 + 3, ctx.seed);
        const near = i % 2 === 0;
        const rr = HR * (near ? 1.1 + t * 0.35 : 1.55 + t * 0.55);
        const px = X + Math.cos(a) * rr;
        const py = Y + Math.sin(a) * rr;
        const pz = headZ - HR * (near ? 0.55 + t * 0.6 : 1.1 + t * 0.9);
        const c = near ? GLOW_HI : GLOW_LO;
        ctx.plot(px, py, pz, ctx.rgb(c[0], c[1], c[2]));
      }
    }

    ctx.shadow(Math.max(0.45, HR * 1.7), 1, 0.5);
  },
});
```

## sign — 路牌

| 项 | 内容 |
|---|---|
| **ID** | `sign` |
| **来源** | `demo/kit/props.js` · `KIT.register` · studio 生成 |
| **形态** | 细杆撑起的矩形木牌，正面朝向相机、可带横线示意文字 |
| **分类** | 道具 |

### 参数

| 参数 | 默认 | 区间 | 步进 | 说明 |
|------|------|------|------|------|
| `height` | 1.8 | 1.2 ~ 2.5 | 0.1 | 杆高 |
| `boardW` | 1.1 | 0.6 ~ 1.8 | 0.1 | 牌面宽 |
| `boardH` | 0.5 | 0.3 ~ 0.8 | 0.05 | 牌面高 |
| `text` | 1 | 0 ~ 1 | 1 | 牌面是否有文字（1 = 有横线示意） |

### 碰撞体

`{"type":"cylinder","radius":0.18,"height":2.2}`

### 移植清单

- 代码：`demo/kit/props.js`
- 注册表：`docs/kit/registry.md` · 道具节
- 依赖引擎：`demo/engine.js` 的 `sphere/capsule/box/plot/rampOf/hash/noise`

### 实现说明

按配方卡实现：细杆 capsule + 顶端矩形牌面。三个关键点：(1) 牌面用 plot 逐点写矩形，正面朝 y+ 并相对杆身向相机方向（y+0.09）凸出，否则会被杆的深度测试盖住；(2) 牌面深底 [70,58,44] + 浅字 [222,210,182] 做高对比双色，边框用中间调 [148,126,92]，三条色的通道差都在 10~25 内，不会抖成棋盘格；(3) 牌面高度随 boardH 参数走，文字行数按 boardH 自适应（>0.52 三行，否则两行），每行长度用 ctx.hash 做确定性抖动，保证同一 seed 每次重建一致。与已有立柱类 prop 的差异：牌面是零厚度平面像素板而非 box，因此额外画了顶部/右侧一条薄边来交代厚度。所有绘制坐标都基于 ctx.x / ctx.y 偏移，符合原点铁律；只有函数内的局部 const，没有顶层常量。

### 实现

```js
KIT.register({
  id: 'sign',
  name: '路牌',
  category: 'prop',
  desc: '细杆撑起的矩形木牌，正面朝向相机',
  params: {
    height: { def: 1.8, min: 1.2, max: 2.5, step: 0.1, desc: '杆高' },
    boardW: { def: 1.1, min: 0.6, max: 1.8, step: 0.1, desc: '牌面宽' },
    boardH: { def: 0.5, min: 0.3, max: 0.8, step: 0.05, desc: '牌面高' },
    text: { def: 1, min: 0, max: 1, step: 1, desc: '牌面是否有文字（1 = 有横线示意）' },
  },
  collision: { type: 'cylinder', radius: 0.18, height: 2.2 },
  draw(ctx, inst) {
    const P = ctx.params;
    const H = P.height;
    const W = P.boardW;
    const BH = P.boardH;
    const X = ctx.x;
    const Y = ctx.y;

    // 木杆：略向牌面反方向倾斜的锥形杆
    const POLE_LO = [92, 74, 56];
    const POLE_HI = [122, 100, 78];
    ctx.capsule([X, Y, 0], [X, Y, H + BH * 0.5], 0.075, 0.055,
      z => z > H * 0.6 ? POLE_HI : POLE_LO, 'rough');

    // 牌面：中心高度略低于杆顶，正面朝 y+，整体前凸避免被杆遮
    const cz = H + BH * 0.5 - BH * 0.18;
    const cy = Y + 0.09;          // 向相机方向凸出
    const BOARD = [70, 58, 44];    // 深色底
    const BOARD_TOP = [86, 72, 54];
    const TRIM = [148, 126, 92];   // 浅色边框
    const TEXT = [222, 210, 182];  // 浅色字

    const x0 = -W * 0.5;
    const x1 = W * 0.5;
    const z0 = cz - BH * 0.5;
    const z1 = cz + BH * 0.5;
    const stepX = 0.055;
    const stepZ = 0.05;

    // —— 牌面本体：逐点画矩形（plot 直接带深度测试）——
    for (let sx = x0; sx <= x1 + 1e-6; sx += stepX) {
      for (let sz = z0; sz <= z1 + 1e-6; sz += stepZ) {
        // 顶边一档亮，越往下越暗，做出木牌的面感
        const t = (sz - z0) / BH;
        const shade = t > 0.82 ? BOARD_TOP : BOARD;
        ctx.plot(X + sx, cy, cz + (sz - cz), ctx.rgb(shade[0], shade[1], shade[2]));
      }
    }

    // —— 边框：上下左右各一条浅色线 ——
    for (let sx = x0; sx <= x1 + 1e-6; sx += stepX) {
      ctx.plot(X + sx, cy, z0, ctx.rgb(TRIM[0], TRIM[1], TRIM[2]));
      ctx.plot(X + sx, cy, z1, ctx.rgb(TRIM[0], TRIM[1], TRIM[2]));
    }
    for (let sz = z0; sz <= z1 + 1e-6; sz += stepZ) {
      ctx.plot(X + x0, cy, sz, ctx.rgb(TRIM[0], TRIM[1], TRIM[2]));
      ctx.plot(X + x1, cy, sz, ctx.rgb(TRIM[0], TRIM[1], TRIM[2]));
    }

    // —— 文字：2~3 行横线示意（按宽度自适应）——
    if (P.text >= 0.5) {
      const lines = BH > 0.52 ? 3 : 2;
      const margin = W * 0.16;
      const usable = W - margin * 2;
      for (let i = 0; i < lines; i++) {
        const lz = z0 + BH * (0.26 + i * (0.48 / Math.max(1, lines - 1)));
        const lw = usable * (0.55 + ctx.hash(i * 7 + 1, ctx.seed) * 0.4);
        const lx0 = -lw * 0.5;
        const lx1 = lw * 0.5;
        for (let sx = lx0; sx <= lx1 + 1e-6; sx += stepX * 0.7) {
          ctx.plot(X + sx, cy + 0.001, lz, ctx.rgb(TEXT[0], TEXT[1], TEXT[2]));
        }
      }
    }

    // —— 牌面顶部与右侧的薄边，强化厚度 ——
    const EDGE = [104, 88, 66];
    for (let sx = x0; sx <= x1 + 1e-6; sx += stepX) {
      ctx.plot(X + sx, cy - 0.01, z1 + 0.03, ctx.rgb(EDGE[0], EDGE[1], EDGE[2]));
    }
    for (let sz = z0; sz <= z1 + 1e-6; sz += stepZ) {
      ctx.plot(X + x1 + 0.02, cy - 0.01, sz, ctx.rgb(EDGE[0], EDGE[1], EDGE[2]));
    }

    // —— 杆底小石堆/基座 ——
    ctx.sphere(X, Y, 0.06, 0.15, [104, 98, 88], 'rough');

    ctx.shadow(0.42, 1, 0.5);
  },
});
```

## fence — 木栅栏

| 项 | 内容 |
|---|---|
| **ID** | `fence` |
| **来源** | `demo/kit/props.js` · `KIT.register` · studio 手写 |
| **形态** | 一排等距木桩 + 上下两道横杆 |

### 参数

| 参数 | 默认 | 区间 | 步进 | 说明 |
|------|------|------|------|------|
| `length` | 4.0 | 1 ~ 12 | 0.2 | 沿 x 方向总长 |
| `height` | 0.7 | 0.3 ~ 1.6 | 0.05 | 桩高 |
| `spacing` | 0.8 | 0.4 ~ 2 | 0.1 | 桩间距（实取 n=round(len/spacing)+1 根均布） |

### 碰撞体

`{"type":"box","w":4.0,"d":0.16,"h":0.7}` —— 细长条，d 取桩径级别

### 关键算法

- 桩：`capsule` 从地面到 `h*(0.9+hash*0.2)`，顶端参差避免读成尺子量的
- 横杆：一条 `capsule` 贯穿 `h*0.55`，半径 0.05

### 坑

- 桩数必须 `max(2, …)`，否则 length < spacing 时除零
- 碰撞体 w 要跟 length 参数联动改（编辑器里 AI 推断会按参数算）

## stone-lantern — 石灯

| 项 | 内容 |
|---|---|
| **ID** | `stone-lantern` |
| **来源** | `demo/kit/props.js` · `KIT.register` · studio 手写 |
| **形态** | 方形柱身承一方小灯室，顶盖出檐，夜里亮暖光 |

### 参数

| 参数 | 默认 | 区间 | 步进 | 说明 |
|------|------|------|------|------|
| `height` | 1.1 | 0.5 ~ 2.2 | 0.05 | 总高 |
| `lit` | 1 | 0 ~ 1 | 1 | 点亮（灯室变暖黄） |

### 碰撞体

`{"type":"box","w":0.4,"d":0.4,"h":1.1}`

### 关键算法

- 全部 `plot` 方块堆叠：基座（w×1.5）→ 柱（w）→ 灯室（w×1.3）→ 顶盖（w×1.8）
- 灯室亮时直接写暖黄像素，不走色阶 —— 自发光不要明暗

### 坑

- `plot` 逐点画要向 +y 偏 0.01 否则被同位素面吞深度

## well — 圆石井

| 项 | 内容 |
|---|---|
| **ID** | `well` |
| **来源** | `demo/kit/props.js` · `KIT.register` · studio 手写 |
| **形态** | 圆环石砌井口，中间一汪暗井水（无支架吊桶；带支架的见 buildings `well-house`） |

### 参数

| 参数 | 默认 | 区间 | 步进 | 说明 |
|------|------|------|------|------|
| `radius` | 0.55 | 0.3 ~ 1.4 | 0.05 | 井口半径 |
| `height` | 0.5 | 0.2 ~ 1.2 | 0.05 | 井壁高 |

### 碰撞体

`{"type":"cylinder","radius":0.55,"height":0.5}`

### 关键算法

- 井壁：圆周 10 颗 `sphere`（r×0.34）围一圈，中层
- 井口：中心一颗深色 `[38,40,44]` 大球（r×0.62）压出"洞"的读法
- 顶沿：再一圈 10 颗亮档球收口

### 坑

- **sphere 只吃 [r,g,b] 基色数组** —— 最初写了 `rgb(38,40,44)` 打包值，WeakMap 键报错（本项目的第一个颜色类型事故，`engine.js` 的 rampOf 前置检查由此而来）

## wheelbarrow — 苹果手推车

| 项 | 内容 |
|---|---|
| **ID** | `wheelbarrow` |
| **来源** | `demo/kit/props.js` · `KIT.register` · studio 生成 |
| **形态** | 木斗单轮手推车：梯形斗身、木轮、双把手双支腿，斗里堆满红苹果 |
| **分类** | 道具 |

### 参数

| 参数 | 默认 | 区间 | 步进 | 说明 |
|------|------|------|------|------|
| `apples` | 10 | 0 ~ 16 | 1 | 斗里的苹果数量（0 = 空车） |
| `length` | 1 | 0.8 ~ 1.35 | 0.05 | 车斗前后长度倍率 |
| `wheel` | 1 | 0.7 ~ 1.3 | 0.05 | 前轮直径倍率 |

### 碰撞体

`{"type":"cylinder","radius":0.9,"height":1.2}`

### 移植清单

- 代码：`demo/kit/props.js`
- 注册表：`docs/kit/registry.md` · 道具节
- 依赖引擎：`demo/engine.js` 的 `sphere/capsule/box/plot/rampOf/hash/noise`

### 实现说明

骨架与 crate（木箱）完全不同：crate 是封闭方箱，本件有梯形敞口斗、单前轮、双后把手、双支腿，属于新骨架，不是参数变体。

实现要点
1. 梯形斗身：用 5 层逐层外扩的薄 box 堆叠（每层高度 0.104、半宽只差 0.022），阶梯小于 1 像素，视觉上读作连续斜壁；每层颜色由 ctx.hash 在 PLANK / PLANK_MID 间取值，自然形成横向拼板感。
2. 斗沿：四根外扩 0.03 的薄 box 围成方框，中间留口，既强化「斗」的轮廓，也把苹果框在里面。
3. 苹果：12 个铺底（3 列 × 4 行）+ 4 个压顶。铺底用 idx = (i*5)%12 做完整置换，这样只放 4~6 个时也均匀散布而不是全挤在车尾；半径 0.137×(0.9~1.12) 随机，三种红按 hash 分配。苹果球心定在斗沿上方 0.095，球底刚好落在斗内暗底上，露出大半。
4. 轮子：capsule 轴沿 x，做出厚圆盘；再叠一个沿 +x 偏移的小 capsule（半径 0.70×）从盘面凸出，形成「铁箍 + 木轮心」的同心圆。故意不做轮辐——capsule 端盖是半球，贴在端面上的辐条会被完全埋进盘体里看不见。
5. 手推车的三点支撑（前轮 + 两条后支腿）保证停放时斗口水平，符合真实形态。

坑
- capsule 的端盖是半球：轮的可见总半宽是 ww + wR（不是 ww），轮叉必须放到 x > ww + wR 才不会被轮子吞掉。
- 苹果网格的 y 间距必须乘 length，否则把 length 拉到 1.35 时斗尾会露出大片空底。
- 斗沿四根 box 在四角互相重叠，靠引擎深度测试兜住，不要试图让它们严丝合缝——留重叠更安全。
- 苹果最外圈会轻微压到斗沿上（球心在斗沿之上），这是刻意的「冒尖」效果，不是穿模错误。
- 全部坐标基于 ctx.x / ctx.y / ctx.z；随机只用 ctx.hash，无 Math.random。

### 实现

```js
KIT.register({
  id: 'wheelbarrow',
  name: '苹果手推车',
  category: 'prop',
  desc: '木斗单轮手推车：梯形斗身、木轮、双把手双支腿，斗里堆满红苹果',
  params: {
    apples: { def: 10, min: 0, max: 16, step: 1, desc: '斗里的苹果数量（0 = 空车）' },
    length: { def: 1, min: 0.8, max: 1.35, step: 0.05, desc: '车斗前后长度倍率' },
    wheel: { def: 1, min: 0.7, max: 1.3, step: 0.05, desc: '前轮直径倍率' },
  },
  collision: { type: 'cylinder', radius: 0.9, height: 1.2 },

  draw(ctx, inst) {
    const p = ctx.params;
    const L = p.length;
    const WH = p.wheel;
    const X = ctx.x, Y = ctx.y, Z = ctx.z;

    // 木材三档 + 斗沿高光（同类色通道差 ≤ 25）
    const PLANK = [156, 110, 66];
    const PLANK_MID = [138, 96, 56];
    const PLANK_DK = [116, 78, 44];
    const RIM = [172, 126, 80];
    const WOOD_DK = [104, 76, 50];
    const WOOD_LT = [128, 96, 60];

    // 苹果三档
    const APPLE = [182, 50, 44];
    const APPLE_HI = [204, 72, 56];
    const APPLE_DK = [160, 36, 34];

    const hx0 = 0.36, hy0 = 0.63 * L;   // 斗底半宽 / 半长
    const hx1 = 0.47, hy1 = 0.70 * L;   // 斗顶半宽 / 半长
    const zBot = Z + 0.36, zTop = Z + 0.88;

    // 1) 斗身：五层逐层外扩的板条，堆出上宽下窄的梯形斗
    for (let i = 0; i < 5; i++) {
      const t = (i + 1) / 5;
      const hx = ctx.lerp(hx0, hx1, t);
      const hy = ctx.lerp(hy0, hy1, t);
      const z0 = ctx.lerp(zBot, zTop, i / 5);
      const z1 = ctx.lerp(zBot, zTop, (i + 1) / 5);
      const col = ctx.hash(i * 7 + 3, ctx.seed) > 0.45 ? PLANK : PLANK_MID;
      ctx.box(X - hx, Y - hy, z0, X + hx, Y + hy, z1, col, i + 11);
    }

    // 2) 斗内暗底：比斗沿低一点，苹果的落脚面
    ctx.box(X - hx1 + 0.06, Y - hy1 + 0.06, zTop - 0.03,
            X + hx1 - 0.06, Y + hy1 - 0.06, zTop + 0.02, PLANK_DK, 7);

    // 3) 斗沿：四根外扩压条围出斗口
    const rg0 = zTop + 0.01, rg1 = zTop + 0.075;
    const ox = hx1 + 0.03, oy = hy1 + 0.03;
    ctx.box(X - ox, Y + hy1 - 0.11, rg0, X + ox, Y + oy, rg1, RIM, 21);
    ctx.box(X - ox, Y - oy, rg0, X + ox, Y - hy1 + 0.11, rg1, RIM, 22);
    ctx.box(X - ox, Y - hy1 + 0.11, rg0, X - hx1 + 0.11, Y + hy1 - 0.11, rg1, RIM, 23);
    ctx.box(X + hx1 - 0.11, Y - hy1 + 0.11, rg0, X + ox, Y + hy1 - 0.11, rg1, RIM, 24);

    // 4) 苹果：12 个铺底 + 4 个压顶，i*5%12 置换让少量也散得开
    const n = Math.round(p.apples);
    for (let i = 0; i < n; i++) {
      let ax, ay, az;
      if (i < 12) {
        const idx = (i * 5) % 12;
        const c = idx % 3, r = (idx / 3) | 0;
        ax = (c - 1) * 0.25 + (ctx.hash(i * 5 + 1, ctx.seed) - 0.5) * 0.05;
        ay = (r - 1.5) * 0.32 * L + (ctx.hash(i * 5 + 2, ctx.seed) - 0.5) * 0.05;
        az = zTop + 0.17;
      } else {
        const k = i - 12;
        ax = (k % 2 === 0 ? -0.13 : 0.13);
        ay = (k < 2 ? -0.17 : 0.17) * L;
        az = zTop + 0.33;
      }
      const rr = 0.137 * (0.9 + ctx.hash(i + 70, ctx.seed) * 0.22);
      const tone = ctx.hash(i + 90, ctx.seed);
      ctx.sphere(X + ax, Y + ay, az, rr,
                 tone > 0.68 ? APPLE_HI : (tone > 0.22 ? APPLE : APPLE_DK), 'gloss');
    }

    // 5) 两条后支腿
    for (let side = -1; side <= 1; side += 2) {
      ctx.capsule([X + side * 0.27, Y - 0.46 * L, Z + 0.42],
                  [X + side * 0.32, Y - 0.60 * L, Z + 0.02],
                  0.042, 0.036, () => PLANK_MID, 'solid');
    }

    // 6) 轮叉：从斗底两侧向下夹住前轮
    for (let side = -1; side <= 1; side += 2) {
      ctx.capsule([X + side * 0.17, Y + 0.40 * L, Z + 0.46],
                  [X + side * 0.36, Y + 0.58 * L, Z + 0.30 * WH],
                  0.036, 0.030, () => PLANK_MID, 'solid');
    }

    // 7) 前轮：深木圆盘 + 偏右凸出的亮木轮心，读作同心圆
    const wR = 0.30 * WH;
    const ww = 0.05 * WH;
    const wy = Y + 0.58 * L;
    const wz = Z + wR;
    ctx.capsule([X - ww, wy, wz], [X + ww, wy, wz], wR, wR,
                () => WOOD_DK, 'solid');
    const hub = ww + wR * 0.28 + 0.02;
    ctx.capsule([X + hub - 0.02, wy, wz], [X + hub + 0.02, wy, wz],
                wR * 0.70, wR * 0.70, () => WOOD_LT, 'solid');

    // 8) 双把手 + 深色握把
    for (let side = -1; side <= 1; side += 2) {
      ctx.capsule([X + side * 0.45, Y - 0.58 * L, Z + 0.81],
                  [X + side * 0.49, Y - 1.20 * L, Z + 0.56],
                  0.048, 0.042, () => PLANK, 'rough');
      ctx.capsule([X + side * 0.49, Y - 1.20 * L, Z + 0.56],
                  [X + side * 0.49, Y - 1.33 * L, Z + 0.54],
                  0.056, 0.052, () => PLANK_DK, 'solid');
    }

    ctx.shadow(0.9 * L, 1, 0.5);
  },
});
```
