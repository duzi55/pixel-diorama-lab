# villagers.js — 秋日山村村民

路径：`demo/village/villagers.js`（249 行）

## 职责

在 `engine.js` 的 `figure()` 骨架上，生成并驱动一小群村民：

- **路人**：沿公路两侧人行道走停交替，不挡车道
- **门口村民**：站在木屋门前石阶上，慢慢转头张望
- 每帧重画（人是动的，不烘焙），自带动态阴影
- 提供可交互的**头顶锚点**与**点击拾取**接口

## 依赖

| 依赖 | 用途 | 缺失时的行为 |
|------|------|-------------|
| `engine.js` | `figure` / `dynamicAdd` / `pendingShadows` / `project` / `hash` / `clamp` | 必需 |
| `terrain.js` 的 `ROAD` | 公路中心线与半宽（唯一真相源） | 回退到内置 `V_ROAD_DEF` |
| `houses.js` 的 `HOUSES` | 门口站位 | 没有房子 → 全是路人 |
| `palette.js` | 场景级配色 | 村民配色是本文件自带的 |

> `ROAD` / `HOUSES` 都是**运行时惰性读取**（`typeof` 探测），
> 所以 villagers.js 单独加载也能跑，且不会与别的模块产生顶层 `const` 重名。

## 对外接口

| 函数 | 签名 | 说明 |
|------|------|------|
| `makeVillagers()` | → `villager[]` | 建村民数组（确定性）。主场景调用一次 |
| `updateVillagers(t, dt)` | `(t, dt)` | 每帧推进 AI：目标选择 / 移动 / 转向 / 步态累积 |
| `drawVillagers(t)` | `(t)` | 每帧重画所有村民。**必须在 `pendingShadows.length = 0` 之后调用** |
| `pickVillager(sx, sy, radius = 12)` | → `villager \| null` | 按屏幕坐标拾取最近的村民 |
| `villagerAnchor(v)` | → `{sx, sy}` | 该村民头顶的**屏幕**坐标（给 `drawArrow` 用） |
| `villagerAnchorWorld(v)` | → `{x, y, z}` | 该村民头顶的**世界**坐标 |
| `villagerAnchors()` | → `[{v, sx, sy}]` | 全部锚点，一次算完 |

全局数组：`villagers`（小写，主场景按这个名字取）、`window.VILLAGERS`（别名）。

## 村民数据结构

```js
{
  x, y,                 // 世界坐标
  yaw, look,            // 朝向 / 注视方向（look 是 yaw 的目标）
  targetX, targetY,     // 当前目标点
  walking,              // 是否在移动
  gait,                 // 步态相位（随移动累积，驱动离散步态）
  speed, wait,          // 移动速度 / 下次移动前的等待秒数
  scale,                // 0.75～.85（人很小）
  phase,                // 呼吸/转头相位（各人不同，避免同步）
  side, lat, t,         // 所在路侧 / 横向距离 / 沿线参数
  walker, lookAt,       // 是不是路人 / 站桩时的注视角
  seed, pickCount,      // 确定性随机用的种子与计数器
  palette: { shirt, stripe, legs, hair, skin },
}
```

## 摆放规则

| 规则 | 取值 | 理由 |
|------|------|------|
| 总人数 | 7（`V_COUNT`，可调 6–8） | 参考图里人很小 |
| 路人 | 沿公路两侧人行道，左右交替 | 参考图里路边零星有人走动 |
| 人行道带 | `ROAD.halfW + 0.42` ～ `+ 1.25` | 路缘外侧，避开路缘石和落叶地 |
| 门口村民 | 最多 3 个，从 `HOUSES` 里挑离路最近且在画面内的 | 木屋门前石阶上站着张望 |
| 走路占比 | 每个路人约 58%～79% 的时间在走 | 走停交替，不是一直动 |

## 关键算法

### 1. 朝向归一化（不能省）

```js
let turn = v.look - v.yaw;
turn = Math.atan2(Math.sin(turn), Math.cos(turn));   // 归一化到 [-π, π]
v.yaw += turn * Math.min(1, dt * 6);
```

不归一化的话，`yaw` 从 3.0 转到 3.1 可能绕一整圈。

### 2. 步态量化（手绘感的来源）

```js
const swing = v.walking ? Math.sin(Math.floor(v.gait * 1.3) * Math.PI / 2 + .8) : 0;
```

`Math.floor(gait * 1.3)` 把连续步态切成离散步态，
与风动（8fps）、落叶（12fps）保持同一套"手绘感"语言。
`gait` 在移动时累加 `dt * 7 * speed`。

### 3. 人行道约束

