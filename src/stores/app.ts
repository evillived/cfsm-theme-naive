import type { SiteConfig } from '@/types/cfsm'
import type { UptimeFormat } from '@/utils/helper'
import type { ThemeMode } from '@/utils/themeSettings'
import { usePreferredDark, useStorageAsync } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useThemeSettingsStore } from '@/stores/themeSettings'
import { resolveThemeSettings, toByteDecimals } from '@/utils/themeSettings'

type Lang = 'zh-CN' | 'en-US'
type NodeViewMode = 'card' | 'list'

/** CF-Server-Monitor 的管理后台入口，由内置默认主题接管 */
export const ADMIN_URL = '/admin#admin'

/**
 * 站点通过 `<meta name="preferredTheme">` 下发的默认外观（可选）。
 * CFSM 自身用 `/api/config` 的 `preferred_theme`，这里只做兜底解析。
 */
function readPreferredTheme(value: unknown): ThemeMode {
  return value === 'light' || value === 'dark' || value === 'auto' ? value : 'auto'
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
  const themeSettingsStore = useThemeSettingsStore()

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

  // ==================== 主题设置 ====================

  /** 站长在后台「主题自定义配置」里写的预设；未配置时为空对象 */
  const backendThemeOptions = computed<Record<string, unknown>>(() => siteConfig.value?.theme_options ?? {})

  /** 本机在主题设置页里改过的键；未改过时为空对象 */
  const localThemeOverrides = computed<Record<string, unknown>>(() => themeSettingsStore.overrides)

  /**
   * 生效中的主题设置：默认值 ← 后端预设 ← 本机覆盖。
   *
   * 所有设置类消费方都应读这里，而不是直接读 `backendThemeOptions`——
   * 否则本机设置不会生效。
   */
  const themeSettings = computed(() => resolveThemeSettings(backendThemeOptions.value, localThemeOverrides.value))

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
  const preferredTheme = computed<ThemeMode>(() => readPreferredTheme(siteConfig.value?.preferred_theme))

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

  const defaultViewMode = computed<NodeViewMode>(() => themeSettings.value.defaultViewMode)

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

  // ==================== 运行与访问 ====================

  /** 图表轮询与动画的刷新间隔（秒） */
  const dataUpdateInterval = computed<number>(() => themeSettings.value.dataUpdateInterval)

  /** 是否启用 WebSocket 实时推送 */
  const enableRealtime = computed<boolean>(() => themeSettings.value.enableRealtime)

  const showAdminEntry = computed<boolean>(() => themeSettings.value.showAdminEntry)

  const hideSingleGroupTab = computed<boolean>(() => themeSettings.value.hideSingleGroupTab)

  const showPingChartButton = computed<boolean>(() => themeSettings.value.showPingChartButton)

  // ==================== 布局与卡片 ====================

  const showGeneralCards = computed<boolean>(() => themeSettings.value.showGeneralCards)

  const fullWidth = computed<boolean>(() => themeSettings.value.fullWidth)

  const maxPageWidth = computed<string>(() => themeSettings.value.maxPageWidth)

  const maxPageWidthMobile = computed<string>(() => themeSettings.value.maxPageWidthMobile)

  const borderRadius = computed<string>(() => themeSettings.value.borderRadius)

  const fontFamily = computed<string>(() => themeSettings.value.fontFamily)

  const numberFontFamily = computed<string>(() => themeSettings.value.numberFontFamily)

  const cardProgressLayout = computed(() => themeSettings.value.cardProgressLayout)

  const cardSize = computed(() => themeSettings.value.cardSize)

  const cardMinWidth = computed<number>(() => themeSettings.value.cardMinWidth)

  const cardMetrics = computed(() => themeSettings.value.cardMetrics)

  const tagsInSeparateRow = computed<boolean>(() => themeSettings.value.tagsInSeparateRow)

  const uptimeTagWrap = computed<boolean>(() => themeSettings.value.uptimeTagWrap)

  const uptimeFormat = computed<UptimeFormat>(() => themeSettings.value.uptimeFormat)

  const lightCardContrast = computed<boolean>(() => themeSettings.value.lightCardContrast)

  const trafficSplitColor = computed<boolean>(() => themeSettings.value.trafficSplitColor)

  // ==================== 主题配色 ====================

  const lightPrimaryColor = computed<string>(() => themeSettings.value.lightPrimaryColor)
  const lightPrimaryColorHover = computed<string>(() => themeSettings.value.lightPrimaryColorHover)
  const lightPrimaryColorPressed = computed<string>(() => themeSettings.value.lightPrimaryColorPressed)

  const darkPrimaryColor = computed<string>(() => themeSettings.value.darkPrimaryColor)
  const darkPrimaryColorHover = computed<string>(() => themeSettings.value.darkPrimaryColorHover)
  const darkPrimaryColorPressed = computed<string>(() => themeSettings.value.darkPrimaryColorPressed)

  /** 当前外观下生效的主色三元组 */
  const primaryColors = computed(() => (isDark.value
    ? {
        primary: darkPrimaryColor.value,
        hover: darkPrimaryColorHover.value,
        pressed: darkPrimaryColorPressed.value,
      }
    : {
        primary: lightPrimaryColor.value,
        hover: lightPrimaryColorHover.value,
        pressed: lightPrimaryColorPressed.value,
      }))

  // ==================== List 视图 ====================

  const listViewColumns = computed(() => themeSettings.value.listViewColumns)

  const listColumnWidths = computed<Record<string, string>>(() => themeSettings.value.listColumnWidths)

  const listColumnPadding = computed<Record<string, string>>(() => themeSettings.value.listColumnPadding)

  const listColumnMargin = computed<Record<string, string>>(() => themeSettings.value.listColumnMargin)

  const listColumnGap = computed<string>(() => themeSettings.value.listColumnGap)

  const listRowHeight = computed<string>(() => themeSettings.value.listRowHeight)

  const listStatusStyle = computed(() => themeSettings.value.listStatusStyle)

  const listTagsStyle = computed(() => themeSettings.value.listTagsStyle)

  // ==================== 格式化 ====================

  const byteDecimals = computed(() => toByteDecimals(themeSettings.value))

  // ==================== 公告 ====================

  const alertEnabled = computed<boolean>(() => themeSettings.value.alertEnabled)

  const alertType = computed(() => themeSettings.value.alertType)

  const alertTitle = computed<string>(() => themeSettings.value.alertTitle)
  const alertContent = computed<string>(() => themeSettings.value.alertContent)

  // ==================== 备案 ====================

  const icpEnabled = computed<boolean>(() => themeSettings.value.icpEnabled)
  const icpNumber = computed<string>(() => themeSettings.value.icpNumber)
  const icpUrl = computed<string>(() => themeSettings.value.icpUrl)

  const policeEnabled = computed<boolean>(() => themeSettings.value.policeEnabled)
  const policeNumber = computed<string>(() => themeSettings.value.policeNumber)
  const policeUrl = computed<string>(() => themeSettings.value.policeUrl)

  // ==================== 自定义背景 ====================

  const backgroundEnabled = computed<boolean>(() => themeSettings.value.backgroundEnabled)

  const backgroundType = computed(() => themeSettings.value.backgroundType)

  const lightBackgroundUrl = computed<string>(() => themeSettings.value.lightBackgroundUrl)
  const darkBackgroundUrl = computed<string>(() => themeSettings.value.darkBackgroundUrl)

  const backgroundBlur = computed<number>(() => themeSettings.value.backgroundBlur)
  const backgroundOverlay = computed<number>(() => themeSettings.value.backgroundOverlay)
  const cardBlurRadius = computed<number>(() => themeSettings.value.cardBlurRadius)

  const currentBackgroundUrl = computed<string>(() => (isDark.value ? darkBackgroundUrl.value : lightBackgroundUrl.value))

  return {
    loading,
    siteConfig,
    backendThemeOptions,
    localThemeOverrides,
    themeSettings,
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
    dataUpdateInterval,
    enableRealtime,
    showAdminEntry,
    hideSingleGroupTab,
    showPingChartButton,
    fullWidth,
    maxPageWidth,
    maxPageWidthMobile,
    borderRadius,
    fontFamily,
    numberFontFamily,
    cardProgressLayout,
    cardSize,
    cardMinWidth,
    cardMetrics,
    showGeneralCards,
    tagsInSeparateRow,
    uptimeTagWrap,
    uptimeFormat,
    lightCardContrast,
    trafficSplitColor,
    lightPrimaryColor,
    lightPrimaryColorHover,
    lightPrimaryColorPressed,
    darkPrimaryColor,
    darkPrimaryColorHover,
    darkPrimaryColorPressed,
    primaryColors,
    listViewColumns,
    listColumnWidths,
    listColumnGap,
    listColumnPadding,
    listColumnMargin,
    listRowHeight,
    listStatusStyle,
    listTagsStyle,
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
