# 天气与全局调色

> 注册表：[registry.md §6](registry.md)
> 核心原则：**天气 = 少量粒子 + 一层全屏调色**。粒子负责动，调色负责"气氛变了"。

---

## 0. 天气系统的四层

```
① 粒子层   雨滴 / 云 / 闪电      —— 负责"动"
② 地面响应 溅射 / 水洼 / 变湿     —— 负责"地面受影响"
③ 环境调色 去饱和 + 偏蓝 + 云影    —— 负责"整体气氛"
④ 声音      白噪声滤波             —— 负责"听起来对"
```

**关键在于 ③**。雨滴只是几百个像素点，真正让画面"变成雨天"的是全屏调色。

---

## 1. `rain` 雨

| 项 | 内容 |
|----|------|
| **来源** | `ref` `laundry:497-514` |
| **状态** | ✅ |

### 参数组

| 参数 | 默认 | 区间 | 作用 |
|------|------|------|------|
| `maxDrops` | 520 | 100～1000 | 雨滴上限 |
| `fallSpeed` | 26 | 15～40 | 下落速度 |
| `windSpeed` | 3 | 0～10 | 横向风速 |
| `color` | `[112,134,188]` | — | 雨色（冷蓝灰） |
| `splashLife` | .12 | .08～.2 | 溅射存活时间 |

### 关键算法

**固定池 + 对象回收**

```js
function newDrop(anywhere) {
  return {
    x: (Math.random()-.5) * (ROOF_X*2+4) - 2,
    y: (Math.random()-.5) * ROOF_Y*2.2,
    z: anywhere ? Math.random()*14 : 12 + Math.random()*3,
  };
}
function updateRain(dt, rain) {
  const want = Math.floor(rain * 520);
  while (drops.length < want) drops.push(newDrop(true));
  if (drops.length > want) drops.length = want;
  const wind = 3 + G.gustGlow * 5;
  for (let k = 0; k < drops.length; k++) {
    const d = drops[k];
    d.z -= 26 * dt;
    d.x += wind * dt;
    if (d.z <= 0) {
      if (Math.abs(d.x) < ROOF_X && Math.abs(d.y) < ROOF_Y) splashes.push({ x: d.x, y: d.y, life: .12 });
      drops[k] = newDrop(false);       // ← 复用，不新建对象
    }
  }
  while (splashes.length && splashes[0].life <= 0) splashes.shift();
}
```

**雨滴数量随雨量线性缩放**（`rain * 520`）。
落地的直接重置到顶部复用 → **零垃圾分配**。

### 画法

```js
for (const d of drops) {
  for (let k = 0; k < 4; k++) {
    const p = project(d.x - wind*k*.3, d.y, d.z + k*.3), ix = p.sx|0, iy = p.sy|0;
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
    const i = iy*W+ix;
    if (p.d > zb[i]) pix[i] = color;      // ← 用深度判断，不写 zb
  }
}
```

**每滴雨画 4 个点**，沿风向反向偏移 `.3` → 倾斜的雨丝。
`p.d > zb[i]` 保证雨只在物体前面。

### 溅射

```js
const pale = rgb(212, 224, 244);
for (const s of splashes) {
  const p = project(s.x, s.y, 0), ix = p.sx|0, iy = p.sy|0;
  if (ix < 1 || iy < 0 || ix >= W-1 || iy >= H) continue;
  const i = iy*W+ix;
  if (zb[i] === groundZ[i]) { pix[i] = pale; pix[i-1] = pale; pix[i+1] = pale; }
}
```

**只溅在地面**（`zb[i] === groundZ[i]`）→ 屋顶上不溅。

### 坑

- 雨滴**不写 `zb`**。写了会污染深度缓冲，影响后续描边。
- 雨必须在 `shadeEdges()` **之后**画——雨不该有描边。
- 溅射要检查 `ix >= 1 && ix < W-1`，因为要写 `pix[i-1]` 和 `pix[i+1]`。

