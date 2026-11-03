# 场景与地面

> 覆盖：地面贴图协议 · 岛边界 · 材质分区 · 边缘溶解 · 平台土层 · 地面痕迹
> 注册表：[registry.md](registry.md)
> 参考实现：`engine.js` + 全部 5 个游戏的 `bake()` / `groundColor()`

---

## 1. 地面贴图协议（最重要）

### 1.1 协议签名

每个游戏的地面由**一个函数**决定，其余都是引擎细节：

```js
// 参考：balote:71 / laundry:87 / stari-most:77 / tie-break:80 / mini-ramp:86
function groundColor(x, y, ix, iy, i) {
  // x, y  = 世界坐标（由屏幕像素反投影得到）
  // ix, iy = 屏幕像素坐标（用于 hash 噪声与 Bayer 抖动）
  // i     = 像素线性索引（用于写 kinds[] 材质标记）
  // 返回 0 表示"这一像素不画"（透出背景白）
  // 返回 0xAABBGGRR 表示颜色
}
```

### 1.2 bake 里的标准循环

```js
// 参考：balote:114-122
function bake() {
  zb.fill(-1e9);
  pix.fill(rgb(255, 255, 255));
  for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
    const g = unproject(ix + .5, iy + .5), i = iy * W + ix;
    const c = groundColor(g.x, g.y, ix, iy, i);
    if (!c) continue;
    pix[i] = c; ground[i] = 1;              // ← 标记为"地面"
    zb[i] = (g.x + g.y) / R2 * COS;         // ← 地面的深度值
  }
  growGrass();                             // ← 草要在 kinds 写好之后才能生成
  groundZ.set(zb);                         // ← 立刻定格地面深度，后面所有物体都在它之上
  // ... 接下来才是建筑、树、人物 ...
}
```

**三个容易踩的坑**

| 坑 | 后果 | 正确做法 |
|----|------|----------|
| `groundZ.set(zb)` 放在建筑之后 | 建筑像素的深度被写进 groundZ，`shadeEdges` 认为建筑是地面，建筑边缘描边全部失效 | 地面画完立刻 `groundZ.set(zb)` |
| 忘了 `ground[i] = 1` | 阴影不会落到地面上（`applyShadows` 用 `ground[i]` 判断） | 和 `zb[i] =` 同一行写 |
| `unproject(ix + .5, iy + .5)` 用了整数 | 地面纹理整体错半像素，边缘抖动出现规律性裂缝 | 必须用 `+.5` 取像素中心 |

### 1.3 地面深度是解析式

```js
zb[i] = (g.x + g.y) / R2 * COS;
```

因为 `project()` 的深度 `d = v * COS + z * SIN`，地面 `z = 0` 时 `v = (x+y)/R2`，所以地面深度可以直接算，不用投影。
**这是让地面与物体深度可比的关键**——物体用 `project()` 算出的 `d` 必须能正确遮挡地面。

---

## 2. 岛边界与边缘抖动溶解

参考项目所有场景都是"一小块地方浮在纯白背景上"，边界是**抖动的**，不是硬边。

### 2.1 标准写法

```js
// 参考：balote:72-76 / tie-break:81-85 / stari-most:78-81 / mini-ramp:87-90
const edge = Math.pow(
  Math.pow(Math.abs(x) / 16.2, 4) + Math.pow(Math.abs(y) / 7.4, 4),
  .25
);
const rough = edge + (noise(x * 1.3, y * 1.3) - .5) * .13;
if (rough > 1.04) return 0;                                    // 边界外
if (rough > .93 && hash(ix, iy) < (rough - .93) / .11) return 0; // 边界抖动
```

**逐项解释**

| 项 | 作用 |
|----|------|
| `Math.pow(..., 4)` | 超椭圆指数。指数 2 = 正椭圆，4 = 方一点的椭圆（参考项目统一用 4），指数越大越接近矩形 |
| 外层 `.25` | 即 `1/4` 次方。这是超椭圆的定义式，把"和"变回"距离" |
| `16.2` / `7.4` | 岛的半长半宽（x 方向长、y 方向扁，因为 x 是屏幕水平方向） |
| `noise(x*1.3, y*1.3) * .13` | 给边界加不规则起伏，避免完美椭圆 |
| `rough > 1.04` | 硬边界，边缘外全透明 |
| `rough > .93` 段 | **关键**：从 0.93 到 1.04 之间，按概率逐像素丢弃，形成锯齿状溶解边 |

