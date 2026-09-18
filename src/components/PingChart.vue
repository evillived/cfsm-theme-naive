<script setup lang="ts">
import type { LatencyValue } from '@/stores/nodes'
import type { HistoryHours, HistoryMetricRow } from '@/types/cfsm'
import dayjs from 'dayjs'
import { NButton, NEmpty, NSpin, NSwitch, NTooltip, useThemeVars } from 'naive-ui'
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import VChart from 'vue-echarts'
import { useGlassSurface } from '@/composables/useGlassSurface'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { getSharedApi } from '@/utils/cfsmApi'
import { formatLatencyValue, formatLossValue, formatSampleInterval, latencyHex, pickServerLineValue } from '@/utils/latencyHelper'
import { cutPeakValues, interpolateNullsLinear } from '@/utils/recordHelper'
import '@/utils/echarts' // 共享 ECharts 配置

const props = defineProps<{
  uuid: string
  displayMode?: 'page' | 'modal'
}>()

const appStore = useAppStore()
const nodesStore = useNodesStore()
const api = getSharedApi()
const { glassSurfaceStyle, isGlassEnabled } = useGlassSurface()
const themeVars = useThemeVars()
const isDark = computed(() => appStore.isDark)

const nodeInfo = computed(() => nodesStore.findById(props.uuid))

function resolveApiBase(): string {
  return nodeInfo.value?.apiBase ?? api.apiBases[0] ?? window.location.origin
}

// 图表主题相关颜色
const chartThemeColors = computed(() => ({
  text: isDark.value ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.85)',
  textSecondary: isDark.value ? 'rgba(255, 255, 255, 0.55)' : 'rgba(0, 0, 0, 0.55)',
  textTertiary: isDark.value ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.35)',
  borderColor: isDark.value ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
  splitLineColor: isDark.value ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
  tooltipBg: isDark.value ? 'rgba(40, 40, 40, 0.95)' : 'rgba(255, 255, 255, 0.98)',
  tooltipShadow: isDark.value ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.12)',
  crosshairColor: isDark.value ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)',
}))

// 优化后的图表配色方案（多任务时使用）
const chartColors = [
  '#FF6B6B', // 珊瑚红
  '#4ECDC4', // 青绿色
  '#A78BFA', // 紫罗兰
  '#60A5FA', // 天蓝色
  '#FFB347', // 琥珀黄
  '#F472B6', // 粉红色
  '#34D399', // 翠绿色
  '#FB923C', // 橙色
]

/**
 * 时间范围四档。CFSM 的 `/api/history/all` 只接受固定枚举的 hours，
 * 1 / 6 / 12 / 24 均在其中（> 24 未登录会 401，故不提供更长档位）。
 */
const PING_RANGES: Array<{ label: string, hours: HistoryHours }> = [
  { label: '1 小时', hours: 1 },
  { label: '6 小时', hours: 6 },
  { label: '12 小时', hours: 12 },
  { label: '24 小时', hours: 24 },
]

/** 当前选中的时间范围（小时）；默认 6 小时 */
const selectedHours = ref<HistoryHours>(6)

/**
 * CFSM 历史行同样携带 `ping_ct/cu/cm/bd` 与 `loss_ct/cu/cm/bd`，
 * 因此延迟曲线可以直接取真实历史（1/6/12/24 小时），不再受延迟窗口 ~20 点限制。
 */
interface PingTaskSummary {
  id: number
  name: string
  type: string
  interval: number
  default_on: boolean
  // 统计字段：CFSM 不提供任务级统计，改由前端基于窗口数据计算，故均为可选
  min?: number
  max?: number
  avg?: number
  loss?: number
  /** 丢包率是否来自 CFSM 的 loss_* 实测值；false 表示由超时点占比估算 */
  lossMeasured?: boolean
  /** 窗口内的探测超时次数 */
  timeoutCount?: number
  total?: number
}

// ==================== 数据源 ====================
//
// CFSM 没有延迟历史接口：数据来自 /api/servers 返回的近 latency_window.hours 小时窗口，
// 每个窗口点包含 ct / cu / cm / bd 取值，最多 latency_window.points 个真实样本。

