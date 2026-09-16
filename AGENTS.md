# AGENTS.md

Repo guide for `cfsm-theme-naive`.

## What this repo is

- 面向 **CF-Server-Monitor（CFSM）** 的第三方主题：Vue 3 + Vite + Naive UI + UnoCSS + ECharts
- 由 `komari-theme-naive` 移植而来，**后端契约与 Komari 完全不同**（见下方「CFSM 硬性约束」）
- 构建产物只有 `index.html` 与 `assets/`，提交到 [huilang-me/CFSM-Theme-Store](https://github.com/huilang-me/CFSM-Theme-Store)
- 接口规范以 CF-Server-Monitor 官方「第三方主题开发 API 文档」为准（该文档不在本仓库内）

## Root structure

- `src/` 主题运行时源码
- `src/assets/` 需要打进 `assets/` 的静态资源（数字字体、favicon）
- `vite.config.ts` 构建配置（`base: './'`、`publicDir: false`，不再打包 zip）
- `package.json` / `pnpm-workspace.yaml` 依赖与脚本（依赖统一走 pnpm catalog）
- `README.md` 项目说明与 `theme_options` 键名约定
- `DESIGN.md` 移植后的架构与设计取舍

## Root commands

```bash
pnpm dev        # 本地开发
pnpm build      # type-check + 生产构建
pnpm preview    # 预览产物
pnpm lint       # oxlint + eslint（带 --fix）
```

- `pnpm build` 等价于 `run-p type-check build-only`：类型检查不通过则整体失败
- 本仓库没有测试套件，不要臆造 `pnpm test` 或 Vitest 命令

## 构建与产物约定

- 产物固定为 `dist/index.html` + `dist/assets/`
- **不要**把运行期资源放进 `public/`：`publicDir: false` 已关闭复制，主题目录只允许 `index.html` 与 `assets/`
- 需要随产物发布的资源放在 `src/assets/`，通过 import 或 CSS `url()` 引用
- 旗帜与 OS 图标由 CFSM 默认皮肤提供（`/flags/<code>.svg`、`/os-icons/<filename>`），**不得打包进主题**
- 路由必须使用 hash（`/#/`、`/#/server/:id`）
- 页脚必须展示 `Powered by CF-Server-Monitor` 并链接到项目主页

## CFSM 硬性约束（来自官方主题开发文档）

- 管理后台固定由内置默认主题接管：主题内只能跳转 `/admin#admin`，**不得实现管理页，也不得实现登录页**
- 站点标题、背景图、自定义 `<head>`、自定义脚本、CSP 由用户后台外观设置控制，主题不要写死
- 详情页必须使用 `GET /api/server?id=` + `wss://.../api/ws?subscribe=<id>`，不得拉全量列表后在前端过滤
- `subscribe=all` 建连后必须显式发送 `{ type: 'subscribe', scope: 'all', ids }`，否则收不到任何更新
- 页面隐藏时应主动断开 WebSocket，恢复时先补一次 REST 再重连
- 主题不可用时应暴露加载错误，不要静默跳转到其他页面
- 主题配置读写走 `GET /api/config` 的 `theme_options` 与 `POST /api/theme_options`（后者需要 JWT）

## Where to look

- `src/types/cfsm.ts` 后端 wire 类型（唯一来源）
- `src/utils/cfsmApi.ts` REST 客户端；`src/utils/cfsmWs.ts` WebSocket 订阅管理器；`src/utils/turnstile.ts` 人机验证
- `src/utils/init.ts` 启动编排（config → Turnstile → servers → WebSocket）
- `src/stores/app.ts` 站点配置与 `theme_options` 解析；`src/stores/nodes.ts` 节点数据与字段适配
- `src/utils/osImageHelper.ts` OS 图标映射（文件名须与 CFSM `public/os-icons` 一致）

## Conventions

- 使用 `pnpm`，不要用 npm 或 yarn
- 保留 `vite.config.ts` 中的 `@` → `src` 别名
- `theme_options` 是自由对象且后端不校验类型：读取必须走 `src/stores/app.ts` 中的 `optString/optBool/optNumber/optEnum/optJson` 防御式辅助函数
- 不要在组件内直接 fetch、建 WebSocket 或重复解析 `theme_options`；统一走 store 与 `@/utils/*`
- 根目录验证方式是 `pnpm lint` + `pnpm build`，不是测试

## Anti-patterns

- 不要在 `public/` 下新增运行期资源，也不要把 `publicDir` 改回默认值
- 不要把路由改回 history 模式
- 不要恢复 `/images/flags/...`、`/images/logo/...` 之类的旧资源路径
- 不要在主题内实现管理页或登录页
- 不要把 `theme_options` 的解析散落到组件中
- 不要在本文件堆砌框架通用建议（那属于 `src/AGENTS.md`）

## Child guides

- `src/AGENTS.md` 适用于 `/src` 子树的全部规则
