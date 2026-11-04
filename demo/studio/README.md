# Studio — 构件生成与场景编辑

一条 **需求 → 构件 → 场景** 的生产线。零依赖、零构建。

## 启动

```bash
node demo/studio/server.mjs 5320
```

| 页面 | 地址 | 做什么 |
|------|------|--------|
| 生成 | http://127.0.0.1:5320/studio/index.html | 描述需求 → AI 写代码 → 预览 → 确认保存 |
| 编辑 | http://127.0.0.1:5320/studio/editor.html | 画地形 · 装配物体 · 调碰撞体 · 存场景 |

## 文件

| 文件 | 职责 |
|------|------|
| `server.mjs` | 静态服务 + API 路由（只用 `node:` 内置模块） |
| `ai.mjs` | AI 桥：调 `claude` CLI；含构件规范提示词模板 |
| `persist.mjs` | 落盘器：代码 + 注册表 + 配方卡三件套；场景存取 |
| `index.html` / `gen.js` | 生成页 |
| `preview.html` / `preview.js` / `preview-kit.js` | 预览沙箱（iframe 隔离） |
| `editor.html` / `editor.js` / `editor-panels.js` | 编辑器 |
| `terrain.js` / `terrain-render.js` | 编辑器的地形网格与渲染 |

## AI 桥

走本地 `claude` CLI headless 模式：

```bash
claude -p "<提示词>" --output-format json --json-schema '<schema>' \
  --tools '' --permission-mode dontAsk --no-session-persistence
```

- `--json-schema` → 直接返回结构化 JSON，不用解析自由文本
- `--tools ''` → AI 没有 Bash / 文件读写能力，只能写代码
- 提示词里自动注入**现有构件清单**，避免重造轮子

## 落盘三件套

点「确认保存」原子地写三个文件：

1. `demo/kit/<模块>.js` —— `KIT.register({...})`
2. `docs/kit/registry.md` —— 注册表一行
3. `docs/kit/<篇目>.md` —— 配方卡

三个文件的新内容先在内存算好，全部成功才落盘 —— 不会留下"代码写了、文档没写"。

## 测试

```bash
node tools/editor-test.mjs
```

加载全部脚本 → 渲染 → 断言（地形/像素/物体/构件/序列化往返/碰撞体）→ 导出 PNG。

## 详见

[../../docs/modules/studio.md](../../docs/modules/studio.md)
