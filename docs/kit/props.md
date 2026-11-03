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
