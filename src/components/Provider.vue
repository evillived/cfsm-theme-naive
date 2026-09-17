<script setup lang="ts">
import type { GlobalTheme, GlobalThemeOverrides } from 'naive-ui'
import {
  darkTheme,
  dateEnUS,
  dateZhCN,
  enUS,
  lightTheme,
  NBackTop,
  NConfigProvider,
  NDialogProvider,
  NGlobalStyle,
  NLoadingBarProvider,
  NMessageProvider,
  NModalProvider,
  NNotificationProvider,
  useDialog,
  useLoadingBar,
  useMessage,
  useModal,
  useNotification,
  zhCN,
} from 'naive-ui'

import { computed, defineComponent, h, provide, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()

// 滚动状态：是否显示返回顶部按钮（即页面已滚动）
const isScrolled = ref(false)

// 提供给子组件使用
provide('isScrolled', isScrolled)

// 直接使用 store 中的 isDark computed
const isDark = computed(() => appStore.isDark)

const theme = computed<GlobalTheme | null>(() => {
  return isDark.value ? darkTheme : lightTheme
})

const locale = computed(() => {
  const langMap = {
    'zh-CN': zhCN,
    'en-US': enUS,
  }
  return langMap[appStore.lang] || zhCN
})

const dateLocale = computed(() => {
  const langMap = {
    'zh-CN': dateZhCN,
    'en-US': dateEnUS,
  }
  return langMap[appStore.lang] || dateZhCN
})

function setupNaiveTools() {
  window.$loadingBar = useLoadingBar()
  window.$notification = useNotification()
  window.$message = useMessage()
  window.$dialog = useDialog()
  window.$modal = useModal()
}

const NaiveProviderContent = defineComponent({
  setup() {
    setupNaiveTools()
  },
  render() {
    return h('div', { className: 'naive-tools' })
  },
})

// 从主题设置读取，支持亮色/暗色模式分别配置（默认值在 utils/themeSettings 中统一定义）
const themeOverride = computed<GlobalThemeOverrides>(() => {
  const colors = appStore.primaryColors

  return {
    common: {
      primaryColor: colors.primary,
      primaryColorHover: colors.hover,
      primaryColorPressed: colors.pressed,
      primaryColorSuppl: colors.hover,
      borderRadius: appStore.borderRadius,
      fontFamily: appStore.fontFamily,
    },
  }
})

// 将主题颜色同步到 CSS 变量，供 UnoCSS 和自定义样式使用
watch(
  themeOverride,
  (overrides) => {
    const root = document.documentElement
    if (overrides.common?.primaryColor) {
      root.style.setProperty('--primary-color', overrides.common.primaryColor)
    }
    if (overrides.common?.primaryColorHover) {
      root.style.setProperty('--primary-color-hover', overrides.common.primaryColorHover)
    }
    if (overrides.common?.primaryColorPressed) {
      root.style.setProperty('--primary-color-pressed', overrides.common.primaryColorPressed)
    }
  },
  { immediate: true },
)

// 同步暗色模式到 html.dark 类，供 CSS 选择器使用
watch(
  isDark,
  (dark) => {
    const root = document.documentElement
    if (dark) {
      root.classList.add('dark')
    }
    else {
      root.classList.remove('dark')
    }
  },
  { immediate: true },
)

// 当启用自定义背景时，设置 body 背景透明
watch(
  [() => appStore.backgroundEnabled, isDark],
  ([enabled, dark]) => {
    const body = document.body
    if (enabled) {
      // 使用 cssText 覆盖所有背景样式
      body.style.setProperty('background-color', 'transparent', 'important')
    }
    else {
      // 恢复默认背景
      body.style.removeProperty('background-color')
      // 设置正确的背景色
      body.style.backgroundColor = dark ? 'rgb(16, 16, 20)' : '#fff'
    }
  },
  { immediate: true },
)
</script>

<template>
  <NConfigProvider :theme="theme" :theme-overrides="themeOverride" :locale="locale" :date-locale="dateLocale">
    <NBackTop :visibility-height="1" class="z-9999" @update:show="isScrolled = $event" />
    <NGlobalStyle />
    <NLoadingBarProvider>
      <NDialogProvider>
        <NNotificationProvider>
          <NMessageProvider>
            <NModalProvider>
              <slot />
              <NaiveProviderContent />
            </NModalProvider>
          </NMessageProvider>
        </NNotificationProvider>
      </NDialogProvider>
    </NLoadingBarProvider>
  </NConfigProvider>
</template>
