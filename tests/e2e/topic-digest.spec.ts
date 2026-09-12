import { expect, test } from '@playwright/test'
import { launchTestApp } from './support/electron'

test('topic query previews evidence and invalidates the summary after manual edits', async () => {
  const fixture = await launchTestApp()
  const { page } = fixture
  const errors: Error[] = []
  page.on('pageerror', (error) => errors.push(error))
  try {
    const welcome = page.getByRole('dialog', { name: '开始探索你的微信' })
    if (await welcome.isVisible()) await welcome.getByRole('button', { name: '关闭' }).click()
    await page
      .getByRole('navigation', { name: '一级导航' })
      .getByRole('button', { name: '问问 AI' })
      .click()
    await page.locator('.ask-ai-group-list button').first().click()
    await page.getByRole('button', { name: '话题', exact: true }).click()
    await expect(page.getByLabel('话题', { exact: true })).toHaveValue('craft')
    await page.getByRole('button', { name: '生成话题包' }).click()
    await expect(page.getByText('上线推迟到周六。', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '定位证据 E1' }).click()
    await expect(page.getByText('craft 项目原定周五上线，因支付问题改为周六。')).toBeVisible()
    await page.screenshot({ path: 'test-results/topic-preview.png', fullPage: true })
    await page.getByRole('checkbox', { name: '选择候选消息 E1' }).uncheck()
    await expect(
      page.getByText('候选消息已人工修改，原 AI 结论已失效。请重新生成话题包。')
    ).toBeVisible()
    await expect(page.getByText('上线推迟到周六。', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '保存订阅' })).toBeDisabled()
    expect(errors).toEqual([])
  } finally {
    await fixture.close()
  }
})