// ==================== 数据源 ====================
//
// 参考文献实现：`/api/history/all` 的历史行本身就带全部线路（三网 + BGP + 自定义节点 1-4）的延迟与丢包列
// （`ping_ct/cu/cm/bd`、`loss_ct/cu/cm/bd`），所以这里直接按选中的小时数取真实历史，
// 无需依赖 `/api/servers` 的 ~20 点延迟窗口。

const remoteRows = shallowRef<HistoryMetricRow[]>([])

/** 全部 8 条线路的任务定义；显示名取站点配置的 custom_*_name 与 node_*_name */
const taskDefs = computed(() => {
  const config = appStore.siteConfig
  return [
    { id: 0, name: config?.custom_ct_name || 'CT' },
    { id: 1, name: config?.custom_cu_name || 'CU' },
    { id: 2, name: config?.custom_cm_name || 'CM' },
    { id: 3, name: config?.custom_bd_name || 'BGP' },
    { id: 4, name: config?.node_1_name || 'Node 1' },
    { id: 5, name: config?.node_2_name || 'Node 2' },
    { id: 6, name: config?.node_3_name || 'Node 3' },
    { id: 7, name: config?.node_4_name || 'Node 4' },
  ]
})

/**
 * 历史采样间隔（秒）：取相邻行时间差的中位数。
 * 服务端按 `long_history_points` 在所选区间内抽样，间隔随档位变化，故由数据实测得出。
 */
const samplingIntervalSec = computed<number>(() => {
  const rows = remoteRows.value
  if (rows.length < 2)
    return 0

  const gaps: number[] = []
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1]
    const current = rows[i]
    if (!prev || !current)
      continue
    const gap = current.timestamp - prev.timestamp
    if (gap > 0)
      gaps.push(gap)
  }
  if (gaps.length === 0)
    return 0

  gaps.sort((a, b) => a - b)
  const median = gaps[Math.floor(gaps.length / 2)] ?? 0
  return Math.round(median / 1000)
})

const tasks = computed<PingTaskSummary[]>(() => {
  const rows = remoteRows.value
  return taskDefs.value
    // 只要线路被配置过就保留：全程探测超时的线路同样需要展示，不能被过滤掉
    .filter(def => rows.some(row =>
      pickServerLineValue(row, 'ping', def.id) !== false
      || pickServerLineValue(row, 'loss', def.id) !== false,
    ))
    .map(def => ({
      id: def.id,
      name: def.name,
      type: 'ping',
      // CFSM 不提供任务级间隔配置，由历史行实测得出
      interval: samplingIntervalSec.value,
      default_on: true,
    }))
})

/**
 * 探测超时的位置（`行下标:线路id`）。
 * 每个历史行就是一个图表点，因此下标与 `mergedData` 严格对齐。
 */
const timeoutCells = computed(() => {
  const cells = new Set<string>()
  remoteRows.value.forEach((row, rowIndex) => {
    for (const def of taskDefs.value) {
      if (pickServerLineValue(row, 'ping', def.id) === null)
        cells.add(`${rowIndex}:${def.id}`)
    }
  })
  return cells
})

const loading = ref(false)
const error = ref<string | null>(null)
let latestRequestId = 0

async function fetchRecords() {
  if (!props.uuid)
    return

  const requestId = ++latestRequestId
  loading.value = true
  error.value = null

  try {
    const rows = await api.getHistory(resolveApiBase(), props.uuid, selectedHours.value)
    if (requestId !== latestRequestId)
      return
    remoteRows.value = [...rows].sort((a, b) => a.timestamp - b.timestamp)
  }
  catch (err) {
    if (requestId !== latestRequestId)
      return
    error.value = err instanceof Error ? err.message : '获取数据失败'
    remoteRows.value = []
  }
  finally {
    if (requestId === latestRequestId)
      loading.value = false
  }
}

// 任务选择
const selectedTaskIds = ref<number[]>([])
const cutPeak = ref(false)
/** 首次拿到任务列表后才自动全选，避免用户「全不选」后被重新选中 */
const selectionInitialized = ref(false)

const isModal = computed(() => props.displayMode === 'modal')

