# 变体注册表（Registry）

> **这是构件库的活索引。** 所有已知变体在这里登记一行，指向配方卡。
> 新增变体 = 在本表加一行 + 在对应篇目写一张配方卡。
> 两步缺一不可：**没登记的变体等于不存在**（下次会重造轮子）。

---

## 0. 怎么用这张表

| 你要做 | 查这里 |
|--------|--------|
| 找"有没有现成的树可以用" | §1 树 |
| 找"有没有现成的建筑可以用" | §2 建筑 |
| 找"有没有现成的花草" | §3 草木 |
| 找道具 | §4 道具 |
| 找人物姿态 | §5 人物姿态 |
| 找特效 | §6 特效 |
| **登记新变体** | §7 |

**表头含义**

| 列 | 说明 |
|----|------|
| `ID` | 稳定的英文标识符，代码里用它引用。**一经使用不要改名** |
| `名称` | 中文显示名 |
| `特征` | 一句话形态描述，用于快速排除 |
| `来源` | 现有实现在哪（`ref` = 参考项目，`demo` = 本项目） |
| `参数组` | 可调参数名，详见配方卡 |
| `状态` | `✅` 已验证可用 · `🟡` 有实现未验证 · `📐` 只有规格待实现 |

---

## 1. 树（tree）

配方卡：[trees.md](trees.md)

