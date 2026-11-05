# 建筑变体配方卡

> 注册表：[registry.md §2](registry.md)
> 覆盖：实心建筑（墙、房屋、塔、屋顶、女儿墙、小构件、木屋）
> 相关：[structures.md](structures.md) 材质算法与线性/曲面构件 · [scene.md](scene.md) 地面

> **本篇定位**：**实心建筑**的变体配方卡。
> 围栏、球网、坡道、拱桥等**线性/曲面构件**在 [structures.md](structures.md)。
> 砌体算法的完整细节也在那里。

---

## 0. 建筑解剖

```
   ┌─────┐   ← 顶盖（坡顶 / 锥顶 / 平顶 / 无）
   │     │
  ╔═════╗  ← 开口（窗 / 门 / 拱 / 缺口）
  ║     ║
  ╚═════╝  ← 围合（墙 / 板 / 网 / 篱）
```

**四种差异的归属**

| 差异 | 例子 | 归属 |
|------|------|------|
| 围合方式 | 实墙 / 铁丝网 / 板条 / 矮篱 | **独立 ID** |
| 材质 | 砖石 / 抹灰 / 木 / 石膏 | **参数组**（`masonry` / `wallColor`） |
| 开口 | 窗 / 门 / 拱门 | **参数**（数量、位置） |
| 顶盖 | 双坡 / 锥 / 平 | **参数**（`rise`、`roof()`） |

---

## 1. 砌体材质：怎么用

完整算法见 [structures.md §1](structures.md)。这里只讲**在建筑里怎么调**。

```js
// 参考：stari-most:100-105
function masonry(a, z, base, c = STONE) { ... }
```

### 用法表

| 位置 | `base` | 理由 |
|------|--------|------|
| 正面墙（`y1` 面） | 3 | 朝向光源 |
| 侧面墙（`x1` 面） | 2 | 背光 |
| 拱券内侧 | 1 | 更暗 |
| 拱券外侧 | 2 | — |
| 山墙 | 2 | 侧向 |

**同一个 `masonry`，不同 `base`** → 正面亮侧面暗 → 自动出体积。
这是建筑体积感最省事的来源。

### 变体

| ID | 函数 | 效果 | 参考 |
|----|------|------|------|
| `masonry-wall` | `masonry(a, z, base, c)` | 错缝砖石 + 灰缝 | `stari-most:100` |
| `plaster-wall` | `wallColor(a, z, base)` | 抹灰 + 剥落露石 | `laundry:98` |
| 木纹墙 | 自写（见 structures.md §1.4） | 竖向木板拼缝 | — |

### 坑

- `masonry()` 返回**已量化的颜色**（`rampOf(c)[index]`），不要再叠色阶。
- 高塔上砖会显得太小 → 把 `z * 1.6` 换成 `z * 2.2`（砖更高）。

---

## 2. `house` 房屋

| 项 | 内容 |
|----|------|
| **来源** | `ref` `stari-most:192` `house(x0, y0, x1, y1, z1, c)` |
| **状态** | ✅ 参考项目 4 栋 |

### 形态

两面可见墙（`y1` 面 base=3、`x1` 面 base=2）+ 规则排列的窗 + 出挑坡顶。

### 参数组 `x0y0x1y1/z1/roofColor`

| 参数 | 默认 | 区间 | 作用 |
|------|------|------|------|
| `x0,y0,x1,y1` | — | — | 平面包围盒 |
| `z1` | 2.8～3.6 | 2～6 | 墙高 |
| `roofColor` | `SLATE`/`TILE` | — | 屋顶色（`SLATE` 冷灰、`TILE` 暖红） |
| `windowEvery` | 1.6 | 1.2～2.2 | 窗间距 |

### 关键算法

```js
// 参考：stari-most:193-195
const step = .045;
for (let a = x0; a <= x1; a += step) for (let z = 0; z <= z1; z += step)
  plot(a, y1, z, masonry(a, z, 3));        // 正面，base=3
for (let a = y0; a <= y1; a += step) for (let z = 0; z <= z1; z += step)
  plot(x1, a, z, masonry(a, z, 2));        // 侧面，base=2
```

**窗**

```js
// 参考：stari-most:197-202
const windows = Math.max(1, Math.floor((x1 - x0) / 1.6));
for (let k = 0; k < windows; k++) {
  const cx = lerp(x0, x1, (k + .5) / windows);
  for (let a = cx - .24; a <= cx + .24; a += step) for (let z = z1*.55; z <= z1*.55+.8; z += step) {
    plot(a, y1 + .14, z, rampOf(DARK)[Math.abs(a - cx) < .03 ? 3 : 1]);
  }
}
```

- **窗凸出墙面 `.14`** —— 不凸出会被墙覆盖
- 窗框（`Math.abs(a-cx) < .03`）用亮档 3，其余暗档 1
- `Math.max(1, ...)` 保证窄房子也有窗

### 移植清单

1. 需要 `masonry()` + `roof()` + `plot()`。
2. 房子阴影用 `shadowBox()`（体积阴影），不是单点。

### 坑

- **屋顶必须比墙大一圈**：`roof(x0-.2, y0-.2, x1+.2, y1+.2, ...)`。出挑是"房子感"的关键。
- 窗凸出 `.14`、屋顶出挑 `.2` 这两个偏移别省。

---

## 3. `square-tower` 方塔

| 项 | 内容 |
|----|------|
| **来源** | `ref` `stari-most:149` `squareTower(x0, y0, x1, y1, z1)` |
| **状态** | ✅ |

### 形态

砌体塔身 + 三个错落的窄窗 + 坡顶。

### 参数组 `box/z1`

| 参数 | 默认 | 区间 | 作用 |
|------|------|------|------|
| `box` | — | — | 平面包围盒 |
| `z1` | 9.4～10.2 | 6～14 | 塔高 |
| `windowPos` | `[[.35,.3],[.65,.55],[.35,.78]]` | — | 窗位置（宽比例, 高比例） |

### 关键算法

```js
// 参考：stari-most:153-157
for (const [wx, wz] of [[.35,.3], [.65,.55], [.35,.78]]) {
  const cx = lerp(x0, x1, wx), cz = z1 * wz;
  for (let a = cx-.22; a <= cx+.22; a += step) for (let z = cz-.4; z <= cz+.4; z += step)
    plot(a, y1 + .14, z, rampOf(DARK)[1]);
}
```

三个窗**在两个高度上交错**（.3 / .55 / .78），不是一层一个 → 更像塔。

### 坑

- 塔很高时砖会显得太小，改 `masonry` 的 `z * 1.6` → `z * 2.2`。

---

## 4. `round-tower` 圆锥塔

| 项 | 内容 |
|----|------|
| **来源** | `ref` `stari-most:159` `roundTower(cx, cy, r, z1)` |
| **状态** | ✅ |

### 形态

圆柱塔身 + 收口锥顶 + 锥顶环纹。

### 参数组 `cxcy/r/z1`

| 参数 | 默认 | 区间 | 作用 |
|------|------|------|------|
| `cx,cy` | — | — | 圆心 |
| `r` | 1.9 | 1～3 | 半径 |
| `z1` | 9.4 | 6～12 | 塔身高 |

### 关键算法

**圆柱亮度（通用公式）**

```js
// 参考：stari-most:162-164
const nx = Math.cos(t), ny = Math.sin(t);
const l = -.5 * nx + .85 * ny;                 // 法线 · 光向
const base = clamp(Math.round(2.4 + l * 1.3), 1, 4);
```

`-.5, .85` 是光方向在 xy 平面的分量（光源在左上方）。
`round(2.4 + l*1.3)` 把连续光照量化到 5 档色阶。

**锥顶收口**

```js
// 参考：stari-most:170-177
for (let q = 0; q <= 1; q += .012) {
  const rr = (r + .2) * (1 - q);                // 半径线性收缩
  plot(cx + nx*rr, cy + ny*rr, z1 + q*2.1,
       rampOf(SLATE)[clamp(Math.round(2.4 + l*1.4 + (Math.floor(q*12)%2)*.4), 1, 4)]);
}
```

`(Math.floor(q*12) % 2) * .4` 加横向环纹 → 锥顶有层次。

### 坑

- 圆柱要画**背面**（t 从 0 到 2π 全画），靠深度缓冲自动遮挡。**不要只画前半圈**。
- `t` 步长 `.016` 约 400 段，每段 × 每层 z 步长 `.045` → 采样点多，注意性能。

---

## 5. `pitched-roof` 坡屋顶

| 项 | 内容 |
|----|------|
| **来源** | `ref` `stari-most:181` `roof(x0, y0, x1, y1, z, rise, c)` |
| **状态** | ✅ |

### 形态

双坡屋面 + 瓦片行 + 随机缺片 + 右侧山墙。

### 参数组 `box/rise/color`

| 参数 | 默认 | 区间 | 作用 |
|------|------|------|------|
| `box` | — | — | 平面包围盒 |
| `rise` | 1.3～1.4 | .8～2.5 | 屋脊高度 |
| `color` | `SLATE`/`TILE` | — | 瓦色 |
| `rows` | 3.4 | 2～6 | 每坡瓦片行数 |

### 关键算法

```js
// 参考：stari-most:185
const q = Math.abs(y - yc) / half;                        // 0=脊 1=檐
const row = Math.floor(q * half * 3.4) % 2;               // 瓦片行
plot(x, y, z + rise * (1 - q),
     rampOf(c)[clamp((y > yc ? 3 : 1) + row - (hash(x*3|0, y*9|0) > .85 ? 1 : 0), 0, 4)]);
```

