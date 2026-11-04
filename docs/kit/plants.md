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
| **来源** | `ref` `engine.js:160/172` · 本项目落地：`demo/village/figures.js`（`growGrass` / `drawTufts`） |
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

## fern — 蕨类

| 项 | 内容 |
|---|---|
| **ID** | `fern` |
| **来源** | `demo/kit/plants.js` · `KIT.register` · studio 生成 |
| **形态** | 从基部向外辐射的羽状叶丛，叶轴沿抛物线弧下垂、末端收细 |
| **分类** | 草木 |

### 参数

| 参数 | 默认 | 区间 | 步进 | 说明 |
|------|------|------|------|------|
| `fronds` | 7 | 4 ~ 9 | 1 | 叶片数（绕基部均匀分布，带确定性的角度抖动） |
| `length` | 1.7 | 0.9 ~ 2.6 | 0.1 | 叶长（世界单位，1 ≈ 人高） |
| `curl` | 0.5 | 0 ~ 1.2 | 0.05 | 叶尖下垂程度：叶轴按 z0 - t²·curl 逐段下沉，值越大越伏地 |

### 碰撞体

`{"type":"cylinder","radius":0.6,"height":1.1}`

### 移植清单

- 代码：`demo/kit/plants.js`
- 注册表：`docs/kit/registry.md` · 草木节
- 依赖引擎：`demo/engine.js` 的 `sphere/capsule/box/plot/rampOf/hash/noise`

### 实现说明

实现要点与差异：

1. **骨架照规格落地**：每片叶是一条 `segs=6` 段的链，段端点按 `z = z0 - t²·curl` 计算（z0 = 0.05 + t·lift 为该段沿叶轴的基准抬升），t 从 1/6 到 1，叶尖累计下沉最多等于 curl。末端 z 用 `Math.max(0.06, ...)` 兜底，防止大 curl + 小 length 时叶尖钻到地面以下。
2. **末端收敛**：段半径 `0.075·(1-t)^0.75·(0.8+0.25L)`，t=1 时为 0.01（趋近 0），保证叶尖是针尖而不是钝头。
3. **胶囊而非球串**：主轴用 `ctx.capsule` 连接相邻段端点，r0/r1 分别取上一段与当前段的半径，因此段与段之间半径连续、没有球串的“糖葫芦”感 —— 规格里明确建议的做法。
4. **羽状**：规格写的是“羽状叶”，所以在每段中点沿水平侧向向量 (-sinθ, cosθ) 各点一枚小球作为羽片，reach 随 (1-t) 递减，越靠叶尖羽片越小。羽片用 `ctx.sphere`（color 参数语义确定），主轴才用 capsule。
5. **capsule 的 colorOf 契约**：按参数名 `colorOf` 传入函数 `(u) => 色阶元素`，u>0.6 时换用亮一档的色阶索引，形成叶尖受光。若某个运行时版本这里实际接受的是颜色数组而非函数，把该回调直接换成 `blade[ci]` 即可，其余代码不用动。
6. **颜色**：基色 `[92,148,62]`（蕨绿），全部经 `ctx.rampOf` 取 5 档；沿叶长从基部深色渐变到叶尖亮色，再叠加每片叶自己的 ±0.5 档偏移（ha/hb 驱动），避免 7 片叶颜色完全一致。朝向背光的羽片用 base 索引、朝光侧用 +1 档，呼应“侧面亮一档”的体积规则。
7. **随机**：全部走 `ctx.hash(k, ctx.seed)`，同一 seed 下方位角、叶长、抬升、色阶偏移完全可复现，无 `Math.random()`。
8. **顶层作用域**：只有一次 `KIT.register({...})` 调用，没有顶层 const/let，不会与其它构件模块的顶层名字冲突。
9. **阴影**：末尾 `ctx.shadow(min(1.6, len*0.8), 1, .5)`，半径随 length 参数缩放，短叶丛不会拖出一大片假影。
10. **与已有植物的差异**：`shrub`/`canopy` 是“有干 + 球堆冠”，本构件是“无主干、贴地辐射的叶丛”，骨架结构不同，因此按规范独立成 ID（不是参数组）。碰撞体用低矮圆柱（r=0.6, h=1.1），只罩住叶丛实际占地，不含外伸羽片的尖端。

