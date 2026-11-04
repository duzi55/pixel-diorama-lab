# pixel-diorama-lab

等距像素微缩景观（isometric pixel diorama）的研究工作区：把参考项目的源码、完整技术拆解，以及按同一套思路写的最小可运行 demo 放在一起。

## 目录

| 路径 | 内容 |
|------|------|
| `reference/pixel-plays/` | 原始开源项目 **Pixel Plays** 的完整源码（MIT），用于对照阅读 |
| `demo/` | 从零重写的最小 demo：投影、深度缓冲、球体光照、抖动、阴影、描边、土层 |
| `demo/forest.html` | 翠绿小树林生成器，带参数面板（树数量 / 树冠大小 / 配色 / 种子） |
| `demo/autumn.html` | 秋日野餐：梧桐、菱形地台、格子野餐布、两个人物、风动落叶 |
| `demo/kit/` | **构件库运行时**：`KIT.register` 注册表 + 已落地构件（AI 生成物也落这里） |
| `demo/studio/` | **Studio 生产线**：构件生成页 + 场景编辑器 + AI 桥 + 落盘器 |
| `docs/kit/` | **构件库**：参考项目资产的规格书（场景/建筑/人物/道具/自然/特效），含算法、参数与移植清单 |
| `docs/analysis.md` | 对 Pixel Plays 渲染管线的完整技术拆解 |
| `docs/forest-rules.md` | 从参考图到树林生成规则的完整说明 |
| `docs/modules/engine.md` | demo 渲染器模块说明 |
| `docs/modules/demo.md` | demo 场景与交互说明 |
| `docs/modules/forest.md` | 树林生成器模块说明 |
| `docs/modules/autumn.md` | 秋日野餐模块说明 |
| `docs/modules/studio.md` | **Studio 生产线说明**：生成流程、AI 桥、编辑器、碰撞体积 |
| `docs/screenshot.png` | demo 运行截图 |
| `docs/forest-screenshot.png` | 树林运行截图 |
| `docs/autumn-screenshot.png` | 秋日野餐运行截图 |
| `docs/editor-screenshot.png` | 编辑器运行截图 |

## 构件库（`docs/kit/`）

参考项目里已经实现并验证过 78 个程序化构件，散落在 5 个游戏页中。
`docs/kit/` 把它们整理成可长期复用的规格库，**避免重复造轮子**。

**两级组织**：先查 [registry.md](docs/kit/registry.md) 索引（一行看清"有什么"），
再翻对应配方卡（一张卡讲透"怎么做"）。

| 篇目 | 内容 |
|------|------|
| [registry.md](docs/kit/registry.md) | **变体注册表**：80 个变体，每行带配方卡锚点链接 |
| [README.md](docs/kit/README.md) | 架构说明、复用路线、能力差距对照表 |
| [trees.md](docs/kit/trees.md) | 树变体配方卡（8 种） |
| [buildings.md](docs/kit/buildings.md) | 建筑变体配方卡（20 种） |
| [plants.md](docs/kit/plants.md) | 花草灌木配方卡（10 种） |
| [structures.md](docs/kit/structures.md) | 材质算法与线性/曲面构件 |
| [figures.md](docs/kit/figures.md) | 人物骨架、姿态参数、调色板 |
| [crowd.md](docs/kit/crowd.md) | 人群 AI、局部避让 |
| [props.md](docs/kit/props.md) | 道具配方卡 |
| [nature.md](docs/kit/nature.md) | 三条通用机制 + 水面、岩石、落叶 |
| [effects.md](docs/kit/effects.md) | UI 覆盖层、描边、AO、渲染顺序 |
| [weather.md](docs/kit/weather.md) | 雨云闪电、全局调色、天气声 |
| [scene.md](docs/kit/scene.md) | 地面协议、边界、材质分区、痕迹 |

每篇都标注**源码锚点**（`文件:行号` + 函数名）、**参数含义与调参区间**、**移植清单**、**坑**。

### 迭代规则

- **先查注册表，再动手。**
- **只有骨架结构不同才建新 ID**；配色、尺寸、数量差异走参数组。
- 新变体必须**注册 + 写配方卡**，两步缺一不可。

### 当前最大缺口

