<script setup lang="ts">
/**
 * 主题设置页。
 *
 * 参考 CFSM-Theme-LuminaPlus 的做法：CFSM 的第三方主题**不能**调用管理端接口，
 * `/api/config` 的 `theme_options` 对主题只读，因此访客的调整落在本机（localStorage），
 * 站长要下发给所有访客则需登录后写回后端（`POST /api/theme_options`）。
 *
 * 优先级：主题默认值 ← 后端 theme_options ← 本机覆盖。
 * 保存本机时只写入「相对后端预设被改过的键」，站长日后调整预设，访客没碰过的部分仍会跟着更新。
 *
 * 设置项清单见 `@/utils/themeSettings` 的 `THEME_SETTING_GROUPS`（对齐 komari-theme-naive 的
 * `komari-theme.json`）。
 */
import type { ResolvedThemeSettings, ThemeSettingItem, ThemeSettingsKey } from '@/utils/themeSettings'
import {
  NButton,
  NCard,
  NCheckbox,
  NCheckboxGroup,
  NColorPicker,
  NIcon,
  NInput,
  NInputNumber,
  NSelect,
  NSwitch,
  NText,
  useDialog,
  useMessage,
} from 'naive-ui'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useGlassSurface } from '@/composables/useGlassSurface'
import { useAppStore } from '@/stores/app'
import { useThemeSettingsStore } from '@/stores/themeSettings'
import {
  CARD_METRIC_LABELS,
  CARD_METRICS,
  cloneThemeSettings,
  DEFAULT_LIST_COLUMN_WIDTHS,
  diffThemeSettings,
  LIST_COLUMN_LABELS,
  LIST_VIEW_COLUMNS,
  resolveThemeSettings,
  serializeThemeSettings,
  THEME_SETTING_GROUPS,
} from '@/utils/themeSettings'

const appStore = useAppStore()
const themeSettingsStore = useThemeSettingsStore()
const router = useRouter()
const message = useMessage()
const dialog = useDialog()
const { glassSurfaceStyle, isGlassEnabled } = useGlassSurface()

/** 不含本机覆盖的基准：主题默认值 ← 后端预设 */
const backendSettings = computed<ResolvedThemeSettings>(() =>
  resolveThemeSettings(appStore.backendThemeOptions, {}),
)
/** 当前生效的设置 */
const effectiveSettings = computed<ResolvedThemeSettings>(() => appStore.themeSettings)

const draft = ref<ResolvedThemeSettings>(cloneThemeSettings(effectiveSettings.value))
const saving = ref(false)
const copied = ref(false)

function reseed(): void {
  draft.value = cloneThemeSettings(effectiveSettings.value)
}

const isDirty = computed<boolean>(() =>
  JSON.stringify(serializeThemeSettings(draft.value)) !== JSON.stringify(serializeThemeSettings(effectiveSettings.value)),
)

// ==================== 取值辅助 ====================
//
// 清单里的 key 是联合类型，模板里动态取值需要收窄；统一走这几个访问器，避免模板里到处 as。

function boolValue(key: ThemeSettingsKey): boolean {
  return draft.value[key] as boolean
}

function textValue(key: ThemeSettingsKey): string {
  return draft.value[key] as string
}

function numberValue(key: ThemeSettingsKey): number {
  return draft.value[key] as number
}

function listValue(key: ThemeSettingsKey): string[] {
  return draft.value[key] as string[]
}

function mapValue(key: ThemeSettingsKey): Record<string, string> {
  return draft.value[key] as Record<string, string>
}

function patch(key: ThemeSettingsKey, value: unknown): void {
  draft.value = { ...draft.value, [key]: value }
}

// 控件事件的值可能是 null / number 联合类型，统一在这里收窄，避免非法值污染草稿
function patchBool(key: ThemeSettingsKey, value: boolean): void {
  patch(key, value)
}

function patchText(key: ThemeSettingsKey, value: string | number | null): void {
  patch(key, value === null ? '' : String(value))
}

/** 输入框清空时 Naive 会给出 null，此时保持原值，避免数字被重置成 0 */
function patchNumber(key: ThemeSettingsKey, value: number | null): void {
  if (typeof value === 'number' && Number.isFinite(value))
    patch(key, value)
}

function patchColor(key: ThemeSettingsKey, value: string | null): void {
  if (typeof value === 'string' && value)
    patch(key, value)
}