### 实现

```js
KIT.register({
  id: 'fern',
  name: '蕨类',
  category: 'plant',
  desc: '从基部向外辐射的羽状叶丛，叶轴沿抛物线弧下垂、末端收细',
  params: {
    fronds: { def: 7, min: 4, max: 9, step: 1, desc: '叶片数' },
    length: { def: 1.7, min: 0.9, max: 2.6, step: 0.1, desc: '叶长（世界单位）' },
    curl: { def: 0.5, min: 0, max: 1.2, step: 0.05, desc: '叶尖下垂程度' },
  },
  collision: { type: 'cylinder', radius: 0.6, height: 1.1 },

  draw(ctx) {
    const P = ctx.params;
    const seed = ctx.seed;
    const n = Math.round(P.fronds);
    const len = P.length;
    const curl = P.curl;
    const blade = ctx.rampOf([92, 148, 62]);
    const segs = 6;

    for (let i = 0; i < n; i++) {
      const ha = ctx.hash(i * 4.7 + 0.5, seed);
      const hb = ctx.hash(i * 2.9 + 1.7, seed);

      // 绕基部的方位角：均匀 + 少量抖动，避免读成机械的星形
      const ang = (i / n) * 6.28318 + (ha - 0.5) * 0.6;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const sx = -sa; // 水平侧向单位向量，用于羽片
      const sy = ca;

      const L = len * (0.8 + hb * 0.3);
      const lift = L * (0.5 + ha * 0.2); // 每片叶初始上扬量略不同

      let px = 0;
      let py = 0;
      let pz = 0.05;
      let pr = 0.07;

      for (let k = 1; k <= segs; k += 1) {
        const t = k / segs;

        // 水平方向线性外展
        const rad = L * t * 0.9;
        const x = ca * rad;
        const y = sa * rad;

        // 骨架：z = z0 - t²·curl，z0 为该段沿叶轴的基准抬升
        const z0 = 0.05 + t * lift;
        const z = Math.max(0.06, z0 - t * t * curl);

        // 末端半径趋近 0：t→1 时截面收细成针尖
        const rr = Math.max(0.01, 0.075 * Math.pow(1 - t, 0.75) * (0.8 + L * 0.25));

        const ci = ctx.clamp(
          Math.round(1.4 + t * 1.6 + (hb - 0.5) * 0.9 + (ha - 0.5) * 0.6),
          0,
          4
        );
        const ci2 = ctx.clamp(ci + 1, 0, 4);

        // 主轴：一段胶囊，沿长度从基部色渐变到受光的叶尖色
        ctx.capsule(
          [px, py, pz],
          [x, y, z],
          pr,
          rr,
          function (u) {
            return u > 0.6 ? blade[ci2] : blade[ci];
          },
          'rough'
        );

        // 羽片：每段中点向两侧各伸一枚小球，长度随 t 递减
        if (k > 1) {
          const mx = (px + x) * 0.5;
          const my = (py + y) * 0.5;
          const mz = (pz + z) * 0.5 - 0.01;
          const reach = (0.11 + 0.06 * L) * (1 - t);
          const ll = Math.max(0.012, rr * 0.82);
          ctx.sphere(mx + sx * reach, my + sy * reach, mz - reach * 0.3, ll, blade[ci2], 'rough');
          ctx.sphere(mx - sx * reach, my - sy * reach, mz - reach * 0.3, ll, blade[ci], 'rough');
        }

        px = x;
        py = y;
        pz = z;
        pr = rr;
      }
    }

    ctx.shadow(Math.min(1.6, len * 0.8), 1, 0.5);
  },
});
```

## reed — 芦苇

| 项 | 内容 |
|---|---|
| **ID** | `reed` |
| **来源** | `demo/kit/plants.js` · `KIT.register` · studio 生成 |
| **形态** | 细高弯杆顶着毛茸茸的穗，风一吹整株大幅摇摆 |
| **分类** | 草木 |

### 参数

