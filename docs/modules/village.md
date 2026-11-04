# 秋日山村（秋日山村 · 竖幅远景）

> 位置：`demo/village/`
> 入口：`demo/village/index.html`（`python3 -m http.server` 后打开）
> 验证：`node tools/village-test.mjs`（8 项断言 + 导出截图）
> 参考图实测工具：`tools/measure-haze.mjs` · `tools/measure-road.mjs` · `tools/solve-road.mjs` · `tools/compare.mjs`

一个**竖幅**的秋日山村：层叠的金黄树海、斜穿的公路、亮着灯的木屋、
一辆开着警灯的小甲壳虫、路上走动的村民。

---

## 1. 怎么跑

```bash
cd demo && python3 -m http.server 5310
# 打开 http://127.0.0.1:5310/village/index.html
```

**交互**：点击村民 → 头顶出现浮动箭头（打招呼）。

---

## 2. 模块划分

| 文件 | 行数 | 职责 | 全局名归属 |
|------|------|------|-----------|
| `palette.js` | 86 | 全局配色（橙红色相域） | `SKY` `HAZE` `LITTER` `LEAF` `NEEDLE` `WOOD` `ASPHALT` … |
| `terrain.js` | 252 | 地面 + 公路 + 台地边界 + 落叶 | **`ROAD` `RX` `RY`**（唯一真相源） |
| `sea.js` | 371 | 岛式留白树海（锥树构件 + 碎点晕开层）+ 空气透视 | `SEA_ROWS` `HAZE` 相关函数 |
| `houses.js` | 248 | 7 栋木屋（沿路参数定位） | **`HOUSES`** |
| `foliage.js` | 253 | 主树丛（阔叶/针叶/灌木） | **`trees`** `FOL_LEAF_SOURCES` |
| `villagers.js` | 249 | 7 个村民（走停 + 拾取接口） | **`villagers`** |
| `road.js` | 245 | 公路几何 + 小甲壳虫 | `Road`（window） |
| `road-paint.js` | 83 | 兜底路面绘制（主场景不调） | `Road.drawRoad*` |
| `falling.js` | 77 | 飘落的落叶 | `fallingLeaves` |
| `village.js` | 154 | 主场景组装 + 交互 | `bake` `draw` `update` |

**顶层 `const` 唯一性铁律**：所有模块共享同一个全局作用域，
顶层 `const` 重名会让整个页面 `SyntaxError` 挂掉。

已知的名字归属表见 `demo/village/CONTRACT.md` §11。

---

## 3. 几何：公路是量出来的，不是看出来的

### 3.1 实测

```bash
node tools/measure-road.mjs /tmp/ref.png
```

```
屏幕斜率 m = 0.3918   截距 b = 833.5
路从画布 x=0 的 70% 高处进，x=658 的 93% 高处出
平均带宽 51px = 画面宽的 7.8%
```

### 3.2 反解世界坐标

等距投影（30°，`OX=150 OY=260 S=9`）：

```
sx = OX + (x - y) / R2 * S
sy = OY + ((x + y) / R2 * 0.5) * S
```

已知屏幕端点反解 `x - y` 和 `x + y`，再联立：

```bash
node tools/solve-road.mjs
```

```
ROAD.ax = 4.56   ay = 28.13
ROAD.bx = 46.92  by = 23.35
```

投影验证：起点屏幕 (0, 364) = 70% 高，终点 (300, 484) = 93% 高 ✓

### 3.3 踩过的坑

**契约里原本写的是 `ax:-13, ay:-18 → bx:17, by:19`**，
投影出来屏幕斜率 **-4.79**（几乎是垂直的，还往上倒）。
两组坐标看起来都像"斜的"，但画出来完全不同。

**教训：几何不能靠目测。** 写工具量出来再改。

---

## 4. 构图：整幅没有天空

### 4.1 实测

```bash
node tools/measure-haze.mjs /tmp/ref.png
```

```
色相分布：橙(30-60°) 86.4%  红(0-30°) 13.4%  绿/青/蓝/紫 ≈ 0%
逐行梯度：顶部 明度240 饱和度.80  →  中段 明度166 饱和度.58  →  底部 明度200 饱和度.93
```

**参考图整幅是层叠的树海，没有天空。**
初版把上部画成大片留白，气质完全不对。

### 4.2 三个关键结论

| 结论 | 实现 |
|------|------|
| 远处 = **更淡更灰**（不是更小） | 空气透视：`setHaze` + `applySceneHaze` |
| 色相只有橙红两色 | 雾色用饱和橙黄 `rgb(248,196,52)`，不用奶油白 |
| 树压房子前面 | 深度缓冲自动分前后（远景树先画、近景树后画） |

**等距投影里"远"= `x+y` 小**，不是 `y` 小。这是布点时最容易错的地方。

