# 构件行为库 · 扩展包（behavior-extra）

> `demo/kit/behavior.js` 的第二批行为：`burn` / `bob` / `open` / `patrol` / `grow` / `shake`。
> 契约与内置行为完全一致（见 [../modules/behavior.md](../modules/behavior.md)），
> 只是单独成文件，方便 AI 继续追加而不动运行时。

## 0. 加载与接入

```html
<script src="../kit/behavior.js"></script>
<script src="../kit/behavior-extra.js"></script>
```

- 必须在 `engine.js`、`kit/core.js`、`kit/behavior.js` **之后**加载（同级 classic script，共享全局词法作用域）。
- 只依赖全局：`KIT_BEHAVIOR` / `hash()` / `ease()` / `lerp()` / `clamp()`。
- 当前接入状态：`demo/scenes/viewer.js` 的 `SCRIPTS` 已包含本文件；
  `demo/studio/preview.html` 仍只加载 `behavior.js`，Studio 逻辑面板里暂时看不到这 6 个行为。

注册表（`KIT_BEHAVIOR.defs`）里 id 全局唯一 —— 本文件的 6 个 id 与内置的
`sway / chop / greet / flicker / wander / flee / spin` 不冲突。

---

## 1. burn · 着火

| 项 | 值 |
|----|----|
| 源码 | `demo/kit/behavior-extra.js:37` `KIT_BEHAVIOR.register({ id: 'burn' … })` |
| 类别 | reaction |
| 用途 | 木箱、草堆、建筑：点击点燃 → 火苗 + 明灭 → 烟柱 → 烧完消失 |

**参数**

| 参数 | 默认 | 区间 | 步长 | 含义 |
|------|------|------|------|------|
| `time` | 6 | 1–20 | .5 | 从点燃到烧完的秒数 |
| `auto` | 0 | 0–1 | 1 | 1 = 挂载即点燃；0 = 点击点燃 |
| `smoke` | 1 | 0–2 | .1 | 烟雾浓度（火苗与烟点数量） |
| `spread` | .8 | .2–3 | .1 | 火焰散布半径（世界单位） |
| `rise` | 3.2 | .5–9 | .2 | 烟柱上升高度（世界单位） |

**状态机**

```
attach ──(auto=1)──────────────────────────▶ burning
   └──click──▶ burning ──(u≥1)──▶ done（anim.hidden 常驻）
```

- `u = (world.t - t0) / time`；`t0` 在第一次 tick 时懒赋值，避免 attach 时的
  `KIT_BH_WORLD` 与场景自定义 world 不是同一个。
- 燃烧期每帧：`anim.z` 加 `sin(t*26+seed)*.015`（火苗顶动）、
  `anim.scale = 1 + sin(t*19+seed)*.012`（热颤）。
- 颜色闪烁：行为层没有 tint 通道，用 `hash(floor(t*24)) > .9` 的高频短促
  `hidden`（约 10% 帧）近似，再在 `draw` 里用火苗点覆盖物体底部。
- 烧完时 `world.emit('burned', inst, { kind })`，场景可据此换焦黑变体。

**draw**（在构件 draw 之后调用）

- 火苗：`round(12 + 8*smoke)` 个暖色点，位置与颜色按 `floor(t*14)` 时间片
  重新 hash（三档：`[255,238,150] / [255,176,62] / [226,92,34]`）。
- 烟：`round(18*smoke)` 个灰点（`smoke=0` 不冒烟），`cyc` 循环上升，
  越高越淡（96→200），横向按 `world.wind` 二次漂移。

**坑**

- `KIT_BH_resetAnim` 每帧把 `hidden` 清零：`done` 之后必须**每帧重申**
  `anim.hidden = true`，否则烧完的物体下一帧又出现。
- 场景 viewer 对 `anim.hidden` 的实例会跳过构件与行为绘制（烟也停）；
  Studio preview 只跳过构件绘制、仍调用行为 `draw`（烟继续）。两端观感略有差异。

---

## 2. bob · 上下浮动

| 项 | 值 |
|----|----|
| 源码 | `demo/kit/behavior-extra.js:129` |
| 类别 | ambient |
| 用途 | 小船、浮标、漂浮道具 |

