import type { PlatformMediaAsset, PlatformWork } from '../../shared/platform-integration'
import { validatePlatformUrl, XHS_PAGE_HOSTS } from './platform-url'

const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
export function identifyXiaohongshuWork(
  input: string
): { id: string; sourceUrl: string } | undefined {
  const url = validatePlatformUrl(input, 'page')
  if (!XHS_PAGE_HOSTS.has(url.hostname)) return undefined
  const id = url.pathname.match(/\/(?:explore|discovery\/item)\/([a-f0-9]{24})(?:\/|$)/i)?.[1]
  if (!id) return undefined
  // xsec_token is required for many shared notes. Preserve it for requests, never strip/sign/reconstruct it.
  url.hash = ''
  return { id: id.toLowerCase(), sourceUrl: url.href }
}

/** Parse JSON-like initial state without eval, executing scripts or rewriting quoted text. */
export function extractXiaohongshuState(html: string): unknown {
  const script = html.match(
    /<script\b[^>]*>\s*window\.__INITIAL_STATE__\s*=\s*([\s\S]*?)<\/script>/i
  )?.[1]
  if (!script || script.length > 8 * 1024 * 1024) return undefined
  let depth = 0,
    quoted = false,
    escaped = false,
    cleaned = ''
  for (let i = 0; i < script.length; i++) {
    const ch = script[i]
    if (quoted) {
      cleaned += ch
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') quoted = false
      continue
    }
    if (ch === '"') quoted = true
    if (ch === '{' || ch === '[') depth++
    if (ch === '}' || ch === ']') depth--
    if (
      script.slice(i, i + 9) === 'undefined' &&
      /[:[,\s]/.test(script[i - 1] || '') &&
      /[,}\]\s]/.test(script[i + 9] || '')
    ) {
      cleaned += 'null'
      i += 8
      continue
    }
    cleaned += ch
    if (depth === 0 && ch === '}') break
  }
  try {
    return JSON.parse(cleaned)
  } catch {
    return undefined
  }
}

export function normalizeXiaohongshuDetail(
  data: unknown,
  id: string,
  sourceUrl: string,
  resolvedBy: 'http' | 'browser'
): PlatformWork | undefined {
  const root = record(data)
  const mapped = record(record(record(root.note).noteDetailMap)[id]).note
  let note = record(mapped)
  if (!Object.keys(note).length) {
    const items = record(root.data).items
    if (Array.isArray(items)) {
      const item = items
        .map(record)
        .find((item) => String(item.id || item.note_id || '').toLowerCase() === id)
      note = record(item?.note_card)
    } else if (String(root.noteId || root.note_id || '').toLowerCase() === id) note = root
  }
  if (
    !Object.keys(note).length ||
    (note.noteId && String(note.noteId).toLowerCase() !== id) ||
    (note.note_id && String(note.note_id).toLowerCase() !== id)
  )
    return undefined
  function urls(values: unknown[]): string[] {
    const candidates = values
      .filter((v): v is string => typeof v === 'string')
      .map((value) => {
        try {
          const url = new URL(value)
          // The note page supplies HTTP CDN links. Upgrade transport only for the
          // platform CDN; leave path, query signatures and media transformations intact.
          if (
            url.protocol === 'http:' &&
            (url.hostname === 'xhscdn.com' || url.hostname.endsWith('.xhscdn.com'))
          )
            url.protocol = 'https:'
          return url.href
        } catch {
          return value
        }
      })
    return [...new Set(candidates)].filter((url) => {
      try {
        const validated = validatePlatformUrl(url, 'media')
        return validated.hostname === 'xhscdn.com' || validated.hostname.endsWith('.xhscdn.com')
      } catch {
        return false
      }
    })
  }
  const assets: PlatformMediaAsset[] = []
  const isVideo = note.type === 'video'
  function asset(
    assetUrls: string[],
    index: number,
    sourceField: string,
    metadata: Record<string, unknown>
  ): void {
    if (!assetUrls.length) return
    const flag = metadata.hasWatermark ?? metadata.has_watermark
    assets.push({
      id: isVideo ? 'video-1' : `image-${index + 1}`,
      kind: isVideo ? 'video' : 'image',
      urls: assetUrls,
      sourceField,
      watermark: flag === true ? 'present' : flag === false ? 'absent' : 'unknown',
      watermarkEvidence:
        flag === true || flag === false
          ? `平台元数据 hasWatermark=${flag}`
          : '平台未明确标注水印状态，不推断无水印'
    })
  }
  if (isVideo) {
    const streams = record(record(record(note.video).media).stream)
    const candidates: unknown[] = []
    for (const codec of ['h264', 'h265', 'av1']) {
      for (const stream of Array.isArray(streams[codec]) ? (streams[codec] as unknown[]) : []) {
        const item = record(stream)
        candidates.push(
          item.masterUrl,
          item.mediaUrl,
          ...(Array.isArray(item.backupUrls) ? item.backupUrls : [])
        )
      }
    }
    asset(urls(candidates), 0, 'video.media.stream', record(note.video))
  } else {
    const images = note.imageList ?? note.image_list
    if (Array.isArray(images)) {
      for (const [index, image] of images.entries()) {
        const item = record(image)
        const info = item.infoList ?? item.info_list
        const variants = Array.isArray(info) ? info.map(record) : []
        const imageUrls = urls([
          item.urlDefault,
          item.url_default,
          ...variants.map((v) => v.url),
          item.urlPre,
          item.url_pre
        ])
        if (!imageUrls.length) return undefined // Do not pretend a partial album is the full work.
        asset(imageUrls, index, 'imageList', item)
      }
    }
  }
  if (!assets.length) return undefined
  return {
    platform: 'xiaohongshu',
    id,
    kind: isVideo ? 'video' : 'images',
    title:
      [
        ...new Set(
          [note.title, note.desc].filter(
            (value): value is string => typeof value === 'string' && !!value.trim()
          )
        )
      ].join('\n') || '小红书作品',
    author: String(record(note.user).nickname || '未知作者'),
    sourceUrl,
    assets,
    resolvedBy,
    warnings: assets.some((a) => a.watermark === 'unknown')
      ? ['部分资源水印状态未知，不标记为无水印。']
      : []
  }
}
