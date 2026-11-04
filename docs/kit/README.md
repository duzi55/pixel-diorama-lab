# 构件库（Kit）— 参考项目资产规格书

> **这份文档解决什么问题**
> 参考项目 Pixel Plays 里已经实现了大量"程序化生成"的技术：拱桥曲面、砖石建筑、人群 AI、织物形变、
> 树叶缓存动画、像素级 UI 覆盖层……
> 这些代码散落在 5 个游戏页里，每次重写都是重复造轮子。
> 本目录把**已经验证过的做法**抽成规格书：**算法、参数、源码锚点、移植清单**。
> 以后写新场景照抄算法，不再从零推。

---

## 0. 怎么用

### 0.1 三步工作流

```
① 查 registry.md  ──── 有现成的吗？
        │
        ├── 有 ──→ 读对应配方卡 ──→ 改参数用
        │
        └── 没有 ──→ 参考最接近的配方卡 ──→ 实现
                       ↓
                   登记到 registry.md ＋ 写配方卡
```

### 0.2 文档地图

| 篇目 | 内容 | 何时读 |
|------|------|--------|
| **[registry.md](registry.md)** | **变体注册表**（活索引） | **每次动手前先查** |
| [scene.md](scene.md) | 地面贴图协议、岛边界、材质分区、地面痕迹 | 做场景地基 |
| [trees.md](trees.md) | 树变体配方卡（8 种） | 放树 |
| [plants.md](plants.md) | 花草灌木配方卡（10 种） | 放花草 |
| [buildings.md](buildings.md) | 建筑变体配方卡（20 种） | 盖房子 |
| [structures.md](structures.md) | 线性/曲面构件（围栏、网、坡道、桥） | 造线性结构 |
| [figures.md](figures.md) | 人物骨架、姿态参数、调色板、动态阴影 | 放人 |
| [crowd.md](crowd.md) | 人群 AI、局部避让、姿态合成 | 做人群 |
| [props.md](props.md) | 道具配方卡 | 放物件 |
| [nature.md](nature.md) | 三条通用机制 + 水面、岩石、落叶 | 需要机制/水 |
| [effects.md](effects.md) | 像素级 UI 覆盖层、屏幕特效、描边、AO | 加 HUD/特效 |
| [weather.md](weather.md) | 雨云闪电、全局调色、天气声音 | 做天气 |
| **[depth-and-haze.md](depth-and-haze.md)** | **平涂 / 描边 / 空气透视 / 远景树海** | **做远景、做剪纸风** |

### 0.3 阅读约定

- 行号锚点写 `文件:行号`，相对 `reference/pixel-plays/`。
- **行号会漂移，函数名才是稳定锚点。** 用 `grep -n "function xxx"` 定位。
- 每篇末尾有「移植清单」，列出搬到 `demo/` 要动的地方。

### 0.4 这些规格现在有了运行时

`docs/kit/` 原本只是规格书。现在 **`demo/kit/` 是它的可执行实现**：

| 东西 | 位置 | 说明 |
|------|------|------|
| 构件运行时 | `demo/kit/core.js` | `KIT.register` / `KIT.get` / `KIT.resolve` |
| 已落地构件 | `demo/kit/trees.js`（树+草木）· `demo/kit/props.js`（建筑+道具） | 22 个，全部通过 `tools/kit-test.mjs` 实画测试 |
| 地面材质 | `demo/kit/ground.js` | 草地/泥土/沙地/石板/水面 |
| 渲染器 | `demo/kit/render.js` | 场景模型 → 画布（实例旋转在 makeCtx 里处理） |
| 人群行为 | `demo/kit/crowd.js` | spectator / wanderer / crowd 三变体（非构件，每帧运行） |
| 姿态表 | `demo/kit/figures.js` | `KIT_POSE` 十姿态（含 reach） |

**新构件不需要手写运行时** —— 用 Studio 生成页（`demo/studio/`）描述需求，
AI 按本目录的规范写代码，落盘时自动完成「代码 + 注册表 + 配方卡」三件套。

细则见 [../modules/studio.md](../modules/studio.md)。

### 0.5 构件陈列页（Gallery）

`demo/kit/gallery.html` 是构件库的**可视化目录**（Bootstrap 文档风格）：

| 能力 | 说明 |
|------|------|
| 实时预览 | 每个构件在共享离屏画布渲染，像素拷进卡片 |
| 参数编辑 | 每个 param 一条滑块，拖动即重渲染（只改预览，不写回源码） |
| 换形态 | `seed` 输入 / 「换一个」按钮换随机形态 |
| 用法 | 一键展开可复制的 `KIT.get(...).draw(...)` 调用代码 |

数据来自运行时注册表 `KIT.components` —— **新构件自动出现，不用改页面**。
浏览器直接打开（`demo/` 静态服务下 `http://127.0.0.1:5310/kit/gallery.html`）。

