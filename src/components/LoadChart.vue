<script setup lang="ts">
import type { HistoryHours, HistoryMetricRow } from '@/types/cfsm'
import type { RecordFormat } from '@/utils/recordHelper'
import { useIntervalFn, usePreferredReducedMotion } from '@vueuse/core'
import dayjs from 'dayjs'
import { NButton, NCard, NEmpty, NSpin } from 'naive-ui'
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import VChart from 'vue-echarts'
import { useGlassSurface } from '@/composables/useGlassSurface'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { getSharedApi } from '@/utils/cfsmApi'
import { formatBytes, formatBytesSplit } from '@/utils/helper'
import { fillMissingTimePoints } from '@/utils/recordHelper'
import '@/utils/echarts' // 共享 ECharts 配置

const props = defineProps<{
  uuid: string
}>()

const appStore = useAppStore()
const { glassSurfaceStyle, isGlassEnabled } = useGlassSurface()
const nodesStore = useNodesStore()

// CFSM 的 /api/history/all 仅支持 0.167 / 0.5 / 1 / 6 / 12 / 24 / 48 / 96 / 168 小时（最长 7 天）
const MAX_HISTORY_HOURS = 168
const maxRecordPreserveTime = computed(() => MAX_HISTORY_HOURS)

// 数据更新间隔（秒）从 theme_options 读取，默认 3 秒
const dataUpdateInterval = computed(() => {
  const interval = appStore.themeOptions.dataUpdateInterval
  // 确保值在合理范围内（1-60秒）
  if (typeof interval === 'number' && interval >= 1 && interval <= 60) {
    return interval * 1000 // 转换为毫秒
  }
  return 3000 // 默认 3 秒
})

// 使用 store 中的 isDark computed
const isDark = computed(() => appStore.isDark)

// 优化后的图表配色方案（基于 Material Design 色彩）
const chartColors = {
  // 主色调 - 珊瑚红
  primary: '#FF6B6B',
  primaryArea: 'rgba(255, 107, 107, 0.15)',
  // 次要色 - 琥珀黄
  secondary: '#FFB347',
  // 第三色 - 青绿色
  tertiary: '#4ECDC4',
  // 第四色 - 紫罗兰
  quaternary: '#A78BFA',
  // 第五色 - 天蓝色
  quinary: '#60A5FA',
}

// 图表主题相关颜色
const chartThemeColors = computed(() => ({
  text: isDark.value ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.85)',
  textSecondary: isDark.value ? 'rgba(255, 255, 255, 0.55)' : 'rgba(0, 0, 0, 0.55)',
  borderColor: isDark.value ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
  splitLineColor: isDark.value ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
  tooltipBg: isDark.value ? 'rgba(40, 40, 40, 0.95)' : 'rgba(255, 255, 255, 0.98)',
  tooltipShadow: isDark.value ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.12)',
}))

// 通用 Tooltip 配置
const baseTooltipConfig = computed(() => ({
  trigger: 'axis' as const,
  confine: false,
  backgroundColor: chartThemeColors.value.tooltipBg,
  borderColor: 'transparent',
  borderWidth: 0,
  borderRadius: 8,
  padding: [10, 14],
  boxShadow: `0 4px 16px ${chartThemeColors.value.tooltipShadow}`,
  textStyle: {
    color: chartThemeColors.value.text,
    fontSize: 13,
    lineHeight: 20,
  },
  extraCssText: 'box-shadow: none; backdrop-filter: blur(8px);',
  axisPointer: {
    type: 'cross' as const,
    crossStyle: {
      color: chartThemeColors.value.textSecondary,
    },
    lineStyle: {
      color: chartThemeColors.value.borderColor,
      width: 1,
      type: 'dashed' as const,
    },
  },
}))

// 图表边距配置
const chartMargin = { top: 12, right: 24, bottom: 32, left: 56 }
const chartMarginWithLegend = { top: 12, right: 24, bottom: 52, left: 56 }

// 视图选项；CFSM 的 /api/history/all 只接受固定枚举的 hours
const presetViews = [
  { label: '10 分钟', hours: 0.167 },
  { label: '1 小时', hours: 1 },
  { label: '6 小时', hours: 6 },
  { label: '1 天', hours: 24 },
  { label: '7 天', hours: 168 },
]

// 可用视图列表
const availableViews = computed(() => {
  const views: { label: string, hours?: number }[] = [{ label: '实时' }]
  const maxHours = maxRecordPreserveTime.value

  for (const v of presetViews) {
    if (maxHours >= v.hours) {
      views.push({ label: v.label, hours: v.hours })
    }
  }

  return views
})

