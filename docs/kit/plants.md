# 花草灌木变体配方卡

> 注册表：[registry.md §3](registry.md)
> 核心原则：**花草的差异 = 高度 + 密度 + 是否随地形 + 是否随风**。多数差异是参数。

---

## 0. 分层

```
   🌸 花        ← 最高，最少
  🌿 灌木       ← 中
 ▓▓▓ 草         ← 最矮，最密
════════ 地面
```

**这个项目里草是"贴地的一层"，灌木是"小树冠"，花是"草尖的换色"。**
三者共用同一套机制，只是参数不同。

---

## 1. `grass-tuft` 草丛

| 项 | 内容 |
|----|------|
| **来源** | `ref` `engine.js:160` `growGrass()` + `engine.js:172` `drawTufts(t)` |
| **状态** | ✅ |

### 形态

1～3 像素高的短草，17% 概率播种。风吹时整簇摆动，影子里自动变暗。

### 参数组 `density/height`

| 参数 | 默认 | 区间 | 作用 |
|------|------|------|------|
| `density` | .17 | .05～.35 | 播种概率 |
| `height` | 1～3 | 1～5 | 单株像素高 |
| `windAmp` | .95 | .3～1.5 | 摆幅 |

### 关键算法

**播种（必须在 kinds 写好之后）**

```js
for (let iy = 3; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
  const i = iy * W + ix;
  if (kinds[i] !== KIND_GRASS || hash(ix*3, iy*5) > .17) continue;
  const height = 1 + (hash(ix, iy*2) * 3 | 0);
  tufts.push({
    ix, iy, i, height,
    base: Math.round(noise(ix*.09, iy*.18) * 2.2),          // 基准色阶
    phase: ix*.11 + iy*.19 + hash(ix, iy)*.9,               // 相位
    bloom: hash(ix*7, iy) < .022 ? rgb(...(hash(ix,iy) > .5 ? [250,246,226] : [240,200,84])) : 0,
  });
}
```

**只有 `kinds[i] === KIND_GRASS` 的像素才长草** → 球场/屋顶上自动没有草。

**绘制（每帧）**

```js
const gust = Math.sin(t*.8 + tuft.phase) + .5*Math.sin(t*2.1 + tuft.phase*2.3);
const colors = staticShadow[tuft.i] ? tuftDark : tuftLit;   // ← 影内自动变暗
for (let k = 1; k <= tuft.height; k++) {
  const jx = tuft.ix + Math.round(gust * .95 * k / 3), jy = tuft.iy - k;
  if ((kinds[j] !== KIND_GRASS && kinds[j] !== KIND_NONE) || zb[j] !== groundZ[j]) continue;
  pix[j] = tuft.bloom && k === tuft.height ? tuft.bloom
         : colors[clamp(tuft.base + k + (gust > 1 ? 1 : 0), 1, 4)];
}
```

| 细节 | 说明 |
|------|------|
| `Math.round(gust * .95 * k / 3)` | 摆幅随草高递增（`k/3`），且**取整** |
| `staticShadow[tuft.i] ? tuftDark : tuftLit` | **影子里的草自动变暗**——最省事的一笔 |
| `tuft.base + k` | 草尖比草根亮（色阶随高度递增） |
| `gust > 1 ? 1 : 0` | 阵风时整体提亮一档 |
| `zb[j] !== groundZ[j]` | 只画没被遮挡的草 |

### 移植清单

1. 需要 `kinds` 数组和 `staticShadow` 数组。
2. `growGrass()` 在 `bake()` 里地面画完之后调用。
3. `drawTufts(windT)` 每帧调用，**必须在 `applyShadows()` 之前**（要读 `staticShadow`）。
4. `tuftLit` / `tuftDark` 预计算：
   ```js
   const tuftLit = GRASS.map(c => rgb(...c));
   const tuftDark = GRASS.map(c => rgb(c[0]*.54, c[1]*.52, c[2]*.72));
   ```

### 坑

- **`staticShadow` 必须存在**。demo 的 `engine.js` 没有这个数组——这是"影子里的东西不会变暗"的根因。
- `drawTufts` 用 `pix[j] = ...` **直接写像素，不写 `zb`**。草是贴在地面上的，不该有深度。
- 草高最多 3 像素。更高会读成小树。

---

## 2. `flower` 小花

| 项 | 内容 |
|----|------|
| **来源** | `ref` `engine.js:168`（`bloom` 字段） |
| **状态** | ✅ **不是独立变体**，是 `grass-tuft` 的参数 |

### 形态

草丛顶端换成白色或黄色的花点。约 2.2% 概率出现。

### 参数组 `rate/color`

