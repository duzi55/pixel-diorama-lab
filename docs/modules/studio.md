# studio — 构件生成与场景编辑器

> **构件工坊（统一工作台）**：`demo/studio/app.html`
> 把「构件陈列」「素材生成器」「地形编辑器」合成一个应用：
> - **构件库** tab：左侧分类列表；中间 = 动画预览（preview.html 沙箱，持续旋转 + 悬停暂停）
>   + 参数滑块 + 构件代码；右侧 = **AI 编辑框**（「修改当前」把现有代码一起发给 AI，
>   返回完整新代码 → 应用预览 → 保存三件套；「新建构件」等价素材生成器）
> - **场景** tab：内嵌 `editor.html`（独立的 `index.html` 生成页保留，但工坊里用「新建构件」代替，避免功能重复）
> - 数据接口：`GET /api/kit`（含代码）、`POST /api/generate`、`POST /api/save`
> - 地址 hash：`#scene` 直达场景编辑器
> - 视觉：与 `studio.css` 同一套深色令牌（`--bg/--bg-2/--accent`），
>   内嵌的生成页/编辑器也是深色 —— 整个 Studio 风格统一
> - 预览沙箱的缩放（`scale`）必须作用到 `box/shadow`：只缩放 sphere/plot
>   会让墙体停在原尺寸，建筑看起来"镂空/半透明"（已修）
> - 预览环境控制（postMessage）：`{type:'bg', tone:'dark'|'paper'}` 背景、
>   `{type:'light', on, tone:'warm'|'cool'|'neutral'}` 光源开关与色系、
>   `{type:'rot', rot}` 手动旋转、`{type:'spin', on}` 自动旋转
> - 参数标签中英对照：`height · 树高`（英文键 + 中文 desc）
> - **属性面板**（可视化配置代码里的字段）：名称 / ID / 分类 / 描述 /
>   碰撞体（box 的 w·d·h 或 cylinder 的 radius·height / 无）→「应用并预览」
>   直接把字段补丁写回代码；参数块的「当前值存为默认」把滑块值写回 `def`
> - 预览工具条可开关**碰撞体显示**（默认关）
> - **布局**：左构件列表 / 中预览舞台 / 右标签面板（AI · 属性 · 参数 · 逻辑 · 记录）；
>   代码块默认收起可展开
> - **逻辑面板**（`app-behavior.js`，行为编辑器）：
>   - 预览沙箱报告 `behavior-info`（当前实例已挂行为 + 构件允许的行为定义）
>   - 每个行为一张卡：label + id 徽章 + 分类徽章 + 参数滑块（`中文 desc · 参数名`）
>   - 可移除已挂行为、从「可添加的行为」chip 里添加（默认参数）
>   - 改动防抖 120ms 后发 `{type:'behaviors', list}` 给沙箱，立即重绘
>   - 空状态区分「没选构件」与「构件没声明行为」
>   - 预览里**点击画布**（未拖动）会转发给沙箱，触发 chop / greet / flicker 等反应行为
> - **预览舞台**（图片查看器模型）：画布在 iframe 内绝对居中、固定 520×560，
>   模型始终以 scale=1 绘制；视图 = `{z, px, py}` → 沙箱用 CSS transform 缩放/平移
>   - 「适应」：沙箱逐像素 diff 量出构件包围盒 → 等比缩放到 ~86%（封顶 4×）并居中
>   - 拖拽改 px/py、滚轮以指针为中心缩放（25%~1000%）、工具栏 −/＋
>   - 地面盘半径随构件 footprint 自适应（0.5× 跨度），放大时不抢画面
>   - **不缩放模型本身**：逐像素绘制（plot）的构件坐标被拉开会碎成筛网状
>     （卡车"透明"的根因）
> - **AI 思考与进度**：生成走 SSE（`Accept: text/event-stream`），
>   `open/progress/thinking/done/error` 事件实时显示推理、工具调用、token 数与进度条
> - **每个构件一份 AI 对话**：需求 / 思考 / 结果都跟着构件走，
>   存 `localStorage['studio-chat:<id>']`（每构件保留最近 8 轮）；切回时自动恢复
> - **预览沙箱加载完整构件源文件**（trees/conifers/plants/buildings/…），
>   否则单独注入 register 块会缺 `coneCanopy` / `kitWoodWall` 这类文件内辅助函数，
>   切换构件就画不出来；注入的代码包一层 IIFE，连续预览不会 const 重名
> - **修改记录**（`app-history.js`）：属性应用 / 参数存默认 / AI 结果 / 应用代码
>   之前自动存快照（localStorage 按构件隔离，最多 30 条），可一键还原到任一版本
> - **参考图输入**：AI 面板支持三种方式 —— 「＋添加图片」按钮、**Ctrl/⌘+V 直接粘贴**到需求框、
>   **拖拽图片**到 AI 面板（最多 3 张，长边压到 900px 后以 dataURL 随 `images` 发送，
>   服务端落盘到 `.ref-images/` 并由 AI 用 Read 工具读图）
> - 旋转开关交互修正：悬停暂停后，鼠标移出**按复选框状态**恢复（此前无条件恢复，
>   导致取消勾选仍在转）


路径：`demo/studio/`

一套**零依赖、零构建**的生产线：把"想要一个构件"变成"项目里多一个可复用构件"，
再把构件摆进场景、调好碰撞体、存成场景文件。

