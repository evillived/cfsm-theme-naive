/**
 * 主题设置的本机覆盖层（localStorage）。
 *
 * CFSM 的第三方主题无权调用管理端接口：`/api/config` 里的 `theme_options` 对主题只读，
 * 写回站点级配置需要站长登录后持有的 JWT。因此访客在主题内做的一切调整都只落在本设备：
 *
 * ```text
 * 主题默认值  ←  后端 theme_options（站长预设）  ←  本机覆盖（本 store）
 * ```
 *
 * 这里只保存**被改过的键**（线格式，见 `serializeThemeSettings`），未改动的键继续沿用后端预设，
 * 这样站长后续调整预设时，访客没碰过的部分仍会跟着更新。
 * 多标签页之间用 `storage` 事件保持同步，避免两个标签页的设置互相打架。
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

const STORAGE_KEY = 'cfsm-naive:theme-settings'

/** 读取本机覆盖项；隐私模式或数据损坏时退化为空对象 */
function readStorage(): Record<string, unknown> {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (!raw)
      return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
      return {}
    return parsed as Record<string, unknown>
  }
  catch {
    return {}
  }
}

const useThemeSettingsStore = defineStore('themeSettings', () => {
  /** 本机覆盖项（线格式）；空对象表示完全跟随后端预设 */
  const overrides = ref<Record<string, unknown>>(readStorage())

  /** 是否存在本机覆盖 */
  const hasLocalOverrides = computed<boolean>(() => Object.keys(overrides.value).length > 0)

  /** 覆盖了多少个键 */
  const overrideCount = computed<number>(() => Object.keys(overrides.value).length)

  /** 写入覆盖项并持久化 */
  function setOverrides(next: Record<string, unknown>): void {
    overrides.value = next
    try {
      if (Object.keys(next).length === 0)
        globalThis.localStorage?.removeItem(STORAGE_KEY)
      else
        globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next))
    }
    catch {
      // 配额用尽 / 隐私模式下写入失败：本次会话内的设置仍然生效
      console.warn('[themeSettings] 无法写入本机存储，设置仅在本次会话内有效')
    }
  }

  /** 清空本机覆盖，回到后端预设 + 主题默认值 */
  function clearOverrides(): void {
    setOverrides({})
  }

  /** 重新从本机存储读取（其它标签页修改后同步用） */
  function reloadFromStorage(): void {
    overrides.value = readStorage()
  }

  return {
    overrides,
    hasLocalOverrides,
    overrideCount,
    setOverrides,
    clearOverrides,
    reloadFromStorage,
  }
})

/**
 * 监听其它标签页对同一键的写入。
 *
 * 单独导出为函数（而不是在 store 内直接注册）是为了让调用方显式控制注册时机，
 * 也便于测试时跳过。
 */
function listenStorageSync(onChange: () => void): () => void {
  const handler = (event: StorageEvent) => {
    if (event.key === null || event.key === STORAGE_KEY)
      onChange()
  }
  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}

export { listenStorageSync, STORAGE_KEY, useThemeSettingsStore }
