# 构件行为系统（Behavior）

> 构件 = **外形**（`draw`）+ **行为**（`behavior`）。
> 外形决定它长什么样；行为决定它怎么动、怎么被点、被砍、被风吹。
> 两者都可以单独被 AI 改写，互不牵连。

## 1. 为什么单独做一层

现有构件只有 `draw(ctx)`，是**静态展示**。场景里的动态（村民走动、树冠风动、
汽车行驶）都写死在具体场景里，换一个场景就要重写一遍。

行为层要解决三件事：

| 问题 | 行为层的答案 |
|------|--------------|
| 每个构件都要能互动 | 构件声明自己支持哪些行为，场景运行时统一 tick |
| 行为逻辑多种多样 | 行为是**独立可注册模块**，构件只选组合与参数 |
| AI 要能改逻辑 | 行为配置是纯 JSON（id + params），AI 改配置或写新行为模块 |

## 2. 契约

### 2.1 构件侧

```js
KIT.register({
  id: 'cone-mast',
  /* …外形参数… */
  behavior: {
    // 默认挂载（实例可覆盖）
    default: [
      { id: 'sway', params: { amp: 1.8 } },
      { id: 'chop', params: { hits: 4, stump: 'stump' } },
    ],
    // 允许挂载的行为（编辑器/AI 只能从这里选）
    allow: ['sway', 'chop', 'burn'],
  },
  draw(ctx, inst) { /* 外形 */ },
});
```

### 2.2 行为侧

```js
KIT_BEHAVIOR.register({
  id: 'sway',
  label: '随风摆动',
  category: 'ambient',        // ambient 环境 / active 主动 / reaction 反应 / state 状态
  desc: '树冠随全局风势摆动，顶部摆幅大',
  params: {
    amp:  { def: 2, min: 0, max: 6, step: .25, desc: '摆幅（像素）' },
    freq: { def: 1, min: .2, max: 3, step: .1, desc: '频率倍率' },
  },
  init(inst, bh, world) {},          // 可选：首次挂载
  tick(inst, bh, dt, world) {},      // 每帧：改 inst.anim
  event(inst, bh, ev, world) {},     // 可选：点击/砍/风等事件
  draw(ctx, inst, bh) {},            // 可选：行为自己的附加绘制（烟雾、碎片）
});
```

### 2.3 实例状态

```js
inst.anim = {
  dx: 0, dy: 0,      // 世界坐标偏移（风摆、震动）
  rot: 0,            // 绕实例原点旋转（倒下、摇晃）
  scale: 1,          // 整体缩放
  kind: null,        // 外形接管：'__stump__' = 不画原构件，由行为自己画
  z: 0,              // 高度偏移
  hidden: false,     // 整件不画（闪烁、消失）
};
```

`KIT_RENDER.makeCtx` 会把 `anim` 叠加到所有原语上：
`rot` 加在实例朝向上，`dx/dy` 在旋转缩放后平移。

**外形接管**：`anim.kind === '__stump__'` 时渲染器跳过构件自己的 `draw`，
只调用行为的 `draw`（砍倒后画树桩）。新增接管类型时同步改 preview.js / viewer.js 两处。

### 2.4 世界状态

```js
world = {
  t,                       // 秒
  wind: { x, y, strength },// 全局风（阵风包络由场景算）
  dt,
  emit(type, inst, data),  // 行为之间通信（冒烟、掉落）
};
```

### 2.5 分类兜底

构件**没写** `behavior` 字段时，按分类给一套默认行为与白名单。
这样"每个构件都有交互逻辑"成立，具体构件仍可显式覆盖。

| 分类 | 默认行为 | 可挂行为 |
|------|----------|----------|
| `tree` | `sway` | sway / chop / burn / shake |
| `plant` | `sway` | sway / shake / burn |
| `building` | —（静态） | flicker / burn / shake |
| `structure` | —（静态） | sway / shake |
| `prop` | —（静态） | flicker / shake / burn |
| `vehicle` | —（静态） | spin / bob / shake |
| `figure` | `greet` | greet / wander / flee |
| `animal` | `wander` | wander / flee / greet |
| `effect` | `flicker` | flicker / bob |

建筑默认是静态摆件（不摇），但窗灯可以手动加 `flicker`；
树默认会随风摆，砍伐/着火要显式挂。

## 3. 内置行为

### 3.1 核心（`demo/kit/behavior.js`）

| ID | 类别 | 作用 |
|----|------|------|
| `sway` | ambient | 随风摆动，按高度加权 |
| `chop` | reaction | 被点击砍伐：震 → 倒 → 变树桩 |
| `greet` | reaction | 点击招手（跳一下） |
| `flicker` | ambient | 灯光不规则明灭 |
| `wander` | active | 出生点附近随机走动 |
| `flee` | reaction | 受惊逃跑 |
| `spin` | ambient | 绕轴匀速旋转（风车/水车） |

### 3.2 扩展（`demo/kit/behavior-extra.js`）

| ID | 类别 | 作用 | 关键参数 |
|----|------|------|----------|
| `burn` | reaction | 点击点燃：火苗覆盖 + 短促明灭 + 烟点上升，烧完隐藏并 `emit('burned')` | `time/auto/smoke/spread/rise` |
| `bob` | ambient | 上下浮动 + 半频轻摇（船/浮标） | `amp/freq/tilt` |
| `open` | reaction | 点击开合（门/盖子），旋转或缩放两种表现 | `angle/time/style/shrink` |
| `patrol` | active | 在两个端点之间来回走，端点停留 | `ax/ay/bx/by/speed/pause` |
| `grow` | state | 从 `from` 倍长到 1 倍 | `time/from/delay` |
| `shake` | reaction | 受击短促抖动，不倒下 | `amp/time/freq` |

新增行为只需 `KIT_BEHAVIOR.register` 一次，所有构件都能挂。
行为层没有独立的 tint 通道：`burn` 的"颜色闪烁"用约 10% 帧的短促 `hidden`
加 `draw` 火焰覆盖来近似。

## 4. 场景侧

场景对象多一个可选字段：

```json
{
  "kind": "cone-mast", "x": 20, "y": 25,
  "behaviors": [{ "id": "sway", "params": { "amp": 2.4 } }]
}
```

- 缺省 → 用构件的 `behavior.default`
- `[]` → 明确关闭所有行为（静态摆件）
- 场景查看器每帧 `KIT_BEHAVIOR.tick(inst, dt, world)` → 重绘

## 5. Studio

「逻辑」标签页：

- 列出当前构件的行为（默认 + 允许）
- 每个行为可调参数（中英对照）
- 「预览」里直接跑
- AI 编辑：提示词携带行为契约，可改参数、换行为、写新行为模块

## 6. 文件归属

| 文件 | 职责 |
|------|------|
| `demo/kit/behavior.js` | 运行时 + 内置行为 |
| `demo/kit/behavior-extra.js` | 扩展行为（AI 生成/第二批） |
| `demo/studio/app-behavior.js` | Studio 逻辑面板 |
| `demo/scenes/view.html` + `viewer.js` | 每帧 tick + 重绘 |