| 参数 | 默认 | 区间 | 步进 | 说明 |
|------|------|------|------|------|
| `height` | 1.8 | 1.2 ~ 2.5 | 0.1 | 高度（世界单位，比草高一个数量级） |
| `plume` | 0.32 | 0.15 ~ 0.55 | 0.01 | 穗长 |
| `bend` | 0.45 | 0 ~ 1 | 0.05 | 弯曲度（静态风幅） |

### 碰撞体

`{"type":"cylinder","radius":0.16,"height":1.8}`

### 移植清单

- 代码：`demo/kit/plants.js`
- 注册表：`docs/kit/registry.md` · 草木节
- 依赖引擎：`demo/engine.js` 的 `sphere/capsule/box/plot/rampOf/hash/noise`

### 实现说明

**实现要点**

1. **杆（规格硬性）**：半径严格 `.02 → .01`，用 4 段 `capsule` 贴着一条二次贝塞尔弧走。控制点高度压到 `0.58h`、横向只给顶端的 18%，这样杆是"根部直、越往上越弯"的自然弧线，而不是一根斜直线。
2. **弯曲度**：`bend` 只控制顶端横移量 `sway = bend × 株高 × 0.5`，bend=1 时顶端偏移半株高（约 26°），bend=0 时垂直。草的典型摆幅约 `0.1 × 株高`，这里默认值（0.45）就已经是草的 2.25 倍，符合"风幅要比草大得多"。
3. **穗（真实下垂弧）**：先取杆顶的切向 `tip - ctrl` 归一化，再叠加 `t² × plume × 0.55` 的重力项——末端下沉量随距离平方增长，是抛物弧而不是斜直线。另外给了一点点同向侧偏 `t × plume × 0.18`，避免穗和杆共面显得扁平。
4. **穗球半径**：`0.032 + sin(t·π) × 0.018`，中段最粗，读作"一簇绒毛"而不是等大的珠子。最小 0.032 是下限——360×280 画布下再小就整颗消失。
5. **确定性**：朝向、株高微扰、每颗穗球的明度抖动全部走 `ctx.hash(k, ctx.seed)`，无 `Math.random()`。

**坑**

- `ctx.capsule` 的颜色参数名是 `colorOf`（不是 `color`），它是**逐段取色函数** `(t) => color`，t 是该段内的归一化位置。传裸 `[r,g,b]` 数组会崩。这里用闭包把段序号 `i` 一起捕获，映射到整根杆的 0~4 色阶。
- 杆太细（半径 0.02 ≈ 1.5px），如果再加描边会糊成黑线，所以只用 `'rough'` 模式，靠色阶拉开体积。
- 穗球之间间距 `plume/5 ≈ 0.064` 小于球直径（约 0.09），保证连续成穗；如果调大 `plume` 上限需同步加 `beads`，否则会散成断珠。

**与已有构件的差异**

- 与 grass 类：grass 是贴地矮丛、多叶片向外铺开；reed 是**单株高杆**，无叶片，高度是草的 5~10 倍，且弯曲发生在整根杆上而非叶尖。
- 与 tree 类：树有树干 + 冠层团块；reed 的"冠"只有顶端一小簇穗，不构成轮廓主体。
- 规格只定义了"杆 + 穗"两个骨架特征，因此**没有加叶片 / 叶鞘**，保持与配方卡一致。

### 实现

