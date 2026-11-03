# UI 覆盖层与屏幕特效

> 注册表：[registry.md §6](registry.md)
> 覆盖：像素级 UI 图形 · 深度描边 · 屏幕空间 AO · 屏幕特效 · 每帧渲染顺序
> 参考实现：`engine.js:136-150, 202-219, 297-336` + `stari-most` · `tie-break`
> 相关：[weather.md](weather.md) 雨 / 云 / 闪电 / 全局调色

UI 覆盖层是参考项目被低估的资产：**所有提示符号都是像素画出来的**，不是 DOM、不是图片。

> **本篇定位**：UI 覆盖层、描边、AO、屏幕特效、渲染顺序。
> **天气系统**（雨云闪电、调色、天气声）在 [weather.md](weather.md)。

---

## 1. 像素级 UI 图形（`arrow` `bang` `target-ring` `charge-bar` `halo`）

### 1.1 基础：画点阵

```js
// 参考：engine.js:297-302
function drawDots(points, color) {
  for (const [sx, sy] of points) {
    const ix = sx | 0, iy = sy | 0;
    if (ix >= 0 && iy >= 0 && ix < W && iy < H) pix[iy * W + ix] = color;
  }
}
```

**直接写 `pix`，不写 `zb`** → 覆盖层不参与深度，不会被任何东西遮挡。

### 1.2 白色描边（让符号从背景中分离）

```js
// 参考：engine.js:317-323
const INK = rgb(28, 27, 25), SIGNAL = rgb(255, 214, 10), PAPER = rgb(255, 255, 255);
function haloDots(points) {
  const halo = [];
  for (const [x, y] of points) for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) halo.push([x+dx, y+dy]);
  drawDots(halo, PAPER);
}
```

**先画一圈 4 邻域白色，再画本体** → 符号永远清晰。

这是像素风 UI 的标准手法，DOM 做不到（DOM 文字是抗锯齿的）。

### 1.3 箭头（指向目标）

```js
// 参考：engine.js:303-336
const ARROW = [
  '....ooooo....',
  '....oXXXo....',
  '....oXXXo....',
  '....oXXXo....',
  'oooooXXXooooo',
  'oXXXXXXXXXXXo',
  '.oXXXXXXXXXo.',
  '..oXXXXXXXo..',
  '...oXXXXXo...',
  '....oXXXo....',
  '.....oXo.....',
  '......o......',
];
function drawArrow(sx, sy, time) {
  const bob = STILL ? 0 : Math.floor(time * 3) % 2 * 2;    // 上下浮动
  const left = Math.round(sx) - 6, top = Math.round(sy) - ARROW.length - bob;
  const ink = [], fill = [];
  ARROW.forEach((row, y) => [...row].forEach((cell, x) => {
    if (cell === 'o') ink.push([left + x, top + y]);
    if (cell === 'X') fill.push([left + x, top + y]);
  }));
  haloDots(ink);
  drawDots(ink, INK);
  drawDots(fill, SIGNAL);
}
```

**字符画矩阵 → 点阵** 是这套 UI 的通用做法：

| 字符 | 含义 |
|------|------|
| `.` | 空 |
| `o` | 轮廓（INK 深色） |
| `X` | 填充（SIGNAL 黄色） |

同一个模式被复用于：

| 图形 | 参考 |
|------|------|
| 箭头 `ARROW` | `engine.js:303` |
| 爆炸符号 `BANG` | `mini-ramp:467` |

```js
// 参考：mini-ramp:467
const BANG = ['.ooo.', '.oXo.', '.oXo.', '.oXo.', '.ooo.', '.oXo.', '.ooo.'];
```

### 1.4 浮动动画

```js
const bob = STILL ? 0 : Math.floor(time * 3) % 2 * 2;
```

**3fps 的两帧位移**（0 / 2 像素）。比平滑上下移动更像手绘动画。
`STILL` 时完全静止。

### 1.5 目标圆环（判定圈）

```js
// 参考：tie-break:515-526
function drawTarget(t) {
  const p = project(t.x, t.y, 0), ok = isIn(t), rx = 8, ry = 4;
  const ring = [], outer = [];
  for (let a = 0; a < 6.283; a += .12) {
    ring.push([p.sx + Math.cos(a)*rx, p.sy + Math.sin(a)*ry],
              [p.sx + Math.cos(a)*(rx-1), p.sy + Math.sin(a)*(ry-1)]);
    outer.push([p.sx + Math.cos(a)*(rx+1), p.sy + Math.sin(a)*(ry+1)]);
  }
  // yellow on black means in, black on white means out: red would vanish into the clay
  drawDots(outer, ok ? INK : PAPER);
  drawDots(ring, ok ? SIGNAL : INK);
  drawDots([[p.sx,p.sy],[p.sx-1,p.sy],[p.sx+1,p.sy],[p.sx,p.sy-1],[p.sx,p.sy+1]], ok ? SIGNAL : INK);
}
```

