# 水与地表细节

> 注册表：[registry.md §3](registry.md)
> 覆盖：树叶缓存机制（风动基础设施）· 岩石 · 水面流光 · 涟漪 · 水花 · 落叶
> 相关：[trees.md](trees.md) 树变体 · [plants.md](plants.md) 花草变体 · [weather.md](weather.md) 天气

> **本篇定位**：树和花草已拆到独立篇目。本篇留下**跨变体复用的机制**和**地表/水面**部分。

---

## 0. 三条通用机制

| 机制 | 用途 | 参考 |
|------|------|------|
| **capture 像素缓存** | 树叶等物体"生成一次、每帧平移" | `engine.js:62` |
| **staticShadow 联动** | 影子里的东西自动变暗 | `engine.js:158` |
| **低频场预烘焙** | 水洼、苔藓等按阈值取用 | `laundry:188` |

前两条是**引擎级设施**，所有动态元素都受益；第三条是地面材质的通用套路。

---

## 1. 机制 A：capture 像素缓存

### 1.1 为什么需要

| 不缓存 | 缓存 |
|--------|------|
| 每帧重画 420 个球 × N 棵树 | 每帧只搬运像素 |
| 每帧 N×球数×覆盖面积 次光照计算 | 每帧 N×像素数 次拷贝 |

**光照只算一次**，之后只做"平移 + 深度测试 + 写像素"。

420 球 × 5 树 = 2100 个球。每帧算光照 vs 每帧搬 4 万像素，差一个数量级。

### 1.2 实现

```js
// 参考：engine.js:62
let capture = null; // when set, sphere() records pixels instead of drawing them
// 参考：engine.js:76-79（sphere 内部）
if (capture) {
  capture.push(ix, iy, d, ramp[clamp(Math.floor(l*4.4 + .2 + (bayerAt(ix,iy)-.5)*.7), 0, 4)]);
  continue;
}
```

每个像素记录 **4 个数**：`x, y, 深度, 颜色`。扁平数组，不是对象数组。

### 1.3 存储与回放

```js
// 参考：engine.js:242-245（存）
capture = [];
sphere(x + rx*scale, y + ry*scale, rz*scale, r, leaf, 'rough');
leaves.push({ x: ..., y: ..., z: ..., k, r: .42*scale, pixels: capture });
capture = null;

// 参考：engine.js:185-201（放）
function drawLeaves(t) {
  for (const leaf of leaves) {
    const reach = clamp((leaf.z - 2.5) / 3, .3, 1);        // 越高摆得越大
    const swayX = (Math.sin(t*.9 + leaf.x*.5 + leaf.z*.7) + .55*Math.sin(t*2.3 + leaf.k*1.7)) * reach;
    const dx = Math.round(swayX * .9), dy = Math.round(Math.sin(t*1.3 + leaf.y + leaf.k) * reach * .45);
    const px = leaf.pixels;
    for (let n = 0; n < px.length; n += 4) {
      const ix = px[n] + dx, iy = px[n+1] + dy;
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
      const i = iy * W + ix;
      if (px[n+2] <= zb[i]) continue;                        // 深度测试
      zb[i] = px[n+2];
      pix[i] = px[n+3];
    }
    if (leaf.k % 2 === 0) castShadow(leaf.x + swayX*.12, leaf.y, leaf.z, leaf.r);
  }
}
```

### 1.4 风的三个频率

```js
const swayX = (Math.sin(t*.9 + leaf.x*.5 + leaf.z*.7) + .55*Math.sin(t*2.3 + leaf.k*1.7)) * reach;
```

| 频率 | 幅度 | 效果 |
|------|------|------|
| `.9` 主频 | 1.0 | 大幅缓慢摇摆 |
| `2.3` 次频 | .55 | 小幅高频抖动 |
| 每叶相位 | `leaf.x*.5 + leaf.z*.7` / `leaf.k*1.7` | 每片不同步 |

**两个正弦叠加** = 主摆 + 微颤，比单一正弦自然。

### 1.5 摆幅随高度递增

```js
const reach = clamp((leaf.z - 2.5) / 3, .3, 1);
```

树冠底部摆幅 0.3，树顶 1.0。**根部几乎不动，越高摆得越厉害**——真实树木的物理。

### 1.6 整像素对齐

```js
const dx = Math.round(swayX * .9), dy = Math.round(...);
```

**必须取整**。亚像素偏移在像素画布上会糊成半透明。

### 1.7 叶子也投影

```js
if (leaf.k % 2 === 0) castShadow(leaf.x + swayX*.12, leaf.y, leaf.z, leaf.r);
```

