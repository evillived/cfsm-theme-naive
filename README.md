<h3 align="center">CFSM Naive</h3>
<p align="center">基于 Vue 3 + Vite + Naive UI + UnoCSS + ECharts 构建的 CF-Server-Monitor 第三方主题</p>

> 本主题移植自 [komari-theme-naive](https://github.com/lyimoexiao/komari-theme-naive)。
> Komari 与 CF-Server-Monitor 的后端契约完全不同（RPC vs REST + WebSocket），
> 移植后的数据层与鉴权流程已按 CFSM 官方主题开发文档重写。

## 部署

CF-Server-Monitor 的第三方主题产物只包含两个部分：

```
dist/
├── index.html
└── assets/
```

把 `pnpm build` 生成的 `dist/` 内容作为主题目录提交到
[huilang-me/CFSM-Theme-Store](https://github.com/huilang-me/CFSM-Theme-Store)。

部署时的注意事项：

- **同源部署**（Worker/Pages）：无需额外配置，前端默认使用 `window.location.origin` 作为 API Base。
- **跨域 / 纯静态部署**（如 GitHub Pages）：在 `index.html` 中启用并填写 `apiBase` meta
  （多个后端用英文逗号分隔），同时在该 Worker 的 `CORS_ALLOWED_ORIGINS` 中加入主题域名。
- **站点启用全局 Turnstile** 时，需要在后台 CSP 设置（`csp_static`）中允许
  `https://challenges.cloudflare.com` 进入 `script-src` 与 `frame-src`。
- **正文字体 MiSans VF**：主题不在 `index.html` 里硬编码字体 CDN（会被默认 CSP 拦截并在控制台报错），
  而是启动时读取实际生效的 CSP，只在放行时才加载。默认不加载，正文回落到系统无衬线字体；
  如需启用 MiSans，请在后台 `csp_static` 中追加
  `https://cdn-font.hyperos.mi.com,https://cdn-file.hyperos.mi.com`
  （前者进 `style-src`，后者进 `font-src`）。
  注：MiSans 许可协议禁止二次分发字体文件，因此不能自托管，只能引用官方 CDN。
- 管理入口会跳转到 `/admin#admin`，由 CFSM 内置默认主题接管；**第三方主题不实现管理页与登录页**。

## 环境要求

- Node.js: `^24.15.0`
- pnpm: `>=11.15.1`

## 开发

```bash
pnpm i          # 安装依赖
pnpm dev        # 启动开发服务器
pnpm lint       # oxlint + eslint（带 --fix）
```

## 构建

```bash
pnpm build      # type-check + 生产构建
pnpm preview    # 预览生产构建
```

## 技术栈

| 类别      | 技术                                       |
| --------- | ------------------------------------------ |
| 框架      | Vue 3 (Composition API + `<script setup>`) |
| 构建工具  | Vite                                       |
| UI 组件库 | Naive UI                                   |
| 状态管理  | Pinia                                      |
| 路由      | Vue Router（hash 模式）                    |
| CSS 方案  | UnoCSS (Wind4 preset) + SCSS               |
| 图表库    | ECharts + vue-echarts                      |
| 代码规范  | ESLint (@antfu/eslint-config) + oxlint     |

## 主题设置

主题内置了一个设置页（页头画笔图标，或 `/#/settings`），设置项与 `komari-theme-naive` 的
`komari-theme.json` 一一对应。

CFSM 的第三方主题**不能**调用管理端接口，`GET /api/config` 返回的 `theme_options` 对主题是只读的。
因此设置按三级优先级合并，后面的覆盖前面的：

```text
主题默认值  ←  后端 theme_options（站长预设，对所有访客生效）  ←  本机覆盖（localStorage，只影响本设备）
```

设置页提供两个动作：

| 按钮              | 落点                  | 生效范围         | 说明                                                |
| ----------------- | --------------------- | ---------------- | --------------------------------------------------- |
| **保存到本机**    | 浏览器 `localStorage` | 仅当前设备       | 无需权限，随时可用                                  |
| **复制配置 JSON** | 剪贴板                | 所有访客（手动） | 粘贴到后台「外观设置 → 主题自定义配置」即站点级生效 |

「保存到本机」只记录**相对后端预设被改过的键**，因此站长日后调整站点预设时，访客没碰过的设置
仍会跟着更新。设置默认值、归一化与设置页清单集中在 `src/utils/themeSettings.ts`。

> 主题**不**直接调用 `POST /api/theme_options` 写回站点配置：该端点只认 `Authorization: Bearer <JWT>`，
> 而主题读不到管理端的 JWT（`cfsm_auth` Cookie 是 HttpOnly 且仅用于 WebSocket 鉴权）。
> 站点级配置统一走「复制配置 JSON → 粘贴到后台」这一条路径，避免出现半可用状态。

### 直接写 `theme_options`（高级）

站长也可以在 CFSM 后台的「外观设置 → 主题自定义配置」里手写 JSON。该对象是自由结构、后端
**不校验**类型，因此主题侧对每个键都做了防御式解析（非法值一律回落默认）。

当前支持的键：

| 键                                                           | 类型                                     | 默认值                                        | 说明                                        |
| ------------------------------------------------------------ | ---------------------------------------- | --------------------------------------------- | ------------------------------------------- |
| `defaultViewMode`                                            | `card` \| `list`                         | `card`                                        | 访客首次打开时使用的节点视图                |
| `showAdminEntry`                                             | boolean                                  | `true`                                        | 是否在页头显示「管理后台」入口              |
| `fullWidth`                                                  | boolean                                  | `false`                                       | 内容是否占满屏幕宽度                        |
| `maxPageWidth`                                               | string                                   | `1800px`                                      | 内容最大宽度                                |
| `cardSize`                                                   | `compact` \| `comfortable` \| `spacious` | `comfortable`                                 | 节点卡片尺寸                                |
| `cardMinWidth`                                               | number                                   | `340`                                         | 卡片自动分栏的最小宽度（280–520）           |
| `cardMetrics`                                                | JSON 字符串数组                          | `["cpu","memory","disk","traffic"]`           | 卡片展示指标                                |
| `cardProgressLayout`                                         | `1col` \| `2col`                         | `2col`                                        | 卡片进度条布局                              |
| `showGeneralCards`                                           | boolean                                  | `true`                                        | 是否显示数据总览                            |
| `hideSingleGroupTab`                                         | boolean                                  | `true`                                        | 仅一个分组时隐藏分组 Tab                    |
| `showPingChartButton`                                        | boolean                                  | `true`                                        | 是否显示延迟图表入口                        |
| `lightCardContrast`                                          | boolean                                  | `false`                                       | 亮色模式下增强卡片对比度                    |
| `trafficSplitColor`                                          | boolean                                  | `true`                                        | 流量上下行使用不同颜色                      |
| `tagsInSeparateRow`                                          | boolean                                  | `false`                                       | 标签单独一行常驻显示                        |
| `uptimeTagWrap`                                              | boolean                                  | `false`                                       | 用 Tag 包裹运行时间                         |
| `uptimeFormat`                                               | `day` \| `hour` \| `minute` \| `second`  | `day`                                         | 运行时间精度                                |
| `numberFontFamily`                                           | string                                   | `"TCloud Number VF", "MiSans VF", sans-serif` | 数值字体                                    |
| `listViewColumns`                                            | JSON 字符串数组                          | 见 `stores/app.ts`                            | List 视图显示列（默认含 `latency`）         |
| `listColumnWidths`                                           | JSON 字符串对象                          | 见 `stores/app.ts`                            | 列宽                                        |
| `listColumnPadding` / `listColumnMargin`                     | JSON 字符串对象                          | `{}`                                          | 列内/外边距                                 |
| `listColumnGap`                                              | string                                   | `12px`                                        | 列间距                                      |
| `listRowHeight`                                              | string                                   | 空                                            | 行高                                        |
| `listStatusStyle`                                            | `tag` \| `badge`                         | `tag`                                         | List 状态样式                               |
| `listTagsStyle`                                              | `tag` \| `badge`                         | `tag`                                         | List 标签样式                               |
| `byteDecimalsB` / `KB` / `MB` / `GB` / `TB`                  | number                                   | `0/0/1/1/2`                                   | 各字节单位的小数位，`-1` 表示跳过该单位     |
| `alertEnabled` / `alertType` / `alertTitle` / `alertContent` | boolean / enum / string / string         | `false` / `info` / 空 / 空                    | 首页公告                                    |
| `icpEnabled` / `icpNumber` / `icpUrl`                        | boolean / string / string                | `false` / 空 / 工信部                         | ICP 备案展示                                |
| `policeEnabled` / `policeNumber` / `policeUrl`               | boolean / string / string                | `false` / 空 / 空                             | 公安备案展示                                |
| `backgroundEnabled` / `backgroundType`                       | boolean / `image` \| `video`             | `false` / `image`                             | 自定义背景                                  |
| `lightBackgroundUrl` / `darkBackgroundUrl`                   | string                                   | 空                                            | 亮/暗色背景地址                             |
| `backgroundBlur` / `backgroundOverlay` / `cardBlurRadius`    | number                                   | `0` / `0` / `12`                              | 背景模糊、遮罩、卡片毛玻璃半径              |
| `dataUpdateInterval`                                         | number                                   | `3`                                           | 「实时」图表刷新间隔（秒，1–60）            |
| `enableRealtime`                                             | boolean                                  | `true`                                        | 是否建立 WebSocket 实时推送（关闭可省额度） |
| `borderRadius`                                               | string                                   | `3px`                                         | 全局圆角                                    |
| `fontFamily`                                                 | string                                   | `"MiSans VF", sans-serif`                     | 全局字体栈                                  |
| `lightPrimaryColor` / `…Hover` / `…Pressed`                  | string                                   | `#18a058` / `#36ad6a` / `#0c7a43`             | 亮色模式主色 / 悬停 / 按下                  |
| `darkPrimaryColor` / `…Hover` / `…Pressed`                   | string                                   | `#63e2b6` / `#7fe7c4` / `#5acea7`             | 暗色模式主色 / 悬停 / 按下                  |

> `listViewColumns`、`listColumnWidths`、`listColumnPadding`、`listColumnMargin`、`cardMetrics`
> 在 `theme_options` 里以 **JSON 字符串**承载（与 komari 一致）；主题内部会解析成原生数组 / 对象，
> 导出时会再序列化回字符串，因此可以双向搬运。

> 站点标题、背景图、自定义 `<head>`、自定义脚本与 CSP 由 CFSM 后台外观设置控制，主题不接管这些配置。

## 相对原主题的能力差异

CFSM 的公开 API 与 Komari 不同，以下能力发生了退化或调整：

- **延迟图表**：`/api/history/all` 的历史行自带 `ping_ct/cu/cm/bd` 与 `loss_ct/cu/cm/bd`，
  因此详情页的延迟曲线是**真实历史**，提供 `1 / 6 / 12 / 24` 小时四档；三网线路为 `ct / cu / cm / bd`，
  超过 24 小时的档位需登录（未登录会 401），故不提供。
- **延迟与丢包的展示位置**：延迟曲线与区间统计在详情页 `PingChart`；首页卡片（`NodeCard` 的「延迟」行）
  按线路逐线**内联**并排展示，形如 `电信 · 55ms | 东京 · 111ms`，
  延迟数字按**丢包率**着色，具体丢包数字在鼠标悬浮时给出；
  列表视图的 `latency` 列展示最差线路概览，逐线明细在 tooltip 中展开（需后台开启「三网详情」）。
  分级口径为延迟 `<100ms` 绿 / `<200ms` 橙 / `≥200ms` 红，丢包 `≤1%` 绿 / `≤10%` 橙 / `>10%` 红；
  探测超时统一显示为「超时」。
- **支持自定义节点**：除三网（`ct/cu/cm/bd`）外，后台「自定义节点 1-4」（`ping_node_1..4` /
  `loss_node_1..4`，显示名 `node_1_name..node_4_name`）在首页卡片、列表与详情页曲线中同样展示，
  未配置的线路自动隐藏。
- **负载历史**：`/api/history/all` 最长只支持 7 天，且视图时长只能取固定枚举值。
- **无对应数据**：温度、虚拟化信息、备注字段后端不提供，相关 UI 已移除。
- **主题设置的落点变了**：komari 由后台面板统一下发 `theme_settings`；CFSM 的第三方主题无权调用
  管理端接口，因此设置页由主题自带，访客的调整存本机，站点级预设靠复制 JSON 粘贴到后台
  （详见上文「主题设置」）。
- **登录**：主题不实现登录页；非公开站点请先登录 `/admin#admin`（同域下依赖 `cfsm_auth` Cookie）。

## 参考

- [CF-Server-Monitor](https://github.com/huilang-me/CF-Server-Monitor)
- [CFSM-Theme-Store](https://github.com/huilang-me/CFSM-Theme-Store)
- [komari-theme-naive](https://github.com/lyimoexiao/komari-theme-naive)（移植来源）
- [Vue 3](https://vuejs.org/) / [Vite](https://vite.dev/) / [Naive UI](https://www.naiveui.com/) / [UnoCSS](https://unocss.dev/)

## License

[MIT](./LICENSE)
