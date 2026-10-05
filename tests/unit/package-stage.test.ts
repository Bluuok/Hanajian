import { createRequire } from 'module'
import { execFileSync } from 'child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync as fsUnlinkSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

const { preparePackageStage } = createRequire(import.meta.url)(
  '../../scripts/prepare-package-stage.cjs'
) as {
  preparePackageStage: (root: string) => string
}
const roots: string[] = []
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'hanajian-package-stage-'))
  roots.push(root)
  mkdirSync(join(root, 'out', 'main'), { recursive: true })
  mkdirSync(join(root, 'docs', 'third-party'), { recursive: true })
  mkdirSync(join(root, 'node_modules'), { recursive: true })
  writeFileSync(join(root, 'out', 'main', 'index.js'), 'compiled app')
  for (const file of ['package.json', 'pnpm-lock.yaml', 'NOTICE.md'])
    writeFileSync(join(root, file), file)
  writeFileSync(join(root, 'node_modules', 'dependency.txt'), 'keep dependency')
  writeFileSync(join(root, '.env'), 'private test value')
  return root
}

describe('compiled application staging', () => {
  afterEach(() => {
    while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true })
  })

  it('installs application dependencies in a fresh checkout before any build or stage exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'hanajian-fresh-install-'))
    roots.push(root)
    const repository = resolve(__dirname, '../..')
    for (const file of ['package.json', 'pnpm-lock.yaml', 'electron-builder.yml']) {
      copyFileSync(join(repository, file), join(root, file))
    }
    const modules = join(root, 'node_modules')
    symlinkSync(
      join(repository, 'node_modules'),
      modules,
      process.platform === 'win32' ? 'junction' : 'dir'
    )
    try {
      expect(existsSync(join(root, 'out'))).toBe(false)
      expect(existsSync(join(root, '.tmp-test-artifacts'))).toBe(false)
      const cli = createRequire(import.meta.url).resolve('electron-builder/out/cli/cli.js')
      // execFileSync throws on a nonzero exit; builder's logger may be silent in Vitest.
      execFileSync(process.execPath, [cli, 'install-app-deps'], {
        cwd: root,
        env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
        encoding: 'utf8',
        timeout: 30_000
      })
      expect(existsSync(join(root, '.tmp-test-artifacts'))).toBe(false)
    } finally {
      // Unlink the fixture's dependency junction before fixture cleanup.
      fsUnlinkSync(modules)
    }
  }, 35_000)

  it('packages explicit build inputs and safely regenerates the stage without deleting dependencies', () => {
    const root = fixture()
    const stage = preparePackageStage(root)
    expect(readFileSync(join(stage, 'out', 'main', 'index.js'), 'utf8')).toBe('compiled app')
    expect(existsSync(join(stage, '.env'))).toBe(false)
    expect(realpathSync(join(stage, 'node_modules'))).toBe(realpathSync(join(root, 'node_modules')))
    writeFileSync(join(stage, 'out', 'stale.js'), 'old build')
    expect(preparePackageStage(root)).toBe(stage)
    expect(existsSync(join(stage, 'out', 'stale.js'))).toBe(false)
    expect(readFileSync(join(root, 'node_modules', 'dependency.txt'), 'utf8')).toBe(
      'keep dependency'
    )
    expect(readFileSync(join(root, '.env'), 'utf8')).toBe('private test value')
  })
  it('refuses to remove an existing directory without its ownership marker', () => {
    const root = fixture()
    const stage = join(root, '.tmp-test-artifacts', 'hanajian-package-stage')
    mkdirSync(stage, { recursive: true })
    writeFileSync(join(stage, 'user-file.txt'), 'keep user work')
    expect(() => preparePackageStage(root)).toThrow('unowned packaging directory')
    expect(readFileSync(join(stage, 'user-file.txt'), 'utf8')).toBe('keep user work')
  })
})
