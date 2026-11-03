# 人物系统

> 注册表：[registry.md §5](registry.md)
> 覆盖：`figure()` 骨架 · 姿态参数 · 调色板 · 动态阴影 · 球拍附着 · 自定义骨骼（跳水员/滑板手）
> 参考实现：`engine.js:248-296` + `stari-most` · `tie-break` · `mini-ramp` · `balote` · `laundry`
> 相关：[crowd.md](crowd.md) 人群 AI

参考项目有**两层**人物系统：
1. **通用层**：`figure()` —— 一个参数化的站立人形，配合姿态参数做动作。
2. **专用层**：需要复杂动作时（跳水翻转、滑板腾空），自己写骨架。

> **本篇定位**：单个角色的骨架与姿态。
> **多人场景**（AI、避让、观众）见 [crowd.md](crowd.md)。

---

## 1. `figure()` 通用骨架

```js
// 参考：engine.js:248-282
function figure(px, py, yaw, pose, palette, addBone) {
  const fx = Math.cos(yaw), fy = Math.sin(yaw), sx = -fy, sy = fx, base = pose.z || 0, k = pose.scale || 1;
  const P = (a, b, c) => [px + (fx * a + sx * b) * k, py + (fy * a + sy * b) * k, c * k + base];
  const add = (a, b, r0, r1, f) => addBone(a, b, r0 * k, r1 * k, f);
  const t = palette;
  const shirt = z => (Math.floor(z * 3.2) % 2 ? t.shirt : t.stripe); // about 3px bands
  const legs = () => t.legs, skin = () => t.skin;
  const crouch = pose.crouch || 0, lean = pose.lean || 0;
  const hipZ = 1.28 - crouch * .4;
  const hipA = -crouch * .15;
  const shA = hipA + Math.sin(lean) * .95, shZ = hipZ + Math.cos(lean) * .95;
  const neck = P(shA, 0, shZ + .08), head = P(shA + Math.sin(lean) * .32, 0, shZ + .36);
  const stance = pose.stance == null ? .2 : pose.stance;
  const footB = P(-stance * 1.2, .2, .12), footF = P(stance * 2, -.2, .12);
  const kneeB = P(-stance * .4 + crouch * .12, .22, .68 - crouch * .1);
  const kneeF = P(stance * 1.2 + crouch * .34, -.22, .72 - crouch * .08);
  const hipB = P(hipA, .15, hipZ), hipF = P(hipA, -.15, hipZ);
  add(hipB, kneeB, .17, .13, legs); add(kneeB, footB, .13, .1, legs);
  add(hipF, kneeF, .17, .13, legs); add(kneeF, footF, .13, .1, legs);
  add(footB, P(-stance * 1.2 + .16, .2, .08), .1, .09, () => SHOE);
  add(footF, P(stance * 2 + .16, -.2, .08), .1, .09, () => SHOE);
  add(P(hipA, 0, hipZ), neck, .3, .32, shirt);
  add(neck, head, .11, .12, skin);
  sphere2(add, head, .24, t.skin);
  sphere2(add, [head[0] - fx * .06, head[1] - fy * .06, head[2] + .08], .205, t.hair);
  const shR = P(shA, .36, shZ - .03), shL = P(shA, -.36, shZ - .03);
  const armR = pose.armR == null ? 0 : pose.armR, armL = pose.armL == null ? .08 : pose.armL;
  const elbowR = P(shA + Math.sin(armR) * .46, .4, shZ - .03 - Math.cos(armR) * .46);
  const handR = P(shA + Math.sin(armR + .18) * .95, .42, shZ - .03 - Math.cos(armR + .18) * .95);
  const elbowL = P(shA + Math.sin(armL) * .46, -.42, shZ - .03 - Math.cos(armL) * .46);
  const handL = P(shA + Math.sin(armL + .2) * .9, -.43, shZ - .03 - Math.cos(armL + .2) * .9);
  add(shR, elbowR, .12, .1, shirt); add(elbowR, handR, .09, .08, skin);
  add(shL, elbowL, .12, .1, shirt); add(elbowL, handL, .09, .08, skin);
  return handR;
}
```

