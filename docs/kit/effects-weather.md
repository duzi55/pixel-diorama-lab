# 特效层与天气层运行时

> 模块：`demo/kit/effects.js`（`KIT_EFFECT`）· `demo/kit/weather.js`（`KIT_WEATHER`）
> 定位：**不是 KIT 构件，是效果层**。构件参与画家排序与碰撞；特效与天气在整帧画完之后叠加。
> 来源：`engine.js:297-336` · `tie-break:515-554` · `stari-most:530-550` · `mini-ramp:467` · `laundry:450-541`
> 参考阅读：[effects.md](effects.md) · [weather.md](weather.md)

---

## 0. 定位与加载

```
engine.js  →  effects.js  →  weather.js  →  场景脚本
```

- 零依赖、零 DOM、无构建；只用 `engine.js` 的全局原语与 `window` 无关的像素缓冲。
- 唯一全局名：`KIT_EFFECT`、`KIT_WEATHER`（内部辅助全部包在 IIFE 里，不会和引擎的 `clamp/rgb` 撞名）。
- 随机只用 `hash(k, seed)`，**没有 `Math.random()`**；同一 `(id, u, params)` 重绘结果逐像素一致。
- 颜色契约：`params` 里的颜色一律写 `[r,g,b]` 数组；模块内部转成 `rgb()` 打包值再给 `plot/dot`。

### 0.1 最小用法

```js
// 场景画完、shadeEdges 之后（参考 effects.md §4 第 9 步）
KIT_EFFECT.draw('arrow', null, 3.2, 1.4, 2.2, (t * .5) % 1, { scale: 1 });
KIT_EFFECT.draw('ring', null, 3.2, 1.4, 0, u, { radius: 1.6 });
KIT_EFFECT.draw('halo', null, 0, 0, .8, 0, { radius: 1.2 });
```

```js
// 天气：粒子层在场景之后，调色在最后
KIT_WEATHER.rain(null, { bounds: { x0: 0, y0: 0, x1: W, y1: H }, density: .7, angle: .2, alpha: .9, t });
KIT_WEATHER.cloud(null, { cx: W / 2, cy: 64, r: 22, tone: .6 });
KIT_WEATHER.bolt(null, 2, -1, 7, { seed: 3, reach: .8 });
KIT_WEATHER.gradeStorm(pix, W, H, storm, { time: t, flash: flash });
```

---

## 1. `KIT_EFFECT` 契约

```js
KIT_EFFECT = {
  defs, order,
  register(def),                 // { id, label, category, desc, params, life, draw }
  get(id), list(category),
  draw(id, ctx, x, y, z, u, params) → boolean,
  makeCtx(base),                 // 适配器（weather.js 复用）
};
```

| 字段 | 说明 |
|------|------|
| `category` | `ui`（5 个）/ `impact`（3 个）/ `ground`（2 个） |
| `life` | 建议秒数；`0` = 常驻，由调用方控制；`u` 可当相位 |
| `draw` 返回值 | `life>0` 时 `u<1` 返回 true；`life=0` 永远 true |
| `x,y,z` | **世界坐标**，模块内部 `screen()` 投影；不用调用方先投影 |
| `u` | 生命周期进度 `0..1`，自动夹取 |
| `params` | 只覆盖传入的键；颜色接受 `[r,g,b]` |

### 1.1 特效 ctx

`KIT_EFFECT.draw()` 会把传入的 `ctx` 归一化：

| 传入 | 行为 |
|------|------|
| `null` / 省略 | 直接用引擎全局 `project/plot/sphere/...` |
| KIT 渲染 ctx | 复用它的 `screen/plot/sphere/capsule/box`（旋转、缩放、行为动画都生效） |
| 已包装的 ctx | 原样返回（`__kitEffectCtx` 标记，避免二次包装） |

def 里只允许碰这些：

