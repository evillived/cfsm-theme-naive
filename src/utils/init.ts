/**
 * 应用初始化模块
 *
 * CFSM 的数据链路与 Komari 不同，初始化流程为：
 * 1. `GET /api/config`（逐 apiBase）→ 站点配置与主题运行时参数
 * 2. 站点启用全局 Turnstile 且当前未通过验证时，先取得一次性 token，
 *    换取可复用 1 小时的 `turnstile_verified` 凭证
 * 3. `GET /api/servers`（逐 apiBase）→ 服务器列表与统计
 * 4. `GET /api/history/all`（逐服务器）→ 折算「近 30 分钟平均丢包」，供首页卡片与列表使用
 * 5. `/api/ws` 订阅增量推送：列表页 `subscribe=all`（并提交 ids），详情页 `subscribe=<id>`
 */

import type { LatencySet } from '@/stores/nodes'
import type { SiteConfig } from '@/types/cfsm'
import type { CfsmAuth } from '@/utils/cfsmApi'
import type { CfsmSubscribe } from '@/utils/cfsmWs'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { CfsmApiError, getSharedApi } from '@/utils/cfsmApi'
import { CfsmWsManager } from '@/utils/cfsmWs'
import { averageLoss, LOSS_AVERAGE_HOURS } from '@/utils/latencyHelper'
import { requestTurnstileToken } from '@/utils/turnstile'

/** 在线状态兜底刷新间隔（毫秒） */
const ONLINE_REFRESH_INTERVAL_MS = 60_000

/**
 * 平均丢包的重新拉取间隔（毫秒）。
 *
 * 展示的是 30 分钟窗口的平均值，本身变化很慢，5 分钟刷新一次足够，
 * 也避免了每台机器一条历史请求被反复打出（窗口内的样本由后端持续写入）。
 */
const LOSS_AVERAGE_REFRESH_MS = 5 * 60 * 1000

/** 平均丢包的并发上限：一次最多同时拉几台机器的历史 */
const LOSS_AVERAGE_CONCURRENCY = 4

/** 初始化状态管理 */
class InitManager {
  private readonly api = getSharedApi()
  private readonly appStore = useAppStore()
  private readonly nodesStore = useNodesStore()

  private ws: CfsmWsManager | null = null
  private onlineTimer: ReturnType<typeof setInterval> | null = null
  private lossTimer: ReturnType<typeof setInterval> | null = null
  private lossLoading = false
  private visibilityHandler: (() => void) | null = null

  private isInitialized = false
  /** 非公开站点的 JWT；同域部署依赖 cfsm_auth Cookie，此处留空 */
  private token: string | null = null
  /** Turnstile 已验证凭证，1 小时内可复用 */
  private turnstileVerified: string | null = null

  /** 组装当前请求所需的鉴权信息 */
  private auth(extra?: CfsmAuth): CfsmAuth | undefined {
    const auth: CfsmAuth = { ...extra }
    if (this.token)
      auth.token = this.token
    if (this.turnstileVerified)
      auth.turnstileVerified = this.turnstileVerified

    return auth.token || auth.turnstileVerified || auth.turnstileToken ? auth : undefined
  }

  /**
   * 执行初始化流程
   */
  async init(): Promise<void> {
    if (this.isInitialized) {
      console.warn('[InitManager] 已经初始化，忽略重复调用')
      return
    }

    try {
      const config = await this.fetchSiteConfig()
      await this.passTurnstileIfNeeded(config)

      await this.fetchServers()

      this.appStore.loading = false
      this.appStore.connectionError = false

      this.startRealtime(this.allSubscribe())
      this.startOnlineTimer()
      this.observeVisibility()
      void this.fetchLossAverages()

      this.isInitialized = true
    }
    catch (error) {
      this.reportError(error)
      this.appStore.loading = false
    }
  }

  /**
   * 站点启用全局 Turnstile 且当前请求未通过验证时，走一次人机验证并缓存凭证。
   * 公开站点或未启用 Turnstile 时不做任何事。
   */
  private async passTurnstileIfNeeded(config: SiteConfig): Promise<void> {
    if (!config.turnstile_enabled || config.verified)
      return

    const token = await requestTurnstileToken(config.turnstile_site_key)
    if (!token)
      return

    // 带上一次性 token 重新请求，响应中会给出可复用的已验证凭证
    const verifiedConfig = await this.fetchSiteConfig({ turnstileToken: token })
    this.turnstileVerified = verifiedConfig.turnstile_verified ?? null
  }

  /** 列表页订阅：订阅全部服务器，但每个后端只提交它自己返回的 ids */
  private allSubscribe(): CfsmSubscribe {
    return {
      scope: 'all',
      resolveIds: apiBase => this.nodesStore.resolveIdsForBase(apiBase),
    }
  }