---

## 1. 架构：为什么按"变体"分篇

这套文档会**长期迭代**，所以结构必须抗增殖。

### 1.1 曾经的问题

第一版按「场景 / 建筑 / 人物 / 道具 / 自然 / 特效」横切分篇。问题是：

- **真正会持续增殖的是"树""建筑""花草"这类实体**，不是"场景"和"特效"
- 再加第 8 种树，只能往 `nature.md` 塞 —— 那篇已经 538 行，超了 500 行约束
- 查"我要个什么样的树"要在长文档里翻

### 1.2 现在的结构

```
registry.md          ← 活索引，所有变体一行登记
   │
   ├─→ trees.md      ← 树配方卡（一个 ID 一张卡）
   ├─→ buildings.md  ← 建筑配方卡
   ├─→ plants.md     ← 花草配方卡
   ├─→ props.md      ← 道具配方卡
   │
   └─→ scene.md / figures.md / crowd.md / structures.md
        nature.md / effects.md / weather.md / depth-and-haze.md
                                     ← 机制与横向专题
```

**两级组织**：

| 级别 | 载体 | 特点 |
|------|------|------|
| 一级 | registry.md 的行 | 一行看清"有什么" |
| 二级 | 配方卡 | 一张卡讲透"怎么做" |

### 1.3 变体 vs 参数的判定

**这是这套库能长期维护的关键。**

| 差异类型 | 处理 | 例子 |
|---------|------|------|
| 配色不同 | **参数组** | 翠绿/深绿/秋黄 → `palette` |
| 尺寸不同 | **参数组** | 大树/小树 → `scale` |
| 数量不同 | **参数组** | 密林/疏林 → `density` |
| **骨架结构不同** | **独立 ID** | 分叉树/垂柳/针叶 |

例：`blossom`（花树）**不建 ID** —— 它是 `broadleaf` + `bloomRate` 参数。
`shrub`（灌木）也不建 ID —— 是 `canopy` + `height` 参数。

**只有骨架结构不同才建新 ID。**

### 1.4 配方卡必填项

缺项就是没写完：

| 项 | 要求 |
|----|------|
| ID | 与注册表一致 |
| 来源 | `文件:行号` + 函数名 |
| 形态 | 一段话讲清长什么样 |
| 参数 | ≥1 个可调参数，标**默认值和区间** |
| 关键算法 | 与基型的**差异点**，不是整段贴代码 |
| 移植清单 | 搬过来要改哪几行 |
| 坑 | 最容易错的地方 |

---

## 2. 参考项目资产全景

| 类别 | 数量 | 参考来源 |
|------|------|----------|
| 场景 | 地面协议 / 岛边界 / 材质分区 / 痕迹 | `engine.js` + 全部 5 个游戏 |
| 建筑 | 20 种变体 | `stari-most` · `laundry` · `tie-break` · `mini-ramp` |
| 树 | 8 种变体 | `engine.js:231` · `mini-ramp:119` · `demo` |
| 花草 | 10 种变体 | `engine.js:160` · `laundry:95` · `demo` |
| 人物 | 骨架 + 10 种姿态 + 人群 AI | `engine.js:248` + 5 个游戏 |
| 道具 | 13 种 | `engine.js` + 5 个游戏 |
| 机制 | capture 缓存 / staticShadow / 低频场 | `engine.js:62,158` · `laundry:188` |
| 特效 | 15 种 | `engine.js:297-336` + 各游戏 |

---

## 3. 能力差距：参考项目 vs 本项目 demo

**这是当初"写的不行"的根因。** `demo/engine.js` 只实现了 3 个图元 + 阴影 + 描边。

| 能力 | 参考项目 | demo 现状 | 补法 |
|------|----------|----------|------|
| 5 级色阶 + hue-shift | ✅ | ✅ | 一致 |
| Bayer 抖动 | ✅ | ✅ | 一致 |
| 投影阴影（只染地面） | ✅ | ⚠️ 强度 2 值反了 | 改 1 个常量 |
| 地面反弹光 | ✅ `engine.js:75` | ❌ | 加 1 行 |
| 深度描边 | ✅ | ✅ | 一致 |
| 屏幕空间 AO | ✅ `engine.js:202` | ❌ | 抄 `bakeOcclusion()` |
| 人物 `figure()` | ✅ `engine.js:248` | ⚠️ autumn 有自定义，无通用 | 见 [figures.md](figures.md) |
| 动态阴影队列 | ✅ `engine.js:284` | ❌ | 见 [figures.md](figures.md) §4 |
| 草与风 | ✅ `engine.js:160` | ❌ 只有静态草点 | 见 [plants.md](plants.md) |
| 树叶缓存动画 | ✅ `engine.js:186` | ❌ 树全静态 | 见 [nature.md](nature.md) §1 |
| `staticShadow` | ✅ `engine.js:158` | ❌ | 见 [nature.md](nature.md) §2 |
| 像素级 UI 覆盖层 | ✅ `engine.js:297` | ❌ | 见 [effects.md](effects.md) |
| 建筑构件 | ✅ 20 种 | ❌ 只有木屋 | 见 [buildings.md](buildings.md) |
| 人群 AI | ✅ `stari-most:288` | ❌ | 见 [crowd.md](crowd.md) |

