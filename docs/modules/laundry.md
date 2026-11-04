# 屋顶晾衣复刻（Rooftop Laundry）

复刻参考项目 `reference/pixel-plays/laundry/` 的完整场景：一栋抹灰老楼的屋顶，
三条晾衣绳上挂着 21 件衣物，玩家把它们拖进藤篮，赶在暴雨前收完。

**没有新增构件 ID**——全部按 `docs/kit/` 已有配方卡实现，是构件库的一次实战验收。

---

## 1. 文件与入口

| 文件 | 行数 | 职责 |
|------|------|------|
| `demo/laundry/index.html` | 51 | 画布 360×280 / S=10、HUD、脚本顺序 |
| `demo/laundry/scene.js` | 201 | 常量、屋顶铺砖、外立面开窗、女儿墙、楼梯间 / 水塔 / 烟囱 / 天线、盆栽、小柠檬树、`bakeScene()` |
| `demo/laundry/cloth.js` | 143 | 衣物规格、挂衣、`drawCloth()`、篮内堆叠、`pickCloth()` |
| `demo/laundry/weather.js` | 166 | 天气时间线、云、雨、闪电、`gradeStorm()` |
| `demo/laundry/laundry.js` | 268 | 状态机、交互、主循环、`window.__laundry` 调试钩子 |

启动：

```bash
cd demo && python3 -m http.server 5310
# http://127.0.0.1:5310/laundry/
```

测试（渲染断言 + 导出 `docs/laundry-screenshot.png`）：

```bash
node tools/laundry-test.mjs
```

---

## 2. 画面构成

```
                楼梯间 + 水塔        烟囱      天线
                       ┌──┐          ┌┐       ╱╲
   ┌───────────────────┴──┴──────────┴┴───────┴──┐
   │  女儿墙                                       │
   │      ═══ 绳 1 ═════════════════════           │  ← LINE_YS = -4.2
   │  树  ═══ 绳 2 ═════════════════════   藤篮     │  ← LINE_YS = -0.8
   │      ═══ 绳 3 ═════════════════════           │  ← LINE_YS =  2.6
   └───────────────────────────────────────────────┘
       抹灰外墙 + 窗 + 绿色百叶（5 扇前墙 / 3 扇右墙）
       墙体向下溶解成纸白
```

| 尺寸 | 值 |
|------|-----|
| 屋顶 | `ROOF_X=12.5` × `ROOF_Y=7` |
| 楼体高度 | `WALL_DEPTH=6`（向下 3 单位内渐隐） |
| 女儿墙 | `PARAPET_H=.6`，厚 `.3` |
| 晾衣杆 | `x=±10`，绳高 `LINE_Z=3.7`，垂弧 `.22` |
| 藤篮 | `(9.8, 5.2)`，`r=.82`，`h=.95` |
| 衣物 | 3 条绳 × 7 件 = 21 件 |

地面协议：屋顶砖面的像素标 `ground=1`，`groundZ` 记为 z=0 的深度；
`kinds` 保持默认（全屋顶都吃阴影与 AO）。

---

## 3. 渲染管线

**烘焙一次**（`bakeScene`）：屋顶逐像素反投影铺砖 → `groundZ` → 外墙 + 窗 →
屋面构件 → `applyShadows(groundZ)` → `bakeOcclusion()` → 存 `bakedPix/bakedZ`。

**每帧**：

```js
pix.set(bakedPix); zb.set(bakedZ);
itemBuf.fill(0); pendingShadows.length = 0;
drawPile();                          // 篮内衣物堆
for (item of items) drawCloth(...);  // 参数化网格 + 波浪 + 湿度
drawLeaves(windT);                   // 树冠 capture 风动
flushShadows(); applyShadows(groundZ); shadeEdges();
gradeStorm(...);                     // 去饱和 / 云影 / 水洼 / 闪光
drawClouds(); drawBolt(); drawRain();// 粒子层：不写 zb、不参与描边
if (held) drawArrow(...);            // 指向藤篮
ctx.putImageData(image, 0, 0);
```

> 顺序是硬约束：调色必须晚于 `shadeEdges`（否则暖色 rim 被调掉），
> 粒子必须晚于调色（否则雨被一起调灰）。

---

## 4. 构件映射（docs/kit → 代码）

