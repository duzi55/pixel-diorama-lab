# engine.js — 最小等距像素渲染器

路径：`demo/engine.js`（约 250 行）

## 职责

提供一套**无依赖、无 WebGL** 的等距像素渲染原语。它不包含任何场景或玩法，只负责：

1. 建立固定分辨率的像素画布与深度缓冲
2. 把世界坐标投影到屏幕坐标
3. 绘制球体、胶囊、盒子、单像素
4. 生成 5 级色阶与 Bayer 抖动
5. 写投影阴影、做深度描边
6. 计算整数倍缩放

## 全局状态

| 名称 | 类型 | 说明 |
|------|------|------|
| `W`, `H` | `380`, `560` | 默认渲染分辨率，可用 `PP_W` / `PP_H` 覆盖 |
| `S` | `11` | 每世界单位对应的像素数，可用 `PP_SCALE` 覆盖 |
| `OX`, `OY` | 数值 | 投影原点（屏幕中心附近） |
| `pix` | `Uint32Array` | 当前帧颜色（ABGR，小端） |
| `zb` | `Float32Array` | 当前帧深度，越大越靠前 |
| `bakedPix` / `bakedZ` | 同上 | 静态场景底图 |
| `ground` | `Uint8Array` | 该像素是否属于地面 |
| `groundZ` | `Float32Array` | 地面的深度参考值 |
| `shadowMask` | `Uint8Array` | 待应用的阴影强度（0/1/2） |
| `canvas` / `ctx` / `image` | — | Canvas 与 `ImageData` |

### 跨 iframe 读取（`window.PP_SCENE`）

上面这些变量是**顶层 `let`，不会挂到 `window` 上**——父页面里 `win.pix` /
`win.bakedPix` 永远是 `undefined`。需要从外部（Studio 的底图抓取）读缓冲时，
走 engine 暴露的只读 getter：

```js
win.PP_SCENE.W  / .H  / .pix / .bakedPix / .bakedZ / .ground / .groundZ
```

`PP_setSize()` 重建缓冲后 getter 自动指向新数组。这是
`demo/studio/scene-import.js` 抓取场景底图的唯一约定。

## 公共 API

| 函数 | 用途 | 关键点 |
|------|------|--------|
| `project(x, y, z)` | 世界 → 屏幕 | 返回 `{ sx, sy, d }`，`d` 是深度 |
| `unproject(sx, sy)` | 屏幕 → 地面 | 默认 `z = 0`，用于地面纹理和拖拽 |
| `sphere(x, y, z, r, color, mode)` | 球体 | `mode`: `rough` / `gloss` / `solid` |
| `capsule(a, b, r0, r1, colorOf, mode)` | 胶囊 | `colorOf(z)` 可按高度返回颜色 |
| `box(x0, y0, z0, x1, y1, z1, color, seed)` | 盒子 | 只画顶/前/右三面 |
| `plot(x, y, z, color)` | 单像素 | 画门窗、水波等细节 |
| `castShadow(x, y, z, r, strength, dither)` | 写阴影 mask | `strength`: 1 普通，2 接触 |
| `applyShadows(refZ)` | 应用阴影 | 只染 `ground[i] && zb[i] === refZ[i]` 的像素 |
| `shadeEdges()` | 深度描边 | 会修改 `pix`，每帧调用一次 |
| `fit()` | 自适应缩放 | 整数倍 + dpr 对齐 |

## 推荐调用顺序

```js
// 启动时一次
fit();
bake();                     // 场景自己的函数：画地面与静态物体
bakedPix.set(pix);
bakedZ.set(zb);

// 每帧
pix.set(bakedPix);
zb.set(bakedZ);

// 1. 画动态物体（写入 zb）
sphere(...);
box(...);

// 2. 写阴影 mask，再应用
castShadow(...);
applyShadows(bakedZ);

// 3. 描边
shadeEdges();

// 4. 提交
ctx.putImageData(image, 0, 0);
```

## 注意事项

- `applyShadows()` 必须在动态物体写完之后调用，且传入**静态底图的深度**（通常是 `bakedZ`），否则阴影会盖到物体上。
- `shadeEdges()` 会修改 `pix`，所以每帧都应从 `bakedPix` 恢复，避免暗边累积。
- `plot()` 与 `box()` 都做深度测试；画同一表面的细节时，坐标要略微向相机方向偏移（例如墙面 `y + 0.02`）。
- `sphere()` 的半径以世界单位计，屏幕上会自动乘 `S`；最小 0.75px，避免整数取整后消失。
- 所有颜色都是 `[r, g, b]` 数组；相同数组对象会命中 `WeakMap` 缓存，频繁变色的物体建议复用数组。

## 修改指南

| 想改什么 | 改哪里 |
|----------|--------|
| 画面更粗糙/更精细 | `S`（每单位像素数） |
| 光源方向 | `sphere()` 里的 `-.55 * dx - .6 * dy + .58 * nz` |
| 画布尺寸与显示 | 两种模式：① 固定逻辑分辨率 + `fit()` 整数倍缩放居中；② **`PP_FULLSCREEN` 全屏模式**——画布缓冲 = 窗口尺寸（1 画布像素 = 1 CSS 像素），`fit()` 1:1 显示，`resize` 时 `PP_setSize()` 重建并重烘焙。全屏模式下画面大小与窗口无关 |
| 柔和阴影档 | `castShadow(..., strength)` 四档：1 常规 .62 / 2 深接触 .36 / 3 轻 .82（晴天植物影）/ 4 极轻 .90（大偏移柔影） |
| 影子不染某类地面 | `applyShadows()` 里加 `kinds[i]` 过滤（village 用它让车行道免影，公路保持亮带） |
| 明暗对比 | `rampOf()` 的倍率与 `COOL` / `WARM` |
| 抖动强度 | `sphere()` 里的 `* .7` |
| 阴影方向 | `SHADOW_X` / `SHADOW_Y` |
| 描边阈值 | `EDGE`（默认 `.28`） |
