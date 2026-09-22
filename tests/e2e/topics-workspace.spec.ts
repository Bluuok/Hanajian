import { expect, test } from '@playwright/test'
import { launchTestApp } from './support/electron'

test('topic home preserves results across chat navigation and invalidates edited evidence', async () => {
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
    await home.getByRole('button', { name: '生成话题包' }).click()
    await expect(home.getByText('上线推迟到周六。')).toBeVisible()
    await home.getByRole('button', { name: '查看来源摘录' }).click()
    await expect(home.getByRole('complementary', { name: '消息来源摘录' })).toContainText(
      'fixture-1'
    )
    for (const [width, height] of [
      [1073, 668],
      [1280, 800],
      [1440, 900]
    ]) {
      await fixture.setWindowContentSize({ width, height })
      await page.screenshot({ scale: 'css', path: `test-results/shiyu-home-${width}.png` })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      )
    }
    await home.getByRole('button', { name: '进入聊天 →' }).click()
    await expect(page.locator('.ask-ai-workspace')).toBeVisible()
    await expect(home).toBeHidden()
    await expect(page.locator('.app-companion-dock')).toBeVisible()
    await page.screenshot({ scale: 'css', path: 'test-results/shiyu-chat-1440.png' })
    await page.getByRole('button', { name: '收起伙伴' }).click()
    await expect(page.locator('.app-companion-dock')).toHaveCount(0)
    await page.getByRole('navigation').getByRole('button', { name: '设置', exact: true }).click()
    await expect(page.getByRole('button', { name: '显示伙伴' })).toBeVisible()
    await page.getByRole('navigation').getByRole('button', { name: '话题整理' }).click()
    await expect(home.getByText('上线推迟到周六。')).toBeVisible()
    await home.getByRole('checkbox', { name: '选择候选消息 E1' }).uncheck()
    await expect(home.getByRole('alert')).toContainText('原 AI 结论已失效')
    await expect(home.getByText('上线推迟到周六。')).toHaveCount(0)
    await fixture.setWindowContentSize({ width: 700, height: 600 })
    await expect(home.getByRole('button', { name: '进入聊天 →' })).toBeInViewport({ ratio: 1 })
    await page.screenshot({ scale: 'css', path: 'test-results/shiyu-home-compact.png' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
  } finally {
    await fixture.close()
  }
})

test('dark theme and existing workspaces remain reachable from topic home', async () => {
  const fixture = await launchTestApp({ appearanceTheme: 'dark', initialPage: 'topics' })
  try {
    const { page } = fixture
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.screenshot({ scale: 'css', path: 'test-results/shiyu-home-dark.png' })
    for (const label of ['日报', 'Clawbot', '导出', '设置', '话题整理']) {
      await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
      await expect(page.locator('main.app-shell-main')).toHaveAttribute('aria-label', label)
      await expect(page.locator('.app-companion-dock')).toBeVisible()
    }
    await page.getByRole('button', { name: /折叠群聊样本/ }).click()
    await expect(page.getByRole('heading', { name: '话题整理' })).toBeVisible()
  } finally {
    await fixture.close()
  }
})
