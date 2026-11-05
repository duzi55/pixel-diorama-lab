# 参考项目 · 建筑表面与小件（ref-surfaces）

> 注册表：[registry.md §2](registry.md) 的 `masonry-wall` / `plaster-wall` / `stair-house`
> 相关：[buildings.md §1](buildings.md#1-砌体材质怎么用)（砌体用法）· [buildings.md §7](buildings.md#7-屋顶小构件组)（屋顶小件）
> 实现：`demo/kit/ref-surfaces.js`

**本篇定位**：`buildings.md` 里这三条原本只有算法片段与用法表，没有可摆的
KIT 构件。本文件把它们的**完整配方卡**补齐：一段独立砖石墙、一段剥落抹灰墙、
一座屋顶楼梯间。三者都是 `category: 'building'`，可与 `house` / `parapet` /
`water-tank` / `chimney` 组合成屋顶平台。

## 0. 一览

| ID | 名称 | 来源 | 骨架差异（为什么是独立 ID） |
|----|------|------|------------------------------|
| [`masonry-wall`](#1-masonry-wall-砖石墙) | 砖石墙 | `ref` `stari-most:100` `masonry()` | 错缝砌体 + 灰缝 + 逐块随机色 |
| [`plaster-wall`](#2-plaster-wall-抹灰墙) | 抹灰墙 | `ref` `laundry:98` `wallColor()` | 抹灰面 + 剥落露石 |
| [`stair-house`](#3-stair-house-楼梯间) | 楼梯间 | `ref` `laundry:138-140` | 小房 + 出挑石板压顶 + 百叶门 |

共同点：**两面可见墙 + 顶面**。正面 `base`、侧面 `base-1`、顶面 `base+1`，
同一个材质函数换三档亮度就出体积，不需要额外打光。

---

## 1. masonry-wall 砖石墙

| 项 | 内容 |
|----|------|
| **ID** | `masonry-wall` |
| **来源** | `reference/pixel-plays/stari-most/index.html:100` `masonry(a, z, base, c)` |
| **形态** | 一段独立砖石墙：正面 + 侧面 + 顶面压顶石板 |
| **分类** | building |
| **实现** | `demo/kit/ref-surfaces.js:26` `rsMasonry()` · `:63` `KIT.register` |

### 参数

| 参数 | 默认 | 区间 | 步进 | 说明 |
|------|------|------|------|------|
| `width` | 3.2 | 1 ~ 8 | 0.1 | 墙宽（x 方向） |
| `depth` | 0.45 | 0.2 ~ 2 | 0.05 | 墙厚（y 方向） |
| `height` | 2.4 | 0.6 ~ 6 | 0.1 | 墙高 |
| `base` | 3 | 1 ~ 4 | 0.25 | 受光基准；正面用 base，侧面自动降一档 |
| `seed` | 1 | 0 ~ 99 | 1 | 砌体纹理种子（换错缝相位与逐块色差） |

### 碰撞体

`{"type":"box","w":3.2,"d":0.45,"h":2.4}` —— 贴墙身，不含顶面挑出（顶面不挑出）。

### 关键算法

```js
// 砌层高 1/1.6、块长 1/1.2，隔层错半块；灰缝压暗一档
const fz = z * 1.6 + seed * .37, course = Math.floor(fz);
const fa = a * 1.2 + (course % 2) * .5 + seed * .63, block = Math.floor(fa);
const mortar = fz - course < .14 || fa - block < .1;
const tone = ctx.hash(block * 7 + course * 131 + seed * 53, ctx.seed);
const lv = Math.round(base + (tone > .75 ? 1 : tone < .2 ? -1 : 0) - (mortar ? 1 : 0));
return ctx.rampOf(RS_STONE)[ctx.clamp(lv, 0, 4)];
```

- 正面 `y1` 面用 `base`，侧面 `x1` 面用 `base-1`，顶面用 `rsSlabTop(..., base+1)`。
- 顶面石板沿 x 每 1.1 单位一道拼缝，逐块色差。
- `seed` 同时平移 `fz` 与 `fa` → 换种子会换错缝相位，不只是换颜色。

### 移植清单

- 代码：`demo/kit/ref-surfaces.js`
- 注册表：`docs/kit/registry.md` §2（已有一行，链接可改指本篇）
- 依赖引擎：`plot / rampOf / hash / clamp / shadowAt`
- 上游文档：`buildings.md §1` 用法表（正面 3 / 侧面 2 / 拱内 1）

### 坑

- **`rampOf()` 返回的是打包像素**，只能喂 `plot()`；`base` 是浮点，索引前必须
  `Math.round()`，否则 `ramp[2.4]` 是 `undefined`（画出来是黑/透明）。
- 灰缝直接降一档色阶，对比很强；要更细的灰缝就调 `fa - block < .1`，不要
  再叠一层明暗。
- 高墙上砖会显小：把 `z * 1.6` 改成 `z * 2.2`（参考项目对高塔的做法）。
- 绘制步长 `.045` 是按 `PP_SCALE≈11` 定的。把画布放大到 `PP_SCALE>20` 时，
  采样点在屏幕上拉开 >1px，墙会出现针孔——这是所有逐像素构件的共同限制
  （`house` / `square-tower` 同样），Gallery 走「先 1:1 渲染再整体放大」规避。
- 顶面在墙顶 `z = height` 处绘制，和正面顶边同像素时深度更大，会自然盖住
  正面；不要为了"保险"给顶面加 y 偏移，会把压顶画飘。

### 验收

默认参数、沙箱实画：`(0,0)` 816 px，`(4,2)` 790 px，两次画面不同；min/max
参数不崩。

---

## 2. plaster-wall 抹灰墙

| 项 | 内容 |
|----|------|
| **ID** | `plaster-wall` |
| **来源** | `reference/pixel-plays/laundry/index.html:98` `wallColor(a, z, base)` |
| **形态** | 一段抹灰墙：大部分完好，若干斑块剥落露出错缝石砌，带雨渍 |
| **分类** | building |
| **实现** | `demo/kit/ref-surfaces.js:46` `rsPlaster()` · `:102` `KIT.register` |

### 参数

| 参数 | 默认 | 区间 | 步进 | 说明 |
|------|------|------|------|------|
| `width` | 3.4 | 1 ~ 8 | 0.1 | 墙宽（x 方向） |
| `depth` | 0.45 | 0.2 ~ 2 | 0.05 | 墙厚（y 方向） |
| `height` | 2.4 | 0.6 ~ 6 | 0.1 | 墙高 |
| `base` | 3 | 1 ~ 4 | 0.25 | 受光基准；正面用 base，侧面自动降一档 |
| `peel` | 0.5 | 0 ~ 1 | 0.05 | 剥落程度：0 = 完好抹灰，1 = 大面积露石 |

### 碰撞体

`{"type":"box","w":3.4,"d":0.45,"h":2.4}`

### 关键算法

```js
// 低频噪声过阈值 → 剥落，直接返回后面的砌体色
const th = 1 - peel * .42;
const patch = ctx.noise(a * .75 + seed * 2.3, z * .9 + 4 + seed * 1.4);
if (patch > th) return rsMasonry(ctx, a, z, base, seed + 5);
// 未剥落处：更慢的一层噪声压暗一档，读成雨渍
const stain = ctx.noise(a * .45 + seed * 5.1, z * .55 + 11 + seed * 2.2);
return ctx.rampOf(RS_PLASTER)[ctx.clamp(Math.round(base - (stain > .8 ? 1 : 0)), 0, 4)];
```

- 剥落斑块**必须跨过一块砖（约 1 单位）**才读得到砌缝，所以噪声频率压到
  `.75 / .9`；频率调高会退化成椒盐噪点。
- `peel` 只改阈值：`0 → 1.0`（噪声极值也够不到，基本无斑）、
  `0.5 → 0.79`、`1 → 0.58`（大面积露石）。
- 露石直接复用 `rsMasonry()`，斑块里的灰缝与 `masonry-wall` 是同一套网格，
  两墙并排时语言统一。

### 移植清单

- 代码：`demo/kit/ref-surfaces.js`
- 注册表：`docs/kit/registry.md` §2（已有一行，链接可改指本篇）
- 依赖引擎：`plot / rampOf / noise / clamp / shadowAt`
- 上游文档：`buildings.md §1` 变体表；`laundry.md` 的 `wallColor()`

### 坑

- **别用逐像素 `hash` 做污渍**：单像素压暗会变成沙粒噪点，尤其在 3～4 单位
  宽的小墙上。改用低频 `ctx.noise`，一次压暗一片。
- 剥落阈值不要写成固定值，否则 `peel` 滑块只有开/关两档；用
  `1 - peel * .42` 才能从"完好"连续过渡到"大面积露石"。
- `ctx.noise` 是确定性场，不是随机数；全构件没有 `Math.random()`，同种子
  同画面。
- 侧面的 `seed` 与正面不同（0 / 9），转角处的剥落斑不会"折"过去，这是
  有意的：抹灰剥落通常止于墙角。

### 验收

默认参数、沙箱实画：`(0,0)` 820 px，`(4,2)` 840 px，两次画面不同；min/max
参数（`peel=0` / `peel=1`）不崩。

---

## 3. stair-house 楼梯间

| 项 | 内容 |
|----|------|
| **ID** | `stair-house` |
| **来源** | `reference/pixel-plays/laundry/index.html:138-140`（`buildRoof()` 内） |
| **形态** | 屋顶小房：抹灰墙身 + 出挑石板压顶 + 横向百叶门 + 门槛石 |
| **分类** | building |
| **实现** | `demo/kit/ref-surfaces.js:138` `KIT.register` |

### 参数

| 参数 | 默认 | 区间 | 步进 | 说明 |
|------|------|------|------|------|
| `w` | 3 | 1.2 ~ 6 | 0.1 | 房身宽（x 方向） |
| `d` | 2.4 | 1 ~ 5 | 0.1 | 房身深（y 方向） |
| `h` | 2.2 | 1 ~ 4.5 | 0.1 | 房身高（不含压顶） |
| `door` | 0.9 | 0 ~ 1.6 | 0.05 | 百叶门宽（0 = 无门；最大被夹到 `w*0.7`） |

### 碰撞体

`{"type":"box","w":3,"d":2.4,"h":2.42}` —— 含 0.22 的压顶。

### 关键算法

```js
// 墙身：两面抹灰，正面亮/侧面暗，剥落比独立墙体少（peel=.18）
plot(a, y1, z, rsPlaster(ctx, a, z, 3, .18, 5));
plot(x1, a, z, rsPlaster(ctx, a, z, 2, .18, 13));

// 压顶：四边出挑 .14，箱体只吃 [r,g,b] 基色数组
const e = .14, capH = .22;
ctx.box(x0 - e, y0 - e, z0 + p.h, x1 + e, y1 + e, z0 + p.h + capH, RS_CAP, ctx.seed + 3);

// 百叶门：横向板条（按 z 分档），凸出墙面 .03 才不会被墙吃
plot(a, y1 + .03, z, shut[Math.floor(z * 6) % 2 ? 3 : 2]);
```

- 门宽取 `min(door, w * .7) / 2`，窄房子也不会把门画穿墙角。
- 门高 `min(h * .68, h - .12)`，保证压顶下始终留一条墙。
- 门框宽 `.14`：左右立梃 + 上楣用 `shut[0]`；门槛石用压顶石的 `sill[3]`，
  向门外挑 `.1`。

### 移植清单

- 代码：`demo/kit/ref-surfaces.js`
- 注册表：`docs/kit/registry.md` §2（已有一行，链接可改指本篇）
- 依赖引擎：`plot / box / rampOf / noise / shadowAt`
- 上游文档：`buildings.md §7` 屋顶小构件组

### 坑

- **门框不能画细**：`.05` 宽在 `plot` 步长 `.045` 下只剩 1～2 个采样点，
  立梃会断成虚线；`.14`（约 1px）是实测下限。
- **门是凸出的**：墙面在 `y1`，门在 `y1+.03`、门框在 `y1+.04`，靠深度缓冲
  压住墙面；把门画在 `y1` 会被墙同深度拒绝。
- **压顶用 `ctx.box`**：颜色必须是 `[r,g,b]` 数组（`RS_CAP`），把
  `rampOf(RS_CAP)[i]` 传进去会直接抛错。
- 参考代码的百叶用 `Math.floor(a * 3) % 2`（沿水平轴分档），投影后是**竖条**；
  本实现改用 `z` 分档做真正的横向百叶。两者都读得出"门"，这里选了物理正确
  的一版。
- `door = 0` 时不画门、不画门框与门槛，但房子本体与压顶仍完整；`door` 调大
  时会被 `w * .7` 夹住。

### 验收

默认参数、沙箱实画：`(0,0)` 1573 px，`(4,2)` 1552 px，两次画面不同；
`door=0` 与 max 参数不崩。

---

## 4. 接入清单（本次未改，留给主流程）

本次任务只允许新建 `demo/kit/ref-surfaces.js` 与 `docs/kit/ref-surfaces.md`，
所以构件目前**尚未出现在 Gallery / Studio / 全量测试**里。落盘后还需：

| 位置 | 改动 |
|------|------|
| `demo/kit/gallery.html` | 在 `ref-buildings.js` 后加 `<script src="ref-surfaces.js">` |
| `demo/kit/catalog.html` | 同上 |
| `demo/studio/preview.html` | 同上 |
| `demo/studio/editor.html` | 同上 |
| `demo/scenes/viewer.js` | `KIT_SCRIPTS` 列表加 `../kit/ref-surfaces.js` |
| `demo/studio/server.mjs` | `/api/kit` 扫描列表加 `ref-surfaces.js` |
| `tools/kit-test.mjs` | 加载列表加 `demo/kit/ref-surfaces.js` |
| `docs/kit/registry.md` | 三行已存在，把链接从 `buildings.md` 改指本篇对应锚点 |

接入后跑 `node tools/kit-test.mjs masonry-wall plaster-wall stair-house` 复核
（本次已用等价的独立沙箱跑过：3/3 通过）。