```
需求描述 ──▶ AI 按 docs/kit/ 规范写代码 ──▶ iframe 沙箱预览 ──▶ 你确认
                                                              │
                                     ┌────────────────────────┘
                                     ▼
                       demo/kit/<模块>.js  +  registry.md  +  配方卡
                                     │
                                     ▼
              编辑器：画地形 · 装配物体 · 调碰撞体 · 存场景
```

---

## 1. 启动

```bash
# 1. 起 studio 服务（同时提供静态文件与 API）
node demo/studio/server.mjs 5320

# 2. 打开生成页
open http://127.0.0.1:5320/studio/index.html

# 3. 打开编辑器
open http://127.0.0.1:5320/studio/editor.html
```

服务只用 `node:http` / `node:fs` 等内置模块，不需要 `npm install`。

---

## 2. 构件生成页（`index.html`）

### 2.1 流程

| 步 | 做什么 | 产物 |
|----|--------|------|
| 1 | 填需求描述（可选：分类、补充说明） | — |
| 2 | 点「生成」 | 服务端调 `claude` CLI，拿到结构化 JSON |
| 3 | 自动送进 iframe 预览 | 转盘旋转 + 碰撞体线框 |
| 4 | 点「确认保存」 | **三件套**落盘 |

快捷键：`Cmd/Ctrl + Enter` 生成。

### 2.3b 参考图（图片输入）

生成页可附**最多 3 张参考图**（截图/手绘/照片，自动压到 768px 控制体积）。
三种来源走同一条管线（`demo/studio/gen-images.js`）：

| 来源 | 操作 | 说明 |
|------|------|------|
| **粘贴** | `Cmd/Ctrl + V`（页面任意位置） | 截图工具、网页复制的图片直接可用；纯文本粘贴不受影响 |
| **拖拽** | 把图片文件拖进页面 | 拖入时参考图区高亮，松手即加入 |
| **选文件** | ＋ 添加图片 | 文件选择器，支持多选 |

```
图片（File/Blob）→ canvas 压到最长边 768px（透明底铺白）→ JPEG 0.82
                → GEN.refImages → 缩略图（可移除）
                → 生成时随请求发送 → 服务端写入 demo/studio/.ref-images/
                → 提示词引导 AI 用 Read 工具读图
```

剪贴板处理要点：

- `paste` 监听在 `document` 上，只有剪贴板里**存在图片文件**时才 `preventDefault()`
  并拦截；纯文本（描述需求、贴代码）走浏览器默认行为。
- `clipboardData.items` 必须在事件同步阶段读取（`getAsFile()` 之后就失效）。
- 非图片文件（如 `text/plain` 文件）不拦截、不入口。
- 满 3 张后 ＋ 按钮置灰，状态栏提示「已添加 N 张；参考图最多 3 张」。

CLI 侧为带图请求**只启用 Read 一个工具**：`--tools Read`（无图时是 `--tools ''`，全部禁用）。

> ⚠️ 这里踩过坑：曾经写成 `--tools ''` + `--allowedTools Read`，
> 结果前者把所有工具禁掉，`--allowedTools` 只是权限白名单，救不回来 ——
> AI 收到的提示里只会说「Read is disabled for this session」。
> 判断"能不能读图"要看 `--tools`，不是 `--allowedTools`。

AI 只能读那张图，不能执行命令。推理面板里能看到它读图后的分析原文。

### 2.3c 自定义命名

预览标题旁两个输入框：**名称**（中文显示名）与 **id**（kebab-case 标识）。
改动会实时同步进构件代码（保存三件套用改后的值）。id 非法（大写/特殊字符）会被
自动规整，保存前校验拦截。

### 2.2 AI 桥

**通路**：本地 `claude` CLI headless 模式，不走 HTTP API。

```bash
claude -p "<提示词>" \
  --output-format stream-json --verbose \
  --json-schema '<schema>' \
  --tools ''            # 禁用所有工具：AI 只写代码，不碰文件系统
  --permission-mode dontAsk \
  --no-session-persistence
```

`--json-schema` 让 CLI 直接返回合法 JSON（`structured_output` 字段），
省掉解析自由文本的脆弱环节。`--tools ''` 是硬隔离 —— AI 没有 Bash / 文件读写能力。
`--output-format stream-json` 让服务端**边跑边收到事件**，供进度条转发。

**提示词模板**在 `demo/studio/ai.mjs` 的 `KIT_SPEC` 里，内容就是本项目的构件规范：
运行时契约、`ctx` 可用成员、铁律、输出格式。

**现有构件清单**会自动注入提示词，避免 AI 重造轮子（对应 AGENTS.md「先查注册表」纪律）。

### 模型配置（studio.config.json）

读取优先级：内置默认 → `demo/studio/studio.config.json` → 环境变量 `STUDIO_MODEL` / `STUDIO_EFFORT` / `STUDIO_MAX_BUDGET` / `STUDIO_TIMEOUT`（后者覆盖前者）。

| 项 | 默认 | 说明 |
|----|------|------|
| `model` | `""`（CLI 默认） | 模型名或别名：`sonnet` / `opus` / 模型全名 |
| `effort` | `""` | 思考强度 low ~ max |
| `maxBudgetUsd` | `2` | 单次生成花费上限（`--max-budget-usd`） |
| `timeoutMs` | `300000` | 单次超时，超时 SIGKILL 并报错 |

