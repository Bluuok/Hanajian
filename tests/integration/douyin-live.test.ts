import { describe, expect, it } from 'vitest'
import { readFile, mkdir } from 'fs/promises'
import { resolve } from 'path'
import { createHash } from 'crypto'
import { chromium } from 'playwright-core'
import {
  PlatformIntegrationService,
  sniffPlatformMedia
} from '../../src/main/platform-integration/platform-integration-service'

describe('Douyin real share download (explicit opt-in)', () => {
  it.runIf(process.env.TRACEDIGEST_DOUYIN_LIVE === '1')(
    'resolves the supplied photo work and saves/decode-checks single and all downloads',
    async () => {
      const share =
        '9.79 复制打开抖音，看看【浮寻的图文作品】想在明年出去玩一趟，F1上海大奖赛和新疆 2选1，... https://v.douyin.com/sgh2j_pBwbI/ M@J.VY :7pm rEu:/ 10/16'
      const service = new PlatformIntegrationService()
      const result = await service.parseShare(share)
      expect(result.error).toBeUndefined()
      expect(result.success).toBe(true)
      expect(result.work?.id).toBe('7686472347373484971')
      expect(result.work?.kind).toBe('images')
      expect(result.work?.author).toBe('浮寻')
      const directory = resolve('.tmp-test-artifacts', 'douyin-live', String(Date.now()))
      await mkdir(directory, { recursive: true })
      const one = await service.save(result.resultId!, directory, result.work!.assets[0].id)
      const all = await service.save(result.resultId!, directory)
      expect(one.error).toBeUndefined()
      expect(all.error).toBeUndefined()
      expect(one.files).toHaveLength(1)
      expect(all.files).toHaveLength(result.work!.assets.length)
      expect(all.files[0]).toBe(one.files[0])
      expect(all.reusedFiles).toEqual(one.files)
      const browser = await chromium.launch({ channel: 'msedge', headless: true })
      try {
        const page = await browser.newPage()
        for (const file of [...one.files, ...all.files]) {
          const bytes = await readFile(file)
          const format = sniffPlatformMedia(bytes, 'image')
          await page.setContent(
            `<img id="download" src="data:image/${format};base64,${bytes.toString('base64')}">`
          )
          const decoded = await page.locator('#download').evaluate(async (element) => {
            const image = element as HTMLImageElement
            await image.decode()
            return { width: image.naturalWidth, height: image.naturalHeight }
          })
          expect(decoded.width).toBeGreaterThan(0)
          expect(decoded.height).toBeGreaterThan(0)
          console.log(
            '[douyin-live]',
            JSON.stringify({
              id: result.work!.id,
              author: result.work!.author,
              resolvedBy: result.work!.resolvedBy,
              file,
              bytes: bytes.length,
              format,
              ...decoded,
              sha256: createHash('sha256').update(bytes).digest('hex'),
              watermark: result.work!.assets[0].watermark
            })
          )
        }
      } finally {
        await browser.close()
      }
    },
    180000
  )
})
