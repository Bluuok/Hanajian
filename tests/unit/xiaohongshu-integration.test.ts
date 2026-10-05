import { describe, it, expect, vi } from 'vitest'
import { extractPlatformShare } from '../../src/main/platform-integration/platform-share'
import {
  identifyXiaohongshuWork,
  extractXiaohongshuState,
  normalizeXiaohongshuDetail
} from '../../src/main/platform-integration/xiaohongshu-parser'
import { PlatformIntegrationService } from '../../src/main/platform-integration/platform-integration-service'
import { validatePlatformUrl } from '../../src/main/platform-integration/douyin-parser'
import { fetchPlatformResource } from '../../src/main/platform-integration/platform-http'

const id = '6411cf99000000001300b6d9'
const url = `https://www.xiaohongshu.com/explore/${id}?xsec_token=test-token&xsec_source=pc_share`
const image = 'https://sns-webpic-qc.xhscdn.com/a.webp?sign=original'
const note = {
  noteId: id,
  type: 'normal',
  title: '测试笔记',
  desc: '完整正文不可丢失',
  user: { nickname: '作者' },
  imageList: [{ urlDefault: image }, { urlDefault: 'https://sns-webpic-qc.xhscdn.com/b.webp' }]
}
const state = (value: unknown = note): Record<string, unknown> => ({
  note: { noteDetailMap: { [id]: { note: value } } }
})