生成页顶部**可直接切换模型**（下拉：CLI 默认 / Sonnet / Opus / Haiku / 自定义），
切换即写回 `studio.config.json`（`POST /api/config`），下次生成生效，无需重启。
当前生效配置由 `GET /api/config` 返回并实时显示。

### 生成进度条（SSE 流式）

`POST /api/generate`（带 `Accept: text/event-stream`）走 **SSE**：

```
event: open      → 服务就绪
event: progress  → {stage:'connected'|'thinking'|'done', message, outputTokens}
event: done      → {ok, component}（或 event: error）
```

前端进度条策略：连接 18% → 每轮 thinking 渐近 82%（每事件 +3.5%）→
完成跳 94% → 校验落盘后 100%。同时显示累计输出 token 数与总耗时。
旧的整包 JSON 返回仍保留（不带流式头时自动回落）。

### 2.3 预览沙箱

`preview.html` + `preview.js`：

- `sandbox="allow-scripts"` 的 iframe，与父页面隔离
- 构件代码用**真正的 `<script>` 标签**注入 —— `eval` 会让顶层 `const` 留在
  eval 作用域里，`KIT.register` 反而找不到（这是预览最容易踩的坑）
- 预览用精简版 KIT 运行时（`preview-kit.js`），只含 `register` / `get` / `resolve`
- 12fps 步进渲染，与其他场景一致
- `PV_makeCtx()` 把预览旋转/缩放包进 `ctx`：`sphere/capsule/plot/box` 之外，
  还暴露 `ctx.screen(x,y,z)` 与 `ctx.unproject(ix,iy,z)`（`kit/render.js` 同款）。
  逐像素绘制的构件（`leafBlob`）必须用这两个函数算包围盒、反解像素，
  否则旋转预览里叶簇会被裁成碎片，空隙透出背景 → 满树黑点。
  缺省回落到全局 `project()` / `coneUnproject()`，老构件不用改。

**构件代码切块（`GET /api/kit`）**：服务端按注释/字符串感知的扫描器切
`KIT.register(...)` 调用块（`codeMask` + `splitKitBlocks`），不能只数括号 ——
`cart.js` 的注释「// 1) 斗身…」里的 `)` 会让括号深度提前归零，
切出来的块缺一半，预览注入时直接 `SyntaxError`（构件点了没反应/空白）。

---

## 3. 落盘三件套

点「确认保存」后写三个文件（`demo/studio/persist.mjs`）：

| 文件 | 内容 | 位置 |
|------|------|------|
| 构件代码 | `KIT.register({...})` 块 | `demo/kit/<模块>.js` |
| 注册表 | 一行 `\| [id](doc#anchor) \| ... \|` | `docs/kit/registry.md` |
| 配方卡 | ID / 来源 / 形态 / 参数 / 碰撞体 / 移植清单 / 坑 / 实现 | `docs/kit/<篇目>.md` |

**分类 → 落点映射**

| 分类 | 代码模块 | 文档篇目 |
|------|----------|----------|
| `tree` | `demo/kit/trees.js` | `docs/kit/trees.md` |
| `building` | `demo/kit/props.js` | `docs/kit/buildings.md` |
| `plant` | `demo/kit/trees.js` | `docs/kit/plants.md` |
| `prop` | `demo/kit/props.js` | `docs/kit/props.md` |
| `figure` | `demo/kit/props.js` | `docs/kit/figures.md` |

**三件套是原子的**：三个文件的新内容先在内存里算好，全部成功才一起落盘。
否则中途失败会留下"代码写了、文档没写"的不一致状态。

**覆盖**：勾选「覆盖同名构件」会删掉旧的 `register` 块再插入新的。

---

## 4. 编辑器（`editor.html`）

### 4.0 场景为主：全屏画布 + 浮动面板

编辑器是**场景视角**而不是编辑器视角：画布全屏铺满，工具是浮在上面的玻璃拟态面板。

- **左浮动**：工具箱（场景底图导入 / 编辑工具 / 材质笔刷 / 过渡参数 / AI 地形 / 构件库）
- **右浮动**：属性（场景存取 / 选中对象 / 碰撞体积 / 物体列表）
- **底部浮条**：坐标 / 选中信息 / 人群 AI / 网格 / 碰撞体开关
- 两块面板可点头部 `–` 折叠成标题条，画布始终是主角

### 4.0b 已有场景进入编辑（底图模式）

village / autumn / forest 这些**已写好的场景**可以进编辑器编辑：

```
选择场景 → 同源 iframe 加载 → 轮询等待 bake 完成 → 抓取烘焙底图
        → 编辑器进入"底图模式"
```

**跨 iframe 取数据的约定**：`engine.js` 的 `W/H/pix/bakedPix/bakedZ/ground/groundZ`
都是顶层 `let`，**不会挂到 `window` 上**（`win.bakedPix` 永远是 `undefined`）。
所以 engine 暴露了一个只读 getter 对象：

```js
window.PP_SCENE = {
  get W() { return W; }, get H() { return H; },
  get bakedPix() { return bakedPix; },
  // …
};
```

`scene-import.js` 优先读 `win.PP_SCENE`，旧页面没有时退回 `win`。
`PP_setSize` 重建缓冲后 getter 自动跟随，不需要手动同步。

