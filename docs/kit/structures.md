# 线性与曲面构件

> 注册表：[registry.md §2](registry.md)
> 覆盖：砖石砌体（材质算法）· 体积阴影 · 拱桥曲面 · 铁丝围栏 · 球网 · 梯子 · 曲面坡道
> 相关：[buildings.md](buildings.md) 建筑变体配方卡

> **本篇定位**：`buildings.md` 按**变体**组织（每种建筑一张卡）。
> 本篇按**机制**组织——讲那些"可以被多种建筑复用"的底层算法和线性/曲面构件。
> 两者内容不重复：`masonry` 算法细节在本文，房屋/塔/屋顶的用法在 buildings.md。

---

## 0. 判断：一段代码该放哪篇

| 问自己 | 放哪 |
|--------|------|
| 它是"一种东西"（有独立的形态和参数）？ | `buildings.md` 配方卡 |
| 它是"一种算法"（被多种东西复用）？ | 本文 |
| 它是线性/曲面结构（跨场景复用）？ | 本文 |

例：
- `masonry()` 是**算法**（墙、塔、拱券、山墙都用）→ 本文
- `house()` 是**一种东西**（有独立参数组）→ buildings.md
- `fence()` 是线性构件（球场、场地边界都用）→ 本文

---

## 1. 材质算法：`masonry()` 砖石砌体

这是参考项目最重要的材质函数。**所有砖石建筑都建立在它之上。**

```js
// 参考：stari-most:100-105
function masonry(a, z, base, c = STONE) {
  const fz = z * 1.6, course = Math.floor(fz);       // 层高 1/1.6 世界单位
  const fa = a * 1.2 + (course % 2) * .5;            // 错缝：偶数层右移半块
  const block = Math.floor(fa);
  const mortar = fz - course < .14 || fa - block < .1; // 灰缝
  const tone = hash(block, course);                   // 每块砖的固有色
  return rampOf(c)[clamp(base + (tone > .75 ? 1 : tone < .2 ? -1 : 0) - (mortar ? 1 : 0), 0, 4)];
}
```

### 1.1 参数解释

| 参数 | 含义 | 调整效果 |
|------|------|----------|
| `a` | 沿墙面的水平位置 | — |
| `z` | 高度 | — |
| `base` | 基准亮度档（0–4） | 前面墙用 3，侧墙用 2 |
| `c` | 基础色 | — |

| 内部常量 | 含义 | 调整效果 |
|-----------|------|----------|
| `z * 1.6` | 每层砖的高度 | 越大砖越薄 |
| `a * 1.2` | 每块砖的宽度 | 越大砖越窄 |
| `(course % 2) * .5` | 错缝偏移 | 改成 0 → 对齐方格（像瓷砖） |
| `.14` / `.1` | 灰缝宽度 | 越大缝越粗 |
| `.75` / `.2` | 每块砖的明暗随机阈值 | 控制砖块之间的色差幅度 |

### 1.2 错缝是砌体的灵魂

`(course % 2) * .5` 让**偶数层右移半块**。少了这一行，墙会变成对齐的方格，像瓷砖；有了它，才有砖墙的样子。

### 1.3 变体：抹灰墙 + 剥落

```js
// 参考：laundry:98-106
function wallColor(a, z, base) {
  const fz = (z + 40) * 1.6, course = Math.floor(fz);
  const fa = a * 1.2 + (course % 2) * .5, block = Math.floor(fa);
  // plaster with patches fallen away to the stone behind
  if (noise(a * .4, z * .5 + 4) > .68) {
    const mortar = fz - course < .14 || fa - block < .1;
    return rampOf(STONE)[clamp(base - (mortar ? 1 : 0) + (hash(block, course) > .7 ? 1 : 0), 0, 4)];
  }
  return rampOf(PLASTER)[clamp(base + (hash(a * 9 | 0, z * 9 | 0) > .9 ? -1 : 0), 0, 4)];
}
```

低频噪声 `noise(a*.4, z*.5+4) > .68` 选出"剥落区"，区内改用石料色 + 灰缝。
**这是让墙面不平整、显旧的关键技巧**，比单纯加噪点有效得多。

### 1.4 木纹墙（demo 需要时）

要保留"木头"感而不做砖石，按 `a` 方向加竖条纹：

```js
const woodWall = (a, z, base) =>
  rampOf(WOOD)[clamp(base + (Math.floor(a * 3) % 2 ? -1 : 0) - (Math.floor(a*3) % 7 === 0 ? 1 : 0), 0, 4)];
```

