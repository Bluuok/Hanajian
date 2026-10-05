import { _electron, expect, test } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'

test('production content policy allows platform image decoding and video playback', async () => {
  const root = resolve('.')
  const artifactRoot = resolve('.tmp-test-artifacts/feature-review')
  mkdirSync(artifactRoot, { recursive: true })
  const profile = mkdtempSync(join(artifactRoot, 'preview-protocol-'))
  writeFileSync(
    join(profile, 'settings.json'),
    JSON.stringify({ autoLogin: false, autoLoginPreferenceSet: true, apiEnabled: false })
  )
  const env = {
    ...process.env,
    WXE_USER_DATA: profile,
    WE_SETTINGS_DIR: profile,
    TRACEDIGEST_DISABLE_GPU: '1'
  }
  delete env.ELECTRON_RENDERER_URL
  const app = await _electron.launch({ args: [root], env })
  try {
    expect(await app.evaluate(({ app }) => app.getPath('userData'))).toBe(profile)
    const page = await app.firstWindow()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.waitForLoadState('domcontentloaded')
    const videoBytes = await page.evaluate(async () => {
      const canvas = document.createElement('canvas')
      canvas.width = 160
      canvas.height = 120
      const context = canvas.getContext('2d')!
      context.fillStyle = '#edf7f2'
      context.fillRect(0, 0, 160, 120)
      const stream = canvas.captureStream(10)
      const chunks: BlobPart[] = []
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' })
      recorder.ondataavailable = (event) => chunks.push(event.data)
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve()
        recorder.start()
        let frame = 0
        const animation = setInterval(() => {
          context.fillStyle = frame++ % 2 ? '#edf7f2' : '#e8f3f8'
          context.fillRect(0, 0, 160, 120)
        }, 100)
        setTimeout(() => {
          clearInterval(animation)
          recorder.stop()
        }, 1200)
      })
      stream.getTracks().forEach((track) => track.stop())
      return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()))
    })
    const imageBytes = Array.from(readFileSync(join(root, 'resources/icon.png')))
    const fixtureStatus = await app.evaluate(
      async ({ ipcMain, BrowserWindow }, media) => {
        const session = BrowserWindow.getAllWindows()[0].webContents.session
        const protocol = session.protocol
        // Keep the production file page, preload, privileged scheme and CSP. Only substitute
        // platform network data with deterministic bytes; no account, provider or network is used.
        protocol.unhandle('tracedigest-platform')
        protocol.handle('tracedigest-platform', (request) => {
          const isVideo = request.url.endsWith('/video-1')
          return new Response(Uint8Array.from(isVideo ? media.video : media.image), {
            headers: { 'Content-Type': isVideo ? 'video/webm' : 'image/png' }
          })
        })
        ipcMain.removeHandler('platform-integration:parse')
        ipcMain.handle('platform-integration:parse', (_event, share: string) => {
          const isVideo = share.includes('/video/')
          return {
            success: true,
            resultId: 'protocol-fixture',
            work: {
              platform: 'douyin',
              id: '12345678',
              kind: isVideo ? 'video' : 'images',
              title: '合成媒体协议测试',
              author: '测试作者',
              sourceUrl: share,
              resolvedBy: 'http',
              warnings: ['合成测试媒体，未访问真实平台'],
              assets: [
                {
                  id: isVideo ? 'video-1' : 'image-1',
                  kind: isVideo ? 'video' : 'image',
                  urls: [],
                  sourceField: 'fixture',
                  watermark: 'unknown',
                  watermarkEvidence: '合成媒体',
                  previewUrl: `tracedigest-platform://media/protocol-fixture/${isVideo ? 'video-1' : 'image-1'}`
                }
              ]
            }
          }
        })
        const response = await session.fetch(
          'tracedigest-platform://media/protocol-fixture/image-1'
        )
        await response.body?.cancel()
        return response.status
      },
      { image: imageBytes, video: videoBytes }
    )
    expect(fixtureStatus).toBe(200)
    // A document loaded before the handler replacement retains its protocol loader.
    // Navigate again so this file page uses the deterministic test handler.
    await page.reload()
    await page.getByRole('button', { name: '先打开内容收藏' }).click()

    for (const kind of ['note', 'video']) {
      await page
        .getByRole('textbox', { name: '分享文案或链接' })
        .fill(`https://www.douyin.com/${kind}/12345678`)
      await page.getByRole('button', { name: '解析与预览' }).click()
      await expect(page.getByRole('heading', { name: '合成媒体协议测试' })).toBeVisible()
      await page.locator('.platform-integration-result').scrollIntoViewIfNeeded()
      if (kind === 'note') {
        const preview = page.getByRole('img', { name: '作品第 1 张图片' })
        await expect(preview).toBeVisible()
        await expect
          .poll(() => preview.evaluate((image: HTMLImageElement) => image.naturalWidth))
          .toBeGreaterThan(0)
      } else {
        const preview = page.getByLabel('作品视频预览')
        await expect(preview).toBeVisible()
        await expect
          .poll(() => preview.evaluate((video: HTMLVideoElement) => video.readyState))
          .toBeGreaterThanOrEqual(2)
        const playback = await preview.evaluate(async (video: HTMLVideoElement) => {
          video.loop = true
          await video.play()
          await new Promise((resolve) => setTimeout(resolve, 100))
          const result = {
            paused: video.paused,
            advanced: video.currentTime > 0,
            width: video.videoWidth,
            height: video.videoHeight
          }
          video.pause()
          return result
        })
        expect(playback).toEqual({ paused: false, advanced: true, width: 160, height: 120 })
        if (process.env.HANAJIAN_SCREENSHOT_DIR) {
          await page.screenshot({
            path: join(process.env.HANAJIAN_SCREENSHOT_DIR, 'production-protocol-video.png'),
            scale: 'css',
            animations: 'disabled'
          })
          writeFileSync(
            join(process.env.HANAJIAN_SCREENSHOT_DIR, 'production-protocol-video.json'),
            JSON.stringify(
              { data: 'Synthetic media; production main, preload, file page and CSP', playback },
              null,
              2
            )
          )
        }
      }
      await expect(page.getByText(/预览失败/)).toHaveCount(0)
    }
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
