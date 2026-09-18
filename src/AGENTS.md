# Source Tree Guide

本文件仅适用于 `/src`。保持现有的 Vue 3 + Vite + Pinia + Naive UI 结构。

## Core architecture

- `main.ts` 仅负责引导：创建 app、安装 Pinia 与 router、加载全局样式、挂载 `App.vue`。不要把业务逻辑放进引导流程。
- `App.vue` 是外壳：全局布局、启动生命周期、加载过渡、`KeepAlive`，并调用 `@/utils/init` 的 `initApp()` 与 `destroyInitManager()`。
- `src/router/index.ts` 使用 **hash 路由**，共三条：
  - `/#/` → `@/views/HomeView.vue`
  - `/#/server/:id` → `@/views/InstanceDetail.vue`
  - `/#/settings` → `@/views/ThemeSettings.vue`
- 路由职责仅限导航与过渡，守卫只驱动 `window.$loadingBar`。

## 数据链路

CFSM 的链路是「REST 拉取 + WebSocket 推送」，与移植前的 Komari RPC 模型不同：

- 传输层集中在 `@/utils/cfsmApi`（REST）与 `@/utils/cfsmWs`（WebSocket 订阅管理器）；组件不得自行 fetch 或建连。
- 后端 wire 类型集中在 `@/types/cfsm`；组件与 store 不要重复声明响应结构。
- 启动编排只在 `@/utils/init`：`GET /api/config` →（必要时）Turnstile → `GET /api/servers` → WebSocket 订阅。
- 鉴权由 `CfsmAuth` 统一注入：同域依赖 `cfsm_auth` Cookie；跨域/纯静态部署需要 JWT；启用全局 Turnstile 时带 `X-Turnstile-Token` 或 `X-Turnstile-Verified`。
- 多站（多 `apiBase`）：每个后端独立请求、独立 WebSocket 连接，`ids` 只提交该后端自己的服务器 ID。

## Stores

- Pinia setup store 是应用状态的唯一来源。
- `@/stores/app`：站点配置（`/api/config`）、**主题设置的解析结果**（`themeSettings`）、主题模式与后台 `preferred_theme`、布局与格式化偏好、持久化 UI 状态。
- `@/stores/themeSettings`：主题设置的**本机覆盖层**（localStorage，键 `cfsm-naive:theme-settings`）。只保存被改过的键；多标签页靠 `storage` 事件同步（监听在 `App.vue` 注册）。
- `@/stores/nodes`：节点 view model（`NodeData`）、`adaptServer` 字段适配、`mergePatch` WebSocket 增量合并、多站 stats/regionStats/sysConfig 聚合、在线状态兜底。
- `NodeData` 沿用了移植前的字段名以降低组件改动量（例如 `mem_total` 承载 CFSM 的 `ram_total`），字段注释标注了映射关系；CFSM 独有数据以新字段追加（`ping_window`、`loss_window`、`ping_latency`、`disk_io`、`net_*_monthly` 等）。
- **容量字段一律以字节存储**：CFSM 的 `ram_*` / `swap_*` / `disk_*` 以 MB 上报，而 `formatBytes*` 按字节解析。`adaptServer` 与 `mergePatch` 必须经 `mbToBytes` 换算，`LoadChart` 的历史行用 `mbToBytesOrNull`（保留 `null` 断点）。任何新增的原始字段读取路径都要先换算，否则容量会缩小 1/1048576。
- CFSM 公共接口不提供的数据（`temp`、`virtualization`、`remark`）恒为空/0，**不要在 UI 中展示**。
- **主题设置的读取只有一个入口**：`@/utils/themeSettings` 的 `normalizeThemeSettings` / `resolveThemeSettings`。所有设置类消费方都必须读 `appStore` 中已解析的 computed（如 `appStore.cardSize`），**不要直接读 `themeOptions` / `backendThemeOptions`**，否则本机设置不会生效。新增设置项时：在 `ResolvedThemeSettings` 加字段 → 在 `DEFAULT_THEME_SETTINGS` 给默认值 → 在 `normalizeThemeSettings` 补一条防御式解析 → 在 `THEME_SETTING_GROUPS` 加清单项 → 在 `app.ts` 暴露 computed。
- 该解析层是**唯一的** `typeof` 判断 / 受控 `JSON.parse` / 合法值过滤 / 默认值兜底之处；`optString` 一类的就地辅助函数已移除，不要再新加第二套。