| 原语 | 作用 |
|------|------|
| `plot / sphere / capsule / box` | 世界坐标，走深度缓冲 |
| `screen(x,y,z)` | 世界 → `{sx,sy,d}` |
| `dot / dots` | **屏幕覆盖层**：只写 `pix`，不写 `zb`（等价参考项目的 `drawDots`） |
| `isObject / isGround` | 读 `zb/groundZ/ground`，给 halo、地面痕迹用 |
| `tint` | 乘算压暗已有像素（地面痕迹） |
| `rgb / rampOf / hash / bayerAt / clamp / lerp` | 颜色与确定性随机 |

> `KIT_EFFECT` 的 def **不直接写 `pix`**。唯一写 `pix` 的地方是 `makeCtx()` 里的 `dot/tint` ——
> 那是模块与引擎的边界，集中在一处，便于换渲染后端。天气层同样复用这个适配器。

---

## 2. 10 个特效

| ID | 名称 | 分类 | life | 形态 | 参考 |
|----|------|------|------|------|------|
| `arrow` | 指示箭头 | ui | 0 | 13×12 字符画 + 白描边 + 3fps 浮动 | `engine.js:303` |
| `bang` | 爆炸符号 | ui | .45 | 5×7 惊叹号 + 白描边 | `mini-ramp:467` |
| `target-ring` | 目标环 | ui | 0 | 地面 2:1 椭圆，黄黑/黑白双配色 | `tie-break:515` |
| `charge-bar` | 能量条 | ui | 0 | 17×5 边框 + 15 格填充 | `stari-most:555` |
| `halo` | 白描边 | ui | 0 | 扫描真实轮廓向 4 邻域外扩；无形体退化为虚线椭圆 | `engine.js:319` |
| `dust` | 扬尘 | impact | .7 | 向外扩散 + 抬升 + 按 hash 消散 | `tie-break:546` |
| `spark` | 火花 | impact | .35 | 十字/八角白点向外炸开 | `tie-break:548` |
| `splash` | 水花 | impact | .6 | 抛物线水滴 + 落点归零 | `stari-most:543` |
| `ring` | 涟漪 | ground | .9 | 虚线圆环，hash 剔除逐渐消散 | `stari-most:530` |
| `track-mark` | 地面痕迹 | ground | 0 | 十字笔刷沿运动反方向压暗地面 | `tie-break:354` |

### 2.1 参数表

#### `arrow` 指示箭头
| 参数 | 默认 | 区间 | 说明 |
|------|------|------|------|
| `scale` | 1 | 1..3 | 像素放大 |
| `bob` | 1 | 0..1 | 上下浮动（`u` 驱动，3fps 两帧） |

#### `bang` 爆炸符号
| 参数 | 默认 | 区间 | 说明 |
|------|------|------|------|
| `scale` | 1 | 1..3 | 像素放大 |
| `bob` | 1 | 0..1 | 上下浮动 |

#### `target-ring` 目标环
| 参数 | 默认 | 区间 | 说明 |
|------|------|------|------|
| `rx` | 8 | 4..22 | 椭圆半径 X（像素） |
| `ry` | 4 | 2..12 | 椭圆半径 Y（像素） |
| `ok` | 1 | 0..1 | 1 = 判区内（黄心黑边）；0 = 判区外（黑心白边） |
| `pulse` | 1 | 0..1 | 呼吸脉动（`u` 驱动） |

#### `charge-bar` 能量条
| 参数 | 默认 | 区间 | 说明 |
|------|------|------|------|
| `power` | .6 | 0..1 | 能量 → 15 格填充 |
| `scale` | 1 | 1..3 | 像素放大 |

#### `halo` 白描边
| 参数 | 默认 | 区间 | 说明 |
|------|------|------|------|
| `radius` | 1.5 | .3..6 | 搜索半径（世界单位），决定屏幕包围盒 |
| `thickness` | 1 | 1..2 | 向外扩几圈 |
| `color` | `[255,255,255]` | — | 描边色 |