---

## 2. `cloud` 云

| 项 | 内容 |
|----|------|
| **来源** | `ref` `laundry:462-479` |
| **状态** | ✅ |

### 形态

屏幕空间的椭圆云，半透明，从两侧飘过。

### 参数组

| 参数 | 默认 | 区间 | 作用 |
|------|------|------|------|
| `count` | 26 | 10～50 | 云数量 |
| `r` | 8～17 | — | 半径 |
| `speed` | 3～6 | — | 飘移速度 |
| `color` | `CLOUD` `[150,148,170]` | — | 云色 |

### 关键算法

```js
for (const c of CLOUDS) {
  const show = clamp(storm*1.5 - c.from*.6, 0, 1);
  if (show <= 0) continue;
  const cx = 30 + ((c.x + windT*c.speed) % (W-60));
  const edge = clamp((Math.min(cx, W-cx) - 18)/34, 0, 1), alpha = show * edge;
  const rx = c.r*1.5, ry = c.r;
  for (let iy = ...; iy++) for (let ix = ...; ix++) {
    const dx = (ix-cx)/rx, dy = (iy-c.y)/ry, nn = dx*dx+dy*dy;
    if (nn > 1) continue;
    const i = iy*W+ix;
    if (zb[i] > -1e8 || bayerAt(ix,iy) > alpha*1.6*(1.15 - nn*.4)) continue;   // ← 关键
    const l = -.45*dx - .75*dy + .5*Math.sqrt(1-nn);
    pix[i] = ramp[clamp(Math.floor(l*3.2+1+(bayerAt(ix,iy)-.5)*.6), 0, 4)];
  }
}
```

### 三个关键技巧

| 技巧 | 说明 |
|------|------|
| `zb[i] > -1e8` 跳过 | 云只在**空白区域**出现，不会盖住场景 |
| `bayerAt(...) > alpha * ...` | **用 Bayer 阈值做透明**——像素级随机丢弃实现半透明 |
| `edge = clamp((min(cx, W-cx)-18)/34, 0, 1)` | 屏幕边缘的云淡出，避免硬切 |

**用 Bayer 矩阵做透明度**是这套引擎的独门技巧：
比逐像素 alpha 混合快，且保持像素风的颗粒感。

### 坑

- 云是**屏幕空间**的（不投影），因为它在场景之外。
- 云必须画在 `shadeEdges()` 之后。
- `windT` 必须是 8fps 步进的时间，云才有手绘感。

---

## 3. `bolt` 闪电

| 项 | 内容 |
|----|------|
| **来源** | `ref` `laundry:453-461, 481-496` |
| **状态** | ✅ |

### 形态

随机折线，三像素宽（中间亮黄，两侧暗紫）。

### 关键算法

```js
function strike() {
  G.flash = 1;
  const x0 = Math.random() < .5 ? 40 + Math.random()*50 : 270 + Math.random()*50;
  const points = [[x0, 44]];
  let x = x0, y = 44;
  while (y < 150) {
    x += (Math.random()-.5)*18;      // ← 随机横向抖动
    y += 8 + Math.random()*10;
    points.push([x, y]);
  }
  G.bolt = points;
}
```

**从左右两侧的随机位置起跳**，避免总在同一个地方。

### 画法

```js
for (let k = 0; k < G.bolt.length-1; k++) {
  const [ax,ay] = G.bolt[k], [bx,by] = G.bolt[k+1];
  const n = Math.ceil(Math.hypot(bx-ax, by-ay));
  for (let j = 0; j <= n; j++) {
    const sx = lerp(ax,bx,j/n)|0, sy = lerp(ay,by,j/n)|0;
    for (const [ox, c] of [[0, bright], [-1, core], [1, core]]) {
      const ix = sx+ox;
      if (ix < 0 || ix >= W || sy < 0 || sy >= H) continue;
      const i = sy*W+ix;
      if (zb[i] < -1e8) pix[i] = c;      // ← 只画在空白处
    }
  }
}
```

