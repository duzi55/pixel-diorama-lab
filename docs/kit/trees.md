# 树变体配方卡

> 注册表：[registry.md §1](registry.md)
> 核心原则：**树的差异 = 骨架结构 + 冠形分布 + 配色**。三者中只有骨架值得单独建 ID。

---

## 0. 树的解剖

参考项目和 demo 里所有树都可以拆成同一套解剖：

```
            ┌──────────┐
            │  冠层     │  ← 冠形：怎么分布（球堆 / 分层 / 垂枝 / 锥形）
            │  ╱    ╲   │
            ├──────────┤
            │  主干     │  ← 骨架：直 / 弯 / 分叉几段 / 有无
            │   │      │
            ├──────────┤
            │  枝       │  ← 分枝：数量、角度、递归深度
            │  ╱│╲     │
            └──────────┘
```

**三种差异的归属**

| 差异 | 例子 | 归属 |
|------|------|------|
| 骨架结构 | 梧桐的三层分叉 vs 棕榈的单干 + 顶生叶 | **独立 ID** |
| 冠形分布 | 球堆 / 分层 / 锥形 / 下垂 | **独立 ID** 或基型参数 |
| 配色 | 翠绿 / 深绿 / 秋黄 / 银绿 | **参数组**（不算新变体） |

---

## 1. `broadleaf` 阔叶树

| 项 | 内容 |
|----|------|
| **来源** | `ref` `engine.js:231` `growTree(x, y, scale, count, seed)` |
| **状态** | ✅ 参考项目 4 个场景在用 |

### 形态

六簇球堆成不规则树冠。树干三段（主干 + 左右分枝），分枝不对称。
叶子按高度分三色：顶部银绿、中部中绿、底部深绿。

### 参数组 `scale/count/leaf3/bark`

| 参数 | 默认 | 区间 | 作用 |
|------|------|------|------|
| `scale` | 1 | .5～1.2 | 整树缩放 |
| `count` | 420 | 150～500 | 叶子球数。**性能旋钮**，远景树应降到 200～260 |
| `leaf3` | `[LEAF_DEEP, LEAF_MID, LEAF_SILVER]` | 任意 3 色 | 深/中/浅三档 |
| `bark` | `[92,74,60]` | — | 树皮色 |

### 关键算法

**① 冠簇表（改树形改这里）**

```js
const CROWN = [[.1,0,3.7,1.6], [-1.4,-.7,3.3,1.2], [1.6,.7,3.4,1.25],
               [-.6,1.1,3.9,1.1], [.9,-1.1,4,1.1], [.2,.1,4.9,1.05]];
//         中心x 中心y 中心z 半径
```

叶球轮流落进各簇 → 树冠是多个"团"，不是一个球。

| 想改成 | 改法 |
|---------|------|
| 更圆更满 | 增大各簇半径 |
| 更瘦高 | 拉开各簇 z 间距，减小半径 |
| 更偏心 | 加大各簇 x/y 偏移 |
| 更高 | 整体抬高各簇 z |

**② 球内均匀采样**

```js
const d = Math.cbrt(hash(k, 9)) * spread;      // ← 立方根是关键
const flat = Math.sqrt(1 - tilt * tilt);
rx = cx + Math.cos(a) * flat * d;
ry = cy + Math.sin(a) * flat * d;
rz = cz + tilt * d * .8;                       // 纵向压扁 0.8
```

不用 `cbrt` → 点全挤在球心，树冠变成一团棉花。

**③ 三色分配**

```js
const tone = hash(k,10) + (rz - 4.2)*.22 + (d/spread - .5)*.3;
const leaf = tone > .72 ? LEAF_SILVER : tone > .3 ? LEAF_MID : LEAF_DEEP;
```

三个因子：随机 + 高度 + 簇内外缘。

### 移植清单

1. 需要 `capture` 机制（见 [nature.md §2](nature.md)）才能有风动。不需要风动就删掉 capture 分支。
2. `leaves` 数组只增不减，动态生成/销毁树时要自己回收。
3. `count` 是每帧开销的大头。150 棵树 × 420 球会明显掉帧。

### 坑

- **`LEAF_SILVER` 不是纯灰**，是带绿的浅色 `[146,162,112]`。用纯灰会显得脏。
- 树干半径 `.36` 起（主段），别照抄 demo 的 `.17`——两者尺度不同，参考的树更大。
- 三段树干中**左右分枝长度不对称**（-.8 vs +1.2），改对称了就假。

---

## 2. `palm` 棕榈

| 项 | 内容 |
|----|------|
| **来源** | `ref` `mini-ramp:119` `growPalm(a, w, scale, seed)` |
| **状态** | ✅ |

### 形态

二次曲线弯曲的单干，顶部 10 片下垂的羽状叶。树皮有横向环纹。

### 参数组 `scale/height/fronds`

| 参数 | 默认 | 区间 | 作用 |
|------|------|------|------|
| `scale` | 1 | .7～1.3 | 整树缩放 |
| `height` | 5.6 | 3～8 | 干高（世界单位） |
| `fronds` | 10 | 6～14 | 叶片数 |
| `ring` | `[PALM_BARK, PALM_RING]` | — | 环纹两色 |

### 关键算法

**① 参数化弯曲干**

```js
const turn = hash(seed, 1) * 6.283;
const leanX = Math.cos(turn) * 1.1 * scale, leanY = Math.sin(turn) * 1.1 * scale;
const trunkAt = t => [bx + leanX*t*t, by + leanY*t*t, height*t];
```

**二次曲线**：根部 t=0 偏移为 0（直立），顶端 t=1 偏移最大（弯曲）。
弯曲方向由 seed 决定 → 每棵棕榈朝不同方向弯。

**② 环纹树皮（`colorOf` 回调）**

```js
z => (Math.floor(z * 3.4) % 2 ? PALM_BARK : PALM_RING)
```

按高度每 `1/3.4` 单位交替两色。这个"按 z 分段配色"的技巧同样适用于球衣条纹、交通锥反光带。

**③ 叶片 = 11 段 × 3 排球**

```js
const drop = top[2] + scale * (rise*u - 2.4*u*u);      // 下垂抛物线
const width = .42 * scale * (1 - u*.55);                 // 叶尖收窄
for (const side of [-1, 0, 1]) {                         // 三排
  sphere(lx, ly, drop - (side ? .22*scale : 0), (side ? .15 : .12)*scale, color, 'rough');
}
```

中排（side=0）高，两侧低 `.22` → 叶片有卷曲感。

### 移植清单

1. 叶片全部进 `leaves` 缓存队列，共享风动。
2. 需 `world(a, w, z)` 局部坐标（`mini-ramp:68`），因为棕榈按"沿板长/横向"布置。
3. 树干每段要单独 `castShadow`，7 段 = 7 个影子。

### 坑

- `trunkAt` 用 `t*t` 而不是 `t`，直干就变成了倾斜的直线。
- 椰果（顶部 3 个小球）别漏，否则树顶是秃的。

---

## 3. `plane` 法国梧桐

| 项 | 内容 |
|----|------|
| **来源** | `demo` `autumn.js:266` `drawTree(t, sway)` |
| **状态** | ✅ |

### 形态

**三棵法国梧桐：笔直的灰白树干、细密的分枝、秋天已经落光叶子**
树冠完全由枝干骨架表达，一片叶子都没有。

### 参数组 `h/seed/branch`

| 参数 | 默认 | 区间 | 作用 |
|------|------|------|------|
| `h` | 3.55 | 2.5～5 | 树高 |
| `seed` | 11 | — | 随机种子 |
| `branch` | 3 | 2～5 | 一级分枝数 |
| `forkZ` | .52 | .4～.6 | 分叉点高度比例 |