| 因子 | 作用 |
|------|------|
| `(y > yc ? 3 : 1)` | **近坡亮档 3，远坡暗档 1**（与"光源在左上"一致） |
| `row` | 横向交替的明暗行 → 读作瓦片 |
| `hash > .85` | 约 15% 瓦片暗一档，破除规则感 |

**山墙**（右侧垂直三角面）用 `masonry` 画：

```js
// 参考：stari-most:188-191
for (let y = y0; y <= y1; y += step) {
  const q = Math.abs(y - yc) / half;
  for (let h = 0; h <= rise * (1-q); h += step) plot(x1, y, z + h, masonry(y, z+h, 2));
}
```

### 坑

- **不要交换 1 和 3**。参考实现就是这样，近坡亮。
- 瓦片行数 `half * 3.4` 随屋顶宽度变。窄屋顶瓦片会挤，必要时减小系数。
- **山墙画在 `x1` 会完全看不见**（出檐的屋面沿 x 铺到 `x1+.2`，把三角面全盖住了）。
  要画在出檐外缘 `x1+.22`（比屋面最外一列近 0.02，深度测试稳定赢）。
- **瓦片行用 `floor(q * half * 3.4)` 在小屋顶上读不出来**：行距换算到屏幕只有 ~2px，
  和 `plot()` 的像素取整错位 → 读作锯齿不是瓦片行。
  改成按**屏幕投影高度**分行（每行 ≥3.6px）：
  ```js
  const perY = (SIN / R2 + rise / half * COS) * S;   // 每单位 y 的屏幕位移
  const row = Math.floor(Math.abs(y - yc) * perY / 3.6) % 2;
  ```
- **瓦片行要用"暗行降一档"而不是"亮行加一档"**：近坡 base 3 加亮行会到档 4，
  而 `SHINGLE` 档 3/4 的色差太小（122,102,74 vs 160,138,103）→ 瓦片行读不出来。
  降档（3↔2）明暗差大得多。

---

## 5b. `wood-house` 木屋（秋日山村变体）

| 项 | 内容 |
|----|------|
| **来源** | `demo` `village/houses.js` |
| **状态** | ✅ |

### 形态

**木板墙**（不是砖石）+ 双坡屋顶 + 苔藓 + 亮着灯的窗 + 石阶 + 烟囱。
和 `house` 的关系：**围合方式相同（实墙）、顶盖相同（双坡）、开口相同（窗+门）**，
只有**材质**不同（木 vs 石）→ 按 `buildings.md §0` 的判定规则，这是**参数组**不是新 ID。

### 关键算法

```js
// 木纹墙：竖板条 + 横层 + 每块板独立色差 + 墙脚发暗 + 上部日晒变浅
function woodLevel(a, z, base, seed, z1) {
  const plank = Math.floor(a * 2.6), inPlank = a * 2.6 - plank;
  const row = Math.floor(z * 2.3), inRow = z * 2.3 - row;
  let lv = base;
  lv += hash(plank, seed) > .74 ? 1 : hash(plank, seed) < .18 ? -1 : 0;
  lv += (hash(plank * 13 + row * 5, seed + 3) - .5) * .9;
  if (inPlank > .88) lv -= 1;      // 竖向拼缝
  if (inRow < .14) lv -= 1;        // 横向拼缝
  lv -= z < .5 ? 1 : 0;            // 墙脚更脏
  lv += z > z1 * .58 ? .7 : 0;     // 上部日晒变浅
  return lv;
}
```

正面用 `WOOD_LIT` 的 base 3，侧面 base 2 → 自动出体积。

**苔藓**（低频噪声选区，边缘不规则）：

```js
const n = noise(x*.55 + seed*3.1, y*.55 + seed) * .55 + noise(x*1.9+seed, y*1.9) * .45;
const thr = h.moss * (.06 + .46 * (1 - q));      // 靠屋脊多、往檐口渐稀
if (n < thr) c = MOSS_RAMP[rim ? 1 : 2 + (hash(x*7|0, y*7|0) > .6 ? 1 : 0)];
```

### 坑

- **苔藓不能按 `y < yc` 选区**——那是**背坡**，屏幕上只占窄窄一条。
  要按 `q`（离屋脊的距离）选区：`q` 小 = 靠近屋脊 = 屏幕上的屋顶上半部。
- **檐下要有一条暗带**（出檐在墙上投的阴影）。没有它，墙顶和屋檐是"接"上去的，不像出挑。
- **烟囱底部要埋进屋面、顶部高出屋脊**，否则要么悬空要么被屋面吞掉。
- 墙基色用 `WOOD_LIT` 而不是 `WOOD`：参考图的木屋墙偏浅米棕，`WOOD` 会太暗沉。
- 房子沿公路摆位时，**路的几何要读 `terrain.js` 的 `ROAD`，不要复制一份常量**——
  复制的那份一定会和地形脱节（这个项目已经踩过一次）。

---

## 6. `parapet` 女儿墙

| 项 | 内容 |
|----|------|
| **来源** | `ref` `laundry:132-135`（在 `buildRoof` 内） |
| **状态** | ✅ |

### 形态

围合平台四边的矮墙。屋顶的地板是"地面"，女儿墙是边界。

### 参数组 `box/h/t`

| 参数 | 默认 | 区间 | 作用 |
|------|------|------|------|
| `box` | 平台范围 | — | — |
| `h` | .6 | .4～1.2 | 墙高 |
| `t` | .3 | .2～.5 | 墙厚 |

### 关键算法

```js
// 参考：laundry:132-135
box(-RX,  RY-t, 0,  RX,  RY, h, PLASTER, 1);
box( RX-t, -RY, 0,  RX,  RY, h, PLASTER, 2);
box(-RX, -RY, 0,  RX, -RY+t, h, PLASTER, 3);
box(-RX, -RY, 0, -RX+t,  RY, h, PLASTER, 4);
```

**每边给不同的 seed**（1/2/3/4），否则四边的木纹会重复。

### 坑

- 四边必须用 `box()` 的顶/前/右三个面逻辑，四面拼起来才有完整的墙。
- 墙厚 `t` 会占掉平台内部空间，注意别和家具重叠。

---

## 7. 屋顶小构件组

laundry 屋顶上的三个便宜构件。都是"几行 `box()`/`capsule()`"。

### `stair-house` 楼梯间

| 项 | 内容 |
|----|------|
| **来源** | `ref` `laundry:138-140` |
| **形态** | 大 `box()` 房体 + 顶部石板压顶 + 贴面的百叶门 |

```js
// 参考：laundry:138-140
box(-12.2, -6.7, 0, -8.4, -3.2, 3.6, PLASTER, 5);
box(-12.5, -7, 3.6, -8.1, -2.9, 3.85, STONE, 6);      // 压顶，出挑 .3
for (let a = -10.9; a <= -9.7; a += step) for (let z = 0; z <= 2.5; z += step)
  plot(a, -3.06, z, rampOf(SHUTTER)[Math.floor(a*3) % 2 ? 2 : 1]);   // 百叶门
```

**百叶门**：横向条纹 = `Math.floor(a*3) % 2` 交替两档色。

### `water-tank` 水塔

| 项 | 内容 |
|----|------|
| **来源** | `ref` `laundry:141-142` |
| **形态** | 卧倒的圆柱（水箱） + 顶部小盖 |

```js
// 参考：laundry:141-142
capsule([-10.8, -5, 4.5], [-9.4, -5, 4.5], .55, .55, () => STONE, 'rough');
castShadow(-10, -5, 4.2, .9);
```

**水平胶囊** = 卧倒的圆柱。

### `chimney` 烟囱

| 项 | 内容 |
|----|------|
| **来源** | `ref` `laundry:144-146` |
| **形态** | 三层方柱：石砌身 + 灰泥顶 + 陶土烟囱帽 |

```js
// 参考：laundry:144-146
box(3, -6.5, 0, 4.2, -5.3, 2.8, STONE, 7);
box(2.85, -6.65, 2.8, 4.35, -5.15, 3, PLASTER, 8);    // 略出挑
box(3.3, -6.2, 3, 3.9, -5.6, 3.35, POT, 9);          // 陶土帽
```

**每层出挑一点**（`.15` → `.15`）形成层层叠叠的收分。

### 共同要点

| 要点 | 说明 |
|------|------|
| **每层出挑** | 形成收分/叠涩，是"多层建筑"读作建筑的关键 |
| **压顶用不同材质** | 石压顶 + 灰泥身 + 陶土帽，三种材质 = 三个层次 |
| **阴影分层** | 每个构件都要单独的投影 |

---

## 8. `cabin` 木屋

| 项 | 内容 |
|----|------|
| **来源** | `demo` `demo.js` |
| **状态** | ✅ 但**建议升级** |

### 形态

纯 `box()` 拼的板房：墙 + 斜屋顶 + 烟囱 + 门窗。

### 升级路径

demo 的木屋是 `box()` 直出，材质是纯色。按这个顺序换：

| 步骤 | 换成 | 改动量 |
|------|------|-------|
| 1 | 墙身用 `masonry()` 逐点画 | 中 |
| 2 | 屋顶用 `roof()` | 小 |
| 3 | 体积阴影用 `shadowBox()` | 小 |
| 4 | 保留木质感 → 按 [structures.md §1.4](structures.md) 写 `woodWall(a, z, base)` | 中 |

**注意**：`masonry` 是砖石。要保留"木头"感，用 `colorOf` 按 `a` 方向加竖条纹模拟木板拼缝。

---

## 9. 待实现建筑的设计要点