### 1.1 局部坐标系

```
yaw = 朝向角（弧度）
fx, fy = 前向向量 (cos yaw, sin yaw)
sx, sy = 侧向向量 (-fy, fx)     ← 左手系下的 90° 旋转
```

`P(a, b, c)` 把局部坐标 `(a=前, b=侧, c=高)` 转成世界坐标：

```js
P = (a, b, c) => [px + (fx*a + sx*b)*k, py + (fy*a + sy*b)*k, c*k + base]
```

**`a` 是"前后"，`b` 是"左右"**。这个约定贯穿所有姿态参数。

### 1.2 骨架尺寸表（世界单位，人高约 1.9）

| 部位 | 位置 | 半径 |
|------|------|------|
| 髋（hipZ） | `1.28 - crouch*.4` | — |
| 肩（shZ） | `hipZ + cos(lean)*.95` | — |
| 颈 | `shZ + .08` | .11 → .12 |
| 头 | `shZ + .36` | .24 |
| 头发 | 头 + .08 | .205 |
| 躯干 | 髋 → 颈 | .30 → .32 |
| 上臂 | 肩 → 肘 | .12 → .10 |
| 小臂 | 肘 → 手 | .09 → .08 |
| 大腿 | 髋 → 膝 | .17 → .13 |
| 小腿 | 膝 → 脚 | .13 → .10 |
| 鞋 | 脚 | .10 → .09 |

`scale` 参数 `k` 整体缩放，`pose.z` 抬高站立平面（站在桌上/椅子上）。

### 1.3 `addBone` 回调

`figure()` 不直接画，而是把每根骨头交给外部的 `addBone(a, b, r0, r1, colorOf)`。

引擎提供的实现：

```js
// 参考：engine.js:283-284
function sphere2(add, c, r, color) { add(c, c, r, r, () => color); }
const dynamicAdd = (a, b, r0, r1, f) => { capsule(a, b, r0, r1, f, 'solid'); pendingShadows.push(a, r0, b, r1); };
```

**`dynamicAdd` 一次做了两件事**：画骨头 + 登记阴影。
这就是为什么 `figure()` 调用方几乎都传 `dynamicAdd`。

静态人物（烘焙进场景的）也用 `dynamicAdd`，然后调 `flushShadows()` 把阴影画出来。

---

## 2. 姿态参数（pose）

### 2.1 参数表

| 参数 | 默认 | 含义 | 范围感受 |
|------|------|------|----------|
| `z` | 0 | 站立平面的高度 | 站在高台上就设成台面高度 |
| `scale` | 1 | 整体缩放 | .78（小孩/远景）～ .9 |
| `crouch` | 0 | 下蹲 | 0～.5，0.4 以上明显下蹲 |
| `lean` | 0 | 前倾/后仰 | `sin(lean)*.95` 影响肩，`.32` 影响头 |
| `stance` | .2 | 站距 | 越大腿张得越开 |
| `armR` | 0 | 右臂角度 | 0 = 垂下，正值 = 抬起（弧度） |
| `armL` | .08 | 左臂角度 | 同上 |

### 2.2 手臂角度的几何

```js
const elbowR = P(shA + Math.sin(armR) * .46, .4, shZ - .03 - Math.cos(armR) * .46);
const handR  = P(shA + Math.sin(armR + .18) * .95, .42, shZ - .03 - Math.cos(armR + .18) * .95);
```

- `armR = 0`：手臂垂直向下（`sin(0)=0`, `cos(0)=1` → z 减去 .46/.95）
- `armR = π/2`：手臂水平前伸
- `armR = π`：手臂竖直上举

**肘和手的角度差 0.18 弧度**，让手臂略微弯曲，不会像棍子。

### 2.3 `crouch` 和 `lean` 的联动

```js
const hipZ = 1.28 - crouch * .4;     // 下蹲压低髋
const hipA = -crouch * .15;          // 下蹲时髋略后移
const shA = hipA + Math.sin(lean) * .95;   // lean 前倾 → 肩前移
const shZ = hipZ + Math.cos(lean) * .95;   // lean 前倾 → 肩下降（保持躯干长度）
```

