/**
 * 延迟与丢包的展示口径。
 *
 * CFSM 的延迟/丢包取值有三态语义（见 `@/types/cfsm` 与 `@/stores/nodes`）：
 * - `false`：未配置 / 未上报 / 未取样 → 不展示
 * - `null`：该轮明确探测超时，无有效 RTT → 按最差等级展示为「超时」
 * - `number`：有效数据，`0`（含 `0%` 丢包）必须正常展示
 *
 * 分级阈值沿用本主题既有的红黄绿约定：
 * - 延迟：< 100ms 良好、< 200ms 一般、≥ 200ms 较差
 * - 丢包：≤ 1% 良好、≤ 10% 一般、> 10% 较差
 */

import type { LatencySet, LatencyValue, NodeData } from '@/stores/nodes'
import type { LatencyWindowPoint, Server } from '@/types/cfsm'
import { TAG_COLOR_HEX_MAP } from '@/utils/tagHelper'

/** 质量分级 */
export type QualityGrade = 'good' | 'fair' | 'poor' | 'unknown'

/** 延迟分级阈值（ms） */
export const LATENCY_GOOD_MS = 100
export const LATENCY_FAIR_MS = 200

/** 丢包分级阈值（%）：≤1 良好、≤10 一般、>10 较差 */
export const LOSS_GOOD_PERCENT = 1
export const LOSS_FAIR_PERCENT = 10

/**
 * 线路键，覆盖 CFSM 的全部 8 条探测线路：
 *
 * | 键 | 标量字段 | 显示名来源 |
 * |---|---|---|
 * | `ct` / `cu` / `cm` / `bd` | `ping_ct` 等 | 后台 `custom_ct_name` 等 |
 * | `node1` … `node4` | `ping_node_1` 等 | 后台 `node_1_name` 等（自定义节点） |
 *
 * 历史上的取值只覆盖前四条，导致后台配了「自定义节点」的机器（如自建东京节点）在
 * 首页卡片、列表与详情页全部不显示 —— 这是本模块刻意扩展成 8 条的原因。
 */
export const LATENCY_LINE_KEYS = ['ct', 'cu', 'cm', 'bd', 'node1', 'node2', 'node3', 'node4'] as const
export type LatencyLineKey = typeof LATENCY_LINE_KEYS[number]

/** 三网 + BGP 的线路数；`node1..node4` 排在其后 */
export const CARRIER_LINE_COUNT = 4

/** 线路显示名；缺省为 CT / CU / CM / BGP / Node 1-4，站点可在后台自定义 */
export interface LatencyLineNames {
  ct?: string
  cu?: string
  cm?: string
  bd?: string
  node1?: string
  node2?: string
  node3?: string
  node4?: string
}

/** 单条线路的延迟与丢包 */
export interface LatencyLine {
  key: LatencyLineKey
  name: string
  latency: LatencyValue
  loss: LatencyValue
}

/** 延迟概览（用于卡片与列表的紧凑展示） */
export interface LatencySummary {
  /** 是否至少有一条线路是「已配置」状态 */
  hasData: boolean
  /** 已配置的线路明细 */
  lines: LatencyLine[]
  /** 已配置线路中最差的延迟数值（取最大值），无有效数值时为 null */
  worstLatency: number | null
  /** 是否存在探测超时的线路 */
  hasTimeout: boolean
  /** 已配置线路中的最大丢包率，无有效数值时为 null */
  maxLoss: number | null
  /** 是否存在丢包数据 */
  hasLoss: boolean
}

/** 已格式化并配色的展示片段 */
export interface QualityBadge {
  /** 展示文本；无数据时为空串，调用方据此决定是否渲染 */
  text: string
  /** 文本颜色（HEX） */
  color: string
  grade: QualityGrade
}

const EMPTY_BADGE: QualityBadge = { text: '', color: TAG_COLOR_HEX_MAP.gray, grade: 'unknown' }

/** 延迟分级；`false` 视为未配置（unknown），`null`（探测超时）按最差处理 */
export function gradeLatency(value: LatencyValue): QualityGrade {
  if (value === false)
    return 'unknown'
  if (value === null)
    return 'poor'
  if (value < LATENCY_GOOD_MS)
    return 'good'
  if (value < LATENCY_FAIR_MS)
    return 'fair'
  return 'poor'
}

/** 丢包分级；`false` 视为未配置（unknown），`null`（全超时）按最差处理 */
export function gradeLoss(value: LatencyValue): QualityGrade {
  if (value === false)
    return 'unknown'
  if (value === null)
    return 'poor'
  if (value <= LOSS_GOOD_PERCENT)
    return 'good'
  if (value <= LOSS_FAIR_PERCENT)
    return 'fair'
  return 'poor'
}

/** 分级 → HEX 颜色，复用标签调色板以保持全站一致 */
export function gradeHex(grade: QualityGrade): string {
  switch (grade) {
    case 'good':
      return TAG_COLOR_HEX_MAP.green
    case 'fair':
      return TAG_COLOR_HEX_MAP.orange
    case 'poor':
      return TAG_COLOR_HEX_MAP.tomato
    default:
      return TAG_COLOR_HEX_MAP.gray
  }
}

