import type { DiskIoMetrics, GpuInfo, LatencyWindowPoint, Server, ServersResponse, ServersStats, SysConfig } from '@/types/cfsm'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

/** 流量计费口径（CFSM `traffic_calc_type`） */
export type TrafficLimitType = 'total' | 'sum' | 'max' | 'min' | 'up' | 'down'

/** WebSocket 连接状态（与 utils/cfsmWs 的 CfsmWsState 对齐） */
export type WsConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'suspended'

/**
 * 延迟/丢包取值语义（CFSM 约定）：
 * - `false`：未配置 / 未上报 / 未取样，前端不应显示
 * - `null`：该轮明确探测超时，详情页可显示为「超时」
 * - `number`：有效数据，`0`（含 0% 丢包）必须正常显示
 */
export type LatencyValue = number | null | false

export interface LatencySet {
  ct: LatencyValue
  cu: LatencyValue
  cm: LatencyValue
  bd: LatencyValue
  node1: LatencyValue
  node2: LatencyValue
  node3: LatencyValue
  node4: LatencyValue
}

/**
 * 节点 view model。
 *
 * 为降低组件层改动量，这里沿用主题既有的字段命名（如 `mem_total` 承载 CFSM 的 `ram_total`），
 * 并在注释中标注与 CFSM `Server` 的对应关系；CFSM 独有数据以新字段追加。
 */
export interface NodeData {
  /** CFSM `id` */
  uuid: string
  /** 该服务器所属的后端地址（多站模式） */
  apiBase: string
  // ===== 基本信息 =====
  name: string
  /** CFSM `cpu_info` */
  cpu_name: string
  /** CFSM 未提供虚拟化信息，固定为空 */
  virtualization: string
  arch: string
  cpu_cores: number
  os: string
  kernel_version: string
  /** 由 CFSM `gpu_info` 的 name 拼接得到 */
  gpu_name: string
  /** CFSM `ip_v4`：'1' 表示可达 */
  ipv4: string
  /** CFSM `ip_v6`：'1' 表示可达 */
  ipv6: string
  region: string
  /** CFSM 公共接口不返回备注，固定为空 */
  remark: string
  /** CFSM 公共接口不返回备注，固定为空 */
  public_remark: string
  /** CFSM `agent_version` */
  version: string
  /** CFSM `sort_order` */
  weight: number
  /** CFSM `server_group` */
  group: string
  /** 英文逗号分隔 */
  tags: string
  hidden: boolean
  // ===== 计费 =====
  /** 解析后的价格；-1 表示免费或未设置，原始值见 price_raw */
  price: number
  /** CFSM `price` 原始字符串："0" 或 "-1" 表示免费，空白表示未设置 */
  price_raw: string
  /** CFSM `billing_cycle` 归一化后的天数；-1 表示一次性/未知 */
  billing_cycle: number
  auto_renewal: boolean
  currency: string
  /** CFSM `expire_date` */
  expired_at: string
  /** 由 CFSM `traffic_limit`（如 "1TB"）解析出的字节数 */
  traffic_limit: number
  /** CFSM `traffic_limit` 原始字符串 */
  traffic_limit_raw: string
  traffic_limit_type: TrafficLimitType
  // ===== 容量 =====
  /** CFSM `ram_total` */
  mem_total: number
  swap_total: number
  disk_total: number
  // ===== 实时指标 =====
  online: boolean
  /** 最后上报时间（ISO 字符串，由 CFSM `last_updated` / `timestamp` 归一化） */
  time: string
  /** 最后上报时间（毫秒时间戳，用于在线判定） */
  lastUpdatedMs: number
  cpu: number
  /** 取自 CFSM `gpu_info` 第一项的 info */
  gpu: number
  /** CFSM `ram_used` */
  ram: number
  /** CFSM `swap_used` */
  swap: number
  load: number
  load5: number
  load15: number
  /** CFSM 未提供温度，固定为 0 */
  temp: number
  /** CFSM `disk_used` */
  disk: number
  /** CFSM `net_in_speed` */
  net_in: number
  /** CFSM `net_out_speed` */
  net_out: number
  /** CFSM `net_tx` */
  net_total_up: number
  /** CFSM `net_rx` */
  net_total_down: number
  /** CFSM `net_tx_monthly` */
  net_tx_monthly: number
  /** CFSM `net_rx_monthly` */
  net_rx_monthly: number
  /** CFSM `processes` */
  process: number
  /** CFSM `tcp_conn` */
  connections: number
  /** CFSM `udp_conn` */
  connections_udp: number
  /** 由 CFSM `boot_time` 计算 */
  uptime: number
  /** CFSM `disk`；旧数据缺失时为空 */
  disk_io?: DiskIoMetrics
  // ===== 延迟与丢包 =====
  /** 近 `latency_window.hours` 小时的延迟窗口，仅列表接口返回 */
  ping_window: LatencyWindowPoint[]
  /** 近 `latency_window.hours` 小时的丢包窗口，仅列表接口返回 */
  loss_window: LatencyWindowPoint[]
  ping_latency: LatencySet
  loss_rate: LatencySet
  // ===== 已废弃字段（CFSM 无对应数据，保留以便组件逐步清理） =====
  created_at: string
  updated_at: string
}

