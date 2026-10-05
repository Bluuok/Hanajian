import crypto from 'crypto'
import { EventEmitter } from 'events'
import path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Wcdb4Client } from '../../src/main/wcdb4-client'

const fixture = vi.hoisted(() => ({
  files: new Map<string, Buffer>(),
  directories: new Set<string>(),
  months: [] as string[],
  fs: {
    existsSync: vi.fn(),
    readFile: vi.fn(),
    readdirSync: vi.fn(),
    ensureDir: vi.fn(),
    writeFile: vi.fn()
  },
  get: vi.fn()
}))

vi.mock('fs-extra', () => ({ default: fixture.fs }))
vi.mock('os', () => ({ default: { homedir: () => 'synthetic-sticker-home' } }))
vi.mock('http', () => ({ default: { get: fixture.get } }))
vi.mock('https', () => ({ default: { get: fixture.get } }))

import { StickerService } from '../../src/main/sticker-service'

const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
const dataUrl = `data:image/gif;base64,${gif.toString('base64')}`
const aesKey = Buffer.from('00112233445566778899aabbccddeeff', 'hex')
const md5 = crypto.createHash('md5').update(gif).digest('hex')
const accountRoot = 'synthetic-wechat-account'
const cacheRoot = path.join(accountRoot, 'cache')
const appCacheRoot = path.join('synthetic-sticker-home', 'Documents', 'TraceDigest', 'Emojis')
const legacyCacheRoot = path.join('synthetic-sticker-home', 'Documents', 'WechatExplorer', 'Emojis')
const encrypt = (buffer = gif): Buffer => {
  const cipher = crypto.createCipheriv('aes-128-ecb', aesKey, null)
  return Buffer.concat([cipher.update(buffer), cipher.final()])
}
const wechatCachePath = (month: string): string =>
  path.join(cacheRoot, month, 'Emoticon', md5.slice(0, 2), md5)

function createService(): StickerService {
  return new StickerService({
    getAccountRoot: () => accountRoot,
    resolveEmoticonCdnUrl: () => ''
  } as unknown as Wcdb4Client)
}

function mockDownloads(
  routes: Record<string, { status?: number; body?: Buffer; location?: string }>
): void {
  fixture.get.mockImplementation(
    (url: string, _options: unknown, receive: (response: EventEmitter) => void) => {
      const request = Object.assign(new EventEmitter(), { setTimeout: vi.fn(), destroy: vi.fn() })
      queueMicrotask(() => {
        const route = routes[url]
        if (!route) throw new Error(`Unexpected synthetic download: ${url}`)
        const response = Object.assign(new EventEmitter(), {
          statusCode: route.status ?? 200,
          headers: { location: route.location },
          resume: vi.fn()
        })
        receive(response)
        if (response.statusCode === 200) {
          response.emit('data', route.body ?? Buffer.alloc(0))
          response.emit('end')
        }
      })
      return request
    }
  )
}

