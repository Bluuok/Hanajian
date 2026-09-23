import { expect, test } from '@playwright/test'
import { launchTestApp } from './support/electron'
import fs from 'fs'
import path from 'path'

const copyToDocs = async (src: string, filename: string): Promise<void> => {
  const destDir = path.resolve('docs/verification/homepage-after')
  fs.mkdirSync(destDir, { recursive: true })
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(destDir, filename))
  }
}

test('topic home visual composition, evidence selection sync, and chat navigation', async () => {
  const fixture = await launchTestApp({ initialPage: 'topics' })
  const page = fixture.page
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await expect(page.getByRole('navigation', { name: '一级导航' })).toBeVisible()
    await expect(page.locator('main.app-shell-main')).toHaveAttribute('aria-label', '话题整理')
    const home = page.getByRole('region', { name: '话题首页' })
    await expect(home).toBeVisible()
    await expect(page.locator('.app-companion-dock')).toBeVisible()
    await expect(page.getByRole('status', { name: '图片解密提醒' })).toHaveCount(0)

    // Capture initial empty state
    await page.screenshot({ scale: 'css', path: 'test-results/shiyu-home-initial.png' })
    await copyToDocs('test-results/shiyu-home-initial.png', 'shiyu-home-initial.png')

    // Generate topic package
    await home.getByRole('button', { name: '生成话题包' }).click()
    await expect(home.getByText('上线推迟到周六。').first()).toBeVisible()

    // Locate original source via 查看原文
    await home.getByRole('button', { name: '查看原文 E1' }).click()
    await expect(home.getByRole('complementary', { name: '消息来源摘录' })).toContainText(
      '真实数据库原文'
    )
    await expect(home.getByRole('complementary', { name: '消息来源摘录' })).toContainText('#1')

    await expect(home.locator('.topic-badge-category')).toHaveCount(0)
    await expect(home.getByText('Craft 的功能建议')).toHaveCount(0)
    const cdp = await page.context().newCDPSession(page)

    // Capture responsive screenshots at three desktop viewport sizes
    for (const [width, height] of [
      [1073, 668],
      [1280, 800],
      [1440, 900]
    ]) {
      await fixture.setWindowContentSize({ width, height })
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false
      })
      const screenshotPath = `test-results/shiyu-home-${width}.png`
      await page.screenshot({ scale: 'css', path: screenshotPath })
      await copyToDocs(screenshotPath, `shiyu-home-${width}.png`)
      // Verify no horizontal overflow
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      )
    }

    // Capture 125% zoom screenshot
    await page.evaluate(() => {
      document.body.style.zoom = '1.25'
    })
    await page.waitForTimeout(200)
    await page.screenshot({ scale: 'css', path: 'test-results/shiyu-home-zoom125.png' })
    await copyToDocs('test-results/shiyu-home-zoom125.png', 'shiyu-home-zoom125.png')
    await page.evaluate(() => {
      document.body.style.zoom = '1.0'
    })
    await page.waitForTimeout(100)

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 2,
      mobile: false
    })
    expect(await page.evaluate(() => devicePixelRatio)).toBeCloseTo(2, 5)
    await page.screenshot({ path: 'test-results/shiyu-home-dpr2.png' })
    await copyToDocs('test-results/shiyu-home-dpr2.png', 'shiyu-home-dpr2.png')
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    })

    await home.getByRole('button', { name: '继续探索新话题' }).click()
    await expect(home.getByRole('searchbox', { name: '话题' })).toBeFocused()

    // Verify Defect 1: Uncheck E1, verify summary invalidated; switch to E2, verify E1 remains unchecked
    await home.getByRole('checkbox', { name: '选择候选消息 E1' }).uncheck()
    await expect(home.getByRole('alert')).toContainText('原 AI 结论已失效')
    await expect(home.getByRole('checkbox', { name: '选择候选消息 E1' })).not.toBeChecked()

    // Click 查看原文 E2
    await home.getByRole('button', { name: '查看原文 E2' }).click()
    await expect(home.getByRole('complementary', { name: '消息来源摘录' })).toContainText('#2')
    // E1 must remain unchecked!
    await expect(home.getByRole('checkbox', { name: '选择候选消息 E1' })).not.toBeChecked()
    await expect(home.getByRole('alert')).toContainText('原 AI 结论已失效')

    // Navigate to chat
    await home.getByRole('button', { name: '在聊天中定位 →' }).click()
    await expect(page.locator('.ask-ai-workspace')).toBeVisible()
    await expect(home).toBeHidden()
    await expect(page.locator('.app-companion-dock')).toBeVisible()
    await expect(page.locator('.source-snapshot-banner')).toBeVisible()
    await expect(page.locator('.source-snapshot-banner')).toContainText('正在查看历史原文')
    await expect(page.getByRole('button', { name: '返回最新消息' })).toBeVisible()
    await expect(page.locator('.archive-jump-message')).toBeVisible()
    for (const [width, height] of [
      [1073, 668],
      [1280, 800],
      [1440, 900]
    ]) {
      await fixture.setWindowContentSize({ width, height })
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false
      })
      await page.screenshot({ scale: 'css', path: 'test-results/shiyu-chat-' + width + '.png' })
      await copyToDocs('test-results/shiyu-chat-' + width + '.png', 'shiyu-chat-' + width + '.png')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      )
    }

    // Return to latest messages from snapshot
    await page.getByRole('button', { name: '返回最新消息' }).click()
    await expect(page.locator('.source-snapshot-banner')).toHaveCount(0)

    // Test companion toggle
    await page.getByRole('button', { name: '收起伙伴' }).click()
    await expect(page.locator('.app-companion-dock')).toHaveCount(0)
    await page.getByRole('navigation').getByRole('button', { name: '设置', exact: true }).click()
    await expect(page.getByRole('button', { name: '显示伙伴' })).toBeVisible()
    await page.getByRole('navigation').getByRole('button', { name: '话题整理' }).click()

    // Results and invalidated state preserved after returning
    await expect(home.getByRole('checkbox', { name: '选择候选消息 E1' })).not.toBeChecked()
    await expect(home.getByRole('alert')).toContainText('原 AI 结论已失效')
    await expect(home.locator('.topic-claim-text')).toHaveCount(0)

    await page.getByRole('button', { name: '显示伙伴' }).click()

    // Test compact window size (700x600)
    await fixture.setWindowContentSize({ width: 700, height: 600 })
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 700,
      height: 600,
      deviceScaleFactor: 1,
      mobile: false
    })
    await page.screenshot({ scale: 'css', path: 'test-results/shiyu-home-compact.png' })
    await copyToDocs('test-results/shiyu-home-compact.png', 'shiyu-home-compact.png')
    const openChatBtn = home.getByRole('button', { name: '在聊天中定位 →' })
    await openChatBtn.scrollIntoViewIfNeeded()
    await expect(openChatBtn).toBeInViewport({ ratio: 0.5 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
  } finally {
    await fixture.close()
  }
})

