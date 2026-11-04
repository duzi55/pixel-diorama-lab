# 人群 AI

> 注册表：[registry.md §5](registry.md)
> 核心原则：**人群 = 独立个体 + 目标选择 + 局部避让**。三个人群变体共用同一套骨架。

---

## 0. 人群系统的三段结构

```
① 个体初始化   位置、速度、调色板、状态
      ↓
② 目标选择     想去哪（时机/方向/距离）
      ↓
③ 局部避让     不重叠、不挡主角、不出界
      ↓
④ 姿态合成     走路/停下/欢呼 → pose
```

参考项目只有一个完整实现（`stari-most` 的 14 个游客），但四个部分都可独立复用。

---

## 1. 个体初始化

```js
// 参考：stari-most:269-279
const tourists = [];
for (let k = 0; k < TOURIST_COUNT; k++) {
  const pick = (list, seed) => list[Math.floor(hash(k + 3, seed) * list.length)];
  const shirt = pick(TOURIST_SHIRTS, 41);
  tourists.push({
    x: (k / (TOURIST_COUNT - 1) - .5) * 15,      // 沿桥面横向铺开
    y: (hash(k, 42) - .5) * 1.4,                   // 纵深抖动
    tx: 0, ty: 0,                                  // 目标点
    speed: .45 + hash(k, 43) * .4,                 // 移动速度
    wait: hash(k, 44) * 4,                         // 下次移动的等待时间
    gait: hash(k, 45) * 6,                         // 步态相位
    yaw: Math.PI / 2, look: Math.PI / 2,
    phone: false, walking: false,
    palette: {
      shirt, stripe: hash(k, 46) > .75 ? [244,240,228] : shirt,
      legs: pick(TOURIST_LEGS, 47), hair: pick(TOURIST_HAIR, 48), skin: pick(TOURIST_SKIN, 49),
    },
  });
}
```

### 字段表

| 字段 | 类型 | 作用 |
|------|------|------|
| `x, y` | 世界坐标 | 当前位置 |
| `tx, ty` | 世界坐标 | 目标点 |
| `speed` | .45～.85 | 移动速度 |
| `wait` | 秒 | 站立的时长，到期才选新目标 |
| `gait` | 累积量 | 步态相位，驱动走路动画 |
| `yaw` | 弧度 | 身体朝向（平滑追踪） |
| `look` | 弧度 | 注视方向 |
| `walking` | 布尔 | 是否在移动 |
| `phone` | 布尔 | 是否在玩手机（决定姿态） |
| `palette` | 对象 | 配色 |

### 布点技巧

```js
x: (k / (TOURIST_COUNT - 1) - .5) * 15
```

**均匀铺开 + 一点抖动**。纯均匀会像队列，加了 `y` 抖动才自然。

### 配色表法

每个部位一个候选色数组，用 `hash(k + offset, seed)` 选取。

| 部位 | 参考 |
|------|------|
| `TOURIST_SHIRTS` | `stari-most:64`（8 色） |
| `TOURIST_LEGS` | `stari-most:65`（5 色） |
| `TOURIST_HAIR` | `stari-most:66`（6 色） |
| `TOURIST_SKIN` | `stari-most:67`（4 色） |

**`stripe` 有 25% 概率取白色**（`hash(k,46) > .75`），否则与 shirt 同色。
全员条纹会杂乱，多数纯色 + 少数条纹更自然。

---

### 1.4 多人配色生成

```js
// 参考：stari-most:64-67, 269-279
const TOURIST_SHIRTS = [[232,96,84], [244,196,74], [64,160,168], ...];
const pick = (list, seed) => list[Math.floor(hash(k + 3, seed) * list.length)];
tourists.push({
  ...
  palette: {
    shirt, stripe: hash(k, 46) > .75 ? [244, 240, 228] : shirt,   // 25% 概率纯色
    legs: pick(TOURIST_LEGS, 47), hair: pick(TOURIST_HAIR, 48), skin: pick(TOURIST_SKIN, 49),
  },
});
```

**配色表法**：每个部位给一个候选色数组，用 `hash` 带不同 seed 选取。
同 seed 恒定 → 每次刷新人群配色一致（可复现）。

`stripe` 有 25% 概率取白色，否则和 shirt 同色 → 大部分人纯色，少数有条纹，避免全员条纹的杂乱感。

---

---

## 2. 目标选择

### 2.1 基础模式

```js
// 参考：stari-most:280-287
function pickTarget(t) {
  const crown = Math.random() < .68, side = Math.random() < .5 ? -1 : 1;
  t.tx = crown ? side * (DIVER_CLEARANCE + .1 + Math.random() * 3.4)
               : side * (DIVER_CLEARANCE + .1 + Math.random() * 7);
  t.ty = (Math.random() < .55 ? 1 : -1) * (.25 + Math.random() * .47);
  t.walking = true;
}
```