**构图是「岛式留白」**（用户明确要求）：画布背景 = 纯色（SKY），
树排只保留村子背后一圈、塔色经 `fade` 参数 + 碎点晕开层
（`drawSeaHaze`）向上消散到纸色 —— 水墨式过渡，不是铺满画布的裁剪树海。
树是锥树构件（`demo/kit/conifers.js`，配方卡 trees.md §5.7-5.8），
金黄 `cone-mast` 巨塔为主角，塔要**大而少**（3~4 棵/排）——细节与坑见
[depth-and-haze.md §4](../kit/depth-and-haze.md#4-远景树海)。

---

## 5. 渲染顺序

严格照 `docs/kit/effects.md §4`：

```js
function bake() {
  zb.fill(-1e9); pix.fill(SKY); ground.fill(0); kinds.fill(KIND_NONE);
  setupHaze();
  bakeTerrain();          // 地面 + 公路（会清空 pix，所以必须在前）
  scatterLitter();
  groundZ.set(zb);        // ← 立刻定格地面深度
  drawTreeSea();          // 远景树海（房子之前）
  growGrass(.11, 枯黄草色);
  drawHouses(); shadowHouses(); drawShrubs();
  growFoliage(); castTreeShadows();
  drawTreeSeaFore();      // 近景树海（房子之后 → 压住房子一角）
  drawBottomCanopy();     // 画面最底部的近景树冠带
  bakeOcclusion();
  staticShadow.set(shadowMask);
  applyShadows(groundZ);
  applySceneHaze(groundZ);
  bakedPix.set(pix); bakedZ.set(zb);
  setupFallingLeaves(FOL_LEAF_SOURCES, 16);
}

function draw(t) {
  pix.set(bakedPix); zb.set(bakedZ);
  pendingShadows.length = 0;    // ← 统一清空，不要在模块里动
  drawTufts(t);                 // 草：读 staticShadow
  drawVillagers(t);
  drawCar(t);
  drawFoliage(t);               // 树干每帧重画 + 树冠 capture 回放
  drawFallingLeaves(t);
  flushShadows();               // 统一收口动态阴影
  applyShadows(groundZ);
  shadeEdges();
  drawSelection(t);             // 选中箭头
  ctx.putImageData(image, 0, 0);
}
```

---

## 6. 交互

| 交互 | 实现 | 文件 |
|------|------|------|
| 点击村民选中 | `pickVillager(sx, sy)` 按屏幕距离（头顶锚点 + 身体中心双测） | `villagers.js` |
| 选中标记 | 头顶浮动箭头（`drawArrow`） | `village.js` |
| 指针悬停 | `cursor: pointer` | `village.js` |

**动态物体（人、车）的阴影必须由主场景统一 `flushShadows()`**。
模块里绝对不能动 `pendingShadows`（任何截断/清空都会误删别人的登记）。

---

## 7. 验证

```bash
node tools/render.mjs demo/village/index.html /tmp/v.png 30   # 渲染 30 帧
node tools/village-test.mjs                                  # 8 项断言
node tools/compare.mjs /tmp/ref.png /tmp/v.png /tmp/cmp.png  # 并排对比
```

`tools/village-test.mjs` 的断言：

| 断言 | 判据 |
|------|------|
| 画面在动 | 12 帧间 > 200 像素变化 |
| 汽车在行驶 | `Road.car.t` 递增 |
| 树冠进 capture | `leaves.length > 500` |
| 村民拾取可用 | `pickVillager` 命中 |
| 选中标记可见 | 选中/未选中画面差 > 0 |
| 公路可见 | 低饱和中明度像素 > 900 |
| 木屋可见 | 深棕墙面像素 > 300 |
| 金黄占比 | > 80%（参考图 90.7%，实测 89.8%） |

---

## 8. 坑清单

1. **顶层 `const` 重名 = 全页 SyntaxError**。`ROAD` 归 terrain.js，
   其他模块只能读不能定义。road.js 整个包在 IIFE 里。
2. **公路坐标不能目测**。用 `tools/solve-road.mjs` 反解。
3. **等距投影里"远"=`x+y` 小**。树海按 `y` 布点会全跑到画布外。
4. **`bakeTerrain()` 会清空 `pix`**。树海必须在它之后画。
5. **`groundZ.set(zb)` 必须在所有物体之前**。否则建筑像素被写进 groundZ，
   `shadeEdges` 认为建筑是地面，描边全失效。
6. **草要用枯黄草色**。绿色草会把金黄落叶糊成黑绿噪点。
7. **`rampOf()` 会二次压暗**。固定色（勾边、描线）要用 `'flat'`/`'rim'` 绕过。
8. **雾色要饱和**。奶油色雾会把画面冲成灰白（饱和度 .80 → .46）。
9. **近景树要给路让通道**。否则会把行驶中的车完全挡住。
10. **树基不必落在台地上**。竖幅远景的地面延伸出画布是常态。
