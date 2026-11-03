# 秋日山村 · 场景契约

所有子模块必须遵守这份契约。**任何坐标改动都要先改这里。**

## 0. 画布

| 项 | 值 |
|---|---|
| 画布尺寸 | `300 × 520`（竖构图，对齐参考图比例） |
| `S`（投影尺度） | `9` |
| `OX` | `150` |
| `OY` | `250` |
| 背景色 | `SKY` = `rgb(252,245,218)` |

竖构图意味着**上下方向能装更多东西**：y 越大越靠屏幕下方（靠近观众），
y 越小越靠屏幕上方（远处）。

## 1. 地面范围

```js
const RX = 26;   // x 方向半径（屏幕水平方向）
const RY = 30;   // y 方向半径（纵深方向）
```

地面**只铺路两侧的台地**，其余留白（`SKY`）。参考图里山村的地面是
不规则的、街道两侧延伸出去的部分。

**留白原则**：地面函数返回 `0` = 透明 = 露出 `SKY`。
未给出区域一律留白，不要用"远处的树海"填满。

## 2. 街道（公路）

参考图里公路从左下到右下斜穿画面。

```js
const ROAD = {
  // 街道中心线：从左上 (远) 到右下 (近)
  ax: -13, ay: -18,      // 远端
  bx: 17,  by: 19,       // 近端
  halfW: 3.1,            // 半宽
};
```

- 路面用 `ASPHALT` 4 档色 + 噪点
- 中间有**黄色虚线**（`ROAD_LINE`）
- 两侧有**路缘石**（`CURB`，比路面亮一档，窄条）
- 再外侧是**人行道**（`WALK`，浅灰）
- 人行道外侧才是落叶地面

**延伸**：公路必须延伸出画面边界，不能在画布内"断头"。

## 3. 建筑

参考图里 6～7 栋木屋，散布在公路两侧。

木屋统一用 `house()` 配方（`docs/kit/buildings.md §2`）的**木纹变体**：
墙 = 木板拼缝（`docs/kit/structures.md §1.4` 的 `woodWall`），
不是砖石。

每栋房子的参数：

| 参数 | 说明 |
|---|---|
| `x0,y0,x1,y1` | 平面包围盒 |
| `z1` | 墙高 2.6～3.4 |
| `roof` | 坡屋顶（`rise` 1.0～1.5）|
| `windows` | 亮着灯的窗（`WINDOW_LIT`）|
| `chimney` | 有/无 |
| `moss` | 屋顶苔藓覆盖率 0～1 |
| `door` | 门位置 |

**画家算法**：所有建筑按 `y` 从大到小排序后画（y 大 = 靠近观众 = 后画）。

## 4. 树木

两种骨架：

| ID | 骨架 | 用在哪 |
|---|---|---|
| 阔叶树 | 三段分叉 + 多簇球堆冠 | 画面主体，占多数 |
| 针叶树 | 直干 + 多层同心锥 | 背景高处，剪影 |

- 树冠用 **capture 像素缓存**（`captureSphere`）→ 每帧随风平移
- 阔叶树冠色：`LEAF` 4 档金黄
- 针叶树冠色：`NEEDLE` 5 档橙褐
- 树干：`BARK` / `BARK_HI` 按 z 分段

**留白**：树不能铺满整个画面。参考图里树是**成团**的，
团与团之间要能看到天空/远处。

## 5. 人物与车

- 村民：`figure()` + `dynamicAdd`（自带动态阴影）
- 小汽车：黄色甲壳虫，**沿公路行驶**（每帧移动 + 转向）
- 车顶有红色警灯，**闪烁**（这是"可互动"的视觉入口）

## 6. 风与帧率

- 帧率 `12fps`（和现有场景一致，手绘感）
- 风：`gust(t)` 阵风包络 + 每棵树自己的相位
- 落叶飘落：零星叶子从树冠飘下

## 7. 引擎接口（已就绪，不要改 engine.js）

```js
// 绘制
sphere(x,y,z,r,color,mode)      // mode: 'rough'|'gloss'|'solid'
capsule(a,b,r0,r1,colorOf,mode)
box(x0,y0,z0,x1,y1,z1,color,seed)
plot(x,y,z,color)               // 单像素写，会做深度测试
project(x,y,z) → {sx,sy,d}
unproject(sx,sy) → {x,y}

// 颜色
rampOf(color) → [c0,c1,c2,c3,c4]   // 5 级色阶，已量化，勿再叠色阶
rgb(r,g,b)

// 阴影
castShadow(x,y,z,r,strength,dither)
shadowMask                          // 当前帧阴影累积
applyShadows(groundZ)
bakeOcclusion()

// 风动
captureSphere(x,y,z,r,color,mode,meta)   // 记录像素进 leaves 队列
drawLeaves(t)                            // 每帧回放

// 草
growGrass(density, colors)          // 必须在 kinds 写好之后调用
drawTufts(t)
kinds[]                              // KIND_GRASS 才长草

// 人物
figure(px,py,yaw,pose,palette,dynamicAdd)
dynamicAdd                          // 画骨头 + 登记阴影

// 动态阴影
pendingShadows.push(a,r0,b,r1)
flushShadows()

// UI
drawDots(points,color)
haloDots(points)
drawArrow(sx,sy,time)
```