以下是注册表里标 `📐` 的建筑。**不是让你现在全做**，而是说明每个该怎么接进来。

### `balcony` 阳台

**围合方式不变，新增"挑出平台"**。

| 参数 | 说明 |
|------|------|
| `depth` | 挑出深度 |
| `rail` | 栏杆高度（0 = 无栏杆） |

实现：`box()` 画平台 + `wood-fence` 画栏杆。
**不是新 ID**，是 `house` + 可选参数。

### `arch` 拱门

**围合方式 = 墙，开口变拱形**。

| 参数 | 说明 |
|------|------|
| `width` | 门洞宽 |
| `rise` | 拱高 |

实现要点：**用券石环而不是普通方门洞**。
复用 `stari-most:129-131` 的极角分缝：

```js
const joint = (Math.atan2(z - ARCH_BASE, a + ARCH_C) * 26) % 1;
```

**用极角分缝，券石才沿弧线排列**。详见 [structures.md §3](structures.md)。

### `shed` 棚屋

**围合方式 = 柱 + 板，顶盖 = 单坡**。

实现：4 根 `capsule` 立柱 + 一个斜 `box()` 顶。
**不封墙**——所以它和 `house` 是不同的围合方式，值得独立 ID。

### `well` 水井

**围合方式 = 圆环墙**。

实现：圆周扫掠的墙环 + 两根支架 + 吊桶（`capsule` + `box`）。
类似 `roundTower` 但矮而粗。

---

## 10. 建筑变体速查

| ID | 围合 | 顶盖 | 材质 | 开口 |
|----|------|------|------|------|
| `masonry-wall` | 实墙 | — | 砖石 | — |
| `plaster-wall` | 实墙 | — | 抹灰 | — |
| `house` | 实墙 | 双坡 | 砖石 | 窗 |
| `square-tower` | 实墙 | 双坡 | 砖石 | 窄窗 |
| `round-tower` | 圆柱 | 锥 | 砖石 | 窄窗 |
| `pitched-roof` | — | 双坡 | 瓦 | — |
| `parapet` | 矮墙 | — | 灰泥 | — |
| `stair-house` | 实墙 | 平+石板 | 灰泥 | 门 |
| `water-tank` | 圆柱 | 平 | 石 | — |
| `chimney` | 方柱 | 陶帽 | 石/陶 | — |
| `cabin` | 实墙 | 双坡 | 木 | 门窗 |

线性/曲面构件（围栏、网、坡道、拱桥）见 [structures.md §6](structures.md)。

---

## 11. 移植清单（总）

| 优先级 | 项 | 说明 |
|--------|----|------|
| 高 | `masonry()` 用法 | demo 木屋现在是纯 `box()`。算法见 structures.md |
| 高 | `roof()` | demo 屋顶是斜面素色，套上后立刻有瓦片感 |
| 高 | `shadowBox()` | 建筑体积阴影。demo 建筑的影子现在只有单点 |
| 中 | `parapet` | 给平台加边界 |
| 中 | `plaster-wall` 剥落 | 大面积墙加变化 |
| 中 | 屋顶小构件组 | 楼梯间/水塔/烟囱，几行代码，装饰性极强 |
| 低 | `round-tower` | 装饰性建筑 |
| 低 | `balcony` / `arch` / `shed` / `well` | 新围合方式 |

**通用坑**

1. `masonry()` 返回已量化颜色，不要再叠色阶。
2. 建筑像素必须写 `zb[i]`（`plot()` 已做），否则被地面覆盖。
3. `plot()` 步长 `.04`～`.045`；> `.05` 有明显缝隙。
4. 建筑阴影用体积阴影（`shadowBox`），不要只投一个点。
5. 屋顶出挑 `.2`、窗户凸出 `.14` 这两个偏移是"像建筑"的关键，别省。
6. 每层小构件都出挑一点，形成收分。

## stone-mill — 石磨坊

| 项 | 内容 |
|---|---|
| **ID** | `stone-mill` |
| **来源** | `demo/kit/buildings.js` · `KIT.register` · studio 生成 |
| **形态** | 石砌磨坊小屋，屋旁石台上立着可绕轴转动的石磨盘与十字木推杆 |
| **分类** | 建筑 |

### 参数

| 参数 | 默认 | 区间 | 步进 | 说明 |
|------|------|------|------|------|
| `width` | 3.2 | 2.4 ~ 4.4 | 0.1 | 磨坊正面宽度 |
| `depth` | 3 | 2.2 ~ 4.2 | 0.1 | 磨坊进深 |
| `height` | 2.6 | 1.8 ~ 3.6 | 0.1 | 檐口墙高 |
| `roofPitch` | 0.55 | 0.3 ~ 0.9 | 0.05 | 屋顶陡峭度，越大屋脊越高 |
| `millRadius` | 0.95 | 0.6 ~ 1.3 | 0.05 | 石磨盘半径 |
| `grindAngle` | 35 | 0 ~ 360 | 5 | 推杆方位角（度），逐帧递增即成转动动画 |
| `tone` | 0.5 | 0 ~ 1 | 0.05 | 石材冷暖：0 青灰，1 暖砂岩 |

### 碰撞体

`{"type":"box","w":5.8,"d":3.4,"h":4.3}`

### 移植清单

- 代码：`demo/kit/buildings.js`
- 注册表：`docs/kit/registry.md` · 建筑节
- 依赖引擎：`demo/engine.js` 的 `sphere/capsule/box/plot/rampOf/hash/noise`

### 实现说明

【为什么不能复用已有构件】wood-house 是木板拼缝墙 + 苔藓坡顶的骨架，没有任何可动部件；well / crate / stone-lantern / fence 都是静态小件。石磨坊需要「石砌墙体 + 阶梯坡顶 + 可绕轴旋转的磨盘」三样骨架，参数化表达不了，属于新 ID。

【三个关键做法】
1. 石砌感：不做逐块砖石（太贵），改为「水平石缝薄片 + 4 块种子定位的凸出散石」。石缝是贴向 +y 的薄 box（y1+0.01 ~ y1+0.06），正好卡在铁律 3 的偏移规则上，不会被墙盖住。
2. 圆盘：引擎没有圆盘/圆柱原语，用 7 条沿 y 的扫描线 box 拼等距椭圆。每条半宽 = sqrt(1-fy²)·R，条高取 (R/segs)·1.15 让相邻条微重叠，避免缝隙。上盘整体缩 0.86 并抬高 0.22，自然读成「两层磨盘」。
3. 转动：磨盘本体旋转对称，看不出角度，所以真正的转动线索是顶上那副十字木推杆。两根杆各用 7 个球串成（球心沿 cos/sin 角度均匀采样），角度由 grindAngle 驱动。场景循环里每帧 `inst.params.grindAngle = (elapsed * 40) % 360` 就得到匀速转动。

【为什么用球串而不是 capsule】capsule 的签名是 `(a, b, r0, r1, colorOf, mode)`，第五个参数名叫 colorOf，无法确定它要的是色阶数组还是一个 `t => color` 的回调。传错整个构件会崩，所以斜杆改用小球串规避，视觉上在 360×280 下同样是连续的杆。

【坑】
- 屋顶循环里 inset 必须用 `Math.min(..., D*0.5 - 0.06)` 夹住，否则进深调大时 y0+inset > y1-inset，box 会翻面或整块消失。
- 门和窗的 y 必须 ≥ y1 + 0.01；右侧窗的 x 必须 ≥ x1 + 0.01，否则被墙面吃掉。
- 右侧窗刻意放在 y = ctx.y-0.95 ~ ctx.y-0.5（靠后），因为磨盘在 y = y1 - D*0.32 一带，错开才不会被石台挡住。
- 散石的 hz 上界用 `Math.max(0.2, H - 1.0)`，H 调到最小值 1.8 时仍为正区间。
- 颜色全部经 rampOf 生成 5 级；tone 只改基色的通道比例，不手写多档，避免 Bayer 抖动读成棋盘格。
- 全程零 Math.random()，散石位置走 ctx.hash(i*7+1, ctx.seed)，同种子必复现。

【需要核对的唯一假设】我按契约把 `ctx.box` 与 `ctx.sphere` 的 color 参数都传成 rampOf 返回的 5 级数组（球体 rough/gloss 模式需要多级色阶做明暗，box 需要三面取不同档位，这是与铁律 1 唯一自洽的读法）。若实际 box 期望单色，把这 6 处 `ctx.box(..., stone, 23)` 之类的第二个参数改成 `stone[2]` 即可，形状代码不用动。本次因工具权限受限未能打开 demo/kit/buildings.js 核对。

【碰撞体】`{type:'box', w:5.8, d:3.4, h:4.3}` 按默认参数给的是「主体 + 磨盘」的整体包围盒。注意磨盘整体偏在 +x 侧（中心约偏移 +1.1），静态盒只能居中近似，摆密集场景时建议在编辑器里手动把盒子往右拉宽。

【待办·三件套】按项目纪律，落盘时还差两步：在 `docs/kit/registry.md` 加一行形如 `| [stone-mill](buildings.md#stone-mill--石磨坊) | 石磨坊 | building | ... |` 的记录，并在 `docs/kit/buildings.md` 补一张配方卡（ID/来源/形态/参数/碰撞体/移植清单/坑）。本次工具受限未写盘。

### 实现