抓取是**轮询**而不是固定等待：每 200ms 检查一次
（类型/尺寸对不对 → 缓冲里有没有真像素），最长 8s。
这样慢场景不会误报"没有烘焙底图"，没调 `bake()` 的页面会给出明确错误。

底图模式下的能力边界：

| 能力 | 状态 |
|------|------|
| 构件放置 / 选择 / 拖拽 / 缩放 / 旋转 | ✅ 全功能（画在底图之上）|
| 碰撞体积手动 / AI 推断 | ✅ 全功能 |
| 人群 AI / 网格 / 碰撞体显示 | ✅ 全功能 |
| 地形笔刷 / 塑形 | 🔒 锁定（场景地面是烘焙产物，笔刷会毁掉它）|

保存场景时底图以 base64 PNG 附在 JSON 里（`baseMap.png`），载入时还原。
点「退出底图模式」回到地形编辑。

### 4.0c 新建场景 · 背景色 · 查看器

**新建场景**（右侧「新建场景」面板）：填名字 → 选尺寸 / 背景色 / 地形预设 →
「＋ 新建」。会 `PP_setSize()` 重建画布、清空物体、铺预设地形。
背景色是**一键**的：五个预设色块点一下立即生效，也可以自己取色。

**背景色三处统一**（`ED_setBg`）：画布清屏 `pix.fill(bg)`、舞台 `.ed-stage`、
页面 `.ed-full`。保存后查看器页面 `body` 与画布也用同一个色，整个页面没有色差。

**保存 → 导航 → 查看**：

```
编辑器保存
   ├─ demo/scenes/<name>.json     场景本体（含 W/H/S/bg/origin）
   └─ demo/scenes/index.json      索引：name/title/bg/W/H/updated
             │
             ▼
   nav.js 异步 fetch /scenes/index.json → 菜单追加「我的场景」分组
             │
             ▼
   scenes/view.html?name=<name>   静态查看器（不依赖 Studio 服务端）
```

场景 JSON 的关键字段：

| 字段 | 用途 |
|------|------|
| `W` / `H` | 画布尺寸；载入与查看器按它 `PP_setSize()` |
| `S` | 像素/世界单位（`PP_SCALE`）；查看器复现同一比例 |
| `originX` / `originY` | 投影原点偏移；保证查看器构图与编辑器一致 |
| `bg` | `#rrggbb`；画布清屏 + 页面背景 |
| `lighting` | 方向/色调/环境/暗角 |
| `baseMap.png` | 底图模式场景（可选） |

**查看器**（`demo/scenes/view.html` + `viewer.js`）：
先 fetch JSON → 设置 `window.PP_W/H/PP_SCALE/PP_ORIGIN_*` →
**动态按序加载** engine / kit / terrain 脚本（尺寸必须在 engine 顶层读取前就位，
所以不能用静态 `<script>`）→ `terrainRender()` + 构件画家排序 → 一次性绘制。
画布按整数倍缩放居中，`resize` 重算。

兼容性：索引缺失的历史场景由 `listSceneIndex()` 从 JSON 回填元数据，
不需要重新保存就能出现在导航里。

### 4.0d 图片还原场景（图片 → 场景）

编辑器「从图片还原」→ 粘贴 / 拖入 / 选择一张等距场景截图 → AI 用**现有构件库**摆出场景。

```
图片 → 压缩 1024px → POST /api/ai/jobs（kind: reconstruct）
     → AI 读图，输出 { terrain, objects, missing }
     → terrain 走 TERRAIN_SHAPES.apply
     → objects 的 (u,v) 反投影成世界坐标，z 取 TERRAIN.heightAt
     → missing 逐项处理：选现有素材 / 生成新素材
```

**坐标约定**：AI 不算世界坐标，只给画面相对坐标 `u/v ∈ [0,1]`；
前端用 `unproject(u*W, v*H)` 反投影。换画布尺寸不影响还原逻辑。

**missing 不是死路**：每项会排出**候选素材**（同分类 +8、关键词每命中 +2，
中英文 2-gram），用户可以：

| 操作 | 行为 |
|------|------|
| 选一个候选 →「放到场景」 | 用该构件替换，位置沿用 AI 给的 `u/v/scale/rot` |
| 「生成新素材」 | `/api/generate`（brief 当需求）→ `/api/save` 三道闸 → 动态注册 |
| 不处理 | 忽略该项 |

服务端校验（`normalizeRecon`）：`kind` 必须在当前构件库清单里，否则自动转进 missing；
`params` 只保留真实存在的键并夹到区间；`u/v` 夹到 `[0,1]`；
missing 的 `category` 接受 `vehicle/structure` 等运行时分类。

### 4.0e 空态与「一句话建场景」

进入编辑器**不再默认塞一个村落**，而是一个起点：

```
        造一个小世界
  [ 例：秋日山村，一条石板路穿过针叶林… ]  [生成]
  [🖼 从图片还原] [载入已保存…] [空白开始]
```

- 输入框回车（或点「生成」）→ `POST /api/ai/jobs`（kind: `compose`）
- AI 返回与图片还原同构的 `{ terrain, objects, missing }`
- 结果直接落到画布，空态消失，进入普通编辑
- `compose` 与 `reconstruct` 共用 `ai-recon.mjs` 的校验与落地逻辑，只是提示词不同