function patchList(key: ThemeSettingsKey, value: Array<string | number>): void {
  patch(key, value.map(String))
}

function patchMapEntry(key: ThemeSettingsKey, entryKey: string, value: string): void {
  const next = { ...mapValue(key) }
  if (value.trim())
    next[entryKey] = value.trim()
  else
    delete next[entryKey]
  patch(key, next)
}

/** dependsOn 指定的开关关闭时，控件禁用 */
function isDisabled(item: ThemeSettingItem): boolean {
  if (!item.dependsOn)
    return false
  return draft.value[item.dependsOn] !== true
}

/** 控件占整行（多选 / 逐列编辑），而不是与标签左右并排 */
function isWideControl(kind: ThemeSettingItem['kind']): boolean {
  return kind === 'metrics' || kind === 'columns' || kind === 'columnMap'
}

// ==================== 校验 ====================

const URL_KEYS: ThemeSettingsKey[] = ['icpUrl', 'policeUrl', 'lightBackgroundUrl', 'darkBackgroundUrl']

/** 允许留空、站内相对路径与 http(s) 绝对地址 */
function isUsableUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || trimmed.startsWith('/') || trimmed.startsWith('./'))
    return true
  try {
    const url = new URL(trimmed)
    return url.protocol === 'https:' || url.protocol === 'http:'
  }
  catch {
    return false
  }
}

const invalidUrlKeys = computed<ThemeSettingsKey[]>(() =>
  URL_KEYS.filter(key => !isUsableUrl(draft.value[key] as string)),
)

const canSave = computed<boolean>(() => isDirty.value && invalidUrlKeys.value.length === 0 && !saving.value)

// ==================== 保存 / 重置 ====================

/** 保存到本机：只写入相对后端预设的差异键 */
function saveLocal(): void {
  saving.value = true
  try {
    themeSettingsStore.setOverrides(diffThemeSettings(backendSettings.value, draft.value))
    message.success('已保存到本机，仅对当前设备生效')
  }
  finally {
    saving.value = false
  }
}

/** 放弃本机覆盖，改用后端预设 */
function useBackendSettings(): void {
  dialog.warning({
    title: '改用后端配置',
    content: '将清除本机保存的所有主题设置，改为完全跟随后端预设。此操作不可撤销。',
    positiveText: '确认清除',
    negativeText: '取消',
    onPositiveClick: () => {
      themeSettingsStore.clearOverrides()
      reseed()
      message.success('已改用后端配置')
    },
  })
}

/** 复制配置 JSON，供手动粘贴到后台「外观设置 → 主题自定义配置」 */
async function copyConfigJson(): Promise<void> {
  const json = JSON.stringify(serializeThemeSettings(draft.value), null, 2)
  try {
    await navigator.clipboard.writeText(json)
    copied.value = true
    message.success('配置 JSON 已复制到剪贴板')
    setTimeout(() => {
      copied.value = false
    }, 2000)
  }
  catch {
    message.warning('浏览器拒绝了剪贴板访问，请在控制台手动获取配置')
    console.warn('[ThemeSettings] 配置 JSON：', json)
  }
}

// 设置页的卡片沿用全站玻璃材质与高对比度变体
const cardClass = computed(() => [
  { 'light-card-contrast': appStore.lightCardContrast && !isGlassEnabled.value },
  { 'glass-surface-enabled glass-card-enabled': isGlassEnabled.value },
])
</script>

