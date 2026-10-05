import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, rm } from 'fs/promises'
import { resolve, sep } from 'path'
import { PlatformSaveController } from '../../src/main/platform-integration/platform-save-controller'

const root = resolve('.tmp-test-artifacts', 'platform-save-unit')
const directories: string[] = []
afterEach(async () => {
  for (const directory of directories.splice(0)) {
    if (!resolve(directory).startsWith(root + sep)) throw new Error('Unsafe test cleanup')
    await rm(directory, { recursive: true, force: true })
  }
})

async function setup(): Promise<{
  directory: string
  store: { get: () => string; set: (next: string) => void }
  service: { getWork: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> }
  picker: ReturnType<typeof vi.fn>
  controller: PlatformSaveController
}> {
  await mkdir(root, { recursive: true })
  const directory = await mkdtemp(resolve(root, 'case-'))
  directories.push(directory)
  let remembered = ''
  const store = {
    get: () => remembered,
    set: (next: string) => {
      remembered = next
    }
  }
  const service = {
    getWork: vi.fn(),
    save: vi.fn().mockResolvedValue({ success: true, files: ['saved.webp'] })
  }
  const picker = vi.fn().mockResolvedValue(directory)
  return {
    directory,
    store,
    service,
    picker,
    controller: new PlatformSaveController(service, store, picker)
  }
}

describe('persisted platform save directory', () => {
  it('asks once, then reuses the directory across works and controller restarts', async () => {
    const { controller, directory, store, picker, service } = await setup()
    expect(await controller.save({ resultId: 'first' })).toMatchObject({ success: true, directory })
    await controller.save({ resultId: 'second', assetId: 'image-2' })
    const restarted = new PlatformSaveController(service, store, picker)
    await restarted.save({ resultId: 'third' })
    expect(picker).toHaveBeenCalledTimes(1)
    expect(service.save).toHaveBeenLastCalledWith('third', directory, undefined)
    expect(restarted.getDirectory()).toEqual({ success: true, directory })
  })

  it('updates the directory only after a confirmed picker selection', async () => {
    const { controller, directory, store, picker } = await setup()
    await controller.selectDirectory()
    picker.mockResolvedValueOnce(undefined)
    expect(await controller.selectDirectory()).toMatchObject({ canceled: true })
    expect(store.get()).toBe(directory)
    const next = resolve(directory, 'new')
    await mkdir(next)
    picker.mockResolvedValueOnce(next)
    await controller.selectDirectory()
    expect(store.get()).toBe(next)
  })

  it('does not download when first-time selection is canceled or parameters include a path', async () => {
    const { controller, picker, service } = await setup()
    picker.mockResolvedValueOnce(undefined)
    expect(await controller.save({ resultId: 'first' })).toMatchObject({
      canceled: true,
      files: []
    })
    expect(
      await controller.save({ resultId: 'first', directory: 'D:\\unapproved' } as never)
    ).toMatchObject({ success: false, error: '保存参数无效' })
    expect(service.save).not.toHaveBeenCalled()
    expect(picker).toHaveBeenCalledTimes(1)
  })

  it('reports a deleted directory instead of recreating it or prompting on every save', async () => {
    const { controller, directory, picker, service } = await setup()
    await controller.selectDirectory()
    // This is a generated, verified test folder, not a user directory.
    if (!directory.startsWith(root + sep)) throw new Error('Unsafe test directory')
    await rm(directory, { recursive: true })
    expect(await controller.save({ resultId: 'first' })).toMatchObject({
      success: false,
      error: expect.stringContaining('更改目录')
    })
    expect(service.save).not.toHaveBeenCalled()
    expect(picker).toHaveBeenCalledTimes(1)
  })
})