// 当前选中的视图
const selectedView = ref<string>('实时')
const selectedHours = computed(() => {
  const view = availableViews.value.find(v => v.label === selectedView.value)
  return view?.hours
})
const isRealtime = computed(() => selectedView.value === '实时')
const preferredMotion = usePreferredReducedMotion()

const chartAnimationConfig = computed(() => ({
  animation: isRealtime.value && preferredMotion.value !== 'reduce',
  animationDuration: 300,
  animationDurationUpdate: Math.min(1200, dataUpdateInterval.value / 2),
  animationEasing: 'cubicOut' as const,
  animationEasingUpdate: 'cubicInOut' as const,
}))

// 数据状态
const remoteData = shallowRef<RecordFormat[]>([])
const loading = ref(false)
const isInitialLoad = ref(true) // 是否为首次加载（用于控制实时模式下的 NSpin 显示）
const error = ref<string | null>(null)
let latestRequestId = 0

// 节点信息
const nodeInfo = computed(() => nodesStore.nodesByUuid.get(props.uuid))

// CFSM API 客户端
const api = getSharedApi()

// ==================== 数据获取 ====================

/** /api/history/all 支持的查询时长（小时） */
const ALLOWED_HISTORY_HOURS: HistoryHours[] = [0.167, 0.5, 1, 6, 12, 24, 48, 96, 168]

/** 把任意小时数收敛到后端允许的枚举值（取不超过它的最大值） */
function normalizeHistoryHours(hours: number): HistoryHours {
  let best: HistoryHours = ALLOWED_HISTORY_HOURS[0] ?? 0.167
  for (const allowed of ALLOWED_HISTORY_HOURS) {
    if (allowed <= hours)
      best = allowed
  }
  return best
}

/** 该节点所属的后端地址；多站模式下用于选择正确的 API Base */
function resolveApiBase(): string {
  return nodeInfo.value?.apiBase ?? api.apiBases[0] ?? window.location.origin
}

/** 取 gpu_info 首个设备的利用率 */
function gpuUsageFrom(raw: HistoryMetricRow['gpu_info']): number | null {
  if (Array.isArray(raw)) {
    const first = raw[0]
    return first?.info ?? null
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        const first = parsed[0] as { info?: number | null } | undefined
        return first?.info ?? null
      }
    }
    catch {
      return null
    }
  }
  return null
}

/** CFSM 历史行 → 图表数据点；缺失字段保留 null 以便图表留出断点 */
function historyRowToRecord(row: HistoryMetricRow): RecordFormat {
  const loadFirst = (row.load_avg ?? '').trim().split(/\s+/)[0]
  const load = loadFirst ? Number.parseFloat(loadFirst) : Number.NaN

  return {
    client: '',
    time: new Date(row.timestamp).toISOString(),
    cpu: row.cpu ?? null,
    gpu: gpuUsageFrom(row.gpu_info),
    gpu_usage: null,
    gpu_memory: null,
    ram: row.ram_used ?? null,
    ram_total: row.ram_total ?? null,
    swap: row.swap_used ?? null,
    swap_total: row.swap_total ?? null,
    load: Number.isFinite(load) ? load : null,
    temp: null,
    disk: row.disk_used ?? null,
    disk_total: row.disk_total ?? null,
    net_in: row.net_in_speed ?? null,
    net_out: row.net_out_speed ?? null,
    net_total_up: row.net_tx ?? null,
    net_total_down: row.net_rx ?? null,
    process: row.processes ?? null,
    connections: row.tcp_conn ?? null,
    connections_udp: row.udp_conn ?? null,
  }
}

function sortByTime(records: RecordFormat[]): RecordFormat[] {
  return [...records].sort((a, b) => dayjs(a.time).valueOf() - dayjs(b.time).valueOf())
}

/**
 * 「实时」视图：CFSM 没有「最近采样点」接口，
 * 因此取最近 10 分钟的历史，并按 dataUpdateInterval 周期刷新。
 */
async function fetchRecentData(requestId: number) {
  if (!props.uuid)
    return

  // 只在首次加载时显示 loading
  if (isInitialLoad.value) {
    loading.value = true
  }
  error.value = null

  try {
    const rows = await api.getHistory(resolveApiBase(), props.uuid, 0.167)
    if (requestId !== latestRequestId || !isRealtime.value)
      return
    const maxLength = 150
    remoteData.value = sortByTime(rows.map(historyRowToRecord)).slice(-maxLength)
  }
  catch (err) {
    if (requestId !== latestRequestId)
      return
    error.value = err instanceof Error ? err.message : '获取数据失败'
    remoteData.value = []
  }
  finally {
    if (requestId === latestRequestId) {
      loading.value = false
      isInitialLoad.value = false
    }
  }
}

