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

- Mobile：单列卡片、纵向堆叠的工具栏、紧凑的总览行。
- Tablet：按配置的最小卡片宽度 auto-fill。
- Desktop：总览与节点卡片在 `maxPageWidth` 内扩展；信息密度由主题配置控制。

## 8. Architecture after the port

- **Wire 类型与 view model 分离**：`src/types/cfsm.ts` 只描述后端真实返回的结构；
  `src/stores/nodes.ts` 的 `NodeData` 是页面使用的 view model。
- **适配层保留旧字段名**：`adaptServer` 把 CFSM 的 `Server` 映射到 `NodeData`，并刻意沿用移植前的字段名
  （例如 `mem_total` 承载 `ram_total`、`net_in` 承载 `net_in_speed`），以把改动集中在数据层、避免
  组件大面积重写。字段注释标注了映射关系；CFSM 独有数据以新字段追加。
- **增量合并在 store 内完成**：WebSocket 的 `batchUpdate` 样本是增量字段，`mergePatch` 逐字段判断
  「存在才覆盖」，避免缺失字段把已有值抹掉。
- **多站是一等公民**：每个 `apiBase` 独立请求、独立 WebSocket 连接，统计与区域数据按后端分别保存后再聚合。
- **鉴权集中在 `CfsmAuth`**：Cookie / JWT / Turnstile 凭证三种来源由 `utils/init.ts` 组装，
  组件不感知鉴权细节。

## 9. Accepted debt

- 延迟图表只能展示近 `latency_window.hours` 小时的窗口数据（CFSM 没有延迟历史接口），
  时间范围选择器已相应收敛。
- `theme_options` 是自由对象，部分复杂配置（如列宽）仍以 JSON 字符串承载，解析保持防御式。
- 仓库不含独立的组件展示页，首页本身就是各组件的状态演练场。
- 亮色高对比变体保留不透明配色；玻璃变体刻意使用共享的 Naive 主题变量与 `color-mix()`，
  使其色调既区别于默认卡片，又能随背景变化响应。
- 少数来自原主题的字段（`temp`、`virtualization`、`remark`）在 CFSM 无数据来源，保留为占位但不在 UI 中展示。
