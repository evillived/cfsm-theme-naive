<script setup lang="ts">
import { NLayoutFooter, NText } from 'naive-ui'
import { computed } from 'vue'
import { useGlassSurface } from '@/composables/useGlassSurface'
import { usePageContainer } from '@/composables/usePageContainer'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const { glassSurfaceStyle, isGlassEnabled } = useGlassSurface()

// 构建时注入的版本信息
const buildVersion = __BUILD_VERSION__
const buildGitHash = __BUILD_GIT_HASH__

// 页面容器宽度按视口在 PC / 移动端两套最大宽度之间切换；与内容区共用同一份判定
const { containerStyle } = usePageContainer()

// 是否显示备案信息
const showIcp = computed(() => appStore.icpEnabled && appStore.icpNumber)
const showPolice = computed(() => appStore.policeEnabled && appStore.policeNumber)
const showFiling = computed(() => showIcp.value || showPolice.value)
</script>

<template>
  <NLayoutFooter
    class="px-4 py-4 w-full"
    :class="{ 'glass-surface-enabled glass-footer-enabled': isGlassEnabled }"
    :style="glassSurfaceStyle"
  >
    <div
      class="flex flex-col gap-3 w-full sm:flex-row sm:gap-4 sm:items-center sm:justify-between"
      :style="containerStyle"
    >
      <!-- 主信息区域 -->
      <div class="flex flex-col gap-2 sm:flex-row sm:gap-6">
        <!-- CF-Server-Monitor 信息；主题底部必须展示 Powered by 与站点版本 -->
        <div class="flex flex-wrap gap-1 items-center">
          <NText :depth="3" class="text-sm">
            Powered by
          </NText>
          <a
            href="https://github.com/huilang-me/CF-Server-Monitor/"
            target="_blank"
            rel="noopener noreferrer"
            class="text-decoration-none transition-opacity hover:opacity-80"
          >
            <NText type="primary" class="text-sm font-medium">
              CF-Server-Monitor
            </NText>
          </a>
          <NText v-if="appStore.version" :depth="3" class="text-xs font-mono ml-1">
            v{{ appStore.version }}
          </NText>
          <NText v-if="appStore.hasWorkersUpdate && appStore.lastWorkersVersion" :depth="3" class="text-xs ml-1">
            （最新 {{ appStore.lastWorkersVersion }}）
          </NText>
        </div>

        <!-- 主题信息 -->
        <div class="flex flex-wrap gap-1 items-center">
          <NText :depth="3" class="text-sm">
            Theme by
          </NText>
          <a
            href="https://github.com/lyimoexiao/komari-theme-naive"
            target="_blank"
            rel="noopener noreferrer"
            class="text-decoration-none transition-opacity hover:opacity-80"
          >
            <NText type="primary" class="text-sm font-medium">
              Naive
            </NText>
          </a>
          <NText :depth="3" class="text-xs font-mono ml-1">
            v{{ buildVersion }} ({{ buildGitHash }})
          </NText>
        </div>
      </div>

      <!-- 备案信息区域 -->
      <div v-if="showFiling" class="flex flex-wrap gap-2 items-center sm:flex-shrink-0">
        <!-- ICP 备案 -->
        <a
          v-if="showIcp"
          :href="appStore.icpUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="text-decoration-none transition-opacity hover:opacity-70"
        >
          <NText :depth="3" class="text-xs">
            {{ appStore.icpNumber }}
          </NText>
        </a>

        <!-- 分隔符 -->
        <span v-if="showIcp && showPolice" class="opacity-50">
          <NText :depth="3" class="text-xs">|</NText>
        </span>

        <!-- 公安备案 -->
        <template v-if="showPolice">
          <a
            v-if="appStore.policeUrl"
            :href="appStore.policeUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="text-decoration-none transition-opacity hover:opacity-70"
          >
            <NText :depth="3" class="text-xs">
              {{ appStore.policeNumber }}
            </NText>
          </a>
          <NText v-else :depth="3" class="text-xs">
            {{ appStore.policeNumber }}
          </NText>
        </template>
      </div>
    </div>
  </NLayoutFooter>
</template>
