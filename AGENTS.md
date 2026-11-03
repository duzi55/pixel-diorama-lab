# pixel-diorama-lab

等距像素微缩景观（isometric pixel diorama）的技术研究项目：阅读一个开源实现，拆解它的渲染管线，并用最小代码复刻核心效果。

## 技术栈

- 原生 HTML / CSS / JavaScript（ES2020），无框架
- Canvas 2D + `ImageData` / `Uint32Array` 直接写像素
- 无 WebGL、无构建步骤、无第三方依赖

## 环境与常用命令

| 用途 | 命令 |
|------|------|
| 运行 demo | `cd demo && python3 -m http.server 5310`，打开 `http://127.0.0.1:5310/` |
| 运行参考项目 | `cd reference/pixel-plays && node serve.mjs`，打开 `http://127.0.0.1:5300/` |
| 直接打开 demo | 双击 `demo/index.html`（无模块加载，可行） |

## 模块导航

| 模块 | 路径 | 说明 | 详细文档 |
|------|------|------|----------|
| 参考项目 | `reference/pixel-plays/` | 原始 Pixel Plays 源码，**只读**，不作修改 | `docs/analysis.md` |
| **构件库索引** | `docs/kit/registry.md` | **79 个变体的活注册表**：树/建筑/花草/道具/姿态/人群/特效，每行带配方卡锚点链接 | `docs/kit/README.md` |
| 构件库·树 | `docs/kit/trees.md` | 8 种树变体配方卡 | — |
| 构件库·建筑 | `docs/kit/buildings.md` | 20 种建筑变体配方卡 | — |
| 构件库·花草 | `docs/kit/plants.md` | 10 种花草灌木配方卡 | — |
| 构件库·机制 | `docs/kit/nature.md` | capture 缓存 / staticShadow / 低频场三条通用机制 | — |
| 构件库·结构 | `docs/kit/structures.md` | 材质算法与线性/曲面构件 | — |
| 构件库·人物 | `docs/kit/figures.md` | 人物骨架、姿态、调色板 | — |
| 构件库·人群 | `docs/kit/crowd.md` | 人群 AI、局部避让 | — |
| 构件库·道具 | `docs/kit/props.md` | 道具变体 | — |
| 构件库·特效 | `docs/kit/effects.md` | UI 覆盖层、描边、AO | — |
| 构件库·天气 | `docs/kit/weather.md` | 雨云闪电、全局调色 | — |
| 构件库·场景 | `docs/kit/scene.md` | 地面协议、边界、材质分区 | — |
| demo 渲染器 | `demo/engine.js` | 等距投影、深度缓冲、球/胶囊/盒、色阶、抖动、阴影、描边；支持 `PP_SCALE` / `PP_ORIGIN_Y` 覆盖 | `docs/modules/engine.md` |
| demo 场景 | `demo/demo.js` | 岛屿地面、土层、木屋、树、球、交互 | `docs/modules/demo.md` |
| demo 入口 | `demo/index.html` | 页面结构、HUD、缩放样式 | — |
| 树林生成器 | `demo/forest.js` | 可参数化的树林：布点、双层树冠、配色、阴影 | `docs/modules/forest.md` |
| 树林页面 | `demo/forest.html` | 树林预览与控制面板 | `docs/forest-rules.md` |
| 秋日野餐 | `demo/autumn.js` | 梧桐、菱形地台、野餐布、人物、风动 | `docs/modules/autumn.md` |
| 秋日页面 | `demo/autumn.html` | 秋日野餐预览 | — |
| 山村村民 | `demo/village/villagers.js` | 路人沿人行道走停、门口村民张望、头顶锚点与拾取接口 | `docs/modules/villagers.md` |
| 技术分析 | `docs/analysis.md` | 原项目完整管线拆解与代码索引 | — |
| 树林规则 | `docs/forest-rules.md` | 从参考图到生成规则的完整参数化说明 | — |

## 硬性约束

1. **零依赖、零构建**：demo 只能使用浏览器原生 API，不引入 npm 包、打包器或图片资源。
2. **固定分辨率**：渲染画布固定 `360×280`，显示尺寸按整数倍缩放，保持像素锐利。
3. **程序化画面**：所有纹理、地形、物体由代码生成，不使用外部图片、模型或字体文件。
4. **参考项目只读**：`reference/pixel-plays/` 用于对照阅读，任何实验都写在 `demo/`。
5. **文档同步**：修改 `engine.js` 的公共接口或新增模块时，同步更新对应 `docs/` 文档。
6. **文件规模**：单个 JS 文件不超过 500 行；超过时先评估拆分。

## 工作纪律：写新场景前先查构件库

**动手造场景、造人物、造建筑之前，先查 `docs/kit/registry.md`。**
参考项目已经实现并验证过：砖石砌体、拱桥曲面、人群 AI、织物形变、
树叶缓存动画、像素级 UI 覆盖层等 79 个构件。
`docs/kit/` 记录了每个构件的**算法、参数含义、调参区间、源码锚点、移植清单**。

照抄算法，不要重新推导；调参数，不要重新实现。

### 变体 vs 参数的判定

**只有骨架结构不同才建新 ID；配色、尺寸、数量差异走参数组。**

| 差异 | 处理 |
|------|------|
| 配色不同 | 参数组（如 `palette`） |
| 尺寸 / 数量不同 | 参数组（如 `scale` / `density`） |
| **骨架结构不同** | **独立 ID**（新建配方卡） |

例：花树 = `broadleaf` + `bloomRate`（不建 ID）；灌木 = `canopy` + `height`（不建 ID）。

### 新变体登记流程

1. 查注册表，确认真的没有可复用的。
2. 实现它。
3. **在 `docs/kit/registry.md` 加一行**（含配方卡锚点链接）。
4. **在对应篇目写一张配方卡**。

步骤 3 和 4 缺一不可：**没登记的变体等于不存在**（下次会重造轮子）。

配方卡必填：ID · 来源（`文件:行号` + 函数名）· 形态 · 参数（默认值与区间）·
关键算法（与基型的差异点）· 移植清单 · 坑。

新构件落地后，**回写进 `docs/kit/` 对应篇目**，保持文档是活的资产库。