`zb[i] < -1e8` = 从没画过东西的像素 → 闪电在场景后面。

### 坑

- 闪电的 `flash` 值同时驱动全屏提亮（见下）。
- 闪电要在云**之后**画。

---

## 4. `grade-storm` 全局调色

| 项 | 内容 |
|----|------|
| **来源** | `ref` `laundry:516-541` |
| **状态** | ✅ **这是"天气感"的主要来源** |

### 形态

四个独立效果层叠加：去饱和偏蓝、云影流动、地面变湿、闪电闪光。

### 关键算法

```js
function gradeStorm(storm, windT) {
  if (storm <= 0 && G.flash <= 0) return;
  if (windT !== cloudStamp) {
    cloudStamp = windT;
    for (let cy = 0; cy < CELLS_H; cy++) for (let cx = 0; cx < CELLS_W; cx++) {
      cloudCells[cy*CELLS_W+cx] = noise(cx*.14 - windT*.22, cy*.2 + 3);
    }
  }
  const rm = 1-.46*storm, gm = 1-.36*storm, bm = 1-.2*storm;   // 去饱和
  const ra = 8*storm, ga = 12*storm, ba = 26*storm;              // 偏蓝
  const wet = G.wetness, flash = G.flash*.4, puddleAt = 1 - wet*.42;
  for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
    const i = iy*W+ix;
    if (zb[i] < -1e8) continue;                                 // 空白不调
    const c = pix[i];
    let r = (c&255)*rm + ra, g = (c>>8&255)*gm + ga, b = (c>>16&255)*bm + ba;
    // 云影
    if (cloudCells[(iy>>3)*CELLS_W + (ix>>3)] + bayerAt(ix,iy)*.22 > 1 - storm*.62) {
      r *= .76; g *= .76; b *= .82;
    }
    // 变湿
    if (wet > 0 && zb[i] === groundZ[i]) {
      const damp = 1 - wet*.24;
      r *= damp; g *= damp; b *= damp + wet*.05;
      if (puddle[i] > puddleAt) { r = lerp(r,92,.7); g = lerp(g,108,.7); b = lerp(b,140,.7); }
    }
    // 闪光
    if (flash > 0) { r = lerp(r,244,flash); g = lerp(g,244,flash); b = lerp(b,255,flash); }
    pix[i] = rgb(r, g, b);
  }
}
```

### 四个效果层

| 层 | 参数 | 效果 |
|----|------|------|
| 去饱和偏蓝 | `rm/gm/bm` + `ra/ga/ba` | 整体变冷变灰 |
| 云影 | `cloudCells` + Bayer | 大块明暗流动 |
| 变湿 | `wet` + `puddle[]` | 地面变暗变蓝 + 水洼 |
| 闪光 | `flash` | 整帧提亮 |

### 云影的分辨率技巧

```js
cloudCells[(iy>>3)*CELLS_W + (ix>>3)]     // 每 8×8 像素一格
```

**云影用 1/8 分辨率计算**，逐像素读取。8 倍加速，
且 8 像素的块状感正好读作"云影边界粗糙"。

```js
const CELLS_W = (W>>3)+1, CELLS_H = (H>>3)+1;    // 46 × 36
```

### 水洼（预先烘焙低频场）

```js
// 在 bake 里
puddle[i] = noise(g.x*.55 + 3, g.y*.8 + 7);
```

地面像素的低频噪声值存进 `puddle[]`。渲染时超过湿度阈值就往蓝灰 `lerp`。

**"预先烘焙低频场，渲染时按阈值取用"** 是通用套路。

### 坑

- `zb[i] < -1e8` 的空白像素**不能调色**，否则白背景会变成脏灰。
- 调色必须放在 `shadeEdges()` **之后**，否则描边的暖色 rim 会被调掉。
- 云影缓存要按 `windT` 失效（`if (windT !== cloudStamp)`），不能每帧重算。