空态期间左右浮动面板淡出（`body.ed-empty-mode`），把画面让给入口；
「空白开始」后恢复。

### 4.0f AI 任务表（关页面不丢结果）

`demo/studio/jobs.mjs`。所有 AI 调用都是**后台任务**，SSE 只是订阅：

```
POST /api/ai/jobs            { kind, payload, dedupeKey? } → { jobId }
GET  /api/ai/jobs/:id        → { status, progress, result, error }
GET  /api/ai/jobs/:id/stream?since=N → SSE（回放历史 + 实时，终态自动 end）
GET  /api/ai/jobs?dedupeKey= → { jobs: [...] }（响应丢失时找回）
```

关键行为：

| 场景 | 行为 |
|------|------|
| 关页面 / 刷新 | 任务继续跑，结果留在内存表；回来凭 `jobId` 自动恢复 |
| POST 响应丢失 | 前端提交前先写 `{ requestId }`，服务端按 `dedupeKey` 复用任务，不重复计费 |
| 网络抖动 | 恢复失败只保留记录，下次再试（只有 HTTP 404 才清） |
| 服务重启 | 内存表清空 → 404 → 前端提示重跑 |
| 并发 | 最多 3 个 running，超出返回 429 |
| 清理 | 终态保留 30 分钟，最多 20 条 |

前端记录键按任务分开：`pd_job_recon`（图片还原）、`pd_job_compose`（一句话建场景），
互不覆盖。轮询间隔 700ms；SSE 断线可带 `since=<seq>` 续传。

### 4.1 布局 · 纸面工作台

参考 shwn.design 的极简语言 + 秋日山村的纸色，编辑器整体换成**纸面主题**：

```
┌──────────────────────────────────────────────────────────┐
│ 1.素材生成  2.场景编辑器      [场景名]        就绪  [保存] │  ← 细顶栏
│                                                          │
│ ┌────────┐                                  ┌────────┐  │
│ │ 工具箱 ＋│         ┌──────────────┐        │ 属性 ＋ │  │  ← 面板默认折叠成胶囊
│ └────────┘         │              │        └────────┘  │
│                    │  画布（纸面） │                     │
│                    │              │                     │
│                    └──────────────┘                     │
│          [ 一句话重建场景…                    ] [重建]    │  ← 底部指令条
│   —   未选中   人群AI  网格  碰撞体                       │
└──────────────────────────────────────────────────────────┘
```

| 元素 | 设计 |
|------|------|
| 主题 | `body.ed-paper`：纸白 `#f7f2e7` / 深棕文字 `#2a2118` / 陶土色强调 `#b06f2a` |
| 面板 | 白色半透明 + 1px 细边 + 16px 圆角 + 柔和阴影；默认折叠成 116px 胶囊，点 ＋ 展开 |
| 空态 | 直接印在纸上（无卡片、无边框），画布在空态时隐藏；大标题 + 输入框 + 三个入口 |
| 顶栏 | 场景名可直接改（同步右侧「场景名」），保存按钮常驻 |
| 指令条 | 底部常驻 `#ed-dock`，有场景后可用一句话重建；提交前确认替换 |
| 嵌入 | 被 `app.html` iframe 嵌入时 `body.is-embedded` 隐藏自己的 tab，避免双层导航 |

主题作用域限定 `.ed-paper`，生成页与工坊保持原来的深色。

### 4.2 地形：三层材质体系### 4.2 地形：三层材质体系

地形不是"选一种材质"，而是**逐格画**。网格模型：

- 格 `(gx, gy)` 覆盖世界坐标 `x∈[gx, gx+1], y∈[gy, gy+1]`
- 即**世界轴对齐的正方形** —— 投影到屏幕正好是标准等距菱形瓦片，
  与 `engine.js` 的 `box()` 可见面约定（`+x` 面 / `+y` 面）一致
- 每格记录：材质 id + 高度 `z`

**每种材质分三层**（`TERRAIN.mats[id]`）：

| 层 | 字段 | 职责 |
|----|------|------|
| 主体 | `base: [r,g,b]` | 大面积底色，按噪声做明度起伏 |
| 过渡 | `blend: { width, jitter }` | 与邻格材质的咬合方式 |
| 子项 | `detail: {...}` | 自带装饰：苔藓斑/石子/沙纹/石缝/水波 |

**过渡算法**（`terrain-render.js` `terrainBlend`）参考了三套社区成熟做法：

1. **Splat blending**（Unity Terrain / Godot）：相邻材质按权重混合
2. **Noise-jittered transition band**：用两条低频噪声把边界打散成不规则毛刺
   （项目 `docs/kit/scene.md §2` 的溶解带，从"岛边缘"推广到"任意材质边界"）
3. **Bayer 抖动混合**：像素风的"渐变"不是模糊，而是按阈值决定该像素属于哪边 ——
   边界因此是碎片化咬合，而不是实心描边

关键参数（编辑器「地形过渡」面板可调）：

| 参数 | 默认 | 说明 |
|------|------|------|
| 过渡带宽 | 0.42 格 | 越大咬合越宽；每种材质还有自己的倍率（石板 0.2 利落、沙地 0.6 松散）|
| 边界抖动 | 0.55 | 0 = 平滑渐变，1 = 碎片化锯齿 |
| 高度坡面 | 开 | 光线步进渲染：高差自动成缓坡，坡度带光照 |

