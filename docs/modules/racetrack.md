# 像素大奖赛（Pixel Grand Prix）

等距微缩赛车场：**真实 oval 布局**（两条直道 + 两个半圆弯），三辆方程式赛车
持续绕圈，看台 40 人 + 草坡散客 10 人按“最近赛车的距离”起身欢呼。

尺度按现实比例校准：人高 1.6、赛车长 3.05（约两人高）、赛道宽 5.6（三车可并排）。

场景完整落在 **600×340** 画布内，四周留纸色边 ≥12px（`racetrack-test` 守这条）；
岛的边缘用**噪声溶解带 + 颜色向纸色过渡 + 水墨碎点**，不做硬切，也没有画布裁切。

没有新增构件 ID：赛车复用 `beetle-car` 的“沿赛道坐标系 + 胶囊车身”骨架，
配色/尾翼走参数组；人物复用 `kit/figures.js` 骨架与 `crowd.md §5` 姿态。

---

## 1. 文件与入口

| 文件 | 行数 | 职责 |
|------|------|------|
| `demo/racetrack/index.html` | 57 | 画布 600×340 / S=10、HUD、脚本顺序 |
| `demo/racetrack/track.js` | 317 | oval 几何、逐像素分层、有机岛缘、主看台、维修区、内场、护栏/轮胎墙、烘焙 |
| `demo/racetrack/race.js` | 74 | 三辆方程式赛车、弧长参数行驶、车体绘制 |
| `demo/racetrack/spectators.js` | 97 | 观众站位、欢呼强度、姿态合成 |
| `demo/racetrack/main.js` | 71 | 深度排序、主循环、圈数 HUD、调试钩子 |

页面左上角的场景切换菜单来自 `demo/nav.js`（见 `docs/modules/nav.md`）。

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

## 2. 现实布局与尺度

```
              广告板 ─────────────────────┐
              看台（4 排 × 10 人）         │
         ╭───────────────┴─────────────╮  │
         │  后侧主直道（起跑格）         │  │
         │   维修车库 ×6（内侧）         │  │
         │  ╭──────────────────────╮   │  │
         │  │ 内场：记分塔 / 领奖台  │   │  │
         │  │ 队旗 / 树 / 轮胎堆     │   │  │
         │  ╰──────────────────────╯   │  │
         │  前侧直道（对面）             │  │
         ╰──────────────────────────────╯  │
              弯道外侧：轮胎墙 + 白护栏      │
              草坡散客 ×10（前侧直道外）
```

| 常量 | 值 | 说明 |
|------|-----|------|
| `STRAIGHT` | 10.5 | 半直道长度（直道总长 21） |
| `CURVE_R` | 7 | 弯道半径 |
| `TRACK_HALF` | 2.8 | 赛道半宽（整宽 5.6） |
| `KERB` | .75 | 弯道路肩宽（直道不铺路肩） |
| `WALL_OFF` | 2.1 | 护栏离路边 |
| `STAND` | x∈[-10,10]，front=-10.2，4 排 rise .55 | 主看台 |

| 比例 | 世界单位 | 屏幕（S=10） |
|------|----------|--------------|
| 人高 | 1.6 | ≈17px |
| 赛车长 | 3.05 | ≈30px |
| 赛车宽 | 1.76 | — |
| 赛道宽 | 5.6 | ≈56px |
| 看台台阶高 | .55 | ≈6px |

**赛道中心线**用弧长参数 `trackAt(u)` 描述：后侧直道 → 右半圆弯 → 前侧直道 → 左半圆弯。
赛车沿着它走，切向永远与赛道贴合，直道/弯道速度连续。

**地面分层**用 `trackNearest(x,y)` 求到中心线的最近距离：

```js
直道段：dist = | |y| - CURVE_R |
弯道段：dist = | hypot(|x|-STRAIGHT, y) - CURVE_R |
```

逐像素分成 `沥青 → 白线 → 弯道路肩 → 草地`；沥青里再叠低频补丁、
两条行车胎痕和零星亮斑。

---

## 2b. 有机岛缘与纸色过渡

按 `docs/kit/scene.md §2` 的抖动溶解，配合 `village` 的纸色留白。逐像素：

```js
const e0 = inside ? 0 : dist / EDGE_R;          // EDGE_R = 2.8 + 2.1 + 8.2 = 13.1
let rough = e0;
if (e0 > .7) rough += (noise(x*.16+5.2, y*.16)-.5)*.24
                    + (noise(x*.42, y*.42+1.7)-.5)*.10;

if (rough > 1.04) return 0;                     // 完全留白
if (rough > 1.0) {                              // 极少量水墨碎点
  if (hash(ix,iy) < .999) return 0;
  return mixPaper(grass, .78);
}
if (rough > .9) {                               // 大团块啃边
  const fade = (rough-.9)/.1;
  const clump = noise(ix*.08, iy*.08);
  if (hash(ix,iy)*.35 + clump*.65 < fade) return 0;
}
// 草地颜色在 rough .78 → 1.0 之间向纸色混 72%
```

- **纸色** `PAPER = [252,245,218]`，与页面 CSS `--paper` 逐位一致；
- 岛边界的形状由两层低频噪声扭曲，不会出现完美椭圆；
- 只有边缘像素（`e0 > .7`）才采样扭曲噪声，内部像素直接跳过，控制烘焙耗时；
- 画布 600×340，实测内容包围盒留白 **左32 右25 上28 下33**（`racetrack-test` 断言 ≥12）。

---

## 3. 渲染管线

**烘焙一次**：逐像素赛道/草地 → `groundZ` → 主看台 → 维修车库 → 记分塔/领奖台/旗/树
→ 护栏 + 轮胎墙 → 静态阴影 → AO。

