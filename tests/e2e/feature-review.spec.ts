import { expect, test, type Page } from '@playwright/test'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { launchTestApp, type TestApplication } from './support/electron'

const screenshotRoot =
  process.env.HANAJIAN_SCREENSHOT_DIR || resolve('.tmp-test-artifacts/feature-review/screenshots')
const share = 'https://www.xiaohongshu.com/explore/6411cf99000000001300b6d9'
const fixedNow = Date.parse('2026-10-03T16:00:00+08:00')

async function capture(page: Page, name: string): Promise<void> {
  mkdirSync(screenshotRoot, { recursive: true })
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(
      Array.from(document.images)
        .filter((image) => {
          const rect = image.getBoundingClientRect()
          return rect.width > 0 && rect.height > 0 && rect.top < innerHeight && rect.bottom > 0
        })
        .map((image) => image.decode())
    )
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  })
  await page.screenshot({
    path: join(screenshotRoot, `${name}.png`),
    scale: 'css',
    animations: 'disabled',
    caret: 'hide'
  })
  writeFileSync(
    join(screenshotRoot, `${name}.json`),
    JSON.stringify(
      await page.evaluate(() => ({
        viewport: { width: innerWidth, height: innerHeight },
        devicePixelRatio,
        userAgent: navigator.userAgent,
        screenshotScale: 'css',
        data: 'Synthetic fixture; no real WeChat account or AI provider'
      })),
      null,
      2
    )
  )
}

async function checkLayout(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  for (const selector of ['.platform-integration-content', '.platform-integration-result']) {
    const element = page.locator(selector)
    if ((await element.count()) > 0) {
      expect(await element.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
    }
  }
}

async function openCollection(fixture: TestApplication): Promise<void> {
  await fixture.page
    .getByRole('navigation', { name: '一级导航' })
    .getByRole('button', { name: '内容收藏', exact: true })
    .click()
}

async function parseCollection(page: Page): Promise<void> {
  await page.getByRole('textbox', { name: '分享文案或链接' }).fill(share)
  await page.getByRole('button', { name: '解析与预览' }).click()
  await expect(page.getByRole('heading', { name: '合成收藏：本地笔记' })).toBeVisible()
  await expect(page.getByRole('button', { name: '解析与预览' })).toBeEnabled()
}

test('collection matches the existing page, decodes previews and saves working local note links', async () => {
  const fixture = await launchTestApp({ initialPage: 'topics', now: fixedNow })
  const { page } = fixture
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await fixture.setWindowContentSize({ width: 1280, height: 800 })
    await page.getByRole('combobox', { name: '时间跨度快捷选择' }).selectOption('today')
    await page.getByRole('combobox', { name: '时间跨度快捷选择' }).selectOption('yesterday')
    await page.getByRole('button', { name: '生成话题包' }).click()
    await expect(page.getByText('上线推迟到周六。').first()).toBeVisible()
    await capture(page, 'existing-topic-home')
    await openCollection(fixture)
    await checkLayout(page)
    const art = page.locator('.platform-integration-artwork')
    await expect(art).toBeVisible()
    const heading = await page
      .locator('.platform-integration-heading > div:last-child')
      .boundingBox()
    const illustration = await art.boundingBox()
    expect(heading!.x + heading!.width).toBeLessThanOrEqual(illustration!.x)
    await capture(page, 'collection-idle-1280')
    await parseCollection(page)
    await expect(page.getByRole('link', { name: '查看原作品 ↗' })).toHaveAttribute('href', share)
    await expect(page.getByRole('button', { name: '写入 MD' })).toBeDisabled()
    const result = page.locator('.platform-integration-result')
    await result.scrollIntoViewIfNeeded()
    const preview = page.getByRole('img', { name: '作品第 1 张图片' })
    await expect(preview).toHaveJSProperty('complete', true)
    expect(await preview.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(
      0
    )
    await capture(page, 'collection-preview-1280')
    await result.screenshot({
      path: join(screenshotRoot, 'collection-preview-detail.png'),
      scale: 'css',
      animations: 'disabled'
    })
    await page.getByRole('button', { name: '保存第 1 张' }).click()
    await expect(page.getByText('已保存 1 个文件')).toBeVisible()
    await page.getByRole('button', { name: '写入 MD' }).click()
    await expect(page.getByText('MD 已写入', { exact: true })).toBeVisible()
    const file = join(fixture.userData, 'knowledge-notes', '合成收藏.md')
    expect(existsSync(file)).toBe(true)
    expect(readFileSync(file, 'utf8')).toContain('[图片](../saved-media/合成图片.png)')
    expect(existsSync(join(fixture.userData, 'saved-media', '合成图片.png'))).toBe(true)
    await page.getByText('MD 已写入', { exact: true }).scrollIntoViewIfNeeded()
    await capture(page, 'collection-saved-note')
    for (const size of [
      { width: 1073, height: 668 },
      { width: 820, height: 600 }
    ]) {
      await fixture.setWindowContentSize(size)
      await checkLayout(page)
      await result.scrollIntoViewIfNeeded()
      await capture(page, `collection-preview-${size.width}`)
    }
    expect(errors).toEqual([])
  } finally {
    await fixture.close()
  }
})

test('standalone collection recovers from invalid input and keeps successful saves after a failed retry', async () => {
  const fixture = await launchTestApp({ mode: 'disconnected', now: fixedNow })
  const { page } = fixture
  try {
    await fixture.setWindowContentSize({ width: 820, height: 600 })
    await page.getByRole('button', { name: '先打开内容收藏' }).click()
    await checkLayout(page)
    await capture(page, 'collection-standalone-820')
    await page.getByRole('textbox', { name: '分享文案或链接' }).fill('https://example.com/invalid')
    await page.getByRole('button', { name: '解析与预览' }).click()
    await expect(page.getByRole('alert')).toContainText('请输入抖音或小红书链接')
    await capture(page, 'collection-invalid-input')
    await parseCollection(page)
    await page.getByRole('button', { name: '保存全部图片' }).click()
    await expect(page.getByText('已保存 1 个文件')).toBeVisible()
    await fixture.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('platform-integration:save')
      ipcMain.handle('platform-integration:save', () => ({
        success: false,
        files: [],
        error: '测试：资源已过期'
      }))
    })
    await page.getByRole('button', { name: '保存全部图片' }).click()
    await expect(page.getByRole('alert')).toContainText('测试：资源已过期')
    await expect(page.getByRole('button', { name: '写入 MD' })).toBeEnabled()
    await page.getByRole('button', { name: '写入 MD' }).click()
    await expect(page.getByText('MD 已写入', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '返回花笺' }).click()
    await expect(page.getByRole('button', { name: '先打开内容收藏' })).toBeVisible()
  } finally {
    await fixture.close()
  }
})