`sin/cos` 组合保证**躯干长度恒定**，只是旋转。这是"关节链"的标准做法。

### 2.4 实用姿态配方

| 姿势 | pose |
|------|------|
| 站立待机 | `{ armR: .05, armL: .1, stance: .08, lean: breathe }` |
| 蓄力（拉弓） | `{ crouch: .35+pull*.45, lean: .3+pull*.24, stance: .2+pull*.1, armR: -.1-pull*1.15, armL: .38+pull*.3 }` |
| 举手欢呼 | `{ armR: 2.8+beat*.3, armL: 2.8-beat*.3 }` |
| 举手机拍照 | `{ armR: 1.35, armL: 1.25 }` |
| 蹲下准备 | `{ crouch: .36, armR: -2, armL: .9 }` |
| 击球挥拍 | `{ armR: lerp(-2, 2.6, t), armL: lerp(.9, .2, t) }` |

来源：`balote:355-367`、`stari-most:336-344`、`tie-break:474-490`。

### 2.5 呼吸

```js
// 参考：balote:356
const breathe = Math.sin(G.time * 1.8) * .012;
```

幅度只有 .012，几乎看不见，但让静止的人物不再完全死板。
**幅度必须小**（≤.02），大了会像在抽搐。

---

## 3. 调色板

```js
// 参考：balote:63-66
const TEAM = [
  { ball: [176, 58, 44], shirt: [188, 60, 44], stripe: [240, 232, 214], legs: [48, 47, 58], hair: [38, 28, 24], skin: [222, 170, 132] },
  { ball: [42, 76, 112], shirt: [40, 72, 110], stripe: [226, 228, 224], legs: [84, 72, 58], hair: [120, 112, 104], skin: [196, 146, 110] },
];
```

| 字段 | 用途 |
|------|------|
| `shirt` | 躯干主色 |
| `stripe` | 躯干条纹色（按高度交替，见下） |
| `legs` | 裤色 |
| `hair` | 头发色 |
| `skin` | 皮肤色（脸、手） |
| `ball` | （游戏专属）球的颜色 |
| `racket` | （tie-break 专属）球拍色 |

### 3.1 条纹的间隔

```js
// 参考：engine.js:253
const shirt = z => (Math.floor(z * 3.2) % 2 ? t.shirt : t.stripe);
```

`z * 3.2` → 每 `1/3.2 ≈ 0.31` 世界单位换一次色。
人物高约 1.9，所以躯干上约 3～4 条纹，屏幕上约 **3 像素一条**。

**这是硬约束**：太密会读成噪声（参考项目注释原文：*"thinner ones read as noise"*）。

## 4. 动态阴影（`pendingShadows`）

```js
// 参考：engine.js:284-296
const pendingShadows = [];
function flushShadows() {
  for (let i = 0; i < pendingShadows.length; i += 4) {
    const a = pendingShadows[i], ra = pendingShadows[i + 1], c = pendingShadows[i + 2];
    const n = Math.max(1, Math.ceil(Math.hypot(c[0]-a[0], c[1]-a[1], c[2]-a[2]) / .25));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      castShadow(lerp(a[0], c[0], t), lerp(a[1], c[1], t), lerp(a[2], c[2], t), ra * .9, 1, 0);
    }
    if (a[2] < .25) castShadow(a[0], a[1], 0, .2, 2, 0);  // 脚底接触阴影
  }
}
```

### 4.1 数据结构

`pendingShadows` 是**扁平数组**，每 4 个元素一组：

```
[a.x, a.y, a.z, r,  b.x, b.y, b.z, r,  ...]
```

不是对象数组，是为了避免每帧的对象分配。

### 4.2 两层阴影

| 强度 | 含义 | 参数 |
|------|------|------|
| `1` | 普通投影（沿骨头的连续阴影） | `dither = 0`（不抖动，边缘锐利） |
| `2` | 接触阴影（脚底/物体底面的暗斑） | `dither = 0`, 半径 .2 |

接触阴影只在 `a[2] < .25`（骨头起点接近地面）时加，**只有脚会有**。