**参数**

| 参数 | 默认 | 区间 | 步长 | 含义 |
|------|------|------|------|------|
| `amp` | .12 | 0–1.5 | .01 | 上下幅度（世界单位） |
| `freq` | .5 | .05–3 | .05 | 每秒浮动次数 |
| `tilt` | .03 | 0–.4 | .01 | 左右轻摇幅度（弧度） |

**算法**

```
anim.z   += sin(t·freq·2π + phase) · amp
anim.rot += sin(t·freq·π + phase·1.3) · tilt
```

`phase` 由 `hash(seed, 977)` 生成，同一场景的实例不会同步起伏。

---

## 3. open · 开合

| 项 | 值 |
|----|----|
| 源码 | `demo/kit/behavior-extra.js:154` |
| 类别 | reaction |
| 用途 | 门、箱子盖、舱口：点击切换开/关 |

**参数**

| 参数 | 默认 | 区间 | 步长 | 含义 |
|------|------|------|------|------|
| `angle` | 1.15 | .2–2.6 | .05 | 开启角度（弧度，style=0） |
| `time` | .35 | .05–3 | .05 | 开/合耗时（秒） |
| `style` | 0 | 0–1 | 1 | 0 = 旋转开（门） / 1 = 缩放开（盖子） |
| `shrink` | .55 | .1–1 | .05 | 缩放开时保留的尺寸比例（style=1） |

**状态机**：`st.open` 布尔 + `st.k ∈ [0,1]` 进度；点击翻转目标，
`k` 以 `dt/time` 线性逼近，输出再过 `ease()`。

```
style=0 → anim.rot   += angle · ease(k)
style=1 → anim.scale  = 1 - (1 - shrink) · ease(k)
```

**坑**：`anim.rot` 是绕实例原点的 **yaw**（等距平面内转圈），不是绕门轴的合页旋转；
`anim.scale` 是整体围绕原点缩放。真正的合页需要运行时新增 pivot 通道，本版是近似表达。

---

## 4. patrol · 来回巡逻

| 项 | 值 |
|----|----|
| 源码 | `demo/kit/behavior-extra.js:190` |
| 类别 | active |
| 用途 | 卫兵、动物、巡逻车：沿 A/B 两点往返 |

**参数**

| 参数 | 默认 | 区间 | 步长 | 含义 |
|------|------|------|------|------|
| `ax` / `ay` | 0 / 0 | −20–20 | .1 | 端点 A 相对出生点的偏移 |
| `bx` / `by` | 2 / 0 | −20–20 | .1 | 端点 B 相对出生点的偏移 |
| `speed` | .7 | .05–4 | .05 | 移动速度（世界单位/秒） |
| `pause` | .4 | 0–5 | .1 | 到端点后停留秒数 |
| `bob` | .03 | 0–.3 | .01 | 走路时的上下起伏 |

**算法**

- `init` 记录出生点 `(hx, hy)` 与线段长度 `len`；`u ∈ [0,1]` 为线段参数。
- 每帧 `u += dir · speed·dt / len`，到端点夹住、翻转 `dir`、写入 `wait = pause`。
- `inst.x = hx + lerp(ax, bx, u)`，`inst.y = hy + lerp(ay, by, u)`；
  `anim.z += |sin(t·7 + phase)| · bob`。
- `len < 1e-4` 时原地不动（A、B 重合不除零）。

**坑**：端点是**相对出生点**的偏移，不是世界绝对坐标 —— 这样在编辑器里挪动实例，
整条巡逻路线跟着走。

---

## 5. grow · 生长

| 项 | 值 |
|----|----|
| 源码 | `demo/kit/behavior-extra.js:240` |
| 类别 | state |
| 用途 | 幼苗长成、建筑升起 |

**参数**

| 参数 | 默认 | 区间 | 步长 | 含义 |
|------|------|------|------|------|
| `time` | 3 | .2–20 | .1 | 长到满尺寸用时（秒） |
| `from` | .2 | .02–1 | .02 | 起始缩放（相对成体） |
| `delay` | 0 | 0–10 | .1 | 开始时静止等待（秒） |