## Utils

- `cfsmApi.ts` REST 客户端；`cfsmWs.ts` 订阅管理器（订阅过滤、增量归一化、心跳、重连、可见性挂起、`frontend_ws_timeout_minutes` 超时）；`turnstile.ts` 人机验证
- `init.ts` 启动与实时链路编排
- `helper.ts` 格式化；`recordHelper.ts` 时间序列整形；`latencyHelper.ts` 延迟/丢包分级与格式化；`osImageHelper.ts` / `regionHelper.ts` / `tagHelper.ts` 查找；`webFont.ts` 按 CSP 条件加载网页字体；`themeSettings.ts` 主题设置的类型/默认值/归一化/清单
- `themeSettings.ts` 同时导出设置页用的声明式清单 `THEME_SETTING_GROUPS`（对齐 komari-theme-naive 的 `komari-theme.json`），设置页只负责按 `kind` 渲染控件，不要在页面里另写一份键名与默认值。
- 视图与组件必须复用这些 helper，不要重复实现解析、格式化、查找或传输逻辑
- **不要在 `index.html` 里硬编码任何跨域资源**（字体、样式、脚本）。CFSM 会对主题 HTML 下发 `Content-Security-Policy`，默认只放行 `'self'`、`https://challenges.cloudflare.com` 与 `https://fonts.googleapis.com`（字体文件为 `https://fonts.gstatic.com`），其余来源必须由管理员加入后台的 `csp_static` 设置。硬编码会被拦截并在控制台留下 CSP 报错。确实需要的跨域资源一律走 `webFont.ts` 那种「先读实际策略、放行才加载、无法判定就不加载」的条件加载，并且**不得抛错或阻塞渲染**。

## Components