  /**
   * 获取站点配置（`GET /api/config`）。
   * 多站模式下以第一个成功响应的后端作为站点信息与主题参数的来源。
   */
  private async fetchSiteConfig(extra?: CfsmAuth): Promise<SiteConfig> {
    const auth = this.auth(extra)
    const results = await Promise.allSettled(
      this.api.apiBases.map(apiBase => this.api.getConfig(apiBase, auth)),
    )

    const succeeded = results.find(
      (result): result is PromiseFulfilledResult<SiteConfig> => result.status === 'fulfilled',
    )

    if (!succeeded)
      throw new Error('无法获取站点配置')

    this.appStore.setSiteConfig(succeeded.value)
    this.ws?.setTimeoutMinutes(succeeded.value.frontend_ws_timeout_minutes ?? 0)
    return succeeded.value
  }

  /**
   * 获取服务器列表（`GET /api/servers`），逐后端应用，某个后端失败不影响其他后端。
   */
  private async fetchServers(): Promise<void> {
    const auth = this.auth()
    const results = await Promise.allSettled(
      this.api.apiBases.map(async apiBase => ({ apiBase, data: await this.api.getServers(apiBase, auth) })),
    )

    let firstError: unknown
    let hasSuccess = false

    for (const result of results) {
      if (result.status === 'fulfilled') {
        this.nodesStore.applyListResponse(result.value.apiBase, result.value.data)
        hasSuccess = true
      }
      else if (firstError === undefined) {
        firstError = result.reason
      }
    }

    if (!hasSuccess)
      throw firstError ?? new Error('无法获取服务器列表')
  }

  /**
   * 拉取「近 `LOSS_AVERAGE_HOURS` 平均丢包」，写入 nodes store 供首页卡片与列表使用。
   *
   * 为什么需要单独拉历史：`/api/servers` 只给**最近一轮**的丢包标量，单轮抽风就能跳到 50%，
   * 卡片读数会一直跳；历史行里才有窗口内的全部样本。平均窗口是 30 分钟，所以按
   * `LOSS_AVERAGE_REFRESH_MS` 重新拉即可，不必更频繁。
   *
   * 只拉「配了线路」且「已过期」的机器；失败静默（丢包显示回落标量，不影响其它功能）。
   */
  private async fetchLossAverages(): Promise<void> {
    if (this.lossLoading || document.visibilityState === 'hidden')
      return

    const targets = this.nodesStore.lossAverageTargets(LOSS_AVERAGE_REFRESH_MS)
    if (targets.length === 0)
      return

    this.lossLoading = true
    try {
      const auth = this.auth()
      const collected: Record<string, LatencySet> = {}

      for (let i = 0; i < targets.length; i += LOSS_AVERAGE_CONCURRENCY) {
        const batch = targets.slice(i, i + LOSS_AVERAGE_CONCURRENCY)
        const results = await Promise.allSettled(
          batch.map(target => this.api.getHistory(target.apiBase, target.uuid, LOSS_AVERAGE_HOURS, auth)),
        )
        results.forEach((result, index) => {
          const target = batch[index]
          if (target && result.status === 'fulfilled')
            collected[target.uuid] = averageLoss(result.value)
        })
      }

      this.nodesStore.applyLossAverage(collected)
    }
    catch (error) {
      // 平均值只是展示增强：失败就继续用标量，不弹错误也不进连接错误状态
      console.warn('[InitManager] 平均丢包拉取失败，继续使用标量:', error)
    }
    finally {
      this.lossLoading = false
    }
  }

  /** 页面重新可见时补一次 REST 数据（WebSocket 由 CfsmWsManager 自行恢复） */
  private observeVisibility(): void {
    if (this.visibilityHandler)
      return

    this.visibilityHandler = () => {
      if (document.visibilityState !== 'visible' || !this.isInitialized)
        return
      void this.refreshServers()
      // 标签页在后台待久了，平均丢包可能已过期（过期判断在 store 里，没过期不会发请求）
      void this.fetchLossAverages()
    }
    document.addEventListener('visibilitychange', this.visibilityHandler)
  }

  /** 启动或切换实时订阅 */
  private startRealtime(subscribe: CfsmSubscribe): void {
    // 「启用实时推送」关闭时只保留 REST 首屏数据，可显著降低后端额度消耗
    if (!this.appStore.enableRealtime) {
      this.pauseRealtime()
      return
    }

    // 平均丢包是定时重新拉取的，关掉实时推送时一并停掉（与「省额度」的意图一致）
    this.startLossTimer()

    if (!this.ws) {
      this.ws = new CfsmWsManager({
        api: this.api,
        frontendWsTimeoutMinutes: this.appStore.frontendWsTimeoutMinutes,
        callbacks: {
          onSample: (serverId, patch, ts) => this.nodesStore.applySample(serverId, patch, ts),
          onStateChange: state => this.nodesStore.updateWsState(state),
          onConnectError: () => window.$message?.error('实时连接建立失败，正在尝试重连。'),
          onTimeout: () => this.handleRealtimeTimeout(),
        },
      })
      this.ws.setToken(this.token)
      this.ws.connect(subscribe)
      return
    }

    this.ws.setTimeoutMinutes(this.appStore.frontendWsTimeoutMinutes)
    this.ws.setSubscribe(subscribe)
  }