### 4.2a 两种地形渲染器

| 渲染器 | 文件 | 原理 | 何时用 |
|--------|------|------|--------|
| **坡面（光线步进）** | `terrain-march.js` | 高度场 ray marching | 默认；`blend.slope = true` |
| 台阶（quad） | `terrain-render.js` | 逐格投影四边形 + 侧壁 | `slope = false`；拖动画笔期间自动降级 |

**坡面渲染（height-field ray marching）**：

```
屏幕像素 → 等距视线 → 沿 z 从高到低 sphere tracing
        → 找到射线与高度场交点 → 该点就是真实可见表面
```

- **高度场**：格心双线性插值。同高度平台保持平坦，高差处自动成缓坡
  （这是真正的 Height blending —— 之前"只改深度不改几何"的做法会露洞）
- **sphere tracing**：按「到地形的垂直距离」跳跃。安全系数不是固定值 ——
  等距射线每降 1 单位 z 水平走 1.73，所以安全步长 =
  `(z-h) / (1 + maxSlope×1.74)`，maxSlope 由 buildHeightGrid 按格心
  最大高差估计（宁大勿小，偏保守只损失速度）。**固定系数 0.6 在
  梯度 >0.48 的陡崖必然跨过交点** —— 曾经就是岛上黑洞的根因
- **二分细化**：命中区间再二分 5 次，精度约 0.05 世界单位
- **坡度光照**：高度场梯度 → 法线 → 与光源方向 `(-.55,-.6,.58)` 点积，
  朝光坡亮、背光坡暗（强度系数 2.1，可调）
- **性能**：360×280 画布约 400ms。拖动笔刷时强制走 quad（约 30ms），
  松手后跑一次完整坡面渲染 —— 兼顾手感与画质

**为什么不用逐格 quad 做坡面**：等高相邻格的投影四边形无缝，但**高差处会错位**
（高格整体上移 S·COS 像素），错位带属于"背向相机的侧壁"，无可画内容 →
必然露洞。逐格光栅化无解，必须换成沿视线求交。

**台阶模式的收边**：像素归属用屏幕空间四边形包含测试（半像素容差），
渲染后跑 `terrainPatchSeams()` 补洞（以 `ground[]` 判断是否已覆盖，不看背景色 ——
编辑器背景是深色、离线渲染是米色）。

### 4.2c 变暗系统的互斥（防叠加成黑）

引擎有两套独立的压暗系统：`bakeOcclusion`（接触 AO，×0.56）与
`applyShadows`（投影，×0.54）。同一像素被两套各染一次是**乘法叠加**
（0.56×0.54≈0.30）—— 物件越密、AO 区与影子区重叠越多，地面就越黑。

修复：引擎维护 `darkened` 帧标记（`tint` 压暗时置位，每帧渲染入口清零），
AO 与投影谁先染到就跳过谁 —— **一个像素每帧最多被压暗一次**。

### 4.2b 地形程序化生成（terrain-shapes.js）

AI 只返回**形状描述**，前端程序化展开为格子 —— 输出小、可控、可复现：

| type | 参数 | 说明 |
|------|------|------|
| `island` | cx, cy, rx, ry, mat, z, exp, wobble | 超椭圆岛，边缘自动溶解抖动 |
| `rect` | x0, y0, x1, y1, mat, z | 矩形地块 |
| `path` | points[[x,y]…], width, mat | 沿折线铺路（只铺在已有地面上）|
| `hill` | cx, cy, r, h, falloff | 圆形高台 |

顺序有意义：先打底（island/rect）→ 切路（path）→ 抬地形（hill）。
编辑器左侧「AI 生成地形」输入描述即可（走 SSE 流式进度）。

**工具**

| 工具 | 作用 |
|------|------|
| 画地形 | 用当前材质画笔刷 |
| 擦除 | 抹掉格子 |
| 抬高 / 降低 | 塑形，高度差 0.25 |
| 放置 | 放置当前选中的构件 |
| 选择 | 选中物体做属性编辑 |

笔刷是圆形 + 噪声抖动边缘（`noise` 调制半径），不是完美圆。

### 4.3 装配

在构件库里点一个构件 → 进入「放置」模式 → 点画布放下。

- 滚轮：旋转朝向（15° 一档）
- 方向键：微调选中物体位置（`Shift` 加速）
- `Delete`：删除
- `Esc`：取消放置 / 取消选中

物体自动吸附到地形高度（`TERRAIN.heightAt`）。

**画布视图**：`Ctrl/⌘+滚轮` 以鼠标为中心缩放整个视口（0.3×~8×）、
中键拖拽或按住 `空格`+左键拖拽平移、**双击复位**。视图是显示层变换，
渲染分辨率不变，像素始终锐利。

**绘制顺序**：按 `y` 从大到小（画家算法），近的物体后画。

### 4.4 碰撞体积

每个物体有一个碰撞体，两种形状：

```js
{ type: 'box', w, d, h }              // w=x 宽, d=y 深, h=高
{ type: 'cylinder', radius, height }
```

**手动设置**：右侧面板拖滑块。

**AI 推断**：点「AI 推断」→ 服务端把构件的名称、描述、参数发给 CLI，
让它按外形语义给出体积（树→细圆柱、房屋→贴合的盒子、杆子→极细圆柱），
并附一句理由。

