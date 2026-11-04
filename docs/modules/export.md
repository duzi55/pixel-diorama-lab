# 构件图集导出（three.js 桥）

把 Studio 里的**程序化构件**烘焙成**精灵图集**，交给 three.js 或其他引擎消费。

```
demo/kit/*.js  ──bake-atlas.mjs──▶  demo/export/atlas.png
（绘制代码）                        demo/export/atlas.json
                                          │
                                          ▼
                                  three-demo.html（消费示例）
```

> **为什么要烘焙**：构件不是图片，而是「向像素缓冲写点」的绘制代码
> （`ctx.sphere/capsule/box/plot`）。它和渲染器是一体的，没有可拿走的文件。
> 烘焙这一步把「指令」变成「资产」，之后任何引擎都能用。

---

## 1. 生成

```bash
node tools/bake-atlas.mjs                  # 全部构件 × 8 朝向
node tools/bake-atlas.mjs --dirs 16        # 16 朝向（22.5° 一档）
node tools/bake-atlas.mjs --scale 16       # 更高分辨率（默认 12 px/单位）
node tools/bake-atlas.mjs --only broadleaf,wood-house
```

Studio 编辑器 →「场景存取」→「**⇩ 烘焙 three.js 图集**」按钮
（走 `POST /api/bake-atlas`，参数同上）。

产物：

| 文件 | 内容 |
|------|------|
| `demo/export/atlas.png` | 精灵图集，1024 宽，带 alpha |
| `demo/export/atlas.json` | 帧矩形 / 锚点 / UV / 参数 / 碰撞体 |

---

## 2. 图集格式（atlas.json）

```jsonc
{
  "format": "pixel-diorama-atlas",
  "version": 1,
  "image": "atlas.png",
  "size": { "w": 1024, "h": 1080 },
  "scale": 12,                 // 烘焙尺度：像素 / 世界单位
  "dirs": 8,
  "projection": { "sin": 0.5, "cos": 0.8660254, "r2": 1.4142136 },
  "components": {
    "broadleaf": {
      "name": "阔叶树",
      "category": "tree",
      "params": { /* 参数定义，与 KIT 一致 */ },
      "defaults": { "height": 5, "crownR": 1.5, ... },
      "collision": { "type": "cylinder", "radius": 0.35, "height": 5 },
      "dirs": 8,
      "frames": [
        {
          "key": "broadleaf@0", "dir": 0,
          "x": 0, "y": 0, "w": 45, "h": 70,
          "anchorX": 22, "anchorY": 59,        // 构件原点在帧内的像素位置
          "u0": 0, "v0": 0, "u1": 0.0439, "v1": 0.0648
        }
      ]
    }
  }
}
```

### 关键约定

| 约定 | 说明 |
|------|------|
| **锚点** | `anchorX/anchorY` = 构件世界原点 (0,0,0) 在帧内的像素位置。摆位时让「帧左上角 = 投影点 − 锚点」 |
| **投影** | 与 `demo/engine.js` 完全一致：`sx = (x−y)/√2·S`，`sy = ((x+y)/√2·0.5 − z·0.866)·S` |
| **UV** | `u0..v1` 是**图片坐标**（v 轴向下）。three 的 `flipY=true` 时需换算：`offset.y = 1 − (y+h)/H` |
| **透明** | 背景是 alpha=0；哨兵色在导出时被丢弃 |
| **阴影** | **不烘焙**。影子交给 3D 端自己投（或另做阴影贴图） |
| **描边** | 烘焙时跑了 `shadeEdges()`，精灵自带深度描边 |

---

## 3. three.js 消费示例

`demo/export/three-demo.html`（需 HTTP 服务，three.js 走 CDN）：

```js
// 1) 加载
const meta = await fetch('./atlas.json').then(r => r.json());
const img  = await loadImage('./atlas.png');

// 2) 共享底图；每个精灵 clone 一份（现代 three 的 clone 共享 source，
//    只改 offset/repeat，不会重复上传 GPU 贴图）
const base = new THREE.Texture(img);
base.colorSpace = THREE.SRGBColorSpace;
base.magFilter = base.minFilter = THREE.NearestFilter;
base.generateMipmaps = false;

const f = meta.components['broadleaf'].frames[0];
const tex = base.clone();
tex.repeat.set(f.w / meta.size.w, f.h / meta.size.h);
tex.offset.set(f.x / meta.size.w, 1 - (f.y + f.h) / meta.size.h);

// 3) 摆位：锚点对齐世界投影点
const mesh = new THREE.Mesh(
  new THREE.PlaneGeometry(f.w, f.h),
  new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5 })
);
mesh.position.set(px - f.anchorX + f.w / 2, -(py - f.anchorY + f.h / 2), 0);
mesh.renderOrder = (wx + wy) * 10;      // 画家算法
```

示例页功能：8 朝向切换、滚轮缩放、拖动平移、黄昏色调、自动旋转、
`?dir=3` 直接打开某朝向。

---

## 4. 能力边界

| 能力 | 支持 | 说明 |
|------|------|------|
| 像素美学 | ✅ 100% | 就是同一台渲染器画的 |
| 8/16 方向 | ✅ | 方向数是烘焙参数 |
| 任意缩放 | ⚠️ | 整数倍最清晰；非整数倍 Nearest 采样仍可用 |
| 旋转视角 | ⚠️ | 只能切 8/16 档，有跳变 |
| 动态光照 | ❌ | 光照烘焙死在像素里；可加法线图，或走「几何导出」路线 |
| 动态阴影 | ❌ | 同上 |
| 参数变化（如树高） | ⚠️ | 需要按参数档位多烘几套（`--only` + 参数变体） |

> 需要自由视角/实时光照时，出路是「几何指令导出」（记录 sphere/capsule/box
> 调用为 JSON，在 three 里还原网格）—— 但会丢掉像素风的 `plot` 细节，
> 属于另一条产品线。

---

## 5. 相关

- [studio.md](studio.md) — 构件生成与编辑器
- [../kit/README.md](../kit/README.md) — 构件库总览
- `tools/bake-atlas.mjs` — 烘焙器源码