`Math.floor(a*3) % 2` → 竖向木板拼缝；`% 7 === 0` → 偶尔一条深色缝。

### 1.5 坑

- **返回的是已量化的颜色**（`rampOf(c)[index]`），调用方不要再叠色阶。
- `hash(block, course)` 用两个整数坐标 → 同一块砖在所有帧、所有视角一致。
- 高塔上砖会显得太小，改用 `z * 2.2` 换更高的砖。

---

## 2. 体积阴影

### 2.1 原理

**在物体体积内三维采样打点，每点投一个地面椭圆** → 得到有厚度、有梯度的影子。

```js
// 参考：stari-most:205-207
function shadowBox(x0, y0, x1, y1, z1) {
  for (let x = x0; x <= x1; x += .5)
    for (let y = y0; y <= y1; y += .5)
      for (let z = .3; z <= z1; z += .7)
        castShadow(x, y, z, .55);
}
```

### 2.2 采样步长

| 物体 | 步长 | 参考 |
|------|------|------|
| 房子 | .5 × .5 × .7 | `stari-most:206` |
| 桥 | .3 × .6 × .45 | `stari-most:247` |
| 长椅 | .3（单行） | `balote:145` |
| 楼梯间 | .5 × .5 × .6 | `laundry:176` |
| 烟囱 | 单行 z | `laundry:177` |

**步长越小影子越密（也越慢）**。z 方向步长通常最大——影子的纵向渐变不需要很细。

### 2.3 坑

- 体积阴影**必须在 `bakeOcclusion()` 之前**调用——AO 要在阴影之上。
- 单点投影（`castShadow(x, y, z, r)` 调一次）看起来像"贴纸"，不像有体积的物体。

---

## 3. 拱桥曲面

`stari-most` 的桥是参考项目里唯一的**双曲率建筑**，思路可迁移到拱门、涵洞、穹顶。

### 3.1 几何定义

```js
// 参考：stari-most:58-59, 69-73
const ARCH_A = 7.2, ARCH_C = 1.2, ARCH_R = ARCH_A + ARCH_C, ARCH_BASE = 2.2;
const DECK_END = 8.4, DECK_LOW = 6.9, DECK_TOP = 11.2, DECK_REACH = 10.2, HALF_W = 1.15;

const archZ = x => ARCH_BASE + Math.sqrt(Math.max(0, ARCH_R**2 - (Math.abs(x) + ARCH_C)**2));
const deckZ = x => {
  const a = Math.abs(x);
  return a >= DECK_END ? DECK_LOW : DECK_TOP - (DECK_TOP - DECK_LOW) * (a / DECK_END)**1.6;
};
```

**尖拱**：由两个圆弧拼成，弦高 `ARCH_C = 1.2`，半径 `ARCH_R = ARCH_A + ARCH_C`。
`(|x| + ARCH_C)` 是把两个圆弧镜像拼合的关键。

**桥面是幂函数曲线**（指数 1.6）：从中央 `DECK_TOP` 降到两端 `DECK_LOW`。
指数 < 2 → 中央平缓、两端陡。

### 3.2 拱圈（券石）扫掠

```js
// 参考：stari-most:109-116
const crownAngle = Math.acos(ARCH_C / ARCH_R);
for (let t = 0; t <= crownAngle; t += .002) {
  const a = ARCH_R * Math.cos(t) - ARCH_C, z = ARCH_BASE + ARCH_R * Math.sin(t);
  for (let y = -HALF_W; y <= HALF_W; y += step) {
    plot(-a, y, z, masonry(y + t*4, t*8, 2));
    plot(a, y, z, masonry(y + t*4, t*8, 1));
  }
}
```

沿圆弧参数化扫掠。`masonry` 的两个参数用 `y + t*4` 和 `t*8` 制造**弧线方向的砌缝**。

**内外弧用不同 `base`**（2 和 1）→ 拱圈有厚度感。

### 3.3 券石亮环（视觉焦点）

```js
// 参考：stari-most:129-131
const radial = Math.hypot(a + ARCH_C, z - ARCH_BASE);
if (z > top - .24 && z < top - .1) {
  plot(x, HALF_W, z, rampOf(STONE)[4]);                    // 栏杆下的束带层
} else if (z > ARCH_BASE && radial < ARCH_R + .62) {
  const joint = (Math.atan2(z - ARCH_BASE, a + ARCH_C) * 26) % 1;
  plot(x, HALF_W, z, rampOf(STONE)[joint < .16 ? 2 : 4]);   // 浅色券石环
}
```

