# forest.js — 翠绿小树林生成器

路径：`demo/forest.js`（约 230 行）
页面：`demo/forest.html`

## 职责

在 `engine.js` 之上生成一片可参数化的等距像素树林：

- 椭圆岛屿 + 草地 + 泥土边缘 + 土层
- 按最小间距布点，前排略大
- 每棵树：分叉树干 + 内层大球 + 表层小球的扁球树冠
- 5 档绿色调色板（翠绿 / 深绿 / 秋黄）
- 树冠投影与树根接触影
- 参数面板：树数量、树冠大小、配色、随机种子

## 依赖

| 依赖 | 用途 |
|------|------|
| `engine.js` | `pix` / `zb` / `project` / `sphere` / `capsule` / `castShadow` / `applyShadows` / `rampOf` / `noise` / `fit` |
| `window.PP_SCALE = 9` | 森林场景的像素密度（在加载 engine.js 前设置） |
| `window.PP_ORIGIN_Y = 8` | 投影原点偏移 |

## 参数

```js
const params = { count: 76, crown: 1, seed: 7, palette: 'fresh' };
```

| 参数 | 范围 | 说明 |
|------|------|------|
| `count` | 20–90 | 目标树数量，实际数量受最大尝试次数限制 |
| `crown` | 0.7–1.4 | 树冠整体缩放，影响树冠半径与球数 |
| `seed` | 任意整数 | 随机种子；相同种子生成相同树林 |
| `palette` | `fresh` / `deep` / `autumn` | 5 档色阶的配色 |

## 关键函数

| 函数 | 作用 |
|------|------|
| `rnd(a, b)` | 由 `seed` 决定的确定性随机 |
| `islandE(x, y)` | 超椭圆归一化距离 |
| `groundColor()` | 逐像素决定草/泥土/透明 |
| `bakeSoil()` | 岛屿向下挤出 `SOIL_H`，画侧壁 |
| `scatterGrass()` | 撒 1–3px 草叶 |
| `placeTrees()` | 拒绝采样布点，返回按 `y` 排序的树列表 |
| `drawTree(t)` | 树干 + 双层树冠 |
| `bakeForest()` | 完整烘焙：地面 → 草 → 树 → 阴影 → 提交 |
| `bindPanel()` | 绑定滑块、下拉框和"换一片"按钮 |

## 渲染顺序

```
bakeSoil()        土层侧壁
地面逐像素        草 / 泥土 / 白色背景
scatterGrass()    草叶
placeTrees()      布点
drawTree() × N    树干 + 树冠
castShadow() × N  树冠影 + 接触影
applyShadows()    只染地面
bakedPix.set()    存底图
putImageData()    提交（静态，不跑 rAF）
```

## 与 demo.js 的差异

| 项 | demo.js | forest.js |
|----|---------|-----------|
| 比例 | `PP_SCALE = 14` | `PP_SCALE = 9` |
| 内容 | 单棵树 + 木屋 + 三颗球 | 一片树林 |
| 交互 | 拖动球 | 参数面板 + 重新生成 |
| 动画 | 每帧 rAF | 静态，参数变化时重绘 |
| 土层 | 有 | 有 |
| 阴影 | 有 | 有 |

## 修改指南

| 想改什么 | 改哪里 |
|----------|--------|
| 岛的大小 | `RX` / `RY` |
| 树的数量范围 | `forest.html` 里滑块的 `min` / `max`，以及 `params.count` |
| 树的密度 | `placeTrees()` 的 `minD` |
| 树冠形状 | `drawTree()` 的 `cz`、`tilt * d * .52`、`* 1.1` |
| 树冠颜色 | `PALETTES` |
| 树影浓度 | `castShadow()` 的 `strength` / `dither` |
| 新增配色 | 在 `PALETTES` 加一项，并在 `forest.html` 的 `<select>` 加一个 `<option>` |

## 注意事项

- `bakeForest()` 会重置 `pix`、`zb`、`ground`、`shadowMask`；新增全局缓冲时记得同步重置。
- 树冠内层用 `pal[1]`，表层按 `tone` 取色；只改表层颜色不会影响内层体块。
- `placeTrees()` 返回前按 `y` 排序，保证绘制顺序稳定；深度缓冲本身不依赖顺序。
- 参数面板使用 `requestAnimationFrame` 节流，连续拖动滑块时不会每帧重建。
