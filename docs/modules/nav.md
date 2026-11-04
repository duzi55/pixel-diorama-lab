# 场景导航（nav.js）

左上角的全局场景切换菜单，注入到每个 demo 页面。

---

## 1. 职责

- 在**所有 demo 页面**左上角显示「场景 · 当前场景 ▾」
- 展开后分两组：
  - **本工作区**：基础 Demo / 秋日山村 / 树林 / 秋日野餐 / 屋顶晾衣 / 像素大奖赛
  - **参考项目 · 5300**：Balote / Stari Most / Rooftop Laundry / Tie-Break / Mini Ramp
- 当前页高亮（`•`）
- 页面原有的左上 HUD（`#hud / #scores / #lap`）自动下移 44px 让位

## 2. 引入方式

在页面末尾加一行（按目录层级调整 `../`）：

```html
<script src="nav.js"></script>      <!-- demo/index.html、autumn.html、forest.html -->
<script src="../nav.js"></script>   <!-- village/、laundry/、racetrack/ -->
```

导航在脚本执行时注入自身 DOM 与样式，无需额外标记。

## 3. 场景列表维护

在 `demo/nav.js` 的 `scenes` 数组加一行：

```js
{ title: '新场景', href: '/new-scene/index.html', path: '/new-scene' },
```

`path` 用于当前页匹配（去掉 `/index.html` 与尾斜杠）。新增页面别忘了引入脚本。

## 4. 参考项目链接

默认指向 `http://<hostname>:5300/<id>/`。使用前先启动：

```bash
cd reference/pixel-plays && node serve.mjs
```

参考项目是只读的，不会被注入导航；从 demo 页面点过去后，用浏览器后退返回。

## 5. 实现细节

| 项 | 说明 |
|----|------|
| 当前页识别 | `norm(pathname)` 去掉 `/index.html` 与尾斜杠后与 `norm(href)` 比较 |
| 菜单交互 | 点击按钮 / 点击外部关闭 / `Esc` 关闭 |
| 无头渲染 | `tools/render.mjs` 的沙箱没有 `location`，脚本检测后直接返回，不影响截图 |
| 调试 | 打开 `页面#menu` 会默认展开菜单（截图用） |
| HUD 让位 | 注入 CSS：`#hud, #scores, #lap { top: ... + 44px !important }` |

## 6. 坑

1. **路径基准是站点根**（`demo/` 目录），不要写成相对当前页面的路径；
   `href` 用 `/village/index.html` 这种绝对路径。
2. **当前页匹配**要归一化 `/index.html` 与尾斜杠，否则 `/racetrack/index.html`
   和 `/racetrack` 会被判成不同页面。
3. 无头渲染器必须在 `location` 判断处提前退出，否则 `tools/render.mjs` 全挂。
4. 菜单展开会盖住下移后的 HUD，这是下拉层的正常行为，不需要额外处理。