<template>
  <div class="theme-settings px-4 pb-10 flex flex-col gap-4">
    <!-- 页头与操作栏 -->
    <div class="pt-2 flex flex-wrap gap-3 items-center justify-between">
      <NButton text class="theme-settings__back" @click="router.push('/')">
        <template #icon>
          <div class="i-icon-park-outline-left" />
        </template>
        返回首页
      </NButton>

      <div class="flex flex-wrap gap-2 items-center">
        <NButton size="small" :disabled="!isDirty || saving" @click="reseed">
          <template #icon>
            <div class="i-icon-park-outline-undo" />
          </template>
          重置改动
        </NButton>
        <NButton size="small" :disabled="!themeSettingsStore.hasLocalOverrides" @click="useBackendSettings">
          <template #icon>
            <div class="i-icon-park-outline-cloud-download" />
          </template>
          改用后端配置
        </NButton>
        <NButton size="small" @click="copyConfigJson">
          <template #icon>
            <div :class="copied ? 'i-icon-park-outline-check' : 'i-icon-park-outline-copy'" />
          </template>
          {{ copied ? '已复制' : '复制配置 JSON' }}
        </NButton>
        <NButton size="small" type="primary" :disabled="!canSave" @click="saveLocal">
          <template #icon>
            <div class="i-icon-park-outline-save" />
          </template>
          保存到本机
        </NButton>
      </div>
    </div>

    <!-- 生效来源提示 -->
    <div class="text-xs flex flex-wrap gap-x-4 gap-y-1 items-center" style="color: var(--n-text-color-3)">
      <span>
        当前生效：后端预设
        <span v-if="themeSettingsStore.hasLocalOverrides">+ 本机覆盖（{{ themeSettingsStore.overrideCount }} 项）</span>
        <span v-else>（本机未覆盖）</span>
      </span>
      <span v-if="isDirty">· 有未保存的改动</span>
      <span v-if="invalidUrlKeys.length > 0" style="color: var(--n-error-color)">
        · 有 {{ invalidUrlKeys.length }} 个链接格式不正确，请修正后再保存
      </span>
    </div>

    <!-- 设置分组 -->
    <NCard
      v-for="(group, index) in THEME_SETTING_GROUPS"
      :key="group.id"
      size="small"
      :class="cardClass"
      :style="glassSurfaceStyle"
    >
      <template #header>
        <div class="flex gap-2 items-baseline">
          <span class="text-xs font-mono opacity-60">{{ String(index + 1).padStart(2, '0') }}</span>
          <span>{{ group.title }}</span>
        </div>
      </template>

      <NText v-if="group.description" :depth="3" class="text-xs mb-1 block">
        {{ group.description }}
      </NText>

      <div class="theme-settings__items">
        <div
          v-for="item in group.items"
          :key="item.key"
          class="theme-settings__row"
          :class="{ 'is-wide': isWideControl(item.kind), 'is-disabled': isDisabled(item) }"
        >
          <div class="theme-settings__label">
            <div class="text-[13px]">
              {{ item.label }}
            </div>
            <div v-if="item.help" class="text-[11px] mt-0.5" style="color: var(--n-text-color-3)">
              {{ item.help }}
            </div>
          </div>

          <div class="theme-settings__control">
            <!-- 开关 -->
            <NSwitch
              v-if="item.kind === 'switch'"
              :value="boolValue(item.key)"
              :disabled="isDisabled(item)"
              @update:value="patchBool(item.key, $event)"
            />

            <!-- 枚举 -->
            <NSelect
              v-else-if="item.kind === 'select'"
              :value="textValue(item.key)"
              :options="item.options ?? []"
              :disabled="isDisabled(item)"
              size="small"
              class="theme-settings__select"
              @update:value="patchText(item.key, $event)"
            />

            <!-- 数字 -->
            <NInputNumber
              v-else-if="item.kind === 'number'"
              :value="numberValue(item.key)"
              :min="item.min"
              :max="item.max"
              :step="item.step ?? 1"
              :disabled="isDisabled(item)"
              size="small"
              class="theme-settings__number"
              @update:value="patchNumber(item.key, $event)"
            >
              <template v-if="item.suffix" #suffix>
                {{ item.suffix }}
              </template>
            </NInputNumber>

            <!-- 单行文本 -->
            <NInput
              v-else-if="item.kind === 'text'"
              :value="textValue(item.key)"
              :placeholder="item.placeholder"
              :disabled="isDisabled(item)"
              size="small"
              class="theme-settings__text"
              @update:value="patchText(item.key, $event)"
            />

            <!-- 多行文本 -->
            <NInput
              v-else-if="item.kind === 'textarea'"
              :value="textValue(item.key)"
              type="textarea"
              :autosize="{ minRows: 3, maxRows: 10 }"
              :placeholder="item.placeholder"
              :disabled="isDisabled(item)"
              @update:value="patchText(item.key, $event)"
            />

            <!-- 颜色 -->
            <NColorPicker
              v-else-if="item.kind === 'color'"
              :value="textValue(item.key)"
              :disabled="isDisabled(item)"
              size="small"
              :show-alpha="false"
              class="theme-settings__color"
              @update:value="patchColor(item.key, $event)"
            />

            <!-- 卡片指标多选 -->
            <NCheckboxGroup
              v-else-if="item.kind === 'metrics'"
              :value="listValue(item.key)"
              :disabled="isDisabled(item)"
              @update:value="patchList(item.key, $event)"
            >
              <div class="flex flex-wrap gap-x-4 gap-y-1">
                <NCheckbox v-for="metric in CARD_METRICS" :key="metric" :value="metric">
                  {{ CARD_METRIC_LABELS[metric] }}
                </NCheckbox>
              </div>
            </NCheckboxGroup>

            <!-- 列表列多选 -->
            <NCheckboxGroup
              v-else-if="item.kind === 'columns'"
              :value="listValue(item.key)"
              :disabled="isDisabled(item)"
              @update:value="patchList(item.key, $event)"
            >
              <div class="flex flex-wrap gap-x-4 gap-y-1">
                <NCheckbox v-for="column in LIST_VIEW_COLUMNS" :key="column" :value="column">
                  {{ LIST_COLUMN_LABELS[column] }}
                </NCheckbox>
              </div>
            </NCheckboxGroup>

            <!-- 逐列 CSS 值 -->
            <div v-else-if="item.kind === 'columnMap'" class="theme-settings__column-map">
              <div v-for="column in LIST_VIEW_COLUMNS" :key="column" class="theme-settings__column-map-row">
                <span class="text-[11px] shrink-0 w-16 truncate" style="color: var(--n-text-color-3)">
                  {{ LIST_COLUMN_LABELS[column] }}
                </span>
                <NInput
                  :value="mapValue(item.key)[column] ?? ''"
                  :placeholder="item.key === 'listColumnWidths' ? DEFAULT_LIST_COLUMN_WIDTHS[column] : '默认'"
                  :disabled="isDisabled(item)"
                  size="tiny"
                  @update:value="patchMapEntry(item.key, column, $event)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </NCard>

    <!-- 底部说明：后端写入的边界 -->
    <NCard size="small" :class="cardClass" :style="glassSurfaceStyle">
      <template #header>
        <div class="flex gap-2 items-center">
          <NIcon>
            <div class="i-icon-park-outline-info" />
          </NIcon>
          <span>设置的保存方式</span>
        </div>
      </template>
      <ul class="text-xs m-0 pl-5 list-disc flex flex-col gap-1" style="color: var(--n-text-color-3)">
        <li>CFSM 的第三方主题不能调用管理端接口，站点级 `theme_options` 对主题是只读的。</li>
        <li>
          <b>保存到本机</b>：只写进浏览器的 localStorage，仅当前设备可见；只记录你改过的项，
          站长日后调整站点预设时，你没碰过的设置仍会跟着更新。
        </li>
        <li>
          要让设置对<b>所有访客</b>生效，用<b>复制配置 JSON</b>把结果粘贴到管理后台的
          「外观设置 → 主题自定义配置」。
        </li>
        <li>
          设置项与 <code>komari-theme-naive</code> 的 <code>komari-theme.json</code> 一一对应，
          JSON 可直接互相搬运。
        </li>
      </ul>
    </NCard>
  </div>
