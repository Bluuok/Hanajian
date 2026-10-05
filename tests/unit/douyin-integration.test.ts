import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, readdir, rm } from 'fs/promises'
import { resolve, sep } from 'path'
import {
  extractDouyinShareUrl,
  extractEmbeddedDouyinData,
  identifyDouyinWork,
  normalizeDouyinDetail,
  validatePlatformUrl
} from '../../src/main/platform-integration/douyin-parser'
import { fetchPlatformResource } from '../../src/main/platform-integration/platform-http'
import {
  PlatformIntegrationService,
  savePlatformWork,
  sniffPlatformMedia
} from '../../src/main/platform-integration/platform-integration-service'
import {
  PLATFORM_AGENT_READ_TOOLS,
  executePlatformAgentReadTool
} from '../../src/main/platform-integration/platform-agent-tools'

const id = '7686472347373484971'
const url = `https://www.iesdouyin.com/share/note/${id}/`
const imageUrl = 'https://p3-pc-sign.douyinpic.com/test.webp?signature=original'
const share =
  '9.79 复制打开抖音，看看【浮寻的图文作品】想在明年出去玩一趟 https://v.douyin.com/sgh2j_pBwbI/ M@J.VY :7pm rEu:/ 10/16'
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64'
)
const detail = (): {
  aweme_id: string
  desc: string
  author: { nickname: string }
  images: Array<{ url_list: string[]; download_url_list: string[] }>
  video: { play_addr: { url_list: string[] }; has_watermark: boolean }
} => ({
  aweme_id: id,
  desc: '测试作品',
  author: { nickname: '浮寻' },
  images: [
    {
      url_list: [imageUrl],
      download_url_list: ['https://p3-pc-sign.douyinpic.com/test~tplv-dy-water-v2.jpeg']
    }
  ],
  video: { play_addr: { url_list: ['https://v3.douyinvod.com/audio.mp4'] }, has_watermark: false }
})
const work = (): NonNullable<ReturnType<typeof normalizeDouyinDetail>> =>
  normalizeDouyinDetail(detail(), id, url, 'http')!
const tmpRoot = resolve('.tmp-test-artifacts')
const generatedDirectories: string[] = []
async function temporaryDirectory(): Promise<string> {
  await mkdir(tmpRoot, { recursive: true })
  const dir = await mkdtemp(resolve(tmpRoot, 'douyin-unit-'))
  generatedDirectories.push(dir)
  return dir
}
afterEach(async () => {
  vi.useRealTimers()
  for (const dir of generatedDirectories.splice(0)) {
    if (!resolve(dir).startsWith(tmpRoot + sep)) throw new Error('Unsafe test cleanup target')
    await rm(dir, { recursive: true, force: true })
  }
})