| 配方卡 | 代码位置 | 用途 |
|--------|----------|------|
| `buildings.md §1` `plaster-wall` | `scene.js` `wallColor()` | 抹灰 + 剥落露石 + 百叶窗 |
| `buildings.md §2` `house` | `buildWalls()` | 外立面开窗、两面可见墙 |
| `buildings.md §6` `parapet` | `buildRoof()` 开头 | 四边女儿墙 |
| `buildings.md §7` 楼梯间 / 水塔 / 烟囱 / 天线 | `buildRoof()` | 屋顶小构件组 |
| `props.md §4` `wicker-basket` | `buildRoof()` 末段 | 编织纹 + 篮口包边 |
| `props.md §5` `cloth` | `cloth.js` 全文 | 轮廓裁剪 / 波浪 / 旋转 / 湿度 / 衣夹 |
| `props.md §5.7` 拾取缓冲 | `cloth.js` `itemBuf` + `pickCloth()` | 点击拾取 |
| `plants.md §4` `potted-plant` | `buildRoof()` | 花盆 + 14 球叶簇 |
| `trees.md §1` `broadleaf` | `scene.js` `growLemonTree()` | 小柠檬树 + capture 风动 |
| `scene.md` 地面协议 | `bakeScene()` | `ground / groundZ / kinds` |
| `weather.md §1-4` | `weather.js` | 雨 / 云 / 闪电 / 全局调色 |
| `props.md §5.5` 垂弧绳 | `scene.js` `lineZ()` | 抛物线垂弧 |

---

## 5. 玩法与参数

| 参数 | 值 | 说明 |
|------|-----|------|
| 时间线 | 0–10 晴 / 10–28 起风 / 28–36 下雨 / 48 结束 | `weather.js` 顶部 |
| `stormLevel` | `ease(clamp((t-10)/18))` | 风暴强度 |
| `rainLevel` | `clamp((t-28)/8)` | 雨量 |
| 阵风间隔 | 10s → 5s（随风暴收紧） | `laundry.js` `gust()` |
| 松脱倒计时 | 1.8s | 黄夹子提示，之后起飞 |
| 入篮判定 | 屏幕距离 < 26px | `overBasket()` |
| 得分 | `value × (1 - wet×0.7)` | 湿衣折价 |

交互：

- **拖拽**：`pointerdown` → `pickCloth()`（方环逐圈放宽 6px）→ `held`；
  `pointerWorld()` 用 `unproject(sx, sy + CARRY_Z*COS*S)` 把指针反投影到携带高度。
- **松手**：落在藤篮上方 → `bank()` 计分；否则 `falling` → 落到屋顶 `ground`。
- **空格 / Enter**：`nextItem()` 按 `flying > loose > ground > line` 优先级自动收一件。
- **结束**：48 秒或所有衣物都进篮/吹走；点击画布重来。
- 调试：`window.__laundry = { G, update, draw, reset, grab, letGo, pickCloth, bank, overBasket }`。

---

## 6. 与参考实现的取舍

| 项 | 参考 | 本复刻 |
|----|------|--------|
| 画布 / 尺度 | 360×280 / S=10 | 相同 |
| 楼体 / 屋顶 / 绳 / 篮 | 原坐标 | 相同（篮子略小） |
| 衣物 | 21 件，Math.random 上色 | 21 件，`hash()` 固定上色（刷新可复现） |
| 阵风 | 7→3s，松脱 .9s | **10→5s，松脱 1.8s**（演示更从容） |
| 雨滴 | 520 上限，4 点/滴 | 460 上限，**8 点/滴**（雨丝更连续） |
| 门口邻居 | `figure()` 骨骼 | **去掉**：demo 引擎没有人物骨架（见 `figures.md`，需要时再移植） |
| 音效 / localStorage | WebAudio 噪声 | **去掉**：避免自动播放限制，场景专注画面 |
| HUD | 英文 | 中文 |

---

## 7. 坑

1. **颜色两张皮**：`rampOf()` 返回的是打包像素，只能写 `pix[i]` / `plot()`；
   喂给 `sphere/box` 的是 `[r,g,b]` 基色。
2. **阴影顺序**：`bake` 里必须先 `applyShadows` 再 `bakeOcclusion`。
   反过来 AO 会先把地面像素标进 `darkened`，静态投影就被整片跳过。
3. **雨 / 云 / 闪电**：画在 `shadeEdges()` 之后，且不写 `zb`；否则描边和深度都会坏。
4. **云和闪电只在空白处**（`zb < -1e8`）；全局调色也必须跳过空白像素，
   否则白背景会被染脏。
5. **拖拽反投影**：`unproject` 只给地面坐标，携带高度要先把屏幕 y 加上
   `CARRY_Z * COS * S`，否则衣服会浮在手指上方。
6. **布料旋转**：`pz` 必须一起旋转（`item.z - v*cr - u*sr`），只转 x/y 会让布立起来。
7. **衣物绘制顺序**：先 `drawPile` 再 `drawCloth`；篮内的球靠篮子前壁的深度被自然遮住。
8. **无头测试**：`tools/render.mjs` 按 12fps 虚拟时间步进，而场景主循环是 30fps；
   断言天气请直接调 `__laundry.update(dt)`，不要依赖 RAF 帧数。
