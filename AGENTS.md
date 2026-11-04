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
| **启动 Studio** | `node demo/studio/server.mjs 5320`，打开 `http://127.0.0.1:5320/studio/` |
| 构件生成页 | `http://127.0.0.1:5320/studio/index.html` |
| 场景编辑器 | `http://127.0.0.1:5320/studio/editor.html` |
| 编辑器冒烟测试 | `node tools/editor-test.mjs`（渲染并断言，导出 `docs/editor-screenshot.png`） |
| **构件库全量实画测试** | `node tools/kit-test.mjs`（沙箱实画每个构件：崩溃/位置/像素数/极端参数） |
| 人群模块测试 | `node tools/crowd-test.mjs`（避让/CLEARANCE/站桩断言） |
| **批量补齐变体** | `node tools/fill-variants.mjs [id…]`（照 docs/kit/ 规格 AI 实现 + 三道闸落盘） |
| 无头渲染 | `node tools/render.mjs <html> <out.png> [帧数]` |
| **山村场景测试** | `node tools/village-test.mjs`（8 项断言：动/车/风动/拾取/标记/路/屋/配色） |
| **锥树构件预览** | `node tools/cone-preview.mjs [out.png]`（沙箱实画 cone-mast/cone-spire 组合，导出 PNG 目检形态） |
| **并排对比** | `node tools/compare.mjs <ref.png> <mine.png> <out.png>` |
| **参考图实测** | `node tools/measure-haze.mjs <png>`（色相/饱和度梯度）· `measure-road.mjs`（公路斜率）· `solve-road.mjs`（反解坐标） |

## 模块导航

| 模块 | 路径 | 说明 | 详细文档 |
|------|------|------|----------|
| 参考项目 | `reference/pixel-plays/` | 原始 Pixel Plays 源码，**只读**，不作修改 | `docs/analysis.md` |
| **构件库索引** | `docs/kit/registry.md` | **80 个变体的活注册表**：树/建筑/花草/道具/姿态/人群/特效，每行带配方卡锚点链接 | `docs/kit/README.md` |
| 构件库·树 | `docs/kit/trees.md` | 树变体配方卡（含秋日山村新增的 `pine` 锥面塔冠 / `shrub` 无干球丛） | — |
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
| **山村植被** | `demo/village/foliage.js` | 成团布点（沿路参数坐标钉团心）、阔叶树 6 簇球堆冠 / 针叶树锥面塔冠、capture 风动树冠、每帧重画树干、灌木 | `docs/modules/foliage.md` |
| **山村木屋** | `demo/village/houses.js` | 木板拼缝墙 + 苔藓坡顶 + 亮灯窗 + 烟囱 + 体积阴影；7 栋沿路两侧摆位（读 terrain.js 的 ROAD） | `docs/kit/buildings.md §5b` |
| 山村村民 | `demo/village/villagers.js` | 路人沿人行道走停、门口村民张望、头顶锚点与拾取接口 | `docs/modules/villagers.md` |
| 山村公路与车 | `demo/village/road.js` | 公路几何（切向/法向/投影/路坐标系）+ 黄色小甲壳虫（沿路行驶、警灯闪烁、动态阴影） | `docs/kit/props.md §8b` |
| 山村路面绘制 | `demo/village/road-paint.js` | road.js 的兜底路面实现：沥青 + 路缘石 + 黄色虚线（terrain.js 已画路面时不要调） | `docs/kit/props.md §8b` |
| **秋日山村场景** | `demo/village/` | **竖幅秋日山村**：层叠树海 + 斜穿公路 + 亮灯木屋 + 甲壳虫车 + 村民（点击打招呼） | `docs/modules/village.md` |
| **远景树海** | `demo/village/sea.js` | 按屏幕坐标布点的层叠树群 + 空气透视调色（整幅无天空） | `docs/kit/depth-and-haze.md §4` |
| **构件库运行时** | `demo/kit/core.js` | `KIT.register` 构件注册表：id / name / category / params / collision / draw | `docs/modules/studio.md §5` |
| 构件库·人群行为 | `demo/kit/crowd.js` | `KIT_CROWD`：spectator/wanderer/crowd 三变体（目标选择+软排斥+姿态合成） | `docs/modules/studio.md §8` |
| 构件库·姿态表 | `demo/kit/figures.js` | `KIT_POSE` 十种实用姿态（含 `reach`）+ `kitPose()` 覆盖助手 | `docs/kit/figures.md 附录` |
| 构件库·渲染 | `demo/kit/render.js` | 场景模型 → 画布：地面协议、画家算法排序、实例旋转 | `docs/modules/studio.md §5` |
| 构件库·构件 | `demo/kit/trees.js` · `demo/kit/plants.js` | 树 / 草木灌木构件（与 docs/kit/ 篇目对齐） | `docs/kit/registry.md` |
| 构件库·构件 | `demo/kit/buildings.js` · `demo/kit/stoneworks.js` · `demo/kit/props.js` | 建筑 / 石砌 / 道具构件（AI 生成物按分类落对应模块） | `docs/kit/registry.md` |
| 构件库·锥状树 | `demo/kit/conifers.js` | `cone-mast` 巨层塔树 / `cone-spire` 尖锥树：实心融合塔体 + 层缝弧线，秋日背景林（golden 参数组调色） | `docs/kit/trees.md §5.7-5.8` |
| 构件库·地面 | `demo/kit/ground.js` | 5 种地面材质（草地/泥土/沙地/石板/水面） | `docs/kit/scene.md` |
| **Studio 生成页** | `demo/studio/index.html` | 描述需求 → AI 按规范写代码 → 预览 → 确认保存 | `docs/modules/studio.md` |
| **Studio 编辑器** | `demo/studio/editor.html` | 逐格画地形 · 装配物体 · 调碰撞体积 · 存场景 | `docs/modules/studio.md §4` |
| Studio 服务端 | `demo/studio/server.mjs` | 静态服务 + AI 桥 + 落盘器（零依赖，只用 node: 内置模块） | `docs/modules/studio.md §6` |
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
树叶缓存动画、像素级 UI 覆盖层等 80 个构件。
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