test('white theme enforced when launched with legacy dark settings', async () => {
  const fixture = await launchTestApp({ appearanceTheme: 'dark', initialPage: 'topics' })
  try {
    const { page } = fixture
    // Even if backend returned legacy 'dark', renderer normalizes it to light
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.screenshot({ scale: 'css', path: 'test-results/shiyu-home-dark.png' })
    await copyToDocs('test-results/shiyu-home-dark.png', 'shiyu-home-dark.png')

    for (const label of ['日报', 'Clawbot', '导出', '设置', '话题整理']) {
      await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
      await expect(page.locator('main.app-shell-main')).toHaveAttribute('aria-label', label)
      await expect(page.locator('.app-companion-dock')).toBeVisible()
    }
  } finally {
    await fixture.close()
  }
})

test('topic package AI failure state', async () => {
  const fixture = await launchTestApp({
    initialPage: 'topics',
    topicAiFailed: true
  })
  try {
    const { page } = fixture
    const home = page.getByRole('region', { name: '话题首页' })
    await expect(home).toBeVisible()
    await home.getByRole('button', { name: '生成话题包' }).click()

    // In AI_FAILED state, candidate evidence is displayed with warning notice, claims are not verified
    await expect(home.getByText('摘要尚未通过 AI 核对，以下仅为候选原文。')).toBeVisible()
    await page.screenshot({ scale: 'css', path: 'test-results/shiyu-home-ai-failed.png' })
    await copyToDocs('test-results/shiyu-home-ai-failed.png', 'shiyu-home-ai-failed.png')
  } finally {
    await fixture.close()
  }
})