// 任务列表就绪后默认全选；换档位后剔除已不存在的线路
watch(tasks, (list) => {
  const ids = list.map(task => task.id)
  if (!selectionInitialized.value) {
    if (ids.length > 0) {
      selectedTaskIds.value = ids
      selectionInitialized.value = true
    }
    return
  }
  const kept = selectedTaskIds.value.filter(id => ids.includes(id))
  if (kept.length !== selectedTaskIds.value.length)
    selectedTaskIds.value = kept
}, { immediate: true })

// ==================== 数据处理 ====================

/**
 * 历史行本身已按时间对齐，一行即一个图表点，无需再做按任务分桶的时间归并。
 * 未配置的线路在该点直接不写键（图表留空），超时写 null。
 */
const mergedData = computed(() => {
  const defs = taskDefs.value
  return remoteRows.value.map((row) => {
    const point: Record<string, unknown> = { time: new Date(row.timestamp).toISOString() }
    for (const def of defs) {
      const latency = pickServerLineValue(row, 'ping', def.id)
      if (latency === false)
        continue
      point[def.id] = typeof latency === 'number' ? latency : null
    }
    return point
  })
})

const chartData = computed(() => {
  let data = mergedData.value
  const selectedKeys = selectedTaskIds.value.map(String)

  if (selectedKeys.length === 0)
    return []

  // 探测超时（null）是真实告警，不是「缺数据」。
  // EWMA 裁剪与线性插值都会把 null 填成看似正常的延迟值，因此每轮变换后都要还原，
  // 保证超时在图上始终是可见的断点。超时位置由 timeoutCells 按「行下标:线路id」给出。
  const cells = timeoutCells.value

  const restoreTimeouts = (rows: typeof data): typeof data => {
    if (cells.size === 0)
      return rows
    return rows.map((row, rowIndex) => {
      let patched: Record<string, unknown> | null = null
      for (const key of selectedKeys) {
        if (cells.has(`${rowIndex}:${key}`)) {
          patched ??= { ...row }
          patched[key] = null
        }
      }
      return (patched ?? row) as Record<string, unknown>
    })
  }

  if (cutPeak.value) {
    data = restoreTimeouts(cutPeakValues(data, selectedKeys))
  }

  data = restoreTimeouts(interpolateNullsLinear(data, selectedKeys, {
    maxGapMultiplier: 6,
    minCapMs: 2 * 60_000,
    maxCapMs: 30 * 60_000,
  }))

  return data
})

// ==================== 工具函数 ====================

function formatTime(time: string, showDate: boolean): string {
  const date = dayjs(time)
  if (showDate) {
    return date.format('M/D HH:mm')
  }
  return date.format('HH:mm')
}

function formatTimeForTooltip(time: string, hours: number): string {
  const date = dayjs(time)
  if (hours < 24) {
    return date.format('HH:mm:ss')
  }
  return date.format('MM/DD HH:mm')
}

const showDateInAxis = computed(() => selectedHours.value >= 24)

// ==================== 任务选择 ====================

// 获取任务颜色（根据任务在完整列表中的索引）
function getTaskColor(taskId: number): string {
  const taskIndex = tasks.value.findIndex(t => t.id === taskId)
  const safeIndex = Math.max(0, taskIndex % chartColors.length)
  return chartColors[safeIndex]!
}

function percentile(values: number[], value: number): number | undefined {
  if (!values.length)
    return undefined
  const index = Math.max(0, Math.ceil(value * values.length) - 1)
  return values[index]
}

