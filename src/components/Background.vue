<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()

// 背景加载状态
const isLoaded = ref(false)
const hasError = ref(false)

// 计算背景样式
const backgroundStyle = computed(() => {
  const blur = appStore.backgroundBlur
  return {
    filter: blur > 0 ? `blur(${blur}px)` : 'none',
  }
})

// 计算遮罩样式
const overlayStyle = computed(() => {
  if (appStore.backgroundOverlay <= 0) {
    return {}
  }

  return {
    backgroundColor: `rgba(0, 0, 0, ${appStore.backgroundOverlay / 100})`,
  }
})

// 是否启用自定义背景
const showBackground = computed(() => {
  return appStore.backgroundEnabled
})

// 当前背景 URL
const currentUrl = computed(() => appStore.currentBackgroundUrl)

// 背景类型
const backgroundType = computed(() => appStore.backgroundType)

// 是否显示加载完成的背景
const showLoadedBackground = computed(() => {
  return showBackground.value && currentUrl.value && isLoaded.value && !hasError.value
})

// 是否显示默认背景（未启用自定义背景、未配置 URL、或加载失败时）
const showDefaultBackground = computed(() => {
  if (!showBackground.value) {
    return false
  }
  // 没有配置 URL 时显示默认背景
  if (!currentUrl.value) {
    return true
  }
  // 加载失败时显示默认背景
  if (hasError.value) {
    return true
  }
  return false
})

// 是否显示加载中状态（有 URL 但未加载完成且未失败）
const showLoadingBackground = computed(() => {
  return showBackground.value && currentUrl.value && !isLoaded.value && !hasError.value
})

// 图片加载处理
let imageLoader: HTMLImageElement | null = null

function loadImage(url: string) {
  // 重置状态
  isLoaded.value = false
  hasError.value = false

  // 清理之前的加载器
  if (imageLoader) {
    imageLoader.onload = null
    imageLoader.onerror = null
    imageLoader = null
  }

  // 创建新的图片加载器
  imageLoader = new Image()
  imageLoader.onload = () => {
    isLoaded.value = true
    hasError.value = false
  }
  imageLoader.onerror = () => {
    isLoaded.value = false
    hasError.value = true
  }
  imageLoader.src = url
}

// 视频加载处理
const videoRef = ref<HTMLVideoElement | null>(null)

function handleVideoLoaded() {
  isLoaded.value = true
  hasError.value = false
}

function handleVideoError() {
  isLoaded.value = false
  hasError.value = true
}

// 监听 URL 变化
watch(currentUrl, (url) => {
  if (url && backgroundType.value === 'image') {
    loadImage(url)
  }
  else if (url && backgroundType.value === 'video') {
    // 视频通过事件处理
    isLoaded.value = false
    hasError.value = false
  }
  else {
    // 没有 URL 时重置状态
    isLoaded.value = false
    hasError.value = false
  }
}, { immediate: true })

// 监听背景类型变化
watch(backgroundType, (type) => {
  if (type === 'image' && currentUrl.value) {
    loadImage(currentUrl.value)
  }
})

// 组件卸载时清理
onUnmounted(() => {
  if (imageLoader) {
    imageLoader.onload = null
    imageLoader.onerror = null
    imageLoader = null
  }
})
</script>

<template>
  <div v-if="showBackground" class="background-container">
    <!-- 默认背景（渐变背景，用于未配置或加载失败时） -->
    <Transition name="fade">
      <div v-if="showDefaultBackground" class="background-default" />
    </Transition>

    <!-- 加载中占位（渐变背景） -->
    <Transition name="fade">
      <div v-if="showLoadingBackground" class="background-loading" />
    </Transition>

    <!-- 自定义背景媒体层 -->
    <Transition name="fade">
      <div v-if="showLoadedBackground" class="background-media" :style="backgroundStyle">
        <!-- 图片背景 -->
        <div
          v-if="backgroundType === 'image'"
          class="background-image"
          :style="{ backgroundImage: `url(${currentUrl})` }"
        />
        <!-- 视频背景 -->
        <video
          v-else-if="backgroundType === 'video'"
          ref="videoRef"
          class="background-video"
          :src="currentUrl"
          autoplay
          loop
          muted
          playsinline
          @loadeddata="handleVideoLoaded"
          @error="handleVideoError"
        />
      </div>
    </Transition>

    <!-- 遮罩层 -->
    <div class="background-overlay" :style="overlayStyle" />
  </div>
</template>

<style scoped lang="scss">
.background-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  // 移动端浏览器（Android Edge / Chrome 的底部地址栏）上滑时会收起地址栏，可见区域立刻变大，
  // 但固定定位层的重新布局会被推迟到手指离开（避免滚动掉帧）—— 多出来的那条「地址栏区域」
  // 期间没人铺背景，露出根画布（白色），表现为地址栏位置留下一层白色半透明遮罩，松手后才消失。
  // 所以固定层必须比「当前布局视口」铺得更靠下，不能再用 bottom: 0 把高度绑死在布局视口上。
  //
  // 两层写法的组合，且两条路径都安全：
  // ① bottom 负偏移向下多铺 120px —— 不依赖任何新单位，老内核同样生效；
  // ② min-height: 100lvh 取「浏览器 UI 全部收起」的最大视口高度，比猜固定数值更精确；
  //    不支持 lvh 的内核会丢弃这条声明，自然回落到 ①，不会像单纯 height: 100lvh 那样失效成 auto。
  bottom: -120px;
  min-height: 100lvh;
  z-index: -1;
  overflow: hidden;
}

.background-default,
.background-loading {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

// 默认背景：亮色模式 - 温暖的渐变色
.background-default {
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 25%, #d4e5f7 50%, #e8e0f0 75%, #f5f0e8 100%);
  background-size: 400% 400%;
  animation: gradientShift 15s ease infinite;
}

// 暗色模式 - 深邃的渐变色
html.dark .background-default {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 25%, #1f3a5f 50%, #2d2d44 75%, #1a1a2e 100%);
  background-size: 400% 400%;
  animation: gradientShift 20s ease infinite;
}

// 加载中背景：亮色模式
.background-loading {
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 25%, #d4e5f7 50%, #e8e0f0 75%, #f5f0e8 100%);
  background-size: 400% 400%;
  animation: gradientShift 15s ease infinite;
}

// 加载中背景：暗色模式
html.dark .background-loading {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 25%, #1f3a5f 50%, #2d2d44 75%, #1a1a2e 100%);
  background-size: 400% 400%;
  animation: gradientShift 20s ease infinite;
}

// 渐变动画
@keyframes gradientShift {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

.background-media {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  transform: scale(1.1); // 防止模糊边缘露出白边
}

.background-image {
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

.background-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.background-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

// 过渡动画
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.8s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
