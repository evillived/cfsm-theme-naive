<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import Background from '@/components/Background.vue'
import Footer from '@/components/Footer.vue'
import Header from '@/components/Header.vue'
import LoadingCover from '@/components/LoadingCover.vue'
import Provider from '@/components/Provider.vue'
import { useAppStore } from '@/stores/app'
import { listenStorageSync, useThemeSettingsStore } from '@/stores/themeSettings'
import { applyRealtimeSetting, destroyInitManager, initApp } from '@/utils/init'

const appStore = useAppStore()
const themeSettingsStore = useThemeSettingsStore()

// 计算页面容器的样式
const pageContainerStyle = computed(() => {
  if (appStore.fullWidth) {
    return {}
  }
  return {
    maxWidth: appStore.maxPageWidth,
    marginInline: 'auto',
  }
})

// 「启用实时推送」设置变化时立即生效，无需刷新页面
watch(
  () => appStore.enableRealtime,
  (enabled) => {
    applyRealtimeSetting(enabled)
  },
)

// 其它标签页改动主题设置时，同步到本页
let stopStorageSync: (() => void) | null = null

// 初始化应用
onMounted(async () => {
  stopStorageSync = listenStorageSync(() => {
    themeSettingsStore.reloadFromStorage()
  })

  try {
    await initApp()
  }
  catch (error) {
    console.error('[App] Initialization failed:', error)
  }
})

// 组件卸载时销毁 InitManager，防止内存泄漏
onUnmounted(() => {
  stopStorageSync?.()
  stopStorageSync = null
  destroyInitManager()
})
</script>

<template>
  <Provider>
    <Background />
    <Transition
      enter-active-class="transition-all duration-100 ease-out"
      enter-from-class="opacity-0 backdrop-blur-0"
      enter-to-class="opacity-100 backdrop-blur-sm"
      leave-active-class="transition-all duration-100 ease-in"
      leave-from-class="opacity-100 backdrop-blur-sm"
      leave-to-class="opacity-0 backdrop-blur-0"
    >
      <LoadingCover v-if="appStore.loading" />
    </Transition>

    <Header />
    <main v-if="!appStore.loading" class="min-h-screen overflow-hidden">
      <div :style="pageContainerStyle">
        <RouterView v-slot="{ Component }">
          <Transition
            enter-active-class="transition-all duration-200 ease-out"
            enter-from-class="opacity-0 translate-x-4 blur-sm"
            enter-to-class="opacity-100 translate-x-0 blur-0"
            leave-active-class="transition-all duration-200 ease-in"
            leave-from-class="opacity-100 translate-x-0 blur-0"
            leave-to-class="opacity-0 -translate-x-4 blur-sm"
            mode="out-in"
          >
            <KeepAlive :include="['HomeView']">
              <component :is="Component" />
            </KeepAlive>
          </Transition>
        </RouterView>
      </div>
    </main>
    <Footer v-if="!appStore.loading" />
  </Provider>
</template>

<style scoped></style>
