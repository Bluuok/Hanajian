import { it, expect, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm } from 'fs/promises'
import { resolve, sep } from 'path'
import { PlatformIntegrationService } from '../../src/main/platform-integration/platform-integration-service'
import { writePlatformMarkdown } from '../../src/main/platform-integration/platform-markdown'

it('uses the shared download and MD path for Xiaohongshu, recording partial successes only', async () => {
  const root = resolve('.tmp-test-artifacts/cross-save')
  await mkdir(root, { recursive: true })
  const directory = await mkdtemp(resolve(root, 'case-'))
  if (!resolve(directory).startsWith(root + sep)) throw new Error('Unsafe cleanup target')
  const id = '6411cf99000000001300b6d9'
  const url = `https://www.xiaohongshu.com/explore/${id}`
  const image = 'https://sns-webpic-qc.xhscdn.com/a.png?signature=unchanged'
  const state = {
    note: {
      noteDetailMap: {
        [id]: {
          note: {
            noteId: id,
            type: 'normal',
            title: '测试',
            imageList: [
              { urlDefault: image },
              { urlDefault: 'https://sns-webpic-qc.xhscdn.com/missing.png' }
            ]
          }
        }
      }
    }
  }
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
    'base64'
  )
  const fetcher = vi.fn(
    async (request: Parameters<typeof fetch>[0], options?: Parameters<typeof fetch>[1]) => {
      if (String(request) === url)
        return new Response(`<script>window.__INITIAL_STATE__=${JSON.stringify(state)}</script>`)
      if (String(request) !== image) return new Response(null, { status: 404 })
      expect((options?.headers as Record<string, string>).Referer).toBe(
        'https://www.xiaohongshu.com/'
      )
      return new Response(png, {
        headers: { 'content-type': 'image/png', 'content-length': String(png.length) }
      })
    }
  )
  try {
    const service = new PlatformIntegrationService(fetcher, vi.fn(), vi.fn())
    const parsed = await service.parseShare(url)
    const saved = await service.save(parsed.resultId!, directory)
    expect(saved.success).toBe(false)
    expect(saved.files).toHaveLength(1)
    expect(await readFile(saved.files[0])).toEqual(png)
    const recorded = service.getSavedWork(parsed.resultId!)
    expect(recorded.savedAssets).toEqual([{ assetId: 'image-1', path: saved.files[0] }])
    const note = await writePlatformMarkdown(recorded.work, recorded.savedAssets, directory)
    expect(note.success).toBe(true)
    expect(await readFile(note.file!, 'utf8')).toMatch(/\[\[.*\.png\|图01\]\]/)
    expect(await readFile(note.file!, 'utf8')).toContain('已链接 1/2 个资源')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
