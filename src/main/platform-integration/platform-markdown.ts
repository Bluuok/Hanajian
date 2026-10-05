import { createHash } from 'crypto'
import { realpath, stat, lstat, writeFile, readFile, open } from 'fs/promises'
import { dirname, isAbsolute, join, relative, sep } from 'path'
import { pathToFileURL } from 'url'
import type {
  PlatformMarkdownResult,
  PlatformSavedAsset,
  PlatformWork
} from '../../shared/platform-integration'
import { PLATFORM_WATERMARK_LABELS } from '../../shared/platform-integration'
import type { PlatformIntegrationService } from './platform-integration-service'
import type { PlatformSaveController } from './platform-save-controller'
import {
  PlatformFileNames,
  platformAssetLabel,
  PLATFORM_NAMES,
  withPlatformDirectoryLock,
  hashPlatformFile
} from './platform-file-names'

export class PlatformMarkdownController {
  constructor(
    private readonly service: Pick<PlatformIntegrationService, 'getSavedWork'>,
    private readonly directories: Pick<PlatformSaveController, 'getDirectory' | 'selectDirectory'>
  ) {}

  async write(request: {
    resultId: string
    linkStyle?: 'markdown' | 'obsidian'
  }): Promise<PlatformMarkdownResult> {
    try {
      if (
        !request ||
        typeof request.resultId !== 'string' ||
        Object.keys(request).some((key) => !['resultId', 'linkStyle'].includes(key)) ||
        (request.linkStyle !== undefined && !['markdown', 'obsidian'].includes(request.linkStyle))
      )
        throw new Error('MD 写入参数无效')
      const { work, savedAssets } = this.service.getSavedWork(request.resultId)
      if (!savedAssets.length)
        throw new Error('请先保存图片或视频，再写入 MD；不会创建指向未下载资源的链接')
      let selected = this.directories.getDirectory()
      if (!selected.success) throw new Error(selected.error || '读取 MD 目录失败')
      if (!selected.directory) selected = await this.directories.selectDirectory()
      if (!selected.success)
        return { success: false, canceled: selected.canceled, error: selected.error }
      if (!selected.directory) throw new Error('请选择 MD 保存目录')
      return await writePlatformMarkdown(work, savedAssets, selected.directory, request.linkStyle)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
}

/** Links only main-process recorded successful saves. No renderer paths or URLs. */
export async function writePlatformMarkdown(
  work: PlatformWork,
  savedAssets: PlatformSavedAsset[],
  directory: string,
  linkStyle: 'markdown' | 'obsidian' = 'obsidian'
): Promise<PlatformMarkdownResult> {
  return withPlatformDirectoryLock(directory, () =>
    writePlatformMarkdownUnlocked(work, savedAssets, directory, linkStyle)
  )
}

async function writePlatformMarkdownUnlocked(
  work: PlatformWork,
  savedAssets: PlatformSavedAsset[],
  directory: string,
  linkStyle: 'markdown' | 'obsidian'
): Promise<PlatformMarkdownResult> {
  try {
    if (!isAbsolute(directory) || !(await stat(directory)).isDirectory())
      throw new Error('MD 目录不存在，请重新选择')
    const mdDirectory = await realpath(directory)
    const vaultRoot = (await findVaultRoot(mdDirectory)) || mdDirectory
    const links: string[] = []
    const targets: string[] = []
    for (const saved of savedAssets) {
      const asset = work.assets.find((item) => item.id === saved.assetId)
      if (!asset) throw new Error('保存记录与当前作品不匹配')
      const file = await realpath(saved.path)
      if (!(await stat(file)).isFile()) throw new Error('已保存媒体文件不存在')
      const target = relative(vaultRoot, file)
      if (
        linkStyle === 'obsidian' &&
        (target === '..' || target.startsWith('..' + sep) || isAbsolute(target))
      )
        throw new Error(
          'Obsidian 双链无法访问仓库外媒体。请将图片/视频保存目录设在同一 Obsidian 仓库内；尚未建立仓库时，请将媒体保存到 MD 目录或其子目录。'
        )
      if (linkStyle === 'obsidian' && /[[\]|#\r\n]/.test(target))
        throw new Error('媒体路径含有 Obsidian 双链保留字符，请换一个保存目录')
      const label = platformAssetLabel(work, asset)
      const mdRelative = relative(mdDirectory, file)
      const mdTarget = isAbsolute(mdRelative)
        ? pathToFileURL(file).href
        : mdRelative.split(sep).map(encodeURIComponent).join('/')
      const link =
        linkStyle === 'markdown'
          ? `[${label}](${mdTarget})`
          : `[[${target.split(sep).join('/')}|${label}]]`
      targets.push(link)
      links.push(`- ${link} — ${PLATFORM_WATERMARK_LABELS[asset.watermark]}`)
    }
    if (!links.length) throw new Error('没有已保存的媒体可供写入')
    const names = await PlatformFileNames.load(work, mdDirectory)
    const previous = names.note
    const previousFile = names.noteFile
    if (previous && previousFile) {
      const existing = await lstat(previousFile).catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        return undefined
      })
      if (existing) {
        if (!existing.isFile() || existing.isSymbolicLink() || existing.size > 4 * 1024 * 1024)
          throw new Error('已保存 MD 文件无效，不会覆盖')
        const text = await readFile(previousFile, 'utf8')
        if (targets.every((target) => text.includes(target)))
          return { success: true, file: previousFile, directory, reused: true }
        if ((await hashPlatformFile(previousFile)) !== previous.sha256)
          throw new Error(
            '已有 MD 被手动修改，缺少本次媒体双链；为保留你的修改，不会覆盖或追加。请移动旧笔记后重新写入。'
          )
        const missing = links.filter((_link, index) => !text.includes(targets[index]))
        const addition = [
          '',
          '## 新增已保存媒体',
          '',
          ...missing,
          '',
          `补充时间：${new Date().toISOString()}`,
          `当前已链接 ${links.length}/${work.assets.length} 个资源。`,
          ''
        ].join('\n')
        const handle = await open(previousFile, 'r+')
        try {
          const bytes = Buffer.from(addition, 'utf8')
          let written = 0
          while (written < bytes.length) {
            const result = await handle.write(
              bytes,
              written,
              bytes.length - written,
              existing.size + written
            )
            if (!result.bytesWritten) throw new Error('MD 补充内容未完整写入，请检查磁盘')
            written += result.bytesWritten
          }
        } finally {
          await handle.close()
        }
        await names.recordNote(previousFile, await hashPlatformFile(previousFile), [
          ...new Set([...previous.links, ...targets])
        ])
        return { success: true, file: previousFile, directory }
      }
    }
    const markdown = [
      `# ${work.title.replace(/\r?\n/g, ' ')}`,
      '',
      `- 作者：${work.author.replace(/\r?\n/g, ' ')}`,
      `- 平台：${PLATFORM_NAMES[work.platform]}`,
      `- 作品 ID：${work.id}`,
      `- 来源：${work.sourceUrl}`,
      `- 生成时间：${new Date().toISOString()}`,
      '',
      '## 已保存媒体',
      '',
      ...links,
      '',
      `已链接 ${links.length}/${work.assets.length} 个资源；仅包含已成功保存的文件。`,
      ''
    ].join('\n')
    const file = await names.newNotePath()
    await writeFile(file, markdown, { encoding: 'utf8', flag: 'wx' })
    await names.recordNote(
      file,
      createHash('sha256').update(markdown, 'utf8').digest('hex'),
      targets
    )
    return { success: true, file, directory }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function findVaultRoot(directory: string): Promise<string | undefined> {
  let candidate = directory
  while (true) {
    if ((await stat(join(candidate, '.obsidian')).catch(() => undefined))?.isDirectory())
      return candidate
    const parent = dirname(candidate)
    if (parent === candidate) return undefined
    candidate = parent
  }
}
