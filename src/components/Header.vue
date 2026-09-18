<script setup lang="ts">
import { NButton, NFlex, NH3, NPopover } from 'naive-ui'
import { computed, inject, ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePageContainer } from '@/composables/usePageContainer'
import { ADMIN_URL, useAppStore } from '@/stores/app'

const router = useRouter()
const appStore = useAppStore()

// 从 Provider 注入滚动状态
const isScrolled = inject<ReturnType<typeof ref<boolean>>>('isScrolled', ref(false))

// 站点图标：作为模块资源引用，构建后输出到 assets/
const siteFavicon = ref(new URL('../assets/favicon.ico', import.meta.url).href)

// 页面容器宽度按视口在 PC / 移动端两套最大宽度之间切换；与内容区共用同一份判定
const { containerStyle } = usePageContainer()

interface HeaderAction {
  title: string
  icon: string
  action: string
  disabled: boolean
}

const actionButtons = computed<HeaderAction[]>(() => {
  const buttons: HeaderAction[] = []

  // 主题设置：与管理后台入口区分开（都做成齿轮会分不清），用「外观」语义的图标
  buttons.push({
    title: '主题设置',
    icon: 'i-icon-park-outline-paint',
    action: 'openSettings',
    disabled: false,
  })

  buttons.push({
    title: appStore.themeMode === 'auto' ? '自动主题' : appStore.themeMode === 'light' ? '浅色主题' : '深色主题',
    icon: appStore.themeMode === 'auto' ? 'i-icon-park-outline-dark-mode' : appStore.themeMode === 'light' ? 'i-icon-park-outline-sun-one' : 'i-icon-park-outline-moon',
    action: 'toggleTheme',
    disabled: false,
  })

  // 管理后台由内置默认主题接管；登录也在后台完成，主题不实现登录页
  if (appStore.showAdminEntry) {
    buttons.push({
      title: '管理后台',
      icon: 'i-icon-park-outline-setting',
      action: 'openAdmin',
      disabled: false,
    })
  }

  return buttons
})

function handleButtonClick(action: string) {
  switch (action) {
    case 'openSettings':
      void router.push('/settings')
      break
    case 'toggleTheme':
      appStore.updateThemeMode()
      break
    case 'openAdmin':
      // 管理后台固定由默认主题接管，第三方主题只能跳转
      location.href = ADMIN_URL
      break
  }
}
</script>

<template>
  <div class="transition-all duration-200 top-0 position-sticky z-10" :class="isScrolled ? 'bg-$n-color shadow-sm backdrop-blur-md' : 'bg-transparent'">
    <div class="px-4 flex-between h-16" :style="containerStyle">
      <NFlex class="flex-center cursor-pointer" @click="router.push('/')">
        <!-- 直接用 img：NAvatar 会给图标套一层圆形底色，favicon 自带圆角，不需要再包一层 -->
        <img :src="siteFavicon" alt="" class="rounded-md shrink-0 h-8 w-8 object-contain">
        <NH3 class="m-0">
          {{ appStore.siteTitle }}
        </NH3>
      </NFlex>
      <NFlex class="flex gap-4">
        <NPopover v-for="button in actionButtons" :key="button.action" :disabled="button.disabled">
          <template #trigger>
            <NButton :disabled="button.disabled" class="p-2 h-8 w-8" text @click="handleButtonClick(button.action)">
              <div :class="button.icon" />
            </NButton>
          </template>
          <template #default>
            {{ button.title }}
          </template>
        </NPopover>
      </NFlex>
    </div>
  </div>
</template>
