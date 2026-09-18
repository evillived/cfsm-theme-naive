/**
 * 主题设置的单一来源：类型、默认值、归一化，以及设置页用的声明式清单。
 *
 * ## 三级优先级
 *
 * CFSM 的第三方主题**不能**调用管理端接口，`/api/config` 里的 `theme_options` 对主题是只读的
 * （只有站长登录后持有 JWT 时，才能用 `POST /api/theme_options` 写回站点级预设）。因此设置按
 * 下面的顺序合并，后面的覆盖前面的：
 *
 * ```text
 * 主题默认值  ←  后端 theme_options（站长预设，对所有访客生效）  ←  本机覆盖（localStorage，只影响本设备）
 * ```
 *
 * ## 键名与线格式
 *
 * 键名刻意与 `komari-theme-naive` 的 `komari-theme.json` 完全一致，便于站长把原有的主题配置
 * 直接粘进 CFSM 后台的「主题自定义配置」。komari 那边把「数组 / 对象」类配置以 **JSON 字符串**
 * 承载，本模块的 `normalizeThemeSettings` 两种形态都接受，`serializeThemeSettings` 再按
 * JSON 字符串写回，保证往返一致。
 */

import type { ByteDecimalsConfig, UptimeFormat } from '@/utils/helper'

export type ThemeMode = 'auto' | 'light' | 'dark'
export type NodeViewMode = 'card' | 'list'
export type CardSize = 'compact' | 'comfortable' | 'spacious'
export type CardMetric = 'cpu' | 'memory' | 'disk' | 'traffic'
export type CardProgressLayout = '1col' | '2col'
export type StatusStyle = 'tag' | 'badge'
export type AlertType = 'default' | 'info' | 'success' | 'warning' | 'error'
export type BackgroundType = 'image' | 'video'

/** List 视图可显示的列；顺序即默认顺序 */
export const LIST_VIEW_COLUMNS = [
  'status',
  'region',
  'name',
  'tags',
  'uptime',
  'os',
  'cpu',
  'mem',
  'disk',
  'traffic',
  'latency',
  'rate',
] as const
export type ListViewColumn = typeof LIST_VIEW_COLUMNS[number]

/** 列的中文标题，供设置页与列表表头共用 */
export const LIST_COLUMN_LABELS: Record<ListViewColumn, string> = {
  status: '状态',
  region: '地区',
  name: '节点',
  tags: '标签',
  uptime: '运行时间',
  os: '系统',
  cpu: 'CPU',
  mem: '内存',
  disk: '硬盘',
  traffic: '流量',
  latency: '延迟',
  rate: '速率',
}

/** 卡片可选指标，按固定顺序展示 */
export const CARD_METRICS = ['cpu', 'memory', 'disk', 'traffic'] as const

export const CARD_METRIC_LABELS: Record<CardMetric, string> = {
  cpu: 'CPU',
  memory: '内存',
  disk: '硬盘',
  traffic: '流量',
}

export const THEME_MODE_OPTIONS: { value: ThemeMode, label: string }[] = [
  { value: 'auto', label: '跟随系统' },
  { value: 'light', label: '亮色' },
  { value: 'dark', label: '暗色' },
]

export const NODE_VIEW_MODE_OPTIONS: { value: NodeViewMode, label: string }[] = [
  { value: 'card', label: '卡片' },
  { value: 'list', label: '列表' },
]

export const CARD_SIZE_OPTIONS: { value: CardSize, label: string }[] = [
  { value: 'compact', label: '紧凑' },
  { value: 'comfortable', label: '舒适' },
  { value: 'spacious', label: '宽松' },
]

export const CARD_PROGRESS_LAYOUT_OPTIONS: { value: CardProgressLayout, label: string }[] = [
  { value: '2col', label: '一行两列' },
  { value: '1col', label: '一行一列' },
]

export const STATUS_STYLE_OPTIONS: { value: StatusStyle, label: string }[] = [
  { value: 'tag', label: '标签' },
  { value: 'badge', label: '徽章' },
]

export const UPTIME_FORMAT_OPTIONS: { value: UptimeFormat, label: string }[] = [
  { value: 'day', label: '精确到天' },
  { value: 'hour', label: '精确到小时' },
  { value: 'minute', label: '精确到分钟' },
  { value: 'second', label: '精确到秒' },
]

export const ALERT_TYPE_OPTIONS: { value: AlertType, label: string }[] = [
  { value: 'default', label: '默认' },
  { value: 'info', label: '信息' },
  { value: 'success', label: '成功' },
  { value: 'warning', label: '警告' },
  { value: 'error', label: '错误' },
]

