import { createHash, randomUUID } from 'crypto'
import { createReadStream } from 'fs'
import { lstat, mkdir, readFile, readdir, rename, writeFile, unlink } from 'fs/promises'
import { basename, join, resolve } from 'path'
import type { PlatformMediaAsset, PlatformWork } from '../../shared/platform-integration'

export const PLATFORM_NAMES = { douyin: '抖音', xiaohongshu: '小红书' } as const
const directoryTasks = new Map<string, Promise<unknown>>()

/** Serializes downloads and note writes to the same folder, including different works. */
export async function withPlatformDirectoryLock<T>(
  directory: string,
  task: () => Promise<T>
): Promise<T> {
  const key = process.platform === 'win32' ? resolve(directory).toLowerCase() : resolve(directory)
  const previous = directoryTasks.get(key) || Promise.resolve()
  const pending = previous.catch(() => {}).then(task)
  directoryTasks.set(key, pending)
  try {
    return await pending
  } finally {
    if (directoryTasks.get(key) === pending) directoryTasks.delete(key)
  }
}

function segment(value: string, length: number, fallback: string): string {
  const cleaned = value
    .normalize('NFC')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/#[^\s#]+/g, '')
    .replace(/[\r\n\t]/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*[\]#\x00-\x1f\x7f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return (
    Array.from(cleaned)
      .slice(0, length)
      .join('')
      .replace(/[ .-]+$/g, '')
      .trim() || fallback
  )
}
export function platformWorkStem(work: PlatformWork): string {
  return `${PLATFORM_NAMES[work.platform]}-${segment(work.author, 10, '未知作者')}-${segment(work.title, 20, '未命名作品')}`
}
export function platformAssetLabel(work: PlatformWork, asset: PlatformMediaAsset): string {
  if (asset.kind === 'video') return '视频'
  const ordinal = Number(asset.id.match(/^image-(\d+)$/)?.[1]) || work.assets.indexOf(asset) + 1
  return `图${String(ordinal).padStart(2, '0')}`
}
export async function hashPlatformFile(file: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}
interface MediaRecord {
  name: string
  bytes: number
  sha256: string
}
interface NoteRecord {
  name: string
  sha256: string
  links: string[]
}
interface WorkRecord {
  stem: string
  media: Record<string, MediaRecord>
  note?: NoteRecord
}
interface NameIndex {
  version: 1
  works: Record<string, WorkRecord>
}

function safeName(name: unknown): name is string {
  return (
    typeof name === 'string' &&
    !!name &&
    name.length <= 180 &&
    name !== '.' &&
    name !== '..' &&
    basename(name) === name &&
    // eslint-disable-next-line no-control-regex
    !/[<>:"/\\|?*[\]#\x00-\x1f]/.test(name)
  )
}
function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT'
}
async function fileExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (isMissing(error)) return false
    throw error
  }
}

/** The hidden index identifies our own complete files across parses and restarts.
 * Filenames alone never authorize reusing/overwriting an unrelated existing file.
 */
export class PlatformFileNames {
  private constructor(
    private readonly directory: string,
    private readonly index: NameIndex,
    private readonly work: PlatformWork,
    private readonly entry: WorkRecord
  ) {}