每帧结束后 `vClampWalk(v)` 把村民按
「沿线参数 t 夹到 [0.02, 0.98] + 横向距离夹进人行道带」重新投影，
**路侧 `side` 固定**，所以永远不会跑到路对面、也永远不会挡在路中间。

### 4. 局部避让

O(n²) 软排斥（`V_GAP = .8`），力度 `× Math.min(1, dt*5)` 与帧率无关。
只推走路的人（`walker`），站桩的门口村民不动。

### 5. 呼吸与转头

- 呼吸：`pose.lean = Math.sin(t * 1.6 + v.phase) * .012`，幅度 ≤ .02（大了像抽搐）
- 转头：`v.look = v.lookAt + Math.sin(t * .45 + v.phase) * .32`，各人相位错开

## 姿态配方

| 状态 | pose |
|------|------|
| 走动 | `{ z: |swing|*.02, scale, stance: swing*.13, armR: swing*.5, armL: -swing*.5, lean: breathe }` |
| 站立 | `{ z: 0, scale, stance: .06, armR: .1, armL: -.1, lean: breathe }` |

## 交互接口

### 头顶锚点

```js
villagerAnchorWorld(v) → { x, y, z: 2.83 * v.scale + .6 }
```

`2.83` 来自 `figure()` 骨架：头心 z ≈ 2.59 + 头半径 .24（未缩放）。
再往上 `.6` 世界单位作为可交互标记的锚点。

### 点击拾取

`pickVillager(sx, sy, radius = 12)` 取「头顶锚点」和「身体中心」
两个屏幕点里更近的那个，距离 < `radius` 像素才算命中。

> 主场景 `village.js` 目前自己写了一份 `pickAt()`（只测身体中心）。
> 要换成更宽容的版本，把 `pickAt` 的函数体改成 `return pickVillager(sx, sy)` 即可。

## 渲染顺序（主场景负责）

```
pendingShadows.length = 0;   // ← 必须先清空
drawTufts(t);
drawVillagers(t);            // dynamicAdd 自动登记阴影
drawCar(t);
drawFoliage(t);
flushShadows();              // ← 统一把队列画进 shadowMask
applyShadows(groundZ);
shadeEdges();
```

> **不要在 `drawVillagers` 里动 `pendingShadows`**。
> `dynamicAdd` 往里 push 登记项，截断或清空会误删别人的（车、树叶）。
> 阴影统一由主场景 `flushShadows()` 收口。

## 确定性

- 初始位置、配色、目标点全部走 `hash(k, seed)`，**不用 `Math.random()`**
- 移动过程中的换目标也走 `hash(seed * 97 + pickCount * 13 + salt, 131)`
- 同 seed 两次运行逐帧结果完全一致（已自检）

## 修改指南

| 想改什么 | 改哪里 |
|----------|--------|
| 村民数量 | `V_COUNT`（6–8） |
| 门口村民数量 | `makeVillagers()` 里的 `nDoor = Math.min(doors.length, 3)` |
| 走路的人在哪一侧 | `makeVillagers()` 里的 `side = (k & 1) ? 1 : -1` |
| 人行道宽窄 | `V_WALK_MIN` / `V_WALK_MAX`（相对 `ROAD.halfW`） |
| 配色 | `V_SHIRTS` / `V_LEGS` / `V_HAIR` / `V_SKIN` / `V_STRIPE` |
| 穿条纹衬衫的比例 | `vMake()` 里 `hash(k, 82) > .62` |
| 走停节奏 | `vPickWalkTarget()` 的目标长度；到达后的 `v.wait` |
| 人的大小 | `vMake()` 里 `scale`（0.75–0.85） |
| 拾取手感 | `pickVillager()` 的 `radius`（默认 12px） |

## 注意事项

1. **人物每帧重画，不能烘焙**。烘焙了就只剩第一帧的姿势。
2. **`drawVillagers` 必须放在 `pendingShadows.length = 0` 之后**，
   否则会画到上一帧残留的队列。
3. **人站在人行道上，不是路上**。`vClampWalk` 是硬约束，别绕过它。
4. **门口村民靠 `HOUSES` 的 `doorU` 定位**（houses.js 把门画在 `y1` 面）。
   `HOUSES` 结构变了要同步改 `vDoorSpots()`。
5. `scale` 别调太大 —— 参考图里人只有树冠的 1/4 高。
6. 呼吸幅度 ≤ .02，头转幅度 ≤ .35，超过就"抽搐"了。
7. 顶层 `const` 重名会让整页脚本 SyntaxError。所有全局名带 `V_` / `v` 前缀。