// 区间统计（基于所选档位的真实历史行，保持颜色顺序）
const latestValues = computed(() => {
  const rows = remoteRows.value
  if (!tasks.value.length)
    return []

  return tasks.value.map((task, idx) => {
    // 该线路在区间内的逐行样本，保留原始三态：false 未配置 / null 探测超时 / number 有效值
    const samples: Array<{ latency: LatencyValue, loss: LatencyValue }> = []
    for (const row of rows) {
      const latency = pickServerLineValue(row, 'ping', task.id)
      const loss = pickServerLineValue(row, 'loss', task.id)
      if (latency === false && loss === false)
        continue
      samples.push({ latency, loss })
    }

    const values = samples
      .map(sample => sample.latency)
      .filter((value): value is number => typeof value === 'number')
      .sort((a, b) => a - b)

    let latestValue: number | null = null
    for (let i = samples.length - 1; i >= 0; i--) {
      const sample = samples[i]
      if (sample && typeof sample.latency === 'number') {
        latestValue = sample.latency
        break
      }
    }

    // 只有明确超时（null）才计入超时次数；未配置（false）不算
    const timeoutCount = samples.filter(sample => sample.latency === null).length
    const p50 = percentile(values, 0.5)
    const p99 = percentile(values, 0.99)
    const safeIdx = Math.max(0, idx % chartColors.length)

    // 丢包率取 CFSM 实测的 loss_* 区间均值；
    // 后端未提供丢包列时才退回「超时行占比」这一近似口径。
    const measured = samples
      .map(sample => sample.loss)
      .filter((value): value is number => typeof value === 'number')
    const loss = measured.length > 0
      ? measured.reduce((sum, value) => sum + value, 0) / measured.length
      : (samples.length > 0 ? (timeoutCount / samples.length) * 100 : 0)

    return {
      ...task,
      min: values[0],
      max: values.at(-1),
      avg: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined,
      latest: latestValue ?? undefined,
      p50,
      p99,
      p99_p50_ratio: p50 && p99 ? p99 / p50 : undefined,
      loss,
      lossMeasured: measured.length > 0,
      timeoutCount,
      total: samples.length,
      latestValue,
      color: chartColors[safeIdx]!,
    }
  })
})

const selectedTasks = computed(() => {
  return tasks.value.filter(t => selectedTaskIds.value.includes(t.id))
})

// 切换任务选中状态
function toggleTask(taskId: number) {
  if (selectedTaskIds.value.includes(taskId)) {
    selectedTaskIds.value = selectedTaskIds.value.filter(id => id !== taskId)
  }
  else {
    selectedTaskIds.value = [...selectedTaskIds.value, taskId]
  }
}

function showAllTasks() {
  selectedTaskIds.value = tasks.value.map(t => t.id)
}

function hideAllTasks() {
  selectedTaskIds.value = []
}

// ==================== 图表配置 ====================

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
  position: (point: number[], _params: unknown, _element: HTMLElement, _rect: unknown, size: { contentSize: number[], viewSize: number[] }) => {
    const gap = 12
    const [pointX = 0, pointY = 0] = point
    const [contentWidth = 0, contentHeight = 0] = size.contentSize
    const [viewWidth = 0] = size.viewSize
    const x = Math.min(pointX + gap, viewWidth - contentWidth - gap)
    const y = Math.max(gap, pointY - contentHeight - gap)
    return [Math.max(gap, x), y]
  },
  axisPointer: {
    type: 'cross' as const,
    crossStyle: {
      color: chartThemeColors.value.textTertiary,
    },
    lineStyle: {
      color: chartThemeColors.value.crosshairColor,
      width: 1,
      type: 'dashed' as const,
    },
    shadowStyle: {
      color: chartThemeColors.value.crosshairColor,
    },
  },
}))

