# 像素大奖赛（Pixel Grand Prix）

等距微缩赛车场：三辆赛车沿椭圆赛道持续行驶，看台与围栏外共 40 名观众
**按最近赛车的距离**起身欢呼——车开到哪一侧，那一侧就沸腾。

没有新增构件 ID：赛车复用 `beetle-car` 的骨架（配色 / 尾翼走参数组），
人群复用 `kit/figures.js` 的骨架与 `crowd.md §5` 的姿态合成。

---

## 1. 文件与入口

| 文件 | 行数 | 职责 |
|------|------|------|
| `demo/racetrack/index.html` | 57 | 画布 360×280 / S=10、HUD、脚本顺序 |
| `demo/racetrack/track.js` | 196 | 椭圆几何、逐像素赛道烘焙、看台、围栏、内场装饰、两棵树 |
| `demo/racetrack/race.js` | 70 | 三辆车的参数、沿椭圆行驶、车体绘制 |
| `demo/racetrack/spectators.js` | 96 | 观众站位、欢呼强度、姿态合成 |
| `demo/racetrack/main.js` | 71 | 深度排序、主循环、圈数 HUD、调试钩子 |

启动：

```bash
cd demo && python3 -m http.server 5310
# http://127.0.0.1:5310/racetrack/
```

测试（断言 + 导出 `docs/racetrack-screenshot.png`）：

```bash
node tools/racetrack-test.mjs
```

---

## 2. 赛道几何

```
                看台（4 排 × 7 人）
             ┌──────────────────┐
        ╭────┴──────────────────┴────╮
        │  ╭──────────────────────╮  │
        │  │   内场：树 / 领奖台   │  │
        │  │  轮胎堆 / 三面队旗    │  │
        │  ╰──────────────────────╯  │
        ╰────────────────────────────╯
            围栏外散站 12 人（+y 半圈）
```

| 常量 | 值 | 说明 |
|------|-----|------|
| `TA` / `TB` | 15 / 9 | 椭圆半轴 |
| `TRACK_W` | 1.8 | 赛道半宽（整宽 3.6） |
| `KERB` | .55 | 红白路肩宽 |
| `FENCE_OFF` | 2.6 | 围栏离中心线 |
| `START_ANG` | π/2 | 起跑线在前侧直道 |
| `STAND` | x∈[-12,1.5]，4 排，rise .55 | 看台 |

**到中心线的距离**用参数角近似：

```js
const ang = Math.atan2(y / TB, x / TA);
const px = TA * Math.cos(ang), py = TB * Math.sin(ang);
const dist = Math.hypot(x - px, y - py);
```

A/B=1.67 时误差 < 2%，在 10px/单位的尺度下不可见。逐像素用它分成
`沥青 → 白线 → 红白路肩 → 草地` 四层，一次 `bakeTrack()` 烘完。

**岛式边缘**：外圈草地边界加低频噪声（`dist > FENCE_OFF + 3.2 + noise` 才留白），
避免出现硬椭圆边。内场（`inside`）不受这条限制——否则椭圆中心会被判成岛外。

---

## 3. 渲染管线

**烘焙一次**：逐像素赛道 → `groundZ` → 看台 / 围栏 / 内场 → 静态阴影 → AO。

**每帧**：

```js
pix.set(bakedPix); zb.set(bakedZ);
const dyn = [...观众, ...赛车].sort(by project(x,y,z).d);   // 远 → 近
for (const it of dyn) drawSpectator / drawRacer;
drawLeaves(raceTime);        // 内场树冠 capture 风动
flushShadows(); applyShadows(groundZ); shadeEdges();
ctx.putImageData(image, 0, 0);
```

**必须排序**：观众在看台（远）、赛车在赛道（近）；不排序的话后画的
看台观众会盖住赛车。排序键是 `project()` 的深度 `d`，不是 y 坐标。

---

## 4. 复用映射（docs/kit → 代码）

