# 参考项目构件移植清单（ref-port）

> 本文件记录从 `reference/pixel-plays/` 移植进 KIT 构件库的第一批建筑/结构构件。
> 注册表登记由维护者统一完成；本文件只负责**来源、参数、算法差异、坑**。
>
> 代码：`demo/kit/ref-buildings.js`（8 个）· `demo/kit/ref-structures.js`（4 个）
> 实画测试：`node tools/kit-test.mjs`（`files` 已追加这两个文件）

---

## 1. 总表

| ID | 名称 | 分类 | 来源 | 关键配方 |
|----|------|------|------|----------|
| `house` | 石屋 | building | `stari-most:192` `house()` | 砌体双面墙 + 规则窗 + 出挑坡顶 + 山墙 |
| `square-tower` | 方塔 | building | `stari-most:149` `squareTower()` | 砌体塔身 + 交错窄窗 + 出挑坡顶 |
| `round-tower` | 圆锥塔 | building | `stari-most:159` `roundTower()` | 圆柱法线光照 + 锥顶收口 + 环纹 |
| `pitched-roof` | 坡屋顶 | building | `stari-most:181` `roof()` | 屏幕投影分行瓦片 + 随机缺片 + 山墙 |
| `parapet` | 女儿墙 | building | `laundry:132-135` | 四边 `box()` + 四种子 + 压顶石 |
| `water-tank` | 屋顶水箱 | building | `laundry:141-142` | 卧倒圆柱胶囊 + 分段罐体 + 金属箍 |
| `chimney` | 烟囱 | building | `laundry:144-146` | 石身 + 灰泥压顶 + 陶土帽三层收分 |
| `stairs` | 梯子 | structure | `mini-ramp:183-185` | 双侧杆 + 等距横档（可调倾角） |
| `wood-fence` | 木板围栏 | structure | `balote:127-132` | 交替深浅板条 |
| `wire-fence` | 铁丝围栏 | structure | `tie-break:108-123` | 斜向网格求交（菱形） |
| `net` | 球网 | structure | `tie-break:142-149` | 正交网格求并 + 白色包边 |
| `ramp` | U 型坡道 | structure | `mini-ramp:69-84,153-165` | 弧长参数化扫掠 + 朝向明暗 + 侧板 |

> `stairs` 按 `docs/kit/structures.md §4.4` 的参考实现是**梯子**（双杆 + 横档），
> 不是台阶式楼梯；ID 沿用参考项目的 `stairs`。

---

## 2. 共用的三个算法助手

`ref-buildings.js` 顶部集中实现，所有建筑构件复用同一份：

| 助手 | 作用 | 出处 |
|------|------|------|
| `refMasonry(ctx, a, z, base, ramp)` | 错缝砖石：层高 `z*1.6`、错缝 `(course%2)*.5`、灰缝 `.14/.1`、每块色差 | structures.md §1 |
| `refRoof(ctx, ..., rise, ramp, rows, seed)` | 双坡瓦面：**按屏幕投影高度分行**（每行约 3.6px），近坡 3 档 / 远坡 1 档，暗行降档 | buildings.md §5 |
| `refGable(ctx, xFace, ...)` | 山墙三角：必须画在出檐外缘（`x1+.22`） | buildings.md §5 坑 |
| `refShadow(ctx, ...)` | 体积阴影：`x/y` 步长 `.7`、`z` 步长 `1` | structures.md §2 |

**为什么瓦行不用 `floor(q*half*3.4)`**：参考项目在 360×280 下屋顶行距约 2px，
`plot()` 像素取整后会读成锯齿。改按屏幕位移分行后，大屋顶小屋顶都能读出一行行瓦。
`rows` 参数即行密度，`3.4` 等价于参考实现的密度。

---

## 3. 每个构件的参数与要点

### 3.1 `house` 石屋

| 参数 | 默认 | 区间 | 说明 |
|------|------|------|------|
| `width` | 3.2 | 2 ~ 6 | 屋身宽 |
| `depth` | 2.6 | 1.6 ~ 5 | 屋身深 |
| `height` | 3.0 | 2 ~ 5 | 檐口墙高 |
| `rise` | 1.3 | .6 ~ 2.5 | 屋脊升起 |
| `windows` | 2 | 1 ~ 5 | 正面窗数 |
| `roofWarm` | 0 | 0 ~ 1 | 0 青灰 / 1 暖红 |

- 正面 `base=3`、侧面 `base=2` → 自动出体积。
- 窗凸出墙面 `.14`；屋顶四周出挑 `.2`；山墙画在 `x1+.22`。
- 碰撞体 `box 3.6×3.0×4.3`（默认参数，含出檐）。

### 3.2 `square-tower` 方塔

参数：`width 2.2 (1.6~4)`、`depth 2.2 (1.6~4)`、`height 9.4 (5~14)`、
`rise 1.4 (.6~2.5)`、`windows 3 (1~5)`、`roofWarm 0`。