| 参数 | 默认 | 区间 | 作用 |
|------|------|------|------|
| `rate` | .022 | .01～.06 | 开花概率 |
| `color` | 白 `[250,246,226]` / 黄 `[240,200,84]` | — | 花色 |

### 关键算法

```js
bloom: hash(ix*7, iy) < .022 ? rgb(...(hash(ix, iy) > .5 ? [250,246,226] : [240,200,84])) : 0,
```

绘制时：

```js
pix[j] = tuft.bloom && k === tuft.height ? tuft.bloom : colors[...];
```

**只有草尖那一像素**是花色 → 一朵小花。

### 移植清单

不需要独立实现。给 `grass-tuft` 加 `bloomRate` / `bloomColor` 参数即可。

### 坑

- 花色要用**暖白** `[250,246,226]`，纯白在草地上太扎眼。
- 花只出现在草尖，不是整簇都白。

---

## 3. `scatter-grass` 静态草点

| 项 | 内容 |
|----|------|
| **来源** | `demo` `forest.js:60` `scatterGrass()` |
| **状态** | ✅ |

### 形态

烘焙时直接写像素的短草。没有风动，但可以写进 `bakedPix` 参与阴影。

### 参数组 `count`

| 参数 | 默认 | 区间 | 作用 |
|------|------|------|------|
| `count` | 2600 | 500～5000 | 草点总数 |

### 关键算法

```js
for (let n = 0; n < 2600; n++) {
  const x = (hash(n,21)-.5)*2*RX, y = (hash(n,22)-.5)*2*RY;
  if (islandE(x,y) > .9) continue;
  const p = project(x, y, 0), ix = p.sx|0, iy = p.sy|0;
  const i = iy*W+ix;
  if (!ground[i] || zb[i] !== groundZ[i]) continue;
  const h = 1 + (hash(n,23)*3|0);
  const c = hash(n,24) > .8 ? GRASS[3] : hash(n,24) > .4 ? GRASS[2] : GRASS[1];
  for (let k = 1; k <= h; k++) {
    const j = (iy-k)*W+ix;
    if (!ground[j] || zb[j] !== groundZ[j]) break;
    pix[j] = rgb(...c);
  }
}
```

**按世界坐标采样再投影**，而不是直接遍历屏幕像素 → 草不会被投影拉伸。

### 与 `grass-tuft` 的取舍

| | `grass-tuft` (ref) | `scatter-grass` (demo) |
|---|---|---|
| 风动 | ✅ | ❌ |
| 影内变暗 | ✅ 自动 | ❌ 需自己判断 |
| 性能 | 每帧遍历（草少时 OK） | 烘焙一次，零帧开销 |
| 适合 | 近景、需要风的场景 | 远景、大面积草地 |

**大面积草地用 `scatter-grass`（烘焙），近景点缀用 `grass-tuft`（动态）**，两者可共存。

### 坑

- 直接写 `pix` 不写 `zb` → 草不会挡住后面的物体。
- `break` 而不是 `continue`：草碰到非地面像素就停止向上生长。

---

## 4. `potted-plant` 盆栽

| 项 | 内容 |
|----|------|
| **来源** | `ref` `laundry:150-157` |
| **状态** | ✅ |

### 形态

方花盆 + 14 个小球组成的叶簇 + 一片阴影。

### 参数组 `r`

| 参数 | 默认 | 区间 | 作用 |
|------|------|------|------|
| `r` | .4～.5 | .25～.8 | 盆半径 |
| `leafN` | 14 | 8～30 | 叶球数 |
| `potColor` | `POT` | — | 花盆色 |

### 关键算法

```js
box(x - r*.8, y - r*.8, 0, x + r*.8, y + r*.8, r*1.4, POT, x | 0);
for (let k = 0; k < 14; k++) {
  const a = hash(k, x*3) * 6.28, d = hash(k, y*5) * r;
  sphere(x + Math.cos(a)*d, y + Math.sin(a)*d, r*1.7 + hash(k,9)*r, .22, LEAF, 'rough');
}
castShadow(x, y, r, r);
```

**三行 = 一个物件**（盆 / 叶 / 影）。这是"用图元组合出物件"的最简范式。

叶球散布用 `hash(k, x*3)` / `hash(k, y*5)` —— **把位置参数混进 seed**，
这样不同的盆栽位置得到不同的叶分布。

### 坑

- 叶球中心在 `r*1.7`（盆高的 1.7 倍），不是 `r*1.4`。太高会脱节。
- 阴影半径用 `r`（盆宽），不是叶球半径。

---

## 5. `moss` 苔藓斑