/** 延迟展示文本：「23 ms」/「超时」/ 未配置时为空串 */
export function formatLatencyValue(value: LatencyValue): string {
  if (value === false)
    return ''
  if (value === null)
    return '超时'
  return `${Math.round(value)} ms`
}

/** 丢包展示文本：「0.0%」/「超时」/ 未配置时为空串 */
export function formatLossValue(value: LatencyValue): string {
  if (value === false)
    return ''
  if (value === null)
    return '超时'
  return `${value.toFixed(1)}%`
}

/**
 * 紧凑延迟文本：「55ms」/「超时」/ 未配置时为空串。
 * 用于卡片内单行并排展示多条线路（有空格版本见 `formatLatencyValue`）。
 */
export function formatLatencyCompact(value: LatencyValue): string {
  if (value === false)
    return ''
  if (value === null)
    return '超时'
  return `${Math.round(value)}ms`
}

/** 延迟数值 → HEX 颜色（便捷封装） */
export function latencyHex(value: LatencyValue): string {
  return gradeHex(gradeLatency(value))
}

/** 丢包数值 → HEX 颜色（便捷封装） */
export function lossHex(value: LatencyValue): string {
  return gradeHex(gradeLoss(value))
}

/**
 * 采样间隔展示文本，如「6 分钟」「30 秒」。
 * CFSM 不提供任务级间隔配置，该值由窗口点实测得出；非正数返回空串。
 */
export function formatSampleInterval(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0)
    return ''
  if (seconds < 60)
    return `${Math.round(seconds)} 秒`
  const minutes = seconds / 60
  if (minutes < 60)
    return `${Math.round(minutes)} 分钟`
  return `${(minutes / 60).toFixed(1)} 小时`
}

/**
 * 从窗口采样点取某条线路的原始取值。
 *
 * 必须原样保留三态语义：`false` = 未配置/未取样、`null` = 探测超时、`number` = 有效值。
 * 切勿写成 `point.ct ?? false` —— `null ?? false` 会把「探测超时」降级成「未配置」并被丢弃，
 * 结果是超时点在图表中消失、丢包率恒为 0。
 *
 * `taskId` 0-3 为三网 + BGP，4-7 为后台的自定义节点 1-4。
 */
export function pickLineValue(point: LatencyWindowPoint, taskId: number): LatencyValue {
  const raw = taskId === 0
    ? point.ct
    : taskId === 1
      ? point.cu
      : taskId === 2
        ? point.cm
        : taskId === 3
          ? point.bd
          : point[`node${taskId - CARRIER_LINE_COUNT + 1}` as 'node1' | 'node2' | 'node3' | 'node4']
  return raw === undefined ? false : raw
}

/** `ping_*` / `loss_*` 的字段名，按线路下标排列（0-3 三网+BGP，4-7 自定义节点 1-4） */
const SERVER_LINE_FIELDS = {
  ping: ['ping_ct', 'ping_cu', 'ping_cm', 'ping_bd', 'ping_node_1', 'ping_node_2', 'ping_node_3', 'ping_node_4'],
  loss: ['loss_ct', 'loss_cu', 'loss_cm', 'loss_bd', 'loss_node_1', 'loss_node_2', 'loss_node_3', 'loss_node_4'],
} as const

/**
 * 从 `/api/server` 或 `/api/history/all` 的行对象取某条线路的延迟/丢包。
 *
 * 与 `pickLineValue` 同源：`false` = 未配置/未上报/未取样、`null` = 探测超时、`number` = 有效值。
 * 后端类型为 `string|number|false|null`，这里把可解析的数字字符串也归一化为 number。
 */
export function pickServerLineValue(
  source: Partial<Server>,
  kind: 'ping' | 'loss',
  taskId: number,
): LatencyValue {
  const field = SERVER_LINE_FIELDS[kind][taskId]
  if (!field)
    return false

  const raw = (source as Record<string, unknown>)[field]
  if (typeof raw === 'number' && Number.isFinite(raw))
    return raw
  // `null` 必须原样保留：它表示该轮明确探测超时
  if (raw === null)
    return null
  if (typeof raw === 'string') {
    const parsed = Number.parseFloat(raw)
    if (Number.isFinite(parsed))
      return parsed
  }
  return false
}

