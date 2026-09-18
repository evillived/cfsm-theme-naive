import type { CSSProperties } from 'vue'
import { computed, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { MOBILE_BREAKPOINT_PX } from '@/utils/themeSettings'

/**
 * 页面容器宽度：在 PC / 移动端两套最大宽度之间按视口切换。
 *
 * 断点与全站媒体查询一致（见 `MOBILE_BREAKPOINT_PX`），`Header` / `Footer` / `App` 三处容器
 * 共用同一份判定，避免各自维护一套阈值导致页头与内容错位。
 */

/** 是否处于移动端视口；模块级单例，多个组件共用一份监听 */
const isMobile = ref(false)

if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const query = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`)
  isMobile.value = query.matches
  query.addEventListener('change', (event) => {
    isMobile.value = event.matches
  })
}

export function usePageContainer() {
  const appStore = useAppStore()

  /** 页面容器的行内样式；「占满屏幕宽度」优先于两套最大宽度 */
  const containerStyle = computed<CSSProperties>(() => {
    if (appStore.fullWidth)
      return {}

    return {
      maxWidth: isMobile.value ? appStore.maxPageWidthMobile : appStore.maxPageWidth,
      marginInline: 'auto',
    }
  })

  return {
    isMobile,
    containerStyle,
  }
}