**在地面上画的椭圆**：`rx=8, ry=4`（等距投影下，地面圆投影成 2:1 椭圆）。

| 配色逻辑 | 说明 |
|---------|------|
| 判定区内 | 外圈 INK（黑）+ 内圈 SIGNAL（黄）= **黄底黑边** |
| 判定区外 | 外圈 PAPER（白）+ 内圈 INK（黑）= **黑底白边** |

**黄色在黑上表示"进"，黑色在白上表示"出"** —— 因为红色会消失在红土上。
这是"配色要结合背景"的思考方式。

### 1.6 能量条

```js
// 参考：stari-most:555-566
function drawChargeBar() {
  if (G.phase !== 'charge') return;
  const p = project(G.x, G.y, G.z + 1.7), left = Math.round(p.sx) - 8, top = Math.round(p.sy) - 7;
  const frame = [], fill = [], empty = [], n = Math.round(G.power * 15);
  for (let x = 0; x < 17; x++) for (let y = 0; y < 5; y++) {
    const inner = x > 0 && x < 16 && y > 0 && y < 4;
    (inner ? (x - 1 < n ? fill : empty) : frame).push([left + x, top + y]);
  }
  haloDots(frame);
  drawDots(frame, INK);
  drawDots(empty, PAPER);
  drawDots(fill, SIGNAL);
}
```

**17×5 的边框 + 15 格填充**。三层：边框（INK）/ 空槽（PAPER）/ 填充（SIGNAL）。

---

## 2. 深度描边与 AO（引擎级）

### 6.1 深度描边

```js
// 参考：engine.js:136-150
function shadeEdges() {
  for (let iy = 1; iy < H-1; iy++) for (let ix = 1; ix < W-1; ix++) {
    const i = iy*W+ix, d = zb[i];
    if (d < -1e8 || d === groundZ[i]) continue;          // ← 地面不描边
    const a = i-W, b = i+W, c = i-1, e = i+1;
    if (zb[a]===groundZ[a] || zb[b]===groundZ[b] || zb[c]===groundZ[c] || zb[e]===groundZ[e]) {
      tint(i, .68, .66, .76);                             // ← 物体紧贴地面：暗轮廓
    } else if (d - zb[a] - GRADIENT_Y > EDGE || d - zb[c] > EDGE) {
      const p = pix[i];
      pix[i] = rgb(lerp(p&255, WARM[0], .3), lerp(p>>8&255, WARM[1], .3), lerp(p>>16&255, WARM[2], .22));
    } else if (zb[e] - d > EDGE || zb[b] - GRADIENT_Y - d > EDGE) {
      tint(i, .74, .72, .82);                             // ← 背光侧压暗
    }
  }
}
```

| 情况 | 处理 | 效果 |
|------|------|------|
| 邻居是地面 | 压暗 `.68,.66,.76` | 物体在地面上的暗轮廓 |
| 上/左邻居明显更远 | 混暖黄 `.3/.3/.22` | 朝向光源的暖色 rim |
| 下/右邻居明显更近 | 压暗 `.74,.72,.82` | 背光侧 |

**`GRADIENT_Y = COS / (S * SIN) ≈ 0.173`** 是关键：
等距地面每向下一像素，深度天然增加 `0.173`。不减掉它，**整块地面都会被误判为边缘**。

地面本身不参与描边（`d === groundZ[i]` 时跳过）→ 影子边缘不会被框住。

### 6.2 屏幕空间 AO

```js
// 参考：engine.js:202-219
function bakeOcclusion() {
  const offsets = [];
  for (const r of [2, 4]) for (let k = 0; k < 8; k++) {
    offsets.push([Math.round(Math.cos(k*Math.PI/4)*r), Math.round(Math.sin(k*Math.PI/4)*r*.7)]);
  }
  for (let iy = 4; iy < H-4; iy++) for (let ix = 4; ix < W-4; ix++) {
    const i = iy*W+ix;
    if (!ground[i] || zb[i] !== groundZ[i]) continue;     // ← 只处理地面
    let hits = 0;
    for (const [ox, oy] of offsets) {
      const j = (iy+oy)*W + ix+ox;
      if (zb[j] !== groundZ[j]) hits++;
    }
    if (!hits) continue;
    if (hits >= 8) tint(i, .56, .54, .72);                // ← 深处
    else if (hits/8 > bayerAt(ix,iy)) tint(i, .74, .72, .84);  // ← 边缘（抖动）
  }
}
```

**廉价接触遮蔽**：对每个地面像素，向 8 个方向 × 2 个半径（16 个采样点）探测，
统计有多少采样点不是地面。命中越多，遮挡越强。