```js
KIT.register({
  id: 'reed',
  name: '芦苇',
  category: 'plant',
  desc: '细高弯杆顶着毛茸茸的穗，风一吹整株大幅摇摆',
  params: {
    height: { def: 1.8, min: 1.2, max: 2.5, step: 0.1, desc: '高度（世界单位，比草高一个数量级）' },
    plume: { def: 0.32, min: 0.15, max: 0.55, step: 0.01, desc: '穗长' },
    bend: { def: 0.45, min: 0, max: 1, step: 0.05, desc: '弯曲度（静态风幅）' },
  },
  collision: { type: 'cylinder', radius: 0.16, height: 1.8 },
  draw(ctx) {
    const h = ctx.params.height;
    const plume = ctx.params.plume;
    const bend = ctx.params.bend;

    const stalk = ctx.rampOf([126, 146, 94]);   // 枯黄绿杆
    const seed = ctx.rampOf([204, 178, 120]);   // 米金色穗

    // 每株随机朝向 + 株高微扰，整片芦苇才不重样
    const ang = ctx.hash(1, ctx.seed) * Math.PI * 2;
    const hh = h * (0.92 + ctx.hash(2, ctx.seed) * 0.16);
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);

    // 风幅：顶端横移可达株高的 50%，比草的摆幅大一个数量级
    const sway = bend * hh * 0.5;
    const tip = [dx * sway, dy * sway, hh];
    const ctrl = [dx * sway * 0.18, dy * sway * 0.18, hh * 0.58];

    // 二次贝塞尔：根在原点，顶端被风吹偏，控制点压低形成弧线
    const at = (t) => {
      const u = 1 - t;
      return [
        2 * u * t * ctrl[0] + t * t * tip[0],
        2 * u * t * ctrl[1] + t * t * tip[1],
        2 * u * t * ctrl[2] + t * t * tip[2],
      ];
    };

    // 杆：4 段 capsule 贴着弧线走，半径 .02 -> .01，底部深顶部亮
    const SEG = 4;
    for (let i = 0; i < SEG; i++) {
      const t0 = i / SEG;
      const t1 = (i + 1) / SEG;
      const shade = (k) => stalk[ctx.clamp(Math.round(((i + k) / SEG) * 4), 0, 4)];
      ctx.capsule(
        at(t0), at(t1),
        ctx.lerp(0.02, 0.01, t0),
        ctx.lerp(0.02, 0.01, t1),
        shade, 'rough'
      );
    }

    // 穗：沿杆顶的切向伸出，末端被重力压下（t*t 下垂，是弧线不是直线）
    const tx = tip[0] - ctrl[0];
    const ty = tip[1] - ctrl[1];
    const tz = tip[2] - ctrl[2];
    const tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
    const nx = tx / tl, ny = ty / tl, nz = tz / tl;

    const beads = 5;
    for (let i = 0; i < beads; i++) {
      const t = (i + 1) / beads;
      const drop = t * t * plume * 0.55;
      const px = tip[0] + nx * plume * t + dx * t * plume * 0.18;
      const py = tip[1] + ny * plume * t + dy * t * plume * 0.18;
      const pz = tip[2] + nz * plume * t - drop;
      const r = 0.032 + Math.sin(t * Math.PI) * 0.018;   // 中段最粗
      const lv = 2 + Math.round(ctx.hash(10 + i, ctx.seed));
      ctx.sphere(px, py, pz, r, seed[ctx.clamp(lv, 0, 4)], 'rough');
    }

    ctx.shadow(0.16 + hh * 0.06, 1, 0.5);
  },
});
```

## ivy — 藤蔓

| 项 | 内容 |
|---|---|
| **ID** | `ivy` |
| **来源** | `demo/kit/plants.js` · `KIT.register` · studio 生成 |
| **形态** | 贴墙或贴地蔓延的藤，沿曲线等距密布深绿小叶 |
| **分类** | 草木 |

### 参数

| 参数 | 默认 | 区间 | 步进 | 说明 |
|------|------|------|------|------|
| `length` | 2.6 | 1 ~ 6 | 0.1 | 蔓延长度（世界单位） |
| `leafSize` | 0.16 | 0.06 ~ 0.4 | 0.01 | 最大叶半径（越靠梢越小） |
| `surface` | 0 | 0 ~ 1 | 1 | 附着面：0=贴墙，1=贴地 |

### 碰撞体

`{"type":"cylinder","radius":0.28,"height":2.4}`

### 移植清单

- 代码：`demo/kit/plants.js`
- 注册表：`docs/kit/registry.md` · 草木节
- 依赖引擎：`demo/engine.js` 的 `sphere/capsule/box/plot/rampOf/hash/noise`

### 实现说明

#### 实现要点

1. **骨架**：一条主蔓延曲线（双频正弦 + 缓慢漂移），按 `step = 0.15` 等距采点，左右交替出叶。规格里的 `step` 是内部量，不做成参数，避免参数表溢出配方卡。
2. **两套坐标轴**：
   - `wall`：主方向 +z（向上爬），横向 ±x，法向 +y（朝相机）
   - `ground`：主方向 +x（向前铺），横向 ±y，法向 +z（朝上）
   同一段循环切换轴向，不复制两份绘制代码。