```js
KIT.register({
  id: 'stone-mill',
  name: '石磨坊',
  category: 'building',
  desc: '石砌磨坊小屋，屋旁石台上立着可绕轴转动的石磨盘与十字木推杆',
  params: {
    width:      { def: 3.2,  min: 2.4, max: 4.4, step: 0.1,  desc: '磨坊正面宽度' },
    depth:      { def: 3.0,  min: 2.2, max: 4.2, step: 0.1,  desc: '磨坊进深' },
    height:     { def: 2.6,  min: 1.8, max: 3.6, step: 0.1,  desc: '檐口墙高' },
    roofPitch:  { def: 0.55, min: 0.3, max: 0.9, step: 0.05, desc: '屋顶陡峭度，越大屋脊越高' },
    millRadius: { def: 0.95, min: 0.6, max: 1.3, step: 0.05, desc: '石磨盘半径' },
    grindAngle: { def: 35,   min: 0,   max: 360, step: 5,    desc: '推杆方位角（度），逐帧递增即成转动动画' },
    tone:       { def: 0.5,  min: 0,   max: 1,   step: 0.05, desc: '石材冷暖：0 青灰，1 暖砂岩' },
  },
  collision: { type: 'box', w: 5.8, d: 3.4, h: 4.3 },

  draw(ctx, inst) {
    const p = ctx.params;
    const W = p.width, D = p.depth, H = p.height;
    const x0 = ctx.x - W * 0.5, x1 = ctx.x + W * 0.5;
    const y0 = ctx.y - D * 0.5, y1 = ctx.y + D * 0.5;
    const z0 = ctx.z;
    const t = p.tone;

    // 石材基色随 tone 在青灰与暖砂岩之间插值
    const stone = ctx.rampOf([
      Math.round(ctx.lerp(126, 172, t)),
      Math.round(ctx.lerp(134, 152, t)),
      Math.round(ctx.lerp(140, 116, t)),
    ]);
    const shade = ctx.rampOf([96, 100, 104]);
    const roof  = ctx.rampOf([84, 72, 64]);
    const wood  = ctx.rampOf([128, 92, 58]);
    const slab  = ctx.rampOf([164, 160, 150]);
    const glow  = ctx.rampOf([226, 186, 108]);

    // 台基：比墙体略宽，压住地面
    ctx.box(x0 - 0.12, y0 - 0.12, z0, x1 + 0.12, y1 + 0.12, z0 + 0.24, shade, 11);

    // 石墙主体
    const wallTop = z0 + 0.24 + H;
    ctx.box(x0, y0, z0 + 0.24, x1, y1, wallTop, stone, 23);

    // 正面的水平石缝：薄片贴向 +y，否则被墙盖住
    for (let i = 1; i <= 4; i++) {
      const zz = z0 + 0.24 + (H * i) / 5;
      ctx.box(x0 + 0.04, y1 + 0.01, zz, x1 - 0.04, y1 + 0.06, zz + 0.03, shade, 30 + i);
    }

    // 墙面凸出的散石，位置由种子决定，每栋略有不同
    for (let i = 0; i < 4; i++) {
      const hx = x0 + 0.35 + ctx.hash(i * 7 + 1, ctx.seed) * (W - 0.7);
      const hz = z0 + 0.5 + ctx.hash(i * 7 + 2, ctx.seed) * Math.max(0.2, H - 1.0);
      ctx.box(hx - 0.15, y1 + 0.01, hz, hx + 0.15, y1 + 0.07, hz + 0.18, stone, 120 + i);
    }

    // 阶梯坡屋顶：沿进深逐层收窄，屋檐在 x 方向挑出
    const rh = Math.min(H * p.roofPitch, W * 0.75);
    for (let i = 0; i < 4; i++) {
      const f = i / 4;
      const inset = Math.min(0.05 + f * D * 0.44, D * 0.5 - 0.06);
      ctx.box(x0 - 0.2, y0 + inset, wallTop + rh * f, x1 + 0.2, y1 - inset,
              wallTop + rh * f + rh * 0.25 + 0.03, roof, 40 + i);
    }

    // 门：深色门洞 + 内嵌木门扇
    const doorH = Math.min(1.15, H * 0.58);
    const dz = z0 + 0.24;
    ctx.box(ctx.x - 0.32, y1 + 0.01, dz, ctx.x + 0.32, y1 + 0.14, dz + doorH + 0.1, shade, 52);
    ctx.box(ctx.x - 0.25, y1 + 0.05, dz, ctx.x + 0.25, y1 + 0.18, dz + doorH, wood, 53);

    // 窗：正面一扇 + 右侧一扇，暖光
    const wz = z0 + 0.24 + H * 0.55;
    ctx.box(x1 - 0.95, y1 + 0.02, wz, x1 - 0.5, y1 + 0.16, wz + 0.42, glow, 60);
    ctx.box(x1 + 0.02, ctx.y - 0.95, wz, x1 + 0.16, ctx.y - 0.5, wz + 0.42, glow, 61);

    // ===== 石磨盘：屋旁石台上 =====
    const R = p.millRadius;
    const mx = x1 + R + 0.28;
    const my = y1 - D * 0.32;
    const baseZ = z0 + 0.34;

    ctx.box(mx - R * 1.18, my - R * 1.18, z0, mx + R * 1.18, my + R * 1.18, baseZ, shade, 70);

    // 用 7 条扫描线盒子拼出等距椭圆盘：下盘固定，上盘缩小 0.86 并抬高
    const segs = 7;
    for (let i = 0; i < segs; i++) {
      const fy = -1 + (2 * (i + 0.5)) / segs;
      const yy = my + fy * R;
      const yh = (R / segs) * 1.15;
      const half = Math.sqrt(Math.max(0, 1 - fy * fy)) * R;
      ctx.box(mx - half, yy - yh, baseZ, mx + half, yy + yh, baseZ + 0.20, slab, 80 + i);
      const h2 = half * 0.86;
      ctx.box(mx - h2, my + fy * R * 0.86 - yh * 0.86, baseZ + 0.20,
              mx + h2, my + fy * R * 0.86 + yh * 0.86, baseZ + 0.42, slab, 90 + i);
    }

    // 中心木轴
    ctx.box(mx - 0.08, my - 0.08, baseZ + 0.42, mx + 0.08, my + 0.08, baseZ + 0.68, wood, 99);

    // 十字推杆：两串小球沿半径铺开，角度由 grindAngle 决定 —— 转动的唯一视觉线索
    const a = (p.grindAngle * Math.PI) / 180;
    for (let k = 0; k < 2; k++) {
      const ang = a + k * Math.PI * 0.5;
      const dx = Math.cos(ang), dy = Math.sin(ang);
      for (let i = 1; i <= 6; i++) {
        const f = (i / 6) * R * 0.8;
        ctx.sphere(mx + dx * f, my + dy * f, baseZ + 0.48, 0.085, wood, 'rough');
      }
      ctx.sphere(mx + dx * R * 0.88, my + dy * R * 0.88, baseZ + 0.48, 0.11, wood, 'rough');
    }

    ctx.shadow(Math.max(W, D) * 0.65 + R * 0.5, 1, 0.5);
  },
});
```

## shed — 棚屋

| 项 | 内容 |
|---|---|
| **ID** | `shed` |
| **来源** | `demo/kit/buildings.js` · `KIT.register` · studio 生成 |
| **形态** | 四根木柱撑起的单坡顶木棚：屋顶由一叠水平薄板叠成阶梯斜面，板板有厚度，斜看也不透光 |
| **分类** | 建筑 |

### 参数

| 参数 | 默认 | 区间 | 步进 | 说明 |
|------|------|------|------|------|
| — | — | — | — | 无可调参数 |

### 碰撞体

`{"type":"box","w":2.6,"d":2,"h":2.3}`

### 移植清单

- 代码：`demo/kit/buildings.js`
- 注册表：`docs/kit/registry.md` · 建筑节
- 依赖引擎：`demo/engine.js` 的 `sphere/capsule/box/plot/rampOf/hash/noise`

### 实现说明

（待补充）

### 实现