</template>

<style scoped>
.theme-settings__items {
  display: flex;
  flex-direction: column;
}

.theme-settings__row {
  display: grid;
  gap: 8px 20px;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--n-border-color, rgb(239, 239, 245));
}

.theme-settings__row:last-child {
  border-bottom: none;
}

/* 多选与逐列编辑需要整行宽度 */
.theme-settings__row.is-wide {
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
}

.theme-settings__row.is-disabled {
  opacity: 0.55;
}

.theme-settings__label {
  min-width: 0;
}

.theme-settings__control {
  display: flex;
  justify-content: flex-end;
  min-width: 0;
}

.theme-settings__row.is-wide .theme-settings__control {
  justify-content: flex-start;
}

.theme-settings__select {
  width: 200px;
}

.theme-settings__number {
  width: 140px;
}

.theme-settings__text {
  max-width: 340px;
}

.theme-settings__color {
  width: 140px;
}

.theme-settings__column-map {
  display: grid;
  gap: 6px 16px;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  width: 100%;
}

.theme-settings__column-map-row {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

/* 窄屏下改为上下排列，避免右侧控件被挤压 */
@media (max-width: 720px) {
  .theme-settings__row {
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
  }

  .theme-settings__control {
    justify-content: flex-start;
  }

  .theme-settings__text,
  .theme-settings__select {
    max-width: none;
    width: 100%;
  }
}
</style>