**算法**：`anim.scale = lerp(from, 1, ease(clamp((t - t0 - delay)/time, 0, 1)))`；
`t0` 在第一次 tick 懒赋值。阴影半径走 `ctx.shadow` 的 `r * scale`，会跟着一起长。

---

## 6. shake · 受击抖动

| 项 | 值 |
|----|----|
| 源码 | `demo/kit/behavior-extra.js:264` |
| 类别 | reaction |
| 用途 | 木箱、树、任何"被打一下"的静物；**不倒下** |

**参数**

| 参数 | 默认 | 区间 | 步长 | 含义 |
|------|------|------|------|------|
| `amp` | .1 | 0–.6 | .01 | 抖动幅度（世界单位） |
| `time` | .45 | .1–2 | .05 | 抖动持续（秒） |
| `freq` | 16 | 2–40 | 1 | 抖动频率（次/秒） |

**算法**

```
e = t - t0;  k = 1 - e/time        // 线性衰减
anim.dx += sin(e·freq·2π)      · amp · k
anim.dy += sin(e·freq·2π·.61)  · amp · .5 · k
anim.rot += sin(e·freq·2π)     · amp · .35 · k
```

两个 `sin` 在 `e=0` 处都为 0，点击瞬间不跳变；`time` 过后回到 0，不留残余旋转。

---

## 7. 构件绑定清单

只改 `behavior` 字段，未动外形与参数。

| 构件 | 文件:行 | default | allow |
|------|---------|---------|-------|
| `birch` 白桦 | `demo/kit/trees.js:123` | `sway{amp:1.2}` | `sway` `chop` `shake` |
| `willow` 垂柳 | `demo/kit/trees.js:216` | `sway{amp:1.2}` | `sway` `chop` `shake` |
| `sakura` 樱花树 | `demo/kit/trees.js:302` | `sway{amp:1.2}` | `sway` `chop` `shake` |
| `crate` 木箱 | `demo/kit/props.js:115` | `[]`（静态） | `shake` `burn` |
| `tin-lamp-post` 铁皮路灯 | `demo/kit/props.js:150` | `flicker{}` | `flicker` `sway` |
| `lamp` 路灯 | `demo/kit/props.js:268` | `flicker{}` | `flicker` `sway` |

说明：

- 任务给定的 id 全部存在，无需替换。
- `crate` 默认静态，只有场景/AI 显式挂 `shake` 或 `burn` 才动。
- `KIT_BEHAVIOR.attach` 会按 `allow` 过滤：给 `birch` 硬挂 `burn` 会被静默丢弃。

---

## 8. 自测

```bash
node --check demo/kit/behavior-extra.js
node tools/kit-test.mjs          # 构件库全量实画（外形闸门）
node tools/behavior-test.mjs     # 行为回归（注册 / 引用 / 实跑 / 效果）
```

> `behavior-test.mjs` 当前对「所有声明了 behavior 的构件」都要求 60 帧内产生
> anim 变化。`crate` 按规格是 `default: []`（静态摆件，显式挂 `shake`/`burn`
> 才动），会被这条断言判为失败 —— 属于测试预期问题，建议该测试跳过
> `default` 为空的构件。

临时 vm 自测（不入库）覆盖：6 个行为各 attach + tick 60 帧 + click，
断言不崩且 `anim` 有变化；burn 生命周期最终 `hidden`；grow 收敛到 1；
patrol 覆盖 A/B；shake 结束后归零；6 个构件的绑定与白名单过滤。

---

## 9. 已知约束

1. **没有 tint 通道**：`anim` 只有 dx/dy/rot/scale/z/hidden，颜色闪烁只能用
   明灭 + 附加绘制近似（burn 的做法）。
2. **scale 独占**：`grow` 与 `open(style=1)` 都绝对写 `anim.scale`，同一实例
   不要同时挂这两个行为（后 tick 的会覆盖前一个）。
3. **hidden 不持久**：运行时每帧 `resetAnim`，任何"永久隐藏"的行为都要在
   `tick` 里每帧重申。
4. **patrol 改的是实例坐标**：实例的 `inst.x/inst.y` 会随巡逻移动，点击拾取与
   深度排序会自动跟随；但用出生点做锚点的其他行为（`wander`）请勿同挂。