```js
KIT.register({
  id: 'shed',
  name: '棚屋',
  category: 'building',
  desc: '四根木柱撑起的单坡顶木棚：屋顶由一叠水平薄板叠成阶梯斜面，板板有厚度，斜看也不透光',
  params: {
    width:     { def: 2.6,  min: 1.4, max: 4.5,  step: 0.1,  desc: '棚屋宽度（x 跨度）' },
    depth:     { def: 2.0,  min: 1.2, max: 4.0,  step: 0.1,  desc: '棚屋进深（y 跨度，坡向沿此轴）' },
    frontH:    { def: 1.5,  min: 0.8, max: 3.0,  step: 0.1,  desc: '前檐柱高（低边）' },
    backH:     { def: 2.3,  min: 1.0, max: 4.0,  step: 0.1,  desc: '后檐柱高（高边）' },
    postR:     { def: 0.11, min: 0.06, max: 0.24, step: 0.01, desc: '立柱半径' },
    thickness: { def: 0.13, min: 0.07, max: 0.3,  step: 0.01, desc: '屋面板厚度' },
    overhang:  { def: 0.2,  min: 0,   max: 0.5,  step: 0.02, desc: '屋檐四周挑出' },
  },
  collision: { type: 'box', w: 2.6, d: 2.0, h: 2.3 },
  draw(ctx, inst) {
    const p = ctx.params;
    const OX = ctx.x, OY = ctx.y, z0 = ctx.z || 0;
    const W = p.width, D = p.depth;
    const hw = W / 2, hd = D / 2;
    const hF = p.frontH;
    const hB = Math.max(p.backH, hF + 0.25);
    const t = p.thickness, oh = p.overhang;
    const slope = (hB - hF) / D;

    const BARK = [116, 84, 54], BARK_HI = [138, 104, 70], BARK_LO = [92, 66, 42];

    // 高度场：y = OY-hd 处为前檐 hF，y = OY+hd 处为后脊 hB，挑出段顺着坡继续延伸
    const zAt = (wy) => z0 + Math.max(0.06, hF + (wy - OY + hd) * slope);

    // 四根立柱：顶端插进屋顶板底 0.02，不再穿出屋面
    const px = [-hw, hw, -hw, hw];
    const py = [-hd, -hd, hd, hd];
    for (let i = 0; i < 4; i++) {
      const cx = OX + px[i], cy = OY + py[i];
      const top = Math.max(z0 + 0.2, zAt(cy) - t + 0.02);
      ctx.capsule([cx, cy, z0], [cx, cy, top], p.postR * 1.15, p.postR * 0.88,
        z => (z - z0) > (top - z0) * 0.78 ? BARK_HI
           : (z - z0) > (top - z0) * 0.22 ? BARK : BARK_LO,
        'rough');
    }

    // 屋顶：一叠水平薄板箱体叠出斜面。
    // 斜的单层面片在等距下会被压成一条带（就是"透明"的来源）；
    // 水平顶面法线朝上，永远不会与视线平行，每段 box 还自带厚度与竖直前立面。
    const xa = OX - hw - oh, xb = OX + hw + oh;
    const ya = OY - hd - oh, yb = OY + hd + oh;
    const seg = Math.max(8, Math.min(60, Math.round(D / 0.08)));
    for (let i = 0; i < seg; i++) {
      const y0 = ya + (yb - ya) * (i / seg);
      const y1 = ya + (yb - ya) * ((i + 1) / seg);
      const f = (i + 0.5) / seg;                  // 0 = 前檐，1 = 后脊
      const zt = zAt((y0 + y1) / 2);
      const zb = Math.max(z0 + 0.04, zt - t);
      const g = Math.round(84 + 36 * f);          // 近脊受光更亮
      ctx.box(xa, y0, zb, xb, y1, zt, [g, g + 5, g + 9], ctx.seed + i);
    }

    ctx.shadow(Math.max(W, D) * 0.58, 1, 0.5);
  },
});
```
## arch — 拱门

| 项 | 内容 |
|---|---|
| **ID** | `arch` |
| **来源** | `demo/kit/buildings.js` · `KIT.register` · studio 生成 |
| **形态** | 方石墙开半椭圆门洞，券石环按极角分缝沿弧排列 |
| **分类** | 建筑 |

### 参数

| 参数 | 默认 | 区间 | 步进 | 说明 |
|------|------|------|------|------|
| `width` | 2 | 1 ~ 3.6 | 0.1 | 门洞宽 |
| `rise` | 1 | 0.4 ~ 2.6 | 0.1 | 拱高（起拱线以上） |

### 碰撞体

`{"type":"box","width":4.3,"depth":0.92,"height":3.75}`

### 移植清单

- 代码：`demo/kit/buildings.js`
- 注册表：`docs/kit/registry.md` · 建筑节
- 依赖引擎：`demo/engine.js` 的 `sphere/capsule/box/plot/rampOf/hash/noise`

### 实现说明

#### 实现要点

**围合方式**：墙 + 拱形开口。整堵墙逐像素 `ctx.plot` 写前表面（不用 `ctx.box`），因此拱洞能真的透空，且深度缓冲由每个像素自己承担。

**骨架**（规格外的常量都是不暴露的实现细节）：起拱线 `BASE = 2.0`，单侧墙墩 `PIER = 1.15`，墙厚 `T = 0.92`，压顶余量 `0.75`。所以 `width=2.0 / rise=1.0` 时墙是 4.3 × 0.92 × 3.75，和碰撞体一致。

**券石环**用极角分缝，是这张配方卡的核心：
- 用**外扩椭圆**判断环厚：`(x/(hw+RING))² + (dz/(rise+RING))² ≤ 1`，`RING = 0.30` 世界单位。不用归一化 `q`——否则 `rise` 调大时环在拱顶会胖成 0.8 单位。
- 极角：`Math.atan2(dz, x)`，值域 ±π（拱上为 0…π）。规格的 `* 26` 直接作用在弧度上会得到 82 段（每块约 2 像素），所以先 `/Math.PI` 再 `*26`——**半圈正好 26 块券石**，每块约 7°，这是 26 这个数在视觉上成立的前提。
- 分缝的三种用途：`f < 0.07 || f > 0.93` 画暗缝；`seg` 做 `ctx.hash` 键给每块 ±1 档色差；`q > 0.93` 沿外弧补暖色 rim，`q0 < 1.06` 沿内弧压暗边。

**光照分层**：前表面 tone(3)（砌块在 2/3 之间抖）、右端面 tone(1)、顶面 tone(4)。正面比侧面亮一档，符合铁律 4。`tone()` 内部先比较 `ramp[0]` 与 `ramp[4]` 的亮度和来决定是否翻转索引，所以不依赖 `rampOf` 返回的排列方向。

**洞口内壁**：相机在 +x 侧，从正面看进洞里只能看到 −x 侧内壁，所以只在左缘 `T*0.85` 宽的带内画 tone(1)/tone(0)，其余保持透明——**右半截是真通透的**，能看见门后的场景。内壁画在 `YF - 0.2`（比前表面更远），深度正确。

**灰缝**：错缝砌块，块宽 0.66、行高 0.36、隔行错开半块；`fx/fz < 0.045` 画灰缝，`z < 0.22` 用暗一档表现墙脚潮气。

**随机**：全部走 `ctx.hash(bid, ctx.seed)`，块 ID 由 `|floor(xo/0.66)|*31 + row*7` 生成，完全可复现。

#### 坑

- `x % 0.66` 在 x 为负时返回负值，必须 `if (fx < 0) fx += 0.66`，否则负半边墙的灰缝会消失。
- `(ang * 26) % 1` 同样有负数问题，改用 `g - Math.floor(g)` 拿小数部分、`Math.abs(Math.floor(g))` 拿块号。
- 逐像素步长取 0.04：再大会在 360×280 画布上漏点（约 1px ≈ 0.03 世界单位），再小则纯浪费。
- 券石环必须限定 `z > BASE`，否则起拱线以下的墙墩会被当成券石算进去。

#### 与已有构件的差异

这是构件库里第一个**带真开口的围合体**：`buildings.md` 里的木屋/石屋都是实心墙体，门窗是用色块贴在墙面上的（`y + 0.14` 偏移）；`arch` 的门洞是几何镂空，射线能穿过去。也因此它不能复用 `ctx.box`，必须自己逐像素扫面。

### 实现

```js
KIT.register({
  id: 'arch',
  name: '拱门',
  category: 'building',
  desc: '方石墙开半椭圆门洞，券石环按极角分缝沿弧排列',
  params: {
    width: { def: 2.0, min: 1.0, max: 3.6, step: 0.1, desc: '门洞宽' },
    rise: { def: 1.0, min: 0.4, max: 2.6, step: 0.1, desc: '拱高（起拱线以上）' },
  },
  collision: { type: 'box', width: 4.3, depth: 0.92, height: 3.75 },

  draw(ctx, inst) {
    const hw = ctx.params.width * 0.5;   // 门洞半宽
    const rise = ctx.params.rise;        // 拱高
    const BASE = 2.0;                    // 起拱线（直段高）
    const PIER = 1.15;                   // 单侧墙墩宽
    const W = ctx.params.width + PIER * 2;
    const H = BASE + rise + 0.75;        // 墙顶（拱顶上方留压顶）
    const T = 0.92;                      // 墙厚
    const YF = T * 0.5;                  // 前表面（朝相机）
    const RING = 0.30;                   // 券石环厚度（世界单位）
    const STEP = 0.04;

    const ox = ctx.x, oy = ctx.y, oz = ctx.z;

    // 色阶：tone(0) 最暗 … tone(4) 最亮
    const lum = (c) => (c & 255) + ((c >> 8) & 255) + ((c >> 16) & 255);
    const rock = ctx.rampOf([142, 133, 119]);
    const rrev = lum(rock[0]) > lum(rock[4]);
    const tone = (i) => rock[rrev ? 4 - i : i];
    const vrmp = ctx.rampOf([150, 139, 125]);
    const vrev = lum(vrmp[0]) > lum(vrmp[4]);
    const vtone = (i) => vrmp[vrev ? 4 - i : i];

    // 门洞：直段矩形 + 上方半椭圆
    const inHole = (x, z) => {
      const ax = x < 0 ? -x : x;
      if (ax > hw) return false;
      if (z <= BASE) return true;
      const dz = z - BASE;
      if (dz > rise) return false;
      return (ax * ax) / (hw * hw) + (dz * dz) / (rise * rise) <= 1;
    };

    // 1. 洞口左内壁（相机在 +x 侧，只见 -x 侧壁；右半通透）
    for (let z = 0.02; z < BASE + rise; z += STEP) {
      for (let x = -hw; x < hw; x += STEP) {
        if (!inHole(x, z)) continue;
        const d = x + hw;
        if (d > T * 0.85) break;
        ctx.plot(ox + x, oy + YF - 0.2, oz + z, d < 0.07 ? tone(0) : tone(1));
      }
    }

    // 2. 右端面（法线 +x，朝相机）
    for (let z = 0.02; z < H; z += STEP) {
      for (let y = -T * 0.5; y < T * 0.5; y += STEP) {
        ctx.plot(ox + W * 0.5, oy + y, oz + z, tone(1));
      }
    }

    // 3. 顶面
    for (let y = -T * 0.5; y < T * 0.5; y += STEP) {
      for (let x = -W * 0.5; x < W * 0.5; x += STEP) {
        ctx.plot(ox + x, oy + y, oz + H, tone(ctx.noise(x * 4, y * 4) > 0.72 ? 3 : 4));
      }
    }

    // 4. 前表面：券石环 + 错缝砌块
    const EX = hw + RING, EZ = rise + RING;
    for (let z = 0.02; z < H; z += STEP) {
      const row = Math.floor(z / 0.36);
      for (let x = -W * 0.5 + 0.02; x < W * 0.5; x += STEP) {
        if (inHole(x, z)) continue;
        const py = oy + YF + 0.06;

        // —— 券石环 ——
        if (z > BASE) {
          const dz = z - BASE;
          const q = Math.sqrt((x * x) / (EX * EX) + (dz * dz) / (EZ * EZ));
          if (q <= 1) {
            // 极角分缝：atan2 值域 ±π，除以 π 后 ×26 即「半圈 26 块券石」
            const g = (Math.atan2(dz, x) / Math.PI) * 26;
            const f = g - Math.floor(g);
            const seg = Math.abs(Math.floor(g));
            let c;
            if (f < 0.07 || f > 0.93) c = vtone(0);          // 接缝
            else if (q > 0.93) c = vtone(4);                 // 外弧 rim
            else {
              const q0 = Math.sqrt((x * x) / (hw * hw) + (dz * dz) / (rise * rise));
              if (q0 < 1.06) c = vtone(1);                   // 内弧暗边
              else c = vtone(ctx.hash(seg * 13 + 5, ctx.seed) < 0.5 ? 3 : 2);
            }
            ctx.plot(ox + x, py, oz + z, c);
            continue;
          }
        }

        // —— 错缝砌块墙 ——
        const xo = x + (row % 2) * 0.33;
        let fx = xo % 0.66; if (fx < 0) fx += 0.66;
        const fz = z % 0.36;
        const bid = Math.abs(Math.floor(xo / 0.66)) * 31 + row * 7;
        let c;
        if (fx < 0.045 || fz < 0.045) c = tone(0);            // 灰缝
        else if (z < 0.22) c = tone(1);                       // 墙脚潮气
        else c = tone(ctx.hash(bid, ctx.seed) < 0.3 ? 2 : 3);
        ctx.plot(ox + x, py, oz + z, c);
      }
    }

    ctx.shadow(Math.max(W, H) * 0.42, 1, 0.5);
  },
});
```