- 组件只渲染 UI，数据来自 store 或 `@/utils/*`。
- **页面容器宽度统一走 `@/composables/usePageContainer`**：`App.vue` 的内容区、`Header.vue`、`Footer.vue` 三处容器共用同一份 `containerStyle`，按视口在 `maxPageWidth`（> 640px）与 `maxPageWidthMobile`（≤ 640px）之间切换，断点常量是 `MOBILE_BREAKPOINT_PX`。新增容器时不要自己写一份 `maxWidth` + 媒体查询，否则页头与内容区会在临界宽度上错位。
- `NodeCard.vue`、`NodeList.vue`、`NodeGeneralCards.vue`、`LoadChart.vue`、`PingChart.vue` 保持展示聚焦，并继续用 `defineAsyncComponent` 懒加载。
- `ThemeSettings.vue` 是主题设置页：按 `THEME_SETTING_GROUPS` 渲染分组与控件，草稿态与「保存到本机 / 复制配置 JSON」的落盘逻辑都在这里。**不要在主题内直接写后端**：`POST /api/theme_options` 只认 `Authorization: Bearer <JWT>`，而 `cfsm_auth` Cookie 是 HttpOnly 且仅用于 WebSocket 鉴权，主题拿不到 JWT；站点级预设统一走「复制 JSON → 粘贴到后台」。
- `LoadChart.vue` 数据源为 `GET /api/history/all`；查询时长只能取 `0.167 / 0.5 / 1 / 6 / 12 / 24 / 48 / 96 / 168` 小时（最长 7 天），未登录超过 24 小时会返回 401。
- `InstanceDetail.vue` 上半部分的信息卡片必须与原主题 komari-theme-naive 保持同一套 2×2 栅格：`硬件信息` 与 `系统信息` 并排、各自**填满 2 行（各 4 项）**，`存储信息`（3 项 / 3 列）与 `网络信息`（2 项 / 2 列）各自 1 行。栅格会把同行的卡片拉伸到等高，**项数不等就会在较矮的那张卡片底部留下大片空白**——这正是详情页「凌乱」的成因，增删信息项时必须成对考虑。CFSM 不提供虚拟化信息，故 `硬件信息` 只有 3 项。
- `PingChart.vue` 数据源为 `GET /api/history/all`：历史行本身携带全部 8 条线路（`ping_ct/cu/cm/bd` + `ping_node_1..4` 及对应 `loss_*`），因此按所选档位（**1 / 6 / 12 / 24 小时**，固定四档）取真实历史，一行即一个图表点。`/api/servers` 的 `ping_window` / `loss_window` 已不再被消费。线路显示名取站点配置的 `custom_*_name` 与 `node_*_name`。
- **线路是 8 条，不只是三网**：`latencyHelper` 的 `LATENCY_LINE_KEYS` = `ct/cu/cm/bd/node1..node4`，`taskId` 0-3 为三网+BGP、4-7 为后台「自定义节点 1-4」。新增展示位时不要只遍历前三条，否则后台配了自定义节点的机器（如自建东京节点）会整条不显示。显示名缺省回落 `CT/CU/CM/BGP/Node 1-4`。
- 延迟/丢包取值语义：`false` 表示未配置或未取样（不显示）、`null` 表示探测超时、数值 `0`（含 0% 丢包）是有效数据必须显示。
- **禁止用 `?? false` / `|| false` 兜底延迟或丢包取值**：`null ?? false` 会把「探测超时」降级成「未配置」并被直接丢弃，导致超时点在图表中消失、丢包率恒为 0。取窗口点必须走 `latencyHelper` 的 `pickLineValue`，收集线路走 `collectLatencyLines`。
- 展示口径统一走 `latencyHelper`：分级阈值（延迟 `<100` / `<200` / `≥200` ms，丢包 `≤1%` / `≤10%` / `>10%`）、颜色、格式化文本都从该模块取，不要在组件里另写一套。
- **首页卡片与列表展示的丢包是「近 30 分钟平均」，延迟仍是瞬时值**：`/api/servers` 给的 `loss_*` 只代表最近一次探测轮次，单轮抽风就能跳到 50%，所以 `init.ts` 会逐台拉 `GET /api/history/all?hours=0.5`（`LOSS_AVERAGE_HOURS`）经 `averageLoss()` 折算成 `NodeData.loss_avg`，`summarizeLatency` 优先用它、**逐线路**回落到 `loss_rate` 标量（新机器还没有窗口样本时不至于整条消失）。刷新节奏：首屏一次 + 页面重新可见 + 「启用实时推送」开启时每 5 分钟一次（`LOSS_AVERAGE_REFRESH_MS`），只拉「配了线路且已过期」的机器，失败静默。延迟不做平均（用户明确要求）。
- 延迟/丢包的渲染点：`PingChart` 的区间统计卡片与趋势曲线（四档 1/6/12/24 小时）、`NodeCard` 的延迟行（三网逐线**内联**并排，形如 `电信 · 55ms | 联通 · 44ms`，延迟数字按**丢包率**着色，丢包数字走悬浮提示）、`NodeList` 的 `latency` 列（概览取最差线路，逐线明细在 tooltip 中展开，需 `showThreeNetDetails` 开启）。
- 卡片延迟数字的着色以丢包率为准（`latencyColorByLoss`）：丢包未配置时才退回延迟自身分级。
- 图表里 `null`（超时）是断点，**不得被 EWMA 或线性插值填补**；`PingChart` 的 `chartData` 每轮变换后都会按 `timeoutCells`（`行下标:线路id`）还原超时点。
- **不要把内容整体包进 `NSpin` 后又依赖 Naive 的 CSS 变量**：naive-ui 的 spin 主题把 `--n-color` 与 `--n-text-color` **都设为主色**（`spin/styles/light`：`color` / `textColor` 默认取 `primaryColor`），会顺着继承污染整个子树；而 NSpin 不定义 `--n-text-color-1/2/3`，导致 `var(--n-text-color-N)` 整条声明失效、回落到主色。后果：玻璃卡片（用 `var(--n-color)`）被染成主色、正文变主色。`PingChart` 的解法是在 `content-class` 上挂自有类名，用 `:deep(...)` + `!important`（NSpin 的变量是行内样式，普通规则盖不过）把这几档变量还原成 `--ping-text-*` / `--ping-surface`。新增用 `NSpin` 包裹的组件时要照此处理。
- 组件内自有的 CSS 变量统一用 `--ping-*` / `--load-*` 之类前缀，并在根元素上从 `useThemeVars()` 取值注入；**不要在 `NSpin` 子树里依赖 `--n-*` 的继承值**。

## Naive UI globals

- Provider 设置位于 `@/components/Provider.vue`。
- 全局 API 暴露在 `window.$message`、`window.$dialog`、`window.$notification`、`window.$loadingBar`、`window.$modal`，类型见 `src/types/global.d.ts`；provider 全局变动时同步该文件。

## Validation

```bash
pnpm lint
pnpm build
```
