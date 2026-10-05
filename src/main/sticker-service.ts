import crypto from 'crypto'
import fs from 'fs-extra'
import http from 'http'
import https from 'https'
import os from 'os'
import path from 'path'
import { Wcdb4Client } from './wcdb4-client'
import { classifyStickerHttpFailure, StickerFailureCode } from '../shared/sticker'

type StickerResult = {
  success: boolean
  data?: string
  error?: string
  failureCode?: StickerFailureCode
  httpStatus?: number
}

const downloadCache = new Map<string, Promise<StickerResult>>()

export class StickerService {
  private readonly cacheDir: string
  private readonly legacyCacheDir: string

  constructor(private readonly wcdb4Client?: Wcdb4Client | null) {
    this.cacheDir = path.join(os.homedir(), 'Documents', 'TraceDigest', 'Emojis')
    // Keep reading the former directory so existing sticker caches remain usable.
    this.legacyCacheDir = path.join(os.homedir(), 'Documents', 'WechatExplorer', 'Emojis')
  }

  async resolveSticker(
    cdnUrl?: string,
    md5?: string,
    aesKey?: string,
    encryptedUrl?: string
  ): Promise<StickerResult> {
    const normalizedMd5 = this.normalizeMd5(md5)
    let url = String(cdnUrl || '').trim()
    const encryptedDownloadUrl = String(encryptedUrl || '').trim()
    const sourceUrl = url || encryptedDownloadUrl

    const cacheKey =
      normalizedMd5 || (sourceUrl ? crypto.createHash('md5').update(sourceUrl).digest('hex') : '')
    if (cacheKey) {
      const cached = await this.readCached(cacheKey, aesKey)
      if (cached) return { success: true, data: cached }
    }

    if (normalizedMd5 && this.wcdb4Client) {
      const wechatCached = await this.readWechatEmoticonCache(normalizedMd5, aesKey)
      if (wechatCached) return { success: true, data: wechatCached }
    }

    if (!url && normalizedMd5 && this.wcdb4Client) {
      url = this.wcdb4Client.resolveEmoticonCdnUrl(normalizedMd5) || ''
      if (!url) {
        console.warn(`[StickerService] emoticon CDN URL not found for md5=${normalizedMd5}`)
      }
    }

    if (!url && !encryptedDownloadUrl) {
      return {
        success: false,
        error: aesKey
          ? '本地表情包缓存解密失败，且未找到可用下载地址'
          : '未找到可用的表情图片或下载地址'
      }
    }

    const resolvedCacheKey =
      cacheKey ||
      crypto
        .createHash('md5')
        .update(url || encryptedDownloadUrl)
        .digest('hex')
    // Requests with different keys or fallback URLs must be able to retry independently.
    const pendingKey = crypto
      .createHash('sha256')
      .update(JSON.stringify([resolvedCacheKey, url, encryptedDownloadUrl, aesKey || '']))
      .digest('hex')
    const pending = downloadCache.get(pendingKey)
    if (pending) return pending

    const task = this.downloadWithFallback(url, encryptedDownloadUrl, resolvedCacheKey, aesKey)
    downloadCache.set(pendingKey, task)
    try {
      return await task
    } finally {
      downloadCache.delete(pendingKey)
    }
  }

  private async downloadWithFallback(
    url: string,
    encryptedUrl: string,
    cacheKey: string,
    aesKey?: string
  ): Promise<StickerResult> {
    let result: StickerResult = { success: false, error: '未找到表情包下载地址' }
    for (const downloadUrl of new Set([url, encryptedUrl].filter(Boolean))) {
      result = await this.downloadToDataUrl(downloadUrl, cacheKey, aesKey).catch((error) => ({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }))
      if (result.success) return result
    }
    return result
  }

  private async readCached(cacheKey: string, aesKey?: string): Promise<string | null> {
    const extensions = ['.gif', '.png', '.webp', '.jpg', '.jpeg']
    const cacheDirs = [this.cacheDir, this.legacyCacheDir]
    for (const cacheDir of cacheDirs) {
      for (const ext of extensions) {
        const filePath = path.join(cacheDir, `${cacheKey}${ext}`)
        if (!fs.existsSync(filePath)) continue
        const buffer = await fs.readFile(filePath)
        const decoded = this.decodeStickerBuffer(buffer, aesKey)
        if (decoded) return this.toDataUrl(decoded.buffer, decoded.ext)
      }
    }
    return null
  }

  private async readWechatEmoticonCache(md5: string, aesKey?: string): Promise<string | null> {
    const accountRoot = this.wcdb4Client?.getAccountRoot()
    if (!accountRoot) return null

    const cacheRoot = path.join(accountRoot, 'cache')
    if (!fs.existsSync(cacheRoot)) return null

    const prefix = md5.slice(0, 2)
    let months: string[] = []
    try {
      months = fs
        .readdirSync(cacheRoot)
        .filter((name) => /^\d{4}-\d{2}$/.test(name))
        .sort()
        .reverse()
    } catch {
      return null
    }

    for (const month of months) {
      const filePath = path.join(cacheRoot, month, 'Emoticon', prefix, md5)
      if (!fs.existsSync(filePath)) continue
      const buffer = await fs.readFile(filePath)
      const decoded = this.decodeStickerBuffer(buffer, aesKey)
      if (!decoded) continue
      return this.toDataUrl(decoded.buffer, decoded.ext)
    }

    return null
  }