const pingChartOption = computed(() => {
  const taskList = selectedTasks.value
  const data = chartData.value
  const hours = selectedHours.value

  // 构建 series，确保颜色与卡片一致
  const series = taskList.map((task) => {
    const color = getTaskColor(task.id)
    return {
      name: task.name,
      type: 'line' as const,
      data: data.map(d => d[task.id] as number | null ?? null),
      smooth: cutPeak.value ? 0.6 : 0.4,
      showSymbol: false,
      connectNulls: false,
      lineStyle: { width: 2, color, cap: 'round' as const },
      itemStyle: { color }, // 确保 symbol 颜色一致
    }
  })

  // 颜色映射表（用于 Tooltip）
  const colorMap = new Map<number, string>()
  tasks.value.forEach((task, idx) => {
    const safeIdx = Math.max(0, idx % chartColors.length)
    colorMap.set(task.id, chartColors[safeIdx]!)
  })

  return {
    animation: false,
    // 全局颜色设置（用于图例等）
    color: tasks.value.map((_, idx) => {
      const safeIdx = Math.max(0, idx % chartColors.length)
      return chartColors[safeIdx]!
    }),
    tooltip: {
      ...baseTooltipConfig.value,
      formatter: (params: unknown) => {
        const p = params as Array<{ dataIndex: number }>
        const firstParam = p[0]
        if (!firstParam)
          return ''
        const rowIndex = firstParam.dataIndex
        const row = data[rowIndex]
        if (!row)
          return ''
        const rawRow = mergedData.value[rowIndex]

        const timeStr = formatTimeForTooltip(row.time as string, hours)
        let html = `<div style="font-weight:600;margin-bottom:6px;color:${chartThemeColors.value.textSecondary}">${timeStr}</div>`
        html += '<div style="display:flex;flex-direction:column;gap:4px">'

        // 直接遍历已选任务：既不依赖 ECharts 是否把 null 点透传进 params，
        // 也能把「探测超时」显式展示出来而不是静默跳过。
        const entries = taskList.map((task) => {
          const isTimeout = rawRow != null && rawRow[task.id] === null
          const raw = row[task.id]
          return {
            name: task.name,
            color: colorMap.get(task.id) || chartColors[0],
            isTimeout,
            value: (isTimeout ? null : typeof raw === 'number' ? raw : null) as number | null,
          }
        })

        // 超时排在最后，其余按延迟升序
        entries.sort((a, b) => {
          if (a.value === null && b.value === null)
            return 0
          if (a.value === null)
            return 1
          if (b.value === null)
            return -1
          return a.value - b.value
        })

        for (const entry of entries) {
          // 该时刻既无采样也未超时（例如线路中途才上报）则跳过
          if (entry.value === null && !entry.isTimeout)
            continue
          const colorDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${entry.color};margin-right:8px;flex-shrink:0"></span>`
          const valueHtml = `<span style="margin-left:auto;font-weight:600;margin-left:16px;font-variant-numeric:tabular-nums;color:${latencyHex(entry.value)}">${formatLatencyValue(entry.value)}</span>`
          html += `<div style="display:flex;align-items:center">${colorDot}<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${entry.name}</span>${valueHtml}</div>`
        }
        html += '</div>'
        return html
      },
    },
    legend: {
      show: taskList.length > 1,
      type: 'scroll',
      bottom: 4,
      itemWidth: 12,
      itemHeight: 12,
      itemGap: 16,
      icon: 'roundRect',
      textStyle: { fontSize: 11, color: chartThemeColors.value.textSecondary },
      data: taskList.map(t => t.name),
    },
    grid: {
      top: 16,
      right: 24,
      bottom: taskList.length > 1 ? 52 : 28,
      left: 56,
    },
    xAxis: {
      type: 'category',
      data: data.map(d => formatTime(d.time as string, showDateInAxis.value)),
      axisLabel: {
        fontSize: 11,
        color: chartThemeColors.value.textSecondary,
        margin: 12,
      },
      axisLine: {
        show: true,
        lineStyle: { color: chartThemeColors.value.borderColor, width: 1 },
      },
      axisTick: { show: false },
      boundaryGap: false,
    },
    yAxis: {
      type: 'value',
      axisLabel: { fontSize: 11, color: chartThemeColors.value.textSecondary, formatter: '{value} ms' },
      axisLine: { show: false },
      axisTick: { show: false },
      axisPointer: {
        lineStyle: { opacity: 0 },
        crossStyle: { opacity: 0 },
        label: { show: false },
      },
      splitLine: {
        lineStyle: {
          color: chartThemeColors.value.splitLineColor,
          type: 'dashed' as const,
        },
      },
    },
    series,
  }
})

// ==================== 生命周期 ====================

// 切换时间范围或节点时重新拉取历史
watch(selectedHours, () => {
  void fetchRecords()
})

watch(() => props.uuid, () => {
  selectionInitialized.value = false
  selectedTaskIds.value = []
  void fetchRecords()
})

onMounted(() => {
  void fetchRecords()
})
</script>