async function fetchHistoryData(requestId: number) {
  if (!props.uuid)
    return

  const hours = normalizeHistoryHours(selectedHours.value || 4)

  loading.value = true
  error.value = null

  try {
    const rows = await api.getHistory(resolveApiBase(), props.uuid, hours)
    if (requestId !== latestRequestId || isRealtime.value)
      return
    remoteData.value = sortByTime(rows.map(historyRowToRecord))
  }
  catch (err) {
    if (requestId !== latestRequestId)
      return
    error.value = err instanceof Error ? err.message : '获取数据失败'
    remoteData.value = []
  }
  finally {
    if (requestId === latestRequestId)
      loading.value = false
  }
}

async function fetchData() {
  const requestId = ++latestRequestId
  if (isRealtime.value) {
    await fetchRecentData(requestId)
  }
  else {
    await fetchHistoryData(requestId)
  }
}

// ==================== 数据处理 ====================

const chartData = computed(() => {
  const data = remoteData.value
  if (!data.length)
    return []

  if (isRealtime.value) {
    return data
  }

  const hours = selectedHours.value || 4
  const minute = 60
  const hour = minute * 60
  let intervalSec: number
  let maxGap: number

  if (hours <= 4) {
    intervalSec = minute
    maxGap = minute * 2
  }
  else if (hours > 120) {
    intervalSec = hour
    maxGap = hour * 2
  }
  else {
    intervalSec = minute * 15
    maxGap = minute * 30
  }

  return fillMissingTimePoints(data, intervalSec, hours * 3600, maxGap)
})

const latestStatus = computed(() => {
  const data = remoteData.value
  if (!data.length)
    return null
  return data[data.length - 1]
})

// ==================== 工具函数 ====================

function formatTime(time: string, showDate: boolean): string {
  const date = dayjs(time)
  if (showDate) {
    return date.format('M/D HH:mm')
  }
  return date.format(isRealtime.value ? 'HH:mm:ss' : 'HH:mm')
}

function formatTimeForTooltip(time: string, hours: number): string {
  const date = dayjs(time)
  if (hours < 24) {
    return date.format('HH:mm:ss')
  }
  return date.format('MM/DD HH:mm')
}

const showDateInAxis = computed(() => (selectedHours.value || 1) >= 24)

// 通用 X 轴配置
const baseXAxisConfig = computed(() => ({
  type: 'category' as const,
  data: chartData.value.map(r => formatTime(r.time, showDateInAxis.value)),
  axisLabel: {
    fontSize: 11,
    color: chartThemeColors.value.textSecondary,
    margin: 12,
    hideOverlap: true,
  },
  axisLine: {
    show: true,
    lineStyle: { color: chartThemeColors.value.borderColor, width: 1 },
  },
  axisTick: { show: false },
  boundaryGap: false,
}))

// 通用 Y 轴配置
const baseYAxisConfig = computed(() => ({
  type: 'value' as const,
  axisLabel: {
    fontSize: 11,
    color: chartThemeColors.value.textSecondary,
  },
  axisLine: { show: false },
  axisTick: { show: false },
  splitLine: {
    lineStyle: {
      color: chartThemeColors.value.splitLineColor,
      type: 'dashed' as const,
    },
  },
  axisPointer: {
    lineStyle: { opacity: 0 },
    crossStyle: { opacity: 0 },
    label: { show: false },
  },
}))

// ==================== 图表配置 ====================