| 配方卡 | 代码 | 用法 |
|--------|------|------|
| `props.md §8b` beetle-car | `race.js` | 胶囊车身 + 半球座舱 + 四轮 + 两层阴影；改低趴车身、开放式座舱、前后翼 |
| `crowd.md §5` 姿态合成 | `spectators.js` | 手臂角度 / 起跳 / 后仰；`beat` 用相位错开 |
| `crowd.md §1.4` 配色表法 | `spectators.js` | 直接复用 `KIT_CROWD_SHIRTS / LEGS / HAIR / SKIN` |
| `figures.md` 人物骨架 | `kit/figures.js` | `figure()` + 轻量 `crowdAdd`（只画骨头，不登记阴影） |
| `trees.md §1` broadleaf | `track.js` `growTree()` | 内场两棵，`captureSphere` 风动 |
| `scene.md` 地面协议 | `track.js` `bakeTrack()` | `ground / groundZ`；阴影与 AO 只作用在地面 |
| `structures.md` 围栏 | `track.js` `buildFence()` | 椭圆参数化 + `strokePath()` 双横杆 |

---

## 5. 欢呼模型

每个观众每帧找**最近的一辆赛车**：

```js
const want = clamp(1 - (best - 4.5) / 8, 0, 1);   // 4.5 内全满，12.5 外平静
s.cheer += (want - s.cheer) * Math.min(1, dt * 5);
```

姿态由 `cheer` 连续驱动（量化节拍保持手绘感）：

```js
const beat = Math.floor(time * 7 + s.phase * 3) % 2;
pose.armR = .08 + c * (2.6 + beat * .32);
pose.armL = .08 + c * (2.6 - beat * .32);
pose.z    = s.z + c * beat * .12;     // 起跳
pose.lean = -c * .16;                 // 后仰
```

- 看台观众 `z = 0.55 × 排数`，站在台阶面上；
- 围栏外观众 `z = 0`，投接触影；看台上的影子落在台阶上（不是 `ground`），跳过；
- 观众视线始终追最近的车，角度差用 `atan2(sin, cos)` 归一化。

**为什么不是全体同时欢呼**：每人 `phase` 不同，节拍错开；且距离不同，
`cheer` 是连续值，靠近的那一排先站起来，形成波浪。

---

## 6. 赛车参数

| 车 | 车身色 | lane | 角速度（rad/s） | 圈速 |
|----|--------|------|-----------------|------|
| RED | `[214,72,62]` | -0.68 | .34 | ≈18.5s |
| BLUE | `[62,108,190]` | 0 | .30 | ≈20.9s |
| YELLOW | `[226,180,52]` | +0.68 | .32 | ≈19.6s |

- 位置：`(TA·cosθ, TB·sinθ) + lane × 法向`；
- 朝向：`atan2(切向)`，永远沿赛道；
- 三车速度不同，会周期性超车；lane 不同，不会穿模；
- 车身用 `solid`（`gloss` 会把暗部打成褐色，见 `props.md §8b` 坑 3）；
- 车顶头盔用 `gloss` 保留一个高光点。

---

## 7. 坑

1. **内场白色**：外缘留白判断必须加 `!inside`，否则椭圆中心到中心线的距离
   （9）大于草地外缘阈值（5.8），整块内场会被判成岛外。
2. **深度排序**：赛车与观众必须统一按 `project().d` 排序；按 y 排序会漏掉
   看台高度对深度的影响。
3. **看台上的阴影**：引擎的 `applyShadows` 只染 `ground`；台阶不是 ground，
   看台观众投的影不会显示，直接跳过节省开销。
4. **40 个观众 × 每人十几根骨头**：不要用 `dynamicAdd`（每根骨头都登记阴影），
   用只画骨头的 `crowdAdd`，围栏观众每人一次接触影即可。
5. **起跑格返回值**：用 `-1` 表示“不在起跑线”，`0/1` 表示黑白格；
   用 0 兼作“不在”会把黑格吞掉。
6. **树的 capture**：`growTree` 里的叶球必须走 `captureSphere`（不写 pix/zb），
   否则烘焙的静态树冠会和每帧回放的风动树冠重影。
7. **画布原点**：`PP_ORIGIN_Y=12`；改成 0 会让看台贴到画面顶边。