## well-house — 水井

| 项 | 内容 |
|---|---|
| **ID** | `well-house` |
| **来源** | `demo/kit/buildings.js` · `KIT.register` · studio 生成 |
| **形态** | 圆环石砌井台，两根木柱撑起横梁，麻绳吊着木桶 |
| **分类** | 建筑 |

### 参数

| 参数 | 默认 | 区间 | 步进 | 说明 |
|------|------|------|------|------|
| `radius` | 1.1 | 0.7 ~ 1.8 | 0.05 | 井口外半径 |
| `height` | 0.6 | 0.35 ~ 1.1 | 0.05 | 石砌井台高度 |
| `frameHeight` | 1.4 | 0.9 ~ 2.2 | 0.05 | 井台以上的支架高度 |

### 碰撞体

`{"type":"cylinder","radius":1.25,"height":0.6}`

### 移植清单

- 代码：`demo/kit/buildings.js`
- 注册表：`docs/kit/registry.md` · 建筑节
- 依赖引擎：`demo/engine.js` 的 `sphere/capsule/box/plot/rampOf/hash/noise`

### 实现说明

实现要点：1) 围合方式是圆周扫掠的墙环：每层 SEG=16 段，沿圆弧取弦，用 capsule 当石块；ringR = radius - stoneR 让墙环外轮廓正好等于 radius。层数 = round(height/0.24)（最少 2 层），层间用 spin 错开半格形成砌缝，石块半径取 courseH*0.62，保证上下层咬合、不出现横向漏缝。2) 压顶石再扫一圈，半径 1.12 倍做井沿，颜色亮一档，井口边缘更厚实。3) 井口内圈用 plot 铺一张暗水面（半径 R-0.34，略小于内壁），防止从井口看穿到地面；这是井内部暗面，不是独立骨架特征。4) 支架：两根 capsule 木柱立在井圈外侧 ±(R+0.12)，一根 box 横梁跨过井口并两端出头，颜色用 WOOD_HI；横梁按碰撞规范不计入碰撞体。5) 吊桶按规格 capsule + box：麻绳 capsule 从梁底垂到桶口，桶身一个 box，外加一圈微凸深色桶箍 box；桶底悬在井沿上方 0.24，保证从默认视角能看见。坑：a) 石块全用 colorOf 返回常量 [r,g,b] 数组，绝不能返回 rampOf/rgb 的打包值；b) 所有 z 都叠加 bz=ctx.z，x/y 全部偏移 ctx.x/ctx.y，摆到 (4,2) 时不会画回原点；c) 随机全部走 ctx.hash，石块抖动、颜色分档、水面噪声都可复现；d) 水面 plot 用 ctx.rgb 打包值，纹理噪声键值做了 +64 偏移避免负数键。与 roundTower 的差异：矮而粗（height 默认 0.6、粒径由层高定，壁厚约 2*stoneR≈0.25），保留开口不封顶，顶部没有屋顶，改为两根支架 + 横梁 + 吊桶；碰撞只包石砌井圈（cylinder r=1.25, h=0.6），编辑器里可手调。

### 实现

```js
KIT.register({
  id: 'well-house',
  name: '水井',
  category: 'building',
  desc: '圆环石砌井台，两根木柱撑起横梁，麻绳吊着木桶',
  params: {
    radius: { def: 1.1, min: 0.7, max: 1.8, step: 0.05, desc: '井口外半径' },
    height: { def: 0.6, min: 0.35, max: 1.1, step: 0.05, desc: '石砌井台高度' },
    frameHeight: { def: 1.4, min: 0.9, max: 2.2, step: 0.05, desc: '井台以上的支架高度' },
  },
  collision: { type: 'cylinder', radius: 1.25, height: 0.6 },

  draw(ctx) {
    const bx = ctx.x, by = ctx.y, bz = ctx.z || 0;
    const R = ctx.params.radius;
    const wallH = ctx.params.height;
    const frameH = ctx.params.frameHeight;
    const TAU = Math.PI * 2;

    const STONE = [122, 118, 110];
    const STONE_HI = [141, 137, 127];
    const STONE_DK = [103, 99, 93];
    const STONE_TOP = [150, 146, 135];
    const WOOD = [112, 82, 52];
    const WOOD_DK = [94, 68, 43];
    const WOOD_HI = [131, 99, 64];
    const ROPE = [178, 154, 106];
    const BUCKET = [126, 90, 55];
    const BUCKET_DK = [106, 74, 44];

    // 井底暗水面：铺满井口内圈，免得从井口看穿到地面
    const wr = Math.max(0.18, R - 0.34);
    for (let gx = -wr; gx <= wr; gx += 0.09) {
      for (let gy = -wr; gy <= wr; gy += 0.09) {
        if (gx * gx + gy * gy > wr * wr) continue;
        const n = ctx.hash((Math.round(gx * 40) + 64) * 97 + Math.round(gy * 40) + 64, ctx.seed);
        ctx.plot(bx + gx, by + gy, bz + 0.07,
          ctx.rgb(26 + Math.round(n * 6), 48 + Math.round(n * 5), 54 + Math.round(n * 4)));
      }
    }

    // 圆周扫掠的墙环：每层若干段沿圆弧摆放的胶囊石块
    const SEG = 16;
    const courses = Math.max(2, Math.round(wallH / 0.24));
    const courseH = wallH / courses;
    const stoneR = Math.min(0.16, courseH * 0.62);
    const ringR = R - stoneR;

    for (let c = 0; c < courses; c++) {
      const zc = bz + courseH * (c + 0.5);
      const spin = (c % 2) * (Math.PI / SEG);
      for (let i = 0; i < SEG; i++) {
        const a0 = spin + (i + 0.04) * TAU / SEG;
        const a1 = spin + (i + 0.96) * TAU / SEG;
        const jr = ringR + (ctx.hash(i * 11 + c * 29, ctx.seed) - 0.5) * 0.04;
        const zz = zc + (ctx.hash(i * 7 + c * 41, ctx.seed) - 0.5) * courseH * 0.12;
        const cr = stoneR * (0.88 + ctx.hash(i * 5 + c * 17 + 3, ctx.seed) * 0.16);
        const t = ctx.hash(i * 19 + c * 61, ctx.seed);
        const col = t < 0.28 ? STONE_DK : (t > 0.74 ? STONE_HI : STONE);
        ctx.capsule(
          [bx + Math.cos(a0) * jr, by + Math.sin(a0) * jr, zz],
          [bx + Math.cos(a1) * jr, by + Math.sin(a1) * jr, zz],
          cr, cr, () => col, 'rough'
        );
      }
    }

    // 压顶石：稍粗一圈，井沿更厚实
    const copR = stoneR * 1.12;
    for (let i = 0; i < SEG; i++) {
      const a0 = (i + 0.02) * TAU / SEG;
      const a1 = (i + 0.98) * TAU / SEG;
      const t = ctx.hash(i * 23 + 7, ctx.seed);
      const col = t > 0.62 ? STONE_TOP : STONE_HI;
      ctx.capsule(
        [bx + Math.cos(a0) * (R - copR), by + Math.sin(a0) * (R - copR), bz + wallH + copR * 0.3],
        [bx + Math.cos(a1) * (R - copR), by + Math.sin(a1) * (R - copR), bz + wallH + copR * 0.3],
        copR, copR, () => col, 'rough'
      );
    }

    // 两根木支架 + 横梁
    const postX = R + 0.12;
    const topZ = bz + wallH + frameH;
    for (const sx of [-1, 1]) {
      ctx.capsule(
        [bx + sx * postX, by, bz],
        [bx + sx * postX, by, topZ],
        0.085, 0.072,
        z => z < bz + 0.3 ? WOOD_DK : WOOD, 'rough'
      );
    }
    ctx.box(
      bx - postX - 0.15, by - 0.075, topZ - 0.13,
      bx + postX + 0.15, by + 0.075, topZ,
      WOOD_HI, ctx.seed + 5
    );

    // 吊桶：麻绳（胶囊）+ 木桶（盒）
    const bucketBot = bz + wallH + 0.24;
    const bucketH = 0.3;
    ctx.capsule(
      [bx, by, topZ - 0.13],
      [bx, by, bucketBot + bucketH],
      0.022, 0.022, () => ROPE, 'solid'
    );
    ctx.box(
      bx - 0.16, by - 0.16, bucketBot,
      bx + 0.16, by + 0.16, bucketBot + bucketH,
      BUCKET, ctx.seed + 11
    );
    ctx.box(
      bx - 0.18, by - 0.18, bucketBot + 0.05,
      bx + 0.18, by + 0.18, bucketBot + 0.11,
      BUCKET_DK, ctx.seed + 13
    );

    ctx.shadow(R + 0.5, 1, 0.5);
  },
});
```

