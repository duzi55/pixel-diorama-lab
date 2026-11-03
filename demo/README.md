# demo

最小等距像素渲染 demo。零依赖、零构建。

## 运行

```bash
cd demo
python3 -m http.server 5310
# 打开 http://127.0.0.1:5310/
```

也可以直接打开 `index.html`。

## 操作

拖动蓝色小球，观察阴影、遮挡与深度变化；右下角按钮重置。

## 文件

| 文件 | 说明 |
|------|------|
| `engine.js` | 等距投影、深度缓冲、图元、色阶、抖动、阴影、描边 |
| `demo.js` | 小岛、土层、木屋、树、三颗球、拖拽交互 |
| `index.html` | 页面与样式 |

## 来源

基于 [`amirmushichge/pixel-plays`](https://github.com/amirmushichge/pixel-plays) 的渲染思路重写，原项目为 MIT License，Copyright (c) 2026 Amir Mushich。本目录同样遵循 MIT，见 `LICENSE`。