<template>
  <div
    class="ping-chart flex flex-col gap-4"
    :class="isModal ? 'ping-chart--modal' : 'ping-chart--page'"
    :style="{
      '--ping-border': themeVars.borderColor,
      '--ping-radius': themeVars.borderRadius,
      '--ping-surface': themeVars.cardColor,
      '--ping-surface-hover': themeVars.hoverColor,
      '--ping-text-1': themeVars.textColor1,
      '--ping-text-2': themeVars.textColor2,
      '--ping-text-3': themeVars.textColor3,
    }"
  >
    <!-- 时间选择器（样式与负载图表保持一致：居中、无标题） -->
    <div class="flex flex-wrap gap-2 justify-center">
      <NButton
        v-for="range in PING_RANGES"
        :key="range.hours"
        :type="selectedHours === range.hours ? 'primary' : 'default'"
        size="small"
        @click="selectedHours = range.hours"
      >
        {{ range.label }}
      </NButton>
    </div>

    <!-- 内容区域；content-class 上挂自有类名，用于隔离 NSpin 注入的主题变量（见样式区说明） -->
    <NSpin :show="loading" content-class="ping-chart__content flex flex-col gap-4">
      <div v-if="error" class="text-red-500 py-8 text-center">
        {{ error }}
      </div>
      <div v-else-if="tasks.length === 0 && !loading" class="py-8">
        <NEmpty :description="`${PING_RANGES.find(r => r.hours === selectedHours)?.label ?? ''}内暂无延迟数据`" />
      </div>

      <template v-else>
        <!-- 最新值统计卡片（可点击切换选中状态） -->
        <div v-if="latestValues.length > 0" class="ping-task-grid">
          <button
            v-for="task in latestValues"
            :key="task.id"
            type="button"
            class="ping-task-card p-3 border flex gap-3 cursor-pointer select-none transition-colors items-center"
            :aria-pressed="selectedTaskIds.includes(task.id)"
            :class="[
              selectedTaskIds.includes(task.id)
                ? 'ping-task-card--selected'
                : 'ping-task-card--muted',
              isGlassEnabled ? 'glass-surface-enabled glass-task-enabled' : 'task-card-default',
            ]"
            :style="[{ '--task-color': task.color }, glassSurfaceStyle]"
            @click="toggleTask(task.id)"
          >
            <div
              class="rounded-md flex-shrink-0 h-10 w-1.5"
              :style="{ backgroundColor: task.color }"
            />
            <div class="flex-1 min-w-0">
              <div class="flex gap-2 items-center">
                <span class="text-base font-semibold truncate">{{ task.name }}</span>
                <NTooltip placement="top">
                  <template #trigger>
                    <span class="i-carbon-information text-sm opacity-50 cursor-help transition-opacity hover:opacity-100" style="color: var(--n-text-color-2)" tabindex="0" aria-label="查看任务统计详情" @click.stop />
                  </template>
                  <div class="text-sm gap-x-4 gap-y-1.5 grid grid-cols-2">
                    <template v-if="task.min !== undefined">
                      <span style="color: var(--n-text-color-3)">最小</span>
                      <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily }">{{ Math.round(task.min) }} ms</span>
                    </template>
                    <template v-if="task.max !== undefined">
                      <span style="color: var(--n-text-color-3)">最大</span>
                      <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily }">{{ Math.round(task.max) }} ms</span>
                    </template>
                    <template v-if="task.avg !== undefined">
                      <span style="color: var(--n-text-color-3)">平均</span>
                      <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily }">{{ Math.round(task.avg) }} ms</span>
                    </template>
                    <template v-if="task.latest !== undefined">
                      <span style="color: var(--n-text-color-3)">最新</span>
                      <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily }">{{ Math.round(task.latest) }} ms</span>
                    </template>
                    <template v-if="task.p50 !== undefined">
                      <span style="color: var(--n-text-color-3)">P50</span>
                      <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily }">{{ Math.round(task.p50) }} ms</span>
                    </template>
                    <template v-if="task.p99 !== undefined">
                      <span style="color: var(--n-text-color-3)">P99</span>
                      <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily }">{{ Math.round(task.p99) }} ms</span>
                    </template>
                    <template v-if="task.p99_p50_ratio !== undefined">
                      <span style="color: var(--n-text-color-3)">波动率</span>
                      <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily }">{{ task.p99_p50_ratio.toFixed(2) }}</span>
                    </template>
                    <template v-if="formatSampleInterval(task.interval)">
                      <span style="color: var(--n-text-color-3)">采样间隔</span>
                      <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily }">{{ formatSampleInterval(task.interval) }}</span>
                    </template>
                    <template v-if="task.total !== undefined">
                      <span style="color: var(--n-text-color-3)">样本数</span>
                      <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily }">{{ task.total }}</span>
                    </template>
                    <template v-if="task.timeoutCount !== undefined && task.timeoutCount > 0">
                      <span style="color: var(--n-text-color-3)">探测超时</span>
                      <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily, color: latencyHex(null) }">{{ task.timeoutCount }} 次</span>
                    </template>
                    <template v-if="task.type">
                      <span style="color: var(--n-text-color-3)">类型</span>
                      <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily }">{{ task.type.toUpperCase() }}</span>
                    </template>
                  </div>
                </NTooltip>
              </div>
              <!--
                  数字配色与 komari-theme-naive 对齐：延迟用主文本色，丢包/波动继承浅文本色，
                  不按分级着色。这几档颜色之所以必须是中性色，是因为卡片在启用自定义背景时
                  会套一层毛玻璃（背景透过来），再叠绿/橙分级色会与背景撞色、可读性变差。
                -->
              <div class="ping-task-card__metrics text-sm mt-1 flex gap-3 items-center" style="color: var(--n-text-color-3)">
                <span
                  class="font-medium"
                  :style="{
                    fontFamily: appStore.numberFontFamily,
                    color: 'var(--n-text-color-1)',
                  }"
                >
                  {{ task.latestValue !== null ? formatLatencyValue(task.latestValue) : '-' }}
                </span>
                <template v-if="task.lossMeasured || (task.timeoutCount ?? 0) > 0">
                  <span class="opacity-60">•</span>
                  <span :style="{ fontFamily: appStore.numberFontFamily }">
                    {{ formatLossValue(task.loss) }} 丢包{{ task.lossMeasured ? '' : '(估)' }}
                  </span>
                </template>
                <template v-if="(task.timeoutCount ?? 0) > 0">
                  <span class="opacity-60">•</span>
                  <span :style="{ fontFamily: appStore.numberFontFamily, color: latencyHex(null) }">{{ task.timeoutCount }} 次超时</span>
                </template>
                <template v-if="task.p99_p50_ratio !== undefined">
                  <span class="opacity-60">•</span>
                  <span :style="{ fontFamily: appStore.numberFontFamily }" title="波动率 p99/p50">{{ task.p99_p50_ratio.toFixed(1) }} 波动</span>
                </template>
              </div>
            </div>
          </button>
        </div>

        <div class="ping-actions flex flex-wrap gap-4 items-center justify-between">
          <div class="flex gap-2 items-center">
            <NSwitch v-model:value="cutPeak" size="small" aria-label="裁剪延迟峰值" />
            <span class="text-sm">裁剪峰值</span>
            <NTooltip>
              <template #trigger>
                <span class="i-carbon-information text-sm opacity-50 cursor-help transition-opacity hover:opacity-100" style="color: var(--n-text-color-3)" />
              </template>
              <span>使用 EWMA 算法平滑数据并过滤突变值</span>
            </NTooltip>
          </div>
          <div class="flex gap-2 items-center">
            <NButton size="small" tertiary @click="showAllTasks">
              全选
            </NButton>
            <NButton size="small" tertiary @click="hideAllTasks">
              全不选
            </NButton>
          </div>
        </div>

        <div class="ping-trend-panel">
          <div class="ping-trend-panel__header">
            <div class="text-sm font-semibold">
              延迟趋势
            </div>
            <span class="text-xs" style="color: var(--n-text-color-3)">{{ selectedTasks.length }} / {{ tasks.length }}</span>
          </div>
          <div class="ping-chart__canvas" role="img" :aria-label="`延迟趋势图，已选择 ${selectedTasks.length} 个监测任务`">
            <VChart :option="pingChartOption" autoresize />
          </div>
        </div>
      </template>
    </NSpin>
  </div>