**68% 的人往主角聚集（桥拱顶），32% 走远端**——"围观者 + 路人"的比例。

### 2.2 三种人群变体

| 变体 | 目标分布 | 用途 |
|------|----------|------|
| `spectator` 围观者 | 向主角聚拢，但留出 `CLEARANCE` 半径 | 跳台、比赛 |
| `passerby` 路人 | 沿固定路径随机方向穿行 | 街道、码头 |
| `wanderer` 漫游者 | 均匀随机方向，走一段停一段 | 公园、广场 |

**实现只需换 `pickTarget`**：

```js
// passerby：沿一条直线来回
const t.passDir = Math.random() < .5 ? 1 : -1;
t.tx = clamp(t.x + t.passDir * (3 + Math.random()*8), -BOUND, BOUND);
t.ty = BASE_Y + (Math.random()-.5) * .8;
```

### 2.3 触发时机

```js
} else if ((t.wait -= dt) <= 0) {
  pickTarget(t);
}
```

**到达 → 站立一段 → 再选目标**。不是一直在动。

```js
if (d < .15) {
  t.walking = false;
  t.wait = 1.5 + Math.random() * 6;    // 站 1.5~7.5 秒
  t.phone = Math.random() < .55;        // 55% 概率掏手机
  t.look = t.y > 0 ? Math.PI/2 : -Math.PI/2;
}
```

---

## 3. 局部避让

### 3.1 个体间互斥

```js
// 参考：stari-most:312-322
for (let i = 0; i < tourists.length; i++) {
  const a = tourists[i];
  for (let j = i + 1; j < tourists.length; j++) {
    const b = tourists[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || .01;
    if (d >= CROWD_GAP) continue;
    const push = (CROWD_GAP - d) * Math.min(1, dt * 5) / 2;
    a.x -= dx/d * push; a.y -= dy/d * push;
    b.x += dx/d * push; b.y += dy/d * push;
  }
}
```

**软排斥**：距离小于 `CROWD_GAP`（.72）时各推一半，力度与超出量成正比。
`Math.min(1, dt*5)` 是帧率无关的平滑因子。

**复杂度 O(n²)**。n ≤ 20 完全没问题；n > 50 要改用空间分桶。

### 3.2 避开主角

```js
// 参考：stari-most:323-326
if (clearDiver) {
  const dx = a.x, dy = a.y - JUMP_Y, d = Math.hypot(dx, dy) || .01;
  if (d < DIVER_CLEARANCE) {
    a.x += dx/d * (DIVER_CLEARANCE - d) * Math.min(1, dt*6);
    a.y += dy/d * (DIVER_CLEARANCE - d) * Math.min(1, dt*6);
  }
}
```

`clearDiver` 只在主角可被打断的阶段为真（`ready` / `charge`）。

### 3.3 边界夹紧

```js
// 参考：stari-most:327-328
a.x = clamp(a.x, -DECK_REACH + .2, DECK_REACH - .2);
a.y = clamp(a.y, -.72, .72);
```

人群限制在可行走区域内。`.2` 余量避免贴边。

---

## 4. 移动与转向

```js
// 参考：stari-most:295-306
if (t.walking) {
  const dx = t.tx - t.x, dy = t.ty - t.y, d = Math.hypot(dx, dy);
  if (d < .15) { /* 到达 */ }
  else {
    t.x += dx/d * t.speed * dt;
    t.y += dy/d * t.speed * dt;
    t.look = Math.atan2(dy, dx);
  }
}
```

### 转向的最短路径（关键）

```js
// 参考：stari-most:307-309
let turn = t.look - t.yaw;
turn = Math.atan2(Math.sin(turn), Math.cos(turn));
t.yaw += turn * Math.min(1, dt * 6);
```

**不归一化的话**，`yaw` 从 3.0 转到 3.1 可能绕一整圈。
`atan2(sin, cos)` 把角度差归一化到 `[-π, π]`，永远走最短弧。

平滑因子 `Math.min(1, dt*6)` → 约 1/6 秒转到位。

---

## 5. 姿态合成

```js
// 参考：stari-most:331-346
function drawTourists() {
  for (const t of tourists) {
    const cheering = G.cheer > 0 && Math.abs(t.x) < 7;
    // gait steps through a few discrete poses, in keeping with the hand-animated wind
    const swing = t.walking ? Math.sin(Math.floor(t.gait * 1.3) * Math.PI/2 + .8) : 0;
    const pose = { z: deckZ(t.x), scale: TOURIST_SCALE, stance: t.walking ? swing*.13 : .06 };
    if (cheering) {
      const beat = Math.floor(G.time * 7 + t.x) % 2;
      pose.armR = 2.8 + beat*.3; pose.armL = 2.8 - beat*.3; pose.z += beat*.06;
    } else if (t.phone && !t.walking) {
      pose.armR = 1.35; pose.armL = 1.25;
    } else {
      pose.armR = -swing*.4; pose.armL = swing*.4;
    }
    figure(t.x, t.y, t.yaw, pose, t.palette, dynamicAdd);
  }
}
```

