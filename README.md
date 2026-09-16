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

## 主题配置（`theme_options`）

CFSM 通过 `GET /api/config` 返回的 `theme_options`（自由对象）承载主题配置，写入使用
`POST /api/theme_options`（需要 JWT）。后端**不校验**该对象的结构，因此主题侧对每个键都做了
防御式解析（见 `src/stores/app.ts` 的 `optString` / `optBool` / `optNumber` / `optEnum` / `optJson`）。

当前支持的键：

| 键                                                           | 类型                                     | 默认值                                        | 说明                                    |
| ------------------------------------------------------------ | ---------------------------------------- | --------------------------------------------- | --------------------------------------- |
| `defaultViewMode`                                            | `card` \| `list`                         | `card`                                        | 访客首次打开时使用的节点视图            |
| `showAdminEntry`                                             | boolean                                  | `true`                                        | 是否在页头显示「管理后台」入口          |
| `fullWidth`                                                  | boolean                                  | `false`                                       | 内容是否占满屏幕宽度                    |
| `maxPageWidth`                                               | string                                   | `1800px`                                      | 内容最大宽度                            |
| `cardSize`                                                   | `compact` \| `comfortable` \| `spacious` | `comfortable`                                 | 节点卡片尺寸                            |
| `cardMinWidth`                                               | number                                   | `340`                                         | 卡片自动分栏的最小宽度（280–520）       |
| `cardMetrics`                                                | JSON 字符串数组                          | `["cpu","memory","disk","traffic"]`           | 卡片展示指标                            |
| `cardProgressLayout`                                         | `1col` \| `2col`                         | `2col`                                        | 卡片进度条布局                          |
| `showGeneralCards`                                           | boolean                                  | `true`                                        | 是否显示数据总览                        |
| `hideSingleGroupTab`                                         | boolean                                  | `true`                                        | 仅一个分组时隐藏分组 Tab                |
| `showPingChartButton`                                        | boolean                                  | `true`                                        | 是否显示延迟图表入口                    |
| `lightCardContrast`                                          | boolean                                  | `false`                                       | 亮色模式下增强卡片对比度                |
| `trafficSplitColor`                                          | boolean                                  | `true`                                        | 流量上下行使用不同颜色                  |
| `tagsInSeparateRow`                                          | boolean                                  | `false`                                       | 标签单独一行常驻显示                    |
| `uptimeTagWrap`                                              | boolean                                  | `false`                                       | 用 Tag 包裹运行时间                     |
| `uptimeFormat`                                               | `day` \| `hour` \| `minute` \| `second`  | `day`                                         | 运行时间精度                            |
| `numberFontFamily`                                           | string                                   | `"TCloud Number VF", "MiSans VF", sans-serif` | 数值字体                                |
| `listViewColumns`                                            | JSON 字符串数组                          | 见 `stores/app.ts`                            | List 视图显示列                         |
| `listColumnWidths`                                           | JSON 字符串对象                          | 见 `stores/app.ts`                            | 列宽                                    |
| `listColumnPadding` / `listColumnMargin`                     | JSON 字符串对象                          | `{}`                                          | 列内/外边距                             |
| `listColumnGap`                                              | string                                   | `12px`                                        | 列间距                                  |
| `listRowHeight`                                              | string                                   | 空                                            | 行高                                    |
| `listStatusStyle`                                            | `tag` \| `badge`                         | `tag`                                         | List 状态样式                           |
| `listTagsStyle`                                              | `tag` \| `badge`                         | `tag`                                         | List 标签样式                           |
| `byteDecimalsB` / `KB` / `MB` / `GB` / `TB`                  | number                                   | `0/0/1/1/2`                                   | 各字节单位的小数位，`-1` 表示跳过该单位 |
| `alertEnabled` / `alertType` / `alertTitle` / `alertContent` | boolean / enum / string / string         | `false` / `info` / 空 / 空                    | 首页公告                                |
| `icpEnabled` / `icpNumber` / `icpUrl`                        | boolean / string / string                | `false` / 空 / 工信部                         | ICP 备案展示                            |
| `policeEnabled` / `policeNumber` / `policeUrl`               | boolean / string / string                | `false` / 空 / 空                             | 公安备案展示                            |
| `backgroundEnabled` / `backgroundType`                       | boolean / `image` \| `video`             | `false` / `image`                             | 自定义背景                              |
| `lightBackgroundUrl` / `darkBackgroundUrl`                   | string                                   | 空                                            | 亮/暗色背景地址                         |
| `backgroundBlur` / `backgroundOverlay` / `cardBlurRadius`    | number                                   | `0` / `0` / `12`                              | 背景模糊、遮罩、卡片毛玻璃半径          |
| `dataUpdateInterval`                                         | number                                   | `3`                                           | 「实时」图表刷新间隔（秒，1–60）        |

> 站点标题、背景图、自定义 `<head>`、自定义脚本与 CSP 由 CFSM 后台外观设置控制，主题不接管这些配置。

## 相对原主题的能力差异

CFSM 的公开 API 与 Komari 不同，以下能力发生了退化或调整：

- **延迟图表**：CFSM 没有延迟历史接口，只提供 `/api/servers` 中近 `latency_window.hours`（默认 2 小时）
  的窗口数据（最多约 20 个真实采样点），因此曲线范围受限；详情页的延迟图表固定为三网 `ct / cu / cm / bd`。
- **负载历史**：`/api/history/all` 最长只支持 7 天，且视图时长只能取固定枚举值。
- **无对应数据**：温度、虚拟化信息、备注字段后端不提供，相关 UI 已移除。
- **登录**：主题不实现登录页；非公开站点请先登录 `/admin#admin`（同域下依赖 `cfsm_auth` Cookie）。

## 参考

- [CF-Server-Monitor](https://github.com/huilang-me/CF-Server-Monitor)
- [CFSM-Theme-Store](https://github.com/huilang-me/CFSM-Theme-Store)
- [komari-theme-naive](https://github.com/lyimoexiao/komari-theme-naive)（移植来源）
- [Vue 3](https://vuejs.org/) / [Vite](https://vite.dev/) / [Naive UI](https://www.naiveui.com/) / [UnoCSS](https://unocss.dev/)

## License

[MIT](./LICENSE)