test('topic package true empty state', async () => {
  const fixture = await launchTestApp({
    initialPage: 'topics',
    topicEmpty: true
  })
  try {
    const { page } = fixture
    const home = page.getByRole('region', { name: '话题首页' })
    await expect(home).toBeVisible()
    await home.getByRole('button', { name: '生成话题包' }).click()

    // In empty state, no_results state is displayed
    await expect(home.getByRole('heading', { name: /未检索到/ })).toBeVisible()
    await page.screenshot({ scale: 'css', path: 'test-results/shiyu-home-empty.png' })
    await copyToDocs('test-results/shiyu-home-empty.png', 'shiyu-home-empty.png')
  } finally {
    await fixture.close()
  }
})

test('topic package dependency error state', async () => {
  const fixture = await launchTestApp({
    initialPage: 'topics',
    topicDependencyError: true
  })
  try {
    const { page } = fixture
    const home = page.getByRole('region', { name: '话题首页' })
    await expect(home).toBeVisible()
    await home.getByRole('button', { name: '生成话题包' }).click()

    // In error state, error container is displayed with retry button
    await expect(home.getByRole('alert')).toContainText('整理失败（DEPENDENCY_FAILED）')
    await expect(home.getByRole('button', { name: '重试' })).toBeVisible()
    await page.screenshot({ scale: 'css', path: 'test-results/shiyu-home-error.png' })
    await copyToDocs('test-results/shiyu-home-error.png', 'shiyu-home-error.png')
  } finally {
    await fixture.close()
  }
})

test('exact source navigation: historical source, duplicate same-second messages, failed lookup, and return to latest', async () => {
  const fixture = await launchTestApp({ initialPage: 'topics' })
  const { page } = fixture
  try {
    const home = page.getByRole('region', { name: '话题首页' })
    await expect(home).toBeVisible()

    // 1. Test missing source locator failure: stays on topic page, does not switch to ask-ai
    const topicInput = home.getByRole('searchbox', { name: '话题' })
    await topicInput.fill('missing')
    await home.getByRole('button', { name: '生成话题包' }).click()
    await expect(home.getByText('这条消息在本地数据库已不存在').first()).toBeVisible()
    await home.getByRole('button', { name: '在聊天中定位 →' }).click()
    await expect(home).toBeVisible()
    await expect(page.locator('.ask-ai-workspace')).toBeHidden()
    await expect(home.getByRole('alert')).toContainText('本机未找到这条原始消息。')

    // 2. Test historical source locator
    await topicInput.fill('historical')
    await home.getByRole('button', { name: '重新生成' }).click()
    await expect(home.getByText('这是一条远古历史消息').first()).toBeVisible()
    await home.getByRole('button', { name: '在聊天中定位 →' }).click()

    // Switched to ask-ai workspace with snapshot banner
    await expect(page.locator('.ask-ai-workspace')).toBeVisible()
    await expect(page.locator('.source-snapshot-banner')).toBeVisible()
    await expect(page.locator('.archive-jump-message')).toContainText('这是一条远古历史消息')

    // Click return to latest
    await page.getByRole('button', { name: '返回最新消息' }).click()
    await expect(page.locator('.source-snapshot-banner')).toHaveCount(0)

    await expect(page.locator('.message-list')).toContainText('我最近在用 Craft')

    // 3. Test duplicate same-second message resolution
    await page.getByRole('navigation').getByRole('button', { name: '话题整理' }).click()
    await topicInput.fill('duplicate')
    await home.getByRole('button', { name: '重新生成' }).click()
    await expect(home.getByText('同秒第 2 条消息（精准定位目标）').first()).toBeVisible()
    await home.getByRole('button', { name: '在聊天中定位 →' }).click()

    await expect(page.locator('.ask-ai-workspace')).toBeVisible()
    await expect(page.locator('.source-snapshot-banner')).toBeVisible()
    // Exact target message is highlighted, NOT the other duplicate message
    await expect(page.locator('.archive-jump-message')).toContainText(
      '同秒第 2 条消息（精准定位目标）'
    )
  } finally {
    await fixture.close()
  }
})

