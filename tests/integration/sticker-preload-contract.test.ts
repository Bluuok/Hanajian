import { describe, expect, it, vi } from 'vitest'

const { invoke, expose } = vi.hoisted(() => ({ invoke: vi.fn(), expose: vi.fn() }))
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: expose },
  ipcRenderer: { invoke, on: vi.fn(), removeListener: vi.fn() }
}))
vi.mock('@electron-toolkit/preload', () => ({ electronAPI: {} }))

describe('encrypted sticker preload contract', () => {
  it('forwards both encryption fields and preserves plaintext-only calls', async () => {
    Object.defineProperty(process, 'contextIsolated', { configurable: true, value: true })
    await import('../../src/preload/index')
    const api = expose.mock.calls.find(([name]) => name === 'api')![1] as typeof window.api
    invoke.mockResolvedValue({ success: true })

    await api.getSticker(
      'https://synthetic.test/plain',
      'synthetic-md5',
      'synthetic-aes-key',
      'https://synthetic.test/encrypted'
    )
    expect(invoke).toHaveBeenLastCalledWith(
      'db:getSticker',
      'https://synthetic.test/plain',
      'synthetic-md5',
      'synthetic-aes-key',
      'https://synthetic.test/encrypted'
    )

    await api.getSticker('https://synthetic.test/plain', 'synthetic-md5')
    expect(invoke).toHaveBeenLastCalledWith(
      'db:getSticker',
      'https://synthetic.test/plain',
      'synthetic-md5',
      undefined,
      undefined
    )
  })
})