  static async load(work: PlatformWork, directory: string): Promise<PlatformFileNames> {
    const metadata = join(directory, '.tracedigest-platform')
    await mkdir(metadata, { recursive: true })
    const folder = await lstat(metadata)
    if (!folder.isDirectory() || folder.isSymbolicLink())
      throw new Error('文件命名索引目录无效，拒绝访问链接目录')
    const indexPath = join(metadata, 'names.json')
    let index: NameIndex = { version: 1, works: {} }
    try {
      const file = await lstat(indexPath)
      if (!file.isFile() || file.isSymbolicLink() || file.size > 4 * 1024 * 1024)
        throw new Error('文件命名索引无效')
      index = JSON.parse(await readFile(indexPath, 'utf8'))
      if (
        index.version !== 1 ||
        !index.works ||
        typeof index.works !== 'object' ||
        Array.isArray(index.works)
      )
        throw new Error('文件命名索引版本或内容无效')
      for (const value of Object.values(index.works)) {
        if (
          !value ||
          !safeName(value.stem) ||
          !value.media ||
          typeof value.media !== 'object' ||
          Array.isArray(value.media)
        )
          throw new Error('文件命名索引记录无效')
        for (const media of Object.values(value.media))
          if (
            !media ||
            !safeName(media.name) ||
            !Number.isSafeInteger(media.bytes) ||
            media.bytes <= 0 ||
            !/^[a-f0-9]{64}$/.test(media.sha256)
          )
            throw new Error('媒体命名索引记录无效')
        if (
          value.note &&
          (!safeName(value.note.name) ||
            !/^[a-f0-9]{64}$/.test(value.note.sha256) ||
            !Array.isArray(value.note.links) ||
            value.note.links.some((link) => typeof link !== 'string'))
        )
          throw new Error('笔记命名索引记录无效')
      }
    } catch (error) {
      if (!isMissing(error))
        throw new Error(
          `无法读取文件命名索引：${error instanceof Error ? error.message : String(error)}`
        )
    }
    const key = `${work.platform}:${work.id}`
    let entry = index.works[key]
    if (!entry) {
      const original = platformWorkStem(work)
      const filenames = await readdir(directory)
      const stems = new Set(Object.values(index.works).map((value) => value.stem.toLowerCase()))
      const collides = (stem: string): boolean =>
        stems.has(stem.toLowerCase()) ||
        filenames.some((name) => {
          const folded = name.toLowerCase(),
            base = stem.toLowerCase()
          return (
            folded === `${base}.md` ||
            folded.startsWith(`${base}-图`) ||
            folded.startsWith(`${base}-视频`)
          )
        })
      let stem = original
      const suffix = segment(
        work.id.slice(-6),
        6,
        createHash('sha256').update(key).digest('hex').slice(0, 6)
      )
      for (let attempt = 0; collides(stem); attempt++)
        stem = `${original}-${suffix}${attempt ? `-${attempt + 1}` : ''}`
      entry = { stem, media: {} }
      index.works[key] = entry
    }
    return new PlatformFileNames(directory, index, work, entry)
  }

  async existingMedia(asset: PlatformMediaAsset): Promise<string | undefined> {
    const record = this.entry.media[asset.id]
    if (!record) return undefined
    const path = join(this.directory, record.name)
    try {
      const file = await lstat(path)
      if (!file.isFile() || file.isSymbolicLink() || file.size !== record.bytes) return undefined
      return (await hashPlatformFile(path)) === record.sha256 ? path : undefined
    } catch (error) {
      if (isMissing(error)) return undefined
      throw error
    }
  }

  async mediaPath(asset: PlatformMediaAsset, extension: string): Promise<string> {
    if (!/^(jpg|png|gif|webp|avif|mp4|webm)$/.test(extension)) throw new Error('媒体文件扩展名无效')
    return this.unoccupied(`${this.entry.stem}-${platformAssetLabel(this.work, asset)}`, extension)
  }
  async recordMedia(
    asset: PlatformMediaAsset,
    path: string,
    bytes: number,
    sha256: string
  ): Promise<void> {
    this.entry.media[asset.id] = { name: basename(path), bytes, sha256 }
    await this.persist()
  }
  get note(): NoteRecord | undefined {
    return this.entry.note
  }
  get noteFile(): string | undefined {
    return this.entry.note ? join(this.directory, this.entry.note.name) : undefined
  }
  async newNotePath(): Promise<string> {
    return this.unoccupied(this.entry.stem, 'md')
  }
  async recordNote(path: string, sha256: string, links: string[]): Promise<void> {
    this.entry.note = { name: basename(path), sha256, links }
    await this.persist()
  }
  private async unoccupied(stem: string, extension: string): Promise<string> {
    let name = `${stem}.${extension}`
    for (let attempt = 0; await fileExists(join(this.directory, name)); attempt++) {
      const suffix = segment(this.work.id.slice(-6), 6, '同名')
      name = `${stem}-${suffix}${attempt ? `-${attempt + 1}` : ''}.${extension}`
    }
    return join(this.directory, name)
  }
  private async persist(): Promise<void> {
    const metadata = join(this.directory, '.tracedigest-platform')
    const temp = join(metadata, `names-${randomUUID()}.tmp`)
    try {
      await writeFile(temp, JSON.stringify(this.index), { flag: 'wx', mode: 0o600 })
      await rename(temp, join(metadata, 'names.json'))
    } finally {
      await unlink(temp).catch((error) => {
        if (!isMissing(error)) throw error
      })
    }
  }
}