**显示**：碰撞体画成**虚线**线框，只画背向观众的两条竖线 ——
它是编辑辅助，不该把物体本身盖住。

### 4.4 光照 · 色调 · 层级

**全局光照**（引擎级 `LIGHT` 对象，`engine-light.js`）：

| 项 | 说明 |
|----|------|
| `dir` | 主光方向 —— 球体高光、坡面光照都从它算 |
| `shadow.x/y` | 阴影投射方向（自动跟随光源方位角） |
| `tint` | 全局色调乘数：正午 `[1,1,1]` · 暖阳 `[1.08,1,.86]` · 黄昏 `[1,.82,.66]` · 夜幕 `[.58,.64,.92]` |
| `ambient` | 环境亮度 0.5~1.4 |
| `vignette` | 暗角 0~0.8 |
| `points` | 点光源列表（路灯自动注册） |

编辑器右浮动面板「光照 · 色调 · 层级」实时调：环境亮度、暗角、
光源高度角/方位（拖动时**阴影方向跟着转**）、四个色调预设按钮。
设置随场景 JSON 存取（`lighting` 字段）。

**点光源（路灯为什么之前不亮）**：路灯的光晕/光斑只是构件自画的装饰像素，
不参与场景照明 —— 所以加灯场景不变。现在亮着的灯（`lit≥0.5` 的
lamp/lantern 类构件）会自动注册为点光源：`PP_shadePoints()` 在提交前
按世界距离衰减给周围表面加暖光（加色混合，越暗加越多，不过曝）。
面板里「路灯发光」开关可整体关闭。

**层级**：选中物体属性面板有「层级」滑块（-5~5）与置顶/置底按钮。
渲染排序 = 层级优先（大者后画），同层按 y 画家算法。0 = 自动。
`zOrder` 随物体存进场景 JSON。

### 4.5 场景存取

场景 = `{ version, terrain, objects }`，JSON 格式。

- **保存**：`POST /api/scene {action:'save', name, scene}` → `demo/scenes/<name>.json`
- **载入**：`POST /api/scene {action:'load', name}`
- **导出**：浏览器直接下载 JSON
- **清空**：清地形 + 清物体

---

## 5. 构件库运行时（`demo/kit/`）

编辑器和生成页共用同一套构件契约。

| 文件 | 职责 |
|------|------|
| `core.js` | `KIT.register` / `KIT.get` / `KIT.resolve` —— 构件注册表 |
| `palette.js` | 构件配色基色 |
| `trees.js` | 树与草木构件 |
| `props.js` | 建筑与道具构件 |
| `ground.js` | 地面材质（按 `docs/kit/scene.md` 协议） |
| `render.js` | 把场景模型画到画布上 |

### 5.1 构件定义契约

```js
KIT.register({
  id: 'broadleaf',          // 稳定英文标识
  name: '阔叶树',
  category: 'tree',
  desc: '三段分叉树干 + 多簇球堆树冠',
  params: {
    height: { def: 5.0, min: 2, max: 9, step: .1, desc: '树高' },
  },
  collision: { type: 'cylinder', radius: .35, height: 5.0 },
  draw(ctx, inst) { /* ... */ },
});
```

### 5.2 `ctx` 可用成员

| 成员 | 说明 |
|------|------|
| `ctx.x` / `ctx.y` / `ctx.z` | 实例世界坐标 |
| `ctx.params` | 参数表（已夹到合法区间） |
| `ctx.seed` | 实例种子 |
| `ctx.sphere/capsule/box/plot` | 引擎原语，**已处理实例旋转** |
| `ctx.rampOf/rgb/hash/noise/lerp/clamp` | 颜色与随机工具 |
| `ctx.shadow(r, strength, dither)` | 给本实例投地面阴影 |
| `ctx.shadowAt(x,y,z,r,...)` | 指定位置投阴影 |

### 5.3 旋转

`ctx.rot` 生效时，`ctx.sphere` 等原语会自动把传入坐标绕实例原点旋转。
构件代码**完全不用管自己被摆成什么朝向**。

---

## 6. API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 存活检查 |
| POST | `/api/generate` | `{prompt, category, note}` → 构件定义 |
| POST | `/api/save` | `{component, overwrite}` → 三件套落盘 |
| POST | `/api/collision` | `{kind, name, desc, params, current}` → 碰撞体建议 |
| GET/POST | `/api/scene` | 场景列表 / 保存 / 载入 |
| GET | `/api/file?path=` | 读仓库内文件（路径受限） |

---

## 7. 测试与批量工具

```bash
# 构件库全量实画测试（保存前的同一套机器校验，扫所有已注册构件）
node tools/kit-test.mjs            # 全量
node tools/kit-test.mjs birch      # 只测指定的

# 批量补齐 docs/kit/ 里标 📐 的待实现变体（需先起 studio 服务）
node tools/fill-variants.mjs            # 全部
node tools/fill-variants.mjs birch shed # 指定的

# 编辑器冒烟测试
node tools/editor-test.mjs

# 人群行为模块测试
node tools/crowd-test.mjs
```

### 7.1 落盘前的机器校验（三道闸）

`validateComponent`（persist.mjs）在写盘前依次执行：