**根因归纳**：demo 缺的不是"某个效果"，而是**三块通用设施**——
`staticShadow`、capture 缓存、动态阴影队列。这三块一旦补上，
草、水、树叶、人群全都自动获得"活起来"的能力。

---

## 4. 建议落地顺序

每一步独立可见效：

| 步 | 动作 | 预期提升 | 成本 |
|----|------|----------|------|
| 1 | 修接触阴影强度 + 补地面反弹光 | 球体体积感立刻出来 | 10 分钟 |
| 2 | 补 `staticShadow` 数组 | 影子里的东西能自动变暗 | 20 分钟 |
| 3 | 抄 `bakeOcclusion()` | 树根/墙脚出现接触阴影 | 20 分钟 |
| 4 | 移植 `figure()` + `pendingShadows` | 场景里能站人、有影子 | 1.5 小时 |
| 5 | 移植 capture 树叶缓存 | 树会动 | 2 小时 |
| 6 | 移植草与风 | 草地会动 | 1.5 小时 |
| 7 | 引入 `masonry()` + `roof()` | 建筑有质感 | 2 小时 |
| 8 | 引入 `drawDots` + `drawArrow` | 能加 HUD 和指示 | 30 分钟 |

### 落地时的文件组织

建议新建 `demo/kit/`：

```
demo/kit/
  figures.js     人物骨架与姿态
  buildings.js   建筑构件
  trees.js       树变体
  plants.js      花草
  props.js       道具
  effects.js     特效与覆盖层
```

保持每个文件 < 500 行（AGENTS.md 硬性约束）。

---

## 5. 全局技术约定

这几条是"像素风成立"的前提，改动任何一条画面就会崩：

1. **固定分辨率 360×280**，整数倍最近邻放大（`image-rendering: pixelated`）。
2. **固定 30° 正交相机**，永不旋转。没有背面剔除、没有法线矩阵。
3. **深度缓冲是唯一遮挡依据**。任何自绘几何体都必须写 `zb[i]`。
4. **5 级色阶**，暗部混紫（`COOL = [46,38,84]`），亮部混暖黄（`WARM = [255,232,180]`）。
5. **大面积平面用"非常接近的 4 个色值"**，否则 Bayer 抖动会读成棋盘格。
6. **人物用 `solid` 模式**：不加抖动，色带干净，剪影清晰。
7. **环境动画一律 8fps 步进**（`WIND_FPS = 8`）。平滑插值会像 3D 动画。
8. **阴影只染"仍然是地面"的像素**（`zb[i] !== refZ[i]` 判断）。
9. **`prefers-reduced-motion` 时停止一切环境动画**。
10. **零外部资源**：没有图片、精灵图、字体文件、音频文件。

---

## 6. 参考项目代码结构

```
reference/pixel-plays/
  engine.js              343 行  渲染内核：投影/深度/图元/色阶/抖动/阴影/描边/AO/草/风/树/人物
  shell.js               147 行  页面外壳：菜单、Rules、署名、音乐
  balote/index.html      524 行  沙地球场 + 板条围板 + 长椅；2 球手；抛体物理
  laundry/index.html     674 行  屋顶 + 女儿墙 + 楼梯间 + 水塔；5 类织物；暴雨
  stari-most/index.html  655 行  拱桥 + 双塔 + 4 房 + 河滩；14 游客 AI + 跳水员骨骼
  tie-break/index.html   635 行  红土网球场 + 铁丝围栏 + 裁判椅；2 球员 + 5 观众；球拍
  mini-ramp/index.html   579 行  U 型池（曲面）+ 棕榈；滑板骑手骨骼；弧面物理
```

---

## 7. 迭代纪律

1. **先查 registry.md**，再动手。
2. 复用优先：能改参数就不写新变体。
3. 新变体必须**登记 + 写配方卡**，两步缺一不可。
4. 配方卡里的**坑**是最有价值的部分——写清楚"哪里容易错"。
5. 文档与代码不一致时**以代码为准**，并立即修正文档。

---

## 8. 相关文档

- [../analysis.md](../analysis.md) — 渲染管线整体拆解（前置知识）
- [../forest-rules.md](../forest-rules.md) — 树林生成规则（实战案例）
- [../modules/](../modules/) — demo 现有模块文档