/** 收集「已配置」的线路明细（`false` 的线路直接跳过） */
export function collectLatencyLines(
  ping: LatencySet,
  loss: LatencySet,
  names: LatencyLineNames = {},
): LatencyLine[] {
  const fallbackNames: Record<LatencyLineKey, string> = {
    ct: 'CT',
    cu: 'CU',
    cm: 'CM',
    bd: 'BGP',
    node1: 'Node 1',
    node2: 'Node 2',
    node3: 'Node 3',
    node4: 'Node 4',
  }

  const lines: LatencyLine[] = []
  // 用显式的 undefined 判断而非 `?? false`：`null`（探测超时）必须原样保留，
  // 否则会被降级成「未配置」而丢失超时告警。
  const pingRecord: Partial<Record<LatencyLineKey, LatencyValue>> = ping
  const lossRecord: Partial<Record<LatencyLineKey, LatencyValue>> = loss

  for (const key of LATENCY_LINE_KEYS) {
    const rawLatency = pingRecord[key]
    const rawLoss = lossRecord[key]
    const latency: LatencyValue = rawLatency === undefined ? false : rawLatency
    const lossValue: LatencyValue = rawLoss === undefined ? false : rawLoss
    // 延迟与丢包都未配置时，该线路不展示
    if (latency === false && lossValue === false)
      continue
    lines.push({
      key,
      name: names[key]?.trim() || fallbackNames[key],
      latency,
      loss: lossValue,
    })
  }
  return lines
}

/**
 * 汇总节点当前的延迟与丢包。
 *
 * 典型使用场景：`hash` 只在节点数据变化时重算，避免在模板里重复遍历。
 */
export function summarizeLatency(
  node: Pick<NodeData, 'ping_latency' | 'loss_rate'>,
  names: LatencyLineNames = {},
): LatencySummary {
  const lines = collectLatencyLines(node.ping_latency, node.loss_rate, names)

  const latencies = lines
    .map(line => line.latency)
    .filter((value): value is number => typeof value === 'number')
  const losses = lines
    .map(line => line.loss)
    .filter((value): value is number => typeof value === 'number')

  return {
    hasData: lines.length > 0,
    lines,
    worstLatency: latencies.length > 0 ? Math.max(...latencies) : null,
    hasTimeout: lines.some(line => line.latency === null),
    maxLoss: losses.length > 0 ? Math.max(...losses) : null,
    hasLoss: lines.some(line => line.loss !== false),
  }
}

/**
 * 延迟概览徽标。
 *
 * 取「最差线路」而非最优：监控页不应掩盖单条线路的劣化。
 * 只要有线路探测超时，就直接展示「超时」，避免用一个好看的数值粉饰。
 */
export function latencyBadge(summary: LatencySummary): QualityBadge {
  if (!summary.hasData)
    return EMPTY_BADGE

  if (summary.hasTimeout)
    return { text: '超时', color: gradeHex('poor'), grade: 'poor' }

  if (summary.worstLatency === null)
    return EMPTY_BADGE

  const grade = gradeLatency(summary.worstLatency)
  return {
    text: formatLatencyValue(summary.worstLatency),
    color: gradeHex(grade),
    grade,
  }
}

/** 丢包概览徽标；未配置丢包时返回空文本 */
export function lossBadge(summary: LatencySummary): QualityBadge {
  if (!summary.hasData || !summary.hasLoss)
    return EMPTY_BADGE

  // 存在超时线路时，丢包率可能缺测，此时统一按最差展示
  if (summary.hasTimeout && summary.maxLoss === null)
    return { text: '超时', color: gradeHex('poor'), grade: 'poor' }

  if (summary.maxLoss === null)
    return EMPTY_BADGE

  const grade = gradeLoss(summary.maxLoss)
  return {
    text: formatLossValue(summary.maxLoss),
    color: gradeHex(grade),
    grade,
  }
}

/** 卡片内并排展示的单条线路明细 */
export interface LatencyInlineSegment {
  key: LatencyLineKey
  /** 线路名，如「电信」 */
  name: string
  /** 延迟文本，如「55ms」/「超时」；该项缺失时为空串 */
  latency: string
  /** 延迟数字颜色：由**丢包率**分级决定；丢包未配置时退回延迟自身分级 */
  latencyColor: string
  /** 丢包文本，如「0.1%」/「超时」；该项缺失时为空串（此时不展示悬浮提示） */
  loss: string
}

/**
 * 卡片内延迟数字的着色规则：**以丢包率为准**。
 *
 * 延迟数值本身达标但丢包严重时，链路质量同样是差的，因此这里用丢包率分级着色；
 * 后端未提供丢包数据（`false`）时才退回延迟自身的分级，避免整行失去颜色语义。
 */
export function latencyColorByLoss(latency: LatencyValue, loss: LatencyValue): string {
  if (loss !== false)
    return gradeHex(gradeLoss(loss))
  return latencyHex(latency)
}

/**
 * 生成卡片内单行展示的线路明细，形如「电信 · 55ms | 联通 · 44ms」。
 *
 * 只包含「已配置」的线路（`false` 的线路不会出现在 `summary.lines` 里）。
 * 丢包不再内联展示，而是作为悬浮提示的内容（见 `loss` 字段）。
 */
export function latencyInlineSegments(summary: LatencySummary): LatencyInlineSegment[] {
  return summary.lines.map(line => ({
    key: line.key,
    name: line.name,
    latency: formatLatencyCompact(line.latency) || '—',
    latencyColor: latencyColorByLoss(line.latency, line.loss),
    loss: formatLossValue(line.loss),
  }))
}
