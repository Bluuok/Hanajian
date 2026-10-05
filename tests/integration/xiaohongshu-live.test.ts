import { describe, it, expect } from 'vitest'
import { mkdir, readFile, stat } from 'fs/promises'
import { resolve } from 'path'
import {
  PlatformIntegrationService,
  sniffPlatformMedia
} from '../../src/main/platform-integration/platform-integration-service'
import { writePlatformMarkdown } from '../../src/main/platform-integration/platform-markdown'
import { chromium } from 'playwright-core'

describe('Xiaohongshu supplied public share (explicit opt-in)', () => {
  it.runIf(process.env.TRACEDIGEST_XHS_LIVE === '1')(
    'resolves exact work, actually saves media and creates working Obsidian links',
    async () => {
      const service = new PlatformIntegrationService()
      const parsed = await service.parseShare(
        '分享文案 https://xhslink.cn/o/ALBk4gTBbgV 先复制这段文字，再进【小红书】查看完整笔记。'
      )
      expect(
        parsed.error,
        JSON.stringify({
          code: parsed.code,
          identifiedId: parsed.identifiedWork?.id,
          error: parsed.error
        })
      ).toBeUndefined()
      expect(parsed.success).toBe(true)
      expect(parsed.work?.platform).toBe('xiaohongshu')
      expect(parsed.work?.id).toBe('6aac91e3000000002902c0c0')
      const directory = resolve('.tmp-test-artifacts/xiaohongshu-live', String(Date.now()))
      await mkdir(directory, { recursive: true })
      const saved = await service.save(parsed.resultId!, directory)
      expect(saved.error, JSON.stringify(saved.errors)).toBeUndefined()
      expect(saved.files).toHaveLength(parsed.work!.assets.length)
      const browser = await chromium.launch({ channel: 'msedge', headless: true })
      try {
        const page = await browser.newPage()
        for (const file of saved.files) {
          const bytes = await readFile(file)
          expect((await stat(file)).size).toBeGreaterThan(1000)
          const format = sniffPlatformMedia(bytes, parsed.work!.assets[0].kind)
          if (parsed.work!.kind === 'images') {
            await page.setContent(
              `<img src="data:image/${format};base64,${bytes.toString('base64')}">`
            )
            const size = await page.locator('img').evaluate(async (element) => {
              await element.decode()
              return { width: element.naturalWidth, height: element.naturalHeight }
            })
            expect(size.width).toBeGreaterThan(0)
            expect(size.height).toBeGreaterThan(0)
          }
        }
      } finally {
        await browser.close()
      }
      const recorded = service.getSavedWork(parsed.resultId!)
      const md = await writePlatformMarkdown(recorded.work, recorded.savedAssets, directory)
      expect(md.success).toBe(true)
      const text = await readFile(md.file!, 'utf8')
      for (const file of saved.files) expect(text).toContain(file.split(/[\\/]/).pop())
      expect(text).toContain('[[')
      console.log(
        '[xiaohongshu-live]',
        JSON.stringify({
          id: parsed.work!.id,
          kind: parsed.work!.kind,
          assets: parsed.work!.assets.length,
          resolvedBy: parsed.work!.resolvedBy,
          directory,
          md: md.file
        })
      )
    },
    180000
  )
})