#### `dust` 扬尘
| 参数 | 默认 | 区间 | 说明 |
|------|------|------|------|
| `count` | 10 | 3..24 | 尘点数量 |
| `radius` | 1.2 | .3..3 | 扩散半径（世界） |
| `rise` | .9 | 0..2 | 抬升高度 |
| `color` | `[224,170,130]` | — | 尘色 |
| `seed` | 11 | 0..999 | 随机种子 |

#### `spark` 火花
| 参数 | 默认 | 区间 | 说明 |
|------|------|------|------|
| `size` | 5 | 2..9 | 最大半径（像素） |
| `rays` | 4 | 4..8 | 4 = 十字；8 = 加对角射线 |
| `color` | `[255,255,255]` | — | 火花色（中心始终是 SIGNAL 黄） |

#### `splash` 水花
| 参数 | 默认 | 区间 | 说明 |
|------|------|------|------|
| `count` | 8 | 3..20 | 水滴数量 |
| `spread` | .5 | .2..1.5 | 水平扩散（世界） |
| `lift` | 1.2 | .3..3 | 飞溅高度 |
| `color` | `[232,244,250]` | — | 水色 |
| `seed` | 23 | 0..999 | 随机种子 |

#### `ring` 涟漪
| 参数 | 默认 | 区间 | 说明 |
|------|------|------|------|
| `radius` | 1.5 | .4..4 | 最大半径（世界）；实际 `r = R*(.25+.75u)` |
| `color` | `[226,240,226]` | — | 水色 |

#### `track-mark` 地面痕迹
| 参数 | 默认 | 区间 | 说明 |
|------|------|------|------|
| `length` | 1.2 | .3..4 | 痕迹长度（世界） |
| `angle` | 0 | 0..6.28 | 运动方向（弧度），痕迹朝反方向延伸 |
| `width` | 2 | 1..4 | 十字笔刷半宽（像素） |
| `strength` | .14 | .04..0.4 | 压暗强度 |
| `density` | .7 | .2..1 | 落点密度（Bayer 剔除） |

---

## 3. `KIT_WEATHER` 契约

```js
KIT_WEATHER = { rain, cloud, bolt, gradeStorm };
```

### 3.1 `rain(ctx, opt)`

屏幕空间斜向雨丝。位置按 `t` **解析计算**（不是粒子池），所以任意时刻可重放、可暂停。

| opt | 默认 | 说明 |
|-----|------|------|
| `bounds` | 全屏 | `{x0,x1,y0,y1}` 屏幕像素矩形 |
| `density` | .55 | 0..1，雨滴数 = `density*520*面积比`（上限 1000） |
| `angle` | .18 | 弧度，向右倾斜；`0` = 垂直 |
| `alpha` | .9 | 0..1，按 Bayer 阈值丢弃雨滴（像素风透明） |
| `t` | 0 | 秒；决定下落相位 |
| `speed` | 26 | 世界单位/秒 |
| `seed` | 7 | 随机种子 |
| `color` | `[112,134,188]` | 雨色 |
| `length` | 4 | 每滴雨丝长度（像素） |

雨丝是覆盖层，不写 `zb`；需要被前景遮挡时请自行缩小 `bounds` 或分两层画。

### 3.2 `cloud(ctx, opt)`

3~4 个椭圆瓣组成的云团，Bayer 阈值做半透明。

| opt | 默认 | 说明 |
|-----|------|------|
| `cx, cy` | 画布中心 / 40 | 屏幕坐标 |
| `r` | 14 | 主瓣半径（像素） |
| `tone` | 0 | `0..1`（0 浅、1 深）或 `[r,g,b]` 基色 |
| `alpha` | 1 | 0..1 |
| `seed` | 1 | 瓣位抖动种子 |

云只画在**留白/天空**：`isObject` 或 `isGround` 为真的像素直接跳过，所以不会盖住场景。

### 3.3 `bolt(ctx, x, y, z, opt)`

从世界坐标 `(x,y,z)` 劈到地面 `z=0` 的折线，返回屏幕折线点数组。

