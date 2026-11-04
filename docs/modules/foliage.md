# foliage.js — 秋日山村树木植被

路径：`demo/village/foliage.js`（250 行）

## 职责

在秋日山村里种树：

- **阔叶树**（金黄，多簇球堆冠，画面主体）
- **针叶树**（橙褐，锥面塔冠，远景高处剪影）
- **灌木**（矮球丛，沿路点缀，静态）
- 树冠进 **capture 像素缓存** → 每帧随风平移（风动）
- 树按 **画家算法**（y 升序）注册 capture，注册顺序 = 绘制顺序

## 依赖

| 依赖 | 用途 | 缺失时的行为 |
|------|------|-------------|
| `engine.js` | `sphere` / `capsule` / `captureSphere` / `drawLeaves` / `castShadow` / `hash` / `clamp` / `project` | 必需 |
| `terrain.js` 的 `ROAD` | 公路中心线与半宽（唯一真相源） | **必需**（顶层读取，缺则报错） |
| `terrain.js` 的 `hillE` | 台地真实形状（沿路的超椭圆） | 回退到内置 RX/RY 椭圆 |
| `houses.js` 的 `HOUSES` | 房子位置（树要避开） | 没有房子 → 不避让 |
| `palette.js` | `LEAF` / `NEEDLE` / `BARK` / `BARK_HI` / `SHRUB` | 必需 |

> `HOUSES` / `hillE` 是**运行时惰性读取**（`typeof` 探测），
> 所以 foliage.js 单独加载也能跑。
> `ROAD` 是顶层读取 —— terrain.js 必须先于 foliage.js 加载。

## 对外接口

| 函数 | 签名 | 说明 |
|------|------|------|
| `planTrees()` | → `tree[]` | 布点。返回按 y 升序排好的树表 |
| `growFoliage()` | `()` | 建 capture 缓存 + 填 `FOL_LEAF_SOURCES`。**只能调一次** |
| `drawFoliage(t)` | `(t)` | 每帧：重画树干 + `drawLeaves(t)` 回放树冠 |
| `castTreeShadows()` | `()` | 烘焙时投树的地面阴影 |
| `drawShrubs()` | `()` | 画灌木（静态） |

全局数组：`trees`（小写，CONTRACT §11 规定归本模块）、
`FOL_LEAF_SOURCES`（落叶源点，给 `falling.js`）。

## 树数据结构

```js
{
  x, y,                 // 世界坐标
  kind: 'broadleaf' | 'pine',
  scale,                // 整树缩放（正交相机靠缩放造纵深）
  h,                    // 树高
  crownR,               // 冠幅（算影子用）
  crownZ,               // 冠心高度（落叶源点用）
  seed, phase,          // 随机种子 / 风的相位
}
```

## 布点逻辑：成团，不是撒

参考图里树是**几大团**，团与团之间能看见天空。所以：

1. **团心用路的参数坐标钉死**（`FOL_CLUMPS`，每项 `[t, lat, 半径, 针叶倾向]`）。
   `t` 是沿路位置，`lat` 是横向偏移。台地本身就是沿路的一条斜带，
   用路的坐标钉团心，团天然跟着路走，不用跟着地形跑。
2. **两侧的团在 `t` 上错开** → 屏幕上树团呈之字形，团间留白。
3. **候选点在团内抖动**（`t` 抖动量除以路长，`lat` 直接是世界单位）。
4. **四道过滤**：
   | 过滤 | 判据 | 为什么 |
   |------|------|--------|
   | 台地 | `folEdge(x,y) > .82` | 别长到画布外的天空里 |
   | 公路 | `folRoadDist < halfW + 1.6` | 别长在路上 |
   | 房子 | `folNearHouse(x,y,1.9)` | 别从屋顶里长出来 |
   | 地面 | `folOnGround(x,y)` | **查 `ground[]` 像素**，最准 |
   | 间距 | 与已有树距离 ≥ 1.85 | 不叠成一坨 |
5. 目标 **40 棵**，针叶约 1/4（参考图里金黄阔叶是主角）。

> `folOnGround()` 直接查烘焙好的 `ground[]` 像素 —— 地形是超椭圆加噪声
> 啃边的，**任何解析近似都会把树种到地上或悬空**。查像素最省事也最准。

## 两种骨架的算法差异

| | 阔叶 `broadleaf` | 针叶 `pine` |
|---|---|---|
| 干 | 三段分叉（主干 + 左右**不对称**分枝 -.8 / +1.2） | 直干，**只到最底层**（针叶的干在冠里看不见） |
| 冠 | 6 簇球堆 + 核心大球 | **沿锥面排行**：外圈 11 点定轮廓 + 内圈 7 点 + 中心 1 点 |
| 采样 | 球内 `Math.cbrt` 均匀采样 | 圆周等分 + 半径二次收缩 `R0*(1-u*.9)*(1-.18*u*u)` |
| 配色 | `LEAF` 4 档金黄，三色分配（随机 + 高度 + 内外缘） | `NEEDLE` 5 档，**底暗顶亮** `base = floor(u*3.9)+1` |
| 轮廓 | 圆润球簇 | 硬三角尖塔 |

**冠内必须堵洞**：阔叶靠核心大球 + 12 个大球把 6 簇连成体块，
针叶靠内圈 + 中心球。只放表层小球会"漏光"（能透过冠看到背景）。
实测 flood-fill 检测封闭洞 = **0**。

## capture 与绘制的顺序

```
growFoliage():
  1. 先画所有树干        → zb 写入，capture 时会做深度测试（树干挡在冠前）
  2. 按 y 升序注册 capture → leaves[] 的顺序 = 绘制顺序 = 画家算法
```

- **树干不进 capture**：capture 回放是整块平移，
  树干根部会跟着飘。树干每帧在 `drawFoliage(t)` 里重画。
- **capture 的 `r` 压到 `.05`**：关掉引擎的逐叶投影
  （`drawLeaves` 里 `leaf.k % 2 === 0` 才投），改由
  `castTreeShadows()` 在烘焙时统一投一片干净的影。
  引擎那条路径会让每片叶子都投一个椭圆，影子糊成一团。

## 坑

- **`leaves` 数组只增不减**。`growFoliage()` 用 `FOL_READY` 标志挡住重复调用。
- **`folRoadPoint(t, lat)` 的 `t` 是 0~1 归一化量**，
  往里加世界单位的偏移要先除以路长（`folRoadFrame().len`）。
- **`ROAD` 是顶层读取**：`foliage.js` 必须在 `terrain.js` 之后加载。
- **针叶树干不能贯穿锥体**。画到底层（`z = 1.0*scale`）就停，
  否则像一根棍子插在塔里。
- **针叶行数 < 9 轮廓就碎**。锥形靠密集采样点连线，不是靠球体堆叠。
- **针叶颜色顶亮底暗**。做反了会读成一座塔形建筑。
- **`folEdge` 要用 `hillE`**，别用 RX/RY 椭圆 —— 台地是沿路的超椭圆，
  用椭圆判会有一半候选点被误杀（实测树数从 39 掉到 17）。

## 相关文档

- [trees.md §1](../kit/trees.md#1-broadleaf-阔叶树) `broadleaf` 配方卡
- [trees.md §5.5](../kit/trees.md#55-pine-针叶树秋日山村--已实现) `pine` 配方卡
- [trees.md §5.6](../kit/trees.md#56-shrub-灌木秋日山村--已实现) `shrub` 配方卡
- [nature.md §1](../kit/nature.md#1-机制-acapture-像素缓存) capture 像素缓存机制
- [plants.md](../kit/plants.md) 花草灌木变体
