import { afterEach, describe, it, expect, vi } from 'vitest'
import { mkdir, mkdtemp, readdir, readFile, writeFile, rm } from 'fs/promises'
import { resolve, sep, basename } from 'path'
import {
  platformWorkStem,
  platformAssetLabel
} from '../../src/main/platform-integration/platform-file-names'
import { savePlatformWork } from '../../src/main/platform-integration/platform-integration-service'
import { writePlatformMarkdown } from '../../src/main/platform-integration/platform-markdown'
import type { PlatformWork } from '../../src/shared/platform-integration'

const root = resolve('.tmp-test-artifacts/naming-unit')
const created: string[] = []
async function folder(): Promise<string> {
  await mkdir(root, { recursive: true })
  const directory = await mkdtemp(resolve(root, 'case-'))
  created.push(directory)
  return directory
}
afterEach(async () => {
  for (const directory of created.splice(0)) {
    if (!resolve(directory).startsWith(root + sep)) throw new Error('Unsafe cleanup')
    await rm(directory, { recursive: true, force: true })
  }
})
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64'
)
const fetcher = (): ReturnType<typeof vi.fn> =>
  vi.fn(
    async () =>
      new Response(png, {
        headers: { 'content-type': 'image/png', 'content-length': String(png.length) }
      })
  )
const work = (id = '6411cf99000000001300b6d9'): PlatformWork => ({
  platform: 'xiaohongshu',
  id,
  title: 'F1上海还是新疆 #旅行',
  author: '浮寻',
  kind: 'images',
  sourceUrl: `https://www.xiaohongshu.com/explore/${id}`,
  warnings: [],
  resolvedBy: 'http',
  assets: [
    {
      id: 'image-1',
      kind: 'image',
      urls: ['https://sns-webpic-qc.xhscdn.com/a.png'],
      watermark: 'unknown',
      watermarkEvidence: '未知',
      sourceField: 'imageList'
    }
  ]
})
async function outputs(directory: string): Promise<string[]> {
  return (await readdir(directory)).filter((name) => !name.startsWith('.'))
}

