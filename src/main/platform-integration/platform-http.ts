import { validatePlatformUrl } from './platform-url'

export const MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
export const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
export type PlatformFetch = typeof fetch

/** Validate every redirect as well as the original URL. Do not accept arbitrary proxy targets. */
export async function fetchPlatformResource(
  input: string,
  purpose: 'page' | 'media',
  fetcher: PlatformFetch = fetch,
  options: { userAgent?: string; range?: string; timeoutMs?: number } = {}
): Promise<{ response: Response; url: string }> {
  let url = validatePlatformUrl(input, purpose).href
  const signal = AbortSignal.timeout(options.timeoutMs ?? (purpose === 'page' ? 18000 : 120000))
  for (let redirects = 0; redirects <= 6; redirects++) {
    const headers: Record<string, string> = {
      'User-Agent': options.userAgent || DESKTOP_USER_AGENT,
      Referer: /(?:^|\.)(?:xiaohongshu\.com|xhslink\.(?:com|cn)|xhscdn\.com)$/.test(
        new URL(url).hostname
      )
        ? 'https://www.xiaohongshu.com/'
        : 'https://www.douyin.com/',
      Accept: purpose === 'media' ? '*/*' : 'text/html,application/json'
    }
    if (options.range) {
      if (!/^bytes=\d+-\d*$/.test(options.range)) throw new Error('不支持的媒体 Range 请求')
      headers.Range = options.range
    }
    const response = await fetcher(url, { headers, redirect: 'manual', signal })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      await response.body?.cancel()
      if (!location) throw new Error('平台重定向缺少目标链接')
      url = validatePlatformUrl(new URL(location, url).href, purpose).href
      continue
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error(`平台请求失败（HTTP ${response.status}），请检查作品是否公开或稍后重试`)
    }
    return { response, url }
  }
  throw new Error('平台链接重定向次数过多')
}

export async function readPlatformText(
  response: Response,
  maxBytes = 8 * 1024 * 1024
): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      bytes += next.value.byteLength
      if (bytes > maxBytes) throw new Error('平台详情响应过大')
      chunks.push(next.value)
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  return Buffer.concat(chunks).toString('utf8')
}