`(.93 → 1.04)` 这段是**溶解带**，宽度约 0.11。带越宽，边缘越毛；越窄越锐利。

### 2.2 调整参考值

| 想要的边缘 | 改法 |
|------------|------|
| 更毛（更像自然地貌） | 溶解带起点从 `.93` 降到 `.88`，或把噪声幅度 `.13` 提到 `.2` |
| 更锐利（人工场地） | 起点提到 `.97` |
| 岛更方 | 指数从 4 提到 6 |
| 岛更圆 | 指数降到 2.5 |

### 2.3 demo 现状

`demo/demo.js:11` 用 `islandE()` 实现了同类逻辑，但**没有抖动溶解带**（边缘是硬切），这是画面显得"塑料"的一个原因。

---

## 3. 材质分区（kinds）

### 3.1 引擎预留位

```js
// 参考：engine.js:152-153
const KIND_NONE = 0, KIND_GRASS = 3;
const kinds = new Uint8Array(W * H);
```

引擎只用了 0 和 3 两个值，但**每个游戏自己定义 1、2**，形成约定：

| 值 | 引擎定义 | balote | tie-break | stari-most | laundry | mini-ramp |
|----|----------|--------|-----------|------------|---------|-----------|
| 0 | `KIND_NONE` | 同 | 同 | 同 | 同 | 同 |
| 1 | — | `KIND_COURT` | `KIND_CLAY` | `KIND_BEACH` | — | `KIND_CONCRETE` |
| 2 | — | `KIND_DIRT` | `KIND_DIRT` | `KIND_WATER` | — | `KIND_DIRT` |
| 3 | `KIND_GRASS` | 同 | 同 | 同 | 同 | 同 |

### 3.2 kinds 的四个用途

这是 kinds 机制的价值所在——它让"只对某类地面生效"的逻辑成为可能：

| 用途 | 参考实现 | 代码 |
|------|----------|------|
| **草只长在草地上** | `engine.js:163` | `if (kinds[i] !== KIND_GRASS || ...) continue;` |
| **痕迹只画在球场上** | `balote:107` | `if (kinds[i] !== KIND_COURT || trackMark[i]) return;` |
| **土痕只画在红土上，且跳过白线** | `tie-break:361` | `if (kinds[i] !== KIND_CLAY || bakedPix[i] === LINE) continue;` |
| **水面高光只画在河道** | `stari-most:525` | `if (kinds[i] !== KIND_WATER || zb[i] !== groundZ[i]) continue;` |
| **雨只溅在屋顶范围内** | `laundry:442` | `if (Math.abs(d.x) < ROOF_X && Math.abs(d.y) < ROOF_Y) splashes.push(...)` |

**注意最后一行的思路差别**：laundry 判断的是**世界坐标范围**，而不是 kinds。因为它的"地面"是屋顶（矩形），不是自然地貌。

### 3.3 写 kinds 的位置

在 `groundColor()` **内部**写，不要在外面：

```js
// 参考：balote:78-79（正确）
if (onCourt) {
  kinds[i] = KIND_COURT;     // ← 在 groundColor 内部写
  ...
}

// 参考：balote:99（也正确，草地分支）
kinds[i] = KIND_GRASS;
```

如果 `groundColor` 提前 `return 0`（边界外），那个像素的 kinds 保持 0（`KIND_NONE`）——正好表示"不是地面"。

---

## 4. 大面积地面的配色陷阱

### 4.1 问题

Bayer 抖动是把**量化误差**按规则网格打散。色阶跨度大时，抖动图案会被眼睛读成**棋盘格**，而不是颗粒感。

### 4.2 参考项目的三种解法

**解法 A：自定义近邻色组**（balote、tie-break、stari-most、mini-ramp 都用）