### 4.3 调用时机

```js
// 参考：balote:404-420（draw 内）
pendingShadows.length = 0;      // ← 每帧清空
const hand = figure(...);        // 画人，自动登记阴影
for (const b of allBalls()) { ... castShadow(...) }  // 额外的静态阴影
flushShadows();                  // ← 统一把队列画进 shadowMask
applyShadows(bakedZ);            // ← 然后才把 mask 染到地面上
```

**顺序不能变**：先收集所有阴影 → 统一 flush → 再 apply。

---

## 5. 附加物：把道具挂到人身上

`figure()` **返回右手的坐标**，这是挂道具的接口：

```js
// 参考：tie-break:492-504
function drawPlayer(i) {
  const p = G.who[i], b = G.ball;
  const { pose, twist } = poseOf(p, ready);
  const yaw = p.dir + twist * (i === 0 ? 1 : -1);
  const hand = figure(p.x, p.y, yaw, pose, TEAM[i], dynamicAdd);   // ← 返回 hand
  const a = (pose.armR || 0) + .18, fx = Math.cos(yaw), fy = Math.sin(yaw);
  const dx = fx * Math.sin(a) - fy * .2, dy = fy * Math.sin(a) + fx * .2, dz = -Math.cos(a);
  const neck = [hand[0] + dx * .32, hand[1] + dy * .32, hand[2] + dz * .32];
  const head = [hand[0] + dx * .66, hand[1] + dy * .66, hand[2] + dz * .66];
  dynamicAdd(hand, neck, .05, .05, () => TEAM[i].racket);   // 拍柄
  dynamicAdd(head, head, .22, .22, () => TEAM[i].racket);   // 拍面
  sphere(head[0], head[1], head[2] + .04, .13, [236, 228, 200], 'solid');  // 拍面高光
}
```

### 5.1 球拍的构造

- `neck` = 手 + 方向 × .32：**拍柄**（细杆 `.05`）
- `head` = 手 + 方向 × .66：**拍面**（`.22` 的球）

方向 `(dx, dy, dz)` 由手臂角度 `armR` 推出：
```js
dx = fx*sin(a) - fy*.2,  dy = fy*sin(a) + fx*.2,  dz = -cos(a)
```
`fx*sin(a)` 是手臂摆动方向，`-fy*.2 / fx*.2` 是侧向偏移（让拍不在正前方），`-cos(a)` 是垂直分量。

### 5.2 持球

```js
// 参考：balote:408-411
if (G.phase === 'aim' && G.left[G.team] > 0) {
  sphere(hand[0], hand[1], hand[2] - .04, BALL_R, TEAM[G.team].ball, 'gloss');
  pendingShadows.push(hand, BALL_R, hand, BALL_R);
}
```

球画在手的位置稍下方 `.04`（球心在掌心略下），并单独登记阴影。

---

## 6. 人群 AI（摘要）

> 完整内容见 [crowd.md](crowd.md)。这里只留最关键的两条：

**① 朝向归一化（不绕圈）**

```js
let turn = t.look - t.yaw;
turn = Math.atan2(Math.sin(turn), Math.cos(turn));   // 归一化到 [-π, π]
t.yaw += turn * Math.min(1, dt * 6);
```

不归一化的话，`yaw` 从 3.0 转到 3.1 可能绕一整圈。

**② 步态量化（手绘感）**

```js
const swing = t.walking ? Math.sin(Math.floor(t.gait * 1.3) * Math.PI/2 + .8) : 0;
```

`Math.floor(t.gait * 1.3)` 把连续步态切成离散步态，
与其他所有动画（8fps 风、12fps 落叶）保持同一套"手绘感"语言。

---

## 7. 自定义骨骼（复杂动作）

当 `figure()` 不够用时，自己写骨架。参考项目有两例。

### 7.1 跳水员（任意姿态旋转）

