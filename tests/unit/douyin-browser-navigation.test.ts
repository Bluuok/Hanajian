import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const page = {
    on: vi.fn(),
    goto: vi.fn(),
    evaluate: vi.fn(),
    waitForLoadState: vi.fn(),
    waitForTimeout: vi.fn(),
    locator: vi.fn()
  }
  const browser = { newContext: vi.fn(), close: vi.fn() }
  return { page, browser, launch: vi.fn(), route: vi.fn() }
})
vi.mock('playwright-core', () => ({ chromium: { launch: mocks.launch, executablePath: () => '' } }))
import { resolveDouyinWithBrowser } from '../../src/main/platform-integration/douyin-browser'

const id = '7686472347373484971'
const source = `https://www.douyin.com/note/${id}`
const detail = {
  aweme_detail: {
    aweme_id: id,
    desc: '测试图文',
    author: { nickname: '浮寻' },
    images: [{ url_list: ['https://p3-pc-sign.douyinpic.com/test.webp'] }]
  }
}
const snapshot = { data: detail, verification: false, loading: false }

beforeEach(() => {
  for (const mock of Object.values(mocks.page)) mock.mockReset()
  mocks.route.mockReset().mockResolvedValue(undefined)
  mocks.browser.newContext.mockResolvedValue({
    route: mocks.route,
    newPage: vi.fn().mockResolvedValue(mocks.page)
  })
  mocks.browser.close.mockReset().mockResolvedValue(undefined)
  mocks.launch.mockReset().mockResolvedValue(mocks.browser)
  mocks.page.goto.mockResolvedValue(undefined)
  mocks.page.waitForLoadState.mockResolvedValue(undefined)
  mocks.page.waitForTimeout.mockResolvedValue(undefined)
  mocks.page.locator.mockReturnValue({ innerText: vi.fn().mockResolvedValue('普通作品页') })
})

