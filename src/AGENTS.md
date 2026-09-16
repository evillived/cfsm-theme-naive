# Source Tree Guide

本文件仅适用于 `/src`。保持现有的 Vue 3 + Vite + Pinia + Naive UI 结构。

## Core architecture

- `main.ts` 仅负责引导：创建 app、安装 Pinia 与 router、加载全局样式、挂载 `App.vue`。不要把业务逻辑放进引导流程。
- `App.vue` 是外壳：全局布局、启动生命周期、加载过渡、`KeepAlive`，并调用 `@/utils/init` 的 `initApp()` 与 `destroyInitManager()`。
- `src/router/index.ts` 使用 **hash 路由**，仅两条：
  - `/#/` → `@/views/HomeView.vue`
  - `/#/server/:id` → `@/views/InstanceDetail.vue`
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
- `@/stores/app`：站点配置（`/api/config`）、`theme_options` 解析、主题模式与后台 `preferred_theme`、布局与格式化偏好、持久化 UI 状态。
- `@/stores/nodes`：节点 view model（`NodeData`）、`adaptServer` 字段适配、`mergePatch` WebSocket 增量合并、多站 stats/regionStats/sysConfig 聚合、在线状态兜底。
- `NodeData` 沿用了移植前的字段名以降低组件改动量（例如 `mem_total` 承载 CFSM 的 `ram_total`），字段注释标注了映射关系；CFSM 独有数据以新字段追加（`ping_window`、`loss_window`、`ping_latency`、`disk_io`、`net_*_monthly` 等）。
- CFSM 公共接口不提供的数据（`temp`、`virtualization`、`remark`）恒为空/0，**不要在 UI 中展示**。
- 依赖 `theme_options` 的行为必须遵循 `@/stores/app` 中既有的防御式模式：`typeof` 判断、受控 `JSON.parse`、合法值过滤、默认值兜底。

## Utils

- `cfsmApi.ts` REST 客户端；`cfsmWs.ts` 订阅管理器（订阅过滤、增量归一化、心跳、重连、可见性挂起、`frontend_ws_timeout_minutes` 超时）；`turnstile.ts` 人机验证
- `init.ts` 启动与实时链路编排
- `helper.ts` 格式化；`recordHelper.ts` 时间序列整形；`osImageHelper.ts` / `regionHelper.ts` / `tagHelper.ts` 查找
- 视图与组件必须复用这些 helper，不要重复实现解析、格式化、查找或传输逻辑

## Components

- 组件只渲染 UI，数据来自 store 或 `@/utils/*`。
- `NodeCard.vue`、`NodeList.vue`、`NodeGeneralCards.vue`、`LoadChart.vue`、`PingChart.vue` 保持展示聚焦，并继续用 `defineAsyncComponent` 懒加载。
- `LoadChart.vue` 数据源为 `GET /api/history/all`；查询时长只能取 `0.167 / 0.5 / 1 / 6 / 12 / 24 / 48 / 96 / 168` 小时（最长 7 天），未登录超过 24 小时会返回 401。
- `PingChart.vue` 数据源为 `/api/servers` 返回的近 `latency_window.hours` 小时窗口（CFSM 没有延迟历史接口），任务固定为三网 `ct / cu / cm / bd`，显示名取站点配置的 `custom_*_name`。
- 延迟/丢包取值语义：`false` 表示未配置或未取样（不显示）、`null` 表示探测超时、数值 `0` 是有效数据必须显示。

## Naive UI globals

- Provider 设置位于 `@/components/Provider.vue`。
- 全局 API 暴露在 `window.$message`、`window.$dialog`、`window.$notification`、`window.$loadingBar`、`window.$modal`，类型见 `src/types/global.d.ts`；provider 全局变动时同步该文件。

## Validation

```bash
pnpm lint
pnpm build
```