```js
// 参考：stari-most:465-505
function drawDiver() {
  const c = G.phase === 'charge' ? G.power : 0, t = G.tuck;
  const air = G.phase === 'air' || G.phase === 'under' ? 1 : 0;
  const spread = air ? 1 - t : .1 + c * .25;
  const cp = Math.cos(G.pitch), sp = Math.sin(G.pitch);
  const breathe = air ? 0 : Math.sin(G.time * 1.8) * .012;
  const hipDrop = .45 * c;
  const k = DIVER_SCALE;
  // 局部 → 世界的旋转（绕 X 轴的 pitch）
  const at = (s, f, z) => [G.x + s*k, G.y + (f*cp + z*sp)*k, G.z + (breathe - hipDrop + z*cp - f*sp)*k];
  const bone = (a, b, r0, r1, color) => { /* 见下 */ };
  const skin = DIVER.skin;
  const neck = [0, .25*t + .1*c, .95 - .12*t], head = [0, .45*t + .16*c, 1.27 - .2*t];
  bone(neck, head, .11, .12, skin);
  bone(head, head, .24, .24, skin);
  bone([0, head[1]-.05, head[2]+.08], [0, head[1]-.05, head[2]+.08], .205, .205, DIVER.hair);
  bone([0, 0, 0], neck, .26, .3, skin);
  for (const side of [-1, 1]) {
    const footS = side * .17;
    const knee = [footS, lerp(.35*c, .6, t), lerp(-.62 + .2*c, .1, t)];
    const foot = [footS, lerp(.06*c, .15, t), lerp(-1.25 + hipDrop, -.25, t)];
    bone([footS, 0, 0], knee, .17, .13, skin);
    bone(knee, foot, .13, .1, skin);
    const shoulder = [side*.34, neck[1], neck[2]-.05];
    const hand = [
      side * lerp(lerp(.42, 1.2, spread), .2, t),
      lerp(.05 + c*-.3, .62, t),
      lerp(lerp(-.02, neck[2]+.12, spread), .02, t),
    ];
    const elbow = [(shoulder[0]+hand[0])/2, (shoulder[1]+hand[1])/2, (shoulder[2]+hand[2])/2];
    bone(shoulder, elbow, .12, .1, skin);
    bone(elbow, hand, .09, .08, skin);
    bone([side*.15, 0, -.02], [side*.17, lerp(0, .3, t), lerp(-.28, -.02, t)], .2, .17, DIVER.trunks);
  }
}
```

**核心是一个旋转基**：

```js
const at = (s, f, z) => [
  G.x + s*k,
  G.y + (f*cp + z*sp)*k,           // 前/后方向按 pitch 旋转
  G.z + (... + z*cp - f*sp)*k,      // 上/下方向按 pitch 旋转
];
```

`cp = cos(pitch)`, `sp = sin(pitch)`，前向 f 和竖直 z 按 pitch 角混合 → **整个人绕侧轴翻转**。

**插值用 `lerp(..., t)` 而不是直接赋值**，让收腹（tuck）动作平滑过渡。

### 7.2 入水截断（不画沉在水下的部分）

```js
// 参考：stari-most:477-480
const bone = (a, b, boneR0, boneR1, color) => {
  const pa = at(...a), pb = at(...b);
  if (pa[2] < .02 && pb[2] < .02) return;                    // 整根在水下，不画
  if (pa[2] < .02) { const k = (.02 - pa[2]) / (pb[2] - pa[2]); pa[0] += (pb[0]-pa[0])*k; pa[1] += (pb[1]-pa[1])*k; pa[2] = .02; }
  if (pb[2] < .02) { const k = (.02 - pb[2]) / (pa[2] - pb[2]); pb[0] += (pa[0]-pb[0])*k; pb[1] += (pa[1]-pb[1])*k; pb[2] = .02; }
  dynamicAdd(pa, pb, r0, r1, () => color);
};
```

**骨头与水面求交并截断**——这样跳水员入水时是"被水面切掉"，不是"整个人沉下去"。

`k` 是插值比例，把水下的端点拉到水面高度。

### 7.3 滑板骑手（局部坐标系 + 姿态基）

