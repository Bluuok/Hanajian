import { expect, test } from '@playwright/test'
import { launchTestApp } from './support/electron'

test('connected account warns when image key is missing and links to setup', async () => {
  const fixture = await launchTestApp({ initialPage: 'topics', imageKeyMissing: true })
  try {
    const { page } = fixture
    const notice = page.getByRole('status', { name: '图片解密提醒' })
    await expect(notice).toContainText('聊天图片尚未配置密钥')
    await expect(notice).toContainText('设置 → 图片解密')
    await notice.getByRole('button', { name: '去配置图片' }).click()
    await expect(page.getByRole('heading', { name: '图片解密', exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: '图片密钥配置步骤' })).toContainText(
      '保存图片密钥'
    )
    await expect(page.getByRole('button', { name: '开始自动获取' })).toBeVisible()
  } finally {
    await fixture.close()
  }
})

test('failed chat image links directly to the same setup page', async () => {
  const fixture = await launchTestApp({ imageKeyMissing: true })
  try {
    const { page } = fixture
    await page
      .getByRole('status', { name: '图片解密提醒' })
      .getByRole('button', { name: '稍后' })
      .click()
    await page.locator('.ask-ai-group-list button').first().click()
    const failure = page.locator('.image-bubble.image-error').first()
    await expect(failure).toContainText('未配置图片解密密钥')
    await failure.getByRole('button', { name: '打开图片解密设置' }).click()
    await expect(page.getByRole('heading', { name: '图片解密', exact: true })).toBeVisible()
  } finally {
    await fixture.close()
  }
})