describe('readable platform file names', () => {
  it('uses platform-author-title, drops hashtags and URL and removes Windows/wiki reserved characters', () => {
    expect(platformWorkStem(work())).toBe('小红书-浮寻-F1上海还是新疆')
    expect(
      platformWorkStem({
        ...work(),
        platform: 'douyin',
        author: '就这样吧',
        title: '谁的生命不会呐喊'
      })
    ).toBe('抖音-就这样吧-谁的生命不会呐喊')
    expect(
      platformWorkStem({
        ...work(),
        author: 'a/b:*?<>|[]',
        title: 'AI\nAgent [实践] #技术 https://example.com/'
      })
    ).toBe('小红书-ab-AI Agent 实践')
  })
  it('limits author to ten and title to twenty Unicode characters, with sensible empty fallbacks', () => {
    expect(platformWorkStem({ ...work(), author: '人'.repeat(20), title: '😀'.repeat(30) })).toBe(
      `小红书-${'人'.repeat(10)}-${'😀'.repeat(20)}`
    )
    expect(platformWorkStem({ ...work(), author: '', title: '#话题' })).toBe(
      '小红书-未知作者-未命名作品'
    )
  })
  it('keeps source image ordinals even when an earlier image is missing', () => {
    const value = work()
    expect(platformAssetLabel(value, value.assets[0])).toBe('图01')
    expect(platformAssetLabel(value, { ...value.assets[0], id: 'image-9' })).toBe('图09')
    expect(platformAssetLabel(value, { ...value.assets[0], kind: 'video' })).toBe('视频')
  })
  it('reuses complete media across repeated calls, changing captions and reloaded disk indexes', async () => {
    const directory = await folder(),
      network = fetcher()
    const first = await savePlatformWork(work(), directory, undefined, network)
    const again = await savePlatformWork(
      { ...work(), title: '更新的文案' },
      directory,
      undefined,
      network
    )
    expect(basename(first.files[0])).toBe('小红书-浮寻-F1上海还是新疆-图01.png')
    expect(again.files).toEqual(first.files)
    expect(again.reusedFiles).toEqual(first.files)
    expect(network).toHaveBeenCalledTimes(1)
    expect(await outputs(directory)).toHaveLength(1)
  })
  it('adds short work ID only for different works that would have the same readable name', async () => {
    const directory = await folder(),
      network = fetcher()
    const first = await savePlatformWork(work(), directory, undefined, network)
    const secondWork = work('ffffffffffffffff00123456')
    const second = await savePlatformWork(secondWork, directory, undefined, network)
    expect(basename(second.files[0])).toBe('小红书-浮寻-F1上海还是新疆-123456-图01.png')
    expect(await readFile(first.files[0])).toEqual(png)
    const note = await writePlatformMarkdown(secondWork, second.savedAssets!, directory)
    expect(basename(note.file!)).toBe('小红书-浮寻-F1上海还是新疆-123456.md')
    expect(await readFile(note.file!, 'utf8')).toContain(
      '[[小红书-浮寻-F1上海还是新疆-123456-图01.png|图01]]'
    )
  })
  it('never mistakes a same-named user file for our saved media', async () => {
    const directory = await folder()
    const existing = resolve(directory, '小红书-浮寻-F1上海还是新疆-图01.png')
    await writeFile(existing, 'private file, not a platform download')
    const saved = await savePlatformWork(work(), directory, undefined, fetcher())
    expect(saved.success).toBe(true)
    expect(saved.files[0]).not.toBe(existing)
    expect(basename(saved.files[0])).toContain('-00b6d9-图01.png')
    expect(await readFile(existing, 'utf8')).toBe('private file, not a platform download')
  })
  it('preserves an edited/truncated downloaded file and downloads a safe replacement', async () => {
    const directory = await folder(),
      network = fetcher()
    const first = await savePlatformWork(work(), directory, undefined, network)
    const modified = Buffer.from(png)
    modified[modified.length - 1] ^= 1
    await writeFile(first.files[0], modified)
    const second = await savePlatformWork(work(), directory, undefined, network)
    expect(second.success).toBe(true)
    expect(second.files[0]).not.toBe(first.files[0])
    expect(await readFile(first.files[0])).toEqual(modified)
    expect(await readFile(second.files[0])).toEqual(png)
    expect(network).toHaveBeenCalledTimes(2)
  })
  it('serializes concurrent saves instead of creating duplicate files or losing the index', async () => {
    const directory = await folder(),
      network = fetcher()
    const [first, second] = await Promise.all([
      savePlatformWork(work(), directory, undefined, network),
      savePlatformWork(work(), directory, undefined, network)
    ])
    expect(first.success).toBe(true)
    expect(second.files).toEqual(first.files)
    expect(network).toHaveBeenCalledTimes(1)
    const index = JSON.parse(
      await readFile(resolve(directory, '.tracedigest-platform/names.json'), 'utf8')
    )
    expect(Object.keys(index.works)).toHaveLength(1)
    expect(await outputs(directory)).toHaveLength(1)
  })
  it('does not reuse an incomplete download on retry', async () => {
    const directory = await folder(),
      network = fetcher()
    network.mockImplementationOnce(
      async () =>
        new Response(png, {
          headers: { 'content-type': 'image/png', 'content-length': String(png.length + 5) }
        })
    )
    expect((await savePlatformWork(work(), directory, undefined, network)).success).toBe(false)
    expect(await outputs(directory)).toHaveLength(0)
    const retry = await savePlatformWork(work(), directory, undefined, network)
    expect(retry.success).toBe(true)
    expect(basename(retry.files[0])).toBe('小红书-浮寻-F1上海还是新疆-图01.png')
  })
  it('refuses corrupt or path-escaping indexes without downloading or altering user files', async () => {
    const directory = await folder(),
      network = fetcher()
    await mkdir(resolve(directory, '.tracedigest-platform'))
    const contents = JSON.stringify({
      version: 1,
      works: { bad: { stem: '../escape', media: {} } }
    })
    await writeFile(resolve(directory, '.tracedigest-platform/names.json'), contents)
    const saved = await savePlatformWork(work(), directory, undefined, network)
    expect(saved.success).toBe(false)
    expect(saved.error).toContain('索引')
    expect(network).not.toHaveBeenCalled()
    expect(await readFile(resolve(directory, '.tracedigest-platform/names.json'), 'utf8')).toBe(
      contents
    )
  })
  it('reuses the existing note and appends newly saved image links without replacing its original content', async () => {
    const directory = await folder(),
      value = work(),
      network = fetcher()
    value.assets.push({ ...value.assets[0], id: 'image-2' })
    const one = await savePlatformWork(value, directory, 'image-1', network)
    const first = await writePlatformMarkdown(value, one.savedAssets!, directory)
    const original = await readFile(first.file!, 'utf8')
    const all = await savePlatformWork(value, directory, undefined, network)
    const second = await writePlatformMarkdown(value, all.savedAssets!, directory)
    expect(second.file).toBe(first.file)
    const expanded = await readFile(second.file!, 'utf8')
    expect(expanded.startsWith(original)).toBe(true)
    expect(expanded).toContain('[[小红书-浮寻-F1上海还是新疆-图02.png|图02]]')
    const third = await writePlatformMarkdown(value, all.savedAssets!, directory)
    expect(third.reused).toBe(true)
    expect(await readFile(first.file!, 'utf8')).toBe(expanded)
    expect((await outputs(directory)).filter((name) => name.endsWith('.md'))).toHaveLength(1)
  })
  it('keeps user-edited notes intact when new links would need to be appended', async () => {
    const directory = await folder(),
      value = work(),
      network = fetcher()
    const one = await savePlatformWork(value, directory, undefined, network)
    const first = await writePlatformMarkdown(value, one.savedAssets!, directory)
    const edited = (await readFile(first.file!, 'utf8')) + '\n我的个人补充\n'
    await writeFile(first.file!, edited)
    value.assets.push({ ...value.assets[0], id: 'image-2' })
    const all = await savePlatformWork(value, directory, undefined, network)
    const second = await writePlatformMarkdown(value, all.savedAssets!, directory)
    expect(second.success).toBe(false)
    expect(second.error).toContain('手动修改')
    expect(await readFile(first.file!, 'utf8')).toBe(edited)
  })
})