| 细节 | 说明 |
|------|------|
| `r * .7`（y 方向） | 采样椭圆压扁，符合等距投影 |
| `hits >= 8` | 完全被包围 → 最深 |
| `hits/8 > bayerAt(...)` | 部分命中 → **按 Bayer 抖动**，形成毛边过渡 |
| `bakeOcclusion()` 的调用时机 | 在所有物体画完之后、`applyShadows()` 之前 |

**AO 让树根、长椅下、墙脚出现暗部**，是画面"落地"的关键。

---

## 3. 屏幕特效汇总（`dust` `spark` `splash` `ring` `track-mark` `falling-leaf`）

| 特效 | 参考 | 要点 | 篇目 |
|------|------|------|------|
| 水花 | `stari-most:543` | 直接写像素，不写 zb | [nature.md](nature.md) |
| 涟漪 | `stari-most:530` | 随机剔除的虚线圆 | [nature.md](nature.md) |
| 尘土 | `tie-break:546` | 落地扬尘，投影后画 | 本文 |
| 火花 | `tie-break:548` | 击球瞬间的十字白点 | 本文 |
| 落地球痕 | `tie-break:354` | 十字笔刷压暗 bakedPix | [scene.md](scene.md) |
| 电池/能量条 | `stari-most:555` | 17×5 边框 + 15 格 | 本文 |
| 目标环 | `tie-break:515` | 地面椭圆 + 黄黑/黑白配色 | 本文 |
| 箭头 | `engine.js:325` | 字符画 + 白色描边 + 上下浮动 | 本文 |
| 爆炸符号 | `mini-ramp:467` | 字符画 + 白色描边 | 本文 |
| 雨 / 云 / 闪电 / 调色 | `laundry` | — | [weather.md](weather.md) |

---

## 4. 每帧渲染的正确顺序

参考项目所有游戏的 `draw()` 顺序一致，**这个顺序不能乱**：

```js
function draw() {
  pix.set(bakedPix);            // 1. 恢复静态底图
  zb.set(bakedZ);
  pendingShadows.length = 0;     // 2. 清空阴影队列
  // 3. 画动态物体（人物、球、衣物）
  drawTufts(windT);              // 4. 草（要读 staticShadow）
  drawLeaves(windT);             // 5. 树叶
  flushShadows();                // 6. 统一画阴影到 mask
  applyShadows(bakedZ);          // 7. 把阴影染到地面
  shadeEdges();                  // 8. 深度描边
  // 9. 覆盖层（雨、云、闪电、UI）
  ctx.putImageData(image, 0, 0); // 10. 提交
}
```

### 8.1 为什么是这个顺序

| 约束 | 原因 |
|------|------|
| `drawTufts/drawLeaves` 在 `applyShadows` 之前 | 它们要读 `staticShadow` 判断是否在影子里 |
| `flushShadows` 在 `applyShadows` 之前 | 阴影先全部收集，再统一染色 |
| `applyShadows` 在 `shadeEdges` 之前 | 先染地面阴影，再描边，避免描边把阴影框住 |
| 覆盖层在 `shadeEdges` 之后 | UI 不该被描边处理 |
| 水花在 `shadeEdges` 之后 | 水花不该有描边 |

---

## 5. 移植清单

| 优先级 | 项 | 说明 |
|--------|----|------|
| 高 | `bakeOcclusion()` | demo 的 `demo/engine.js` 完全没有。**这是"物体没有落地感"的根因** |
| 高 | 地面反弹光 | `demo/engine.js` 的 `sphere()` 缺参考 `engine.js:75` 那行：`if (dy > .35) l = Math.max(l, .12 + dy*.24);` |
| 高 | `drawDots` / `haloDots` | 零成本，demo 若要加 HUD/提示箭头立刻可用 |
| 中 | `drawArrow` + `ARROW` 矩阵 | 指示目标，11 行代码 |
| 中 | `shadeEdges` 的 `GRADIENT_Y` 校正 | demo 的 `engine.js:31` 已有 `GRADIENT_Y = COS/(S*SIN)`，需确认 `S` 与参考一致（参考 `S=10`，demo 默认 `S=14`） |
| 中 | 全局调色（天气） | 若要做昼夜/天气 |
| 低 | 雨 / 云 / 闪电 | 完整天气系统 |
| 低 | 目标环 / 能量条 | 游戏化 UI |

**移植注意**

1. `bakeOcclusion()` 必须在**所有物体都画完之后**调用，否则物体脚下没有 AO。
2. `bakeOcclusion()` 在 `applyShadows()` **之前**调用——AO 和阴影叠加，但 AO 先染。
3. UI 覆盖层用 `drawDots` 写 `pix`，**不写 `zb`**——所以 UI 永远在最上层。
4. 覆盖层在 `shadeEdges()` 之后画。
5. `STILL`（`prefers-reduced-motion`）时所有 UI 浮动动画停用。
6. demo 的 `S = 14`（参考 `S = 10`），世界尺寸要按比例调整，或保持 `S = 10` 以便直接复用参考代码。
