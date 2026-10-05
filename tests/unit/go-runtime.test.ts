import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it, vi } from 'vitest'

function loadRuntime(environment: Record<string, string>): {
  execute: ReturnType<typeof vi.fn>
  resolveGoRuntime: () => { executable: string; env: Record<string, string> }
} {
  const execute = vi.fn()
  const module = {
    exports: {} as { resolveGoRuntime: () => { executable: string; env: Record<string, string> } }
  }
  const requireMock = (name: string): unknown => {
    if (name === 'node:child_process') return { execFileSync: execute }
    if (name === 'node:fs') return { existsSync: () => false }
    if (name === 'node:path') return { resolve }
    throw new Error(`Unexpected dependency: ${name}`)
  }
  const source = readFileSync(resolve(__dirname, '../../scripts/go-runtime.cjs'), 'utf8')
  new Function('require', '__dirname', 'process', 'module', source)(
    requireMock,
    resolve(__dirname, '../../scripts'),
    { env: environment },
    module
  )
  return { execute, ...module.exports }
}

describe('Go runtime configuration compatibility', () => {
  it('prefers the authorized Hanajian executable and preserves the rest of the process environment', () => {
    const runtime = loadRuntime({
      HANAJIAN_GO_EXE: 'current-go',
      TRACEDIGEST_GO_EXE: 'old-go',
      GOPATH: 'local-cache'
    })
    const selected = runtime.resolveGoRuntime()
    expect(selected.executable).toBe('current-go')
    expect(selected.env.GOPATH).toBe('local-cache')
    expect(runtime.execute).toHaveBeenCalledWith('current-go', ['version'], expect.anything())
  })
  it('retains the old executable option and PATH-based fallback', () => {
    expect(loadRuntime({ TRACEDIGEST_GO_EXE: 'old-go' }).resolveGoRuntime().executable).toBe(
      'old-go'
    )
    expect(loadRuntime({}).resolveGoRuntime().executable).toBe('go')
  })
})