每隔一个叶子投一次影（**减半是为了性能**）。影子也随风偏移，但偏移量更小
（`swayX*.12`，影子投在更远的地方）。

### 1.8 坑

- **`capture` 是模块级可变状态**，不能嵌套。模式固定为：设 `[]` → 画 → 置 `null` → push。
- **`leaves` 数组只增不减**。动态生成/销毁树时必须自己回收，否则每帧开销无限增长。
- 位移必须 `Math.round`。
- 树的 `drawTree` 若每帧重绘（像 `plane`），就不需要 capture——只有**烘焙一次的风动物体**才需要。

---

## 2. 机制 B：staticShadow 联动

### 2.1 定义

```js
// 参考：engine.js:158
const staticShadow = new Uint8Array(W * H);
```

### 2.2 写入时机

```js
// 参考：balote:153（bake 内，所有物体画完、applyShadows 之前）
staticShadow.set(shadowMask);
applyShadows(groundZ);
```

`staticShadow` 是**烘焙时刻的阴影分布**。

### 2.3 三处消费

| 消费方 | 用途 | 参考 |
|--------|------|------|
| `drawTufts` | 影子里的草变暗 | `engine.js:175` |
| `drawWater` | 影子里的水变暗 | `stari-most:526` |
| `drawLeaves`（间接） | 叶子投影位置 | — |

```js
// 参考：engine.js:175
const colors = staticShadow[tuft.i] ? tuftDark : tuftLit;
// 参考：stari-most:526
pix[i] = staticShadow[i] ? dim : s.bright ? lit : soft;
```

### 2.4 为什么这个机制值钱

**阴影信息免费复用到所有地面元素**。

有了它：草在影子里自动变暗、水在影子里自动变暗、落叶可以按影子调色……
全部是**一行条件判断**。

没有它，每个元素都要自己判断"我是否在影子里"，而影子是逐帧的静态信息——
判断起来既慢又容易写错。

### 2.5 坑

- **`staticShadow.set(shadowMask)` 必须在 `applyShadows()` 之前**，因为 `applyShadows` 会清空 `shadowMask`。
- `drawTufts` / `drawWater` 必须在 `applyShadows()` **之前**调用——它们要读 `staticShadow`。
- 这是 demo 最该补的一块：`demo/engine.js` 完全没有这个数组。

---

## 3. 机制 C：低频场预烘焙

### 3.1 模式

在 `bake()` 里把一个低频噪声场存进数组，渲染时按阈值取用。

```js
// 参考：laundry:188
puddle[i] = noise(g.x * .55 + 3, g.y * .8 + 7);
```

渲染时：

```js
// 参考：laundry:536
if (puddle[i] > puddleAt) { r = lerp(r,92,.7); g = lerp(g,108,.7); b = lerp(b,140,.7); }
```

`puddleAt` 随湿度变化 → **湿度越高，水洼越多**。

### 3.2 适用场景

| 场景 | 场 | 阈值含义 |
|------|----|----------|
| 水洼 | `noise(x*.55, y*.8)` | 湿度 |
| 苔藓 | `noise(x*.5, y*.5) > .7` | 湿度 |
| 沙洲 | `noise(...)` | 潮位 |
| 积雪 | `noise(...)` | 温度 |

### 3.3 为什么值得单独做

低频场**每像素只算一次**（烘焙时），之后每帧只是查表 + 比较。
如果每帧现算 10 万次 `noise()`，开销和视觉收益完全不成比例。

---

## 4. 岩石

| 项 | 内容 |
|----|------|
| **来源** | `ref` `stari-most:221-231` |
| **注册表** | 归入 [plants.md §…](plants.md)（地表物件） |

### 形态

半埋在河滩的石灰岩块。

### 关键算法

```js
const rocks = [];
for (let k = 0; k < 44; k++) {
  const y = -9.6 + 19.2 * hash(k, 21), side = k % 2 ? 1 : -1, r = .35 + hash(k, 22) * .7;
  rocks.push([side * (riverHalf(y) + (hash(k, 23) - .3) * 1.2), y, r]);
}
for (const [x, y, r] of rocks) {
  if (Math.abs(y) < 1.8) continue;                    // 河道中央不放
  sphere(x, y, r * .28, r, STONE, 'rough');
  castShadow(x, y, r * .6, r * .9);
}
```

### 四个关键点

| 点 | 说明 |
|----|------|
| `sphere(x, y, r*.28, r, ...)` | **球心下沉到 r*.28** → 石头嵌进地里 |
| `castShadow(x, y, r*.6, r*.9)` | 影子半径比石头大 10% |
| `k % 2 ? 1 : -1` | 左右交替分布 |
| `hash(k,23) - .3` | 位置抖动（负数让石头更靠河心） |