3. **“压扁”的处理**：运行时 `ctx.sphere` 只有单一半径，无法做三轴缩放。改用「主球 + 沿横向错位 0.5~0.55 倍半径的小球」拼出横向拉长的椭圆轮廓，法向只占薄薄一层——像素级读起来就是扁叶，且完全走引擎原语、自动深度测试。
4. **深度顺序**：叶片比藤茎向相机多偏 0.03（贴墙 +y / 贴地 +z），否则茎会把叶心盖掉。这是规格里“墙面细节要向相机偏移”的同一条规则。
5. **叶色**：`[38,74,40]` 与 `[52,96,50]` 两档深绿，取色阶中低档，明显深于常规树冠；茎用更灰的 `[44,60,36]` 退到后面。
6. **生长感**：叶半径随 t 从 0.72 倍长到 1 倍（`leafSize` 是最大叶半径），梢部自然收细。

#### 坑

- **surface 的类型**：参数表只支持数值滑杆，所以写成 `0=贴墙 / 1=贴地`；代码同时兼容 `'wall'/'ground'` 字符串，若编辑器日后改成枚举传字符串也不会崩。
- **贴地时的 z**：球心必须抬到 `0.04 + ls*0.28`，直接放在 `ctx.z` 会让半个球沉到地面以下，深度测试仍会画出下半球，视觉上像陷进地里。
- **性能**：`length` 上限 6 时 n=40，最多 40 茎球 + 80 叶球 = 120 次 sphere，属可控范围；不要再往上加 `length` 区间。
- **碰撞体**：藤蔓是贴面装饰、不占地面，`cylinder r=0.28 h=2.4` 只做最小占地标记；贴地模式下它会沿 x 铺出 6 单位，远超碰撞体——这是有意的，避免一丛地被藤占掉一整块地面。

#### 与已有构件的差异

| 构件 | 差异 |
|------|------|
| `shrub` / `canopy` | 那些是**体**（球堆冠），藤蔓是**线**骨架，没有主干、没有冠心 |
| `broadleaf` | 树有树干与分层树冠；藤是单条曲线 + 沿线叶，高度随 `length` 而非 `scale` |
| 贴地使用时 | 可当“地被藤/爬藤地毯”，与 `ground.js` 的水面/草地材质正交，不冲突 |

首次登记需补：`docs/kit/registry.md` 一行 + `docs/kit/plants.md` 配方卡（按三件套纪律）。

### 实现