export const BACKGROUND_TYPE_OPTIONS: { value: BackgroundType, label: string }[] = [
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
]

/**
 * 移动端断点（px）—— 视口宽度 **≤ 该值** 时按移动端处理。
 *
 * 与全站媒体查询保持一致（`HomeView` / `PingChart` 都以 640px 为界，UnoCSS `sm` 同为 640px）。
 * 页面容器的最大宽度据此在 `maxPageWidth` 与 `maxPageWidthMobile` 之间切换。
 */
export const MOBILE_BREAKPOINT_PX = 640

/** 解析后的设置：数组 / 对象已是原生形态，可直接被组件消费 */
export interface ResolvedThemeSettings {
  // ===== 运行与访问 =====
  /** 实时数据刷新间隔（秒），用于图表动画与历史采样节流 */
  dataUpdateInterval: number
  /** 是否建立 WebSocket 实时推送；关闭后仅依赖 REST 首屏数据（省额度） */
  enableRealtime: boolean
  defaultViewMode: NodeViewMode
  /** CFSM 无登录页，这里对应「显示管理后台入口」 */
  showAdminEntry: boolean
  showPingChartButton: boolean
  hideSingleGroupTab: boolean

  // ===== 首页内容 =====
  showGeneralCards: boolean

  // ===== 节点卡片 =====
  cardSize: CardSize
  cardMinWidth: number
  cardMetrics: CardMetric[]
  lightCardContrast: boolean
  cardProgressLayout: CardProgressLayout
  tagsInSeparateRow: boolean
  uptimeTagWrap: boolean
  trafficSplitColor: boolean

  // ===== 列表视图 =====
  listRowHeight: string
  listStatusStyle: StatusStyle
  listTagsStyle: StatusStyle
  listColumnGap: string
  listViewColumns: ListViewColumn[]
  listColumnWidths: Record<string, string>
  listColumnPadding: Record<string, string>
  listColumnMargin: Record<string, string>

  // ===== 页面与排版 =====
  fullWidth: boolean
  /** PC 端最大页面宽度（视口 > 640px 时生效） */
  maxPageWidth: string
  /** 移动端最大页面宽度（视口 ≤ 640px 时生效） */
  maxPageWidthMobile: string
  borderRadius: string
  fontFamily: string
  numberFontFamily: string

  // ===== 亮色模式主题 =====
  lightPrimaryColor: string
  lightPrimaryColorHover: string
  lightPrimaryColorPressed: string

  // ===== 暗色模式主题 =====
  darkPrimaryColor: string
  darkPrimaryColorHover: string
  darkPrimaryColorPressed: string

  // ===== 格式化 =====
  uptimeFormat: UptimeFormat
  byteDecimalsB: number
  byteDecimalsKB: number
  byteDecimalsMB: number
  byteDecimalsGB: number
  byteDecimalsTB: number

  // ===== 公告 =====
  alertEnabled: boolean
  alertType: AlertType
  alertTitle: string
  alertContent: string

  // ===== 备案 =====
  icpEnabled: boolean
  icpNumber: string
  icpUrl: string
  policeEnabled: boolean
  policeNumber: string
  policeUrl: string

  // ===== 自定义背景 =====
  backgroundEnabled: boolean
  backgroundType: BackgroundType
  lightBackgroundUrl: string
  darkBackgroundUrl: string
  backgroundBlur: number
  cardBlurRadius: number
  backgroundOverlay: number
}

export type ThemeSettingsKey = keyof ResolvedThemeSettings

/**
 * 默认的 List 视图列宽度。
 *
 * `tags` 与 `uptime` 刻意收窄到刚好包住内容：两列的内容都很短（几个小标签 / 「12 天 3 小时」），
 * 留宽只会挤压 `name` 列且显得松散。标签在窄列内自动换行，不会被裁切。
 */
export const DEFAULT_LIST_COLUMN_WIDTHS: Record<string, string> = {
  status: '76px',
  region: '32px',
  name: 'minmax(200px, 1fr)',
  tags: '120px',
  uptime: '100px',
  os: '120px',
  cpu: '180px',
  mem: '180px',
  disk: '180px',
  traffic: '180px',
  latency: '104px',
  rate: '140px',
}

