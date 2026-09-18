# CFSM Naive Design System

> 本文描述移植到 CF-Server-Monitor 之后的设计系统与架构取舍。
> 视觉语言继承自 komari-theme-naive（Naive UI 的克制配色与中性界面），数据与鉴权层已按 CFSM 重写。

## 1. Direction

CFSM Naive 是一个安静的运维看板。保留 Naive UI 克制的绿色强调色、中性表面、细边框、紧凑排版，以及可选
的半透明背景处理。优化目标始终是**加快扫读、提高信息密度**，而不是把监控页做成装饰性落地页。

原主题中参考自同类主题的分组汇总与紧凑层级设计予以保留；其地球、访客、财务等装饰性模块不纳入本主题范围。

## 2. Foundations

- Color：文本、边框、表面、success/error/info/primary 一律使用 Naive UI 主题变量；自定义表面用
  `color-mix()` 从这些变量派生。
- Typography：正文使用配置的 `fontFamily`，数值使用 `numberFontFamily`。标题 18px，卡片主值 13px，
  元信息 12px，辅助数值 10px。
- Spacing：4px 基准。页面内边距 16px；卡片网格间距按 `compact`/`comfortable`/`spacious` 取
  12/16/20px。Naive 卡片内容内边距使用 12px/14px（紧凑）与 20px/22px（宽松），使文本与图标周围的
  水平留白在视觉上保持平衡。
- Radius：继承配置的 Naive UI 圆角，不引入额外的圆角体系。
- Depth：边框是首选的分隔手段。启用自定义背景后，卡片切换为半透明、随背景变化的玻璃表面；
  背景模糊与卡片背板模糊是两个独立参数，卡片模糊半径为 0 时仍保持半透明玻璃材质。

## 3. Layout

- 页头、总览、筛选器与节点集合共用同一个页面容器。
- 节点工具栏在同一行内保持分组 Tab、搜索与视图切换，不重复页面级的节点状态信息。
- 总览数值跟随当前选中的分组，而文本搜索只收窄其下方的节点集合。
- 卡片网格使用 auto-fill + 主题配置的最小宽度；绝不允许出现横向滚动。
- 移动端使用单列，工具栏控件下移到标题下方。

## 4. Motion

- 悬停、路由切换与展开沿用 200ms 过渡语言。
- 实时图表使用较短的线性更新过渡，使新到达的采样点可追踪；历史图表不持续动画。
- 动效只用于表达交互与状态变化，并全局尊重 `prefers-reduced-motion`。

## 5. Primitives and states

- `GlassSurface`：自定义背景启用时生效，色调取自当前 Naive 表面色，透出背景，并使用独立配置的卡片模糊半径。
- `SummaryCard`：默认 / 亮色高对比 / 玻璃三种状态。
- `NodeToolbar`：分组 Tab、单图标宽度并在聚焦时展开的搜索框、卡片/列表切换位于同一行；移动端展开的搜索框浮于 Tab 之上。
- `NodeCard`：在线/离线，紧凑/舒适/宽松，默认/亮色高对比/玻璃。
- `MetricBlock`：CPU、内存、磁盘、流量；被隐藏的指标不得留下空格子。
- `TelemetryChart`：紧凑卡片头、格式化坐标轴与十字准星标签、克制的线/面处理、实时与历史两种状态。
- `LatencyChart`：页面与弹窗两种密度；时长选择、紧凑任务选择器、必要操作，以及带边框的趋势画布。
- `StatusBadge`：在线脉冲与离线静态状态。
- `OfflineStatus`：保留标题，对卡片施加克制的错误色光晕，并用离线状态与最后上报时间遮罩内容区。

## 6. Accessibility

- 仅图标的控件必须有可访问名称与可见焦点行为（由 Naive UI 提供）。
- 文本与状态不能只依赖颜色；离线状态包含明确的文字说明。
- 中文标签保持简短，避免逐字换行。
- 触控目标不小于 32px，并保留足够的外围间距。