### 关键算法

**分层分叉（不是井喷）**

```js
const fork = [t.x + sway*.10, t.y, t.h * .52];
capsule([t.x, t.y, 0], fork, .25, .16, bark, 'rough');      // 主干

for (let k = 0; k < 3; k++) {                               // 一级主枝
  const a = k/3 * 6.283 + hash(s,101)*.55;
  const reach = .55 + hash(s,102)*.30;
  const midZ = t.h * (.66 + hash(s,103)*.08);
  const mid = [t.x + Math.cos(a)*reach + sway*.55, t.y + Math.sin(a)*reach, midZ];
  capsule(fork, mid, .11, .065, bark, 'rough');

  for (let m = 0; m < 3; m++) {                             // 二级细枝
    const aa = a + (hash(q,104)-.5)*1.3;
    const len = .40 + hash(q,105)*.38;
    const tip = [mid[0]+Math.cos(aa)*len + sway*.55, mid[1]+Math.sin(aa)*len,
                 midZ + .48 + hash(q,106)*.44];
    capsule(mid, tip, .048, .010, bark, 'rough');
  }
}
```

**关键在于"主干 → 主枝 → 细枝"的三级层次**。
一级主枝绕干均分（`k/3*6.283`）且各自带相位偏移（`hash(s,101)*.55`），
二级细枝在主枝两端**不对称**展开（`±.65` 弧度）。

半径逐级收细：`.25 → .11 → .048`，末端 `.010` 几乎成尖。

### 树皮分色

```js
const bark = z => (z > t.h * .6 ? BARK_HI : BARK_LO);
```

**上下两段不同色**——这是梧桐树皮的关键特征（上部浅灰白、下部灰褐）。
凡是"某种树有特征色带"，都用 `colorOf` 回调按 z 分段。

### 移植清单

1. `drawTree(t, sway)` 每帧重绘（要跟风吹），不是烘焙一次。
2. `sway` 参数直接加在枝条端点上，越靠梢部偏移越大（`.10` → `.55` → `.55`）。
3. 需要 `BARK_HI` / `BARK_LO` 两色。

### 坑

- **树冠位置完全由枝条决定**。如果一级主枝数太少（<3），树会显得光秃。
- 细枝末端半径 `.010` 不是 0——留一点点才能画出尖。
- 没有叶子不等于没有体积感，靠**分枝数量**和**明暗分层**表达。

---

## 4. `canopy` 郁闭林冠

| 项 | 内容 |
|----|------|
| **来源** | `demo` `forest.js:116` `drawTree(t)` |
| **状态** | ✅ |

### 形态

内层 8 个大球先把树冠填成连续体块，表层 26～64 个小球做轮廓、亮部和叶簇。
用于密集树林——单棵看不到全部，靠重叠连成一片林冠。

### 参数组 `size/crown/palette`

| 参数 | 默认 | 区间 | 作用 |
|------|------|------|------|
| `size` | .86～1.16 | .6～1.4 | 整树缩放（含纵深变化） |
| `crown` | 1.3～1.75 | .8～2.2 | 冠幅 |
| `palette` | `fresh`/`deep`/`autumn` | — | 5 档配色组 |

### 关键算法

**双层结构**

```js
// 内层：8 个大球，填体块
for (let k = 0; k < 8; k++) {
  const d = Math.cbrt(rnd(s,12)) * t.crown * .55;
  sphere(rx, ry, cz - t.crown*.12 + (rnd(s,13)-.5)*t.crown*.3,
         t.crown * (.5 + rnd(s,14)*.18), pal[1], 'rough');
}
// 表层：小球做轮廓
const n = clamp(Math.round(26 * t.crown * t.crown), 26, 64);
for (let k = 0; k < n; k++) {
  const tone = .08 + rnd(s,24)*.4 + (tilt*.5+.5)*.48;
  const idx = clamp(Math.floor(tone * 4.999), 0, 4);
  sphere(rx, ry, rz, (.3 + rnd(s,25)*.2) * t.size, pal[idx], 'rough');
}
```

**为什么需要内层**：只有表层小球时，冠内是空的，能看到背景穿过来 → 树冠"漏光"。
内层大球负责堵住空隙。

**表层数量随冠幅平方增长**：`26 * crown²`。
冠大 2 倍 → 球数 4 倍（因为表面积平方关系）。

**配色索引**：`tone` 三个因子（随机底 + 高度倾斜 + 边缘亮）映射到 5 档。

### 布点（前排大后排小）

```js
const depth = (y + RY) / (2*RY);
const size = (.86 + depth*.3) * (.9 + rnd(n,3)*.28);
```

**纵深靠缩放实现**，不靠透视（相机是正交的）。y 越大（越靠近相机）越大。

### 移植清单

1. `rnd(a,b)` = `hash(a*.731 + seed*1.37, b*1.913)`，带全局 seed。
2. 布点用拒绝采样 + 最小间距 `minD = 1.15`。
3. 按 `y` 排序后再画 → 后面的先画，前面的后画（画家算法）。等距投影下 `y` 大 = 靠前。

### 坑

- **画家算法必须按 y 排序**。不排序的话树会互相穿插。
- 冠内如果还是漏光，把内层球数从 8 加到 12，或把内层半径系数 `.5` 提到 `.55`。
- 5 档配色跨度不能太大，否则抖动读成棋盘（见 [scene.md §4](scene.md)）。

---

## 5. `simple` 简易球树

| 项 | 内容 |
|----|------|
| **来源** | `demo` `demo.js:70` `tree(x, y)` |
| **状态** | ✅ |

### 形态

单层球堆 + 短树干。最省的一个变体，适合背景填充。

### 移植清单

只需要 `sphere()` + `capsule()`，无 capture、无缓存、无排序。

### 坑

- 没有内层 → 冠内漏光。球数少时（<10）尤其明显。
- 适合远景，不适合近景主体。

---

## 5.5 `pine` 针叶树（秋日山村 · 已实现）

| 项 | 内容 |
|----|------|
| **来源** | `demo` `village/foliage.js` `folPineCrown()` |
| **状态** | ✅ |

### 形态

直干 + **锥面塔冠**：横向是一圈圈"枝盘"，越往上越小越密，
最后收成一个尖。剪影是硬三角，和阔叶树的圆球簇完全不同。

```
      /\
     /██\
    /████\\
   /████████\\
  ────────────
```

### 参数组 `rows/R0/h`

| 参数 | 默认 | 区间 | 作用 |
|------|------|------|------|
| `rows` | 11～13 | 8～14 | 横向的枝盘层数。**行要多**，行少轮廓会碎 |
| `R0` | 1.45 | 1.0～1.9 | 底层半径 |
| `h` | 5.2 | 4～7 | 塔高 |

### 关键算法

**① 沿锥面排行，而不是"逐层扁球"**

逐层扁球（每层一个压扁的球）的问题是**层与层之间会漏光**，
锥形轮廓也会被球边啃得参差。改成**沿锥面等距排点**：

```js
const rows = 11 + (hash(t.seed, 61) * 3 | 0);
for (let i = 0; i < rows; i++) {
  const u = i / (rows - 1);
  const z = z0 + u * (z1 - z0);
  const R = R0 * (1 - u * .9) * (1 - .18 * u * u);   // 二次收缩
  /* 外圈 11 点：定轮廓 */
  for (let k = 0; k < 11; k++) {
    const a = k / 11 * 6.283 + hash(kk, 51) * .16;
    folCap(t.x + Math.cos(a) * R, t.y + Math.sin(a) * R, z, R * .3, NEEDLE[base]);
  }
  /* 内圈 7 点 + 中心 1 点：堵体积 */
}
```

