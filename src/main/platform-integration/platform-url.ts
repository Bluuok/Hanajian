export const DOUYIN_PAGE_HOSTS = new Set([
  'v.douyin.com',
  'www.douyin.com',
  'douyin.com',
  'www.iesdouyin.com',
  'iesdouyin.com'
])
export const XHS_SHORT_HOSTS = new Set([
  'xhslink.com',
  'www.xhslink.com',
  'xhslink.cn',
  'www.xhslink.cn'
])
export const XHS_PAGE_HOSTS = new Set([
  ...XHS_SHORT_HOSTS,
  'xiaohongshu.com',
  'www.xiaohongshu.com'
])
const MEDIA_DOMAINS = [
  'douyinpic.com',
  'douyinvod.com',
  'byteimg.com',
  'pstatp.com',
  'bytecdn.com',
  'ibytedtos.com',
  'amemv.com',
  'douyin.com',
  'iesdouyin.com',
  'xhscdn.com'
]

/** Exact page hosts and platform-owned media suffixes; applied before every HTTP redirect. */
export function validatePlatformUrl(input: string, purpose: 'page' | 'media'): URL {
  const url = new URL(input)
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443'))
    throw new Error('只支持平台的 HTTPS 链接，不接受账号信息或自定义端口')
  const host = url.hostname.toLowerCase()
  const allowed =
    purpose === 'page'
      ? DOUYIN_PAGE_HOSTS.has(host) || XHS_PAGE_HOSTS.has(host)
      : host === 'v3-dy-o.zjcdn.com' ||
        MEDIA_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`))
  if (!allowed) throw new Error('链接不是受支持的平台页面或媒体域名')
  return url
}
