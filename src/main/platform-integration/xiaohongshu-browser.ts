import { existsSync } from 'fs'
import type { Browser } from 'playwright-core'
import type { PlatformWork } from '../../shared/platform-integration'
import { trackPlatformBrowser, untrackPlatformBrowser } from './douyin-browser'
import { validatePlatformUrl, XHS_PAGE_HOSTS } from './platform-url'
import { identifyXiaohongshuWork, normalizeXiaohongshuDetail } from './xiaohongshu-parser'

export async function resolveXiaohongshuWithBrowser(
  sourceUrl: string,
  expectedId?: string
): Promise<PlatformWork | undefined> {
  validatePlatformUrl(sourceUrl, 'page')
  const { chromium } = await import('playwright-core')
  let browser: Browser | undefined
  for (const channel of process.platform === 'win32'
    ? ['msedge', 'chrome', 'chromium']
    : ['chrome', 'chromium']) {
    if (channel === 'chromium' && !existsSync(chromium.executablePath())) continue
    try {
      browser = await chromium.launch({ channel, headless: true, timeout: 15000 })
      break
    } catch {
      /* next installed browser */
    }
  }
  if (!browser)
    throw new Error('BROWSER_UNAVAILABLE: 未找到可启动的 Edge、Chrome 或 Playwright Chromium')
  try {
    trackPlatformBrowser(browser)
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: 'zh-CN'
    })
    await context.route('**/*', (route) => {
      const request = route.request()
      if (['image', 'media', 'font'].includes(request.resourceType())) return route.abort()
      if (request.isNavigationRequest() && request.frame() === request.frame().page().mainFrame()) {
        try {
          if (
            !identifyXiaohongshuWork(request.url()) &&
            !XHS_PAGE_HOSTS.has(validatePlatformUrl(request.url(), 'page').hostname)
          )
            return route.abort()
        } catch {
          return route.abort()
        }
      }
      return route.continue()
    })
    const page = await context.newPage()
    try {
      await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 25000 })
    } catch (error) {
      if (!/ERR_ABORTED|navigation.*interrupted/i.test(String(error))) throw error
    }
    const deadline = Date.now() + 45000
    while (Date.now() < deadline) {
      try {
        const pathname = new URL(page.url()).pathname
        if (pathname === '/website-login/error' || pathname === '/login') {
          const notice = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || '')
          if (notice.includes('IP存在风险'))
            throw new Error('小红书限制了当前网络访问，请切换可靠网络后重试；未下载任何媒体')
          throw new Error(
            pathname === '/login'
              ? '该小红书作品需要登录才能访问，当前仅支持公开链接；未下载任何媒体'
              : '小红书页面返回访问限制，请检查链接或稍后重试；未下载任何媒体'
          )
        }
        const identified = identifyXiaohongshuWork(page.url())
        if (expectedId && identified && identified.id !== expectedId)
          throw new Error('小红书跳转作品与请求不一致，已停止解析')
        const snapshot = await page.evaluate(
          (targetId) => {
            const object = (value: unknown): Record<string, unknown> =>
              value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
            const unwrap = (value: unknown): unknown =>
              object(value).__v_isRef ? object(value).value : value
            const state = object((window as unknown as Record<string, unknown>).__INITIAL_STATE__)
            const notes = object(unwrap(object(unwrap(state.note)).noteDetailMap))
            const note = object(unwrap(object(unwrap(notes[targetId])).note))
            // The global store contains Vue computed dependencies and cycles. Only
            // serialize the exact note's media/metadata, never the entire store.
            const projected = Object.keys(note).length
              ? {
                  noteId: note.noteId || targetId,
                  type: note.type,
                  title: note.title,
                  desc: note.desc,
                  user: { nickname: object(unwrap(note.user)).nickname },
                  imageList: unwrap(note.imageList),
                  video: unwrap(note.video)
                }
              : undefined
            const seen = new WeakSet<object>()
            const text = projected
              ? JSON.stringify(
                  { note: { noteDetailMap: { [targetId]: { note: projected } } } },
                  (_key, value) => {
                    if (value && typeof value === 'object') {
                      if (seen.has(value)) return undefined
                      seen.add(value)
                    }
                    return value
                  }
                )
              : undefined
            const verification = [
              ...document.querySelectorAll('[class*="captcha"], #captcha, iframe[src*="captcha"]')
            ].some((element) => {
              const box = element.getBoundingClientRect(),
                style = getComputedStyle(element)
              return (
                box.width > 0 &&
                box.height > 0 &&
                style.display !== 'none' &&
                style.visibility !== 'hidden'
              )
            })
            return { text: text && text.length <= 8 * 1024 * 1024 ? text : undefined, verification }
          },
          expectedId || identified?.id || ''
        )
        if (snapshot.text && identified) {
          const work = normalizeXiaohongshuDetail(
            JSON.parse(snapshot.text),
            expectedId || identified.id,
            identified.sourceUrl,
            'browser'
          )
          if (work) return work
        }
        if (snapshot.verification)
          throw new Error('小红书页面要求安全验证，自动解析已停止；不会绕过验证码')
      } catch (error) {
        if (
          !/Execution context was destroyed|Cannot find context with specified id/i.test(
            String(error)
          )
        )
          throw error
      }
      await page.waitForTimeout(500)
    }
    return undefined
  } finally {
    untrackPlatformBrowser(browser)
    await browser.close()
  }
}