```js
// 参考：balote:68
const SAND_TONES = [[200,172,130], [211,185,141], [220,196,151], [229,207,163]];
// 参考：tie-break:76
const CLAY_TONES = [[172,90,58], [181,97,62], [190,104,67], [199,112,73]];
// 参考：stari-most:54
const BEACH_TONES = [[186,178,158], [202,194,174], [216,210,190], [230,224,204]];
```

四个色值的通道差都只有 10～15，彼此非常接近。抖动在这个范围内读作颗粒而非棋盘。

```js
// 参考：balote:89
return rgb(...SAND_TONES[clamp(Math.floor(v * 4 + (bayerAt(ix, iy) - .5) * .6), 0, 3)]);
```

**解法 B：限制抖动幅度**

抖动加数从 `.7` 降到 `.6`，并把量化索引范围从 `0..3` 缩到 `0..3`（4 档而非 5 档），减少出现极端跳变的概率。

**解法 C：大色块用固定 ramp 索引**

```js
// 参考：laundry:96
return ramp[clamp(Math.floor(2.2 + tone * 1.6 + (bayerAt(ix, iy) - .5) * .5), 2, 4)];
```

只取 ramp 的 2、3、4 三档，跨度小。

### 4.3 判据

> 一块地面如果放大后能看出规则的棋盘纹理，就是色阶跨度用错了。

---

## 5. 边缘材质与细节

### 5.1 双层边缘（球场 → 泥土 → 草地）

```js
// 参考：balote:91-101
const dirt = Math.max(Math.abs(x) - COURT_X, Math.abs(y) - COURT_Y);
if (dirt < .3 + noise(x * 2.2, y * 2.2) * .9) {
  kinds[i] = KIND_DIRT;
  const ramp = rampOf(DIRT);
  if (pebble) return ramp[4];
  if (pebbleShade) return ramp[0];
  return ramp[pickLevel(.25 + noise(x * 3, y * 3) * .6, ix, iy)];
}
kinds[i] = KIND_GRASS;
// ...
```

`Math.max(|x|-A, |y|-B)` 是**矩形外扩距离**，对球场/跑道这类方形场地合适；
`Math.abs(x) - A` 是**单轴距离**，对圆形场地合适。

### 5.2 石子/杂点

```js
// 参考：balote:76
const fine = hash(ix, iy), pebble = fine > .975, pebbleShade = hash(ix - 1, iy - 1) > .975;
```

- `pebble`：亮点，≥2.5% 概率
- `pebbleShade`：暗点，用**偏移一格的 hash**（`ix-1, iy-1`），避免与亮点重叠成簇

参考项目全部 5 个游戏都用这组值，可以直接抄。

### 5.3 苔藓/杂草斑块

```js
// 参考：laundry:95
if (noise(x * .5, y * .5) > .7 && fine > .55) return rgb(116, 122, 70);
```

两个条件同时满足才画：低频噪声选区域 + 高频 hash 打散像素。单独用任一个都会显得脏。

---

## 6. 平台、高处地面与土层

### 6.1 参考项目：矩形平台（屋顶）

```js
// 参考：laundry:88
if (Math.abs(x) > ROOF_X || Math.abs(y) > ROOF_Y) return 0;
```

屋顶是**硬边矩形**，没有抖动溶解——因为它是人工建筑。人工造物硬边，自然地貌抖动边。

### 6.2 参考项目：坡道曲面算作地面

mini-ramp 的坡道表面也要接收移动阴影，做法是**给坡道像素打地面标记**：

```js
// 参考：mini-ramp:211
for (let i = 0; i < W * H; i++) if (rampMask[i]) ground[i] = 1;
```

在 `bake()` 的**最后**（`applyShadows` 之前）执行。

### 6.3 demo 独有：土层挤出

参考项目**没有**这个功能（物体直接坐在地面上，靠边缘抖动"浮"在白底上）。
demo 加了向下挤出的土层，见 `demo/demo.js:57` `bakeSoil()`。

实现要点：把地面边缘的像素沿 `z` 负方向"拖"下来，形成垂直的土壁。

---

## 7. 阴影只染地面的两个条件