| 项 | 内容 |
|----|------|
| **来源** | `ref` `laundry:95` |
| **状态** | ✅ **不是独立变体**，是地面材质的一种 |

### 形态

地面上的深绿色斑块，出现在潮湿的地方。

### 关键算法

```js
if (noise(x*.5, y*.5) > .7 && fine > .55) return rgb(116, 122, 70);
```

**两个条件同时满足**：低频噪声选区域 + 高频 hash 打散像素。

### 移植清单

在 `groundColor()` 里加一行即可。属于地面配色，不算独立变体。

### 坑

- 单用任一个条件都会显得脏。必须双条件。

---

## 6. `fallen-leaf` 落叶

| 项 | 内容 |
|----|------|
| **来源** | `demo` `autumn.js:99` `scatterLeaves()` |
| **状态** | ✅ **不是独立变体**，是地面材质的一种 |

### 形态

铺满地面的金黄落叶。

### 关键算法

见 `demo/autumn.js:99`。属于地面配色（`FLOOR` 5 档），不算独立变体。

---

## 7. 待实现变体的设计要点

### `fern` 蕨类

**骨架**：从基部向外辐射的羽状叶，每片叶是一串逐渐变细的小球。

| 参数 | 说明 |
|------|------|
| `fronds` | 叶片数（4～9） |
| `length` | 叶长 |
| `curl` | 叶尖下垂程度 |

实现要点：叶片沿弧线 `z = z0 - k²*curl` 下垂，末端半径趋近 0。
用 `capsule` 串起来比球串自然。

### `reed` 芦苇

**骨架**：细而高的杆 + 顶端穗。

| 参数 | 说明 |
|------|------|
| `height` | 高度（1.2～2.5，比草高一个数量级） |
| `plume` | 穗长 |
| `bend` | 弯曲度 |

实现：杆用 `capsule`（半径 .02 → .01），穗用一串小球。
**芦苇是"随风摆"的典型**——风幅要比草大得多。

### `ivy` 藤蔓

**骨架**：贴墙/贴地的蔓延曲线 + 沿线的叶片。

| 参数 | 说明 |
|------|------|
| `length` | 蔓延长度 |
| `leafSize` | 叶大小 |
| `surface` | 附着面（`wall` / `ground`） |

实现：曲线上每 `step` 距离放一片叶（`sphere` 压扁），叶色比树冠深。

### `hedge` 树篱

**不是新骨架**——`canopy` 的密集排布版。

| 参数 | 说明 |
|------|------|
| `height` | 高度 |
| `rowGap` | 行距 |
| `colGap` | 株距 |

实现：沿路径排列 `canopy` 的小球，每株只露上部。
**做法 = 复用 `canopy` + 改参数**，不建新 ID。

---

## 8. 花草速查

| ID | 高度 | 风动 | 影内变暗 | 实现成本 |
|----|------|------|----------|----------|
| `grass-tuft` | 1～3 px | ✅ 8fps | ✅ 自动 | 中（需 kinds + staticShadow） |
| `flower` | 草尖 | ✅ | ✅ | 低（`grass-tuft` + 参数） |
| `scatter-grass` | 1～3 px | ❌ | ❌ 手动 | 低 |
| `potted-plant` | .7～1.4 | ❌ | ❌ | 极低 |
| `moss` | 贴地 | ❌ | — | 极低（地面色） |
| `fallen-leaf` | 贴地 | ❌ | — | 极低（地面色） |

---

## 9. 移植清单（总）

| 优先级 | 项 | 说明 |
|--------|----|------|
| 高 | `staticShadow` 数组 | `demo/engine.js` 完全没有。缺它，影子里的草/水/树无法自动变暗 |
| 高 | `grass-tuft` 风动 | demo 只有静态草点。近景场景加上后差别明显 |
| 高 | `growGrass` 的 kinds 判断 | 草只长在草地上 |
| 中 | `flower` 参数 | 草尖换色，一行 |
| 中 | `potted-plant` | 三行一个物件，装饰性极强 |
| 中 | `moss` 地面斑块 | 大面积地面加变化 |
| 低 | `reed` / `fern` / `ivy` | 新骨架 |
| 低 | `hedge` | 复用 `canopy` |

**通用坑**

1. **`staticShadow` 是很多效果的公共依赖**——草、水、树叶都靠它自动变暗。这是 demo 最该补的一块。
2. 草和落叶直接写 `pix` **不写 `zb`**，不参与深度。
3. 动态草必须在 `applyShadows()` 之前画。
4. 风的时间步进是 8fps（`WIND_FPS`），不是帧率。
5. 大面积用 `scatter-grass`（烘焙），近景用 `grass-tuft`（动态），两者可共存。