**"球心下沉"是画半埋物体的通用技巧**——土堆、石头、露出地面的地基都适用。

### 坑

- 石头用 `'rough'` 模式（有噪声 → 表面粗糙）。用 `'solid'` 会像塑料球。
- 石头半径别小于 .3，否则在 360×280 上只有几个像素，看不出是石头。

---

## 5. 水面

### 5.1 河道边界

```js
// 参考：stari-most:74
const riverHalf = y => 6 + (noise(y*.25 + 9, 3) - .5) * 1.2;
```

**河道半宽随 y 变化**（河是弯的）。地面着色时按 `|x| < riverHalf(y)` 判断是否在水里。

### 5.2 水面流光

```js
// 参考：stari-most:513-528
const STREAKS = [];
for (let k = 0; k < 340; k++) {
  STREAKS.push({
    x: (hash(k,31)-.5)*11, y0: hash(k,32)*21,
    speed: .9 + hash(k,33)*1.1, len: 2 + (hash(k,34)*3|0),
    bright: hash(k,35) > .72,
  });
}
function drawWater(t) {
  const lit = rgb(150,208,180), soft = rgb(104,180,158), dim = rgb(58,112,120);
  for (const s of STREAKS) {
    const y = ((s.y0 + t*s.speed) % 21) - 10.5;         // ← 循环滚动
    for (let k = 0; k < s.len; k++) {
      const p = project(s.x + Math.sin(y*.4 + s.y0)*.3, y + k*.11, 0), ix = p.sx|0, iy = p.sy|0;
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
      const i = iy*W+ix;
      if (kinds[i] !== KIND_WATER || zb[i] !== groundZ[i]) continue;   // ← 只画在水上
      pix[i] = staticShadow[i] ? dim : s.bright ? lit : soft;
    }
  }
}
```

### 5.3 四个要点

| 点 | 说明 |
|----|------|
| `% 21 - 10.5` | 流光在 [-10.5, 10.5] 循环滚动 |
| `Math.sin(y*.4 + s.y0)*.3` | 流光左右摆动，像波纹 |
| `staticShadow[i] ? dim` | **影子里的水变暗**（机制 B） |
| `kinds[i] !== KIND_WATER` | 只画在河道，不画在沙滩 |

### 5.4 水色三档

```js
const lit = rgb(150,208,180), soft = rgb(104,180,158), dim = rgb(58,112,120);
```

**亮 / 中 / 暗**。`bright` 属性（28% 概率）决定用亮色还是中色，暗色留给阴影区。

### 5.5 坑

- 水面流光**直接写 `pix` 不写 `zb`**——它是地面上的花纹，不是立体物。
- 必须检查 `zb[i] === groundZ[i]`，否则会画到岸上。

---

## 6. 涟漪

```js
// 参考：stari-most:530-541
function drawRings() {
  const color = rgb(226, 240, 226);
  for (const r of splash.rings) {
    const n = Math.max(10, Math.ceil(r.r * 22));
    for (let k = 0; k < n; k++) {
      if (hash(k, r.r*40|0) > r.life) continue;          // ← 按 life 随机剔除
      const a = k/n*6.283;
      const p = project(r.x + Math.cos(a)*r.r, r.y + Math.sin(a)*r.r, 0), ix = p.sx|0, iy = p.sy|0;
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
      const i = iy*W+ix;
      if (kinds[i] === KIND_WATER && zb[i] === groundZ[i]) pix[i] = color;
    }
  }
}
```

### 关键

**涟漪用虚线**：按 `hash` 随机剔除部分点，`r.life` 越小剔除越多 → 环逐渐消散。

`r.r * 22` 决定环上点数——环越大点越密。

`Math.max(10, ...)` 保证小环也有足够的点。

### 坑

- `hash(k, r.r*40|0)` 的第二参数依赖环的半径 → **同一环上每点的判定种子不同**，
  否则会整段整段地消失，而不是均匀消散。
- 涟漪必须在 `shadeEdges()` 之后画。

---

## 7. 水花

```js
// 参考：stari-most:543-550
function drawDrops() {
  const color = rgb(244, 250, 244);
  for (const d of splash.drops) {
    const p = project(d.x, d.y, d.z), ix = p.sx|0, iy = p.sy|0;
    if (ix >= 0 && iy >= 0 && ix < W && iy < H) pix[iy*W+ix] = color;
  }
}
```

**直接写像素，不写 `zb`**，且画在 `shadeEdges()` **之后**——所以水花不会被描边。

### 水花的生成

