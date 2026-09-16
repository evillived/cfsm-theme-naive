/**
 * Cloudflare Turnstile 支持。
 *
 * 仅当站点在 `/api/config` 中开启 `turnstile_enabled` 时才需要：
 * 主题先取得一次性 token，随后 `/api/config` 会返回可复用 1 小时的
 * `turnstile_verified` 凭证，之后的请求改带该凭证（见 `CfsmAuth`）。
 *
 * 注意：若站点配置了 CSP，需要把 `https://challenges.cloudflare.com`
 * 加入 `script-src` 与 `frame-src`（后台外观设置中的 `csp_static`）。
 */

const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

/** 等待用户完成验证的最长时间 */
const WIDGET_TIMEOUT_MS = 180_000

interface TurnstileApi {
  render: (container: HTMLElement, options: Record<string, unknown>) => string
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptPromise: Promise<void> | null = null

/** 惰性加载 Turnstile 脚本（只加载一次） */
function loadTurnstileScript(): Promise<void> {
  if (window.turnstile)
    return Promise.resolve()
  if (scriptPromise)
    return scriptPromise

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SCRIPT_URL}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('人机验证脚本加载失败')))
      return
    }

    const script = document.createElement('script')
    script.src = TURNSTILE_SCRIPT_URL
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('人机验证脚本加载失败'))
    document.head.appendChild(script)
  })

  return scriptPromise
}

/** 创建承载 widget 的浮层，返回容器与清理函数 */
function createOverlay(): { container: HTMLDivElement, dispose: () => void } {
  const overlay = document.createElement('div')
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:9999',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'background:rgba(0,0,0,0.45)',
  ].join(';')

  const panel = document.createElement('div')
  panel.style.cssText = [
    'background:#ffffff',
    'color:#333333',
    'border-radius:8px',
    'padding:16px 20px',
    'box-shadow:0 8px 32px rgba(0,0,0,0.24)',
    'font:14px/1.6 system-ui,sans-serif',
    'text-align:center',
  ].join(';')

  const title = document.createElement('div')
  title.textContent = '请完成人机验证'
  title.style.cssText = 'margin-bottom:8px;font-weight:600'

  const container = document.createElement('div')

  panel.append(title, container)
  overlay.appendChild(panel)
  document.body.appendChild(overlay)

  return {
    container,
    dispose: () => overlay.remove(),
  }
}

/**
 * 取得一次性 Turnstile token。
 *
 * @param siteKey 来自 `/api/config` 的 `turnstile_site_key`
 * @returns token；site key 为空（站点未配置）时返回 null
 */
export async function requestTurnstileToken(siteKey: string): Promise<string | null> {
  if (!siteKey.trim())
    return null

  await loadTurnstileScript()

  const api = window.turnstile
  if (!api)
    throw new Error('人机验证组件不可用')

  const { container, dispose } = createOverlay()

  try {
    return await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('人机验证超时，请刷新页面重试'))
      }, WIDGET_TIMEOUT_MS)

      const settle = (action: () => void) => {
        clearTimeout(timer)
        action()
      }

      api.render(container, {
        'sitekey': siteKey,
        'theme': 'auto',
        'callback': (token: string) => settle(() => resolve(token)),
        'error-callback': () => settle(() => reject(new Error('人机验证失败，请重试'))),
        'timeout-callback': () => settle(() => reject(new Error('人机验证超时，请重试'))),
      })
    })
  }
  finally {
    dispose()
  }
}