| opt | 默认 | 说明 |
|-----|------|------|
| `seed` | 3 | 折线抖动种子 |
| `segments` | 8 | 段数（最少 2） |
| `jitter` | 14 | 横向抖动幅度（像素） |
| `reach` | 1 | 0..1，只画前 `reach` 段（生长动画） |
| `overlay` | false | false = 只画在留白处（闪电在场景后）；true = 盖住场景 |
| `core` | `[250,240,150]` | 中芯色 |
| `glow` | `[120,112,214]` | 两侧辉光色 |

### 3.4 `gradeStorm(pix, W, H, t, opt)`

全屏调色，**天气感的 80% 来自这里**。

| 参数 | 说明 |
|------|------|
| `t` | **暴雨强度 0..1**（不是秒）；`0` 直接返回，不改像素 |
| `opt.time` | 云影漂移相位（秒） |
| `opt.flash` | 0..1 闪电提亮；默认 `t*.05`（轻微提亮） |
| `opt.bg` | 要跳过的纸色，打包值或 `[r,g,b]`；不给 = 整屏调 |
| `opt.cloudShadow` | 默认 true；false 只做去饱和 + 偏蓝压暗 |

四层：去饱和（`.46/.36/.20`）→ 偏蓝（`+8/+12/+26`）→ 1/8 分辨率云影 →
闪电 `lerp(...,244,255,flash)`。输出通道夹在 **6..249**，保证不会把画面写成纯黑/纯白。

> 与参考 `gradeStorm` 的差异：参考能靠 `zb` 跳过空白；本函数只拿到 `pix/W/H`，所以改由
> `opt.bg` 指定纸色。真实场景建议传 `opt.bg = KIT_RENDER.bgColor`。

---

## 4. 渲染顺序

```
场景画完（applyShadows → shadeEdges）
  → halo（要紧贴目标物体之后，见坑 2）
  → 地面层：ring / track-mark
  → 冲击层：dust / splash / spark
  → UI 层：target-ring / charge-bar / arrow / bang
  → 天气粒子：cloud → bolt → rain
  → gradeStorm(pix, W, H, storm, { time, flash, bg })
  → ctx.putImageData
```

| 约束 | 原因 |
|------|------|
| 全部在 `shadeEdges()` **之后** | 特效/天气不该被描边处理 |
| `gradeStorm` 最后 | 调色必须吃掉整帧，包括其他特效 |
| `halo` 紧跟目标物体 | 它靠 `zb` 找轮廓；后画的特效会进包围盒 |
| 粒子不写 `zb` | 避免污染后续深度；`dot` 天然满足 |
| 地面类用 `plot`（写 `zb`） | 让地面物体能正确盖住痕迹；因此要画在物体之后 |

---

## 5. 验收结果（380×560 空画布）

`u=0 / 0.5 / 1` 三帧的像素数（背景纸上非背景像素）；`pix` 必须是引擎的 `Uint32Array`：

| 特效 | u=0 | u=0.5 | u=1 | 确定性 | u=1 继续播放 |
|------|-----|-------|-----|--------|--------------|
| `arrow` | 118 | 118 | 118 | ✓ | true（常驻） |
| `bang` | 41 | 41 | 41 | ✓ | false |
| `target-ring` | 115 | 115 | 115 | ✓ | true |
| `charge-bar` | 129 | 129 | 129 | ✓ | true |
| `halo`（无形体，退化为虚线椭圆） | 27 | 27 | 27 | ✓ | true |
| `dust` | 6 | 7 | 3 | ✓ | false |
| `spark` | 5 | 9 | 9 | ✓ | false |
| `splash` | 4 | 8 | 8 | ✓ | false |
| `ring` | 12 | 13 | 11 | ✓ | false |
| `track-mark` | 30 | 30 | 30 | ✓ | true |

天气（默认参数）：