describe('Douyin browser navigation races', () => {
  it('reports unfinished scripts instead of guessing verification or a save failure', async () => {
    let time = 0
    vi.spyOn(Date, 'now').mockImplementation(() => (time += 20000))
    mocks.page.goto.mockImplementation(async () => {
      const callback = mocks.page.on.mock.calls.find(([event]) => event === 'request')![1]
      callback({ resourceType: () => 'script' })
    })
    mocks.page.evaluate.mockResolvedValue({ data: [], verification: false, loading: true })
    await expect(resolveDouyinWithBrowser(id, source)).rejects.toThrow(
      '还有 1 个页面脚本或样式未加载完成'
    )
    expect(mocks.browser.close).toHaveBeenCalledTimes(1)
  })

  it('does not report successful or redirect-aborted scripts as loading failures', async () => {
    let time = 0
    vi.spyOn(Date, 'now').mockImplementation(() => (time += 20000))
    mocks.page.goto.mockImplementation(async () => {
      const handler = (event: string): ((request: unknown) => void) =>
        mocks.page.on.mock.calls.find(([name]) => name === event)![1]
      const successful = { resourceType: () => 'script' }
      const aborted = {
        resourceType: () => 'script',
        failure: () => ({ errorText: 'net::ERR_ABORTED' })
      }
      handler('request')(successful)
      handler('request')(aborted)
      handler('requestfinished')(successful)
      handler('requestfailed')(aborted)
    })
    mocks.page.evaluate.mockResolvedValue({ data: [], verification: false, loading: true })
    const error = await resolveDouyinWithBrowser(id, source).catch((error) => error)
    expect(error.message).toContain('仍未返回本作品详情')
    expect(error.message).not.toContain('页面脚本或样式')
  })

  it('starts reading details at commit instead of waiting for all DOM loading', async () => {
    mocks.page.evaluate.mockResolvedValue(snapshot)
    await resolveDouyinWithBrowser(id, source)
    expect(mocks.page.goto).toHaveBeenCalledWith(`https://www.douyin.com/video/${id}`, {
      waitUntil: 'commit',
      timeout: 25000
    })
  })

  it('continues reading usable page data after a navigation timeout', async () => {
    const timeout = Object.assign(new Error('page.goto: Timeout 25000ms exceeded'), {
      name: 'TimeoutError'
    })
    mocks.page.goto.mockRejectedValueOnce(timeout)
    mocks.page.evaluate.mockResolvedValue(snapshot)
    expect((await resolveDouyinWithBrowser(id, source))?.id).toBe(id)
    expect(mocks.launch).toHaveBeenCalledTimes(1)
    expect(mocks.browser.close).toHaveBeenCalledTimes(1)
  })

  it('preserves matching API details received before navigation times out', async () => {
    mocks.page.goto.mockImplementationOnce(async () => {
      const callback = mocks.page.on.mock.calls.find(([event]) => event === 'response')![1]
      callback({
        url: () => `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${id}`,
        ok: () => true,
        status: () => 200,
        headers: () => ({}),
        text: async () => JSON.stringify(detail)
      })
      await Promise.resolve()
      throw Object.assign(new Error('page.goto: Timeout 25000ms exceeded'), {
        name: 'TimeoutError'
      })
    })
    expect((await resolveDouyinWithBrowser(id, source))?.id).toBe(id)
    expect(mocks.page.evaluate).not.toHaveBeenCalled()
    expect(mocks.browser.close).toHaveBeenCalledTimes(1)
  })

  it('reports a bounded readable failure when navigation and details never arrive', async () => {
    let time = 0
    vi.spyOn(Date, 'now').mockImplementation(() => (time += 20000))
    mocks.page.goto.mockRejectedValueOnce(
      Object.assign(
        new Error('page.goto: Timeout 25000ms exceeded. Call log: \u001b[2m navigating'),
        { name: 'TimeoutError' }
      )
    )
    mocks.page.evaluate.mockResolvedValue({ data: [], verification: false, loading: true })
    await expect(resolveDouyinWithBrowser(id, source)).rejects.toThrow('导航超时，继续等待作品详情')
    expect(mocks.page.evaluate.mock.calls.length).toBeLessThan(5)
    expect(mocks.browser.close).toHaveBeenCalledTimes(1)
  })

  it('does not retry hard navigation network failures', async () => {
    mocks.page.goto.mockRejectedValueOnce(new Error('page.goto: net::ERR_NAME_NOT_RESOLVED'))
    await expect(resolveDouyinWithBrowser(id, source)).rejects.toThrow('ERR_NAME_NOT_RESOLVED')
    expect(mocks.page.evaluate).not.toHaveBeenCalled()
    expect(mocks.browser.close).toHaveBeenCalledTimes(1)
  })

  it('accepts details arriving after the old 20-second cutoff', async () => {
    let time = 0
    vi.spyOn(Date, 'now').mockImplementation(() => time)
    mocks.page.evaluate.mockImplementation(async () => {
      time += 5000
      return time >= 25000 ? snapshot : { data: [], verification: false, loading: true }
    })
    expect((await resolveDouyinWithBrowser(id, source))?.id).toBe(id)
    expect(mocks.page.evaluate).toHaveBeenCalledTimes(5)
    expect(mocks.browser.close).toHaveBeenCalledTimes(1)
  })

  it('skips browser-only images/media/fonts but allows detail requests and scripts', async () => {
    mocks.page.evaluate.mockResolvedValue(snapshot)
    await resolveDouyinWithBrowser(id, source)
    const handler = mocks.route.mock.calls[0][1]
    for (const type of ['image', 'media', 'font', 'script', 'xhr', 'stylesheet']) {
      const route = {
        request: () => ({ resourceType: () => type }),
        abort: vi.fn(),
        continue: vi.fn()
      }
      await handler(route)
      expect(route.abort).toHaveBeenCalledTimes(['image', 'media', 'font'].includes(type) ? 1 : 0)
      expect(route.continue).toHaveBeenCalledTimes(
        ['image', 'media', 'font'].includes(type) ? 0 : 1
      )
    }
  })

  it('waits for the new context and retries after a platform reload', async () => {
    mocks.page.evaluate
      .mockRejectedValueOnce(
        new Error(
          'page.evaluate: Execution context was destroyed, most likely because of a navigation'
        )
      )
      .mockResolvedValueOnce(snapshot)
    const work = await resolveDouyinWithBrowser(id, source)
    expect(work?.id).toBe(id)
    expect(mocks.page.evaluate).toHaveBeenCalledTimes(2)
    expect(mocks.page.waitForLoadState).toHaveBeenCalledWith('domcontentloaded', { timeout: 2000 })
    expect(mocks.launch).toHaveBeenCalledTimes(1)
    expect(mocks.browser.close).toHaveBeenCalledTimes(1)
  })

  it('keeps exact-work response data captured while the execution context disappears', async () => {
    mocks.page.evaluate.mockImplementationOnce(async () => {
      const callback = mocks.page.on.mock.calls.find(([event]) => event === 'response')![1]
      callback({
        url: () => `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${id}`,
        ok: () => true,
        status: () => 200,
        headers: () => ({}),
        text: async () => JSON.stringify(detail)
      })
      await Promise.resolve()
      throw new Error('Execution context was destroyed')
    })
    expect((await resolveDouyinWithBrowser(id, source))?.id).toBe(id)
    expect(mocks.page.evaluate).toHaveBeenCalledTimes(1)
    expect(mocks.browser.close).toHaveBeenCalledTimes(1)
  })

  it('continues after the initial navigation is aborted by a redirect', async () => {
    mocks.page.goto.mockRejectedValueOnce(new Error('page.goto: net::ERR_ABORTED'))
    mocks.page.evaluate.mockResolvedValue(snapshot)
    expect((await resolveDouyinWithBrowser(id, source))?.kind).toBe('images')
    expect(mocks.browser.close).toHaveBeenCalledTimes(1)
  })

  it('does not swallow non-navigation failures and always closes the browser', async () => {
    mocks.page.evaluate.mockRejectedValueOnce(new Error('Unexpected script failure'))
    await expect(resolveDouyinWithBrowser(id, source)).rejects.toThrow('Unexpected script failure')
    expect(mocks.page.evaluate).toHaveBeenCalledTimes(1)
    expect(mocks.browser.close).toHaveBeenCalledTimes(1)
  })

  it('reports platform verification rather than retrying or bypassing it', async () => {
    mocks.page.evaluate.mockResolvedValue({ data: [], verification: true, loading: false })
    await expect(resolveDouyinWithBrowser(id, source)).rejects.toThrow('可见的安全验证组件')
    expect(mocks.page.evaluate).toHaveBeenCalledTimes(1)
    expect(mocks.browser.close).toHaveBeenCalledTimes(1)
  })

  it('bounds retries when the page never becomes stable', async () => {
    let time = 0
    vi.spyOn(Date, 'now').mockImplementation(() => (time += 20000))
    mocks.page.evaluate.mockRejectedValue(new Error('Execution context was destroyed'))
    await expect(resolveDouyinWithBrowser(id, source)).rejects.toThrow('仍未返回本作品详情')
    expect(mocks.page.evaluate.mock.calls.length).toBeLessThan(5)
    expect(mocks.browser.close).toHaveBeenCalledTimes(1)
  })
})