## 7. Responsive behavior

- 断点统一取 **640px**（`MOBILE_BREAKPOINT_PX`），与 UnoCSS `sm` 及各组件媒体查询一致。
- Mobile：单列卡片、纵向堆叠的工具栏、紧凑的总览行；内容宽度受 `maxPageWidthMobile` 约束
  （默认 `100%`，即不做限制）。
- Tablet：按配置的最小卡片宽度 auto-fill。
- Desktop：总览与节点卡片在 `maxPageWidth` 内扩展；信息密度由主题配置控制。
- 页面容器宽度由 `usePageContainer` 统一给出，页头 / 内容区 / 页脚共用同一份判定，
  避免三处各自维护阈值而在临界视口上错位。

## 8. Architecture after the port

- **Wire 类型与 view model 分离**：`src/types/cfsm.ts` 只描述后端真实返回的结构；
  `src/stores/nodes.ts` 的 `NodeData` 是页面使用的 view model。
- **适配层保留旧字段名**：`adaptServer` 把 CFSM 的 `Server` 映射到 `NodeData`，并刻意沿用移植前的字段名
  （例如 `mem_total` 承载 `ram_total`、`net_in` 承载 `net_in_speed`），以把改动集中在数据层、避免
  组件大面积重写。字段注释标注了映射关系；CFSM 独有数据以新字段追加。
- **增量合并在 store 内完成**：WebSocket 的 `batchUpdate` 样本是增量字段，`mergePatch` 逐字段判断
  「存在才覆盖」，避免缺失字段把已有值抹掉。
- **容量单位在数据层归一化为字节**：CFSM 以 **MB** 上报 `ram_total` / `ram_used` / `swap_total` /
  `swap_used` / `disk_total` / `disk_used`，而格式化函数（`formatBytes*`）与组件层统一按字节处理。
  因此 `adaptServer`、`mergePatch` 与 `LoadChart` 的 `historyRowToRecord` 都必须经
  `utils/helper` 的 `mbToBytes` / `mbToBytesOrNull` 换算；否则容量会按「字节」解释而显示成
  原先的百万分之一（如 8 GB 显示为 8 KB）。网络累计量与速率字段本就是字节 / B/s，不需要换算。
- **延迟与丢包的口径集中在 `latencyHelper`**：三态语义（`false` 未配置 / `null` 探测超时 /
  `number` 有效值）必须原样贯穿数据层到展示层，取窗口点走 `pickLineValue`、取 REST/历史行走
  `pickServerLineValue`、汇总走 `summarizeLatency`、分级与配色走 `latencyBadge` / `lossBadge`。
  概览取**最差线路**而非最优，避免用一个好看的数值掩盖单条线路劣化；只要有线路超时就优先显示「超时」。
  探测超时在图表中是**必须保留的断点**，不允许被 EWMA 或线性插值填补成看似正常的延迟值。
- **首页与列表的丢包取「近 30 分钟平均」，延迟保持瞬时**：`/api/servers` 的 `loss_*` 是最近一轮的
  读数（单轮掉包即跳到 50%），因此 `init.ts` 逐台拉 30 分钟历史并由 `averageLoss()` 折算成
  `NodeData.loss_avg`，`summarizeLatency` 优先用它、逐线路回落标量。平均值只用于**丢包**；
  延迟不做平滑，避免掩盖瞬时劣化。窗口常量 `LOSS_AVERAGE_HOURS`，刷新节流 5 分钟且跟随
  「启用实时推送」开关。
- **延迟曲线取真实历史**：`/api/history/all` 的历史行本身携带 `ping_ct/cu/cm/bd` 与
  `loss_ct/cu/cm/bd`，因此 `PingChart` 直接按所选档位（1 / 6 / 12 / 24 小时）拉取历史，
  一行即一个图表点（无需再按任务分桶归并），丢包率也取自实测 `loss_*` 而非超时点占比推算。