---

## 附录：balcony 阳台 = wood-house 参数组

> 来源：`demo/kit/buildings.js` · `wood-house` 的 `balconyDepth/balconyRail` 参数 · studio 手写

规格 §9 的判定落地：**不建独立 ID**（围合方式不变，只是多个挑出平台）。

| 参数 | 默认 | 区间 | 说明 |
|------|------|------|------|
| `balconyDepth` | 0 | 0 ~ 2 | 挑出深度（0 = 无阳台） |
| `balconyRail` | 0.5 | 0 ~ 1.2 | 栏杆高（0 = 无栏杆） |

实现要点：

- 平台：正面（y1 面）外挑 `balconyDepth`，高度 `h*0.55`，比墙身左右各缩 0.35
- 厚度：前沿一条深色 `KIT_WOOD_DARK` 读出板厚
- 斜撑：每 0.7 一根 `capsule`，从墙面斜到板底
- 栏杆：立柱 n=`(bx1-bx0)/0.55` 根 + 顶横杆 + 中横杆

### 坑

- **capsule 的 colorOf 必须返回基色数组**：最初写成 `() => rampOf(KIT_WOOD)[2]`（打包值），全量实画测试逮出
- 平台画在屋顶循环**之前**，否则屋檐出挑会盖掉栏杆

## forest-cabin — 落叶小屋

| 项 | 内容 |
|---|---|
| **ID** | `forest-cabin` |
| **来源** | `demo/kit/buildings.js` · `KIT.register` · studio 生成 |
| **形态** | 林中木屋：石基木板墙 + 陡坡屋顶覆满金黄落叶，檐口垂下叶串 |
| **分类** | 建筑 |

### 参数

| 参数 | 默认 | 区间 | 步进 | 说明 |
|------|------|------|------|------|
| `width` | 3.2 | 2.4 ~ 4.4 | 0.1 | 屋身宽度 |
| `depth` | 2.6 | 1.8 ~ 3.6 | 0.1 | 屋身进深 |
| `height` | 1.9 | 1.4 ~ 2.6 | 0.1 | 檐口高度 |
| `pitch` | 1 | 0.5 ~ 1.6 | 0.05 | 屋顶陡度（脊高倍数） |
| `leaves` | 0.8 | 0 ~ 1 | 0.05 | 屋顶落叶覆盖密度 |
| `warm` | 0.45 | 0 ~ 1 | 0.05 | 叶色偏橙程度 |
| `lamp` | 1 | 0 ~ 1 | 1 | 窗内是否亮灯 |

### 碰撞体

`{"type":"box","width":3.4,"depth":2.8,"height":3.2,"w":3.4,"d":2.8,"h":3.2}`

### 移植清单

- 代码：`demo/kit/buildings.js`
- 注册表：`docs/kit/registry.md` · 建筑节
- 依赖引擎：`demo/engine.js` 的 `sphere/capsule/box/plot/rampOf/hash/noise`

### 实现说明

【与已有构件的差异】wood-house 是"风化木板墙 + 坡屋顶 + 亮灯窗（含阳台参数组）"的普通木屋，屋顶是裸瓦；本构件多出三个它做不出来的部件：①屋面整片落叶覆盖层（低频噪声成团 + 檐口/屋脊加密，`leaves` 可 0~1 连续调）；②檐口垂下的叶串（超出屋面的第二层装饰）；③石基 + 石烟囱（烟囱顶也落着叶）。若只需要普通木屋，直接用 wood-house 调参即可，不要造这个。

【关键实现】
- 屋面用 plot 双重点阵参数化铺：u∈[-1,1] 沿 x，v∈[0,1] 从檐到脊，pz = Z+H+(RIDGE-H)*v。两坡都画（sg=±1），靠深度缓冲自动选可见面，不赌相机朝向。
- 落叶画在 pz+0.05（沿屋面法线抬高一点），否则同深度会和屋面底色抢像素被深度测试拒掉。
- 落叶分布 = ctx.noise 成团（cov）+ 檐口 boost 0.22*(1-v) + 屋脊 boost 0.12*v³，阈值 `0.95 - leaves*0.7`；leaves=0 时几乎全裸屋，=1 时约 85% 覆盖。
- 叶色三档 leafA/B/C 由 `warm` 在明黄→橙红之间整体插值；同一次绘制内三档通道差控制在 20~24，不会读成棋盘格。
- 坐标一律 X/Y/Z 偏移；顶层只有 KIT.register，其余 const 全在 draw 内。

【坑】
- 山墙必须用 plot 单独铺三角（box 顶面是平的，盖不出三角），且 x 比屋面外沿内缩 0.05，否则被屋面边缘像素穿花。
- box 只吃 [r,g,b] 基色数组，plot 只吃 rgb()/rampOf() 打包值，两张皮不能混。
- 门窗画在墙面外 0.05 处（Y±(D+0.05)、X±(W+0.05)），贴面会被墙盖掉。
- collision 用 box 的 width/depth/height 字段；若编辑器读不到，退回 {type:'cylinder', radius:1.9, height:3.2}。

【代码规模】约 120 行，在 40~120 目标区间上沿。

### 实现