test('raw record disappearance reports a visible error without inventing a chat message', async () => {
  const fixture = await launchTestApp({ initialPage: 'topics' })
  try {
    const home = fixture.page.getByRole('region', { name: '话题首页' })
    await home.getByRole('button', { name: '生成话题包' }).click()
    await expect(home.getByText('上线推迟到周六。').first()).toBeVisible()
    await fixture.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('db:getMessages')
      ipcMain.handle('db:getMessages', () => [])
    })
    await home.getByRole('button', { name: '在聊天中定位 →' }).click()
    await expect(home.getByRole('alert')).toContainText('无法唯一定位')
    await expect(fixture.page.locator('.source-snapshot-banner')).toHaveCount(0)
    await expect(home).toBeVisible()
  } finally {
    await fixture.close()
  }
})

test('a group change cancels delayed source navigation', async () => {
  const fixture = await launchTestApp({ initialPage: 'topics' })
  try {
    const { page } = fixture
    const home = page.getByRole('region', { name: '话题首页' })
    await home.getByRole('button', { name: '生成话题包' }).click()
    await expect(home.getByText('上线推迟到周六。').first()).toBeVisible()
    await fixture.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('topic:locateSource')
      ipcMain.handle('topic:locateSource', async (_event, locator) => {
        await new Promise((resolve) => setTimeout(resolve, 600))
        return {
          success: true,
          message: {
            id: locator.messageId,
            groupId: locator.groupId,
            sentAt: locator.timestamp,
            content: 'late',
            senderName: 'late',
            type: '文本'
          }
        }
      })
    })
    await home.getByRole('button', { name: '在聊天中定位 →' }).click()
    await page.getByRole('button', { name: /折叠群聊样本/ }).click()
    await page.waitForTimeout(800)
    await expect(home).toBeVisible()
    await expect(page.getByRole('button', { name: /折叠群聊样本/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await expect(page.locator('.source-snapshot-banner')).toHaveCount(0)
  } finally {
    await fixture.close()
  }
})

test('loading state and subscription drawer are usable', async () => {
  const fixture = await launchTestApp({ initialPage: 'topics' })
  try {
    const { page } = fixture
    const home = page.getByRole('region', { name: '话题首页' })
    const subscriptions = home.getByRole('button', { name: '打开每日订阅管理' })
    await subscriptions.click()
    await expect(page.getByRole('dialog', { name: '每日订阅与运行历史' })).toBeVisible()
    await expect(page.locator('body > .topic-subscription-drawer-overlay')).toBeVisible()
    await page.getByRole('button', { name: '关闭订阅管理' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await subscriptions.click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(subscriptions).toBeFocused()
    await fixture.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('topic:generatePackage')
      ipcMain.handle('topic:generatePackage', async () => {
        await new Promise((resolve) => setTimeout(resolve, 1500))
        return {
          success: false,
          error: { code: 'DEPENDENCY_FAILED', message: '测试超时', retryable: true }
        }
      })
    })
    await home.getByRole('button', { name: '生成话题包' }).click()
    await expect(home.getByRole('status', { name: '正在整理话题' })).toBeVisible()
    await page.screenshot({ scale: 'css', path: 'test-results/shiyu-home-loading.png' })
    await copyToDocs('test-results/shiyu-home-loading.png', 'shiyu-home-loading.png')
    await expect(home.getByRole('alert')).toContainText('测试超时')
  } finally {
    await fixture.close()
  }
})

test('long evidence list scrolls without moving the source message', async () => {
  const fixture = await launchTestApp({ initialPage: 'topics' })
  try {
    const { page } = fixture
    const home = page.getByRole('region', { name: '话题首页' })
    await fixture.setWindowContentSize({ width: 1280, height: 800 })
    await home.getByRole('button', { name: '生成话题包' }).click()
    await expect(home.locator('.topic-evidence-item').first()).toBeVisible()
    await page.evaluate(() => {
      const list = document.querySelector('.topic-evidence-items')
      const first = list?.querySelector('.topic-evidence-item')
      if (!list || !first) throw new Error('Evidence list fixture is unavailable')
      for (let index = 0; index < 80; index += 1) list.append(first.cloneNode(true))
    })
    const list = home.locator('.topic-evidence-items')
    await list.scrollIntoViewIfNeeded()
    const before = await page.evaluate(() => ({
      pageTop: document.querySelector('.topics-main')?.scrollTop,
      sourceTop: document.querySelector('.topic-source-card')?.getBoundingClientRect().top,
      listHeight: document.querySelector('.topic-evidence-items')?.clientHeight,
      contentHeight: document.querySelector('.topic-evidence-items')?.scrollHeight
    }))
    expect(before.contentHeight).toBeGreaterThan(before.listHeight || 0)
    await list.hover()
    await page.mouse.wheel(0, 600)
    await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    const after = await page.evaluate(() => ({
      pageTop: document.querySelector('.topics-main')?.scrollTop,
      sourceTop: document.querySelector('.topic-source-card')?.getBoundingClientRect().top
    }))
    expect(after.pageTop).toBe(before.pageTop)
    expect(after.sourceTop).toBe(before.sourceTop)
  } finally {
    await fixture.close()
  }
})

test('switching groups restores the topic result and reading position', async () => {
  const fixture = await launchTestApp({ initialPage: 'topics', topicEvidenceCount: 80 })
  try {
    const { page } = fixture
    await fixture.setWindowContentSize({ width: 1073, height: 668 })
    const home = page.getByRole('region', { name: '话题首页' })
    const groups = page.locator('.topics-group-item')
    await expect(groups).toHaveCount(2)
    await home.getByRole('button', { name: '生成话题包' }).click()
    await expect(home.getByRole('checkbox', { name: '选择候选消息 E1', exact: true })).toBeVisible()
    await home.getByRole('checkbox', { name: '选择候选消息 E1', exact: true }).uncheck()
    await home.getByRole('button', { name: '查看原文 E2', exact: true }).click()
    await expect(home.getByRole('complementary', { name: '消息来源摘录' })).toContainText('#2')
    const evidenceList = home.locator('.topic-evidence-items')
    await evidenceList.evaluate((element) => {
      element.scrollTop = 340
    })
    const savedEvidenceTop = await evidenceList.evaluate((element) => element.scrollTop)
    expect(savedEvidenceTop).toBeGreaterThan(0)
    const main = home
    await main.evaluate((element) => {
      element.scrollTop = 110
    })
    const savedTop = await main.evaluate((element) => element.scrollTop)
    expect(savedTop).toBeGreaterThan(0)

    await groups.nth(1).click()
    await expect(home.getByRole('checkbox', { name: '选择候选消息 E1', exact: true })).toHaveCount(0)
    await home.getByRole('searchbox', { name: '话题' }).fill('新群话题')
    await groups.nth(0).click()

    await expect(home.getByRole('searchbox', { name: '话题' })).toHaveValue('craft')
    await expect(home.getByRole('checkbox', { name: '选择候选消息 E1', exact: true })).not.toBeChecked()
    await expect(home.getByRole('complementary', { name: '消息来源摘录' })).toContainText('#2')
    expect(await main.evaluate((element) => element.scrollTop)).toBe(savedTop)
    expect(
      await home.locator('.topic-evidence-items').evaluate((element) => element.scrollTop)
    ).toBe(savedEvidenceTop)
    await groups.nth(1).click()
    await expect(home.getByRole('searchbox', { name: '话题' })).toHaveValue('新群话题')
  } finally {
    await fixture.close()
  }
})