describe('Douyin share parsing', () => {
  it('extracts the URL from full share text, Markdown, and punctuation', () => {
    expect(extractDouyinShareUrl(share)).toBe('https://v.douyin.com/sgh2j_pBwbI/')
    expect(extractDouyinShareUrl('[链接](https://v.douyin.com/sgh2j_pBwbI/)')).toBe(
      'https://v.douyin.com/sgh2j_pBwbI/'
    )
    expect(extractDouyinShareUrl('看：https://v.douyin.com/sgh2j_pBwbI/。')).toBe(
      'https://v.douyin.com/sgh2j_pBwbI/'
    )
  })
  it('rejects unsupported input and ambiguous links', () => {
    expect(() => extractDouyinShareUrl('没有链接')).toThrow('没有找到')
    expect(() => extractDouyinShareUrl('https://v.douyin.com/a/ https://v.douyin.com/b/')).toThrow(
      '多个'
    )
    expect(() => extractDouyinShareUrl('https://v.douyin.com.evil.test/a')).toThrow()
    expect(() => extractDouyinShareUrl('x'.repeat(16001))).toThrow('最多')
  })
  it('identifies image/video routes without leaking tracking parameters', () => {
    expect(identifyDouyinWork(url + '?did=secret')).toEqual({ id, kind: 'images', sourceUrl: url })
    expect(identifyDouyinWork(`https://www.douyin.com/video/${id}`)?.kind).toBe('video')
  })
  it('restricts HTTPS, hosts, userinfo, ports, and redirect destinations', async () => {
    for (const unsafe of [
      'http://p3.douyinpic.com/a',
      'https://127.0.0.1/a',
      'https://localhost/a',
      'https://v.douyin.com.evil.test/a',
      'https://user:pass@v.douyin.com/a',
      'https://v.douyin.com:8443/a'
    ])
      expect(() => validatePlatformUrl(unsafe, 'media')).toThrow()
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/private' } })
      )
    await expect(
      fetchPlatformResource('https://v.douyin.com/abc/', 'page', fetcher)
    ).rejects.toThrow('域名')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('extracts balanced/encoded JSON without evaluating scripts', () => {
    const data = { nested: detail(), text: 'brace } and escaped " quote' }
    const html = `<script>window._ROUTER_DATA = ${JSON.stringify(data)};throw new Error('should never run')</script>`
    expect(extractEmbeddedDouyinData(html)).toEqual([data])
    expect(
      extractEmbeddedDouyinData(
        `<script id="RENDER_DATA">${encodeURIComponent(JSON.stringify(data))}</script>`
      )
    ).toEqual([data])
    expect(extractEmbeddedDouyinData('<script>window._ROUTER_DATA = {broken}</script>')).toEqual([])
  })
  it('uses the requested work only, not recommendations or audio in an image work', () => {
    const parsed = normalizeDouyinDetail({ recommendations: [detail()] }, id, url, 'http')!
    expect(parsed.kind).toBe('images')
    expect(parsed.assets).toHaveLength(1)
    expect(parsed.assets[0].kind).toBe('image')
    expect(normalizeDouyinDetail(detail(), '9999999999999', url, 'http')).toBeUndefined()
  })
  it('prefers existing display resources without rewriting signed URLs or claiming no watermark', () => {
    const asset = work().assets[0]
    expect(asset.urls).toEqual([imageUrl])
    expect(asset.sourceField).toBe('images.url_list')
    expect(asset.watermark).toBe('unknown') // The accompanying audio/video flag does not apply to images.
    const marked = detail()
    marked.images[0].url_list = []
    expect(normalizeDouyinDetail(marked, id, url, 'http')!.assets[0].watermark).toBe('present')
  })
  it('labels absent only with explicit metadata and supports video resources', () => {
    const data = {
      aweme_id: id,
      video: {
        has_watermark: false,
        play_addr: { url_list: ['https://v3.douyinvod.com/video.mp4'] }
      }
    }
    const parsed = normalizeDouyinDetail(data, id, url, 'http')!
    expect(parsed.kind).toBe('video')
    expect(parsed.assets[0].watermark).toBe('absent')
    const unknown = {
      aweme_id: id,
      video: { play_addr: { url_list: ['https://v3.douyinvod.com/video.mp4'] } }
    }
    expect(normalizeDouyinDetail(unknown, id, url, 'http')!.assets[0].watermark).toBe('unknown')
  })
})

describe('Platform resolver and media delivery', () => {
  it('uses HTTP embedded details without starting a browser', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(`<script>window._ROUTER_DATA = ${JSON.stringify(detail())}</script>`)
      )
    const browser = vi.fn()
    const service = new PlatformIntegrationService(fetcher, browser)
    const result = await service.parseShare(url)
    expect(result.success).toBe(true)
    expect(browser).not.toHaveBeenCalled()
    expect(result.work?.assets[0].previewUrl).toContain('tracedigest-platform://media/')
  })
  it('falls back to browser details, never generic DOM images', async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(
        async () => new Response('<img src="https://p3.douyinpic.com/avatar.jpg">')
      )
    const browser = vi.fn().mockResolvedValue({ ...work(), resolvedBy: 'browser' })
    const result = await new PlatformIntegrationService(fetcher, browser).parseShare(url)
    expect(result.success).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(browser).toHaveBeenCalledWith(id, url)
    const unavailable = await new PlatformIntegrationService(
      fetcher,
      vi.fn().mockResolvedValue(undefined)
    ).parseShare(url)
    expect(unavailable.success).toBe(false)
    expect(unavailable.identifiedWork?.id).toBe(id)
    expect(unavailable.code).toBe('NO_MEDIA')
  })
  it('forwards valid video Range requests and rejects arbitrary result/asset identifiers', async () => {
    const video = {
      aweme_id: id,
      video: { play_addr: { url_list: ['https://v3.douyinvod.com/video.mp4'] } }
    }
    const fetcher = vi.fn().mockImplementation(async (input: string) =>
      input.includes('video.mp4')
        ? new Response(Buffer.from('ftyp'), {
            status: 206,
            headers: { 'content-type': 'video/mp4', 'content-range': 'bytes 0-3/100' }
          })
        : new Response(`<script>window._ROUTER_DATA = ${JSON.stringify(video)}</script>`)
    )
    const service = new PlatformIntegrationService(fetcher, vi.fn())
    const result = await service.parseShare(url)
    const response = await service.mediaResponse(
      new Request(result.work!.assets[0].previewUrl!, { headers: { Range: 'bytes=0-' } })
    )
    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe('bytes 0-3/100')
    expect(fetcher.mock.calls.at(-1)?.[1].headers.Range).toBe('bytes=0-')
    expect(
      (await service.mediaResponse(new Request('tracedigest-platform://media/invalid/video-1')))
        .status
    ).toBe(502)
    expect(
      (
        await service.mediaResponse(
          new Request(`tracedigest-platform://media/${result.resultId}/unregistered`)
        )
      ).status
    ).toBe(404)
    await response.body?.cancel()
  })
  it('expires results instead of saving stale links', async () => {
    const service = new PlatformIntegrationService(
      vi
        .fn()
        .mockResolvedValue(
          new Response(`<script>window._ROUTER_DATA=${JSON.stringify(detail())}</script>`)
        ),
      vi.fn()
    )
    const result = await service.parseShare(url)
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31 * 60 * 1000)
    expect(() => service.getWork(result.resultId!)).toThrow('过期')
  })
  it('exposes a parsing-only Agent tool, with no saving/sending/deletion tool', async () => {
    expect(PLATFORM_AGENT_READ_TOOLS.map((tool) => tool.function.name)).toEqual([
      'parse_platform_share'
    ])
    const output = await executePlatformAgentReadTool({
      id: 'tool1',
      type: 'function',
      function: {
        name: 'parse_douyin_share',
        arguments: '{"share_text":"no link","directory":"D:/x"}'
      }
    })
    expect(output.success).toBe(false)
  })
})