### 5.1 三个关键手法

| 手法 | 说明 |
|------|------|
| `Math.floor(t.gait * 1.3) * Math.PI/2` | **步态量化为离散步态**，与 8fps 风动风格一致 |
| `beat = floor(time*7 + t.x) % 2` | 每人的欢呼相位用 **x 偏移**，避免整齐划一 |
| `pose.z = deckZ(t.x)` | **每人站在不同高度**——曲面上的人群 |

### 5.2 步态量化为什么重要

平滑的 `Math.sin(t.gait)` 会像 3D 动画。参考项目把它量化成离散步态，
和其他所有动画（8fps 风、12fps 落叶）保持同一套"手绘感"语言。

**所有周期性动画都应该考虑量化。**

---

## 6. 人群变体速查

| 变体 | 目标 | 特点 | 参考 |
|------|------|------|------|
| `spectator` 围观者 | 向主角聚拢 | 留出 CLEARANCE 半径 | `stari-most:280` |
| [`passerby`](crowd.md#passerby-路人沿路径穿行) | 沿路径穿行 | 走停交替 + 路径硬约束 | `demo` `village/villagers.js` |
| `wanderer` 漫游者 | 均匀随机 | 走停交替 | 待实现 |
| `crowd` 观众（固定） | 站桩 + 局部动作 | 转头/鼓掌 | `tie-break:506` |

### `passerby` 路人（沿路径穿行）

> 配方卡：`demo/village/villagers.js`（秋日山村）· 文档 `docs/modules/villagers.md`

**形态**：沿一条**受约束的路径带**（公路人行道）走停交替的人。
与 `spectator` 的关键区别：**不朝主角聚拢，而是被限制在一条窄带里**——
这让它可以安全地放进有车、有行人的场景，不会跑到路中间。

| 参数 | 默认 | 区间 | 说明 |
|------|------|------|------|
| `count` | 7 | 6–8 | 人群规模 |
| `speed` | `.38 + hash*.34` | .38–.72 | 世界单位/秒 |
| `wait` | `1.2 + hash*5.5` | 1.2–6.7 秒 | 到达后站多久再走 |
| `scale` | `.76 + hash*.09` | .75–.85 | 人物整体缩放 |
| `gap` | `.8` | .6–1.2 | 互斥间距 |

**关键算法（与基型的差异点）**

1. **路径带约束**：不是"选一个随机目标点"，而是
   「沿线参数 `t` + 带符号横向距离 `lat`」二元组。
   目标点 = `沿路点(t) + 法线(lat)`，`lat` 恒被夹在
   `[halfW + 0.42, halfW + 1.25]`（人行道带）内，
   **`side`（路侧）固定**，所以永远不会跑到路对面。

2. **每帧重新投影**：移动积分之后，把人重新投影回路径带
   （沿路参数夹到 `[0.02, 0.98]`，横向距离夹进带内）。
   这是"绝不挡路"的**硬约束**，不能靠目标点选得准来保证。

3. **走停交替**：到达（`d < .16`）→ 停 `wait` 秒 → 选新目标 → 继续走。
   停的时候 `look` 转向路中间（人站在路边看路）。

4. **站桩变体**：`walker = false` 的人不参与移动与互斥，
   只做「慢慢转头」（`look = lookAt + sin(t*.45 + phase)*.32`），
   用来做门口张望的村民。

**移植清单**

| 从哪搬 | 搬什么 | 改成什么 |
|--------|--------|---------|
| `stari-most:295-306` | 移动积分 + `look` 跟随 | 目标改成路径带二元组 |
| `stari-most:307-309` | 朝向归一化 | 原样抄（一行都不能省） |
| `stari-most:312-322` | 软排斥 | 只推 `walker` 的人 |
| `stari-most:335` | 步态量化 | 原样抄 |
| `docs/kit/scene.md` | 路径带的宽度定义 | 引用场景的 `ROAD` 常量，不要自己抄一份 |

**坑**

1. **朝向归一化不能省**，否则转身绕整圈（见 §4）。
2. **步态要量化**，不要平滑插值（见 §5）。
3. **互斥用 `dt` 相关的平滑因子**，否则帧率不同速度不同。
4. **相位要用位置偏移错开**，否则像仪仗队。
5. **路径带的横向距离要用带符号的量**，并把路侧固定住——
   否则有人会走到路对面去，或者被推到路中间。
6. **随机必须走 `hash(k, seed)`**，不能用 `Math.random()`——
   否则每次刷新场景布局都不一样，截图无法对比。
7. **人物每帧重画**，不能烘焙（姿势会变）。

### `crowd` 观众（tie-break）

比 AI 人群简单得多——**位置固定，只做局部动作**：

```js
// 参考：tie-break:506-513
function drawCrowd() {
  const b = G.ball, cx = b ? b.x : 0, cy = b ? b.y : 0, clapping = G.clap > 0;
  CROWD.forEach((c, k) => {
    // heads follow the ball in coarse steps, like a crowd at a real match
    const yaw = Math.round(Math.atan2(cy + 8.1, cx - c.x) / .35) * .35;
    const beat = clapping && Math.floor(G.time * 9 + k * 1.6) % 2;
    figure(c.x, -8.1, yaw, { scale: .85, stance: .06,
      armR: clapping ? (beat ? 1.5 : 1.15) : .1,
      armL: clapping ? (beat ? 1.5 : 1.15) : .12 }, c, dynamicAdd);
  });
}
```

**头部跟球，但角度量化到 `.35` 弧度**——`Math.round(atan2(...) / .35) * .35`。

这是极低成本的高质量做法：观众不移动，但会转头看球。

| 手法 | 说明 |
|------|------|
| `Math.round(angle / .35) * .35` | 角度量化，避免抖动 |
| `Math.floor(time*9 + k*1.6) % 2` | 每个人的鼓掌相位错开 |

---

## 7. 移植清单

| 优先级 | 项 | 说明 |
|--------|----|------|
| 高 | `figure()` 骨架 | 人群的前提。见 [figures.md](figures.md) |
| 高 | `dynamicAdd` + 动态阴影 | 人群每人都有影子 |
| 中 | `pickTarget` + 目标选择 | 核心行为 |
| 中 | 个体间互斥 | 不重叠 |
| 中 | 避开主角 | `CLEARANCE` 半径 |
| 中 | `yaw` 最短路径归一化 | 转身不绕圈 |
| 低 | 步态量化 | 手绘感的来源 |
| 低 | `crowd` 固定观众 | 比 AI 人群简单得多，性价比高 |

**通用坑**

1. **朝向归一化不能省**，否则转身绕整圈。
2. 互斥用 `dt` 相关的平滑因子，否则帧率不同速度不同。
3. 步态要量化，不要平滑插值。
4. 每人的相位要用位置偏移（`t.x`）错开，否则像仪仗队。
5. 人群站在曲面上时，每个人的 `pose.z` 要单独算。
6. `figure()` 每人每帧都要调 → 14 人 × 每帧 = 开销可观。人数上限参考项目是 14。

### `spectator` / `wanderer` / `crowd`（kit 运行时实现）

> 来源：`demo/kit/crowd.js` · `KIT_CROWD` · studio 手写 · 冒烟测试 `tools/crowd-test.mjs`

三个变体共用同一骨架（初始化 → pickTarget → 软排斥 → 边界夹紧 → 姿态合成），
**只差目标选择** —— 与 §2.2 的设计完全一致：

| 变体 | pickTarget | 局部动作 |
|------|-----------|---------|
| `spectator` | 主角周围环状布点，半径 `clearance + .1 + hash*3.4`，并额外被推离 CLEARANCE 圈 | 站立/走路 |
| `wanderer` | 当前位置 + 均匀随机方向 × 1.5~6 | 走停交替，55% 掏手机 |
| `crowd` | 原地不动 | 慢转头（±.32 正弦）+ 周期性欢呼（cheer 姿态） |

用法：

```js
KIT_CROWD.create({ variant: 'spectator', count: 10, seed: 7,
                   focus: { x: 0, y: 0 }, clearance: 2.2,
                   bounds: { x0: -8, x1: 8, y0: -4, y1: 4 } });
// 每帧：
KIT_CROWD.update(t, dt);
KIT_CROWD.draw(t);      // 内部走 figure() + dynamicAdd
```

**移植清单**

- 从 `stari-most` 抄：朝向归一化（while 收敛到 ±π）、软排斥（`min(1, dt*5)`）、边界夹紧（+.2 余量）
- 配色表法照 §1.4：8 衫 5 裤 6 发 4 肤，25% 白条纹

**坑**

- 人群变体**不是 KIT 构件**（每帧运行动态，不是静态 draw）——不要塞进 `KIT.register`
- `crowd` 变体的欢呼用 `sin(t*1.7 + phase) > .3` 相位错开，否则全员同步举手像仪仗队