</template>

<style scoped>
/*
 * 隔离 NSpin 注入的主题变量。
 *
 * naive-ui 的 spin 主题把 `--n-color` 与 `--n-text-color` **都设为主色**
 * （spin/styles/light：color / textColor 默认取 primaryColor）。这些变量会顺着继承污染整个子树：
 *   1. 玻璃卡片 `.glass-surface-enabled` 用的是 `var(--n-color)` → 整张卡片被染成主色；
 *   2. `.ping-task-card { color: var(--n-text-color) }` → 卡内所有文字也变成主色，绿底绿字。
 * 另外 NSpin **不定义** `--n-text-color-1/2/3`，本组件里大量 `var(--n-text-color-N)` 声明因此
 * 整条失效、回落到继承来的主色 —— 这也是「改了数字颜色却不生效」的原因。
 *
 * 在内容容器上把这几档变量还原为中性色即可。两个要点：
 *   - 内容容器由 NSpin 渲染，**不带本组件的 scope 属性**，必须用 `:deep()` 才能命中；
 *   - 必须 `!important`：NSpin 的变量是行内样式，普通规则的优先级盖不过它。
 */
:deep(.ping-chart__content) {
  --n-color: var(--ping-surface) !important;
  --n-text-color: var(--ping-text-1) !important;
  --n-text-color-1: var(--ping-text-1) !important;
  --n-text-color-2: var(--ping-text-2) !important;
  --n-text-color-3: var(--ping-text-3) !important;
}

