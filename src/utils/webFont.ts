/**
 * 正文网页字体的条件加载。
 *
 * ## 背景
 *
 * 上游 komari-theme-naive 在 `index.html` 里硬编码了小米字体服务的样式表（MiSans VF）。
 * 但 CFSM 会对主题 HTML 下发 `Content-Security-Policy`，默认只放行 `'self'`、
 * `challenges.cloudflare.com` 与 `fonts.googleapis.com`，因此该样式表会被拦截，并在
 * 控制台留下一条 “Loading the stylesheet ... violates the following Content Security
 * Policy directive” 报错。字体属于渐进增强，不应该因为被策略拒绝就污染控制台。
 *
 * ## 策略
 *
 * 先读取本文档实际生效的 CSP，**只有** `style-src` 放行样式表来源、且 `font-src` 放行
 * 字体文件来源时才注入样式表；无法判定时一律不加载——宁可少一个字体，也不留下报错。
 *
 * ## 为什么不打包字体
 *
 * 《MiSans 字体知识产权许可协议》禁止二次分发字体软件本身，因此不能把字体文件放进
 * `src/assets` 自托管，只能引用小米官方的字体服务。管理员如需启用 MiSans，请向后台
 * 设置的 `csp_static` 追加两者（该设置会被 CFSM 同时并入上面的 `style-src` 与 `font-src`）：
 *
 * ```text
 * https://cdn-font.hyperos.mi.com,https://cdn-file.hyperos.mi.com
 * ```
 *
 * 未配置时字体回落到字体栈中的下一个候选（`Provider.vue` 的 `fontFamily` 默认值里
 * `"MiSans VF"` 之后是 `sans-serif`），不影响任何排版逻辑。
 */

/** 小米字体服务提供的样式表。MiSans 许可协议禁止二次分发，故只能引用官方 CDN */
const FONT_STYLESHEET_URL
  = 'https://cdn-font.hyperos.mi.com/font/css?family=MiSans_VF:VF:Chinese_Simplify,Latin&display=swap'

/** 样式表自身的来源，受 CSP `style-src` 约束 */
const FONT_STYLE_ORIGIN = 'https://cdn-font.hyperos.mi.com'

/** 字体文件自身的来源，受 CSP `font-src` 约束（样式表内的 @font-face 指向这里） */
const FONT_FILE_ORIGIN = 'https://cdn-file.hyperos.mi.com'

/** 标记已注入的 link，避免重复注入 */
const INJECTED_LINK_FLAG = 'data-cfsm-web-font'

/** 探测结果的会话级缓存：CSP 在单次会话内基本不变，没必要每次进页面都探测一次 */
const PROBE_CACHE_KEY = 'cfsm:web-font-allowed:v1'

function readProbeCache(): boolean | null {
  try {
    const cached = globalThis.sessionStorage?.getItem(PROBE_CACHE_KEY)
    if (cached === '1')
      return true
    if (cached === '0')
      return false
    return null
  }
  catch {
    // 隐私模式等场景下 sessionStorage 不可用，退化为每次都探测
    return null
  }
}

function writeProbeCache(allowed: boolean): void {
  try {
    globalThis.sessionStorage?.setItem(PROBE_CACHE_KEY, allowed ? '1' : '0')
  }
  catch {
    // 忽略：缓存只是优化
  }
}

/** 读取站点自带的 CSP meta。CFSM 会主动移除 CSP meta，因此这里通常为空 */
function readMetaPolicies(): string[] {
  const policies: string[] = []
  document.querySelectorAll('meta[http-equiv]').forEach((meta) => {
    if (meta.getAttribute('http-equiv')?.toLowerCase() !== 'content-security-policy')
      return
    const content = meta.getAttribute('content')
    if (content?.trim())
      policies.push(content)
  })
  return policies
}

/**
 * 读取本文档响应头中的 CSP。
 *
 * - 返回 `null`：响应正常但不含 CSP，说明站点未启用内容安全策略（如纯静态托管）。
 * - 返回 `undefined`：探测失败，无法判定。
 *
 * 用 `force-cache` 复用文档自身的缓存副本，正常情况下不会产生额外的网络往返。
 */