**② 半径二次收缩**

`R = R0 * (1 - u*.9) * (1 - .18*u*u)`。第一项是线性收窄，
第二项**越往上收得越快**——线性收窄的顶端是个圆顶，二次收窄才是尖。

**③ 三层结构**

| 层 | 半径系数 | 作用 |
|----|----------|------|
| 外圈 11 点 | `R*.3` | 定三角形轮廓 |
| 内圈 7 点 | `R*.4` | 填内部体积 |
| 中心 1 点 | `R*.38` | 堵住正中的洞 |

**只有外圈会漏光**（能透过冠看到背景）。内圈和中心球是补洞的。

**④ 颜色自下而上变亮**

`base = clamp(Math.floor(u * 3.9) + 1, 0, 4)`。
底暗（`NEEDLE[1]`）顶亮（`NEEDLE[4]`）——针叶塔是画面里最深的东西，
顶端提亮才有立体感。

### 移植清单

1. 树干只画到最底层（`z = 1.0*s`），**不能贯穿锥体内部**——
   针叶树的干在树冠里是看不见的，画出来会像一根棍子插在塔里。
2. 树冠进 capture 缓存 → 每帧风动。
3. 顶上加一个 `NEEDLE[4]` 的小尖顶球收口。

### 坑

- **行数少于 9 轮廓就碎**。锥形靠密集的采样点连线，不是靠球体堆叠。
- 颜色**顶部亮底部暗**。做反了（底亮顶暗）会读成一座塔形建筑。
- 塔高要压过阔叶树才显得"高"，但不能高太多，否则压过画面主体。

---

## 5.6 `shrub` 灌木（秋日山村 · 已实现）

| 项 | 内容 |
|----|------|
| **来源** | `demo` `village/foliage.js` `drawShrubs()` |
| **状态** | ✅ |

### 形态

无主干的矮球丛，5 个小球用 `cbrt` 在一个扁椭球里采样。
静态（不进 capture），沿路肩和路边点缀。

### 参数组 `r/h`

| 参数 | 默认 | 区间 | 作用 |
|------|------|------|------|
| `r` | .34～.68 | .25～.9 | 冠幅 |
| `h` | .3～.68 | .2～.9 | 高度 |

### 关键算法

```js
for (let k = 0; k < 5; k++) {
  const a = hash(kk, 97) * 6.283, d = Math.cbrt(hash(kk, 98)) * s.r;
  sphere(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d,
    s.h * (.5 + hash(kk, 99) * .55), s.r * (.5 + hash(kk, 101) * .32), c, 'rough');
}
```

**高度和半径都带随机**，球才不是一个规整的球。
`cbrt` 保证球内均匀采样（见 §1 ②）。
色板用 `SHRUB` 3 档。

### 坑

- 灌木**没有主干**。想省事用 `growTree` 的 scale 设 .3 是错的——
  树干还在，只是变矮了，一眼能看出是"小树"不是"灌木"。
- 灌木高度别超过 `.9`。再高就读成小树苗了。

---

## 5.7 `cone-mast` 巨层塔树（秋日山村 · 已实现）

| 项 | 内容 |
|----|------|
| **来源** | `demo` `kit/conifers.js` `KIT.register({ id: 'cone-mast' })` |
| **状态** | ✅ |

### 形态

**金黄锥塔大树**：粗深褐直干入地（带根爪），冠 = 上百个圆润叶簇
堆成的锥体，轮廓是连续的圆弧鼓包，簇色按高度/受光/随机取
4 档金黄。整树完整（干、冠、尖都在画布内绘制）。

```
      ▁▁        ← 顶尖亮簇
    ▂████▂
   ████████     ← 叶簇堆叠（无横向层线）
  ██████████
 ████████████
     ███        ← 粗干 + 根爪
```

### 参数

| 参数 | 默认 | 区间 | 作用 |
|------|------|------|------|
| `height` | 24 | 10~34 | 整树高度 |
| `crownR` | 5.8 | 2.5~9.5 | 底层冠幅（建议 ≈ height×0.2，窄高才像塔） |
| `trunkH` | 6.5 | 1.5~12 | 树干裸露高度 |
| `density` | 380 | 160~520 | 叶簇数量 |

### 关键算法（第六版：叶簇团块）

**① 为什么不用 sphere**

球体融合会被 `shadeEdges()` 在球与球的深度台阶处勾出黑边，
密集小球 → "爆米花"外圈。所以每个叶簇用 `leafBlob()` **逐像素填充**。

**② 像素反解到高度 z 的水平面**

```js
function coneUnproject(ix, iy, z) {
  const sum = 2 * R2 * ((iy + .5 - OY) / S + z * COS);  // x + y
  const dif = R2 * (ix + .5 - OX) / S;                  // x - y
  return [(sum + dif) / 2, (sum - dif) / 2];
}
```

★ **必须走 `ctx.screen()` / `ctx.unproject()`**（两者缺省时回落到上面的全局函数）。
构件可能被 `ctx.rot` 旋转：包围盒要按旋转后的屏幕位置取，像素要反解回
**局部坐标**再交给 `ctx.plot()`。用全局 `project/coneUnproject` 会在
"旋转预览"里把每片叶簇裁成碎片，空隙透出背景 —— 就是满树黑点。

**③ 三部分构成**

| 部分 | 做法 |
|------|------|
| 内芯 | 沿轴心一串大簇（半径 0.58×包络），先垫实心体块，防叶缝透背景 |
| 外壳 | N 个叶簇定位在锥面 60%~108% 半径处，半径 0.16~0.26×包络，z 上下抖动 ±4.5% 树高（顶部随包络收窄，否则树尖断成悬空小簇），轮廓由这圈决定 |
| 顶尖 | 一个亮色小簇 |

**④ 半径包络方向（坑）**

`u = 0` 在**顶部**，包络必须是 `R = cr·u^0.9`（顶端窄、底端宽）。
写成 `cr·(1-u)^0.9` 会得到"上宽下窄的扫帚"。

**⑤ 色档：簇间定基调，簇内只留硬色块（去 3D 感）**

```js
tone = 2.2 + (1-u)*0.7 + 受光侧*0.1 + 随机*0.5        → 2..3 档（每簇）
idx  = clamp(2 + round((tone-2)*.6) + 颗粒, 2, 4)      → 只用 2/3/4 档
```

**暗档 0/1 整档禁用**：它们会把叶簇压成深褐/近黑，大量重叠后就是
"黑黢黢的 3D 体积阴影"。簇内不再按球面法线算 dx/dy 光照，只留
亮/中两种硬色块 + 少量颗粒（阈值 0.8，避免迷彩砂砾）。

**⑥ 颜色打包（坑）**

`ctx.plot()` 只吃 `rgb()` 打包后的整数，不吃 `[r,g,b]` 数组。
传数组 → `Uint32Array` 写入时转成 `NaN` → 整片纯黑。
预打包成 `CONE_PACKED` 再索引，顺带省掉每像素 spread。

### 风动（可选）

`inst.part` 支持分两遍烘焙：`'trunk'` 只画干、`'canopy'` 只画冠。
场景利用它把树冠像素录进 `plotCapture`（引擎的 plot 录制），
每帧从"无树冠底图"出发做整数像素平移回放 —— 树干静止、树冠随风摆。
逐像素自绘的构件通过 `ctx.screen/unproject` 支持实例的 `rot/scale`；
回放阶段仍是整数像素平移，不受影响。

### 移植清单

