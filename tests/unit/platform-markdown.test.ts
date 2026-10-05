import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, writeFile, readFile, readdir, rm } from 'fs/promises'
import { resolve, sep } from 'path'
import {
  PlatformMarkdownController,
  writePlatformMarkdown
} from '../../src/main/platform-integration/platform-markdown'
import type { PlatformWork } from '../../src/shared/platform-integration'

const root = resolve('.tmp-test-artifacts/markdown-unit')
const created: string[] = []
async function setup(): Promise<{ directory: string; file: string }> {
  await mkdir(root, { recursive: true })
  const directory = await mkdtemp(resolve(root, 'case-'))
  created.push(directory)
  const file = resolve(directory, 'photo.webp')
  await writeFile(file, 'test-media')
  return { directory, file }
}
const work: PlatformWork = {
  platform: 'xiaohongshu',
  id: '6411cf99000000001300b6d9',
  kind: 'images',
  title: '笔记',
  author: '作者',
  sourceUrl: 'https://www.xiaohongshu.com/explore/6411cf99000000001300b6d9',
  resolvedBy: 'http',
  warnings: [],
  assets: [
    {
      id: 'image-1',
      kind: 'image',
      urls: [],
      watermark: 'unknown',
      watermarkEvidence: '未知',
      sourceField: 'imageList'
    },
    {
      id: 'image-2',
      kind: 'image',
      urls: [],
      watermark: 'unknown',
      watermarkEvidence: '未知',
      sourceField: 'imageList'
    }
  ]
}
afterEach(async () => {
  for (const directory of created.splice(0)) {
    if (!resolve(directory).startsWith(root + sep)) throw new Error('Unsafe test cleanup')
    await rm(directory, { recursive: true, force: true })
  }
})
describe('explicit Obsidian note writing', () => {
  it('writes portable Markdown hyperlinks across folders and escapes reserved path characters', async () => {
    const { directory } = await setup()
    const notes = resolve(directory, 'notes')
    const file = resolve(directory, 'photo [draft] #1.webp')
    await mkdir(notes)
    await writeFile(file, 'test-media')
    const result = await writePlatformMarkdown(
      work,
      [{ assetId: 'image-1', path: file }],
      notes,
      'markdown'
    )
    expect(result.success).toBe(true)
    expect(await readFile(result.file!, 'utf8')).toContain(
      '[图01](../photo%20%5Bdraft%5D%20%231.webp)'
    )
    expect(await readFile(result.file!, 'utf8')).not.toContain('[[photo')
  })
  it('writes a single UTF8 note linking only successfully saved assets and never overwrites', async () => {
    const { directory, file } = await setup()
    const saved = [{ assetId: 'image-1', path: file }]
    const first = await writePlatformMarkdown(work, saved, directory)
    const second = await writePlatformMarkdown(work, saved, directory)
    expect(first.success).toBe(true)
    expect(first.file).toBe(second.file)
    expect(second.reused).toBe(true)
    expect(first.file).toContain('小红书-作者-笔记.md')
    const text = await readFile(first.file!, 'utf8')
    expect(text).toContain('[[photo.webp|图01]]')
    expect(text).toContain('已链接 1/2 个资源')
    expect(text).not.toContain('|图02]]')
  })
  it('uses vault-relative links across attachments and note directories', async () => {
    const { directory, file } = await setup()
    await mkdir(resolve(directory, '.obsidian'))
    const notes = resolve(directory, 'notes')
    await mkdir(notes)
    const result = await writePlatformMarkdown(work, [{ assetId: 'image-1', path: file }], notes)
    expect(result.success).toBe(true)
    expect(await readFile(result.file!, 'utf8')).toContain('[[photo.webp|图01]]')
  })
  it('rejects outside-vault media and missing files without writing a broken note', async () => {
    const { directory, file } = await setup()
    const notes = resolve(directory, 'notes')
    await mkdir(notes)
    const outside = await writePlatformMarkdown(work, [{ assetId: 'image-1', path: file }], notes)
    expect(outside.success).toBe(false)
    expect(outside.error).toContain('仓库外')
    const missing = await writePlatformMarkdown(
      work,
      [{ assetId: 'image-1', path: resolve(directory, 'missing.webp') }],
      directory
    )
    expect(missing.success).toBe(false)
    expect(await readdir(notes)).toHaveLength(0)
  })
  it('refuses writing before download and renderer-supplied paths', async () => {
    const service = { getSavedWork: vi.fn().mockReturnValue({ work, savedAssets: [] }) }
    const directories = { getDirectory: vi.fn(), selectDirectory: vi.fn() }
    const writer = new PlatformMarkdownController(service, directories)
    expect(await writer.write({ resultId: 'work' })).toMatchObject({
      success: false,
      error: expect.stringContaining('先保存')
    })
    expect(
      await writer.write({ resultId: 'work', directory: 'D:/arbitrary' } as never)
    ).toMatchObject({ success: false, error: 'MD 写入参数无效' })
    expect(directories.selectDirectory).not.toHaveBeenCalled()
  })
  it('honors canceled MD directory selection', async () => {
    const { file } = await setup()
    const writer = new PlatformMarkdownController(
      { getSavedWork: () => ({ work, savedAssets: [{ assetId: 'image-1', path: file }] }) },
      {
        getDirectory: () => ({ success: true }),
        selectDirectory: async () => ({ success: false, canceled: true })
      }
    )
    expect(await writer.write({ resultId: 'work' })).toMatchObject({
      success: false,
      canceled: true
    })
  })
})
