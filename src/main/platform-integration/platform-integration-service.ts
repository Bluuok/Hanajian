import { randomUUID, createHash } from 'crypto'
import { isAbsolute } from 'path'
import { mkdir, open, unlink } from 'fs/promises'
import type {
  PlatformMediaAsset,
  PlatformSavedAsset,
  PlatformParseResult,
  PlatformSaveResult,
  PlatformWork
} from '../../shared/platform-integration'
import {
  extractEmbeddedDouyinData,
  identifyDouyinWork,
  normalizeDouyinDetail
} from './douyin-parser'
import { fetchPlatformResource, MOBILE_USER_AGENT, readPlatformText } from './platform-http'
import type { PlatformFetch } from './platform-http'
import { resolveDouyinWithBrowser } from './douyin-browser'
import { extractPlatformShare } from './platform-share'
import {
  identifyXiaohongshuWork,
  extractXiaohongshuState,
  normalizeXiaohongshuDetail
} from './xiaohongshu-parser'
import { resolveXiaohongshuWithBrowser } from './xiaohongshu-browser'
import { PlatformFileNames, withPlatformDirectoryLock } from './platform-file-names'

type BrowserResolver = typeof resolveDouyinWithBrowser
const RESULT_TTL_MS = 30 * 60 * 1000
const MAX_ASSET_BYTES = 1024 * 1024 * 1024

export class PlatformIntegrationService {
  private results = new Map<
    string,
    { work: PlatformWork; expires: number; savedAssets: Map<string, PlatformSavedAsset> }
  >()
  private inFlight = new Map<string, Promise<PlatformParseResult>>()

  constructor(
    private readonly fetcher: PlatformFetch = fetch,
    private readonly browserResolver: BrowserResolver = resolveDouyinWithBrowser,
    private readonly xiaohongshuBrowserResolver = resolveXiaohongshuWithBrowser
  ) {}

  parseShare(input: string): Promise<PlatformParseResult> {
    let url: string
    let platform: 'douyin' | 'xiaohongshu'
    try {
      const extracted = extractPlatformShare(input)
      url = extracted.url
      platform = extracted.platform
    } catch (error) {
      return Promise.resolve({ success: false, code: 'INVALID_INPUT', error: errorMessage(error) })
    }
    const pending = this.inFlight.get(url)
    if (pending) return pending
    if (this.inFlight.size >= 2)
      return Promise.resolve({
        success: false,
        code: 'UNAVAILABLE',
        error: '解析任务较多，请等待当前任务完成后再试'
      })
    const task = (
      platform === 'xiaohongshu' ? this.resolveXiaohongshu(url) : this.resolve(url)
    ).finally(() => this.inFlight.delete(url))
    this.inFlight.set(url, task)
    return task
  }

  getWork(resultId: string): PlatformWork {
    this.pruneResults()
    const entry = this.results.get(resultId)
    if (!entry) throw new Error('解析结果已过期，请重新解析分享文案')
    return entry.work
  }

  private remember(work: PlatformWork): PlatformParseResult {
    this.pruneResults()
    const resultId = randomUUID()
    const withPreviews: PlatformWork = {
      ...work,
      assets: work.assets.map((asset) => ({
        ...asset,
        previewUrl: `tracedigest-platform://media/${resultId}/${asset.id}`
      }))
    }
    this.results.set(resultId, {
      work: withPreviews,
      expires: Date.now() + RESULT_TTL_MS,
      savedAssets: new Map()
    })
    if (this.results.size > 30) this.results.delete(this.results.keys().next().value!)
    return { success: true, work: withPreviews, resultId }
  }

  private pruneResults(): void {
    for (const [id, entry] of this.results) if (entry.expires <= Date.now()) this.results.delete(id)
  }

  private async resolveXiaohongshu(sourceUrl: string): Promise<PlatformParseResult> {
    let identified = identifyXiaohongshuWork(sourceUrl)
    let message = ''
    try {
      const page = await fetchPlatformResource(sourceUrl, 'page', this.fetcher)
      identified = identifyXiaohongshuWork(page.url) || identified
      const html = await readPlatformText(page.response)
      if (identified) {
        const work = normalizeXiaohongshuDetail(
          extractXiaohongshuState(html),
          identified.id,
          identified.sourceUrl,
          'http'
        )
        if (work) return this.remember(work)
      }
    } catch (error) {
      message = errorMessage(error)
    }
    try {
      const work = await this.xiaohongshuBrowserResolver(
        identified?.sourceUrl || sourceUrl,
        identified?.id
      )
      if (work) return this.remember(work)
      return {
        success: false,
        code: 'NO_MEDIA',
        identifiedWork: identified,
        error: '未获得小红书目标作品的媒体详情，可能需要登录或作品受限；未下载推荐图或占位图。'
      }
    } catch (error) {
      message = errorMessage(error) || message
      return {
        success: false,
        code: message.startsWith('BROWSER_UNAVAILABLE:') ? 'BROWSER_UNAVAILABLE' : 'UNAVAILABLE',
        identifiedWork: identified,
        error: message.replace(/^BROWSER_UNAVAILABLE:\s*/, '')
      }
    }
  }

