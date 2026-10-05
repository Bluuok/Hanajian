import { extractDouyinShareUrl } from './douyin-parser'
import {
  DOUYIN_PAGE_HOSTS,
  XHS_SHORT_HOSTS,
  XHS_PAGE_HOSTS,
  validatePlatformUrl
} from './platform-url'
export function extractPlatformShare(input: string): {
  platform: 'douyin' | 'xiaohongshu'
  url: string
} {
  if (typeof input !== 'string' || !input.trim() || input.length > 16000)
    throw new Error('请粘贴分享文案或作品链接（最多 16000 字符）')
  const links = new Map<string, 'douyin' | 'xiaohongshu'>()
  for (const candidate of input.match(/https?:\/\/[^\s<>"`[\]（）]+/g) || []) {
    try {
      const candidateUrl = new URL(candidate.replace(/[),，。；;！!?？]+$/, ''))
      // Mobile Xiaohongshu shares commonly use http short links. Never request them
      // over HTTP: upgrade only these exact known hosts before URL validation.
      if (candidateUrl.protocol === 'http:' && XHS_SHORT_HOSTS.has(candidateUrl.hostname))
        candidateUrl.protocol = 'https:'
      const url = validatePlatformUrl(candidateUrl.href, 'page')
      if (DOUYIN_PAGE_HOSTS.has(url.hostname)) links.set(extractDouyinShareUrl(url.href), 'douyin')
      else if (
        XHS_PAGE_HOSTS.has(url.hostname) &&
        (XHS_SHORT_HOSTS.has(url.hostname) ||
          /\/(?:explore|discovery\/item)\/[a-f0-9]{24}(?:\/|$)/i.test(url.pathname))
      )
        links.set(url.href, 'xiaohongshu')
    } catch {
      /* unrelated links are not parser targets */
    }
  }
  if (!links.size) throw new Error('没有找到有效作品链接，目前支持抖音、小红书')
  if (links.size > 1) throw new Error('文案中有多个作品链接，请一次解析一个作品')
  const [url, platform] = [...links][0]
  return { platform, url }
}