describe('StickerService encrypted stickers', () => {
  beforeEach(() => {
    fixture.files.clear()
    fixture.directories.clear()
    fixture.months = []
    fixture.get.mockReset()
    fixture.fs.existsSync.mockImplementation(
      (filePath: string) => fixture.files.has(filePath) || fixture.directories.has(filePath)
    )
    fixture.fs.readFile.mockImplementation(async (filePath: string) => {
      const buffer = fixture.files.get(filePath)
      if (!buffer) throw new Error(`Unexpected synthetic cache read: ${filePath}`)
      return buffer
    })
    fixture.fs.readdirSync.mockImplementation(() => fixture.months)
    fixture.fs.ensureDir.mockResolvedValue(undefined)
    fixture.fs.writeFile.mockImplementation(async (filePath: string, buffer: Buffer) => {
      fixture.files.set(filePath, buffer)
    })
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  it.each([appCacheRoot, legacyCacheRoot])(
    'keeps a valid plaintext cache usable without a key in %s',
    async (directory) => {
      fixture.files.set(path.join(directory, `${md5}.gif`), gif)
      await expect(createService().resolveSticker(undefined, md5)).resolves.toEqual({
        success: true,
        data: dataUrl
      })
      expect(fixture.get).not.toHaveBeenCalled()
    }
  )

  it.each([
    ['hex', aesKey.toString('hex')],
    ['base64 bytes', aesKey.toString('base64')],
    ['base64 hex', Buffer.from(aesKey.toString('hex')).toString('base64')]
  ])('decrypts the WeChat cache with a %s key', async (_format, key) => {
    fixture.directories.add(cacheRoot)
    fixture.months = ['2026-09', '2026-10']
    fixture.files.set(wechatCachePath('2026-10'), Buffer.from('corrupt newer cache'))
    fixture.files.set(wechatCachePath('2026-09'), encrypt())

    await expect(
      createService().resolveSticker(undefined, md5.toUpperCase(), key)
    ).resolves.toEqual({
      success: true,
      data: dataUrl
    })
    expect(fixture.fs.readFile.mock.calls.map(([filePath]) => filePath)).toEqual([
      wechatCachePath('2026-10'),
      wechatCachePath('2026-09')
    ])
    expect(fixture.get).not.toHaveBeenCalled()
  })

  it('decodes encrypted data left in an existing application cache', async () => {
    fixture.files.set(path.join(appCacheRoot, `${md5}.gif`), encrypt())
    await expect(
      createService().resolveSticker(undefined, md5, aesKey.toString('hex'))
    ).resolves.toEqual({
      success: true,
      data: dataUrl
    })
    expect(fixture.get).not.toHaveBeenCalled()
  })

  it.each([undefined, 'invalid-key', 'f'.repeat(32)])(
    'does not expose encrypted cache bytes as an image with key %s',
    async (key) => {
      fixture.directories.add(cacheRoot)
      fixture.months = ['2026-10']
      fixture.files.set(wechatCachePath('2026-10'), encrypt())
      const result = await createService().resolveSticker(undefined, md5, key)
      expect(result).toMatchObject({ success: false, error: expect.any(String) })
      expect(result.data).toBeUndefined()
      expect(fixture.fs.writeFile).not.toHaveBeenCalled()
      expect(fixture.get).not.toHaveBeenCalled()
    }
  )

  it('downloads an encrypted-only URL through redirects and caches decrypted bytes', async () => {
    const encryptedUrl = 'https://synthetic.test/encrypted'
    mockDownloads({
      [encryptedUrl]: { status: 302, location: '/payload' },
      'https://synthetic.test/payload': { body: encrypt() }
    })
    const service = new StickerService()
    await expect(
      service.resolveSticker(undefined, undefined, aesKey.toString('hex'), encryptedUrl)
    ).resolves.toEqual({ success: true, data: dataUrl })

    const cacheKey = crypto.createHash('md5').update(encryptedUrl).digest('hex')
    expect(fixture.fs.writeFile).toHaveBeenCalledWith(
      path.join(appCacheRoot, `${cacheKey}.gif`),
      gif
    )
    fixture.get.mockClear()
    await expect(
      service.resolveSticker(undefined, undefined, undefined, encryptedUrl)
    ).resolves.toEqual({
      success: true,
      data: dataUrl
    })
    expect(fixture.get).not.toHaveBeenCalled()
  })

  it('falls back from an expired ordinary CDN URL to its encrypted URL', async () => {
    const cdnUrl = 'https://synthetic.test/plain.gif?expire=1'
    const encryptedUrl = 'https://synthetic.test/encrypted'
    mockDownloads({ [cdnUrl]: { status: 403 }, [encryptedUrl]: { body: encrypt() } })

    await expect(
      new StickerService().resolveSticker(cdnUrl, md5, aesKey.toString('base64'), encryptedUrl)
    ).resolves.toEqual({ success: true, data: dataUrl })
    expect(fixture.get.mock.calls.map(([url]) => url)).toEqual([cdnUrl, encryptedUrl])
  })

  it('rejects an invalid encrypted download without persisting ciphertext', async () => {
    const encryptedUrl = 'https://synthetic.test/encrypted'
    mockDownloads({ [encryptedUrl]: { body: encrypt() } })
    const result = await new StickerService().resolveSticker(
      undefined,
      md5,
      'f'.repeat(32),
      encryptedUrl
    )
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('AES') })
    expect(result.data).toBeUndefined()
    expect(fixture.fs.writeFile).not.toHaveBeenCalled()
  })

  it('allows a valid key request while the same sticker is being requested with a wrong key', async () => {
    const encryptedUrl = 'https://synthetic.test/encrypted'
    mockDownloads({ [encryptedUrl]: { body: encrypt() } })
    const service = new StickerService()
    const [wrong, valid] = await Promise.all([
      service.resolveSticker(undefined, md5, 'f'.repeat(32), encryptedUrl),
      service.resolveSticker(undefined, md5, aesKey.toString('hex'), encryptedUrl)
    ])
    expect(wrong.success).toBe(false)
    expect(valid).toEqual({ success: true, data: dataUrl })
    expect(fixture.get).toHaveBeenCalledTimes(2)
  })

  it('rejects non-image responses even if the CDN URL has a GIF extension', async () => {
    const cdnUrl = 'https://synthetic.test/removed.gif'
    mockDownloads({ [cdnUrl]: { body: Buffer.from('<html>Unavailable</html>') } })
    const result = await new StickerService().resolveSticker(cdnUrl, md5)
    expect(result.success).toBe(false)
    expect(result.data).toBeUndefined()
    expect(fixture.fs.writeFile).not.toHaveBeenCalled()
  })

  it('preserves the HTTP failure code when no encrypted fallback is present', async () => {
    const cdnUrl = 'https://synthetic.test/expired.gif?expire=1'
    mockDownloads({ [cdnUrl]: { status: 403 } })
    await expect(new StickerService().resolveSticker(cdnUrl, md5)).resolves.toMatchObject({
      success: false,
      failureCode: 'link_expired',
      httpStatus: 403
    })
  })
})