/** 在线判定阈值：与后端 stats 口径一致（5 分钟） */
const ONLINE_THRESHOLD_MS = 5 * 60 * 1000

const EMPTY_STATS: ServersStats = {
  total: 0,
  online: 0,
  offline: 0,
  globalSpeedIn: 0,
  globalSpeedOut: 0,
  globalNetTx: 0,
  globalNetRx: 0,
}

const TRAFFIC_UNITS: Record<string, number> = {
  B: 1,
  KB: 1024,
  MB: 1024 ** 2,
  GB: 1024 ** 3,
  TB: 1024 ** 4,
  PB: 1024 ** 5,
}

/** 解析 `load_avg` 字符串（如 "0.10 0.20 0.30"） */
function parseLoadAvg(loadAvg: string | undefined): [number, number, number] {
  const parts = (loadAvg ?? '').trim().split(/\s+/).map(value => Number.parseFloat(value))
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
}

/** CFSM 的 gpu_info 在实时接口是数组、历史接口可能是 JSON 字符串 */
function parseGpuInfo(raw: Server['gpu_info'] | undefined): GpuInfo[] {
  if (Array.isArray(raw))
    return raw
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed as GpuInfo[] : []
    }
    catch {
      return []
    }
  }
  return []
}

/** `boot_time` 是毫秒时间戳字符串，换算为已运行秒数 */
function calcUptime(bootTime: string | undefined): number {
  const boot = Number.parseInt(bootTime ?? '', 10)
  if (!Number.isFinite(boot) || boot <= 0)
    return 0
  return Math.max(0, Math.floor((Date.now() - boot) / 1000))
}

/** CFSM `price` 是字符串；-1 表示免费或未设置 */
function parsePrice(raw: string | undefined): number {
  const trimmed = (raw ?? '').trim()
  if (!trimmed)
    return -1
  const value = Number.parseFloat(trimmed)
  return Number.isFinite(value) ? value : -1
}

/** 计费周期关键字 → 天数（配合 utils/tagHelper 的周期文案逻辑） */
const BILLING_CYCLE_DAYS: Record<string, number> = {
  'day': 1,
  'daily': 1,
  'week': 7,
  'weekly': 7,
  'month': 30,
  'monthly': 30,
  'quarter': 90,
  'quarterly': 90,
  'half_year': 180,
  'half-year': 180,
  'semi_annual': 180,
  'semi-annual': 180,
  'year': 365,
  'yearly': 365,
  'annual': 365,
  'once': -1,
  'one-time': -1,
  'onetime': -1,
}

/**
 * CFSM 的 `billing_cycle` 是周期字符串（如 "month"），
 * 归一化为天数，以便复用既有的计费周期文案逻辑；无法识别时按「一次性」处理。
 */
function parseBillingCycle(raw: string | undefined): number {
  const value = (raw ?? '').trim().toLowerCase()
  if (!value)
    return -1
  const numeric = Number.parseFloat(value)
  if (Number.isFinite(numeric))
    return numeric
  return BILLING_CYCLE_DAYS[value] ?? -1
}

/** 解析 "1TB" / "500 GB" 形式的流量上限为字节数 */
function parseTrafficBytes(raw: string | undefined): number {
  const matched = /([\d.]+)\s*([KMGT]?B)/i.exec((raw ?? '').trim())
  if (!matched)
    return 0
  const value = Number.parseFloat(matched[1] ?? '')
  const unit = (matched[2] ?? 'B').toUpperCase()
  if (!Number.isFinite(value))
    return 0
  return value * (TRAFFIC_UNITS[unit] ?? 1)
}

function toIsoTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0)
    return ''
  return new Date(timestamp).toISOString()
}

function toLatency(value: unknown): LatencyValue {
  if (typeof value === 'number' || value === null)
    return value
  return false
}