describe('Platform media saving', () => {
  it('saves single/all images with actual format extensions without overwriting files', async () => {
    const directory = await temporaryDirectory()
    const fetcher = vi.fn().mockImplementation(
      async () =>
        new Response(png, {
          headers: { 'content-type': 'image/png', 'content-length': String(png.length) }
        })
    )
    const one = await savePlatformWork(work(), directory, 'image-1', fetcher)
    const all = await savePlatformWork(work(), directory, undefined, fetcher)
    expect(one.success).toBe(true)
    expect(all.success).toBe(true)
    expect(one.files[0]).toMatch(/\.png$/)
    expect(all.files[0]).toBe(one.files[0])
    expect(all.reusedFiles).toEqual(one.files)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(await readFile(one.files[0])).toEqual(png)
    expect((await readdir(directory)).filter((name) => !name.startsWith('.'))).toHaveLength(1)
  })
  it('rejects HTML masquerading as media and cleans up incomplete downloads', async () => {
    const directory = await temporaryDirectory()
    const html = await savePlatformWork(
      work(),
      directory,
      undefined,
      vi
        .fn()
        .mockResolvedValue(
          new Response('<html>verify</html>', { headers: { 'content-type': 'image/png' } })
        )
    )
    expect(html.success).toBe(false)
    expect((await readdir(directory)).filter((name) => !name.startsWith('.'))).toHaveLength(0)
    const truncated = await savePlatformWork(
      work(),
      directory,
      undefined,
      vi.fn().mockImplementation(
        async () =>
          new Response(png, {
            headers: { 'content-type': 'image/png', 'content-length': String(png.length + 5) }
          })
      )
    )
    expect(truncated.success).toBe(false)
    expect(truncated.errors?.[0]).toContain('长度不完整')
    expect((await readdir(directory)).filter((name) => !name.startsWith('.'))).toHaveLength(0)
  })
  it('reports partial saves and retains successful files', async () => {
    const directory = await temporaryDirectory()
    const album = {
      ...work(),
      assets: [
        ...work().assets,
        { ...work().assets[0], id: 'image-2', urls: ['https://p3.douyinpic.com/missing.png'] }
      ]
    }
    const fetcher = vi
      .fn()
      .mockImplementation(async (input: string) =>
        input.includes('missing')
          ? new Response('error', { status: 404 })
          : new Response(png, { headers: { 'content-type': 'image/png' } })
      )
    const result = await savePlatformWork(album, directory, undefined, fetcher)
    expect(result.success).toBe(false)
    expect(result.files).toHaveLength(1)
    expect(result.errors).toHaveLength(1)
    expect((await readdir(directory)).filter((name) => !name.startsWith('.'))).toHaveLength(1)
  })
  it('sniffs video file types and rejects unrelated bytes', () => {
    const mp4 = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypisom'), Buffer.alloc(20)])
    expect(sniffPlatformMedia(mp4, 'video')).toBe('mp4')
    expect(() => sniffPlatformMedia(Buffer.from('<html>'), 'video')).toThrow('文件头')
  })
})