**用极角而不是 x 来分缝**，券石才会沿弧线排列。
`Math.atan2(...) * 26 % 1` 把圆环切成 26 块，每块之间一道暗缝。

这是"曲线表面分块"的通用算法——**拱门、穹顶、涵洞都用它**。

### 3.4 桥面防滑肋

```js
// 参考：stari-most:137-140
for (let y = -HALF_W; y <= HALF_W; y += step) {
  plot(x, y, top, rampOf(STONE)[Math.floor(x * 2.6) % 2 === 0 ? 3 : 4]);
}
```

沿 x 方向交替两档色 = 横向防滑条。

### 3.5 栏杆（画三层）

```js
// 参考：stari-most:141-146
for (const side of [-1, 1]) {
  for (let z = top; z <= top + PARAPET; z += step) {
    plot(x, side * HALF_W, z, masonry(x, z, 3));           // 外侧
    plot(x, side * (HALF_W - .2), z, masonry(x, z, 2));    // 内侧
  }
  for (let w = HALF_W - .2; w <= HALF_W; w += step) plot(x, side * w, top + PARAPET, rampOf(STONE)[4]);  // 压顶
}
```

**栏杆画外侧面 + 内侧面 + 顶面压顶** → 有体积，不是一张纸。

### 3.6 坑

- `plot()` 步长要小（`.04`）——曲面采样点稀疏会出现明显条纹。
- 拱的阴影要体积采样（步长 .3 × .6 × .45），不是单点。

---

## 4. 线性构件

### 4.1 `wire-fence` 铁丝围栏

```js
// 参考：tie-break:108-123
function fence(x0, y0, x1, y1) {
  const wire = rgb(116, 122, 116), steel = [92, 96, 94];
  const len = Math.hypot(x1 - x0, y1 - y0);
  for (let a = 0; a <= len; a += .035) for (let z = 0; z <= FENCE_Z; z += .035) {
    const f = (a + z) * 1.5, g = (a - z) * 1.5;
    if (f - Math.floor(f) > .11 && g - Math.floor(g) > .11) continue;   // 菱形网眼
    const t = a / len;
    plot(lerp(x0, x1, t), lerp(y0, y1, t), z, wire);
  }
  for (let a = 0; a <= len + .01; a += 4) {              // 立柱
    const t = a / len, x = lerp(x0, x1, t), y = lerp(y0, y1, t);
    box(x - .07, y - .07, 0, x + .07, y + .07, FENCE_Z, steel, a | 0);
    castShadow(x, y, 1.2, .1);
  }
  capsule([x0, y0, FENCE_Z], [x1, y1, FENCE_Z], .05, .05, () => steel, 'solid');  // 顶杆
}
```

### 菱形网眼的关键

```js
const f = (a + z) * 1.5, g = (a - z) * 1.5;
if (f - Math.floor(f) > .11 && g - Math.floor(g) > .11) continue;
```

用两组**斜向**周期网格求交，只在同时落在两条线上时画点 → **菱形**。
正交的 `a`/`z` 会得到挤压的矩形网（透视下间距不均）。

| 调参 | 作用 |
|------|------|
| `* 1.5` | 网格密度（越大越密） |
| `.11` | 线宽占比（越大线越粗） |

**围栏用 `&&`（与），球网用 `||`（或）。别搞反。**

### 4.2 `net` 球网

```js
// 参考：tie-break:142-149
const netWire = rgb(58, 60, 62), tape = rgb(248, 244, 232);
for (let y = -NET_Y; y <= NET_Y; y += .03) for (let z = .02; z <= NET_Z; z += .03) {
  const top = z > NET_Z - .13, f = y * 2.8, g = z * 3.4;
  if (top) plot(0, y, z, tape);
  else if (f - Math.floor(f) < .2 || g - Math.floor(g) < .24) plot(0, y, z, netWire);
}
for (const y of [-NET_Y, NET_Y]) box(-.08, y-.08, 0, .08, y+.08, NET_Z+.1, [44,58,54], y|0);
for (let y = -NET_Y; y <= NET_Y; y += .15) castShadow(0, y, .75, .09, 1, .5);
```

**网眼用 `||`** → 方格。顶部 13cm 是**白色包边**（`tape`），既是真实球网的标志，也让球在网前可见。

### 4.3 `wood-fence` 木板围栏