/** 主题默认值；后端与本地都没配的键落在这里 */
export const DEFAULT_THEME_SETTINGS: ResolvedThemeSettings = {
  dataUpdateInterval: 3,
  enableRealtime: true,
  defaultViewMode: 'card',
  showAdminEntry: true,
  showPingChartButton: true,
  hideSingleGroupTab: true,

  showGeneralCards: true,

  cardSize: 'comfortable',
  cardMinWidth: 340,
  cardMetrics: [...CARD_METRICS],
  lightCardContrast: false,
  cardProgressLayout: '2col',
  tagsInSeparateRow: false,
  uptimeTagWrap: false,
  trafficSplitColor: true,

  listRowHeight: '',
  listStatusStyle: 'tag',
  listTagsStyle: 'tag',
  listColumnGap: '12px',
  listViewColumns: [...LIST_VIEW_COLUMNS],
  listColumnWidths: { ...DEFAULT_LIST_COLUMN_WIDTHS },
  listColumnPadding: {},
  listColumnMargin: {},

  fullWidth: false,
  maxPageWidth: '1800px',
  // 移动端默认不设限（= 占满可用宽度）：与拆分前的实际表现一致，
  // 因为原来的 1800px 在 ≤640px 的视口上本来就不会产生约束
  maxPageWidthMobile: '100%',
  borderRadius: '3px',
  fontFamily: '"MiSans VF", sans-serif',
  numberFontFamily: '"TCloud Number VF", "MiSans VF", sans-serif',

  lightPrimaryColor: '#18a058',
  lightPrimaryColorHover: '#36ad6a',
  lightPrimaryColorPressed: '#0c7a43',

  darkPrimaryColor: '#63e2b6',
  darkPrimaryColorHover: '#7fe7c4',
  darkPrimaryColorPressed: '#5acea7',

  uptimeFormat: 'day',
  byteDecimalsB: 0,
  byteDecimalsKB: 0,
  byteDecimalsMB: 1,
  byteDecimalsGB: 1,
  byteDecimalsTB: 2,

  alertEnabled: false,
  alertType: 'info',
  alertTitle: '',
  alertContent: '',

  icpEnabled: false,
  icpNumber: '',
  icpUrl: 'https://beian.miit.gov.cn/',
  policeEnabled: false,
  policeNumber: '',
  policeUrl: '',

  backgroundEnabled: false,
  backgroundType: 'image',
  lightBackgroundUrl: '',
  darkBackgroundUrl: '',
  backgroundBlur: 0,
  cardBlurRadius: 12,
  backgroundOverlay: 0,
}

// ==================== 归一化辅助 ====================

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 受控 JSON 解析：既接受 JSON 字符串（komari 的线格式），也接受原生值 */
function parseJsonish(value: unknown): unknown {
  if (typeof value !== 'string')
    return value
  const trimmed = value.trim()
  if (!trimmed)
    return undefined
  try {
    return JSON.parse(trimmed) as unknown
  }
  catch {
    return undefined
  }
}

function pickBool(raw: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = raw[key]
  return typeof value === 'boolean' ? value : fallback
}