| 闸 | 拦什么 | 怎么拦 |
|----|--------|--------|
| 1. 语法 | 语法错误、缺 `KIT.register` | `new Function` 解析 |
| 2. **沙箱实画** | **崩溃** + **忽略实例位置** | vm 加载引擎 → 注册构件 → 在 `(0,0)` 和 `(4,2)` 各画一次：崩 → 拒收；两次画面相同（说明坐标裸写 `[0,0]` 没基于 `ctx.x/ctx.y`）→ 拒收；像素 < 8 → 拒收 |
| 3. 合并后整文件 | 块删除/拼装的 bug | 写盘前 `new Function(合并结果)` —— 曾经的块删除 bug 只删半截留下悬空逗号，整文件检查由此而来 |
| 4. **场景冒烟** | 构件改动把已保存的场景弄坏 | 落盘后跑 `tools/village-test.mjs` + `tools/editor-test.mjs`；任一失败就把三件套恢复到落盘前，并把失败断言原文返回给前端（约 10s） |

**为什么第 4 道闸必须在落盘后跑**：构件是"类"，场景是"实例"——
`village/foliage.js` 和场景 JSON 都只存 `kind + params`，通过
`KIT.get(kind).draw()` 实时解析。构件代码一改，所有引用它的场景立刻受影响。
冒烟必须读磁盘上的真实文件，所以顺序是「写 → 测 → 失败回滚」，
而不是「测 → 写」。

### 7.2 为什么需要这些闸（真实事故）

- **颜色两张皮**：AI 反复把 `rampOf(...)[i]` / `rgb(...)`（打包像素）喂给
  `sphere/capsule/box`（它们只吃 `[r,g,b]` 基色数组）—— 运行时才崩，
  预览页一度静默吞掉异常，用户对着空画面看到"预览就绪"。
  现在：提示词铁律写死 + 预览试画后才报就绪 + 实画校验拒收。
- **位置忽略**：AI 写过坐标全部裸写 `[0,0,...]` 的构件（摆哪儿都画在世界原点）。
  现在：双位置实画比对，一样就拒收。
- **重复造轮子**：需求"挂在木杆上的铁皮路灯"= 已有的 `tin-lamp-post`，AI 照样新建。
  现在：现有构件清单带描述注入 + AI 可返回 `duplicate: true`（服务端转成友好错误）。
- **占位符进库**：早期校验只查语法，`draw() { // placeholder }` 也过了。
  像素数检查由此而来。

### 7.3 批量补齐流程（fill-variants.mjs）

1. `TARGETS` 清单里每项带 `specDoc` / `specHead` —— 从 `docs/kit/<篇目>.md` 抽出该变体的规格节
2. 调 `/api/generate-from-spec`：提示词强调**照规格实现**（参数名/区间/算法锚点都是既定的，id/name 强制回填）
3. 走 `/api/save` 落盘三件套（overwrite: true，允许覆盖坏条目）
4. 落盘前过 §7.1 的三道闸

---

## 8. 人群与姿态（kit 行为层）

两个**非构件**模块（不进 `KIT.register`，没有 draw）：

| 文件 | 内容 | 测试 |
|------|------|------|
| `demo/kit/crowd.js` | `KIT_CROWD`：spectator / wanderer / crowd 三变体（目标选择 + 软排斥 + 边界夹紧 + 姿态合成） | `tools/crowd-test.mjs` |
| `demo/kit/figures.js` | `KIT_POSE` 姿态表（含注册表欠着的 `reach` 够取）+ `kitPose(name, over)` 覆盖助手 | — |

---

## 9. 坑

| 坑 | 症状 | 对策 |
|----|------|------|
| `rampOf()` 收到数字 | `Invalid value used as weak map key` | 颜色必须是 `[r,g,b]` 数组。`engine.js` 已加前置检查并给出明确报错 |
| `eval` 注入构件代码 | 顶层 `const` 不可见，`KIT.register` 找不到 | 用真正的 `<script>` 标签注入 |
| 注册表正则拼 id | 反引号在字符类里触发 `Range out of order` | 用字符串 `startsWith` 匹配，不用正则 |
| 落盘中途失败 | 代码写了、文档没写 | 三个文件先在内存算好再一起写 |
| 顶层 `const` 重名 | 整个页面 `SyntaxError` | 顶层只放函数与 `KIT.register`；局部量加模块前缀 |
| 碰撞体线框盖住物体 | 画面全是青色 | 画虚线 + 只画背向观众的竖线 |
| 格子用旋转 45° 的格系 | 地形不是标准等距菱形，瓦片歪 | 格必须是世界轴对齐的正方形 |

---

## 10. 导出到其他引擎

构件是「绘制代码」不是资产文件。要交给 three.js / 其他引擎，先跑图集烘焙：

```bash
node tools/bake-atlas.mjs          # 或编辑器「⇩ 烘焙 three.js 图集」按钮
```

产出 `demo/export/atlas.png` + `atlas.json`（帧矩形、锚点、UV、碰撞体），
消费示例见 `demo/export/three-demo.html`。

详见 [export.md](export.md)。

---

## 11. 相关文档

- [../kit/README.md](../kit/README.md) — 构件库总览
- [../kit/registry.md](../kit/registry.md) — 变体注册表（活索引）
- [engine.md](engine.md) — 渲染引擎接口
- [../../AGENTS.md](../../AGENTS.md) — 项目硬性约束