```js
// 参考：balote:127-132
for (let x = -COURT_X - BOARD; x < COURT_X + BOARD; x += 3) {
  const w = (x / 3 | 0) % 2 ? wood : woodLight;
  box(x, -COURT_Y - BOARD, 0, Math.min(x+3, COURT_X+BOARD), -COURT_Y, BOARD, w, x | 0);
  box(x, COURT_Y, 0, Math.min(x+3, COURT_X+BOARD), COURT_Y+BOARD, BOARD, w, x+40|0);
}
```

**交替色是关键**——单色的一排 `box()` 看不出是板条。
`seed` 用 `x | 0`（每条不同）避免木纹重复。

### 4.4 `stairs` 梯子

```js
// 参考：mini-ramp:183-185
for (const off of [-.5, .5]) capsule(world(-8.6+off, RAMP_W+.22, 0), world(-8.6+off, RAMP_W+.22, RADIUS+.5), .06, .06, () => [86,88,90], 'solid');
for (let z = .6; z < RADIUS; z += .75) capsule(world(-9.1, RAMP_W+.22, z), world(-8.1, RAMP_W+.22, z), .05, .05, () => [86,88,90], 'solid');
```

两根侧杆 + N 根横档。横档间距 `.75`。

### 4.5 `awning` 天线

```js
// 参考：laundry:147-148
for (let z = 0; z <= 5; z += step) plot(6.8, -6.3, z, rampOf(DARK)[2]);
for (const [z, w] of [[4.8,.7],[4.4,1],[4,1.3]])
  for (let a = -w; a <= w; a += step) plot(6.8+a, -6.3-a*.3, z, rampOf(DARK)[2]);
```

三根横杆，长度递增（`.7 → 1 → 1.3`），且**随 a 偏移 y**（`-a*.3`）——
做出"横杆在三维中倾斜"的效果。

### 4.6 晾衣绳（抛物线垂弧）

```js
// 参考：laundry:82, 166
const lineZ = x => LINE_Z - .22 * (1 - (x / POLE_X) ** 2);
for (let x = -POLE_X; x <= POLE_X; x += .04) plot(x, y, lineZ(x), rampOf(ROPE)[3]);
```

两端固定在 `LINE_Z`，中间下垂 `.22`。**抛物线垂弧**是所有绳索/电线/藤蔓的通用曲线。

---

## 5. 曲面构件

### 5.1 `ramp` U 型池

```js
// 参考：mini-ramp:69-84
function pointOnRamp(s) {
  const n = Math.abs(s), sign = s < 0 ? -1 : 1;
  if (n <= FLAT) return { a: s, z: 0, th: 0 };
  if (n >= LIP_S) return { a: sign*LIP_A + (s - sign*LIP_S), z: RADIUS, th: 0 };
  const t = (n - FLAT) / RADIUS;
  return { a: sign*(FLAT + RADIUS*Math.sin(t)), z: RADIUS*(1 - Math.cos(t)), th: sign*t };
}
function surfaceAt(a, w) {
  if (Math.abs(w) > RAMP_W) return 0;
  const n = Math.abs(a);
  if (n <= FLAT) return 0;
  if (n >= DECK_A) return 0;
  if (n >= LIP_A) return RADIUS;
  const d = n - FLAT;
  return RADIUS - Math.sqrt(RADIUS*RADIUS - d*d);
}
```

### 参数 ↔ 位置 双向映射

**两个都要**：
- 画画用 `pointOnRamp` 沿参数扫掠
- 物理/阴影用 `surfaceAt` 求落地高度

`th` 是切线角，用于判断朝向与计算坡度。

### 局部坐标系

```js
// 参考：mini-ramp:68
const world = (a, w, z) => [(a + w) / R2, (w - a) / R2, z];
```

沿屏幕水平方向 `a` 延伸，`w` 是朝向相机的方向。
**好处：形状描述与投影解耦**。

### 沿曲面扫掠绘制

```js
// 参考：mini-ramp:153-165
for (let s = -LIP_S - (DECK_A-LIP_A); s <= LIP_S + (DECK_A-LIP_A); s += .04) {
  const q = pointOnRamp(s), onDeck = Math.abs(s) > LIP_S;
  const facing = Math.sin(q.th);
  const shade = 3 + (facing > 0 ? .85*facing : 1.5*facing);   // ← 朝向决定明暗
  for (let w = -RAMP_W; w <= RAMP_W; w += .07) {
    const seamS = Math.abs(s/2.44 - Math.round(s/2.44)) < .016;
    const seamW = Math.abs(w/2.3 - Math.round(w/2.3)) < .022;
    let level = shade + (noise(s*1.6, w*1.6) - .5) * .5;
    if (seamS || seamW) level -= 1;
    if (Math.abs(s) < LIP_S && Math.abs(w - .3) < 1.3) level -= .35;   // 常走的线更深
    paint(q.a, w, q.z, pick(onDeck ? ply : mason, onDeck ? level+.4 : level, ix, iy), true);
  }
}
```