/** 从 Server（或其局部 patch）提取延迟/丢包取值 */
function latencySet(source: Partial<Server>, kind: 'ping' | 'loss'): LatencySet {
  return kind === 'ping'
    ? {
        ct: toLatency(source.ping_ct),
        cu: toLatency(source.ping_cu),
        cm: toLatency(source.ping_cm),
        bd: toLatency(source.ping_bd),
        node1: toLatency(source.ping_node_1),
        node2: toLatency(source.ping_node_2),
        node3: toLatency(source.ping_node_3),
        node4: toLatency(source.ping_node_4),
      }
    : {
        ct: toLatency(source.loss_ct),
        cu: toLatency(source.loss_cu),
        cm: toLatency(source.loss_cm),
        bd: toLatency(source.loss_bd),
        node1: toLatency(source.loss_node_1),
        node2: toLatency(source.loss_node_2),
        node3: toLatency(source.loss_node_3),
        node4: toLatency(source.loss_node_4),
      }
}

/** 判断样本是否携带该组延迟/丢包字段（增量样本只在报告级样本中携带） */
function hasLatency(patch: Partial<Server>, kind: 'ping' | 'loss'): boolean {
  const keys = kind === 'ping'
    ? ['ping_ct', 'ping_cu', 'ping_cm', 'ping_bd', 'ping_node_1', 'ping_node_2', 'ping_node_3', 'ping_node_4']
    : ['loss_ct', 'loss_cu', 'loss_cm', 'loss_bd', 'loss_node_1', 'loss_node_2', 'loss_node_3', 'loss_node_4']
  const record = patch as Record<string, unknown>
  return keys.some(key => record[key] !== undefined)
}

/** 把 CFSM Server 映射为节点 view model */
function adaptServer(server: Server, apiBase: string): NodeData {
  const [load1, load5, load15] = parseLoadAvg(server.load_avg)
  const gpu = parseGpuInfo(server.gpu_info)
  const lastUpdated = server.last_updated || server.timestamp || Date.now()

  return {
    uuid: server.id,
    apiBase,
    name: server.name,
    cpu_name: server.cpu_info,
    virtualization: '',
    arch: server.arch,
    cpu_cores: server.cpu_cores,
    os: server.os,
    kernel_version: server.kernel_version,
    gpu_name: gpu.map(item => item.name).join(', '),
    ipv4: server.ip_v4,
    ipv6: server.ip_v6,
    region: server.region,
    remark: '',
    public_remark: '',
    version: server.agent_version ?? '',
    weight: server.sort_order,
    group: server.server_group,
    tags: server.tags,
    hidden: server.is_hidden === '1',
    price: parsePrice(server.price),
    price_raw: server.price ?? '',
    billing_cycle: parseBillingCycle(server.billing_cycle),
    auto_renewal: server.auto_renewal === '1' || server.auto_renewal === 'true',
    currency: server.currency,
    expired_at: server.expire_date ?? '',
    traffic_limit: parseTrafficBytes(server.traffic_limit),
    traffic_limit_raw: server.traffic_limit ?? '',
    traffic_limit_type: (server.traffic_calc_type || 'total') as TrafficLimitType,
    mem_total: server.ram_total,
    swap_total: server.swap_total,
    disk_total: server.disk_total,
    online: server.is_online ?? (Date.now() - lastUpdated < ONLINE_THRESHOLD_MS),
    time: toIsoTime(lastUpdated),
    lastUpdatedMs: lastUpdated,
    cpu: server.cpu,
    gpu: gpu[0]?.info ?? 0,
    ram: server.ram_used,
    swap: server.swap_used,
    load: load1,
    load5,
    load15,
    temp: 0,
    disk: server.disk_used,
    net_in: server.net_in_speed,
    net_out: server.net_out_speed,
    net_total_up: server.net_tx,
    net_total_down: server.net_rx,
    net_tx_monthly: server.net_tx_monthly,
    net_rx_monthly: server.net_rx_monthly,
    process: server.processes,
    connections: server.tcp_conn,
    connections_udp: server.udp_conn,
    uptime: calcUptime(server.boot_time),
    disk_io: server.disk,
    ping_window: server.ping ?? [],
    loss_window: server.loss ?? [],
    ping_latency: latencySet(server, 'ping'),
    loss_rate: latencySet(server, 'loss'),
    created_at: '',
    updated_at: '',
  }
}

/**
 * 合并 WebSocket 增量样本。
 *
 * 样本是增量字段：高频采样点只带 CPU / 内存 / Swap / 网速与时间；
 * 每组上报的最后一个样本才携带完整报告状态（磁盘、GPU、进程、连接数、Ping/丢包等）。
 * 因此这里逐字段判断「存在才覆盖」，避免用样本里缺失的字段把已有值抹掉。
 */