```js
KIT.register({
  id: 'ivy',
  name: '藤蔓',
  category: 'plant',
  desc: '贴墙或贴地蔓延的藤，沿曲线等距密布深绿小叶',
  params: {
    length:   { def: 2.6,  min: 1,    max: 6,   step: 0.1,  desc: '蔓延长度（世界单位）' },
    leafSize: { def: 0.16, min: 0.06, max: 0.4, step: 0.01, desc: '最大叶半径（越靠梢越小）' },
    surface:  { def: 0,    min: 0,    max: 1,   step: 1,    desc: '附着面：0=贴墙，1=贴地' },
  },
  collision: { type: 'cylinder', radius: 0.28, height: 2.4 },

  draw(ctx, inst) {
    const P = ctx.params;
    const wall = !(P.surface === 1 || P.surface === 'ground');
    const len = P.length;
    const leaf = P.leafSize;
    const step = 0.15;                 // 叶片间距（规格内部量，不对外暴露）

    // 叶色比树冠深：两档深绿，基色间通道差 10~25
    const deep = ctx.rampOf([38, 74, 40]);
    const mid  = ctx.rampOf([52, 96, 50]);
    const stem = ctx.rampOf([44, 60, 36])[1];

    const n = Math.max(4, Math.round(len / step));
    const phase = ctx.hash(1, ctx.seed) * 6.2832;
    const amp   = 0.18 + ctx.hash(2, ctx.seed) * 0.3;
    const drift = (ctx.hash(3, ctx.seed) - 0.5) * 0.9;
    const yBase = ctx.y + 0.03;        // 贴墙时整体向相机偏移，避免被墙面吞掉

    let px = ctx.x, py = ctx.y, pz = ctx.z;

    for (let i = 0; i <= n; i++) {
      const t = i / n;
      // 等距采点（仅中段允许 ±0.35*step 的自然抖动）
      const wobble = (i > 0 && i < n) ? (ctx.hash(i * 5 + 11, ctx.seed) - 0.5) * step * 0.35 : 0;
      const d = t * len + wobble;
      // 蔓延曲线：双频正弦摆动 + 缓慢漂移，起手收窄、越爬越松
      const sway = Math.sin(t * 5.2 + phase) * amp * (0.25 + t)
                 + Math.sin(t * 11.7 + phase * 1.7) * amp * 0.25
                 + drift * t;

      const x = wall ? ctx.x + sway : ctx.x + d;
      const y = wall ? yBase : ctx.y + sway;
      const z = wall ? ctx.z + d : ctx.z + 0.02;

      // 藤茎：相邻采点间补一个中点球，连成不断的细线
      if (i > 0) {
        ctx.sphere((x + px) * 0.5, (y + py) * 0.5, (z + pz) * 0.5, 0.03, stem, 'rough');
      }
      ctx.sphere(x, y, z, 0.03, stem, 'rough');

      // 叶片：左右交替出叶，主球 + 沿横向错位的小球近似"压扁"
      const side = (i % 2 === 0) ? 1 : -1;
      const ls = leaf * (0.72 + 0.28 * Math.min(1, t * 2.4));
      const spread = ls * (0.55 + ctx.hash(i * 7 + 3, ctx.seed) * 0.5);
      const tone = ctx.hash(i * 13 + 7, ctx.seed);
      const col = tone < 0.4 ? deep[1] : (tone < 0.78 ? deep[2] : mid[2]);

      if (wall) {
        // 贴墙：叶面法向朝 +y（相机），只占薄薄一层
        ctx.sphere(x + side * spread, y + 0.03, z - ls * 0.1, ls, col, 'rough');
        ctx.sphere(x + side * (spread + ls * 0.5), y + 0.025, z - ls * 0.1, ls * 0.6, col, 'rough');
      } else {
        // 贴地：叶片压在地面上，抬高球心避免沉入地下
        const lift = 0.04 + ls * 0.28;
        ctx.sphere(x, y + side * spread, z + lift, ls * 0.85, col, 'rough');
        ctx.sphere(x, y + side * (spread + ls * 0.55), z + lift * 0.85, ls * 0.5, col, 'rough');
      }

      px = x; py = y; pz = z;
    }

    ctx.shadow(wall ? 0.45 : Math.min(1.8, len * 0.32), 1, 0.5);
  },
});
```

## hedge — 树篱

| 项 | 内容 |
|---|---|
| **ID** | `hedge` |
| **来源** | `demo/kit/plants.js` · `KIT.register` · studio 手写 |
| **形态** | 沿一条线密集排布的灌木带，顶部修剪平整，读作绿墙 |

### 参数

| 参数 | 默认 | 区间 | 步进 | 说明 |
|------|------|------|------|------|
| `length` | 4.0 | 1 ~ 14 | 0.2 | 篱笆长度（沿 x） |
| `height` | 1.0 | 0.4 ~ 2.4 | 0.05 | 篱笆高度 |
| `depth` | 0.7 | 0.3 ~ 2.4 | 0.05 | 篱笆厚度（沿 y） |
| `rows` | 2 | 1 ~ 4 | 1 | 排布行数 |
| `colGap` | 0.42 | 0.2 ~ 1.2 | 0.02 | 株距 |
| `trim` | 1 | 0 ~ 1 | 1 | 顶部修剪平整 |

### 碰撞体

`{"type":"box","w":4.0,"d":0.7,"h":1.0}`

### 关键算法

- 每株 = 5 颗球的小丛（复用 shrub 骨架），球心高度夹在 `[h*0.2, h*0.92]` —— 顶部齐平读出"修剪过"
- 株间位置加 `hash` 抖动（±0.06），成排但不机械

### 坑

- 与规格的原意（"canopy 排布、不建 ID"）不同：单株灌木是 `shrub`，**成条的篱笆**是不同骨架（有长度/行数/修剪语义），所以独立 ID 是对的
- `rows=1` 时行内 y 偏移公式会除零，已用 `Math.max(1, rows-1||1)` 兜底