  /**
   * 单次连接达到 `frontend_ws_timeout_minutes` 后询问用户是否继续。
   * 选择「停止」时保持断开且不静默重连。
   */
  private handleRealtimeTimeout(): void {
    this.nodesStore.updateWsState('disconnected')
    window.$dialog?.warning({
      title: '实时连接已超时',
      content: '为节省后端额度消耗，实时推送连接已达到站点配置的时长上限。是否继续接收实时数据？',
      positiveText: '继续',
      negativeText: '停止',
      onPositiveClick: () => {
        this.ws?.restart()
      },
    })
  }

  /** 按 5 分钟阈值兜底刷新在线状态 */
  private startOnlineTimer(): void {
    if (this.onlineTimer)
      return
    this.onlineTimer = setInterval(() => {
      this.nodesStore.recomputeOnlineState()
    }, ONLINE_REFRESH_INTERVAL_MS)
  }

  /** 定时刷新平均丢包（30 分钟窗口变化很慢，5 分钟一次足够） */
  private startLossTimer(): void {
    if (this.lossTimer)
      return
    this.lossTimer = setInterval(() => {
      void this.fetchLossAverages()
    }, LOSS_AVERAGE_REFRESH_MS)
  }

  private stopLossTimer(): void {
    if (!this.lossTimer)
      return
    clearInterval(this.lossTimer)
    this.lossTimer = null
  }

  /** 详情页：切换为单服务器订阅，降低后端推送量与额度消耗 */
  subscribeServer(serverId: string): void {
    this.startRealtime({ scope: 'server', serverId })
  }

  /** 列表页：恢复全量订阅 */
  subscribeAll(): void {
    this.startRealtime(this.allSubscribe())
  }

  /** 断开实时推送（关闭「启用实时推送」时调用） */
  pauseRealtime(): void {
    this.stopLossTimer()
    if (!this.ws)
      return
    this.ws.destroy()
    this.ws = null
    this.nodesStore.updateWsState('disconnected')
  }

  /** 补一次全量 REST 数据 */
  async refreshServers(): Promise<void> {
    try {
      await this.fetchServers()
      this.appStore.connectionError = false
    }
    catch (error) {
      this.reportError(error)
    }
  }

  /** 统一的错误上报：区分未授权、人机验证与普通网络错误 */
  private reportError(error: unknown): void {
    console.error('[InitManager] 初始化失败:', error)
    this.appStore.connectionError = true

    if (error instanceof CfsmApiError) {
      if (error.status === 401) {
        window.$message?.warning('该站点未公开，请先登录管理后台后再访问。')
        return
      }
      if (error.status === 403) {
        window.$message?.error('人机验证未通过，请刷新页面重试。')
        return
      }
    }

    if (error instanceof Error && error.message)
      window.$message?.error(error.message)
  }

  /** 销毁管理器 */
  destroy(): void {
    if (this.onlineTimer) {
      clearInterval(this.onlineTimer)
      this.onlineTimer = null
    }
    this.stopLossTimer()
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler)
      this.visibilityHandler = null
    }
    this.ws?.destroy()
    this.ws = null
    this.nodesStore.clearNodes()
    this.isInitialized = false
  }
}

// 单例实例
let initManager: InitManager | null = null

/** 初始化应用 */
export async function initApp(): Promise<void> {
  if (!initManager)
    initManager = new InitManager()

  await initManager.init()
}

/** 获取初始化管理器实例 */
export function getInitManager(): InitManager | null {
  return initManager
}

/** 销毁初始化管理器 */
export function destroyInitManager(): void {
  if (initManager) {
    initManager.destroy()
    initManager = null
  }
}

/** 详情页：订阅单台服务器 */
export function subscribeServer(serverId: string): void {
  initManager?.subscribeServer(serverId)
}

/** 列表页：订阅全部服务器 */
export function subscribeAll(): void {
  initManager?.subscribeAll()
}

/** 主动刷新服务器列表 */
export async function refreshServers(): Promise<void> {
  await initManager?.refreshServers()
}

/**
 * 应用「启用实时推送」设置的变更。
 *
 * 开启时按当前页面恢复订阅，关闭时断开连接；由 `App.vue` 监听设置变化后调用。
 */
export function applyRealtimeSetting(enabled: boolean): void {
  if (!initManager)
    return
  if (enabled)
    initManager.subscribeAll()
  else
    initManager.pauseRealtime()
}
