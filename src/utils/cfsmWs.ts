import type { Server, WsMessage, WsSample } from '@/types/cfsm'
import type { CfsmApi } from '@/utils/cfsmApi'

/**
 * 订阅模式。
 *
 * - `all`：列表页使用，建连后必须显式发送 `subscribe` 消息并携带 ids，否则收不到任何更新；
 *   多 apiBase 时 `resolveIds` 只返回该后端自己的服务器 id。
 * - `server`：详情页使用，服务端只推送该服务器，无需发送 ids，也可降低后端额度消耗。
 */
export type CfsmSubscribe
  = | { scope: 'all', resolveIds: (apiBase: string) => string[] }
    | { scope: 'server', serverId: string }

export type CfsmWsState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'suspended'

export interface CfsmWsCallbacks {
  /** 收到增量样本：指标对象已从 data / payload / metrics 中归一化 */
  onSample: (serverId: string, patch: Partial<Server>, ts: number) => void
  onStateChange?: (state: CfsmWsState) => void
  /** 未连接成功时触发（仅首次，避免刷屏） */
  onConnectError?: () => void
  /**
   * 单次连接达到 `frontendWsTimeoutMinutes` 时长后触发。
   * 是否继续连接由上层询问用户决定：选择继续时调用 `restart()`，选择关闭时保持断开且不自动重连。
   */
  onTimeout?: () => void
}

export interface CfsmWsManagerOptions {
  api: CfsmApi
  callbacks: CfsmWsCallbacks
  /** 0 表示不按连接时长断开，默认 0 */
  frontendWsTimeoutMinutes?: number
  reconnectIntervalMs?: number
  maxReconnectAttempts?: number
  /** 心跳间隔（毫秒），默认 30s */
  heartbeatIntervalMs?: number
}

interface Connection {
  apiBase: string
  ws: WebSocket | null
  state: CfsmWsState
  reconnectTimer: ReturnType<typeof setTimeout> | null
  timeoutTimer: ReturnType<typeof setTimeout> | null
  heartbeatTimer: ReturnType<typeof setInterval> | null
  attempts: number
  /** 用户明确拒绝继续、或页面隐藏时暂停自动重连 */
  paused: boolean
}

const HEARTBEAT_INTERVAL_MS = 30_000

/**
 * `/api/ws` 订阅管理器。
 *
 * 每个 apiBase 维护一条独立连接；负责订阅过滤、增量合并回调、心跳、重连、
 * 页面可见性挂起/恢复，以及 `frontend_ws_timeout_minutes` 超时断开。
 */
export class CfsmWsManager {
  private readonly api: CfsmApi
  private readonly callbacks: CfsmWsCallbacks
  private readonly reconnectIntervalMs: number
  private readonly maxReconnectAttempts: number
  private readonly heartbeatIntervalMs: number
  private connections = new Map<string, Connection>()
  private subscribe: CfsmSubscribe | null = null
  private token: string | null = null
  private timeoutMinutes: number
  private visibleHandler: (() => void) | null = null

  constructor(options: CfsmWsManagerOptions) {
    this.api = options.api
    this.callbacks = options.callbacks
    this.reconnectIntervalMs = options.reconnectIntervalMs ?? 3000
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS
    this.timeoutMinutes = Math.max(0, options.frontendWsTimeoutMinutes ?? 0)
  }

  /** 设置 JWT（跨域时通过查询参数传递；同域依赖 Cookie，无需设置） */
  setToken(token: string | null): void {
    this.token = token
  }

  /** 更新 `frontend_ws_timeout_minutes` */
  setTimeoutMinutes(minutes: number): void {
    this.timeoutMinutes = Math.max(0, minutes)
  }

  /** 切换订阅模式；若已有连接会按新模式重建 */
  setSubscribe(subscribe: CfsmSubscribe): void {
    this.subscribe = subscribe
    if (this.connections.size > 0)
      this.connect()
  }

  /** 建立（或重建）所有 apiBase 的连接，并开始监听页面可见性 */
  connect(subscribe?: CfsmSubscribe): void {
    if (subscribe)
      this.subscribe = subscribe

    if (!this.visibleHandler) {
      this.visibleHandler = () => this.handleVisibilityChange()
      document.addEventListener('visibilitychange', this.visibleHandler)
    }

    for (const apiBase of this.api.apiBases) {
      const conn = this.ensureConnection(apiBase)
      conn.paused = false
      conn.attempts = 0
      this.open(conn)
    }
  }

  /**
   * 用户选择「继续连接」时调用：重置计时并重建连接。
   */
  restart(): void {
    for (const conn of this.connections.values()) {
      conn.paused = false
      conn.attempts = 0
    }
    this.connect()
  }

  /** 断开全部连接（不清理订阅配置） */
  disconnect(): void {
    for (const conn of this.connections.values()) {
      conn.paused = true
      this.closeSocket(conn)
      this.setState(conn, 'disconnected')
    }
  }

  /** 彻底销毁：断开连接、移除监听 */
  destroy(): void {
    this.disconnect()
    this.connections.clear()
    this.subscribe = null
    if (this.visibleHandler) {
      document.removeEventListener('visibilitychange', this.visibleHandler)
      this.visibleHandler = null
    }
  }