  private async resolve(sourceUrl: string): Promise<PlatformParseResult> {
    let identified = identifyDouyinWork(sourceUrl)
    let httpError = ''
    try {
      const page = await fetchPlatformResource(sourceUrl, 'page', this.fetcher, {
        userAgent: MOBILE_USER_AGENT
      })
      identified = identifyDouyinWork(page.url) || identified
      const html = await readPlatformText(page.response)
      if (!identified)
        return {
          success: false,
          code: 'NO_MEDIA',
          error: '该链接没有指向可识别的抖音作品；可能已失效或需要登录'
        }
      const embedded = normalizeDouyinDetail(
        extractEmbeddedDouyinData(html),
        identified.id,
        identified.sourceUrl,
        'http'
      )
      if (embedded) return this.remember(embedded)
    } catch (error) {
      httpError = errorMessage(error)
    }
    if (!identified)
      return {
        success: false,
        code: 'UNAVAILABLE',
        error: httpError || '无法识别抖音作品，请稍后重试'
      }
    // First try the platform's own public item-info response and canonical page over HTTP.
    for (const url of [
      `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${identified.id}`,
      `https://www.douyin.com/video/${identified.id}`
    ]) {
      try {
        const { response } = await fetchPlatformResource(url, 'page', this.fetcher)
        const body = await readPlatformText(response)
        let data: unknown
        try {
          data = JSON.parse(body)
        } catch {
          data = extractEmbeddedDouyinData(body)
        }
        const work = normalizeDouyinDetail(data, identified.id, identified.sourceUrl, 'http')
        if (work) return this.remember(work)
      } catch (error) {
        httpError = errorMessage(error)
      }
    }
    try {
      const work = await this.browserResolver(identified.id, identified.sourceUrl)
      if (work) return this.remember(work)
      return {
        success: false,
        code: 'NO_MEDIA',
        identifiedWork: identified,
        error:
          '本次未获取到该作品可下载的媒体详情，尚不能判断是否为作品访问限制。没有下载任何推荐图或占位图。'
      }
    } catch (error) {
      const message = errorMessage(error)
      return {
        success: false,
        identifiedWork: identified,
        code: message.startsWith('BROWSER_UNAVAILABLE:') ? 'BROWSER_UNAVAILABLE' : 'UNAVAILABLE',
        error: message.replace(/^BROWSER_UNAVAILABLE:\s*/, '')
      }
    }
  }

  async mediaResponse(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url)
      if (
        url.protocol !== 'tracedigest-platform:' ||
        url.hostname !== 'media' ||
        !['GET', 'HEAD'].includes(request.method)
      )
        return new Response('Not found', { status: 404 })
      const parts = url.pathname.split('/').filter(Boolean)
      if (parts.length !== 2) return new Response('Not found', { status: 404 })
      const work = this.getWork(parts[0])
      const asset = work.assets.find((item) => item.id === parts[1])
      if (!asset) return new Response('Not found', { status: 404 })
      const response = await fetchAsset(
        asset,
        this.fetcher,
        request.headers.get('range') || undefined
      )
      const headers = new Headers()
      for (const name of ['content-length', 'content-range', 'accept-ranges', 'content-type']) {
        const value = response.headers.get(name)
        if (value) headers.set(name, value)
      }
      headers.set('Cache-Control', 'private, max-age=120')
      headers.set('X-Content-Type-Options', 'nosniff')
      if (headers.get('content-type')?.includes('octet-stream'))
        headers.set(
          'Content-Type',
          asset.kind === 'video' ? 'video/mp4' : 'application/octet-stream'
        )
      if (request.method === 'HEAD') await response.body?.cancel()
      return new Response(request.method === 'HEAD' ? null : response.body, {
        status: response.status,
        headers
      })
    } catch {
      return new Response('Media unavailable; please parse again', { status: 502 })
    }
  }

  /** No arbitrary renderer URL/path. Caller resolves the directory through a user-facing picker. */
  getSavedWork(resultId: string): { work: PlatformWork; savedAssets: PlatformSavedAsset[] } {
    const work = this.getWork(resultId)
    return { work, savedAssets: [...this.results.get(resultId)!.savedAssets.values()] }
  }

  async save(resultId: string, directory: string, assetId?: string): Promise<PlatformSaveResult> {
    try {
      const work = this.getWork(resultId)
      const entry = this.results.get(resultId)!
      const result = await savePlatformWork(work, directory, assetId, this.fetcher)
      for (const saved of result.savedAssets || []) entry.savedAssets.set(saved.assetId, saved)
      return result
    } catch (error) {
      return Promise.resolve({ success: false, files: [], error: errorMessage(error) })
    }
  }
}