---

## 5. 天气声音

```js
// 参考：laundry:615-633
const noiseBuffer = audio.createBuffer(1, audio.sampleRate*2, audio.sampleRate);
const data = noiseBuffer.getChannelData(0);
for (let i = 0; i < data.length; i++) data[i] = Math.random()*2-1;
const src = audio.createBufferSource(), filter = audio.createBiquadFilter();
src.buffer = noiseBuffer; src.loop = true;
filter.type = 'highpass'; filter.frequency.value = 1500;
rainGain = audio.createGain(); rainGain.gain.value = 0;
src.connect(filter).connect(rainGain).connect(audio.destination);
src.start();
// 每帧：
rainGain.gain.setTargetAtTime(muted ? 0 : rain*.05*over, audio.currentTime, .3);
```

**白噪声 + 高通滤波 = 雨声**。

| 要素 | 作用 |
|------|------|
| `highpass` 1500Hz | 滤掉低频，让雨声"细" |
| `setTargetAtTime` | 平滑音量变化，避免爆音 |
| `over` | 游戏结束时降到 .45（"你赢了，可以从干燥的一侧看"） |

其他音效用带通/低通噪声脉冲：

```js
// 参考：laundry:635-650
function burst(type, freq, volume, length, delay = 0) {
  const src = audio.createBufferSource(), filter = audio.createBiquadFilter(), gain = audio.createGain();
  src.buffer = noiseBuffer;
  filter.type = type; filter.frequency.value = freq; filter.Q.value = .7;
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(.0005, now + length);
  src.connect(filter).connect(gain).connect(audio.destination);
  src.start(now, Math.random(), length + .02);
}
```

| 音效 | type | freq | 场景 |
|------|------|------|------|
| pop | bandpass | 1400 | 抓取衣物 |
| drop | lowpass | 500 | 衣物入篮 |
| gust | bandpass | 620 | 阵风 |
| thunder | lowpass | 200/90 | 雷声（两层） |

---

## 6. 天气时间线

参考项目的天气是一个**随时间推进的阶段机**：

```js
// 参考：laundry:50
const STORM_FROM = 10, STORM_TO = 28, RAIN_FROM = 28, RAIN_TO = 36, GAME_LENGTH = 48;
// 参考：laundry:83-84
const stormLevel = () => ease(clamp((G.t - STORM_FROM)/(STORM_TO - STORM_FROM), 0, 1));
const rainLevel = () => clamp((G.t - RAIN_FROM)/(RAIN_TO - RAIN_FROM), 0, 1);
```

```
0s ───── 10s ───── 28s ───── 36s ─── 48s
  晴     起风     下雨     倾盆    结束
```

**两个独立的进度曲线**（storm / rain），各自 ease 过渡。
这个模式可以直接套用到任何"天气渐变"场景。

---

## 7. 移植清单

| 优先级 | 项 | 说明 |
|--------|----|------|
| 高 | `grade-storm` 全局调色 | **天气感的 80% 来自这里**。参数可简化成"去饱和 + 偏蓝"两行 |
| 中 | `rain` 粒子 | 4 点雨丝，零分配池 |
| 中 | 云影（1/8 分辨率缓存） | 低成本的大气效果 |
| 中 | `puddle[]` 低频场预烘焙 | 水洼效果 |
| 低 | `cloud` 粒子 | Bayer 阈值透明 |
| 低 | `bolt` 闪电 | 折线 + 三像素 |
| 低 | 雨声 | 白噪声 + 高通 |

**通用坑**

1. 全屏调色要跳过 `zb[i] < -1e8` 的空白像素。
2. 调色放在 `shadeEdges()` 之后。
3. 粒子层要画在 `shadeEdges()` 之后（不参与描边）。
4. 粒子不写 `zb`。
5. 天气曲线用 `ease(clamp(...))`，不要线性。
6. 云影/低频场要按时间步进缓存，不能每帧重算。