async function readHeaderPolicy(): Promise<string | null | undefined> {
  try {
    const response = await fetch(window.location.href, { cache: 'force-cache' })
    // 只需要响应头，立刻丢弃正文
    void response.body?.cancel()
    if (!response.ok)
      return undefined
    const header = response.headers.get('Content-Security-Policy')
    return header?.trim() ? header : null
  }
  catch {
    return undefined
  }
}

/** 解析单条 CSP 指令的来源列表；指令不存在时返回 `null`，调用方据此回落到 `default-src` */
export function cspDirectiveSources(policy: string, directive: string): string[] | null {
  for (const segment of policy.split(';')) {
    const tokens = segment.trim().split(/\s+/).filter(Boolean)
    const name = tokens[0]?.toLowerCase()
    if (!name)
      continue
    if (name !== directive.toLowerCase())
      continue
    return tokens.slice(1)
  }
  return null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 判断某个来源是否在来源列表内（支持 `*` 整体通配与 `https://*.example.com` 形式） */
export function cspSourceAllowed(sources: string[], origin: string): boolean {
  const target = origin.toLowerCase()
  return sources.some((source) => {
    const value = source.trim().toLowerCase()
    if (!value)
      return false
    if (value === '*' || value === target)
      return true
    if (!value.includes('*'))
      return false
    const pattern = value.split('*').map(escapeRegExp).join('[^/]*')
    return new RegExp(`^${pattern}$`).test(target)
  })
}

/**
 * 判断某个来源在给定策略下是否被放行。
 *
 * `style-src` / `script-src` 这类指令存在 `-elem` 细分形式，按 CSP 规范依次回落：
 * `<指令>-elem` → `<指令>` → `default-src`；任一环节都没有则视为不放行。
 */
export function cspAllowsOrigin(policy: string, directive: string, origin: string): boolean {
  const sources = cspDirectiveSources(policy, `${directive}-elem`)
    ?? cspDirectiveSources(policy, directive)
    ?? cspDirectiveSources(policy, 'default-src')
  return sources ? cspSourceAllowed(sources, origin) : false
}

/** 收集本文档实际生效的全部 CSP；`undefined` 表示无法判定 */
async function collectPolicies(): Promise<string[] | undefined> {
  const header = await readHeaderPolicy()
  // 响应头读不到就无法判断真实策略，直接放弃，避免误判后触发报错
  if (header === undefined)
    return undefined
  const policies = readMetaPolicies()
  if (header)
    policies.push(header)
  return policies
}

/** 样式表来源与字体文件来源都被放行时才返回 `true`；无法判定时返回 `false` */
async function isWebFontAllowed(): Promise<boolean> {
  const cached = readProbeCache()
  if (cached !== null)
    return cached

  const policies = await collectPolicies()
  let allowed: boolean
  if (policies === undefined) {
    allowed = false
  }
  else if (policies.length === 0) {
    allowed = true
  } // 未启用 CSP，资源不受限制
  else {
    allowed = policies.every(
      policy =>
        cspAllowsOrigin(policy, 'style-src', FONT_STYLE_ORIGIN)
        && cspAllowsOrigin(policy, 'font-src', FONT_FILE_ORIGIN),
    )
  }

  writeProbeCache(allowed)
  return allowed
}

/**
 * 在策略允许时注入正文网页字体。
 *
 * 永不抛错、不阻塞渲染：字体是渐进增强，加载失败时静默回落到系统字体。
 */
export async function ensureWebFontStylesheet(): Promise<void> {
  try {
    if (document.querySelector(`link[${INJECTED_LINK_FLAG}]`))
      return
    if (!await isWebFontAllowed())
      return

    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = FONT_STYLESHEET_URL
    link.setAttribute(INJECTED_LINK_FLAG, '')
    document.head.append(link)
  }
  catch {
    // 字体加载失败不影响任何功能
  }
}