async function fetchAsset(
  asset: PlatformMediaAsset,
  fetcher: PlatformFetch,
  range?: string
): Promise<Response> {
  let lastError = '没有可下载的媒体地址'
  for (const url of asset.urls) {
    try {
      const { response } = await fetchPlatformResource(url, 'media', fetcher, { range })
      const mime = (response.headers.get('content-type') || '').split(';')[0].trim()
      if (
        !(asset.kind === 'image' ? /^image\/(?!svg)/.test(mime) : /^video\//.test(mime)) &&
        mime !== 'application/octet-stream'
      ) {
        await response.body?.cancel()
        throw new Error('平台返回的不是预期媒体文件，拒绝保存网页或占位响应')
      }
      if (Number(response.headers.get('content-length') || 0) > MAX_ASSET_BYTES) {
        await response.body?.cancel()
        throw new Error('单个媒体超过 1 GiB 下载上限')
      }
      return response
    } catch (error) {
      lastError = errorMessage(error)
    }
  }
  throw new Error(lastError)
}

export function sniffPlatformMedia(bytes: Uint8Array, kind: 'image' | 'video'): string {
  const buffer = Buffer.from(bytes)
  if (kind === 'video') {
    if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') return 'mp4'
    if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])))
      return 'webm'
  } else {
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg'
    if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png'
    if (/^GIF8[79]a$/.test(buffer.toString('ascii', 0, 6))) return 'gif'
    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP')
      return 'webp'
    if (
      buffer.toString('ascii', 4, 8) === 'ftyp' &&
      /avif|avis/.test(buffer.toString('ascii', 8, 32))
    )
      return 'avif'
  }
  throw new Error('文件头不是受支持的媒体格式，拒绝保存无效响应')
}

export async function savePlatformWork(
  work: PlatformWork,
  directory: string,
  assetId?: string,
  fetcher: PlatformFetch = fetch
): Promise<PlatformSaveResult> {
  return withPlatformDirectoryLock(directory, () =>
    savePlatformWorkUnlocked(work, directory, assetId, fetcher)
  )
}

async function savePlatformWorkUnlocked(
  work: PlatformWork,
  directory: string,
  assetId: string | undefined,
  fetcher: PlatformFetch
): Promise<PlatformSaveResult> {
  const files: string[] = []
  const savedAssets: PlatformSavedAsset[] = []
  const reusedFiles: string[] = []
  const errors: string[] = []
  try {
    if (!isAbsolute(directory)) throw new Error('保存目录必须是绝对路径')
    const assets = assetId ? work.assets.filter((asset) => asset.id === assetId) : work.assets
    if (!assets.length) throw new Error('没有找到要保存的媒体')
    await mkdir(directory, { recursive: true })
    const names = await PlatformFileNames.load(work, directory)
    for (const asset of assets) {
      let path: string | undefined
      let handle: Awaited<ReturnType<typeof open>> | undefined
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
      let complete = false
      try {
        const existing = await names.existingMedia(asset)
        if (existing) {
          files.push(existing)
          reusedFiles.push(existing)
          savedAssets.push({ assetId: asset.id, path: existing })
          continue
        }
        const response = await fetchAsset(asset, fetcher)
        if (!response.body) throw new Error('媒体响应为空')
        reader = response.body.getReader()
        const firstChunks: Uint8Array[] = []
        let prefixBytes = 0
        while (prefixBytes < 32) {
          const next = await reader.read()
          if (next.done) break
          firstChunks.push(next.value)
          prefixBytes += next.value.byteLength
        }
        const prefix = Buffer.concat(firstChunks)
        const extension = sniffPlatformMedia(prefix, asset.kind)
        path = await names.mediaPath(asset, extension)
        handle = await open(path, 'wx') // Never overwrite an existing user file.
        let bytes = prefix.length
        const hash = createHash('sha256').update(prefix)
        if (bytes > MAX_ASSET_BYTES) throw new Error('媒体超过下载上限')
        await handle.writeFile(prefix)
        while (true) {
          const next = await reader.read()
          if (next.done) break
          bytes += next.value.byteLength
          hash.update(next.value)
          if (bytes > MAX_ASSET_BYTES) throw new Error('媒体超过下载上限')
          await handle.writeFile(next.value)
        }
        const expectedBytes = Number(response.headers.get('content-length') || 0)
        if (expectedBytes && bytes !== expectedBytes) throw new Error('下载长度不完整，请重试')
        complete = true
        files.push(path)
        savedAssets.push({ assetId: asset.id, path })
        await names.recordMedia(asset, path, bytes, hash.digest('hex'))
      } catch (error) {
        errors.push(`${asset.id}：${errorMessage(error)}`)
      } finally {
        await reader?.cancel().catch(() => {})
        await handle?.close()
        // Only the newly-created incomplete output is removed; existing files are never touched.
        if (path && handle && !complete) await unlink(path).catch(() => {})
      }
    }
    return {
      success: errors.length === 0,
      files,
      savedAssets,
      reusedFiles: reusedFiles.length ? reusedFiles : undefined,
      errors: errors.length ? errors : undefined,
      error: errors.length
        ? files.length
          ? '部分媒体保存失败，已成功保存的文件保留'
          : '媒体保存失败'
        : undefined
    }
  } catch (error) {
    return { success: false, files, error: errorMessage(error) }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const platformIntegrationService = new PlatformIntegrationService()