function mergePatch(node: NodeData, patch: Partial<Server>, ts: number): NodeData {
  const next: NodeData = { ...node }

  if (typeof patch.cpu === 'number')
    next.cpu = patch.cpu
  if (typeof patch.ram_used === 'number')
    next.ram = patch.ram_used
  if (typeof patch.ram_total === 'number')
    next.mem_total = patch.ram_total
  if (typeof patch.swap_used === 'number')
    next.swap = patch.swap_used
  if (typeof patch.swap_total === 'number')
    next.swap_total = patch.swap_total
  if (typeof patch.disk_used === 'number')
    next.disk = patch.disk_used
  if (typeof patch.disk_total === 'number')
    next.disk_total = patch.disk_total
  if (typeof patch.net_in_speed === 'number')
    next.net_in = patch.net_in_speed
  if (typeof patch.net_out_speed === 'number')
    next.net_out = patch.net_out_speed
  if (typeof patch.net_tx === 'number')
    next.net_total_up = patch.net_tx
  if (typeof patch.net_rx === 'number')
    next.net_total_down = patch.net_rx
  if (typeof patch.net_tx_monthly === 'number')
    next.net_tx_monthly = patch.net_tx_monthly
  if (typeof patch.net_rx_monthly === 'number')
    next.net_rx_monthly = patch.net_rx_monthly
  if (typeof patch.processes === 'number')
    next.process = patch.processes
  if (typeof patch.tcp_conn === 'number')
    next.connections = patch.tcp_conn
  if (typeof patch.udp_conn === 'number')
    next.connections_udp = patch.udp_conn
  if (typeof patch.load_avg === 'string') {
    const [load1, load5, load15] = parseLoadAvg(patch.load_avg)
    next.load = load1
    next.load5 = load5
    next.load15 = load15
  }
  if (patch.disk)
    next.disk_io = patch.disk
  if (patch.gpu_info !== undefined)
    next.gpu = parseGpuInfo(patch.gpu_info)[0]?.info ?? 0
  if (typeof patch.kernel_version === 'string')
    next.kernel_version = patch.kernel_version
  if (typeof patch.boot_time === 'string')
    next.uptime = calcUptime(patch.boot_time)
  if (hasLatency(patch, 'ping'))
    next.ping_latency = latencySet(patch, 'ping')
  if (hasLatency(patch, 'loss'))
    next.loss_rate = latencySet(patch, 'loss')

  const sampleTs = Number.isFinite(ts) && ts > 0 ? ts : Date.now()
  next.lastUpdatedMs = sampleTs
  next.time = toIsoTime(sampleTs)
  next.online = true

  return next
}

function sortNodes(list: NodeData[]): NodeData[] {
  return [...list].sort((a, b) => a.weight - b.weight)
}

