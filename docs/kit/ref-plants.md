# 参考项目植被构件（ref-plants）

> 实现：`demo/kit/ref-plants.js`（286 行）
> 来源：`reference/pixel-plays/`（**只读**）
> 注册表行由集成任务补入 [registry.md](registry.md)；本文档先给出锚点。

这批构件是参考项目里**尚未进入构件库**的植被变体。参考实现中它们
有的是场景里的局部代码（`palm` / `potted-plant`），有的只是地面材质的一行
（`moss`）或草尖的一个像素（`flower`）；这里统一升级成可单独摆放的 KIT 构件。

## 0. 总览

| ID | 名称 | 分类 | 来源 | 参数 | 碰撞体 |
|----|------|------|------|------|--------|
| [`palm`](#1-palm-棕榈) | 棕榈 | tree | `ref` `mini-ramp:119` `growPalm` | scale / height / fronds / lean | cylinder |
| [`flower`](#2-flower-小花) | 小花 | plant | `ref` `engine.js:168`（bloom 字段） | rate / color / height / spread | cylinder |
| [`potted-plant`](#3-potted-plant-盆栽) | 盆栽 | plant | `ref` `laundry:149` | r / leafN / height | cylinder |
| [`moss`](#4-moss-苔藓斑) | 苔藓斑 | plant | `ref` `laundry:95` | size / density / color | cylinder（扁） |

四个构件的共同约束（与全库一致）：

- 颜色基色只写 `[r,g,b]` 数组喂 `sphere/capsule/box`；`plot()` 只吃 `rgb()` / `rampOf()` 打包整数。
- 所有坐标基于 `ctx.x / ctx.y / ctx.z` 偏移。
- 随机只用 `ctx.hash(k, ctx.seed)`；地形噪声用 `ctx.noise(wx, wy)`（确定性，无随机状态）。
- 参数名与参考项目保持一致，便于对照阅读。

---

## 1. `palm` 棕榈

| 项 | 内容 |
|----|------|
| **来源** | `ref` `mini-ramp/index.html:119` `growPalm(a, w, scale, seed)` |
| **状态** | ✅ |
| **实现** | `demo/kit/ref-plants.js` → `KIT.register({ id: 'palm' })` |

### 形态

二次曲线弯曲的单干，顶端一圈（默认 10 片）下垂的羽状叶，树皮横向环纹，
叶心藏三颗椰果。参考项目里它按「沿板长 / 横向」的板面坐标布点；
这里改成以 `ctx.x / ctx.y` 为根，可直接摆进任意场景。

### 参数

| 参数 | 默认 | 区间 | 作用 |
|------|------|------|------|
| `scale` | 1 | .7～1.3 | 整树缩放：干径、叶长、椰果同时变 |
| `height` | 5.6 | 3～8 | 树干高度（世界单位，村民约 1.8） |
| `fronds` | 10 | 6～14 | 叶片数，绕顶一圈均分 |
| `lean` | 1.1 | 0～1.8 | 弯曲幅度 = 顶端水平偏移（世界单位） |

### 关键算法

**① 参数化弯曲干**（`ref` 原式，只把 `scale` 拆成独立参数）

```js
const turn = ctx.hash(1, ctx.seed) * 6.2832;
const lx = Math.cos(turn) * lean * sc;
const ly = Math.sin(turn) * lean * sc;
const trunkAt = t => [ctx.x + lx * t * t, ctx.y + ly * t * t, h * t];
```

`t*t` 不是 `t`：根部切线竖直、顶端偏移最大。弯曲方向由 `hash(1, seed)` 决定，
每棵棕榈朝不同方向弯。`scale` 只缩放半径 / 叶长，`height` 独立控高。

**② 环纹树皮 = `colorOf` 回调按世界高度分段**

```js
ctx.capsule(q0, q1, r0, r1,
  z => (Math.floor(z * 3.4) % 2 ? PALM_BARK : PALM_RING), 'rough');
```

`capsule` 的 `colorOf(z)` 吃**世界高度**。七段胶囊各投一次 `shadowAt`，
影子沿弯干连成一条线。

**③ 叶片 = 11 段 × 3 排球**

```js
const z = top[2] + sc * (rise * u - 2.4 * u * u);  // 先抬后垂的抛物线
const width = .42 * sc * (1 - u * .55);            // 叶尖收窄
for (const side of [-1, 0, 1]) {                   // 中排高、两侧低
  ... z - (side ? .22 * sc : 0), (side ? .15 : .12) * sc
}
```

`rise` 随叶片在 .9～1.7 之间抖，`2.4*u²` 保证所有叶子最终垂下来。
三排不是装饰：侧排低 `.22`，叶面才有卷曲感。

**④ 椰果**：顶部三颗 `.13*sc` 的 `solid` 小球，补住叶心。

### 碰撞体

`cylinder radius .5, height 5.6`（按默认 `scale/height`）。与 `broadleaf` 一样，
参数改大后碰撞体不跟随 —— 编辑器里可手动覆盖。

### 移植清单

1. `KIT.register` 的 `params` 已对齐参考的 `scale/height/fronds`，另加 `lean`。
2. 叶色三档：`DEEP [38,88,58]` / `MID [70,128,62]` / `LIGHT [132,168,72]`；
   干色 `BARK [128,104,80]` / `RING [96,76,60]`；椰果 `[110,76,44]`。
3. 已声明 `behavior.default = sway(amp 1.4)`，`allow = sway/chop/shake`。
4. 参考里叶片进 `leaves` 缓存共享风动；KIT 没有 capture 队列，改由行为系统摆动整树。

### 坑

- **`trunkAt` 必须 `t*t`**：写成 `t` 就成了倾斜的直杆，棕榈立刻变电线杆。
- **`rise` 不乘 `scale`**：参考里 `drop = top[2] + scale*(rise*u - 2.4u²)`，
  `rise` 本身就是无量纲系数；乘了会让高树叶子飞到天上。
- `height` 与 `scale` 是拆开的：参考中 `height = 5.6*scale`。这里分别调，
  所以「细高棕榈」= 调 `height`，不是调 `scale`。
- 叶球半径 `.12/.15 * scale`，小于这个值在 360×280 画布上会碎成孤立像素。

---

## 2. `flower` 小花

| 项 | 内容 |
|----|------|
| **来源** | `ref` `engine.js:168`（草尖 `bloom` 字段） |
| **状态** | ✅ 升级为独立构件 |
| **实现** | `demo/kit/ref-plants.js` → `KIT.register({ id: 'flower' })` |

### 形态

一小丛细花茎，每根顶端 5 颗花瓣球绕圈 + 1 颗花心。参考项目里花只是
草丛顶端的一像素换色（`bloom`），没有独立骨架；本构件保留「花点」的像素思路，
把骨架补成可单独摆放的一丛。

### 参数

| 参数 | 默认 | 区间 | 作用 |
|------|------|------|------|
| `rate` | .5 | .15～1 | 开花密度：花茎数 = `3 + rate*13` |
| `color` | 2 | 0～4 | 花色索引：0 暖白 / 1 嫩黄 / 2 桃粉 / 3 淡紫 / 4 天蓝 |
| `height` | 1 | .5～1.8 | 花茎高度 |
| `spread` | .8 | .2～1.2 | 花丛半径 |

**`color` 是整数索引，不是颜色数组。** 调色板写在 `draw()` 里，参数只传下标 ——
这样滑块 / 场景 JSON 里存的是 `1, 2, 3`，不会把 `[r,g,b]` 塞进参数表。

### 关键算法

**① 花茎**：每根一段细胶囊，根粗梢细，梢头随方位角轻歪。

```js
ctx.capsule([bx, by, 0], [tx, ty, hh], .028, .018, () => STEM, 'rough');
```

**② 花瓣圈**：半径系数 `1.7` 是分开瓣的关键 —— 相邻花瓣球心距
`2*1.7*sz*sin(36°) ≈ 2sz`，刚好相切；用 `1.1` 会糊成一整块色块。

```js
const sz = .07 + ctx.hash(kk + 5, ctx.seed) * .028;
for (let q = 0; q < 5; q++) {
  const pa = q / 5 * 6.2832 + roll;
  ctx.sphere(tx + Math.cos(pa) * sz * 1.7,
             ty + Math.sin(pa) * sz * 1.7,
             hh + Math.sin(pa) * .02, sz * .85, PETAL, 'flat');
}
```

**③ `flat` 模式画花瓣**：球面色阶在浅色纸背景上会读出灰紫暗部，
一两像素的花瓣经不起那层明暗；`flat` 直接用基色，才读得成「花」。

### 碰撞体

`cylinder radius .5, height 1`。花丛很矮，碰撞体只防止编辑器里重叠摆放。

### 移植清单

1. 调色板 5 组基色：暖白 `[250,238,218]`、嫩黄 `[246,212,96]`、
   桃粉 `[240,148,164]`、淡紫 `[178,150,220]`、天蓝 `[138,178,226]`。
2. 花心：嫩黄花用深橙 `[206,140,52]`，其余用暖黄 `[236,190,74]`。
3. 已声明 `behavior.default = sway(amp 1.2)`。
4. 若要复用参考的「草地花点」效果，不要用这个构件 —— 那是 `grass-tuft` 的 `bloomRate` 参数。

### 坑

- **默认 `color` 用 2（桃粉），不是参考的暖白**：暖白 `[250,238,218]`
  和纸背景 `[250,246,232]` 几乎同色，默认参数下花会「消失」。暖白仍可从滑块选。
- **花瓣圈系数不能小**：小于 `1.5*sz` 五个球重叠成一块方形色块，看不出分瓣。
- 花心 z 要抬 `.03`：同位置画会被花瓣的深度挡住（球心越高深度越大）。
- `rate` 控制的是花茎数，不是参考里 2.2% 的逐像素概率；语义已改，参数名保留。

---

## 3. `potted-plant` 盆栽

| 项 | 内容 |
|----|------|
| **来源** | `ref` `laundry/index.html:149-157` |
| **状态** | ✅ |
| **实现** | `demo/kit/ref-plants.js` → `KIT.register({ id: 'potted-plant' })` |

### 形态

圆锥台陶盆 + 翻边盆沿 + 深色土面 + 一簇圆叶球。参考里是三行代码的
「盆 / 叶 / 影」最简范式；这里把方盆换成竖直胶囊做的圆台，并补了盆沿与土面。

### 参数

| 参数 | 默认 | 区间 | 作用 |
|------|------|------|------|
| `r` | .45 | .25～.8 | 盆半径（盆身、盆沿、叶球、阴影一起缩放） |
| `leafN` | 14 | 6～26 | 叶球数量 |
| `height` | 1 | .6～1.8 | 叶簇高度系数 |

### 关键算法

**① 竖直胶囊做圆台盆身**

```js
ctx.capsule([ctx.x, ctx.y, 0], [ctx.x, ctx.y, r * 1.22],
  r * .7, r * .86, z => (z > r * .78 ? POT_HI : POT), 'rough');
```

胶囊两端半径不同 → 下窄上宽的圆台。`colorOf(z)` 按高度分两色（下暗上亮）。
**不用三层 box 叠收腰**：方盒在旋转预览时层间会露出横带；圆台旋转无接缝。

**② 盆沿 + 土面**：盆沿是一小段更宽的胶囊（`.9r`），土面是 `.62r` 的方块，
顶面比盆沿高 `.04r`，这样土是「鼓出来」的，不会被盆沿整个盖住。

**③ 叶球**：`sqrt(hash)` 分布让球在盆口均匀铺开（线性 `hash` 会挤在中心）。

```js
const d = Math.sqrt(ctx.hash(k * 5 + 2, ctx.seed)) * r * .85;
const z = r * (1.35 + hf * .5) + ctx.hash(k * 7 + 3, ctx.seed) * r * .55;
```

### 碰撞体

`cylinder radius .55, height 1.2`。参考里阴影半径用 `r`（盆宽），
不是叶球半径；本实现沿用 `ctx.shadow(r*1.15, 1, .5)`。

### 移植清单

1. 盆色 `POT [176,96,62]` / `POT_HI [198,118,78]`，土 `SOIL [74,54,40]`。
2. 叶色三档 `[58,104,50] / [80,130,58] / [108,156,74]`，按 `tone` 选档。
3. 参考把位置混进随机种子（`hash(k, x*3)`）让每盆叶形不同；KIT 用 `ctx.seed`，
   场景里给不同 `seed` 即可得到不同叶形。
4. 盆栽是静态装饰，不挂行为；需要风吹可手动加 `sway`。

### 坑

- **土面不能低于盆沿顶面**：盆沿是实心胶囊，会把土面整个盖住；土面要高出约 `.04r`。
- **圆形盆在等距投影下比同半径方盆窄约 25%**：`r` 按「实际半径」理解，
  想要参考里方盆的视觉宽度，把 `r` 调大约 1.15 倍。
- 叶球中心在 `r*(1.35+hf*.5)` 左右，球半径 `.4～.6r`；叶球会盖住盆口，
  这是参考的原始形态（盆口被叶簇遮住，只看得到盆身和土面边缘）。
- `leafN` 小于 6 时盆口会露土，这是有意允许的（可做「刚发芽」的盆栽）。

---

## 4. `moss` 苔藓斑

| 项 | 内容 |
|----|------|
| **来源** | `ref` `laundry/index.html:95` `groundColor()` 的苔藓分支 |
| **状态** | ✅ 升级为贴地构件 |
| **实现** | `demo/kit/ref-plants.js` → `KIT.register({ id: 'moss' })` |

### 形态

贴地蔓延的不规则苔藓片：低频噪声定有机轮廓，高频 hash 打散毛边，
中频噪声做斑驳色阶，少量亮像素做绒面。参考里它只是地面材质的一行
（`noise(x*.5,y*.5) > .7 && fine > .55`），这里抽成可摆放的贴地片。

### 参数

| 参数 | 默认 | 区间 | 作用 |
|------|------|------|------|
| `size` | 1.4 | .6～4 | 斑块半径（世界单位） |
| `density` | .85 | .2～1 | 毛边密度：边缘带按此概率保留，内部始终实心 |
| `color` | 0 | 0～2 | 苔色索引：0 青苔 / 1 黄苔 / 2 灰苔 |

### 关键算法

**① 双条件选区**（参考原式，频率调高）

```js
const shape = ctx.noise(w[0] * 1.4 + ctx.seed * 7.3, w[1] * 1.4 + ctx.seed * 3.7);
const edge = .62 + shape * .4;          // 轮廓半径 .62～1.02，不是正圆
if (d > edge) continue;
if (d > edge - .16 && fine > density) continue;   // 只有外圈毛边带抽稀
```

参考用 `noise(x*.5, y*.5) > .7`：在半径 1.4 的斑块上只有一个噪声周期，
边缘会读成正圆。频率提到 `1.4` 后，轮廓在一个斑块内有 3～4 个起伏。

**② 屏幕空间反解，而不是逐世界格点 `plot`**

```js
const w = ctx.unproject(ix, iy, 0);     // 屏幕像素 → 世界坐标
...
ctx.plot(w[0], w[1], .02, ramp[lv]);
```

逐世界格点投影时，格点间距 0.06 世界单位 ≈ 0.78px，屏幕像素会漏在
格点之间，毛边上出现背景色孔洞。逐屏幕像素反解保证**每个像素都被判定一次**，
边缘的参差也落在像素级。

**③ 五档色阶 + 绒面亮像素**

```js
const mottle = ctx.noise(w[0] * 3.7 + 5.1, w[1] * 3.7 + 9.4);
const lv = ctx.clamp(Math.round(mottle * 3 + fine * 1.4 - .4), 0, 4);
ctx.plot(w[0], w[1], .02, ramp[lv]);
if (fine > .93 && d < edge - .12) ctx.plot(w[0], w[1], .04, ramp[4]);
```

`plot` 只吃打包色：`ctx.rampOf(BASE)` 生成 5 档，按噪声挑档。绒面用
抬高 `.02` 的亮 `plot`，不用小球 —— 半径 `.04` 的球在 1px 尺度上会画出
一圈深色球面暗部，读成破洞。

### 碰撞体

`cylinder radius 1.2, height .12`。扁柱体，允许人物从上面走过（碰撞高度极小）。

### 移植清单

1. 三组苔色基色：青苔 `[104,126,62]`、黄苔 `[136,148,72]`、灰苔 `[98,116,78]`。
2. 依赖 `ctx.unproject / ctx.screen`（`render.js` 已暴露，支持实例旋转/缩放）。
3. 不投阴影：苔藓是贴地材质，投影反而像悬浮；参考项目里它也不投。
4. 若只是给地面加斑块、不需要独立摆放，仍推荐在 `groundColor()` 里加双条件，
   性能更好（每像素一次判断，没有构件调用）。

### 坑

- **内部不能逐像素抽稀**：1px 尺度上 25% 的空洞会让苔藓读成碎片；
  抽稀只放在外圈毛边带。
- **噪声频率太低 = 正圆**：`noise(wx*.45, wy*.45)` 在 `size=1.4` 时几乎常数。
- **`plot` 的 z 要离地**（`.02`）：和地面同高会跟地面像素深度打平，被地面挡住。
- **实例旋转**：`ctx.unproject` 已做逆旋转；如果改用裸 `project/unproject`
  全局函数，旋转后的苔藓会错位。

---

## 5. 移植清单（集成时按顺序做）

### 5.1 文件

| 文件 | 状态 |
|------|------|
| `demo/kit/ref-plants.js` | ✅ 已创建（4 个 `KIT.register`，286 行） |
| `docs/kit/ref-plants.md` | ✅ 本文档 |
| `docs/kit/registry.md` | ⬜ **集成任务补 4 行**（见 5.2） |
| `demo/kit/gallery.html` / `catalog.html` / `tools/kit-test.mjs` 的脚本列表 | ⬜ 集成任务加入 `ref-plants.js` |
| `demo/studio` 的构件加载清单 | ⬜ 若走 `index.js` 聚合，确认已包含 |

### 5.2 注册表建议行

按 `registry.md` 的列格式补入（锚点对应本文档小节）：

```md
| [`palm`](ref-plants.md#1-palm-棕榈) | 棕榈 | 二次曲线弯干 + 10 片下垂羽叶 + 环纹树皮 | `ref` `mini-ramp:119` | `scale/height/fronds/lean` | ✅ |
| [`flower`](ref-plants.md#2-flower-小花) | 小花 | 一小丛花茎 + 5 瓣花冠 + 花心 | `ref` `engine.js:168` | `rate/color/height/spread` | ✅ |
| [`potted-plant`](ref-plants.md#3-potted-plant-盆栽) | 盆栽 | 圆锥台陶盆 + 盆沿 + 土面 + 叶球簇 | `ref` `laundry:149` | `r/leafN/height` | ✅ |
| [`moss`](ref-plants.md#4-moss-苔藓斑) | 苔藓斑 | 双条件选区的贴地苔藓片 | `ref` `laundry:95` | `size/density/color` | ✅ |
```

### 5.3 验收

在集成后的全量环境跑：

```bash
node --check demo/kit/ref-plants.js
node tools/kit-test.mjs palm flower potted-plant moss
```

本次沙箱实测（`node:vm` 加载 `engine.js + core.js + palette.js + render.js + ref-plants.js`，
在 `(0,0)` 与 `(4,2)` 各画一次）：

| ID | 默认参数像素 @(0,0) | @(4,2) | 两画面不同 | min 参数 | max 参数 |
|----|--------------------|--------|-----------|----------|----------|
| `palm` | 1461 | 1454 | ✅ | 579 | 3048 |
| `flower` | 198 | 179 | ✅ | 41 | 388 |
| `potted-plant` | 125 | 127 | ✅ | 38 | 513 |
| `moss` | 249 | 216 | ✅ | 39 | 2002 |

四个构件的默认参数都 > 80 像素；`min` 参数下 `flower` / `potted-plant` / `moss`
像素很少是尺寸参数本身的语义（一株很小的花 / 小盆 / 小斑块），只要求不崩。

### 5.4 目检

沙箱导出放大图确认：

- `palm`：弯干朝一侧、环纹可辨、叶片下垂且叶尖收窄、叶心不秃。
- `flower`：5 瓣分离、花心可见、花瓣不糊成方块。
- `potted-plant`：圆台盆身、盆沿与土面分层、叶球盖住盆口。
- `moss`：轮廓有机、边缘参差、内部无背景孔洞、色阶有斑驳。