```js
// 参考：mini-ramp:377-431
function drawRider() {
  const f = riderFrame(), c = Math.cos(f.th), s = Math.sin(f.th), w0 = .3;
  // 局部基：t = 沿板长，n = 垂直板面
  const P = (t, n, side = 0) => world(f.a + t*c - n*s, w0 + side, f.z + t*s + n*c);
  const add = (a, b, r0, r1, color) => dynamicAdd(a, b, r0, r1, () => color);
  const r = RIDER, flip = G.v > 0 ? 1 : -1;
  // ... 板、轮、腿、躯干、头、手臂
}
```

`P(t, n, side)` 定义了一个**跟着坡道倾斜的局部基**：
- `t` = 沿坡道切线方向
- `n` = 垂直板面方向
- `side` = 沿板宽方向（左右脚）

**整个骑手只需要在这个基里描述关节，姿态自然跟着坡道倾斜**。

| 参数 | 含义 |
|------|------|
| `f.a` | 沿坡道的位置 |
| `f.z` | 离地高度 |
| `f.th` | 坡道切线角（决定倾斜） |
| `w0` | 横向偏移（站在板中间 = .3） |

关键量：

```js
const crouch = grabbing ? 1 : pumping ? .75 : ...;
const hipN = 1.28 - crouch * .55, shN = hipN + .92 - crouch * .28;
const lean = (pumping ? .22 : .08) * (G.v >= 0 ? 1 : -1);
```

**`crouch` 一个参数同时控制髋高、肩高、膝盖角度** —— 蹲得越低，身体压得越扁。

### 7.4 自定义骨骼 vs `figure()`

| 需求 | 选择 |
|------|------|
| 站立 / 走路 / 挥手 / 投掷 | `figure()` + pose |
| 人群 | `figure()` + AI |
| 翻滚 / 翻转 / 沿曲面运动 | 自定义骨骼 |
| 附着复杂道具 | `figure()`（用返回的 hand 坐标） |

---

## 8. 人物在场景中的定位（z 与 scale）

```js
// 参考：tie-break:157（裁判坐在高椅上）
figure(0, -6.7, Math.PI/2, { z: 1.8, scale: .85, armR: .4, armL: .3, stance: .04 }, palette, dynamicAdd);
// 参考：stari-most:336（游客站在桥面上）
const pose = { z: deckZ(t.x), scale: TOURIST_SCALE, stance: ... };
```

| 参数 | 场景 |
|------|------|
| `z` | 站立平面的世界高度 |
| `scale` | .78（远景人群）～ .9（近景主角） |
| `yaw` | 朝向，`Math.PI` = 面向 -x 方向 |

---

## 9. 移植清单

| 优先级 | 项 | 说明 |
|--------|----|------|
| 高 | `figure()` | demo 的 `demo/autumn.js` 有自己的 `sitPerson`/`liePerson`，**没有通用站立人形**。移植 `figure()` 后 demo 场景里能站人 |
| 高 | `dynamicAdd` + `pendingShadows` + `flushShadows` | `demo/engine.js` 完全没有。人物站着会有影子是基本要求 |
| 高 | `sphere()` 的 `solid` 模式 | 参考 `engine.js:83`。demo 的 `engine.js:102` 已有，但**少了 `clamp(..., 1, 4)` 的下限 1**——需确认 |
| 中 | 姿态配方表 | 直接抄 §2.4 的配方 |
| 中 | 人群 AI（§6） | demo 若要做"有人气的场景"直接抄 |
| 中 | 球拍/持物附着 | `figure()` 返回 hand 的用法 |
| 低 | 自定义骨骼（§7） | 需要复杂动作时才写 |
| 低 | 配色表生成 | §3.2 |

**移植注意**

1. `figure()` 的 `addBone` 回调必须能处理**半径缩放**（`r0 * k`），否则不同 scale 的人肢体粗细一样。
2. `solid` 模式是人物能"跳出来"的关键：抖动会让小尺寸人物糊成一团。
3. 人物**不能有影子以外的地面写入**。`applyShadows` 会跳过 `zb[i] !== refZ[i]` 的像素，天然保证人物干净。
4. 每个人物的 `yaw` 要**朝屏幕内**（大致 `Math.PI/2` 附近），参考项目里人物大多朝 +y（面向观众）。