  private downloadToDataUrl(
    url: string,
    cacheKey: string,
    aesKey?: string,
    redirectCount = 0
  ): Promise<StickerResult> {
    return new Promise((resolve) => {
      if (redirectCount > 5) {
        resolve({ success: false, error: '表情包下载重定向过多' })
        return
      }

      const client = url.startsWith('https:') ? https : http
      const request = client.get(
        url,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 MicroMessenger Hanajian',
            Referer: 'https://weixin.qq.com/'
          }
        },
        (response) => {
          const redirectUrl = response.headers.location
          if (redirectUrl && [301, 302, 303, 307, 308].includes(Number(response.statusCode || 0))) {
            const nextUrl = new URL(redirectUrl, url).toString()
            response.resume()
            this.downloadToDataUrl(nextUrl, cacheKey, aesKey, redirectCount + 1).then(resolve)
            return
          }

          if (response.statusCode !== 200) {
            const statusCode = Number(response.statusCode || 0)
            const failure = classifyStickerHttpFailure(statusCode, url)
            response.resume()
            console.warn(
              `[StickerService] download failed code=${failure.code} status=${statusCode} md5=${cacheKey} host=${this.getUrlHost(url)}`
            )
            resolve({
              success: false,
              error: failure.message,
              failureCode: failure.code,
              httpStatus: statusCode
            })
            return
          }

          const chunks: Buffer[] = []
          response.on('data', (chunk: Buffer) => chunks.push(chunk))
          response.on('end', async () => {
            const downloaded = Buffer.concat(chunks)
            if (downloaded.length === 0) {
              resolve({ success: false, error: '表情包内容为空' })
              return
            }

            const decoded = this.decodeStickerBuffer(downloaded, aesKey)
            if (!decoded) {
              resolve({
                success: false,
                error: aesKey ? '表情包 AES 解密失败' : '下载内容不是可识别的表情图片'
              })
              return
            }
            const { buffer, ext } = decoded
            try {
              await fs.ensureDir(this.cacheDir)
              await fs.writeFile(path.join(this.cacheDir, `${cacheKey}${ext}`), buffer)
            } catch {
              // Cache is best effort; the data URL can still be displayed.
            }
            resolve({ success: true, data: this.toDataUrl(buffer, ext) })
          })
        }
      )

      request.on('error', (error) => resolve({ success: false, error: error.message }))
      request.setTimeout(15000, () => {
        request.destroy()
        resolve({ success: false, error: '表情包下载超时' })
      })
    })
  }

  private detectExtension(buffer: Buffer): string | null {
    if (buffer.length >= 6 && buffer.subarray(0, 3).toString('ascii') === 'GIF') return '.gif'
    if (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    )
      return '.png'
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
      return '.jpg'
    if (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return '.webp'
    }
    return null
  }

  private decodeStickerBuffer(
    input: Buffer,
    aesKey?: string
  ): { buffer: Buffer; ext: string } | null {
    const plainExt = this.detectExtension(input)
    if (plainExt) return { buffer: input, ext: plainExt }

    const key = this.parseAesKey(aesKey)
    if (!key || input.length === 0 || input.length % 16 !== 0) return null
    try {
      const decipher = crypto.createDecipheriv('aes-128-ecb', key, null)
      const buffer = Buffer.concat([decipher.update(input), decipher.final()])
      const ext = this.detectExtension(buffer)
      return ext ? { buffer, ext } : null
    } catch {
      return null
    }
  }

  private parseAesKey(value?: string): Buffer | null {
    const raw = String(value || '').trim()
    if (/^[a-f0-9]{32}$/i.test(raw)) return Buffer.from(raw, 'hex')
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return null

    const decoded = Buffer.from(raw, 'base64')
    if (decoded.length === 16) return decoded
    if (decoded.length === 32 && /^[a-f0-9]{32}$/i.test(decoded.toString('ascii'))) {
      return Buffer.from(decoded.toString('ascii'), 'hex')
    }
    return null
  }

  private getUrlHost(url: string): string {
    try {
      return new URL(url).hostname || 'unknown'
    } catch {
      return 'unknown'
    }
  }

  private toDataUrl(buffer: Buffer, ext: string): string {
    const mimeTypes: Record<string, string> = {
      '.gif': 'image/gif',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg'
    }
    return `data:${mimeTypes[ext] || 'image/gif'};base64,${buffer.toString('base64')}`
  }

  private normalizeMd5(value?: string): string | undefined {
    const md5 = String(value || '')
      .trim()
      .toLowerCase()
    return /^[a-f0-9]{32}$/.test(md5) ? md5 : undefined
  }
}
