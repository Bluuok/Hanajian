import { stat } from 'fs/promises'
import { isAbsolute, resolve } from 'path'
import type {
  PlatformDirectoryResult,
  PlatformSaveRequest,
  PlatformSaveResult
} from '../../shared/platform-integration'
import type { PlatformIntegrationService } from './platform-integration-service'

interface DirectoryStore {
  get(): string
  set(directory: string): void
}
type DirectoryPicker = (current?: string) => Promise<string | undefined>

/** Main-process-only persisted choice. Renderer and Agent cannot supply a save path. */
export class PlatformSaveController {
  constructor(
    private readonly service: Pick<PlatformIntegrationService, 'getWork' | 'save'>,
    private readonly store: DirectoryStore,
    private readonly picker: DirectoryPicker
  ) {}

  getDirectory(): PlatformDirectoryResult {
    try {
      const directory = this.store.get()
      return {
        success: true,
        directory: typeof directory === 'string' && isAbsolute(directory) ? directory : ''
      }
    } catch (error) {
      return { success: false, error: message(error) }
    }
  }

  async selectDirectory(): Promise<PlatformDirectoryResult> {
    try {
      const selected = await this.picker(this.getDirectory().directory || undefined)
      if (!selected) return { success: false, canceled: true }
      if (!isAbsolute(selected) || !(await stat(selected)).isDirectory())
        throw new Error('请选择有效的保存目录')
      const directory = resolve(selected)
      this.store.set(directory)
      return { success: true, directory }
    } catch (error) {
      return { success: false, error: message(error) }
    }
  }

  async save(request: PlatformSaveRequest): Promise<PlatformSaveResult> {
    try {
      if (
        !request ||
        typeof request.resultId !== 'string' ||
        (request.assetId !== undefined && typeof request.assetId !== 'string') ||
        Object.keys(request).some((key) => key !== 'resultId' && key !== 'assetId')
      )
        throw new Error('保存参数无效')
      this.service.getWork(request.resultId)
      const remembered = this.getDirectory()
      if (!remembered.success) throw new Error(remembered.error || '读取保存目录失败')
      let directory = remembered.directory
      if (!directory) {
        const selected = await this.selectDirectory()
        if (!selected.success)
          return { success: false, files: [], canceled: selected.canceled, error: selected.error }
        directory = selected.directory
      }
      if (!directory || !(await stat(directory).catch(() => undefined))?.isDirectory()) {
        throw new Error('保存目录不存在或不可访问，请点击“更改目录”重新选择')
      }
      return {
        ...(await this.service.save(request.resultId, directory, request.assetId)),
        directory
      }
    } catch (error) {
      return { success: false, files: [], error: message(error) }
    }
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