// CPU 图表
const cpuChartOption = computed(() => ({
  ...chartAnimationConfig.value,
  // 全局颜色配置（确保 Tooltip 圆点颜色与线条一致）
  color: [chartColors.primary, chartColors.secondary],
  tooltip: {
    ...baseTooltipConfig.value,
    formatter: (params: unknown) => {
      const p = params as Array<{ dataIndex: number, seriesName: string, value: number, color: string }>
      if (!p.length)
        return ''
      const firstParam = p[0]
      if (!firstParam)
        return ''
      const record = chartData.value[firstParam.dataIndex]
      if (!record)
        return ''

      const timeStr = formatTimeForTooltip(record.time, selectedHours.value || 1)
      let html = `<div style="font-weight:600;margin-bottom:6px;color:${chartThemeColors.value.textSecondary}">${timeStr}</div>`
      html += '<div style="display:flex;flex-direction:column;gap:4px">'

      for (const item of p) {
        const colorDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${item.color};margin-right:8px;flex-shrink:0"></span>`
        if (item.seriesName === 'CPU') {
          html += `<div style="display:flex;align-items:center">${colorDot}<span>CPU</span><span style="margin-left:auto;font-weight:600;margin-left:16px">${item.value?.toFixed(1) ?? '-'}%</span></div>`
        }
        else if (item.seriesName === '负载') {
          html += `<div style="display:flex;align-items:center">${colorDot}<span>系统负载</span><span style="margin-left:auto;font-weight:600;margin-left:16px">${item.value?.toFixed(2) ?? '-'}</span></div>`
        }
      }
      html += '</div>'
      return html
    },
  },
  grid: chartMargin,
  xAxis: baseXAxisConfig.value,
  yAxis: [
    {
      ...baseYAxisConfig.value,
      min: 0,
      max: 100,
      axisLabel: { ...baseYAxisConfig.value.axisLabel, formatter: '{value}%' },
    },
    {
      ...baseYAxisConfig.value,
      min: 0,
      splitLine: { show: false },
    },
  ],
  series: [
    {
      name: 'CPU',
      type: 'line',
      data: chartData.value.map(r => r.cpu),
      smooth: 0.6,
      showSymbol: false,
      yAxisIndex: 0,
      lineStyle: { width: 2.5, color: chartColors.primary, cap: 'round' as const },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(255, 107, 107, 0.25)' },
            { offset: 1, color: 'rgba(255, 107, 107, 0.02)' },
          ],
        },
      },
    },
    {
      name: '负载',
      type: 'line',
      data: chartData.value.map(r => r.load),
      smooth: 0.6,
      showSymbol: false,
      yAxisIndex: 1,
      lineStyle: { width: 2.5, color: chartColors.secondary, cap: 'round' as const },
    },
  ],
}))

// 内存图表
const memoryChartOption = computed(() => ({
  ...chartAnimationConfig.value,
  color: [chartColors.primary, chartColors.secondary],
  tooltip: {
    ...baseTooltipConfig.value,
    formatter: (params: unknown) => {
      const p = params as Array<{ dataIndex: number, seriesName: string, value: number, color: string }>
      if (!p.length)
        return ''
      const firstParam = p[0]
      if (!firstParam)
        return ''
      const record = chartData.value[firstParam.dataIndex]
      if (!record)
        return ''

      const ramUsed = record.ram ?? 0
      const ramTotal = record.ram_total ?? nodeInfo.value?.mem_total ?? 0
      const swapUsed = record.swap ?? 0
      const swapTotal = record.swap_total ?? nodeInfo.value?.swap_total ?? 0
      const ramPercent = ramTotal > 0 ? ((ramUsed / ramTotal) * 100).toFixed(1) : '0'
      const swapPercent = swapTotal > 0 ? ((swapUsed / swapTotal) * 100).toFixed(1) : '0'

      const timeStr = formatTimeForTooltip(record.time, selectedHours.value || 1)
      let html = `<div style="font-weight:600;margin-bottom:6px;color:${chartThemeColors.value.textSecondary}">${timeStr}</div>`
      html += '<div style="display:flex;flex-direction:column;gap:4px">'

      for (const item of p) {
        const colorDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${item.color};margin-right:8px;flex-shrink:0"></span>`
        if (item.seriesName === 'RAM') {
          html += `<div style="display:flex;align-items:center">${colorDot}<span>RAM</span><span style="margin-left:auto;font-weight:600;margin-left:16px">${formatBytes(ramUsed)} (${ramPercent}%)</span></div>`
        }
        else if (item.seriesName === 'Swap') {
          html += `<div style="display:flex;align-items:center">${colorDot}<span>Swap</span><span style="margin-left:auto;font-weight:600;margin-left:16px">${formatBytes(swapUsed)} (${swapPercent}%)</span></div>`
        }
      }
      html += '</div>'
      return html
    },
  },
  grid: chartMargin,
  xAxis: baseXAxisConfig.value,
  yAxis: {
    ...baseYAxisConfig.value,
    axisLabel: {
      ...baseYAxisConfig.value.axisLabel,
      formatter: (val: number) => formatBytes(val),
    },
  },
  series: [
    {
      name: 'RAM',
      type: 'line',
      data: chartData.value.map(r => r.ram),
      smooth: 0.6,
      showSymbol: false,
      lineStyle: { width: 2.5, color: chartColors.primary, cap: 'round' as const },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(255, 107, 107, 0.25)' },
            { offset: 1, color: 'rgba(255, 107, 107, 0.02)' },
          ],
        },
      },
    },
    {
      name: 'Swap',
      type: 'line',
      data: chartData.value.map(r => r.swap),
      smooth: 0.6,
      showSymbol: false,
      lineStyle: { width: 2.5, color: chartColors.secondary, cap: 'round' as const },
    },
  ],
}))

