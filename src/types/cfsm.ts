/**
 * CF-Server-Monitor 第三方主题公开 API 的 wire 类型。
 *
 * 依据 CFSM 主题开发文档第 5 节「类型定义」整理，仅描述后端真实返回的结构。
 * 主题内部使用的 view model 请勿放在这里，放到对应 store 中。
 */

/** `/api/history/all` 支持的查询时长（小时），受后端枚举限制，最大 168（7 天） */
export type HistoryHours = 0.167 | 0.5 | 1 | 6 | 12 | 24 | 48 | 96 | 168

/** 磁盘 IO 指标；旧探针、旧数据缺失或子字段全为 0 时后端不返回该对象 */
export interface DiskIoMetrics {
  /** B/s */
  read_bps: number
  /** B/s */
  write_bps: number
  read_iops: number
  write_iops: number
  /** 毫秒 */
  await_ms: number
  /** % */
  util: number
}

/** 延迟/丢包窗口采样点，仅 `/api/servers` 的 `servers[]` 返回 */
export interface LatencyWindowPoint {
  ts: number
  ct?: number | null | false
  cu?: number | null | false
  cm?: number | null | false
  bd?: number | null | false
  /** 后台「自定义节点 1-4」；未配置时缺省 */
  node1?: number | null | false
  node2?: number | null | false
  node3?: number | null | false
  node4?: number | null | false
}

/** GPU 条目；新版上报与 WebSocket 实时数据为数组，历史/详情 REST 中可能是同结构的 JSON 字符串 */
export interface GpuInfo {
  id: string
  name: string
  info: number | null
}

/**
 * 服务器信息与最新指标。
 *
 * 延迟/丢包字段约定：`false` 表示未配置/未上报/未取样，前端不显示；
 * `null` 表示该轮明确探测超时，详情页可显示为「超时」；数值 `0`（含 0% 丢包）是有效数据。
 */
export interface Server {
  id: string
  name: string
  server_group: string
  /** 英文逗号分隔 */
  tags: string
  /** "0" 或 "-1" 表示免费，空白表示未设置 */
  price: string
  billing_cycle: string
  auto_renewal: string
  currency: string
  expire_date: string
  traffic_limit: string
  traffic_calc_type: string
  reset_day: number
  report_interval: number
  wss_report_interval: number
  is_hidden: '0' | '1'
  sort_order: number

  cpu: number
  load_avg: string
  net_in_speed: number
  net_out_speed: number
  net_rx: number
  net_tx: number
  net_rx_monthly: number
  net_tx_monthly: number
  processes: number
  tcp_conn: number
  udp_conn: number

  ping_ct: number | null | false
  ping_cu: number | null | false
  ping_cm: number | null | false
  ping_bd: number | null | false
  ping_node_1: number | null | false
  ping_node_2: number | null | false
  ping_node_3: number | null | false
  ping_node_4: number | null | false
  loss_ct: number | null | false
  loss_cu: number | null | false
  loss_cm: number | null | false
  loss_bd: number | null | false
  loss_node_1: number | null | false
  loss_node_2: number | null | false
  loss_node_3: number | null | false
  loss_node_4: number | null | false
  /** 仅 `/api/servers` 的列表项返回；三网详情关闭时为空数组 */
  ping?: LatencyWindowPoint[]
  /** 仅 `/api/servers` 的列表项返回；三网详情关闭时为空数组 */
  loss?: LatencyWindowPoint[]

  ram_total: number
  ram_used: number
  swap_total: number
  swap_used: number
  disk_total: number
  disk_used: number
  /** 磁盘 IO；旧数据可能缺失 */
  disk?: DiskIoMetrics

  cpu_cores: number
  cpu_info: string
  gpu_info: GpuInfo[] | string
  arch: string
  os: string
  kernel_version: string
  region: string
  /** 公共 REST 接口仅返回 IPv4 可达性 */
  ip_v4: '0' | '1'
  /** 公共 REST 接口仅返回 IPv6 可达性 */
  ip_v6: '0' | '1'
  boot_time: string
  agent_version?: string
  last_updated: number
  timestamp: number
  is_online?: boolean
  sysConfig?: SysConfig
}

/** 历史指标行；服务端按 `long_history_points` 采样后返回 */
export type HistoryMetricRow = Partial<Server> & {
  timestamp: number
  /** 兼容历史存储的平铺字段，主题只需读取 `disk` */
  disk_read_bps?: number
  disk_write_bps?: number
  disk_read_iops?: number
  disk_write_iops?: number
  disk_await_ms?: number
  disk_util?: number
}

/** 站点开关配置，控制 UI 显示 */
export interface SysConfig {
  show_price?: boolean
  show_expire?: boolean
  show_tf?: boolean
  show_three_net_details?: boolean
  long_history_points?: number
}

/** `/api/servers` 的聚合统计（在线阈值 5 分钟） */
export interface ServersStats {
  total: number
  online: number
  offline: number
  globalSpeedIn: number
  globalSpeedOut: number
  globalNetTx: number
  globalNetRx: number
}

export interface ServersResponse {
  servers: Server[]
  stats: ServersStats
  regionStats: Record<string, number>
  sysConfig: SysConfig
}

/** `/api/config` 的 latency_window 参数 */
export interface LatencyWindow {
  points: number
  hours: number
}

/** `GET /api/config` 响应体 */
export interface SiteConfig {
  version: string
  /** 仅登录后返回 */
  last_workers_version?: string | null
  /** 仅登录后返回 */
  last_agent_version?: string | null
  is_public: boolean
  authorization: boolean
  turnstile_enabled: boolean
  turnstile_login_enabled: boolean
  turnstile_site_key: string
  custom_ct_name: string
  custom_cu_name: string
  custom_cm_name: string
  custom_bd_name: string
  /** 后台「自定义节点 1-4」的显示名；旧版后端可能不下发 */
  node_1_name?: string
  node_2_name?: string
  node_3_name?: string
  node_4_name?: string
  site_title: string
  /** auto / dark / light */
  preferred_theme: string
  /** auto / zh / en */
  default_language: string
  /** 第三方主题自定义配置；未配置时为空对象 */
  theme_options: Record<string, unknown>
  verified: boolean
  /** 已验证凭证，缓存复用 1 小时 */
  turnstile_verified: string | null
  /** 0-1440；0 表示不按连接时长断开 */
  frontend_ws_timeout_minutes: number
  /** 60 / 120 / 180 / 240 */
  long_history_points: number
  latency_window: LatencyWindow
}

/** `POST /api/theme_options` 响应体 */
export interface ThemeOptionsSaveResponse {
  success: true
  theme_options: Record<string, unknown>
  message: 'updateSuccess'
}

/** 后端统一错误响应 */
export interface ApiErrorBody {
  error: string
  code?: number
}

/** WebSocket 增量样本；指标对象可能出现在 data / payload / metrics 中 */
export interface WsSample {
  ts: number
  data?: Partial<Server>
  payload?: Partial<Server>
  metrics?: Partial<Server>
}

export interface WsUpdate {
  serverId: string
  samples: WsSample[]
}

/** `/api/ws` 消息 */
export interface WsMessage {
  type: 'hello' | 'subscribe' | 'subscribed' | 'ping' | 'pong' | 'batchUpdate'
  ts?: number
  subscribed?: string
  scope?: string
  ids?: string[]
  count?: number
  serverId?: string
  updates?: WsUpdate[]
}