- 窗位置固定表 `[[.35,.3],[.65,.55],[.35,.78],[.7,.2],[.25,.62]]`，
  数量参数取前 N 个 → 三个窗在两个高度交错，读起来像塔。
- 每扇窗补一条亮色窗台，否则窄窗在浅石墙上不够清楚。

### 3.3 `round-tower` 圆锥塔

参数：`radius 1.9 (1~3)`、`height 9.4 (5~12)`、`roofRise 2.1 (1~4)`、
`windows 2 (0~4)`、`roofWarm 0`。

- 塔身整圈 `t: 0 → 2π` 全画，靠深度缓冲遮挡；只画前半圈会在旋转/换角度时露馅。
- 圆柱亮度：`base = round(2.4 + (-.5nx+.85ny)*1.3)`。
- 锥顶：`rr = (r+.2)*(1-q)`，`(floor(q*12)%2)*.4` 加横向环纹。
- 窗凸出塔面 `.14`；背面的窗由深度测试自然遮住。

### 3.4 `pitched-roof` 坡屋顶

参数：`width 3.2 (2~7)`、`depth 2.4 (1.6~5)`、`rise 1.3 (.6~2.5)`、
`rows 3.4 (2~6)`、`roofWarm 0`、`gable 1 (0/1)`。

- 可单独摆在墙头上；`gable=0` 时只剩两坡瓦面。
- 山墙画在 `x1+.02`（比屋面最外一列多 0.02，深度稳定赢）。

### 3.5 `parapet` 女儿墙

参数：`width 4 (1~8)`、`depth 3 (1~6)`、`height .6 (.3~1.2)`、
`thickness .3 (.15~.5)`、`coping 1 (0/1)`。

- 四边各用不同 `seed`（`ctx.seed+1..4`），否则四面的 `box` 噪声纹理完全一样。
- 四条 `box()` 允许转角重叠——参考实现就是整条铺，重叠部分由深度决定。
- `thickness` 会夹到 `min(width,depth)/2 - .02`，极端参数下不会翻面。
- `coping` 在墙顶压一圈略出挑 `.03` 的条石。

### 3.6 `water-tank` 屋顶水箱

参数：`length 1.8 (.8~3.2)`、`radius .55 (.3~1)`、`lift 1.0 (0~2.6)`、
`bands 3 (0~6)`。

- 卧倒圆柱 = 水平 `capsule`；沿长度分 `bands+1` 段、交替深浅 → 拼装缝。
- 金属箍是 yz 平面上的细环（`plot`），靠深度测试只露朝相机的一段。
- `lift` 是罐底离地高度；>0 时画两个石墩。`lift=0` 直接落地。
- 端盖用略大的 `capsule` 单点两次，得到亮环。

### 3.7 `chimney` 烟囱

参数：`width 1.1 (.5~2)`、`depth 1.1 (.5~2)`、`height 2.8 (.8~5)`、
`cap .15 (0~.4)`、`pot 1 (0/1)`。

- 三层收分：石身 → 出挑灰泥压顶 → 收进一半的陶土帽；帽顶再压一块暗色开口。
- 石缝用 `plot` 画在墙面外 `.012`（`y1+.012` / `x1+.012`），否则被 `box` 深度吃掉。

### 3.8 `stairs` 梯子

参数：`height 2.6 (1~5)`、`width 1.0 (.5~2)`、`lean 12° (0~40)`、
`rungGap .55 (.25~1)`、`railR .06 (.03~.12)`。

- 两根侧杆用 `capsule`，横档沿梯身等距；`lean=0` 即参考项目的垂直梯。
- 横档位置按**沿杆距离** `s` 换算到 `y/z`，倾斜时不会浮空。
- 碰撞体按默认倾角给 `box 1.0×.8×2.6`。

### 3.9 `wood-fence` 木板围栏

参数：`length 4 (1~10)`、`height .85 (.3~1.6)`、`boardW .55 (.25~1.2)`、
`thickness .14 (.06~.3)`。

- 每块板一个 `box`，按索引 `k` 交替 `RFS_WOOD` / `RFS_WOOD_LIGHT`；
  板间留 `.03` 缝 → 单色也读得出是一块块板条。
- 每条板一个 `seed`（`ctx.seed + k*3`），木纹不重复。

### 3.10 `wire-fence` 铁丝围栏

参数：`length 4 (1~12)`、`height 1.2 (.4~2.5)`、`mesh 1.5 (.5~3)`、
`wireW .11 (.04~.3)`、`postEvery 2.5 (.6~6)`。

- 菱形网眼：`f=(a+z)*mesh`、`g=(a-z)*mesh`，两者的小数部分**同时** > `wireW` 才跳过；
  等价于两组斜线求交。**围栏用 `&&`，球网用 `||`，别搞反。**
