import { afterEach, it, expect, vi } from 'vitest'
import { resolveXiaohongshuWithBrowser } from '../../src/main/platform-integration/xiaohongshu-browser'

const { launch } = vi.hoisted(() => ({ launch: vi.fn() }))
vi.mock('playwright-core', () => ({ chromium: { launch, executablePath: () => 'unused' } }))
const id = '6aac91e3000000002902c0c0'
const url = `https://www.xiaohongshu.com/discovery/item/${id}`
afterEach(() => {
  vi.unstubAllGlobals()
})
function setup(
  state: unknown,
  target = url,
  verification = false
): {
  browser: { close: ReturnType<typeof vi.fn> }
  page: {
    goto: ReturnType<typeof vi.fn>
    url: () => string
    evaluate: ReturnType<typeof vi.fn>
    waitForTimeout: ReturnType<typeof vi.fn>
  }
} {
  vi.stubGlobal('window', { __INITIAL_STATE__: state })
  vi.stubGlobal('document', {
    querySelectorAll: () =>
      verification ? [{ getBoundingClientRect: () => ({ width: 200, height: 200 }) }] : []
  })
  vi.stubGlobal('getComputedStyle', () => ({ display: 'block', visibility: 'visible' }))
  const page = {
    goto: vi.fn(),
    url: () => target,
    evaluate: vi.fn(async (fn: (id: string) => unknown, targetId: string) => fn(targetId)),
    waitForTimeout: vi.fn()
  }
  const context = { route: vi.fn(), newPage: async () => page }
  const browser = { newContext: async () => context, close: vi.fn() }
  launch.mockResolvedValue(browser)
  return { browser, page }
}
it('projects only the target note despite cycles in the Vue global state and unwraps refs', async () => {
  const cyclic: Record<string, unknown> = {}
  cyclic.computed = cyclic
  const note = {
    noteId: id,
    type: 'normal',
    title: '正确笔记',
    imageList: [{ urlDefault: 'http://sns-webpic-qc.xhscdn.com/a.webp?sign=unchanged' }]
  }
  const { browser, page } = setup({
    unrelated: cyclic,
    note: { noteDetailMap: { __v_isRef: true, value: { [id]: { note } } } }
  })
  const work = await resolveXiaohongshuWithBrowser('https://xhslink.cn/o/ALBk4gTBbgV', id)
  expect(work?.id).toBe(id)
  expect(work?.assets[0].urls).toEqual(['https://sns-webpic-qc.xhscdn.com/a.webp?sign=unchanged'])
  expect(work?.resolvedBy).toBe('browser')
  expect(page.evaluate).toHaveBeenCalledTimes(1)
  expect(browser.close).toHaveBeenCalledTimes(1)
})
it('stops at a visible verification component and always closes its isolated browser', async () => {
  const { browser } = setup({}, url, true)
  await expect(resolveXiaohongshuWithBrowser(url, id)).rejects.toThrow('安全验证')
  expect(browser.close).toHaveBeenCalledTimes(1)
})
it('rejects redirected mismatched notes before reading their state', async () => {
  const { browser, page } = setup(
    {},
    'https://www.xiaohongshu.com/explore/ffffffffffffffffffffffff'
  )
  await expect(resolveXiaohongshuWithBrowser(url, id)).rejects.toThrow('不一致')
  expect(page.evaluate).not.toHaveBeenCalled()
  expect(browser.close).toHaveBeenCalledTimes(1)
})

it('reports a real platform network restriction promptly and closes the browser', async () => {
  const { browser, page } = setup({}, 'https://www.xiaohongshu.com/website-login/error')
  vi.stubGlobal('document', {
    body: { innerText: '安全限制\nIP存在风险，请切换可靠网络环境后重试' }
  })
  await expect(resolveXiaohongshuWithBrowser(url, id)).rejects.toThrow('限制了当前网络访问')
  expect(page.evaluate).toHaveBeenCalledOnce()
  expect(page.waitForTimeout).not.toHaveBeenCalled()
  expect(browser.close).toHaveBeenCalledOnce()
})

it('reports that a note requires login without importing a browser account', async () => {
  const { browser, page } = setup({}, 'https://www.xiaohongshu.com/login')
  vi.stubGlobal('document', { body: { innerText: '登录小红书' } })
  await expect(resolveXiaohongshuWithBrowser(url, id)).rejects.toThrow('需要登录才能访问')
  expect(page.waitForTimeout).not.toHaveBeenCalled()
  expect(browser.close).toHaveBeenCalledOnce()
})