function pickString(raw: Record<string, unknown>, key: string, fallback: string): string {
  const value = raw[key]
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

/** 文本类设置：允许空串（如清空公告内容） */
function pickText(raw: Record<string, unknown>, key: string, fallback: string): string {
  const value = raw[key]
  return typeof value === 'string' ? value : fallback
}

function pickNumber(
  raw: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = raw[key]
  if (typeof value !== 'number' || !Number.isFinite(value))
    return fallback
  return Math.min(max, Math.max(min, value))
}

function pickEnum<T extends string>(
  raw: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = raw[key]
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T : fallback
}

/** 解析卡片的 CSS 长度值（如 340 / "340px" / "22rem"），非法则回落默认 */
function pickCssSize(
  raw: Record<string, unknown>,
  key: string,
  fallback: string,
  min: number,
  max: number,
): string {
  const value = raw[key]
  if (typeof value === 'number' && Number.isFinite(value))
    return `${Math.min(max, Math.max(min, value))}px`
  if (typeof value !== 'string' || !value.trim())
    return fallback
  const trimmed = value.trim()
  const numeric = Number.parseFloat(trimmed)
  if (!Number.isFinite(numeric))
    return fallback
  if (trimmed.endsWith('px') && (numeric < min || numeric > max))
    return fallback
  return trimmed
}

/** 列名 → CSS 值的映射；只保留合法列名 */
function pickColumnMap(
  raw: Record<string, unknown>,
  key: string,
  fallback: Record<string, string>,
): Record<string, string> {
  const parsed = parseJsonish(raw[key])
  if (!isRecord(parsed))
    return { ...fallback }
  const result: Record<string, string> = {}
  for (const column of LIST_VIEW_COLUMNS) {
    const value = parsed[column]
    if (typeof value === 'string' && value.trim())
      result[column] = value.trim()
  }
  return result
}

function pickColumnList(raw: Record<string, unknown>, key: string): ListViewColumn[] {
  const parsed = parseJsonish(raw[key])
  if (!Array.isArray(parsed) || parsed.length === 0)
    return [...LIST_VIEW_COLUMNS]
  const valid: ListViewColumn[] = []
  for (const item of parsed) {
    if (typeof item === 'string' && (LIST_VIEW_COLUMNS as readonly string[]).includes(item)) {
      valid.push(item as ListViewColumn)
    }
  }
  return valid.length > 0 ? [...new Set(valid)] : [...LIST_VIEW_COLUMNS]
}

function pickMetricList(raw: Record<string, unknown>, key: string): CardMetric[] {
  const parsed = parseJsonish(raw[key])
  if (!Array.isArray(parsed) || parsed.length === 0)
    return [...CARD_METRICS]
  const valid: CardMetric[] = []
  for (const item of parsed) {
    if (typeof item === 'string' && (CARD_METRICS as readonly string[]).includes(item)) {
      valid.push(item as CardMetric)
    }
  }
  // 按固定顺序输出，避免设置页勾选顺序影响展示顺序
  const unique = new Set(valid)
  return valid.length > 0 ? CARD_METRICS.filter(metric => unique.has(metric)) : [...CARD_METRICS]
}

/**
 * 把任意来源（后端 `theme_options`、本机覆盖、二者的合并结果）归一化为可用的设置。
 *
 * 逐键防御式解析：非法值一律回落默认值，绝不抛错——`theme_options` 是后端不校验类型的自由对象。
 */
export function normalizeThemeSettings(
  source: Record<string, unknown> | null | undefined,
): ResolvedThemeSettings {
  const raw: Record<string, unknown> = isRecord(source) ? source : {}
  const d = DEFAULT_THEME_SETTINGS

  return {
    dataUpdateInterval: pickNumber(raw, 'dataUpdateInterval', d.dataUpdateInterval, 1, 60),
    enableRealtime: pickBool(raw, 'enableRealtime', d.enableRealtime),
    defaultViewMode: pickEnum(raw, 'defaultViewMode', ['card', 'list'], d.defaultViewMode),
    showAdminEntry: pickBool(raw, 'showAdminEntry', d.showAdminEntry),
    showPingChartButton: pickBool(raw, 'showPingChartButton', d.showPingChartButton),
    hideSingleGroupTab: pickBool(raw, 'hideSingleGroupTab', d.hideSingleGroupTab),

    showGeneralCards: pickBool(raw, 'showGeneralCards', d.showGeneralCards),

    cardSize: pickEnum(raw, 'cardSize', ['compact', 'comfortable', 'spacious'], d.cardSize),
    cardMinWidth: Number.parseFloat(pickCssSize(raw, 'cardMinWidth', `${d.cardMinWidth}px`, 280, 520)),
    cardMetrics: pickMetricList(raw, 'cardMetrics'),
    lightCardContrast: pickBool(raw, 'lightCardContrast', d.lightCardContrast),
    cardProgressLayout: pickEnum(raw, 'cardProgressLayout', ['1col', '2col'], d.cardProgressLayout),
    tagsInSeparateRow: pickBool(raw, 'tagsInSeparateRow', d.tagsInSeparateRow),
    uptimeTagWrap: pickBool(raw, 'uptimeTagWrap', d.uptimeTagWrap),
    trafficSplitColor: pickBool(raw, 'trafficSplitColor', d.trafficSplitColor),

    listRowHeight: pickText(raw, 'listRowHeight', d.listRowHeight),
    listStatusStyle: pickEnum(raw, 'listStatusStyle', ['tag', 'badge'], d.listStatusStyle),
    listTagsStyle: pickEnum(raw, 'listTagsStyle', ['tag', 'badge'], d.listTagsStyle),
    listColumnGap: pickString(raw, 'listColumnGap', d.listColumnGap),
    listViewColumns: pickColumnList(raw, 'listViewColumns'),
    listColumnWidths: { ...DEFAULT_LIST_COLUMN_WIDTHS, ...pickColumnMap(raw, 'listColumnWidths', {}) },
    listColumnPadding: pickColumnMap(raw, 'listColumnPadding', {}),
    listColumnMargin: pickColumnMap(raw, 'listColumnMargin', {}),

    fullWidth: pickBool(raw, 'fullWidth', d.fullWidth),
    maxPageWidth: pickString(raw, 'maxPageWidth', d.maxPageWidth),
    maxPageWidthMobile: pickString(raw, 'maxPageWidthMobile', d.maxPageWidthMobile),
    borderRadius: pickString(raw, 'borderRadius', d.borderRadius),
    fontFamily: pickString(raw, 'fontFamily', d.fontFamily),
    numberFontFamily: pickString(raw, 'numberFontFamily', d.numberFontFamily),

    lightPrimaryColor: pickString(raw, 'lightPrimaryColor', d.lightPrimaryColor),
    lightPrimaryColorHover: pickString(raw, 'lightPrimaryColorHover', d.lightPrimaryColorHover),
    lightPrimaryColorPressed: pickString(raw, 'lightPrimaryColorPressed', d.lightPrimaryColorPressed),

    darkPrimaryColor: pickString(raw, 'darkPrimaryColor', d.darkPrimaryColor),
    darkPrimaryColorHover: pickString(raw, 'darkPrimaryColorHover', d.darkPrimaryColorHover),
    darkPrimaryColorPressed: pickString(raw, 'darkPrimaryColorPressed', d.darkPrimaryColorPressed),

    uptimeFormat: pickEnum(raw, 'uptimeFormat', ['day', 'hour', 'minute', 'second'], d.uptimeFormat),
    byteDecimalsB: pickNumber(raw, 'byteDecimalsB', d.byteDecimalsB, 0, 6),
    byteDecimalsKB: pickNumber(raw, 'byteDecimalsKB', d.byteDecimalsKB, 0, 6),
    byteDecimalsMB: pickNumber(raw, 'byteDecimalsMB', d.byteDecimalsMB, 0, 6),
    byteDecimalsGB: pickNumber(raw, 'byteDecimalsGB', d.byteDecimalsGB, 0, 6),
    byteDecimalsTB: pickNumber(raw, 'byteDecimalsTB', d.byteDecimalsTB, 0, 6),

    alertEnabled: pickBool(raw, 'alertEnabled', d.alertEnabled),
    alertType: pickEnum(raw, 'alertType', ['default', 'info', 'success', 'warning', 'error'], d.alertType),
    alertTitle: pickText(raw, 'alertTitle', d.alertTitle),
    alertContent: pickText(raw, 'alertContent', d.alertContent),

    icpEnabled: pickBool(raw, 'icpEnabled', d.icpEnabled),
    icpNumber: pickText(raw, 'icpNumber', d.icpNumber),
    icpUrl: pickText(raw, 'icpUrl', d.icpUrl),
    policeEnabled: pickBool(raw, 'policeEnabled', d.policeEnabled),
    policeNumber: pickText(raw, 'policeNumber', d.policeNumber),
    policeUrl: pickText(raw, 'policeUrl', d.policeUrl),

    backgroundEnabled: pickBool(raw, 'backgroundEnabled', d.backgroundEnabled),
    backgroundType: pickEnum(raw, 'backgroundType', ['image', 'video'], d.backgroundType),
    lightBackgroundUrl: pickText(raw, 'lightBackgroundUrl', d.lightBackgroundUrl),
    darkBackgroundUrl: pickText(raw, 'darkBackgroundUrl', d.darkBackgroundUrl),
    backgroundBlur: pickNumber(raw, 'backgroundBlur', d.backgroundBlur, 0, 60),
    cardBlurRadius: pickNumber(raw, 'cardBlurRadius', d.cardBlurRadius, 0, 60),
    backgroundOverlay: pickNumber(raw, 'backgroundOverlay', d.backgroundOverlay, 0, 100),
  }
}

/**
 * 合并三个来源并归一化：默认值 ← 后端 `theme_options` ← 本机覆盖。
 *
 * 本机覆盖只包含「用户改过的键」，因此未改动的键会原样沿用后端预设。
 */
export function resolveThemeSettings(
  backend: Record<string, unknown> | null | undefined,
  local: Record<string, unknown> | null | undefined,
): ResolvedThemeSettings {
  return normalizeThemeSettings({ ...(isRecord(backend) ? backend : {}), ...(isRecord(local) ? local : {}) })
}

/**
 * 序列化为 komari 兼容的线格式，用于写回后端、导出 JSON 或落盘本机覆盖。
 *
 * 数组 / 对象类配置统一序列化成 JSON 字符串（与 komari-theme.json 的声明一致），
 * 这样导出的 JSON 可以直接粘进 CFSM 后台的「主题自定义配置」，也能被 komari 那边复用。
 * 键集合保持完整（含空对象），便于按同一份键做差异比较。
 */
export function serializeThemeSettings(settings: ResolvedThemeSettings): Record<string, unknown> {
  return {
    ...settings,
    cardMetrics: JSON.stringify(settings.cardMetrics),
    listViewColumns: JSON.stringify(settings.listViewColumns),
    listColumnWidths: JSON.stringify(settings.listColumnWidths),
    listColumnPadding: JSON.stringify(settings.listColumnPadding),
    listColumnMargin: JSON.stringify(settings.listColumnMargin),
  }
}

/**
 * 计算相对基准被改动的键（线格式），用于生成本机覆盖。
 *
 * 只保留差异键的好处：站长日后更新后端预设时，访客没碰过的设置依然会跟着更新，
 * 本机覆盖仅钉住用户真正调整过的那几项。
 */
export function diffThemeSettings(
  base: ResolvedThemeSettings,
  next: ResolvedThemeSettings,
): Record<string, unknown> {
  const baseWire = serializeThemeSettings(base)
  const nextWire = serializeThemeSettings(next)
  const diff: Record<string, unknown> = {}
  for (const key of Object.keys(nextWire)) {
    if (JSON.stringify(nextWire[key]) !== JSON.stringify(baseWire[key]))
      diff[key] = nextWire[key]
  }
  return diff
}

/** 深拷贝一份设置，供设置页草稿使用（数组 / 对象只拷一层结构，值均不可变） */
export function cloneThemeSettings(settings: ResolvedThemeSettings): ResolvedThemeSettings {
  return normalizeThemeSettings(serializeThemeSettings(settings))
}

// ==================== 设置页清单 ====================
//
// 分组与条目对齐 komari-theme-naive 的 komari-theme.json，并补上 CFSM 专有项。
// `kind` 决定设置页渲染的控件类型。

export type ThemeSettingKind
  = | 'switch'
    | 'select'
    | 'number'
    | 'text'
    | 'textarea'
    | 'color'
    | 'metrics'
    | 'columns'
    | 'columnMap'

export interface ThemeSettingItem {
  key: ThemeSettingsKey
  kind: ThemeSettingKind
  label: string
  help?: string
  /** 仅 select 使用 */
  options?: { value: string, label: string }[]
  /** 仅 number 使用 */
  min?: number
  max?: number
  step?: number
  suffix?: string
  placeholder?: string
  /** 依赖的开关键；为 false 时控件禁用 */
  dependsOn?: ThemeSettingsKey
}

export interface ThemeSettingGroup {
  id: string
  title: string
  description?: string
  items: ThemeSettingItem[]
}

export const THEME_SETTING_GROUPS: ThemeSettingGroup[] = [
  {
    id: 'runtime',
    title: '运行与访问',
    description: '数据刷新方式、默认视图与首页入口。',
    items: [
      {
        key: 'dataUpdateInterval',
        kind: 'number',
        label: '数据更新间隔',
        help: '图表轮询与动画的刷新间隔（秒），建议 1-10 秒。',
        min: 1,
        max: 60,
        step: 1,
        suffix: '秒',
      },
      {
        key: 'enableRealtime',
        kind: 'switch',
        label: '启用实时推送',
        help: '通过 WebSocket 接收探针上报后的即时更新。关闭后只显示首屏数据，可节省后端额度。',
      },
      { key: 'defaultViewMode', kind: 'select', label: '默认视图', help: '访客首次打开首页时使用的节点视图。', options: NODE_VIEW_MODE_OPTIONS },
      { key: 'showAdminEntry', kind: 'switch', label: '显示管理后台入口', help: '在页头显示进入管理后台的按钮。CFSM 的登录在后台完成，主题不提供登录页。' },
      { key: 'showPingChartButton', kind: 'switch', label: '显示延迟图表按钮', help: '在节点卡片和列表中显示查看延迟图表的按钮。' },
      { key: 'hideSingleGroupTab', kind: 'switch', label: '单分组时隐藏分组标签', help: '当只有一个分组时隐藏分组选择标签页。' },
    ],
  },
  {
    id: 'home',
    title: '首页内容',
    items: [
      { key: 'showGeneralCards', kind: 'switch', label: '显示数据总览', help: '展示当前时间、在线节点、地区、总流量与实时速率。' },
    ],
  },
  {
    id: 'card',
    title: '节点卡片',
    description: '卡片视图的布局、尺寸与展示指标。',
    items: [
      { key: 'cardSize', kind: 'select', label: '卡片尺寸', help: '控制卡片内边距与行距。', options: CARD_SIZE_OPTIONS },
      { key: 'cardMinWidth', kind: 'number', label: '卡片最小宽度', help: '卡片自动分栏的最小宽度，建议 280-520。', min: 280, max: 520, step: 10, suffix: 'px' },
      { key: 'cardMetrics', kind: 'metrics', label: '卡片展示指标', help: '勾选需要展示的指标，展示顺序固定为 CPU / 内存 / 硬盘 / 流量。' },
      { key: 'cardProgressLayout', kind: 'select', label: '进度条布局', help: '卡片中进度条的排布方式。', options: CARD_PROGRESS_LAYOUT_OPTIONS },
      { key: 'lightCardContrast', kind: 'switch', label: '亮色卡片高对比度', help: '亮色模式下为卡片添加阴影与边框，增强与背景的区分度。' },
      { key: 'trafficSplitColor', kind: 'switch', label: '流量统计分离颜色', help: '流量统计中的上行用绿色、下行用蓝色区分显示。' },
      { key: 'tagsInSeparateRow', kind: 'switch', label: '标签单独一行显示', help: '自定义标签与价格标签常驻显示在运行时间上方，而非悬浮时才显示。' },
      { key: 'uptimeTagWrap', kind: 'switch', label: '用 Tag 包裹运行时间', help: '运行时间使用 Tag 组件包裹展示。' },
    ],
  },
  {
    id: 'list',
    title: '列表视图',
    description: 'List 视图的列、间距与状态样式。',
    items: [
      { key: 'listViewColumns', kind: 'columns', label: '显示列', help: '勾选需要展示的列，展示顺序固定为下面的排列顺序。' },
      { key: 'listRowHeight', kind: 'text', label: '行高度', help: '如 60px、4rem；留空使用默认高度。', placeholder: '留空为默认' },
      { key: 'listColumnGap', kind: 'text', label: '列间距', help: '如 12px、1rem。', placeholder: '12px' },
      { key: 'listStatusStyle', kind: 'select', label: '状态显示样式', options: STATUS_STYLE_OPTIONS },
      { key: 'listTagsStyle', kind: 'select', label: '标签显示样式', options: STATUS_STYLE_OPTIONS },
      { key: 'listColumnWidths', kind: 'columnMap', label: '列宽度', help: '支持任意 CSS 长度，如 120px、minmax(200px, 1fr)。' },
      { key: 'listColumnPadding', kind: 'columnMap', label: '列内边距', help: '留空则用默认内边距。' },
      { key: 'listColumnMargin', kind: 'columnMap', label: '列外边距', help: '留空则用默认外边距。' },
    ],
  },
  {
    id: 'layout',
    title: '页面与排版',
    items: [
      { key: 'fullWidth', kind: 'switch', label: '占满屏幕宽度', help: '启用后页面内容占满整个屏幕宽度，忽略最大宽度限制。' },
      {
        key: 'maxPageWidth',
        kind: 'text',
        label: 'PC 端最大页面宽度',
        help: `视口宽度大于 ${MOBILE_BREAKPOINT_PX}px 时生效；如 1800px、100rem。`,
        placeholder: '1800px',
      },
      {
        key: 'maxPageWidthMobile',
        kind: 'text',
        label: '移动端最大页面宽度',
        help: `视口宽度不超过 ${MOBILE_BREAKPOINT_PX}px 时生效；如 100%（占满）、480px（收窄成窄栏）。`,
        placeholder: '100%',
      },
      { key: 'borderRadius', kind: 'text', label: '圆角大小', help: '全局圆角，如 3px、0.5rem。', placeholder: '3px' },
      { key: 'fontFamily', kind: 'text', label: '字体', help: '全局字体栈，多个字体用英文逗号分隔。' },
      { key: 'numberFontFamily', kind: 'text', label: '数字字体', help: '数值展示专用字体（CPU、内存、流量等）。' },
    ],
  },
  {
    id: 'light-theme',
    title: '亮色模式主题',
    items: [
      { key: 'lightPrimaryColor', kind: 'color', label: '主色调' },
      { key: 'lightPrimaryColorHover', kind: 'color', label: '主色调悬停色' },
      { key: 'lightPrimaryColorPressed', kind: 'color', label: '主色调按下色' },
    ],
  },
  {
    id: 'dark-theme',
    title: '暗色模式主题',
    items: [
      { key: 'darkPrimaryColor', kind: 'color', label: '主色调' },
      { key: 'darkPrimaryColorHover', kind: 'color', label: '主色调悬停色' },
      { key: 'darkPrimaryColorPressed', kind: 'color', label: '主色调按下色' },
    ],
  },
  {
    id: 'format',
    title: '格式化',
    items: [
      { key: 'uptimeFormat', kind: 'select', label: '运行时间格式', help: '运行时间的显示精度。', options: UPTIME_FORMAT_OPTIONS },
      { key: 'byteDecimalsB', kind: 'number', label: 'B 小数位', min: 0, max: 6, step: 1 },
      { key: 'byteDecimalsKB', kind: 'number', label: 'KB 小数位', min: 0, max: 6, step: 1 },
      { key: 'byteDecimalsMB', kind: 'number', label: 'MB 小数位', min: 0, max: 6, step: 1 },
      { key: 'byteDecimalsGB', kind: 'number', label: 'GB 小数位', min: 0, max: 6, step: 1 },
      { key: 'byteDecimalsTB', kind: 'number', label: 'TB 及以上小数位', min: 0, max: 6, step: 1 },
    ],
  },
  {
    id: 'alert',
    title: '公告',
    items: [
      { key: 'alertEnabled', kind: 'switch', label: '启用公告', help: '在首页顶部显示自定义公告。' },
      { key: 'alertType', kind: 'select', label: '公告类型', options: ALERT_TYPE_OPTIONS, dependsOn: 'alertEnabled' },
      { key: 'alertTitle', kind: 'text', label: '公告标题', placeholder: '可留空', dependsOn: 'alertEnabled' },
      { key: 'alertContent', kind: 'textarea', label: '公告内容', help: '支持简单的 Markdown 格式。', placeholder: '支持 Markdown', dependsOn: 'alertEnabled' },
    ],
  },
  {
    id: 'beian',
    title: '备案',
    items: [
      { key: 'icpEnabled', kind: 'switch', label: '显示备案号', help: '在页脚显示网站备案号。' },
      { key: 'icpNumber', kind: 'text', label: '备案号', placeholder: '京ICP备12345678号', dependsOn: 'icpEnabled' },
      { key: 'icpUrl', kind: 'text', label: '备案跳转链接', dependsOn: 'icpEnabled' },
      { key: 'policeEnabled', kind: 'switch', label: '显示公安备案', help: '在页脚显示公安备案信息。' },
      { key: 'policeNumber', kind: 'text', label: '公安备案号', placeholder: '京公网安备 11010502000000号', dependsOn: 'policeEnabled' },
      { key: 'policeUrl', kind: 'text', label: '公安备案跳转链接', help: '留空则不跳转。', dependsOn: 'policeEnabled' },
    ],
  },
  {
    id: 'background',
    title: '自定义背景',
    description: '页面背景图 / 视频，以及卡片的毛玻璃效果。启用后需要把背景域名加入后台 CSP 白名单。',
    items: [
      { key: 'backgroundEnabled', kind: 'switch', label: '启用自定义背景' },
      { key: 'backgroundType', kind: 'select', label: '背景类型', options: BACKGROUND_TYPE_OPTIONS, dependsOn: 'backgroundEnabled' },
      { key: 'lightBackgroundUrl', kind: 'text', label: '亮色模式背景地址', placeholder: 'https://…', dependsOn: 'backgroundEnabled' },
      { key: 'darkBackgroundUrl', kind: 'text', label: '暗色模式背景地址', placeholder: 'https://…', dependsOn: 'backgroundEnabled' },
      { key: 'backgroundBlur', kind: 'number', label: '背景模糊半径', help: '0 表示不模糊。', min: 0, max: 60, step: 1, suffix: 'px', dependsOn: 'backgroundEnabled' },
      { key: 'backgroundOverlay', kind: 'number', label: '背景遮罩透明度', help: '0-100，数值越大遮罩越深。', min: 0, max: 100, step: 1, suffix: '%', dependsOn: 'backgroundEnabled' },
      { key: 'cardBlurRadius', kind: 'number', label: '卡片模糊半径', help: '毛玻璃卡片的模糊半径，0 表示保留透明材质但不模糊。', min: 0, max: 60, step: 1, suffix: 'px', dependsOn: 'backgroundEnabled' },
    ],
  },
]

/** 清单里覆盖到的全部键，供设置页与校验使用 */
export const THEME_SETTING_KEYS: ThemeSettingsKey[] = THEME_SETTING_GROUPS
  .flatMap(group => group.items.map(item => item.key))

/** 把解析后的字节精度转成 helper 需要的配置对象 */
export function toByteDecimals(settings: ResolvedThemeSettings): ByteDecimalsConfig {
  return {
    B: settings.byteDecimalsB,
    KB: settings.byteDecimalsKB,
    MB: settings.byteDecimalsMB,
    GB: settings.byteDecimalsGB,
    TB: settings.byteDecimalsTB,
  }
}