```js
KIT.register({
  id: 'forest-cabin',
  name: '落叶小屋',
  category: 'building',
  desc: '林中木屋：石基木板墙 + 陡坡屋顶覆满金黄落叶，檐口垂下叶串',
  params: {
    width:  { def: 3.2, min: 2.4, max: 4.4, step: 0.1,  desc: '屋身宽度' },
    depth:  { def: 2.6, min: 1.8, max: 3.6, step: 0.1,  desc: '屋身进深' },
    height: { def: 1.9, min: 1.4, max: 2.6, step: 0.1,  desc: '檐口高度' },
    pitch:  { def: 1.0, min: 0.5, max: 1.6, step: 0.05, desc: '屋顶陡度（脊高倍数）' },
    leaves: { def: 0.8, min: 0,   max: 1,   step: 0.05, desc: '屋顶落叶覆盖密度' },
    warm:   { def: 0.45, min: 0,  max: 1,   step: 0.05, desc: '叶色偏橙程度' },
    lamp:   { def: 1,   min: 0,   max: 1,   step: 1,    desc: '窗内是否亮灯' }
  },
  collision: { type: 'box', width: 3.4, depth: 2.8, height: 3.2 },

  draw(ctx, inst) {
    const P = ctx.params, S = ctx.seed;
    const X = ctx.x, Y = ctx.y, Z = ctx.z;
    const W = P.width * 0.5, D = P.depth * 0.5, H = P.height;
    const OV = 0.3;                            // 檐口出挑
    const RIDGE = H + D * 0.92 * P.pitch;      // 屋脊高度
    const t = P.warm;
    const mix = (a, b) => Math.round(ctx.lerp(a, b, t));

    // —— 基色（只喂 box） ——
    const WOOD  = [124, 94, 66];
    const STONE = [110, 108, 102];
    const CHIM  = [134, 130, 122];

    // —— 打包像素色（只喂 plot） ——
    const seamC  = ctx.rgb(96, 72, 50);
    const wallA  = ctx.rgb(128, 98, 70);
    const wallB  = ctx.rgb(112, 84, 60);
    const doorC  = ctx.rgb(84, 60, 42);
    const frameC = ctx.rgb(64, 46, 32);
    const roofC  = ctx.rgb(90, 74, 60);
    const roofD  = ctx.rgb(74, 60, 48);
    const leafA  = ctx.rgb(mix(238, 226), mix(200, 156), mix(104, 70));
    const leafB  = ctx.rgb(mix(220, 208), mix(176, 134), mix(78, 54));
    const leafC  = ctx.rgb(mix(198, 186), mix(150, 112), mix(58, 40));
    const winIn  = P.lamp > 0.5 ? ctx.rgb(255, 232, 168) : ctx.rgb(126, 140, 146);
    const winHi  = P.lamp > 0.5 ? ctx.rgb(248, 202, 116) : ctx.rgb(104, 118, 126);

    // 1. 石基 + 墙身
    ctx.box(X - W - 0.08, Y - D - 0.08, Z, X + W + 0.08, Y + D + 0.08, Z + 0.28, STONE, S);
    ctx.box(X - W, Y - D, Z + 0.28, X + W, Y + D, Z + H, WOOD, S + 11);

    // 2. 木板横缝（四面都铺，深度测试自动选可见面）
    for (let z = Z + 0.44; z < Z + H - 0.06; z += 0.26) {
      for (let x = -W + 0.06; x < W - 0.02; x += 0.09) {
        ctx.plot(X + x, Y + D + 0.03, z, seamC);
        ctx.plot(X + x, Y - D - 0.03, z, seamC);
      }
      for (let y = -D + 0.06; y < D - 0.02; y += 0.09) {
        ctx.plot(X + W + 0.03, Y + y, z, seamC);
        ctx.plot(X - W - 0.03, Y + y, z, seamC);
      }
    }

    // 3. 墙面面板助手：axis 'y' 贴前后墙，'x' 贴左右墙
    function face(axis, sgn, u0, v0, hw, hh, body, hi) {
      for (let u = -hw; u <= hw + 1e-6; u += 0.06) {
        for (let v = -hh; v <= hh + 1e-6; v += 0.06) {
          const edge = Math.abs(u) > hw - 0.055 || Math.abs(v) > hh - 0.05;
          const c = edge ? frameC : (v > hh * 0.2 ? hi : body);
          if (axis === 'y') ctx.plot(u0 + u, Y + sgn * (D + 0.05), v0 + v, c);
          else              ctx.plot(X + sgn * (W + 0.05), u0 + u, v0 + v, c);
        }
      }
    }

    // 门（前墙偏左）+ 把手
    face('y', 1, X - W * 0.42, Z + 0.28 + 0.52, 0.26, 0.52, doorC, doorC);
    ctx.plot(X - W * 0.42 + 0.2, Y + D + 0.07, Z + 0.28 + 0.5, ctx.rgb(214, 178, 96));
    // 四面各一扇窗
    face('y',  1, X + W * 0.45, Z + 1.34, 0.22, 0.17, winIn, winHi);
    face('y', -1, X + W * 0.45, Z + 1.34, 0.22, 0.17, winIn, winHi);
    face('x',  1, Y + D * 0.12, Z + 1.34, 0.22, 0.17, winIn, winHi);
    face('x', -1, Y + D * 0.12, Z + 1.34, 0.22, 0.17, winIn, winHi);

    // 4. 山墙三角（±x 端面，用 plot 铺平面）
    for (let y = -D; y <= D + 1e-6; y += 0.09) {
      const top = Z + H + (RIDGE - H) * (1 - Math.abs(y) / D);
      for (let z = Z + H; z <= top; z += 0.09) {
        const c = ctx.hash(Math.round((y + 4) * 43) + Math.round((z - Z) * 71), S) > 0.5 ? wallA : wallB;
        ctx.plot(X + W + 0.01, Y + y, z, c);
        ctx.plot(X - W - 0.01, Y + y, z, c);
      }
    }

    // 5. 双坡屋面 + 落叶覆盖
    const halfX = W + 0.06;
    const nU = 24, nV = 15;
    for (let sg = 1; sg >= -1; sg -= 2) {
      const base = sg > 0 ? 0 : 701;
      for (let iu = 0; iu <= nU; iu++) {
        const u = -1 + 2 * iu / nU;
        const px = X + u * halfX;
        for (let iv = 0; iv <= nV; iv++) {
          const v = iv / nV;
          const py = Y + sg * (D + OV) * (1 - v);
          const pz = Z + H + (RIDGE - H) * v;
          // 屋面底色（暗木瓦）
          ctx.plot(px, py, pz, ctx.hash(iu * 31 + iv * 17 + base, S) > 0.4 ? roofC : roofD);

          // 落叶：低频噪声成团 + 檐口/屋脊加密
          const cov = ctx.noise((u + 1) * 2.6 + (sg > 0 ? 0 : 11), v * 2.2 + 3.7);
          const boost = 0.22 * (1 - v) + 0.12 * v * v * v;
          if (cov + boost > 0.95 - P.leaves * 0.7) {
            const g = ctx.hash(iu * 73 + iv * 149 + base, S + 3);
            if (g > 0.12) {
              const lc = g > 0.78 ? leafA : g > 0.42 ? leafB : leafC;
              ctx.plot(px, py, pz + 0.05, lc);   // 抬高一点，压过屋面底色
            }
          }
        }
      }
    }

    // 6. 檐口垂下的叶串（两坡各一排）
    for (let sg = 1; sg >= -1; sg -= 2) {
      for (let iu = 0; iu <= nU * 2; iu++) {
        const u = -1 + iu / nU;
        const g = ctx.hash(iu * 97 + 23 + (sg > 0 ? 0 : 313), S + 21);
        if (g < P.leaves * 0.85) {
          const px = X + u * halfX;
          const py = Y + sg * (D + OV + 0.02);
          const pz = Z + H - 0.03 - g * 0.18;
          ctx.plot(px, py, pz, g > 0.45 ? leafB : leafC);
          ctx.plot(px, py, pz - 0.08, leafC);
        }
      }
    }

    // 7. 石烟囱（从屋面穿出）+ 顶部落叶
    const chX = X - W * 0.46, chY = Y + D * 0.08;
    const roofAt = Z + H + (RIDGE - H) * (1 - Math.abs(chY - Y) / (D + OV));
    ctx.box(chX - 0.21, chY - 0.21, roofAt - 0.4, chX + 0.21, chY + 0.21, roofAt + 0.52, CHIM, S + 7);
    for (let i = 0; i < 7; i++) {
      const g = ctx.hash(i * 37 + 9, S + 33);
      ctx.plot(chX - 0.18 + g * 0.36, chY - 0.18 + ctx.hash(i * 53 + 3, S) * 0.36,
               roofAt + 0.54, g > 0.5 ? leafA : leafB);
    }

    // 8. 地面阴影
    ctx.shadow(W + 0.5, 1, 0.5);
  }
});
```

---

## oriental-pearl — 东方明珠

| 项 | 内容 |
|---|---|
| **ID** | `oriental-pearl` |
| **来源** | `reference/lofi-weather/js/cities/shanghai.js` 的 `orientalPearl` / `pearlOrb` · `demo/kit/ref-shanghai.js` |
| **形态** | 三球三柱电视塔：三根斜撑 + 三根立柱 + 粉/青/金三球 + 太空舱 + 天线 |
| **分类** | 建筑 |

### 参数

| 参数 | 默认 | 区间 | 步进 | 说明 |
|------|------|------|------|------|
| `height` | 15 | 10 ~ 22 | 0.5 | 塔总高（世界单位），所有高度与半径同倍率缩放 |
| `ballScale` | 1 | 0.6 ~ 1.5 | 0.05 | 三个球的大小倍率（只放大球，不改塔高） |
| `spread` | 1 | 0.7 ~ 1.4 | 0.05 | 斜撑与底座的张开倍率 |

### 碰撞体

`{"type":"cylinder","r":3.4,"h":15}`（半径按 `spread=1` 的底座外沿；不含球体与天线）

### 移植清单

- 代码：`demo/kit/ref-shanghai.js`
- 注册表：`docs/kit/registry.md` · 建筑节
- 依赖引擎：`demo/engine.js` 的 `sphere/capsule/box/plot/rampOf/castShadow`
- 场景版（带 emit 夜景发光）：`reference/lofi-weather/js/cities/shanghai.js`，说明见 `docs/analysis-lofi-weather.md §7`

### 实现说明

【与 lofi-weather 版的差异】场景版用 `emit` 缓冲 + 夜间后处理让球体和灯带真正发光，并有灯池；构件库没有昼夜系统，所以这里用高饱和基色（粉/青/金）+ **两档硬色块 + 暗轮廓**表达"像素发光球"（不是引擎的连续球面渐变），灯带用 `rampOf(OP_GLOW)[4]` 的亮青像素。形态、比例、三球配色与场景版一致。

【关键实现】
- 三根斜撑按 120° 分布（`π/2, 7π/6, 11π/6`），从半径 `2.95*spread` 的底座外沿汇到 `0.62*spread` 的塔心；三根立柱贯穿到 z=12.8。
- 灯带必须画在柱面**外侧**：`ctx.plot(px + .17*k, py + .17*k, z, glow)`。画在柱心会被柱体自己的深度挡掉，整条灯带消失（场景版同样踩过这个坑）。
- 高度参数 `k = height/15` 同时乘 z 与半径，保证任意高度比例不变；`ballScale` 只乘球半径。
- 底座两级 box（±3.4 → ±3.0），斜撑落地处各加一个小球基座，避免"柱子插在空气里"。
- 球体用本地 `pearlBall` 逐像素画（`ctx.screen/unproject`，支持旋转/缩放）：`l > .12` 亮档、其余中档、边缘一圈暗轮廓，**只有 3 个颜色**，放大也不会读成 3D 球。粉球最大（r 1.15k）、青球 0.82k、金球 0.6k，太空舱用 capsule 收口，天线到 15.1k。

【坑】
- 颜色两张皮：`OP_*` 基色数组只喂 `sphere/capsule/box`；`ctx.rampOf(OP_GLOW)[4]` 是打包像素，只能喂 `plot`。
- 灯带步进 0.12 世界单位约 1px，再稀会断成虚线。
- `collision` 是固定值，不随 `height/spread` 参数联动；极端参数下需要编辑器手动调碰撞体。

【代码规模】约 95 行。