- **多站是一等公民**：每个 `apiBase` 独立请求、独立 WebSocket 连接，统计与区域数据按后端分别保存后再聚合。
- **鉴权集中在 `CfsmAuth`**：Cookie / JWT / Turnstile 凭证三种来源由 `utils/init.ts` 组装，
  组件不感知鉴权细节。
- **跨域资源必须服从站点 CSP**：CFSM 会对主题 HTML 下发 `Content-Security-Policy`，默认只放行
  `'self'`、`challenges.cloudflare.com` 与 Google Fonts，其余来源要靠后台的 `csp_static` 设置。
  因此 `index.html` 里**不得硬编码跨域资源**，否则会被拦截并在控制台报错。确需加载的跨域资源
  走 `utils/webFont.ts` 的模式：先读取本文档实际生效的 CSP（meta + 响应头取交集），
  **放行才注入、无法判定就不加载**，且不抛错、不阻塞渲染。
- **正文字体 MiSans VF 按策略条件加载**：MiSans 的许可协议禁止二次分发字体文件，故不能自托管，
  只能引用小米官方 CDN。默认策略下不加载，`fontFamily` 字体栈回落到 `sans-serif`；
  管理员把 `https://cdn-font.hyperos.mi.com` 与 `https://cdn-file.hyperos.mi.com` 加入
  `csp_static` 后即自动启用。数值字体 `TCloud Number VF` 无此限制，仍随产物自托管。
- **主题设置是三级合并，且只有一条读取路径**：CFSM 的第三方主题不能调用管理端接口，
  `/api/config` 的 `theme_options` 对主题只读，因此设置按「主题默认值 ← 后端预设 ← 本机覆盖」合并，
  由 `utils/themeSettings` 的 `resolveThemeSettings` 统一解析，`stores/app` 只暴露解析结果。
  组件一律读 `appStore` 的 computed，**不得直接读 `theme_options`**，否则本机设置不会生效。
  - 本机覆盖只记录**相对后端预设改过的键**（`diffThemeSettings`），站长日后更新预设时，
    访客没碰过的设置仍会跟着走；而不是把整份快照钉死在浏览器里。
  - 数组 / 对象类配置（`cardMetrics`、`listViewColumns`、`listColumnWidths`…）在线格式上是
    JSON 字符串（与 komari 一致），内部解析为原生形态，导出时再序列化回去，保证可双向搬运。
  - 写回站点级配置**不通过接口**：`POST /api/theme_options` 只认 `Authorization: Bearer`，
    而 `cfsm_auth` Cookie 是 HttpOnly 且仅用于 WebSocket 鉴权，主题读不到 JWT。站点级预设统一
    走「复制配置 JSON → 粘贴到管理后台」，不在主题内做半可用的写入口。
- **设置页的清单是数据，不是模板**：`THEME_SETTING_GROUPS` 声明分组、键、控件类型、默认值与
  依赖关系，`ThemeSettings.vue` 只按 `kind` 渲染。增删设置项改清单即可，避免键名与默认值散落两处。

## 9. Accepted debt

- `theme_options` 是自由对象，部分复杂配置（如列宽）仍以 JSON 字符串承载，解析保持防御式。
- 仓库不含独立的组件展示页，首页本身就是各组件的状态演练场。
- 亮色高对比变体保留不透明配色；玻璃变体刻意使用共享的 Naive 主题变量与 `color-mix()`，
  使其色调既区别于默认卡片，又能随背景变化响应。
- 少数来自原主题的字段（`temp`、`virtualization`、`remark`）在 CFSM 无数据来源，保留为占位但不在 UI 中展示。
- `NodeData` 仍保留 `ping_window` / `loss_window`（`/api/servers` 的近 2 小时窗口）。
  自延迟曲线改用 `/api/history/all` 后，两者在 UI 中已无消费方，仅作为 wire 契约保留。
