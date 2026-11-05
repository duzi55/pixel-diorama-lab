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
| **运行 Lo-Fi Weather** | `cd reference/lofi-weather && node serve.mjs`，打开 `http://127.0.0.1:5302/?city=Tokyo&t=night`（夜景预览用非 embed 模式） |
| 直接打开 demo | 双击 `demo/index.html`（无模块加载，可行） |
| **启动 Studio** | `node demo/studio/server.mjs 5320`，打开 `http://127.0.0.1:5320/studio/` |
| 构件生成页 | `http://127.0.0.1:5320/studio/index.html` |
| 场景编辑器 | `http://127.0.0.1:5320/studio/editor.html` |
| **场景查看器** | `http://127.0.0.1:5320/scenes/view.html?name=<场景名>`（保存的场景直接打开） |
| Studio AI 配置 | `demo/studio/studio.config.json`（模型/思考强度/预算/超时，环境变量可覆盖） |
| 编辑器冒烟测试 | `node tools/editor-test.mjs`（渲染并断言，导出 `docs/editor-screenshot.png`） |
| **构件库全量实画测试** | `node tools/kit-test.mjs`（沙箱实画每个构件：崩溃/位置/像素数/极端参数） |
| **构件行为回归测试** | `node tools/behavior-test.mjs`（行为定义 / 构件引用 / 60 帧实跑 / sway·chop 效果断言） |
| **构件接线检查** | `node tools/check-kit-wiring.mjs`（新增构件文件是否接进 gallery/catalog/preview/editor/viewer/server 六个入口） |
| **光照跟随审计** | `node tools/light-audit.mjs`（两种光照方向各画一次，找出亮度写死、不跟随光源的构件） |
| 人群模块测试 | `node tools/crowd-test.mjs`（避让/CLEARANCE/站桩断言） |
| **批量补齐变体** | `node tools/fill-variants.mjs [id…]`（照 docs/kit/ 规格 AI 实现 + 三道闸落盘） |
| 无头渲染 | `node tools/render.mjs <html> <out.png> [帧数]` |
| **山村场景测试** | `node tools/village-test.mjs`（8 项断言：动/车/风动/拾取/标记/路/屋/配色） |
| **屋顶晾衣测试** | `node tools/laundry-test.mjs`（烘焙/21 件衣物/拾取/拖拽入篮/阵风/天气/结算，导出 `docs/laundry-screenshot.png`） |
| **赛车场测试** | `node tools/racetrack-test.mjs`（烘焙/无裁切留白/3 车/50 观众/车在赛道内/欢呼联动，导出 `docs/racetrack-screenshot.png`） |
| **锥树构件预览** | `node tools/cone-preview.mjs [out.png]`（沙箱实画 cone-mast/cone-spire 组合，导出 PNG 目检形态） |
| **构件库 Gallery** | 浏览器打开 `demo/kit/gallery.html`（全部构件带实时预览、参数滑块、随机种子、可复制用法代码） |
| **构件工坊（统一工作台）** | `node demo/studio/server.mjs 5320` → `http://127.0.0.1:5320/studio/app.html`（构件库 + AI 编辑 + 生成 + 场景三合一） |
| **并排对比** | `node tools/compare.mjs <ref.png> <mine.png> <out.png>` |
| **参考图实测** | `node tools/measure-haze.mjs <png>`（色相/饱和度梯度）· `measure-road.mjs`（公路斜率）· `solve-road.mjs`（反解坐标） |

## 模块导航