demo 缺的不是某个效果，而是**三块通用设施**：
`staticShadow`（影子联动）、capture 像素缓存（风动）、动态阴影队列（人物投影）。
补上这三块，草、水、树叶、人群全都自动获得"活起来"的能力。

## 运行

demo 零依赖、零构建：

```bash
cd demo
python3 -m http.server 5310
# 打开 http://127.0.0.1:5310/        单场景 demo
# 打开 http://127.0.0.1:5310/forest.html  翠绿小树林
# 打开 http://127.0.0.1:5310/autumn.html  秋日野餐
```

也可以直接双击 `demo/index.html`。

原项目自带一个静态服务器：

```bash
cd reference/pixel-plays
node serve.mjs
# 打开 http://127.0.0.1:5300/
```

## Studio：构件生成与场景编辑

一条**需求 → 构件 → 场景**的生产线，零依赖、零构建。

```bash
node demo/studio/server.mjs 5320
# 生成页  http://127.0.0.1:5320/studio/index.html
# 编辑器  http://127.0.0.1:5320/studio/editor.html
```

**生成页**：描述你想要什么 → AI 按 `docs/kit/` 的规范写出构件代码 →
转盘预览（带碰撞体线框）→ 你点「确认保存」，**三件套**一次落盘：

- `demo/kit/<模块>.js` —— 构件代码
- `docs/kit/registry.md` —— 注册表加一行
- `docs/kit/<篇目>.md` —— 配方卡

AI 走本地 `claude` CLI headless 模式（`--json-schema` 保证结构化输出，
`--tools ''` 硬隔离，不给 AI 碰文件系统的能力）。

**编辑器**：逐格画地形（世界轴对齐的方格 → 标准等距菱形瓦片，带高度与侧壁）·
从构件库拖构件进场景 · 调朝向与参数 · **手动或让 AI 推断碰撞体积** · 存成场景 JSON。

碰撞体是编辑辅助，画成虚线、只画背向观众的竖线，不遮挡物体本身。

详见 [docs/modules/studio.md](docs/modules/studio.md)。

---

## Demo 演示了什么

- 360×280 低分辨率画布，整数倍最近邻放大
- 30° 正交等距投影 + 深度缓冲
- 球体、胶囊、盒子三种程序化图元
- 5 级色阶 + hue-shift 配色 + Bayer 4×4 有序抖动
- 投影阴影（只染地面）与深度缓冲描边
- 岛屿土层向下挤出
- 拖动蓝色小球，观察阴影、遮挡和深度关系

`forest.html` 在此基础上做的树林：

- 椭圆区域内拒绝采样布点，最小间距保证林冠重叠
- 每棵树 = 分叉树干 + 内层大球 + 表层小球的双层树冠
- 5 档翠绿色阶，按球体高度分配明暗
- 树冠投影与树根接触影
- 参数面板实时调整树数量、树冠大小、配色和随机种子

`autumn.html` 换成秋天的野餐场景：

- 菱形地台（uv 空间曼哈顿距离），铺满金黄落叶
- 三棵法国梧桐：笔直灰白树干、细密分枝、树上没有叶子
- 红白格子野餐布、藤篮、法棍、水果、奶酪
- 两个人：一个仰坐撑手，一个双手枕头躺着
- 阵风包络 + 单树摆动，12fps 步进，零星落叶飘下

## 来源与许可

`reference/pixel-plays/` 来自 [amirmushichge/pixel-plays](https://github.com/amirmushichge/pixel-plays)：

- 代码：MIT License，Copyright (c) 2026 Amir Mushich（见 `reference/pixel-plays/LICENSE`）
- 概念：abhi（[@awwbhi2](https://x.com/awwbhi2)）
- 实现：AmirMushich（[@AmirMushich](https://x.com/AmirMushich)）
- 视觉参考：shawn. 的 [Small plays](https://x.com/zzzzshawn/status/2111546123546661289)

原项目的背景音乐不在 MIT 许可内（见 `reference/pixel-plays/MUSIC.md`）。本工作区仅用于技术研究。

`demo/` 是基于原始 `engine.js` 思路的派生实现，同样遵循 MIT License（见 `demo/LICENSE`）。它只保留了最小闭环，去掉了风、AO、人物、音频和玩法层。