- 立柱数量 `round(length/postEvery)`，两端一定落柱。
- 顶杆用一根长 `capsule`。

### 3.11 `net` 球网

参数：`width 3.2 (1~6)`、`height 1.0 (.5~2)`、`meshU 2.8 (.8~5)`、
`meshV 3.4 (.8~6)`、`strap 1 (0/1)`、`postR .07 (.04~.15)`。

- 方格网眼：横向 `f=a*meshU < .2` **或** 纵向 `g=z*meshV < .24`。
- 顶部 `.13` 为白色包边；中央绑带也要白色 —— 但必须往 `+y` 推 `.02`，
  否则和网格同深度会被 `plot` 的 `>` 判断拒掉。
- 两根深色网柱各由一个 `box` 加高 `.1`。

### 3.12 `ramp` U 型坡道

参数：`radius 2.6 (1.2~5)`、`flat 2.0 (.8~5)`、`halfW 2.2 (1~4)`、
`deck 1.0 (.4~3)`、`rail 1 (0/1)`。

- 保留参考实现的局部坐标系：`a` 沿屏幕水平、`w` 朝相机。
  `world(a,w) = [x+(a+w)/R2, y+(w-a)/R2]`，因此 **`a` 直接就是屏幕横向像素尺度**。
- `pointOnRamp(s)` / `surfaceAt(a)` 两个映射都要保留：
  前者画曲面，后者求侧板高度。
- 曲面明暗：`facing = sin(th)`，正对光更亮；板缝按 `s/2.44`、`w/2.3` 两组等距线；
  中间常走的一条线再压暗 `.35`；平台（`onDeck`）整体提亮 `.4`。
- 侧板刷上立柱与上下封边；弧口加钢轨；平台护栏由一根立柱 + 一根横杆组成。
- `a` 是屏幕横轴，所以坡道在场景里是**斜向摆放**的；碰撞体用
  `cylinder r=5.5` 近似整体包围（默认参数）。

---

## 4. 移植时踩到的坑

1. **两张颜色皮**：`ctx.box/capsule/sphere` 只吃 `[r,g,b]` 基色数组；
   `ctx.plot` 只吃 `ctx.rampOf()` / `ctx.rgb()` 的打包整数。混用会在 kit-test 里直接抛错。
2. **深度相等也会被拒**：`plot()` 用 `p.d <= zb[i]` 才返回。
   同位置的贴面（窗、石缝、球网绑带）必须向外推 `.01`～`.02`，否则完全不显示。
3. **山墙位置**：画在 `x1` 会被出檐屋面整片盖住；必须画在 `x1+.2` 之外。
4. **瓦行不是世界行**：按世界坐标分行在小屋顶上只有 ~2px，必须按屏幕投影分行。
5. **近坡亮、远坡暗**：参考实现是 `y > yc ? 3 : 1`，不要按直觉交换。
6. **围栏 `&&`、球网 `||`**：前者菱形，后者方格；反了形状就变正交矩形网格。
7. **斜坡的坐标系**：`world()` 里 `a` 沿屏幕水平，`w` 是纵深；
   不要把它当成世界 x/y 直接写，否则坡道会变成 45° 斜放的怪形。
8. **`ctx.hash(k, seed)`**：所有随机都带 `ctx.seed`，同种子可复现；
   文件里没有一处 `Math.random()`。
9. **`stairs` 的横档按沿杆距离换算**：直接按世界 z 摆放横档，倾斜后会一根根浮空。

---

## 5. 验证

- `node tools/kit-test.mjs`：**41/41 通过**（本次新增 12 个 + 现有构件）。
  > 运行时会话里 `props.js` 同时新增了 `beetle-taxi`，所以总数是 41 而非 40。
- 默认参数下逐件实画的像素数（PP_SCALE 11）：

| 构件 | 像素 | 构件 | 像素 |
|------|------|------|------|
| house | 2132 | water-tank | 448 |
| square-tower | 3818 | chimney | 651 |
| round-tower | 4743 | stairs | 110 |
| pitched-roof | 704 | wood-fence | 353 |
| parapet | 988 | wire-fence | 331 |
| net | 268 | ramp | 4075 |

全部 > 80。`stairs` 最少（110），因为默认是细杆梯；调高 `height` 或减小 `rungGap` 会增加。

---

## 6. 集成状态

本次只被 `tools/kit-test.mjs` 加载。以下页面/工具仍使用各自的脚本白名单，
需要维护者按需追加 `../kit/ref-buildings.js`、`../kit/ref-structures.js`：

- `demo/kit/gallery.html`
- `demo/studio/preview.html`
- `demo/studio/editor.html`
- `demo/scenes/viewer.js`
- `demo/studio/server.mjs` 的 `/api/kit` 扫描列表（若需 AI 编辑）

`docs/kit/registry.md` 尚未登记这 12 个 ID，按任务约定由维护者统一登记。