1. 复制 `coneUnproject` / `leafBlob` / `coneCanopy` 三个助手
2. `leafBlob` 用 `ctx.screen()` 定位包围盒、`ctx.unproject()` 反解像素、
   `ctx.plot()` 写像素（三者都带实例 rot/scale）
3. 密度不够时轮廓会碎成"飞叶"；太密会糊成实心球——先调 `density` 再调簇径

### 坑（实画迭代实测）

- 用 sphere 做叶簇 → 深度描边勾黑边（爆米花）。必须 plot 填充。
- 包络方向反了 → 扫帚形（见 ④）。
- 簇太小/太稀 → 飞叶；簇太大 → 一团实心土豆。
- 簇内用暗档（0/1）→ 树冠黑黢黢、读成 3D 体积；只用 2/3/4 档。
- 包围盒用全局 `project()` 而不是 `ctx.screen()` → 旋转预览满树黑点（见 ②）。
- `ctx.plot()` 传 `[r,g,b]` 数组 → 整片纯黑（见 ⑥）。
- 层间暗线（曾经的分层盘方案）→ "叠盘子/宝塔"。参考图没有横向层线。

---

## 5.8 `cone-spire` 尖锥树（秋日山村 · 已实现）

| 项 | 内容 |
|----|------|
| **来源** | `demo` `kit/conifers.js` `KIT.register({ id: 'cone-spire' })` |
| **状态** | ✅ |

### 形态

窄高金黄尖锥（背景填充树）：细直干 + 叶簇堆叠。

### 参数

| 参数 | 默认 | 区间 | 作用 |
|------|------|------|------|
| `height` | 17 | 8~26 | 整树高度 |
| `crownR` | 3.5 | 1.4~6.0 | 锥底冠幅 |
| `trunkH` | 4.0 | 1.2~8.0 | 树干裸露高度 |
| `density` | 240 | 100~380 | 叶簇数量 |

### 关键算法

与 `cone-mast` 共享 `coneCanopy`；差异仅在默认尺寸更窄。

---

## 6. 待实现变体的设计要点

以下是注册表里标 `📐` 的树。**不是让你现在全做**，而是说明每个变体该怎么接进来。

### `birch` 白桦

**骨架差异**：细直干 + **横向短枝**（不是斜向上）。

```
   │──
   │──
   │
   │──
```

特征：白干 + 黑斑（横短枝的疤）。用 `colorOf` 按 z 分段做上下微差，
黑斑用 `hash` 随机点单独 `plot()` 上去。

### `willow` 垂柳

**骨架差异**：冠下垂枝**串**——每条垂枝是一串逐渐变细的小球，沿抛物线下垂。

```
  ╱╲
 ╱│╲
  │││
  ╰╯╰╯
```

关键：`drop = z0 - k*len²` 这类二次下垂，末梢半径趋近 0。
垂柳的枝条应该是**线**而不是球串才自然，所以用 `capsule` 串联。

### `blossom` 花树

**不是新骨架**——直接用 `broadleaf` 或 `canopy`，加一个 `bloom` 参数组：

| 参数 | 说明 |
|------|------|
| `bloomRate` | 花点密度（占冠层球的比例，.05～.2） |
| `bloomColor` | 粉白 / 纯白 / 浅黄 |

实现：在叶子球循环里按 `hash` 概率把球色换成花色。
**这就是"配色差异走参数组，不建新 ID"的例子。**

### `shrub` 灌木

**不是新骨架**——`canopy` 的缩小版，无主干。

| 参数 | 说明 |
|------|------|
| `h` | 高度（.3～.8） |
| `crown` | 冠幅 |

实现：跳过树干段，把冠层整体下移。
或者更省：`growTree` 的 scale 设 .3，但树干也要去掉。

---

## 7. 树变体速查