**每帧**：

```js
pix.set(bakedPix); zb.set(bakedZ);
const dyn = [...观众, ...赛车].sort(by project(x,y,z).d);   // 远 → 近
for (const it of dyn) drawSpectator / drawRacer;
drawLeaves(raceTime);        // 内场树冠 capture 风动
flushShadows(); applyShadows(groundZ); shadeEdges();
ctx.putImageData(image, 0, 0);
```

**必须按 `project().d` 排序**：看台观众在远处、赛车在赛道上；按 y 排序会漏掉
看台高度对深度的影响。

---

## 4. 复用映射（docs/kit → 代码）

| 配方卡 | 代码 | 用法 |
|--------|------|------|
| `props.md §8b` beetle-car | `race.js` | 沿赛道坐标系 + 胶囊车身 + 四轮 + 两层阴影；改为方程式赛车（长车身、前后翼、开放座舱） |
| `crowd.md §5` 姿态合成 | `spectators.js` | 手臂角度 / 起跳 / 后仰；节拍按相位错开 |
| `crowd.md §1.4` 配色表法 | `spectators.js` | 直接复用 `KIT_CROWD_SHIRTS / LEGS / HAIR / SKIN` |
| `figures.md` 人物骨架 | `kit/figures.js` | `figure()` + 轻量 `crowdAdd`（只画骨头，不登记阴影） |
| `trees.md §1` broadleaf | `track.js` `growTree()` | 内场两棵，`captureSphere` 风动 |
| `scene.md` 地面协议 | `track.js` `bakeTrack()` | `ground / groundZ`；阴影与 AO 只作用在地面 |
| `structures.md` 围栏 | `track.js` `buildBarrier()` | 沿中心线外法向偏移，`strokePath()` 双横杆 + 立柱 |

---

## 5. 欢呼模型

每个观众每帧找**最近的一辆赛车**；看台是主场，阈值更宽：

```js
const near = s.onStand ? 6 : 5, span = s.onStand ? 10 : 9;
const want = clamp(1 - (best - near) / span, 0, 1);
s.cheer += (want - s.cheer) * Math.min(1, dt * 5);
```

姿态由 `cheer` 连续驱动（节拍量化保持手绘感）：

```js
const beat = Math.floor(time * 7 + s.phase * 3) % 2;
pose.armR = .08 + c * (2.6 + beat * .32);
pose.armL = .08 + c * (2.6 - beat * .32);
pose.z    = s.z + c * beat * .12;     // 起跳
pose.lean = -c * .16;                 // 后仰
```

- 看台观众 `z = 0.55 × 排数`，站在台阶面上；
- 草坡散客 `z = 0`，投接触影；看台上的影子落在台阶上（不是 `ground`），跳过；
- 视线始终追最近的车，角度差用 `atan2(sin, cos)` 归一化；
- 每人 `phase` 不同 → 欢呼是一排排的波浪，而不是整齐划一。

**实测**（`tools/racetrack-test.mjs`）：车在主直道看台正前方时看台平均 `cheer=0.67`，
车在前侧直道时 `0.00`——局部观众满强度，远端自然平静。

---

## 6. 赛车参数

| 车 | 车身色 | lane | 圈速 |
|----|--------|------|------|
| RED | `[214,72,62]` | -1.75 | ≈17.2s |
| BLUE | `[62,108,190]` | 0 | ≈19.2s |
| YELLOW | `[226,180,52]` | +1.75 | ≈18.2s |

- 位置：`trackAt(u)` + `lane × 外法向`；
- 朝向：`atan2(切向)`；
- 三车速度不同，会周期性超车；三条 lane 间距 1.75，车宽 1.76，刚好不穿模；
- 车身用 `solid`（`gloss` 会把暗部打成褐色，见 `props.md §8b` 坑 3）；
- 头盔用 `gloss` 保留高光；前翼/尾翼用另一色，读作“方程式赛车”。

---

## 7. 坑

1. **内场白色**：岛外判断必须区分 `inside`；否则椭圆/oval 中心到中心线的距离
   大于草地边缘阈值，整块内场会被判成岛外。
2. **内场建筑遮挡**：维修车库必须放得足够低、离主直道足够远，否则会把主直道上的
   赛车挡掉。当前车库高 1.8、后移 3 世界，屏幕投影刚好落在赛道下方。
3. **起跑格返回值**：用 `-1` 表示“不在起跑线”，`0/1` 表示黑白格；
   用 0 兼作“不在”会把黑格吞掉。
4. **看台阴影**：引擎的 `applyShadows` 只染 `ground`；台阶不是 ground，
   看台观众的影子本来就不该显示，直接跳过节省开销。
5. **50 个观众**：不要用 `dynamicAdd`（每根骨头登记阴影），用只画骨头的
   `crowdAdd`，草坡散客每人一次接触影。
6. **弯道路肩**：只在 `|x| > STRAIGHT - 1.5` 的弯道段铺红白，直道保持白线，
   否则整圈都是格子，读起来像玩具。
7. **画布原点**：600×340 下 `PP_ORIGIN_Y=0`；画布尺寸是按内容包围盒反算的，
   改画布或改 `EDGE_R` 后必须重跑测试确认四边 ≥12px。
8. **树的风动**：叶球必须走 `captureSphere`（不写 pix/zb），否则烘焙的静态树冠
   会和每帧回放的树冠重影。
9. **边缘过渡**：溶解带用**团块噪声**主导（`noise(ix*.12, iy*.12)`），
   只用 `hash` 会变成均匀喷点，看起来脏；碎点密度控制在 0.15% 以内。
10. **纸色必须与页面一致**：画布内留白、页面背景、导航底色三者用同一个
    `#fcf5da`，否则画布边界会露出一条色差。