.ping-actions,
.ping-trend-panel {
  /* 显式给中性文本色：否则会继承 NSpin 注入的主色（见上方说明） */
  color: var(--ping-text-1);
  border: 1px solid var(--ping-border);
  border-radius: var(--ping-radius);
  background: color-mix(in srgb, var(--ping-surface) 96%, var(--ping-surface-hover));
}

.ping-task-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.ping-chart--page .ping-task-grid {
  grid-template-columns: repeat(auto-fill, minmax(240px, 320px));
}

.ping-task-card {
  position: relative;
  min-width: 0;
  overflow: hidden;
  color: var(--n-text-color);
  text-align: left;
  border-color: var(--ping-border);
  border-radius: var(--ping-radius);
  font: inherit;
  transition:
    border-color 180ms ease,
    opacity 180ms ease;
}

.ping-task-card--selected {
  border-color: color-mix(in srgb, var(--task-color) 38%, var(--ping-border));
}

.ping-task-card--muted {
  opacity: 0.48;
}

.ping-task-card:hover,
.ping-task-card:focus-visible {
  border-color: var(--task-color) !important;
  outline: none;
  opacity: 1;
}

.ping-task-card__metrics {
  flex-wrap: wrap;
  row-gap: 4px;
}

.ping-task-card__metrics > span {
  white-space: nowrap;
}

.ping-task-card:focus-visible {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--task-color) 28%, transparent);
}

.ping-actions {
  min-height: 46px;
  padding: 8px 12px;
}

.ping-trend-panel {
  overflow: hidden;
}

.ping-trend-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--ping-border) 70%, transparent);
}

.ping-chart__canvas {
  height: 320px;
  padding: 2px 4px 0;
}

.ping-chart--modal .ping-task-grid {
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
}

.ping-chart--modal .ping-chart__canvas {
  height: min(42vh, 360px);
  min-height: 260px;
}

@media (max-width: 640px) {
  .ping-task-grid,
  .ping-chart--page .ping-task-grid,
  .ping-chart--modal .ping-task-grid {
    grid-template-columns: 1fr;
  }

  .ping-actions {
    gap: 10px;
  }

  .ping-chart__canvas {
    height: 280px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ping-task-card {
    transition: none;
  }
}

@media (min-width: 641px) and (max-width: 900px) {
  .ping-chart--modal .ping-task-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* 默认任务卡片样式 */
.task-card-default {
  background-color: rgba(255, 255, 255, 0.9);
  border-radius: var(--ping-radius);
  border: 1px solid rgba(0, 0, 0, 0.06);
}

html.dark .task-card-default {
  background-color: rgba(30, 30, 35, 0.95);
  border-color: rgba(255, 255, 255, 0.08);
}

/* 毛玻璃任务卡片样式 */
.glass-task-enabled {
  border-radius: var(--ping-radius);
}
</style>
