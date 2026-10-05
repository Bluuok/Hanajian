import { existsSync } from 'fs'
import type { Browser, Request as BrowserRequest } from 'playwright-core'
import type { PlatformWork } from '../../shared/platform-integration'
import { normalizeDouyinDetail, validatePlatformUrl } from './douyin-parser'

const DETAIL_WAIT_MS = 60000
interface PageSnapshot {
  data: unknown
  verification: boolean
  loading: boolean
}

const activeBrowsers = new Set<Browser>()
let shutdownRequested = false

export function trackPlatformBrowser(browser: Browser): void {
  if (shutdownRequested) throw new Error('应用正在退出，已取消平台解析')
  activeBrowsers.add(browser)
}
export function untrackPlatformBrowser(browser: Browser): void {
  activeBrowsers.delete(browser)
}

export async function closePlatformBrowsers(): Promise<void> {
  shutdownRequested = true
  await Promise.allSettled([...activeBrowsers].map((browser) => browser.close()))
}

export async function resolveDouyinWithBrowser(
  id: string,
  sourceUrl: string
): Promise<PlatformWork | undefined> {
  if (shutdownRequested) throw new Error('应用正在退出，已取消平台解析')
  // Runtime dependency, no third-party parsing endpoint and no personal browser profile.
  const { chromium } = await import('playwright-core')
  let browser: Browser | undefined
  const choices =
    process.platform === 'win32' ? ['msedge', 'chrome', 'chromium'] : ['chrome', 'chromium']
  for (const channel of choices) {
    if (channel === 'chromium' && !existsSync(chromium.executablePath())) continue
    try {
      browser = await chromium.launch({ channel, headless: true, timeout: 15000 })
      break
    } catch {
      /* Try another installed browser. */
    }
  }
  if (!browser)
    throw new Error(
      'BROWSER_UNAVAILABLE: 未找到可启动的 Edge、Chrome 或 Playwright Chromium，请安装浏览器后重试'
    )
  if (shutdownRequested) {
    await browser.close()
    throw new Error('应用正在退出，已取消平台解析')
  }
  activeBrowsers.add(browser)
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: 'zh-CN'
    })
    // This browser only obtains JSON details. Load scripts/styles and platform requests,
    // not recommendation thumbnails, playback or fonts. UI preview/download stays HTTP.
    await context.route('**/*', (route) => {
      return ['image', 'media', 'font'].includes(route.request().resourceType())
        ? route.abort()
        : route.continue()
    })
    const page = await context.newPage()
    const unfinishedResources = new Set<BrowserRequest>()
    let failedResources = 0
    page.on('request', (request) => {
      if (['script', 'stylesheet'].includes(request.resourceType()))
        unfinishedResources.add(request)
    })
    page.on('requestfinished', (request) => unfinishedResources.delete(request))
    page.on('requestfailed', (request) => {
      if (
        unfinishedResources.delete(request) &&
        request.failure()?.errorText !== 'net::ERR_ABORTED'
      )
        failedResources += 1
    })
    let found: PlatformWork | undefined
    let lastSnapshot: PageSnapshot | undefined
    let detailResponseCount = 0
    let lastDetailStatus: number | undefined
    let navigationTimedOut = false
    const pending = new Set<Promise<void>>()
    page.on('response', (response) => {
      const url = response.url()
      try {
        validatePlatformUrl(url, 'page')
      } catch {
        return
      }
      if (
        !/\/(?:aweme\/v\d\/web\/aweme\/detail|web\/api\/v\d\/aweme\/iteminfo)\//.test(
          new URL(url).pathname
        )
      )
        return
      const requestedId =
        new URL(url).searchParams.get('aweme_id') || new URL(url).searchParams.get('item_ids')
      if (requestedId && !requestedId.split(',').includes(id)) return
      detailResponseCount += 1
      lastDetailStatus = response.status()
      const capture = (async () => {
        try {
          if (!response.ok() || Number(response.headers()['content-length'] || 0) > 8 * 1024 * 1024)
            return
          const text = await response.text()
          if (Buffer.byteLength(text) > 8 * 1024 * 1024) return
          const work = normalizeDouyinDetail(JSON.parse(text), id, sourceUrl, 'browser')
          if (work) found = work
        } catch {
          /* HTML, empty or mismatched responses are not a success. */
        }
      })()
      pending.add(capture)
      void capture.finally(() => pending.delete(capture))
    })
    // The desktop /video/ route also serves photo works; observed on the supplied test note.
    try {
      await page.goto(`https://www.douyin.com/video/${id}`, {
        waitUntil: 'commit',
        timeout: 25000
      })
    } catch (error) {
      // Navigation completion is not the success criterion: exact-work details may
      // already have arrived while the document is still loading or redirecting.
      navigationTimedOut = error instanceof Error && error.name === 'TimeoutError'
      if (!navigationTimedOut && !isNavigationRace(error)) throw error
      if (!found) await page.waitForLoadState('domcontentloaded', { timeout: 2000 }).catch(() => {})
    }
    const deadline = Date.now() + DETAIL_WAIT_MS
    while (!found && Date.now() < deadline) {
      let snapshot: PageSnapshot
      try {
        snapshot = await page.evaluate(() => {
          const globals = window as unknown as Record<string, unknown>
          const render = document.getElementById('RENDER_DATA')?.textContent
          let decoded: unknown
          try {
            if (render && render.length < 8 * 1024 * 1024)
              decoded = JSON.parse(decodeURIComponent(render))
          } catch {
            /* No usable embedded data. */
          }
          // Text mentions of verification (e.g. footer/login) are not proof of a captcha.
          const verification = [
            ...document.querySelectorAll(
              '#captcha_container, .captcha_verify_container, [class*="secsdk-captcha"], iframe[src*="verifycenter"]'
            )
          ].some((element) => {
            const box = element.getBoundingClientRect()
            const style = getComputedStyle(element)
            return (
              box.width > 0 &&
              box.height > 0 &&
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              style.opacity !== '0'
            )
          })
          return {
            data: [globals._ROUTER_DATA, globals._SSR_DATA, decoded],
            verification,
            loading: /加载中|正在加载/.test(document.body?.innerText || '')
          }
        })
      } catch (error) {
        if (!isNavigationRace(error)) throw error
        // Scripts on Douyin sometimes reload after DOMContentLoaded. The old execution
        // context disappearing is transient, not a failed work lookup. Retry within
        // the original deadline; never bypass verification or restart endlessly.
        if (found) break
        await page.waitForLoadState('domcontentloaded', { timeout: 2000 }).catch(() => {})
        await page.waitForTimeout(400)
        continue
      }
      lastSnapshot = snapshot
      found ||= normalizeDouyinDetail(snapshot.data, id, sourceUrl, 'browser')
      if (found) break
      if (snapshot.verification && !pending.size)
        throw new Error('抖音页面出现可见的安全验证组件，自动解析已停止；本功能不会自动绕过验证')
      await page.waitForTimeout(400)
    }
    // A response whose body stalls must not turn a bounded lookup into an endless wait.
    if (pending.size && !found) {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          Promise.allSettled([...pending]),
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, 2000)
          })
        ])
      } finally {
        if (timer) clearTimeout(timer)
      }
    }
    if (!found) {
      if (lastSnapshot?.verification)
        throw new Error('抖音页面出现可见的安全验证组件，自动解析已停止；本功能不会自动绕过验证')
      if (!detailResponseCount)
        throw new Error(
          `${navigationTimedOut ? '抖音页面导航超时，继续等待作品详情后仍未获取到数据。' : ''}等待 ${DETAIL_WAIT_MS / 1000} 秒后，抖音页面仍未返回本作品详情${lastSnapshot?.loading ? '，页面仍在加载中' : ''}${unfinishedResources.size ? `，还有 ${unfinishedResources.size} 个页面脚本或样式未加载完成` : failedResources ? `，有 ${failedResources} 个页面脚本或样式加载失败` : ''}。请检查网络后重试；尚不能判断是否为作品访问限制。这不是保存目录或文件命名的问题。`
        )
      if (lastDetailStatus && lastDetailStatus >= 400)
        throw new Error(`抖音作品详情请求失败（HTTP ${lastDetailStatus}），请稍后重试`)
      throw new Error(
        '已收到抖音详情响应，但未找到该作品可用的媒体数据；不是保存目录的问题。请稍后重试。'
      )
    }
    return found
  } finally {
    activeBrowsers.delete(browser)
    await browser.close()
  }
}

function isNavigationRace(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /Execution context was destroyed|Cannot find context with specified id|net::ERR_ABORTED|navigation (?:was |is )?interrupted/i.test(
    message
  )
}
