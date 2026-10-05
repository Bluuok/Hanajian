import { describe, expect, it, vi } from 'vitest'

const { invoke, expose } = vi.hoisted(() => ({ invoke: vi.fn(), expose: vi.fn() }))
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: expose },
  ipcRenderer: { invoke, on: vi.fn(), removeListener: vi.fn() }
}))
vi.mock('@electron-toolkit/preload', () => ({ electronAPI: {} }))

describe('platform integration preload contract', () => {
  it('forwards share text and only result identifiers for saving', async () => {
    Object.defineProperty(process, 'contextIsolated', { configurable: true, value: true })
    await import('../../src/preload/index')
    const api = expose.mock.calls.find(([name]) => name === 'api')![1] as typeof window.api
    invoke.mockResolvedValue({ success: true })
    await api.parsePlatformShare('分享文案 https://v.douyin.com/sgh2j_pBwbI/')
    expect(invoke).toHaveBeenLastCalledWith(
      'platform-integration:parse',
      '分享文案 https://v.douyin.com/sgh2j_pBwbI/'
    )
    await api.savePlatformMedia({ resultId: 'result-1', assetId: 'image-1' })
    expect(invoke).toHaveBeenLastCalledWith('platform-integration:save', {
      resultId: 'result-1',
      assetId: 'image-1'
    })
    expect(api).not.toHaveProperty('ipcRenderer')
    await api.getPlatformSaveDirectory()
    expect(invoke).toHaveBeenLastCalledWith('platform-integration:getSaveDirectory')
    await api.selectPlatformSaveDirectory()
    expect(invoke).toHaveBeenLastCalledWith('platform-integration:selectSaveDirectory')
    expect(api).not.toHaveProperty('savePlatformUrl')
    await api.getPlatformMarkdownDirectory()
    expect(invoke).toHaveBeenLastCalledWith('platform-integration:getMarkdownDirectory')
    await api.selectPlatformMarkdownDirectory()
    expect(invoke).toHaveBeenLastCalledWith('platform-integration:selectMarkdownDirectory')
    await api.writePlatformMarkdown({ resultId: 'result-1' })
    expect(invoke).toHaveBeenLastCalledWith('platform-integration:writeMarkdown', {
      resultId: 'result-1'
    })
  })
})