const useNodesStore = defineStore('nodes', () => {
  // ===== 状态 =====
  const nodes = ref<NodeData[]>([])
  const wsConnectionState = ref<WsConnectionState>('disconnected')
  const wsReconnectAttempts = ref<number>(0)

  // 多站模式：按后端分别保存统计，再对外聚合
  const statsByBase = ref<Record<string, ServersStats>>({})
  const regionStatsByBase = ref<Record<string, Record<string, number>>>({})
  const sysConfigByBase = ref<Record<string, SysConfig>>({})

  // ===== 计算属性 =====
  const onlineCount = computed(() => nodes.value.filter(node => node.online).length)
  const totalCount = computed(() => nodes.value.length)

  /** 所有分组 */
  const groups = computed(() => {
    const groupSet = new Set<string>()
    nodes.value.forEach((node) => {
      if (node.group)
        groupSet.add(node.group)
    })
    return Array.from(groupSet)
  })

  /** 按 UUID 索引的节点映射 */
  const nodesByUuid = computed(() => {
    const map = new Map<string, NodeData>()
    nodes.value.forEach((node) => {
      map.set(node.uuid, node)
    })
    return map
  })

  /** 聚合后的统计数据 */
  const stats = computed<ServersStats>(() => {
    const result: ServersStats = { ...EMPTY_STATS }
    for (const item of Object.values(statsByBase.value)) {
      result.total += item.total
      result.online += item.online
      result.offline += item.offline
      result.globalSpeedIn += item.globalSpeedIn
      result.globalSpeedOut += item.globalSpeedOut
      result.globalNetTx += item.globalNetTx
      result.globalNetRx += item.globalNetRx
    }
    return result
  })

  /** 聚合后的区域统计 */
  const regionStats = computed<Record<string, number>>(() => {
    const merged: Record<string, number> = {}
    for (const map of Object.values(regionStatsByBase.value)) {
      for (const [region, count] of Object.entries(map))
        merged[region] = (merged[region] ?? 0) + count
    }
    return merged
  })

  /** 站点开关配置（多站时按「任一开启即开启」合并） */
  const sysConfig = computed<SysConfig>(() => {
    const configs = Object.values(sysConfigByBase.value)
    const merged: SysConfig = { ...configs[0] }
    for (const config of configs) {
      merged.show_price = Boolean(merged.show_price || config.show_price)
      merged.show_expire = Boolean(merged.show_expire || config.show_expire)
      merged.show_tf = Boolean(merged.show_tf || config.show_tf)
      merged.show_three_net_details = Boolean(merged.show_three_net_details || config.show_three_net_details)
      merged.long_history_points = Math.max(merged.long_history_points ?? 0, config.long_history_points ?? 0)
    }
    return merged
  })

  /** 是否展示三网小图（由后台开关决定） */
  const showThreeNetDetails = computed<boolean>(() => sysConfig.value.show_three_net_details === true)

  // ===== 方法 =====

  /** 某个后端当前应有的全部服务器 id（用于 WebSocket subscribe 过滤） */
  function resolveIdsForBase(apiBase: string): string[] {
    return nodes.value.filter(node => node.apiBase === apiBase).map(node => node.uuid)
  }

  function findById(id: string): NodeData | undefined {
    return nodes.value.find(node => node.uuid === id)
  }

  function findByUuid(id: string): NodeData | undefined {
    return findById(id)
  }

  /** 应用某个后端的服务器列表（`GET /api/servers`） */
  function applyListResponse(apiBase: string, response: ServersResponse): void {
    const incoming = response.servers.map(server => adaptServer(server, apiBase))
    const pending = new Map(incoming.map(node => [node.uuid, node]))

    const next: NodeData[] = []
    for (const node of nodes.value) {
      if (node.apiBase !== apiBase) {
        next.push(node)
        continue
      }
      const updated = pending.get(node.uuid)
      if (updated) {
        next.push(updated)
        pending.delete(node.uuid)
      }
    }
    for (const node of pending.values())
      next.push(node)

    nodes.value = sortNodes(next)

    statsByBase.value = { ...statsByBase.value, [apiBase]: response.stats }
    regionStatsByBase.value = { ...regionStatsByBase.value, [apiBase]: response.regionStats ?? {} }
    sysConfigByBase.value = { ...sysConfigByBase.value, [apiBase]: response.sysConfig ?? {} }
  }

  /**
   * 应用详情页单服务器数据（`GET /api/server?id=`）。
   * 若该服务器不在列表中（例如详情页直接进入），则插入。
   */
  function applyServerDetail(apiBase: string, server: Server): void {
    const adapted = adaptServer(server, apiBase)
    const index = nodes.value.findIndex(node => node.uuid === adapted.uuid)
    if (index === -1) {
      nodes.value = sortNodes([...nodes.value, adapted])
      return
    }
    nodes.value[index] = adapted
  }

  /** 应用 WebSocket 增量样本 */
  function applySample(serverId: string, patch: Partial<Server>, ts: number): void {
    const index = nodes.value.findIndex(node => node.uuid === serverId)
    if (index === -1)
      return
    const current = nodes.value[index]
    if (!current)
      return
    nodes.value[index] = mergePatch(current, patch, ts)
  }

  /** 按 5 分钟阈值重算在线状态（列表接口已给出 is_online，此处兜底） */
  function recomputeOnlineState(): void {
    const now = Date.now()
    nodes.value = nodes.value.map((node) => {
      if (node.lastUpdatedMs <= 0)
        return node
      const online = now - node.lastUpdatedMs < ONLINE_THRESHOLD_MS
      return online === node.online ? node : { ...node, online }
    })
  }

  function updateWsState(state: WsConnectionState, attempts?: number): void {
    wsConnectionState.value = state
    if (attempts !== undefined)
      wsReconnectAttempts.value = attempts
  }

  function clearNodes(): void {
    nodes.value = []
    statsByBase.value = {}
    regionStatsByBase.value = {}
    sysConfigByBase.value = {}
  }

  return {
    // 状态
    nodes,
    wsConnectionState,
    wsReconnectAttempts,
    // 计算属性
    onlineCount,
    totalCount,
    groups,
    nodesByUuid,
    stats,
    regionStats,
    sysConfig,
    showThreeNetDetails,
    // 方法
    resolveIdsForBase,
    findById,
    findByUuid,
    applyListResponse,
    applyServerDetail,
    applySample,
    recomputeOnlineState,
    updateWsState,
    clearNodes,
  }
})

export { useNodesStore }