| 调用 | 像素 |
|------|------|
| `rain` 全屏 `density=.6, t=1.2` | 1231（重绘逐像素一致） |
| `rain` 局部框 `density=.2, alpha=.5` | 4 |
| `cloud r=22 tone=.5` | 1082 |
| `cloud r=10 [r,g,b]` | 225 |
| `bolt reach=1` | 178（9 个折线点） |
| `bolt reach=.4` | 88 |
| `gradeStorm` 中灰 `t=.7` | 212800 像素全部改变，纯黑/纯白通道 0，通道范围 76..132 |
| `gradeStorm(opt.bg)` | 纸色 212400 px 原样保留，前景 400 px 被调 |

场景语义：

| 场景 | 结果 |
|------|------|
| 球体（136 px）上跑 `halo` | 38 个白色轮廓点 |
| 绿地（96000 px）上跑 `track-mark` | 60 px 乘算压暗，落土色点 0 |
| 绿地 + `ring` (u=.5) | 16 px（抬高 0.15 后不再被地面深度拒掉） |
| 球体上跑 `cloud` | 242 个物体像素改变 0 个 |
| KIT 风格自定义 `ctx` | `arrow` 正常绘制（414 px），返回 true |

---

## 6. 坑

1. **地面类必须抬 z ≈ 0.15**。`plot` 的深度和地面 `groundZ` 都是像素级量化；
   `z=0.02` 时约一半点会因为地面像素中心更深而被拒（实测 `ring` 只有 9 px）。
   抬到 `.15` 世界单位（约 1.4 屏幕像素）后稳定通过，同时保留遮挡关系。
2. **`halo` 必须在目标物体之后、其他覆盖层之前调用**。它读 `zb` 找“非地面且非空白”的像素，
   扫的是 `radius` 决定的屏幕包围盒；先画 dust/spark 会把尘点也描一圈。
3. **`halo` 依赖引擎的空像素约定**：`zb <= -1e8` 判空、`zb === groundZ` 判地面。
   换渲染后端时要在适配器里实现 `isObject/isGround`。
4. **`dot` 不写 `zb`**，所以 UI 永远在最上层；`plot` 会写 `zb`，地面痕迹之后不能再依赖旧深度。
5. **`cloud` 不覆盖场景**（`isObject || isGround` 跳过）；星空/纸背景若被画成地面色而不是留白，
   云会整片消失。检查场景是否把天空写进了 `ground[]`。
6. **`bolt` 默认只在留白处画**。场景边缘的雷击想压过建筑，传 `overlay: true`。
7. **`gradeStorm` 的 `t` 是强度不是秒**。要做闪烁请传 `opt.flash`；要做云影漂移请传 `opt.time`。
   纸背景场景务必传 `opt.bg`，否则纸色也会被调冷。
8. **颜色分两张皮**：`params.color` 写 `[r,g,b]`；`plot/dot` 吃 `rgb()` 打包值。
   `pack()` 负责转换，def 里不要手写位运算。
9. **`u` 的语义随 `life` 变**：`life>0` 是 0..1 进度；`life=0` 是调用方给的相位
   （箭头/爆炸的 3fps 浮动就是 `floor(u*6)%2`）。
10. **雨是解析粒子**：不要按帧累积位置。`t` 相同 → 画面逐像素相同；暂停时传固定的 `t` 即可。
11. **不要用 `Math.random()`**。所有位置/剔除都是 `hash(k, seed)`；
    测试脚本会扫描源码，出现 `Math.random` 直接判失败。
12. **文件规模**：`effects.js` 398 行、`weather.js` 257 行（`wc -l`），都在 400 行闸门内。
    再加特效时优先抽共享字形/参数片段，不要把 `register` 堆成 600 行。

---

## 7. 待登记（本次范围外）

本次只允许新建三个文件，因此还没改：

- `docs/kit/registry.md §6`：补 10 个特效 ID 与 4 个天气函数。
- `AGENTS.md` 模块导航：补 `demo/kit/effects.js` · `demo/kit/weather.js` · 本篇。

登记时锚点用 `effects-weather.md#2-10-个特效` 与 `#3-kit_weather-契约`。