describe('unified platform parsing', () => {
  it('recognizes both platforms without a platform selector', () => {
    expect(extractPlatformShare(`分享文案 https://xhslink.com/a/AbC 复制打开`)).toEqual({
      platform: 'xiaohongshu',
      url: 'https://xhslink.com/a/AbC'
    })
    expect(extractPlatformShare(`[作品](${url})`).platform).toBe('xiaohongshu')
    expect(extractPlatformShare('复制打开抖音 https://v.douyin.com/sgh2j_pBwbI/').platform).toBe(
      'douyin'
    )
    expect(() => extractPlatformShare(`https://v.douyin.com/a/ ${url}`)).toThrow('多个')
  })
  it('rejects arbitrary hosts, ports, userinfo, HTTP and lookalikes', () => {
    for (const invalid of [
      'http://www.xiaohongshu.com/explore/6411cf99000000001300b6d9',
      'https://xhslink.com.evil.test/a',
      'https://127.0.0.1/a',
      'https://user@xhslink.com/a',
      'https://xhslink.com:8080/a'
    ])
      expect(() => extractPlatformShare(invalid)).toThrow()
    expect(() =>
      validatePlatformUrl('https://sns-webpic-qc.xhscdn.com.evil.test/a', 'media')
    ).toThrow()
  })
  it('retains the shared-note access token', () => {
    expect(extractPlatformShare('分享 https://xhslink.cn/o/ALBk4gTBbgV').url).toBe(
      'https://xhslink.cn/o/ALBk4gTBbgV'
    )
    expect(() => extractPlatformShare('https://xhslink.cn.evil.test/o/a')).toThrow()
    expect(extractPlatformShare('小红书 http://xhslink.com/o/AbC').url).toBe(
      'https://xhslink.com/o/AbC'
    )
    expect(identifyXiaohongshuWork(url)).toEqual({ id, sourceUrl: url })
    expect(identifyXiaohongshuWork(`https://www.xiaohongshu.com/discovery/item/${id}`)?.id).toBe(id)
    expect(identifyXiaohongshuWork('https://xhslink.com/a/AbC')).toBeUndefined()
  })
  it('parses undefined only outside strings and never executes scripts', () => {
    const value = extractXiaohongshuState(
      '<script>window.__INITIAL_STATE__={"missing":undefined,"title":"undefined { } \\" text"};alert(1)</script>'
    ) as Record<string, unknown>
    expect(value.missing).toBeNull()
    expect(value.title).toContain('undefined { }')
    expect(
      extractXiaohongshuState('<script>window.__INITIAL_STATE__=(()=>alert(1))()</script>')
    ).toBeUndefined()
  })
  it('extracts all note images, retains signatures and leaves watermark unknown', () => {
    const work = normalizeXiaohongshuDetail(state(), id, url, 'http')!
    expect(work.platform).toBe('xiaohongshu')
    expect(work.title).toContain('完整正文不可丢失')
    expect(work.assets).toHaveLength(2)
    expect(work.assets[0].urls).toEqual([image])
    expect(work.assets[0].watermark).toBe('unknown')
    const upgraded = normalizeXiaohongshuDetail(
      state({ ...note, imageList: [{ urlDefault: image.replace('https:', 'http:') }] }),
      id,
      url,
      'http'
    )!
    expect(upgraded.assets[0].urls).toEqual([image])
    expect(
      normalizeXiaohongshuDetail(
        state({ ...note, noteId: 'ffffffffffffffffffffffff' }),
        id,
        url,
        'http'
      )
    ).toBeUndefined()
    expect(
      normalizeXiaohongshuDetail(
        { note: { noteDetailMap: { unrelated: { note } } } },
        id,
        url,
        'http'
      )
    ).toBeUndefined()
  })
  it.each([
    { label: 'missing URL', image: {} },
    { label: 'untrusted URL', image: { urlDefault: 'https://example.com/missing.webp' } },
    { label: 'malformed URL', image: { urlDefault: 'not-a-url' } },
    { label: 'invalid image entry', image: null }
  ])(
    'rejects an incomplete album with a $label instead of dropping that image',
    ({ image: missing }) => {
      const incomplete = state({ ...note, imageList: [{ urlDefault: image }, missing] })
      for (const resolvedBy of ['http', 'browser'] as const)
        expect(normalizeXiaohongshuDetail(incomplete, id, url, resolvedBy)).toBeUndefined()
    }
  )
  it('retains every image when an allowed variant is available', () => {
    const work = normalizeXiaohongshuDetail(
      state({
        ...note,
        imageList: [
          { urlDefault: 'https://example.com/rejected.webp', infoList: [{ url: image }] },
          { url_default: 'http://sns-webpic-qc.xhscdn.com/b.webp?sign=second' }
        ]
      }),
      id,
      url,
      'http'
    )!
    expect(work.assets.map((asset) => asset.id)).toEqual(['image-1', 'image-2'])
    expect(work.assets.map((asset) => asset.urls)).toEqual([
      [image],
      ['https://sns-webpic-qc.xhscdn.com/b.webp?sign=second']
    ])
  })
  it('uses existing H264 resources first, never mistakes video covers for gallery', () => {
    const video = {
      ...note,
      type: 'video',
      video: {
        media: {
          stream: {
            h264: [{ masterUrl: 'https://sns-video-bd.xhscdn.com/test.mp4' }],
            h265: [{ masterUrl: 'https://sns-video-qc.xhscdn.com/test.mp4' }]
          }
        }
      }
    }
    const work = normalizeXiaohongshuDetail(state(video), id, url, 'http')!
    expect(work.kind).toBe('video')
    expect(work.assets).toHaveLength(1)
    expect(work.assets[0].urls[0]).toContain('sns-video-bd')
    expect(
      normalizeXiaohongshuDetail(state({ ...video, video: {} }), id, url, 'http')
    ).toBeUndefined()
  })
  it('routes short links through direct HTTP and shares preview/cache machinery', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: url } }))
      .mockResolvedValueOnce(
        new Response(`<script>window.__INITIAL_STATE__=${JSON.stringify(state())}</script>`)
      )
    const browser = vi.fn()
    const service = new PlatformIntegrationService(fetcher, vi.fn(), browser)
    const result = await service.parseShare('小红书 https://xhslink.com/a/AbC')
    expect(result.success).toBe(true)
    expect(result.work?.platform).toBe('xiaohongshu')
    expect(result.work?.resolvedBy).toBe('http')
    expect(result.work?.assets).toHaveLength(2)
    expect(result.work?.assets[0].previewUrl).toMatch(/^tracedigest-platform:/)
    expect(browser).not.toHaveBeenCalled()
    expect(fetcher.mock.calls[1][0]).toBe(url)
    expect(fetcher.mock.calls[1][1].headers.Referer).toBe('https://www.xiaohongshu.com/')
  })
  it('falls back when HTTP omits an image and returns the complete browser album', async () => {
    const incomplete = state({
      ...note,
      imageList: [{ urlDefault: image }, { urlDefault: 'https://example.com/missing.webp' }]
    })
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(`<script>window.__INITIAL_STATE__=${JSON.stringify(incomplete)}</script>`)
      )
    const complete = normalizeXiaohongshuDetail(state(), id, url, 'browser')!
    const browser = vi.fn().mockResolvedValue(complete)
    const service = new PlatformIntegrationService(fetcher, vi.fn(), browser)
    const result = await service.parseShare(url)
    expect(browser).toHaveBeenCalledExactlyOnceWith(url, id)
    expect(result.success).toBe(true)
    expect(result.work?.resolvedBy).toBe('browser')
    expect(result.work?.assets.map((asset) => asset.id)).toEqual(['image-1', 'image-2'])
    expect(result.work?.assets.map((asset) => asset.urls)).toEqual(
      complete.assets.map((asset) => asset.urls)
    )
  })
  it('reports no media when an incomplete HTTP album cannot be recovered', async () => {
    const incomplete = state({ ...note, imageList: [{ urlDefault: image }, {}] })
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(`<script>window.__INITIAL_STATE__=${JSON.stringify(incomplete)}</script>`)
      )
    const browser = vi.fn().mockResolvedValue(undefined)
    const service = new PlatformIntegrationService(fetcher, vi.fn(), browser)
    const result = await service.parseShare(url)
    expect(browser).toHaveBeenCalledExactlyOnceWith(url, id)
    expect(result.success).toBe(false)
    expect(result.code).toBe('NO_MEDIA')
    expect(result.work).toBeUndefined()
    expect(result.resultId).toBeUndefined()
  })
  it('falls back to an isolated browser and reports verification errors honestly', async () => {
    const browser = vi.fn().mockRejectedValue(new Error('小红书页面要求安全验证'))
    const service = new PlatformIntegrationService(
      vi.fn().mockResolvedValue(new Response('<html>login</html>')),
      vi.fn(),
      browser
    )
    const result = await service.parseShare(url)
    expect(result.success).toBe(false)
    expect(result.error).toContain('安全验证')
    expect(browser).toHaveBeenCalledWith(url, id)
  })
  it('rejects unknown redirect destinations before requesting them', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(null, { status: 302, headers: { location: 'https://localhost/private' } })
      )
    await expect(
      fetchPlatformResource('https://xhslink.com/a/AbC', 'page', fetcher)
    ).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
