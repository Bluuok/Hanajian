import { expect, test } from '@playwright/test'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { launchTestApp } from './support/electron'

const screenshotRoot =
  process.env.HANAJIAN_SCREENSHOT_DIR || join(process.cwd(), 'test-results', 'upgrade-screenshots')

test('content collection opens without connecting a WeChat database', async () => {
  const fixture = await launchTestApp({ mode: 'disconnected' })
  const errors: string[] = []
  fixture.page.on('pageerror', (error) => errors.push(error.message))
  try {
    await fixture.setWindowContentSize({ width: 820, height: 600 })
    await fixture.page.getByRole('button', { name: '先打开内容收藏' }).click()
    await expect(fixture.page.getByRole('heading', { name: '内容收藏' })).toBeVisible()
    await expect(fixture.page.getByRole('textbox', { name: '分享文案或链接' })).toBeVisible()
    expect(
      await fixture.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    ).toBe(true)
    await fixture.page.getByRole('button', { name: '返回花笺' }).click()
    await expect(fixture.page.getByRole('button', { name: '先打开内容收藏' })).toBeVisible()
    expect(errors).toEqual([])
  } finally {
    await fixture.close()
  }
})

test('collection previews synthetic media and writes a note only after saving', async () => {
  const fixture = await launchTestApp({ initialPage: 'topics' })
  try {
    await fixture.setWindowContentSize({ width: 1280, height: 800 })
    await fixture.page
      .getByRole('navigation', { name: '一级导航' })
      .getByRole('button', { name: '内容收藏', exact: true })
      .click()
    await fixture.page
      .getByRole('textbox', { name: '分享文案或链接' })
      .fill('https://www.xiaohongshu.com/explore/6411cf99000000001300b6d9')
    await fixture.page.getByRole('button', { name: '解析与预览' }).click()
    await expect(fixture.page.getByRole('heading', { name: '合成收藏：本地笔记' })).toBeVisible()
    await expect(fixture.page.getByRole('button', { name: '写入 MD' })).toBeDisabled()
    expect(existsSync(join(fixture.userData, 'saved-media', '合成图片.png'))).toBe(false)
    await fixture.page.screenshot({ path: join(screenshotRoot, 'content-collection.png') })
    await fixture.page.getByRole('button', { name: '保存全部图片' }).click()
    await expect(fixture.page.getByText('已保存 1 个文件')).toBeVisible()
    await fixture.page.getByRole('button', { name: '写入 MD' }).click()
    await expect(
      fixture.page.getByText(join(fixture.userData, 'knowledge-notes', '合成收藏.md'), {
        exact: true
      })
    ).toBeVisible()
    expect(
      readFileSync(join(fixture.userData, 'knowledge-notes', '合成收藏.md'), 'utf8')
    ).toContain('[图片](../saved-media/合成图片.png)')
    await fixture.page
      .getByRole('navigation', { name: '一级导航' })
      .getByRole('button', { name: '助手设置', exact: true })
      .click()
    await expect(fixture.page.getByRole('heading', { name: 'AI 助手设置' })).toBeVisible()
    await expect(
      fixture.page.getByRole('button', { name: /扫码|发送微信|连接机器人/ })
    ).toHaveCount(0)
    await fixture.page.screenshot({ path: join(screenshotRoot, 'assistant-settings.png') })
  } finally {
    await fixture.close()
  }
})

test('knowledge drafts support custom style and need explicit confirmation before writing', async () => {
  const fixture = await launchTestApp()
  try {
    await fixture.setWindowContentSize({ width: 1440, height: 960 })
    await fixture.page.getByRole('checkbox', { name: /提取专业记忆/ }).check()
    await fixture.page.getByRole('combobox', { name: '笔记格式' }).selectOption('action-memory-v1')
    await fixture.page.getByRole('textbox', { name: '记忆表达风格' }).fill('简短条目，保留操作步骤')
    await fixture.app.evaluate(
      ({ ipcMain }, directory) => {
        ipcMain.removeHandler('export:selectDirectory')
        ipcMain.handle('export:selectDirectory', () => ({ canceled: false, path: directory }))
      },
      join(fixture.userData, 'knowledge-notes')
    )
    await fixture.page.getByRole('button', { name: '选择保存路径' }).click()
    await fixture.page.getByRole('textbox', { name: '向 AI 提问' }).fill('总结最近100条消息')
    await fixture.page.getByRole('button', { name: '发送', exact: true }).click()
    await expect(fixture.page.getByRole('region', { name: '记忆草稿预览' })).toBeVisible()
    await expect(fixture.page.locator('.ask-ai-memory-config')).not.toHaveAttribute('open', '')
    await fixture.setWindowContentSize({ width: 820, height: 600 })
    const composer = await fixture.page
      .getByRole('button', { name: '发送', exact: true })
      .boundingBox()
    expect(composer).not.toBeNull()
    expect(composer!.y + composer!.height).toBeLessThanOrEqual(600)
    expect(
      await fixture.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    ).toBe(true)
    await fixture.setWindowContentSize({ width: 1440, height: 960 })
    expect(existsSync(join(fixture.userData, 'knowledge-notes', '合成知识笔记.md'))).toBe(false)
    await fixture.page.screenshot({ path: join(screenshotRoot, 'knowledge-draft.png') })
    await fixture.page.getByRole('button', { name: '写入记忆库' }).click()
    await expect(fixture.page.getByText(/已写入：/)).toBeVisible()
    expect(
      readFileSync(join(fixture.userData, 'knowledge-notes', '合成知识笔记.md'), 'utf8')
    ).toContain('来源：测试成员')
  } finally {
    await fixture.close()
  }
})