```js
// 参考：stari-most:402-408
const count = Math.round(8 + (1 - quality) * 90);
for (let k = 0; k < count; k++) {
  const a = Math.random()*6.283, reach = Math.random()*(.5 + (1-quality)*2.6);
  const lift = 2 + Math.random()*(quality > .88 ? 8 : 5);
  splash.drops.push({ x: G.x + Math.cos(a)*reach*.3, y: G.y + Math.sin(a)*reach*.3,
                       z: .1, vx: Math.cos(a)*reach, vy: Math.sin(a)*reach, vz: lift });
}
```

**入水质量越差，水花越多**（`8 + (1-quality)*90`）。
质量好时只有 8 滴且飞得高（`lift` 到 10），质量差时 90+ 滴但飞得矮。

**用物理表现"评价"** 是很有效的叙事手法。

### 水花的物理

```js
for (const d of splash.drops) {
  d.vz -= GRAVITY * dt;
  d.x += d.vx*dt; d.y += d.vy*dt; d.z += d.vz*dt;
}
splash.drops = splash.drops.filter(d => d.z > 0);       // 出水即消失
```

---

## 8. 落叶飘落

| 项 | 内容 |
|----|------|
| **来源** | `demo` `autumn.js:315`（`motes` + `resetMote` + `gustAt` + `swayAt`） |
| **状态** | ✅ **超出参考项目的能力** |

参考项目只有树叶原地摆动，**没有落叶飘落**。demo 这一项是自己加的。

### 三个手法

**① 阵风包络**

```js
function gustAt(t) {
  const v = Math.sin(t*.41 + .7)*.5 + Math.sin(t*.67 + 2.3)*.3 + Math.sin(t*.23 + 4.1)*.2;
  return Math.max(0, v - .28) / .72;
}
```

**三个不同频率的正弦叠加** → 阵风是"一阵一阵"的，不是恒定风。
`.28` 是阈值，低于它风为 0。

**② 单树摆动**

```js
function swayAt(t, ph, gust) {
  const base = Math.sin(t*2.9 + ph)*.6 + Math.sin(t*5.1 + ph*2.1)*.4;
  return base * (.09 + gust*.38);
}
```

**基础摆动 × 阵风增益**。阵风来时摆幅放大 4 倍。

**③ 12fps 步进**

```js
const FPS = 12;
let lastStep = -1;
// draw(t) 时：const step = Math.floor(t * FPS); if (step === lastStep) return; lastStep = step;
```

12fps 比参考项目的 8fps 快一档——落叶比树叶需要更快的节奏。

### 坑

- 落叶对象要**复用**（`resetMote`），不要每帧新建。
- 落叶要在 `shadeEdges()` 之后画。

---

## 9. 机制速查

| 机制 | 一句话 | 依赖 | 参考 |
|------|--------|------|------|
| capture 缓存 | 生成一次，每帧平移 | `capture` 全局 + `leaves[]` | `engine.js:62` |
| staticShadow | 影子信息免费复用到所有地面元素 | `staticShadow` 数组 | `engine.js:158` |
| 低频场预烘焙 | 每像素只算一次，之后查表 | `puddle[]` 等 | `laundry:188` |
| 球心下沉 | 画半埋物体 | — | `stari-most:229` |
| 随机剔除 | 虚线 / 消散效果 | `hash(k, seed)` | `stari-most:535` |
| 步进时间 | 手绘感的关键 | `WIND_FPS` / `FPS` | `engine.js:155` |

---

## 10. 移植清单

| 优先级 | 项 | 说明 |
|--------|----|------|
| 高 | `staticShadow` 数组 + 写入时机 | demo `engine.js` 完全没有。草/水/树的"影内变暗"全靠它 |
| 高 | capture 缓存机制 | demo 的树全是静态的。风动是"活起来"的最大杠杆 |
| 中 | 球的 "双频正弦" 风 | 主摆 + 微颤，比单一正弦自然 |
| 中 | 摆幅随高度递增 | 根部不动、梢部摆 |
| 中 | 低频场预烘焙 | 水洼/苔藓/沙洲通用 |
| 低 | 岩石（球心下沉） | 极低成本增加自然感 |
| 低 | 水面流光 / 涟漪 / 水花 | 需要水面的场景 |
| 低 | 落叶飘落 | demo 已有 |

**通用坑**

1. `capture` 不能嵌套使用。
2. `leaves` 只增不减，动态树要回收。
3. 位移必须 `Math.round`。
4. `staticShadow.set(shadowMask)` 必须在 `applyShadows()` 之前。
5. `drawTufts` / `drawWater` 必须在 `applyShadows()` 之前。
6. 水花/涟漪/落叶要在 `shadeEdges()` 之后画。
