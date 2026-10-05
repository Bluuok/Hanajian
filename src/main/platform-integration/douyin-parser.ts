import type {
  PlatformMediaAsset,
  PlatformWatermarkStatus,
  PlatformWork
} from '../../shared/platform-integration'

import { validatePlatformUrl } from './platform-url'
export { DOUYIN_PAGE_HOSTS, validatePlatformUrl } from './platform-url'

/** Full share text is accepted; ambiguous multiple work links are not silently selected. */
export function extractDouyinShareUrl(input: string): string {
  if (typeof input !== 'string' || !input.trim() || input.length > 16000)
    throw new Error('请粘贴抖音分享文案或链接（最多 16000 字符）')
  const candidates = input.match(/https?:\/\/[^\s<>"`[\]（）]+/g) || []
  const links = new Set<string>()
  for (const candidate of candidates) {
    const cleaned = candidate.replace(/[),，。；;！!?？]+$/, '')
    try {
      const url = validatePlatformUrl(cleaned, 'page')
      if (
        url.hostname === 'v.douyin.com' ||
        /\/(?:share\/(?:video|note|slides)|video|note)\/\d+/.test(url.pathname)
      )
        links.add(url.href)
    } catch {
      /* Ignore unrelated links in a pasted share paragraph. */
    }
  }
  if (!links.size) throw new Error('没有找到有效抖音作品链接，请粘贴完整分享文案')
  if (links.size > 1) throw new Error('文案中有多个抖音作品链接，请一次解析一个作品')
  return [...links][0]
}

export function identifyDouyinWork(
  urlString: string
): { id: string; kind?: 'images' | 'video'; sourceUrl: string } | undefined {
  const url = validatePlatformUrl(urlString, 'page')
  const match = url.pathname.match(/\/(?:share\/)?(video|note|slides)\/(\d{10,25})(?:\/|$)/)
  if (!match) return undefined
  return {
    id: match[2],
    kind: match[1] === 'video' ? 'video' : 'images',
    sourceUrl: `${url.origin}${url.pathname}`
  }
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function field(record: Record<string, unknown>, snake: string, camel?: string): unknown {
  return record[snake] ?? (camel ? record[camel] : undefined)
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : []
}

function mediaUrls(value: unknown): string[] {
  const entry = object(value)
  const raw =
    typeof value === 'string'
      ? [value]
      : Array.isArray(value)
        ? strings(value)
        : strings(field(entry, 'url_list', 'urlList'))
  return [...new Set(raw)].filter((url) => {
    try {
      validatePlatformUrl(url, 'media')
      return true
    } catch {
      return false
    }
  })
}

function watermarkFor(
  urls: string[],
  metadata: Record<string, unknown>,
  sourceField: string
): { watermark: PlatformWatermarkStatus; watermarkEvidence: string } {
  if (
    /watermark/.test(sourceField) ||
    urls.some((url) => /(?:tplv-dy-water|\/playwm\/|watermark(?:=|\/))/i.test(url))
  ) {
    return { watermark: 'present', watermarkEvidence: '资源字段或平台 URL 明确包含水印标识' }
  }
  const flag = field(metadata, 'has_watermark', 'hasWatermark')
  if (flag === true)
    return { watermark: 'present', watermarkEvidence: '平台元数据 has_watermark=true' }
  if (flag === false)
    return {
      watermark: 'absent',
      watermarkEvidence: '平台元数据 has_watermark=false；未进行画面修复或去水印'
    }
  return {
    watermark: 'unknown',
    watermarkEvidence: '平台未明确标注该资源的水印状态；无水印 URL 标识缺失不等于画面无水印'
  }
}

function chooseAsset(
  kind: 'image' | 'video',
  id: string,
  candidates: Array<{ value: unknown; field: string; metadata: Record<string, unknown> }>
): PlatformMediaAsset | undefined {
  const assets = candidates
    .map((candidate) => {
      const urls = mediaUrls(candidate.value)
      return {
        id,
        kind,
        urls,
        sourceField: candidate.field,
        ...watermarkFor(urls, candidate.metadata, candidate.field)
      }
    })
    .filter((asset) => asset.urls.length)
  const rank = { absent: 0, unknown: 1, present: 2 }
  return assets.sort((left, right) => rank[left.watermark] - rank[right.watermark])[0]
}

/** Match the requested ID before looking at media; recommendations, avatars and music covers are excluded. */
export function normalizeDouyinDetail(
  data: unknown,
  expectedId: string,
  sourceUrl: string,
  resolvedBy: 'http' | 'browser'
): PlatformWork | undefined {
  const queue: unknown[] = [data]
  const seen = new Set<object>()
  let cursor = 0
  while (cursor < queue.length && cursor < 50000) {
    const value = queue[cursor++]
    if (!value || typeof value !== 'object' || seen.has(value)) continue
    seen.add(value)
    const detail = object(value)
    const id = field(detail, 'aweme_id', 'awemeId') ?? detail.item_id
    if (String(id) === expectedId) {
      const post = object(field(detail, 'image_post_info', 'imagePostInfo'))
      const images =
        Array.isArray(detail.images) && detail.images.length
          ? detail.images
          : Array.isArray(post.images)
            ? post.images
            : []
      const assets: PlatformMediaAsset[] = []
      if (images.length) {
        for (const [index, rawImage] of images.entries()) {
          const image = object(rawImage)
          const display = object(field(image, 'display_image', 'displayImage'))
          const asset = chooseAsset('image', `image-${index + 1}`, [
            {
              value: field(image, 'url_list', 'urlList'),
              field: 'images.url_list',
              metadata: image
            },
            { value: display, field: 'images.display_image', metadata: display },
            {
              value: field(image, 'download_url_list', 'downloadUrlList'),
              field: 'images.download_url_list',
              metadata: image
            },
            {
              value: field(image, 'owner_watermark_image', 'ownerWatermarkImage'),
              field: 'images.owner_watermark_image',
              metadata: {}
            }
          ])
          if (!asset) return undefined // Do not pretend a partial album is the full work.
          assets.push(asset)
        }
      } else {
        const video = object(detail.video)
        const rates = field(video, 'bit_rate', 'bitRate')
        const asset = chooseAsset('video', 'video-1', [
          {
            value: field(video, 'play_addr', 'playAddr'),
            field: 'video.play_addr',
            metadata: video
          },
          {
            value: field(video, 'play_addr_h264', 'playAddrH264'),
            field: 'video.play_addr_h264',
            metadata: video
          },
          ...(Array.isArray(rates)
            ? rates.map((rate) => ({
                value: field(object(rate), 'play_addr', 'playAddr'),
                field: 'video.bit_rate.play_addr',
                metadata: object(rate)
              }))
            : []),
          {
            value: field(video, 'download_addr', 'downloadAddr'),
            field: 'video.download_addr',
            metadata: {}
          }
        ])
        if (asset) assets.push(asset)
      }
      if (assets.length)
        return {
          platform: 'douyin',
          id: expectedId,
          kind: images.length ? 'images' : 'video',
          title: String(detail.desc ?? detail.title ?? '抖音作品'),
          author: String(object(detail.author).nickname ?? '未知作者'),
          sourceUrl,
          assets,
          resolvedBy,
          warnings: assets.some((asset) => asset.watermark === 'unknown')
            ? ['部分资源水印状态未知，不标记为无水印。']
            : []
        }
    }
    queue.push(...Object.values(value).filter((entry) => entry && typeof entry === 'object'))
  }
  return undefined
}

/** Extract balanced JSON only. Never evaluate scripts obtained over the network. */
export function extractEmbeddedDouyinData(html: string): unknown[] {
  const results: unknown[] = []
  const markers = /(?:window\.)?(?:_ROUTER_DATA|_SSR_DATA|__INITIAL_STATE__|__NEXT_DATA__)\s*=\s*/g
  for (const marker of html.matchAll(markers)) {
    const start = marker.index! + marker[0].length
    if (html[start] !== '{') continue
    let depth = 0,
      quoted = false,
      escaped = false
    for (let index = start; index < html.length; index++) {
      const char = html[index]
      if (quoted) {
        if (escaped) escaped = false
        else if (char === '\\') escaped = true
        else if (char === '"') quoted = false
      } else if (char === '"') quoted = true
      else if (char === '{') depth++
      else if (char === '}' && --depth === 0) {
        try {
          results.push(JSON.parse(html.slice(start, index + 1)))
        } catch {
          /* Unsupported data is not executed. */
        }
        break
      }
    }
  }
  for (const script of html.matchAll(
    /<script\b[^>]*\bid=["'](?:RENDER_DATA|__NEXT_DATA__)["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      results.push(JSON.parse(decodeURIComponent(script[1])))
    } catch {
      /* Try other supported stores. */
    }
  }
  return results
}