// 磁盘图表
const diskChartOption = computed(() => ({
  ...chartAnimationConfig.value,
  color: [chartColors.tertiary],
  tooltip: {
    ...baseTooltipConfig.value,
    formatter: (params: unknown) => {
      const p = params as Array<{ dataIndex: number, value: number, color: string }>
      if (!p.length)
        return ''
      const firstParam = p[0]
      if (!firstParam)
        return ''
      const record = chartData.value[firstParam.dataIndex]
      if (!record)
        return ''

      const diskUsed = record.disk ?? 0
      const diskTotal = record.disk_total ?? nodeInfo.value?.disk_total ?? 0
      const diskPercent = diskTotal > 0 ? ((diskUsed / diskTotal) * 100).toFixed(1) : '0'

      const timeStr = formatTimeForTooltip(record.time, selectedHours.value || 1)
      const colorDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${firstParam.color};margin-right:8px;flex-shrink:0"></span>`

      let html = `<div style="font-weight:600;margin-bottom:6px;color:${chartThemeColors.value.textSecondary}">${timeStr}</div>`
      html += '<div style="display:flex;flex-direction:column;gap:4px">'
      html += `<div style="display:flex;align-items:center">${colorDot}<span>磁盘已用</span><span style="margin-left:auto;font-weight:600;margin-left:16px">${formatBytes(diskUsed)} (${diskPercent}%)</span></div>`
      html += '</div>'
      return html
    },
  },
  grid: chartMargin,
  xAxis: baseXAxisConfig.value,
  yAxis: {
    ...baseYAxisConfig.value,
    axisLabel: {
      ...baseYAxisConfig.value.axisLabel,
      formatter: (val: number) => formatBytes(val),
    },
  },
  series: [
    {
      name: '磁盘已用',
      type: 'line',
      data: chartData.value.map(r => r.disk),
      smooth: 0.6,
      showSymbol: false,
      lineStyle: { width: 2.5, color: chartColors.tertiary, cap: 'round' as const },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(78, 205, 196, 0.25)' },
            { offset: 1, color: 'rgba(78, 205, 196, 0.02)' },
          ],
        },
      },
    },
  ],
}))

// 网络图表
const networkChartOption = computed(() => ({
  ...chartAnimationConfig.value,
  color: [chartColors.quinary, chartColors.quaternary],
  tooltip: {
    ...baseTooltipConfig.value,
    formatter: (params: unknown) => {
      const p = params as Array<{ dataIndex: number, seriesName: string, value: number, color: string }>
      if (!p.length)
        return ''
      const firstParam = p[0]
      if (!firstParam)
        return ''
      const record = chartData.value[firstParam.dataIndex]
      if (!record)
        return ''

      const timeStr = formatTimeForTooltip(record.time, selectedHours.value || 1)
      let html = `<div style="font-weight:600;margin-bottom:6px;color:${chartThemeColors.value.textSecondary}">${timeStr}</div>`
      html += '<div style="display:flex;flex-direction:column;gap:4px">'

      for (const item of p) {
        const colorDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${item.color};margin-right:8px;flex-shrink:0"></span>`
        const label = item.seriesName === '下载' ? '↓ 下载' : '↑ 上传'
        html += `<div style="display:flex;align-items:center">${colorDot}<span>${label}</span><span style="margin-left:auto;font-weight:600;margin-left:16px">${formatBytes(item.value)}/s</span></div>`
      }
      html += '</div>'
      return html
    },
  },
  legend: {
    data: ['下载', '上传'],
    bottom: 4,
    itemWidth: 12,
    itemHeight: 12,
    itemGap: 20,
    icon: 'roundRect',
    textStyle: { fontSize: 11, color: chartThemeColors.value.textSecondary },
  },
  grid: chartMarginWithLegend,
  xAxis: baseXAxisConfig.value,
  yAxis: {
    ...baseYAxisConfig.value,
    axisLabel: {
      ...baseYAxisConfig.value.axisLabel,
      formatter: (val: number) => `${formatBytes(val)}/s`,
    },
  },
  series: [
    {
      name: '下载',
      type: 'line',
      data: chartData.value.map(r => r.net_in),
      smooth: 0.6,
      showSymbol: false,
      lineStyle: { width: 2.5, color: chartColors.quinary, cap: 'round' as const },
    },
    {
      name: '上传',
      type: 'line',
      data: chartData.value.map(r => r.net_out),
      smooth: 0.6,
      showSymbol: false,
      lineStyle: { width: 2.5, color: chartColors.quaternary, cap: 'round' as const },
    },
  ],
}))