  /** 页面重新可见时由上层先补一次 REST，再调用 connect() 恢复推送 */
  private handleVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      for (const conn of this.connections.values()) {
        this.closeSocket(conn)
        this.setState(conn, 'suspended')
      }
    }
    else {
      for (const conn of this.connections.values()) {
        if (!conn.paused)
          this.open(conn)
      }
    }
  }

  private ensureConnection(apiBase: string): Connection {
    let conn = this.connections.get(apiBase)
    if (!conn) {
      conn = {
        apiBase,
        ws: null,
        state: 'disconnected',
        reconnectTimer: null,
        timeoutTimer: null,
        heartbeatTimer: null,
        attempts: 0,
        paused: false,
      }
      this.connections.set(apiBase, conn)
    }
    return conn
  }

  private open(conn: Connection): void {
    if (!this.subscribe || conn.paused)
      return

    this.clearReconnectTimer(conn)
    this.closeSocket(conn)

    const subscribeParam = this.subscribe.scope === 'server' ? this.subscribe.serverId : 'all'
    const url = this.api.wsUrl(conn.apiBase, subscribeParam, this.token)

    this.setState(conn, conn.attempts > 0 ? 'reconnecting' : 'connecting')

    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    }
    catch {
      this.scheduleReconnect(conn)
      return
    }
    conn.ws = ws

    ws.onopen = () => {
      conn.attempts = 0
      this.setState(conn, 'connected')

      // subscribe=all 时必须显式提交 ids，否则服务端不推送任何更新
      if (this.subscribe?.scope === 'all') {
        const ids = this.subscribe.resolveIds(conn.apiBase)
        if (ids.length > 0)
          this.send(conn, { type: 'subscribe', scope: 'all', ids })
      }

      this.startHeartbeat(conn)
      this.startTimeoutTimer(conn)
    }

    ws.onmessage = (event: MessageEvent) => this.handleMessage(conn, event.data)

    ws.onerror = () => {
      // 错误后浏览器会紧接着触发 onclose，重连逻辑统一放在那里
    }

    ws.onclose = () => {
      this.stopHeartbeat(conn)
      this.stopTimeoutTimer(conn)
      if (conn.state === 'suspended' || conn.paused)
        return
      this.setState(conn, 'disconnected')
      this.scheduleReconnect(conn)
    }
  }

  private handleMessage(conn: Connection, raw: unknown): void {
    if (typeof raw !== 'string')
      return

    let message: WsMessage
    try {
      message = JSON.parse(raw) as WsMessage
    }
    catch {
      return
    }

    if (message.type === 'ping') {
      this.send(conn, { type: 'pong', ts: Date.now() })
      return
    }

    // 只有 batchUpdate 携带增量样本；hello / subscribed / pong 无需处理
    if (message.type !== 'batchUpdate')
      return

    for (const update of message.updates ?? []) {
      for (const sample of update.samples ?? [])
        this.dispatchSample(update.serverId, sample, message.ts)
    }
  }

  /** 指标对象可能出现在 data / payload / metrics 中，且是增量字段 */
  private dispatchSample(serverId: string, sample: WsSample, messageTs?: number): void {
    const patch = sample.data ?? sample.payload ?? sample.metrics
    if (!patch || typeof patch !== 'object')
      return
    this.callbacks.onSample(serverId, patch, sample.ts ?? messageTs ?? Date.now())
  }

  private send(conn: Connection, payload: unknown): void {
    if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
      try {
        conn.ws.send(JSON.stringify(payload))
      }
      catch {
        // 发送失败由 onclose 兜底
      }
    }
  }

  private startHeartbeat(conn: Connection): void {
    this.stopHeartbeat(conn)
    conn.heartbeatTimer = setInterval(() => {
      this.send(conn, { type: 'ping', ts: Date.now() })
    }, this.heartbeatIntervalMs)
  }

  private stopHeartbeat(conn: Connection): void {
    if (conn.heartbeatTimer) {
      clearInterval(conn.heartbeatTimer)
      conn.heartbeatTimer = null
    }
  }

  private startTimeoutTimer(conn: Connection): void {
    this.stopTimeoutTimer(conn)
    if (this.timeoutMinutes <= 0)
      return

    conn.timeoutTimer = setTimeout(() => {
      this.closeSocket(conn)
      // 不自动重连：等待用户明确选择是否继续
      conn.paused = true
      this.setState(conn, 'disconnected')
      this.callbacks.onTimeout?.()
    }, this.timeoutMinutes * 60_000)
  }

  private stopTimeoutTimer(conn: Connection): void {
    if (conn.timeoutTimer) {
      clearTimeout(conn.timeoutTimer)
      conn.timeoutTimer = null
    }
  }

  private scheduleReconnect(conn: Connection): void {
    if (!this.subscribe || conn.paused)
      return

    if (conn.attempts >= this.maxReconnectAttempts) {
      conn.paused = true
      this.setState(conn, 'disconnected')
      return
    }

    if (conn.attempts === 0)
      this.callbacks.onConnectError?.()

    conn.attempts += 1
    this.setState(conn, 'reconnecting')
    this.clearReconnectTimer(conn)
    conn.reconnectTimer = setTimeout(() => this.open(conn), this.reconnectIntervalMs)
  }

  private clearReconnectTimer(conn: Connection): void {
    if (conn.reconnectTimer) {
      clearTimeout(conn.reconnectTimer)
      conn.reconnectTimer = null
    }
  }

  private closeSocket(conn: Connection): void {
    this.stopHeartbeat(conn)
    const ws = conn.ws
    if (!ws)
      return
    conn.ws = null
    ws.onopen = null
    ws.onmessage = null
    ws.onerror = null
    ws.onclose = null
    if (ws.readyState !== WebSocket.CLOSED)
      ws.close()
  }

  private setState(conn: Connection, state: CfsmWsState): void {
    if (conn.state === state)
      return
    conn.state = state
    this.callbacks.onStateChange?.(state)
  }
}