```js
// 参考：engine.js:124-133
function applyShadows(refZ) {
  for (let i = 0; i < pix.length; i++) {
    const s = shadowMask[i];
    if (!s) continue;
    shadowMask[i] = 0;                          // ← 一次性消费
    if (!ground[i] || zb[i] !== refZ[i]) continue;  // ← 只染"仍然是地面"的像素
    if (s === 1) tint(i, .54, .52, .72);
    else tint(i, .36, .34, .56);
  }
}
```

**两个条件缺一不可**

| 条件 | 拦掉什么 |
|------|----------|
| `ground[i]` | 非地面像素（建筑、天空、水花） |
| `zb[i] !== refZ[i]` | 被物体遮挡的地面像素（物体压在上面） |

第二个条件是"阴影不会糊到物体上"的关键：`refZ` 是烘焙时的地面深度，`zb[i]` 是当前帧的深度。物体站在地面上时 `zb[i] > refZ[i]`，于是跳过。

> **demo 现状的 bug**：`demo/engine.js:171-172` 的强度 2 用了 `.62,.6,.78`，比强度 1 的 `.54,.52,.72` **更亮**。
> 强度 2 是接触阴影（脚底、球底），必须比普通投影更暗。参考项目用 `.36,.34,.56`。
> **修复：把 `.62,.6,.78` 改成 `.36,.34,.56`。**

---

## 8. 地面痕迹（动态磨损）

### 8.1 参考实现：balote 的球痕

```js
// 参考：balote:56-57, 103-111
const pristinePix = new Uint32Array(W * H);   // 未磨损的底图
const trackMark = new Uint8Array(W * H);      // 已标记的像素，避免重复加深

function stampTrack(b) {
  const p = project(b.x, b.y, 0), ix = p.sx | 0, iy = p.sy | 0;
  if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
  const i = iy * W + ix;
  if (kinds[i] !== KIND_COURT || trackMark[i]) return;   // 只在球场上，且不重复
  trackMark[i] = 1;
  const c = bakedPix[i];
  bakedPix[i] = rgb((c & 255) * .88, (c >> 8 & 255) * .87, (c >> 16 & 255) * .9);
}
```

### 8.2 参考实现：tie-break 的土痕

```js
// 参考：tie-break:354-364
function markClay(x, y) {
  const p = project(x, y, 0);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (Math.abs(dx) === 2 && dy) continue;   // 十字形笔刷，不是实心方块
    const ix = (p.sx | 0) + dx, iy = (p.sy | 0) + dy;
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
    const i = iy * W + ix;
    if (kinds[i] !== KIND_CLAY || bakedPix[i] === LINE) continue;  // 跳过白线
    const c = bakedPix[i];
    bakedPix[i] = rgb((c & 255) * .88, (c >> 8 & 255) * .84, (c >> 16 & 255) * .82);
  }
}
```

笔刷形状是**十字**（`|dx|==2 && dy` 跳过四角），比方块自然。

### 8.3 每回合重置

```js
// 参考：balote:188
function newFrame() {
  bakedPix.set(pristinePix);   // ← 从未磨损底图恢复
  trackMark.fill(0);
  ...
}
```

**三件套**：`pristinePix`（干净底图）+ `trackMark`（已画标记）+ 每回合 `set` 恢复。

---

## 9. 移植清单

到 `demo/` 落地时要动的地方：

| 项 | 动作 |
|----|------|
| 地面贴图协议 | `demo/demo.js` 已有 `groundColor(x,y,ix,iy)`，需加第 5 个参数 `i` 以便写 kinds |
| 材质分区 | `demo/engine.js` 需加 `kinds` 数组 + `KIND_NONE/KIND_GRASS` 常量 |
| 边缘溶解带 | `demo/demo.js:11` `islandE()` 加 `.93 → 1.04` 抖动段 |
| 大面积配色 | `demo/demo.js:8` 的 `GRASS` 是 4 档跨度（52→116，绿通道差 60），**太宽会读成棋盘**，改用近邻 4 色 |
| 接触阴影强度 | `demo/engine.js:172` `.62,.6,.78` → `.36,.34,.56` |
| 地面反弹光 | `demo/engine.js` 的 `sphere()` 缺参考项目 `engine.js:75` 那行：`if (dy > .35) l = Math.max(l, .12 + dy * .24);` |