// 连接数图表
const connectionsChartOption = computed(() => ({
  ...chartAnimationConfig.value,
  color: [chartColors.primary, chartColors.tertiary],
  tooltip: {
    ...baseTooltipConfig.value,
    formatter: (params: unknown) => {
      const p = params as Array<{ dataIndex: number, seriesName: string, value: number, color: string }>
      if (!p.length)
        return ''
      const firstParam = p[0]
      if (!firstParam)
        return ''
      const record = chartData.value[firstParam.dataIndex]
      if (!record)
        return ''

      const timeStr = formatTimeForTooltip(record.time, selectedHours.value || 1)
      let html = `<div style="font-weight:600;margin-bottom:6px;color:${chartThemeColors.value.textSecondary}">${timeStr}</div>`
      html += '<div style="display:flex;flex-direction:column;gap:4px">'

      for (const item of p) {
        const colorDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${item.color};margin-right:8px;flex-shrink:0"></span>`
        const displayValue = item.value != null ? Math.round(item.value) : '-'
        html += `<div style="display:flex;align-items:center">${colorDot}<span>${item.seriesName}</span><span style="margin-left:auto;font-weight:600;margin-left:16px">${displayValue}</span></div>`
      }
      html += '</div>'
      return html
    },
  },
  legend: {
    data: ['TCP', 'UDP'],
    bottom: 4,
    itemWidth: 12,
    itemHeight: 12,
    itemGap: 20,
    icon: 'roundRect',
    textStyle: { fontSize: 11, color: chartThemeColors.value.textSecondary },
  },
  grid: chartMarginWithLegend,
  xAxis: baseXAxisConfig.value,
  yAxis: {
    ...baseYAxisConfig.value,
    min: 0,
    axisLabel: {
      ...baseYAxisConfig.value.axisLabel,
      formatter: (val: number) => Math.round(val).toString(),
    },
  },
  series: [
    {
      name: 'TCP',
      type: 'line',
      data: chartData.value.map(r => r.connections),
      smooth: 0.6,
      showSymbol: false,
      lineStyle: { width: 2.5, color: chartColors.primary, cap: 'round' as const },
    },
    {
      name: 'UDP',
      type: 'line',
      data: chartData.value.map(r => r.connections_udp),
      smooth: 0.6,
      showSymbol: false,
      lineStyle: { width: 2.5, color: chartColors.tertiary, cap: 'round' as const },
    },
  ],
}))

// 进程数图表
const processChartOption = computed(() => ({
  ...chartAnimationConfig.value,
  color: [chartColors.quaternary],
  tooltip: {
    ...baseTooltipConfig.value,
    formatter: (params: unknown) => {
      const p = params as Array<{ dataIndex: number, value: number, color: string }>
      if (!p.length)
        return ''
      const firstParam = p[0]
      if (!firstParam)
        return ''
      const record = chartData.value[firstParam.dataIndex]
      if (!record)
        return ''

      const timeStr = formatTimeForTooltip(record.time, selectedHours.value || 1)
      const colorDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${firstParam.color};margin-right:8px;flex-shrink:0"></span>`
      const displayValue = firstParam.value != null ? Math.round(firstParam.value) : '-'

      let html = `<div style="font-weight:600;margin-bottom:6px;color:${chartThemeColors.value.textSecondary}">${timeStr}</div>`
      html += '<div style="display:flex;flex-direction:column;gap:4px">'
      html += `<div style="display:flex;align-items:center">${colorDot}<span>进程数</span><span style="margin-left:auto;font-weight:600;margin-left:16px">${displayValue}</span></div>`
      html += '</div>'
      return html
    },
  },
  grid: chartMargin,
  xAxis: baseXAxisConfig.value,
  yAxis: {
    ...baseYAxisConfig.value,
    min: 0,
    axisLabel: {
      ...baseYAxisConfig.value.axisLabel,
      formatter: (val: number) => Math.round(val).toString(),
    },
  },
  series: [
    {
      name: '进程数',
      type: 'line',
      data: chartData.value.map(r => r.process),
      smooth: 0.6,
      showSymbol: false,
      lineStyle: { width: 2.5, color: chartColors.quaternary, cap: 'round' as const },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(167, 139, 250, 0.25)' },
            { offset: 1, color: 'rgba(167, 139, 250, 0.02)' },
          ],
        },
      },
    },
  ],
}))

// ==================== 实时更新 ====================

// 使用 VueUse 的 useIntervalFn 自动管理定时器
const { pause: pauseRealtimeUpdate, resume: resumeRealtimeUpdate } = useIntervalFn(
  () => fetchData(),
  dataUpdateInterval,
  { immediate: false },
)

