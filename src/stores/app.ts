import type { SiteConfig } from '@/types/cfsm'
import type { ByteDecimalsConfig, UptimeFormat } from '@/utils/helper'
import { usePreferredDark, useStorageAsync } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

type ThemeMode = 'auto' | 'light' | 'dark'
type Lang = 'zh-CN' | 'en-US'
type NodeViewMode = 'card' | 'list'
type AlertType = 'default' | 'info' | 'success' | 'warning' | 'error'
export type CardSize = 'compact' | 'comfortable' | 'spacious'
export type CardMetric = 'cpu' | 'memory' | 'disk' | 'traffic'

const DEFAULT_CARD_METRICS: CardMetric[] = ['cpu', 'memory', 'disk', 'traffic']

/** 默认的 List 视图列配置 */
const DEFAULT_LIST_VIEW_COLUMNS = ['status', 'region', 'name', 'tags', 'uptime', 'os', 'cpu', 'mem', 'disk', 'traffic', 'rate'] as const
type ListViewColumn = typeof DEFAULT_LIST_VIEW_COLUMNS[number]

/** 默认的 List 视图列宽度配置 */
const DEFAULT_LIST_COLUMN_WIDTHS: Record<string, string> = {
  status: '76px',
  region: '32px',
  name: 'minmax(200px, 1fr)',
  tags: '200px',
  uptime: 'minmax(180px, 0.6fr)',
  os: '120px',
  cpu: '180px',
  mem: '180px',
  disk: '180px',
  traffic: '180px',
  rate: '140px',
}

/** 默认的字节精度配置 */
const DEFAULT_BYTE_DECIMALS: ByteDecimalsConfig = {
  B: 0,
  KB: 0,
  MB: 1,
  GB: 1,
  TB: 2,
}

/** CF-Server-Monitor 的管理后台入口，由内置默认主题接管 */
export const ADMIN_URL = '/admin#admin'

// ==================== theme_options 读取辅助 ====================
//
// CFSM 的 theme_options 是自由对象：后端不校验类型，主题必须自行做防御式解析。
// 键名沿用本主题既有命名，便于后续接入配置面板。

