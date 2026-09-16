import type {
  HistoryHours,
  HistoryMetricRow,
  Server,
  ServersResponse,
  SiteConfig,
  ThemeOptionsSaveResponse,
} from '@/types/cfsm'

// 历史查询时长的枚举定义在 wire 类型中，这里透出以便调用方从单一来源导入
export type { HistoryHours }

/**
 * 请求鉴权信息。
 *
 * - 非公开站点：同域部署依赖登录后的 `cfsm_auth` Cookie，跨域或纯静态部署需要 `token`。
 * - 启用全局 Turnstile 时：优先复用 `turnstileVerified`（1 小时有效），否则用当次 `turnstileToken`。
 */
export interface CfsmAuth {
  token?: string | null
  turnstileVerified?: string | null
  turnstileToken?: string | null
}

/** 后端统一错误 */
export class CfsmApiError extends Error {
  readonly status: number
  readonly code?: number

  constructor(message: string, status: number, code?: number) {
    super(message)
    this.name = 'CfsmApiError'
    this.status = status
    this.code = code
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** 把后端的 `{ error, code }` 或 `{ message }` 错误体统一转成 CfsmApiError */
function toApiError(status: number, body: unknown): CfsmApiError {
  if (isRecord(body)) {
    const message = typeof body.error === 'string'
      ? body.error
      : typeof body.message === 'string'
        ? body.message
        : `HTTP ${status}`
    return new CfsmApiError(message, status, typeof body.code === 'number' ? body.code : undefined)
  }
  return new CfsmApiError(`HTTP ${status}`, status)
}

/**
 * 读取后端地址列表。
 *
 * 同源部署（Worker/Pages）默认使用 `window.location.origin`；
 * 跨域或纯静态部署通过 `<meta name="apiBase" content="https://a,https://b">` 指定，多个地址用英文逗号分隔。
 */
export function readApiBases(): string[] {
  const content = document.querySelector('meta[name="apiBase"]')?.getAttribute('content')?.trim()
  const bases = content
    ? content.split(',').map(item => item.trim().replace(/\/+$/, '')).filter(Boolean)
    : []
  return bases.length > 0 ? bases : [window.location.origin]
}

/** 把 apiBase 转成 WebSocket origin（http → ws、https → wss） */
export function toWsOrigin(apiBase: string): string {
  const url = new URL(apiBase, window.location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.origin
}

/** 判断某个 apiBase 是否与当前页面同源 */
export function isSameOrigin(apiBase: string): boolean {
  try {
    return new URL(apiBase, window.location.href).host === window.location.host
  }
  catch {
    return false
  }
}

/**
 * CF-Server-Monitor 公开 API 客户端（REST）。
 *
 * 所有方法都要求显式传入 `apiBase`，以便同时支持多后端（多站）场景。
 */
export class CfsmApi {
  private bases: string[]

  constructor(bases?: string[]) {
    this.bases = bases && bases.length > 0 ? bases : readApiBases()
  }

  /** 当前使用的后端地址列表 */
  get apiBases(): string[] {
    return [...this.bases]
  }

  private buildHeaders(init: HeadersInit | undefined, auth: CfsmAuth | undefined, hasBody: boolean): Headers {
    const headers = new Headers(init)
    if (hasBody && !headers.has('Content-Type'))
      headers.set('Content-Type', 'application/json')
    if (auth?.token)
      headers.set('Authorization', `Bearer ${auth.token}`)
    if (auth?.turnstileVerified)
      headers.set('X-Turnstile-Verified', auth.turnstileVerified)
    else if (auth?.turnstileToken)
      headers.set('X-Turnstile-Token', auth.turnstileToken)
    return headers
  }

  private async request<T>(apiBase: string, path: string, init: RequestInit = {}, auth?: CfsmAuth): Promise<T> {
    const headers = this.buildHeaders(init.headers, auth, init.body !== undefined)

    let response: Response
    try {
      response = await fetch(`${apiBase}${path}`, { credentials: 'include', ...init, headers })
    }
    catch (error) {
      throw new CfsmApiError(`网络请求失败：${error instanceof Error ? error.message : String(error)}`, 0)
    }

    if (!response.ok) {
      let body: unknown
      try {
        body = await response.json()
      }
      catch {
        body = undefined
      }
      throw toApiError(response.status, body)
    }

    return await response.json() as T
  }

  /** GET /api/config */
  getConfig(apiBase: string, auth?: CfsmAuth): Promise<SiteConfig> {
    return this.request<SiteConfig>(apiBase, '/api/config', {}, auth)
  }

  /** GET /api/servers */
  getServers(apiBase: string, auth?: CfsmAuth): Promise<ServersResponse> {
    return this.request<ServersResponse>(apiBase, '/api/servers', {}, auth)
  }

  /** GET /api/server?id= */
  getServer(apiBase: string, id: string, auth?: CfsmAuth): Promise<Server> {
    return this.request<Server>(apiBase, `/api/server?id=${encodeURIComponent(id)}`, {}, auth)
  }

  /** GET /api/history/all?id=&hours=；未登录查询 >24 小时会返回 401 */
  getHistory(apiBase: string, id: string, hours: HistoryHours, auth?: CfsmAuth): Promise<HistoryMetricRow[]> {
    return this.request<HistoryMetricRow[]>(
      apiBase,
      `/api/history/all?id=${encodeURIComponent(id)}&hours=${hours}`,
      {},
      auth,
    )
  }

  /** POST /api/theme_options；无论站点是否公开都需要 JWT */
  saveThemeOptions(
    apiBase: string,
    themeOptions: Record<string, unknown>,
    auth?: CfsmAuth,
  ): Promise<ThemeOptionsSaveResponse> {
    return this.request<ThemeOptionsSaveResponse>(apiBase, '/api/theme_options', {
      method: 'POST',
      body: JSON.stringify({ theme_options: themeOptions }),
    }, auth)
  }

  /**
   * 构造某个后端的 WebSocket 地址。
   *
   * 浏览器原生 WebSocket 不能自定义 Header：同域依赖 Cookie，跨域才用查询参数携带 JWT。
   */
  wsUrl(apiBase: string, subscribe: string, token?: string | null): string {
    const url = new URL(`${toWsOrigin(apiBase)}/api/ws`)
    url.searchParams.set('subscribe', subscribe)
    if (token && !isSameOrigin(apiBase))
      url.searchParams.set('token', token)
    return url.toString()
  }
}

let sharedApi: CfsmApi | null = null

export function getSharedApi(): CfsmApi {
  if (!sharedApi)
    sharedApi = new CfsmApi()
  return sharedApi
}

export function resetSharedApi(): void {
  sharedApi = null
}