| 模块 | 路径 | 说明 | 详细文档 |
|------|------|------|----------|
| 参考项目 | `reference/pixel-plays/` | 原始 Pixel Plays 源码，**只读**，不作修改 | `docs/analysis.md` |
| **参考项目·Lo-Fi Weather** | `reference/lofi-weather/` | 八城天气海报 + **上海东方明珠复刻场景**：烘焙静帧 + 逐像素天气/昼夜后处理；**发光物件系统**（emit 缓冲 / 开灯决策 / 灯池 / 泛光） | `docs/analysis-lofi-weather.md` |
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
| **山村植被** | `demo/village/foliage.js` | 路轴坐标树表（17 棵锥树）+ **树冠风动**：烘焙期用 `plotCapture` 录像素，每帧按风势回放 + 轻影 + 落叶源 | `docs/modules/foliage.md` |
| **山村木屋** | `demo/village/houses.js` | 木板拼缝墙 + 苔藓坡顶 + 亮灯窗 + 烟囱 + 体积阴影；4 栋小房沿路两侧摆位（读 terrain.js 的 ROAD） | `docs/kit/buildings.md §5b` |
| 山村村民 | `demo/village/villagers.js` | **行为状态机**：走停 / 张望 / 招手 / 弯腰捡叶 / 看车；头顶锚点与点击拾取 | `docs/modules/villagers.md` |
| 山村公路与车 | `demo/village/road.js` | 公路几何（切向/法向/投影/路坐标系）+ 黄色小甲壳虫（沿路行驶、警灯闪烁、动态阴影） | `docs/kit/props.md §8b` |
| 山村路面绘制 | `demo/village/road-paint.js` | road.js 的兜底路面实现：沥青 + 路缘石 + 黄色虚线（terrain.js 已画路面时不要调） | `docs/kit/props.md §8b` |
| **秋日山村场景** | `demo/village/` | **全屏画布 + 纸上微缩模型**：画布=窗口（1:1 像素），纯色纸背景 + 有机落叶岛（5 木屋 + 17 棵塔树），公路/地面延伸出基准画面后有机消散，车辆 Bayer 抖动淡入淡出；**树表可被 `demo/scenes/village.json` 覆盖**（Studio 场景文件的树实例优先） | `docs/modules/village.md` |
| **屋顶晾衣复刻** | `demo/laundry/` | 参考项目 Rooftop Laundry 的完整复刻：抹灰楼体 + 女儿墙 + 楼梯间/水塔/烟囱 + 21 件会摆动的衣物 + 藤篮 + 阵风/暴雨/闪电；拖拽收衣与计分 | `docs/modules/laundry.md` |
| **像素大奖赛** | `demo/racetrack/` | 等距微缩赛车场：**oval 赛道（双直道 + 半圆弯）** + 主看台/维修区/记分塔 + 3 辆方程式赛车持续绕圈 + 50 名观众；观众按最近赛车的距离起身欢呼；600×340 画布，有机溶解岛缘 + 纸色过渡，内容四边距画布边 ≥12px；人高 1.6 / 车长 3.05 / 赛道宽 5.6 | `docs/modules/racetrack.md` |
| **场景导航** | `demo/nav.js` | 每个 demo 页面左上角的场景切换菜单：本工作区 6 个场景 + 参考项目 5 个游戏（5300 端口）；自动识别当前页并下移原有 HUD | `docs/modules/nav.md` |
| **远景树海** | `demo/village/sea.js` | 岛式留白构图：锥树构件布场（大而少）+ 碎点晕开层 + 空气透视 | `docs/kit/depth-and-haze.md §4` |
| **构件库运行时** | `demo/kit/core.js` | `KIT.register` 构件注册表：id / name / category / params / collision / draw | `docs/modules/studio.md §5` |
| 构件库·人群行为 | `demo/kit/crowd.js` | `KIT_CROWD`：spectator/wanderer/crowd 三变体（目标选择+软排斥+姿态合成） | `docs/modules/studio.md §8` |
| 构件库·姿态表 | `demo/kit/figures.js` | `KIT_POSE` 十种实用姿态（含 `reach`）+ `kitPose()` 覆盖助手 | `docs/kit/figures.md 附录` |
| 构件库·渲染 | `demo/kit/render.js` | 场景模型 → 画布：地面协议、画家算法排序、实例旋转 | `docs/modules/studio.md §5` |
| 构件库·构件 | `demo/kit/trees.js` · `demo/kit/plants.js` | 树 / 草木灌木构件（与 docs/kit/ 篇目对齐） | `docs/kit/registry.md` |
| 构件库·构件 | `demo/kit/buildings.js` · `demo/kit/stoneworks.js` · `demo/kit/props.js` · `demo/kit/cart.js` | 建筑 / 石砌 / 道具 / 载具构件（AI 生成物按分类落对应模块） | `docs/kit/registry.md` |
| **构件库 Gallery** | `demo/kit/gallery.html` | **构件陈列页（Bootstrap 风格）**：按分类列出全部构件，实时预览 + 参数滑块 + seed 换形 + 一键复制调用代码；数据来自运行时注册表，新构件自动出现 | `docs/kit/README.md` |
| 构件库·锥状树 | `demo/kit/conifers.js` | `cone-mast` / `cone-spire`：**叶簇团块**锥冠（plot 逐像素填充 + 簇内球面光照，规避球体深描边）+ 粗直干根爪；走 `ctx.screen/unproject`，旋转/缩放预览不会碎成黑点；`density` 控密度；绑定 `sway` + `chop` 行为 | `docs/kit/trees.md §5.7-5.8` |
| **构件行为运行时** | `demo/kit/behavior.js` · `demo/kit/behavior-extra.js` | **行为 = 构件的逻辑层**：`KIT_BEHAVIOR.register` 注册可复用行为（sway/chop/flicker/wander/flee/greet/spin + burn/bob/open/patrol/grow/shake），构件用 `behavior.default/allow` 声明；`tick` 改 `inst.anim`（dx/dy/rot/scale/z/hidden），渲染器叠加到所有原语 | `docs/modules/behavior.md` |
| **参考构件·建筑** | `demo/kit/ref-buildings.js` · `ref-surfaces.js` · `ref-shanghai.js` | 从参考项目移植：house / square-tower / round-tower / pitched-roof / parapet / water-tank / chimney / stairs + masonry-wall / plaster-wall / stair-house + **东方明珠 oriental-pearl** | `docs/kit/ref-port.md` · `ref-surfaces.md` |
| **参考构件·结构与植被** | `demo/kit/ref-structures.js` · `ref-plants.js` | wood-fence / wire-fence / net / ramp + palm / flower / potted-plant / moss | `docs/kit/ref-port.md` · `ref-plants.md` |
| **参考构件·道具** | `demo/kit/ref-props.js` · `ref-props-small.js` | ball / bottle / wicker-basket / cloth / racket + cone / bench / awning / ball-basket | `docs/kit/ref-props.md` |
| **特效与天气** | `demo/kit/effects.js` · `weather.js` | `KIT_EFFECT`：arrow/bang/target-ring/charge-bar/halo/dust/spark/splash/ring/track-mark；`KIT_WEATHER`：rain/cloud/bolt/gradeStorm。UI 覆盖层走 `ctx.dot/dots`（不写 zb） | `docs/kit/effects-weather.md` |
| **接线检查** | `tools/check-kit-wiring.mjs` | 新增构件文件后校验它是否接进 gallery/catalog/preview/editor/viewer/server 六个入口 | — |
| **Studio 逻辑面板** | `demo/studio/app-behavior.js` | 行为编辑器：列出已挂行为 + 参数滑块（中英对照）+ 移除/添加（只从构件 `allow` 里选）；改动实时发预览沙箱 | `docs/modules/behavior.md §5` |
| **素材总目录** | `demo/kit/catalog.html` | 全部构件按 9 分类浏览 + 搜索 + 参数/行为计数；卡片直达 Studio（`app.html?select=<id>`） | `docs/kit/README.md` |
| 构件库·地面 | `demo/kit/ground.js` | 5 种地面材质（草地/泥土/沙地/石板/水面） | `docs/kit/scene.md` |
| **构件工坊 App** | `demo/studio/app.html` · `app.js` · `app-history.js` · `app-props.js` · `app-ai.js` · `app.css` | **统一工作台**：左构件列表 / 中动画预览(iframe 沙箱)+参数+代码 / 右 AI 编辑（改当前构件或新建）；属性面板（名称/ID/分类/描述/碰撞体可视化编辑，补丁写回代码）+ AI 编辑（含参考图粘贴/拖拽）；「场景」tab 内嵌编辑器，`#scene` 直达；**保存构件后跑场景冒烟（village-test + editor-test），失败自动回滚** | `docs/modules/studio.md` |
| **Studio 生成页** | `demo/studio/index.html` | 描述需求 → AI 按规范写代码 → 进度条 → 预览调参 → 确认保存；顶部可切换模型 | `docs/modules/studio.md` |
| Studio AI 配置 | `demo/studio/config.mjs` · `studio.config.json` | 模型 / 思考强度 / 预算 / 超时；环境变量可覆盖 | `docs/modules/studio.md §2.2` |
| **Studio 地形配方** | `demo/studio/terrain-recipe.js` | 主体+过渡+边缘三层配方：BFS 边缘距离 + 噪声过渡；内置 5 种配方 | `docs/modules/studio.md §4.2` |
| Studio 地形生成 | `demo/studio/terrain-shapes.js` | 程序化地形原语：island / rect / path / hill，供 AI 预设与编辑器共用 | `docs/modules/studio.md §4.2b` |
| 引擎·光照 | `demo/engine-light.js` | `LIGHT` 状态 + `PP_shadePoints` 点光源 + `PP_applyGrade` 色调/环境/暗角 | `docs/modules/studio.md §4.4` |
| Studio·光照面板 | `demo/studio/editor-light.js` | 光照 UI 绑定（色调预设/方向/亮度）+ 场景点光源收集 | `docs/modules/studio.md §4.4` |
| Studio·视图变换 | `demo/studio/editor-view.js` | 画布视图缩放/平移/复位 + 碰撞线框 + 应用工具 | `docs/modules/studio.md §4.1` |
| Studio·参考图 | `demo/studio/gen-images.js` | 图片输入三通道（选文件 / 粘贴 / 拖拽，≤3 张自动压缩），AI 经 Read 白名单读图 | `docs/modules/studio.md §2.3b` |
| Studio 地形·共用 | `demo/studio/terrain-common.js` | 投影/归属/材质过渡混合/子项装饰/收边补洞 | `docs/modules/studio.md §4.2` |
| Studio 地形·台阶 | `demo/studio/terrain-render.js` | 逐格 quad + 侧壁渲染（快，拖动时降级用） | `docs/modules/studio.md §4.2a` |
| **Studio 地形·坡面** | `demo/studio/terrain-march.js` | 高度场 sphere tracing 光线步进：缓坡 + 坡度光照，默认渲染器 | `docs/modules/studio.md §4.2a` |
| **Studio 编辑器** | `demo/studio/editor.html` | **纸面工作台**（`body.ed-paper`）：细顶栏（场景名/保存）+ 默认折叠的浮动面板 + 底部一句话指令条；空态不播种；新建场景（尺寸/背景/预设）；底图模式 | `docs/modules/studio.md §4` |
| Studio·场景存取 | `demo/studio/editor-scene.js` | 场景 JSON 序列化（W/H/S/bg/origin）· 新建 · 保存载入 · 默认地形预设 | `docs/modules/studio.md §4.0c` |
| Studio·渲染 | `demo/studio/editor-render.js` | 背景色统一（画布/舞台/页面）+ 帧循环 + 场景合成管线 | `docs/modules/studio.md §4.0c` |
| **场景查看器** | `demo/scenes/view.html` · `viewer.js` | 读 `scenes/<name>.json` 复现尺寸/背景/光照；导航「我的场景」入口 | `docs/modules/studio.md §4.0c` |
| 场景索引 | `demo/scenes/index.json` | 保存时由 `persist.mjs` 维护（name/title/bg/W/H），nav.js 异步读取 | `docs/modules/studio.md §4.0c` |
| 场景导入 | `demo/studio/scene-import.js` | 同源 iframe 抓取已有场景烘焙底图，进入底图编辑模式 | `docs/modules/studio.md §4.0b` |
| **Studio·图片还原** | `demo/studio/editor-recon.js` | 粘贴场景截图 → AI 用现有构件摆位（u/v 反投影）→ 缺的素材选替代或生成入库 | `docs/modules/studio.md §4.0d` |
| **Studio·空态/一句话建场景** | `demo/studio/editor-start.js` | 进入不默认播种；一句话描述 → `compose` 任务 → 地形+物体；图片还原/载入/空白三个入口 | `docs/modules/studio.md §4.0e` |
| **Studio·画布交互** | `demo/studio/editor-canvas.js` | pointer 事件：画笔/选框/光源/多选拖拽、画布外自动扩展、平移缩放 | `docs/modules/studio.md §4.1` |
| **Studio·历史** | `demo/studio/editor-history.js` | 撤销/重做：对象层快照（⌘Z / ⇧⌘Z），滑块输入去抖 | `docs/modules/studio.md §4.1` |
| **Studio·布局操作** | `demo/studio/editor-ops.js` | 对齐/等距分布/编组/拖动吸附/多选包围框/统一绘制排序 | `docs/modules/studio.md §4.1` |
| **Studio·选择** | `demo/studio/editor-select.js` | 单选/Shift 加选/框选/多选拖拽/复制/删除 | `docs/modules/studio.md §4.1` |
| **Studio·图层** | `demo/studio/editor-layers.js` | 对象=图层：显示隐藏、锁定、↑↓ 层级、点击选中 | `docs/modules/studio.md §4.1` |
| **Studio·属性** | `demo/studio/editor-props.js` | 位置/朝向/缩放/层级 + 构件参数全量 + 行为逻辑 | `docs/modules/studio.md §4.1` |
| **Studio·构件库** | `demo/studio/editor-kit.js` | 搜索 + 分类计数 + 缩略图网格：主引擎渲染后立即恢复画面，结果缓存，滚动到可见才渲染 | `docs/modules/studio.md §4.1` |
| **Studio·AI 任务表** | `demo/studio/jobs.mjs` | 后台任务（关页面不丢）+ jobId 恢复 + dedupeKey 幂等 + 并发上限 + SSE 订阅 | `docs/modules/studio.md §4.0f` |
| Studio 服务端 | `demo/studio/server.mjs` | 静态服务 + AI 桥 + 落盘器（零依赖，只用 node: 内置模块）；`/api/kit` 用**注释/字符串感知扫描器**切构件块（只数括号会被注释里的 `)` 截断） | `docs/modules/studio.md §6` |
| **图集烘焙器** | `tools/bake-atlas.mjs` | 构件按 N 朝向离屏渲染 → `demo/export/atlas.png` + `atlas.json`（帧矩形/锚点/UV/碰撞体） | `docs/modules/export.md` |
| **three.js 消费示例** | `demo/export/three-demo.html` | 读图集渲染等距场景：8 朝向切换/缩放平移/色调；three.js 走 CDN | `docs/modules/export.md §3` |
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