| ID | 骨架 | 冠形 | 风动 | 用途 |
|----|------|------|------|------|
| `broadleaf` | 三段分叉 | 6 簇球堆 | ✅ capture | 通用阔叶 |
| `palm` | 弯曲单干 | 10 片羽叶 | ✅ capture | 热带 |
| `plane` | 三级分叉 | 无冠（枝代冠） | ✅ 每帧 | 秋日、剪影 |
| `canopy` | 三段分叉 | 双层球 | ❌ 静态 | 密林 |
| `simple` | 短干 | 单层球 | ❌ | 背景 |
| [`pine`](#55-pine-针叶树秋日山村--已实现) | 直干 | 锥面塔冠 | ✅ capture | 针叶林、远景剪影 |
| [`cone-mast`](#57-cone-mast-巨层塔树秋日山村--已实现) | 粗直干 | 实心宽塔+层缝线 | ❌ 静态 | 秋日背景林主角 |
| [`cone-spire`](#58-cone-spire-尖锥树秋日山村--已实现) | 细直干 | 实心窄尖锥 | ❌ 静态 | 秋日背景林填充 |
| `birch` | 直干+横枝 | 稀疏球 | 可选 | 北方 |
| `willow` | 垂枝串 | 垂链 | ✅ | 水边 |
| `blossom` | = `broadleaf` | = `broadleaf` | ✅ | 花期 |
| [`shrub`](#56-shrub-灌木秋日山村--已实现) | 无干 | 小球丛 | ❌ | 灌木丛、路肩点缀 |

---

## 8. 移植清单（总）

| 优先级 | 项 | 说明 |
|--------|----|------|
| 高 | `broadleaf` 的 capture 风动 | demo 的树全是静态的。风动是"活起来"的最大杠杆 |
| 高 | `canopy` 的双层结构 | demo 的 `forest.js` 已有，但内层半径系数偏小，冠内可能漏光 |
| 中 | `plane` 的树皮分色 | `colorOf` 按 z 分段，一行代码 |
| 中 | `broadleaf` 的三色高度分配 | 顶银绿/底深绿的自然渐变 |
| 中 | 纵深缩放 | `size` 随 y 变化，正交相机下靠缩放造纵深 |
| 高 | `pine` 锥面塔冠 | 秋日山村已实现（`village/foliage.js`）|
| 中 | `birch` / `willow` | 新骨架，值得做 |
| 低 | `blossom` | 走参数组，不用新 ID |
| 高 | `shrub` 无干球丛 | 秋日山村已实现（`village/foliage.js`）|

**通用坑**

1. 所有随机必须用 `hash(k, seed)` 不用 `Math.random()`——确定性是"精心摆放"和"随机乱放"的分界。
2. 树冠内层必须有，否则漏光。
3. 画家算法按 y 排序。
4. capture 队列只增不减。
5. 正交相机没有透视缩放，纵深靠**显式缩放**。

## birch — 白桦

| 项 | 内容 |
|---|---|
| **ID** | `birch` |
| **来源** | `demo/kit/trees.js` · `KIT.register` · studio 生成 |
| **形态** | 细直白干缀横向黑斑，横枝平挑疏朗叶簇 |
| **分类** | 树 |

### 参数

| 参数 | 默认 | 区间 | 步进 | 说明 |
|------|------|------|------|------|
| `height` | 5.4 | 3.2 ~ 7 | 0.1 | 树高（世界单位，人约 1.8） |
| `trunkR` | 0.14 | 0.08 ~ 0.24 | 0.01 | 树干半径，白桦要保持细直 |
| `branches` | 7 | 3 ~ 14 | 1 | 横向短枝数量 |
| `crown` | 1 | 0.5 ~ 1.6 | 0.05 | 枝长与叶簇大小系数 |
| `spots` | 1 | 0 ~ 2 | 0.1 | 树干黑斑密度 |

### 碰撞体

`{"type":"cylinder","radius":0.3,"height":5.4}`

### 移植清单

- 代码：`demo/kit/trees.js`
- 注册表：`docs/kit/registry.md` · 树节
- 依赖引擎：`demo/engine.js` 的 `sphere/capsule/box/plot/rampOf/hash/noise`

### 实现说明

【与已有构件的差异】broadleaf 是「斜向上大枝 + 6 簇球堆冠」，pine 是「锥面塔冠」；birch 是第三种骨架：**枝几乎水平**（上扬只有 len*0.10，远小于阔叶树的斜挑），冠由枝端若干**小而散**的叶簇组成，中间留空——读起来是疏朗的白桦，不是一团绿球。树干也细得多（0.14 vs 阔叶树常见 0.25+）。

【实现要点】
1. 树干分段 7 段 capsule，每段用 `tone = clamp(round(1 + t0*3.4), 1, 4)` 取 `bark[]` 的第 1~4 级，实现规格要求的「按 z 分段做上下微差」：根部暗（接地 AO），往上逐渐提亮。相邻段端点半径用同一个 lerp 公式，半径连续，不会出台阶；段尾 +0.05 重叠消接缝。
2. 黑斑**不手算可见半圆**：方位角取 0~2π 全周，半径乘 1.25 浮出树皮表面，背面那些点因为深度更远，会被 plot 的深度测试自动拒绝。这样无论实例怎么旋转都正确。约 40% 的黑斑会向侧面再补一个像素，拉成「横向皮孔」的短疤，而不是圆点。
3. 横枝方位角 `side * (0.32 + hash*0.95)`，即偏离正对相机的 ±18°~73°，左右由 `i % 2` 交替——保证枝都长在可见的半边、且呈屏幕左右伸展。长度在中段（t≈0.58）最长、上下两端收短，符合白桦「下部枝短、中上部枝长」的轮廓。
4. 枝端叶簇用双球：暗主球压在下、亮球偏上偏内，两球色阶差一档 + 基色本身偏黄绿，体积感就出来了；顶梢也是两簇收尖。

【坑】
- **黑斑必须在树干之后画**。plot 只是单像素写入，如果先画黑斑，后画的树干（深度更近）会把它们全盖掉。当前代码顺序：干 → 斑 → 枝 → 叶。
- 枝根起点用 `ra * 0.7` 内嵌进树干，不要用 `ra`，否则胶囊端帽和圆柱面之间会露出一条缝。
- `bark[0]` 太暗，会把白桦画成灰桦；底部最深只到 `bark[1]`。
- 如果某个引擎版本的 plot 对亚像素偏移不敏感（黑斑被吞掉），把 `1.25` 调到 `1.4` 即可，视觉上仍是贴在树干上的点。
- 碰撞体只包树干（radius 0.3，略大于 0.14 的细干便于点选），**不含树冠和横枝**——按项目规则，装饰部分不计入碰撞。

### 实现

```js
KIT.register({
  id: 'birch',
  name: '白桦',
  category: 'tree',
  desc: '细直白干缀横向黑斑，横枝平挑疏朗叶簇',
  params: {
    height:   { def: 5.4,  min: 3.2,  max: 7,    step: 0.1,  desc: '树高（世界单位，人约 1.8）' },
    trunkR:   { def: 0.14, min: 0.08, max: 0.24, step: 0.01, desc: '树干半径，白桦要保持细直' },
    branches: { def: 7,    min: 3,    max: 14,   step: 1,    desc: '横向短枝数量' },
    crown:    { def: 1,    min: 0.5,  max: 1.6,  step: 0.05, desc: '枝长与叶簇大小系数' },
    spots:    { def: 1,    min: 0,    max: 2,    step: 0.1,  desc: '树干黑斑密度' },
  },
  collision: { type: 'cylinder', radius: 0.3, height: 5.4 },

  draw(ctx, inst) {
    const p = ctx.params;
    const H = p.height;
    const R = p.trunkR;
    const bark = ctx.rampOf([234, 230, 218]);   // 冷白树皮
    const twig = ctx.rampOf([194, 186, 168]);   // 枝：比干略深的灰褐
    const leaf = ctx.rampOf([118, 156, 70]);    // 叶主色
    const leafHi = ctx.rampOf([152, 184, 92]);  // 叶受光色
    const ink = ctx.rgb(54, 48, 42);            // 黑斑

    // ── 树干：分段绘制，色阶按 z 从 ramp[1] 爬到 ramp[4]，做出上下明度微差 ──
    const SEG = 7;
    for (let i = 0; i < SEG; i++) {
      const t0 = i / SEG, t1 = (i + 1) / SEG;
      const ra = ctx.lerp(R, R * 0.45, t0);
      const rb = ctx.lerp(R, R * 0.45, t1);
      const tone = ctx.clamp(Math.round(1 + t0 * 3.4), 1, 4);
      ctx.capsule(
        [ctx.x, ctx.y, t0 * H],
        [ctx.x, ctx.y, t1 * H + 0.05],   // 段间重叠，消掉接缝台阶
        ra, rb, bark[tone], 'rough'
      );
    }

    // ── 黑斑：绕干全周撒点，半径浮出表面 1.25R，背面点由深度测试自动剔除 ──
    const nSpot = Math.round(18 * p.spots);
    for (let i = 0; i < nSpot; i++) {
      const t = 0.05 + ctx.hash(i * 17 + 1, ctx.seed) * 0.86;
      const rr = ctx.lerp(R, R * 0.45, t) * 1.25;
      const a = ctx.hash(i * 17 + 2, ctx.seed) * Math.PI * 2;
      const z = t * H;
      ctx.plot(ctx.x + Math.sin(a) * rr, ctx.y + Math.cos(a) * rr, z, ink);
      if (ctx.hash(i * 17 + 3, ctx.seed) > 0.4) {        // 一部分拉成横向短疤
        const a2 = a + (ctx.hash(i * 17 + 4, ctx.seed) > 0.5 ? 0.7 : -0.7);
        ctx.plot(ctx.x + Math.sin(a2) * rr, ctx.y + Math.cos(a2) * rr, z, ink);
      }
    }

    // ── 横向短枝：几乎水平伸出，左右由奇偶交替 ──
    const nB = Math.round(p.branches);
    for (let i = 0; i < nB; i++) {
      const t = 0.30 + (i / Math.max(1, nB - 1)) * 0.60
              + (ctx.hash(i * 23 + 1, ctx.seed) - 0.5) * 0.05;
      const z = t * H;
      const ra = ctx.lerp(R, R * 0.45, t);
      const side = i % 2 === 0 ? -1 : 1;
      const a = side * (0.32 + ctx.hash(i * 23 + 2, ctx.seed) * 0.95); // ±18°~73°
      const mid = 1 - Math.abs(t - 0.58) * 1.7;                        // 中段最长
      const len = (0.42 + 0.62 * Math.max(0, mid)) * p.crown
                * (0.82 + ctx.hash(i * 23 + 3, ctx.seed) * 0.36);
      const sx = ctx.x + Math.sin(a) * ra * 0.7;   // 枝根内嵌进干，避免裂缝
      const sy = ctx.y + Math.cos(a) * ra * 0.7;
      const ex = ctx.x + Math.sin(a) * (ra + len);
      const ey = ctx.y + Math.cos(a) * (ra + len);
      const ez = z + len * 0.10;                   // 只微微上扬，保持“横枝”
      ctx.capsule([sx, sy, z], [ex, ey, ez], 0.05, 0.024, twig[2], 'rough');

      // 枝端叶簇：暗主球 + 偏上偏内的小亮球，叠出体积
      const cr = (0.24 + ctx.hash(i * 23 + 4, ctx.seed) * 0.16) * p.crown;
      ctx.sphere(ex, ey, ez + cr * 0.55, cr, leaf[2], 'rough');
      ctx.sphere(ex - Math.sin(a) * cr * 0.2, ey - Math.cos(a) * cr * 0.2,
                 ez + cr * 1.10, cr * 0.66, leafHi[3], 'rough');
    }

    // ── 顶梢：两簇收尖，别做成一颗圆球 ──
    const topR = (0.30 + ctx.hash(91, ctx.seed) * 0.12) * p.crown;
    ctx.sphere(ctx.x + 0.05, ctx.y - 0.04, H * 0.96, topR, leaf[2], 'rough');
    ctx.sphere(ctx.x - 0.04, ctx.y + 0.05, H * 1.03, topR * 0.72, leafHi[3], 'rough');

    ctx.shadow(0.9 * p.crown, 1, 0.5);
  },
});
```

## willow — 垂柳

| 项 | 内容 |
|---|---|
| **ID** | `willow` |
| **来源** | `demo/kit/trees.js` · `KIT.register` · studio 生成 |
| **形态** | 矮壮树干托起扁圆冠，冠缘垂下一圈二次下坠的细柳条，末梢渐细 |
| **分类** | 树 |

### 参数

| 参数 | 默认 | 区间 | 步进 | 说明 |
|------|------|------|------|------|
| `height` | 4.4 | 3 ~ 6.5 | 0.1 | 树高（世界单位，含冠） |
| `spread` | 1.8 | 1 ~ 2.8 | 0.1 | 冠幅半径，同时决定垂枝起点的径向距离 |
| `strands` | 16 | 6 ~ 28 | 1 | 垂枝条数（沿极角均布） |
| `droop` | 1 | 0.4 ~ 1.6 | 0.05 | 垂枝下垂长度系数，>1 更接近地面 |

### 碰撞体

`{"type":"cylinder","radius":0.42,"height":4.4}`

### 移植清单

- 代码：`demo/kit/trees.js`
- 注册表：`docs/kit/registry.md` · 树节
- 依赖引擎：`demo/engine.js` 的 `sphere/capsule/box/plot/rampOf/hash/noise`

### 实现说明

【骨架差异，与 broadleaf 的分界】broadleaf 是 6 簇球堆冠；垂柳是「单层扁冠 + 冠缘一圈垂枝串」。垂枝是骨架级差异，故独立 ID，不做 broadleaf 的参数组。

【二次下垂的实现】规格写 `drop = z0 - k*len²`。代码用归一化参数 t∈[0,1] 写成 `nz = z0 - len·t²`，等价于把 k·len² 归并进 len（len 已经是该条枝的总落差）。这是抛物线而非圆弧，末段几乎垂直，正是柳条的形态。水平方向同时按 `r0 + out·t` 外扩，让枝条先向外探再坠下，避免所有枝贴成一束。

【必须用 capsule，不能用球串】每条垂枝由 seg 段（3~8，按 len/0.32 自适应）首尾相接的 capsule 组成，半径按 `rTop·(1-t)^1.35` 单调收敛。下限取 0.014 是为了不让胶囊退化成零半径（退化几何在深度测试里容易出空洞）；视觉上已经在 1 像素以内，等价于「末梢趋近 0」。

【防穿地】`len ≤ z0 - oz - 0.12`，硬夹一次。droop 拉到 1.6 且 height 调小时最容易踩这个坑，不夹会看到柳条插进地面以下。

【capsule 第 5 参】契约里它叫 `colorOf` 而不是 `color`，按「沿轴取色函数 `(u)=>颜色`」实现：u<0.55 用亮档，之后切暗档，让每条枝下半段自然沉下去。同时挂了 `valueOf` 返回亮档颜色，万一运行时其实按固定颜色处理也不会崩。若确认只吃固定色，把 `colorOf` 换成 `lite` 即可。

【颜色与色阶】三套 ramp：树干 [92,66,46]、冠 [96,122,64]、柳条 [112,140,74]（比冠亮一档，柳条受光更透）。取色统一用索引 2 作中间调、3 作受光面、1 作暗部——假设 rampOf 返回由暗到亮；若实际方向相反，明暗会整体翻转，只需把 1/3 对调。

【随机】全部走 `ctx.hash(整数key, ctx.seed)`，key 用 i*质数+偏移，避免不同 i 落到同一 key 上导致枝条规律性重复。无 Math.random，场景可复现。

【性能】默认 16 条 × 约 6 段 ≈ 96 次 capsule + 9 次 sphere，在 360×280 下没问题；strands 拉到 28 且 droop 拉满时约 220 次 capsule，是上限，编辑器里连续拖参数可能掉帧。

【碰撞体】按「不含装饰」原则只包树干：cylinder r=0.42、h=4.4，与默认 height 对齐。树冠与垂枝不计入。

### 实现

```js
KIT.register({
  id: 'willow',
  name: '垂柳',
  category: 'tree',
  desc: '矮壮树干托起扁圆冠，冠缘垂下一圈二次下坠的细柳条，末梢渐细',
  params: {
    height:  { def: 4.4, min: 3.0, max: 6.5, step: 0.1, desc: '树高（世界单位，含冠）' },
    spread:  { def: 1.8, min: 1.0, max: 2.8, step: 0.1, desc: '冠幅半径，同时决定垂枝起点的径向距离' },
    strands: { def: 16,  min: 6,   max: 28,  step: 1,   desc: '垂枝条数（沿极角均布）' },
    droop:   { def: 1.0, min: 0.4, max: 1.6, step: 0.05, desc: '垂枝下垂长度系数，>1 更接近地面' }
  },
  collision: { type: 'cylinder', radius: 0.42, height: 4.4 },

  draw(ctx, inst) {
    const P = ctx.params;
    const H = P.height, spread = P.spread, droop = P.droop;
    const N = Math.max(6, Math.round(P.strands));
    const ox = ctx.x, oy = ctx.y, oz = ctx.z;
    const TAU = Math.PI * 2;
    // 只用整数 key，保证同种子同结果
    const rnd = function (k) { return ctx.hash(k, ctx.seed); };

    const trunkRamp = ctx.rampOf([92, 66, 46]);
    const leafRamp  = ctx.rampOf([96, 122, 64]);
    const twigRamp  = ctx.rampOf([112, 140, 74]);

    // —— 树干：两段锥形胶囊，轻微前倾，冠底低（垂柳干短）
    const midZ = oz + H * 0.27;
    const topX = ox + spread * 0.06, topY = oy - 0.03, topZ = oz + H * 0.56;
    ctx.capsule([ox, oy, oz], [ox + 0.05, oy, midZ],
      H * 0.056, H * 0.042, function () { return trunkRamp[2]; }, 'rough');
    ctx.capsule([ox + 0.05, oy, midZ], [topX, topY, topZ],
      H * 0.042, H * 0.028, function () { return trunkRamp[2]; }, 'rough');

    // —— 扁圆冠：五球拼接，靠相机侧（y 小）提亮一档
    const cz = oz + H * 0.70;
    const cr = spread * 0.56;
    ctx.sphere(topX, topY, cz, cr, leafRamp[2], 'rough');
    ctx.sphere(topX - spread * 0.44, topY + 0.06, cz - H * 0.05, cr * 0.72, leafRamp[1], 'rough');
    ctx.sphere(topX + spread * 0.46, topY + 0.02, cz - H * 0.03, cr * 0.70, leafRamp[2], 'rough');
    ctx.sphere(topX - 0.05, topY - spread * 0.36, cz + H * 0.02, cr * 0.66, leafRamp[3], 'rough');
    ctx.sphere(topX + 0.04, topY - 0.02, cz + cr * 0.78, cr * 0.46, leafRamp[3], 'rough');

    // —— 垂枝：一条 = 一串锥度胶囊，沿 z = z0 - len·t² 二次下坠
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU + (rnd(i * 7 + 1) - 0.5) * 0.40;
      const ca = Math.cos(a), sa = Math.sin(a);
      const r0 = spread * (0.48 + rnd(i * 13 + 5) * 0.24);
      const z0 = Math.min(oz + H * 0.94,
        cz + cr * (0.30 + rnd(i * 17 + 2) * 0.60) - H * 0.08);
      const lenMax = Math.max(0.30, z0 - oz - 0.12);            // 不穿地
      const len = Math.min(lenMax, H * (0.40 + rnd(i * 23 + 7) * 0.24) * droop);
      const out = spread * (0.08 + rnd(i * 29 + 3) * 0.18);      // 向外张开量
      const rTop = 0.060 + rnd(i * 31 + 11) * 0.026;
      const lite = rnd(i * 37 + 9) < 0.45 ? twigRamp[3] : twigRamp[2];
      const dark = twigRamp[1];
      // capsule 第 5 参为沿轴取色函数；valueOf 兜底，防运行时按固定色处理
      const colorOf = function (u) { return u < 0.55 ? lite : dark; };
      colorOf.valueOf = function () { return lite; };
      const seg = Math.max(3, Math.min(8, Math.round(len / 0.32)));

      let px = topX + ca * r0, py = topY + sa * r0, pz = z0, pr = rTop;
      for (let s = 1; s <= seg; s++) {
        const t = s / seg;
        const nx = topX + ca * (r0 + out * t);
        const ny = topY + sa * (r0 + out * t);
        const nz = z0 - len * t * t;                             // 二次下垂
        const nr = Math.max(0.014, rTop * Math.pow(1 - t, 1.35)); // 末梢趋近 0
        ctx.capsule([px, py, pz], [nx, ny, nz], pr, nr, colorOf, 'rough');
        px = nx; py = ny; pz = nz; pr = nr;
      }
    }

    // —— 冠顶补几撮受光叶，压住冠与枝的接缝
    for (let j = 0; j < 4; j++) {
      const aa = rnd(j * 41 + 5) * TAU;
      ctx.sphere(topX + Math.cos(aa) * spread * 0.30,
                 topY + Math.sin(aa) * spread * 0.26,
                 cz + cr * (0.55 + rnd(j * 43 + 13) * 0.25),
                 0.16 + rnd(j * 47 + 19) * 0.10, leafRamp[3], 'rough');
    }

    ctx.shadow(spread * 0.95, 1, 0.5);
  }
});
```

---

## 附录：blossom 花树 = broadleaf 参数组

> 来源：`demo/kit/trees.js` · `broadleaf` 的 `bloomRate/bloomColor` 参数 · studio 手写

规格 §6 的判定落地：**不建独立 ID**。给 `broadleaf` 加两个参数：

| 参数 | 默认 | 区间 | 说明 |
|------|------|------|------|
| `bloomRate` | 0 | 0 ~ 0.2 | 花点密度（表层球换成花色的概率；0 = 普通阔叶树） |
| `bloomColor` | 0 | 0 ~ 2 | 0 粉白 `[248,214,224]` / 1 纯白 `[252,250,248]` / 2 浅黄 `[250,236,168]` |

实现：表层球循环里 `hash(kk, 12) < bloomRate` 概率换花色 —— 一行改动。

## sakura — 樱花树

| 项 | 内容 |
|---|---|
| **ID** | `sakura` |
| **来源** | `demo/kit/trees.js` · `KIT.register` · studio 生成 |
| **形态** | 矮壮紫褐主干向四周横展伞形枝，粉白花团压满枝头，花瓣持续旋转飘落 |
| **分类** | 树 |

### 参数

| 参数 | 默认 | 区间 | 步进 | 说明 |
|------|------|------|------|------|
| `height` | 5.2 | 2.4 ~ 5.6 | 0.1 | 树高 |
| `spread` | 1.35 | 0.6 ~ 1.6 | 0.05 | 冠幅展开半径 |
| `bloom` | 0.7 | 0.4 ~ 1.8 | 0.1 | 花团饱满度 |
| `petals` | 15 | 0 ~ 40 | 1 | 飘落花瓣数量（0 = 静态） |
| `fallSpeed` | 0.5 | 0.2 ~ 1.2 | 0.05 | 花瓣下落速度 |
| `blush` | 0.55 | 0 ~ 1 | 0.05 | 花色深浅：0 近白，1 深粉 |

### 碰撞体

`{"type":"cylinder","radius":0.3,"height":3.4}`

### 移植清单

- 代码：`demo/kit/trees.js`
- 注册表：`docs/kit/registry.md` · 树节
- 依赖引擎：`demo/engine.js` 的 `sphere/capsule/box/plot/rampOf/hash/noise`

### 实现说明

【与已有构件的边界】broadleaf 虽然有 bloomRate 花树参数组，但它是「向上三段分叉 + 球形团簇冠」的骨架，且没有粒子层。sakura 的骨架是「矮壮主干 + 四根近水平横展主枝 + 扁伞冠」——樱花（染井吉野）的辨识度正在这个横向展开的伞形轮廓上，和球堆冠不是同一个骨架。如果你只想要一棵不会飘花的粉树，用 broadleaf + bloomRate 即可，不必用这个 ID。

【花瓣动画的实现方式】draw 是无状态的，花瓣不存任何数组/计时器。每片花瓣的位置由 (performance.now(), ctx.seed, 序号 i) 纯函数算出：起点由 hash 定在冠底外缘，下落进度 cyc = (t·速度 + 相位) % 1，横向叠正弦摆动 + 随 cyc 线性侧向漂移（模拟稳定风向）。因此同一时刻 + 同一 seed 必然得到同一画面，可复现；也意味着渲染器只要逐帧调 draw 就自动动起来，不需要任何注册/销毁逻辑。若渲染器只在参数变化时绘制（如烘焙底图），画面会停在一帧静态花瓣上——那也仍然是一张合理的「落樱瞬间」，或者把 petals 设为 0 得更干净。

【坑 1：两张皮】BLOOM_HI/MID/LO 是 [r,g,b] 数组，只能喂 sphere；PETAL/PALE 是 ctx.rgb() 出来的打包像素，只能喂 plot；GROUND 是 rampOf()[2] 打包值，同样只能喂 plot。混用会当场抛异常。

【坑 2：花瓣起点】花瓣若从树心 (cx, cy) 生出，会先穿过花冠再冒出来，视觉上像树在漏粉。所以起点半径 = S·(0.42~1.32) 落在冠缘，且起始 z 取冠底偏上，出生即已在冠外缘。

【坑 3：blush 插值】三档花色都写成关于 bl 的一次函数（同一色相整体压暗），而不是分别挑三种粉——后者会让深浅档之间色相漂移，Bayer 抖动会读出彩点。

【坑 4：翻转像素】每片花瓣画两个 plot：一个主色，第二个按 sin 相位决定是横向 +0.07 还是竖向 +0.07，读起来像花瓣在翻面，单像素也有体积感。

【性能】默认 18 片花瓣 × 2 px + 落瓣 ~8 px，树冠约 40 个 sphere。花瓣上限 40 时约 80 次 plot，开销可忽略。

【建议的参数预设】白樱：blush 0.15 / bloom 1.2；深粉枝垂樱：blush 0.85 / spread 1.4 / height 3.0；大风落樱：fallSpeed 1.1 / petals 34。

### 实现

```js
KIT.register({
  id: 'sakura',
  name: '樱花树',
  category: 'tree',
  desc: '矮壮紫褐主干向四周横展伞形枝，粉白花团压满枝头，花瓣持续旋转飘落',
  params: {
    height:    { def: 3.6, min: 2.4, max: 5.6, step: 0.1, desc: '树高' },
    spread:    { def: 1.0, min: 0.6, max: 1.6, step: 0.05, desc: '冠幅展开半径' },
    bloom:     { def: 1.0, min: 0.4, max: 1.8, step: 0.1, desc: '花团饱满度' },
    petals:    { def: 18,  min: 0,   max: 40,  step: 1, desc: '飘落花瓣数量（0 = 静态）' },
    fallSpeed: { def: 0.55, min: 0.2, max: 1.2, step: 0.05, desc: '花瓣下落速度' },
    blush:     { def: 0.5, min: 0,   max: 1,   step: 0.05, desc: '花色深浅：0 近白，1 深粉' }
  },
  collision: { type: 'cylinder', radius: 0.3, height: 3.4 },
  draw(ctx, inst) {
    const p = ctx.params;
    const H = p.height, S = p.spread;
    const cx = ctx.x, cy = ctx.y, cz = ctx.z;
    const bh = H * 0.36;
    const topZ = cz + bh;
    const bl = ctx.clamp(p.blush, 0, 1);

    // 枝干：紫褐三档（每通道差 15~20，抖动不会出彩点）
    const BARK = [78, 60, 64], BARK_HI = [98, 78, 82], BARK_LO = [60, 45, 50];
    // 花色：随 blush 在白粉与深粉之间线性插值，保持色相不跑
    const BLOOM_HI  = [Math.round(246 - 6 * bl),  Math.round(226 - 30 * bl), Math.round(232 - 20 * bl)];
    const BLOOM_MID = [Math.round(234 - 8 * bl),  Math.round(204 - 32 * bl), Math.round(216 - 22 * bl)];
    const BLOOM_LO  = [Math.round(212 - 14 * bl), Math.round(176 - 34 * bl), Math.round(192 - 20 * bl)];

    // —— 主干：矮壮、顶端微微侧倾 ——
    const tx = cx + (ctx.hash(1, ctx.seed) - 0.5) * 0.2;
    const ty = cy + (ctx.hash(2, ctx.seed) - 0.5) * 0.14;
    const tr = 0.15 + H * 0.026;
    ctx.sphere(cx, cy, cz + 0.06, tr * 1.3, BARK_LO, 'rough');
    ctx.capsule([cx, cy, cz], [tx, ty, topZ], tr, tr * 0.62,
      z => (z > cz + bh * 0.55 ? BARK_HI : BARK), 'rough');

    // —— 四根近水平横展主枝：樱花标志性的伞形骨架 ——
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + ctx.hash(i + 3, ctx.seed) * 0.6;
      const len = S * (1.15 + ctx.hash(i + 13, ctx.seed) * 0.5);
      const ex = tx + Math.cos(ang) * len;
      const ey = ty + Math.sin(ang) * len;
      const ez = topZ + H * (0.10 + ctx.hash(i + 23, ctx.seed) * 0.14);

      ctx.capsule([tx, ty, topZ + 0.02], [ex, ey, ez], tr * 0.5, 0.035,
        z => (z > topZ + H * 0.1 ? BARK_HI : BARK), 'rough');

      const nc = 3 + Math.round(ctx.hash(i + 33, ctx.seed) * 2);
      for (let k = 0; k < nc; k++) {
        const t = 0.4 + (k / Math.max(1, nc - 1)) * 0.6;
        const px = ctx.lerp(tx, ex, t);
        const py = ctx.lerp(ty, ey, t);
        const pz = ctx.lerp(topZ, ez, t);
        const rr = (0.28 + ctx.hash(i * 7 + k + 41, ctx.seed) * 0.14)
                 * (0.85 + S * 0.28) * (0.8 + p.bloom * 0.28);
        // 扁团：主球抬高压冠，侧球错位补出蓬松边缘
        ctx.sphere(px, py, pz + rr * 0.55, rr, k > nc - 2 ? BLOOM_HI : BLOOM_MID, 'rough');
        ctx.sphere(px + rr * 0.5, py + rr * 0.32, pz + rr * 0.2, rr * 0.72, BLOOM_MID, 'rough');
        if (k > 0) ctx.sphere(px - rr * 0.42, py - rr * 0.28, pz + rr * 0.1, rr * 0.6, BLOOM_LO, 'rough');
      }
    }
    // 冠顶补簇，压住伞心不露空
    const capR = S * 0.5 * (0.85 + p.bloom * 0.2);
    ctx.sphere(tx, ty, topZ + H * 0.28, capR, BLOOM_HI, 'rough');
    ctx.sphere(tx + S * 0.28, ty - S * 0.2, topZ + H * 0.22, capR * 0.8, BLOOM_MID, 'rough');

    // —— 飘落花瓣：无状态纯函数动画，位置只由 (时间, seed, 序号) 决定 ——
    const now = ((typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now()) * 0.001;
    const PETAL = ctx.rgb(Math.round(248 - 6 * bl), Math.round(226 - 28 * bl), Math.round(236 - 18 * bl));
    const PALE = ctx.rgb(255, 243, 246);
    const np = Math.round(p.petals);
    for (let i = 0; i < np; i++) {
      const h1 = ctx.hash(i * 6 + 101, ctx.seed);
      const h2 = ctx.hash(i * 6 + 102, ctx.seed);
      const h3 = ctx.hash(i * 6 + 103, ctx.seed);
      const h4 = ctx.hash(i * 6 + 104, ctx.seed);
      const h5 = ctx.hash(i * 6 + 105, ctx.seed);
      const h6 = ctx.hash(i * 6 + 106, ctx.seed);

      // 起点落在冠底外缘，不从树心钻出来
      const ang = h2 * 6.2832;
      const rad = S * (0.42 + h1 * 0.9);
      const sx = cx + Math.cos(ang) * rad;
      const sy = cy + Math.sin(ang) * rad;
      const sz = cz + bh * 0.96 + H * (0.02 + h3 * 0.22);

      // 循环相位：各花瓣速度/起点不同，永不整齐划一
      const cyc = (now * p.fallSpeed * (0.55 + h4 * 0.9) * 0.38 + h5 + i * 0.173) % 1;
      const z = ctx.lerp(sz, cz + 0.05, cyc);
      const x = sx + Math.sin(cyc * 10.5 + h1 * 6.2832) * (0.16 + h3 * 0.2) * S + cyc * 0.3 * S;
      const y = sy + Math.cos(cyc * 7.7 + h2 * 6.2832) * 0.12 * S + cyc * 0.08 * S;

      const col = cyc > 0.88 ? PALE : PETAL;
      ctx.plot(x, y, z, col);
      // 第二像素模拟花瓣翻转：横躺或竖立
      if (Math.sin(cyc * 13 + h6 * 6.2832) > 0) ctx.plot(x + 0.07, y, z, PALE);
      else ctx.plot(x, y + 0.07, z + 0.02, PALE);
    }

    // —— 树下落瓣堆积 ——
    const ng = Math.round(3 + p.bloom * 5);
    const GROUND = ctx.rampOf([238, 198, 212])[2];
    for (let i = 0; i < ng; i++) {
      const a = ctx.hash(i + 301, ctx.seed) * 6.2832;
      const r = S * (0.35 + ctx.hash(i + 311, ctx.seed) * 1.25);
      ctx.plot(cx + Math.cos(a) * r, cy + Math.sin(a) * r, cz + 0.02, GROUND);
    }

    ctx.shadow(S * 1.45, 1, 0.5);
  }
});
```