function optString(options: Record<string, unknown>, key: string, fallback: string): string {
  const value = options[key]
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function optBool(options: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = options[key]
  return typeof value === 'boolean' ? value : fallback
}

function optNumber(options: Record<string, unknown>, key: string, fallback: number): number {
  const value = options[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function optEnum<T extends string>(
  options: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = options[key]
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T : fallback
}

/** 解析 JSON 字符串配置（如 listViewColumns），非法时返回 null */
function optJson(options: Record<string, unknown>, key: string): unknown {
  const value = options[key]
  if (typeof value !== 'string' || !value.trim())
    return null
  try {
    return JSON.parse(value) as unknown
  }
  catch {
    return null
  }
}

/** 比较形如 "2.7.12 Beta" 的版本号，a < b 返回负数 */
function compareVersion(a: string, b: string): number {
  const parse = (input: string) => input.split(/[.\-\s]/).map(part => Number.parseInt(part, 10)).filter(n => !Number.isNaN(n))
  const left = parse(a)
  const right = parse(b)
  const length = Math.max(left.length, right.length)
  for (let i = 0; i < length; i++) {
    const l = left[i] ?? 0
    const r = right[i] ?? 0
    if (l !== r)
      return l - r
  }
  return 0
}

const useAppStore = defineStore('app', () => {
  const loading = ref<boolean>(true)

  // CFSM 站点配置（GET /api/config）
  const siteConfig = ref<SiteConfig>()
  const connectionError = ref<boolean>(false)

  // 使用 VueUse 的 useStorageAsync 实现自动持久化
  const storedThemeMode = useStorageAsync<ThemeMode | null>('themeMode', null, localStorage)
  const lang = ref<Lang>('zh-CN')
  const nodeSelectedGroup = useStorageAsync<string>('nodeSelectedGroup', 'all', localStorage)

  // 首页滚动位置记忆
  const homeScrollPosition = ref<number>(0)

  // 使用 null 表示未设置，等待主题配置加载后决定
  const storedViewMode = useStorageAsync<NodeViewMode | null>('nodeViewMode', null, localStorage)

  /** 主题自定义配置；未配置时为空对象 */
  const themeOptions = computed<Record<string, unknown>>(() => siteConfig.value?.theme_options ?? {})

  // ==================== 站点信息 ====================

  /** 站点标题，由后台外观设置控制 */
  const siteTitle = computed<string>(() => siteConfig.value?.site_title?.trim() || 'CF-Server-Monitor')

  /** 当前 Workers 版本 */
  const version = computed<string>(() => siteConfig.value?.version ?? '')

  /** 最新 Workers 版本，仅登录后返回，未登录时为 null */
  const lastWorkersVersion = computed<string | null>(() => siteConfig.value?.last_workers_version ?? null)

  /** 是否已通过登录验证（非公开站点需要） */
  const isAuthorized = computed<boolean>(() => siteConfig.value?.authorization === true)

  /** 当前站点是否为公开站点 */
  const isPublicSite = computed<boolean>(() => siteConfig.value?.is_public !== false)

  /** 是否存在 Workers 版本升级提示 */
  const hasWorkersUpdate = computed<boolean>(() => {
    const latest = lastWorkersVersion.value
    const current = version.value
    if (!latest || !current)
      return false
    return compareVersion(current, latest) < 0
  })

  /** `/api/servers` 的延迟/丢包窗口参数 */
  const latencyWindow = computed(() => siteConfig.value?.latency_window ?? { points: 20, hours: 2 })

  /** 长历史查询采样点数（60 / 120 / 180 / 240） */
  const longHistoryPoints = computed<number>(() => siteConfig.value?.long_history_points ?? 120)

  /** 实时订阅单次连接超时分钟数，0 表示不断开 */
  const frontendWsTimeoutMinutes = computed<number>(() => siteConfig.value?.frontend_ws_timeout_minutes ?? 0)

  const setSiteConfig = (config: SiteConfig) => {
    siteConfig.value = config
  }

  // ==================== 主题模式 ====================

  /** 后台配置的默认外观（CFSM preferred_theme） */
  const preferredTheme = computed<ThemeMode>(() =>
    optEnum<ThemeMode>({ value: siteConfig.value?.preferred_theme }, 'value', ['auto', 'light', 'dark'], 'auto'),
  )

  /** 当前主题模式：用户选择优先，未选择时跟随后台 preferred_theme */
  const themeMode = computed<ThemeMode>({
    get: () => storedThemeMode.value ?? preferredTheme.value,
    set: (value) => {
      storedThemeMode.value = value
    },
  })

  // 使用 VueUse 的 usePreferredDark 检测系统主题偏好
  const prefersDark = usePreferredDark()

  const isDark = computed(() => {
    if (themeMode.value === 'auto')
      return prefersDark.value
    return themeMode.value === 'dark'
  })

  function updateThemeMode(mode?: ThemeMode) {
    if (mode) {
      themeMode.value = mode
      return
    }

    const nextMode: Record<ThemeMode, ThemeMode> = {
      auto: 'light',
      light: 'dark',
      dark: 'auto',
    }

    themeMode.value = nextMode[themeMode.value]
  }

  function updateLang(newLang: Lang) {
    lang.value = newLang
  }

  // ==================== 视图模式 ====================

  const defaultViewMode = computed<NodeViewMode>(() =>
    optEnum<NodeViewMode>(themeOptions.value, 'defaultViewMode', ['card', 'list'], 'card'),
  )

  function isValidViewMode(value: string | null): value is NodeViewMode {
    return value === 'card' || value === 'list'
  }

  const nodeViewMode = computed<NodeViewMode>({
    get: () => {
      if (storedViewMode.value !== null && isValidViewMode(storedViewMode.value))
        return storedViewMode.value
      return defaultViewMode.value
    },
    set: (val) => {
      storedViewMode.value = val
    },
  })

  // 站点配置加载后，把默认视图模式写入本地存储（仅在用户尚未选择过时）
  watch(siteConfig, (config) => {
    if (config && !isValidViewMode(storedViewMode.value))
      storedViewMode.value = defaultViewMode.value
  })

  // ==================== 布局与卡片 ====================

  const showAdminEntry = computed<boolean>(() => optBool(themeOptions.value, 'showAdminEntry', true))

  const fullWidth = computed<boolean>(() => optBool(themeOptions.value, 'fullWidth', false))

  const maxPageWidth = computed<string>(() => optString(themeOptions.value, 'maxPageWidth', '1800px'))

  const cardProgressLayout = computed<'1col' | '2col'>(() =>
    optEnum<'1col' | '2col'>(themeOptions.value, 'cardProgressLayout', ['1col', '2col'], '2col'),
  )

  const cardSize = computed<CardSize>(() =>
    optEnum<CardSize>(themeOptions.value, 'cardSize', ['compact', 'comfortable', 'spacious'], 'comfortable'),
  )

  const cardMinWidth = computed<number>(() => {
    const value = optNumber(themeOptions.value, 'cardMinWidth', 340)
    return value >= 280 && value <= 520 ? value : 340
  })

  const cardMetrics = computed<CardMetric[]>(() => {
    const parsed = optJson(themeOptions.value, 'cardMetrics')
    if (!Array.isArray(parsed))
      return DEFAULT_CARD_METRICS
    const metrics = parsed.filter((metric): metric is CardMetric => DEFAULT_CARD_METRICS.includes(metric as CardMetric))
    return metrics.length > 0 ? [...new Set(metrics)] : DEFAULT_CARD_METRICS
  })

  const showGeneralCards = computed<boolean>(() => optBool(themeOptions.value, 'showGeneralCards', true))

  const numberFontFamily = computed<string>(() =>
    optString(themeOptions.value, 'numberFontFamily', '"TCloud Number VF", "MiSans VF", sans-serif'),
  )

  const hideSingleGroupTab = computed<boolean>(() => optBool(themeOptions.value, 'hideSingleGroupTab', true))

  const tagsInSeparateRow = computed<boolean>(() => optBool(themeOptions.value, 'tagsInSeparateRow', false))

  const uptimeTagWrap = computed<boolean>(() => optBool(themeOptions.value, 'uptimeTagWrap', false))

  const uptimeFormat = computed<UptimeFormat>(() =>
    optEnum<UptimeFormat>(themeOptions.value, 'uptimeFormat', ['day', 'hour', 'minute', 'second'], 'day'),
  )

  const lightCardContrast = computed<boolean>(() => optBool(themeOptions.value, 'lightCardContrast', false))

  const trafficSplitColor = computed<boolean>(() => optBool(themeOptions.value, 'trafficSplitColor', true))

  const showPingChartButton = computed<boolean>(() => optBool(themeOptions.value, 'showPingChartButton', true))

  // ==================== List 视图 ====================

  const listViewColumns = computed<ListViewColumn[]>(() => {
    const parsed = optJson(themeOptions.value, 'listViewColumns')
    if (!Array.isArray(parsed) || parsed.length === 0)
      return [...DEFAULT_LIST_VIEW_COLUMNS]

    const validColumns: ListViewColumn[] = []
    for (const col of parsed) {
      if (typeof col === 'string' && DEFAULT_LIST_VIEW_COLUMNS.includes(col as ListViewColumn))
        validColumns.push(col as ListViewColumn)
    }
    return validColumns.length > 0 ? validColumns : [...DEFAULT_LIST_VIEW_COLUMNS]
  })

  const listColumnWidths = computed<Record<string, string>>(() => {
    const parsed = optJson(themeOptions.value, 'listColumnWidths')
    const merged = { ...DEFAULT_LIST_COLUMN_WIDTHS }
    if (typeof parsed !== 'object' || parsed === null)
      return merged
    const record = parsed as Record<string, unknown>
    for (const col of DEFAULT_LIST_VIEW_COLUMNS) {
      const value = record[col]
      if (typeof value === 'string' && value.trim())
        merged[col] = value.trim()
    }
    return merged
  })

  /** 解析「列名 → CSS 值」形式的 JSON 配置 */
  function readColumnValues(key: string): Record<string, string> {
    const parsed = optJson(themeOptions.value, key)
    const result: Record<string, string> = {}
    if (typeof parsed !== 'object' || parsed === null)
      return result
    const record = parsed as Record<string, unknown>
    for (const col of DEFAULT_LIST_VIEW_COLUMNS) {
      const value = record[col]
      if (typeof value === 'string' && value.trim())
        result[col] = value.trim()
    }
    return result
  }

  const listColumnPadding = computed<Record<string, string>>(() => readColumnValues('listColumnPadding'))
  const listColumnMargin = computed<Record<string, string>>(() => readColumnValues('listColumnMargin'))
  const listColumnGap = computed<string>(() => optString(themeOptions.value, 'listColumnGap', '12px'))
  const listRowHeight = computed<string>(() => optString(themeOptions.value, 'listRowHeight', ''))

  const listStatusStyle = computed<'tag' | 'badge'>(() =>
    optEnum<'tag' | 'badge'>(themeOptions.value, 'listStatusStyle', ['tag', 'badge'], 'tag'),
  )

  const listTagsStyle = computed<'tag' | 'badge'>(() =>
    optEnum<'tag' | 'badge'>(themeOptions.value, 'listTagsStyle', ['tag', 'badge'], 'tag'),
  )

  // ==================== 格式化 ====================

  const byteDecimals = computed<ByteDecimalsConfig>(() => {
    const options = themeOptions.value
    const config: ByteDecimalsConfig = { ...DEFAULT_BYTE_DECIMALS }
    const read = (key: string) => {
      const value = options[key]
      return typeof value === 'number' && Number.isInteger(value) ? value : undefined
    }
    config.B = read('byteDecimalsB') ?? config.B
    config.KB = read('byteDecimalsKB') ?? config.KB
    config.MB = read('byteDecimalsMB') ?? config.MB
    config.GB = read('byteDecimalsGB') ?? config.GB
    config.TB = read('byteDecimalsTB') ?? config.TB
    return config
  })

  // ==================== 公告 ====================

  const alertEnabled = computed<boolean>(() => optBool(themeOptions.value, 'alertEnabled', false))

  const alertType = computed<AlertType>(() =>
    optEnum<AlertType>(themeOptions.value, 'alertType', ['default', 'info', 'success', 'warning', 'error'], 'info'),
  )

  const alertTitle = computed<string>(() => optString(themeOptions.value, 'alertTitle', ''))
  const alertContent = computed<string>(() => optString(themeOptions.value, 'alertContent', ''))

  // ==================== 备案 ====================

  const icpEnabled = computed<boolean>(() => optBool(themeOptions.value, 'icpEnabled', false))
  const icpNumber = computed<string>(() => optString(themeOptions.value, 'icpNumber', ''))
  const icpUrl = computed<string>(() => optString(themeOptions.value, 'icpUrl', 'https://beian.miit.gov.cn/'))

  const policeEnabled = computed<boolean>(() => optBool(themeOptions.value, 'policeEnabled', false))
  const policeNumber = computed<string>(() => optString(themeOptions.value, 'policeNumber', ''))
  const policeUrl = computed<string>(() => optString(themeOptions.value, 'policeUrl', ''))

  // ==================== 自定义背景 ====================

  const backgroundEnabled = computed<boolean>(() => optBool(themeOptions.value, 'backgroundEnabled', false))

  const backgroundType = computed<'image' | 'video'>(() =>
    optEnum<'image' | 'video'>(themeOptions.value, 'backgroundType', ['image', 'video'], 'image'),
  )

  const lightBackgroundUrl = computed<string>(() => optString(themeOptions.value, 'lightBackgroundUrl', ''))
  const darkBackgroundUrl = computed<string>(() => optString(themeOptions.value, 'darkBackgroundUrl', ''))

  const backgroundBlur = computed<number>(() => {
    const value = optNumber(themeOptions.value, 'backgroundBlur', 0)
    return value >= 0 ? value : 0
  })

  const backgroundOverlay = computed<number>(() => {
    const value = optNumber(themeOptions.value, 'backgroundOverlay', 0)
    return value >= 0 && value <= 100 ? value : 0
  })

  const cardBlurRadius = computed<number>(() => {
    const value = optNumber(themeOptions.value, 'cardBlurRadius', 12)
    return value >= 0 ? value : 12
  })

  const currentBackgroundUrl = computed<string>(() => (isDark.value ? darkBackgroundUrl.value : lightBackgroundUrl.value))

  return {
    loading,
    siteConfig,
    themeOptions,
    siteTitle,
    version,
    lastWorkersVersion,
    hasWorkersUpdate,
    isAuthorized,
    isPublicSite,
    latencyWindow,
    longHistoryPoints,
    frontendWsTimeoutMinutes,
    setSiteConfig,
    themeMode,
    preferredTheme,
    isDark,
    lang,
    nodeSelectedGroup,
    nodeViewMode,
    defaultViewMode,
    showAdminEntry,
    fullWidth,
    maxPageWidth,
    cardProgressLayout,
    cardSize,
    cardMinWidth,
    cardMetrics,
    showGeneralCards,
    numberFontFamily,
    listViewColumns,
    hideSingleGroupTab,
    listColumnWidths,
    listColumnGap,
    listColumnPadding,
    listColumnMargin,
    listRowHeight,
    listStatusStyle,
    listTagsStyle,
    showPingChartButton,
    tagsInSeparateRow,
    uptimeTagWrap,
    uptimeFormat,
    lightCardContrast,
    trafficSplitColor,
    byteDecimals,
    alertEnabled,
    alertType,
    alertTitle,
    alertContent,
    icpEnabled,
    icpNumber,
    icpUrl,
    policeEnabled,
    policeNumber,
    policeUrl,
    backgroundEnabled,
    backgroundType,
    lightBackgroundUrl,
    darkBackgroundUrl,
    currentBackgroundUrl,
    backgroundBlur,
    backgroundOverlay,
    cardBlurRadius,
    connectionError,
    homeScrollPosition,
    updateThemeMode,
    updateLang,
  }
})

export { useAppStore }