test('knowledge settings and drafts remain usable at desktop and compact window sizes', async () => {
  const fixture = await launchTestApp({ now: fixedNow })
  const { page } = fixture
  try {
    await fixture.setWindowContentSize({ width: 1440, height: 900 })
    await page.getByRole('checkbox', { name: /提取专业记忆/ }).check()
    await page.getByRole('combobox', { name: '笔记格式' }).selectOption('action-memory-v1')
    await page.getByRole('textbox', { name: '记忆表达风格' }).fill('简短条目，保留操作步骤')
    await fixture.app.evaluate(
      ({ ipcMain }, directory) => {
        ipcMain.removeHandler('export:selectDirectory')
        ipcMain.handle('export:selectDirectory', () => ({ canceled: false, path: directory }))
      },
      join(fixture.userData, 'knowledge-notes')
    )
    await page.getByRole('button', { name: '选择保存路径' }).click()
    await capture(page, 'knowledge-settings-1440')
    await page.getByRole('textbox', { name: '向 AI 提问' }).fill('总结最近100条消息')
    await page.getByRole('button', { name: '发送', exact: true }).click()
    const draft = page.getByRole('region', { name: '记忆草稿预览' })
    await expect(draft).toBeVisible()
    await expect(page.locator('.ask-ai-memory-config')).not.toHaveAttribute('open', '')
    await capture(page, 'knowledge-draft-1440')
    await draft.screenshot({
      path: join(screenshotRoot, 'knowledge-draft-detail.png'),
      scale: 'css'
    })
    await fixture.setWindowContentSize({ width: 820, height: 600 })
    await checkLayout(page)
    const send = await page.getByRole('button', { name: '发送', exact: true }).boundingBox()
    expect(send!.y + send!.height).toBeLessThanOrEqual(await page.evaluate(() => innerHeight))
    await capture(page, 'knowledge-draft-820')
    const file = join(fixture.userData, 'knowledge-notes', '合成知识笔记.md')
    expect(existsSync(file)).toBe(false)
    await page.getByRole('button', { name: '写入记忆库' }).click()
    await expect(page.getByText(/已写入：/)).toBeVisible()
    expect(readFileSync(file, 'utf8')).toContain('来源：测试成员')
  } finally {
    await fixture.close()
  }
})

test('assistant settings save preferences and render readable logs without overflowing', async () => {
  const fixture = await launchTestApp({ initialPage: 'topics', now: fixedNow })
  const { page } = fixture
  try {
    await fixture.app.evaluate(({ ipcMain }, now) => {
      ipcMain.removeHandler('agent-hub:getLogs')
      ipcMain.handle('agent-hub:getLogs', () => [
        {
          id: 'review-info',
          timestamp: now,
          source: 'agent-hub',
          level: 'info',
          message: '合成日志：已读取消息范围，等待核对笔记草稿。'
        },
        {
          id: 'review-warn',
          timestamp: now,
          source: 'system',
          level: 'warn',
          message: '合成日志：媒体预览过期后可以重新解析。'
        },
        {
          id: 'review-error',
          timestamp: now,
          source: 'system',
          level: 'error',
          message: '合成日志：未配置模型时显示具体原因。'
        }
      ])
    }, fixedNow)
    await page
      .getByRole('navigation', { name: '一级导航' })
      .getByRole('button', { name: '助手设置', exact: true })
      .click()
    await fixture.setWindowContentSize({ width: 1280, height: 800 })
    await page.getByRole('textbox', { name: '附加指令' }).fill('先列结论，再列依据和待办。')
    await page.getByRole('button', { name: '保存指令' }).click()
    await expect(page.getByText('自定义总结指令已保存', { exact: true })).toBeVisible()
    await capture(page, 'assistant-settings-1280')
    await page.locator('.agent-hub-log-card').screenshot({
      path: join(screenshotRoot, 'assistant-logs-detail.png'),
      scale: 'css'
    })
    await fixture.setWindowContentSize({ width: 820, height: 600 })
    await checkLayout(page)
    await page.locator('.agent-hub-log-card').scrollIntoViewIfNeeded()
    await capture(page, 'assistant-logs-820')
    await page.getByRole('button', { name: '恢复默认' }).click()
    await expect(page.getByText('已恢复默认总结规则', { exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: '附加指令' })).toHaveValue('')
  } finally {
    await fixture.close()
  }
})