三个亮点：

| 技巧 | 说明 |
|------|------|
| `facing = Math.sin(q.th)` | 用切线角判断面朝哪边，正对光源的面更亮 |
| 板缝 | `s/2.44` 和 `w/2.3` 两组等距线，缝处亮度 -1 |
| 使用痕迹 | 中间常走的那条线额外压暗 `.35` |

### 曲面阴影（迭代收敛）

```js
// 参考：mini-ramp:443-455
function stampShadow(a, w, z, r, strength) {
  let h = Math.max(0, z - surfaceAt(a, w));
  let sa = a + h*SHADOW_ALONG, sw = w + h*SHADOW_ACROSS;
  let sz = surfaceAt(sa, sw);
  h = Math.max(0, z - sz); sa = a + h*SHADOW_ALONG; sw = w + h*SHADOW_ACROSS; sz = surfaceAt(sa, sw);
  // 在 (sa, sw, sz) 处画椭圆
}
```

**沿光方向走，直到落到曲面上，迭代两次**。
曲面不规则时一次投影会穿进坡里，需要迭代收敛。

这是"阴影贴合任意曲面"的通用解法。

### 移植清单

1. 坡道像素要打地面标记才能接收移动阴影：
   ```js
   for (let i = 0; i < W*H; i++) if (rampMask[i]) ground[i] = 1;
   ```
   在 `bake()` 最后、`applyShadows()` 之前执行。
2. 坡道阴影用 `stampShadow`（曲面版）而非 `castShadow`（平面版）。
3. `SHADOW_ALONG = (SHADOW_X - SHADOW_Y)/R2`，`SHADOW_ACROSS = (SHADOW_X + SHADOW_Y)/R2`。

---

## 6. 线性/曲面构件速查

| 构件 | 形状 | 关键算法 | 参考 |
|------|------|----------|------|
| `masonry` | 表面 | 错缝 + 灰缝 + 随机色 | `stari-most:100` |
| `wallColor` | 表面 | 低频剥落区 | `laundry:98` |
| `shadowBox` | 体积 | 三维采样 | `stari-most:205` |
| 拱桥 | 曲面 | 圆弧扫掠 + 极角分缝 | `stari-most:106` |
| `wire-fence` | 线性 | 斜向网格求交（菱形） | `tie-break:108` |
| `net` | 线性 | 正交网格求并（方格）+ 白边 | `tie-break:142` |
| `wood-fence` | 线性 | 交替色板条 | `balote:127` |
| `stairs` | 线性 | 侧杆 + 横档 | `mini-ramp:183` |
| `awning` | 线性 | 斜置横杆 | `laundry:147` |
| 晾衣绳 | 线性 | 抛物线垂弧 | `laundry:82` |
| `ramp` | 曲面 | 参数↔位置双向映射 | `mini-ramp:69` |

---

## 7. 移植清单（总）

| 优先级 | 项 | 说明 |
|--------|----|------|
| 高 | `masonry()` | 一行公式，所有墙面质感的来源。demo 木屋现在是纯 `box()` |
| 高 | `shadowBox()` | 建筑体积阴影。demo 建筑的影子现在只有单点 |
| 高 | 地面反弹光 | `demo/engine.js` 的 `sphere()` 缺参考 `engine.js:75` 那行 |
| 中 | `wire-fence` | 极低成本增加"人工搭建"感 |
| 中 | `wood-fence` | 交替色板条 |
| 中 | 抛物线垂弧 | 绳索/电线/藤蔓通用 |
| 低 | `net` | 特定场景 |
| 低 | 拱桥 | 需要时做 |
| 低 | `ramp` / 曲面阴影 | 只有要做曲面才需要 |

**通用坑**

1. `masonry()` 返回已量化颜色，不要再叠色阶。
2. 建筑像素必须写 `zb[i]`（`plot()` 已做）。
3. `plot()` 步长 `.04`～`.045`；> `.05` 有明显缝隙。
4. 曲面采样步长要小，否则出条纹。
5. 体积阴影在 `bakeOcclusion()` 之前调用。