| ID | 名称 | 特征 | 来源 | 参数组 | 状态 |
|----|------|------|------|--------|------|
| [`broadleaf`](trees.md#1-broadleaf-阔叶树) | 阔叶树 | 6 簇球堆树冠，顶部银绿，capture 缓存风动 | `ref` `engine.js:231` | `scale/count/leaf3/bark` | ✅ |
| [`palm`](trees.md#2-palm-棕榈) | 棕榈 | 二次曲线弯曲树干 + 10 片垂叶，环纹树皮 | `ref` `mini-ramp:119` | `scale/height/fronds` | ✅ |
| [`plane`](trees.md#3-plane-法国梧桐) | 法国梧桐 | 笔直灰白干 + 三层分叉，**树上无叶** | `demo` `autumn.js:266` | `h/seed/branch` | ✅ |
| [`canopy`](trees.md#4-canopy-郁闭林冠) | 郁闭林冠 | 内层大球填体块 + 表层小球做轮廓，静态 | `demo` `forest.js:116` | `size/crown/palette` | ✅ |
| [`simple`](trees.md#5-simple-简易球树) | 简易球树 | 单层球堆，最省 | `demo` `demo.js:70` | `size` | ✅ |
| [`pine`](trees.md#6-待实现变体的设计要点) | 针叶树 | 锥形塔状，多层三角冠 | — | — | 📐 |
| [`birch`](trees.md#6-待实现变体的设计要点) | 白桦 | 细直白干 + 横生短枝 | — | — | 📐 |
| [`willow`](trees.md#6-待实现变体的设计要点) | 垂柳 | 冠下垂枝串，末端渐细 | — | — | 📐 |
| [`blossom`](trees.md#6-待实现变体的设计要点) | 花树 | 阔叶树冠 + 粉白花点 | — | — | 📐 |
| [`shrub`](trees.md#6-待实现变体的设计要点) | 灌木 | 无干矮球丛 | — | — | 📐 |

---

## 2. 建筑（building）

配方卡：[buildings.md](buildings.md)

| ID | 名称 | 特征 | 来源 | 参数组 | 状态 |
|----|------|------|------|--------|------|
| [`masonry-wall`](buildings.md#1-砌体材质怎么用) | 砖石墙 | 错缝砌体 + 灰缝 + 逐块随机色 | `ref` `stari-most:100` | `base/seed` | ✅ |
| [`plaster-wall`](buildings.md#1-砌体材质怎么用) | 抹灰墙 | 抹灰 + 剥落露石 | `ref` `laundry:98` | `base` | ✅ |
| [`house`](buildings.md#2-house-房屋) | 房屋 | 两面墙 + 窗 + 出挑坡顶 | `ref` `stari-most:192` | `x0y0x1y1/z1/roofColor` | ✅ |
| [`square-tower`](buildings.md#3-square-tower-方塔) | 方塔 | 砌体塔身 + 窄窗 + 坡顶 | `ref` `stari-most:149` | `box/z1` | ✅ |
| [`round-tower`](buildings.md#4-round-tower-圆锥塔) | 圆锥塔 | 圆柱身 + 收口锥顶 + 环纹 | `ref` `stari-most:159` | `cxcy/r/z1` | ✅ |
| [`pitched-roof`](buildings.md#5-pitched-roof-坡屋顶) | 坡屋顶 | 双坡 + 瓦片行 + 缺片 | `ref` `stari-most:181` | `box/rise/color` | ✅ |
| [`parapet`](buildings.md#6-parapet-女儿墙) | 女儿墙 | 四边矮墙围合，屋面边缘 | `ref` `laundry:132` | `box/h/t` | ✅ |
| [`stair-house`](buildings.md#7-屋顶小构件组) | 楼梯间 | 屋顶小房 + 百叶门 | `ref` `laundry:138` | `box` | ✅ |
| [`water-tank`](buildings.md#7-屋顶小构件组) | 水塔 | 卧倒圆柱 + 支架 | `ref` `laundry:141` | `r/len` | ✅ |
| [`chimney`](buildings.md#7-屋顶小构件组) | 烟囱 | 三层方柱 + 陶土烟囱帽 | `ref` `laundry:144` | `box/h` | ✅ |
| [`cabin`](buildings.md#8-cabin-木屋) | 木屋 | 纯 `box()` 拼的板房 | `demo` `demo.js` | — | ✅ |
| [`wood-fence`](structures.md#43-wood-fence-木板围栏) | 木板围栏 | 交替木色的窄板条 | `ref` `balote:127` | `spacing/colors` | ✅ |
| [`wire-fence`](structures.md#41-wire-fence-铁丝围栏) | 铁丝围栏 | 菱形网眼 + 立柱 + 顶杆 | `ref` `tie-break:108` | `len/z/density` | ✅ |
| [`net`](structures.md#42-net-球网) | 球网 | 方格网 + 白色包边 | `ref` `tie-break:142` | `y/z` | ✅ |
| [`ramp`](structures.md#5-曲面构件) | U 型池 | 参数化曲面 + 板缝 + 使用痕迹 | `ref` `mini-ramp:150` | `flat/radius/width` | ✅ |
| [`stairs`](structures.md#44-stairs-梯子) | 梯子 | 横档 + 侧杆 | `ref` `mini-ramp:183` | — | ✅ |
| [`balcony`](buildings.md#9-待实现建筑的设计要点) | 阳台 | 挑出平台 + 栏杆 | — | — | 📐 |
| [`arch`](buildings.md#9-待实现建筑的设计要点) | 拱门 | 券石环 + 拱心石 | — | — | 📐 |
| [`shed`](buildings.md#9-待实现建筑的设计要点) | 棚屋 | 单坡顶 + 支柱 | — | — | 📐 |
| [`well`](buildings.md#9-待实现建筑的设计要点) | 水井 | 井圈 + 支架 + 吊桶 | — | — | 📐 |

---

## 3. 草木（plant）

配方卡：[plants.md](plants.md)

| ID | 名称 | 特征 | 来源 | 参数组 | 状态 |
|----|------|------|------|--------|------|
| [`grass-tuft`](plants.md#1-grass-tuft-草丛) | 草丛 | 1~3 像素高，风中摆动，影内自动变暗 | `ref` `engine.js:160` | `density/height` | ✅ |
| [`flower`](plants.md#2-flower-小花) | 小花 | 草丛顶端替换色，白/黄两色 | `ref` `engine.js:168` | `rate/color` | ✅ |
| [`scatter-grass`](plants.md#3-scatter-grass-静态草点) | 静态草点 | 直接写像素的短草，无风动 | `demo` `forest.js:60` | `count` | ✅ |
| [`potted-plant`](plants.md#4-potted-plant-盆栽) | 盆栽 | 花盆 + 14 球叶簇 | `ref` `laundry:150` | `r` | ✅ |
| [`fern`](plants.md#7-待实现变体的设计要点) | 蕨类 | — | — | — | 📐 |
| [`reed`](plants.md#7-待实现变体的设计要点) | 芦苇 | — | — | — | 📐 |
| [`moss`](plants.md#5-moss-苔藓斑) | 苔藓斑 | 低频噪声选区 + 高频打散 | `ref` `laundry:95` | — | ✅ |
| [`ivy`](plants.md#7-待实现变体的设计要点) | 藤蔓 | — | — | — | 📐 |
| [`hedge`](plants.md#7-待实现变体的设计要点) | 树篱 | — | — | — | 📐 |
| [`fallen-leaf`](plants.md#6-fallen-leaf-落叶) | 落叶 | 地面散落的秋叶 | `demo` `autumn.js:99` | — | ✅ |

---

## 4. 道具（prop）

配方卡：[props.md](props.md)

| ID | 名称 | 特征 | 来源 | 参数组 | 状态 |
|----|------|------|------|--------|------|
| [`ball`](props.md#1-ball-球) | 球 | `gloss` 高光 + 双层阴影 | `ref` `balote:412` | `r/color` | ✅ |
| [`bottle`](props.md#2-bottle-瓶--罐) | 瓶 | 竖直胶囊，上细下粗 | `ref` `balote:141` | `r0/r1` | ✅ |
| [`crate`](props.md#3-crate-木箱--板条箱) | 木箱 | `box()` + 独立 seed | `ref` `balote:139` | `size/seed` | ✅ |
| [`wicker-basket`](props.md#4-wicker-basket-藤篮--编织容器) | 藤篮 | 编织纹 + 篮口包边 | `ref` `laundry:170` | `r/h` | ✅ |
| [`cloth`](props.md#5-cloth-织物衣物最复杂的一类道具) | 织物 | 轮廓裁剪 + 波浪 + 旋转 | `ref` `laundry:233` | `w/h/kind` | ✅ |
| [`racket`](props.md#6-racket-球拍) | 球拍 | 柄 + 面，附着在手 | `ref` `tie-break:499` | `len/faceR` | ✅ |
| [`cone`](props.md#8-道具速查表) | 交通锥 | 锥形 + 按高度分色 | `ref` `mini-ramp:202` | `r0/r1` | ✅ |
| [`bench`](props.md#8-道具速查表) | 长椅 | 座 + 靠背 + 双腿 | `ref` `balote:135` | `len` | ✅ |
| [`awning`](structures.md#45-awning-天线) | 天线 | 竖杆 + 3 横杆 | `ref` `laundry:147` | — | ✅ |
| [`ball-basket`](props.md#8-道具速查表) | 球筐 | 筐 + 散落小球 | `ref` `tie-break:170` | — | ✅ |
| [`picnic-mat`](props.md#8-道具速查表) | 野餐布 | 格子布 | `demo` `autumn.js:57` | — | ✅ |
| [`lamp`](props.md#9-移植清单) | 路灯 | — | — | — | 📐 |
| [`sign`](props.md#9-移植清单) | 路牌 | — | — | — | 📐 |

---

## 5. 人物姿态（pose）

配方卡：[figures.md](figures.md) §2.4

| ID | 名称 | 特征 | 来源 | 状态 |
|----|------|------|------|------|
| [`idle`](figures.md#24-实用姿态配方) | 待机 | 呼吸 + 微摆臂 | `ref` `balote:357` | ✅ |
| [`aim`](figures.md#24-实用姿态配方) | 蓄力 | 蹲 + 后仰 + 手臂后拉 | `ref` `balote:359` | ✅ |
| [`swing`](figures.md#24-实用姿态配方) | 挥击 | 手臂扫过 + 转体 | `ref` `balote:362` | ✅ |
| [`cheer`](figures.md#24-实用姿态配方) | 欢呼 | 双臂高举，交替拍 | `ref` `stari-most:339` | ✅ |
| [`phone`](figures.md#24-实用姿态配方) | 拍照 | 双手举在胸前 | `ref` `stari-most:341` | ✅ |
| [`walk`](figures.md#24-实用姿态配方) | 行走 | 步态量化摆臂 | `ref` `stari-most:335` | ✅ |
| [`ready`](figures.md#24-实用姿态配方) | 备球 | 蹲 + 持拍后引 | `ref` `tie-break:489` | ✅ |
| [`sit`](figures.md#24-实用姿态配方) | 坐姿 | — | `demo` `autumn.js:155` | ✅ |
| [`lie`](figures.md#24-实用姿态配方) | 躺姿 | — | `demo` `autumn.js:204` | ✅ |
| [`reach`](figures.md#24-实用姿态配方) | 够取 | 手臂前伸 | — | 📐 |

### 5.1 人群变体（crowd）

配方卡：[crowd.md](crowd.md) §6

| ID | 名称 | 特征 | 来源 | 参数组 | 状态 |
|----|------|------|------|--------|------|
| [`passerby`](crowd.md#passerby-路人沿路径穿行) | 路人 | 沿窄带路径走停交替，每帧重新投影回带内 | `demo` `village/villagers.js` | `count/speed/wait/scale/gap` | ✅ |
| `spectator` | 围观者 | 向主角聚拢，留出 CLEARANCE 半径 | `ref` `stari-most:280` | — | 📐 |
| `wanderer` | 漫游者 | 均匀随机方向，走一段停一段 | — | — | 📐 |
| `crowd` | 观众（固定） | 站桩 + 转头/鼓掌 | `ref` `tie-break:506` | — | 📐 |

---

## 6. 特效（effect）

配方卡：[effects.md](effects.md) · [weather.md](weather.md)

| ID | 名称 | 特征 | 来源 | 状态 |
|----|------|------|------|------|
| [`arrow`](effects.md#1-像素级-ui-图形arrow-bang-target-ring-charge-bar-halo) | 指示箭头 | 字符画 + 白描边 + 浮动 | `ref` `engine.js:325` | ✅ |
| [`bang`](effects.md#1-像素级-ui-图形arrow-bang-target-ring-charge-bar-halo) | 爆炸符号 | 字符画 + 白描边 | `ref` `mini-ramp:467` | ✅ |
| [`target-ring`](effects.md#1-像素级-ui-图形arrow-bang-target-ring-charge-bar-halo) | 目标环 | 地面椭圆，黄黑/黑白 | `ref` `tie-break:515` | ✅ |
| [`charge-bar`](effects.md#1-像素级-ui-图形arrow-bang-target-ring-charge-bar-halo) | 能量条 | 17×5 边框 + 15 格 | `ref` `stari-most:555` | ✅ |
| [`halo`](effects.md#1-像素级-ui-图形arrow-bang-target-ring-charge-bar-halo) | 白描边 | 4 邻域扩散 | `ref` `engine.js:319` | ✅ |
| [`rain`](weather.md#1-rain-雨) | 雨 | 4 点雨丝 + 溅射 | `ref` `laundry:497` | ✅ |
| [`cloud`](weather.md#2-cloud-云) | 云 | Bayer 阈值透明 | `ref` `laundry:462` | ✅ |
| [`bolt`](weather.md#3-bolt-闪电) | 闪电 | 随机折线 + 三像素 | `ref` `laundry:481` | ✅ |
| [`grade-storm`](weather.md#4-grade-storm-全局调色) | 暴雨调色 | 去饱和 + 云影 + 变湿 | `ref` `laundry:516` | ✅ |
| [`splash`](nature.md#7-水花) | 水花 | 直接写像素 | `ref` `stari-most:543` | ✅ |
| [`ring`](nature.md#6-涟漪) | 涟漪 | 随机剔除虚线圆 | `ref` `stari-most:530` | ✅ |
| [`dust`](effects.md#3-屏幕特效汇总dust-spark-splash-ring-track-mark-falling-leaf) | 扬尘 | 落地小点 | `ref` `tie-break:546` | ✅ |
| [`spark`](effects.md#3-屏幕特效汇总dust-spark-splash-ring-track-mark-falling-leaf) | 火花 | 十字白点 | `ref` `tie-break:548` | ✅ |
| [`track-mark`](scene.md#8-地面痕迹动态磨损) | 地面痕迹 | 十字笔刷压暗 | `ref` `tie-break:354` | ✅ |
| [`falling-leaf`](nature.md#8-落叶飘落) | 落叶飘落 | 阵风包络 + 12fps 步进 | `demo` `autumn.js:315` | ✅ |

---

## 7. 登记新变体

### 7.1 流程

```
1. 先查本表 —— 真的没有能复用的？
2. 没有 → 实现它
3. 在本表对应分类加一行
4. 在对应配方卡篇目写一张完整配方卡
5. 如果它暴露了新的通用机制 → 回写到 engine 相关的配方卡
```

### 7.2 配方卡必填项

每张配方卡必须有（缺项就是没写完）：

| 项 | 要求 |
|----|------|
| **ID** | 与注册表一致 |
| **来源** | `文件:行号` + 函数名 |
| **形态** | 一段话讲清长什么样 |
| **参数** | 至少 1 个可调参数，标明**默认值和调参区间** |
| **关键算法** | 与"基型"的差异点，不是整段贴代码 |
| **移植清单** | 从源实现搬过来要改哪几行 |
| **坑** | 移植时最容易错的地方 |

### 7.3 复用优先原则

实现新变体前，先问：

| 问题 | 若答案是"是" |
|------|------------|
| 能用现有变体 + 改参数实现吗？ | 改参数，不写新变体 |
| 能用现有变体 + 换配色实现吗？ | 换配色（走参数组的 `palette`） |
| 形态差异只是"多一层"吗？ | 给基型加一个可选参数，而不是新建 ID |
| 形态差异是"骨架结构不同"吗？ | 才值得新建变体 |

**只有骨架结构不同才建新 ID。** 参数差异走参数组，色彩差异走配色组。

---

## 8. 相关文档

| 篇目 | 内容 |
|------|------|
| [README.md](README.md) | 总索引、复用路线、能力差距 |
| [registry.md](registry.md) | **本文件**：变体注册表 |
| [scene.md](scene.md) | 地面、边界、材质分区、痕迹 |
| [buildings.md](buildings.md) | 建筑变体配方卡 |
| [structures.md](structures.md) | 线性/曲面构件（围栏、网、坡道、桥） |
| [trees.md](trees.md) | 树变体配方卡 |
| [plants.md](plants.md) | 花草灌木变体配方卡 |
| [figures.md](figures.md) | 人物骨架、姿态、调色板 |
| [crowd.md](crowd.md) | 人群 AI |
| [props.md](props.md) | 道具变体 |
| [effects.md](effects.md) | UI 覆盖层与屏幕特效 |
| [weather.md](weather.md) | 天气与全局调色 |
| [nature.md](nature.md) | 水的渲染、水花、涟漪 |