## 8. 每个模块的导出约定

每个文件**只定义函数，不自动执行**。主场景文件 `village.js` 负责组装。

```js
// terrain.js
function bakeTerrain() { ... }        // 画地面 + 公路
function scatterLitter() { ... }      // 撒落叶

// houses.js
const HOUSES = [ {...}, ... ];        // 配置表
function drawHouses() { ... }         // 按 y 排序画

// foliage.js
function planTrees() { ... }          // 返回树列表
function growFoliage() { ... }        // 建 capture 缓存
function drawFoliage(t) { ... }       // 每帧：drawLeaves + 树干

// villagers.js
function makeVillagers() { ... }
function updateVillagers(t, dt) { ... }
function drawVillagers(t) { ... }
```

## 9. 铁律

1. **不修改 `demo/engine.js`** —— 它已按 `docs/kit/` 配方补全。
2. **不修改 `demo/village/palette.js`** —— 配色统一在那里。
3. 随机一律用 `hash(k, seed)`，**不用 `Math.random()`**（确定性）。
4. 每个文件 **≤ 250 行**。
5. 所有颜色走 `rampOf()`，不手写 5 档。
6. 建筑/树必须写 `zb`（用 `plot`/`box`/`sphere` 就自动写了）。

## 10. 主场景调用的接口（必须实现，签名已定）

`demo/village/village.js` 会调用下面这些函数。**签名必须一致，否则页面报错。**

### terrain.js
```js
bakeTerrain()        // 画地面 + 公路
scatterLitter()      // 撒落叶碎屑
```

### houses.js
```js
drawHouses()         // 按 y 排序画所有房子
shadowHouses()       // 房屋体积阴影
```

### foliage.js
```js
growFoliage()        // 建树的 capture 缓存（同时填充 leafSources）
castTreeShadows()    // 树的投影
drawShrubs()         // 灌木
```
**额外要求**：`growFoliage()` 之后，模块内要有一个可访问的数组
`leafSources`（元素形如 `{x, y, z}`），供 `falling.js` 生成飘落落叶。
`village.js` 会在 `bake()` 之后调用 `setupFallingLeaves(leafSources)`。

### villagers.js
```js
makeVillagers()      // 创建村民
updateVillagers(t, dt)
drawVillagers(t)
```
**额外要求**：模块内要有全局数组 `villagers`（供 `village.js` 的拾取逻辑遍历）。

### road.js
```js
makeCar()
updateCar(t, dt)
drawCar(t)
```

### falling.js（已由主 agent 提供）
```js
setupFallingLeaves(sources, count)
updateLeaves(t, dt)
drawFallingLeaves(t)
```

## 11. 全局名字冲突黑名单（重要）

所有模块是**同一全局作用域**的脚本。**顶层 `const` 重复声明会让整个页面挂掉。**

| 名字 | 归谁 | 其他模块禁止定义 |
|------|------|------------------|
| `ROAD` | terrain.js | ✅ 禁止 |
| `HOUSES` | houses.js | ✅ 禁止 |
| `villagers` | villagers.js | ✅ 禁止 |
| `leafSources` | foliage.js | ✅ 禁止 |
| `car` | road.js | ✅ 禁止 |
| `trees` | foliage.js | ✅ 禁止 |

**新常量请加模块前缀**：`roadPoint` → `roadPoint`（函数可以，函数也建议加前缀：
`roadRoadPoint` 太丑，用 `road_*` 前缀）。

推荐做法：模块内私有的东西放进一个对象导出，比如
```js
const Road = { point, tangent, dist, project };
```
只有 `Road` 进入全局。

## 12. 主场景的调用顺序（不要改）

```js
bake() {
  bakeTerrain(); scatterLitter();
  groundZ.set(zb);          // ← 立刻定格
  growGrass(.22, GRASS);
  drawHouses(); shadowHouses(); drawShrubs();
  growFoliage(); castTreeShadows();
  bakeOcclusion();
  staticShadow.set(shadowMask);
  applyShadows(groundZ);
}
```