// 根据是否为实时模式控制定时器
watch(isRealtime, (realtime) => {
  if (realtime) {
    resumeRealtimeUpdate()
  }
  else {
    pauseRealtimeUpdate()
  }
}, { immediate: true })

// ==================== 生命周期 ====================

watch(selectedView, () => {
  remoteData.value = []
  isInitialLoad.value = true // 切换视图时重置首次加载状态
  fetchData()
}, { flush: 'sync' })

watch(() => props.uuid, () => {
  remoteData.value = []
  isInitialLoad.value = true // 切换节点时重置首次加载状态
  fetchData()
})

onMounted(() => {
  fetchData()
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- 时间选择器 -->
    <div class="flex flex-wrap gap-2 justify-center">
      <NButton
        v-for="view in availableViews"
        :key="view.label"
        :type="selectedView === view.label ? 'primary' : 'default'"
        size="small"
        @click="selectedView = view.label"
      >
        {{ view.label }}
      </NButton>
    </div>

    <!-- 内容区域 -->
    <NSpin :show="loading">
      <div v-if="error" class="text-red-500 py-8 text-center">
        {{ error }}
      </div>
      <div v-else-if="remoteData.length === 0 && !loading" class="py-8">
        <NEmpty description="暂无负载数据" />
      </div>

      <!-- 图表网格 -->
      <div v-else class="gap-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        <!-- CPU 卡片 -->
        <NCard size="small" class="chart-card" :class="{ 'glass-surface-enabled glass-card-enabled': isGlassEnabled }" :style="glassSurfaceStyle">
          <template #header>
            <div class="flex items-center justify-between">
              <span class="text-base font-bold">CPU</span>
              <div v-if="latestStatus?.cpu != null" class="text-sm flex gap-0.5 items-baseline">
                <span :style="{ fontFamily: appStore.numberFontFamily, color: 'var(--n-text-color-1)' }">{{ latestStatus.cpu.toFixed(1) }}</span>
                <span style="color: var(--n-text-color-3)">%</span>
              </div>
              <span v-else style="color: var(--n-text-color-3)">-</span>
            </div>
          </template>
          <div class="h-48">
            <VChart :option="cpuChartOption" autoresize />
          </div>
        </NCard>

        <!-- 内存卡片 -->
        <NCard size="small" class="chart-card" :class="{ 'glass-surface-enabled glass-card-enabled': isGlassEnabled }" :style="glassSurfaceStyle">
          <template #header>
            <div class="flex items-center justify-between">
              <span class="text-base font-bold">内存</span>
              <div class="text-sm flex gap-1 items-baseline">
                <template v-if="latestStatus?.ram != null">
                  <span :style="{ fontFamily: appStore.numberFontFamily, color: 'var(--n-text-color-1)' }">{{ formatBytesSplit(latestStatus.ram, appStore.byteDecimals).value }}</span>
                  <span style="color: var(--n-text-color-3)">{{ formatBytesSplit(latestStatus.ram, appStore.byteDecimals).unit }}</span>
                </template>
                <span v-else style="color: var(--n-text-color-3)">-</span>
                <span style="color: var(--n-text-color-3)">/</span>
                <template v-if="nodeInfo?.mem_total">
                  <span :style="{ fontFamily: appStore.numberFontFamily, color: 'var(--n-text-color-3)' }">{{ formatBytesSplit(nodeInfo.mem_total, appStore.byteDecimals).value }}</span>
                  <span style="color: var(--n-text-color-3)">{{ formatBytesSplit(nodeInfo.mem_total, appStore.byteDecimals).unit }}</span>
                </template>
                <span v-else style="color: var(--n-text-color-3)">-</span>
              </div>
            </div>
          </template>
          <div class="h-48">
            <VChart :option="memoryChartOption" autoresize />
          </div>
        </NCard>

        <!-- 磁盘卡片 -->
        <NCard size="small" class="chart-card" :class="{ 'glass-surface-enabled glass-card-enabled': isGlassEnabled }" :style="glassSurfaceStyle">
          <template #header>
            <div class="flex items-center justify-between">
              <span class="text-base font-bold">磁盘</span>
              <div class="text-sm flex gap-1 items-baseline">
                <template v-if="latestStatus?.disk != null">
                  <span :style="{ fontFamily: appStore.numberFontFamily, color: 'var(--n-text-color-1)' }">{{ formatBytesSplit(latestStatus.disk, appStore.byteDecimals).value }}</span>
                  <span style="color: var(--n-text-color-3)">{{ formatBytesSplit(latestStatus.disk, appStore.byteDecimals).unit }}</span>
                </template>
                <span v-else style="color: var(--n-text-color-3)">-</span>
                <span style="color: var(--n-text-color-3)">/</span>
                <template v-if="nodeInfo?.disk_total">
                  <span :style="{ fontFamily: appStore.numberFontFamily, color: 'var(--n-text-color-3)' }">{{ formatBytesSplit(nodeInfo.disk_total, appStore.byteDecimals).value }}</span>
                  <span style="color: var(--n-text-color-3)">{{ formatBytesSplit(nodeInfo.disk_total, appStore.byteDecimals).unit }}</span>
                </template>
                <span v-else style="color: var(--n-text-color-3)">-</span>
              </div>
            </div>
          </template>
          <div class="h-48">
            <VChart :option="diskChartOption" autoresize />
          </div>
        </NCard>

        <!-- 网络卡片 -->
        <NCard size="small" class="chart-card" :class="{ 'glass-surface-enabled glass-card-enabled': isGlassEnabled }" :style="glassSurfaceStyle">
          <template #header>
            <div class="flex items-center justify-between">
              <span class="text-base font-bold">网络</span>
              <div class="text-sm flex gap-1 items-baseline">
                <span style="color: var(--n-text-color-3)">↑</span>
                <template v-if="latestStatus?.net_out != null">
                  <span :style="{ fontFamily: appStore.numberFontFamily, color: 'var(--n-text-color-1)' }">{{ formatBytesSplit(latestStatus.net_out, appStore.byteDecimals).value }}</span>
                  <span style="color: var(--n-text-color-3)">{{ formatBytesSplit(latestStatus.net_out, appStore.byteDecimals).unit }}/s</span>
                </template>
                <span v-else style="color: var(--n-text-color-3)">-</span>
                <span style="color: var(--n-text-color-3)">｜</span>
                <span style="color: var(--n-text-color-3)">↓</span>
                <template v-if="latestStatus?.net_in != null">
                  <span :style="{ fontFamily: appStore.numberFontFamily, color: 'var(--n-text-color-1)' }">{{ formatBytesSplit(latestStatus.net_in, appStore.byteDecimals).value }}</span>
                  <span style="color: var(--n-text-color-3)">{{ formatBytesSplit(latestStatus.net_in, appStore.byteDecimals).unit }}/s</span>
                </template>
                <span v-else style="color: var(--n-text-color-3)">-</span>
              </div>
            </div>
          </template>
          <div class="h-48">
            <VChart :option="networkChartOption" autoresize />
          </div>
        </NCard>

        <!-- 连接数卡片 -->
        <NCard size="small" class="chart-card" :class="{ 'glass-surface-enabled glass-card-enabled': isGlassEnabled }" :style="glassSurfaceStyle">
          <template #header>
            <div class="flex items-center justify-between">
              <span class="text-base font-bold">连接</span>
              <div class="text-sm flex gap-1 items-baseline">
                <span style="color: var(--n-text-color-3)">TCP:</span>
                <span :style="{ fontFamily: appStore.numberFontFamily, color: 'var(--n-text-color-1)' }">{{ latestStatus?.connections ?? '-' }}</span>
                <span style="color: var(--n-text-color-3)">｜</span>
                <span style="color: var(--n-text-color-3)">UDP:</span>
                <span :style="{ fontFamily: appStore.numberFontFamily, color: 'var(--n-text-color-1)' }">{{ latestStatus?.connections_udp ?? '-' }}</span>
              </div>
            </div>
          </template>
          <div class="h-48">
            <VChart :option="connectionsChartOption" autoresize />
          </div>
        </NCard>

        <!-- 进程卡片 -->
        <NCard size="small" class="chart-card" :class="{ 'glass-surface-enabled glass-card-enabled': isGlassEnabled }" :style="glassSurfaceStyle">
          <template #header>
            <div class="flex items-center justify-between">
              <span class="text-base font-bold">进程</span>
              <span class="text-sm" :style="{ fontFamily: appStore.numberFontFamily, color: 'var(--n-text-color-1)' }">
                {{ latestStatus?.process ?? '-' }}
              </span>
            </div>
          </template>
          <div class="h-48">
            <VChart :option="processChartOption" autoresize />
          </div>
        </NCard>
      </div>
    </NSpin>
  </div>
</template>

<style scoped lang="scss">
.chart-card {
  --n-padding-bottom: 8px;
  --n-padding-left: 8px;
  --n-padding-right: 8px;
  --n-padding-top: 8px;
}

/* 毛玻璃卡片样式 */
.glass-card-enabled {
  &:hover {
    filter: brightness(0.95);
  }
}

html.dark .glass-card-enabled {
  &:hover {
    filter: brightness(1.1);
  }
}
</style>
