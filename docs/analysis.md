# Pixel Plays 技术拆解

参考项目：[`amirmushichge/pixel-plays`](https://github.com/amirmushichge/pixel-plays)（MIT）
本地路径：`reference/pixel-plays/`

---

## 1. 它是什么

五个浏览器小游戏（法式滚球、跳水、屋顶晾衣、网球抢七、滑板 U 池），每个都是**一个独立 HTML 页面 + 一份纯 JavaScript**。没有 Three.js、没有 WebGL、没有构建步骤、没有第三方依赖，也没有任何图片或精灵图。

所有画面由三类解析图元逐像素绘制：

- **球体**（`sphere`）：地面上的一切球状物
- **胶囊**（`capsule`）：树干、四肢、瓶子
- **盒子**（`box`）：建筑、长椅、木板

所谓 "software rasteriser" 指的是**像素级软件光栅化**，不是三角形网格管线。

---

## 2. 文件与职责

| 文件 | 行数 | 职责 |
|------|------|------|
| `engine.js` | 343 | 相机投影、深度缓冲、图元、光照、色阶、抖动、阴影、描边、AO、风、人物 |
| `shell.js` | 147 | 游戏菜单、Rules 弹窗、作者署名、背景音乐 |
| `<game>/index.html` | 500–650 | 该作的 `bake()` / `update()` / `draw()` 与输入处理 |
| `serve.mjs` | 30 | 零依赖静态服务器（`node serve.mjs`，端口 5300） |

游戏之间不共享模块，只共享 `engine.js` 暴露的全局函数与缓冲区。

---

## 3. 渲染管线

画布固定 **360×280**，用 `Uint32Array` 直接操作像素（`engine.js:11-19`）：

```js
const image = ctx.createImageData(W, H);
const pix = new Uint32Array(image.data.buffer); // ABGR
const zb  = new Float32Array(W * H);            // 深度缓冲
```

每帧六步（以 `balote/index.html:399` 为例）：

```js
pix.set(bakedPix);       // 1. 恢复静态场景
zb.set(bakedZ);

sphere(...);             // 2. 画动态物体
figure(...);
box(...);

castShadow(...);         // 3. 写阴影 mask
flushShadows();
applyShadows(bakedZ);    //    只染地面

shadeEdges();            // 4. 深度描边
drawAim(); drawResult(); // 5. 覆盖层（准星、轨迹）

ctx.putImageData(image, 0, 0); // 6. 一次提交
```

**静态内容只烘焙一次**（`bake()`），动态内容每帧叠加。10 万像素的 `set()` 拷贝远低于 1ms，所以 60fps 没有压力。

---

## 4. 等距投影

```js
const SIN = 0.5, COS = Math.sqrt(3) / 2, R2 = Math.SQRT2;

function project(x, y, z) {
  const u = (x - y) / R2, v = (x + y) / R2;
  return {
    sx: OX + u * S,
    sy: OY + (v * SIN - z * COS) * S,
    d:  v * COS + z * SIN,
  };
}
```

（`engine.js:53-56`，`S = 10` 像素/世界单位）

- **正交投影，没有透视**，相机角度永久固定
- 深度 `d` 由 `(x+y)` 和 `z` 解析求出，不需要矩阵
- `unproject(sx, sy)` 是逆运算，用于把屏幕像素还原成地面坐标

地面纹理就是逐像素反投影生成的（`balote/index.html:117-122`）：

```js
for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
  const g = unproject(ix + .5, iy + .5);
  const c = groundColor(g.x, g.y, ix, iy, i);
  ...
}
```

---

## 5. 图元

### 5.1 球体（`engine.js:63`）

```js
const dx = (ix + .5 - p.sx) / rp;
const dy = (iy + .5 - p.sy) / rp;
const nn = dx * dx + dy * dy;
if (nn > 1) continue;

const nz = Math.sqrt(1 - nn);        // 球面法线 z
const d  = p.d + r * nz;             // 前表面深度
if (d <= zb[i]) continue;            // 深度测试

const l = clamp(-.55 * dx - .6 * dy + .58 * nz, 0, 1); // 固定左上方光源
```

三种材质模式：

| mode | 用途 | 特征 |
|------|------|------|
| `rough` | 树叶、石头 | 叠加 hash 噪声，表面粗糙 |
| `gloss` | 球、瓶子 | `l > 0.9` 直接写死高光 |
| `solid` | 人物 | 跳过抖动，平色带，剪影清晰 |

### 5.2 胶囊（`engine.js:87`）

沿 A→B 按半径采样一串球体，是树干和四肢的通用画法。

### 5.3 盒子（`engine.js:95`）

只画**顶面、前面、右面**三个可见面，亮度写死为 `3.4 / 2.3 / 1.2`（对应色阶索引）。面内以 `0.045` 世界单位为步长采样，用 `noise()` 生成木纹/石纹。

相机固定，所以不需要背面剔除、法线计算和阴影贴图。

---

## 6. 颜色系统

### 5 级色阶 + hue-shift（`engine.js:29-36`）

```js
ramp = [
  mix(.4,  COOL, .34),  // 最暗：压暗 + 混紫
  mix(.62, COOL, .18),
  mix(.84, COOL, .05),
  mix(1,   WARM, 0),
  mix(1.1, WARM, .22),  // 最亮：提亮 + 混暖黄
];
```

阴影偏紫、高光偏黄。`WeakMap` 缓存，颜色数组只计算一次。

### Bayer 4×4 有序抖动（`engine.js:20, 84`）

```js
const BAYER = [0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5].map(v => (v + .5) / 16);
pix[i] = ramp[clamp(
  Math.floor(l * 4.4 + .2 + (bayerAt(ix, iy) - .5) * .7), 0, 4
)];
```

- 用规则网格阈值消除色带（banding），同时保留复古颗粒
- 大面积平地改用**非常接近的 4 个色值**（`SAND_TONES`），否则抖动会读成棋盘格

---

## 7. 阴影

光源方向固定，影子 = 把物体沿光方向压到地面（`engine.js:112`）：

```js
const p = project(x + SHADOW_X * z, y + SHADOW_Y * z, 0); // 1.3, -0.12
```

- `castShadow()` 写椭圆 `shadowMask`，边缘用 Bayer 抖动
- 两层强度：`2` 是脚底接触阴影，`1` 是普通投影

关键在 `applyShadows()`（`engine.js:124-133`）：

```js
if (!ground[i] || zb[i] !== refZ[i]) continue; // 只染“仍然是地面”的像素
tint(i, .54, .52, .72);
```

阴影**永远不会盖到球和人物身上**，画面因此保持干净。静态物体的影子在 `bake()` 时烘进 `staticShadow`。

---

## 8. 边缘与 AO

### 深度描边（`engine.js:136-150`）

```js
if (邻居是地面)                       tint(i, .68, .66, .76); // 暗轮廓
else if (d - zb[a] - GRADIENT_Y > EDGE) 加暖色 rim light;
else if (zb[e] - d > EDGE)           tint(i, .74, .72, .82); // 背光侧压暗
```

- `GRADIENT_Y = COS / (S * SIN) ≈ 0.173`：等距地面每向下一像素的天然深度增量；不减掉它，整块地面都会被误判为边缘
- 地面本身不参与描边，避免影子边缘被框住

### 屏幕空间 AO（`engine.js:202-219`）

对每个地面像素，向 8 个方向、2 个半径采样 16 个点：

```js
if (hits >= 8) tint(i, .56, .54, .72);
else if (hits / 8 > bayerAt(ix, iy)) tint(i, .74, .72, .84);
```

廉价的接触遮蔽，出现在树根、长椅下、墙脚。

---

## 9. 程序化内容

### 树（`engine.js:231-247`）

- 树干：3 段 `capsule`
- 树冠：420 个 `sphere`，在球体内用 `Math.cbrt(hash())` 均匀撒点
- 按 `tone` 分三种绿，形成层次
- **叶子像素被缓存成 sprite**：`capture` 模式让 `sphere()` 只记录像素和深度，之后每帧按风偏移重绘

### 草与风（`engine.js:155-184`）

```js
const WIND_FPS = 8; // 故意步进，看起来像手绘动画而不是物理模拟
```

- 每根草 1–4 像素高，摆动位移取整
- 8fps 是刻意的：平滑插值会像 3D 动画，步进才有像素动画的味道
- `prefers-reduced-motion` 时停止

### 人物（`engine.js:248-282`）

- 用 `yaw` 建立局部坐标系 `(前向, 侧向)`
- 关节：髋、膝、脚、肩、肘、手、颈、头
- `capsule()` 连接，`solid` 模式绘制
- 球衣条纹按 `Math.floor(z * 3.2) % 2` 切换，约 3px 一条

---

## 10. 玩法层（以 Balote 为例）

| 部分 | 做法 |
|------|------|
| 输入 | 屏幕拖拽 → `unproject` 成世界方向，拉得越远力量越大 |
| 物理 | 抛体 + 滚动摩擦 + 围栏反弹 + 球球碰撞（弹性 0.82），每帧 4 次子步 |
| AI | 由距离反解初速度：`dist = air * v + v² / (2 * decel)` |
| 轨迹预览 | 用同一套物理公式预演 40 步，每 2 步画一个像素 |
| 地面痕迹 | 球滚动时把经过的地面像素压暗 12%，回合开始时用 `pristinePix` 重置 |
| 音效 | WebAudio 振荡器现场合成，无音频文件 |

---

## 11. 工程技巧

| 技巧 | 实现 |
|------|------|
| 像素不糊 | 整数倍缩放 + dpr 对齐 + `image-rendering: pixelated` |
| 静态/动态分离 | `bakedPix` + `bakedZ`，每帧 memcpy |
| 颜色缓存 | `WeakMap` 缓存 ramp |
| 零分配 | 所有缓冲启动时分配一次 |
| 可访问性 | `prefers-reduced-motion`、`aria-label`、键盘操作 |
| 调试钩子 | `window.__balote = { G, step(dt) }` |
| 部署 | 纯静态文件，任意静态服务器 |

---

## 12. 能力边界

**适合**

- 固定视角的小场景、微缩景观、互动玩具
- 低分辨率复古像素风
- 单文件、可离线、可静态部署

**不适合**

- 自由旋转的相机、大量多边形、真实光照
- 复杂地形、大世界、需要物理引擎的场景
- 每个游戏 500–650 行，调参成本高（颜色、步长、阈值全靠试）

---

## 13. 本工作区 demo 的取舍

| 原项目 | demo | 说明 |
|--------|------|------|
| 投影 + 深度缓冲 | ✅ 保留 | `demo/engine.js` |
| 球 / 胶囊 / 盒 | ✅ 保留 | 球、树干、木屋 |
| 5 级色阶 + Bayer | ✅ 保留 | 同公式 |
| 投影阴影 | ✅ 保留 | 双层强度 |
| 深度描边 | ✅ 保留 | 同公式 |
| 地面程序化纹理 | ✅ 保留 | 椭圆岛 + 泥土带 |
| 土层挤出 | ✅ 新增 | 原项目没有，demo 用来增强悬浮感 |
| AO 烘焙 | ❌ 去掉 | 减少首屏复杂度 |
| 风 / 树叶动画 | ❌ 去掉 | 静态树 |
| 人物骨骼 | ❌ 去掉 | — |
| 音频 / 玩法 | ❌ 去掉 | 只保留拖拽观察 |

demo 的完整说明见 `docs/modules/engine.md` 与 `docs/modules/demo.md`。