---

## 工作纪律：Studio 生产线

`demo/studio/` 是一条**需求 → 构件 → 场景**的生产线。

```
需求描述 ──▶ AI 按 docs/kit/ 规范写代码 ──▶ iframe 预览 ──▶ 你确认
                                                              │
                                     ┌────────────────────────┘
                                     ▼
                       demo/kit/<模块>.js  +  registry.md  +  配方卡
```

### 构件的三件套

新构件落地**必须**同时写三样东西，缺一不可：

| 文件 | 内容 |
|------|------|
| `demo/kit/<模块>.js` | `KIT.register({...})` 调用 |
| `docs/kit/registry.md` | 一行 `\| [id](doc#anchor) \| ... \|` |
| `docs/kit/<篇目>.md` | 配方卡（ID·来源·形态·参数·碰撞体·移植清单·坑·实现） |

Studio 的「确认保存」会**原子地**写这三个文件（先在内存算好，全成功才落盘），
落盘前过**三道机器闸**：语法 → **沙箱实画**（崩 / 画面不跟实例位置走 / 像素过少都拒收）
→ 合并后整文件语法。手工新增构件时必须照做同样的三件套，并跑
`node tools/kit-test.mjs` 确认全库通过。

### 构件定义契约

```js
KIT.register({
  id: 'kebab-case-id',       // 稳定英文标识
  name: '中文名',
  category: 'tree|building|plant|prop|figure',
  desc: '一句话形态',
  params: { 参数名: { def, min, max, step, desc } },
  collision: { type: 'box'|'cylinder', ... },
  draw(ctx, inst) { /* 只用 ctx.* 原语 */ },
});
```

写构件的铁律见 `docs/modules/studio.md §5.2`，其中最容易踩的三条：

1. **颜色分两张皮**：`sphere/capsule/box` 只吃 `[r,g,b]` 基色数组；
   `rampOf(...)[i]` 和 `rgb(...)` 是打包像素，只能给 `plot()` / 像素直写。喂错必崩。
2. **坐标必须基于 `ctx.x / ctx.y` 偏移**，禁止裸写 `[0,0,...]` 当位置 ——
   实画校验会在两个位置各画一次比对。
3. **随机只能用 `ctx.hash(k, ctx.seed)`**，禁止 `Math.random()` —— 场景要可复现。

### 碰撞体积

每个构件带一个碰撞体（`box` 或 `cylinder`），可在编辑器里手动调，
也可以让 AI 按外形语义推断。规则：**贴合实际外形，不含装饰**
（屋顶挑檐、树冠、伸出的横杆不计入）。
